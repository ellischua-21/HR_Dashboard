const { httpError } = require('./HttpError');

function normalizePagination(
  input = {},
  { defaultPageSize = 25, maxPageSize = 100, clampSize = false } = {}
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw httpError('Enter valid pagination options.', 400);
  const page = Number(input.page ?? 1);
  let pageSize = Number(input.pageSize ?? defaultPageSize);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    (!clampSize && pageSize > maxPageSize)
  )
    throw httpError('Choose a valid page and page size.', 400);
  if (clampSize) pageSize = Math.min(pageSize, maxPageSize);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset))
    throw httpError('Choose a valid page.', 400);
  return { page, pageSize, offset };
}

module.exports = { normalizePagination };
