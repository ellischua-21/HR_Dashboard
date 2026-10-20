const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitize, validateEmployee, cleanField, fullName, isValidDate } = require('../server/utils/Validation');
const { EMP_FIELDS, ACCOUNT_ROLE_MAP, ROLE_PERMS } = require('../server/config/Config');
const { hashPassword, verifyPassword } = require('../server/utils/Password');
const { validateHeadAssignment } = require('../server/services/AccountService');
const { validateLeaveForm, validateUserForm, validateApprovalSignature, formatSerialNumber } = require('../server/services/FormService');
const FORM_TEMPLATES = require('../shared/FormTemplates');

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
});

test('date validation rejects malformed and impossible dates', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2025-02-29'), false);
  assert.equal(isValidDate('2025-2-09'), false);
});

test('structured employee fields are allowlisted and bounded', () => {
  const field = EMP_FIELDS.find(item => item[0] === 'siblings');
  assert.equal(cleanField(field, [{ name: 'A', other: 'ignored' }]), '[{"name":"A","address":"","contact":"","occupation":""}]');
});

test('employee display name uses the original surname-first format', () => {
  assert.equal(fullName({ last_name: 'Rivera', first_name: 'Alex', middle_name: 'M' }), 'Rivera, Alex M');
});

test('requested account roles map to the intended permission profiles', () => {
  assert.equal(ACCOUNT_ROLE_MAP.STAFF, 'STAFF');
  assert.deepEqual(ROLE_PERMS.STAFF, ['forms.self', 'account.password']);
  assert.deepEqual(ROLE_PERMS.HEAD, ['forms.self', 'forms.head-review', 'account.password']);
  assert.ok(ROLE_PERMS.STAFF.includes('forms.self'));
  assert.ok(!ROLE_PERMS.STAFF.includes('forms.head-review'));
  assert.equal(ROLE_PERMS.MANAGER, undefined);
  assert.equal(ROLE_PERMS.EXECUTIVE, undefined);
  assert.ok(!ROLE_PERMS.STAFF.includes('dash.view'));
  assert.ok(!ROLE_PERMS.STAFF.includes('emp.read'));
  assert.ok(ROLE_PERMS.HR.includes('forms.review'));
  Object.values(ROLE_PERMS).forEach(permissions => assert.ok(permissions.includes('account.password')));
  assert.equal(ACCOUNT_ROLE_MAP.HR, 'HR');
  assert.equal(ACCOUNT_ROLE_MAP.ADMIN, 'ADMIN');
  assert.ok(ROLE_PERMS.ADMIN.includes('admin.manage'));
  assert.ok(!ROLE_PERMS.HR.includes('admin.manage'));
  assert.ok(!ROLE_PERMS.HEAD.includes('forms.review'));
});

test('Head assignments allow Head-to-Head links without a top role', () => {
  const accounts = [
    { email: 'staff@example.com', role: 'STAFF', active: 1, assigned_head_email: null },
    { email: 'head@example.com', role: 'HEAD', active: 1, assigned_head_email: null },
    { email: 'senior@example.com', role: 'HEAD', active: 1, assigned_head_email: null },
    { email: 'inactive@example.com', role: 'HEAD', active: 0, assigned_head_email: null },
    { email: 'hr@example.com', role: 'HR', active: 1, assigned_head_email: null }
  ];
  assert.deepEqual(
    validateHeadAssignment('staff@example.com', 'STAFF', 'head@example.com', accounts),
    { headEmail: 'head@example.com' }
  );
  assert.deepEqual(
    validateHeadAssignment('head@example.com', 'HEAD', 'senior@example.com', accounts),
    { headEmail: 'senior@example.com' }
  );
  assert.deepEqual(
    validateHeadAssignment('senior@example.com', 'HEAD', '', accounts),
    { headEmail: null }
  );
  assert.equal(validateHeadAssignment('staff@example.com', 'STAFF', '', accounts).error,
    'Assign a Head to this STAFF account.');
  assert.equal(validateHeadAssignment('head@example.com', 'HEAD', 'head@example.com', accounts).error,
    'An account cannot be assigned to itself.');
  assert.equal(validateHeadAssignment('staff@example.com', 'STAFF', 'hr@example.com', accounts).error,
    'Choose an active HEAD account.');
  assert.equal(validateHeadAssignment('staff@example.com', 'STAFF', 'inactive@example.com', accounts).error,
    'Choose an active HEAD account.');
  accounts[1].assigned_head_email = 'senior@example.com';
  accounts[2].assigned_head_email = 'head@example.com';
  assert.deepEqual(
    validateHeadAssignment('staff@example.com', 'STAFF', 'head@example.com', accounts),
    { headEmail: 'head@example.com' }
  );
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
  assert.ok(validateLeaveForm({ ...valid, signature: '' }).includes('Draw your electronic signature before submitting.'));
  assert.ok(validateLeaveForm({ ...valid, dateFrom: '2026-11-04' }).includes('End date must be on or after start date.'));
  assert.ok(validateLeaveForm({ ...valid, days: '0' }).some(message => message.startsWith('Leave days must be greater than 0 and no more than 365')));
  assert.ok(validateLeaveForm({ ...valid, leaveType: 'Unsupported' }).includes('Choose a valid leave type.'));
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
  const templates = FORM_TEMPLATES.filter(template => template.key !== 'leave-2026');
  assert.equal(templates.length, 5);
  templates.forEach(template => {
    const data = Object.fromEntries(template.fields.map(field => [
      field.name,
      field.type === 'number' ? String(field.min) : values[field.type]
    ]));
    data.signature = 'data:image/png;base64,iVBORw0KGgo=';
    const result = validateUserForm(template.key, data);
    assert.deepEqual(result.errors, [], template.title);
    assert.equal(Object.hasOwn(result.data, 'unrecognizedField'), false);
  });
});

