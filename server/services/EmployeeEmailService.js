const { normalizeEmail } = require('../utils/EmployeeIdentity');

const DUPLICATE_EMAIL =
  'Personal Email already exists on another employee record.';
async function hasDuplicateEmployeeEmail(connection, value, recordId = '') {
  const email = normalizeEmail(value);
  if (!email) return false;
  const [duplicates] = await connection.execute(
    `SELECT record_id FROM employees WHERE LOWER(TRIM(personal_email)) = ?
     AND record_id <> ? LIMIT 1`,
    [email, recordId]
  );
  return duplicates.length > 0;
}

async function validateEmailChange(connection, next, previous = null) {
  const email = normalizeEmail(next.personal_email);
  const oldEmail = normalizeEmail(previous?.personal_email);
  if (previous && email === oldEmail) {
    // Preserve stored spelling so existing downstream email joins stay unchanged.
    next.personal_email = previous.personal_email;
    return null;
  }
  if (previous && oldEmail) {
    const [references] = await connection.execute(
      `SELECT 1 FROM user_roles WHERE LOWER(TRIM(email)) = ?
       UNION ALL SELECT 1 FROM account_requests WHERE LOWER(TRIM(email)) = ? LIMIT 1`,
      [oldEmail, oldEmail]
    );
    if (references.length)
      return 'Personal Email cannot be changed while an account or pending account request uses it.';
  }
  return (await hasDuplicateEmployeeEmail(
    connection,
    email,
    previous?.record_id || ''
  ))
    ? DUPLICATE_EMAIL
    : null;
}

module.exports = {
  validateEmailChange,
  hasDuplicateEmployeeEmail,
  DUPLICATE_EMAIL
};
