const STAGES = [
  ['PENDING SIGNATURE', 'Pending Signature'],
  ['SIGNED', 'Signed'],
  ['UNDER_REVIEW', 'Under Review'],
  ['UNDER INVESTIGATION', 'Under Investigation'],
  ['NTE ISSUED', 'NTE Issued'],
  ['EXPLANATION SENT', 'Explanation Sent'],
  ['EVALUATION', 'Evaluation'],
  ['DECISION ISSUED', 'Decision Issued']
];

function sameEmail(left, right) {
  return Boolean(left && right) && left.toLowerCase() === right.toLowerCase();
}

function canViewIncident(user, incident) {
  if (user.role === 'HR') return true;
  if (!['STAFF', 'SUPERVISOR', 'HEAD', 'ADMIN'].includes(user.role))
    return false;
  return [
    incident.reporterEmail ?? incident.reporter_email,
    incident.reportedEmployeeEmail ?? incident.reported_employee_email,
    incident.assignedHeadEmail ?? incident.assigned_head_email
  ].some((email) => sameEmail(email, user.email));
}

// The same involvement scope is used by the selector, polling and persistent badge.
function incidentAccessScope(user, alias = '') {
  if (alias && !/^[a-z_]+$/i.test(alias))
    throw new Error('Invalid incident table alias.');
  const prefix = `${alias || 'incident_reports'}.`;
  const legacy =
    user.role === 'HR'
      ? { sql: '1 = 1', values: [] }
      : {
          sql: `(LOWER(${prefix}reporter_email) = LOWER(?) OR LOWER(${prefix}reported_employee_email) = LOWER(?) OR LOWER(${prefix}assigned_head_email) = LOWER(?) OR ${prefix}id IN (
      SELECT lp.incident_id FROM incident_participants lp JOIN employees le ON le.record_id = lp.employee_record_id WHERE LOWER(le.personal_email) = LOWER(?)))`,
          values: Array(4).fill(user.email)
        };
  if (['HR', 'ADMIN', 'HEAD', 'SUPERVISOR', 'STAFF'].includes(user.role)) {
    return {
      sql: `((${prefix}workflow_version = 1 AND (${legacy.sql})) OR (${prefix}workflow_version = 2 AND (
        LOWER(${prefix}reporter_email) = LOWER(?) OR LOWER(${prefix}reported_employee_email) = LOWER(?) OR LOWER(${prefix}assigned_head_email) = LOWER(?)
        OR EXISTS (SELECT 1 FROM incident_workflows aw WHERE aw.incident_id = ${prefix}id AND (
          LOWER(aw.management_email) = LOWER(?)
          ${user.role === 'HR' ? 'OR aw.nte_issued_at IS NOT NULL' : ''}
          ${
            user.role === 'ADMIN'
              ? `OR (aw.head_pool = 1 AND ${prefix}assigned_head_email IS NULL AND EXISTS (
            SELECT 1 FROM incident_department_reviewers ad JOIN user_roles au ON au.email = ad.reviewer_email AND au.active = 1 AND au.role = 'ADMIN' WHERE LOWER(ad.department) = LOWER('Heads') AND LOWER(au.email) = LOWER(?)))`
              : ''
          }))
        OR EXISTS (SELECT 1 FROM incident_participants ap JOIN employees ae ON ae.record_id = ap.employee_record_id WHERE ap.incident_id = ${prefix}id AND LOWER(ae.personal_email) = LOWER(?))
        OR EXISTS (SELECT 1 FROM incident_information_requests ar WHERE ar.incident_id = ${prefix}id AND LOWER(ar.recipient_email) = LOWER(?))
      )))`,
      values: [
        ...legacy.values,
        ...Array(4).fill(user.email),
        ...(user.role === 'ADMIN' ? [user.email] : []),
        user.email,
        user.email
      ]
    };
  }
  return { sql: '1 = 0', values: [] };
}

function incidentNotificationTarget(role) {
  return 'incident-track';
}

function buildIncidentTracking(
  incident,
  signatures,
  activity,
  nte,
  explanations,
  decision
) {
  const events = [...activity].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
  const event = (action) => events.find((item) => item.action === action);
  const lastEvent = (actions) =>
    [...events].reverse().find((item) => actions.includes(item.action));
  const byRole = (role) => signatures.find((item) => item.role === role);
  const employee = byRole('EMPLOYEE');
  const headRequired = Boolean(incident.assignedHeadEmail);
  const head = byRole('HEAD');
  const signedAt =
    employee && (!headRequired || head)
      ? [employee.signedAt, ...(headRequired ? [head.signedAt] : [])].sort(
          (a, b) => new Date(b) - new Date(a)
        )[0]
      : null;
  const closure = lastEvent([
    'CLOSED_FOR_DOCUMENTATION',
    'INVESTIGATION_CLOSED',
    'DECISION_CASE_CLOSED'
  ]);
  const decisionAt =
    decision?.issuedAt || event('DECISION_ISSUED')?.createdAt || null;
  const dates = [
    incident.createdAt,
    signedAt,
    byRole('HR')?.signedAt,
    event('INVESTIGATION_STARTED')?.createdAt,
    nte?.issuedAt || event('NTE_ISSUED')?.createdAt,
    explanations[0]?.submittedAt ||
      event('EXPLANATION_SENT')?.createdAt ||
      event('EXPLANATION_RECEIVED_EXTERNALLY')?.createdAt,
    event('EVALUATION_STARTED')?.createdAt,
    decisionAt
  ];
  const closed = incident.status === 'CLOSED';
  const closureStage = decisionAt
    ? 'DECISION ISSUED'
    : closure?.action === 'INVESTIGATION_CLOSED'
      ? 'UNDER INVESTIGATION'
      : closure?.action === 'CLOSED_FOR_DOCUMENTATION'
        ? 'UNDER_REVIEW'
        : null;
  let currentIndex = STAGES.findIndex(
    ([key]) => key === (closed ? closureStage : incident.status)
  );
  if (currentIndex < 0)
    currentIndex = dates.reduce(
      (last, value, index) => (value ? index : last),
      0
    );
  const completedProcess = closed && Boolean(decisionAt);
  return {
    currentStage: STAGES[currentIndex][0],
    closed,
    completedProcess,
    closureStage: closed ? STAGES[currentIndex][0] : null,
    closureReason: closed
      ? completedProcess
        ? 'Decision issued and administrative completion recorded.'
        : closure?.details || 'Case closed.'
      : null,
    closedAt: closed ? decision?.closedAt || closure?.createdAt || null : null,
    stages: STAGES.map(([key, label], index) => ({
      key,
      label,
      reachedAt: dates[index] || null,
      state:
        index === currentIndex
          ? closed
            ? completedProcess
              ? 'completed'
              : 'closed'
            : 'current'
          : index > currentIndex
            ? closed
              ? 'discontinued'
              : 'upcoming'
            : dates[index]
              ? 'completed'
              : 'skipped'
    }))
  };
}

module.exports = {
  canViewIncident,
  incidentNotificationTarget,
  incidentAccessScope,
  buildIncidentTracking
};
