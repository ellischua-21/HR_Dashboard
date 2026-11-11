const assert = require('node:assert/strict');
const { pool } = require('../../server/db/database');
const { accountIdentityMock } = require('./AccountFixtures');

const HR = 'hr@example.invalid';
const HEAD = 'head@example.invalid';
const EMPLOYEE = 'employee@example.invalid';
const MANAGER = 'manager@example.invalid';
const signature = 'data:image/png;base64,iVBORw0KGgo=';

// Synthetic SQL responses; the facade, authorization, transitions and task
// accounting run unchanged. This does not model MySQL isolation or locks.
function incidentFixture(t, overrides = {}) {
  let state = {
    actor: { email: HR, role: 'HR', active: 1, full_name: 'Synthetic HR' },
    row: {
      id: 7,
      workflow_version: 2,
      group_id: 1,
      case_number: 'IR-TEST-7',
      subject: 'Synthetic incident',
      status: 'NTE ISSUED',
      phase: 'HR',
      reporter_email: 'reporter@example.invalid',
      reported_employee_email: EMPLOYEE,
      reported_employee_id: 'SUBJECT',
      assigned_head_email: HEAD,
      nte_issued_at: '2026-11-01 09:00:00',
      received_at: '2026-11-01 10:00:00',
      deadline_date: '2026-11-06',
      explanation_submitted_at: '2026-11-02 09:00:00',
      hearing_status: 'NONE',
      revision: 1,
      head_pool: 0,
      report: {
        concernedEmployee: { email: 'concerned@example.invalid' },
        involved: [],
        witnesses: []
      },
      nte: { documentVersion: 'issued-version' },
      receipt: null,
      explanation: null,
      explanation_draft: null,
      hr_review: null,
      management: null,
      decision: null,
      management_email: MANAGER,
      approved_at: null,
      decision_issued_at: null,
      ...overrides
    },
    task: {
      id: 51,
      resource_type: 'INCIDENT',
      resource_id: 7,
      phase: 'HR',
      stage: 'NTE ISSUED',
      state: 'READY',
      owner_email: HR,
      waiting_reason: '',
      active_ms: 0,
      run_started_ms: null,
      updated_ms: 1
    },
    matrix: [
      { severity: 'Light', occurrence: 1, correctiveAction: 'Written Warning' },
      {
        severity: 'Light',
        occurrence: 2,
        correctiveAction: '4 days Suspension'
      }
    ],
    previousOffenses: 1,
    participants: [],
    requests: [],
    extensions: [],
    documents: [],
    activity: [],
    notifications: [],
    taskEvents: [],
    writes: [],
    revision: 0
  };
  let snapshot;
  const calls = [];
  let commits = 0,
    rollbacks = 0,
    released = 0;
  let fail = null;
  let sequence = 100;
  function update(target, sql, values) {
    let position = 0;
    const assignments = / SET ([\s\S]+) WHERE /i.exec(sql)[1];
    for (const assignment of assignments.split(',')) {
      const [, key, expression] = /^\s*(\w+)\s*=\s*(.*?)\s*$/.exec(assignment);
      if (expression === '?') target[key] = values[position++];
      else if (expression === 'NULL') target[key] = null;
      else if (expression === 'CURRENT_TIMESTAMP')
        target[key] = '2026-11-11 10:00:00';
      else if (/^'.*'$/.test(expression)) target[key] = expression.slice(1, -1);
      else if (expression === `${key} + 1`)
        target[key] = Number(target[key] || 0) + 1;
      else if (expression === `${key} + ?`) target[key] += values[position++];
      else assert.fail('Unsupported synthetic assignment: ' + assignment);
    }
  }
  async function execute(sql, values = []) {
    calls.push({ sql, values });
    if (fail?.(sql)) throw new Error('Synthetic write failure');
    if (
      /FROM user_roles WHERE email = \? LIMIT 1/.test(sql) ||
      /WHERE LOWER\(TRIM\(personal_email\)\)/.test(sql)
    )
      return accountIdentityMock(() => state.actor)(sql, values);
    if (sql.includes('SELECT workflow_version'))
      return [[{ workflow_version: state.row.workflow_version }]];
    if (sql.includes('SELECT r.*, w.report'))
      return [
        state.row.workflow_version === 2 ? [structuredClone(state.row)] : []
      ];
    if (sql.includes('SELECT * FROM incident_reports WHERE id'))
      return [[structuredClone(state.row)]];
    if (sql.includes('SELECT phase, explanation_submitted_at'))
      return [[structuredClone(state.row)]];
    if (sql.includes('SELECT e.personal_email FROM incident_participants'))
      return [state.participants.map((personal_email) => ({ personal_email }))];
    if (sql.includes('SELECT 1 FROM incident_participants'))
      return [state.participants.includes(values[1]) ? [{ found: 1 }] : []];
    if (sql.includes('SELECT 1 FROM incident_information_requests'))
      return [state.requests.filter((r) => r.recipient_email === values[1])];
    if (
      sql.includes(
        'SELECT COUNT(*) AS count FROM incident_information_requests'
      )
    )
      return [
        [{ count: state.requests.filter((r) => r.status === 'PENDING').length }]
      ];
    if (sql.includes('SELECT * FROM incident_information_requests'))
      return [state.requests.filter((r) => r.id === values[0])];
    if (sql.includes('SELECT matrix FROM incident_code_policy_draft'))
      return [[{ matrix: state.matrix }]];
    if (sql.includes('SELECT h.id FROM incident_disciplinary_history'))
      return [
        Array.from({ length: state.previousOffenses }, (_, id) => ({ id }))
      ];
    if (sql.includes('SELECT management_email FROM incident_workflow_settings'))
      return [[{ management_email: MANAGER }]];
    if (sql.includes('SELECT 1 FROM user_roles u'))
      return [values[0] === MANAGER ? [{ found: 1 }] : []];
    if (sql.includes('SELECT position FROM employees'))
      return [[{ position: 'Synthetic HEAD' }]];
    if (sql.includes('SELECT id,SHA2(file_data')) return [[]];
    if (sql.includes('SELECT id FROM incident_case_subjects'))
      return [[{ id: 3 }]];
    if (sql.includes('SELECT record_id FROM employees'))
      return [[{ record_id: 'SUBJECT' }]];
    if (sql.includes('SELECT owner_email FROM hr_tasks'))
      return [[{ owner_email: state.task.owner_email }]];
    if (sql.includes('SELECT * FROM hr_tasks WHERE resource_type'))
      return [[{ ...state.task }]];
    if (sql.includes('SELECT t.*, COALESCE'))
      return [
        [{ ...state.task, owner_ms: 0, owner_name: state.task.owner_email }]
      ];
    if (
      sql.includes(
        "SELECT email FROM user_roles WHERE active = 1 AND role = 'HR'"
      )
    )
      return [[{ email: HR }]];
    if (sql.includes('FROM incident_department_reviewers')) return [[]];
    if (/^(INSERT|UPDATE)/.test(sql.trim())) {
      state.writes.push({ sql, values });
      if (sql.startsWith('UPDATE incident_workflows'))
        update(state.row, sql, values);
      else if (sql.startsWith('UPDATE incident_reports'))
        update(state.row, sql, values);
      else if (sql.startsWith('UPDATE hr_tasks'))
        update(state.task, sql, values);
      else if (sql.startsWith('UPDATE hr_task_revision')) state.revision++;
      else if (sql.startsWith('INSERT INTO incident_information_requests'))
        state.requests.push({
          id: sequence + 1,
          incident_id: values[0],
          requested_by: values[1],
          recipient_email: values[2],
          request_text: values[3],
          section_number: values[4],
          status: 'PENDING'
        });
      else if (sql.startsWith('UPDATE incident_information_requests'))
        update(
          state.requests.find((request) => request.id === values.at(-1)),
          sql,
          values
        );
      else if (sql.includes('INSERT INTO incident_workflow_documents'))
        state.documents.push({
          type: values[1],
          snapshot: JSON.parse(values[2])
        });
      else if (sql.includes('INSERT INTO incident_activity'))
        state.activity.push({
          action: values[1],
          details: values[2],
          actor: values[3]
        });
      else if (sql.includes('INSERT IGNORE INTO incident_notifications'))
        state.notifications.push({ recipient: values[1], type: values[2] });
      else if (sql.includes('INSERT INTO hr_task_events'))
        state.taskEvents.push({
          action: values[1],
          creditOwner: values[5],
          activeMs: values[6]
        });
      else if (
        !/INSERT INTO incident_(evaluations|decisions|disciplinary_history|evidence)|UPDATE incident_(extension_requests|decisions)/.test(
          sql
        )
      )
        assert.fail('Unexpected synthetic write: ' + sql);
      return [{ insertId: ++sequence, affectedRows: 1 }];
    }
    assert.fail('Unexpected synthetic query: ' + sql);
  }
  const db = {
    execute,
    beginTransaction: async () => {
      snapshot = structuredClone(state);
    },
    commit: async () => {
      commits++;
    },
    rollback: async () => {
      state = snapshot;
      rollbacks++;
    },
    release: () => {
      released++;
    }
  };
  t.mock.method(pool, 'execute', execute);
  t.mock.method(pool, 'query', async () =>
    assert.fail('Unexpected pool query')
  );
  t.mock.method(pool, 'getConnection', async () => db);
  return {
    state: () => state,
    calls,
    db,
    counts: () => ({ commits, rollbacks, released }),
    fail: (predicate) => {
      fail = predicate;
    },
    req: (email = HR, role = 'HR') => {
      state.actor = { email, role, active: 1, full_name: 'Synthetic Account' };
      return { session: { userEmail: email } };
    }
  };
}

module.exports = { incidentFixture, HR, HEAD, EMPLOYEE, MANAGER, signature };
