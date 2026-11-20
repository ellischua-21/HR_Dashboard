const test = require('node:test');
const assert = require('node:assert/strict');
const { accountIdentityMock } = require('./helpers/AccountFixtures');
const {
  sanitize,
  validateEmployee,
  cleanField,
  fullName,
  isValidDate
} = require('../server/utils/Validation');
const { EMP_FIELDS } = require('../server/config/EmployeeSchema');
const {
  ACCOUNT_ROLE_MAP,
  ROLE_PERMS
} = require('../server/config/Permissions');
const { hashPassword, verifyPassword } = require('../server/utils/Password');
const {
  validateHeadAssignment,
  requestAccount,
  reassignOrRejectPendingHrForms
} = require('../server/services/AccountService');
const { normalizeAuditFilters } = require('../server/services/AuditService');
const {
  normalizeAnnouncementText
} = require('../server/services/AnnouncementService');
const {
  validateLeaveForm,
  validateUserForm,
  validateApprovalSignature,
  formatSerialNumber,
  currentSerialYear,
  canEditForm
} = require('../server/services/FormService');
const { buildReviewScope } = require('../server/services/FormReviewScope');
const FORM_TEMPLATES = require('../shared/FormTemplates');
const FormStatus = require('../shared/FormStatus');

test('form status labels use consistent title case and review-stage wording', () => {
  assert.equal(FormStatus.titleCase('REJECTED'), 'Rejected');
  assert.equal(FormStatus.titleCase('ACTION_REQUIRED'), 'Action Required');
  assert.equal(
    FormStatus.formatFormStatus('PENDING', 'HEAD', 'STAFF'),
    'Pending Supervisor Signature'
  );
  assert.equal(
    FormStatus.formatFormStatus('PENDING', 'HEAD', 'SUPERVISOR'),
    'Pending Head Signature'
  );
  assert.equal(
    FormStatus.formatFormStatus('PENDING', 'HEAD'),
    'Pending Head Signature'
  );
  assert.equal(
    FormStatus.formatFormStatus('PENDING', 'HR'),
    'Pending HR/Admin Review'
  );
});

test('review lists and summaries share role-specific visibility and pending scopes', () => {
  const hrScope = buildReviewScope(
    { role: 'HR', email: 'hr@example.com' },
    'HR'
  );
  assert.match(hrScope.whereSql, /review_stage = 'HR'/);
  assert.match(hrScope.whereSql, /user_email <> \?/);
  assert.match(hrScope.pendingSql, /status = 'PENDING'/);
  assert.deepEqual(hrScope.whereValues, ['hr@example.com']);
  assert.deepEqual(hrScope.pendingValues, hrScope.whereValues);

  const headScope = buildReviewScope(
    { role: 'HEAD', email: 'head@example.com' },
    'ALL'
  );
  assert.match(headScope.whereSql, /head_reviewer_email = \?/);
  assert.match(headScope.whereSql, /role = 'SUPERVISOR'/);
  const supervisorScope = buildReviewScope(
    { role: 'SUPERVISOR', email: 'supervisor@example.com' },
    'ALL'
  );
  assert.match(supervisorScope.whereSql, /role = 'STAFF'/);
  assert.deepEqual(supervisorScope.whereValues, ['supervisor@example.com']);
  assert.match(headScope.pendingSql, /review_stage = 'HEAD'/);
  assert.deepEqual(headScope.whereValues, ['head@example.com']);

  const hrHeadScope = buildReviewScope(
    {
      role: 'HR',
      is_hr_head: true,
      email: 'hrhead@example.com',
      perms: ['forms.review']
    },
    'ALL'
  );
  assert.match(hrHeadScope.whereSql, /role = 'HR'/);
  assert.match(hrHeadScope.whereSql, /review_stage = 'HR'/);
  assert.match(hrHeadScope.pendingSql, /review_stage = 'HEAD'/);
  assert.match(hrHeadScope.pendingSql, /review_stage = 'HR'/);
  assert.deepEqual(hrHeadScope.whereValues, [
    'hrhead@example.com',
    'hrhead@example.com'
  ]);
  assert.deepEqual(hrHeadScope.pendingValues, hrHeadScope.whereValues);
});

