const A = require('./WorkflowAccess');
const { incidentAccessScope } = require('./Tracking');
const { notificationTitle } = require('./Notifications');
const {
  categoriesForRole,
  categoryForIncident: category
} = require('./Review');
const { isValidDate, manilaDate } = require('../../../shared/DateUtils');
async function rows(req) {
  const user = await A.actor(req),
    scope = incidentAccessScope(user, 'r');
  const [cases] = await A.pool.execute(
    `SELECT r.id,r.case_number AS caseNumber,r.subject,r.reported_employee_name AS reportedEmployeeName,
    r.reported_employee_email AS reportedEmployeeEmail,r.reporter_name AS reporterName,r.reporter_email AS reporterEmail,
    r.assigned_head_email AS assignedHeadEmail,r.date_reported AS dateFiled,r.created_at AS createdAt,r.updated_at AS updatedAt,
    r.status,r.workflow_version AS workflowVersion,r.group_id AS groupId,w.phase,w.head_pool AS headPool,w.management_email AS managementEmail,
    CASE WHEN r.workflow_version=2 AND (LOWER(r.reporter_email)=LOWER(?) OR LOWER(r.reported_employee_email)=LOWER(?) OR
      EXISTS (SELECT 1 FROM incident_participants ip JOIN employees ie ON ie.record_id=ip.employee_record_id
        WHERE ip.incident_id=r.id AND LOWER(ie.personal_email)=LOWER(?))) THEN 1 ELSE 0 END AS userInvolved,
    w.nte_issued_at AS nteIssuedAt,COALESCE(w.closed_at,(SELECT MAX(d.closed_at) FROM incident_decisions d WHERE d.incident_id=r.id),
      (SELECT MAX(a.created_at) FROM incident_activity a WHERE a.incident_id=r.id AND a.action IN ('CLOSED_FOR_DOCUMENTATION','INVESTIGATION_CLOSED','DECISION_CASE_CLOSED'))) AS closedAt,
    JSON_UNQUOTE(JSON_EXTRACT(w.decision,'$.outcome')) AS decisionOutcome,
    w.closure_reason AS closureReason,(SELECT d.outcome FROM incident_decisions d WHERE d.incident_id=r.id AND d.status='ISSUED' ORDER BY d.id DESC LIMIT 1) AS legacyOutcome,
    task.owner_email AS taskOwner,task.id AS taskId,task.state AS taskState,
    w.explanation_submitted_at AS explanationSubmittedAt
    FROM incident_reports r LEFT JOIN incident_workflows w ON w.incident_id=r.id
    LEFT JOIN hr_tasks task ON task.resource_type='INCIDENT' AND task.resource_id=r.id AND task.phase='HR'
    WHERE ${scope.sql} ORDER BY r.created_at DESC,r.id DESC`,
    [user.email, user.email, user.email, ...scope.values]
  );
  return {
    user,
    cases: cases.map((row) => ({
      ...row,
      legacy: Number(row.workflowVersion) !== 2
    }))
  };
}
const archived = (row) => row.legacy || row.status === 'CLOSED';
function publicRow(row) {
  const {
    id,
    caseNumber,
    subject,
    reportedEmployeeName,
    reporterName,
    assignedHeadEmail,
    dateFiled,
    createdAt,
    updatedAt,
    status,
    workflowVersion,
    groupId,
    phase,
    closedAt,
    taskOwner,
    legacy
  } = row;
  return {
    id,
    caseNumber,
    subject,
    reportedEmployeeName,
    reporterName,
    assignedHeadEmail,
    dateFiled,
    createdAt,
    updatedAt,
    status,
    workflowVersion,
    groupId,
    phase,
    closedAt,
    taskOwner,
    legacy
  };
}
async function track(req) {
  return (await rows(req)).cases.map(publicRow);
}
async function review(req, input = {}) {
  const { user, cases } = await rows(req);
  A.assert(
    ['HEAD', 'HR', 'ADMIN'].includes(user.role),
    'This role cannot access Review.'
  );
  const adminHeadReviewer =
    user.role === 'ADMIN' && (await A.adminHeadsReviewer(A.pool, user.email));
  const scoped = cases.filter(
    (row) =>
      row.legacy ||
      (user.role === 'HR'
        ? (Boolean(row.nteIssuedAt) ||
            A.same(row.assignedHeadEmail, user.email)) &&
          !Number(row.userInvolved)
        : A.same(row.assignedHeadEmail, user.email) ||
          A.same(row.managementEmail, user.email) ||
          (adminHeadReviewer && row.headPool && !row.assignedHeadEmail))
  );
  const categories = categoriesForRole(user.role);
  const selected = input.category || 'ALL';
  A.assert(categories.includes(selected), 'Select a valid review filter.');
  const query = String(input.search || '')
    .trim()
    .toLowerCase();
  A.assert(query.length <= 191, 'Search text is too long.');
  const list = scoped.filter(
    (row) =>
      (selected === 'ALL' || category(row, user) === selected) &&
      `${row.caseNumber} ${row.subject} ${row.reportedEmployeeName} ${row.reporterName}`
        .toLowerCase()
        .includes(query)
  );
  const summary = Object.fromEntries(
    categories.map((key) => [
      key,
      key === 'ALL'
        ? scoped.length
        : scoped.filter((row) => category(row, user) === key).length
    ])
  );
  return {
    cases: list.map((row) => ({
      ...publicRow(row),
      canTakeTask:
        user.role === 'HR' &&
        !row.legacy &&
        row.status !== 'CLOSED' &&
        !Number(row.userInvolved) &&
        row.phase === 'HR' &&
        Boolean(row.explanationSubmittedAt && row.taskId) &&
        !row.taskOwner &&
        row.taskState === 'READY'
    })),
    total: list.length,
    categories,
    summary
  };
}
async function history(req, input = {}) {
  const { user, cases } = await rows(req);
  A.assert(
    ['STAFF', 'SUPERVISOR'].includes(user.role),
    'Use the Closed filter in Review for this role.'
  );
  for (const value of [input.from, input.to])
    if (value) A.assert(isValidDate(value), 'Select a valid closure date.');
  A.assert(
    !(input.from && input.to && input.from > input.to),
    'The date range is invalid.'
  );
  const search = String(input.search || '').toLowerCase(),
    number = String(input.caseNumber || '').toLowerCase();
  const result = cases
    .filter(archived)
    .map((row) => ({
      ...publicRow(row),
      outcome: A.same(user.email, row.reportedEmployeeEmail)
        ? row.decisionOutcome || row.legacyOutcome || row.status
        : row.status === 'CLOSED'
          ? 'CLOSED'
          : row.status,
      closedAt: row.closedAt || null
    }))
    .filter(
      (row) =>
        `${row.subject} ${row.caseNumber}`.toLowerCase().includes(search) &&
        row.caseNumber.toLowerCase().includes(number) &&
        (!input.from || row.closedAt?.slice(0, 10) >= input.from) &&
        (!input.to || row.closedAt?.slice(0, 10) <= input.to) &&
        (!input.outcome ||
          input.outcome === 'ALL' ||
          row.outcome === input.outcome)
    );
  return { cases: result, total: result.length, page: 1, pages: 1 };
}
async function badges(req) {
  const user = await A.actor(req),
    scope = incidentAccessScope(user, 'r'),
    values = [];
  let trackSql = ['STAFF', 'SUPERVISOR'].includes(user.role)
      ? '1 = 1'
      : '1 = 0',
    reviewSql = '1 = 0';
  if (user.role === 'HEAD') {
    trackSql = "LOWER(COALESCE(r.assigned_head_email,'')) <> LOWER(?)";
    values.push(user.email);
    reviewSql = 'LOWER(r.assigned_head_email) = LOWER(?)';
    values.push(user.email);
  } else if (user.role === 'HR') {
    reviewSql = `(w.nte_issued_at IS NOT NULL OR LOWER(r.assigned_head_email) = LOWER(?))
      AND LOWER(r.reporter_email) <> LOWER(?) AND LOWER(r.reported_employee_email) <> LOWER(?)
      AND NOT EXISTS (SELECT 1 FROM incident_participants hp JOIN employees he ON he.record_id=hp.employee_record_id
        WHERE hp.incident_id=r.id AND LOWER(he.personal_email)=LOWER(?))`;
    values.push(user.email);
    values.push(user.email, user.email, user.email);
  } else if (user.role === 'ADMIN') {
    const eligible = await A.adminHeadsReviewer(A.pool, user.email);
    reviewSql =
      '(LOWER(r.assigned_head_email)=LOWER(?) OR LOWER(w.management_email)=LOWER(?) OR (w.head_pool=1 AND r.assigned_head_email IS NULL AND ' +
      (eligible ? '1' : '0') +
      '=1))';
    values.push(user.email, user.email);
  }
  const [[counts]] = await A.pool.execute(
    `SELECT COALESCE(SUM(CASE WHEN ${trackSql} THEN 1 ELSE 0 END),0) AS track,
    COALESCE(SUM(CASE WHEN ${reviewSql} THEN 1 ELSE 0 END),0) AS review FROM incident_reports r JOIN incident_workflows w ON w.incident_id=r.id
    WHERE r.workflow_version=2 AND r.status<>'CLOSED' AND ${scope.sql}`,
    [...values, ...scope.values]
  );
  return { track: Number(counts.track), review: Number(counts.review) };
}
async function reminders(req) {
  const user = await A.actor(req),
    today = manilaDate();
  const [cases] = await A.pool.execute(
    `SELECT r.id AS incidentId,r.case_number AS caseNumber,r.subject,w.deadline_date AS deadlineDate
    FROM incident_reports r JOIN incident_workflows w ON w.incident_id=r.id
    WHERE r.workflow_version=2 AND r.status='NTE ISSUED' AND w.phase='EMPLOYEE' AND LOWER(r.reported_employee_email)=LOWER(?)`,
    [user.email]
  );
  const result = [];
  for (const row of cases) {
    const [insert] = await A.pool.execute(
      'INSERT IGNORE INTO incident_workflow_reminders (incident_id,employee_email,reminder_date) VALUES (?,?,?)',
      [row.incidentId, user.email, today]
    );
    if (insert.affectedRows)
      result.push({
        ...row,
        daysRemaining: A.remaining(row.deadlineDate),
        dueToday: row.deadlineDate === today,
        overdueAt: row.deadlineDate && row.deadlineDate < today ? today : null
      });
  }
  return result;
}
async function overdue() {
  const db = await A.pool.getConnection();
  try {
    await db.beginTransaction();
    const [cases] = await db.execute(
      `SELECT r.id,r.status,r.reported_employee_email FROM incident_reports r JOIN incident_workflows w ON w.incident_id=r.id
      WHERE r.workflow_version=2 AND w.phase='EMPLOYEE' AND w.deadline_date<? AND r.status<>'CLOSED' FOR UPDATE`,
      [manilaDate()]
    );
    const recipients = await A.reviewers(db);
    for (const row of cases)
      await A.notify(db, row, 'NTE_OVERDUE', { email: 'SYSTEM' }, recipients);
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
async function popups(req) {
  const user = await A.actor(req),
    scope = incidentAccessScope(user, 'r');
  const [rows] = await A.pool.execute(
    `SELECT n.id,n.notification_type AS type,n.created_at AS createdAt,r.id AS incidentId,r.case_number AS caseNumber,
    r.subject,r.status,r.reported_employee_name AS reportedEmployeeName,q.request_text AS requestText
    FROM incident_notifications n JOIN incident_reports r ON r.id=n.incident_id
    LEFT JOIN incident_information_requests q ON n.notification_type=CONCAT('INFO_REQ_',q.id) AND q.incident_id=r.id
    WHERE r.workflow_version=2 AND LOWER(n.recipient_email)=LOWER(?) AND n.viewed_at IS NULL AND ${scope.sql}
      AND ((n.notification_type='DECISION_ISSUED' AND LOWER(r.reported_employee_email)=LOWER(?))
      OR (q.status='PENDING' AND LOWER(q.recipient_email)=LOWER(?))) ORDER BY n.id`,
    [user.email, ...scope.values, user.email, user.email]
  );
  return rows.map((row) => ({
    ...row,
    title: notificationTitle(row.type),
    target: 'incident-track'
  }));
}
module.exports = { track, review, history, badges, reminders, overdue, popups };
