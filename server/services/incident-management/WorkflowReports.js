const A = require('./WorkflowAccess');
const { normalizeDate, normalizeTime } = require('./Validation');
const { incidentAccessScope } = require('./Tracking');
const { manilaDate } = require('../../../shared/DateUtils');
const crypto = require('crypto');
async function reporterDetails(db, email) {
  const [[employee]] = await db.execute(
    `SELECT e.record_id, e.record_id AS employeeId, e.name,
      e.emp_no AS employeeNo, e.department, e.position,
      COALESCE(NULLIF(manager.full_name, ''), u.assigned_head_email, '') AS supervisorName
    FROM employees e
    JOIN user_roles u ON LOWER(u.email) = LOWER(e.personal_email) AND u.active = 1
    LEFT JOIN user_roles manager ON manager.email = u.assigned_head_email
    WHERE LOWER(e.personal_email) = LOWER(?) AND e.record_status <> 'Archived'
    LIMIT 1`,
    [email]
  );
  return employee || null;
}
async function context(req) {
  const user = await A.actor(req),
    employee = await reporterDetails(A.pool, user.email);
  return {
    canFile: await A.canFile(A.pool, user),
    reporter: employee,
    dateReported: manilaDate()
  };
}
async function selectedEmployees(db, values, label, excludedEmails = []) {
  const employeeIds = values || [];
  A.assert(
    Array.isArray(employeeIds) && employeeIds.length <= 5,
    `Select no more than five ${label.toLowerCase()}.`
  );
  A.assert(
    new Set(employeeIds.map(String)).size === employeeIds.length,
    `Select each ${label.toLowerCase()} employee only once.`
  );
  const selected = [];
  for (const employeeId of employeeIds) {
    const person = await employee(db, employeeId);
    A.assert(
      !excludedEmails.some((email) => A.same(email, person.email)),
      `This employee is already identified in the report; do not add them under ${label.toLowerCase()}.`
    );
    selected.push({
      employeeId: person.record_id,
      name: person.name,
      email: person.email
    });
  }
  return selected;
}
async function number(db, dateReported) {
  const year = Number(dateReported.slice(0, 4));
  await db.execute(
    'INSERT IGNORE INTO incident_case_sequences (case_year, sequence_value) VALUES (?,0)',
    [year]
  );
  const [[row]] = await db.execute(
    'SELECT sequence_value FROM incident_case_sequences WHERE case_year = ? FOR UPDATE',
    [year]
  );
  const sequence = Number(row.sequence_value) + 1;
  await db.execute(
    'UPDATE incident_case_sequences SET sequence_value = ? WHERE case_year = ?',
    [sequence, year]
  );
  return `IR-${year}-${String(sequence).padStart(5, '0')}`;
}
async function employee(db, employeeId) {
  const [[row]] = await db.execute(
    `SELECT e.record_id, e.name, e.emp_no, e.department, e.position,
    u.email, u.role, u.assigned_head_email, h.full_name AS supervisor_name
    FROM employees e JOIN user_roles u ON LOWER(u.email) = LOWER(e.personal_email) AND u.active = 1
    LEFT JOIN user_roles h ON h.email = u.assigned_head_email
    WHERE e.record_id = ? AND e.record_status <> 'Archived'`,
    [String(employeeId)]
  );
  A.assert(
    row,
    'Select an employee with an active account from the suggestions.'
  );
  return row;
}
async function submit(req, input = {}) {
  const user = await A.actor(req);
  A.assert(
    input && typeof input === 'object' && !Array.isArray(input),
    'Enter valid report details.'
  );
  A.assert(
    await A.canFile(A.pool, user),
    'Your account cannot file Incident Reports.'
  );
  A.assert(
    Array.isArray(input.reports) &&
      input.reports.length > 0 &&
      input.reports.length <= 10,
    'File between 1 and 10 reports in a session.'
  );
  const db = await A.pool.getConnection();
  try {
    await db.beginTransaction();
    const reporter = await reporterDetails(db, user.email);
    A.assert(
      reporter?.department,
      'Your employee record needs a department before you can file.'
    );
    const [group] = await db.execute(
      'INSERT INTO incident_groups (reporter_email, department) VALUES (?,?)',
      [user.email, reporter.department]
    );
    const result = [],
      dateReported = manilaDate();
    let attachmentBytes = 0;
    for (const entry of input.reports) {
      A.assert(
        entry && typeof entry === 'object' && !Array.isArray(entry),
        'Enter valid details for each report.'
      );
      const reported = await employee(db, entry.employeeId);
      const concerned = await employee(db, entry.concernedEmployeeId);
      A.assert(
        !A.same(reported.email, user.email),
        'You cannot file an IR against yourself.'
      );
      const [departmentReviewers] = await db.execute(
        `SELECT d.department, u.email FROM incident_department_reviewers d JOIN user_roles u
        ON u.email = d.reviewer_email AND u.active = 1 AND u.role IN ('HEAD','ADMIN')`
      );
      const departmentHead = departmentReviewers.find((reviewer) =>
        A.sameDepartment(reviewer.department.trim(), reporter.department.trim())
      );
      const reportedDepartmentHead = departmentReviewers.find((reviewer) =>
        A.sameDepartment(
          reviewer.department.trim(),
          reported.department?.trim()
        )
      );
      // A HEAD must not review their own filing against STAFF in their department.
      // Department assignments also identify the departments an ADMIN heads.
      const headFilingInDepartment =
        ['HEAD', 'ADMIN'].includes(user.role) &&
        reported.role === 'STAFF' &&
        (A.sameDepartment(
          reporter.department.trim(),
          reported.department?.trim()
        ) ||
          A.same(reportedDepartmentHead?.email, user.email));
      const headPool =
        ['HEAD', 'ADMIN'].includes(reported.role) || headFilingInDepartment;
      const headEmail = headPool ? null : departmentHead?.email;
      A.assert(
        headPool || headEmail,
        'Assign an incident reviewer for your department in Manage Accounts first.'
      );
      A.assert(
        !headEmail ||
          (!A.same(headEmail, reported.email) &&
            !A.same(headEmail, user.email) &&
            !A.same(headEmail, concerned.email)),
        'The reviewer cannot be the reporter, reported employee, or employee concerned. Update the department assignment first.'
      );
      const what = A.explanation(entry.what, 'What Happened');
      const report = {
        reporter: {
          id: reporter.record_id,
          name: reporter.name,
          employeeNo: reporter.emp_no,
          position: reporter.position,
          department: reporter.department,
          supervisor: reporter.supervisorName || ''
        },
        employee: {
          id: reported.record_id,
          name: reported.name,
          employeeNo: reported.emp_no,
          position: reported.position,
          department: reported.department,
          supervisor:
            reported.supervisor_name || reported.assigned_head_email || ''
        },
        concernedEmployee: {
          employeeId: concerned.record_id,
          name: concerned.name,
          employeeNo: concerned.emp_no,
          position: concerned.position,
          department: concerned.department,
          supervisor:
            concerned.supervisor_name || concerned.assigned_head_email || '',
          email: concerned.email
        },
        title: A.text(what.replace(/\s+/g, ' ').slice(0, 191), 'Incident Summary', true, 191),
        what,
        date: normalizeDate(entry.date, 'incident date'),
        time: normalizeTime(entry.time),
        where: A.text(entry.where, 'Where It Happened', true, 191),
        why: A.explanation(entry.why, 'Relevant Rule, Instruction, Or Duty'),
        how: A.explanation(entry.how, 'Sequence Of Events'),
        involved: [],
        witnesses: []
      };
      report.involved = await selectedEmployees(
        db,
        entry.involved,
        'Others Involved',
        [user.email, reported.email, concerned.email]
      );
      report.witnesses = await selectedEmployees(
        db,
        entry.witnesses,
        'Witnesses'
      );
      A.assert(
        !headEmail ||
          ![
            report.concernedEmployee,
            ...report.involved,
            ...report.witnesses
          ].some((person) => A.same(person.email, headEmail)),
        'The reviewing HEAD cannot be the employee concerned or be listed as involved or a witness. Update the department assignment first.'
      );
      let poolReviewers = [];
      if (headPool) {
        const [admins] = await db.execute(
          `SELECT DISTINCT u.email FROM incident_department_reviewers d JOIN user_roles u
          ON u.email = d.reviewer_email AND u.role = 'ADMIN' AND u.active = 1
          WHERE LOWER(d.department)=LOWER('Heads') AND EXISTS (SELECT 1 FROM employees e WHERE LOWER(e.personal_email) = LOWER(u.email)
          AND e.record_status <> 'Archived')`
        );
        const involved = [
          user.email,
          reported.email,
          concerned.email,
          ...report.involved.map((person) => person.email),
          ...report.witnesses.map((witness) => witness.email)
        ];
        poolReviewers = admins
          .map((admin) => admin.email)
          .filter((email) => !involved.some((person) => A.same(person, email)));
        A.assert(
          poolReviewers.length > 0,
          'Assign an uninvolved ADMIN as a department HEAD before filing this report.'
        );
      }
      const caseNumber = await number(db, dateReported),
        hash = crypto
          .createHash('sha256')
          .update(JSON.stringify(report))
          .digest('hex');
      const [insert] = await db.execute(
        `INSERT INTO incident_reports
        (case_number,reporter_email,reporter_employee_id,reporter_name,department,position,
         reported_employee_id,reported_employee_email,reported_employee_name,assigned_head_email,
         date_reported,subject,incident_date,location,incident_time,description,comments,document_version,status,workflow_version,group_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'IR FILED',2,?)`,
        [
          caseNumber,
          user.email,
          reporter.record_id,
          reporter.name,
          reporter.department,
          reporter.position,
          reported.record_id,
          reported.email,
          reported.name,
          headEmail || null,
          dateReported,
          report.title,
          report.date,
          report.where,
          report.time,
          report.what,
          '',
          hash,
          group.insertId
        ]
      );
      const row = {
        id: insert.insertId,
        status: 'IR FILED',
        reporter_email: user.email,
        reported_employee_email: reported.email,
        assigned_head_email: headEmail
      };
      await db.execute(
        'INSERT INTO incident_workflows (incident_id, report, head_pool) VALUES (?,?,?)',
        [row.id, JSON.stringify(report), headPool ? 1 : 0]
      );
      await db.execute(
        `INSERT INTO incident_case_subjects (incident_id, employee_record_id, employee_email, employee_name, subject_role) VALUES (?,?,?,?,'REPORTED')`,
        [row.id, reported.record_id, reported.email, reported.name]
      );
      for (const [participantType, people] of [
        ['CONCERNED', [report.concernedEmployee]],
        ['INVOLVED', report.involved],
        ['WITNESS', report.witnesses]
      ])
        for (let order = 0; order < people.length; order++) {
          const person = people[order];
          await db.execute(
            'INSERT INTO incident_participants (incident_id,participant_type,employee_record_id,full_name,sort_order) VALUES (?,?,?,?,?)',
            [row.id, participantType, person.employeeId, person.name, order]
          );
        }
      for (const file of entry.files || [])
        attachmentBytes += Buffer.byteLength(
          String(file.dataUrl || '').split(',')[1] || '',
          'base64'
        );
      A.assert(
        attachmentBytes <= 18 * 1024 * 1024,
        'Keep total attachments in this filing session within 18 MB.'
      );
      await A.evidence(db, row, user, entry.files, 2);
      await A.activity(db, row, user, 'IR_SUBMITTED', 'Incident Report filed.');
      const recipients = [
        reported.email,
        concerned.email,
        headEmail,
        ...report.involved.map((person) => person.email),
        ...report.witnesses.map((w) => w.email)
      ];
      recipients.push(...poolReviewers);
      await A.notify(db, row, 'IR_SUBMITTED', user, recipients);
      result.push({ id: row.id, caseNumber });
    }
    await db.execute(
      'UPDATE hr_task_revision SET revision = revision + 1 WHERE id = 1'
    );
    await db.commit();
    return { ok: true, groupId: group.insertId, reports: result };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
const labels = {
  IR_SUBMITTED: 'Incident Report Filed',
  HEAD_TASK_TAKEN: 'HEAD Review Assigned',
  INFORMATION_REQUESTED: 'Information Requested',
  INFORMATION_PROVIDED: 'Information Submitted',
  NTE_ISSUED: 'Notice To Explain Issued',
  NTE_RECEIVED: 'NTE Receipt Acknowledged',
  EXPLANATION_SENT: 'Employee Explanation Submitted',
  EXTENSION_REQUESTED: 'Extension Requested',
  EXTENSION_REVIEWED: 'Extension Reviewed',
  HEARING_SCHEDULED: 'Hearing Scheduled',
  HEARING_COMPLETED: 'Hearing Completed',
  MANAGEMENT_REQUESTED: 'Management Approval Requested',
  MANAGEMENT_APPROVED: 'Management Approved',
  MANAGEMENT_RETURNED: 'Management Returned Recommendation',
  DECISION_ISSUED: 'Final Decision Issued',
  CASE_CLOSED: 'Case Closed'
};
function tracking(row, siblings) {
  const closed = siblings.every((r) => r.status === 'CLOSED'),
    nte = siblings.some((r) => r.nte_issued_at);
  const currentStage = closed ? 'CLOSED' : nte ? 'NTE ISSUED' : 'IR FILED';
  const created = siblings.map((r) => r.created_at).sort()[0];
  const issued = siblings
    .map((r) => r.nte_issued_at)
    .filter(Boolean)
    .sort()[0];
  const ended = closed
    ? siblings
        .map((r) => r.closed_at)
        .filter(Boolean)
        .sort()
        .at(-1)
    : null;
  return {
    currentStage,
    closed,
    completedProcess: closed,
    closureReason: closed ? 'All reports in this case are closed.' : '',
    closedAt: ended,
    stages: [
      ['IR FILED', 'IR Filed', created],
      ['NTE ISSUED', 'NTE Issued', issued],
      ['CLOSED', 'Closed', ended]
    ].map(([key, label, reachedAt], i) => ({
      key,
      label,
      reachedAt: reachedAt || null,
      state:
        key === currentStage
          ? closed
            ? 'completed'
            : 'current'
          : i < ['IR FILED', 'NTE ISSUED', 'CLOSED'].indexOf(currentStage)
            ? reachedAt
              ? 'completed'
              : 'skipped'
            : 'upcoming'
    }))
  };
}
async function view(req, incidentId) {
  const user = await A.actor(req),
    row = await A.load(A.pool, incidentId),
    rights = await A.access(A.pool, user, row);
  const scope = incidentAccessScope(user, 'r');
  const [siblings] = await A.pool.execute(
    `SELECT r.id,r.case_number AS caseNumber,r.subject,r.reported_employee_name AS reportedEmployeeName,r.status,r.created_at,w.nte_issued_at,w.closed_at
    FROM incident_reports r JOIN incident_workflows w ON w.incident_id=r.id WHERE r.group_id=? AND ${scope.sql} ORDER BY r.id`,
    [row.group_id, ...scope.values]
  );
  const [
    [files],
    [requests],
    [events],
    [extensions],
    [managers],
    [progressRows]
  ] = await Promise.all([
    A.pool.execute(
      'SELECT id,file_name AS fileName,mime_type AS mimeType,byte_size AS byteSize,uploaded_by AS uploadedBy,section_number AS sectionNumber,request_id AS requestId FROM incident_evidence WHERE incident_id=? ORDER BY id',
      [row.id]
    ),
    A.pool.execute(
      'SELECT id,section_number AS sectionNumber,requested_by AS requestedBy,recipient_email AS recipientEmail,request_text AS requestText,response_text AS responseText,status,created_at AS createdAt,responded_at AS respondedAt FROM incident_information_requests WHERE incident_id=? ORDER BY id',
      [row.id]
    ),
    A.pool.execute(
      'SELECT action,details,actor_email AS performedBy,created_at AS createdAt,previous_status AS previousStatus,new_status AS newStatus FROM incident_activity WHERE incident_id=? ORDER BY created_at,id',
      [row.id]
    ),
    A.pool.execute(
      'SELECT * FROM incident_extension_requests WHERE incident_id=? ORDER BY id',
      [row.id]
    ),
    A.pool.execute(
      `SELECT DISTINCT u.email,COALESCE(NULLIF(u.full_name,''),u.email) AS name FROM user_roles u
      WHERE u.role='ADMIN' AND u.active=1 AND LOWER(u.email) NOT IN (LOWER(?),LOWER(?))
      AND EXISTS (SELECT 1 FROM employees e WHERE LOWER(e.personal_email)=LOWER(u.email) AND e.record_status<>'Archived')
      AND NOT EXISTS (SELECT 1 FROM incident_participants p JOIN employees pe ON pe.record_id=p.employee_record_id
        WHERE p.incident_id=? AND LOWER(pe.personal_email)=LOWER(u.email)) ORDER BY name`,
      [row.reporter_email, row.reported_employee_email, row.id]
    ),
    A.pool.execute(
      'SELECT r.status,r.created_at,w.nte_issued_at,w.closed_at FROM incident_reports r JOIN incident_workflows w ON w.incident_id=r.id WHERE r.group_id=?',
      [row.group_id]
    )
  ]);
  const visibleRequests = requests.filter(
    (r) =>
      (Number(r.sectionNumber) <= rights.maxSection &&
        (rights.hr || rights.head || rights.manager)) ||
      A.same(r.recipientEmail, user.email)
  );
  const visibleFiles = files.filter((f) =>
    f.requestId
      ? visibleRequests.some((r) => Number(r.id) === Number(f.requestId))
      : Number(f.sectionNumber) <= rights.maxSection &&
        (Number(f.sectionNumber) !== 4 || row.nte_issued_at || rights.head) &&
        (Number(f.sectionNumber) !== 7 ||
          row.explanation_submitted_at ||
          rights.reported)
  );
  const task = rights.hr
    ? await require('../TaskService').taskInfo(A.pool, 'INCIDENT', row.id, user)
    : null;
  const [[settings]] = await A.pool.execute(
    'SELECT management_email FROM incident_workflow_settings WHERE id=1'
  );
  await require('../AuditService').logAudit(
    user.email,
    'READ',
    row.case_number,
    'Viewed section-based Incident Report.'
  );
  return {
    workflowVersion: 2,
    id: Number(row.id),
    groupId: Number(row.group_id),
    caseReference: `CASE-${row.date_reported.slice(0, 4)}-${String(row.group_id).padStart(5, '0')}`,
    caseNumber: row.case_number,
    subject: row.subject,
    status: row.status,
    reporterName: row.reporter_name,
    reporterEmail: row.reporter_email,
    department: row.department,
    reportedEmployeeName: row.reported_employee_name,
    reportedEmployeeEmail: row.reported_employee_email,
    assignedHeadEmail: row.assigned_head_email,
    phase: row.phase,
    createdAt: row.created_at,
    report: row.report,
    nte:
      row.nte_issued_at || rights.head
        ? rights.maxSection >= 6
          ? row.nte
          : {
              policy: row.nte.policy,
              rule: row.nte.rule,
              classification: row.nte.classification,
              otherClassification: row.nte.otherClassification,
              possiblePenalty: row.nte.possiblePenalty,
              evidenceTypes: row.nte.evidenceTypes,
              evidenceDetails: row.nte.evidenceDetails
            }
        : null,
    receipt: rights.maxSection >= 6 ? row.receipt : null,
    explanation: rights.maxSection >= 7 ? row.explanation : null,
    explanationDraft: rights.reported ? row.explanation_draft : null,
    hrReview: rights.maxSection >= 8 ? row.hr_review : null,
    management: rights.maxSection >= 8 ? row.management : null,
    decision:
      rights.reported || rights.head || rights.maxSection >= 8
        ? row.decision
        : null,
    hearingStatus: row.hearing_status,
    hearingDetails: row.hearing_details,
    hearingCompletedAt: row.hearing_completed_at,
    hearingCompletionNotes:
      rights.maxSection >= 8 ? row.hearing_completion_notes : null,
    deadlineDate:
      rights.reported || rights.hr || rights.head || rights.manager
        ? row.deadline_date
        : null,
    daysRemaining: A.remaining(row.deadline_date),
    receivedAt: row.received_at,
    nteIssuedAt: row.nte_issued_at,
    submittedAt: row.explanation_submitted_at,
    closedAt: row.closed_at,
    closureReason: row.closure_reason,
    task,
    rights,
    files: visibleFiles,
    informationRequests: visibleRequests,
    extensions: rights.reported || rights.hr ? extensions : [],
    managers: rights.hr
      ? managers.filter(
          (m) =>
            !A.same(row.report.concernedEmployee?.email, m.email) &&
            !(row.report.involved || []).some((person) =>
              A.same(person.email, m.email)
            ) &&
            !(row.report.witnesses || []).some((w) => A.same(w.email, m.email))
        )
      : [],
    defaultManager: rights.hr ? settings.management_email : null,
    siblings,
    tracking: tracking(row, progressRows),
    timeline: events
      .filter((e) =>
        [
          'IR_SUBMITTED',
          'HEAD_TASK_TAKEN',
          'NTE_ISSUED',
          'NTE_RECEIVED',
          'EXPLANATION_SENT',
          'DECISION_ISSUED',
          'CASE_CLOSED'
        ].includes(e.action)
      )
      .map(({ details, ...event }) => ({
        ...event,
        label: labels[event.action]
      })),
    internalActivity: rights.maxSection >= 8 ? events : [],
    currentUserEmail: user.email,
    currentUserRole: user.role
  };
}
async function evidenceFile(req, evidenceId) {
  const [[file]] = await A.pool.execute(
    'SELECT incident_id,file_name AS fileName,mime_type AS mimeType,file_data AS fileData FROM incident_evidence WHERE id=?',
    [A.id(evidenceId)]
  );
  A.assert(file, 'Evidence file not found.');
  const incident = await view(req, file.incident_id);
  A.assert(
    incident.files.some((f) => Number(f.id) === Number(evidenceId)),
    'You cannot view this attachment.'
  );
  return { ...file, caseNumber: incident.caseNumber };
}
module.exports = { context, submit, view, evidenceFile };
