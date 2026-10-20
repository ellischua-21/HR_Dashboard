const $ = id => document.getElementById(id);
const API_BASE = window.HR_API_BASE || 'http://localhost:3001/api';
const api = async (fn, ...args) => {
  const response = await fetch(API_BASE + '/' + encodeURIComponent(fn), {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed.');
  return result;
};
const showErr = m => { $('err').textContent = m; $('err').hidden = !m; };
const busy = b => { $('busy').hidden = !b; };
const FILTER_KEYS = ['company', 'department', 'location', 'status', 'rank', 'function_type'];

// [id, title, chart type, data key]
const CHARTS = [
  ['company', 'Headcount by company', 'bar', 'company'], ['department', 'Headcount by department', 'bar', 'department'],
  ['location', 'Headcount by work location', 'bar', 'location'], ['status', 'Employment status', 'doughnut', 'status'],
  ['gender', 'Gender distribution', 'doughnut', 'gender'], ['age', 'Age groups', 'bar', 'age'],
  ['education', 'Education level', 'bar', 'education'], ['rank', 'Employee rank', 'bar', 'rank'],
  ['functionType', 'Function type', 'bar', 'functionType'], ['tenure', 'Tenure distribution', 'bar', 'tenure'],
  ['hiringTrend', 'Monthly hiring trend', 'line', 'hiringTrend']
];
const KPIS = [
  ['headcount', 'Total headcount', 'hero'], ['fte', 'Full-time equivalent (FTE)', 'hero'], ['active', 'Active employees'],
  ['inactive', 'Inactive employees'], ['newHires', 'New hires (period)'], ['resigned', 'Resigned employees'],
  ['avgTenureYears', 'Average tenure (years)'], ['companies', 'Companies'], ['departments', 'Departments'], ['locations', 'Work locations']
];
// Navigation: [id, label, permission, built?]. Visibility only; the server enforces every permission.
const NAV = [
  ['dashboard', 'Dashboard', 'dash.view', true],
  ['leave-requests', 'Manage Forms', 'forms.review', true],
  ['employees', 'Employee Master List', 'emp.read', true],
  ['register', 'Employee Registration', 'emp.write', true],
  ['executive', 'Executive Summary', 'exec.view', true],
  ['reports', 'HR Reports', 'report.run', true],
  ['audit', 'Audit Logs', 'audit.read', true],
  ['accounts', 'Manage Accounts', 'admin.manage', true],
  ['account-settings', 'Account Management', 'account.password', true]
];
const USER_NAV = [
  ['user-dashboard', 'Submitted Forms', 'forms.self', true],
  ['user-forms', 'Forms', 'forms.self', true],
  ['account-settings', 'Account Management', 'account.password', true]
];
const HEAD_NAV = ['head-forms', 'Manage Forms', 'forms.head-review', true];
const PALETTE = ['#6b2638', '#f6a53a', '#a1566a', '#8a8f98', '#c98a1b', '#3d1620', '#d9b3be', '#5b6678'];
const _OLD = ['#6b2638', '#f6a53a', '#b45309', '#5b6678', '#2563a8', '#7c3a8a', '#8a8f98', '#3f8f5f'];
let charts = {}, session = null;

async function init() {
  try {
    session = await api('getSession');
    if (session.error) { showLogin(); return; }
    hideLogin();
    $('uemail').textContent = session.email; $('urole').textContent = session.role.replaceAll('_', ' ').toUpperCase();
    const isFormSubmitter = ['STAFF', 'HEAD', 'USER'].includes(session.role);
    const isHead = session.role === 'HEAD';
    const navItems = isFormSubmitter
      ? isHead
        ? [USER_NAV[0], HEAD_NAV, USER_NAV[1], USER_NAV[2]]
        : USER_NAV
      : NAV.filter(item => item[0] !== 'account-settings' || !session.perms.includes('admin.manage'));
    navItems.filter(n => session.perms.includes(n[2])).forEach(n => {
      const a = document.createElement('a'); a.textContent = n[1]; a.tabIndex = 0; a.dataset.id = n[0];
      if (n[0] === 'leave-requests' || n[0] === 'head-forms') {
        const count = document.createElement('span');
        count.id = 'submitted-forms-count';
        count.className = 'nav-count';
        count.hidden = true;
        count.setAttribute('aria-label', 'pending submissions');
        a.appendChild(count);
      }
      a.onclick = () => go(n); a.onkeydown = e => { if (e.key === 'Enter') go(n); };
      $('nav').appendChild(a);
    });
    $('menuBtn').onclick = () => document.body.classList.toggle('open');
    $('logoutBtn').onclick = async () => {
      try {
        const response = await fetch(API_BASE + '/logout', { method: 'POST', credentials: 'include' });
        if (!response.ok) throw new Error('Sign out failed.');
        location.reload();
      } catch (error) {
        showErr(error.message || String(error));
      }
    };
    if (isFormSubmitter) {
      go(USER_NAV[0]);
      if (isHead) {
        window.refreshSubmittedFormsBadge().catch(error => showErr(error.message || String(error)));
        window.setInterval(() => {
          if (!document.hidden) window.refreshSubmittedFormsBadge().catch(error => showErr(error.message || String(error)));
        }, 60000);
      }
      return;
    }
    $('applyBtn').onclick = loadDashboard; $('resetBtn').onclick = () => { $('filters').reset(); loadDashboard(); };
    buildKpiAndChartShells();
    if (session.perms.includes('dash.view')) { await loadOptions(); go(NAV[0]); }
    if (session.perms.includes('forms.review')) {
      window.refreshSubmittedFormsBadge().catch(error => showErr(error.message || String(error)));
      window.setInterval(() => {
        if (!document.hidden) window.refreshSubmittedFormsBadge().catch(error => showErr(error.message || String(error)));
      }, 60000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) window.refreshSubmittedFormsBadge().catch(error => showErr(error.message || String(error)));
      });
    }
  } catch (e) { showLogin(e.message || String(e), true); }
}

