const { httpError } = require('../utils/HttpError');
const { pool } = require('../db/database');
const { requirePerm } = require('../middleware/Auth');
const { logAudit } = require('./AuditService');
const { isValidDate } = require('../utils/Validation');

const FILING_ROLES = new Set(['HEAD', 'HR', 'ADMIN']);
const REVIEW_ROLES = new Set(['HR', 'ADMIN']);
const MAX_EVIDENCE_FILES = 10;
const MAX_EVIDENCE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_EVIDENCE_TOTAL_BYTES = 18 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 256 * 1024;
const ALLOWED_EVIDENCE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/rtf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'video/quicktime'
]);

function requireIncidentRole(user, roles, message) {
  if (!roles.has(user.role)) throw httpError(message, 403);
}

function manilaDateParts(date = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
}

function currentManilaDate() {
  const { year, month, day } = manilaDateParts();
  return `${year}-${month}-${day}`;
}

function normalizeText(value, label, maxLength, required = true) {
  if (typeof value !== 'string') {
    if (!required && (value === undefined || value === null)) return '';
    throw httpError(`${label} is required.`, 400);
  }
  const clean = value.trim().replace(/[<>]/g, '');
  if (!clean && required) throw httpError(`${label} is required.`, 400);
  if (clean.length > maxLength)
    throw httpError(`${label} must be ${maxLength} characters or fewer.`, 400);
  return clean;
}

function normalizeDate(value, label) {
  if (!isValidDate(value)) throw httpError(`Enter a valid ${label}.`, 400);
  return value;
}

function normalizeTime(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw httpError('Enter a valid incident time.', 400);
  }
  return `${value}:00`;
}

function normalizeSignature(value) {
  if (typeof value !== 'string') throw httpError('Draw your signature.', 400);
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw httpError('The signature image is invalid.', 400);
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > MAX_SIGNATURE_BYTES) {
    throw httpError('The signature image is too large.', 400);
  }
  return value;
}

function normalizeEvidence(files = []) {
  if (!Array.isArray(files) || files.length > MAX_EVIDENCE_FILES) {
    throw httpError(`Attach no more than ${MAX_EVIDENCE_FILES} files.`, 400);
  }
  let totalBytes = 0;
  return files.map((file) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw httpError('An attached file is invalid.', 400);
    }
    const mimeType = String(file.mimeType || '').toLowerCase();
    if (!ALLOWED_EVIDENCE_TYPES.has(mimeType)) {
      throw httpError(
        'One or more evidence file types are not supported.',
        400
      );
    }
    const fileName = String(file.fileName || '')
      .replace(/[\\/]/g, '_')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 191);
    if (!fileName) throw httpError('An attached file needs a file name.', 400);
    const match = new RegExp(
      `^data:${mimeType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};base64,([A-Za-z0-9+/]+={0,2})$`
    ).exec(String(file.dataUrl || ''));
    if (!match) throw httpError('An attached evidence file is invalid.', 400);
    const fileData = Buffer.from(match[1], 'base64');
    if (!fileData.length || fileData.length > MAX_EVIDENCE_FILE_BYTES) {
      throw httpError('Each evidence file must be 8 MB or smaller.', 400);
    }
    totalBytes += fileData.length;
    if (totalBytes > MAX_EVIDENCE_TOTAL_BYTES) {
      throw httpError(
        'The combined evidence files must be 18 MB or smaller.',
        400
      );
    }
    return { fileName, mimeType, fileData };
  });
}

async function getEmployeeAccountByRecordId(connection, recordId) {
  const [rows] = await connection.execute(
    `SELECT e.record_id, e.name, e.emp_no, e.department, e.position,
            e.personal_email, u.email, u.role, u.assigned_head_email,
            u.is_hr_head
     FROM employees e
     JOIN user_roles u ON LOWER(u.email) = LOWER(e.personal_email)
     WHERE e.record_id = ? AND e.record_status <> 'Archived' AND u.active = 1
     LIMIT 1 FOR UPDATE`,
    [recordId]
  );
  return rows[0] || null;
}

