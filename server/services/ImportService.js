const { EMP_FIELDS, F } = require('../config/EmployeeSchema');
const {
  pool,
  getLists,
  nextSequence,
  syncCounter,
  quote
} = require('../db/database');
const { requireEmployeeAccess } = require('../middleware/Auth');
const { logAudit } = require('./AuditService');
const { validateEmployee } = require('../utils/Validation');
const { cleanEmployee, dbValue } = require('../utils/EmployeeData');
const { httpError } = require('../utils/HttpError');
const { normalizeEmail } = require('../utils/EmployeeIdentity');
const { acquireEmployeeIdentityLock } = require('../utils/EmployeeIdentityLock');
const { DUPLICATE_EMAIL } = require('./EmployeeEmailService');

async function importEmployees(req, records, commit) {
  const user = await requireEmployeeAccess(req, 'emp.write');
  if (!Array.isArray(records) || records.length > 500)
    throw httpError('Import at most 500 rows per request.', 400);
  const lists = await getLists();
  const connection = await pool.getConnection();
  let unlock;
  try {
    unlock = await acquireEmployeeIdentityLock(connection);
    await connection.beginTransaction();
    const [existingRows] = await connection.execute(
      'SELECT emp_no FROM employees WHERE emp_no IS NOT NULL FOR UPDATE'
    );
    const existing = new Set(
      existingRows.map((row) => String(row.emp_no).toLowerCase())
    );
    const seen = new Set();
    const [emailRows] = await connection.execute(
      'SELECT personal_email FROM employees WHERE personal_email IS NOT NULL'
    );
    const existingEmails = new Set(
      emailRows.map(row => normalizeEmail(row.personal_email)).filter(Boolean)
    );
    const seenEmails = new Set();
    const good = [];
    const errors = [];

    records.forEach((record, index) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        errors.push({
          row: index + 2,
          errors: ['Enter a valid employee record.']
        });
        return;
      }
      const clean = cleanEmployee(record);
      EMP_FIELDS.forEach((field) => {
        const value = clean[field[0]];
        if (field[2] === 'list' && value) {
          const match = (lists[field[4]] || []).find(
            (item) =>
              item.toLowerCase().replace(/\s+/g, ' ') ===
              value.toLowerCase().replace(/\s+/g, ' ')
          );
          if (match) clean[field[0]] = match;
        }
      });
      const rowErrors = validateEmployee(clean, lists, { requireFte: false });
      const employeeNumber = clean.emp_no.toLowerCase();
      const email = normalizeEmail(clean.personal_email);
      if (email && existingEmails.has(email)) rowErrors.push(DUPLICATE_EMAIL);
      if (email && seenEmails.has(email))
        rowErrors.push('Duplicate Email in file.');
      if (employeeNumber && existing.has(employeeNumber))
        rowErrors.push('Employee Number already exists');
      if (employeeNumber && seen.has(employeeNumber))
        rowErrors.push('Duplicate Employee Number in file');
      if (rowErrors.length)
        errors.push({ row: record._line || index + 2, errors: rowErrors });
      else {
        seen.add(employeeNumber);
        if (email) seenEmails.add(email);
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
          keys.map((key) => dbValue(F.get(key), record[key]))
        );
      }
      imported = good.length;
      await logAudit(
        user.email,
        'CREATE',
        '',
        'Bulk import: ' + imported + ' employee(s)',
        connection
      );
      await syncCounter(connection);
    }
    await connection.commit();
    return { total: records.length, valid: good.length, errors, imported };
  } catch (error) {
    if (unlock) await connection.rollback();
    throw error;
  } finally {
    await unlock?.();
    connection.release();
  }
}

module.exports = { importEmployees };
