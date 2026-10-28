const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildReviewFilter,
  ACTIVE_CASE_SQL,
  NTE_CASE_SQL
} = require('../server/services/incident-management/Review');
const {
  incidentNotificationTarget
} = require('../server/services/incident-management/Tracking');

test('Review groups use the HR signature for waiting and processing, and formal closure for archives', () => {
  const waiting = buildReviewFilter({ category: 'WAITING' });
  const ongoing = buildReviewFilter({ category: 'ONGOING' });
  const all = buildReviewFilter({ category: 'ALL' });
  assert.match(waiting.sql, /NOT EXISTS/);
  assert.match(waiting.sql, /signatory_role = 'HR'/);
  assert.match(ongoing.sql, /AND EXISTS/);
  assert.match(waiting.sql, /status <> 'CLOSED'/);
  assert.match(ongoing.sql, /status <> 'CLOSED'/);
  assert.equal(
    buildReviewFilter({ category: 'CLOSED' }).sql,
    "incident_reports.status = 'CLOSED'"
  );
  assert.equal(all.sql, '1 = 1');
  assert.equal(ACTIVE_CASE_SQL, "incident_reports.status <> 'CLOSED'");
  assert.match(NTE_CASE_SQL, /'NTE ISSUED', 'EXPLANATION SENT', 'EVALUATION'/);
});

test('Review search binds literal wildcard characters and validates filters and page sizes', () => {
  const filter = buildReviewFilter({
    category: 'WAITING',
    stage: 'SIGNED',
    search: '  20%_!  ',
    page: 2
  });
  assert.deepEqual(filter.values, ['SIGNED', ...Array(4).fill('%20!%!_!!%')]);
  assert.match(filter.sql, /reporter_name LIKE/);
  assert.equal(filter.filters.pageSize, 25);
  for (const input of [
    null,
    [],
    { category: 'ANY' },
    { stage: "CLOSED' OR 1=1" },
    { page: 0 },
    { page: 1.2 },
    { pageSize: 51 },
    { search: 'x'.repeat(192) }
  ])
    assert.throws(() => buildReviewFilter(input), { status: 400 });
});

test('Review counters and paginated results are read from one database snapshot', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  t.mock.method(pool, 'execute', async () => [
    [{ email: 'hr@example.com', role: 'HR', active: 1 }]
  ]);
  let commits = 0;
  let releases = 0;
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    rollback: async () => {},
    commit: async () => {
      ++commits;
    },
    release: () => {
      ++releases;
    },
    execute: async (sql, values) => {
      if (sql.includes('FROM system_settings')) return [[]];
      if (sql.includes('FROM incident_ntes n')) return [[]]; // overdue sweep
      if (sql.includes('AS totalCases')) {
        assert.match(sql, /AS ongoing/);
        assert.match(sql, /AS waiting/);
        assert.match(sql, /AS filteredCount/);
        assert.deepEqual(values, Array(4).fill('%Employee%'));
        return [
          [
            {
              totalCases: '52',
              ongoing: '18',
              waiting: '12',
              nte: '12',
              closed: '16',
              filteredCount: '26'
            }
          ]
        ];
      }
      assert.match(sql, /LIMIT 25 OFFSET 25/);
      assert.match(sql, /MAX\(a.created_at\)/);
      assert.match(sql, /MAX\(s.signed_at\)/);
      assert.match(sql, /reporter_name AS reporterName/);
      assert.deepEqual(values, Array(4).fill('%Employee%'));
      return [
        [
          {
            id: 9,
            caseNumber: 'IR-9',
            status: 'UNDER_REVIEW',
            reporterName: 'Head'
          }
        ]
      ];
    }
  }));
  const result = await incidents.getIncidentReviewDashboard(
    { session: { userEmail: 'hr@example.com' } },
    { category: 'ONGOING', search: 'Employee', page: 100 }
  );
  assert.deepEqual(result.summary, {
    totalCases: 52,
    ongoing: 18,
    waiting: 12,
    nte: 12,
    closed: 16
  });
  assert.equal(result.total, 26);
  assert.equal(result.page, 2);
  assert.equal(result.pages, 2);
  assert.equal(result.cases[0].caseNumber, 'IR-9');
  assert.equal(commits, 2);
  assert.equal(releases, 2);
});

test('STAFF and HEAD cannot retrieve the Review dashboard even with inbox access', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  let role = 'STAFF';
  t.mock.method(pool, 'execute', async () => [
    [{ email: 'employee@example.com', role, active: 1 }]
  ]);
  t.mock.method(pool, 'getConnection', async () => {
    throw new Error('Review database queries must not run.');
  });
  for (role of ['STAFF', 'HEAD'])
    await assert.rejects(
      incidents.getIncidentReviewDashboard({
        session: { userEmail: 'employee@example.com' }
      }),
      { status: 403 }
    );
});

