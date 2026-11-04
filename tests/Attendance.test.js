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
const { attendanceStatus } = require('../server/services/AttendanceRules');
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

test('attendance keeps account-scoped IDs separate and uses first scan time-in', async () => {
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
      ['Dept A', '08:00', 'On-time'],
      ['Dept B', '08:00', 'On-time']
    ]
  );
  const filtered = await service.listAttendance(
    {},
    { ...filters, department: 'Dept B' }
  );
  assert.equal(filtered.total, 1);
  assert.equal(filtered.rows[0].timeIn, '08:00');
});

test('attendance infers daily break times across device names and returns one daily row', async () => {
  const client = {
    search: async () => ({
      totalNum: 8,
      recordList: [
        ['07:37', 'RAMY_BIO'],
        ['10:22', 'COTI_BIO'],
        ['10:39', 'RAMY_BIO'],
        ['12:22', 'RAMY_BIO'],
        ['13:28', 'COTI_BIO'],
        ['15:37', 'RAMY_BIO'],
        ['15:54', 'COTI_BIO'],
        ['18:30', 'RAMY_BIO']
      ].map(([time, device], index) => ({
        deviceTime: `2026-10-31T${time}:00+08:00`,
        deviceName: device,
        devSerialNo: `device-event-${index}`,
        personInfo: {
          baseInfo: {
            personCode: '0102142',
            firstName: 'Marinel',
            lastName: 'Trevias',
            groupName: 'Accounting'
          }
        }
      }))
    }),
    searchDailySummary: async () => ({
      moreData: 0,
      reportDataList: [
        {
          personCode: '0102142',
          date: '2026/10/31',
          clockInTime: '07:37',
          clockOutTime: '18:30',
          workDuration: '09:38',
          attendanceStatus: 1
        }
      ]
    })
  };
  const result = await attendanceWithAccounts([
    { name: 'Account 1', client }
  ]).listAttendance({}, { dateFrom: '2026-10-31', dateTo: '2026-10-31' });

  assert.equal(result.total, 1);
  assert.deepEqual(
    [
      result.rows[0].employeeNo,
      result.rows[0].date,
      result.rows[0].device,
      result.rows[0].timeIn,
      result.rows[0].amBreakOut,
      result.rows[0].amBreakIn,
      result.rows[0].lunchOut,
      result.rows[0].lunchIn,
      result.rows[0].pmBreakOut,
      result.rows[0].pmBreakIn,
      result.rows[0].timeOut
    ],
    [
      '0102142',
      '2026-10-31',
      'RAMY_BIO, COTI_BIO',
      '07:37',
      '10:22',
      '10:39',
      '12:22',
      '13:28',
      '15:37',
      '15:54',
      '18:30'
    ]
  );
  assert.deepEqual(Array.from(result.rows[0].deviceNames), [
    'RAMY_BIO',
    'COTI_BIO'
  ]);
  assert.equal(result.rows[0].timeLogs[0].device, 'RAMY_BIO');
  assert.equal(result.rows[0].timeLogs[1].device, 'COTI_BIO');
  assert.ok(result.rows.every((row) => !Object.hasOwn(row, 'time')));
});

test('missing break punches stay blank and a detected lunch does not invent breaks', async () => {
  const client = {
    search: async () => ({
      totalNum: 4,
      recordList: ['07:37', '12:01', '12:48', '17:48'].map((time) => ({
        deviceTime: `2026-10-31T${time}:00+08:00`,
        deviceName: 'RAMY_BIO',
        personInfo: {
          baseInfo: {
            personCode: '0102142',
            firstName: 'Marinel',
            lastName: 'Trevias',
            groupName: 'Accounting'
          }
        }
      }))
    }),
    searchDailySummary: async () => ({
      moreData: 0,
      reportDataList: [
        {
          personCode: '0102142',
          date: '2026/10/31',
          clockInTime: '07:37',
          clockOutTime: '17:48',
          attendanceStatus: 1
        }
      ]
    })
  };
  const result = await attendanceWithAccounts([
    { name: 'Account 1', client }
  ]).listAttendance({}, { dateFrom: '2026-10-31', dateTo: '2026-10-31' });

  assert.equal(result.rows[0].lunchOut, '12:01');
  assert.equal(result.rows[0].lunchIn, '12:48');
  for (const field of ['amBreakOut', 'amBreakIn', 'pmBreakOut', 'pmBreakIn'])
    assert.equal(result.rows[0][field], '');
});

