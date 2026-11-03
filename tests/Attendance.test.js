const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createHikConnectClient,
  providerOrigin
} = require('../server/integrations/HikConnectClient');
const {
  normalizeQuery,
  normalizeRecords,
  normalizeDailySummaries,
  manilaParts,
  getAttendanceContext
} = require('../server/services/AttendanceService');
const { pool } = require('../server/db/database');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const env = {
  HIKCONNECT_API_BASE_URL: 'https://api.hikcentralconnect.com',
  HIKCONNECT_APP_KEY: 'test-key',
  HIKCONNECT_SECRET_KEY: 'test-secret'
};
const query = {
  dateFrom: '2026-10-01',
  dateTo: '2026-10-02',
  page: 1,
  employee: 'Sample'
};
const response = (data) => ({
  ok: true,
  json: async () => ({ errorCode: '0', data })
});

// Exercise the complete merge/sort path without scanner credentials or a database.
function attendanceWithAccounts(accounts) {
  const filename = path.resolve(
    __dirname,
    '../server/services/AttendanceService.js'
  );
  const localRequire = createRequire(filename);
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === '../middleware/Auth')
        return { requirePerm: async () => ({ role: 'HR' }) };
      if (name === '../integrations/HikConnectAccounts')
        return {
          createHikConnectAccounts: () => ({
            accounts,
            configuration: () => ({ configured: true, missing: [] })
          })
        };
      return localRequire(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context.module.exports;
}

test('attendance remains sortable when names or departments and daily summaries are missing', async () => {
  const client = {
    search: async () => ({
      totalNum: 3,
      recordList: [
        {
          deviceTime: '2026-11-02T08:00:00+08:00',
          personInfo: { personCode: '1' }
        },
        {
          deviceTime: '2026-11-02T08:00:00+08:00',
          personInfo: { personCode: '2' }
        },
        {
          deviceTime: '2026-11-02T08:00:00+08:00',
          personInfo: { personCode: '3', groupName: 'Office' }
        }
      ]
    }),
    searchDailySummary: async () => {
      throw new Error('Summary unavailable');
    }
  };
  const result = await attendanceWithAccounts([
    { name: 'Account 1', client }
  ]).listAttendance({}, { dateFrom: '2026-11-02', dateTo: '2026-11-02' });
  assert.equal(result.total, 3);
  assert.equal(result.summaryAvailable, false);
  for (const row of result.rows)
    for (const field of ['firstName', 'lastName', 'department', 'weekday'])
      assert.equal(typeof row[field], 'string', field);
  assert.deepEqual(Array.from(result.departments), ['Office']);
});

test('attendance merges account departments without mixing duplicate employee IDs', async () => {
  const account = (name, department, time, status) => ({
    name,
    client: {
      search: async () => ({
        totalNum: 1,
        recordList: [
          {
            deviceTime: '2026-11-02T08:00:00+08:00',
            personInfo: {
              personCode: 'SAME-ID',
              firstName: name,
              lastName: 'Employee',
              groupName: department
            }
          }
        ]
      }),
      searchDailySummary: async () => ({
        moreData: 0,
        reportDataList: [
          {
            personCode: 'SAME-ID',
            date: '2026/11/02',
            clockInTime: time,
            attendanceStatus: status
          }
        ]
      })
    }
  });
  const service = attendanceWithAccounts([
    account('Account 1', 'Dept A', '08:00', 1),
    account('Account 2', 'Dept B', '09:00', 2)
  ]);
  const filters = { dateFrom: '2026-11-02', dateTo: '2026-11-02' };
  const result = await service.listAttendance({}, filters);
  assert.deepEqual(Array.from(result.departments), ['Dept A', 'Dept B']);
  assert.deepEqual(
    Array.from(result.rows, (row) => [row.department, row.timeIn, row.status]),
    [
      ['Dept A', '08:00', 'Normal'],
      ['Dept B', '09:00', 'Late']
    ]
  );
  const filtered = await service.listAttendance(
    {},
    { ...filters, department: 'Dept B' }
  );
  assert.equal(filtered.total, 1);
  assert.equal(filtered.rows[0].timeIn, '09:00');
});

