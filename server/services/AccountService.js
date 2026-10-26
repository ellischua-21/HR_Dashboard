const { pool } = require('../db/database');
const { httpError } = require('../utils/HttpError');
const { ACCOUNT_ROLE_MAP } = require('../config/Config');
const { requirePerm } = require('../middleware/Auth');
const { logAudit } = require('./AuditService');
const { hashPassword, verifyPassword } = require('../utils/Password');
const { sanitize } = require('../utils/Validation');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function reassignOrRejectPendingHrForms(connection, oldHeadEmail, newHeadEmail, errorMessage) {
  if (newHeadEmail) {
    await connection.execute(
      `UPDATE user_forms f
       INNER JOIN user_roles submitter ON submitter.email = f.user_email
       SET f.head_reviewer_email = ?
       WHERE f.status = 'PENDING' AND f.review_stage = 'HEAD'
         AND f.head_reviewer_email = ? AND submitter.role = 'HR'`,
      [newHeadEmail, oldHeadEmail]
    );
    return;
  }

  const [[pending]] = await connection.execute(
    `SELECT COUNT(*) AS total FROM user_forms f
     INNER JOIN user_roles submitter ON submitter.email = f.user_email
     WHERE f.status = 'PENDING' AND f.review_stage = 'HEAD'
       AND f.head_reviewer_email = ? AND submitter.role = 'HR'`,
    [oldHeadEmail]
  );
  if (Number(pending.total)) throw httpError(errorMessage, 409);
}

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

async function listAssignableHeads(req) {
  const user = await requirePerm(req, 'emp.write');
  if (!['HR', 'ADMIN'].includes(user.role)) {
    throw httpError('Only HR and ADMIN can assign a Head during employee registration.', 403);
  }
  const [rows] = await pool.query(
    `SELECT email, full_name, 'ACTIVE' AS assignment_status
     FROM user_roles WHERE role = 'HEAD' AND active = 1
     UNION ALL
     SELECT email, full_name, 'PENDING' AS assignment_status
     FROM account_requests WHERE assigned_role = 'HEAD'
       AND email NOT IN (SELECT email FROM user_roles)
     ORDER BY full_name, email`);
  return rows;
}

