const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canViewIncident,
  incidentAccessScope,
  buildIncidentTracking
} = require('../server/services/incident-management/Tracking');

const report = {
  id: 12,
  status: 'PENDING SIGNATURE',
  reporterEmail: 'reporter@example.com',
  reportedEmployeeEmail: 'employee@example.com',
  assignedHeadEmail: 'head@example.com',
  createdAt: '2026-10-01T08:00:00Z'
};
const signatures = [
  { role: 'EMPLOYEE', signedAt: '2026-10-02T08:00:00Z' },
  { role: 'HEAD', signedAt: '2026-10-02T09:00:00Z' },
  { role: 'HR', signedAt: '2026-10-03T08:00:00Z' }
];
const stage = (tracking, key) =>
  tracking.stages.find((item) => item.key === key);

test('case access recognizes response and database field names, and rejects unrelated users', () => {
  for (const email of [
    'reporter@example.com',
    'EMPLOYEE@example.com',
    'head@example.com'
  ])
    assert.equal(canViewIncident({ role: 'STAFF', email }, report), true);
  assert.equal(
    canViewIncident({ role: 'HEAD', email: 'unrelated@example.com' }, report),
    false
  );
  assert.equal(
    canViewIncident(
      { role: 'STAFF', email: 'employee@example.com' },
      {
        reported_employee_email: 'employee@example.com'
      }
    ),
    true
  );
  for (const role of ['HR', 'ADMIN'])
    assert.equal(
      canViewIncident({ role, email: 'reviewer@example.com' }, report),
      true
    );
});

test('selector and badge scope includes case participants and denies unsupported roles', () => {
  const user = { role: 'HEAD', email: 'head@example.com' };
  const scope = incidentAccessScope(user);
  assert.match(scope.sql, /incident_participants/);
  assert.match(scope.sql, /reported_employee_email/);
  assert.deepEqual(scope.values, Array(4).fill(user.email));
  assert.equal(incidentAccessScope({ ...user, role: 'HR' }).sql, '1 = 1');
  assert.equal(incidentAccessScope({ ...user, role: 'UNKNOWN' }).sql, '1 = 0');
});

test('pending signatures remain current until both required acknowledgments exist', () => {
  const result = buildIncidentTracking(
    report,
    [signatures[0]],
    [],
    null,
    [],
    null
  );
  assert.equal(stage(result, 'PENDING SIGNATURE').state, 'current');
  assert.equal(stage(result, 'SIGNED').reachedAt, null);
  assert.equal(stage(result, 'SIGNED').state, 'upcoming');
});

test('signed stage dates use the last required signature and support a case without a Head', () => {
  const result = buildIncidentTracking(
    { ...report, status: 'SIGNED' },
    signatures,
    [],
    null,
    [],
    null
  );
  assert.equal(stage(result, 'SIGNED').reachedAt, signatures[1].signedAt);
  const noHead = buildIncidentTracking(
    { ...report, status: 'SIGNED', assignedHeadEmail: null },
    [signatures[0]],
    [],
    null,
    [],
    null
  );
  assert.equal(stage(noHead, 'SIGNED').reachedAt, signatures[0].signedAt);
});

test('a bypassed investigation is skipped rather than reported as completed', () => {
  const result = buildIncidentTracking(
    { ...report, status: 'EXPLANATION SENT' },
    signatures,
    [
      { action: 'NTE_ISSUED', createdAt: '2026-10-04T08:00:00Z' },
      { action: 'EXPLANATION_SENT', createdAt: '2026-10-05T08:00:00Z' }
    ],
    null,
    [],
    null
  );
  assert.equal(stage(result, 'UNDER INVESTIGATION').state, 'skipped');
  assert.equal(stage(result, 'NTE ISSUED').state, 'completed');
  assert.equal(stage(result, 'EXPLANATION SENT').state, 'current');
  assert.equal(stage(result, 'EVALUATION').state, 'upcoming');
});

test('early closure retains its stage and reason and discontinues the later path', () => {
  for (const [action, key] of [
    ['CLOSED_FOR_DOCUMENTATION', 'UNDER_REVIEW'],
    ['INVESTIGATION_CLOSED', 'UNDER INVESTIGATION']
  ]) {
    const activity = [
      ...(key === 'UNDER INVESTIGATION'
        ? [
            {
              action: 'INVESTIGATION_STARTED',
              createdAt: '2026-10-04T08:00:00Z'
            }
          ]
        : []),
      {
        action,
        details: 'Insufficient supporting evidence.',
        createdAt: '2026-10-05T08:00:00Z'
      }
    ];
    const result = buildIncidentTracking(
      { ...report, status: 'CLOSED' },
      signatures,
      activity,
      null,
      [],
      null
    );
    assert.equal(result.closureStage, key);
    assert.equal(result.closureReason, 'Insufficient supporting evidence.');
    assert.equal(stage(result, key).state, 'closed');
    assert.equal(stage(result, 'DECISION ISSUED').state, 'discontinued');
    assert.equal(result.completedProcess, false);
  }
});

