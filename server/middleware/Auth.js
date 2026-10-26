const { httpError } = require('../utils/HttpError');
const { ROLE_PERMS } = require('../config/Config');
const { pool } = require('../db/database');
const { logAudit } = require('../services/AuditService');

async function getCurrentUser(req) {
  const email = String(req.session.userEmail || '').trim().toLowerCase();
  if (!email) return null;
  const [rows] = await pool.execute(
    'SELECT email, full_name, role, active, extra_perms, is_hr_head FROM user_roles WHERE email = ? LIMIT 1', [email]);
  const row = rows[0];
  if (!row || !row.active) return null;
  const extra = String(row.extra_perms || '').split(',').map(value => value.trim())
    .filter(value => value && value !== 'forms.head-review');
  const basePermissions = Object.prototype.hasOwnProperty.call(ROLE_PERMS, row.role) ? ROLE_PERMS[row.role] : [];
  const perms = [...basePermissions, ...extra];
  return { email: row.email, full_name: row.full_name, role: row.role, is_hr_head: Boolean(row.is_hr_head), perms };
}

async function requirePerm(req, permission) {
  const user = await getCurrentUser(req);
  if (!user) {
    throw httpError('Access denied: you are not an authorized user.', 401);
  }
  if (!user.perms.includes(permission)) {
    await logAudit(user.email, 'ACCESS_DENIED', '', permission);
    throw httpError('Access denied: insufficient permission.', 403);
  }
  return user;
}

async function getSession(req) {
  const user = await getCurrentUser(req);
  return user ? { email: user.email, full_name: user.full_name, role: user.role, is_hr_head: user.is_hr_head, perms: user.perms } : { error: 'NOT_AUTHORIZED' };
}

module.exports = { getCurrentUser, requirePerm, getSession };
