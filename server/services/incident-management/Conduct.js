const { pool } = require('../../db/database');
const { requirePerm } = require('../../middleware/Auth');
const { httpError } = require('../../utils/HttpError');
const { isValidDate } = require('../../utils/Validation');
const { manilaDate: today } = require('../../../shared/DateUtils');

function isPolicyManager(user) {
  return (
    ['HR', 'ADMIN'].includes(user.role) &&
    (user.perms || []).includes('incidents.coc.manage')
  );
}
async function requirePolicyManager(req) {
  const user = await requirePerm(req, 'incidents.coc.manage');
  if (!isPolicyManager(user))
    throw httpError(
      'Only authorized HR and ADMIN accounts can manage COC policies.',
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
    snapshot, approved_by AS approvedBy, approved_at AS approvedAt, pdf_name AS pdfName
    FROM incident_code_policies WHERE effective_date <= ? ORDER BY effective_date DESC, id DESC LIMIT 1`,
    [today()]
  );
  return row ? { ...row, snapshot: parse(row.snapshot) } : null;
}
async function draftMatrix(executor = pool) {
  const [[row]] = await executor.execute(
    'SELECT matrix FROM incident_code_policy_draft WHERE id = 1'
  );
  return parse(row.matrix);
}
async function getIncidentCodeGuide(req, selectedId = null) {
  const user = await requirePerm(req, 'inbox.read');
  const canManage = isPolicyManager(user);
  let policy;
  if (selectedId) {
    const id = Number(selectedId);
    if (!Number.isSafeInteger(id) || id < 1)
      throw httpError('Choose a valid policy version.', 400);
    const [[row]] = await pool.execute(
      `SELECT id, version, effective_date AS effectiveDate, snapshot,
      approved_by AS approvedBy, approved_at AS approvedAt, pdf_name AS pdfName FROM incident_code_policies
      WHERE id = ? AND (effective_date <= ? OR ? = 1)`,
      [id, today(), Number(canManage)]
    );
    if (!row) throw httpError('Policy version not found.', 404);
    policy = { ...row, snapshot: parse(row.snapshot) };
  } else policy = await currentPolicy();
  const [versions] = await pool.execute(
    `SELECT id, version, effective_date AS effectiveDate
    FROM incident_code_policies WHERE effective_date <= ? OR ? = 1 ORDER BY effective_date DESC, id DESC`,
    [today(), Number(canManage)]
  );
  const draft =
    canManage || !policy
      ? { provisions: await readCodeProvisions(), matrix: await draftMatrix() }
      : null;
  return {
    policy: policy ? { ...policy, snapshot: undefined } : null,
    provisions: policy ? policy.snapshot.provisions : draft.provisions,
    matrix: policy ? policy.snapshot.matrix : draft.matrix,
    versions,
    draft: canManage ? draft : null,
    canManage
  };
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
    const key = `${severity}:${occurrence}`;
    if (
      !['Light', 'Moderate', 'Grave', 'Intolerable'].includes(severity) ||
      !Number.isInteger(occurrence) ||
      occurrence < 1 ||
      occurrence > 1001 ||
      !correctiveAction ||
      correctiveAction.length > 1000 ||
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
async function saveIncidentPolicyDraft(req, matrix) {
  const user = await requirePolicyManager(req);
  await pool.execute(
    'UPDATE incident_code_policy_draft SET matrix = ?, updated_by = ? WHERE id = 1',
    [JSON.stringify(normalizeMatrix(matrix)), user.email]
  );
  return { ok: true };
}
async function publishIncidentPolicy(req, input = {}) {
  const user = await requirePolicyManager(req);
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw httpError('Enter valid policy details.', 400);
  const version = String(input.version || '').trim();
  if (
    !version ||
    version.length > 100 ||
    !isValidDate(input.effectiveDate) ||
    input.approved !== true
  )
    throw httpError(
      'Enter a version, effective date, and confirm policy approval.',
      400
    );
  const matrix = normalizeMatrix(input.matrix);
  let pdf = null,
    pdfName = null;
  if (input.pdf) {
    const value = String(input.pdf.dataUrl || '');
    if (!/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(value))
      throw httpError('Upload a PDF document.', 400);
    pdf = Buffer.from(value.split(',')[1], 'base64');
    if (
      !pdf.length ||
      pdf.length > 4 * 1024 * 1024 ||
      pdf.subarray(0, 5).toString() !== '%PDF-'
    )
      throw httpError('Upload a valid PDF up to 4 MB.', 400);
    pdfName = String(input.pdf.fileName || 'Code of Conduct.pdf')
      .replace(/[^a-zA-Z0-9 ._()-]/g, '_')
      .slice(0, 191);
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const provisions = await readCodeProvisions(connection);
    const [result] = await connection.execute(
      `INSERT INTO incident_code_policies
      (version, effective_date, snapshot, approved_by, pdf_name, pdf_data) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        version,
        input.effectiveDate,
        JSON.stringify({ provisions, matrix }),
        user.email,
        pdfName,
        pdf
      ]
    );
    await connection.execute(
      'UPDATE incident_code_policy_draft SET matrix = ?, updated_by = ? WHERE id = 1',
      [JSON.stringify(matrix), user.email]
    );
    await connection.commit();
    return { ok: true, id: result.insertId };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY')
      throw httpError(
        'This policy version already exists. Use a new version.',
        409
      );
    throw error;
  } finally {
    connection.release();
  }
}
async function getIncidentPolicyPdf(req, policyId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(policyId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid policy version.', 400);
  const [[row]] = await pool.execute(
    `SELECT pdf_name AS fileName, pdf_data AS fileData FROM incident_code_policies
    WHERE id = ? AND (effective_date <= ? OR ? = 1)`,
    [id, today(), Number(isPolicyManager(user))]
  );
  if (!row?.fileData)
    throw httpError('No approved PDF is attached to this version.', 404);
  return {
    fileName: row.fileName,
    dataUrl: `data:application/pdf;base64,${row.fileData.toString('base64')}`
  };
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
  readCodeProvisions,
  getIncidentCodeGuide,
  saveIncidentPolicyDraft,
  publishIncidentPolicy,
  getIncidentPolicyPdf,
  snapshotCasePolicy
};
