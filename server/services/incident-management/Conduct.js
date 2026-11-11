const { pool } = require('../../db/database');
const { requirePerm } = require('../../middleware/Auth');
const { httpError } = require('../../utils/HttpError');
const { logAudit } = require('../AuditService');

function isPolicyManager(user) {
  return (
    user.role === 'HR' && (user.perms || []).includes('incidents.coc.manage')
  );
}
async function requirePolicyManager(req) {
  const user = await requirePerm(req, 'incidents.coc.manage');
  if (!isPolicyManager(user))
    throw httpError(
      'Only authorized HR accounts can manage COC policies.',
      403
    );
  return user;
}

const parse = (value) =>
  typeof value === 'string' ? JSON.parse(value) : value;
async function readMatrix(executor = pool) {
  const [[row]] = await executor.execute(
    'SELECT matrix FROM incident_code_policy_draft WHERE id = 1'
  );
  return parse(row.matrix);
}
function matrixActionForOccurrence(matrix, severity, occurrence) {
  const rows = (Array.isArray(matrix) ? matrix : [])
    .filter((row) => row.severity === severity)
    .sort((left, right) => Number(left.occurrence) - Number(right.occurrence));
  return (
    rows.find((row) => Number(row.occurrence) === Number(occurrence)) ||
    rows.filter((row) => Number(row.occurrence) <= Number(occurrence)).at(-1) ||
    null
  );
}
async function getIncidentCodeGuide(req) {
  const user = await requirePerm(req, 'inbox.read');
  return { matrix: await readMatrix(), canManage: isPolicyManager(user) };
}

function normalizeMatrix(input) {
  if (!Array.isArray(input) || !input.length || input.length > 100)
    throw httpError('Enter a corrective action matrix.', 400);
  const keys = new Set();
  const rows = input.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      throw httpError('Enter a valid matrix row.', 400);
    const severity = String(row.severity || ''),
      occurrence = Number(row.occurrence);
    const correctiveAction = String(row.correctiveAction || '').trim();
    if (correctiveAction.length > 191)
      throw httpError(
        'Corrective actions must be 191 characters or fewer.',
        400
      );
    const key = `${severity}:${occurrence}`;
    if (
      !['Light', 'Moderate', 'Grave', 'Intolerable'].includes(severity) ||
      !Number.isInteger(occurrence) ||
      occurrence < 1 ||
      occurrence > 1001 ||
      !correctiveAction ||
      keys.has(key)
    )
      throw httpError(
        'Enter unique, valid severity and occurrence rows with corrective actions.',
        400
      );
    keys.add(key);
    return { severity, occurrence, correctiveAction };
  });
  return rows;
}
async function saveIncidentMatrix(req, matrix) {
  const user = await requirePolicyManager(req);
  const rows = normalizeMatrix(matrix);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      'UPDATE incident_code_policy_draft SET matrix = ?, updated_by = ? WHERE id = 1',
      [JSON.stringify(rows), user.email]
    );
    await logAudit(
      user.email,
      'INCIDENT_MATRIX_UPDATED',
      '1',
      `Corrective action matrix updated: ${rows.length} rows.`,
      connection
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
module.exports = {
  readMatrix,
  matrixActionForOccurrence,
  getIncidentCodeGuide,
  saveIncidentMatrix
};
