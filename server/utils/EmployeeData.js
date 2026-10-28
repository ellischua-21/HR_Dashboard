const { EMP_FIELDS, F } = require('../config/EmployeeSchema');
const { cleanField, fullName } = require('./Validation');
const { httpError } = require('./HttpError');

function cleanEmployee(data, canSensitive) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw httpError('Enter valid employee details.', 400);
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

module.exports = { cleanEmployee, dbValue };
