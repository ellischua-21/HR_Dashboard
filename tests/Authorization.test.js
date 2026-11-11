const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, initializeDatabase } = require('../server/db/database');
const {
  getCurrentUser,
  getSession,
  requirePerm
} = require('../server/middleware/Auth');
const { accountIdentityMock } = require('./helpers/AccountFixtures');
const dashboard = require('../server/services/DashboardService');
const accounts = require('../server/services/AccountService');
const { getAuditLogs } = require('../server/services/AuditService');
const { getFormOptions } = require('../server/services/EmployeeService');
const announcements = require('../server/services/AnnouncementService');
const performance = require('../server/services/PerformanceService');
const tasks = require('../server/services/TaskService');
const configuration = require('../server/services/incident-management/WorkflowConfiguration');

const privileged = [
  'admin.manage',
  'audit.read',
  'exec.view',
  'dash.view',
  'emp.read',
  'emp.write',
  'emp.export',
  'emp.archive',
  'report.run',
  'announcements.manage',
  'forms.review',
  'forms.view',
  'incidents.coc.manage'
];

function fixture(t, role, extra = privileged.join(',')) {
  const account = {
    email: 'reviewer@example.com',
    role,
    active: 1,
    extra_perms: extra
  };
  const identity = accountIdentityMock(() => account);
  const denied = [];
  t.mock.method(pool, 'execute', async (sql, values) => {
    if (sql.startsWith('INSERT INTO audit_logs')) {
      denied.push(values);
      return [{ affectedRows: 1 }];
    }
    return identity(sql, values);
  });
  t.mock.method(pool, 'query', async (sql) => {
    throw new Error('Unauthorized business query reached: ' + sql);
  });
  t.mock.method(pool, 'getConnection', async () => {
    throw new Error('Unauthorized transaction reached');
  });
  return { account, denied, req: { session: { userEmail: account.email } } };
}

for (const role of ['STAFF', 'SUPERVISOR', 'HEAD']) {
  test(`${role} cannot gain privileged permissions from residual extras`, async (t) => {
    const { req } = fixture(t, role);
    const user = await getCurrentUser(req);
    const permitted = role === 'STAFF' ? [] : ['forms.review'];
    for (const permission of privileged) {
      assert.equal(
        user.perms.includes(permission),
        permitted.includes(permission),
        permission
      );
      if (!permitted.includes(permission))
        await assert.rejects(requirePerm(req, permission), { status: 403 });
    }
    for (const permission of [
      'employee.self',
      'forms.self',
      'announcements.read',
      'inbox.read',
      'account.password'
    ])
      assert.ok(user.perms.includes(permission), permission);
    assert.deepEqual((await getSession(req)).perms, user.perms);
  });

  test(`${role} direct privileged service calls reject before business queries`, async (t) => {
    const { req, denied } = fixture(t, role);
    const operations = [
      () => dashboard.getFilterOptions(req),
      () => dashboard.getDashboard(req),
      () => dashboard.getExecutiveSummary(req),
      () => accounts.getAccountManagement(req),
      () => accounts.saveAccountChanges(req, {}),
      () => accounts.approveAccountRequest(req, 1),
      () => accounts.rejectAccountRequest(req, 1),
      () =>
        accounts.assignAccountHead(
          req,
          'staff@example.com',
          'head@example.com'
        ),
      () => accounts.listAssignableHeads(req),
      () => getAuditLogs(req),
      () => getFormOptions(req),
      () => announcements.createAnnouncement(req, 'Title', 'Message'),
      () => announcements.listAnnouncementsForManagement(req),
      () => performance.getDashboard(req),
      () => tasks.assignees(req, 'FORM', 1),
      () => configuration.get(req),
      () => configuration.save(req, {})
    ];
    for (const operation of operations)
      await assert.rejects(operation(), { status: 403 });
    assert.equal(denied.length, operations.length);
    assert.ok(
      denied.every(
        ([email, action]) =>
          email === req.session.userEmail && action === 'ACCESS_DENIED'
      )
    );
  });
}

test('employee filters reproduce the residual emp.read access path', async (t) => {
  const { req } = fixture(t, 'STAFF', 'emp.read');
  let reads = 0;
  t.mock.method(pool, 'query', async () => {
    reads++;
    return [[{ list_name: 'Department_List', value: 'Sample Department' }]];
  });
  await assert.rejects(dashboard.getFilterOptions(req), { status: 403 });
  assert.equal(reads, 0);
});

