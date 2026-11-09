const { pool } = require('../../db/database');
const { requirePerm } = require('../../middleware/Auth');
const { httpError } = require('../../utils/HttpError');
const { normalizeText, normalizeEvidence } = require('./Validation');
const { notifyAccount } = require('./Notifications');
const { manilaDate } = require('../../../shared/DateUtils');
const { hasSufficientExplanation } = require('../../../shared/FormValidation');

const same = (a, b) => Boolean(a && b) && a.toLowerCase() === b.toLowerCase();
const sameDepartment = (a, b) =>
  Boolean(a && b) &&
  a.toLowerCase().replace(/[^a-z0-9]/g, '') ===
    b.toLowerCase().replace(/[^a-z0-9]/g, '');
const json = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
const text = (value, label, required = true, max = 12000) =>
  normalizeText(value, label, max, required);
function explanation(value, label) {
  const clean = text(value, label);
  if (!hasSufficientExplanation(clean))
    throw httpError('Insufficient explanation.', 400);
  return clean;
}
const id = (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw httpError('Choose a valid Incident Report.', 400);
  return number;
};
const now = () => new Date().toISOString();
const calendarDays = (date, days) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
const remaining = (date) =>
  date
    ? Math.ceil(
        (Date.parse(`${date}T00:00:00Z`) -
          Date.parse(`${manilaDate()}T00:00:00Z`)) /
          86400000
      )
    : null;
