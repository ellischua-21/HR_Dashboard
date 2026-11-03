const { requirePerm } = require('../middleware/Auth');
const { httpError } = require('../utils/HttpError');
const { isValidDate, manilaDate } = require('../../shared/DateUtils');
const {
  createHikConnectAccounts
} = require('../integrations/HikConnectAccounts');

const providers = createHikConnectAccounts();
const text = (value) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).slice(0, 200)
    : '';
const attendanceCache = new Map();
const PAGE_SIZE = 50;
const PROVIDER_PAGE_SIZE = 200;
const MAX_PROVIDER_ROWS = 10000;

async function requireAttendanceAccess(req) {
  const user = await requirePerm(req, 'emp.read');
  if (!['HR', 'ADMIN'].includes(user.role)) {
    throw httpError('Only HR and Admin can view attendance.', 403);
  }
}

function normalizeQuery(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError('Enter valid attendance filters.', 400);
  }
  const dateFrom = input.dateFrom || manilaDate();
  const dateTo = input.dateTo || dateFrom;
  if (!isValidDate(dateFrom) || !isValidDate(dateTo) || dateFrom > dateTo) {
    throw httpError('Choose a valid start and end date.', 400);
  }
  const days = (Date.parse(dateTo) - Date.parse(dateFrom)) / 86400000 + 1;
  if (days > 31) throw httpError('Select up to 31 days at a time.', 400);
  const page = input.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 10000) {
    throw httpError('Choose a valid page.', 400);
  }
  if (input.employee !== undefined && typeof input.employee !== 'string') {
    throw httpError('Enter a valid employee name.', 400);
  }
  for (const key of ['department', 'status']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') {
      throw httpError(`Choose a valid ${key}.`, 400);
    }
  }
  return {
    dateFrom,
    dateTo,
    page,
    employee: (input.employee || '').trim().slice(0, 100),
    department: (input.department || '').trim().slice(0, 200),
    status: (input.status || '').trim().slice(0, 100)
  };
}

function manilaParts(value) {
  const raw = text(value);
  if (!raw) return { date: '', time: '', weekday: '', sortTime: 0 };
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  let date;
  if (hasZone) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(parsed);
      const part = (type) =>
        parts.find((item) => item.type === type)?.value || '';
      const timeParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).formatToParts(parsed);
      const timePart = (type) =>
        timeParts.find((item) => item.type === type)?.value || '';
      date = `${part('year')}-${part('month')}-${part('day')}`;
      const time = `${timePart('hour')}:${timePart('minute')}`;
      return {
        date,
        time,
        weekday: new Intl.DateTimeFormat('en-PH', {
          timeZone: 'Asia/Manila',
          weekday: 'long'
        }).format(parsed),
        sortTime: parsed.getTime()
      };
    }
  }
  const match = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2})/);
  if (match) {
    date = `${match[1]}-${match[2]}-${match[3]}`;
    const localDay = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    );
    return {
      date,
      time: `${match[4]}:${match[5]}`,
      weekday: new Intl.DateTimeFormat('en-PH', {
        weekday: 'long',
        timeZone: 'UTC'
      }).format(localDay),
      sortTime: Date.parse(`${date}T${match[4]}:${match[5]}:00+08:00`)
    };
  }
  return {
    date: raw.slice(0, 10),
    time: raw.slice(11, 16),
    weekday: '',
    sortTime: 0
  };
}

function normalizeRecords(data) {
  const list = data?.recordList;
  if (!Array.isArray(list)) {
    throw httpError(
      'Hik-Connect returned an unexpected attendance format. Check the API product and permissions.',
      422
    );
  }
  const rows = list
    .map((record) => {
      if (!record || typeof record !== 'object') return null;
      const person = record.personInfo?.baseInfo || record.personInfo || {};
      const personName = text(person.fullName);
      const timestamp = record.deviceTime || record.occurTime;
      const when = manilaParts(timestamp);
      return {
        firstName: text(person.firstName) || personName,
        lastName: text(person.lastName),
        employeeNo: text(person.personCode),
        department: text(
          person.groupName ||
            person.fullPath ||
            person.groupFullPath ||
            record.personInfo?.groupName
        ),
        date: when.date,
        time: when.time,
        weekday: when.weekday,
        dataSource: text(record.dataSource) || 'Device',
        device: text(record.deviceName || record.elementName),
        deviceSerialNo: text(record.devSerialNo || record.serialNo),
        status: 'Not calculated',
        attendanceStatusCode: Number(record.attendanceStatus),
        sortTime: when.sortTime
      };
    })
    .filter(Boolean);
  return rows;
}

