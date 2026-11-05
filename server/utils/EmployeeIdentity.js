const { pool } = require('../db/database');

// Account credentials remain separate; employee identity always comes from employees.
async function getAccountEmployee(email, connection = pool, lock = false) {
  const [rows] = await connection.execute(
    `SELECT record_id, name, personal_email, emp_no, position, department,
            status, record_status, date_employed, regularized_on
     FROM employees
     WHERE LOWER(TRIM(personal_email)) = LOWER(TRIM(?))
       AND COALESCE(record_status, 'Active') <> 'Archived'
     LIMIT 2${lock ? ' FOR UPDATE' : ''}`,
    [String(email || '').trim()]
  );
  // An ambiguous match must not sign somebody in as the wrong employee.
  return rows.length === 1 ? rows[0] : null;
}

module.exports = { getAccountEmployee };
