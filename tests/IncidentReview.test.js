const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../server/db/database');
const incidents = require('../server/services/IncidentWorkflowService');
const {
  categoriesForRole,
  categoryForIncident
} = require('../server/services/incident-management/Review');
const {
  incidentNotificationTarget
} = require('../server/services/incident-management/Tracking');
const { accountIdentityMock } = require('./helpers/AccountFixtures');
const {
  incidentFixture,
  HR,
  HEAD,
  EMPLOYEE,
  MANAGER
} = require('./helpers/IncidentWorkflow');

const review = {
  finding: 'SUBSTANTIATED',
  findings: 'Synthetic findings supported by evidence.',
  severity: 'Light',
  recommendedAction: 'Client override'
};

test('current Review categories follow role and phase; legacy records stay closed', () => {
  assert.deepEqual(categoriesForRole('HR'), [
    'ALL',
    'NTE_ISSUED',
    'FOR_REVIEW',
    'CLOSED'
  ]);
  assert.equal(
    categoryForIncident({ phase: 'EMPLOYEE' }, { role: 'HR' }),
    'NTE_ISSUED'
  );
  assert.equal(
    categoryForIncident({ phase: 'HR' }, { role: 'HR' }),
    'FOR_REVIEW'
  );
  assert.equal(
    categoryForIncident({ status: 'IR FILED' }, { role: 'HEAD' }),
    'FOR_REVIEW'
  );
  assert.equal(categoryForIncident({ legacy: true }, { role: 'HR' }), 'CLOSED');
});

test('Review filters and counters retain only uninvolved HR cases after NTE issuance', async (t) => {
  const identity = accountIdentityMock(() => ({
    email: HR,
    role: 'HR',
    active: 1
  }));
  const rows = [
    {
      id: 1,
      workflowVersion: 2,
      caseNumber: 'IR-1',
      subject: 'Literal %_ evidence',
      phase: 'HR',
      nteIssuedAt: '2026-11-01',
      userInvolved: 0
    },
    {
      id: 2,
      workflowVersion: 2,
      caseNumber: 'IR-2',
      subject: 'Other',
      phase: 'EMPLOYEE',
      nteIssuedAt: '2026-11-01',
      userInvolved: 0
    },
    {
      id: 3,
      workflowVersion: 2,
      caseNumber: 'IR-3',
      phase: 'HEAD',
      nteIssuedAt: null,
      userInvolved: 0
    },
    {
      id: 4,
      workflowVersion: 2,
      caseNumber: 'IR-4',
      phase: 'HR',
      nteIssuedAt: '2026-11-01',
      userInvolved: 1
    }
  ];
  t.mock.method(pool, 'execute', async (sql, values) => {
    if (sql.includes('FROM incident_reports r LEFT JOIN')) {
      assert.match(sql, /incident_participants/);
      assert.match(sql, /WHERE .*workflow_version/s);
      assert.ok(values.every((value) => value === HR));
      return [rows];
    }
    return identity(sql, values);
  });
  const req = { session: { userEmail: HR } };
  const result = await incidents.getIncidentReviewDashboard(req, {
    category: 'FOR_REVIEW',
    search: '%_'
  });
  assert.deepEqual(
    result.cases.map((row) => row.id),
    [1]
  );
  assert.deepEqual(result.summary, {
    ALL: 2,
    NTE_ISSUED: 1,
    FOR_REVIEW: 1,
    CLOSED: 0
  });
  await assert.rejects(
    incidents.getIncidentReviewDashboard(req, { category: 'ONGOING' }),
    { status: 409 }
  );
  await assert.rejects(
    incidents.getIncidentReviewDashboard(req, { search: 'x'.repeat(192) }),
    { status: 409 }
  );
});

test('STAFF and SUPERVISOR cannot use Review; assigned HEAD retains Review access', async (t) => {
  let role = 'STAFF';
  const identity = accountIdentityMock(() => ({
    email: HEAD,
    role,
    active: 1
  }));
  t.mock.method(pool, 'execute', async (sql, values) =>
    sql.includes('FROM incident_reports r LEFT JOIN')
      ? [[]]
      : identity(sql, values)
  );
  const req = { session: { userEmail: HEAD } };
  for (role of ['STAFF', 'SUPERVISOR'])
    await assert.rejects(
      incidents.getIncidentReviewDashboard(req),
      /cannot access Review/
    );
  role = 'HEAD';
  assert.equal((await incidents.getIncidentReviewDashboard(req)).total, 0);
});

