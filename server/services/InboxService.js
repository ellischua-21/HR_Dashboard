const { notificationTitle } = require('./incident-management/Notifications');
const {
  incidentNotificationTarget,
  incidentAccessScope
} = require('./incident-management/Tracking');
const { pool } = require('../db/database');
const { requirePerm } = require('../middleware/Auth');
const FORM_TEMPLATES = require('../../shared/FormTemplates');
const FormStatus = require('../../shared/FormStatus');
const { buildReviewScope } = require('./FormReviewScope');

function formTitle(templateKey) {
  const template = FORM_TEMPLATES.find((item) => item.key === templateKey);
  return template ? template.title : 'Submitted form';
}

async function getInbox(req) {
  const user = await requirePerm(req, 'inbox.read');
  const items = [];

  if (['STAFF', 'SUPERVISOR', 'HEAD', 'HR', 'ADMIN'].includes(user.role)) {
    const [announcements] = await pool.execute(
      `SELECT a.id, a.title, a.message, a.created_at,
              COALESCE(NULLIF(u.full_name, ''), a.created_by) AS created_by_name,
              CASE WHEN v.announcement_id IS NULL THEN 'NEW' ELSE 'PREVIOUS' END AS status
       FROM hr_announcements a
       LEFT JOIN user_roles u ON u.email = a.created_by
       LEFT JOIN announcement_views v
         ON v.announcement_id = a.id AND v.user_email = ?
       WHERE LOWER(a.created_by) <> LOWER(?)
       ORDER BY a.created_at DESC, a.id DESC LIMIT 500`,
      [user.email, user.email]
    );
    announcements.forEach((announcement) => {
      items.push({
        id: `announcement-${announcement.id}`,
        type: 'ANNOUNCEMENT',
        status: announcement.status,
        unseen: announcement.status === 'NEW',
        title: announcement.title,
        message: announcement.message,
        createdAt: announcement.created_at,
        createdBy: announcement.created_by_name,
        announcementId: announcement.id
      });
    });
  }

  const targets = [];
  if (['HR', 'ADMIN'].includes(user.role)) {
    targets.push({ target: 'leave-requests', stage: 'HR' });
  }
  if (
    ['SUPERVISOR', 'HEAD'].includes(user.role) ||
    (user.role === 'HR' && user.is_hr_head)
  ) {
    targets.push({ target: 'leave-requests', stage: 'HEAD' });
  }
  for (const { target, stage } of targets) {
    const reviewScope = buildReviewScope(user, stage);
    const [forms] = await pool.execute(
      `SELECT f.id, f.control_no, f.template_key, f.user_email, f.submitted_at,
              f.status, f.review_stage,
              CASE WHEN v.item_id IS NULL THEN 1 ELSE 0 END AS unseen,
              COALESCE(NULLIF(u.full_name, ''), f.user_email) AS applicant_name
       FROM user_forms f
       LEFT JOIN user_roles u ON u.email = f.user_email
       LEFT JOIN inbox_views v
         ON v.user_email = ? AND v.item_type = 'FORM' AND v.item_id = f.id
       WHERE ${reviewScope.whereSql} AND LOWER(f.user_email) <> LOWER(?)
       ORDER BY f.submitted_at DESC, f.id DESC LIMIT 500`,
      [user.email, ...reviewScope.whereValues, user.email]
    );
    forms.forEach((form) => {
      items.push({
        id: `form-${form.id}`,
        type: 'FORM',
        status: form.status === 'PENDING' ? 'ACTION_REQUIRED' : form.status,
        unseen: Boolean(form.unseen),
        title: `${formTitle(form.template_key)}${form.status === 'PENDING' ? ' requires review' : ' reviewed'}`,
        message: `${form.applicant_name} submitted Serial Number ${form.control_no}.${form.status === 'PENDING' ? '' : ` Status: ${FormStatus.titleCase(form.status)}.`}`,
        createdAt: form.submitted_at,
        formId: form.id,
        controlNo: form.control_no,
        target,
        reviewPermission: 'forms.review'
      });
    });
  }

  const incidentScope = incidentAccessScope(user, 'i');
  const [incidentNotifications] = await pool.execute(
    `SELECT n.id AS notificationId, n.notification_type AS notificationType,
            n.created_at AS createdAt, n.viewed_at AS viewedAt,
            i.id AS incidentId, i.case_number AS caseNumber, i.subject,
            i.reported_employee_name AS reportedEmployeeName,
            i.reported_employee_email AS reportedEmployeeEmail, i.status,
            CASE
              WHEN i.status = 'PENDING SIGNATURE' AND n.notification_type = 'EMPLOYEE_SIGNATURE' AND employee_signature.incident_id IS NULL THEN 1
              WHEN i.status = 'PENDING SIGNATURE' AND n.notification_type = 'HEAD_SIGNATURE' AND head_signature.incident_id IS NULL THEN 1
              ELSE 0
            END AS requiresAction
     FROM incident_notifications n
     JOIN incident_reports i ON i.id = n.incident_id
     LEFT JOIN incident_signatures employee_signature
       ON employee_signature.incident_id = i.id
       AND employee_signature.signatory_role = 'EMPLOYEE'
     LEFT JOIN incident_signatures head_signature
       ON head_signature.incident_id = i.id
       AND head_signature.signatory_role = 'HEAD'
     WHERE n.recipient_email = ? AND ${incidentScope.sql}
       AND NOT EXISTS (
         SELECT 1 FROM incident_activity actor_activity
         WHERE actor_activity.incident_id = i.id
           AND LOWER(actor_activity.actor_email) = LOWER(n.recipient_email)
           AND (
             (n.notification_type = 'INVESTIGATION_STARTED' AND actor_activity.action = 'INVESTIGATION_STARTED') OR
             (n.notification_type = 'HR_REVIEW_STARTED' AND actor_activity.action = 'HR_REVIEW_STARTED') OR
             (n.notification_type = 'HR_REVIEW_READY' AND actor_activity.action = 'SIGNATURES_COMPLETED') OR
             (n.notification_type = 'NTE_ISSUED' AND actor_activity.action = 'NTE_ISSUED') OR
             (n.notification_type = 'EXPLANATION_SENT' AND actor_activity.action IN ('EXPLANATION_SENT', 'EXPLANATION_RECEIVED_EXTERNALLY')) OR
             (n.notification_type = 'EVALUATION_STARTED' AND actor_activity.action = 'EVALUATION_STARTED') OR
             (n.notification_type = 'DECISION_PENDING' AND actor_activity.action = 'EVALUATION_SAVED') OR
             (n.notification_type = 'DECISION_ISSUED' AND actor_activity.action = 'DECISION_ISSUED') OR
             (n.notification_type = 'CASE_CLOSED' AND actor_activity.action IN ('CLOSED_FOR_DOCUMENTATION', 'INVESTIGATION_CLOSED', 'DECISION_CASE_CLOSED')) OR
             (n.notification_type = CONCAT('EVIDENCE_', actor_activity.id) AND actor_activity.action = 'EVIDENCE_SUBMITTED')
           )
       )
     ORDER BY n.created_at DESC, n.id DESC LIMIT 500`,
    [user.email, ...incidentScope.values]
  );
  const signatureCases = new Set(
    incidentNotifications
      .filter((notification) =>
        ['EMPLOYEE_SIGNATURE', 'HEAD_SIGNATURE'].includes(
          notification.notificationType
        )
      )
      .map((notification) => Number(notification.incidentId))
  );
  incidentNotifications.forEach((notification) => {
    const isReportedEmployee =
      notification.reportedEmployeeEmail?.toLowerCase() ===
      user.email.toLowerCase();
    if (
      notification.notificationType === 'IR_SUBMITTED' &&
      signatureCases.has(Number(notification.incidentId))
    )
      return;
    const needsSignature = Boolean(notification.requiresAction);
    const isEmployeeSignature =
      notification.notificationType === 'EMPLOYEE_SIGNATURE' &&
      isReportedEmployee;
    const isHeadSignature = notification.notificationType === 'HEAD_SIGNATURE';
    items.push({
      id: `incident-${notification.notificationId}`,
      type: 'INCIDENT',
      status: needsSignature ? 'ACTION_REQUIRED' : notification.status,
      unseen: !notification.viewedAt,
      title:
        isEmployeeSignature || isHeadSignature
          ? needsSignature
            ? isHeadSignature
              ? 'Incident Report filed. Requires your review and signature'
              : 'Incident Report filed. Requires your acknowledgment and signature'
            : 'Incident Report filed'
          : notificationTitle(notification.notificationType),
      message:
        notification.notificationType === 'NTE_ISSUED'
          ? `${notification.caseNumber} has advanced. Open HRIS to view information available to your account.`
          : `${notification.caseNumber}: ${notification.subject} — ${notification.reportedEmployeeName}`,
      createdAt: notification.createdAt,
      notificationId: notification.notificationId,
      incidentId: notification.incidentId,
      target: incidentNotificationTarget(user.role, notification.status)
    });
  });

  return items.sort(
    (first, second) =>
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
  );
}