test('final closure keeps Decision Issued as the final milestone without exposing administrative notes', () => {
  const activity = [
    { action: 'DECISION_ISSUED', createdAt: '2026-10-20T08:00:00Z' },
    {
      action: 'DECISION_CASE_CLOSED',
      details: 'Private administrative note.',
      createdAt: '2026-10-21T08:00:00Z'
    }
  ];
  // This is also the data available to a reporter who cannot see the decision document.
  const result = buildIncidentTracking(
    { ...report, status: 'CLOSED' },
    signatures,
    activity,
    null,
    [],
    null
  );
  assert.equal(result.currentStage, 'DECISION ISSUED');
  assert.equal(result.completedProcess, true);
  assert.equal(stage(result, 'DECISION ISSUED').state, 'completed');
  assert.equal(result.closureReason.includes('Private'), false);
});

test('badge counts use unresolved involvement, persist independently of reading, and belong in Review for HR', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  let role = 'STAFF';
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async () => [[]]
  }));
  t.mock.method(pool, 'execute', async (sql) => {
    if (sql.includes('FROM user_roles WHERE email'))
      return [[{ email: 'employee@example.com', role, active: 1 }]];
    if (sql.includes("status <> 'CLOSED'")) {
      assert.doesNotMatch(
        sql,
        /viewed_at|incident_notifications|signatory_role/
      );
      if (['STAFF', 'HEAD'].includes(role)) {
        assert.match(sql, /incident_participants/);
        return [[{ count: 2 }]];
      }
      return [[{ count: 4 }]];
    }
    if (sql.includes('SELECT COUNT(*) AS count FROM incident_reports'))
      return [[{ count: 4 }]];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const req = { session: { userEmail: 'employee@example.com' } };
  assert.deepEqual(await incidents.getIncidentBadgeCounts(req), {
    track: 2,
    review: 0
  });
  assert.deepEqual(await incidents.getIncidentBadgeCounts(req), {
    track: 2,
    review: 0
  });
  role = 'HEAD';
  assert.deepEqual(await incidents.getIncidentBadgeCounts(req), {
    track: 2,
    review: 0
  });
  for (role of ['HR', 'ADMIN'])
    assert.deepEqual(await incidents.getIncidentBadgeCounts(req), {
      track: 0,
      review: 4
    });
});

test('knowing a case ID cannot bypass the tracking endpoint or case-document permissions', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  t.mock.method(pool, 'execute', async (sql, values) => {
    if (sql.includes('FROM user_roles WHERE email'))
      return [[{ email: 'outsider@example.com', role: 'STAFF', active: 1 }]];
    if (sql.includes('AS version')) {
      assert.match(sql, /AND \(LOWER\(reporter_email\)/);
      assert.deepEqual(values, [12, ...Array(4).fill('outsider@example.com')]);
      return [[]];
    }
    if (sql.includes('FROM incident_reports WHERE id')) return [[report]];
    if (sql.includes('SELECT 1 FROM incident_participants')) return [[]];
    throw new Error(
      'Document queries must not run for an unauthorized account.'
    );
  });
  const req = { session: { userEmail: 'outsider@example.com' } };
  await assert.rejects(incidents.getIncidentTrackingVersion(req, 12), {
    status: 404
  });
  await assert.rejects(incidents.getIncidentCase(req, 12), { status: 403 });
});

test('tracking versions use the signature table timestamp key', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  t.mock.method(pool, 'execute', async (sql) => {
    if (sql.includes('FROM user_roles WHERE email'))
      return [[{ email: 'head@example.com', role: 'HEAD', active: 1 }]];
    if (sql.includes('AS version')) {
      assert.match(sql, /MAX\(s\.signed_at\)/);
      assert.doesNotMatch(sql, /MAX\(s\.id\)/);
      return [[{ version: 'PENDING SIGNATURE:2026-10-01:0:' }]];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const req = { session: { userEmail: 'head@example.com' } };
  const result = await incidents.getIncidentTrackingVersion(req, 12);
  assert.equal(result.version, 'PENDING SIGNATURE:2026-10-01:0:');
});

test('Track actions reject an unrelated signer, employee explanation, or information-request response', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  let status = 'PENDING SIGNATURE';
  t.mock.method(pool, 'execute', async () => [
    [
      {
        email: 'outsider@example.com',
        role: 'STAFF',
        active: 1
      }
    ]
  ]);
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql) => {
      if (sql.includes('FROM incident_reports'))
        return [
          [
            {
              id: 12,
              status,
              case_number: 'IR-12',
              reported_employee_email: 'employee@example.com',
              assigned_head_email: 'head@example.com'
            }
          ]
        ];
      if (sql.includes('FROM incident_information_requests')) return [[]];
      throw new Error('An unrelated account must not reach a write query.');
    }
  }));
  const req = { session: { userEmail: 'outsider@example.com' } };
  const signature = 'data:image/png;base64,aA==';
  await assert.rejects(
    incidents.signIncidentCase(req, 12, 'EMPLOYEE', signature),
    { status: 403 }
  );
  await assert.rejects(incidents.signIncidentCase(req, 12, 'HR', signature), {
    status: 403
  });
  status = 'NTE ISSUED';
  await assert.rejects(
    incidents.saveIncidentExplanationDraft(req, 12, 'Not my case'),
    { status: 403 }
  );
  status = 'UNDER INVESTIGATION';
  await assert.rejects(
    incidents.respondToIncidentInformation(req, 12, 44, 'Not my request'),
    { status: 403 }
  );
});