function normalizeDailySummaries(data) {
  if (!Array.isArray(data?.reportDataList)) {
    throw httpError(
      'Hik-Connect returned an unexpected daily attendance format.',
      422
    );
  }
  const weekdays = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];
  const attendanceStatuses = [
    'Not calculated',
    'Normal',
    'Late',
    'Early departure',
    'Late and early departure',
    'Absent',
    'Leave'
  ];
  return data.reportDataList.map((record) => ({
    firstName: text(record?.firstName),
    lastName: text(record?.lastName),
    employeeNo: text(record?.personCode),
    department: text(record?.groupName || record?.fullPath),
    date: text(record?.date).replaceAll('/', '-'),
    weekday:
      typeof record?.weekday === 'number' ? weekdays[record.weekday] || '' : '',
    timeIn: text(record?.clockInTime),
    timeOut: text(record?.clockOutTime),
    workHours: text(record?.workDuration),
    status:
      attendanceStatuses[Number(record?.attendanceStatus)] || 'Not calculated'
  }));
}

function groupDeviceAttendance(rows) {
  const grouped = new Map();
  for (const row of rows) {
    // A device can record several punches for the same employee on one day.
    // Keep separate rows when the employee used a different named device.
    const key = JSON.stringify([row.employeeNo, row.date, row.device]);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        ...row,
        serialNumbers: new Set(row.deviceSerialNo ? [row.deviceSerialNo] : [])
      });
      continue;
    }
    for (const field of [
      'firstName',
      'lastName',
      'department',
      'weekday',
      'timeIn',
      'timeOut',
      'workHours',
      'status'
    ]) {
      existing[field] ||= row[field];
    }
    if (
      row.dataSource &&
      !existing.dataSource.split(', ').includes(row.dataSource)
    )
      existing.dataSource = [existing.dataSource, row.dataSource]
        .filter(Boolean)
        .join(', ');
    if (row.deviceSerialNo) existing.serialNumbers.add(row.deviceSerialNo);
    existing.sortTime = Math.max(existing.sortTime, row.sortTime);
  }
  return [...grouped.values()].map((row) => {
    row.deviceSerialNo = [...row.serialNumbers].join(', ');
    delete row.serialNumbers;
    delete row.time;
    return row;
  });
}

// Enrich each account separately: employee IDs are only unique within that account.
async function loadAccountAttendance(client, query) {
  const allRows = [];
  let providerPage = 1;
  let total = null;
  while (total === null || allRows.length < total) {
    const data = await client.search({ ...query, providerPage });
    const rows = normalizeRecords(data);
    allRows.push(...rows);
    total = Number(data.totalNum);
    if (!Number.isFinite(total) || total < 0) total = allRows.length;
    if (allRows.length >= MAX_PROVIDER_ROWS && allRows.length < total) {
      throw httpError(
        'This date range has too many records to sort. Narrow the date range and try again.',
        422
      );
    }
    if (!rows.length || rows.length < PROVIDER_PAGE_SIZE) break;
    providerPage++;
  }
  const summaries = [];
  providerPage = 1;
  let hasMoreSummaries = true;
  let summaryAvailable = false;
  try {
    while (hasMoreSummaries) {
      if (providerPage > MAX_PROVIDER_ROWS / PROVIDER_PAGE_SIZE) {
        throw httpError(
          'This date range has too many daily summaries to load. Narrow the date range and try again.',
          422
        );
      }
      const data = await client.searchDailySummary({
        ...query,
        providerPage
      });
      if (!Array.isArray(data?.reportDataList)) {
        throw httpError(
          'Hik-Connect returned an unexpected daily attendance format.',
          422
        );
      }
      summaries.push(...normalizeDailySummaries(data));
      hasMoreSummaries = Number(data.moreData) === 1;
      if (summaries.length >= MAX_PROVIDER_ROWS && hasMoreSummaries) {
        throw httpError(
          'This date range has too many daily summaries to load. Narrow the date range and try again.',
          422
        );
      }
      if (hasMoreSummaries) providerPage++;
    }
    summaryAvailable = summaries.length > 0;
  } catch {
    summaries.length = 0;
  }
  const summaryByEmployeeDay = new Map(
    summaries.map((summary) => [
      `${summary.employeeNo}|${summary.date}`,
      summary
    ])
  );
  const punchesByEmployeeDay = new Map();
  for (const row of allRows) {
    const key = `${row.employeeNo}|${row.date}`;
    let punches = punchesByEmployeeDay.get(key);
    if (!punches) {
      punches = { timeIn: '', timeOut: '' };
      punchesByEmployeeDay.set(key, punches);
    }
    if (
      row.attendanceStatusCode === 1 &&
      (!punches.timeIn || row.sortTime < punches.inSortTime)
    ) {
      punches.timeIn = row.time;
      punches.inSortTime = row.sortTime;
    }
    if (
      row.attendanceStatusCode === 2 &&
      (!punches.timeOut || row.sortTime > punches.outSortTime)
    ) {
      punches.timeOut = row.time;
      punches.outSortTime = row.sortTime;
    }
  }
  for (const row of allRows) {
    const key = `${row.employeeNo}|${row.date}`;
    const summary = summaryByEmployeeDay.get(key) || {};
    const punches = punchesByEmployeeDay.get(key) || {};
    row.firstName ||= text(summary.firstName);
    row.lastName ||= text(summary.lastName);
    row.department ||= text(summary.department);
    row.weekday ||= text(summary.weekday);
    row.timeIn = summary.timeIn || punches.timeIn || '';
    row.timeOut = summary.timeOut || punches.timeOut || '';
    row.workHours = summary.workHours || '';
    row.status = summary.status || 'Not calculated';
  }
  return { rows: groupDeviceAttendance(allRows), summaryAvailable };
}

