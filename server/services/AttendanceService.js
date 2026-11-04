const { requirePerm } = require('../middleware/Auth');
const { httpError } = require('../utils/HttpError');
const { isValidDate, manilaDate } = require('../../shared/DateUtils');
const {
  ATTENDANCE_RULES,
  minutesOfDay,
  attendanceStatus,
  isOvertime,
  breakStatus
} = require('./AttendanceRules');
const {
  createHikConnectAccounts
} = require('../integrations/HikConnectAccounts');

const providers = createHikConnectAccounts();
const text = (value) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).slice(0, 200)
    : '';
const attendanceCache = new Map();
const PROVIDER_PAGE_SIZE = 200;
const MAX_PROVIDER_ROWS = 10000;
const BREAK_RULES = {
  lunchStart: 10 * 60 + 30,
  shortLunchStart: 11 * 60 + 30,
  lunchEnd: 14 * 60 + 30,
  lunchDurationMin: 2,
  earlyLunchDurationMin: 30,
  lunchDurationMax: 120,
  // Recognition remains wider than the permitted duration so overlong breaks
  // can be displayed and flagged, rather than disappearing from the table.
  breakDurationMin: 2,
  breakDurationMax: 120,
  expectedLunch: 12 * 60,
  expectedMorningBreak: ATTENDANCE_RULES.morningBreak,
  expectedAfternoonBreak: ATTENDANCE_RULES.afternoonBreak,
  repeatScanMinutes: 2
};

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
        eventTimestamp: text(timestamp),
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
  return data.reportDataList.map((record) => ({
    firstName: text(record?.firstName),
    lastName: text(record?.lastName),
    employeeNo: text(record?.personCode),
    department: text(record?.groupName || record?.fullPath),
    date: text(record?.date).replaceAll('/', '-'),
    weekday:
      typeof record?.weekday === 'number' ? weekdays[record.weekday] || '' : '',
    timeIn: text(record?.clockInTime),
    timeOut: text(record?.clockOutTime)
  }));
}

function elapsedWorkHours(timeIn, timeOut) {
  const start = minutesOfDay(timeIn);
  const end = minutesOfDay(timeOut);
  if (start === null || end === null || end <= start) return '';
  const duration = end - start;
  return Math.floor(duration / 60) + 'h ' + (duration % 60) + 'm';
}

