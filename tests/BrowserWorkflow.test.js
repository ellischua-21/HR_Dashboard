const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowser } = require('./helpers/Browser');

test('employee master report opens a read-only sectioned view of the displayed record', async () => {
  const browser = createBrowser();
  browser.loadDashboard();
  browser.evaluate(
    "session = { role: 'HR', perms: ['emp.read', 'report.run'] }; META = { fields: [], lists: {} }"
  );
  browser.document.getElementById('rp_id').value = 'master';
  let requestedOptions;
  browser.context.fetch = async (_url, options) => {
    requestedOptions = JSON.parse(options.body).args[2];
    return {
      ok: true,
      json: async () => ({
        title: 'Employee Master List',
        columns: [
          'Record ID',
          'No.',
          'Name Of Employee',
          'Department',
          'First Name'
        ],
        columnKeys: ['record_id', 'seq_no', 'name', 'department', 'first_name'],
        columnTypes: ['text', 'number', 'text', 'text', 'text'],
        rows: [['EMP-1', 1, 'One, Test', 'Operations', 'Test']],
        total: 1
      })
    };
  };
  await browser.evaluate('runRep()');
  assert.equal(requestedOptions.allRows, true);
  const row = browser.document.getElementById('rp_body').children[0];
  await row.children[0].children[0].click();
  const dialog = browser.document.getElementById('report-employee-dialog');
  assert.equal(dialog.open, true);
  const details = browser.document.getElementById('report-employee-details');
  const values = details.querySelectorAll('input').map((input) => input.value);
  for (const value of ['EMP-1', 'One, Test', 'Operations', 'Test'])
    assert.ok(values.includes(value));
  assert.ok(details.querySelectorAll('input').every((input) => input.readOnly));
});

