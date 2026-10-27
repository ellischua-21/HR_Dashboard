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

function addWorkingDays(dateValue, workingDays) {
  const [year, month, day] = String(dateValue).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  let remaining = Number(workingDays);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining -= 1;
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function workingDaysBetween(fromDate, throughDate) {
  if (!fromDate || !throughDate || throughDate <= fromDate) return 0;
  const [year, month, day] = String(fromDate).split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  let days = 0;
  while (true) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const value = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`;
    if (value > throughDate) break;
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) days += 1;
  }
  return days;
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
          (SELECT DATE_FORMAT(n.deadline_date, '%Y-%m-%d') FROM incident_ntes n
           WHERE n.incident_id = incident_reports.id AND n.status = 'ISSUED' LIMIT 1) AS explanationDeadline,
          (SELECT n.overdue_at FROM incident_ntes n
           WHERE n.incident_id = incident_reports.id AND n.status = 'ISSUED' LIMIT 1) AS explanationOverdue,
          created_at AS createdAt`;
}

function addIncidentCountdown(rows) {
  const today = currentManilaDate();
  return rows.map((row) => ({
    ...row,
    daysRemaining: row.explanationDeadline
      ? workingDaysBetween(today, String(row.explanationDeadline).slice(0, 10))
      : null
  }));
}

async function listIncidentsForHistory(req) {
  const user = await requirePerm(req, 'inbox.read');
  if (!['STAFF', 'HEAD'].includes(user.role)) {
    throw httpError('History is available to STAFF and HEAD accounts.', 403);
  }
  const [rows] = await pool.execute(
    `SELECT ${incidentListFields()}
     FROM incident_reports
     WHERE status = 'CLOSED'
       AND (reporter_email = ? OR reported_employee_email = ? OR assigned_head_email = ?
         OR id IN (
           SELECT p.incident_id FROM incident_participants p
           JOIN employees e ON e.record_id = p.employee_record_id
           WHERE LOWER(e.personal_email) = LOWER(?)
         ))
     ORDER BY updated_at DESC, id DESC LIMIT 300`,
    [user.email, user.email, user.email, user.email]
  );
  return addIncidentCountdown(rows);
}

async function listIncidentsForTrack(req) {
  const user = await requirePerm(req, 'inbox.read');
  const [rows] = await pool.execute(
    `SELECT ${incidentListFields()}
     FROM incident_reports
     WHERE status <> 'CLOSED'
       AND (reporter_email = ? OR reported_employee_email = ? OR assigned_head_email = ?
         OR id IN (
           SELECT p.incident_id FROM incident_participants p
           JOIN employees e ON e.record_id = p.employee_record_id
           WHERE LOWER(e.personal_email) = LOWER(?)
         ))
     ORDER BY created_at DESC, id DESC LIMIT 300`,
    [user.email, user.email, user.email, user.email]
  );
  return addIncidentCountdown(rows);
}

async function listIncidentsForReview(req) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    REVIEW_ROLES,
    'Only HR and ADMIN accounts can review Incident Reports.'
  );
  await processOverdueIncidentNtes();
  const [rows] = await pool.query(
    `SELECT ${incidentListFields()}
     FROM incident_reports
     ORDER BY created_at DESC, id DESC LIMIT 500`
  );
  return addIncidentCountdown(rows);
}

async function getIncidentForAction(connection, incidentId) {
  const [rows] = await connection.execute(
    `SELECT id, case_number, status, reporter_email, reported_employee_email,
            assigned_head_email
     FROM incident_reports WHERE id = ? FOR UPDATE`,
    [incidentId]
  );
  if (!rows[0]) throw httpError('Incident Report not found.', 404);
  return rows[0];
}

async function recordIncidentActivity(
  connection,
  user,
  incident,
  action,
  details
) {
  await connection.execute(
    `INSERT INTO incident_activity (incident_id, actor_email, action, details)
     VALUES (?, ?, ?, ?)`,
    [incident.id, user.email, action, details]
  );
  await logAudit(
    user.email,
    `INCIDENT_${action}`,
    incident.case_number,
    details,
    connection
  );
}

async function notifyIncidentParties(connection, incident, type) {
  const recipients = new Set(
    [
      incident.reporter_email,
      incident.reported_employee_email,
      incident.assigned_head_email
    ].filter(Boolean)
  );
  const [participantAccounts] = await connection.execute(
    `SELECT DISTINCT u.email FROM incident_participants p
     JOIN employees e ON e.record_id = p.employee_record_id
     JOIN user_roles u ON LOWER(u.email) = LOWER(e.personal_email) AND u.active = 1
     WHERE p.incident_id = ?`,
    [incident.id]
  );
  participantAccounts.forEach((account) => recipients.add(account.email));
  for (const email of recipients) {
    await connection.execute(
      `INSERT IGNORE INTO incident_notifications
       (incident_id, recipient_email, notification_type) VALUES (?, ?, ?)`,
      [incident.id, email, type]
    );
  }
}