for (const role of ['HR', 'ADMIN']) {
  test(`${role} retains authorized employee and role-specific access`, async (t) => {
    const { req } = fixture(t, role);
    const common = [
      'emp.read',
      'emp.write',
      'emp.export',
      'emp.archive',
      'report.run',
      'announcements.manage',
      'inbox.read',
      'account.password'
    ];
    const allowed =
      role === 'HR'
        ? [
            ...common,
            'dash.view',
            'forms.self',
            'forms.review',
            'incidents.coc.manage'
          ]
        : [...common, 'admin.manage', 'audit.read', 'exec.view', 'forms.view'];
    for (const permission of allowed)
      assert.equal((await requirePerm(req, permission)).role, role);
    const forbidden =
      role === 'HR'
        ? ['admin.manage', 'audit.read', 'exec.view', 'forms.view']
        : ['dash.view', 'forms.review', 'forms.self', 'incidents.coc.manage'];
    for (const permission of forbidden)
      await assert.rejects(requirePerm(req, permission), { status: 403 });

    t.mock.method(pool, 'query', async () => [[]]);
    assert.deepEqual((await dashboard.getFilterOptions(req)).department, []);
    assert.ok(await getFormOptions(req));
    if (role === 'HR') {
      assert.ok((await dashboard.getDashboard(req)).kpis);
      await assert.rejects(accounts.getAccountManagement(req), { status: 403 });
      await assert.rejects(getAuditLogs(req), { status: 403 });
    } else {
      assert.ok((await dashboard.getExecutiveSummary(req)).current.kpis);
      assert.deepEqual(
        (await accounts.getAccountManagement(req)).accounts.admins,
        []
      );
      t.mock.method(pool, 'execute', async (sql, values) =>
        sql.includes('FROM audit_logs')
          ? [[]]
          : accountIdentityMock(() => ({
              email: req.session.userEmail,
              role,
              active: 1
            }))(sql, values)
      );
      assert.deepEqual(await getAuditLogs(req), []);
    }
  });
}

test('non-privileged extras survive while retired permissions remain ignored', async (t) => {
  const { req } = fixture(
    t,
    'HR',
    'announcements.read,forms.head-review,emp.sensitive'
  );
  const user = await getCurrentUser(req);
  assert.ok(user.perms.includes('announcements.read'));
  assert.ok(!user.perms.includes('forms.head-review'));
  assert.ok(!user.perms.includes('emp.sensitive'));
});

test('authorization follows current account role, not client-supplied roles or prior grants', async (t) => {
  const { req, account } = fixture(t, 'ADMIN');
  req.body = { role: 'ADMIN', perms: privileged };
  req.session.role = 'ADMIN';
  assert.equal((await requirePerm(req, 'admin.manage')).role, 'ADMIN');
  account.role = 'STAFF';
  await assert.rejects(requirePerm(req, 'admin.manage'), { status: 403 });
  account.role = 'UNKNOWN';
  await assert.rejects(requirePerm(req, 'admin.manage'), { status: 403 });
  account.active = 0;
  await assert.rejects(requirePerm(req, 'inbox.read'), { status: 401 });
  await assert.rejects(requirePerm({ session: {} }, 'admin.manage'), {
    status: 401
  });
});

test('startup preserves the approved legacy role mapping and is safe to rerun', async (t) => {
  const expected = {
    USER: 'STAFF',
    MANAGER: 'STAFF',
    EXECUTIVE: 'STAFF',
    HR_STAFF: 'HR',
    HR_ADMIN: 'ADMIN',
    SYSTEM_ADMIN: 'ADMIN',
    STAFF: 'STAFF',
    SUPERVISOR: 'SUPERVISOR',
    HEAD: 'HEAD',
    HR: 'HR',
    ADMIN: 'ADMIN',
    UNKNOWN: 'UNKNOWN'
  };
  const rows = Object.keys(expected).map((role, index) => ({
    email: `legacy-${index}@example.invalid`,
    role,
    active: index % 2,
    is_setup_admin: role === 'ADMIN' ? 1 : 0,
    password_hash: 'synthetic-hash'
  }));
  const before = structuredClone(rows);
  const stop = new Error('Stop after the account role migration');
  let changed = 0;
  // Exercise the actual startup statements with synthetic rows, stopping before
  // unrelated schema work. No query or connection reaches the application DB.
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS account_requests'))
      throw stop;
    const update =
      /^UPDATE user_roles SET role = '([^']+)' WHERE role (?:= '([^']+)'|IN \(([^)]+)\))$/.exec(
        sql
      );
    if (update) {
      const oldRoles = update[2]
        ? [update[2]]
        : [...update[3].matchAll(/'([^']+)'/g)].map((match) => match[1]);
      for (const row of rows)
        if (oldRoles.includes(row.role)) {
          row.role = update[1];
          changed++;
        }
      return [{ affectedRows: changed }];
    }
    if (sql.startsWith('SHOW COLUMNS'))
      return [
        sql.includes("LIKE 'corp_email'") || sql.includes("LIKE 'email'")
          ? []
          : [{ Field: 'exists' }]
      ];
    assert.match(sql, /^CREATE TABLE IF NOT EXISTS (employees|user_roles) \(/);
    return [{ affectedRows: 0 }];
  });
  t.mock.method(pool, 'execute', async () =>
    assert.fail('Unexpected database execution')
  );
  t.mock.method(pool, 'getConnection', async () =>
    assert.fail('Unexpected database connection')
  );

  await assert.rejects(initializeDatabase(), (error) => error === stop);
  assert.deepEqual(
    rows,
    before.map((row) => ({ ...row, role: expected[row.role] }))
  );
  assert.equal(changed, 6);
  const migrated = structuredClone(rows);
  changed = 0;
  await assert.rejects(initializeDatabase(), (error) => error === stop);
  assert.deepEqual(rows, migrated);
  assert.equal(changed, 0);
});