test('changing Head HR reassigns pending HR forms or blocks removing the reviewer', async () => {
  const calls = [];
  const connection = {
    execute: async (sql, values) => {
      calls.push({ sql, values });
      return [{ affectedRows: 2 }, []];
    }
  };
  await reassignOrRejectPendingHrForms(
    connection,
    'old-head@example.com',
    'new-head@example.com',
    'Pending forms need another Head HR.'
  );
  assert.match(calls[0].sql, /SET f\.head_reviewer_email = \?/);
  assert.match(calls[0].sql, /f\.status = 'PENDING'/);
  assert.deepEqual(calls[0].values, [
    'new-head@example.com',
    'old-head@example.com'
  ]);

  const pendingConnection = {
    execute: async () => [[{ total: 1 }], []]
  };
  await assert.rejects(
    reassignOrRejectPendingHrForms(
      pendingConnection,
      'old-head@example.com',
      null,
      'Pending forms need another Head HR.'
    ),
    (error) =>
      error.status === 409 &&
      error.message === 'Pending forms need another Head HR.'
  );
});

test('sanitization removes markup and neutralizes formula input', () => {
  assert.equal(sanitize('<b>hello</b>'), 'bhello/b');
  assert.equal(sanitize('=1+1'), "'=1+1");
});

test('required fields and lookup values are validated', () => {
  const lists = { Company_List: ['Company A'] };
  const missing = validateEmployee({}, lists);
  assert.ok(missing.includes('Employee Number is required'));
  assert.ok(missing.includes('Company Name is required'));
  const invalid = validateEmployee({ company: 'Unknown' }, lists);
  assert.ok(invalid.includes('Company Name has an invalid value'));
  assert.ok(missing.includes('Birthday is required'));
});

test('date validation rejects malformed and impossible dates', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2025-02-29'), false);
  assert.equal(isValidDate('2025-2-09'), false);
});

test('structured employee fields are allowlisted and bounded', () => {
  const field = EMP_FIELDS.find((item) => item[0] === 'siblings');
  assert.equal(
    cleanField(field, [{ name: 'A', other: 'ignored' }]),
    '[{"name":"A","address":"","contact":"","occupation":""}]'
  );
});

test('employee display name uses the original surname-first format', () => {
  assert.equal(
    fullName({ last_name: 'Rivera', first_name: 'Alex', middle_name: 'M' }),
    'Rivera, Alex M'
  );
  assert.equal(
    EMP_FIELDS.some((field) => field[0] === 'nexus_email'),
    false
  );
  assert.equal(
    EMP_FIELDS.find((field) => field[0] === 'personal_email')[1],
    'Email'
  );
  assert.equal(
    EMP_FIELDS.some((field) => field[0] === 'email'),
    false
  );
  assert.equal(
    EMP_FIELDS.find((field) => field[0] === 'corp_email')[1],
    'Corporate Email'
  );
});