test('short lunches and repeated boundary scans do not become extra breaks', async (t) => {
  const cases = [
    {
      name: 'a short lunch is shown while its return is the latest available scan',
      times: ['08:16:21', '12:07:03', '12:26:55'],
      expected: ['08:16', '', '', '12:07', '12:26', '', '', '']
    },
    {
      name: 'ID 0105250 lunch stays visible before an end-of-day scan exists',
      times: ['07:48:10', '12:22:26', '12:58:12'],
      expected: ['07:48', '', '', '12:22', '12:58', '', '', '']
    },
    {
      name: 'a rescan after lunch in does not turn lunch in into time out',
      times: ['07:48:10', '12:22:26', '12:58:12', '12:58:35'],
      expected: ['07:48', '', '', '12:22', '12:58', '', '', '']
    },
    {
      name: 'a 19-minute midday lunch takes precedence over an AM break',
      times: ['08:16', '12:07', '12:26', '18:30'],
      expected: ['08:16', '', '', '12:07', '12:26', '', '', '18:30']
    },
    {
      name: 'arrival rescans are collapsed across devices and cannot become AM break out',
      times: [
        '07:47:00',
        '07:47:20',
        '07:58:00',
        '12:07',
        '12:26',
        '18:30:00',
        '18:31:00'
      ],
      expected: ['07:47', '', '', '12:07', '12:26', '', '', '18:31']
    },
    {
      name: 'the lunch-out scan cannot also be AM break in',
      times: ['08:16', '11:48', '12:07', '12:26', '15:10', '15:25', '18:30'],
      expected: ['08:16', '', '', '12:07', '12:26', '15:10', '15:25', '18:30']
    },
    {
      name: 'a short gap ending at departure is not a PM break',
      times: ['08:00', '12:07', '12:26', '18:15', '18:30'],
      expected: ['08:00', '', '', '12:07', '12:26', '', '', '18:30']
    },
    {
      name: 'a short midday lunch is displayed',
      times: ['08:00', '12:07', '12:12', '18:30'],
      expected: ['08:00', '', '', '12:07', '12:12', '', '', '18:30']
    }
  ];
  for (const { name, times, expected } of cases) {
    await t.test(name, async () => {
      const client = {
        search: async () => ({
          totalNum: times.length,
          recordList: times.map((time, index) => ({
            deviceTime: `2026-10-31T${time.length === 5 ? time + ':00' : time}+08:00`,
            deviceName: index % 2 ? 'COTI_BIO' : 'RAMY_BIO',
            personInfo: { personCode: 'E-100' }
          }))
        }),
        searchDailySummary: async () => ({ moreData: 0, reportDataList: [] })
      };
      const result = await attendanceWithAccounts([
        { name: 'Account 1', client }
      ]).listAttendance({}, { dateFrom: '2026-10-31', dateTo: '2026-10-31' });
      assert.equal(result.total, 1);
      const row = result.rows[0];
      assert.deepEqual(
        [
          row.timeIn,
          row.amBreakOut,
          row.amBreakIn,
          row.lunchOut,
          row.lunchIn,
          row.pmBreakOut,
          row.pmBreakIn,
          row.timeOut
        ],
        expected
      );
    });
  }
});