test('attendance shows time logs and device serial numbers in a dropdown', async () => {
  const browser = createBrowser();
  browser.loadDashboard();
  browser.evaluate("session = { role: 'HR', perms: ['emp.read'] }");
  browser.context.fetch = async (url) => ({
    ok: true,
    json: async () =>
      url.endsWith('getAttendanceContext')
        ? { configured: true }
        : {
            rows: [
              {
                firstName: 'MARY anne',
                lastName: 'O’NEIL',
                employeeNo: 'E-100',
                department: 'Business Intelligence',
                device: 'RAMY_BIO, Office, East',
                deviceNames: ['RAMY_BIO', 'Office, East'],
                status: 'On-time',
                overtime: true,
                breakStatuses: [
                  {
                    period: 'AM',
                    status: 'Normal',
                    reason: 'Within grace periods.'
                  },
                  {
                    period: 'Lunch',
                    status: 'Abnormal',
                    reason: 'Lunch exceeds 1 hour.'
                  },
                  {
                    period: 'PM',
                    status: 'Abnormal',
                    reason: 'Break exceeds 15 minutes.'
                  }
                ],
                timeLogs: [
                  {
                    time: '08:00',
                    seconds: '20',
                    device: 'RAMY_BIO',
                    deviceSerialNo: 'SERIAL-1'
                  },
                  {
                    time: '10:15',
                    seconds: '05',
                    device: 'Office, East',
                    deviceSerialNo: 'SERIAL-2'
                  }
                ]
              },
              {
                firstName: 'Second',
                lastName: 'McDonald',
                employeeNo: 'E-101',
                status: 'On-time',
                breakStatuses: [
                  {
                    period: 'AM',
                    status: 'Normal',
                    reason: 'Within grace periods.'
                  },
                  {
                    period: 'Lunch',
                    status: 'Normal',
                    reason: 'Lunch lasted no more than 1 hour.'
                  }
                ]
              }
            ],
            departments: [],
            statuses: ['On-time'],
            total: 1,
            fetchedAt: '2026-11-04T08:00:00+08:00'
          }
  });
  await browser.evaluate('VIEWS.attendance()');
  const { document } = browser;
  const headings =
    document.getElementById('attendance-head').children[0].children;
  assert.deepEqual(
    headings.slice(-2).map((heading) => heading.textContent),
    ['Status', 'Time Logs']
  );
  const row = document.getElementById('attendance-body').children[0];
  assert.equal(row.children[0].textContent, 'Mary Anne');
  assert.equal(row.children[1].textContent, 'O’Neil');
  assert.equal(
    row.children[0].classList.contains('attendance-wrap-cell'),
    true
  );
  assert.equal(
    row.children[1].classList.contains('attendance-wrap-cell'),
    true
  );
  assert.equal(row.children[3].textContent, 'Business Intelligence');
  assert.equal(
    row.children[3].classList.contains('attendance-wrap-cell'),
    true
  );
  assert.deepEqual(
    row.children[14].children.map((item) => item.textContent),
    ['RAMY_BIO', 'Office, East']
  );
  assert.deepEqual(
    row.children[15].children.map((badge) => badge.textContent),
    ['On-time', 'Overtime', 'Abnormal Break']
  );
  assert.equal(
    row.children[15].children[1].classList.contains('is-overtime'),
    true
  );
  assert.match(row.children[15].children[2].title, /Lunch: Abnormal/);
  assert.match(row.children[15].children[2].title, /PM: Abnormal/);
  assert.equal(
    row.children[15].children[2].classList.contains('is-abnormal-break'),
    true
  );
  const secondRow = document.getElementById('attendance-body').children[1];
  assert.equal(secondRow.children[1].textContent, 'McDonald');
  assert.deepEqual(
    secondRow.children[15].children.map((badge) => badge.textContent),
    ['On-time', 'Normal Break']
  );
  assert.equal(
    secondRow.children[15].children[1].classList.contains('is-normal-break'),
    true
  );
  const button = row.children[16].querySelector('button');
  const panel = document.getElementById('attendance-time-logs');
  await button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.hidden, false);
  assert.match(panel.textContent, /8:00:20 AM/);
  assert.match(panel.textContent, /10:15:05 AM/);
  assert.match(panel.textContent, /SERIAL-1/);
  assert.match(panel.textContent, /SERIAL-2/);
  assert.match(panel.textContent, /Device Name/);
  assert.match(panel.textContent, /Office, East/);
  await button.click();
  assert.equal(panel.hidden, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('employee registration renders personal details, address fields, and repeatable family sections', async () => {
  const { EMP_FIELDS, LISTS } = require('../server/config/EmployeeSchema');
  const browser = createBrowser();
  browser.loadDashboard();
  browser.evaluate(
    "session = { email: 'admin@example.com', role: 'ADMIN', perms: ['emp.write'] }"
  );
  browser.context.fetch = async (url) => ({
    ok: true,
    json: async () =>
      url.endsWith('getFormMeta')
        ? {
            fields: EMP_FIELDS.filter(
              (f) => !f[3].includes('C') && f[0] !== 'docs'
            ).map((f) => ({
              key: f[0],
              label: f[1],
              type: f[2],
              required: f[3].includes('R'),
              list: f[4] || ''
            })),
            lists: LISTS
          }
        : []
  });
  await browser.evaluate('VIEWS.register()');
  const { document } = browser;
  const birthday = document.getElementById('ff_birthday');
  assert.ok(birthday?.isConnected);
  assert.equal(birthday.type, 'date');
  const age = document.getElementById('ff_age');
  assert.equal(age.readOnly, true);
  birthday.value = '2000-01-01';
  birthday.onchange();
  assert.equal(
    Number(age.value),
    browser.context.DateUtils.ageOnDate('2000-01-01')
  );
  birthday.value = '';
  birthday.oninput();
  assert.equal(age.value, '');
  for (const key of ['address', 'permanent_address']) {
    const field = document.getElementById('ff_' + key);
    assert.equal(field.tagName, 'TEXTAREA');
    assert.ok(field.parentElement.classList.contains('employee-address'));
  }
  for (const key of [
    'birth_place',
    'landline_no',
    'father_name',
    'church_has',
    'emergency_address',
    'facebook',
    'gov_deduction',
    'salary_structure',
    'fte'
  ])
    assert.ok(document.getElementById('ff_' + key)?.isConnected, key);
  for (const key of ['siblings', 'children', 'orgs']) {
    const section = document.getElementById('ff_' + key);
    assert.ok(section?.isConnected, key);
    const add = section.querySelector('button');
    add.onclick();
    assert.equal(section.querySelector('tbody').children.length, 1);
  }
});

test('all browser controllers initialize in the declared asset order', () => {
  const browser = createBrowser();
  browser.loadDashboard();
  for (const route of [
    'employees',
    'register',
    'reports',
    'accounts',
    'user-forms',
    'incident-file',
    'incident-track',
    'incident-review',
    'incident-history',
    'incident-code-of-conduct'
  ])
    assert.equal(
      browser.evaluate(`typeof VIEWS['${route}']`),
      'function',
      route
    );
  assert.equal(typeof browser.context.IncidentInvestigation.render, 'function');
});

test('registration exposes the supplied workbook headers without moving existing controls or submitting generated fields', async (t) => {
  const { pool } = require('../server/db/database');
  const { LISTS } = require('../server/config/EmployeeSchema');
  const { getFormMeta } = require('../server/services/EmployeeService');
  const { cleanEmployee } = require('../server/utils/EmployeeData');
  const { validateEmployee } = require('../server/utils/Validation');
  // Header row only from Employee Master List.xlsx; no employee data is included.
  const headers = [
    'No.',
    'Name of Employee',
    'Employee Number',
    'Company Name',
    'Work Location',
    'Current Position',
    'Department',
    'Employee Rank',
    'Reports To',
    'Date of Employment',
    'Tenure',
    'Employment Status',
    'Current Residential Address',
    'Network',
    'Birthday',
    'Age',
    'Civil Status',
    'Email',
    'Corporate Email',
    'Mobile Number',
    'Company Contact Number',
    'HMO Provider',
    'TIN',
    'Pag-IBIG Number',
    'SSS Number',
    'PhilHealth Number',
    'Government Contributions Deduction',
    'Emergency Contact Name',
    'Emergency Contact No.',
    'Effectivity of Transfer',
    'Salary Structure',
    'Education Level',
    'Gender',
    'Function Type',
    'FTE Allocation',
    'Record Status',
    'Date Created',
    'Created By',
    'Last Modified',
    'Modified By',
    'Last Name',
    'First Name',
    'Middle Name',
    'Birth Place',
    'Permanent Address',
    'Landline Number',
    "Father's Full Name",
    "Father's Occupation",
    "Mother's Maiden Name",
    "Mother's Occupation",
    'Siblings',
    'Name of Spouse/Partner',
    'Children',
    'Position in Church?',
    'Church Position (if yes)',
    'Organizations/Memberships',
    'Emergency Contact Address',
    'Emergency Contact Relationship',
    'Facebook',
    'Instagram',
    'TikTok',
    'YouTube',
    'Twitter/X'
  ];
  t.mock.method(pool, 'execute', async (sql) => {
    if (sql.includes('FROM user_roles'))
      return [[{ email: 'qa@example.invalid', role: 'ADMIN', active: 1 }]];
    if (sql.includes('LOWER(TRIM(personal_email))'))
      return [[{ record_id: 'SYNTHETIC-ACTOR', name: 'QA Actor' }]];
    throw new Error('Unexpected query: ' + sql);
  });
  t.mock.method(pool, 'query', async () => [
    Object.entries(LISTS).flatMap(([list_name, values]) =>
      values.map((value) => ({ list_name, value }))
    )
  ]);
  const metadata = await getFormMeta({
    session: { userEmail: 'qa@example.invalid' }
  });
  const browser = createBrowser();
  browser.loadDashboard();
  browser.evaluate(
    "session = { email: 'qa@example.invalid', role: 'ADMIN', perms: ['emp.write'] }"
  );
  browser.context.fetch = async (url) => ({
    ok: true,
    json: async () => (url.endsWith('getFormMeta') ? metadata : [])
  });
  await browser.evaluate('VIEWS.register()');
  const labels = browser.evaluate(
    `employeeFormSections().flatMap(section => section.keys.map(key => key === 'age' ? 'Age' : key === 'tenure_years' ? 'Tenure' : fld(key)?.label))`
  );
  assert.deepEqual(Array.from(labels).sort(), [...headers].sort());
  const sections = browser.evaluate(
    'employeeFormSections().map(section => section.keys)'
  );
  assert.deepEqual(Array.from(sections[0]).slice(0, 9), [
    'last_name',
    'first_name',
    'middle_name',
    'birthday',
    'age',
    'birth_place',
    'gender',
    'civil_status',
    'education'
  ]);
  assert.deepEqual(Array.from(sections[1]).slice(0, 12), [
    'emp_no',
    'company',
    'location',
    'position',
    'department',
    'rank',
    'reports_to',
    'date_employed',
    'status',
    'function_type',
    'network',
    'transfer_eff'
  ]);
  assert.deepEqual(Array.from(sections[2]).slice(0, 6), [
    'address',
    'permanent_address',
    'contact_no',
    'landline_no',
    'personal_email',
    'company_contact_no'
  ]);
  const byId = (key) => browser.document.getElementById('ff_' + key);
  assert.equal(byId('corp_email').type, 'email');
  assert.equal(Boolean(byId('corp_email').required), false);
  byId('corp_email').value = 'corporate@example.invalid';
  byId('personal_email').value = 'login@example.invalid';
  byId('date_employed').value = '2025-11-20';
  byId('last_name').value = 'Example';
  byId('first_name').value = 'Test';
  byId('date_employed').onchange();
  assert.equal(byId('name').value, 'Example, Test');
  assert.equal(
    Number(byId('tenure_years').value),
    browser.context.DateUtils.tenureYearsOnDate('2025-11-20')
  );
  for (const key of [
    'age',
    'tenure_years',
    'name',
    'seq_no',
    'record_status',
    'created_at',
    'created_by',
    'modified_at',
    'modified_by'
  ]) {
    assert.equal(byId(key).readOnly, true, key);
    assert.equal(
      Object.hasOwn(browser.evaluate('formData()'), key),
      false,
      key
    );
  }
  const data = browser.evaluate('formData()');
  assert.equal(data.personal_email, 'login@example.invalid');
  assert.equal(data.corp_email, 'corporate@example.invalid');
  assert.equal(cleanEmployee(data).corp_email, data.corp_email);
  assert.ok(
    validateEmployee(
      cleanEmployee({ ...data, corp_email: 'invalid' }),
      LISTS
    ).includes('Corporate Email is not a valid email')
  );
  assert.ok(
    metadata.reportFields.some(
      (field) => field.key === 'corp_email' && field.label === 'Corporate Email'
    )
  );
  await browser.evaluate('VIEWS.register()');
  assert.equal(byId('corp_email').value, '');
  assert.equal(byId('tenure_years').value, '');
  assert.equal(byId('name').value, '');
});

test('form previews and incident documents share date/time formatting while input values stay ISO', () => {
  const browser = createBrowser();
  browser.loadDashboard();
  browser.evaluate("session = { email: 'employee@example.com' }");
  const values = { name: 'Sample Employee', date: '2026-10-29', time: '17:14' };
  const sheet = browser.context.buildGenericFormSheet(
    values,
    { submittedAt: '2026-10-29T09:14:00Z', status: 'PENDING' },
    {
      title: 'Sample form',
      fields: [
        { name: 'date', type: 'date', label: 'Date' },
        { name: 'time', type: 'time', label: 'Time' }
      ],
      headSignatureRequired: false,
      hrSignatureRequired: false
    }
  );
  assert.ok(sheet.textContent.includes('10/29/2026'));
  assert.ok(sheet.textContent.includes('5:14 PM'));
  assert.equal(values.date, '2026-10-29');
  assert.equal(values.time, '17:14');
  const report = browser.context.createIncidentReportDocumentHtml({
    dateReported: '2026-10-29',
    incidentDate: '2026-10-28',
    incidentTime: '00:00:00'
  });
  assert.ok(report.includes('10/28/2026'));
  assert.ok(report.includes('12:00 AM'));
  const input = browser.document
    .getElementById('incident-report-template')
    .querySelector('[data-field="date"]');
  input.value = '2026-10-28';
  assert.equal(input.value, '2026-10-28');
});

test('formatted date entry retains canonical values, calendar access, and change events', async () => {
  const browser = createBrowser();
  browser.load('shared/DateUtils.js');
  const { document, context } = browser;
  const create = document.createElement.bind(document);
  const Base = create('input').constructor;
  class Input extends Base {
    get parentNode() {
      return this.parentElement;
    }
    get value() {
      return this.nativeValue || '';
    }
    set value(value) {
      this.nativeValue = String(value ?? '');
    }
    hasAttribute(name) {
      return this.getAttribute(name) !== null;
    }
    setCustomValidity(message) {
      this.error = message;
    }
    get validity() {
      return {
        valid: !this.error && (!this.required || Boolean(this.value)),
        rangeUnderflow: false,
        rangeOverflow: false,
        stepMismatch: false
      };
    }
    reportValidity() {
      return this.validity.valid;
    }
    dispatchEvent(event) {
      for (const listener of this.listeners.get(event.type) || [])
        listener(event);
      this['on' + event.type]?.(event);
      return true;
    }
  }
  document.createElement = (tag) =>
    tag === 'input' ? new Input(tag) : create(tag);
  context.HTMLInputElement = Input;
  context.Event = class {
    constructor(type) {
      this.type = type;
    }
  };
  let observe;
  context.MutationObserver = class {
    constructor(callback) {
      observe = callback;
    }
    observe() {}
  };
  browser.load('public/js/DateTimeInputs.js');
  const source = document.createElement('input');
  source.type = 'date';
  source.name = 'dateFrom';
  source.value = '2026-10-29';
  source.required = true;
  let changes = 0;
  let picks = 0;
  source.onchange = () => ++changes;
  source.showPicker = () => ++picks;
  document.body.appendChild(source);
  observe([{ type: 'childList', addedNodes: [source] }]);
  const display = source.parentElement.children.find(
    (child) => child !== source && child.tagName === 'INPUT'
  );
  const picker = source.parentElement.children.find(
    (child) => child.tagName === 'BUTTON'
  );
  assert.equal(display.value, '10/29/2026');
  assert.equal(source.value, '2026-10-29');
  assert.equal(source.type, 'date');
  display.value = '11/03/2026';
  display.dispatchEvent(new context.Event('change'));
  assert.equal(source.value, '2026-11-03');
  assert.equal(changes, 1);
  display.value = '02/30/2026';
  display.dispatchEvent(new context.Event('input'));
  assert.equal(source.value, '');
  assert.equal(source.reportValidity(), false);
  source.value = '2026-12-31';
  assert.equal(display.value, '12/31/2026');
  assert.equal(source.reportValidity(), true);
  await picker.click();
  assert.equal(picks, 1);
});

test('COC matrix editing adds and saves rows without PDF or publishing controls', async () => {
  const browser = createBrowser();
  browser.loadDashboard();
  const { context, document } = browser;
  browser.evaluate(
    "session = { role: 'HR', email: 'hr@example.com', perms: ['emp.read'] }"
  );
  let matrix = [
    { severity: 'Light', occurrence: 1, correctiveAction: 'Written Warning' }
  ];
  let saves = 0;
  context.fetch = async (url, options) => {
    const method = url.split('/').pop();
    let result;
    if (method === 'saveIncidentMatrix') {
      ++saves;
      matrix = JSON.parse(options.body).args[0];
      result = { ok: true };
    } else if (method === 'getIncidentCodeGuide')
      result = { matrix, canManage: true };
    else if (method === 'listIncidentViolations')
      result = { records: [], total: 0, page: 1, pages: 1 };
    else throw new Error(`Unexpected API call: ${method}`);
    return { ok: true, json: async () => result };
  };
  await context.IncidentConduct.load();
  await document.getElementById('ir-coc-matrix-add').click();
  const row = document.getElementById('ir-coc-matrix-editor').rows[1];
  row.querySelector('select').value = 'Moderate';
  row.querySelector('input').value = '1';
  row.querySelector('textarea').value = 'Written Warning';
  assert.equal(row.querySelector('textarea').maxLength, 191);
  await document.getElementById('ir-coc-matrix-form').trigger('submit');
  assert.equal(saves, 1);
  assert.equal(document.getElementById('ir-coc-matrix').rows.length, 2);
  assert.equal(
    document.querySelector('.feedback-popup').querySelector('span').textContent,
    'Saved successfully.'
  );
  assert.equal(document.getElementById('ir-coc-pdf'), null);
  assert.equal(document.getElementById('ir-coc-publish-form'), null);
});

test('NTE reminder buttons direct every role to Track with the matching label', async () => {
  for (const role of ['STAFF', 'SUPERVISOR', 'HEAD', 'HR', 'ADMIN']) {
    const browser = createBrowser();
    browser.loadDashboard();
    const { context, document } = browser;
    browser.evaluate(
      `session = { role: '${role}', email: 'employee@example.com', perms: [] }`
    );
    context.fetch = async (url) => ({
      ok: true,
      json: async () =>
        url.endsWith('listDailyNteReminders')
          ? [
              {
                incidentId: 9,
                caseNumber: 'IR-9',
                daysRemaining: 2,
                deadlineDate: '2026-11-04'
              }
            ]
          : []
    });
    let destination;
    context.openIncidentRoute = async (id, route) => {
      destination = [id, route];
    };
    await context.showPendingAnnouncements();
    const button = document
      .getElementById('staff-announcements-list')
      .querySelector('button');
    assert.equal(button.textContent, 'Open case in Track', role);
    await button.click();
    assert.deepEqual(destination, [9, 'incident-track']);
  }
});

test('Supervisor has History while Head has Review and ordinary HR cannot file', () => {
  const browser = createBrowser();
  browser.loadDashboard();
  const navigation = browser.context.INCIDENT_MANAGEMENT_NAVIGATION;
  assert.deepEqual(
    Array.from(navigation.forRole('SUPERVISOR'), (item) => item[0]),
    [
      'incident-file',
      'incident-track',
      'incident-history',
      'incident-code-of-conduct'
    ]
  );
  assert.deepEqual(
    Array.from(navigation.forRole('HEAD'), (item) => item[0]),
    [
      'incident-file',
      'incident-track',
      'incident-review',
      'incident-code-of-conduct'
    ]
  );
  assert.ok(
    !navigation.forRole('HR').some((item) => item[0] === 'incident-file')
  );
  assert.ok(
    navigation.forRole('HR', true).some((item) => item[0] === 'incident-file')
  );
});

test('employee suggestions retain selection, reject stale responses, and reset hidden IDs', async () => {
  const browser = createBrowser();
  browser.load('public/js/EmployeeSearch.js');
  const { document, context } = browser;
  const input = document.createElement('input');
  input.id = 'employee';
  const suggestions = document.createElement('div');
  document.body.append(input, suggestions);
  input.focus();
  const responses = new Map();
  let selectedId = '';
  const search = context.createEmployeeSearch({
    input,
    suggestions,
    search: (query) => new Promise((resolve) => responses.set(query, resolve)),
    onSelect: (employee) => {
      selectedId = employee.employeeId;
    },
    onClear: () => {
      selectedId = '';
    }
  });
  input.value = 'Al';
  await input.trigger('input');
  const old = browser.runTimers();
  input.value = 'Bo';
  await input.trigger('input');
  const current = browser.runTimers();
  responses.get('Bo')([{ employeeId: 'EMP-2', name: 'Bob' }]);
  await current;
  await input.trigger('keydown', { key: 'ArrowDown' });
  await input.trigger('keydown', { key: 'Enter' });
  assert.equal(selectedId, 'EMP-2');
  assert.equal(input.value, 'Bob');
  responses.get('Al')([{ employeeId: 'EMP-1', name: 'Alice' }]);
  await old;
  assert.equal(search.getSelection().employeeId, 'EMP-2');
  assert.equal(suggestions.hidden, true);
  input.value = 'Carol';
  await input.trigger('input');
  const pending = browser.runTimers();
  search.reset();
  responses.get('Carol')([{ employeeId: 'EMP-3', name: 'Carol' }]);
  await pending;
  assert.equal(selectedId, '');
  assert.equal(search.getSelection(), null);
  assert.equal(suggestions.childElementCount, 0);
});

test('app confirmations resolve through Confirm, Cancel, and Escape', async () => {
  const browser = createBrowser();
  browser.load('public/js/AppConfirm.js');
  const first = browser.context.appConfirm('Proceed?');
  const dialog = browser.document.querySelectorAll('dialog')[0];
  await dialog.querySelector('.app-confirm-accept').click();
  assert.equal(await first, true);
  const second = browser.context.appConfirm('Proceed?');
  await dialog.querySelector('.app-confirm-cancel').click();
  assert.equal(await second, false);
  const third = browser.context.appConfirm('Proceed?');
  await dialog.trigger('cancel');
  assert.equal(await third, false);
  const replaced = browser.context.appConfirm('Earlier confirmation');
  const replacement = browser.context.appConfirm('Latest confirmation');
  assert.equal(await replaced, false);
  await dialog.querySelector('.app-confirm-accept').click();
  assert.equal(await replacement, true);
});

function workflowIncident(overrides = {}) {
  return {
    id: 9,
    workflowVersion: 2,
    caseNumber: 'IR-9',
    subject: 'Synthetic incident',
    status: 'NTE ISSUED',
    phase: 'HR',
    reporterEmail: 'reporter@example.invalid',
    reporterName: 'Synthetic Reporter',
    reportedEmployeeEmail: 'employee@example.invalid',
    reportedEmployeeName: 'Synthetic Employee',
    assignedHeadEmail: 'head@example.invalid',
    siblings: [],
    files: [],
    informationRequests: [],
    extensions: [],
    internalActivity: [],
    hearingStatus: 'NONE',
    submittedAt: '2026-11-02 10:00:00',
    report: {
      employee: {
        name: 'Synthetic Employee',
        position: 'Staff',
        department: 'IT',
        supervisor: 'Synthetic Head'
      },
      what: 'Synthetic report',
      date: '2026-11-01',
      time: '09:00',
      involved: [],
      witnesses: []
    },
    rights: { hr: true, maxSection: 8 },
    task: { isMine: true, state: 'READY', owner: 'hr@example.invalid' },
    managers: [],
    defaultManager: '',
    nte: null,
    ...overrides
  };
}
function workflowBrowser() {
  const browser = createBrowser();
  browser.loadDashboard();
  browser.evaluate("session = { role: 'HR', email: 'hr@example.invalid' }");
  browser.context.IncidentTimeline.render = () => {};
  const parent = browser.document.createElement('section');
  browser.document.body.appendChild(parent);
  return { ...browser, parent };
}
const actionButton = (parent, title) =>
  parent
    .querySelectorAll('button')
    .find((button) => button.textContent === title);
const labeledControl = (parent, title) =>
  parent
    .querySelectorAll('label')
    .find((label) => label.textContent.startsWith(title))?.children[0];

test('current case closure validates visibly and reloads its calling view', async () => {
  const { context, document, parent } = workflowBrowser();
  const calls = [];
  context.fetch = async (url, options) => {
    calls.push({
      method: url.split('/').pop(),
      args: JSON.parse(options.body).args
    });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  context.refreshIncidentBadges = context.refreshInboxBadge = async () => {};
  context.appConfirm = async () => true;
  let reloads = 0;
  context.IncidentWorkflow.render(
    parent,
    workflowIncident({ phase: 'FINALIZED' }),
    async () => ++reloads
  );
  await actionButton(parent, 'Close Case').click();
  const form = parent.querySelector('form'),
    reason = form.querySelector('textarea');
  assert.equal(reason.required, true);
  reason.willValidate = true;
  reason.validity = { valid: false, valueMissing: true };
  await form.trigger('submit');
  assert.equal(calls.length, 0);
  assert.equal(reloads, 0);
  assert.match(
    document.querySelector('.feedback-popup').textContent,
    /required fields/
  );
  reason.value = 'Administrative completion confirmed.';
  reason.validity = { valid: true };
  await form.trigger('submit');
  assert.deepEqual(calls, [
    {
      method: 'incidentWorkflowAction',
      args: [9, 'CLOSE', { reason: reason.value }]
    }
  ]);
  assert.equal(reloads, 1);
  assert.equal(form.querySelector('button').disabled, false);
});

test('current HR actions require ownership, an active case and completed information requests', () => {
  for (const [overrides, canEdit] of [
    [{}, true],
    [{ task: { isMine: false } }, false],
    [{ status: 'CLOSED' }, false],
    [
      {
        informationRequests: [
          { status: 'PENDING', recipientEmail: 'other@example.invalid' }
        ]
      },
      false
    ]
  ]) {
    const { context, parent } = workflowBrowser();
    context.IncidentWorkflow.render(
      parent,
      workflowIncident(overrides),
      async () => {}
    );
    for (const title of [
      'Schedule Hearing',
      'Request Information From Employees',
      'Review NTE And Recommend Action'
    ])
      assert.equal(Boolean(actionButton(parent, title)), canEdit, title);
  }
});

test('current review and NTE editors initialize only when opened and preserve their fields on reopening', async () => {
  for (const [overrides, title, pads] of [
    [{}, 'Review NTE And Recommend Action', 0],
    [
      { phase: 'HEAD', rights: { head: true, maxSection: 2 } },
      'Prepare Notice To Explain',
      1
    ]
  ]) {
    const { context, parent } = workflowBrowser();
    let initialized = 0;
    context.createSignaturePad = () => {
      ++initialized;
      return { toDataURL: () => '' };
    };
    context.IncidentWorkflow.render(
      parent,
      workflowIncident(overrides),
      async () => {}
    );
    const toggle = actionButton(parent, title);
    assert.ok(toggle);
    assert.equal(parent.querySelector('form'), null);
    assert.equal(initialized, 0);
    await toggle.click();
    const field = parent.querySelector('textarea');
    assert.ok(field);
    field.value = 'Preserve this draft';
    assert.equal(initialized, pads);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    await toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    assert.equal(parent.querySelector('textarea'), field);
    assert.equal(field.value, 'Preserve this draft');
    assert.equal(initialized, pads);
  }
});

test('current issued NTE identifies the recipient and excludes internal HR actions for its employee', () => {
  const { context, parent } = workflowBrowser();
  context.IncidentWorkflow.render(
    parent,
    workflowIncident({
      nte: {
        policy: 'Synthetic policy',
        dateIssued: '2026-11-01',
        issuerName: 'Synthetic Head',
        evidenceTypes: []
      },
      rights: { reported: true, maxSection: 7 },
      phase: 'EMPLOYEE',
      receivedAt: '2026-11-01',
      explanation: { statement: 'Synthetic explanation' },
      status: 'CLOSED'
    }),
    async () => {}
  );
  assert.match(parent.textContent, /Employee Being ReportedSynthetic Employee/);
  assert.match(parent.textContent, /Synthetic policy/);
  assert.match(parent.textContent, /Directive To Submit Written Explanation/);
  assert.doesNotMatch(parent.textContent, /HR Administrative Review/);
  assert.equal(
    actionButton(parent, 'Review NTE And Recommend Action'),
    undefined
  );
  assert.equal(parent.querySelector('form'), null);
});

test('current review displays server-calculated action and prior finalized violations', async () => {
  const { context, parent } = workflowBrowser();
  const calls = [];
  context.fetch = async (url, options) => {
    calls.push({
      method: url.split('/').pop(),
      args: JSON.parse(options.body).args
    });
    return {
      ok: true,
      json: async () => ({
        correctiveAction: '4 days Suspension',
        previousOffenses: 1
      })
    };
  };
  context.IncidentWorkflow.render(parent, workflowIncident(), async () => {});
  await actionButton(parent, 'Review NTE And Recommend Action').click();
  const finding = labeledControl(parent, 'Finding'),
    severity = labeledControl(parent, 'Violation Severity');
  finding.value = 'SUBSTANTIATED';
  await finding.trigger('change');
  severity.value = 'Light';
  await severity.trigger('change');
  const action = labeledControl(parent, 'Recommended Corrective Action');
  assert.equal(action.value, '4 days Suspension');
  assert.equal(action.readOnly, true);
  assert.equal(labeledControl(parent, 'Previous Relevant Offenses').value, 1);
  assert.deepEqual(calls, [
    { method: 'getIncidentCorrectiveAction', args: [9, 'Light'] }
  ]);
  finding.value = 'NOT_SUBSTANTIATED';
  await finding.trigger('change');
  assert.equal(action.value, 'No Further Action');
  assert.equal(severity.disabled, true);
});

test('current Track reload callback refreshes the selected case without legacy inline controls', async () => {
  const { context, document } = workflowBrowser();
  let reads = 0,
    reload;
  context.fetch = async (url) => ({
    ok: true,
    json: async () => {
      if (url.endsWith('getIncidentTrackingVersion')) return { version: '1' };
      ++reads;
      return workflowIncident();
    }
  });
  context.IncidentProgress.render = () => {};
  context.IncidentWorkflow.render = (_parent, _incident, callback) => {
    reload = callback;
  };
  await context.IncidentTrack.select(9);
  assert.equal(typeof reload, 'function');
  assert.equal(reads, 1);
  await reload();
  assert.equal(reads, 2);
  assert.equal(document.getElementById('ir-track-action-feedback'), null);
});

test('Head HR switches preview immediately, discard unsaved visits, and persist only on Save Changes', async () => {
  const browser = createBrowser();
  browser.loadDashboard();
  const { context, document } = browser;
  let reads = 0;
  let saved = false;
  let writes = 0;
  let failNextSave = true;
  context.fetch = async (url, options) => {
    if (url.endsWith('saveAccountChanges')) {
      const changes = JSON.parse(options.body).args[0];
      assert.equal(changes.hrHeadChanged, true);
      assert.equal(changes.hrHeadEmail, 'hr2@example.com');
      if (failNextSave) {
        failNextSave = false;
        return { ok: false, json: async () => ({ error: 'Save failed' }) };
      }
      ++writes;
      saved = true;
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (url.endsWith('getIncidentWorkflowConfiguration'))
      return {
        ok: true,
        json: async () => ({
          departments: [],
          assignments: [],
          accounts: [],
          approvers: [],
          managementEmail: ''
        })
      };
    ++reads;
    return {
      ok: true,
      json: async () => ({
        availableHeads: [],
        requests: [],
        accounts: {
          users: [],
          heads: [],
          admins: [],
          hr: [
            {
              email: 'hr1@example.com',
              role: 'HR',
              active: 1,
              is_hr_head: saved ? 0 : 1
            },
            {
              email: 'hr2@example.com',
              role: 'HR',
              active: 1,
              is_hr_head: saved ? 1 : 0
            }
          ]
        }
      })
    };
  };
  await browser.evaluate('VIEWS.accounts()');
  await document.getElementById('am_hr').querySelectorAll('button')[1].click();
  let switches = document.getElementById('am_hr').querySelectorAll('button');
  assert.equal(switches[0].getAttribute('aria-pressed'), 'false');
  assert.equal(switches[1].getAttribute('aria-pressed'), 'true');
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  // Turn the proposed Head off and back on without sending a write.
  await switches[1].click();
  switches = document.getElementById('am_hr').querySelectorAll('button');
  assert.ok(
    switches.every((button) => button.getAttribute('aria-pressed') === 'false')
  );
  await switches[1].click();
  assert.equal(writes, 0);
  await browser.evaluate("VIEWS['account-requests']()");
  await browser.evaluate('VIEWS.accounts()');
  switches = document.getElementById('am_hr').querySelectorAll('button');
  assert.equal(switches[0].getAttribute('aria-pressed'), 'true');
  assert.equal(switches[1].getAttribute('aria-pressed'), 'false');
  assert.equal(document.getElementById('am_save_changes').disabled, true);
  assert.equal(writes, 0);
  await switches[1].click();
  await document.getElementById('am_save_changes').click();
  switches = document.getElementById('am_hr').querySelectorAll('button');
  assert.equal(switches[0].getAttribute('aria-pressed'), 'false');
  assert.equal(switches[1].getAttribute('aria-pressed'), 'true');
  assert.equal(document.getElementById('am_save_changes').disabled, false);
  assert.equal(writes, 0);
  await document.getElementById('am_save_changes').click();
  switches = document.getElementById('am_hr').querySelectorAll('button');
  assert.equal(switches[0].getAttribute('aria-pressed'), 'false');
  assert.equal(switches[1].getAttribute('aria-pressed'), 'true');
  assert.equal(writes, 1);
  assert.equal(document.getElementById('am_save_changes').disabled, true);
  await browser.evaluate('VIEWS.accounts()');
  switches = document.getElementById('am_hr').querySelectorAll('button');
  assert.equal(switches[0].getAttribute('aria-pressed'), 'false');
  assert.equal(switches[1].getAttribute('aria-pressed'), 'true');
});

test('ADMIN and HR see employee violation search while STAFF and HEAD do not', async () => {
  for (const role of ['ADMIN', 'HR', 'STAFF', 'SUPERVISOR', 'HEAD']) {
    const browser = createBrowser();
    browser.loadDashboard();
    browser.evaluate(
      `session = {role: '${role}', email: 'user@example.com', perms: ['emp.read']}`
    );
    browser.context.fetch = async (url) => ({
      ok: true,
      json: async () =>
        url.endsWith('getIncidentCodeGuide')
          ? { matrix: [], canManage: false }
          : { records: [], total: 0, page: 1, pages: 1 }
    });
    await browser.context.IncidentConduct.load();
    assert.equal(
      browser.document.getElementById('ir-violation-employee-form').hidden,
      !['ADMIN', 'HR'].includes(role)
    );
  }
});