test('requested account roles map to the intended permission profiles', () => {
  assert.equal(requestAccount, undefined);
  assert.equal(ACCOUNT_ROLE_MAP.STAFF, 'STAFF');
  assert.deepEqual(ROLE_PERMS.STAFF, [
    'employee.self',
    'forms.self',
    'announcements.read',
    'inbox.read',
    'account.password'
  ]);
  assert.deepEqual(ROLE_PERMS.HEAD, [
    'employee.self',
    'forms.self',
    'forms.review',
    'announcements.read',
    'inbox.read',
    'account.password'
  ]);
  assert.ok(ROLE_PERMS.STAFF.includes('forms.self'));
  assert.ok(
    Object.values(ROLE_PERMS).every(
      (perms) => !perms.includes('forms.head-review')
    )
  );
  assert.equal(ROLE_PERMS.MANAGER, undefined);
  assert.equal(ROLE_PERMS.EXECUTIVE, undefined);
  assert.ok(!ROLE_PERMS.STAFF.includes('dash.view'));
  assert.ok(!ROLE_PERMS.STAFF.includes('emp.read'));
  assert.ok(ROLE_PERMS.HR.includes('forms.review'));
  assert.ok(ROLE_PERMS.HR.includes('emp.write'));
  assert.ok(ROLE_PERMS.ADMIN.includes('emp.write'));
  Object.values(ROLE_PERMS).forEach((permissions) =>
    assert.ok(permissions.includes('account.password'))
  );
  assert.equal(ACCOUNT_ROLE_MAP.HR, 'HR');
  assert.equal(ACCOUNT_ROLE_MAP.ADMIN, 'ADMIN');
  assert.ok(ROLE_PERMS.ADMIN.includes('admin.manage'));
  assert.ok(ROLE_PERMS.ADMIN.includes('announcements.manage'));
  assert.ok(ROLE_PERMS.ADMIN.includes('inbox.read'));
  assert.ok(ROLE_PERMS.HR.includes('announcements.manage'));
  assert.ok(ROLE_PERMS.HR.includes('inbox.read'));
  assert.ok(!ROLE_PERMS.HR.includes('admin.manage'));
  assert.ok(ROLE_PERMS.HEAD.includes('forms.review'));
  assert.deepEqual(ROLE_PERMS.SUPERVISOR, ROLE_PERMS.HEAD);
  assert.equal(ACCOUNT_ROLE_MAP.SUPERVISOR, 'SUPERVISOR');
});

test('staff report to supervisors and supervisors report to heads', () => {
  const accounts = [
    { email: 'staff@example.com', role: 'STAFF', active: 1 },
    { email: 'supervisor@example.com', role: 'SUPERVISOR', active: 1 },
    { email: 'head@example.com', role: 'HEAD', active: 1 },
    { email: 'inactive@example.com', role: 'SUPERVISOR', active: 0 }
  ];
  assert.deepEqual(
    validateHeadAssignment(
      'staff@example.com',
      'STAFF',
      'supervisor@example.com',
      accounts
    ),
    { headEmail: 'supervisor@example.com' }
  );
  assert.deepEqual(
    validateHeadAssignment(
      'supervisor@example.com',
      'SUPERVISOR',
      'head@example.com',
      accounts
    ),
    { headEmail: 'head@example.com' }
  );
  assert.match(
    validateHeadAssignment(
      'staff@example.com',
      'STAFF',
      'head@example.com',
      accounts
    ).error,
    /SUPERVISOR/
  );
  assert.match(
    validateHeadAssignment(
      'staff@example.com',
      'STAFF',
      'inactive@example.com',
      accounts
    ).error,
    /active SUPERVISOR/
  );
  assert.match(
    validateHeadAssignment(
      'supervisor@example.com',
      'SUPERVISOR',
      'supervisor@example.com',
      accounts
    ).error,
    /itself/
  );
  assert.match(
    validateHeadAssignment('supervisor@example.com', 'SUPERVISOR', '', accounts)
      .error,
    /Assign a Head/
  );
  assert.match(
    validateHeadAssignment(
      'head@example.com',
      'HEAD',
      'head@example.com',
      accounts
    ).error,
    /Only STAFF and SUPERVISOR/
  );
});