test('local attendance status handles the arrival cutoff, departure cutoff and missing punches', () => {
  for (const [arrival, departure, expected] of [
    ['08:10', '18:30', 'On-time'],
    ['08:11', '18:30', 'Late'],
    ['08:00', '18:29', 'Early departure'],
    ['08:11', '18:29', 'Late and early departure'],
    ['08:00', '19:00', 'On-time'],
    ['08:11', '', 'Late'],
    ['08:10', '', 'On-time'],
    ['', '', 'Absent'],
    ['', '18:30', 'Absent'],
    ['08:00', '07:00', 'On-time'],
    ['invalid', '18:30', 'Absent']
  ])
    assert.equal(
      attendanceStatus(arrival, departure),
      expected,
      `${arrival} to ${departure}`
    );
});

test('completed breaks appear immediately, preserve raw logs and respect start and duration grace periods', async (t) => {
  const cases = [
    { times: ['08:00', '09:57', '10:12'], period: 'AM', status: 'Normal' },
    { times: ['08:00', '10:03', '10:18'], period: 'AM', status: 'Normal' },
    { times: ['08:00', '09:57', '10:15'], period: 'AM', status: 'Abnormal' },
    { times: ['08:00', '10:00', '10:04'], period: 'AM', status: 'Normal' },
    { times: ['08:00', '10:00', '11:00'], period: 'AM', status: 'Abnormal' },
    { times: ['08:00', '09:56', '10:11'], period: 'AM', status: 'Abnormal' },
    { times: ['08:00', '10:04', '10:19'], period: 'AM', status: 'Abnormal' },
    { times: ['08:00', '10:00', '10:18'], period: 'AM', status: 'Abnormal' },
    {
      times: ['08:00', '10:00:00', '10:15:01'],
      period: 'AM',
      status: 'Abnormal'
    },
    {
      times: ['08:00', '12:00', '13:00', '14:57', '15:12'],
      period: 'PM',
      status: 'Normal'
    },
    {
      times: ['08:00', '12:00', '13:00', '15:03', '15:18'],
      period: 'PM',
      status: 'Normal'
    },
    {
      times: ['08:00', '12:00', '13:00', '15:04', '15:19'],
      period: 'PM',
      status: 'Abnormal'
    },
    {
      times: ['08:00', '12:00', '13:00', '15:00', '15:18'],
      period: 'PM',
      status: 'Abnormal'
    },
    {
      times: ['08:00', '12:00', '13:00', '15:00', '16:00'],
      period: 'PM',
      status: 'Abnormal'
    },
    { times: ['08:00', '15:00', '15:15'], period: 'PM', status: 'Normal' }
  ];
  for (const { times, period, status } of cases)
    await t.test(times.join(', '), async () => {
      const client = {
        search: async () => ({
          totalNum: times.length,
          recordList: times.map((time) => ({
            deviceTime: `2026-10-31T${time.length === 5 ? time + ':00' : time}+08:00`,
            personInfo: { personCode: 'E-100' }
          }))
        }),
        searchDailySummary: async () => ({ moreData: 0, reportDataList: [] })
      };
      const result = await attendanceWithAccounts([
        { name: 'Account 1', client }
      ]).listAttendance({}, { dateFrom: '2026-10-31', dateTo: '2026-10-31' });
      const row = result.rows[0];
      const prefix = period === 'AM' ? 'am' : 'pm';
      assert.equal(row[`${prefix}BreakOut`], times.at(-2).slice(0, 5));
      assert.equal(row[`${prefix}BreakIn`], times.at(-1).slice(0, 5));
      assert.equal(
        row.breakStatuses.find((badge) => badge.period === period).status,
        status
      );
      assert.equal(row.timeOut, '');
      assert.equal(row.workHours, '');
      assert.equal(row.status, 'On-time');
      assert.equal(row.timeLogs.length, times.length);
    });
});

