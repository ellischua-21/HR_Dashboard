const { httpError } = require('./HttpError');
const { isValidDate } = require('../../shared/DateUtils');

const EMPLOYEE_FILTER_KEYS = [
  'company',
  'department',
  'location',
  'status',
  'rank',
  'function_type'
];
function normalizeEmployeeFilters(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw httpError('Enter valid employee filters.', 400);
  const filters = {};
  for (const key of EMPLOYEE_FILTER_KEYS) {
    if (input[key] == null || input[key] === '') continue;
    if (typeof input[key] !== 'string' || input[key].length > 500)
      throw httpError('Choose valid employee filters.', 400);
    filters[key] = input[key];
  }
  for (const key of ['dateFrom', 'dateTo']) {
    if (input[key] == null || input[key] === '') continue;
    if (!isValidDate(input[key]))
      throw httpError('Choose valid report dates.', 400);
    filters[key] = input[key];
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
    throw httpError('The start date must be on or before the end date.', 400);
  return filters;
}

module.exports = { EMPLOYEE_FILTER_KEYS, normalizeEmployeeFilters };
