require('dotenv').config();

const crypto = require('crypto');
const { pool, initializeDatabase } = require('../server/db/database');
const { ROLE_PERMS } = require('../server/config/Permissions');
const { hashPassword } = require('../server/utils/Password');
const { getAccountEmployee, isSetupAdministrator } = require('../server/utils/EmployeeIdentity');
const { acquireEmployeeIdentityLock } = require('../server/utils/EmployeeIdentityLock');
const { hasDuplicateEmployeeEmail, DUPLICATE_EMAIL } = require('../server/services/EmployeeEmailService');

async function main() {
  const email = String(process.argv[2] || '')
    .trim()
    .toLowerCase();
  const role = String(process.argv[3] || 'ADMIN')
    .trim()
    .toUpperCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      'Usage: npm run create-user -- person@example.com [STAFF|SUPERVISOR|HEAD|HR|ADMIN]'
    );
  }
  if (!ROLE_PERMS[role]) throw new Error('Unsupported role: ' + role);

  await initializeDatabase();
  const password = crypto.randomBytes(18).toString('base64url');
  const connection = await pool.getConnection();
  let firstSetupAdmin = false;
  let unlock;
  try {
    unlock = await acquireEmployeeIdentityLock(connection);
    await connection.beginTransaction();
    // Lock account creation so concurrent setup commands cannot both be first.
    const [accounts] = await connection.query(
      'SELECT email, full_name, role, is_setup_admin FROM user_roles FOR UPDATE'
    );
    const existing = accounts.find((account) => account.email.toLowerCase() === email);
    const employee = await getAccountEmployee(email, connection, true);
    if (employee && await hasDuplicateEmployeeEmail(connection, employee.personal_email, employee.record_id))
      throw new Error(DUPLICATE_EMAIL);
    firstSetupAdmin = !employee && role === 'ADMIN' && accounts.length === 0;
    const resettingSetupAdmin = role === 'ADMIN' && isSetupAdministrator(existing);
    if (!employee && !firstSetupAdmin && !resettingSetupAdmin) {
      throw new Error(
        'Create or import one non-archived employee record with this Personal Email before creating the login account. Only the first ADMIN on an empty accounts table can be created without an employee record.'
      );
    }
    await connection.execute(
      `INSERT INTO user_roles (email, full_name, role, active, extra_perms, password_hash, is_setup_admin)
       VALUES (?, ?, ?, 1, '', ?, ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), role = VALUES(role), active = 1, password_hash = VALUES(password_hash)`,
      [
        email,
        employee?.name || existing?.full_name || email,
        role,
        hashPassword(password),
        firstSetupAdmin ? 1 : 0
      ]
    );
    await connection.commit();
  } catch (error) {
    if (unlock) await connection.rollback();
    throw error;
  } finally {
    await unlock?.();
    connection.release();
  }
  if (firstSetupAdmin) {
    console.log('First-time setup ADMIN created without an employee record.');
  }
  console.log(`Local account created.
Email: ${email}
Role: ${role}
Temporary password (shown once): ${password}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
