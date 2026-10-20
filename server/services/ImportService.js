const { EMP_FIELDS, F, CFG } = require('../config/Config');
const { pool, getLists, nextSequence, syncCounter, quote } = require('../db/database');
const { requirePerm } = require('../middleware/Auth');
const { logAudit } = require('./AuditService');
const { cleanField, validateEmployee, fullName } = require('../utils/Validation');
const { dbValue } = require('./EmployeeService');

async function importEmployees(req, records, commit) {
  const user = await requirePerm(req, 'emp.write');
  if (!Array.isArray(records) || records.length > 500) throw new Error('Import at most 500 rows per request.');
  const canSensitive = user.perms.includes('emp.sensitive');
  const lists = await getLists();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.execute('SELECT emp_no FROM employees WHERE emp_no IS NOT NULL FOR UPDATE');
    const existing = new Set(existingRows.map(row => String(row.emp_no).toLowerCase()));
    const seen = new Set();
    const good = [];
    const errors = [];

    records.forEach((record, index) => {
      const clean = {};
      EMP_FIELDS.forEach(field => {
        if (F.has(field, 'C')) return;
        if (F.has(field, 'S') && !canSensitive) {
          clean[field[0]] = '';
          return;
        }
        let value = cleanField(field, record[field[0]]);
        if (field[2] === 'list' && value) {
          const match = (lists[field[4]] || []).find(item => item.toLowerCase() === value.toLowerCase());
          if (match) value = match;
        }
        clean[field[0]] = value;
      });
      clean.name = fullName(clean);
      const rowErrors = validateEmployee(clean, lists);
      const employeeNumber = clean.emp_no.toLowerCase();
      if (employeeNumber && existing.has(employeeNumber)) rowErrors.push('Employee Number already exists');
      if (employeeNumber && seen.has(employeeNumber)) rowErrors.push('Duplicate Employee Number in file');
      if (rowErrors.length) errors.push({ row: record._line || index + 2, errors: rowErrors });
      else {
        seen.add(employeeNumber);
        good.push(clean);
      }
    });

    let imported = 0;
    if (commit && good.length) {
      const keys = F.keys();
      const now = new Date();
      for (const clean of good) {
        const sequence = await nextSequence(connection);
        const record = {
          ...clean,
          record_id: 'EMP-' + String(sequence).padStart(6, '0').slice(-6),
          seq_no: sequence,
          record_status: 'Active',
          created_at: now,
          created_by: user.email,
          modified_at: now,
          modified_by: user.email
        };
        await connection.execute(
          `INSERT INTO employees (${keys.map(quote).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          keys.map(key => dbValue(F.get(key), record[key])));
      }
      imported = good.length;
      await logAudit(user.email, 'CREATE', '', 'Bulk import: ' + imported + ' employee(s)', connection);
      await syncCounter(connection);
    }
    await connection.commit();
    return { total: records.length, valid: good.length, errors, imported };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { importEmployees };