async function getAttendanceContext(req) {
  await requireAttendanceAccess(req);
  return providers.configuration();
}

async function listAttendance(req, input) {
  await requireAttendanceAccess(req);
  const query = normalizeQuery(input);
  const cacheKey = JSON.stringify([
    query.dateFrom,
    query.dateTo,
    query.employee
  ]);
  const now = Date.now();
  if (input?.refresh === true) attendanceCache.delete(cacheKey);
  let cached = attendanceCache.get(cacheKey);
  if (!cached || cached.expiresAt <= now) {
    cached = null;
    const configuration = providers.configuration();
    if (!configuration.configured)
      throw httpError(
        'Complete the Hik-Connect account settings in .env and restart the Node.js server.',
        409
      );
    const batches = await Promise.all(
      providers.accounts.map(async ({ client, name }) => {
        try {
          return await loadAccountAttendance(client, query);
        } catch (error) {
          throw httpError(
            name +
              ': ' +
              (error.status ? error.message : 'Could not load attendance.'),
            error.status || 422
          );
        }
      })
    );
    const allRows = batches.flatMap((batch) => batch.rows);
    const summaryAvailable = batches.every((batch) => batch.summaryAvailable);
    const departments = [
      ...new Set(allRows.map((row) => row.department).filter(Boolean))
    ].sort((a, b) => a.localeCompare(b));
    const statuses = [
      ...new Set(allRows.map((row) => row.status).filter(Boolean))
    ].sort((a, b) => a.localeCompare(b));
    cached = {
      rows: allRows,
      departments,
      statuses,
      summaryAvailable,
      fetchedAt: new Date().toISOString(),
      expiresAt: Date.now() + 60000
    };
    attendanceCache.set(cacheKey, cached);
    while (attendanceCache.size > 5)
      attendanceCache.delete(attendanceCache.keys().next().value);
  }
  const filtered = cached.rows
    .filter((row) => !query.department || row.department === query.department)
    .filter((row) => !query.status || row.status === query.status)
    .sort(
      (a, b) =>
        a.department.localeCompare(b.department) ||
        b.sortTime - a.sortTime ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName)
    );
  const start = (query.page - 1) * PAGE_SIZE;
  return {
    rows: filtered
      .slice(start, start + PAGE_SIZE)
      .map(({ sortTime, attendanceStatusCode, ...row }) => row),
    departments: cached.departments,
    statuses: cached.statuses,
    summaryAvailable: cached.summaryAvailable,
    page: query.page,
    total: filtered.length,
    hasMore: start + PAGE_SIZE < filtered.length,
    fetchedAt: cached.fetchedAt
  };
}

module.exports = {
  getAttendanceContext,
  listAttendance,
  normalizeQuery,
  normalizeRecords,
  normalizeDailySummaries,
  manilaParts
};
