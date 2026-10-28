const { httpError } = require('../../utils/HttpError');
const { normalizePagination } = require('../../utils/Pagination');
const ACTIVE_CASE_SQL = "incident_reports.status <> 'CLOSED'";
const HR_SIGNED_SQL = `EXISTS (SELECT 1 FROM incident_signatures hr_signature
  WHERE hr_signature.incident_id = incident_reports.id AND hr_signature.signatory_role = 'HR')`;
const GROUP_SQL = {
  ALL: '1 = 1',
  ONGOING: `(${ACTIVE_CASE_SQL} AND ${HR_SIGNED_SQL})`,
  WAITING: `(${ACTIVE_CASE_SQL} AND NOT ${HR_SIGNED_SQL})`,
  CLOSED: "incident_reports.status = 'CLOSED'"
};
const NTE_CASE_SQL =
  "incident_reports.status IN ('NTE ISSUED', 'EXPLANATION SENT', 'EVALUATION')";
const STAGES = new Set([
  'ALL',
  'PENDING SIGNATURE',
  'SIGNED',
  'UNDER_REVIEW',
  'UNDER INVESTIGATION',
  'NTE ISSUED',
  'EXPLANATION SENT',
  'EVALUATION',
  'DECISION ISSUED',
  'CLOSED'
]);

function normalizeReviewFilters(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw httpError('Enter valid case filters.', 400);
  const category = input.category || 'ONGOING';
  const stage = input.stage || 'ALL';
  const search = String(input.search || '').trim();
  const { page, pageSize } = normalizePagination(input, { maxPageSize: 50 });
  if (
    !Object.hasOwn(GROUP_SQL, category) ||
    !STAGES.has(stage) ||
    search.length > 191
  )
    throw httpError('Choose valid case filters and pagination.', 400);
  return { category, stage, search, page, pageSize };
}

function buildReviewFilter(input) {
  const filters = normalizeReviewFilters(input);
  const clauses = [GROUP_SQL[filters.category]];
  const values = [];
  if (filters.stage !== 'ALL') {
    clauses.push('incident_reports.status = ?');
    values.push(filters.stage);
  }
  if (filters.search) {
    const pattern = `%${filters.search.replace(/[!%_]/g, '!$&')}%`;
    clauses.push(`(incident_reports.case_number LIKE ? ESCAPE '!'
      OR incident_reports.reported_employee_name LIKE ? ESCAPE '!'
      OR incident_reports.subject LIKE ? ESCAPE '!'
      OR incident_reports.reporter_name LIKE ? ESCAPE '!')`);
    values.push(...Array(4).fill(pattern));
  }
  return { filters, sql: clauses.join(' AND '), values };
}

module.exports = {
  ACTIVE_CASE_SQL,
  HR_SIGNED_SQL,
  NTE_CASE_SQL,
  buildReviewFilter
};
