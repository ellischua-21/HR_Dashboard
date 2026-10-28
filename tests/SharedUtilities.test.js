const test = require('node:test');
const assert = require('node:assert/strict');
const {
  manilaDate,
  addWorkingDays,
  workingDaysBetween
} = require('../shared/DateUtils');
const { normalizePagination } = require('../server/utils/Pagination');
const { sendAttachment } = require('../server/utils/AttachmentResponse');
const { normalizeEmployeeFilters } = require('../server/utils/EmployeeFilters');
const {
  notifyAccount,
  notifyReviewers
} = require('../server/services/incident-management/Notifications');

test('shared deadline calendar handles weekends, year boundaries, and invalid input', () => {
  assert.equal(manilaDate(new Date('2026-12-31T16:00:00Z')), '2027-01-01');
  assert.equal(addWorkingDays('2026-10-30', 5), '2026-11-06');
  assert.equal(addWorkingDays('2026-12-31', 2), '2027-01-04');
  assert.equal(workingDaysBetween('2026-10-30', '2026-11-06'), 5);
  assert.equal(workingDaysBetween('2026-10-31', '2026-11-02'), 1);
  assert.equal(workingDaysBetween('invalid', '2026-11-06'), 0);
  assert.equal(addWorkingDays('2026-02-30', 5), '');
  assert.equal(addWorkingDays('2026-10-30', Infinity), '');
});

test('pagination rejects invalid SQL limits and preserves configured size caps', () => {
  assert.deepEqual(normalizePagination({ page: 3, pageSize: 25 }), {
    page: 3,
    pageSize: 25,
    offset: 50
  });
  assert.equal(
    normalizePagination(
      { pageSize: 500 },
      { maxPageSize: 100, clampSize: true }
    ).pageSize,
    100
  );
  for (const input of [
    null,
    [],
    { page: 0 },
    { page: 1.5 },
    { pageSize: -1 },
    { pageSize: Infinity },
    { pageSize: 2.5 },
    { page: Number.MAX_SAFE_INTEGER }
  ])
    assert.throws(() => normalizePagination(input), { status: 400 });
});

test('all evidence downloads use safe filenames and private response headers', () => {
  const headers = new Map();
  let body;
  const data = Buffer.from('evidence');
  sendAttachment(
    {
      setHeader: (name, value) => headers.set(name, value),
      send: (value) => {
        body = value;
      }
    },
    {
      fileName: 'Employee "A"\r\n資料.pdf',
      mimeType: 'application/pdf',
      fileData: data
    }
  );
  assert.equal(body, data);
  assert.equal(headers.get('Cache-Control'), 'private, no-store');
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
  assert.doesNotMatch(headers.get('Content-Disposition'), /[\r\n]/);
  assert.match(headers.get('Content-Disposition'), /filename\*=UTF-8''/);
});

test('dashboard and reports reject malformed dates through the same filter rules', () => {
  assert.deepEqual(
    normalizeEmployeeFilters({
      department: 'IT',
      dateFrom: '2026-01-01',
      ignored: 'value'
    }),
    { department: 'IT', dateFrom: '2026-01-01' }
  );
  for (const filters of [
    [],
    { dateFrom: 'invalid' },
    { dateTo: '2026-02-30' },
    { department: [] },
    { dateFrom: '2026-10-30', dateTo: '2026-10-01' }
  ])
    assert.throws(() => normalizeEmployeeFilters(filters), { status: 400 });
});

test('incident notification helpers exclude the actor and retain system reminders', async () => {
  const calls = [];
  const connection = {
    execute: async (sql, values) => {
      calls.push({ sql, values });
    }
  };
  await notifyAccount(
    connection,
    1,
    'HR@example.com',
    'EVIDENCE_2',
    'hr@example.com'
  );
  assert.equal(calls.length, 0);
  await notifyAccount(
    connection,
    1,
    'other@example.com',
    'EVIDENCE_2',
    'hr@example.com'
  );
  assert.deepEqual(calls[0].values, [1, 'other@example.com', 'EVIDENCE_2']);
  await notifyReviewers(connection, 1, 'EVIDENCE_2', 'hr@example.com');
  assert.match(calls[1].sql, /LOWER\(email\) <> LOWER\(\?\)/);
  assert.deepEqual(calls[1].values, [1, 'EVIDENCE_2', 'hr@example.com']);
  await notifyReviewers(connection, 1, 'NTE_OVERDUE');
  assert.deepEqual(calls[2].values, [1, 'NTE_OVERDUE']);
});
