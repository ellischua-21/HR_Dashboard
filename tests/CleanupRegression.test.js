const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../server/db/database');
const { LISTS } = require('../server/config/EmployeeSchema');
const { importEmployees } = require('../server/services/ImportService');
const { assignAccountHead } = require('../server/services/AccountService');
const {
  saveIncidentEvaluation
} = require('../server/services/IncidentService');

test('HR imports share employee cleaning without requiring inaccessible sensitive fields', async (t) => {
  t.mock.method(pool, 'execute', async () => [
    [{ email: 'hr@example.com', role: 'HR', active: 1 }]
  ]);
  t.mock.method(pool, 'query', async () => [
    Object.entries(LISTS).flatMap(([list_name, values]) =>
      values.map((value) => ({ list_name, value }))
    )
  ]);
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release() {},
    execute: async (sql) => {
      assert.match(sql, /SELECT emp_no FROM employees/);
      return [[]];
    }
  }));
  const result = await importEmployees(
    { session: { userEmail: 'hr@example.com' } },
    [
      {
        emp_no: 'T-1',
        first_name: 'Test',
        last_name: 'Employee',
        position: 'Staff',
        company: 'company a',
        department: 'IT',
        location: 'Head Office',
        rank: 'Rank and File',
        status: 'Active',
        date_employed: '2026-01-01',
        fte: 1
      },
      null
    ],
    false
  );
  assert.equal(result.valid, 1);
  assert.equal(result.imported, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].row, 3);
});

test('single Head assignments reuse bulk assignment validation and preserve HR designation', async (t) => {
  const calls = [];
  t.mock.method(pool, 'execute', async () => [
    [{ email: 'admin@example.com', role: 'ADMIN', active: 1 }]
  ]);
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release() {},
    query: async () => [
      [
        { email: 'staff@example.com', role: 'STAFF', active: 1 },
        { email: 'head@example.com', role: 'HEAD', active: 1 }
      ]
    ],
    execute: async (sql, values) => {
      calls.push({ sql, values });
      return [{ affectedRows: 1 }];
    }
  }));
  const result = await assignAccountHead(
    { session: { userEmail: 'admin@example.com' } },
    'STAFF@example.com',
    'HEAD@example.com'
  );
  assert.deepEqual(result, {
    ok: true,
    email: 'staff@example.com',
    headEmail: 'head@example.com'
  });
  assert.ok(calls.some((call) => /SET assigned_head_email/.test(call.sql)));
  assert.ok(calls.every((call) => !/SET is_hr_head/.test(call.sql)));
});

test('an evaluation saves without removed violation, reference, or justification fields', async (t) => {
  const calls = [];
  let committed = false;
  t.mock.method(pool, 'execute', async () => [
    [{ email: 'hr@example.com', role: 'HR', active: 1 }]
  ]);
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    commit: async () => {
      committed = true;
    },
    rollback: async () => {},
    release() {},
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('FROM incident_reports WHERE id'))
        return [
          [
            {
              id: 7,
              case_number: 'IR-7',
              subject: 'Test incident',
              status: 'EVALUATION',
              reported_employee_email: 'staff@example.com'
            }
          ]
        ];
      if (sql.includes('FROM incident_decisions')) return [[]];
      if (sql.includes('COUNT(*)')) return [[{ total: 0 }]];
      if (sql.includes('FROM incident_case_subjects')) return [[{ id: 4 }]];
      if (sql.includes('SELECT id FROM incident_evaluations'))
        return [[{ id: 8 }]];
      if (/^(INSERT|DELETE)/.test(sql.trim()))
        return [{ insertId: 8, affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    }
  }));
  const result = await saveIncidentEvaluation(
    { session: { userEmail: 'hr@example.com' } },
    7,
    {
      finding: 'SUBSTANTIATED',
      findings: 'Findings reviewed.',
      severity: 'Light',
      recommendedAction: 'Written Warning'
    }
  );
  assert.equal(committed, true);
  assert.equal(result.recommendedAction, 'Written Warning');
  const saved = calls.find((call) =>
    call.sql.includes('INSERT INTO incident_evaluations')
  );
  assert.equal(saved.values[11], '');
  assert.equal(saved.values[5], 'Test incident');
});
