const { pool } = require('../../db/database');
const { requirePerm } = require('../../middleware/Auth');
const { httpError } = require('../../utils/HttpError');
const { manilaDate: today } = require('../../../shared/DateUtils');

function isPolicyManager(user) {
  return (
    user.role === 'HR' &&
    (user.perms || []).includes('incidents.coc.manage')
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

async function readCodeProvisions(executor = pool) {
  const [provisions] =
    await executor.execute(`SELECT id, provision_code AS code, title, description
    FROM incident_code_provisions WHERE active = 1 ORDER BY provision_code, title`);
  const [rules] =
    await executor.execute(`SELECT r.id, r.provision_id AS provisionId,
    r.violation_title AS violationTitle, r.severity, r.occurrence_scope AS occurrenceScope,
    r.occurrence_window_days AS occurrenceWindowDays FROM incident_code_rules r
    JOIN incident_code_provisions p ON p.id = r.provision_id WHERE r.active = 1 AND p.active = 1
    ORDER BY p.provision_code, r.violation_title`);
  const [actions] =
    await executor.execute(`SELECT id, rule_id AS ruleId, prior_offenses AS priorOffenses,
    decision_type AS decisionType, corrective_action AS correctiveAction, details
    FROM incident_code_rule_actions ORDER BY prior_offenses, id`);
  return provisions.map((p) => ({
    ...p,
    rules: rules
      .filter((r) => Number(r.provisionId) === Number(p.id))
      .map((r) => ({
        ...r,
        actions: actions.filter((a) => Number(a.ruleId) === Number(r.id))
      }))
  }));
}

const parse = (value) =>
  typeof value === 'string' ? JSON.parse(value) : value;
async function currentPolicy(executor = pool) {
  const [[row]] = await executor.execute(
    `SELECT id, version, effective_date AS effectiveDate,
    snapshot, approved_by AS approvedBy, approved_at AS approvedAt
    FROM incident_code_policies WHERE effective_date <= ? ORDER BY effective_date DESC, id DESC LIMIT 1`,
    [today()]
  );
  return row ? { ...row, snapshot: parse(row.snapshot) } : null;
}
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
  await pool.execute(
    'UPDATE incident_code_policy_draft SET matrix = ?, updated_by = ? WHERE id = 1',
    [JSON.stringify(normalizeMatrix(matrix)), user.email]
  );
  return { ok: true };
}
// Capture the actual configuration used, even when it is an unpublished revision.
// Finalized documents cannot call this path: their existing workflow guards reject edits.
async function snapshotCasePolicy(
  connection,
  incidentId,
  documentType,
  provisionId
) {
  const allProvisions = await readCodeProvisions(connection);
  const provisions = allProvisions.filter(
    (provision) => Number(provision.id) === Number(provisionId)
  );
  const approved = await currentPolicy(connection);
  const matchingVersion =
    approved &&
    JSON.stringify(
      approved.snapshot.provisions.filter(
        (provision) => Number(provision.id) === Number(provisionId)
      )
    ) === JSON.stringify(provisions)
      ? approved
      : null;
  const snapshot = {
    version: matchingVersion?.version || null,
    effectiveDate: matchingVersion?.effectiveDate || null,
    provisions
  };
  await connection.execute(
    `INSERT INTO incident_document_policies (incident_id, document_type, policy_id, snapshot)
    VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE policy_id = VALUES(policy_id), snapshot = VALUES(snapshot), captured_at = CURRENT_TIMESTAMP`,
    [
      incidentId,
      documentType,
      matchingVersion?.id || null,
      JSON.stringify(snapshot)
    ]
  );
}

module.exports = {
  readMatrix,
  matrixActionForOccurrence,
  getIncidentCodeGuide,
  saveIncidentMatrix,
  snapshotCasePolicy
};
