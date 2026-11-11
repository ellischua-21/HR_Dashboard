const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../server/db/database');
const { saveAccountChanges } = require('../server/services/AccountService');
const Tasks = require('../server/services/TaskService');
const { reviewUserForm } = require('../server/services/FormService');
const { accountIdentityMock } = require('./helpers/AccountFixtures');

const ADMIN = 'admin@example.invalid';
const OLD = 'old@example.invalid';
const NEXT = 'next@example.invalid';
const OTHER = 'other@example.invalid';
const NOW = Date.parse('2026-11-11T10:00:00+08:00');

// Synthetic SQL responses exercise the real account, task and review modules.
function fixture(t, { owned = true, failReroute = false } = {}) {
  let actor = ADMIN;
  let state = {
    accounts: [
      { email: ADMIN, role: 'ADMIN', active: 1 },
      { email: OLD, role: 'HR', active: 1, is_hr_head: 1 },
      { email: NEXT, role: 'HR', active: 1, is_hr_head: 0 },
      { email: OTHER, role: 'HR', active: 1, is_hr_head: 0 }
    ],
    forms: [
      [1, NEXT, 'PENDING', 'HEAD', OLD, 'authority-to-deduct', 'HR'],
      [2, OTHER, 'PENDING', 'HEAD', OLD, 'authority-to-deduct', 'HR'],
      [3, OLD, 'PENDING', 'HR', null, 'authority-to-deduct', 'HR'],
      [4, NEXT, 'APPROVED', 'HEAD', OLD, 'authority-to-deduct', 'HR'],
      [5, NEXT, 'PENDING', 'HEAD', OLD, 'nexus-accountability', 'HR'],
      [
        6,
        'staff@example.invalid',
        'PENDING',
        'HEAD',
        OLD,
        'authority-to-deduct',
        'STAFF'
      ]
    ].map(
      ([
        id,
        user_email,
        status,
        review_stage,
        head_reviewer_email,
        template_key,
        submitter_role
      ]) => ({
        id,
        user_email,
        status,
        review_stage,
        head_reviewer_email,
        template_key,
        submitter_role,
        control_no: `TEST-${id}`,
        form_data: '{}'
      })
    ),
    tasks: [1, 2, 4].map((id) => ({
      id: id + 10,
      resource_type: 'FORM',
      resource_id: id,
      phase: 'HEAD',
      stage: 'HEAD',
      state: id === 4 ? 'COMPLETED' : 'READY',
      owner_email: owned ? OLD : null,
      active_ms: 120000,
      run_started_ms: owned && id !== 4 ? NOW - 3600000 : null,
      taken_ms: NOW - 7200000,
      updated_ms: NOW - 3600000,
      completed_ms: id === 4 ? NOW - 3600000 : null,
      waiting_reason: ''
    })),
    events: [{ task_id: 11, action: 'TAKEN', owner_email: OLD }],
    audit: [],
    revision: 0
  };
  let snapshot;
  let rollbacks = 0;
  const db = {
    beginTransaction: async () => {
      snapshot = structuredClone(state);
    },
    commit: async () => {},
    rollback: async () => {
      state = snapshot;
      rollbacks++;
    },
    release() {},
    query: async (sql) => {
      assert.match(sql, /FROM user_roles FOR UPDATE/);
      return [structuredClone(state.accounts)];
    },
    execute: async (sql, values = []) => {
      if (sql.includes('UPDATE user_forms f')) {
        for (const form of state.forms)
          if (
            form.status === 'PENDING' &&
            form.review_stage === 'HEAD' &&
            form.template_key !== 'nexus-accountability' &&
            form.head_reviewer_email === values[1] &&
            form.submitter_role === 'HR'
          )
            form.head_reviewer_email = values[0];
      } else if (sql.includes("UPDATE user_forms SET review_stage = 'HR'")) {
        assert.match(sql, /user_email = \?/);
        assert.match(sql, /head_reviewer_email = \?/);
        assert.match(sql, /template_key <> 'nexus-accountability'/);
        for (const form of state.forms)
          if (
            form.status === 'PENDING' &&
            form.review_stage === 'HEAD' &&
            form.template_key !== 'nexus-accountability' &&
            form.user_email === values[0] &&
            form.head_reviewer_email === values[1]
          ) {
            form.review_stage = 'HR';
            form.head_reviewer_email = null;
          }
      } else if (sql.includes('SELECT COUNT(*) AS total FROM user_forms')) {
        return [
          [
            {
              total: state.forms.filter(
                (form) =>
                  form.status === 'PENDING' &&
                  form.review_stage === 'HEAD' &&
                  form.template_key !== 'nexus-accountability' &&
                  form.head_reviewer_email === values[0] &&
                  form.submitter_role === 'HR'
              ).length
            }
          ]
        ];
      } else if (sql.includes('UPDATE user_roles SET is_hr_head = 0')) {
        state.accounts
          .filter((account) => account.role === 'HR')
          .forEach((account) => {
            account.is_hr_head = 0;
          });
      } else if (sql.includes('UPDATE user_roles SET is_hr_head = 1')) {
        state.accounts.find(
          (account) => account.email === values[0]
        ).is_hr_head = 1;
      } else if (sql.includes('FROM hr_tasks t JOIN user_forms')) {
        return [
          state.tasks
            .filter((task) => {
              const form = state.forms.find(
                (item) => item.id === task.resource_id
              );
              return (
                task.phase === 'HEAD' &&
                task.state !== 'COMPLETED' &&
                ((sql.includes("f.review_stage = 'HR'") &&
                  form.review_stage === 'HR') ||
                  (task.owner_email &&
                    task.owner_email !== form.head_reviewer_email))
              );
            })
            .map((task) => ({
              ...task,
              review_stage: state.forms.find(
                (form) => form.id === task.resource_id
              ).review_stage
            }))
        ];
      } else if (sql.includes('UPDATE hr_tasks SET owner_email = NULL')) {
        const task = state.tasks.find((item) => item.id === values[2]);
        task.owner_email = null;
        task.run_started_ms = null;
        task.active_ms += values[0];
        task.updated_ms = values[1];
      } else if (sql.includes("UPDATE hr_tasks SET phase = 'HR'")) {
        const task = state.tasks.find((item) => item.id === values[1]);
        assert(
          !state.tasks.some(
            (item) =>
              item !== task &&
              item.resource_id === task.resource_id &&
              item.phase === 'HR'
          )
        );
        Object.assign(task, {
          phase: 'HR',
          stage: 'HR',
          state: 'READY',
          waiting_reason: '',
          run_started_ms: null,
          updated_ms: values[0]
        });
      } else if (sql.includes('INSERT INTO hr_task_events')) {
        if (failReroute && values[1] === 'REROUTED')
          throw new Error('Synthetic event failure');
        state.events.push(
          Object.fromEntries(
            [
              'task_id',
              'action',
              'actor_email',
              'previous_owner',
              'owner_email',
              'credit_owner',
              'active_ms',
              'event_ms',
              'remarks'
            ].map((key, i) => [key, values[i]])
          )
        );
      } else if (sql.includes('UPDATE hr_task_revision')) {
        state.revision++;
      } else if (sql.includes('INSERT INTO audit_logs')) {
        state.audit.push(values);
      } else if (sql.includes('FROM user_forms f')) {
        return [[{ ...state.forms.find((form) => form.id === values[0]) }]];
      } else if (sql.includes('SELECT * FROM hr_tasks WHERE resource_type')) {
        return [
          state.tasks
            .filter(
              (task) =>
                task.resource_type === values[0] &&
                task.resource_id === values[1] &&
                task.phase === values[2]
            )
            .map((task) => ({ ...task }))
        ];
      } else if (sql.includes('UPDATE hr_tasks SET owner_email = ?')) {
        Object.assign(
          state.tasks.find((task) => task.id === values[5]),
          {
            owner_email: values[0],
            run_started_ms: values[3],
            updated_ms: values[4]
          }
        );
      } else if (sql.includes('UPDATE user_forms SET status = ?')) {
        state.forms.find((form) => form.id === values.at(-1)).status =
          values[0];
      } else if (sql.includes('UPDATE hr_tasks SET state = ?')) {
        const task = state.tasks.find((item) => item.id === values[7]);
        Object.assign(task, {
          state: values[0],
          stage: values[1],
          waiting_reason: values[2],
          active_ms: task.active_ms + values[3],
          run_started_ms: values[4],
          completed_ms: values[5],
          updated_ms: values[6]
        });
      } else throw new Error('Unexpected synthetic query: ' + sql);
      return [{ affectedRows: 1 }];
    }
  };
  t.mock.method(Date, 'now', () => NOW);
  t.mock.method(pool, 'execute', (...args) =>
    accountIdentityMock(() =>
      state.accounts.find((account) => account.email === actor)
    )(...args)
  );
  t.mock.method(pool, 'query', async () => {
    throw new Error('Unexpected pool query');
  });
  t.mock.method(pool, 'getConnection', async () => db);
  return {
    state: () => state,
    rollbacks: () => rollbacks,
    req: (email) => {
      actor = email;
      return { session: { userEmail: email } };
    },
    transfer: () =>
      saveAccountChanges(
        { session: { userEmail: ADMIN } },
        { hrHeadChanged: true, hrHeadEmail: NEXT }
      )
  };
}