test('overtime starts at 7:01 PM and can be filtered alongside arrival status', async () => {
  const days = [
    ['E-1', '08:00', '19:00'],
    ['E-2', '08:00', '19:01'],
    ['E-3', '08:11', '20:00']
  ];
  const client = {
    search: async () => ({
      totalNum: days.length * 2,
      recordList: days.flatMap(([personCode, start, end]) =>
        [start, end].map((time) => ({
          deviceTime: `2026-10-31T${time}:00+08:00`,
          personInfo: { personCode }
        }))
      )
    }),
    searchDailySummary: async () => ({ moreData: 0, reportDataList: [] })
  };
  const service = attendanceWithAccounts([{ name: 'Account 1', client }]);
  const filters = { dateFrom: '2026-10-31', dateTo: '2026-10-31' };
  const result = await service.listAttendance({}, filters);
  const find = (id) => result.rows.find((row) => row.employeeNo === id);
  assert.equal(find('E-1').overtime, false);
  assert.equal(find('E-2').overtime, true);
  assert.equal(find('E-2').status, 'On-time');
  assert.equal(find('E-3').overtime, true);
  assert.equal(find('E-3').status, 'Late');
  assert.ok(result.statuses.includes('Overtime'));
  const filtered = await service.listAttendance(
    {},
    { ...filters, status: 'Overtime' }
  );
  assert.deepEqual(Array.from(filtered.rows, (row) => row.employeeNo).sort(), [
    'E-2',
    'E-3'
  ]);
});

test('lunch status uses its allowed start window and permits up to one hour', async (t) => {
  for (const [out, back, expected] of [
    ['11:55:00', '12:55:00', 'Normal'],
    ['12:10:00', '13:10:00', 'Normal'],
    ['11:54:59', '12:54:59', 'Abnormal'],
    ['12:10:01', '13:10:01', 'Abnormal'],
    ['12:00:00', '12:03:00', 'Normal'],
    ['12:00:00', '12:59:00', 'Normal'],
    ['12:00:00', '13:01:00', 'Abnormal'],
    ['12:00:00', '13:00:01', 'Abnormal']
  ]) {
    await t.test(`${out} to ${back}`, async () => {
      const times = ['08:00:00', out, back];
      const client = {
        search: async () => ({
          totalNum: times.length,
          recordList: times.map((time) => ({
            deviceTime: `2026-10-31T${time}+08:00`,
            personInfo: { personCode: 'E-100' }
          }))
        }),
        searchDailySummary: async () => ({ moreData: 0, reportDataList: [] })
      };
      const result = await attendanceWithAccounts([
        { name: 'Account 1', client }
      ]).listAttendance({}, { dateFrom: '2026-10-31', dateTo: '2026-10-31' });
      const row = result.rows[0];
      assert.equal(row.lunchOut, out.slice(0, 5));
      assert.equal(row.lunchIn, back.slice(0, 5));
      assert.equal(
        row.breakStatuses.find((entry) => entry.period === 'Lunch').status,
        expected
      );
      assert.equal(row.timeOut, '');
    });
  }
});

