const { httpError } = require('../utils/HttpError');
const { pool } = require('../db/database');
const { isValidDate } = require('../utils/Validation');
const { normalizePagination } = require('../utils/Pagination');

function normalizeAuditDateTime(value, label) {
  if (value === undefined || value === null || value === '') return '';
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ||
    !isValidDate(value.slice(0, 10))
  ) {
    throw httpError(`Enter a valid ${label} date and time.`, 400);
  }
  return value.replace('T', ' ');
}

function normalizeAuditFilters(filters = {}) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    throw httpError('Audit filters must be an object.', 400);
  }
  const from = normalizeAuditDateTime(filters.from, 'start');
  const to = normalizeAuditDateTime(filters.to, 'end');
  const user = String(filters.user || '')
    .trim()
    .toLowerCase();
  if (user.length > 191 || (user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user))) {
    throw httpError('Enter a valid user email address.', 400);
  }
  if (from && to && from > to) {
    throw httpError(
      'The start date and time must be before the end date and time.',
      400
    );
  }

  const conditions = [];
  const values = [];
  if (from) {
    conditions.push('event_time >= ?');
    values.push(`${from}:00`);
  }
  if (to) {
    conditions.push('event_time <= ?');
    values.push(`${to}:59`);
  }
  if (user) {
    conditions.push('user_email = ?');
    values.push(user);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

async function logAudit(
  userEmail,
  action,
  recordId,
  detail,
  connection = pool
) {
  await connection.execute(
    'INSERT INTO audit_logs (user_email, action, record_id, detail) VALUES (?, ?, ?, ?)',
    [
      userEmail || 'unknown',
      action,
      recordId || '',
      String(detail || '').slice(0, 500)
    ]
  );
}

async function getAuditLogs(req, limit, filters) {
  await require('../middleware/Auth').requirePerm(req, 'audit.read');
  const { pageSize: take } = normalizePagination(
    { pageSize: limit ?? 200 },
    {
      defaultPageSize: 200,
      maxPageSize: 1000,
      clampSize: true
    }
  );
  const normalizedFilters = normalizeAuditFilters(filters);
  const [rows] = await pool.execute(
    `SELECT event_time, user_email, action, record_id, detail
     FROM audit_logs ${normalizedFilters.where} ORDER BY id DESC LIMIT ${take}`,
    normalizedFilters.values
  );
  return rows.map((row) => [
    row.event_time,
    row.user_email,
    row.action,
    row.record_id,
    row.detail
  ]);
}

module.exports = { logAudit, getAuditLogs, normalizeAuditFilters };