test('serial numbers use configurable form prefixes and sequence widths', () => {
  const leave = FORM_TEMPLATES.find(template => template.key === 'leave-2026');
  const overtime = FORM_TEMPLATES.find(template => template.key === 'ot-slip');
  const travel = FORM_TEMPLATES.find(template => template.key === 'official-business-trip');
  assert.equal(formatSerialNumber(leave, 2026, 1), 'LEAVE-2026-000001');
  assert.equal(formatSerialNumber(overtime, 2026, 1), 'OT-2026-000001');
  assert.equal(formatSerialNumber(travel, 2026, 12), 'TRV-2026-000012');
  assert.equal(formatSerialNumber({ ...leave, prefix: 'CUSTOM', sequenceWidth: 4 }, 2027, 12), 'CUSTOM-2027-0012');
  assert.equal(new Set(FORM_TEMPLATES.map(template => template.prefix)).size, FORM_TEMPLATES.length);
});

test('user forms require a bounded PNG electronic signature', () => {
  const valid = {
    date: '2026-10-19',
    particulars: 'Uniform',
    amount: '10',
    signature: 'data:image/png;base64,iVBORw0KGgo='
  };
  assert.deepEqual(validateUserForm('authority-to-deduct', valid).errors, []);
  assert.ok(validateUserForm('authority-to-deduct', {
    ...valid,
    signature: 'data:image/svg+xml;base64,PHN2Zz4='
  }).errors.includes('Draw your electronic signature before submitting.'));
  assert.ok(validateUserForm('authority-to-deduct', {
    ...valid,
    signature: `data:image/png;base64,iVBORw0KGgo${'A'.repeat(200000)}`
  }).errors.includes('Draw your electronic signature before submitting.'));
});

test('Head and HR/Admin approvals require a valid electronic signature', () => {
  assert.throws(
    () => validateApprovalSignature(false, 'APPROVED', ''),
    { message: 'Draw your signature before approving this form.', status: 400 }
  );
  assert.throws(
    () => validateApprovalSignature(true, 'APPROVED', ''),
    { message: 'Draw your signature before forwarding this form.', status: 400 }
  );
  assert.doesNotThrow(() => validateApprovalSignature(false, 'APPROVED', 'data:image/png;base64,iVBORw0KGgo='));
  assert.doesNotThrow(() => validateApprovalSignature(false, 'REJECTED', ''));
});

test('non-leave form submissions enforce required fields and date/time relationships', () => {
  assert.ok(validateUserForm('authority-to-deduct', {}).errors.includes('Date is required.'));
  assert.ok(validateUserForm('time-in-out', { date: '2026-10-19' }).errors.includes(
    'Enter at least one time-in, break, or time-out value.'
  ));
  const invalidTrip = validateUserForm('official-business-trip', {
    department: 'Operations',
    position: 'Staff',
    destination: 'Manila',
    purpose: 'Meeting',
    departure: '2026-10-20T10:00',
    return: '2026-10-20T09:00'
  });
  assert.ok(invalidTrip.errors.includes('Date/time of return must not be before departure.'));
  assert.ok(validateUserForm('ot-slip', {
    department: 'Operations',
    regularShiftTime: '8:00 AM - 5:00 PM',
    overtimeDate: '2026-10-19',
    timeFrom: '17:00',
    timeTo: '18:00',
    overtimeHours: '1.1',
    reason: 'Support'
  }).errors.includes('Overtime hours has an invalid increment.'));
});

test('account passwords are stored as verifiable hashes, never plaintext', () => {
  const password = 'a-long-test-password';
  const hash = hashPassword(password);
  assert.notEqual(hash, password);
  assert.equal(verifyPassword(password, hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});
