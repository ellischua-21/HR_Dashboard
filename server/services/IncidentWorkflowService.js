// Public facade: current workflow commands and read-only legacy document access.
const legacy = require('./IncidentService');
const A = require('./incident-management/WorkflowAccess');
const reports = require('./incident-management/WorkflowReports');
const actions = require('./incident-management/WorkflowActions');
const queries = require('./incident-management/WorkflowQueries');
const configuration = require('./incident-management/WorkflowConfiguration');
async function legacyAccess(req, id) {
  const user = await A.actor(req),
    scope = require('./incident-management/Tracking').incidentAccessScope(
      user,
      'r'
    );
  const [[row]] = await A.pool.execute(
    `SELECT r.id FROM incident_reports r WHERE r.id=? AND ${scope.sql}`,
    [A.id(id), ...scope.values]
  );
  A.assert(
    row,
    'This legacy record is not assigned or otherwise available to your account.'
  );
}
async function version(id) {
  const [[row]] = await A.pool.execute(
    'SELECT workflow_version FROM incident_reports WHERE id=?',
    [A.id(id)]
  );
  A.assert(row, 'Incident Report not found.');
  return Number(row.workflow_version);
}
async function getIncidentCase(req, id) {
  if ((await version(id)) === 2) return reports.view(req, id);
  await legacyAccess(req, id);
  const row = await legacy.getIncidentCase(req, id);
  return {
    ...row,
    legacy: true,
    task: null,
    canManageTask: false,
    canReview: false
  };
}
async function getIncidentEvidence(req, id) {
  const [[row]] = await A.pool.execute(
    'SELECT incident_id FROM incident_evidence WHERE id=?',
    [A.id(id)]
  );
  A.assert(row, 'Evidence file not found.');
  if ((await version(row.incident_id)) === 2)
    return reports.evidenceFile(req, id);
  await legacyAccess(req, row.incident_id);
  return legacy.getIncidentEvidence(req, id);
}
function legacyAttachment(method, join) {
  return async (req, id) => {
    const [[row]] = await A.pool.execute(
      `SELECT n.incident_id FROM ${join} WHERE f.id=?`,
      [A.id(id)]
    );
    A.assert(row, 'Legacy attachment not found.');
    await legacyAccess(req, row.incident_id);
    return legacy[method](req, id);
  };
}
async function searchIncidentEmployees(req, query, purpose) {
  const user = await A.actor(req);
  if (purpose === 'violation-history')
    await require('../middleware/Auth').requireEmployeeAccess(req, 'emp.read');
  else
    A.assert(
      await A.canFile(A.pool, user),
      'Your account cannot file Incident Reports.'
    );
  const term = A.text(String(query || ''), 'Search', false, 100)
    .toLowerCase()
    .replace(/[!%_]/g, '!$&');
  if (term.length < 2) return [];
  const [rows] = await A.pool.execute(
    `SELECT e.record_id AS employeeId,e.personal_email AS email,e.name,e.emp_no AS employeeNo,e.department,e.position,h.full_name AS supervisorName
    FROM employees e JOIN user_roles u ON LOWER(u.email)=LOWER(e.personal_email) AND u.active=1
    LEFT JOIN user_roles h ON h.email=u.assigned_head_email
    WHERE e.record_status<>'Archived' AND (LOWER(e.name) LIKE ? ESCAPE '!' OR LOWER(e.emp_no) LIKE ? ESCAPE '!' OR LOWER(e.personal_email) LIKE ? ESCAPE '!') ORDER BY e.name LIMIT 15`,
    Array(3).fill(`%${term}%`)
  );
  return rows;
}
const retired = async () => {
  throw require('../utils/HttpError').httpError(
    'This action belongs to the retired incident workflow. Refresh the page; legacy records are read-only.',
    409
  );
};
async function getIncidentTrackingVersion(req, id) {
  if ((await version(id)) !== 2)
    return legacy.getIncidentTrackingVersion(req, id);
  const user = await A.actor(req),
    row = await A.load(A.pool, id);
  await A.access(A.pool, user, row);
  const [[revision]] = await A.pool.execute(
    `SELECT COALESCE(SUM(w.revision),0) AS revision,
    COALESCE(MAX(t.updated_ms),0) AS taskRevision FROM incident_reports r JOIN incident_workflows w ON w.incident_id=r.id
    LEFT JOIN hr_tasks t ON t.resource_type='INCIDENT' AND t.resource_id=r.id WHERE r.group_id=?`,
    [row.group_id]
  );
  return { version: `${revision.revision}:${revision.taskRevision}` };
}
module.exports = {
  ...legacy,
  getIncidentCase,
  getIncidentEvidence,
  searchIncidentEmployees,
  getIncidentTrackingVersion,
  getIncidentNteEvidence: legacyAttachment(
    'getIncidentNteEvidence',
    'incident_nte_evidence f JOIN incident_ntes n ON n.id=f.nte_id'
  ),
  getIncidentExplanationEvidence: legacyAttachment(
    'getIncidentExplanationEvidence',
    'incident_explanation_evidence f JOIN incident_explanations e ON e.id=f.explanation_id JOIN incident_ntes n ON n.id=e.nte_id'
  ),
  getIncidentExplanationDraftEvidence: legacyAttachment(
    'getIncidentExplanationDraftEvidence',
    'incident_explanation_draft_evidence f JOIN incident_ntes n ON n.id=f.nte_id'
  ),
  getIncidentExplanationAddendumEvidence: legacyAttachment(
    'getIncidentExplanationAddendumEvidence',
    'incident_explanation_addendum_evidence f JOIN incident_explanation_addenda e ON e.id=f.addendum_id JOIN incident_ntes n ON n.id=e.nte_id'
  ),
  getIncidentFileContext: reports.context,
  submitIncidentReport: retired,
  listIncidentsForTrack: queries.track,
  listIncidentsForReview: queries.review,
  getIncidentReviewDashboard: queries.review,
  listIncidentsForHistory: queries.history,
  getIncidentBadgeCounts: queries.badges,
  listDailyNteReminders: queries.reminders,
  processOverdueIncidentNtes: queries.overdue,
  listPendingIncidentNotifications: queries.popups,
  signIncidentCase: retired,
  transitionIncident: retired,
  saveIncidentNteDraft: retired,
  issueIncidentNte: retired,
  saveIncidentExplanationDraft: retired,
  submitIncidentExplanation: retired,
  startIncidentEvaluation: retired,
  saveIncidentEvaluation: retired,
  issueIncidentDecision: retired,
  closeIncidentDecision: retired,
  submitIncidentExplanationAddendum: retired,
  requestIncidentInformation: retired,
  requestIncidentInformationBatch: retired,
  addIncidentInvestigationNote: retired,
  respondToIncidentInformation: retired,
  listIncidentRequestRecipients: retired,
  getIncidentWorkflowConfiguration: configuration.get,
  saveIncidentWorkflowConfiguration: configuration.save,
  submitIncidentGroup: reports.submit,
  incidentWorkflowAction: async (req, id, action, input = {}) => {
    A.assert(
      input && typeof input === 'object' && !Array.isArray(input),
      'Enter valid incident details.'
    );
    const routes = {
      TAKE_HEAD: actions.takeHead,
      SAVE_NTE: actions.saveNte,
      ISSUE_NTE: (req, id, data) => actions.saveNte(req, id, data, true),
      ACKNOWLEDGE: actions.acknowledge,
      SAVE_EXPLANATION: actions.explanation,
      SUBMIT_EXPLANATION: (req, id, data) =>
        actions.explanation(req, id, data, true),
      REQUEST_INFORMATION: actions.requestInformation,
      RESPOND: actions.respond,
      REQUEST_EXTENSION: actions.requestExtension,
      REVIEW_EXTENSION: actions.reviewExtension,
      HEARING: actions.hearing,
      SAVE_REVIEW: actions.saveReview,
      SEND_APPROVAL: (req, id, data) => actions.saveReview(req, id, data, true),
      MANAGEMENT: actions.management,
      ISSUE_DECISION: actions.issueDecision,
      REVISE_REVIEW: actions.revise,
      CLOSE: actions.close
    };
    A.assert(Object.hasOwn(routes, action), 'Choose a valid incident action.');
    return routes[action](req, id, input);
  },
  getIncidentCorrectiveAction: actions.suggest
};
