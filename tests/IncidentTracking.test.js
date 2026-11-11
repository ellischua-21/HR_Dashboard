const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canViewIncident,
  incidentAccessScope,
  buildIncidentTracking
} = require('../server/services/incident-management/Tracking');
const {
  publicTimeline
} = require('../server/services/incident-management/Activity');

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
    canViewIncident({ role: 'SUPERVISOR', email: 'head@example.com' }, report),
    true
  );
  assert.equal(
    canViewIncident(
      { role: 'SUPERVISOR', email: 'unrelated@example.com' },
      report
    ),
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
      role === 'HR'
    );
});

test('selector and badge scope includes case participants and denies unsupported roles', () => {
  const user = { role: 'HEAD', email: 'head@example.com' };
  const scope = incidentAccessScope(user);
  assert.match(scope.sql, /incident_participants/);
  assert.match(scope.sql, /reported_employee_email/);
  assert.deepEqual(scope.values, Array(10).fill(user.email));
  assert.match(scope.sql, /workflow_version/);
  for (const role of ['STAFF', 'HEAD', 'HR', 'ADMIN']) {
    const scoped = incidentAccessScope({ ...user, role });
    assert.equal((scoped.sql.match(/\?/g) || []).length, scoped.values.length);
    assert.ok(scoped.values.every((email) => email === user.email));
    if (role === 'HR') assert.match(scoped.sql, /nte_issued_at IS NOT NULL/);
  }
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

test('signature timeline entries identify the account that signed', () => {
  const timeline = publicTimeline(
    report,
    [
      {
        action: 'EMPLOYEE_SIGNED',
        actorEmail: 'hr@example.com',
        createdAt: '2026-10-02T08:00:00Z'
      },
      {
        action: 'SIGNATURES_COMPLETED',
        actorEmail: 'hr@example.com',
        createdAt: '2026-10-02T09:00:00Z'
      }
    ],
    [
      {
        role: 'EMPLOYEE',
        signerEmail: 'employee@example.com',
        signedAt: '2026-10-02T08:00:00Z'
      },
      {
        role: 'HEAD',
        signerEmail: 'head@example.com',
        signedAt: '2026-10-02T09:00:00Z'
      },
      {
        role: 'HR',
        signerEmail: 'hr@example.com',
        signedAt: '2026-10-03T08:00:00Z'
      }
    ]
  );
  assert.equal(
    timeline.find((entry) => entry.action === 'EMPLOYEE_SIGNED').performedBy,
    'employee@example.com'
  );
  assert.equal(
    timeline.find((entry) => entry.action === 'SIGNATURES_COMPLETED')
      .performedBy,
    'head@example.com'
  );
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

test('current badges use unresolved case scope independently of notification reading', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentWorkflowService');
  const { accountIdentityMock } = require('./helpers/AccountFixtures');
  let role = 'STAFF';
  const identity = accountIdentityMock(() => ({
    email: 'employee@example.com',
    role,
    active: 1
  }));
  t.mock.method(pool, 'execute', async (sql, values) => {
    if (sql.includes('SELECT COALESCE(SUM(CASE')) {
      assert.doesNotMatch(
        sql,
        /viewed_at|incident_notifications|signatory_role/
      );
      assert.match(sql, /r.status<>'CLOSED'/);
      assert.match(sql, /r.workflow_version=2/);
      assert.match(sql, /incident_participants/);
      assert.equal((sql.match(/\?/g) || []).length, values.length);
      return [
        [{ track: role === 'STAFF' ? 2 : 0, review: role === 'HR' ? 4 : 0 }]
      ];
    }
    return identity(sql, values);
  });
  const req = { session: { userEmail: 'employee@example.com' } };
  for (let i = 0; i < 2; i++)
    assert.deepEqual(await incidents.getIncidentBadgeCounts(req), {
      track: 2,
      review: 0
    });
  role = 'HR';
  assert.deepEqual(await incidents.getIncidentBadgeCounts(req), {
    track: 0,
    review: 4
  });
});

test('knowing a case ID cannot bypass the tracking endpoint or case-document permissions', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  t.mock.method(pool, 'execute', async (sql, values) => {
    if (sql.includes('LOWER(TRIM(personal_email))'))
      return [[{ record_id: 'SYNTHETIC', name: 'Synthetic Employee' }]];
    if (sql.includes('FROM user_roles WHERE email'))
      return [[{ email: 'outsider@example.com', role: 'STAFF', active: 1 }]];
    if (sql.includes('AS version')) {
      assert.match(sql, /workflow_version/);
      assert.deepEqual(values, [12, ...Array(10).fill('outsider@example.com')]);
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
    if (sql.includes('LOWER(TRIM(personal_email))'))
      return [[{ record_id: 'SYNTHETIC', name: 'Synthetic Employee' }]];
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

test('current decision popups are scoped to their recipient and reported employee', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentWorkflowService');
  const { accountIdentityMock } = require('./helpers/AccountFixtures');
  const email = 'employee@example.com';
  const identity = accountIdentityMock(() => ({
    email,
    role: 'STAFF',
    active: 1
  }));
  t.mock.method(pool, 'execute', async (sql, values) => {
    if (!sql.includes('FROM incident_notifications n'))
      return identity(sql, values);
    assert.match(sql, /n.notification_type='DECISION_ISSUED'/);
    assert.match(sql, /LOWER\(r.reported_employee_email\)=LOWER\(\?\)/);
    assert.match(sql, /n.viewed_at IS NULL/);
    assert.ok(values.every((value) => value === email));
    assert.equal((sql.match(/\?/g) || []).length, values.length);
    return [[{ id: 33, type: 'DECISION_ISSUED', incidentId: 5 }]];
  });
  const notifications = await incidents.listPendingIncidentNotifications({
    session: { userEmail: email }
  });
  assert.equal(notifications[0].title, 'Incident decision issued');
  assert.equal(notifications[0].target, 'incident-track');
});

test('current actions deny an unrelated signer, explanation author and request respondent', async (t) => {
  const { incidentFixture } = require('./helpers/IncidentWorkflow');
  const incidents = require('../server/services/IncidentWorkflowService');
  const f = incidentFixture(t);
  const req = f.req('outsider@example.invalid', 'STAFF');
  for (const action of ['ACKNOWLEDGE', 'SAVE_EXPLANATION', 'RESPOND'])
    await assert.rejects(incidents.incidentWorkflowAction(req, 7, action, {}), {
      status: 403
    });
  assert.equal(f.state().writes.length, 0);
  assert.equal(f.counts().commits, 0);
});

test('pending information blocks HR processing and rolls back attempted task changes', async (t) => {
  const { incidentFixture } = require('./helpers/IncidentWorkflow');
  const incidents = require('../server/services/IncidentWorkflowService');
  const f = incidentFixture(t);
  f.state().requests.push({
    id: 1,
    recipient_email: 'employee@example.invalid',
    status: 'PENDING'
  });
  const req = f.req();
  const before = structuredClone(f.state());
  for (const action of [
    'SAVE_REVIEW',
    'SEND_APPROVAL',
    'REQUEST_INFORMATION',
    'HEARING'
  ]) {
    await assert.rejects(
      incidents.incidentWorkflowAction(req, 7, action, {}),
      /Awaiting requested information/
    );
    assert.deepEqual(f.state(), before);
  }
  assert.equal(f.counts().commits, 0);
});

test('hearing scheduling pauses HR time and only its owner can complete and resume it', async (t) => {
  const { incidentFixture } = require('./helpers/IncidentWorkflow');
  const incidents = require('../server/services/IncidentWorkflowService');
  const f = incidentFixture(t);
  let now = Date.parse('2026-11-09T10:00:00+08:00');
  t.mock.method(Date, 'now', () => now);
  f.state().task.run_started_ms = now - 3600000;
  await incidents.incidentWorkflowAction(f.req(), 7, 'HEARING', {
    details: 'Synthetic external hearing.'
  });
  assert.equal(f.state().task.state, 'WAITING');
  assert.equal(f.state().task.run_started_ms, null);
  assert.equal(f.state().task.active_ms, 3600000);
  assert.ok(
    f
      .state()
      .taskEvents.some(
        (event) =>
          event.action === 'PAUSED' &&
          event.activeMs === 3600000 &&
          event.creditOwner === 'hr@example.invalid'
      )
  );
  now += 3 * 3600000;
  await assert.rejects(
    incidents.incidentWorkflowAction(
      f.req('other@example.invalid'),
      7,
      'HEARING',
      { completed: true, details: 'Synthetic completion.' }
    ),
    /assigned HR/
  );
  await incidents.incidentWorkflowAction(f.req(), 7, 'HEARING', {
    completed: true,
    details: 'Synthetic completion.'
  });
  assert.equal(f.state().row.hearing_status, 'COMPLETED');
  assert.equal(f.state().task.state, 'READY');
  assert.equal(f.state().task.run_started_ms, now);
  assert.equal(f.state().task.active_ms, 3600000);
});

test('information responses pause HR until every recipient responds and cannot be overwritten', async (t) => {
  const {
    incidentFixture,
    HEAD,
    EMPLOYEE,
    HR
  } = require('./helpers/IncidentWorkflow');
  const incidents = require('../server/services/IncidentWorkflowService');
  const f = incidentFixture(t);
  await incidents.incidentWorkflowAction(f.req(), 7, 'REQUEST_INFORMATION', {
    requests: [
      { email: EMPLOYEE, text: 'Synthetic question for the employee.' },
      { email: HEAD, text: 'Synthetic question for the assigned Head.' }
    ]
  });
  assert.equal(f.state().task.state, 'WAITING');
  assert.equal(f.state().task.run_started_ms, null);
  const [first, second] = f.state().requests;
  const response = {
    requestId: first.id,
    statement: 'Synthetic employee response with relevant facts.'
  };
  await assert.rejects(
    incidents.incidentWorkflowAction(
      f.req(HEAD, 'HEAD'),
      7,
      'RESPOND',
      response
    ),
    /unavailable or already answered/
  );
  await incidents.incidentWorkflowAction(
    f.req(EMPLOYEE, 'STAFF'),
    7,
    'RESPOND',
    response
  );
  assert.equal(f.state().task.state, 'WAITING');
  await assert.rejects(
    incidents.incidentWorkflowAction(
      f.req(EMPLOYEE, 'STAFF'),
      7,
      'RESPOND',
      response
    ),
    /already answered/
  );
  await incidents.incidentWorkflowAction(f.req(HEAD, 'HEAD'), 7, 'RESPOND', {
    ...response,
    requestId: second.id
  });
  assert.equal(f.state().task.state, 'READY');
  assert.ok(f.state().task.run_started_ms > 0);
  assert.ok(
    f.state().requests.every((request) => request.status === 'RESPONDED')
  );
  assert.ok(
    f
      .state()
      .notifications.some(
        (item) => item.recipient === HR && item.type === `INFO_DONE_${first.id}`
      )
  );
});
