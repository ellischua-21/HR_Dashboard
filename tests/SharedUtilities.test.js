const test = require('node:test');
const assert = require('node:assert/strict');
const {
  manilaDate,
  ageOnDate,
  addWorkingDays,
  workingDaysBetween,
  formatDate,
  formatTime,
  formatDateTime,
  formatField,
  parseInput
} = require('../shared/DateUtils');
const { normalizePagination } = require('../server/utils/Pagination');
const WorkTime = require('../shared/WorkTime');
const { sendAttachment } = require('../server/utils/AttachmentResponse');
const { normalizeEmployeeFilters } = require('../server/utils/EmployeeFilters');
const {
  notifyAccount,
  notifyReviewers
} = require('../server/services/incident-management/Notifications');

test('employee age changes on the calendar birthday and rejects invalid or future dates', () => {
  assert.equal(ageOnDate('2000-11-04', '2026-11-03'), 25);
  assert.equal(ageOnDate('2000-11-04', '2026-11-04'), 26);
  assert.equal(ageOnDate('2000-11-04', '2026-11-05'), 26);
  assert.equal(ageOnDate('2000-02-29', '2026-02-28'), 25);
  assert.equal(ageOnDate('2000-02-29', '2026-03-01'), 26);
  assert.equal(ageOnDate('2026-11-05', '2026-11-04'), '');
  assert.equal(ageOnDate('2026-02-30', '2026-11-04'), '');
  assert.equal(ageOnDate('', '2026-11-04'), '');
});

test('HR working time clips Manila shift boundaries, skips weekends and retains full elapsed hours', () => {
  const time = (value) => Date.parse(value + '+08:00');
  assert.equal(
    WorkTime.milliseconds(
      time('2026-11-06T18:00:00'),
      time('2026-11-09T08:30:00')
    ),
    3600000
  );
  assert.equal(
    WorkTime.milliseconds(
      time('2026-11-07T08:00:00'),
      time('2026-11-08T18:30:00')
    ),
    0
  );
  assert.equal(
    WorkTime.milliseconds(
      time('2026-11-09T07:00:00'),
      time('2026-11-09T20:00:00')
    ),
    10.5 * 3600000
  );
  assert.equal(WorkTime.milliseconds(NaN, time('2026-11-09T20:00:00')), 0);
  assert.equal(WorkTime.milliseconds(2, 1), 0);
  assert.equal(WorkTime.format(105 * 3600000 + 61000), '105:01:01');
});

test('working-time week optimization matches daily intersection across deterministic multi-year ranges', () => {
  const day = 86400000,
    hour = 3600000,
    offset = 8 * hour;
  function daily(from, to) {
    let total = 0;
    for (
      let start = Math.floor((from + offset) / day) * day - offset;
      start < to;
      start += day
    ) {
      if ([0, 6].includes(new Date(start + offset).getUTCDay())) continue;
      total += Math.max(
        0,
        Math.min(to, start + 18.5 * hour) - Math.max(from, start + 8 * hour)
      );
    }
    return total;
  }
  const base = Date.parse('2025-12-01T00:00:00Z');
  for (let i = 0; i < 200; i++) {
    const from = base + i * 13 * hour + i * 731;
    const to = from + ((i * 17) % 740) * day + ((i * 11) % 24) * hour;
    assert.equal(
      WorkTime.milliseconds(from, to),
      daily(from, to),
      `range ${i}`
    );
  }
});

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

test('display dates preserve calendar dates and convert timestamps to Manila consistently', () => {
  assert.equal(formatDate('2026-10-09'), '10/09/2026');
  assert.equal(formatDate('2024/02/29'), '02/29/2024');
  assert.equal(formatDate('10/09/2026'), '10/09/2026');
  assert.equal(formatDateTime('2026-12-31T16:05:00Z'), '01/01/2027 12:05 AM');
  assert.equal(formatDateTime('2026-10-29 17:14:00'), '10/29/2026 5:14 PM');
  assert.equal(formatDateTime('2026-10-09'), '10/09/2026');
  assert.equal(formatDate('2026-02-30'), '2026-02-30');
  assert.equal(formatDateTime(null, 'Not reached'), 'Not reached');
});

test('display times distinguish noon, midnight and durations without changing stored values', () => {
  assert.equal(formatTime('00:00:00'), '12:00 AM');
  assert.equal(formatTime('12:00'), '12:00 PM');
  assert.equal(formatTime('17:14'), '5:14 PM');
  assert.equal(formatTime('5:14 pm'), '5:14 PM');
  assert.equal(formatTime('25:00'), '25:00');
  assert.equal(formatField('08:00', 'text'), '08:00');
  assert.equal(formatField('2026-10-09', 'date'), '10/09/2026');
  assert.equal(
    formatField('2026-10-29T17:14', 'datetime-local'),
    '10/29/2026 5:14 PM'
  );
});

test('explicit date/time entry converts MM/DD/YYYY and AM/PM into native values', () => {
  assert.equal(parseInput('11/03/2026', 'date'), '2026-11-03');
  assert.equal(parseInput('03/11/2026', 'date'), '2026-03-11');
  assert.equal(parseInput('02/29/2024', 'date'), '2024-02-29');
  assert.equal(parseInput('02/29/2026', 'date'), '');
  assert.equal(parseInput('29/10/2026', 'date'), '');
  assert.equal(parseInput('12:00 AM', 'time'), '00:00');
  assert.equal(parseInput('12:00 PM', 'time'), '12:00');
  assert.equal(parseInput('5:14 pm', 'time'), '17:14');
  assert.equal(
    parseInput('11/03/2026 5:14 PM', 'datetime-local'),
    '2026-11-03T17:14'
  );
  assert.equal(parseInput('', 'date'), '');
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