test('daily reports include employees without scans and local status overrides device status', async () => {
  const client = {
    search: async () => ({ totalNum: 0, recordList: [] }),
    searchDailySummary: async () => ({
      moreData: 0,
      reportDataList: [
        {
          personCode: 'ABSENT',
          date: '2026/10/31',
          attendanceStatus: 1,
          groupName: 'Accounting'
        },
        {
          personCode: 'PENDING',
          date: '2026/10/31',
          clockInTime: '08:11',
          attendanceStatus: 2
        },
        {
          personCode: 'EARLY',
          date: '2026/10/31',
          clockInTime: '08:00',
          clockOutTime: '17:00',
          attendanceStatus: 1
        },
        { personCode: 'HALF', date: '2026/10/31', attendanceStatus: 6 }
      ]
    })
  };
  const service = attendanceWithAccounts([{ name: 'Account 1', client }]);
  const filters = { dateFrom: '2026-10-31', dateTo: '2026-10-31' };
  const result = await service.listAttendance({}, filters);
  const find = (id) => result.rows.find((row) => row.employeeNo === id);
  assert.equal(find('ABSENT').status, 'Absent');
  assert.equal(find('PENDING').status, 'Late');
  assert.equal(find('EARLY').status, 'Early departure');
  assert.equal(find('HALF').status, 'Absent');
  assert.equal(find('ABSENT').timeLogs.length, 0);
  const filtered = await service.listAttendance(
    {},
    { ...filters, status: 'Absent' }
  );
  assert.deepEqual(Array.from(filtered.rows, (row) => row.employeeNo).sort(), [
    'ABSENT',
    'HALF'
  ]);
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

test('attendance filters reject invalid dates, oversized ranges and invalid filter types', () => {
  for (const changes of [
    { dateFrom: '2026-02-30' },
    { dateTo: '2026-09-30' },
    { dateTo: '2026-11-02' },
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

test('normalization returns transaction columns and Manila date parts without device status', () => {
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
  assert.equal(rows[0].status, undefined);
  assert.equal(rows[0].attendanceStatusCode, undefined);
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

test('daily summaries supply time data without device status or computed work hours', () => {
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
    timeOut: '17:14'
  });
  assert.throws(() => normalizeDailySummaries({}), { status: 422 });
});

test('time logs keep scans in chronological order with their device serial numbers', async () => {
  const scans = [
    ['10:00:45', 'A'],
    ['08:00:00', 'A'],
    ['10:00:20', 'A'],
    ['10:00:20', 'B'],
    ['10:00:20', 'A']
  ];
  const client = {
    search: async () => ({
      totalNum: scans.length,
      recordList: scans.map(([time, serial]) => ({
        deviceTime: `2026-10-31T${time}+08:00`,
        deviceName: 'Scanner',
        devSerialNo: serial,
        personInfo: { personCode: 'E-100' }
      }))
    }),
    searchDailySummary: async () => ({ moreData: 0, reportDataList: [] })
  };
  const result = await attendanceWithAccounts([
    { name: 'Account 1', client }
  ]).listAttendance({}, { dateFrom: '2026-10-31', dateTo: '2026-10-31' });

  assert.equal(result.total, 1);
  assert.deepEqual(
    Array.from(result.rows[0].timeLogs, (log) => [
      log.time,
      log.seconds,
      log.deviceSerialNo
    ]),
    [
      ['08:00', '00', 'A'],
      ['10:00', '20', 'A'],
      ['10:00', '20', 'B'],
      ['10:00', '20', 'A'],
      ['10:00', '45', 'A']
    ]
  );
});

test('extra midday scans do not hide the last departure or change gross work hours', async () => {
  const examples = [
    {
      scans: ['08:36:53', '12:02:45', '12:30:57', '13:00:47', '18:01:01'],
      hours: '9h 25m'
    },
    {
      scans: ['07:47:22', '12:04:06', '12:38:29', '12:49:33', '18:31:43'],
      hours: '10h 44m'
    },
    {
      scans: ['08:07:57', '12:00:56', '12:50:58', '12:55:56', '17:00:19'],
      hours: '8h 53m'
    }
  ];
  const client = {
    search: async () => ({
      totalNum: 15,
      recordList: examples.flatMap(({ scans }, index) =>
        scans.map((time) => ({
          deviceTime: `2026-10-31T${time}+08:00`,
          deviceName: 'Scanner',
          personInfo: { personCode: `E-${index}` }
        }))
      )
    }),
    searchDailySummary: async () => ({
      moreData: 0,
      reportDataList: examples.map((_, index) => ({
        personCode: `E-${index}`,
        date: '2026-10-31',
        workDuration: 'Unreliable provider value'
      }))
    })
  };
  const result = await attendanceWithAccounts([
    { name: 'Account 1', client }
  ]).listAttendance({}, { dateFrom: '2026-10-31', dateTo: '2026-10-31' });
  examples.forEach(({ scans, hours }, index) => {
    const row = result.rows.find(
      (record) => record.employeeNo === `E-${index}`
    );
    assert.equal(row.timeIn, scans[0].slice(0, 5));
    assert.equal(row.timeOut, scans.at(-1).slice(0, 5));
    assert.equal(row.workHours, hours);
    assert.equal(row.timeLogs.length, scans.length);
  });
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
