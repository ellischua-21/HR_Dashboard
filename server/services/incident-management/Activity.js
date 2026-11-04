const PUBLIC_ACTIONS = {
  IR_CREATED: 'Incident Report created',
  IR_SUBMITTED: 'Incident Report submitted',
  EMPLOYEE_SIGNATURE_REQUESTED: 'Employee acknowledgment requested',
  HEAD_SIGNATURE_REQUESTED: 'Assigned Head acknowledgment requested',
  EMPLOYEE_SIGNED: 'Employee signed',
  HEAD_SIGNED: 'Assigned Head signed',
  HR_SIGNED: 'HR signed',
  SIGNATURES_COMPLETED: 'Required signatures completed',
  HR_REVIEW_STARTED: 'HR review started',
  INVESTIGATION_STARTED: 'Investigation started',
  INFORMATION_REQUESTED: 'Additional evidence requested',
  INFORMATION_PROVIDED: 'Additional evidence received',
  EVIDENCE_SUBMITTED: 'Supporting evidence submitted',
  NTE_ISSUED: 'Notice to Explain issued',
  NTE_RECEIVED: 'NTE receipt documented',
  EXPLANATION_SENT: 'Employee explanation submitted',
  EXPLANATION_ADDENDUM: 'Additional employee statement submitted',
  EXPLANATION_RECEIVED_EXTERNALLY:
    'Explanation recorded through an authorized channel',
  DEADLINE_EXTENDED: 'Explanation deadline extended',
  EXPLANATION_OVERDUE: 'Explanation response overdue',
  EVALUATION_STARTED: 'Evaluation started',
  DECISION_APPROVED: 'Final decision approved',
  DECISION_ISSUED: 'Final decision issued',
  CLOSED_FOR_DOCUMENTATION: 'Case closed for documentation',
  INVESTIGATION_CLOSED: 'Case closed after investigation',
  DECISION_CASE_CLOSED: 'Case closed'
};
const TARGET_STATUS = {
  IR_CREATED: 'PENDING SIGNATURE',
  IR_SUBMITTED: 'PENDING SIGNATURE',
  SIGNATURES_COMPLETED: 'SIGNED',
  HR_REVIEW_STARTED: 'UNDER_REVIEW',
  INVESTIGATION_STARTED: 'UNDER INVESTIGATION',
  NTE_ISSUED: 'NTE ISSUED',
  EXPLANATION_SENT: 'EXPLANATION SENT',
  EXPLANATION_RECEIVED_EXTERNALLY: 'EXPLANATION SENT',
  EVALUATION_STARTED: 'EVALUATION',
  DECISION_ISSUED: 'DECISION ISSUED',
  CLOSED_FOR_DOCUMENTATION: 'CLOSED',
  INVESTIGATION_CLOSED: 'CLOSED',
  DECISION_CASE_CLOSED: 'CLOSED'
};

function publicTimeline(incident, activity, signatures) {
  const signatureFor = (role) =>
    signatures.find((signature) => signature.role === role);
  const headRequired = Boolean(incident.assignedHeadEmail);
  const lastRequiredSignature = signatures
    .filter((signature) =>
      ['EMPLOYEE', ...(headRequired ? ['HEAD'] : [])].includes(signature.role)
    )
    .sort(
      (left, right) => new Date(right.signedAt) - new Date(left.signedAt)
    )[0];
  const signerByAction = {
    EMPLOYEE_SIGNED: signatureFor('EMPLOYEE')?.signerEmail,
    HEAD_SIGNED: signatureFor('HEAD')?.signerEmail,
    HR_SIGNED: signatureFor('HR')?.signerEmail,
    SIGNATURES_COMPLETED: lastRequiredSignature?.signerEmail
  };
  // Descriptions come from an allowlist, never from confidential internal remarks.
  const timeline = activity
    .filter((entry) => PUBLIC_ACTIONS[entry.action])
    .map((entry) => ({
      action: entry.action,
      label:
        incident.assignedReviewerRole === 'SUPERVISOR' &&
        ['HEAD_SIGNATURE_REQUESTED', 'HEAD_SIGNED'].includes(entry.action)
          ? PUBLIC_ACTIONS[entry.action].replace('Head', 'Supervisor')
          : PUBLIC_ACTIONS[entry.action],
      performedBy: signerByAction[entry.action] || entry.actorEmail,
      createdAt: entry.createdAt,
      previousStatus: entry.previousStatus || null,
      newStatus: entry.newStatus || null
    }));
  // Older cases retain their actual recorded dates; no historical timestamps are guessed.
  if (!timeline.some((entry) => entry.action === 'IR_SUBMITTED'))
    timeline.push({
      action: 'IR_SUBMITTED',
      label: PUBLIC_ACTIONS.IR_SUBMITTED,
      performedBy: incident.reporterEmail,
      createdAt: incident.createdAt,
      previousStatus: null,
      newStatus: 'PENDING SIGNATURE'
    });
  for (const signature of signatures) {
    const action = `${signature.role}_SIGNED`;
    if (!timeline.some((entry) => entry.action === action))
      timeline.push({
        action,
        label:
          incident.assignedReviewerRole === 'SUPERVISOR' &&
          action === 'HEAD_SIGNED'
            ? PUBLIC_ACTIONS[action].replace('Head', 'Supervisor')
            : PUBLIC_ACTIONS[action],
        performedBy: signature.signerEmail,
        createdAt: signature.signedAt,
        previousStatus: null,
        newStatus: null
      });
  }
  return timeline.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}
module.exports = { PUBLIC_ACTIONS, TARGET_STATUS, publicTimeline };