async function actor(req) {
  return requirePerm(req, 'inbox.read');
}
async function adminHead(db, email) {
  const [[row]] = await db.execute(
    `SELECT 1 FROM incident_department_reviewers d
    JOIN user_roles u ON u.email = d.reviewer_email AND u.role = 'ADMIN' AND u.active = 1
    WHERE LOWER(u.email) = LOWER(?) LIMIT 1`,
    [email]
  );
  return Boolean(row);
}
async function adminHeadsReviewer(db, email) {
  const [[row]] = await db.execute(
    `SELECT 1 FROM incident_department_reviewers d
    JOIN user_roles u ON u.email = d.reviewer_email AND u.role = 'ADMIN' AND u.active = 1
    WHERE LOWER(d.department) = LOWER('Heads') AND LOWER(u.email) = LOWER(?) LIMIT 1`,
    [email]
  );
  return Boolean(row);
}
async function canFile(db, user) {
  return (
    ['SUPERVISOR', 'HEAD'].includes(user.role) ||
    (user.role === 'HR' && user.is_hr_head) ||
    (user.role === 'ADMIN' && (await adminHead(db, user.email)))
  );
}
async function load(db, incidentId, lock = false) {
  const [[row]] = await db.execute(
    `SELECT r.*, w.report, w.nte, w.receipt, w.explanation,
    w.explanation_draft, w.hr_review, w.management, w.decision, w.phase, w.head_pool,
    w.nte_issued_at, w.received_at, w.deadline_date, w.explanation_submitted_at,
    w.hearing_status, w.hearing_details, w.hearing_completed_at, w.hearing_completion_notes, w.management_email, w.approved_at,
    w.decision_issued_at, w.closed_at, w.closure_reason, w.revision
    FROM incident_reports r JOIN incident_workflows w ON w.incident_id = r.id
    WHERE r.id = ? AND r.workflow_version = 2${lock ? ' FOR UPDATE' : ''}`,
    [id(incidentId)]
  );
  if (!row)
    throw httpError(
      'This report is unavailable or is a read-only legacy record.',
      404
    );
  for (const key of [
    'report',
    'nte',
    'receipt',
    'explanation',
    'explanation_draft',
    'hr_review',
    'management',
    'decision'
  ])
    row[key] = json(row[key]);
  return row;
}
async function access(db, user, row) {
  const reported = same(user.email, row.reported_employee_email);
  const reporter = same(user.email, row.reporter_email);
  const assigned = same(user.email, row.assigned_head_email);
  const manager = same(user.email, row.management_email);
  const [[participant]] = await db.execute(
    `SELECT 1 FROM incident_participants p JOIN employees e ON e.record_id = p.employee_record_id
    WHERE p.incident_id = ? AND LOWER(e.personal_email) = LOWER(?) LIMIT 1`,
    [row.id, user.email]
  );
  const [[requested]] = await db.execute(
    'SELECT 1 FROM incident_information_requests WHERE incident_id = ? AND LOWER(recipient_email) = LOWER(?) LIMIT 1',
    [row.id, user.email]
  );
  const poolReviewer =
    user.role === 'ADMIN' &&
    Boolean(row.head_pool) &&
    !row.assigned_head_email &&
    (await adminHeadsReviewer(db, user.email)) &&
    !reported &&
    !reporter &&
    !participant;
  const hr =
    user.role === 'HR' &&
    Boolean(row.nte_issued_at) &&
    !reported &&
    !reporter &&
    !participant;
  const visible =
    reported ||
    reporter ||
    assigned ||
    manager ||
    poolReviewer ||
    hr ||
    Boolean(participant || requested);
  if (!visible)
    throw httpError('You do not have access to this Incident Report.', 403);
  return {
    reported,
    reporter,
    assigned,
    manager,
    poolReviewer,
    hr,
    head:
      assigned &&
      !reported &&
      !reporter &&
      !participant &&
      ['HEAD', 'ADMIN'].includes(user.role),
    maxSection:
      hr || manager || (user.role === 'ADMIN' && assigned)
        ? 8
        : reported || assigned
          ? 7
          : 4
  };
}
function assert(
  condition,
  message = 'This action is not available at the current stage.'
) {
  if (!condition) throw httpError(message, 409);
}
async function pending(db, incidentId) {
  const [[row]] = await db.execute(
    "SELECT COUNT(*) AS count FROM incident_information_requests WHERE incident_id = ? AND status = 'PENDING'",
    [incidentId]
  );
  return Number(row.count) > 0;
}
async function activity(
  db,
  row,
  user,
  action,
  details = '',
  status = row.status
) {
  row.lastAction = action;
  const [result] = await db.execute(
    `INSERT INTO incident_activity
    (incident_id, action, details, actor_email, previous_status, new_status, document_reference)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      action,
      details,
      user.email,
      row.status,
      status,
      row.lastDocumentReference || null
    ]
  );
  if (status !== row.status) {
    await db.execute('UPDATE incident_reports SET status = ? WHERE id = ?', [
      status,
      row.id
    ]);
    row.status = status;
  }
  return result.insertId;
}
async function notify(db, row, type, user, recipients) {
  for (const email of new Set(recipients.filter(Boolean)))
    await notifyAccount(db, row.id, email, type, user.email);
}
async function reviewers(db) {
  const [rows] = await db.execute(
    "SELECT email FROM user_roles WHERE active = 1 AND role = 'HR'"
  );
  return rows.map((row) => row.email);
}
async function evidence(db, row, user, files, section, requestId = null) {
  for (const file of normalizeEvidence(files || []))
    await db.execute(
      `INSERT INTO incident_evidence
    (incident_id, request_id, file_name, mime_type, byte_size, file_data, uploaded_by, section_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        requestId,
        file.fileName,
        file.mimeType,
        file.fileData.length,
        file.fileData,
        user.email,
        section
      ]
    );
}
async function document(db, row, user, type, snapshot) {
  const [result] = await db.execute(
    'INSERT INTO incident_workflow_documents (incident_id,document_type,snapshot,recorded_by) VALUES (?,?,?,?)',
    [row.id, type, JSON.stringify(snapshot), user.email]
  );
  row.lastDocumentReference = `${type}:${result.insertId}`;
  return result.insertId;
}
async function mutate(req, incidentId, fn) {
  const user = await actor(req),
    db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const row = await load(db, incidentId, true),
      rights = await access(db, user, row);
    assert(row.status !== 'CLOSED', 'This report is closed and read-only.');
    const result = await fn(db, row, user, rights);
    await db.execute(
      'UPDATE incident_workflows SET revision = revision + 1 WHERE incident_id = ?',
      [row.id]
    );
    await db.execute(
      'UPDATE incident_reports SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [row.id]
    );
    await require('../TaskService').sync(
      db,
      'INCIDENT',
      row.id,
      user.email,
      row.lastAction || ''
    );
    await db.execute(
      'UPDATE hr_task_revision SET revision = revision + 1 WHERE id = 1'
    );
    await db.commit();
    return { ok: true, incidentId: Number(row.id), ...result };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
module.exports = {
  pool,
  same,
  sameDepartment,
  json,
  text,
  explanation,
  id,
  now,
  calendarDays,
  remaining,
  actor,
  adminHead,
  adminHeadsReviewer,
  canFile,
  load,
  access,
  assert,
  pending,
  activity,
  notify,
  reviewers,
  evidence,
  document,
  mutate
};