function inferDailyAttendance(events, summary = {}) {
  const ordered = events
    .filter(
      (event) =>
        minutesOfDay(event.time) !== null &&
        Number.isFinite(event.sortTime) &&
        event.sortTime > 0
    )
    .sort((a, b) => a.sortTime - b.sortTime);
  // Retain the original first/last scans for the day, but collapse rapid
  // rescans before looking for breaks, including rescans on another device.
  const distinct = [];
  for (const event of ordered) {
    const previous = distinct.at(-1);
    if (
      !previous ||
      event.sortTime - previous.sortTime > BREAK_RULES.repeatScanMinutes * 60000
    )
      distinct.push(event);
  }
  const gaps = [];
  // Arrival cannot be a break-out scan. Keep the latest pair available for
  // lunch detection: during the workday, the latest scan may be lunch in.
  for (let index = 1; index < distinct.length - 1; index++) {
    const start = distinct[index];
    const end = distinct[index + 1];
    const duration = (end.sortTime - start.sortTime) / 60000;
    const startMinute = minutesOfDay(start.time);
    if (duration > 0 && startMinute !== null) {
      gaps.push({
        index,
        start,
        end,
        duration,
        startMinute
      });
    }
  }

  const lunchCandidates = gaps.filter(
    ({ duration, startMinute }) =>
      duration >= BREAK_RULES.lunchDurationMin &&
      duration <= BREAK_RULES.lunchDurationMax &&
      startMinute >= BREAK_RULES.lunchStart &&
      startMinute <= BREAK_RULES.lunchEnd &&
      (duration >= BREAK_RULES.earlyLunchDurationMin ||
        startMinute >= BREAK_RULES.shortLunchStart)
  );
  lunchCandidates.sort(
    (a, b) =>
      Math.abs(a.startMinute - BREAK_RULES.expectedLunch) -
        Math.abs(b.startMinute - BREAK_RULES.expectedLunch) ||
      Math.abs(a.duration - 60) - Math.abs(b.duration - 60)
  );
  const lunch = lunchCandidates[0] || null;

  const morningCandidates = gaps.filter((gap) => {
    const isBeforeLunch = lunch
      ? gap.index + 1 < lunch.index
      : minutesOfDay(gap.end.time) < BREAK_RULES.shortLunchStart;
    return (
      isBeforeLunch &&
      gap.duration >= BREAK_RULES.breakDurationMin &&
      gap.duration <= BREAK_RULES.breakDurationMax
    );
  });
  const afternoonCandidates = gaps.filter((gap) => {
    const isAfterLunch = lunch
      ? gap.index > lunch.index + 1
      : gap.startMinute > BREAK_RULES.lunchEnd;
    return (
      isAfterLunch &&
      minutesOfDay(gap.end.time) < ATTENDANCE_RULES.regularOut &&
      gap.duration >= BREAK_RULES.breakDurationMin &&
      gap.duration <= BREAK_RULES.breakDurationMax
    );
  });
  const closestTo = (candidates, target) =>
    candidates.sort(
      (a, b) =>
        Math.abs(a.startMinute - target) - Math.abs(b.startMinute - target)
    )[0];
  const morningBreak = closestTo(
    morningCandidates,
    BREAK_RULES.expectedMorningBreak
  );
  const afternoonBreak = closestTo(
    afternoonCandidates,
    BREAK_RULES.expectedAfternoonBreak
  );

  return {
    ...summary,
    timeIn: ordered[0]?.time || summary.timeIn || '',
    amBreakOut: morningBreak?.start.time || '',
    amBreakIn: morningBreak?.end.time || '',
    lunchOut: lunch?.start.time || '',
    lunchIn: lunch?.end.time || '',
    pmBreakOut: afternoonBreak?.start.time || '',
    pmBreakIn: afternoonBreak?.end.time || '',
    breakStatuses: [
      breakStatus(morningBreak, 'AM'),
      breakStatus(lunch, 'Lunch'),
      breakStatus(afternoonBreak, 'PM')
    ].filter(Boolean),
    timeOut:
      distinct.length < 2 ||
      [morningBreak, lunch, afternoonBreak].some(
        (gap) => gap && gap.end === distinct.at(-1)
      )
        ? ''
        : ordered.at(-1).time
  };
}