test('HR cannot issue an unapproved decision, mutate a closed case, or write a legacy record', async (t) => {
  const f = incidentFixture(t);
  const req = f.req();
  for (const phase of ['HR', 'MANAGEMENT', 'FINAL_ACTION']) {
    f.state().row.phase = phase;
    await assert.rejects(
      incidents.incidentWorkflowAction(req, 7, 'ISSUE_DECISION'),
      /Management approval is required/
    );
  }
  f.state().row.status = 'CLOSED';
  await assert.rejects(
    incidents.incidentWorkflowAction(req, 7, 'SAVE_REVIEW', review),
    /closed and read-only/
  );
  f.state().row.workflow_version = 1;
  await assert.rejects(
    incidents.incidentWorkflowAction(req, 7, 'SAVE_REVIEW', review),
    { status: 404 }
  );
  assert.equal(f.counts().commits, 0);
  assert.equal(f.counts().rollbacks, 5);
  assert.equal(f.state().writes.length, 0);
  for (const method of [
    'submitIncidentReport',
    'signIncidentCase',
    'saveIncidentEvaluation',
    'issueIncidentDecision'
  ])
    await assert.rejects(incidents[method](req, 7, {}), { status: 409 });
});

test('assessment uses the configured occurrence action and requires recorded Management approval', async (t) => {
  const f = incidentFixture(t);
  await incidents.incidentWorkflowAction(f.req(), 7, 'SEND_APPROVAL', review);
  let saved = JSON.parse(f.state().row.hr_review);
  assert.equal(saved.correctiveAction, '4 days Suspension');
  assert.equal(saved.previousOffenses, 1);
  assert.equal(f.state().row.phase, 'MANAGEMENT');
  assert.equal(f.state().task.state, 'WAITING');
  assert.equal(f.state().documents[0].type, 'HR_RECOMMENDATION');
  await assert.rejects(
    incidents.incidentWorkflowAction(f.req(HEAD, 'HEAD'), 7, 'MANAGEMENT', {
      approve: true
    }),
    /designated/
  );
  await incidents.incidentWorkflowAction(
    f.req(MANAGER, 'ADMIN'),
    7,
    'MANAGEMENT',
    { approve: true }
  );
  assert.equal(f.state().row.phase, 'FINAL_ACTION');
  assert.equal(f.state().task.state, 'READY');
  await incidents.incidentWorkflowAction(f.req(), 7, 'ISSUE_DECISION', {
    finalAction: 'Client override'
  });
  saved = JSON.parse(f.state().row.decision);
  assert.equal(saved.correctiveAction, '4 days Suspension');
  assert.equal(saved.outcome, 'SUSPENSION');
  assert.equal(f.state().row.phase, 'FINALIZED');
  await incidents.incidentWorkflowAction(f.req(), 7, 'CLOSE', {
    reason: 'Synthetic completion documented.'
  });
  assert.equal(f.state().row.status, 'CLOSED');
  assert.equal(f.state().task.state, 'COMPLETED');
  assert.ok(
    f
      .state()
      .notifications.some(
        (item) => item.recipient === EMPLOYEE && item.type === 'DECISION_ISSUED'
      )
  );
  assert.ok(
    !f
      .state()
      .notifications.some(
        (item) => item.recipient === HR && item.type === 'DECISION_ISSUED'
      )
  );
});

test('changed finalized offense count and stale approval versions block finalization', async (t) => {
  const f = incidentFixture(t, {
    phase: 'FINAL_ACTION',
    approved_at: '2026-11-01',
    hr_review: {
      ...review,
      previousOffenses: 0,
      correctiveAction: 'Written Warning',
      version: 'v2'
    },
    management: { approved: true, reviewVersion: 'v1' }
  });
  await assert.rejects(
    incidents.incidentWorkflowAction(f.req(), 7, 'ISSUE_DECISION'),
    /new Management approval/
  );
  f.state().row.management.reviewVersion = 'v2';
  await assert.rejects(
    incidents.incidentWorkflowAction(f.req(), 7, 'ISSUE_DECISION'),
    /violation count changed/
  );
  assert.equal(f.state().documents.length, 0);
  assert.equal(f.counts().commits, 0);
});

