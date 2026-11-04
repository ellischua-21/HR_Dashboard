const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../server/db/database');
const { LISTS, EMP_FIELDS } = require('../server/config/EmployeeSchema');
const {
  getFormMeta,
  getEmployee,
  saveEmployee
} = require('../server/services/EmployeeService');
const { getSession } = require('../server/middleware/Auth');
const { importEmployees } = require('../server/services/ImportService');
const { assignAccountHead } = require('../server/services/AccountService');
const {
  listIncidentViolations
} = require('../server/services/incident-management/Archive');
const { listFormsForReview } = require('../server/services/FormService');
const {
  saveIncidentEvaluation,
  searchIncidentEmployees
} = require('../server/services/IncidentService');
const {
  getIncidentCodeGuide,
  saveIncidentMatrix,
  matrixActionForOccurrence
} = require('../server/services/incident-management/Conduct');

test('HR and ADMIN can search another employee violation history while STAFF and HEAD cannot', async (t) => {
  let role = 'ADMIN';
  t.mock.method(pool, 'execute', async (sql) => {
    if (sql.includes('FROM user_roles'))
      return [
        [
          {
            email: 'reviewer@example.com',
            role,
            active: 1,
            extra_perms: 'emp.read'
          }
        ]
      ];
    if (sql.includes('SELECT COUNT(*)')) return [[{ total: 0 }]];
    return [[]];
  });
  const req = { session: { userEmail: 'reviewer@example.com' } };
  for (role of ['ADMIN', 'HR']) {
    assert.equal(
      (
        await listIncidentViolations(req, {
          employeeEmail: 'employee@example.com'
        })
      ).total,
      0
    );
    assert.deepEqual(
      await searchIncidentEmployees(req, 'Employee', 'violation-history'),
      []
    );
  }
  for (role of ['STAFF', 'HEAD']) {
    await assert.rejects(
      listIncidentViolations(req, { employeeEmail: 'employee@example.com' }),
      { status: 403 }
    );
    await assert.rejects(
      searchIncidentEmployees(req, 'Employee', 'violation-history'),
      { status: 403 }
    );
    assert.equal((await listIncidentViolations(req)).total, 0);
  }
});

test('HR and ADMIN share full employee fields, records and updates without a sensitive permission', async (t) => {
  let role = 'HR';
  const record = {
    record_id: 'EMP-000001',
    emp_no: 'T-1',
    first_name: 'Test',
    last_name: 'Employee',
    company: 'Company A',
    location: 'Head Office',
    position: 'Staff',
    department: 'IT',
    rank: 'Rank and File',
    status: 'Active',
    date_employed: '2026-01-01',
    fte: 1,
    birthday: '2000-01-01',
    address: 'Current Address',
    salary_structure: 'Monthly',
    siblings: '[{"name":"Sibling"}]',
    emergency_name: 'Emergency Contact'
  };
  t.mock.method(pool, 'execute', async (sql) => {
    if (sql.includes('FROM user_roles'))
      return [
        [
          {
            email: 'employee@example.com',
            role,
            active: 1,
            extra_perms: 'emp.read,emp.write,emp.sensitive'
          }
        ]
      ];
    if (sql.startsWith('SELECT * FROM employees')) return [[record]];
    if (sql.includes('INSERT INTO audit_logs')) return [{ affectedRows: 1 }];
    throw new Error('Unexpected query: ' + sql);
  });
  t.mock.method(pool, 'query', async () => [
    Object.entries(LISTS).flatMap(([list_name, values]) =>
      values.map((value) => ({ list_name, value }))
    )
  ]);
  const updates = [];
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release() {},
    execute: async (sql, values) => {
      if (sql.startsWith('SELECT record_id')) return [[]];
      if (sql.startsWith('SELECT * FROM employees')) return [[record]];
      if (sql.startsWith('UPDATE employees')) {
        updates.push({ sql, values });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO audit_logs')) return [{ affectedRows: 1 }];
      throw new Error('Unexpected transaction query: ' + sql);
    }
  }));
  const req = { session: { userEmail: 'employee@example.com' } };
  const expected = EMP_FIELDS.filter(
    (f) => !f[3].includes('C') && f[0] !== 'docs'
  ).map((f) => f[0]);
  for (role of ['HR', 'ADMIN']) {
    const metadata = await getFormMeta(req);
    assert.deepEqual(
      metadata.fields.map((f) => f.key),
      expected
    );
    const employee = await getEmployee(req, record.record_id);
    assert.equal(employee.birthday, record.birthday);
    assert.equal(employee.address, record.address);
    assert.equal(employee.salary_structure, record.salary_structure);
    assert.equal(employee.siblings, record.siblings);
    assert.equal(employee.emergency_name, record.emergency_name);
    assert.equal(
      (await saveEmployee(req, { ...record, address: 'Updated Address' })).ok,
      true
    );
    assert.ok(updates.at(-1).values.includes('Updated Address'));
    assert.ok(!(await getSession(req)).perms.includes('emp.sensitive'));
  }
  for (role of ['HEAD', 'STAFF']) {
    await assert.rejects(getFormMeta(req), { status: 403 });
    await assert.rejects(getEmployee(req, record.record_id), { status: 403 });
    await assert.rejects(saveEmployee(req, record), { status: 403 });
  }
});

test('COC matrix selects the matching offense count and caps at the final configured row', () => {
  const matrix = [
    { severity: 'Light', occurrence: 1, correctiveAction: 'Written Warning' },
    { severity: 'Light', occurrence: 2, correctiveAction: '4 days Suspension' }
  ];
  assert.equal(
    matrixActionForOccurrence(matrix, 'Light', 2).correctiveAction,
    '4 days Suspension'
  );
  assert.equal(
    matrixActionForOccurrence(matrix, 'Light', 5).correctiveAction,
    '4 days Suspension'
  );
  assert.equal(matrixActionForOccurrence(matrix, 'Grave', 1), null);
});