function groupDailyAttendance(rows, summaryByEmployeeDay) {
  const grouped = new Map();
  for (const row of rows) {
    // Employee IDs are account-scoped; this function runs once per account.
    const key = JSON.stringify([row.employeeNo, row.date]);
    let daily = grouped.get(key);
    if (!daily) {
      daily = {
        ...row,
        events: [],
        timeLogs: [],
        devices: new Set(),
        serialNumbers: new Set(),
        dataSources: new Set()
      };
      grouped.set(key, daily);
    }
    const eventKey = JSON.stringify([
      row.device,
      row.eventTimestamp || row.sortTime
    ]);
    if (!daily.eventKeys) daily.eventKeys = new Set();
    if (!daily.eventKeys.has(eventKey)) {
      daily.eventKeys.add(eventKey);
      daily.events.push(row);
    }
    daily.timeLogs.push(row);
    if (row.device) daily.devices.add(row.device);
    if (row.deviceSerialNo) daily.serialNumbers.add(row.deviceSerialNo);
    if (row.dataSource) daily.dataSources.add(row.dataSource);
    for (const field of ['firstName', 'lastName', 'department', 'weekday'])
      daily[field] ||= row[field];
    daily.sortTime = Math.max(daily.sortTime, row.sortTime);
  }
  return [...grouped.values()].map((row) => {
    const summary =
      summaryByEmployeeDay.get(JSON.stringify([row.employeeNo, row.date])) ||
      {};
    const inferred = inferDailyAttendance(row.events, summary);
    const identity = {
      firstName: row.firstName,
      lastName: row.lastName,
      department: row.department,
      weekday: row.weekday
    };
    Object.assign(row, inferred);
    for (const [field, value] of Object.entries(identity)) row[field] ||= value;
    row.timeLogs = row.timeLogs
      .sort((a, b) => a.sortTime - b.sortTime)
      .map((event) => ({
        time: event.time,
        seconds:
          /[T ]\d{2}:\d{2}:(\d{2})/.exec(event.eventTimestamp)?.[1] || '',
        deviceSerialNo: event.deviceSerialNo,
        device: event.device
      }));
    row.workHours = elapsedWorkHours(row.timeIn, row.timeOut);
    row.status = attendanceStatus(row.timeIn, row.timeOut);
    row.overtime = isOvertime(row.timeIn, row.timeOut);
    row.deviceNames = [...row.devices];
    row.device = row.deviceNames.join(', ');
    row.deviceSerialNo = [...row.serialNumbers].join(', ');
    row.dataSource = [...row.dataSources].join(', ');
    delete row.events;
    delete row.eventKeys;
    delete row.devices;
    delete row.serialNumbers;
    delete row.dataSources;
    delete row.time;
    delete row.eventTimestamp;
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
      JSON.stringify([summary.employeeNo, summary.date]),
      summary
    ])
  );
  for (const row of allRows) {
    const summary =
      summaryByEmployeeDay.get(JSON.stringify([row.employeeNo, row.date])) ||
      {};
    row.firstName ||= text(summary.firstName);
    row.lastName ||= text(summary.lastName);
    row.department ||= text(summary.department);
    row.weekday ||= text(summary.weekday);
  }
  const dailyRows = groupDailyAttendance(allRows, summaryByEmployeeDay);
  const knownDays = new Set(
    dailyRows.map((row) => JSON.stringify([row.employeeNo, row.date]))
  );
  for (const [key, summary] of summaryByEmployeeDay) {
    if (
      knownDays.has(key) ||
      !summary.employeeNo ||
      !isValidDate(summary.date) ||
      summary.date < query.dateFrom ||
      summary.date > query.dateTo
    )
      continue;
    const timeIn = minutesOfDay(summary.timeIn) === null ? '' : summary.timeIn;
    const timeOut =
      minutesOfDay(summary.timeOut) === null ? '' : summary.timeOut;
    dailyRows.push({
      ...summary,
      timeIn,
      timeOut,
      amBreakOut: '',
      amBreakIn: '',
      lunchOut: '',
      lunchIn: '',
      pmBreakOut: '',
      pmBreakIn: '',
      workHours: elapsedWorkHours(timeIn, timeOut),
      status: attendanceStatus(timeIn, timeOut),
      overtime: isOvertime(timeIn, timeOut),
      breakStatuses: [],
      timeLogs: [],
      dataSource: 'Daily report',
      device: '',
      deviceNames: [],
      deviceSerialNo: '',
      sortTime: Date.parse(`${summary.date}T00:00:00+08:00`)
    });
  }
  return {
    rows: dailyRows,
    summaryAvailable
  };
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
    cached = {
      rows: allRows,
      departments,
      summaryAvailable,
      fetchedAt: new Date().toISOString(),
      expiresAt: Date.now() + 60000
    };
    attendanceCache.set(cacheKey, cached);
    while (attendanceCache.size > 5)
      attendanceCache.delete(attendanceCache.keys().next().value);
  }
  const statuses = [
    ...new Set(
      cached.rows.flatMap((row) =>
        row.overtime ? [row.status, 'Overtime'] : [row.status]
      )
    )
  ].sort((a, b) => a.localeCompare(b));
  const filtered = cached.rows
    .filter((row) => !query.department || row.department === query.department)
    .filter(
      (row) =>
        !query.status ||
        (query.status === 'Overtime'
          ? row.overtime
          : row.status === query.status)
    )
    .sort(
      (a, b) =>
        a.department.localeCompare(b.department) ||
        b.sortTime - a.sortTime ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName)
    );
  return {
    rows: filtered.map(({ sortTime, ...row }) => row),
    departments: cached.departments,
    statuses,
    summaryAvailable: cached.summaryAvailable,
    total: filtered.length,
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