test('Head HR transfer routes the replacement own form to HR and preserves task history and credit', async (t) => {
  const f = fixture(t);
  const before = structuredClone(f.state());
  await f.transfer();
  const { forms, tasks, events, accounts, revision } = f.state();
  assert.equal(forms[0].review_stage, 'HR');
  assert.equal(forms[0].head_reviewer_email, null);
  assert.equal(forms[1].review_stage, 'HEAD');
  assert.equal(forms[1].head_reviewer_email, NEXT);
  assert.deepEqual(forms.slice(2), before.forms.slice(2));
  assert.equal(
    accounts.find((account) => account.email === NEXT).is_hr_head,
    1
  );
  assert.equal(accounts.find((account) => account.email === OLD).is_hr_head, 0);
  assert.equal(tasks.length, before.tasks.length);
  assert.deepEqual(tasks[2], before.tasks[2]);
  assert.equal(tasks.filter((task) => task.state !== 'COMPLETED').length, 2);
  assert.equal(tasks[0].id, 11);
  assert.equal(tasks[0].phase, 'HR');
  assert.equal(tasks[0].stage, 'HR');
  assert.equal(tasks[0].owner_email, null);
  assert.equal(tasks[0].run_started_ms, null);
  assert.equal(tasks[0].active_ms, 3720000);
  assert.equal(tasks[0].taken_ms, before.tasks[0].taken_ms);
  assert.equal(tasks[0].completed_ms, null);
  assert.equal(tasks[1].phase, 'HEAD');
  assert.equal(tasks[1].owner_email, null);
  assert.deepEqual(events[0], before.events[0]);
  const credit = events.find(
    (event) => event.task_id === 11 && event.action === 'RELEASED'
  );
  assert.equal(credit.credit_owner, OLD);
  assert.equal(credit.active_ms, 3600000);
  assert.ok(
    events.some((event) => event.task_id === 11 && event.action === 'REROUTED')
  );
  assert.ok(revision > 0);

  await assert.rejects(Tasks.takeTask(f.req(NEXT), 'FORM', 1), { status: 400 });
  await assert.rejects(
    reviewUserForm(f.req(NEXT), 1, 'REJECTED', 'Synthetic reason'),
    { status: 403 }
  );
  await assert.rejects(
    reviewUserForm(f.req(OTHER), 1, 'REJECTED', 'Synthetic reason'),
    { status: 409 }
  );
  await Tasks.takeTask(f.req(OTHER), 'FORM', 1);
  assert.equal(f.state().tasks[0].owner_email, OTHER);
  assert.equal(
    (await reviewUserForm(f.req(OTHER), 1, 'REJECTED', 'Synthetic reason'))
      .status,
    'REJECTED'
  );
  assert.equal(f.state().tasks[0].state, 'COMPLETED');
  assert.equal(f.state().tasks.length, before.tasks.length);
});

