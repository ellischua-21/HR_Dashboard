const { EMP_FIELDS, F } = require('../config/EmployeeSchema');
const { CFG } = require('../config/Config');
const { pool, getLists, nextSequence, quote } = require('../db/database');
const { requirePerm } = require('../middleware/Auth');
const { logAudit } = require('./AuditService');
const {
  sanitize,
  validateEmployee,
  cleanField,
  fullName
} = require('../utils/Validation');
const { withCalc, normalizeEmployee } = require('./DashboardService');
const { createEmployeeAccountRequest } = require('./AccountService');

const LIGHT = [
  'record_id',
  'name',
  'emp_no',
  'company',
  'location',
  'position',
  'department',
  'rank',
  'date_employed',
  'status'
];

async function listEmployees(req, params = {}) {
  await requirePerm(req, 'emp.read');
  const conditions = ["record_status <> 'Archived'"];
  const values = [];
  ['company', 'department', 'location', 'rank', 'status'].forEach((key) => {
    if (params[key]) {
      conditions.push(`BINARY ${quote(key)} = BINARY ?`);
      values.push(params[key]);
    }
  });
  const search = sanitize(params.search).toLowerCase();
  if (search) {
    conditions.push(
      "(LOWER(name) LIKE ? ESCAPE '!' OR LOWER(emp_no) LIKE ? ESCAPE '!')"
    );
    const term = '%' + search.replace(/[!%_]/g, '!$&') + '%';
    values.push(term, term);
  }
  const where = conditions.join(' AND ');
  const [[count]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM employees WHERE ${where}`,
    values
  );
  const sortKey = LIGHT.includes(params.sortKey) ? params.sortKey : 'name';
  const direction = params.sortDir === 'desc' ? 'DESC' : 'ASC';
  const size = Math.min(Number(params.pageSize) || CFG.PAGE_SIZE, 100);
  const page = Math.max(Number(params.page) || 1, 1);
  const offset = (page - 1) * size;
  const [rows] = await pool.execute(
    `SELECT ${LIGHT.map(quote).join(', ')} FROM employees WHERE ${where} ORDER BY ${quote(sortKey)} ${direction} LIMIT ? OFFSET ?`,
    [...values, size, offset]
  );
  return {
    total: Number(count.total),
    page,
    pageSize: size,
    rows: rows.map((row) => ({
      ...row,
      tenure_years: withCalc({ date_employed: row.date_employed }).tenure_years
    }))
  };
}

async function getEmployee(req, recordId) {
  const user = await requirePerm(req, 'emp.read');
  const [rows] = await pool.execute(
    'SELECT * FROM employees WHERE record_id = ? LIMIT 1',
    [recordId]
  );
  if (!rows.length) throw new Error('Employee not found.');
  const employee = normalizeEmployee(rows[0]);
  const canSeeSensitive = user.perms.includes('emp.sensitive');
  if (canSeeSensitive)
    await logAudit(
      user.email,
      'VIEW_SENSITIVE',
      recordId,
      'Profile viewed with sensitive access'
    );
  const result = withCalc(employee);
  EMP_FIELDS.forEach((field) => {
    if (F.has(field, 'S') && !canSeeSensitive) result[field[0]] = '';
  });
  if (!canSeeSensitive) result._masked = true;
  return result;
}

async function getFormOptions(req) {
  await requirePerm(req, 'emp.read');
  return getLists();
}

async function getFormMeta(req) {
  const user = await requirePerm(req, 'emp.read');
  const canSensitive = user.perms.includes('emp.sensitive');
  return {
    fields: EMP_FIELDS.filter(
      (field) =>
        !F.has(field, 'C') &&
        field[0] !== 'docs' &&
        (canSensitive || !F.has(field, 'S'))
    ).map((field) => ({
      key: field[0],
      label: field[1],
      type: field[2],
      required: F.has(field, 'R'),
      sensitive: F.has(field, 'S'),
      list: field[4] || ''
    })),
    lists: await getLists(),
    canSensitive
  };
}

function cleanEmployee(data, canSensitive) {
  const clean = {};
  EMP_FIELDS.forEach((field) => {
    if (!F.has(field, 'C')) {
      clean[field[0]] =
        F.has(field, 'S') && !canSensitive
          ? ''
          : cleanField(field, data[field[0]]);
    }
  });
  clean.name = fullName(clean);
  return clean;
}

function dbValue(field, value) {
  if (value === '' || value === undefined || value === null) return null;
  if (field[2] === 'json')
    return typeof value === 'string' ? value : JSON.stringify(value);
  if (field[2] === 'number') return Number(value);
  return value;
}

async function saveEmployee(req, data = {}) {
  const user = await requirePerm(req, 'emp.write');
  const canSensitive = user.perms.includes('emp.sensitive');
  const clean = cleanEmployee(data, canSensitive);
  const errors = validateEmployee(clean, await getLists(), canSensitive);
  if (errors.length) return { ok: false, errors };
  if (!data.record_id && !data.accountAccess) {
    return {
      ok: false,
      errors: [
        'Complete the account access section to submit this employee for ADMIN approval.'
      ]
    };
  }
  if (data.record_id && data.accountAccess) {
    return {
      ok: false,
      errors: ['Account requests can only be submitted for a new employee.']
    };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [duplicates] = await connection.execute(
      'SELECT record_id FROM employees WHERE emp_no = ? AND record_id <> ? LIMIT 1',
      [clean.emp_no, data.record_id || '']
    );
    if (duplicates.length) {
      await connection.rollback();
      return { ok: false, errors: ['Employee Number already exists'] };
    }

    const keys = F.keys();
    if (data.record_id) {
      const [found] = await connection.execute(
        'SELECT * FROM employees WHERE record_id = ? FOR UPDATE',
        [data.record_id]
      );
      if (!found.length) {
        await connection.rollback();
        return { ok: false, errors: ['Record not found'] };
      }
      const old = normalizeEmployee(found[0]);
      const changed = [];
      const next = { ...old };
      EMP_FIELDS.forEach((field) => {
        const key = field[0];
        if (key === 'name') next.name = clean.name;
        else if (!Object.prototype.hasOwnProperty.call(data, key)) return;
        else if (!F.has(field, 'C') && !(F.has(field, 'S') && !canSensitive)) {
          if (String(old[key]) !== String(clean[key])) changed.push(key);
          next[key] = clean[key];
        }
      });
      next.modified_at = new Date();
      next.modified_by = user.email;
      const updateKeys = keys.filter(
        (key) =>
          key !== 'record_id' &&
          (Object.prototype.hasOwnProperty.call(data, key) ||
            ['name', 'modified_at', 'modified_by'].includes(key))
      );
      await connection.execute(
        `UPDATE employees SET ${updateKeys.map((key) => `${quote(key)} = ?`).join(', ')} WHERE record_id = ?`,
        [
          ...updateKeys.map((key) => dbValue(F.get(key), next[key])),
          old.record_id
        ]
      );
      await logAudit(
        user.email,
        'UPDATE',
        old.record_id,
        'Fields changed: ' + changed.join(','),
        connection
      );
      await connection.commit();
      return { ok: true, record_id: old.record_id };
    }

    const sequence = await nextSequence(connection);
    const recordId = 'EMP-' + String(sequence).padStart(6, '0').slice(-6);
    const now = new Date();
    const record = {
      ...clean,
      record_id: recordId,
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
    await logAudit(
      user.email,
      'CREATE',
      recordId,
      'Employee created',
      connection
    );
    await createEmployeeAccountRequest(
      req,
      clean,
      data.accountAccess,
      connection
    );
    await connection.commit();
    return {
      ok: true,
      record_id: recordId,
      accountRequestSubmitted: true,
      accountEmail: clean.personal_email
    };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY')
      return { ok: false, errors: ['Employee Number already exists'] };
    throw error;
  } finally {
    connection.release();
  }
}

async function archiveEmployee(req, recordId) {
  const user = await requirePerm(req, 'emp.archive');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT record_id FROM employees WHERE record_id = ? FOR UPDATE',
      [recordId]
    );
    if (!rows.length) throw new Error('Employee not found.');
    await connection.execute(
      'UPDATE employees SET record_status = ? WHERE record_id = ?',
      ['Archived', recordId]
    );
    await logAudit(
      user.email,
      'ARCHIVE',
      recordId,
      'Record archived by ' + user.email,
      connection
    );
    await connection.commit();
    return { ok: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listEmployees,
  getEmployee,
  getFormOptions,
  getFormMeta,
  saveEmployee,
  archiveEmployee,
  cleanEmployee,
  dbValue
};
