const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowser } = require('./helpers/Browser');

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
  assert.ok(
    parent
      .querySelectorAll('p')
      .some(
        (p) => !p.hidden && p.textContent.includes('Enter the completion notes')
      )
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
    feedback: document.createElement('p'),
    reload: async () => {}
  });
  await Promise.resolve();
  assert.ok(
    parent
      .querySelectorAll('button')
      .some((b) => b.textContent === 'Save investigation note')
  );
  assert.ok(
    parent
      .querySelectorAll('button')
      .some((b) => b.textContent === 'Close case')
  );
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

test('Track supplies its reload and visible feedback to decision controls', async () => {
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
  assert.equal(
    controls.feedback,
    document.getElementById('ir-track-action-feedback')
  );
  assert.equal(controls.reload, context.IncidentTrack.select);
});

test('staging Head HR switches updates locally with only one selection', async () => {
  const browser = createBrowser();
  browser.loadDashboard();
  const { context, document } = browser;
  let reads = 0;
  context.fetch = async () => {
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
            { email: 'hr1@example.com', role: 'HR', active: 1, is_hr_head: 1 },
            { email: 'hr2@example.com', role: 'HR', active: 1, is_hr_head: 0 }
          ]
        }
      })
    };
  };
  await browser.evaluate('loadAccountManagement()');
  await document.getElementById('am_hr').querySelectorAll('button')[1].click();
  const switches = document.getElementById('am_hr').querySelectorAll('button');
  assert.equal(switches[0].getAttribute('aria-pressed'), 'false');
  assert.equal(switches[1].getAttribute('aria-pressed'), 'true');
  assert.equal(reads, 1);
});