async function getInboxNotificationCount(req) {
  const items = await getInbox(req);
  return items.reduce((count, item) => count + (item.unseen ? 1 : 0), 0);
}

async function markInboxSeen(req) {
  const user = await requirePerm(req, 'inbox.read');
  const items = await getInbox(req);
  const announcementIds = items
    .filter((item) => item.type === 'ANNOUNCEMENT')
    .map((item) => Number(item.announcementId));
  const formIds = items
    .filter((item) => item.type === 'FORM')
    .map((item) => Number(item.formId));
  const incidentNotificationIds = items
    .filter((item) => item.type === 'INCIDENT')
    .map((item) => Number(item.notificationId));

  if (announcementIds.length) {
    const placeholders = announcementIds.map(() => '?').join(', ');
    await pool.execute(
      `INSERT IGNORE INTO announcement_views (announcement_id, user_email)
       SELECT id, ? FROM hr_announcements WHERE id IN (${placeholders})`,
      [user.email, ...announcementIds]
    );
  }
  if (formIds.length) {
    const values = formIds.map(() => "(?, 'FORM', ?)").join(', ');
    const params = formIds.flatMap((id) => [user.email, id]);
    await pool.execute(
      `INSERT IGNORE INTO inbox_views (user_email, item_type, item_id) VALUES ${values}`,
      params
    );
  }
  let incidentCount = 0;
  if (incidentNotificationIds.length) {
    const placeholders = incidentNotificationIds.map(() => '?').join(', ');
    const [result] = await pool.execute(
      `UPDATE incident_notifications
       SET viewed_at = COALESCE(viewed_at, CURRENT_TIMESTAMP)
       WHERE recipient_email = ? AND id IN (${placeholders})`,
      [user.email, ...incidentNotificationIds]
    );
    incidentCount = result.affectedRows;
  }
  return {
    ok: true,
    count: announcementIds.length + formIds.length + incidentCount
  };
}

module.exports = { getInbox, getInboxNotificationCount, markInboxSeen };
