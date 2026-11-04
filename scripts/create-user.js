require('dotenv').config();

const crypto = require('crypto');
const { pool, initializeDatabase } = require('../server/db/database');
const { ROLE_PERMS } = require('../server/config/Permissions');
const { hashPassword } = require('../server/utils/Password');

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
  await pool.execute(
    `INSERT INTO user_roles (email, full_name, role, active, extra_perms, password_hash)
     VALUES (?, ?, ?, 1, '', ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role), active = 1, password_hash = VALUES(password_hash)`,
    [email, email, role, hashPassword(password)]
  );
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
