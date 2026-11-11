const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../server/db/database');
const Leave = require('../server/services/LeaveService');
const { reviewUserForm } = require('../server/services/FormService');
const { accountIdentityMock } = require('./helpers/AccountFixtures');

const EMAIL = 'employee@example.invalid';
const HR = 'hr@example.invalid';
const signature = 'data:image/png;base64,iVBORw0KGgo=';
const employee = {
  record_id: 'SYNTHETIC',
  status: 'Regular',
  rank: 'Supervisor',
  record_status: 'Active',
  date_employed: '2025-01-01',
  regularized_on: '2026-01-01'
};
const leave = {
  leaveType: 'Vacation Leave (VL)',
  payType: 'WITH_PAY',
  dateFrom: '2026-11-02',
  dateTo: '2026-11-04',
  days: 3
};

// Models SQL results and rollback only; it cannot prove MySQL lock isolation.
function fixture(t) {
  let state = {
    accounts: [],
    ledger: [],
    forms: [],
    tasks: [],
    audit: [],
    events: [],
    revision: 0
  };
  let snapshot,
    actor = HR,
    failAudit = false;
  const calls = [];
  const counts = { commits: 0, rollbacks: 0, releases: 0 };
  const db = {
    beginTransaction: async () => {
      snapshot = structuredClone(state);
    },
    commit: async () => {
      counts.commits++;
    },
    rollback: async () => {
      state = snapshot;
      counts.rollbacks++;
    },
    release: () => {
      counts.releases++;
    },
    execute: async (sql, values = []) => {
      calls.push({ sql, values });
      if (sql.includes('LOWER(TRIM(personal_email))'))
        return [[{ ...employee }]];
      if (sql.includes('FROM user_forms f'))
        return [[structuredClone(state.forms.find((f) => f.id === values[0]))]];
      if (sql.includes('FROM user_forms WHERE LOWER(user_email)'))
        return [
          state.forms
            .filter((f) => f.status === 'APPROVED')
            .map((f) => structuredClone(f))
        ];
      if (sql.startsWith('INSERT IGNORE INTO leave_accounts')) {
        const key = values.join('|'),
          exists = state.accounts.includes(key);
        if (!exists) state.accounts.push(key);
        return [{ affectedRows: exists ? 0 : 1 }];
      }
      if (sql.includes('INTO leave_transactions')) {
        const [id, year, type, days = 5, formId = null] = values;
        const duplicate =
          formId !== null &&
          state.ledger.some(
            (entry) =>
              entry.id === id &&
              entry.year === year &&
              entry.type === type &&
              entry.formId === formId
          );
        if (duplicate) {
          assert.match(sql, /INSERT IGNORE/);
          return [{ affectedRows: 0 }];
        }
        state.ledger.push({ id, year, type, days, formId });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SUM(days)'))
        return [
          [
            {
              balance: state.ledger
                .filter((entry) =>
                  [entry.id, entry.year, entry.type].every(
                    (value, i) => value === values[i]
                  )
                )
                .reduce((sum, entry) => sum + entry.days, 0)
            }
          ]
        ];
      if (sql.includes('SELECT * FROM hr_tasks'))
        return [
          [{ ...state.tasks.find((task) => task.resource_id === values[1]) }]
        ];
      if (sql.startsWith('UPDATE hr_tasks SET state')) {
        const task = state.tasks.find((task) => task.id === values[7]);
        Object.assign(task, {
          state: values[0],
          stage: values[1],
          waiting_reason: values[2],
          active_ms: task.active_ms + values[3],
          run_started_ms: values[4],
          completed_ms: values[5],
          updated_ms: values[6]
        });
      } else if (sql.startsWith('UPDATE user_forms SET status')) {
        const form = state.forms.find((form) => form.id === values.at(-1));
        form.status = values[0];
        if (sql.includes('form_data = ?')) form.form_data = values[4];
      } else if (sql.includes('INSERT INTO audit_logs')) {
        if (failAudit) throw new Error('Synthetic audit failure');
        state.audit.push(values);
      } else if (sql.includes('INSERT INTO hr_task_events'))
        state.events.push(values);
      else if (sql.startsWith('UPDATE hr_task_revision')) state.revision++;
      else assert.fail('Unexpected synthetic query: ' + sql);
      return [{ affectedRows: 1 }];
    }
  };
  t.mock.method(pool, 'execute', (...args) =>
    accountIdentityMock(() => ({ email: actor, role: 'HR', active: 1 }))(
      ...args
    )
  );
  t.mock.method(pool, 'query', async () =>
    assert.fail('Unexpected pool query')
  );
  t.mock.method(pool, 'getConnection', async () => db);
  return {
    db,
    calls,
    counts,
    state: () => state,
    req: (email = HR) => {
      actor = email;
      return { session: { userEmail: email } };
    },
    failAudit: () => {
      failAudit = true;
    },
    addForm: (id, data = leave) => {
      state.forms.push({
        id,
        control_no: `SYNTHETIC-${id}`,
        template_key: 'leave-2026',
        user_email: EMAIL,
        submitter_role: 'STAFF',
        review_stage: 'HR',
        status: 'PENDING',
        form_data: JSON.stringify(data)
      });
      state.tasks.push({
        id: id + 10,
        resource_id: id,
        phase: 'HR',
        stage: 'HR',
        state: 'READY',
        owner_email: HR,
        active_ms: 0,
        run_started_ms: null,
        waiting_reason: '',
        updated_ms: 1
      });
    }
  };
}

test('cross-year leave requires a valid half-day allocation with matching totals and calendar capacity', () => {
  const data = {
    ...leave,
    dateFrom: '2026-12-31',
    dateTo: '2027-01-02',
    days: 2
  };
  assert.deepEqual(
    Leave.allocations({ ...data, yearAllocation: { 2026: 0.5, 2027: 1.5 } }),
    [
      { year: 2026, days: 0.5 },
      { year: 2027, days: 1.5 }
    ]
  );
  assert.deepEqual(Leave.allocations({ ...data, days: 3 }), [
    { year: 2026, days: 1 },
    { year: 2027, days: 2 }
  ]);
  for (const input of [
    data,
    { ...data, yearAllocation: { 2026: 1.5, 2027: 0.5 } },
    { ...data, yearAllocation: { 2026: 0.25, 2027: 1.75 } },
    { ...data, yearAllocation: { 2026: 0.5, 2027: 0.5 } },
    { ...data, dateTo: '2028-01-02' }
  ])
    assert.throws(() => Leave.allocations(input), { status: 400 });
});

test('allowances and historical deductions are idempotent and remain separate by year and leave type', async (t) => {
  const f = fixture(t);
  f.addForm(1, { ...leave, days: 1.5 });
  f.state().forms[0].status = 'APPROVED';
  for (let read = 0; read < 2; read++)
    assert.deepEqual(await Leave.getBalances(f.db, employee, EMAIL, 2026), {
      year: 2026,
      eligible: true,
      SL: 5,
      VL: 3.5
    });
  assert.equal(f.state().ledger.length, 3);
  assert.deepEqual(await Leave.getBalances(f.db, employee, EMAIL, 2027), {
    year: 2027,
    eligible: true,
    SL: 5,
    VL: 5
  });
  assert.equal(
    f.state().ledger.filter((entry) => entry.formId === 1).length,
    1
  );
  assert.deepEqual(await Leave.getBalances(f.db, employee, EMAIL, 2025), {
    year: 2025,
    eligible: true,
    SL: 0,
    VL: 0
  });
});

test('paid leave preflight does not deduct; ineligible and pre-regularization requests cannot use allowances', async (t) => {
  const f = fixture(t);
  await Leave.validatePaidLeave(f.db, employee, EMAIL, leave);
  assert.equal(
    f.state().ledger.filter((entry) => entry.formId !== null).length,
    0
  );
  for (const changed of [
    { status: 'Probationary' },
    { rank: 'Rank & File' },
    { record_status: 'Archived' },
    { rank: '' }
  ]) {
    const person = { ...employee, ...changed };
    assert.deepEqual(await Leave.getBalances(f.db, person, EMAIL, 2026), {
      year: 2026,
      eligible: false,
      SL: 0,
      VL: 0
    });
    await assert.rejects(
      Leave.validatePaidLeave(f.db, person, EMAIL, leave),
      /Regular status/
    );
  }
  await assert.rejects(
    Leave.validatePaidLeave(f.db, employee, EMAIL, {
      ...leave,
      dateFrom: '2025-12-31'
    }),
    /on or after regularization/
  );
  const before = structuredClone(f.state());
  await Leave.validatePaidLeave(f.db, null, EMAIL, {
    ...leave,
    payType: 'WITHOUT_PAY'
  });
  assert.deepEqual(f.state(), before);
});

test('final HR approval locks employee identity, deducts once, persists balances and prevents overdraw', async (t) => {
  const f = fixture(t);
  f.addForm(1);
  assert.equal(
    (await reviewUserForm(f.req(), 1, 'APPROVED', '', signature)).status,
    'APPROVED'
  );
  assert.equal(
    f.state().ledger.filter((entry) => entry.formId === 1).length,
    1
  );
  assert.equal(JSON.parse(f.state().forms[0].form_data).vlBalance, 2);
  assert.equal(JSON.parse(f.state().forms[0].form_data).slBalance, 5);
  assert.equal(f.state().tasks[0].state, 'COMPLETED');
  const locks = f.calls.filter((call) =>
    call.sql.includes('LOWER(TRIM(personal_email))')
  );
  assert.ok(
    locks.length > 0 && locks.every((call) => call.sql.endsWith('FOR UPDATE'))
  );
  await assert.rejects(reviewUserForm(f.req(), 1, 'APPROVED', '', signature), {
    status: 409
  });
  f.addForm(2);
  const before = structuredClone(f.state());
  await assert.rejects(
    reviewUserForm(f.req(), 2, 'APPROVED', '', signature),
    /Insufficient VL balance/
  );
  assert.deepEqual(f.state(), before);
  assert.equal(f.counts.commits, 1);
});

test('a later-year balance failure rolls back the earlier-year deduction and grant', async (t) => {
  const f = fixture(t);
  f.addForm(1, {
    ...leave,
    dateFrom: '2026-12-30',
    dateTo: '2027-01-06',
    days: 8,
    yearAllocation: { 2026: 2, 2027: 6 }
  });
  const before = structuredClone(f.state());
  await assert.rejects(
    reviewUserForm(f.req(), 1, 'APPROVED', '', signature),
    /Insufficient VL balance for 2027/
  );
  assert.ok(
    f.calls.some(
      (call) =>
        call.sql.includes('INSERT INTO leave_transactions') &&
        call.values[4] === 1
    )
  );
  assert.deepEqual(f.state(), before);
  assert.equal(f.counts.rollbacks, 1);
  assert.equal(f.counts.commits, 0);
});

test('audit failure rolls back leave approval, deductions, grants and task changes', async (t) => {
  const f = fixture(t);
  f.addForm(1);
  const before = structuredClone(f.state());
  f.failAudit();
  await assert.rejects(
    reviewUserForm(f.req(), 1, 'APPROVED', '', signature),
    /Synthetic audit failure/
  );
  assert.deepEqual(f.state(), before);
  assert.equal(f.counts.releases, 1);
  assert.equal(f.counts.commits, 0);
});

test('another owner or missing approval signature blocks deductions; rejection consumes no leave', async (t) => {
  const f = fixture(t);
  f.addForm(1);
  await assert.rejects(
    reviewUserForm(
      f.req('other@example.invalid'),
      1,
      'APPROVED',
      '',
      signature
    ),
    { status: 409 }
  );
  await assert.rejects(reviewUserForm(f.req(), 1, 'APPROVED'), /signature/i);
  assert.equal(f.state().ledger.length, 0);
  await reviewUserForm(f.req(), 1, 'REJECTED', 'Synthetic documented reason');
  assert.equal(f.state().ledger.length, 0);
  assert.equal(f.state().forms[0].status, 'REJECTED');
});

test('malformed historical year allocation rolls back a balance read and releases the connection', async (t) => {
  const f = fixture(t);
  f.addForm(1, {
    ...leave,
    dateFrom: '2026-12-31',
    dateTo: '2027-01-02',
    days: 2
  });
  f.state().forms[0].status = 'APPROVED';
  const before = structuredClone(f.state());
  await assert.rejects(
    Leave.getMyLeaveBalances(f.req(), 2026),
    /older approved leave request/
  );
  assert.deepEqual(f.state(), before);
  assert.deepEqual(f.counts, { commits: 0, rollbacks: 1, releases: 1 });
});
