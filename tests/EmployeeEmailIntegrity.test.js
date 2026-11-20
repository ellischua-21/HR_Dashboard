const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { pool } = require('../server/db/database');
const { EMP_FIELDS, F, LISTS } = require('../server/config/EmployeeSchema');
const { saveEmployee } = require('../server/services/EmployeeService');
const { importEmployees } = require('../server/services/ImportService');
const { approveAccountRequest } = require('../server/services/AccountService');
const { getCurrentUser } = require('../server/middleware/Auth');
const {
  acquireEmployeeIdentityLock
} = require('../server/utils/EmployeeIdentityLock');

const normalized = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();
const admin = {
  email: 'setup@example.invalid',
  role: 'ADMIN',
  active: 1,
  is_setup_admin: 1
};
const req = { session: { userEmail: admin.email } };
function employee(number, email = '') {
  const row = { personal_email: email };
  for (const field of EMP_FIELDS) {
    if (!F.has(field, 'R') || F.has(field, 'C')) continue;
    row[field[0]] =
      field[2] === 'list'
        ? LISTS[field[4]][0]
        : field[2] === 'date'
          ? '2000-01-01'
          : field[2] === 'number'
            ? '1'
            : 'Synthetic';
  }
  return {
    ...row,
    emp_no: number,
    record_id: number,
    name: 'Synthetic Employee',
    record_status: 'Active'
  };
}

