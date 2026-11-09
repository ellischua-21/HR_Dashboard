// Original evaluations and decisions remain available as read-only records.
function renderIncidentEvaluation(parent, incident) {
  if (!incident.canViewReview || !incident.evaluation) return;
  const review = incident.evaluation;
  appendIncidentFieldGroup(parent, 'Original HR Evaluation', [
    ['Finding', review.finding],
    ['Findings', review.findings],
    ['Severity', review.severity],
    ['Previous Offenses', String(review.previousOffenses || 0)],
    ['Recommended Corrective Action', review.recommendedAction],
    ['Additional Remarks', review.remarks],
    ['Evaluated By', review.evaluatedBy],
    ['Evaluated On', DateUtils.formatDateTime(review.evaluatedAt)]
  ]);
}
function renderIncidentDecision(parent, incident) {
  if (!incident.decision) return;
  const decision = incident.decision;
  appendIncidentFieldGroup(parent, 'Original Final Decision', [
    ['Outcome', window.IncidentProgress.label(decision.outcome)],
    ['Approved Corrective Action', decision.finalAction],
    ['Findings', decision.decisionReason],
    ['Approved By', decision.approverName],
    ['Issued On', DateUtils.formatDateTime(decision.issuedAt)],
    [
      'Closed On',
      decision.closedAt
        ? DateUtils.formatDateTime(decision.closedAt)
        : 'Not Recorded'
    ]
  ]);
  const view = incidentElement('button', 'ghost', 'View Original Decision');
  view.type = 'button';
  view.onclick = () => {
    const preview = window.open('', '_blank');
    if (!preview) throw new Error('Allow popups to view this document.');
    preview.document.write(createDecisionDocumentHtml(incident, decision));
    preview.document.close();
  };
  parent.appendChild(view);
}
