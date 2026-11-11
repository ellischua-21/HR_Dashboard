const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../server/db/database');
const incidents = require('../server/services/IncidentWorkflowService');
const { accountIdentityMock } = require('./helpers/AccountFixtures');
const {
  incidentFixture,
  HR,
  HEAD,
  EMPLOYEE,
  signature
} = require('./helpers/IncidentWorkflow');
const { manilaDate } = require('../shared/DateUtils');

// Current filing replaces the retired signature-first workflow.
test('HEAD and SUPERVISOR filing creates grouped version 2 reports and notifies involved accounts', async (t) => {
  let role = 'HEAD';
  const reporter = 'reporter@example.invalid';
  const identity = accountIdentityMock(() => ({
    email: reporter,
    role,
    active: 1
  }));
  t.mock.method(pool, 'execute', identity);
  const writes = [];
  let commits = 0;
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    commit: async () => {
      commits++;
    },
    rollback: async () => {},
    release() {},
    execute: async (sql, values = []) => {
      if (sql.includes('SELECT e.record_id, e.record_id AS employeeId'))
        return [
          [
            {
              record_id: 'REPORTER',
              name: 'Synthetic Reporter',
              department: 'Sales',
              position: role
            }
          ]
        ];
      if (sql.includes('SELECT e.record_id, e.name, e.emp_no'))
        return [
          [
            {
              record_id: values[0],
              name: 'Synthetic Employee',
              email:
                values[0] === 'SUBJECT'
                  ? EMPLOYEE
                  : 'concerned@example.invalid',
              role: 'STAFF',
              department: 'Marketing'
            }
          ]
        ];
      if (sql.includes('SELECT d.department'))
        return [[{ department: 'Sales', email: HEAD }]];
      if (sql.includes('SELECT sequence_value'))
        return [[{ sequence_value: 17 }]];
      assert.match(sql.trim(), /^(INSERT|UPDATE)/);
      writes.push({ sql, values });
      return [{ insertId: 41, affectedRows: 1 }];
    }
  }));
  for (role of ['HEAD', 'SUPERVISOR']) {
    const result = await incidents.submitIncidentGroup(
      { session: { userEmail: reporter } },
      {
        reports: [
          {
            employeeId: 'SUBJECT',
            concernedEmployeeId: 'CONCERNED',
            date: '2026-11-01',
            time: '09:30',
            where: 'Synthetic office',
            what: 'Synthetic reported incident.',
            why: 'Synthetic relevant instruction.',
            how: 'Synthetic sequence of events.',
            files: []
          }
        ]
      }
    );
    assert.equal(
      result.reports[0].caseNumber,
      'IR-' + manilaDate().slice(0, 4) + '-00018'
    );
  }
  assert.equal(commits, 2);
  const report = writes.find((item) =>
    item.sql.includes('INSERT INTO incident_reports')
  );
  assert.match(report.sql, /'IR FILED',2/);
  assert.match(report.values[17], /^[a-f0-9]{64}$/);
  assert.ok(
    writes.some((item) =>
      item.sql.includes('INSERT INTO incident_case_subjects')
    )
  );
  const notices = writes.filter((item) =>
    item.sql.includes('INSERT IGNORE INTO incident_notifications')
  );
  assert.ok(notices.some((item) => item.values[1] === EMPLOYEE));
  assert.ok(notices.some((item) => item.values[1] === HEAD));
  assert.ok(
    notices.every(
      (item) => item.values[1] !== reporter && item.values[2] === 'IR_SUBMITTED'
    )
  );
});

test('STAFF cannot file and is denied before opening a transaction', async (t) => {
  t.mock.method(
    pool,
    'execute',
    accountIdentityMock(() => ({ email: EMPLOYEE, role: 'STAFF', active: 1 }))
  );
  t.mock.method(pool, 'getConnection', async () =>
    assert.fail('Unauthorized transaction opened')
  );
  await assert.rejects(
    incidents.submitIncidentGroup(
      { session: { userEmail: EMPLOYEE } },
      { reports: [{}] }
    ),
    /cannot file Incident Reports/
  );
});

