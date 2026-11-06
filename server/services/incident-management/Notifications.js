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
  if (type.startsWith('TASK_')) return 'Incident review assigned to you';
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
async function notifyAccount(
  connection,
  incidentId,
  recipient,
  type,
  actorEmail
) {
  if (
    !recipient ||
    (actorEmail && recipient.toLowerCase() === actorEmail.toLowerCase())
  )
    return;
  await connection.execute(
    `INSERT IGNORE INTO incident_notifications
     (incident_id, recipient_email, notification_type) VALUES (?, ?, ?)`,
    [incidentId, recipient, type]
  );
}

async function notifyReviewers(connection, incidentId, type, actorEmail) {
  const excludeActor = actorEmail ? ' AND LOWER(email) <> LOWER(?)' : '';
  await connection.execute(
    `INSERT IGNORE INTO incident_notifications (incident_id, recipient_email, notification_type)
     SELECT ?, email, ? FROM user_roles WHERE active = 1 AND role IN ('HR', 'ADMIN')${excludeActor}`,
    [incidentId, type, ...(actorEmail ? [actorEmail] : [])]
  );
}

module.exports = { notificationTitle, notifyAccount, notifyReviewers };
