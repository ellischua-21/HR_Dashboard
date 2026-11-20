const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { pool } = require('../server/db/database');
const incidents = require('../server/services/IncidentWorkflowService');
const {
  saveIncidentMatrix
} = require('../server/services/incident-management/Conduct');
const { saveAccountChanges } = require('../server/services/AccountService');
const { accountIdentityMock } = require('./helpers/AccountFixtures');
const { cleanEmployee } = require('../server/utils/EmployeeData');
const { validateEmployee } = require('../server/utils/Validation');
const { LISTS } = require('../server/config/EmployeeSchema');

test('corporate email migration adds only the missing column and preserves legacy login on reruns', async (t) => {
  const { initializeDatabase } = require('../server/db/database');
  const stop = new Error('Stop before account schema initialization');
  for (const initial of [
    { personal_email: 'login@example.invalid' },
    {
      personal_email: 'login@example.invalid',
      corp_email: 'work@example.invalid',
      email: 'legacy@example.invalid'
    },
    {
      corp_email: 'legacy-login@example.invalid',
      email: 'legacy@example.invalid'
    }
  ]) {
    await t.test(Object.keys(initial).join('/'), async (subtest) => {
      const employee = { ...initial };
      const changes = [];
      subtest.mock.method(pool, 'query', async (sql) => {
        if (sql.startsWith('CREATE TABLE IF NOT EXISTS user_roles')) throw stop;
        if (sql.startsWith('CREATE TABLE IF NOT EXISTS employees')) {
          assert.match(sql, /`corp_email` TEXT NULL/);
          return [{ affectedRows: 0 }];
        }
        if (sql.startsWith('SHOW COLUMNS')) {
          const column = /LIKE '([^']+)'/.exec(sql)[1];
          return [
            column === 'regularized_on' || Object.hasOwn(employee, column)
              ? [{ Field: column }]
              : []
          ];
        }
        if (
          sql ===
          'ALTER TABLE employees CHANGE COLUMN corp_email personal_email TEXT NULL'
        ) {
          employee.personal_email = employee.corp_email;
          delete employee.corp_email;
          changes.push(sql);
          return [{ affectedRows: 0 }];
        }
        if (sql === 'ALTER TABLE employees ADD COLUMN corp_email TEXT NULL') {
          assert.equal(Object.hasOwn(employee, 'corp_email'), false);
          employee.corp_email = null;
          changes.push(sql);
          return [{ affectedRows: 0 }];
        }
        throw new Error('Unexpected or destructive migration: ' + sql);
      });
      await assert.rejects(initializeDatabase(), (error) => error === stop);
      assert.equal(
        employee.personal_email,
        initial.personal_email || initial.corp_email
      );
      assert.equal(
        employee.corp_email,
        initial.personal_email ? initial.corp_email || null : null
      );
      assert.equal(employee.email, initial.email);
      const firstRun = { ...employee };
      const changeCount = changes.length;
      await assert.rejects(initializeDatabase(), (error) => error === stop);
      assert.deepEqual(employee, firstRun);
      assert.equal(changes.length, changeCount);
    });
  }
});

const ADMIN = 'admin@example.invalid';
const HEAD = 'head@example.invalid';
const STAFF = 'staff@example.invalid';
const SUPERVISOR = 'supervisor@example.invalid';
const HR = 'hr@example.invalid';
const matrix = [
  { severity: 'Light', occurrence: 1, correctiveAction: 'Synthetic action' }
];
const configuration = {
  assignments: [{ department: 'Sales', reviewerEmail: HEAD }],
  managementEmail: ADMIN
};