function showLogin(message = '', isError = false) {
  const bootstrap = $('bootstrap-screen');
  if (bootstrap) bootstrap.remove();
  let main = $('login-screen');
  if (!main) {
    main = document.createElement('main');
    main.id = 'login-screen';
    main.className = 'login';
    document.body.appendChild(main);
  }
  const card = document.createElement('form');
  card.className = 'login-card';
  main.replaceChildren(card);
  let mode = 'login';
  let feedback = message;
  let feedbackIsError = isError;
  const render = () => {
    card.replaceChildren();
    const title = document.createElement('h1');
    title.textContent = 'HR Management System';
    const tabs = document.createElement('div');
    tabs.className = 'login-tabs';
    [['login', 'Sign in'], ['request', 'Request an account']].forEach(([id, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = id === mode ? 'login-tab active' : 'login-tab';
      button.textContent = label;
      button.onclick = () => { mode = id; feedback = ''; render(); };
      tabs.appendChild(button);
    });
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = mode === 'login'
      ? 'Sign in with your approved dashboard account.'
      : 'Submit your details to request an account. An administrator must approve it before you can sign in.';
    card.append(title, tabs, note);

    if (mode === 'request') {
      addLoginInput(card, 'Full name', 'name', 'text', 'name', true);
    }
    const email = addLoginInput(card, 'Email', 'email', 'email', 'username', true);
    const password = addLoginInput(card, 'Password', 'password', 'password', mode === 'login' ? 'current-password' : 'new-password', true);
    let confirmPassword;
    if (mode === 'request') {
      confirmPassword = addLoginInput(card, 'Confirm password', 'confirmPassword', 'password', 'new-password', true);
      password.minLength = 12;
      password.maxLength = 128;
      confirmPassword.minLength = 12;
      confirmPassword.maxLength = 128;
    }
    const error = document.createElement('p');
    error.className = feedbackIsError ? 'login-error' : 'login-message';
    error.textContent = feedback;
    error.hidden = !feedback;
    card.appendChild(error);
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = mode === 'login' ? 'Sign in' : 'Submit request';
    card.appendChild(submit);

    card.onsubmit = async event => {
      event.preventDefault();
      error.hidden = true;
      submit.disabled = true;
      try {
        if (mode === 'login') {
          const response = await fetch(API_BASE + '/login', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.value, password: password.value })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Sign in failed.');
          location.reload();
          return;
        }

        if (password.value !== confirmPassword.value) throw new Error('The passwords do not match.');
        const result = await api('requestAccount', {
          name: card.elements.name.value,
          email: email.value,
          password: password.value
        });
        mode = 'login';
        feedback = result.message;
        feedbackIsError = false;
        render();
      } catch (cause) {
        error.textContent = cause.message || String(cause);
        error.hidden = false;
        feedbackIsError = true;
      } finally {
        submit.disabled = false;
      }
    };
  };
  render();
}

function hideLogin() {
  const bootstrap = $('bootstrap-screen');
  if (bootstrap) bootstrap.remove();
  const login = $('login-screen');
  if (login) login.remove();
  $('app').hidden = false;
}

function addLoginInput(form, labelText, name, type, autocomplete, required) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  input.autocomplete = autocomplete;
  input.required = required;
  label.appendChild(input);
  form.appendChild(label);
  return input;
}

