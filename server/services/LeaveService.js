const { pool } = require('../db/database');
const { requirePerm } = require('../middleware/Auth');
const { httpError } = require('../utils/HttpError');
const { manilaDate } = require('../../shared/DateUtils');
const { getAccountEmployee } = require('../utils/EmployeeIdentity');

const TYPES = { 'Vacation Leave (VL)': 'VL', 'Sick Leave (SL)': 'SL' };

function isPaidLeaveEligible(employee) {
  const rank = String(employee?.rank || '')
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
  return Boolean(
    employee &&
    employee.status === 'Regular' &&
    employee.record_status !== 'Archived' &&
    rank &&
    rank !== 'rank and file'
  );
}

function allocations(data) {
  const start = String(data.dateFrom || '');
  const end = String(data.dateTo || '');
  const first = Number(start.slice(0, 4));
  const last = Number(end.slice(0, 4));
  const days = Number(data.days);
  if (
    !first ||
    !last ||
    last < first ||
    last - first > 1 ||
    !Number.isFinite(days)
  )
    throw httpError('Enter a valid leave period.', 400);
  if (first === last) return [{ year: first, days }];
  const calendarDays = [
    (Date.UTC(first + 1, 0, 1) - Date.parse(`${start}T00:00:00Z`)) / 86400000,
    (Date.parse(`${end}T00:00:00Z`) - Date.UTC(last, 0, 1)) / 86400000 + 1
  ];
  let split = data.yearAllocation;
  if (!split || Object.keys(split).length === 0) {
    const minimumFirst = Math.max(0, days - calendarDays[1]);
    const maximumFirst = Math.min(days, calendarDays[0]);
    if (minimumFirst === maximumFirst)
      split = { [first]: minimumFirst, [last]: days - minimumFirst };
  }
  const entries = [first, last].map((year) => ({
    year,
    days: Number(split?.[year])
  }));
  if (
    entries.some(
      (entry, i) =>
        !Number.isFinite(entry.days) ||
        entry.days < 0 ||
        entry.days > calendarDays[i] ||
        !Number.isInteger(entry.days * 2)
    ) ||
    Math.abs(entries[0].days + entries[1].days - days) > 0.001
  )
    throw httpError(
      'Enter the leave days for each year so they add up to the requested days.',
      400
    );
  return entries.filter((entry) => entry.days > 0);
}

async function employeeForEmail(connection, email, lock = false) {
  return getAccountEmployee(email, connection, lock);
}

async function account(connection, employee, year, type) {
  if (!isPaidLeaveEligible(employee)) return false;
  if (
    employee.regularized_on &&
    Number(String(employee.regularized_on).slice(0, 4)) > year
  )
    return false;
  if (
    employee.date_employed &&
    Number(String(employee.date_employed).slice(0, 4)) > year
  )
    return false;
  const [result] = await connection.execute(
    'INSERT IGNORE INTO leave_accounts (employee_id, leave_year, leave_type, allowance) VALUES (?, ?, ?, 5)',
    [employee.record_id, year, type]
  );
  if (result.affectedRows)
    await connection.execute(
      "INSERT INTO leave_transactions (employee_id, leave_year, leave_type, transaction_type, days, remarks) VALUES (?, ?, ?, 'GRANT', 5, 'Annual allowance')",
      [employee.record_id, year, type]
    );
  return true;
}

async function syncHistoricalForms(connection, employee, email) {
  if (!employee) return;
  const [forms] = await connection.execute(
    "SELECT id, form_data FROM user_forms WHERE LOWER(user_email) = LOWER(?) AND template_key = 'leave-2026' AND status = 'APPROVED'",
    [email]
  );
  for (const form of forms) {
    const data =
      typeof form.form_data === 'string'
        ? JSON.parse(form.form_data)
        : form.form_data;
    const type = TYPES[data?.leaveType];
    if (!type || data.payType !== 'WITH_PAY') continue;
    let entries;
    try {
      entries = allocations(data);
    } catch (error) {
      throw httpError(
        `An older approved leave request (ID ${form.id}) needs its days assigned to each year before balances can be calculated. Contact HR.`,
        409
      );
    }
    for (const entry of entries) {
      await connection.execute(
        "INSERT IGNORE INTO leave_transactions (employee_id, leave_year, leave_type, transaction_type, days, form_id, remarks) VALUES (?, ?, ?, 'DEDUCTION', ?, ?, 'Approved leave')",
        [employee.record_id, entry.year, type, -entry.days, form.id]
      );
    }
  }
}

