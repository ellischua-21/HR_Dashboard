const { pool } = require('../../db/database');
const { requirePerm, requireEmployeeAccess } = require('../../middleware/Auth');
const { httpError } = require('../../utils/HttpError');
const { normalizePagination } = require('../../utils/Pagination');

function pageInput(input = {}) {
  return normalizePagination(input).page;
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
    AND (i.status IN ('DECISION ISSUED', 'CLOSED') OR (i.workflow_version = 2 AND EXISTS
      (SELECT 1 FROM incident_workflows w WHERE w.incident_id = i.id AND w.decision_issued_at IS NOT NULL)))`;
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

module.exports = { listIncidentViolations };