test('form review enforces reviewer role and assigned account', async (t) => {
  const { pool } = require('../server/db/database');
  const { reviewUserForm } = require('../server/services/FormService');
  let reviewerRole = 'SUPERVISOR';
  let submitterRole = 'STAFF';
  let assignedEmail = 'reviewer@example.com';
  t.mock.method(
    pool,
    'execute',
    accountIdentityMock(() => ({
      email: 'reviewer@example.com',
      role: reviewerRole,
      active: 1,
      extra_perms: ''
    }))
  );
  t.mock.method(pool, 'getConnection', async () => {
    const form = {
      id: 1,
      control_no: 'TEST-1',
      status: 'PENDING',
      review_stage: 'HEAD',
      head_reviewer_email: assignedEmail,
      user_email: 'submitter@example.com',
      submitter_role: submitterRole,
      template_key: 'leave-2026',
      form_data: '{}'
    };
    return {
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release() {},
      execute: async (sql, values) => {
        // FormService locks this row; TaskService reads it again after review.
        if (sql.includes('FROM user_forms f')) {
          assert.deepEqual(values, [1]);
          return [[{ ...form }]];
        }
        if (sql.includes('UPDATE user_forms SET status = ?')) {
          assert.equal(values.at(-1), 1);
          form.status = values[0];
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('INSERT INTO audit_logs'))
          return [{ affectedRows: 1 }];
        throw new Error('Unexpected form review query: ' + sql);
      }
    };
  });
  const req = { session: { userEmail: 'reviewer@example.com' } };
  assert.equal(
    (await reviewUserForm(req, 1, 'REJECTED', 'Reason')).status,
    'REJECTED'
  );
  reviewerRole = 'HEAD';
  await assert.rejects(reviewUserForm(req, 1, 'REJECTED', 'Reason'), {
    status: 403
  });
  submitterRole = 'SUPERVISOR';
  assert.equal(
    (await reviewUserForm(req, 1, 'REJECTED', 'Reason')).status,
    'REJECTED'
  );
  reviewerRole = 'SUPERVISOR';
  await assert.rejects(reviewUserForm(req, 1, 'REJECTED', 'Reason'), {
    status: 403
  });
  submitterRole = 'STAFF';
  assignedEmail = 'other@example.com';
  await assert.rejects(reviewUserForm(req, 1, 'REJECTED', 'Reason'), {
    status: 403
  });
});

test('leave requests validate required dates, leave type, duration, and pay type', () => {
  const valid = {
    position: 'Staff',
    department: 'Operations',
    leaveType: 'Vacation Leave (VL)',
    dateFrom: '2026-11-02',
    dateTo: '2026-11-03',
    days: '2',
    reason: 'Family matter',
    payType: 'WITH_PAY',
    signature: 'data:image/png;base64,iVBORw0KGgo='
  };
  assert.deepEqual(validateLeaveForm(valid), []);
  assert.ok(
    validateLeaveForm({ ...valid, signature: '' }).includes(
      'Draw your electronic signature before submitting.'
    )
  );
  assert.ok(
    validateLeaveForm({ ...valid, dateFrom: '2026-11-04' }).includes(
      'End date must be on or after start date.'
    )
  );
  assert.ok(
    validateLeaveForm({ ...valid, days: '0' }).some((message) =>
      message.startsWith(
        'Leave days must be greater than 0 and no more than 365'
      )
    )
  );
  assert.ok(
    validateLeaveForm({ ...valid, leaveType: 'Unsupported' }).includes(
      'Choose a valid leave type.'
    )
  );
});

test('all supplied non-leave form templates accept valid field data', () => {
  const values = {
    text: 'Operations',
    textarea: 'Business requirement',
    date: '2026-10-19',
    time: '09:00',
    'datetime-local': '2026-10-19T09:00',
    number: '1'
  };
  const templates = FORM_TEMPLATES.filter(
    (template) => template.key !== 'leave-2026'
  );
  assert.equal(templates.length, 6);
  templates.forEach((template) => {
    const data = Object.fromEntries(
      template.fields.map((field) => [
        field.name,
        field.type === 'checkbox'
          ? true
          : field.type === 'number'
            ? String(field.min)
            : values[field.type]
      ])
    );
    for (const field of template.fields.filter(
      (item) => item.type === 'time-records'
    )) {
      data[field.name] = [
        Object.fromEntries(
          field.columns.map((column) => [
            column.name,
            column.type === 'number'
              ? String(column.min ?? 1)
              : values[column.type] || ''
          ])
        )
      ];
    }
    data.signature = 'data:image/png;base64,iVBORw0KGgo=';
    const result = validateUserForm(template.key, data);
    assert.deepEqual(result.errors, [], template.title);
    assert.equal(Object.hasOwn(result.data, 'unrecognizedField'), false);
  });
});

