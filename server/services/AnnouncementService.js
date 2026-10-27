const { httpError } = require('../utils/HttpError');
const { pool } = require('../db/database');
const { requirePerm } = require('../middleware/Auth');
const { logAudit } = require('./AuditService');

function normalizeAnnouncementText(value, label, maxLength) {
  if (typeof value !== 'string') {
    throw httpError(`Enter an announcement ${label}.`, 400);
  }
  const text = value.trim().replace(/[<>]/g, '');
  if (!text || text.length > maxLength) {
    throw httpError(
      `Announcement ${label} must be between 1 and ${maxLength} characters.`,
      400
    );
  }
  return text;
}

async function createAnnouncement(req, title, message) {
  const user = await requirePerm(req, 'announcements.manage');
  const cleanTitle = normalizeAnnouncementText(title, 'title', 160);
  const cleanMessage = normalizeAnnouncementText(message, 'message', 5000);
  const [result] = await pool.execute(
    'INSERT INTO hr_announcements (title, message, created_by) VALUES (?, ?, ?)',
    [cleanTitle, cleanMessage, user.email]
  );
  await logAudit(
    user.email,
    'ANNOUNCEMENT_CREATED',
    String(result.insertId),
    cleanTitle
  );
  return { ok: true, id: result.insertId };
}

async function listAnnouncementsForManagement(req) {
  await requirePerm(req, 'announcements.manage');
  const [rows] = await pool.query(
    `SELECT a.id, a.title, a.message, a.created_by, a.created_at,
            COALESCE(NULLIF(u.full_name, ''), a.created_by) AS created_by_name
     FROM hr_announcements a
     LEFT JOIN user_roles u ON u.email = a.created_by
     ORDER BY a.created_at DESC, a.id DESC LIMIT 500`
  );
  return rows;
}

async function listUnseenAnnouncements(req) {
  const user = await requirePerm(req, 'announcements.read');
  if (!['STAFF', 'HEAD'].includes(user.role)) {
    throw httpError(
      'Only STAFF and HEAD accounts can read announcements.',
      403
    );
  }
  const [rows] = await pool.execute(
    `SELECT a.id, a.title, a.message, a.created_by, a.created_at,
            COALESCE(NULLIF(u.full_name, ''), a.created_by) AS created_by_name
     FROM hr_announcements a
     LEFT JOIN user_roles u ON u.email = a.created_by
     LEFT JOIN announcement_views v
       ON v.announcement_id = a.id AND v.user_email = ?
     WHERE v.announcement_id IS NULL
     ORDER BY a.created_at ASC, a.id ASC LIMIT 500`,
    [user.email]
  );
  return rows;
}

async function markAnnouncementsSeen(req, announcementIds) {
  const user = await requirePerm(req, 'announcements.read');
  if (!['STAFF', 'HEAD'].includes(user.role)) {
    throw httpError(
      'Only STAFF and HEAD accounts can acknowledge announcements.',
      403
    );
  }
  if (
    !Array.isArray(announcementIds) ||
    announcementIds.length > 500 ||
    announcementIds.some(
      (id) => !Number.isSafeInteger(Number(id)) || Number(id) < 1
    )
  ) {
    throw httpError('Choose valid announcements to acknowledge.', 400);
  }
  const ids = [...new Set(announcementIds.map(Number))];
  if (!ids.length) return { ok: true, count: 0 };
  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await pool.execute(
    `INSERT IGNORE INTO announcement_views (announcement_id, user_email)
     SELECT id, ? FROM hr_announcements WHERE id IN (${placeholders})`,
    [user.email, ...ids]
  );
  return { ok: true, count: result.affectedRows };
}

module.exports = {
  normalizeAnnouncementText,
  createAnnouncement,
  listAnnouncementsForManagement,
  listUnseenAnnouncements,
  markAnnouncementsSeen
};