test('form review date filters apply before the row limit and preserve the authorized queue and badge totals', async (t) => {
  const calls = [];
  let role = 'HR';
  t.mock.method(pool, 'execute', async (sql, values) => {
    calls.push({ sql, values });
    if (/^SELECT email, full_name, role/.test(sql))
      return [[{ email: 'hr@example.com', role, active: 1 }]];
    if (sql.includes('SELECT COUNT(*) AS total'))
      return [[{ total: 12, pending: 8, approved: 3, rejected: 1 }]];
    if (sql.includes('SELECT f.id, f.control_no')) return [[]];
    if (sql.includes('INSERT INTO audit_logs')) return [{ affectedRows: 1 }];
    throw new Error('Unexpected query');
  });
  const req = { session: { userEmail: 'hr@example.com' } };
  const result = await listFormsForReview(req, 'ALL', {
    dateFrom: '2026-10-01',
    dateTo: '2026-10-29'
  });
  const list = calls.find((call) =>
    call.sql.includes('SELECT f.id, f.control_no')
  );
  assert.ok(list.sql.includes('f.user_email <> ?'));
  assert.match(
    list.sql,
    /f.submitted_at >= \?[\s\S]*f.submitted_at < DATE_ADD\(\?, INTERVAL 1 DAY\)[\s\S]*LIMIT 500/
  );
  assert.deepEqual(list.values, [
    'hr@example.com',
    '2026-10-01 00:00:00',
    '2026-10-29 00:00:00'
  ]);
  assert.equal(result.summary.pending, 8);
  const summary = calls.find((call) =>
    call.sql.includes('SELECT COUNT(*) AS total')
  );
  assert.ok(!summary.values.includes('2026-10-01 00:00:00'));
  await assert.rejects(
    listFormsForReview(req, 'ALL', {
      dateFrom: '2026-10-30',
      dateTo: '2026-10-01'
    }),
    { status: 400 }
  );
  role = 'STAFF';
  await assert.rejects(
    listFormsForReview(req, 'ALL', { dateFrom: '2026-10-01' }),
    { status: 403 }
  );
});

test('saving the COC matrix immediately changes the guide for all roles', async (t) => {
  let role = 'HR';
  let matrix = [];
  t.mock.method(pool, 'execute', async (sql, values) => {
    if (sql.includes('FROM user_roles'))
      return [[{ email: 'user@example.com', role, active: 1 }]];
    if (sql.startsWith('UPDATE incident_code_policy_draft')) {
      matrix = JSON.parse(values[0]);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('SELECT matrix FROM incident_code_policy_draft'))
      return [[{ matrix: JSON.stringify(matrix) }]];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const req = { session: { userEmail: 'user@example.com' } };
  const rows = [
    { severity: 'Light', occurrence: 1, correctiveAction: 'Written Warning' }
  ];
  await saveIncidentMatrix(req, rows);
  for (role of ['STAFF', 'HEAD', 'HR', 'ADMIN']) {
    const guide = await getIncidentCodeGuide(req);
    assert.deepEqual(guide.matrix, rows);
    assert.equal(guide.canManage, ['HR', 'ADMIN'].includes(role));
  }
});

test('COC matrix saves still reject invalid rows and unauthorized users', async (t) => {
  let role = 'HR';
  let writes = 0;
  t.mock.method(pool, 'execute', async (sql) => {
    if (sql.includes('FROM user_roles'))
      return [[{ email: 'user@example.com', role, active: 1 }]];
    if (sql.startsWith('UPDATE incident_code_policy_draft')) ++writes;
    return [{ affectedRows: 1 }];
  });
  const req = { session: { userEmail: 'user@example.com' } };
  const row = {
    severity: 'Light',
    occurrence: 1,
    correctiveAction: 'Written Warning'
  };
  await assert.rejects(saveIncidentMatrix(req, [row, row]), { status: 400 });
  await assert.rejects(
    saveIncidentMatrix(req, [{ ...row, correctiveAction: 'A'.repeat(192) }]),
    {
      status: 400,
      message: 'Corrective actions must be 191 characters or fewer.'
    }
  );
  role = 'STAFF';
  await assert.rejects(saveIncidentMatrix(req, [row]), { status: 403 });
  assert.equal(writes, 0);
  role = 'HR';
  await saveIncidentMatrix(req, [
    { ...row, correctiveAction: 'A'.repeat(191) }
  ]);
  assert.equal(writes, 1);
});

test('HR imports validate the same complete employee fields as ADMIN', async (t) => {
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
        birthday: '2000-01-01',
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
      if (sql.includes('COUNT(*)')) return [[{ total: 1 }]];
      if (sql.includes('SELECT matrix FROM incident_code_policy_draft'))
        return [
          [
            {
              matrix: JSON.stringify([
                {
                  severity: 'Light',
                  occurrence: 1,
                  correctiveAction: 'Written Warning'
                },
                {
                  severity: 'Light',
                  occurrence: 2,
                  correctiveAction: '4 days Suspension'
                }
              ])
            }
          ]
        ];
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
      recommendedAction: 'Wrong client suggestion'
    }
  );
  assert.equal(committed, true);
  assert.equal(result.recommendedAction, '4 days Suspension');
  const saved = calls.find((call) =>
    call.sql.includes('INSERT INTO incident_evaluations')
  );
  assert.equal(saved.values[11], '');
  assert.equal(saved.values[5], 'Test incident');
  assert.equal(saved.values[9], '4 days Suspension');
  assert.equal(saved.values[10], '4 days Suspension');
});