async function balance(connection, employee, year, type) {
  if (!(await account(connection, employee, year, type))) return 0;
  const [[row]] = await connection.execute(
    'SELECT COALESCE(SUM(days), 0) AS balance FROM leave_transactions WHERE employee_id = ? AND leave_year = ? AND leave_type = ?',
    [employee.record_id, year, type]
  );
  return Number(row.balance);
}

async function grantCurrentAllowances(connection, employee) {
  const year = Number(manilaDate().slice(0, 4));
  await account(connection, employee, year, 'SL');
  await account(connection, employee, year, 'VL');
}

async function getBalances(connection, employee, email, year) {
  if (!isPaidLeaveEligible(employee))
    return { year, eligible: false, SL: 0, VL: 0 };
  await syncHistoricalForms(connection, employee, email);
  return {
    year,
    eligible: true,
    SL: await balance(connection, employee, year, 'SL'),
    VL: await balance(connection, employee, year, 'VL')
  };
}

async function validatePaidLeave(
  connection,
  employee,
  email,
  data,
  deductFormId = null
) {
  const type = TYPES[data.leaveType];
  if (!type || data.payType !== 'WITH_PAY') return;
  if (!isPaidLeaveEligible(employee))
    throw httpError(
      'Paid sick and vacation leave requires Regular status and a rank above Rank and File. Choose Without Pay.',
      400
    );
  if (employee.regularized_on && data.dateFrom < employee.regularized_on)
    throw httpError(
      'Paid sick and vacation leave must start on or after regularization.',
      400
    );
  await syncHistoricalForms(connection, employee, email);
  for (const entry of allocations(data)) {
    const remaining = await balance(connection, employee, entry.year, type);
    if (entry.days > remaining + 0.001)
      throw httpError(
        `Insufficient ${type} balance for ${entry.year}. Reduce the requested days or choose Without Pay.`,
        400
      );
    if (deductFormId)
      await connection.execute(
        "INSERT INTO leave_transactions (employee_id, leave_year, leave_type, transaction_type, days, form_id, remarks) VALUES (?, ?, ?, 'DEDUCTION', ?, ?, 'Approved leave')",
        [employee.record_id, entry.year, type, -entry.days, deductFormId]
      );
  }
}

async function getMyLeaveBalances(req, requestedYear) {
  const user = await requirePerm(req, 'forms.self');
  const year = Number(requestedYear || manilaDate().slice(0, 4));
  if (!Number.isInteger(year) || year < 1900 || year > 9999)
    throw httpError('Enter a valid year.', 400);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const employee = await employeeForEmail(connection, user.email, true);
    const result = await getBalances(connection, employee, user.email, year);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getReviewLeaveBalances(req, formId) {
  const user = await requirePerm(req, 'forms.review');
  if (!['HR', 'ADMIN'].includes(user.role))
    throw httpError('Access denied.', 403);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[form]] = await connection.execute(
      "SELECT user_email, form_data FROM user_forms WHERE id = ? AND template_key = 'leave-2026' AND review_stage = 'HR' AND status = 'PENDING'",
      [formId]
    );
    if (!form) throw httpError('Leave request is unavailable for review.', 404);
    const data =
      typeof form.form_data === 'string'
        ? JSON.parse(form.form_data)
        : form.form_data;
    const employee = await employeeForEmail(connection, form.user_email, true);
    const result = await getBalances(
      connection,
      employee,
      form.user_email,
      Number(String(data.dateFrom).slice(0, 4))
    );
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  TYPES,
  allocations,
  employeeForEmail,
  getBalances,
  validatePaidLeave,
  getMyLeaveBalances,
  getReviewLeaveBalances,
  grantCurrentAllowances
};
