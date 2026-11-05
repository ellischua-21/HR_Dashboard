const { pool } = require('../db/database');
const { logAudit } = require('./AuditService');
const { manilaDate } = require('../../shared/DateUtils');
const { grantCurrentAllowances } = require('./LeaveService');

async function processRegularizations() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [employees] = await connection.execute(
      `SELECT record_id FROM employees
       WHERE status = 'Probationary' AND COALESCE(record_status, 'Active') <> 'Archived'
         AND date_employed IS NOT NULL AND DATE_ADD(date_employed, INTERVAL 6 MONTH) <= ?
       FOR UPDATE`,
      [manilaDate()]
    );
    for (const employee of employees) {
      await connection.execute(
        "UPDATE employees SET status = 'Regular', regularized_on = DATE_ADD(date_employed, INTERVAL 6 MONTH), modified_by = 'system', modified_at = ? WHERE record_id = ? AND status = 'Probationary'",
        [manilaDate(), employee.record_id]
      );
      await logAudit('system', 'EMPLOYEE_REGULARIZED', employee.record_id,
        'Employment status automatically changed from Probationary to Regular.', connection);
    }
    const [regularEmployees] = await connection.execute(
      "SELECT record_id, status, date_employed, regularized_on, record_status FROM employees WHERE status = 'Regular' AND COALESCE(record_status, 'Active') <> 'Archived' FOR UPDATE"
    );
    for (const employee of regularEmployees)
      await grantCurrentAllowances(connection, employee);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { processRegularizations };
