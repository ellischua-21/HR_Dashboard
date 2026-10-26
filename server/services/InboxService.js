const { pool } = require('../db/database');
const { requirePerm } = require('../middleware/Auth');
const FORM_TEMPLATES = require('../../shared/FormTemplates');
const FormStatus = require('../../shared/FormStatus');
const { buildReviewScope } = require('./FormReviewScope');

function formTitle(templateKey) {
  const template = FORM_TEMPLATES.find(item => item.key === templateKey);
  return template ? template.title : 'Submitted form';
}

async function getInbox(req) {
  const user = await requirePerm(req, 'inbox.read');
  const items = [];

  if (['STAFF', 'HEAD'].includes(user.role)) {
    const [announcements] = await pool.execute(
      `SELECT a.id, a.title, a.message, a.created_at,
              COALESCE(NULLIF(u.full_name, ''), a.created_by) AS created_by_name,
              CASE WHEN v.announcement_id IS NULL THEN 'NEW' ELSE 'PREVIOUS' END AS status
       FROM hr_announcements a
       LEFT JOIN user_roles u ON u.email = a.created_by
       LEFT JOIN announcement_views v
         ON v.announcement_id = a.id AND v.user_email = ?
       ORDER BY a.created_at DESC, a.id DESC LIMIT 500`,
      [user.email]);
    announcements.forEach(announcement => {
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
  if (user.role === 'HEAD' || (user.role === 'HR' && user.is_hr_head)) {
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
       WHERE ${reviewScope.whereSql}
       ORDER BY f.submitted_at DESC, f.id DESC LIMIT 500`,
      [user.email, ...reviewScope.whereValues]);
    forms.forEach(form => {
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

  return items.sort((first, second) =>
    new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
}

async function getInboxNotificationCount(req) {
  const items = await getInbox(req);
  return items.reduce((count, item) => count + (item.unseen ? 1 : 0), 0);
}

async function markInboxSeen(req) {
  const user = await requirePerm(req, 'inbox.read');
  const items = await getInbox(req);
  const announcementIds = items.filter(item => item.type === 'ANNOUNCEMENT').map(item => Number(item.announcementId));
  const formIds = items.filter(item => item.type === 'FORM').map(item => Number(item.formId));

  if (announcementIds.length) {
    const placeholders = announcementIds.map(() => '?').join(', ');
    await pool.execute(
      `INSERT IGNORE INTO announcement_views (announcement_id, user_email)
       SELECT id, ? FROM hr_announcements WHERE id IN (${placeholders})`,
      [user.email, ...announcementIds]);
  }
  if (formIds.length) {
    const values = formIds.map(() => "(?, 'FORM', ?)").join(', ');
    const params = formIds.flatMap(id => [user.email, id]);
    await pool.execute(
      `INSERT IGNORE INTO inbox_views (user_email, item_type, item_id) VALUES ${values}`,
      params);
  }
  return { ok: true, count: announcementIds.length + formIds.length };
}

module.exports = { getInbox, getInboxNotificationCount, markInboxSeen };
