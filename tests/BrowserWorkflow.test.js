const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowser } = require('./helpers/Browser');

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
  const input = browser.document.getElementById('ir-incident-date');
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
  for (const role of ['STAFF', 'HEAD', 'HR', 'ADMIN']) {
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

test('case closure validates visibly and reloads its calling view', async () => {
  const browser = createBrowser();
  browser.loadDashboard();
  const { context, document } = browser;
  browser.evaluate("session = { role: 'HR', email: 'hr@example.com' }");
  const calls = [];
  context.fetch = async (url, options) => {
    const method = url.split('/').pop();
    calls.push({ method, args: JSON.parse(options.body).args });
    return {
      ok: true,
      json: async () =>
        method === 'getIncidentBadgeCounts'
          ? { track: 0, review: 0 }
          : { ok: true, status: 'CLOSED' }
    };
  };
  context.appConfirm = async () => true;
  const parent = document.createElement('section');
  document.body.appendChild(parent);
  let reloaded = null;
  context.IncidentCaseUI.renderDecision(
    parent,
    {
      id: 9,
      caseNumber: 'IR-9',
      canReview: true,
      status: 'DECISION ISSUED',
      decision: {
        outcome: 'NO_VIOLATION',
        issuedAt: '2026-10-28',
        deliveredAt: '2026-10-28'
      }
    },
    {
      reload: async (id) => {
        reloaded = id;
      }
    }
  );
  const close = parent
    .querySelectorAll('button')
    .find((button) => button.textContent.includes('close case'));
  const notes = parent.querySelector('textarea');
  await close.click();
  assert.equal(calls.length, 0);
  assert.match(
    document.querySelector('.feedback-popup').textContent,
    /Enter the completion notes/
  );
  notes.value = 'Delivery and administrative completion confirmed.';
  await close.click();
  assert.equal(calls[0].method, 'closeIncidentDecision');
  assert.equal(calls[0].args[0], 9);
  assert.equal(reloaded, 9);
  assert.equal(document.getElementById('ir-case-dialog').open, false);
  assert.equal(close.disabled, false);
});

test('investigation actions are shared and available only to reviewers on active cases', async () => {
  const browser = createBrowser();
  browser.loadDashboard();
  const { context, document } = browser;
  context.fetch = async () => ({ ok: true, json: async () => [] });
  const incident = {
    id: 1,
    status: 'UNDER INVESTIGATION',
    canReview: true,
    informationRequests: [],
    activity: []
  };
  const parent = document.createElement('section');
  context.IncidentInvestigation.render(parent, incident, {
    reload: async () => {}
  });
  await Promise.resolve();
  assert.ok(
    parent
      .querySelectorAll('button')
      .some((b) => b.textContent === 'Save investigation note')
  );
  assert.equal(
    parent
      .querySelectorAll('button')
      .some((button) => button.textContent === 'Close for documentation'),
    false
  );
  const closure = context.IncidentCaseUI.renderClosureAction(incident, {});
  parent.appendChild(closure);
  const closeToggle = closure
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Close for documentation');
  await closeToggle.click();
  assert.equal(closeToggle.textContent, 'Hide closure form');
  const employeeView = document.createElement('section');
  context.IncidentInvestigation.render(
    employeeView,
    { ...incident, canReview: false },
    {}
  );
  assert.equal(employeeView.querySelectorAll('button').length, 0);
  const archived = document.createElement('section');
  context.IncidentInvestigation.render(
    archived,
    { ...incident, status: 'CLOSED' },
    {}
  );
  assert.equal(archived.querySelectorAll('button').length, 0);
});

test('review and NTE forms appear only after their action is selected', async () => {
  const browser = createBrowser();
  browser.loadDashboard();
  const { context, document } = browser;
  const root = document.createElement('section');
  let transitionArgs;
  context.fetch = async (url, options) => {
    const method = url.split('/').pop();
    if (method === 'transitionIncident')
      transitionArgs = JSON.parse(options.body).args;
    return {
      ok: true,
      json: async () =>
        method === 'transitionIncident'
          ? { status: 'UNDER INVESTIGATION' }
          : { track: 0, review: 0 }
    };
  };
  context.refreshInboxBadge = async () => {};
  context.refreshIncidentBadges = async () => {};
  let signaturePadInitializations = 0;
  context.createSignaturePad = () => {
    signaturePadInitializations += 1;
    return { toDataURL: () => 'data:image/png;base64,aA==' };
  };
  const incident = {
    id: 19,
    status: 'UNDER_REVIEW',
    canReview: true
  };
  const review = context.IncidentCaseUI.renderReviewActions(incident, {
    reload: async () => {}
  });
  root.appendChild(review);
  const closure = context.IncidentCaseUI.renderClosureAction(incident, {
    reload: async () => {}
  });
  root.appendChild(closure);
  const closeToggle = closure
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Close for documentation');
  const closePanel = closure.querySelectorAll('div').at(-1);
  assert.equal(closePanel.hidden, true);
  await closeToggle.click();
  assert.equal(closePanel.hidden, false);
  const investigate = review
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Require further investigation');
  await investigate.click();
  assert.deepEqual(transitionArgs, [19, 'START_INVESTIGATION', '']);

  const nteRoot = document.createElement('section');
  context.IncidentCaseUI.renderNte(
    nteRoot,
    {
      ...incident,
      reportedEmployeeEmail: 'employee@example.com',
      currentUserEmail: 'hr@example.com',
      nte: null,
      explanations: [],
      explanationAddenda: []
    },
    [],
    {}
  );
  const nteToggle = nteRoot
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Prepare NTE');
  const nteEditor = nteRoot.querySelectorAll('.incident-nte-editor')[0];
  assert.equal(nteEditor.hidden, true);
  assert.equal(signaturePadInitializations, 0);
  await nteToggle.click();
  assert.equal(nteEditor.hidden, false);
  assert.equal(signaturePadInitializations, 1);
});

test('issued NTE identifies the recipient and omits HR response tracking', () => {
  const browser = createBrowser();
  browser.loadDashboard();
  const { context, document } = browser;
  const parent = document.createElement('section');
  context.IncidentCaseUI.renderNte(
    parent,
    {
      id: 2,
      caseNumber: 'IR-2',
      subject: 'Test incident',
      status: 'NTE ISSUED',
      canReview: true,
      currentUserEmail: 'hr@example.com',
      reportedEmployeeName: 'Reported Employee',
      reportedEmployeeEmail: 'employee@example.com',
      nte: {
        status: 'ISSUED',
        issuanceDate: '2026-10-28',
        receiptDate: '2026-10-28',
        deadlineDate: '2026-11-04',
        daysRemaining: 5,
        evidence: []
      },
      explanations: [],
      explanationAddenda: []
    },
    [],
    {}
  );
  assert.ok(
    parent
      .querySelectorAll('p')
      .some((paragraph) =>
        paragraph.textContent.includes(
          'Directed to: Reported Employee (employee@example.com)'
        )
      )
  );
  assert.equal(parent.textContent.includes('HR response tracking'), false);
  assert.equal(
    parent
      .querySelectorAll('button')
      .some((button) => /Download|Start evaluation/.test(button.textContent)),
    false
  );
});

test('evaluation corrective action is filled from severity and prior finalized violations', async () => {
  const browser = createBrowser();
  browser.loadDashboard();
  const { context, document } = browser;
  context.fetch = async () => ({
    ok: true,
    json: async () => ({
      matrix: [
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
      ]
    })
  });
  const parent = document.createElement('section');
  context.IncidentCaseUI.renderEvaluation(
    parent,
    {
      id: 11,
      status: 'EVALUATION',
      canReview: true,
      currentUserEmail: 'hr@example.com',
      evaluation: null,
      disciplinaryHistory: [{ severity: 'Light' }]
    },
    [],
    {}
  );
  const [finding, severity] = parent.querySelectorAll('select');
  const correctiveAction = parent.querySelectorAll('input')[0];
  finding.value = 'SUBSTANTIATED';
  await finding.trigger('change');
  severity.value = 'Light';
  await severity.trigger('change');
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
  assert.equal(correctiveAction.value, '4 days Suspension');
  assert.equal(correctiveAction.readOnly, true);
});

test('Track supplies its reload callback without inline feedback elements', async () => {
  const browser = createBrowser();
  browser.loadDashboard();
  const { context, document } = browser;
  browser.evaluate("session = { role: 'HR', email: 'hr@example.com' }");
  const incident = {
    id: 9,
    caseNumber: 'IR-9',
    subject: 'Test',
    status: 'DECISION ISSUED',
    canReview: true,
    reportedEmployeeName: 'Employee',
    signatures: [],
    informationRequests: [],
    decision: {},
    tracking: {
      currentStage: 'DECISION ISSUED',
      closed: false,
      stages: [{ key: 'DECISION ISSUED', label: 'Decision Issued' }]
    }
  };
  context.fetch = async (url) => ({
    ok: true,
    json: async () =>
      url.endsWith('getIncidentTrackingVersion') ? { version: '1' } : incident
  });
  context.IncidentProgress.render = () => {};
  context.IncidentTimeline.render = () => {};
  context.IncidentCaseUI.renderReport = context.IncidentCaseUI.renderSignature =
    () => {};
  let controls;
  context.IncidentCaseUI.renderDecision = (_parent, _incident, view) => {
    controls = view;
  };
  await context.IncidentTrack.select(9);
  assert.equal(Object.hasOwn(controls, 'feedback'), false);
  assert.equal(document.getElementById('ir-track-action-feedback'), null);
  assert.equal(controls.reload, context.IncidentTrack.select);
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
  for (const role of ['ADMIN', 'HR', 'STAFF', 'HEAD']) {
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