test('a failed account does not return a successful partial attendance list', async () => {
  const client = {
    search: async () => ({ totalNum: 0, recordList: [] }),
    searchDailySummary: async () => ({ reportDataList: [], moreData: 0 })
  };
  const failed = {
    search: async () => {
      throw Object.assign(new Error('Provider unavailable'), { status: 422 });
    }
  };
  const service = attendanceWithAccounts([
    { name: 'Account 1', client },
    { name: 'Account 2', client: failed }
  ]);
  await assert.rejects(
    service.listAttendance(
      {},
      { dateFrom: '2026-11-02', dateTo: '2026-11-02' }
    ),
    {
      status: 422,
      message: 'Account 2: Provider unavailable'
    }
  );
});

test('attendance filters reject invalid dates, oversized ranges and invalid pagination', () => {
  for (const changes of [
    { dateFrom: '2026-02-30' },
    { dateTo: '2026-09-30' },
    { dateTo: '2026-11-02' },
    { page: 0 },
    { page: '1' },
    { employee: {} },
    { department: {} },
    { status: [] }
  ])
    assert.throws(() => normalizeQuery({ ...query, ...changes }), {
      status: 400
    });
  assert.deepEqual(normalizeQuery(query), {
    ...query,
    department: '',
    status: ''
  });
  assert.equal(
    normalizeQuery({}).dateFrom,
    manilaParts(new Date().toISOString()).date
  );
});

test('regional API hosts reject credential-bearing, insecure and unrelated URLs', () => {
  for (const origin of [
    'http://api.hikcentralconnect.com',
    'https://hikcentralconnect.com.attacker.test',
    'https://name:password@api.hikcentralconnect.com',
    'https://api.hikcentralconnect.com/api',
    'https://localhost'
  ])
    assert.throws(() => providerOrigin(origin), { status: 409 });
});

test('missing credentials stop before a network request', async () => {
  const client = createHikConnectClient({
    env: {},
    fetchImpl: () => assert.fail('Unexpected request')
  });
  assert.equal(client.configuration().configured, false);
  await assert.rejects(client.search(query), { status: 409 });
});

test('Hik-Connect authentication, cached tokens, region routing and transaction paging', async () => {
  const calls = [];
  const client = createHikConnectClient({
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options, body: JSON.parse(options.body) });
      if (url.pathname.endsWith('/token/get'))
        return response({
          accessToken: 'private-token',
          expireTime: Date.now() + 3600000,
          areaDomain: 'https://region.hikcentralconnect.com'
        });
      return response({ reportDataList: [], recordList: [] });
    }
  });
  await client.search({ ...query, providerPage: 1 });
  await client.search({ ...query, providerPage: 2 });
  await client.searchDailySummary({ ...query, providerPage: 1 });
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0].body, {
    appKey: env.HIKCONNECT_APP_KEY,
    secretKey: env.HIKCONNECT_SECRET_KEY
  });
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(
    calls[1].url,
    'https://region.hikcentralconnect.com/api/hccgw/acs/v1/event/certificaterecords/search'
  );
  assert.equal(calls[1].options.headers.Token, 'private-token');
  assert.equal(
    calls[1].body.searchCriteria.beginTime,
    '2026-10-01T00:00:00+08:00'
  );
  assert.equal(
    calls[1].body.searchCriteria.endTime,
    '2026-10-02T23:59:59+08:00'
  );
  assert.equal(
    calls[1].body.searchCriteria.personCondition.personName,
    'Sample'
  );
  assert.equal(calls[1].body.pageIndex, 1);
  assert.equal(calls[1].body.pageSize, 200);
  assert.equal(calls[1].body.searchCriteria.swipeAuthResult, 1);
  assert.equal(calls[2].body.pageIndex, 2);
  assert.deepEqual(calls[2].body.searchCriteria.personCondition, {
    personName: 'Sample'
  });
  assert.equal(
    calls[3].url,
    'https://region.hikcentralconnect.com/api/hccgw/attendance/v1/report/totaltimecard/list'
  );
  assert.equal(calls[3].body.beginTime, '2026-10-01T00:00:00+08:00');
  assert.equal(calls[3].body.personName, 'Sample');
  assert.ok(!calls[1].options.body.includes(env.HIKCONNECT_SECRET_KEY));
});

