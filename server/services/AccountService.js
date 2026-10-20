const { pool } = require('../db/database');
const { ACCOUNT_ROLE_MAP } = require('../config/Config');
const { requirePerm } = require('../middleware/Auth');
const { logAudit } = require('./AuditService');
const { hashPassword, verifyPassword } = require('../utils/Password');
const { sanitize } = require('../utils/Validation');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateHeadAssignment(accountEmail, accountRole, headEmail, accounts) {
  const ownerEmail = String(accountEmail || '').trim().toLowerCase();
  const assignedEmail = String(headEmail || '').trim().toLowerCase();
  if (!['STAFF', 'HEAD'].includes(accountRole)) {
    return { error: 'Only STAFF and HEAD accounts can be assigned to a Head.' };
  }
  if (!assignedEmail) {
    return accountRole === 'HEAD' ? { headEmail: null } : { error: 'Assign a Head to this STAFF account.' };
  }
  if (ownerEmail === assignedEmail) return { error: 'An account cannot be assigned to itself.' };

  const accountByEmail = new Map(accounts.map(account => [account.email.toLowerCase(), account]));
  const owner = accountByEmail.get(ownerEmail);
  const head = accountByEmail.get(assignedEmail);
  if (!owner || !owner.active) return { error: 'This account is not active.' };
  if (!head || !head.active || head.role !== 'HEAD') {
    return { error: 'Choose an active HEAD account.' };
  }
  return { headEmail: assignedEmail };
}