// SQL responses exercise the real authorization, audit writer and transaction owner.
function fixture(t) {
  const accounts = [
    { email: ADMIN, role: 'ADMIN', active: 1 },
    { email: HEAD, role: 'HEAD', active: 1 },
    { email: STAFF, role: 'STAFF', active: 1 },
    { email: HR, role: 'HR', active: 1 },
    { email: SUPERVISOR, role: 'SUPERVISOR', active: 1 }
  ];
  let actor = ADMIN,
    failAction;
  let state = {
    accounts: structuredClone(accounts),
    assignments: [],
    manager: null,
    matrix: [],
    audit: [],
    revision: 0
  };
  let snapshot;
  const lifecycle = [];
  const calls = [];
  async function execute(sql, values = []) {
    calls.push({ sql, values });
    if (
      sql.startsWith('SELECT email, full_name, role') ||
      sql.includes('LOWER(TRIM(personal_email))')
    )
      return accountIdentityMock(() =>
        accounts.find((account) => account.email === actor)
      )(sql, values);
    if (sql.includes('SELECT id FROM incident_workflow_settings'))
      return [[{ id: 1 }]];
    if (
      sql.startsWith('SELECT email,role FROM user_roles') ||
      sql.startsWith('SELECT email FROM user_roles')
    )
      return [
        accounts.filter((account) => account.email === values[0].toLowerCase())
      ];
    if (sql.startsWith('SELECT matrix FROM incident_code_policy_draft'))
      return [[{ matrix: JSON.stringify(state.matrix) }]];
    if (sql.includes('FROM hr_tasks t JOIN user_forms')) return [[]];
    if (sql.startsWith('DELETE FROM incident_department_reviewers'))
      state.assignments = [];
    else if (sql.startsWith('INSERT INTO incident_department_reviewers'))
      state.assignments.push({
        department: values[0],
        email: values[1],
        updatedBy: values[2]
      });
    else if (sql.startsWith('UPDATE incident_workflow_settings'))
      state.manager = values[0];
    else if (sql.startsWith('UPDATE incident_code_policy_draft'))
      state.matrix = JSON.parse(values[0]);
    else if (sql.startsWith('UPDATE hr_task_revision')) state.revision++;
    else if (sql.startsWith('UPDATE user_roles SET assigned_head_email'))
      state.accounts.find(
        (account) => account.email === values[1]
      ).assigned_head_email = values[0];
    else if (sql.startsWith('INSERT INTO audit_logs')) {
      if (values[1] === failAction) throw new Error('Synthetic audit failure');
      state.audit.push(values);
    } else assert.fail('Unexpected synthetic query: ' + sql);
    return [{ affectedRows: 1 }];
  }
  const db = {
    execute,
    query: async (sql) => {
      assert.match(sql, /FROM user_roles FOR UPDATE/);
      return [structuredClone(state.accounts)];
    },
    beginTransaction: async () => {
      lifecycle.push('begin');
      snapshot = structuredClone(state);
    },
    commit: async () => {
      lifecycle.push('commit');
    },
    rollback: async () => {
      lifecycle.push('rollback');
      state = snapshot;
    },
    release: () => {
      lifecycle.push('release');
    }
  };
  t.mock.method(pool, 'execute', (sql, values = []) => {
    if (/^(INSERT|UPDATE|DELETE)/.test(sql))
      assert.ok(
        sql.startsWith('INSERT INTO audit_logs') &&
          values[1] === 'ACCESS_DENIED',
        'Successful writes must use the transaction connection'
      );
    return execute(sql, values);
  });
  t.mock.method(pool, 'query', async () =>
    assert.fail('Unexpected pool query')
  );
  t.mock.method(pool, 'getConnection', async () => {
    lifecycle.push('connect');
    return db;
  });
  return {
    db,
    calls,
    lifecycle,
    state: () => state,
    failAudit: (action) => {
      failAction = action;
    },
    req: (email = ADMIN) => {
      actor = email;
      return { session: { userEmail: email } };
    }
  };
}

test('COC matrix and its audit event commit together without logging policy contents', async (t) => {
  const f = fixture(t);
  assert.deepEqual(await saveIncidentMatrix(f.req(HR), matrix), { ok: true });
  assert.deepEqual(f.state().matrix, matrix);
  assert.equal(f.state().audit.length, 1);
  const [actor, action, id, detail] = f.state().audit[0];
  assert.equal(actor, HR);
  assert.equal(action, 'INCIDENT_MATRIX_UPDATED');
  assert.equal(id, '1');
  assert.doesNotMatch(detail, /Synthetic action|@/);
  assert.deepEqual(f.lifecycle, ['connect', 'begin', 'commit', 'release']);
});

test('a matrix audit failure rolls back the matrix update and releases the transaction', async (t) => {
  const f = fixture(t);
  const before = structuredClone(f.state());
  f.failAudit('INCIDENT_MATRIX_UPDATED');
  await assert.rejects(
    saveIncidentMatrix(f.req(HR), matrix),
    /Synthetic audit failure/
  );
  assert.deepEqual(f.state(), before);
  assert.deepEqual(f.lifecycle, ['connect', 'begin', 'rollback', 'release']);
});

test('invalid matrices and non-HR roles cannot open a matrix transaction', async (t) => {
  const f = fixture(t);
  await assert.rejects(saveIncidentMatrix(f.req(HR), [matrix[0], matrix[0]]), {
    status: 400
  });
  for (const email of [ADMIN, HEAD, STAFF])
    await assert.rejects(saveIncidentMatrix(f.req(email), matrix), {
      status: 403
    });
  assert.deepEqual(f.lifecycle, []);
  assert.equal(f.state().matrix.length, 0);
  assert.ok(f.state().audit.every((event) => event[1] === 'ACCESS_DENIED'));
});

