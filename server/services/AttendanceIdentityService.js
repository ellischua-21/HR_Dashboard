const { pool } = require('../db/database');
const { httpError } = require('../utils/HttpError');
const { logAudit } = require('./AuditService');

function normalizedName(value) {
  return (
    String(value || '')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.join(' ') || ''
  );
}

function scannerKey(row) {
  return JSON.stringify([row.providerAccount, row.employeeNo]);
}

function scannerName(row) {
  return normalizedName(`${row.firstName || ''} ${row.lastName || ''}`);
}

function sameName(row, employee) {
  if (
    !normalizedName(employee.first_name) ||
    !normalizedName(employee.last_name)
  )
    return false;
  if (normalizedName(row.lastName))
    return (
      normalizedName(row.firstName) === normalizedName(employee.first_name) &&
      normalizedName(row.lastName) === normalizedName(employee.last_name)
    );
  return (
    scannerName(row) ===
    normalizedName(`${employee.first_name} ${employee.last_name}`)
  );
}

// Confirmed links take precedence; ambiguous identities never fall back to a number.
function resolveAttendanceIdentities(rows, employees, links) {
  const byScanner = new Map(
    links.map((link) => [
      JSON.stringify([link.provider_account, link.scanner_no]),
      link
    ])
  );
  const identities = [
    ...new Map(rows.map((row) => [scannerKey(row), row])).values()
  ];
  const candidates = new Map(
    identities.map((row) => [
      scannerKey(row),
      employees.filter((employee) => sameName(row, employee))
    ])
  );
  const employeeScanners = new Map();
  for (const row of identities) {
    if (byScanner.has(scannerKey(row))) continue;
    for (const employee of candidates.get(scannerKey(row))) {
      if (!employeeScanners.has(employee.record_id))
        employeeScanners.set(employee.record_id, new Set());
      employeeScanners.get(employee.record_id).add(scannerKey(row));
    }
  }
  return rows.map((row) => {
    const link = byScanner.get(scannerKey(row));
    const matches = candidates.get(scannerKey(row)) || [];
    const linkedEmployee =
      link &&
      employees.find((employee) => employee.record_id === link.employee_id);
    const confirmed =
      link &&
      link.scanner_name === scannerName(row) &&
      linkedEmployee?.record_status !== 'Archived' &&
      linkedEmployee;
    const automatic =
      !link &&
      row.employeeNo &&
      matches.length === 1 &&
      matches[0].record_status !== 'Archived' &&
      employeeScanners.get(matches[0].record_id)?.size === 1 &&
      matches[0];
    const employee = confirmed || automatic;
    return {
      row,
      employee,
      status: confirmed
        ? 'Confirmed'
        : automatic
          ? 'Automatic'
          : 'Needs confirmation',
      previousEmployeeId: link?.employee_id || '',
      candidates: matches,
      needsConfirmation: !employee && (matches.length > 0 || Boolean(link))
    };
  });
}

async function attendanceIdentities(rows) {
  const [employees] = await pool.execute(
    'SELECT record_id, seq_no, emp_no, name, first_name, last_name, department, record_status FROM employees'
  );
  const [links] = await pool.execute('SELECT * FROM attendance_employee_links');
  return resolveAttendanceIdentities(rows, employees, links);
}

async function saveAttendanceIdentity(user, row, input) {
  if (
    typeof input.employeeId !== 'string' ||
    !input.employeeId ||
    input.employeeId.length > 20 ||
    typeof input.previousEmployeeId !== 'string' ||
    input.previousEmployeeId.length > 20
  )
    throw httpError('Select an employee record.', 400);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[employee]] = await connection.execute(
      "SELECT record_id FROM employees WHERE record_id = ? AND record_status <> 'Archived' FOR UPDATE",
      [input.employeeId]
    );
    if (!employee) throw httpError('This employee record is unavailable.', 409);
    const [[previous]] = await connection.execute(
      'SELECT employee_id FROM attendance_employee_links WHERE provider_account = ? AND scanner_no = ? FOR UPDATE',
      [row.providerAccount, row.employeeNo]
    );
    if ((previous?.employee_id || '') !== input.previousEmployeeId)
      throw httpError(
        'This attendance link changed. Reopen it before saving.',
        409
      );
    await connection.execute(
      `INSERT INTO attendance_employee_links
       (provider_account, scanner_no, scanner_name, employee_id, confirmed_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE scanner_name = VALUES(scanner_name), employee_id = VALUES(employee_id),
         confirmed_by = VALUES(confirmed_by), confirmed_at = CURRENT_TIMESTAMP`,
      [
        row.providerAccount,
        row.employeeNo,
        scannerName(row),
        employee.record_id,
        user.email
      ]
    );
    await logAudit(
      user.email,
      'ATTENDANCE_EMPLOYEE_LINK',
      employee.record_id,
      JSON.stringify({
        providerAccount: row.providerAccount,
        scannerNo: row.employeeNo,
        previousEmployeeId: previous?.employee_id || ''
      }),
      connection
    );
    await connection.commit();
    return { ok: true };
  } catch (error) {
    await connection.rollback();
    if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK'].includes(error.code))
      throw httpError(
        'This attendance link changed. Reopen it before saving.',
        409
      );
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  resolveAttendanceIdentities,
  attendanceIdentities,
  saveAttendanceIdentity
};
