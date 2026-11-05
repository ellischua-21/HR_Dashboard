const { pool } = require('../../db/database');
const { requirePerm, requireEmployeeAccess } = require('../../middleware/Auth');
const { httpError } = require('../../utils/HttpError');
const { isValidDate } = require('../../utils/Validation');
const { incidentAccessScope } = require('./Tracking');
const { normalizePagination } = require('../../utils/Pagination');

const CLOSED_AT = `COALESCE((SELECT d.closed_at FROM incident_decisions d
  WHERE d.incident_id = incident_reports.id AND d.status = 'ISSUED'),
  (SELECT MAX(a.created_at) FROM incident_activity a WHERE a.incident_id = incident_reports.id
   AND a.action IN ('CLOSED_FOR_DOCUMENTATION', 'INVESTIGATION_CLOSED', 'DECISION_CASE_CLOSED')))`;
// A reporter or supervisor can see the closure point, without receiving the employee's decision.
const OUTCOME = `CASE WHEN LOWER(incident_reports.reported_employee_email) = LOWER(?)
  THEN COALESCE((SELECT d.outcome FROM incident_decisions d
    WHERE d.incident_id = incident_reports.id AND d.status = 'ISSUED'),
    (SELECT a.action FROM incident_activity a WHERE a.incident_id = incident_reports.id
      AND a.action IN ('CLOSED_FOR_DOCUMENTATION', 'INVESTIGATION_CLOSED') ORDER BY a.id DESC LIMIT 1), 'CLOSED')
  ELSE CASE WHEN EXISTS (SELECT 1 FROM incident_decisions d WHERE d.incident_id = incident_reports.id AND d.status = 'ISSUED')
    THEN 'DECISION ISSUED' ELSE COALESCE((SELECT a.action FROM incident_activity a
    WHERE a.incident_id = incident_reports.id AND a.action IN ('CLOSED_FOR_DOCUMENTATION', 'INVESTIGATION_CLOSED')
    ORDER BY a.id DESC LIMIT 1), 'CLOSED') END END`;
const OUTCOMES = new Set([
  'ALL',
  'NO_VIOLATION',
  'WRITTEN_WARNING',
  'SUSPENSION',
  'TERMINATION',
  'OTHER_CORRECTIVE_ACTION',
  'DECISION ISSUED',
  'CLOSED_FOR_DOCUMENTATION',
  'INVESTIGATION_CLOSED',
  'CLOSED'
]);

function pageInput(input = {}) {
  return normalizePagination(input).page;
}

async function listIncidentsForHistory(req, input = {}) {
  const user = await requirePerm(req, 'inbox.read');
  if (!['STAFF', 'SUPERVISOR', 'HEAD'].includes(user.role))
    throw httpError(
      'History is available to STAFF, SUPERVISOR, and HEAD accounts.',
      403
    );
  const requestedPage = pageInput(input);
  const search = String(input.search || '').trim();
  const caseNumber = String(input.caseNumber || '').trim();
  const outcome = input.outcome || 'ALL';
  if (search.length > 191 || caseNumber.length > 100 || !OUTCOMES.has(outcome))
    throw httpError('Choose valid history filters.', 400);
  const scope = incidentAccessScope(user);
  const clauses = ["status = 'CLOSED'", scope.sql];
  const values = [...scope.values];
  const pattern = (text) => `%${text.replace(/[!%_]/g, '!$&')}%`;
  if (search) {
    clauses.push(
      "(subject LIKE ? ESCAPE '!' OR case_number LIKE ? ESCAPE '!')"
    );
    values.push(pattern(search), pattern(search));
  }
  if (caseNumber) {
    clauses.push("case_number LIKE ? ESCAPE '!'");
    values.push(pattern(caseNumber));
  }
  for (const [key, operator] of [
    ['from', '>='],
    ['to', '<=']
  ]) {
    if (!input[key]) continue;
    if (!isValidDate(input[key]))
      throw httpError('Choose a valid closure date.', 400);
    clauses.push(`DATE(${CLOSED_AT}) ${operator} ?`);
    values.push(input[key]);
  }
  if (input.from && input.to && input.from > input.to)
    throw httpError('The date range is invalid.', 400);
  if (outcome !== 'ALL') {
    clauses.push(`(${OUTCOME}) = ?`);
    values.push(user.email, outcome);
  }
  const where = clauses.join(' AND ');
  const [[counts]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM incident_reports WHERE ${where}`,
    values
  );
  const total = Number(counts.total),
    pages = Math.max(1, Math.ceil(total / 25)),
    page = Math.min(requestedPage, pages);
  const [cases] = await pool.execute(
    `SELECT id, case_number AS caseNumber, subject,
    date_reported AS dateFiled, ${CLOSED_AT} AS closedAt, ${OUTCOME} AS outcome
    FROM incident_reports WHERE ${where} ORDER BY closedAt DESC, id DESC${input.allRows === true ? '' : ` LIMIT 25 OFFSET ${(page - 1) * 25}`}`,
    [user.email, ...values]
  );
  return {
    cases,
    total,
    page: input.allRows === true ? 1 : page,
    pages: input.allRows === true ? 1 : pages
  };
}

async function listIncidentViolations(req, input = {}) {
  const user = await requirePerm(req, 'inbox.read');
  const requestedPage = pageInput(input);
  const email = String(input.employeeEmail || user.email)
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191)
    throw httpError('Enter a valid account email.', 400);
  if (email !== user.email.toLowerCase())
    await requireEmployeeAccess(req, 'emp.read');
  const where = `LOWER(h.employee_email) = LOWER(?) AND d.status = 'ISSUED'
    AND d.outcome <> 'NO_VIOLATION' AND e.finding = 'SUBSTANTIATED'
    AND i.status IN ('DECISION ISSUED', 'CLOSED')`;
  const joins = `FROM incident_disciplinary_history h JOIN incident_decisions d ON d.id = h.decision_id AND d.incident_id = h.incident_id
    JOIN incident_evaluations e ON e.id = d.evaluation_id JOIN incident_reports i ON i.id = h.incident_id`;
  const [[counts]] = await pool.execute(
    `SELECT COUNT(*) AS total ${joins} WHERE ${where}`,
    [email]
  );
  const total = Number(counts.total),
    pages = Math.max(1, Math.ceil(total / 25)),
    page = Math.min(requestedPage, pages);
  const [records] = await pool.execute(
    `SELECT h.incident_id AS incidentId, i.case_number AS caseNumber,
    i.incident_date AS violationDate, h.violation_title AS violationTitle, h.severity,
    e.previous_offenses + 1 AS occurrenceNumber, h.corrective_action AS correctiveAction,
    d.issued_at AS decisionDate, 'Finalized' AS status ${joins} WHERE ${where}
    ORDER BY d.issued_at DESC, h.id DESC${input.allRows === true ? '' : ` LIMIT 25 OFFSET ${(page - 1) * 25}`}`,
    [email]
  );
  return {
    employeeEmail: email,
    records,
    total,
    page: input.allRows === true ? 1 : page,
    pages: input.allRows === true ? 1 : pages
  };
}

module.exports = { listIncidentsForHistory, listIncidentViolations };