async function transitionIncident(req, incidentId, action, details = '') {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    REVIEW_ROLES,
    'Only HR and ADMIN can manage Incident Reports.'
  );
  const id = Number(incidentId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid Incident Report.', 400);
  const cleanDetails = normalizeText(
    String(details || ''),
    'Reason or findings',
    4000,
    action !== 'INVESTIGATION_STARTED'
  );
  const transitions = {
    CLOSE_DOCUMENTATION: {
      from: 'UNDER_REVIEW',
      to: 'CLOSED',
      activity: 'CLOSED_FOR_DOCUMENTATION',
      notification: 'CASE_CLOSED'
    },
    START_INVESTIGATION: {
      from: 'UNDER_REVIEW',
      to: 'UNDER INVESTIGATION',
      activity: 'INVESTIGATION_STARTED',
      notification: 'INVESTIGATION_STARTED'
    },
    CLOSE_INVESTIGATION: {
      from: 'UNDER INVESTIGATION',
      to: 'CLOSED',
      activity: 'INVESTIGATION_CLOSED',
      notification: 'CASE_CLOSED'
    }
  };
  const transition = transitions[action];
  if (!transition) throw httpError('Choose a valid case action.', 400);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incident = await getIncidentForAction(connection, id);
    if (incident.status !== transition.from)
      throw httpError('This case has already changed status.', 409);
    await connection.execute(
      'UPDATE incident_reports SET status = ? WHERE id = ?',
      [transition.to, id]
    );
    await recordIncidentActivity(
      connection,
      user,
      incident,
      transition.activity,
      cleanDetails
    );
    await notifyIncidentParties(connection, incident, transition.notification);
    await connection.commit();
    return {
      ok: true,
      caseNumber: incident.case_number,
      status: transition.to
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listIncidentCodeProvisions(req) {
  await requirePerm(req, 'inbox.read');
  const [rows] = await pool.execute(
    `SELECT id, provision_code AS code, title, description
     FROM incident_code_provisions WHERE active = 1 ORDER BY provision_code, title`
  );
  return rows;
}

async function saveIncidentCodeProvision(req, input = {}) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    REVIEW_ROLES,
    'Only HR and ADMIN can manage Code of Conduct provisions.'
  );
  const code = normalizeText(String(input.code || ''), 'Provision code', 100);
  const title = normalizeText(
    String(input.title || ''),
    'Provision title',
    191
  );
  const description = normalizeText(
    String(input.description || ''),
    'Provision description',
    4000
  );
  const id = Number(input.id || 0);
  if (id) {
    await pool.execute(
      `UPDATE incident_code_provisions SET provision_code = ?, title = ?, description = ?, active = 1 WHERE id = ?`,
      [code, title, description, id]
    );
    return { ok: true, id };
  }
  const [result] = await pool.execute(
    `INSERT INTO incident_code_provisions (provision_code, title, description, created_by)
     VALUES (?, ?, ?, ?)`,
    [code, title, description, user.email]
  );
  return { ok: true, id: result.insertId };
}

function normalizeNteInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw httpError('Enter valid NTE details.', 400);
  const provisionId = Number(input.provisionId);
  const allegation = normalizeText(
    String(input.allegation || ''),
    'Allegation details',
    12000
  );
  const issuanceDate = normalizeDate(input.issuanceDate, 'issuance date');
  const receiptDate = normalizeDate(input.receiptDate, 'receipt date');
  const workingDays = Number(input.responseWorkingDays);
  if (!Number.isInteger(workingDays) || workingDays < 1 || workingDays > 60)
    throw httpError(
      'The response period must be from 1 to 60 working days.',
      400
    );
  const deadlineDate = input.deadlineDate
    ? normalizeDate(input.deadlineDate, 'explanation deadline')
    : addWorkingDays(receiptDate, workingDays);
  if (receiptDate < issuanceDate)
    throw httpError(
      'The receipt date cannot be before the issuance date.',
      400
    );
  if (deadlineDate < receiptDate)
    throw httpError(
      'The explanation deadline cannot be before the receipt date.',
      400
    );
  if (!Number.isSafeInteger(provisionId) || provisionId < 1)
    throw httpError('Select a Code of Conduct provision.', 400);
  return {
    provisionId,
    allegation,
    issuanceDate,
    receiptDate,
    workingDays,
    deadlineDate
  };
}

async function upsertIncidentNte(connection, user, incident, input) {
  const fields = normalizeNteInput(input);
  const [[provision]] = await connection.execute(
    `SELECT id, provision_code AS code, title, description
     FROM incident_code_provisions WHERE id = ? AND active = 1 FOR UPDATE`,
    [fields.provisionId]
  );
  if (!provision)
    throw httpError(
      'The selected Code of Conduct provision is unavailable.',
      409
    );
  const [existingRows] = await connection.execute(
    'SELECT id, status FROM incident_ntes WHERE incident_id = ? FOR UPDATE',
    [incident.id]
  );
  if (existingRows[0] && existingRows[0].status !== 'DRAFT')
    throw httpError('An NTE has already been issued for this case.', 409);
  if (existingRows[0]) {
    await connection.execute(
      `UPDATE incident_ntes SET provision_id = ?, provision_code = ?, provision_title = ?,
       provision_text = ?, allegation = ?, issuance_date = ?, receipt_date = ?,
       response_working_days = ?, deadline_date = ?, signer_email = ?, signer_name = ?
       WHERE id = ? AND status = 'DRAFT'`,
      [
        fields.provisionId,
        provision.code,
        provision.title,
        provision.description,
        fields.allegation,
        fields.issuanceDate,
        fields.receiptDate,
        fields.workingDays,
        fields.deadlineDate,
        user.email,
        user.full_name || user.email,
        existingRows[0].id
      ]
    );
  } else {
    const [result] = await connection.execute(
      `INSERT INTO incident_ntes
       (incident_id, provision_id, provision_code, provision_title, provision_text,
        allegation, issuance_date, receipt_date, response_working_days, deadline_date,
        signer_email, signer_name, signature_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
      [
        incident.id,
        fields.provisionId,
        provision.code,
        provision.title,
        provision.description,
        fields.allegation,
        fields.issuanceDate,
        fields.receiptDate,
        fields.workingDays,
        fields.deadlineDate,
        user.email,
        user.full_name || user.email
      ]
    );
    existingRows.push({ id: result.insertId, status: 'DRAFT' });
  }
  const nteId = Number(existingRows[0].id);
  const files = normalizeEvidence(input.evidence || []);
  if (files.length) {
    await connection.execute(
      `DELETE FROM incident_nte_evidence WHERE nte_id = ?`,
      [nteId]
    );
  }
  for (const file of files) {
    await connection.execute(
      `INSERT INTO incident_nte_evidence
       (nte_id, file_name, mime_type, byte_size, file_data, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        nteId,
        file.fileName,
        file.mimeType,
        file.fileData.length,
        file.fileData,
        user.email
      ]
    );
  }
  return { nteId, ...fields, provision };
}

async function saveIncidentNteDraft(req, incidentId, input = {}) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    REVIEW_ROLES,
    'Only HR and ADMIN can prepare an NTE.'
  );
  const id = Number(incidentId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid Incident Report.', 400);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incident = await getIncidentForAction(connection, id);
    if (!['UNDER_REVIEW', 'UNDER INVESTIGATION'].includes(incident.status))
      throw httpError(
        'An NTE can only be prepared during HR review or investigation.',
        409
      );
    const nte = await upsertIncidentNte(connection, user, incident, input);
    await recordIncidentActivity(
      connection,
      user,
      incident,
      'NTE_DRAFT_SAVED',
      'NTE draft prepared.'
    );
    await connection.commit();
    return { ok: true, nteId: nte.nteId, deadlineDate: nte.deadlineDate };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY')
      throw httpError('An NTE is already recorded for this case.', 409);
    throw error;
  } finally {
    connection.release();
  }
}