async function requestAccount(data = {}) {
  const name = sanitize(data.name);
  const email = sanitize(data.email).toLowerCase();
  const password = data.password;

  if (!name || name.length > 191) {
    const error = new Error('Enter your name (up to 191 characters).');
    error.status = 400;
    throw error;
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 191) {
    const error = new Error('Enter a valid email address.');
    error.status = 400;
    throw error;
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    const error = new Error('Password must be between 12 and 128 characters.');
    error.status = 400;
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [accounts] = await connection.execute(
      'SELECT email FROM user_roles WHERE email = ? FOR UPDATE', [email]);
    if (accounts.length) {
      await connection.rollback();
      return { ok: true, message: 'If the address can be registered, the request will appear after review.' };
    }

    const passwordHash = hashPassword(password);
    await connection.execute(
      `INSERT INTO account_requests (full_name, email, password_hash)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), password_hash = VALUES(password_hash), requested_at = CURRENT_TIMESTAMP`,
      [name, email, passwordHash]);
    await connection.commit();
    return { ok: true, message: 'Your account request was submitted for administrator review.' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getAccountManagement(req) {
  await requirePerm(req, 'admin.manage');
  const [requests] = await pool.query(
    'SELECT id, full_name, email, requested_at FROM account_requests ORDER BY requested_at, id');
  const [accounts] = await pool.query(
    `SELECT u.email, u.full_name, u.role, u.active, u.created_at, u.assigned_head_email,
            h.full_name AS assigned_head_name
     FROM user_roles u LEFT JOIN user_roles h ON h.email = u.assigned_head_email
     ORDER BY u.role, u.email`);

  const userAccounts = [];
  const headAccounts = [];
  const hrAccounts = [];
  const adminAccounts = [];
  const availableHeads = [];
  accounts.forEach(account => {
    if (account.role === 'ADMIN') adminAccounts.push(account);
    else if (account.role === 'HR') hrAccounts.push(account);
    else if (account.role === 'HEAD') {
      headAccounts.push(account);
      if (account.active) availableHeads.push({ email: account.email, full_name: account.full_name });
    } else if (account.role === 'STAFF') userAccounts.push(account);
  });

  return {
    requests,
    accounts: {
      users: userAccounts,
      heads: headAccounts,
      hr: hrAccounts,
      admins: adminAccounts
    },
    availableHeads
  };
}

async function assignAccountHead(req, accountEmail, headEmail) {
  const admin = await requirePerm(req, 'admin.manage');
  const normalizedEmail = sanitize(accountEmail).toLowerCase();
  const normalizedHeadEmail = sanitize(headEmail).toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    const error = new Error('Choose a valid account.');
    error.status = 400;
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [accounts] = await connection.query(
      'SELECT email, role, active, assigned_head_email FROM user_roles FOR UPDATE');
    const account = accounts.find(item => item.email.toLowerCase() === normalizedEmail);
    if (!account) throw Object.assign(new Error('This account no longer exists.'), { status: 404 });
    const assignment = validateHeadAssignment(
      normalizedEmail, account.role, normalizedHeadEmail, accounts);
    if (assignment.error) throw Object.assign(new Error(assignment.error), { status: 400 });
    await connection.execute(
      'UPDATE user_roles SET assigned_head_email = ? WHERE email = ?',
      [assignment.headEmail, normalizedEmail]);
    await logAudit(
      admin.email,
      'HEAD_ASSIGNED',
      '',
      `${normalizedEmail} assigned to Head ${assignment.headEmail || 'none'}`,
      connection);
    await connection.commit();
    return { ok: true, email: normalizedEmail, headEmail: assignment.headEmail };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function approveAccountRequest(req, requestId, assignedRole) {
  const admin = await requirePerm(req, 'admin.manage');
  const role = Object.prototype.hasOwnProperty.call(ACCOUNT_ROLE_MAP, assignedRole)
    ? ACCOUNT_ROLE_MAP[assignedRole]
    : null;
  if (!role) {
    const error = new Error('Choose STAFF, HEAD, HR, or ADMIN for the account role.');
    error.status = 400;
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [requests] = await connection.execute(
      'SELECT id, full_name, email, password_hash FROM account_requests WHERE id = ? FOR UPDATE',
      [requestId]);
    if (!requests.length) {
      await connection.rollback();
      const error = new Error('This account request no longer exists.');
      error.status = 404;
      throw error;
    }

    const accountRequest = requests[0];
    await connection.execute(
      `INSERT INTO user_roles (email, full_name, role, active, extra_perms, password_hash)
       VALUES (?, ?, ?, 1, '', ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), role = VALUES(role), active = 1,
         extra_perms = '', password_hash = VALUES(password_hash)`,
      [accountRequest.email, accountRequest.full_name, role, accountRequest.password_hash]);
    await connection.execute('DELETE FROM account_requests WHERE id = ?', [accountRequest.id]);
    await logAudit(
      admin.email, 'ACCOUNT_APPROVED', '', `${accountRequest.email} approved as ${assignedRole} (${role})`, connection);
    await connection.commit();
    return { ok: true, email: accountRequest.email, role: assignedRole };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function rejectAccountRequest(req, requestId) {
  const admin = await requirePerm(req, 'admin.manage');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [requests] = await connection.execute(
      'SELECT id, email FROM account_requests WHERE id = ? FOR UPDATE', [requestId]);
    if (!requests.length) {
      await connection.rollback();
      const error = new Error('This account request no longer exists.');
      error.status = 404;
      throw error;
    }
    await connection.execute('DELETE FROM account_requests WHERE id = ?', [requestId]);
    await logAudit(admin.email, 'ACCOUNT_REJECTED', '', requests[0].email, connection);
    await connection.commit();
    return { ok: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function changeMyPassword(req, currentPassword, newPassword) {
  const user = await requirePerm(req, 'account.password');
  if (typeof currentPassword !== 'string' || !currentPassword) {
    const error = new Error('Enter your current password.');
    error.status = 400;
    throw error;
  }
  if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
    const error = new Error('New password must be between 12 and 128 characters.');
    error.status = 400;
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT password_hash FROM user_roles WHERE email = ? AND active = 1 FOR UPDATE', [user.email]);
    if (!rows.length || !verifyPassword(currentPassword, rows[0].password_hash)) {
      await connection.rollback();
      const error = new Error('Current password is incorrect.');
      error.status = 400;
      throw error;
    }

    await connection.execute(
      'UPDATE user_roles SET password_hash = ? WHERE email = ? AND active = 1',
      [hashPassword(newPassword), user.email]);
    await logAudit(user.email, 'ACCOUNT_PASSWORD_CHANGED', '', 'User changed their password', connection);
    await connection.commit();
    return { ok: true, message: 'Your password has been updated.' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { requestAccount, getAccountManagement, approveAccountRequest, rejectAccountRequest, assignAccountHead, validateHeadAssignment, changeMyPassword };
