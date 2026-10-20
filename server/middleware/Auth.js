const { ROLE_PERMS } = require('../config/Config');
const { pool } = require('../db/database');
const { logAudit } = require('../services/AuditService');

async function getCurrentUser(req) {
  const email = String(req.session.userEmail || '').trim().toLowerCase();
  if (!email) return null;
  const [rows] = await pool.execute(
    'SELECT email, full_name, role, active, extra_perms FROM user_roles WHERE email = ? LIMIT 1', [email]);
  const row = rows[0];
  if (!row || !row.active) return null;
  const extra = String(row.extra_perms || '').split(',').map(value => value.trim()).filter(Boolean);
  const basePermissions = Object.prototype.hasOwnProperty.call(ROLE_PERMS, row.role) ? ROLE_PERMS[row.role] : [];
  return { email: row.email, full_name: row.full_name, role: row.role, perms: [...basePermissions, ...extra] };
}

async function requirePerm(req, permission) {
  const user = await getCurrentUser(req);
  if (!user) {
    const error = new Error('Access denied: you are not an authorized user.');
    error.status = 401;
    throw error;
  }
  if (!user.perms.includes(permission)) {
    await logAudit(user.email, 'ACCESS_DENIED', '', permission);
    const error = new Error('Access denied: insufficient permission.');
    error.status = 403;
    throw error;
  }
  return user;
}

async function getSession(req) {
  const user = await getCurrentUser(req);
  return user ? { email: user.email, full_name: user.full_name, role: user.role, perms: user.perms } : { error: 'NOT_AUTHORIZED' };
}

module.exports = { getCurrentUser, requirePerm, getSession };