test('provider region cannot redirect tokens to an unrelated host', async () => {
  let count = 0;
  const client = createHikConnectClient({
    env,
    fetchImpl: async () => {
      count++;
      return response({
        accessToken: 'private-token',
        areaDomain: 'https://attacker.test'
      });
    }
  });
  await assert.rejects(client.search(query), { status: 409 });
  assert.equal(count, 1);
});

test('provider error bodies cannot expose credentials in feedback', async () => {
  const client = createHikConnectClient({
    env,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        errorCode: env.HIKCONNECT_SECRET_KEY,
        message: env.HIKCONNECT_SECRET_KEY
      })
    })
  });
  await assert.rejects(client.search(query), (error) => {
    assert.equal(error.status, 422);
    assert.ok(!error.message.includes(env.HIKCONNECT_SECRET_KEY));
    return true;
  });
});

test('normalization returns transaction columns, status, and Manila date parts only', () => {
  const rows = normalizeRecords({
    totalNum: 51,
    recordList: [
      {
        deviceTime: '2026-10-01T17:00:00+08:00',
        attendanceStatus: 2,
        deviceName: 'RAMY_BIO',
        devSerialNo: 'FN0430088',
        personInfo: {
          baseInfo: {
            firstName: 'Sample',
            lastName: 'Employee',
            personCode: 'E-100',
            fullPath: 'Head Office'
          }
        },
        secretField: 'must not leave server'
      }
    ]
  });
  assert.equal(rows[0].status, 'Not calculated');
  assert.equal(rows[0].employeeNo, 'E-100');
  assert.equal(rows[0].department, 'Head Office');
  assert.equal(rows[0].date, '2026-10-01');
  assert.equal(rows[0].time, '17:00');
  assert.equal(rows[0].weekday, 'Thursday');
  assert.equal(rows[0].dataSource, 'Device');
  assert.equal(rows[0].device, 'RAMY_BIO');
  assert.equal(rows[0].deviceSerialNo, 'FN0430088');
  assert.equal(rows[0].secretField, undefined);
  assert.throws(() => normalizeRecords({}), { status: 422 });
});

test('daily summaries supply clock-in, clock-out and calculated work hours', () => {
  const rows = normalizeDailySummaries({
    reportDataList: [
      {
        firstName: 'Sample',
        lastName: 'Employee',
        personCode: 'E-100',
        groupName: 'Head Office',
        date: '2026/10/01',
        weekday: 4,
        clockInTime: '08:28',
        clockOutTime: '17:14',
        workDuration: '08:00',
        attendanceStatus: 2,
        privateValue: 'not exposed'
      }
    ]
  });
  assert.deepEqual(rows[0], {
    firstName: 'Sample',
    lastName: 'Employee',
    employeeNo: 'E-100',
    department: 'Head Office',
    date: '2026-10-01',
    weekday: 'Thursday',
    timeIn: '08:28',
    timeOut: '17:14',
    workHours: '08:00',
    status: 'Late'
  });
  assert.throws(() => normalizeDailySummaries({}), { status: 422 });
});

test('only HR and ADMIN can access attendance, even when another role has emp.read', async (t) => {
  let role = 'HEAD';
  t.mock.method(pool, 'execute', async (sql) => {
    assert.ok(sql.includes('FROM user_roles'));
    return [
      [{ email: 'test@example.com', role, active: 1, extra_perms: 'emp.read' }]
    ];
  });
  const req = { session: { userEmail: 'test@example.com' } };
  for (role of ['STAFF', 'HEAD'])
    await assert.rejects(getAttendanceContext(req), { status: 403 });
  for (role of ['HR', 'ADMIN'])
    assert.equal(
      typeof (await getAttendanceContext(req)).configured,
      'boolean'
    );
});
