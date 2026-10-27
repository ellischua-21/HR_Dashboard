function notificationTitle(type) {
  const titles = {
    EMPLOYEE_SIGNATURE: 'Incident Report requires your acknowledgment',
    HEAD_SIGNATURE: 'Incident Report requires your review and signature',
    IR_SUBMITTED: 'Incident Report filed',
    HR_REVIEW_READY: 'Required signatures completed',
    HR_REVIEW_STARTED: 'HR review started',
    INVESTIGATION_STARTED: 'Incident investigation started',
    NTE_ISSUED: 'Notice to Explain issued',
    EXPLANATION_SENT: 'Employee explanation submitted',
    EVALUATION_STARTED: 'Incident evaluation started',
    DECISION_PENDING: 'Incident evaluation ready for final decision',
    DECISION_ISSUED: 'Incident decision issued',
    CASE_CLOSED: 'Incident case closed'
  };
  if (titles[type]) return titles[type];
  if (type.startsWith('NTE_DUE_'))
    return 'NTE explanation deadline approaching';
  if (type.startsWith('NTE_OVERDUE')) return 'NTE explanation is overdue';
  if (type.startsWith('NTE_EXT_')) return 'NTE explanation deadline updated';
  if (type.startsWith('EXPLANATION_ADD_'))
    return 'Employee additional statement submitted';
  if (type.startsWith('INFO_REQ_'))
    return 'Additional incident evidence requested';
  if (type.startsWith('INFO_DONE_') || type.startsWith('EVIDENCE_'))
    return 'Additional incident evidence received';
  return 'Incident Report updated';
}
module.exports = { notificationTitle };