async function issueIncidentNte(req, incidentId, input = {}) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    REVIEW_ROLES,
    'Only HR and ADMIN can issue an NTE.'
  );
  const signature = normalizeSignature(input.signature);
  const id = Number(incidentId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid Incident Report.', 400);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incident = await getIncidentForAction(connection, id);
    if (!['UNDER_REVIEW', 'UNDER INVESTIGATION'].includes(incident.status))
      throw httpError(
        'An NTE can only be issued during HR review or investigation.',
        409
      );
    const nte = await upsertIncidentNte(connection, user, incident, input);
    await connection.execute(
      `UPDATE incident_ntes SET status = 'ISSUED', signature_data = ?, issued_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'DRAFT'`,
      [signature, nte.nteId]
    );
    await connection.execute(
      `UPDATE incident_reports SET status = 'NTE ISSUED' WHERE id = ?`,
      [id]
    );
    await recordIncidentActivity(
      connection,
      user,
      incident,
      'NTE_ISSUED',
      `NTE issued with ${nte.deadlineDate} explanation deadline.`
    );
    await notifyIncidentParties(connection, incident, 'NTE_ISSUED');
    await connection.commit();
    return {
      ok: true,
      caseNumber: incident.case_number,
      status: 'NTE ISSUED',
      nteId: nte.nteId
    };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY')
      throw httpError('An NTE has already been issued for this case.', 409);
    throw error;
  } finally {
    connection.release();
  }
}