test('failed notification rolls back recommendation, snapshots, task timing and revisions', async (t) => {
  const f = incidentFixture(t);
  const req = f.req();
  const before = structuredClone(f.state());
  f.fail((sql) => sql.includes('INSERT IGNORE INTO incident_notifications'));
  await assert.rejects(
    incidents.incidentWorkflowAction(req, 7, 'SEND_APPROVAL', review),
    /Synthetic write failure/
  );
  assert.deepEqual(f.state(), before);
  assert.deepEqual(f.counts(), { commits: 0, rollbacks: 1, released: 1 });
});

test('event links open Track for every role, including closed cases', () => {
  for (const role of ['STAFF', 'SUPERVISOR', 'HEAD', 'HR', 'ADMIN'])
    for (const status of ['IR FILED', 'NTE ISSUED', 'CLOSED'])
      assert.equal(incidentNotificationTarget(role, status), 'incident-track');
});

test('Inbox preserves current action status, HR ownership suppression and read-only legacy notices', async (t) => {
  const {
    getInbox,
    markInboxSeen
  } = require('../server/services/InboxService');
  const identity = accountIdentityMock(() => ({
    email: HR,
    role: 'HR',
    active: 1
  }));
  const rows = [
    {
      notificationId: 1,
      incidentId: 7,
      notificationType: 'EXPLANATION_SENT',
      requiresAction: 1,
      taskOwner: 'other@example.invalid'
    },
    {
      notificationId: 2,
      incidentId: 8,
      notificationType: 'NTE_ISSUED',
      requiresAction: 1,
      taskOwner: 'other@example.invalid',
      reportedEmployeeEmail: HR
    },
    {
      notificationId: 3,
      incidentId: 9,
      notificationType: 'INFO_REQ_4',
      requiresAction: 1,
      taskOwner: 'other@example.invalid'
    },
    {
      notificationId: 4,
      incidentId: 10,
      notificationType: 'HEAD_SIGNATURE',
      workflowVersion: 1,
      requiresAction: 0
    },
    {
      notificationId: 5,
      incidentId: 7,
      notificationType: 'DECISION_ISSUED',
      requiresAction: 0,
      taskOwner: HR,
      viewedAt: '2026-11-02'
    }
  ].map((row) => ({
    workflowVersion: 2,
    status: 'NTE ISSUED',
    caseNumber: 'IR-TEST',
    subject: 'Synthetic subject',
    reportedEmployeeName: 'Synthetic Employee',
    reportedEmployeeEmail: EMPLOYEE,
    createdAt: '2026-11-01',
    ...row
  }));
  let seen;
  t.mock.method(pool, 'execute', async (sql, values) => {
    if (sql.includes('FROM incident_notifications n')) {
      assert.match(sql, /WHERE n.recipient_email = \? AND/);
      assert.match(sql, /CONCAT\('EVIDENCE_', actor_activity.id\)/);
      assert.match(
        sql,
        /LOWER\(actor_activity.actor_email\) = LOWER\(n.recipient_email\)/
      );
      assert.equal((sql.match(/\?/g) || []).length, values.length);
      assert.ok(values.every((value) => value === HR));
      return [rows];
    }
    if (
      sql.includes('FROM hr_announcements') ||
      sql.includes('FROM user_forms f')
    )
      return [[]];
    if (sql.startsWith('UPDATE incident_notifications')) {
      assert.match(sql, /WHERE recipient_email = \? AND id IN/);
      seen = values;
      return [{ affectedRows: rows.length }];
    }
    return identity(sql, values);
  });
  const req = { session: { userEmail: HR } };
  const items = await getInbox(req);
  const byId = (id) => items.find((item) => item.notificationId === id);
  assert.equal(byId(1).unseen, false);
  assert.equal(byId(1).status, 'ACTION_REQUIRED');
  assert.equal(byId(2).unseen, true);
  assert.equal(byId(3).unseen, true);
  assert.equal(byId(4).status, 'LEGACY');
  assert.equal(byId(5).unseen, false);
  assert.ok(items.every((item) => item.target === 'incident-track'));
  assert.doesNotMatch(byId(2).message, /Synthetic subject|Synthetic Employee/);
  assert.equal((await markInboxSeen(req)).count, rows.length);
  assert.deepEqual(seen, [HR, 1, 2, 3, 4, 5]);
});
