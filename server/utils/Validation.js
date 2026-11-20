const { isValidDate } = require('../../shared/DateUtils');
const { EMP_FIELDS, F } = require('../config/EmployeeSchema');

function sanitize(value) {
  if (value === null || value === undefined) return '';
  let text = String(value).trim().replace(/[<>]/g, '');
  if (/^[=+\-@]/.test(text) && Number.isNaN(Number(text))) text = "'" + text;
  return text.slice(0, 500);
}

function validateEmployee(data, lists, { requireFte = true } = {}) {
  const errors = [];
  EMP_FIELDS.forEach((field) => {
    if (F.has(field, 'C')) return;
    const value = data[field[0]];
    if (
      F.has(field, 'R') &&
      (field[0] !== 'fte' || requireFte) &&
      (value === '' || value === undefined || value === null)
    ) {
      errors.push(field[1] + ' is required');
      return;
    }
    if (value === '' || value === undefined || value === null) return;
    if (field[2] === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      errors.push(field[1] + ' is not a valid email');
    if (field[2] === 'date' && !isValidDate(value))
      errors.push(field[1] + ' is not a valid date');
    if (field[2] === 'number' && Number.isNaN(Number(value)))
      errors.push(field[1] + ' must be a number');
    if (
      field[2] === 'list' &&
      lists[field[4]] &&
      !lists[field[4]].includes(value)
    )
      errors.push(field[1] + ' has an invalid value');
  });
  if (
    data.fte !== '' &&
    data.fte !== undefined &&
    (Number(data.fte) < 0 || Number(data.fte) > 1)
  )
    errors.push('FTE Allocation must be between 0 and 1');
  if (data.birthday && new Date(data.birthday) > new Date())
    errors.push('Birthday cannot be in the future');
  if (data.church_has === 'Yes' && !data.church_position)
    errors.push('Church position is required when "Yes" is selected');
  return errors;
}

const JSON_SCHEMA = {
  siblings: ['name', 'address', 'contact', 'occupation'],
  children: ['name', 'address', 'age', 'contact'],
  orgs: ['org', 'position', 'year']
};

function cleanField(field, value) {
  if (field[2] !== 'json') return sanitize(value);
  let rows = value;
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows || '[]');
    } catch (error) {
      rows = [];
    }
  }
  if (!Array.isArray(rows)) rows = [];
  const columns = JSON_SCHEMA[field[0]];
  rows = rows
    .slice(0, 20)
    .map((row) => {
      const output = {};
      columns.forEach((column) => {
        output[column] = sanitize(row && row[column]).slice(0, 200);
      });
      return output;
    })
    .filter((row) => columns.some((column) => row[column]));
  return rows.length ? JSON.stringify(rows) : '';
}

function fullName(data) {
  return (
    (data.last_name || '') +
    ', ' +
    (data.first_name || '') +
    (data.middle_name ? ' ' + data.middle_name : '')
  );
}

module.exports = {
  sanitize,
  validateEmployee,
  cleanField,
  fullName,
  isValidDate
};