test('HR cannot issue a decision before evaluation or mutate an archived case', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  let status = 'UNDER_REVIEW';
  let rollbacks = 0;
  t.mock.method(pool, 'execute', async () => [
    [{ email: 'hr@example.com', role: 'HR', active: 1 }]
  ]);
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    release: () => {},
    rollback: async () => {
      ++rollbacks;
    },
    execute: async (sql) => {
      if (sql.includes('FROM incident_reports'))
        return [[{ id: 1, case_number: 'IR-1', status }]];
      if (sql.includes('FROM incident_evaluations')) return [[]];
      throw new Error(
        'No decision or case mutation is allowed without the required workflow state.'
      );
    }
  }));
  const req = { session: { userEmail: 'hr@example.com' } };
  const input = {
    signature: 'data:image/png;base64,aA==',
    outcome: 'NO_VIOLATION',
    decisionReason: 'Evaluation required.'
  };
  await assert.rejects(incidents.issueIncidentDecision(req, 1, input), {
    status: 409
  });
  status = 'EVALUATION';
  await assert.rejects(incidents.issueIncidentDecision(req, 1, input), {
    status: 409
  });
  status = 'CLOSED';
  await assert.rejects(
    incidents.transitionIncident(req, 1, 'CLOSE_DOCUMENTATION', 'Archived'),
    { status: 409 }
  );
  await assert.rejects(
    incidents.saveIncidentEvaluation(req, 1, {
      finding: 'NOT_SUBSTANTIATED',
      findings: 'Archived'
    }),
    { status: 409 }
  );
  assert.equal(rollbacks, 4);
});

test('event links open Track for all roles, including closed cases', () => {
  for (const role of ['HR', 'ADMIN'])
    for (const status of [
      'PENDING SIGNATURE',
      'NTE ISSUED',
      'EXPLANATION SENT',
      'CLOSED'
    ])
      assert.equal(incidentNotificationTarget(role, status), 'incident-track');
  for (const role of ['STAFF', 'HEAD']) {
    assert.equal(incidentNotificationTarget(role, 'CLOSED'), 'incident-track');
    assert.equal(
      incidentNotificationTarget(role, 'NTE ISSUED'),
      'incident-track'
    );
  }
});

test('reported employees see one combined filing and acknowledgment notification', async (t) => {
  const { pool } = require('../server/db/database');
  const { getInbox } = require('../server/services/InboxService');
  t.mock.method(pool, 'execute', async (sql) => {
    if (sql.includes('FROM user_roles WHERE email'))
      return [[{ email: 'employee@example.com', role: 'STAFF', active: 1 }]];
    if (sql.includes('FROM hr_announcements')) return [[]];
    if (sql.includes('FROM incident_notifications n'))
      return [
        [
          {
            notificationId: 12,
            notificationType: 'IR_SUBMITTED',
            createdAt: '2026-10-28T08:00:00Z',
            viewedAt: null,
            incidentId: 4,
            caseNumber: 'IR-4',
            subject: 'Test incident',
            reportedEmployeeName: 'Employee',
            reportedEmployeeEmail: 'employee@example.com',
            status: 'PENDING SIGNATURE',
            requiresAction: 0
          },
          {
            notificationId: 13,
            notificationType: 'EMPLOYEE_SIGNATURE',
            createdAt: '2026-10-28T08:00:00Z',
            viewedAt: null,
            incidentId: 4,
            caseNumber: 'IR-4',
            subject: 'Test incident',
            reportedEmployeeName: 'Employee',
            reportedEmployeeEmail: 'employee@example.com',
            status: 'PENDING SIGNATURE',
            requiresAction: 1
          }
        ]
      ];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const items = await getInbox({
    session: { userEmail: 'employee@example.com' }
  });
  const incidentItems = items.filter((item) => item.type === 'INCIDENT');
  assert.equal(incidentItems.length, 1);
  assert.equal(
    incidentItems[0].title,
    'Incident Report filed. Requires your acknowledgment and signature'
  );
  assert.equal(incidentItems[0].status, 'ACTION_REQUIRED');
  assert.equal(incidentItems[0].unseen, true);
});

test('assigned Heads receive one combined filing and signature notification', async (t) => {
  const { pool } = require('../server/db/database');
  const { getInbox } = require('../server/services/InboxService');
  t.mock.method(pool, 'execute', async (sql) => {
    if (sql.includes('FROM user_roles WHERE email'))
      return [[{ email: 'head@example.com', role: 'HEAD', active: 1 }]];
    if (sql.includes('FROM hr_announcements')) return [[]];
    if (sql.includes('FROM user_forms f')) return [[]];
    if (sql.includes('FROM incident_notifications n'))
      return [
        [
          {
            notificationId: 22,
            notificationType: 'IR_SUBMITTED',
            createdAt: '2026-10-28T08:00:00Z',
            viewedAt: null,
            incidentId: 5,
            caseNumber: 'IR-5',
            subject: 'Test incident',
            reportedEmployeeName: 'Employee',
            reportedEmployeeEmail: 'employee@example.com',
            status: 'PENDING SIGNATURE',
            requiresAction: 0
          },
          {
            notificationId: 23,
            notificationType: 'HEAD_SIGNATURE',
            createdAt: '2026-10-28T08:00:00Z',
            viewedAt: null,
            incidentId: 5,
            caseNumber: 'IR-5',
            subject: 'Test incident',
            reportedEmployeeName: 'Employee',
            reportedEmployeeEmail: 'employee@example.com',
            status: 'PENDING SIGNATURE',
            requiresAction: 1
          }
        ]
      ];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const items = await getInbox({ session: { userEmail: 'head@example.com' } });
  const incidentItems = items.filter((item) => item.type === 'INCIDENT');
  assert.equal(incidentItems.length, 1);
  assert.equal(
    incidentItems[0].title,
    'Incident Report filed. Requires your review and signature'
  );
  assert.equal(incidentItems[0].status, 'ACTION_REQUIRED');
});