function go(n) {
  document.body.classList.remove('open'); showErr('');
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.id === n[0]));
  $('title').textContent = n[1];
  document.querySelectorAll('.view').forEach(v => v.hidden = true);
  if (n[0] === 'dashboard') { $('view-dashboard').hidden = false; loadDashboard(); }
  else if (window.VIEWS && VIEWS[n[0]]) { $('view-' + n[0]).hidden = false; VIEWS[n[0]](); }
  else { $('view-soon').hidden = false; $('soonMsg').textContent = n[1] + ' will be available in the next development stage.'; }
}

function setSubmittedFormsCount(count) {
  const badge = $('submitted-forms-count');
  if (!badge) return;
  const pending = Number(count) || 0;
  badge.textContent = pending > 99 ? '99+' : String(pending);
  badge.hidden = pending === 0;
  const link = badge.parentElement;
  link.setAttribute('aria-label', `Submitted Forms, ${pending} pending`);
  link.title = `${pending} pending submission${pending === 1 ? '' : 's'}`;
}

async function loadOptions() {
  const o = await api('getFilterOptions');
  FILTER_KEYS.forEach(k => {
    const s = $('f_' + k); s.innerHTML = '';
    ['All'].concat(o[k]).forEach((v, i) => { const op = document.createElement('option'); op.value = i ? v : ''; op.textContent = v; s.appendChild(op); });
  });
}

function getFilters() {
  const f = {}; ['dateFrom', 'dateTo'].concat(FILTER_KEYS).forEach(k => { const v = $('f_' + k).value; if (v) f[k] = v; });
  return f;
}

function buildKpiAndChartShells() {
  $('kpis').innerHTML = ''; $('charts').innerHTML = '';
  KPIS.forEach(k => { const d = document.createElement('div'); d.className = 'kpi ' + (k[2] || ''); d.innerHTML = '<b id="k_' + k[0] + '">–</b><span>' + k[1] + '</span>'; $('kpis').appendChild(d); });
  CHARTS.forEach(c => { const p = document.createElement('div'); p.className = 'panel'; p.innerHTML = '<h2>' + c[1] + '</h2><div class="chartbox"><canvas id="c_' + c[0] + '" role="img" aria-label="' + c[1] + '"></canvas></div><p class="note" id="n_' + c[0] + '"></p>'; $('charts').appendChild(p); });
}

async function loadDashboard() {
  busy(true); showErr('');
  try { render(await api('getDashboard', getFilters())); }
  catch (e) { showErr(e.message || String(e)); }
  finally { busy(false); }
}

function render(d) {
  KPIS.forEach(k => { const v = d.kpis[k[0]]; $('k_' + k[0]).textContent = v === null || v === undefined ? 'n/a' : v; });
  CHARTS.forEach(c => {
    const data = d.charts[c[3]], box = $('c_' + c[0]);
    if (charts[c[0]]) charts[c[0]].destroy();
    $('n_' + c[0]).textContent = data.length ? '' : 'No records match the selected filters.';
    if (!data.length) return;
    const horizontal = c[2] === 'bar' && ['company', 'department', 'location'].includes(c[0]);
    charts[c[0]] = new Chart(box, {
      type: c[2],
      data: { labels: data.map(x => x.label), datasets: [{ data: data.map(x => x.value),
        backgroundColor: c[2] === 'line' ? '#f6a53a' : c[2] === 'doughnut' ? PALETTE : '#6b2638', borderColor: '#f6a53a', tension: .25 }] },
      options: { indexAxis: horizontal ? 'y' : 'x', responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: c[2] === 'doughnut', position: 'bottom' } },
        scales: c[2] === 'doughnut' ? {} : { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  });
  $('obs').innerHTML = ''; d.observations.forEach(t => { const li = document.createElement('li'); li.textContent = t; $('obs').appendChild(li); });
  $('asof').textContent = 'Reporting date ' + d.asOf + ' · new hires counted from ' + d.from;
  const q = d.quality, box = $('quality'); box.innerHTML = '';
  if (q.overallPct === null) { box.textContent = 'No records to assess.'; return; }
  const row = (l, p) => { const w = document.createElement('div'); w.innerHTML = '<div class="q"><span></span><span>' + p + '%</span></div><div class="bar"><i style="width:' + p + '%"></i></div>'; w.querySelector('span').textContent = l; box.appendChild(w); };
  row('Overall completeness', q.overallPct); q.lowestFields.forEach(x => row(x.label, x.pct));
  const g = document.createElement('p'); g.className = 'note';
  g.textContent = q.govInfoComplete + ' employee(s) have complete government information; ' + q.govInfoIncomplete + ' do not.'; box.appendChild(g);
}
window.initializeDashboard = init;