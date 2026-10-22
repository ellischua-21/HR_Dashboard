const { pool } = require('../db/database');
const { requirePerm } = require('../middleware/Auth');
const FORM_TEMPLATES = require('../../shared/FormTemplates');

const FORM_REVIEW_TARGETS = {
  HEAD: 'head-forms',
  HR: 'leave-requests',
  ADMIN: 'leave-requests'
};

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
        title: announcement.title,
        message: announcement.message,
        createdAt: announcement.created_at,
        createdBy: announcement.created_by_name,
        announcementId: announcement.id
      });
    });
  }

  const reviewTarget = FORM_REVIEW_TARGETS[user.role];
  if (reviewTarget) {
    const isHead = user.role === 'HEAD';
    const [forms] = await pool.execute(
      `SELECT f.id, f.control_no, f.template_key, f.user_email, f.submitted_at,
              COALESCE(NULLIF(u.full_name, ''), f.user_email) AS applicant_name
       FROM user_forms f
       LEFT JOIN user_roles u ON u.email = f.user_email
       WHERE f.status = 'PENDING'
         AND f.review_stage = ?
         ${isHead ? 'AND f.head_reviewer_email = ?' : ''}
       ORDER BY f.submitted_at DESC, f.id DESC LIMIT 500`,
      isHead ? ['HEAD', user.email] : ['HR']);
    forms.forEach(form => {
      items.push({
        id: `form-${form.id}`,
        type: 'FORM',
        status: 'ACTION_REQUIRED',
        title: `${formTitle(form.template_key)} requires review`,
        message: `${form.applicant_name} submitted Serial Number ${form.control_no}.`,
        createdAt: form.submitted_at,
        formId: form.id,
        controlNo: form.control_no,
        target: reviewTarget
      });
    });
  }

  return items.sort((first, second) =>
    new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
}

module.exports = { getInbox };