test('an unowned task moves to HR without fabricated credit or completion', async (t) => {
  const f = fixture(t, { owned: false });
  await f.transfer();
  const task = f.state().tasks[0];
  assert.equal(task.phase, 'HR');
  assert.equal(task.state, 'READY');
  assert.equal(task.active_ms, 120000);
  assert.equal(task.completed_ms, null);
  assert.equal(f.state().tasks.length, 3);
  assert.ok(f.state().events.some((event) => event.action === 'REROUTED'));
  assert.ok(!f.state().events.some((event) => event.action === 'RELEASED'));
});

test('a task event failure rolls back form routing, designation, credit and audit writes', async (t) => {
  const f = fixture(t, { failReroute: true });
  const before = structuredClone(f.state());
  await assert.rejects(f.transfer(), /Synthetic event failure/);
  assert.deepEqual(f.state(), before);
  assert.equal(f.rollbacks(), 1);
});

test('removing Head HR still rejects while pending forms need that reviewer', async (t) => {
  const f = fixture(t);
  const before = structuredClone(f.state());
  await assert.rejects(
    saveAccountChanges(f.req(ADMIN), {
      hrHeadChanged: true,
      hrHeadEmail: null
    }),
    { status: 409 }
  );
  assert.deepEqual(f.state(), before);
});