test('serial numbers use configurable form prefixes and sequence widths', () => {
  const leave = FORM_TEMPLATES.find(
    (template) => template.key === 'leave-2026'
  );
  const overtime = FORM_TEMPLATES.find(
    (template) => template.key === 'ot-slip'
  );
  const travel = FORM_TEMPLATES.find(
    (template) => template.key === 'official-business-trip'
  );
  assert.equal(formatSerialNumber(leave, 2026, 1), 'LEAVE-2026-000001');
  assert.equal(formatSerialNumber(overtime, 2026, 1), 'OT-2026-000001');
  assert.equal(formatSerialNumber(travel, 2026, 12), 'TRV-2026-000012');
  assert.equal(
    formatSerialNumber(
      { ...leave, prefix: 'CUSTOM', sequenceWidth: 4 },
      2027,
      12
    ),
    'CUSTOM-2027-0012'
  );
  assert.equal(
    new Set(FORM_TEMPLATES.map((template) => template.prefix)).size,
    FORM_TEMPLATES.length
  );
});

test('serial number year follows the Manila calendar year at New Year', () => {
  assert.equal(currentSerialYear(new Date('2026-12-31T15:59:59.000Z')), 2026);
  assert.equal(currentSerialYear(new Date('2026-12-31T16:00:00.000Z')), 2027);
  const authorityToDeduct = FORM_TEMPLATES.find(
    (template) => template.key === 'authority-to-deduct'
  );
  assert.equal(
    formatSerialNumber(
      authorityToDeduct,
      currentSerialYear(new Date('2026-12-31T16:00:00.000Z')),
      1
    ),
    'ATD-2027-000001'
  );
});

test('STAFF, HEAD, and HR can edit forms pending with an assigned Head', () => {
  const pendingForHead = {
    status: 'PENDING',
    review_stage: 'HEAD',
    head_reviewer_email: 'head@example.com'
  };
  assert.equal(canEditForm('STAFF', pendingForHead), true);
  assert.equal(canEditForm('HEAD', pendingForHead), true);
  assert.equal(canEditForm('HR', pendingForHead), true);
  assert.equal(
    canEditForm('STAFF', { ...pendingForHead, review_stage: 'HR' }),
    false
  );
  assert.equal(
    canEditForm('STAFF', { ...pendingForHead, status: 'REJECTED' }),
    false
  );
  assert.equal(
    canEditForm('STAFF', { ...pendingForHead, status: 'APPROVED' }),
    false
  );
  assert.equal(
    canEditForm('HEAD', { ...pendingForHead, head_reviewer_email: null }),
    false
  );
});

test('audit log filters validate time range and exact user email', () => {
  assert.deepEqual(
    normalizeAuditFilters({
      from: '2026-10-22T09:30',
      to: '2026-10-22T10:45',
      user: 'Admin@example.com'
    }),
    {
      where: 'WHERE event_time >= ? AND event_time <= ? AND user_email = ?',
      values: [
        '2026-10-22 09:30:00',
        '2026-10-22 10:45:59',
        'admin@example.com'
      ]
    }
  );
  assert.deepEqual(normalizeAuditFilters({}), { where: '', values: [] });
  assert.throws(() => normalizeAuditFilters({ from: '2026-02-30T09:30' }), {
    status: 400
  });
  assert.throws(
    () =>
      normalizeAuditFilters({
        from: '2026-10-22T10:00',
        to: '2026-10-22T09:59'
      }),
    { status: 400 }
  );
  assert.throws(() => normalizeAuditFilters({ user: 'not-an-email' }), {
    status: 400
  });
});