async function getEmployeeRecordById(connection, recordId) {
  const [rows] = await connection.execute(
    `SELECT record_id, name FROM employees
     WHERE record_id = ? AND record_status <> 'Archived' LIMIT 1`,
    [recordId]
  );
  return rows[0] || null;
}

async function getReporterEmployee(connection, email) {
  const [rows] = await connection.execute(
    `SELECT e.record_id, COALESCE(NULLIF(e.name, ''), NULLIF(u.full_name, ''), u.email) AS name,
            e.department, e.position
     FROM user_roles u
     LEFT JOIN employees e
       ON LOWER(e.personal_email) = LOWER(u.email)
       AND e.record_status <> 'Archived'
     WHERE LOWER(u.email) = LOWER(?) AND u.active = 1
     ORDER BY e.record_id LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function getIncidentFileContext(req) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    FILING_ROLES,
    'Only HEAD, HR, and ADMIN accounts can file an Incident Report.'
  );
  const reporter = await getReporterEmployee(pool, user.email);
  if (!reporter) throw httpError('Your account is not active.', 401);
  return {
    reporter: {
      employeeId: reporter.record_id || '',
      name: reporter.name || user.full_name || user.email,
      department: reporter.department || '',
      position: reporter.position || ''
    },
    dateReported: currentManilaDate()
  };
}

async function searchIncidentEmployees(req, query, purpose = 'reported') {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    FILING_ROLES,
    'Only HEAD, HR, and ADMIN accounts can file an Incident Report.'
  );
  const term = normalizeText(String(query || ''), 'Search text', 100, false)
    .toLowerCase()
    .replace(/[!%_]/g, '!$&');
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const accountJoin =
    purpose === 'participant'
      ? ''
      : 'JOIN user_roles u ON LOWER(u.email) = LOWER(e.personal_email)';
  const activeAccount = purpose === 'participant' ? '' : 'AND u.active = 1';
  const [rows] = await pool.execute(
    `SELECT e.record_id AS employeeId, e.name, e.emp_no AS employeeNo,
            e.department, e.position
     FROM employees e ${accountJoin}
     WHERE e.record_status <> 'Archived' ${activeAccount}
       AND (LOWER(e.name) LIKE ? ESCAPE '!' OR LOWER(e.emp_no) LIKE ? ESCAPE '!')
     ORDER BY e.name, e.record_id LIMIT 12`,
    [like, like]
  );
  return rows;
}

async function normalizeParticipants(connection, type, values) {
  if (values === undefined || values === null) values = [];
  if (!Array.isArray(values) || values.length > 3) {
    throw httpError(`Enter no more than 3 ${type.toLowerCase()}.`, 400);
  }
  const normalized = [];
  for (const [index, value] of values.entries()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw httpError(`A ${type.toLowerCase()} entry is invalid.`, 400);
    }
    const employeeId = normalizeText(
      String(value.employeeId || ''),
      `${type} employee`,
      20,
      false
    );
    if (employeeId) {
      const employee = await getEmployeeRecordById(connection, employeeId);
      if (!employee)
        throw httpError(
          `The selected ${type.toLowerCase()} is no longer active.`,
          409
        );
      normalized.push({
        employeeId: employee.record_id,
        fullName: employee.name,
        sortOrder: index + 1
      });
      continue;
    }
    const fullName = normalizeText(
      String(value.name || ''),
      `${type} name`,
      191,
      false
    );
    if (fullName)
      normalized.push({ employeeId: null, fullName, sortOrder: index + 1 });
  }
  return normalized;
}

async function nextCaseNumber(connection, year) {
  await connection.execute(
    `INSERT INTO incident_case_sequences (case_year, sequence_value)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE sequence_value = sequence_value + 1`,
    [year]
  );
  const [[sequence]] = await connection.execute(
    'SELECT sequence_value FROM incident_case_sequences WHERE case_year = ? FOR UPDATE',
    [year]
  );
  return `IR-${year}-${String(sequence.sequence_value).padStart(5, '0')}`;
}

async function resolveAssignedHead(connection, employee) {
  let headEmail = employee.assigned_head_email || null;
  if (employee.role === 'HR') {
    if (employee.is_hr_head) return null;
    const [heads] = await connection.execute(
      "SELECT email FROM user_roles WHERE role = 'HR' AND is_hr_head = 1 AND active = 1 LIMIT 1"
    );
    headEmail = heads[0] ? heads[0].email : null;
  }
  if (!headEmail || employee.role === 'ADMIN') return null;
  const [heads] = await connection.execute(
    'SELECT email, role, active FROM user_roles WHERE email = ? LIMIT 1',
    [headEmail]
  );
  if (
    !heads[0] ||
    !heads[0].active ||
    !['HEAD', 'HR'].includes(heads[0].role)
  ) {
    throw httpError(
      'The reported employee has an inactive or invalid assigned Head. Contact HR before filing.',
      409
    );
  }
  return heads[0].email;
}

async function submitIncidentReport(req, input = {}) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    FILING_ROLES,
    'Only HEAD, HR, and ADMIN accounts can file an Incident Report.'
  );
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError('Enter valid Incident Report details.', 400);
  }

  const reportedEmployeeId = normalizeText(
    String(input.reportedEmployeeId || ''),
    'Employee being reported',
    20
  );
  const subject = normalizeText(input.subject, 'Subject', 191);
  const incidentDate = normalizeDate(input.incidentDate, 'incident date');
  const location = normalizeText(input.location, 'Location', 191);
  const incidentTime = normalizeTime(input.incidentTime);
  const description = normalizeText(
    input.description,
    'Incident description',
    12000
  );
  const comments = normalizeText(input.comments || '', 'Comments', 3000, false);
  const evidence = normalizeEvidence(input.evidence || []);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const reporter = await getReporterEmployee(connection, user.email);
    if (!reporter) throw httpError('Your account is not active.', 401);
    const employee = await getEmployeeAccountByRecordId(
      connection,
      reportedEmployeeId
    );
    if (!employee)
      throw httpError('Select an active employee with an HRIS account.', 400);
    const assignedHeadEmail = await resolveAssignedHead(connection, employee);
    const personsInvolved = await normalizeParticipants(
      connection,
      'Person involved',
      input.personsInvolved
    );
    const witnesses = await normalizeParticipants(
      connection,
      'Witness',
      input.witnesses
    );
    const dateReported = currentManilaDate();
    const caseNumber = await nextCaseNumber(
      connection,
      Number(dateReported.slice(0, 4))
    );

    const [result] = await connection.execute(
      `INSERT INTO incident_reports
         (case_number, reporter_email, reporter_employee_id, reporter_name,
          department, position, reported_employee_id, reported_employee_email,
          reported_employee_name, assigned_head_email, date_reported, subject,
          incident_date, location, incident_time, description, comments, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING SIGNATURE')`,
      [
        caseNumber,
        user.email,
        reporter.record_id,
        reporter.name || user.full_name || user.email,
        reporter.department || '',
        reporter.position || '',
        employee.record_id,
        employee.email,
        employee.name,
        assignedHeadEmail,
        dateReported,
        subject,
        incidentDate,
        location,
        incidentTime,
        description,
        comments
      ]
    );
    const incidentId = result.insertId;
    for (const [participantType, participants] of [
      ['INVOLVED', personsInvolved],
      ['WITNESS', witnesses]
    ]) {
      for (const participant of participants) {
        await connection.execute(
          `INSERT INTO incident_participants
             (incident_id, participant_type, employee_record_id, full_name, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [
            incidentId,
            participantType,
            participant.employeeId,
            participant.fullName,
            participant.sortOrder
          ]
        );
      }
    }
    for (const file of evidence) {
      await connection.execute(
        `INSERT INTO incident_evidence
           (incident_id, file_name, mime_type, byte_size, file_data, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          incidentId,
          file.fileName,
          file.mimeType,
          file.fileData.length,
          file.fileData,
          user.email
        ]
      );
    }
    await connection.execute(
      `INSERT INTO incident_notifications
         (incident_id, recipient_email, notification_type)
       VALUES (?, ?, 'EMPLOYEE_SIGNATURE')`,
      [incidentId, employee.email]
    );
    if (assignedHeadEmail) {
      await connection.execute(
        `INSERT IGNORE INTO incident_notifications
           (incident_id, recipient_email, notification_type)
         VALUES (?, ?, 'HEAD_SIGNATURE')`,
        [incidentId, assignedHeadEmail]
      );
    }
    await logAudit(
      user.email,
      'INCIDENT_CREATED',
      caseNumber,
      `Incident report filed for ${employee.name}`,
      connection
    );
    await connection.commit();
    return {
      ok: true,
      id: incidentId,
      caseNumber,
      status: 'PENDING SIGNATURE',
      dateReported
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function incidentListFields() {
  return `id, case_number AS caseNumber, subject, incident_date AS incidentDate,
          reported_employee_name AS reportedEmployeeName, status,
          created_at AS createdAt`;
}

async function listIncidentsForTrack(req) {
  const user = await requirePerm(req, 'inbox.read');
  const [rows] = await pool.execute(
    `SELECT ${incidentListFields()}
     FROM incident_reports
     WHERE reporter_email = ? OR reported_employee_email = ? OR assigned_head_email = ?
     ORDER BY created_at DESC, id DESC LIMIT 300`,
    [user.email, user.email, user.email]
  );
  return rows;
}

async function listIncidentsForReview(req) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    REVIEW_ROLES,
    'Only HR and ADMIN accounts can review Incident Reports.'
  );
  const [rows] = await pool.query(
    `SELECT ${incidentListFields()}
     FROM incident_reports
     ORDER BY created_at DESC, id DESC LIMIT 500`
  );
  return rows;
}

function canViewIncident(user, incident) {
  if (REVIEW_ROLES.has(user.role)) return true;
  return [
    incident.reporter_email,
    incident.reported_employee_email,
    incident.assigned_head_email
  ].includes(user.email);
}

async function getIncidentCase(req, incidentId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(incidentId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid Incident Report.', 400);
  const [rows] = await pool.execute(
    `SELECT id, case_number AS caseNumber, reporter_email AS reporterEmail,
            reporter_employee_id AS reporterEmployeeId, reporter_name AS reporterName,
            department, position, reported_employee_id AS reportedEmployeeId,
            reported_employee_email AS reportedEmployeeEmail,
            reported_employee_name AS reportedEmployeeName,
            assigned_head_email AS assignedHeadEmail,
            date_reported AS dateReported, subject, incident_date AS incidentDate,
            location, incident_time AS incidentTime, description, comments, status,
            created_at AS createdAt
     FROM incident_reports WHERE id = ? LIMIT 1`,
    [id]
  );
  const incident = rows[0];
  if (!incident) throw httpError('Incident Report not found.', 404);
  if (!canViewIncident(user, incident))
    throw httpError('You do not have access to this Incident Report.', 403);

  const [[participants], [signatures], [evidence]] = await Promise.all([
    pool.execute(
      `SELECT participant_type AS participantType,
              employee_record_id AS employeeId, full_name AS name, sort_order AS sortOrder
       FROM incident_participants WHERE incident_id = ?
       ORDER BY participant_type, sort_order`,
      [id]
    ),
    pool.execute(
      `SELECT signatory_role AS role, signer_email AS signerEmail,
              signature_data AS signature, signed_at AS signedAt
       FROM incident_signatures WHERE incident_id = ?`,
      [id]
    ),
    pool.execute(
      `SELECT id, file_name AS fileName, mime_type AS mimeType,
              byte_size AS byteSize, uploaded_by AS uploadedBy,
              created_at AS createdAt
       FROM incident_evidence WHERE incident_id = ? ORDER BY id`,
      [id]
    )
  ]);
  return {
    ...incident,
    participants,
    signatures,
    evidence,
    canReview: REVIEW_ROLES.has(user.role),
    currentUserEmail: user.email
  };
}

async function getIncidentEvidence(req, evidenceId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(evidenceId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid evidence file.', 400);
  const [rows] = await pool.execute(
    `SELECT e.file_name AS fileName, e.mime_type AS mimeType, e.file_data AS fileData,
            i.reporter_email, i.reported_employee_email, i.assigned_head_email
     FROM incident_evidence e
     JOIN incident_reports i ON i.id = e.incident_id
     WHERE e.id = ? LIMIT 1`,
    [id]
  );
  const evidence = rows[0];
  if (!evidence) throw httpError('Evidence file not found.', 404);
  if (
    !REVIEW_ROLES.has(user.role) &&
    ![
      evidence.reporter_email,
      evidence.reported_employee_email,
      evidence.assigned_head_email
    ].includes(user.email)
  ) {
    throw httpError('You do not have access to this evidence file.', 403);
  }
  return evidence;
}

async function markNotificationSeen(connection, incidentId, email, type) {
  await connection.execute(
    `UPDATE incident_notifications
     SET viewed_at = COALESCE(viewed_at, CURRENT_TIMESTAMP)
     WHERE incident_id = ? AND recipient_email = ? AND notification_type = ?`,
    [incidentId, email, type]
  );
}

async function signIncidentCase(req, incidentId, signatoryRole, signatureData) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(incidentId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid Incident Report.', 400);
  if (!['EMPLOYEE', 'HEAD', 'HR'].includes(signatoryRole))
    throw httpError('Choose a valid signatory role.', 400);
  const signature = normalizeSignature(signatureData);
  if (signatoryRole === 'HR') {
    requireIncidentRole(
      user,
      REVIEW_ROLES,
      'Only HR or ADMIN can sign for HR.'
    );
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, case_number, status, reported_employee_email,
              reported_employee_name, assigned_head_email
       FROM incident_reports WHERE id = ? FOR UPDATE`,
      [id]
    );
    const incident = rows[0];
    if (!incident) throw httpError('Incident Report not found.', 404);

    if (signatoryRole === 'EMPLOYEE') {
      if (incident.reported_employee_email !== user.email)
        throw httpError('Only the reported employee can sign this field.', 403);
      if (incident.status !== 'PENDING SIGNATURE')
        throw httpError('This case is no longer awaiting signatures.', 409);
      await markNotificationSeen(
        connection,
        id,
        user.email,
        'EMPLOYEE_SIGNATURE'
      );
    } else if (signatoryRole === 'HEAD') {
      if (!['HEAD', 'HR'].includes(user.role))
        throw httpError('Only an assigned Head can sign this field.', 403);
      if (
        !incident.assigned_head_email ||
        incident.assigned_head_email !== user.email
      )
        throw httpError('Only the assigned Head can sign this field.', 403);
      if (incident.status !== 'PENDING SIGNATURE')
        throw httpError('This case is no longer awaiting signatures.', 409);
      await markNotificationSeen(connection, id, user.email, 'HEAD_SIGNATURE');
    } else if (incident.status !== 'SIGNED') {
      throw httpError(
        'HR can sign only after the required signatures are complete.',
        409
      );
    } else {
      await connection.execute(
        `UPDATE incident_notifications
         SET viewed_at = COALESCE(viewed_at, CURRENT_TIMESTAMP)
         WHERE incident_id = ? AND notification_type = 'HR_REVIEW_READY'`,
        [id]
      );
    }

    await connection.execute(
      `INSERT INTO incident_signatures
         (incident_id, signatory_role, signer_email, signature_data)
       VALUES (?, ?, ?, ?)`,
      [id, signatoryRole, user.email, signature]
    );

    let nextStatus = incident.status;
    if (signatoryRole === 'HR') {
      nextStatus = 'UNDER_REVIEW';
      await connection.execute(
        "UPDATE incident_reports SET status = 'UNDER_REVIEW' WHERE id = ? AND status = 'SIGNED'",
        [id]
      );
    } else {
      const [signedRows] = await connection.execute(
        'SELECT signatory_role FROM incident_signatures WHERE incident_id = ?',
        [id]
      );
      const signedRoles = new Set(signedRows.map((row) => row.signatory_role));
      const complete =
        signedRoles.has('EMPLOYEE') &&
        (!incident.assigned_head_email || signedRoles.has('HEAD'));
      if (complete) {
        nextStatus = 'SIGNED';
        await connection.execute(
          "UPDATE incident_reports SET status = 'SIGNED' WHERE id = ? AND status = 'PENDING SIGNATURE'",
          [id]
        );
        await connection.execute(
          `INSERT IGNORE INTO incident_notifications
             (incident_id, recipient_email, notification_type)
           SELECT ?, email, 'HR_REVIEW_READY' FROM user_roles
           WHERE active = 1 AND role IN ('HR', 'ADMIN')`,
          [id]
        );
      }
    }

    await logAudit(
      user.email,
      `INCIDENT_${signatoryRole}_SIGNED`,
      incident.case_number,
      `Incident Report signed as ${signatoryRole}`,
      connection
    );
    await connection.commit();
    return { ok: true, caseNumber: incident.case_number, status: nextStatus };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      throw httpError('This signatory role has already signed the case.', 409);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function getIncidentBadgeCounts(req) {
  const user = await requirePerm(req, 'inbox.read');
  const [[track]] = await pool.execute(
    `SELECT COUNT(*) AS count FROM incident_reports i
     WHERE i.status = 'PENDING SIGNATURE' AND (
       (i.reported_employee_email = ? AND NOT EXISTS (
         SELECT 1 FROM incident_signatures s
         WHERE s.incident_id = i.id AND s.signatory_role = 'EMPLOYEE'
       )) OR
       (i.assigned_head_email = ? AND NOT EXISTS (
         SELECT 1 FROM incident_signatures s
         WHERE s.incident_id = i.id AND s.signatory_role = 'HEAD'
       ))
     )`,
    [user.email, user.email]
  );
  let review = 0;
  if (REVIEW_ROLES.has(user.role)) {
    const [[row]] = await pool.execute(
      "SELECT COUNT(*) AS count FROM incident_reports WHERE status = 'SIGNED'"
    );
    review = Number(row.count);
  }
  return { track: Number(track.count), review };
}

async function listPendingIncidentNotifications(req) {
  const user = await requirePerm(req, 'inbox.read');
  const [rows] = await pool.execute(
    `SELECT n.id, n.notification_type AS type, n.created_at AS createdAt,
            i.id AS incidentId, i.case_number AS caseNumber, i.subject,
            i.status, i.reported_employee_name AS reportedEmployeeName
     FROM incident_notifications n
     JOIN incident_reports i ON i.id = n.incident_id
     WHERE n.recipient_email = ? AND n.viewed_at IS NULL
     ORDER BY n.created_at, n.id LIMIT 100`,
    [user.email]
  );
  return rows;
}

async function markIncidentNotificationSeen(req, notificationId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(notificationId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid notification.', 400);
  await pool.execute(
    `UPDATE incident_notifications SET viewed_at = COALESCE(viewed_at, CURRENT_TIMESTAMP)
     WHERE id = ? AND recipient_email = ?`,
    [id, user.email]
  );
  return { ok: true };
}

module.exports = {
  getIncidentFileContext,
  searchIncidentEmployees,
  submitIncidentReport,
  listIncidentsForTrack,
  listIncidentsForReview,
  getIncidentCase,
  getIncidentEvidence,
  signIncidentCase,
  getIncidentBadgeCounts,
  listPendingIncidentNotifications,
  markIncidentNotificationSeen
};