test('only the assigned HEAD issues a signed NTE; receipt starts five calendar days and explanation unlocks HR', async (t) => {
  const f = incidentFixture(t, {
    phase: 'HEAD',
    status: 'IR FILED',
    nte_issued_at: null,
    received_at: null,
    explanation_submitted_at: null,
    nte: null
  });
  const input = {
    policy: 'Synthetic policy',
    classification: 'Misconduct',
    signature
  };
  await assert.rejects(
    incidents.incidentWorkflowAction(f.req(HR), 7, 'ISSUE_NTE', input),
    { status: 403 }
  );
  await incidents.incidentWorkflowAction(
    f.req(HEAD, 'HEAD'),
    7,
    'ISSUE_NTE',
    input
  );
  assert.equal(f.state().row.phase, 'EMPLOYEE');
  const nte = JSON.parse(f.state().row.nte);
  assert.match(nte.documentVersion, /^[a-f0-9]{64}$/);
  assert.equal(nte.issuerEmail, HEAD);
  await incidents.incidentWorkflowAction(
    f.req(EMPLOYEE, 'STAFF'),
    7,
    'ACKNOWLEDGE',
    { signature }
  );
  const expected = new Date(manilaDate() + 'T00:00:00Z');
  expected.setUTCDate(expected.getUTCDate() + 5);
  assert.equal(
    f.state().row.deadline_date,
    expected.toISOString().slice(0, 10)
  );
  await assert.rejects(
    incidents.incidentWorkflowAction(
      f.req(EMPLOYEE, 'STAFF'),
      7,
      'ACKNOWLEDGE',
      { signature }
    ),
    /once/
  );
  await incidents.incidentWorkflowAction(
    f.req(EMPLOYEE, 'STAFF'),
    7,
    'SUBMIT_EXPLANATION',
    { signature, statement: 'Synthetic explanation with supporting facts.' }
  );
  assert.equal(f.state().row.phase, 'HR');
  assert.equal(
    JSON.parse(f.state().row.explanation).documentVersion,
    nte.documentVersion
  );
  assert.equal(f.state().documents.at(-1).type, 'EMPLOYEE_EXPLANATION');
});

test('a case participant cannot download evidence submitted for another information request', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  const statements = [];
  t.mock.method(pool, 'execute', async (sql) => {
    statements.push(sql);
    if (sql.includes('LOWER(TRIM(personal_email))'))
      return [[{ record_id: 'SYNTHETIC', name: 'Synthetic Employee' }]];
    if (sql.includes('FROM user_roles'))
      return [
        [
          {
            email: 'participant@example.com',
            role: 'HEAD',
            active: 1,
            extra_perms: ''
          }
        ]
      ];
    if (sql.includes('FROM incident_evidence e'))
      return [
        [
          {
            id: 4,
            requestId: 9,
            fileName: 'confidential.pdf',
            caseNumber: 'IR-2026-1',
            reporter_email: 'reporter@example.com',
            reported_employee_email: 'employee@example.com',
            assigned_head_email: 'head@example.com',
            requestRecipient: 'employee@example.com',
            requestCreator: 'hr@example.com',
            isParticipant: 1
          }
        ]
      ];
    throw new Error('Unexpected database query.');
  });

  await assert.rejects(
    incidents.getIncidentEvidence(
      { session: { userEmail: 'participant@example.com' } },
      4
    ),
    { status: 403 }
  );
  assert.equal(
    statements.some((sql) => sql.includes('INSERT INTO audit_logs')),
    false
  );
});

test('the recipient of an information request can download its submitted evidence and the read is audited', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  const statements = [];
  t.mock.method(pool, 'execute', async (sql) => {
    statements.push(sql);
    if (sql.includes('LOWER(TRIM(personal_email))'))
      return [[{ record_id: 'SYNTHETIC', name: 'Synthetic Employee' }]];
    if (sql.includes('FROM user_roles'))
      return [
        [
          {
            email: 'employee@example.com',
            role: 'STAFF',
            active: 1,
            extra_perms: ''
          }
        ]
      ];
    if (sql.includes('FROM incident_evidence e'))
      return [
        [
          {
            id: 4,
            requestId: 9,
            fileName: 'response.pdf',
            caseNumber: 'IR-2026-1',
            reporter_email: 'reporter@example.com',
            reported_employee_email: 'employee@example.com',
            assigned_head_email: 'head@example.com',
            requestRecipient: 'employee@example.com',
            requestCreator: 'hr@example.com',
            isParticipant: 0
          }
        ]
      ];
    if (sql.includes('INSERT INTO audit_logs')) return [{ affectedRows: 1 }];
    throw new Error('Unexpected database query.');
  });

  const file = await incidents.getIncidentEvidence(
    { session: { userEmail: 'employee@example.com' } },
    4
  );
  assert.equal(file.fileName, 'response.pdf');
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO audit_logs')));
});