test('announcement text is required, bounded, and stripped of HTML delimiters', () => {
  assert.equal(
    normalizeAnnouncementText('  <Update>  ', 'title', 160),
    'Update'
  );
  assert.throws(() => normalizeAnnouncementText(' ', 'title', 160), {
    status: 400
  });
  assert.throws(
    () => normalizeAnnouncementText('x'.repeat(161), 'title', 160),
    { status: 400 }
  );
});

test('user forms require a bounded PNG electronic signature', () => {
  const valid = {
    name: 'Alex Employee',
    employeeNo: 'E-1001',
    department: 'Operations',
    date: '2026-10-19',
    particulars: 'Replacement uniform deduction',
    amount: '10',
    employeeAcknowledgment: true,
    signature: 'data:image/png;base64,iVBORw0KGgo='
  };
  assert.deepEqual(validateUserForm('authority-to-deduct', valid).errors, []);
  assert.ok(
    validateUserForm('authority-to-deduct', {
      ...valid,
      employeeAcknowledgment: false
    }).errors.some((message) => message.includes('must be acknowledged'))
  );
  assert.ok(
    validateUserForm('authority-to-deduct', {
      ...valid,
      signature: 'data:image/svg+xml;base64,PHN2Zz4='
    }).errors.includes('Draw your electronic signature before submitting.')
  );
  assert.ok(
    validateUserForm('authority-to-deduct', {
      ...valid,
      signature: `data:image/png;base64,iVBORw0KGgo${'A'.repeat(200000)}`
    }).errors.includes('Draw your electronic signature before submitting.')
  );
});

test('Head and HR/Admin approvals require a valid electronic signature', () => {
  assert.throws(() => validateApprovalSignature(false, 'APPROVED', ''), {
    message: 'Draw your signature before approving this form.',
    status: 400
  });
  assert.throws(() => validateApprovalSignature(true, 'APPROVED', ''), {
    message: 'Draw your signature before forwarding this form.',
    status: 400
  });
  assert.doesNotThrow(() =>
    validateApprovalSignature(
      false,
      'APPROVED',
      'data:image/png;base64,iVBORw0KGgo='
    )
  );
  ['authority-to-deduct', 'time-in-out', 'official-business-trip'].forEach(
    (templateKey) => {
      assert.doesNotThrow(() =>
        validateApprovalSignature(false, 'APPROVED', '', templateKey)
      );
      assert.throws(
        () => validateApprovalSignature(true, 'APPROVED', '', templateKey),
        { status: 400 }
      );
    }
  );
  assert.doesNotThrow(() => validateApprovalSignature(false, 'REJECTED', ''));
});

test('non-leave form submissions enforce required fields and date/time relationships', () => {
  assert.ok(
    validateUserForm('authority-to-deduct', {}).errors.includes(
      'Date is required.'
    )
  );
  assert.ok(
    validateUserForm('time-in-out', { date: '2026-10-19' }).errors.includes(
      'Enter at least one time-in, break, or time-out value.'
    )
  );
  const invalidTrip = validateUserForm('official-business-trip', {
    department: 'Operations',
    position: 'Staff',
    destination: 'Manila',
    purpose: 'Meeting',
    departure: '2026-10-20T10:00',
    return: '2026-10-20T09:00'
  });
  assert.ok(
    invalidTrip.errors.includes(
      'Date/time of return must not be before departure.'
    )
  );
  assert.ok(
    validateUserForm('ot-slip', {
      department: 'Operations',
      regularShiftTime: '8:00 AM - 5:00 PM',
      overtimeDate: '2026-10-19',
      timeFrom: '17:00',
      timeTo: '18:00',
      overtimeHours: '1.1',
      reason: 'Support'
    }).errors.includes('Overtime Hours has an invalid increment.')
  );
});

test('account passwords are stored as verifiable hashes, never plaintext', () => {
  const password = 'a-long-test-password';
  const hash = hashPassword(password);
  assert.notEqual(hash, password);
  assert.equal(verifyPassword(password, hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});