async function createEmployeeAccountRequest(req, employee, accountData, connection) {
  const user = await requirePerm(req, 'emp.write');
  if (!['HR', 'ADMIN'].includes(user.role)) {
    throw httpError('Only HR and ADMIN can create account requests.', 403);
  }
  const role = String(accountData && accountData.role || '').trim().toUpperCase();
  const assignedHeadEmail = sanitize(accountData && accountData.assignedHeadEmail).toLowerCase() || null;
  const password = accountData && accountData.password;
  const email = sanitize(employee.personal_email).toLowerCase();
  const name = sanitize(employee.name);
  if (!['STAFF', 'HEAD', 'HR'].includes(role)) {
    throw httpError('Choose STAFF, HEAD, or HR for the account role.', 400);
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 191) {
    throw httpError('Enter a valid Personal Email to create an account.', 400);
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw httpError('Initial password must be between 12 and 128 characters.', 400);
  }
  if (role === 'STAFF' && !assignedHeadEmail) {
    throw httpError('Assign a Head to this STAFF account using Reports To.', 400);
  }
  if (role !== 'STAFF' && role !== 'HEAD' && assignedHeadEmail) {
    throw httpError('Only STAFF and HEAD accounts can be assigned to a Head.', 400);
  }
  if (assignedHeadEmail) {
    const [headRows] = await connection.execute(
      `SELECT email FROM user_roles WHERE email = ? AND role = 'HEAD' AND active = 1
       UNION
       SELECT email FROM account_requests WHERE email = ? AND assigned_role = 'HEAD'`,
      [assignedHeadEmail, assignedHeadEmail]);
    if (!headRows.length || assignedHeadEmail === email) {
      throw httpError('Choose another active or pending HEAD account in Reports To.', 400);
    }
  }

  const [existing] = await connection.execute(
    `SELECT email FROM user_roles WHERE email = ?
     UNION SELECT email FROM account_requests WHERE email = ?`,
    [email, email]);
  if (existing.length) {
    throw httpError('An account or pending request already exists for this Personal Email.', 409);
  }
  await connection.execute(
    `INSERT INTO account_requests
       (full_name, email, assigned_role, assigned_head_email, password_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [name, email, role, assignedHeadEmail, hashPassword(password)]);
  await logAudit(
    user.email,
    'ACCOUNT_REQUESTED',
    '',
    `${email} requested as ${role}${assignedHeadEmail ? `; Head ${assignedHeadEmail}` : ''}`,
    connection);
}

async function getAccountManagement(req) {
  await requirePerm(req, 'admin.manage');
  const [requests] = await pool.query(
    `SELECT r.id, r.full_name, r.email, r.assigned_role, r.assigned_head_email,
            COALESCE(NULLIF(h.full_name, ''), NULLIF(p.full_name, ''), r.assigned_head_email, '') AS assigned_head_name,
            r.requested_at
     FROM account_requests r
     LEFT JOIN user_roles h ON h.email = r.assigned_head_email
     LEFT JOIN account_requests p ON p.email = r.assigned_head_email
     ORDER BY r.requested_at, r.id`);
  const [accounts] = await pool.query(
    `SELECT u.email, u.full_name, u.role, u.active, u.created_at, u.assigned_head_email, u.is_hr_head,
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
    throw httpError('Choose a valid account.', 400);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [accounts] = await connection.query(
      'SELECT email, role, active, assigned_head_email FROM user_roles FOR UPDATE');
    const account = accounts.find(item => item.email.toLowerCase() === normalizedEmail);
    if (!account) throw httpError('This account no longer exists.', 404);
    const assignment = validateHeadAssignment(
      normalizedEmail, account.role, normalizedHeadEmail, accounts);
    if (assignment.error) throw httpError(assignment.error, 400);
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

async function setHrHeadAccount(req, accountEmail, isHrHead) {
  const admin = await requirePerm(req, 'admin.manage');
  const email = sanitize(accountEmail).toLowerCase();
  if (!EMAIL_PATTERN.test(email) || typeof isHrHead !== 'boolean') {
    throw httpError('Choose a valid HR account and Head HR setting.', 400);
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT email, role, active FROM user_roles WHERE email = ? FOR UPDATE', [email]);
    if (!rows.length || rows[0].role !== 'HR' || !rows[0].active) {
      throw httpError('Only an active HR account can be designated as Head HR.', 400);
    }
    if (isHrHead) {
      const [currentHeads] = await connection.query("SELECT email FROM user_roles WHERE role = 'HR' AND is_hr_head = 1 FOR UPDATE");
      for (const currentHead of currentHeads) {
        if (currentHead.email === email) continue;
        await reassignOrRejectPendingHrForms(
          connection,
          currentHead.email,
          email,
          'Pending HR forms are assigned to this Head HR. Switch on another HR account to reassign them first.'
        );
      }
      await connection.execute("UPDATE user_roles SET is_hr_head = 0 WHERE role = 'HR'");
    } else {
      await reassignOrRejectPendingHrForms(
        connection,
        email,
        null,
        'Pending HR forms are assigned to this Head HR. Switch on another HR account to reassign them first.'
      );
    }
    await connection.execute('UPDATE user_roles SET is_hr_head = ? WHERE email = ?', [isHrHead ? 1 : 0, email]);
    await logAudit(admin.email, 'HR_HEAD_ASSIGNED', '', `${email} Head HR set to ${isHrHead}`, connection);
    await connection.commit();
    return { ok: true, email, isHrHead };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function saveAccountChanges(req, changes) {
  const admin = await requirePerm(req, 'admin.manage');
  const input = changes && typeof changes === 'object' ? changes : {};
  const assignments = Array.isArray(input.headAssignments) ? input.headAssignments : [];
  const hrHeadChanged = input.hrHeadChanged === true;
  if (assignments.length > 500 || (input.headAssignments !== undefined && !Array.isArray(input.headAssignments))) {
    throw httpError('Invalid account assignments.', 400);
  }
  if (input.hrHeadChanged !== undefined && typeof input.hrHeadChanged !== 'boolean') {
    throw httpError('Invalid Head HR setting.', 400);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [accounts] = await connection.query(
      'SELECT email, role, active, assigned_head_email, is_hr_head FROM user_roles FOR UPDATE');
    const byEmail = new Map(accounts.map(account => [account.email.toLowerCase(), account]));
    const normalizedAssignments = [];
    const seen = new Set();
    for (const item of assignments) {
      if (!item || typeof item !== 'object') {
        throw httpError('Invalid account assignment.', 400);
      }
      const email = sanitize(item.email).toLowerCase();
      const headEmail = sanitize(item.headEmail).toLowerCase();
      if (!EMAIL_PATTERN.test(email) || seen.has(email)) {
        throw httpError('Choose a valid account for each Head assignment.', 400);
      }
      seen.add(email);
      const owner = byEmail.get(email);
      if (!owner) throw httpError(`Account ${email} no longer exists.`, 404);
      const assignment = validateHeadAssignment(email, owner.role, headEmail, accounts);
      if (assignment.error) throw httpError(assignment.error, 400);
      normalizedAssignments.push({ email, headEmail: assignment.headEmail });
    }

    let targetHrHead = null;
    if (hrHeadChanged) {
      targetHrHead = sanitize(input.hrHeadEmail).toLowerCase() || null;
      if (targetHrHead) {
        const target = byEmail.get(targetHrHead);
        if (!EMAIL_PATTERN.test(targetHrHead) || !target || target.role !== 'HR' || !target.active) {
          throw httpError('Choose an active HR account as Head HR.', 400);
        }
      }
    }

    for (const assignment of normalizedAssignments) {
      await connection.execute('UPDATE user_roles SET assigned_head_email = ? WHERE email = ?',
        [assignment.headEmail, assignment.email]);
      await logAudit(admin.email, 'HEAD_ASSIGNED', '',
        `${assignment.email} assigned to Head ${assignment.headEmail || 'none'}`, connection);
    }

    if (hrHeadChanged) {
      const oldHeads = accounts.filter(account => account.role === 'HR' && account.is_hr_head);
      if (targetHrHead) {
        for (const oldHead of oldHeads) {
          if (oldHead.email.toLowerCase() === targetHrHead) continue;
          await reassignOrRejectPendingHrForms(
            connection,
            oldHead.email,
            targetHrHead,
            'Pending HR forms are assigned to the current Head HR. Choose another active HR account to reassign them first.'
          );
        }
      } else {
        for (const oldHead of oldHeads) {
          await reassignOrRejectPendingHrForms(
            connection,
            oldHead.email,
            null,
            'Pending HR forms are assigned to the current Head HR. Choose another active HR account to reassign them first.'
          );
        }
      }
      await connection.execute("UPDATE user_roles SET is_hr_head = 0 WHERE role = 'HR'");
      if (targetHrHead) {
        await connection.execute('UPDATE user_roles SET is_hr_head = 1 WHERE email = ?', [targetHrHead]);
      }
      await logAudit(admin.email, 'HR_HEAD_ASSIGNED', '',
        `Head HR set to ${targetHrHead || 'none'}`, connection);
    }

    await connection.commit();
    return { ok: true, assignments: normalizedAssignments.length, hrHeadEmail: hrHeadChanged ? targetHrHead : undefined };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function approveAccountRequest(req, requestId) {
  const admin = await requirePerm(req, 'admin.manage');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [requests] = await connection.execute(
      `SELECT id, full_name, email, assigned_role, assigned_head_email, password_hash
       FROM account_requests WHERE id = ? FOR UPDATE`,
      [requestId]);
    if (!requests.length) {
      await connection.rollback();
      throw httpError('This account request no longer exists.', 404);
    }

    const accountRequest = requests[0];
    const role = Object.prototype.hasOwnProperty.call(ACCOUNT_ROLE_MAP, accountRequest.assigned_role)
      ? ACCOUNT_ROLE_MAP[accountRequest.assigned_role]
      : null;
    if (!['STAFF', 'HEAD', 'HR'].includes(role)) {
      throw httpError('This request has no valid assigned role; reject it and recreate it from Employee Registration.', 400);
    }
    if (role === 'STAFF' && !accountRequest.assigned_head_email) {
      throw httpError('This STAFF request has no assigned Head. Reject it and recreate it from Employee Registration.', 400);
    }
    if (accountRequest.assigned_head_email) {
      const [heads] = await connection.execute(
        `SELECT email FROM user_roles WHERE email = ? AND role = 'HEAD' AND active = 1`,
        [accountRequest.assigned_head_email]);
      if (!heads.length) {
        throw httpError('Approve the assigned Head account first, then approve this request.', 409);
      }
    }
    await connection.execute(
      `INSERT INTO user_roles
         (email, full_name, role, assigned_head_email, active, extra_perms, password_hash)
       VALUES (?, ?, ?, ?, 1, '', ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), role = VALUES(role), active = 1,
         assigned_head_email = VALUES(assigned_head_email), extra_perms = '', password_hash = VALUES(password_hash)`,
      [accountRequest.email, accountRequest.full_name, role, accountRequest.assigned_head_email, accountRequest.password_hash]);
    await connection.execute('DELETE FROM account_requests WHERE id = ?', [accountRequest.id]);
    await logAudit(
      admin.email, 'ACCOUNT_APPROVED', '', `${accountRequest.email} approved as ${role}`, connection);
    await connection.commit();
    return { ok: true, email: accountRequest.email, role };
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
      throw httpError('This account request no longer exists.', 404);
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
    throw httpError('Enter your current password.', 400);
  }
  if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
    throw httpError('New password must be between 12 and 128 characters.', 400);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT password_hash FROM user_roles WHERE email = ? AND active = 1 FOR UPDATE', [user.email]);
    if (!rows.length || !verifyPassword(currentPassword, rows[0].password_hash)) {
      await connection.rollback();
      throw httpError('Current password is incorrect.', 400);
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

module.exports = { listAssignableHeads, createEmployeeAccountRequest, getAccountManagement, approveAccountRequest, rejectAccountRequest, assignAccountHead, setHrHeadAccount, saveAccountChanges, validateHeadAssignment, changeMyPassword, reassignOrRejectPendingHrForms };