async function saveIncidentExplanationDraft(
  req,
  incidentId,
  explanation,
  files = []
) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(incidentId);
  const text = normalizeText(
    String(explanation || ''),
    'Explanation',
    20000,
    false
  );
  const evidence = normalizeEvidence(files);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incident = await getIncidentForAction(connection, id);
    if (
      incident.reported_employee_email.toLowerCase() !==
      user.email.toLowerCase()
    )
      throw httpError(
        'Only the reported employee can save this explanation.',
        403
      );
    if (incident.status !== 'NTE ISSUED')
      throw httpError('This case is no longer accepting an explanation.', 409);
    const [[nte]] = await connection.execute(
      `SELECT id FROM incident_ntes WHERE incident_id = ? AND status = 'ISSUED' FOR UPDATE`,
      [id]
    );
    if (!nte) throw httpError('The issued NTE could not be found.', 404);
    await connection.execute(
      `INSERT INTO incident_explanation_drafts (nte_id, employee_email, explanation)
       VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE explanation = VALUES(explanation), employee_email = VALUES(employee_email)`,
      [nte.id, user.email, text]
    );
    if (evidence.length) {
      await connection.execute(
        `DELETE FROM incident_explanation_draft_evidence WHERE nte_id = ?`,
        [nte.id]
      );
    }
    for (const file of evidence)
      await connection.execute(
        `INSERT INTO incident_explanation_draft_evidence (nte_id, file_name, mime_type, byte_size, file_data)
       VALUES (?, ?, ?, ?, ?)`,
        [
          nte.id,
          file.fileName,
          file.mimeType,
          file.fileData.length,
          file.fileData
        ]
      );
    await connection.commit();
    return { ok: true, savedAt: new Date().toISOString() };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function submitIncidentExplanation(
  req,
  incidentId,
  explanation,
  files = []
) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(incidentId);
  const text = normalizeText(String(explanation || ''), 'Explanation', 20000);
  const evidence = normalizeEvidence(files);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incident = await getIncidentForAction(connection, id);
    if (
      incident.reported_employee_email.toLowerCase() !==
      user.email.toLowerCase()
    )
      throw httpError(
        'Only the reported employee can submit this explanation.',
        403
      );
    if (incident.status !== 'NTE ISSUED')
      throw httpError('This case is no longer accepting an explanation.', 409);
    const [[nte]] = await connection.execute(
      `SELECT id FROM incident_ntes WHERE incident_id = ? AND status = 'ISSUED' FOR UPDATE`,
      [id]
    );
    if (!nte) throw httpError('The issued NTE could not be found.', 404);
    const [result] = await connection.execute(
      `INSERT INTO incident_explanations (nte_id, submitted_by, explanation, source, submitted_at)
       VALUES (?, ?, ?, 'HRIS', CURRENT_TIMESTAMP)`,
      [nte.id, user.email, text]
    );
    const [[submissionTime]] = await connection.execute(
      `SELECT DATE_FORMAT(submitted_at, '%Y-%m-%dT%H:%i:%s') AS submittedAt
       FROM incident_explanations WHERE id = ?`,
      [result.insertId]
    );
    await connection.execute(
      `INSERT INTO incident_explanation_evidence (explanation_id, file_name, mime_type, byte_size, file_data, uploaded_by)
       SELECT ?, file_name, mime_type, byte_size, file_data, ? FROM incident_explanation_draft_evidence WHERE nte_id = ?`,
      [result.insertId, user.email, nte.id]
    );
    for (const file of evidence)
      await connection.execute(
        `INSERT INTO incident_explanation_evidence (explanation_id, file_name, mime_type, byte_size, file_data, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
        [
          result.insertId,
          file.fileName,
          file.mimeType,
          file.fileData.length,
          file.fileData,
          user.email
        ]
      );
    await connection.execute(
      `DELETE FROM incident_explanation_drafts WHERE nte_id = ?`,
      [nte.id]
    );
    await connection.execute(
      `DELETE FROM incident_explanation_draft_evidence WHERE nte_id = ?`,
      [nte.id]
    );
    await connection.execute(
      `UPDATE incident_reports SET status = 'EXPLANATION SENT' WHERE id = ?`,
      [id]
    );
    await recordIncidentActivity(
      connection,
      user,
      incident,
      'EXPLANATION_SENT',
      'Employee submitted an explanation through HRIS.'
    );
    await connection.execute(
      `INSERT IGNORE INTO incident_notifications (incident_id, recipient_email, notification_type)
       SELECT ?, email, 'EXPLANATION_SENT' FROM user_roles WHERE active = 1 AND role IN ('HR', 'ADMIN')`,
      [id]
    );
    await connection.commit();
    return {
      ok: true,
      explanationId: result.insertId,
      submittedAt: submissionTime.submittedAt,
      status: 'EXPLANATION SENT'
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function startIncidentEvaluation(req, incidentId) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    REVIEW_ROLES,
    'Only HR and ADMIN can start evaluation.'
  );
  const id = Number(incidentId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incident = await getIncidentForAction(connection, id);
    if (incident.status !== 'EXPLANATION SENT')
      throw httpError('This case is not awaiting explanation review.', 409);
    await connection.execute(
      `UPDATE incident_reports SET status = 'EVALUATION' WHERE id = ?`,
      [id]
    );
    await recordIncidentActivity(
      connection,
      user,
      incident,
      'EVALUATION_STARTED',
      'HR opened the submitted explanation for evaluation.'
    );
    await connection.commit();
    return { ok: true, status: 'EVALUATION' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function submitIncidentExplanationAddendum(
  req,
  incidentId,
  statement,
  files = []
) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(incidentId);
  const text = normalizeText(
    String(statement || ''),
    'Additional statement',
    20000
  );
  const evidence = normalizeEvidence(files);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incident = await getIncidentForAction(connection, id);
    if (
      incident.reported_employee_email.toLowerCase() !==
      user.email.toLowerCase()
    )
      throw httpError(
        'Only the reported employee can submit an additional statement.',
        403
      );
    if (incident.status === 'CLOSED')
      throw httpError('A closed case cannot accept another statement.', 409);
    const [[nte]] = await connection.execute(
      `SELECT id FROM incident_ntes WHERE incident_id = ? AND status = 'ISSUED' FOR UPDATE`,
      [id]
    );
    if (!nte) throw httpError('The issued NTE could not be found.', 404);
    const [[prior]] = await connection.execute(
      `SELECT id FROM incident_explanations WHERE nte_id = ? LIMIT 1`,
      [nte.id]
    );
    if (!prior)
      throw httpError(
        'Submit your initial explanation before adding another statement.',
        409
      );
    const [result] = await connection.execute(
      `INSERT INTO incident_explanation_addenda
       (nte_id, submitted_by, statement, submitted_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [nte.id, user.email, text]
    );
    for (const file of evidence)
      await connection.execute(
        `INSERT INTO incident_explanation_addendum_evidence
         (addendum_id, file_name, mime_type, byte_size, file_data, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          result.insertId,
          file.fileName,
          file.mimeType,
          file.fileData.length,
          file.fileData,
          user.email
        ]
      );
    await recordIncidentActivity(
      connection,
      user,
      incident,
      'EXPLANATION_ADDENDUM',
      'Employee submitted a separate additional statement.'
    );
    await connection.execute(
      `INSERT IGNORE INTO incident_notifications
       (incident_id, recipient_email, notification_type)
       SELECT ?, email, ? FROM user_roles WHERE active = 1 AND role IN ('HR', 'ADMIN')`,
      [id, `EXPLANATION_ADD_${result.insertId}`.slice(0, 32)]
    );
    await connection.commit();
    return { ok: true, addendumId: result.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function extendIncidentDeadline(req, incidentId, newDeadline, reason) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    REVIEW_ROLES,
    'Only HR and ADMIN can approve an explanation extension.'
  );
  const date = normalizeDate(newDeadline, 'extended deadline');
  const details = normalizeText(String(reason || ''), 'Extension reason', 2000);
  const id = Number(incidentId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incident = await getIncidentForAction(connection, id);
    if (incident.status !== 'NTE ISSUED')
      throw httpError(
        'Extensions can only be recorded while awaiting an explanation.',
        409
      );
    const [[nte]] = await connection.execute(
      `SELECT id, DATE_FORMAT(deadline_date, '%Y-%m-%d') AS deadlineDate
       FROM incident_ntes WHERE incident_id = ? AND status = 'ISSUED' FOR UPDATE`,
      [id]
    );
    if (!nte || date <= nte.deadlineDate)
      throw httpError('The extension must move the deadline later.', 400);
    const [extension] = await connection.execute(
      `INSERT INTO incident_deadline_extensions (nte_id, previous_deadline, extended_deadline, reason, approved_by)
       VALUES (?, ?, ?, ?, ?)`,
      [nte.id, nte.deadlineDate, date, details, user.email]
    );
    await connection.execute(
      `UPDATE incident_ntes SET deadline_date = ?, overdue_at = NULL WHERE id = ?`,
      [date, nte.id]
    );
    await recordIncidentActivity(
      connection,
      user,
      incident,
      'DEADLINE_EXTENDED',
      `Deadline extended to ${date}: ${details}`
    );
    await connection.execute(
      `INSERT IGNORE INTO incident_notifications (incident_id, recipient_email, notification_type)
       VALUES (?, ?, ?)`,
      [id, incident.reported_employee_email, `NTE_EXT_${extension.insertId}`]
    );
    await connection.commit();
    return { ok: true, deadlineDate: date };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function recordExternalIncidentExplanation(
  req,
  incidentId,
  explanation,
  channel,
  receivedAt,
  files = []
) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    REVIEW_ROLES,
    'Only HR and ADMIN can record an external explanation.'
  );
  const text = normalizeText(String(explanation || ''), 'Explanation', 20000);
  const channelText = normalizeText(
    String(channel || ''),
    'Authorized channel',
    191
  );
  const received = new Date(receivedAt);
  if (!receivedAt || Number.isNaN(received.getTime()))
    throw httpError('Enter the actual received date and time.', 400);
  const evidence = normalizeEvidence(files);
  const id = Number(incidentId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incident = await getIncidentForAction(connection, id);
    if (incident.status !== 'NTE ISSUED')
      throw httpError('This case is not awaiting an explanation.', 409);
    const [[nte]] = await connection.execute(
      `SELECT id FROM incident_ntes WHERE incident_id = ? AND status = 'ISSUED' FOR UPDATE`,
      [id]
    );
    if (!nte) throw httpError('The issued NTE could not be found.', 404);
    const [result] = await connection.execute(
      `INSERT INTO incident_explanations (nte_id, submitted_by, explanation, source, other_channel, submitted_at)
       VALUES (?, ?, ?, 'OTHER_CHANNEL', ?, ?)`,
      [
        nte.id,
        user.email,
        text,
        channelText,
        received.toISOString().slice(0, 19).replace('T', ' ')
      ]
    );
    for (const file of evidence)
      await connection.execute(
        `INSERT INTO incident_explanation_evidence (explanation_id, file_name, mime_type, byte_size, file_data, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
        [
          result.insertId,
          file.fileName,
          file.mimeType,
          file.fileData.length,
          file.fileData,
          user.email
        ]
      );
    await connection.execute(
      `UPDATE incident_reports SET status = 'EXPLANATION SENT' WHERE id = ?`,
      [id]
    );
    await recordIncidentActivity(
      connection,
      user,
      incident,
      'EXPLANATION_RECEIVED_EXTERNALLY',
      `Explanation received through ${channelText}.`
    );
    await connection.execute(
      `INSERT IGNORE INTO incident_notifications (incident_id, recipient_email, notification_type)
       SELECT ?, email, 'EXPLANATION_SENT' FROM user_roles WHERE active = 1 AND role IN ('HR', 'ADMIN')`,
      [id]
    );
    await connection.commit();
    return { ok: true, explanationId: result.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function processOverdueIncidentNtes() {
  const today = currentManilaDate();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT n.id AS nteId, n.incident_id AS incidentId, i.case_number AS caseNumber,
              (SELECT COUNT(*) FROM incident_deadline_extensions x WHERE x.nte_id = n.id) AS extensionCount
       FROM incident_ntes n JOIN incident_reports i ON i.id = n.incident_id
       WHERE n.status = 'ISSUED' AND n.deadline_date < ? AND n.overdue_at IS NULL
         AND i.status = 'NTE ISSUED' FOR UPDATE`,
      [today]
    );
    for (const row of rows) {
      await connection.execute(
        `UPDATE incident_ntes SET overdue_at = CURRENT_TIMESTAMP WHERE id = ? AND overdue_at IS NULL`,
        [row.nteId]
      );
      await connection.execute(
        `INSERT IGNORE INTO incident_notifications (incident_id, recipient_email, notification_type)
         SELECT ?, email, ? FROM user_roles WHERE active = 1 AND role IN ('HR', 'ADMIN')`,
        [
          row.incidentId,
          Number(row.extensionCount)
            ? `NTE_OVERDUE_${row.extensionCount}`
            : 'NTE_OVERDUE'
        ]
      );
      await connection.execute(
        `INSERT INTO incident_activity (incident_id, actor_email, action, details)
         VALUES (?, 'SYSTEM', 'EXPLANATION_OVERDUE', 'The NTE explanation deadline passed without a recorded explanation.')`,
        [row.incidentId]
      );
      await logAudit(
        'SYSTEM',
        'INCIDENT_EXPLANATION_OVERDUE',
        row.caseNumber,
        'NTE explanation deadline passed.',
        connection
      );
    }
    await connection.commit();
    return rows.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listDailyNteReminders(req) {
  const user = await requirePerm(req, 'inbox.read');
  if (user.role !== 'STAFF') return [];
  await processOverdueIncidentNtes();
  const today = currentManilaDate();
  const [cases] = await pool.execute(
    `SELECT n.id AS nteId, i.id AS incidentId, i.case_number AS caseNumber,
            i.subject, DATE_FORMAT(n.deadline_date, '%Y-%m-%d') AS deadlineDate,
            n.overdue_at AS overdueAt
     FROM incident_ntes n JOIN incident_reports i ON i.id = n.incident_id
     WHERE i.reported_employee_email = ? AND i.status = 'NTE ISSUED' AND n.status = 'ISSUED'
     ORDER BY n.deadline_date, n.id`,
    [user.email]
  );
  const reminders = [];
  for (const item of cases) {
    const [result] = await pool.execute(
      `INSERT IGNORE INTO incident_nte_reminders (nte_id, employee_email, reminder_date)
       VALUES (?, ?, ?)`,
      [item.nteId, user.email, today]
    );
    if (result.affectedRows)
      reminders.push({
        ...item,
        daysRemaining: workingDaysBetween(today, item.deadlineDate)
      });
  }
  return reminders;
}

async function getIncidentNteEvidence(req, evidenceId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(evidenceId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid NTE attachment.', 400);
  const [rows] = await pool.execute(
    `SELECT f.file_name AS fileName, f.mime_type AS mimeType, f.file_data AS fileData,
            n.status AS nteStatus, i.reported_employee_email AS employeeEmail
     FROM incident_nte_evidence f JOIN incident_ntes n ON n.id = f.nte_id
     JOIN incident_reports i ON i.id = n.incident_id WHERE f.id = ? LIMIT 1`,
    [id]
  );
  const file = rows[0];
  if (!file) throw httpError('NTE attachment not found.', 404);
  if (
    !REVIEW_ROLES.has(user.role) &&
    (file.nteStatus !== 'ISSUED' ||
      file.employeeEmail.toLowerCase() !== user.email.toLowerCase())
  )
    throw httpError('You do not have access to this NTE attachment.', 403);
  return file;
}

async function getIncidentExplanationEvidence(req, evidenceId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(evidenceId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid explanation attachment.', 400);
  const [rows] = await pool.execute(
    `SELECT f.file_name AS fileName, f.mime_type AS mimeType, f.file_data AS fileData,
            i.reported_employee_email AS employeeEmail
     FROM incident_explanation_evidence f JOIN incident_explanations e ON e.id = f.explanation_id
     JOIN incident_ntes n ON n.id = e.nte_id JOIN incident_reports i ON i.id = n.incident_id
     WHERE f.id = ? LIMIT 1`,
    [id]
  );
  const file = rows[0];
  if (!file) throw httpError('Explanation attachment not found.', 404);
  if (
    !REVIEW_ROLES.has(user.role) &&
    file.employeeEmail.toLowerCase() !== user.email.toLowerCase()
  )
    throw httpError(
      'You do not have access to this explanation attachment.',
      403
    );
  return file;
}

async function getIncidentExplanationDraftEvidence(req, evidenceId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(evidenceId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid draft attachment.', 400);
  const [rows] = await pool.execute(
    `SELECT f.file_name AS fileName, f.mime_type AS mimeType, f.file_data AS fileData,
            d.employee_email AS employeeEmail
     FROM incident_explanation_draft_evidence f
     JOIN incident_explanation_drafts d ON d.nte_id = f.nte_id
     WHERE f.id = ? LIMIT 1`,
    [id]
  );
  const file = rows[0];
  if (!file) throw httpError('Draft attachment not found.', 404);
  if (
    !REVIEW_ROLES.has(user.role) &&
    file.employeeEmail.toLowerCase() !== user.email.toLowerCase()
  )
    throw httpError('You do not have access to this draft attachment.', 403);
  return file;
}

async function getIncidentExplanationAddendumEvidence(req, evidenceId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(evidenceId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid additional statement attachment.', 400);
  const [rows] = await pool.execute(
    `SELECT f.file_name AS fileName, f.mime_type AS mimeType, f.file_data AS fileData,
            i.reported_employee_email AS employeeEmail
     FROM incident_explanation_addendum_evidence f
     JOIN incident_explanation_addenda a ON a.id = f.addendum_id
     JOIN incident_ntes n ON n.id = a.nte_id
     JOIN incident_reports i ON i.id = n.incident_id WHERE f.id = ? LIMIT 1`,
    [id]
  );
  const file = rows[0];
  if (!file) throw httpError('Additional statement attachment not found.', 404);
  if (
    !REVIEW_ROLES.has(user.role) &&
    file.employeeEmail.toLowerCase() !== user.email.toLowerCase()
  )
    throw httpError('You do not have access to this attachment.', 403);
  return file;
}

async function listIncidentRequestRecipients(req, incidentId) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    REVIEW_ROLES,
    'Only HR and ADMIN can manage Incident Reports.'
  );
  const [cases] = await pool.execute(
    'SELECT id, status FROM incident_reports WHERE id = ? LIMIT 1',
    [Number(incidentId)]
  );
  if (!cases[0]) throw httpError('Incident Report not found.', 404);
  if (cases[0].status !== 'UNDER INVESTIGATION')
    throw httpError(
      'Information can only be requested during investigation.',
      409
    );
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.email, COALESCE(NULLIF(e.name, ''), u.full_name, u.email) AS name
     FROM incident_reports i JOIN user_roles u ON u.active = 1
     LEFT JOIN employees e ON LOWER(e.personal_email) = LOWER(u.email) AND e.record_status <> 'Archived'
     WHERE i.id = ? AND (LOWER(u.email) IN (LOWER(i.reporter_email), LOWER(i.reported_employee_email), LOWER(COALESCE(i.assigned_head_email, '')))
       OR e.record_id IN (SELECT employee_record_id FROM incident_participants WHERE incident_id = i.id AND employee_record_id IS NOT NULL))
     ORDER BY name`,
    [Number(incidentId)]
  );
  return rows;
}

async function requestIncidentInformation(
  req,
  incidentId,
  recipientEmail,
  requestText
) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    REVIEW_ROLES,
    'Only HR and ADMIN can manage Incident Reports.'
  );
  const id = Number(incidentId);
  const recipient = normalizeText(
    String(recipientEmail || ''),
    'Recipient',
    191
  );
  const text = normalizeText(
    String(requestText || ''),
    'Information requested',
    4000
  );
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incident = await getIncidentForAction(connection, id);
    if (incident.status !== 'UNDER INVESTIGATION')
      throw httpError(
        'Information can only be requested during investigation.',
        409
      );
    const [allowed] = await connection.execute(
      `SELECT 1 FROM user_roles u LEFT JOIN employees e ON LOWER(e.personal_email) = LOWER(u.email) AND e.record_status <> 'Archived'
       WHERE LOWER(u.email) = LOWER(?) AND u.active = 1 AND (
         LOWER(u.email) IN (LOWER(?), LOWER(?), LOWER(COALESCE(?, '')))
         OR e.record_id IN (SELECT employee_record_id FROM incident_participants WHERE incident_id = ? AND employee_record_id IS NOT NULL)
       ) LIMIT 1`,
      [
        recipient,
        incident.reporter_email,
        incident.reported_employee_email,
        incident.assigned_head_email,
        id
      ]
    );
    if (!allowed.length)
      throw httpError('Choose an authorized case participant.', 400);
    const [result] = await connection.execute(
      `INSERT INTO incident_information_requests (incident_id, requested_by, recipient_email, request_text)
       VALUES (?, ?, ?, ?)`,
      [id, user.email, recipient, text]
    );
    await recordIncidentActivity(
      connection,
      user,
      incident,
      'INFORMATION_REQUESTED',
      `${recipient}: ${text}`
    );
    const notificationType = `INFO_REQ_${result.insertId}`.slice(0, 32);
    await connection.execute(
      `INSERT IGNORE INTO incident_notifications (incident_id, recipient_email, notification_type) VALUES (?, ?, ?)`,
      [id, recipient, notificationType]
    );
    await connection.commit();
    return { ok: true, requestId: result.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function addIncidentInvestigationNote(
  req,
  incidentId,
  details,
  files = []
) {
  const user = await requirePerm(req, 'inbox.read');
  requireIncidentRole(
    user,
    REVIEW_ROLES,
    'Only HR and ADMIN can investigate Incident Reports.'
  );
  const id = Number(incidentId);
  const text = normalizeText(String(details || ''), 'Investigation note', 4000);
  const evidence = normalizeEvidence(files);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incident = await getIncidentForAction(connection, id);
    if (incident.status !== 'UNDER INVESTIGATION')
      throw httpError(
        'Investigation notes can only be added while the case is under investigation.',
        409
      );
    await recordIncidentActivity(
      connection,
      user,
      incident,
      'INVESTIGATION_NOTE',
      text
    );
    for (const file of evidence)
      await connection.execute(
        `INSERT INTO incident_evidence (incident_id, file_name, mime_type, byte_size, file_data, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          file.fileName,
          file.mimeType,
          file.fileData.length,
          file.fileData,
          user.email
        ]
      );
    await connection.commit();
    return { ok: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function respondToIncidentInformation(
  req,
  incidentId,
  requestId,
  responseText,
  files = []
) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(incidentId),
    request = Number(requestId);
  if (
    !Number.isSafeInteger(id) ||
    !Number.isSafeInteger(request) ||
    id < 1 ||
    request < 1
  )
    throw httpError('Choose a valid information request.', 400);
  const text = normalizeText(
    String(responseText || ''),
    'Response',
    4000,
    false
  );
  const evidence = normalizeEvidence(files);
  if (!text && !evidence.length)
    throw httpError('Enter a response or attach evidence.', 400);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const incident = await getIncidentForAction(connection, id);
    if (incident.status !== 'UNDER INVESTIGATION')
      throw httpError('This case is no longer under investigation.', 409);
    const [requests] = await connection.execute(
      `SELECT id, requested_by FROM incident_information_requests
       WHERE id = ? AND incident_id = ? AND recipient_email = ? AND status = 'PENDING' FOR UPDATE`,
      [request, id, user.email]
    );
    if (!requests[0])
      throw httpError('This information request is unavailable.', 403);
    await connection.execute(
      `UPDATE incident_information_requests SET response_text = ?, status = 'RESPONDED', responded_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [text, request]
    );
    for (const file of evidence)
      await connection.execute(
        `INSERT INTO incident_evidence (incident_id, request_id, file_name, mime_type, byte_size, file_data, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          request,
          file.fileName,
          file.mimeType,
          file.fileData.length,
          file.fileData,
          user.email
        ]
      );
    await recordIncidentActivity(
      connection,
      user,
      incident,
      'INFORMATION_PROVIDED',
      `Response submitted for request ${request}.`
    );
    await connection.execute(
      `INSERT IGNORE INTO incident_notifications (incident_id, recipient_email, notification_type) VALUES (?, ?, ?)`,
      [id, requests[0].requested_by, `INFO_DONE_${request}`.slice(0, 32)]
    );
    await connection.commit();
    return { ok: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
            (SELECT e.department FROM employees e WHERE e.record_id = incident_reports.reported_employee_id LIMIT 1) AS reportedEmployeeDepartment,
            (SELECT e.position FROM employees e WHERE e.record_id = incident_reports.reported_employee_id LIMIT 1) AS reportedEmployeePosition,
            assigned_head_email AS assignedHeadEmail,
            date_reported AS dateReported, subject, incident_date AS incidentDate,
            location, incident_time AS incidentTime, description, comments, status,
            created_at AS createdAt
     FROM incident_reports WHERE id = ? LIMIT 1`,
    [id]
  );
  const incident = rows[0];
  if (!incident) throw httpError('Incident Report not found.', 404);
  let isParticipant = false;
  if (!canViewIncident(user, incident)) {
    const [participants] = await pool.execute(
      `SELECT 1 FROM incident_participants p
       JOIN employees e ON e.record_id = p.employee_record_id
       JOIN user_roles u ON LOWER(u.email) = LOWER(e.personal_email) AND u.active = 1
       WHERE p.incident_id = ? AND LOWER(u.email) = LOWER(?) LIMIT 1`,
      [id, user.email]
    );
    isParticipant = participants.length > 0;
  }
  if (!canViewIncident(user, incident) && !isParticipant)
    throw httpError('You do not have access to this Incident Report.', 403);

  const [[participants], [signatures], [evidence], [activity], [requests]] =
    await Promise.all([
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
              byte_size AS byteSize, uploaded_by AS uploadedBy, request_id AS requestId,
              created_at AS createdAt
       FROM incident_evidence WHERE incident_id = ? ORDER BY id`,
        [id]
      ),
      pool.execute(
        `SELECT action, details, actor_email AS actorEmail, created_at AS createdAt
       FROM incident_activity WHERE incident_id = ? ORDER BY created_at, id`,
        [id]
      ),
      pool.execute(
        `SELECT id, requested_by AS requestedBy, recipient_email AS recipientEmail,
              request_text AS requestText, response_text AS responseText, status,
              created_at AS createdAt, responded_at AS respondedAt
       FROM incident_information_requests WHERE incident_id = ? ORDER BY created_at, id`,
        [id]
      )
    ]);
  const canViewNte =
    REVIEW_ROLES.has(user.role) ||
    incident.reportedEmployeeEmail.toLowerCase() === user.email.toLowerCase();
  let nte = null;
  let explanationDraft = null;
  let explanations = [];
  let addenda = [];
  let extensions = [];
  if (canViewNte) {
    const [[nteRows], [draftRows], [explanationRows], [extensionRows]] =
      await Promise.all([
        pool.execute(
          `SELECT id, provision_id AS provisionId, provision_code AS provisionCode, provision_title AS provisionTitle,
                provision_text AS provisionText, allegation,
                DATE_FORMAT(issuance_date, '%Y-%m-%d') AS issuanceDate,
                DATE_FORMAT(receipt_date, '%Y-%m-%d') AS receiptDate,
                response_working_days AS responseWorkingDays,
                DATE_FORMAT(deadline_date, '%Y-%m-%d') AS deadlineDate, signer_email AS signerEmail,
                signer_name AS signerName, signature_data AS signature, status,
                issued_at AS issuedAt, overdue_at AS overdueAt
         FROM incident_ntes WHERE incident_id = ? AND (? = 1 OR status = 'ISSUED') LIMIT 1`,
          [id, REVIEW_ROLES.has(user.role) ? 1 : 0]
        ),
        pool.execute(
          `SELECT d.explanation, d.updated_at AS updatedAt
         FROM incident_explanation_drafts d JOIN incident_ntes n ON n.id = d.nte_id
         WHERE n.incident_id = ? AND d.employee_email = ? LIMIT 1`,
          [id, user.email]
        ),
        pool.execute(
          `SELECT id, explanation, source, other_channel AS otherChannel,
                submitted_by AS submittedBy, submitted_at AS submittedAt
         FROM incident_explanations e JOIN incident_ntes n ON n.id = e.nte_id
         WHERE n.incident_id = ? ORDER BY submitted_at, e.id`,
          [id]
        ),
        REVIEW_ROLES.has(user.role)
          ? pool.execute(
              `SELECT previous_deadline AS previousDeadline,
                    extended_deadline AS extendedDeadline, reason,
                    approved_by AS approvedBy, created_at AS createdAt
             FROM incident_deadline_extensions x JOIN incident_ntes n ON n.id = x.nte_id
             WHERE n.incident_id = ? ORDER BY x.created_at, x.id`,
              [id]
            )
          : Promise.resolve([[], []])
      ]);
    nte = nteRows[0] || null;
    if (nte)
      nte.daysRemaining = workingDaysBetween(
        currentManilaDate(),
        nte.deadlineDate
      );
    explanationDraft = draftRows[0] || null;
    explanations = explanationRows;
    extensions = extensionRows;
    const [addendumRows] = await pool.execute(
      `SELECT a.id, a.statement, a.submitted_by AS submittedBy,
              a.submitted_at AS submittedAt
       FROM incident_explanation_addenda a JOIN incident_ntes n ON n.id = a.nte_id
       WHERE n.incident_id = ? ORDER BY a.submitted_at, a.id`,
      [id]
    );
    addenda = addendumRows;
  }
  if (nte) {
    const [[nteEvidence]] = await pool.execute(
      `SELECT id, file_name AS fileName, mime_type AS mimeType, byte_size AS byteSize
       FROM incident_nte_evidence WHERE nte_id = ? ORDER BY id`,
      [nte.id]
    );
    nte.evidence = nteEvidence;
  }
  if (explanations.length) {
    const ids = explanations.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');
    const [files] = await pool.execute(
      `SELECT id, explanation_id AS explanationId, file_name AS fileName,
              mime_type AS mimeType, byte_size AS byteSize
       FROM incident_explanation_evidence WHERE explanation_id IN (${placeholders}) ORDER BY id`,
      ids
    );
    explanations.forEach((row) => {
      row.evidence = files.filter(
        (file) => Number(file.explanationId) === Number(row.id)
      );
    });
  }
  if (explanationDraft) {
    const [draftEvidence] = await pool.execute(
      `SELECT id, file_name AS fileName, mime_type AS mimeType, byte_size AS byteSize
       FROM incident_explanation_draft_evidence WHERE nte_id = (SELECT id FROM incident_ntes WHERE incident_id = ?) ORDER BY id`,
      [id]
    );
    explanationDraft.evidence = draftEvidence;
  }
  if (addenda.length) {
    const ids = addenda.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');
    const [files] = await pool.execute(
      `SELECT id, addendum_id AS addendumId, file_name AS fileName,
              mime_type AS mimeType, byte_size AS byteSize
       FROM incident_explanation_addendum_evidence
       WHERE addendum_id IN (${placeholders}) ORDER BY id`,
      ids
    );
    addenda.forEach((row) => {
      row.evidence = files.filter(
        (file) => Number(file.addendumId) === Number(row.id)
      );
    });
  }
  return {
    ...incident,
    participants,
    signatures,
    evidence,
    activity: REVIEW_ROLES.has(user.role) ? activity : [],
    informationRequests: REVIEW_ROLES.has(user.role)
      ? requests
      : requests.filter(
          (request) =>
            request.recipientEmail.toLowerCase() === user.email.toLowerCase()
        ),
    nte,
    explanationDraft,
    explanations,
    explanationAddenda: addenda,
    deadlineExtensions: extensions,
    canReview: REVIEW_ROLES.has(user.role),
    currentUserName: user.full_name || user.email,
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
            i.reporter_email, i.reported_employee_email, i.assigned_head_email,
            r.recipient_email AS requestRecipient,
            EXISTS (
              SELECT 1 FROM incident_participants p
              JOIN employees pe ON pe.record_id = p.employee_record_id
              WHERE p.incident_id = i.id AND LOWER(pe.personal_email) = LOWER(?)
            ) AS isParticipant
     FROM incident_evidence e
     JOIN incident_reports i ON i.id = e.incident_id
     LEFT JOIN incident_information_requests r ON r.id = e.request_id
     WHERE e.id = ? LIMIT 1`,
    [user.email, id]
  );
  const evidence = rows[0];
  if (!evidence) throw httpError('Evidence file not found.', 404);
  if (
    !REVIEW_ROLES.has(user.role) &&
    ![
      evidence.reporter_email,
      evidence.reported_employee_email,
      evidence.assigned_head_email,
      evidence.requestRecipient
    ].some(
      (email) => email && email.toLowerCase() === user.email.toLowerCase()
    ) &&
    !evidence.isParticipant
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
  await processOverdueIncidentNtes();
  const [[track]] = await pool.execute(
    `SELECT COUNT(*) AS count FROM incident_reports i
     WHERE (i.status = 'PENDING SIGNATURE' AND (
       (i.reported_employee_email = ? AND NOT EXISTS (
         SELECT 1 FROM incident_signatures s
         WHERE s.incident_id = i.id AND s.signatory_role = 'EMPLOYEE'
       )) OR
       (i.assigned_head_email = ? AND NOT EXISTS (
         SELECT 1 FROM incident_signatures s
         WHERE s.incident_id = i.id AND s.signatory_role = 'HEAD'
       )))) OR (i.status = 'NTE ISSUED' AND LOWER(i.reported_employee_email) = LOWER(?))`,
    [user.email, user.email, user.email]
  );
  let review = 0;
  if (REVIEW_ROLES.has(user.role)) {
    const [[row]] = await pool.execute(
      "SELECT COUNT(*) AS count FROM incident_reports WHERE status IN ('SIGNED', 'UNDER_REVIEW', 'UNDER INVESTIGATION', 'NTE ISSUED', 'EXPLANATION SENT', 'EVALUATION', 'DECISION ISSUED')"
    );
    review = Number(row.count);
  }
  return { track: Number(track.count), review };
}

async function listPendingIncidentNotifications(req) {
  const user = await requirePerm(req, 'inbox.read');
  await processOverdueIncidentNtes();
  const [rows] = await pool.execute(
    `SELECT n.id, n.notification_type AS type,
            CASE WHEN n.notification_type = 'CASE_CLOSED' THEN 'incident-history'
                 WHEN n.notification_type = 'HR_REVIEW_READY' OR n.notification_type LIKE 'INFO_DONE_%'
                      OR n.notification_type LIKE 'EXPLANATION_SENT'
                      OR n.notification_type LIKE 'EXPLANATION_ADD_%'
                      OR n.notification_type LIKE 'NTE_OVERDUE%'
                 THEN 'incident-review' ELSE 'incident-track' END AS target,
            n.created_at AS createdAt,
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
  listIncidentsForHistory,
  listIncidentsForReview,
  getIncidentCase,
  getIncidentEvidence,
  signIncidentCase,
  transitionIncident,
  listIncidentCodeProvisions,
  saveIncidentCodeProvision,
  saveIncidentNteDraft,
  issueIncidentNte,
  saveIncidentExplanationDraft,
  submitIncidentExplanation,
  startIncidentEvaluation,
  submitIncidentExplanationAddendum,
  extendIncidentDeadline,
  recordExternalIncidentExplanation,
  processOverdueIncidentNtes,
  listDailyNteReminders,
  getIncidentNteEvidence,
  getIncidentExplanationEvidence,
  getIncidentExplanationDraftEvidence,
  getIncidentExplanationAddendumEvidence,
  listIncidentRequestRecipients,
  requestIncidentInformation,
  addIncidentInvestigationNote,
  respondToIncidentInformation,
  getIncidentBadgeCounts,
  listPendingIncidentNotifications,
  markIncidentNotificationSeen
};