test('direct workflow configuration save audits on its own transaction and supports clearing settings', async (t) => {
  const f = fixture(t);
  await incidents.saveIncidentWorkflowConfiguration(f.req(), configuration);
  assert.deepEqual(f.state().assignments, [
    { department: 'Sales', email: HEAD, updatedBy: ADMIN }
  ]);
  assert.equal(f.state().manager, ADMIN);
  assert.equal(f.state().revision, 1);
  const [actor, action, id, detail] = f.state().audit[0];
  assert.equal(actor, ADMIN);
  assert.equal(action, 'INCIDENT_WORKFLOW_CONFIG_UPDATED');
  assert.equal(id, '1');
  assert.doesNotMatch(detail, /Sales|@/);
  assert.deepEqual(f.lifecycle, ['connect', 'begin', 'commit', 'release']);
  await incidents.saveIncidentWorkflowConfiguration(f.req(), {
    assignments: [],
    managementEmail: ''
  });
  assert.deepEqual(f.state().assignments, []);
  assert.equal(f.state().manager, null);
  assert.equal(f.state().audit.length, 2);
});

test('configuration audit failure rolls back direct settings, reviewers and task revision', async (t) => {
  const f = fixture(t);
  const before = structuredClone(f.state());
  f.failAudit('INCIDENT_WORKFLOW_CONFIG_UPDATED');
  await assert.rejects(
    incidents.saveIncidentWorkflowConfiguration(f.req(), configuration),
    /Synthetic audit failure/
  );
  assert.deepEqual(f.state(), before);
  assert.deepEqual(f.lifecycle, ['connect', 'begin', 'rollback', 'release']);
});

test('Manage Accounts commits account assignments and configuration audit in one transaction', async (t) => {
  const f = fixture(t);
  await saveAccountChanges(f.req(), {
    headAssignments: [{ email: STAFF, headEmail: SUPERVISOR }],
    incidentConfiguration: configuration
  });
  assert.equal(
    f.state().accounts.find((account) => account.email === STAFF)
      .assigned_head_email,
    SUPERVISOR
  );
  assert.deepEqual(
    f.state().audit.map((event) => event[1]),
    ['HEAD_ASSIGNED', 'INCIDENT_WORKFLOW_CONFIG_UPDATED']
  );
  assert.deepEqual(f.lifecycle, ['connect', 'begin', 'commit', 'release']);
});

test('configuration audit failure rolls back the enclosing Manage Accounts save and its earlier audit', async (t) => {
  const f = fixture(t);
  const before = structuredClone(f.state());
  f.failAudit('INCIDENT_WORKFLOW_CONFIG_UPDATED');
  await assert.rejects(
    saveAccountChanges(f.req(), {
      headAssignments: [{ email: STAFF, headEmail: SUPERVISOR }],
      incidentConfiguration: configuration
    }),
    /Synthetic audit failure/
  );
  assert.deepEqual(f.state(), before);
  assert.deepEqual(f.lifecycle, ['connect', 'begin', 'rollback', 'release']);
});

test('invalid configuration or non-ADMIN access cannot change configuration or emit success audit', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    incidents.saveIncidentWorkflowConfiguration(f.req(), {
      ...configuration,
      assignments: [configuration.assignments[0], configuration.assignments[0]]
    }),
    /same reviewer twice/
  );
  for (const email of [HR, HEAD, STAFF])
    await assert.rejects(
      incidents.saveIncidentWorkflowConfiguration(f.req(email), configuration),
      { status: 403 }
    );
  assert.equal(f.state().assignments.length, 0);
  assert.ok(f.state().audit.every((event) => event[1] === 'ACCESS_DENIED'));
});

test('sample generation uses employee lookup values accepted by the real import validator', async () => {
  const filename = path.resolve(__dirname, '../scripts/SampleData.js');
  const localRequire = createRequire(filename);
  let rows,
    ended = false,
    initialized = false;
  const errors = [];
  const cliProcess = { argv: ['node', filename, 'generate', ADMIN, '60'] };
  await vm.runInNewContext(
    fs.readFileSync(filename, 'utf8'),
    {
      require: (name) => {
        if (name === 'dotenv') return { config() {} };
        if (name === '../server/db/database')
          return {
            initializeDatabase: async () => {
              initialized = true;
            },
            pool: {
              end: async () => {
                ended = true;
              }
            }
          };
        if (name === '../server/services/ImportService')
          return {
            importEmployees: async (req, records, commit) => {
              assert.equal(req.session.userEmail, ADMIN);
              assert.equal(commit, true);
              rows = records;
              return {
                total: records.length,
                imported: records.length,
                errors: []
              };
            }
          };
        return localRequire(name);
      },
      process: cliProcess,
      console: { log() {}, error: (message) => errors.push(message) }
    },
    { filename }
  );
  assert.equal(initialized, true);
  assert.equal(ended, true);
  assert.equal(cliProcess.exitCode, undefined);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 60);
  for (const row of rows)
    assert.deepEqual(
      validateEmployee(cleanEmployee(row), LISTS),
      [],
      row.emp_no
    );
  assert.ok(rows.some((row) => row.status === 'Regular'));
});