// Models cooperating connections and transactions; not a MySQL concurrency test.
function database(t, initial = []) {
  const state = {
    employees: structuredClone(initial),
    accounts: [admin],
    requests: [],
    events: [],
    writes: [],
    counter: 20
  };
  let holder = null;
  const waiting = [];
  async function execute(sql, values = [], connection = null) {
    if (sql.includes('GET_LOCK(')) {
      if (holder)
        await new Promise((resolve) => waiting.push({ resolve, connection }));
      else holder = connection;
      state.events.push('lock');
      return [[{ acquired: 1 }]];
    }
    if (sql.includes('RELEASE_LOCK(')) {
      assert.equal(holder, connection);
      const next = waiting.shift();
      holder = next?.connection || null;
      state.events.push('unlock');
      next?.resolve();
      return [[{ released: 1 }]];
    }
    if (sql.startsWith('SELECT 1 FROM user_roles')) {
      const email = normalized(values[0]);
      return [
        [...state.accounts, ...state.requests].some(
          (row) => normalized(row.email) === email
        )
          ? [{ found: 1 }]
          : []
      ];
    }
    if (sql.includes('FROM user_roles WHERE email = ? LIMIT 1'))
      return [
        state.accounts.filter(
          (row) => normalized(row.email) === normalized(values[0])
        )
      ];
    if (
      sql.includes('FROM employees') &&
      sql.includes('COALESCE(record_status')
    )
      return [
        state.employees
          .filter(
            (row) =>
              normalized(row.personal_email) === normalized(values[0]) &&
              row.record_status !== 'Archived'
          )
          .slice(0, 2)
      ];
    if (sql.startsWith('SELECT record_id FROM employees WHERE emp_no'))
      return [
        state.employees
          .filter(
            (row) => row.emp_no === values[0] && row.record_id !== values[1]
          )
          .slice(0, 1)
      ];
    if (
      sql.startsWith(
        'SELECT record_id FROM employees WHERE LOWER(TRIM(personal_email))'
      )
    )
      return [
        state.employees
          .filter(
            (row) =>
              normalized(row.personal_email) === values[0] &&
              row.record_id !== values[1]
          )
          .slice(0, 1)
      ];
    if (sql.startsWith('SELECT personal_email FROM employees'))
      return [state.employees];
    if (sql.startsWith('SELECT emp_no FROM employees'))
      return [state.employees];
    if (sql.startsWith('SELECT * FROM employees WHERE record_id'))
      return [state.employees.filter((row) => row.record_id === values[0])];
    if (sql.startsWith('SELECT counter_value'))
      return [[{ counter_value: state.counter }]];
    if (sql.startsWith('UPDATE counters')) {
      state.counter = Number(values[0]);
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT COALESCE(MAX(seq_no)'))
      return [[{ last_value: state.counter }]];
    if (sql.startsWith('INSERT INTO employees')) {
      const keys = [...sql.split('VALUES')[0].matchAll(/`([^`]+)`/g)].map(
        (match) => match[1]
      );
      state.employees.push(
        Object.fromEntries(keys.map((key, index) => [key, values[index]]))
      );
      state.writes.push('employee');
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE employees SET')) {
      const row = state.employees.find(
        (row) => row.record_id === values.at(-1)
      );
      const keys = [...sql.matchAll(/`([^`]+)` = \?/g)].map(
        (match) => match[1]
      );
      keys.forEach((key, index) => {
        row[key] = values[index];
      });
      state.writes.push('employee');
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT email FROM user_roles WHERE email = ?'))
      return [
        [...state.accounts, ...state.requests].filter(
          (row) => normalized(row.email) === normalized(values[0])
        )
      ];
    if (sql.startsWith('INSERT INTO account_requests')) {
      state.requests.push({
        id: state.requests.length + 1,
        full_name: values[0],
        email: values[1],
        assigned_role: values[2],
        assigned_head_email: values[3],
        password_hash: values[4]
      });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM account_requests WHERE id = ? FOR UPDATE'))
      return [state.requests.filter((row) => row.id === values[0])];
    if (sql.startsWith('INSERT INTO user_roles')) {
      state.accounts.push({
        email: values[0],
        full_name: values[1],
        role: values[2],
        active: 1,
        is_setup_admin: values.length === 5 ? values[4] : 0
      });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM account_requests')) {
      state.requests = state.requests.filter((row) => row.id !== values[0]);
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO audit_logs')) {
      state.writes.push('audit');
      return [{ affectedRows: 1 }];
    }
    throw new Error('Unexpected query: ' + sql);
  }
  t.mock.method(pool, 'execute', (sql, values) => execute(sql, values));
  t.mock.method(pool, 'query', async (sql) => {
    assert.ok(sql.includes('FROM lookup_values'));
    return [
      Object.entries(LISTS).flatMap(([list_name, values]) =>
        values.map((value) => ({ list_name, value }))
      )
    ];
  });
  t.mock.method(pool, 'getConnection', async () => {
    let snapshot;
    const connection = {
      execute: (sql, values) => execute(sql, values, connection),
      query: async (sql) => {
        assert.ok(sql.includes('FROM user_roles FOR UPDATE'));
        return [state.accounts];
      },
      beginTransaction: async () => {
        state.events.push('begin');
        snapshot = structuredClone({
          employees: state.employees,
          requests: state.requests,
          accounts: state.accounts,
          counter: state.counter
        });
      },
      commit: async () => {
        state.events.push('commit');
        snapshot = null;
      },
      rollback: async () => {
        if (snapshot) Object.assign(state, snapshot);
        snapshot = null;
        state.events.push('rollback');
      },
      release: () => state.events.push('release'),
      destroy: () => state.events.push('destroy')
    };
    return connection;
  });
  return state;
}

test('imports reject case/space email duplicates and preserve valid partial rows', async (t) => {
  database(t);
  const rows = [
    employee('A', ' Person@example.invalid '),
    employee('B', 'PERSON@example.invalid')
  ];
  const result = await importEmployees(req, rows, false);
  assert.equal(result.valid, 1);
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0].errors.some((message) => /Email/.test(message)));
});

test('archived emails remain reserved; blank and null imports remain permitted', async (t) => {
  database(t, [
    {
      ...employee('OLD', 'reserved@example.invalid'),
      record_status: 'Archived'
    }
  ]);
  const result = await importEmployees(
    req,
    [
      employee('A', 'RESERVED@example.invalid'),
      employee('B', ''),
      employee('C', null)
    ],
    true
  );
  assert.equal(result.imported, 2);
  assert.equal(result.errors.length, 1);
});

test('separate committed chunks cannot reuse an earlier email', async (t) => {
  database(t);
  assert.equal(
    (
      await importEmployees(
        req,
        [employee('A', 'shared@example.invalid')],
        true
      )
    ).imported,
    1
  );
  assert.equal(
    (
      await importEmployees(
        req,
        [employee('B', 'SHARED@example.invalid')],
        true
      )
    ).imported,
    0
  );
});

test('registration and editing reject duplicate employee emails', async (t) => {
  const state = database(t, [
    employee('A', 'used@example.invalid'),
    employee('B', '')
  ]);
  const create = await saveEmployee(req, {
    ...employee('C', 'USED@example.invalid'),
    record_id: undefined,
    accountAccess: { role: 'HEAD', password: 'Synthetic-password-123' }
  });
  assert.equal(create.ok, false);
  const edit = await saveEmployee(req, {
    ...state.employees[1],
    personal_email: ' used@example.invalid '
  });
  assert.equal(edit.ok, false);
});

test('corporate email persists through registration, editing and import without changing login identity', async (t) => {
  const state = database(t);
  const created = await saveEmployee(req, {
    ...employee('CORP-1', 'login@example.invalid'),
    record_id: undefined,
    corp_email: 'work@example.invalid',
    accountAccess: { role: 'HEAD', password: 'Synthetic-password-123' }
  });
  assert.equal(created.ok, true);
  assert.equal(state.employees[0].corp_email, 'work@example.invalid');
  assert.equal(state.requests[0].email, 'login@example.invalid');
  await approveAccountRequest(req, state.requests[0].id);
  const edited = await saveEmployee(req, {
    ...state.employees[0],
    corp_email: 'new-work@example.invalid'
  });
  assert.equal(edited.ok, true);
  assert.equal(state.employees[0].corp_email, 'new-work@example.invalid');
  assert.equal(state.employees[0].personal_email, 'login@example.invalid');
  assert.ok(
    state.accounts.some((account) => account.email === 'login@example.invalid')
  );
  assert.ok(
    !state.accounts.some(
      (account) => account.email === 'new-work@example.invalid'
    )
  );
  const imported = await importEmployees(
    req,
    [
      {
        ...employee('CORP-2', 'import-login@example.invalid'),
        corp_email: 'import-work@example.invalid'
      }
    ],
    true
  );
  assert.equal(imported.imported, 1);
  assert.equal(state.employees[1].corp_email, 'import-work@example.invalid');
  assert.equal(
    state.employees[1].personal_email,
    'import-login@example.invalid'
  );
});

for (const relationship of ['active', 'inactive', 'pending']) {
  test(`email changes cannot disconnect the ${relationship} account relationship`, async (t) => {
    const state = database(t, [employee('A', 'linked@example.invalid')]);
    if (relationship === 'pending')
      state.requests.push({ id: 1, email: 'LINKED@example.invalid' });
    else
      state.accounts.push({
        email: 'LINKED@example.invalid',
        role: 'STAFF',
        active: relationship === 'active' ? 1 : 0
      });
    const result = await saveEmployee(req, {
      ...state.employees[0],
      personal_email: 'new@example.invalid'
    });
    assert.equal(result.ok, false);
    assert.equal(state.employees[0].personal_email, 'linked@example.invalid');
  });
}

test('unlinked edits work; normalized-equivalent edits preserve stored identity and authentication', async (t) => {
  const state = database(t, [employee('A', 'Mixed@example.invalid')]);
  assert.equal(
    (
      await saveEmployee(req, {
        ...state.employees[0],
        personal_email: 'other@example.invalid'
      })
    ).ok,
    true
  );
  state.accounts.push({
    email: 'other@example.invalid',
    role: 'STAFF',
    active: 1
  });
  const member = { session: { userEmail: 'other@example.invalid' } };
  assert.equal((await getCurrentUser(member)).employee_id, 'A');
  assert.equal(
    (
      await saveEmployee(req, {
        ...state.employees[0],
        personal_email: ' OTHER@example.invalid '
      })
    ).ok,
    true
  );
  assert.equal(state.employees[0].personal_email, 'other@example.invalid');
  assert.equal((await getCurrentUser(member)).employee_id, 'A');
});

test('unrelated edits do not reject existing duplicate emails', async (t) => {
  const state = database(t, [
    employee('A', 'duplicate@example.invalid'),
    employee('B', 'duplicate@example.invalid')
  ]);
  const result = await saveEmployee(req, {
    ...state.employees[0],
    position: 'Updated Position'
  });
  assert.equal(result.ok, true);
  assert.equal(state.employees[0].position, 'Updated Position');
});

test('equivalent edits preserve existing spelling; blanking is allowed only when unlinked', async (t) => {
  const original = 'Mixed@example.invalid';
  const state = database(t, [
    employee('A', original),
    employee('B', 'unlinked@example.invalid')
  ]);
  state.accounts.push({
    email: original.toLowerCase(),
    role: 'STAFF',
    active: 1
  });
  assert.equal(
    (
      await saveEmployee(req, {
        ...state.employees[0],
        personal_email: ' MIXED@EXAMPLE.invalid '
      })
    ).ok,
    true
  );
  assert.equal(state.employees[0].personal_email, original);
  assert.equal(
    (await saveEmployee(req, { ...state.employees[0], personal_email: null }))
      .ok,
    false
  );
  assert.equal(
    (await saveEmployee(req, { ...state.employees[1], personal_email: null }))
      .ok,
    true
  );
  assert.equal(state.employees[1].personal_email, null);
});

const registration = (number, email) => ({
  ...employee(number, email),
  record_id: undefined,
  accountAccess: { role: 'HEAD', password: 'Synthetic-password-123' }
});

test('simulated concurrent registrations allow only one normalized email', async (t) => {
  const state = database(t);
  const result = await Promise.all([
    saveEmployee(req, registration('A', 'same@example.invalid')),
    saveEmployee(req, registration('B', ' SAME@example.invalid '))
  ]);
  assert.equal(result.filter((row) => row.ok).length, 1);
  assert.equal(state.employees.length, 1);
  assert.equal(state.requests.length, 1);
  assert.equal(state.events.filter((event) => event === 'unlock').length, 2);
});

test('simulated concurrent registration and import share the identity lock', async (t) => {
  const state = database(t);
  const [created, imported] = await Promise.all([
    saveEmployee(req, registration('A', 'same@example.invalid')),
    importEmployees(req, [employee('B', 'SAME@example.invalid')], true)
  ]);
  assert.equal(Number(created.ok) + imported.imported, 1);
  assert.equal(state.employees.length, 1);
});

test('simulated concurrent edits and imports cannot claim the same email', async (t) => {
  const state = database(t, [employee('A'), employee('B')]);
  const [first, second, imported] = await Promise.all([
    saveEmployee(req, {
      ...state.employees[0],
      personal_email: 'same@example.invalid'
    }),
    saveEmployee(req, {
      ...state.employees[1],
      personal_email: 'SAME@example.invalid'
    }),
    importEmployees(req, [employee('C', 'same@example.invalid')], true)
  ]);
  assert.equal(Number(first.ok) + Number(second.ok) + imported.imported, 1);
  assert.equal(
    state.employees.filter(
      (row) => normalized(row.personal_email) === 'same@example.invalid'
    ).length,
    1
  );
});

test('300-row import chunks retain partial error reporting and cross-chunk uniqueness', async (t) => {
  database(t);
  const rows = Array.from({ length: 300 }, (_, i) =>
    employee(`TEST-${i}`, `person${i}@example.invalid`)
  );
  const first = await importEmployees(req, rows, true);
  const second = await importEmployees(
    req,
    [employee('LAST', ' PERSON0@example.invalid ')],
    true
  );
  assert.equal(first.imported, 300);
  assert.equal(second.imported, 0);
  assert.equal(second.errors.length, 1);
});

test('account approval and email edits serialize without disconnecting the account', async (t) => {
  const state = database(t, [employee('A', 'pending@example.invalid')]);
  state.requests.push({
    id: 1,
    email: 'pending@example.invalid',
    assigned_role: 'HEAD',
    password_hash: 'synthetic-hash'
  });
  const [approved, edited] = await Promise.all([
    approveAccountRequest(req, 1),
    saveEmployee(req, {
      ...state.employees[0],
      personal_email: 'changed@example.invalid'
    })
  ]);
  assert.equal(approved.ok, true);
  assert.equal(edited.ok, false);
  assert.equal(state.employees[0].personal_email, approved.email);
  assert.equal(
    (await getCurrentUser({ session: { userEmail: approved.email } }))
      .employee_id,
    'A'
  );
  assert.deepEqual(state.events.slice(0, 4), [
    'lock',
    'begin',
    'commit',
    'unlock'
  ]);
  assert.equal(state.events.filter((event) => event === 'release').length, 2);
});

test('ambiguous legacy employee identities still block account approval without repair', async (t) => {
  const state = database(t, [
    employee('A', 'duplicate@example.invalid'),
    employee('B', 'DUPLICATE@example.invalid')
  ]);
  state.requests.push({
    id: 1,
    email: 'duplicate@example.invalid',
    assigned_role: 'HEAD'
  });
  await assert.rejects(approveAccountRequest(req, 1), { status: 409 });
  assert.equal(state.accounts.length, 1);
  assert.equal(state.requests.length, 1);
  assert.equal(state.employees.length, 2);
  assert.deepEqual(state.events, [
    'lock',
    'begin',
    'rollback',
    'unlock',
    'release'
  ]);
});

test('account approval also rejects an existing archived email collision', async (t) => {
  const state = database(t, [
    employee('A', 'duplicate@example.invalid'),
    { ...employee('B', 'DUPLICATE@example.invalid'), record_status: 'Archived' }
  ]);
  state.requests.push({
    id: 1,
    email: 'duplicate@example.invalid',
    assigned_role: 'HEAD'
  });
  await assert.rejects(approveAccountRequest(req, 1), { status: 409 });
  assert.equal(state.accounts.length, 1);
  assert.equal(state.requests.length, 1);
});

test('failed registration rolls back employee writes and releases its lock', async (t) => {
  const state = database(t);
  const input = registration('A', 'new@example.invalid');
  input.accountAccess.role = 'INVALID';
  await assert.rejects(saveEmployee(req, input), { status: 400 });
  assert.equal(state.employees.length, 0);
  assert.deepEqual(state.events, [
    'lock',
    'begin',
    'rollback',
    'unlock',
    'release'
  ]);
  assert.equal(
    (await saveEmployee(req, registration('B', 'new@example.invalid'))).ok,
    true
  );
});

test('identity lock has a bounded wait and rejects timeout without releasing another owner', async () => {
  let calls = 0;
  await assert.rejects(
    acquireEmployeeIdentityLock({
      execute: async (sql) => {
        calls++;
        assert.match(sql, /GET_LOCK\(.*5\)/);
        return [[{ acquired: 0 }]];
      }
    }),
    { status: 409 }
  );
  assert.equal(calls, 1);
});

test('identity lock destroys connections after uncertain acquisition or release failures', async () => {
  let destroyed = 0;
  const failure = new Error('Synthetic connection failure');
  await assert.rejects(
    acquireEmployeeIdentityLock({
      execute: async () => {
        throw failure;
      },
      destroy: () => destroyed++
    }),
    failure
  );
  const unlock = await acquireEmployeeIdentityLock({
    execute: async (sql) =>
      sql.includes('GET_LOCK(') ? [[{ acquired: 1 }]] : [[{ released: null }]],
    destroy: () => destroyed++
  });
  await assert.rejects(unlock(), /Could not release/);
  assert.equal(destroyed, 2);
});

test('lock timeout returns a retryable error before starting employee writes', async (t) => {
  database(t);
  let released = 0;
  t.mock.method(pool, 'getConnection', async () => ({
    execute: async (sql) => {
      assert.ok(sql.includes('GET_LOCK('));
      return [[{ acquired: 0 }]];
    },
    beginTransaction: async () =>
      assert.fail('Transaction started after timeout'),
    rollback: async () => assert.fail('No transaction was started'),
    release: () => released++
  }));
  await assert.rejects(importEmployees(req, [employee('A')], true), {
    status: 409
  });
  assert.equal(released, 1);
});

test('CLI first-setup ADMIN still works without an employee and uses the identity lock', async (t) => {
  const state = database(t);
  state.accounts = [];
  const filename = path.resolve(__dirname, '../scripts/create-user.js');
  const localRequire = createRequire(filename);
  const cliProcess = {
    argv: ['node', filename, 'first@example.invalid', 'ADMIN']
  };
  const errors = [];
  await vm.runInNewContext(
    fs.readFileSync(filename, 'utf8'),
    {
      require: (name) =>
        name === 'dotenv'
          ? { config() {} }
          : name === '../server/db/database'
            ? {
                pool: {
                  getConnection: () => pool.getConnection(),
                  end: async () => {}
                },
                initializeDatabase: async () => {}
              }
            : localRequire(name),
      process: cliProcess,
      console: { log() {}, error: (message) => errors.push(message) }
    },
    { filename }
  );
  assert.deepEqual(errors, []);
  assert.equal(cliProcess.exitCode, undefined);
  assert.equal(state.accounts[0].is_setup_admin, 1);
  assert.equal(state.employees.length, 0);
  assert.equal(
    (await getCurrentUser({ session: { userEmail: 'first@example.invalid' } }))
      .role,
    'ADMIN'
  );
  assert.deepEqual(state.events, [
    'lock',
    'begin',
    'commit',
    'unlock',
    'release'
  ]);
});
