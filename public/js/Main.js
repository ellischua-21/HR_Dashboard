window.VIEWS = {};
const can = (permission) => session.perms.includes(permission);
const guard =
  (fn) =>
  async (...a) => {
    const finishLoading = AppLoading.begin();
    try {
      showErr('');
      await fn(...a);
    } catch (e) {
      showErr(e.message || String(e));
    } finally {
      finishLoading();
    }
  };

const $ = (id) => document.getElementById(id);
const API_BASE = window.HR_API_BASE || 'http://localhost:3001/api';
const api = async (fn, ...args) =>
  AppLoading.run(async () => {
    const response = await fetch(API_BASE + '/' + encodeURIComponent(fn), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The request failed.');
    return result;
  });
const showErr = (m) => {
  AppErrors.show(m);
};
function setupBackToTop() {
  const button = $('back-to-top');
  if (!button) return;
  const updateVisibility = () => {
    button.hidden = window.scrollY < 320;
  };
  window.addEventListener('scroll', updateVisibility, { passive: true });
  button.onclick = () =>
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth'
    });
  updateVisibility();
}
const FILTER_KEYS = [
  'company',
  'department',
  'location',
  'status',
  'rank',
  'function_type'
];

// [id, title, chart type, data key]
const CHARTS = [
  ['company', 'Headcount by company', 'bar', 'company'],
  ['department', 'Headcount by department', 'bar', 'department'],
  ['location', 'Headcount by work location', 'bar', 'location'],
  ['status', 'Employment status', 'doughnut', 'status'],
  ['gender', 'Gender distribution', 'doughnut', 'gender'],
  ['age', 'Age groups', 'bar', 'age'],
  ['education', 'Education level', 'bar', 'education'],
  ['rank', 'Employee rank', 'bar', 'rank'],
  ['functionType', 'Function type', 'bar', 'functionType'],
  ['tenure', 'Tenure distribution', 'bar', 'tenure'],
  ['hiringTrend', 'Monthly hiring trend', 'line', 'hiringTrend']
];
const KPIS = [
  ['headcount', 'Total headcount', 'hero'],
  ['fte', 'Full-time equivalent (FTE)', 'hero'],
  ['active', 'Active employees'],
  ['inactive', 'Inactive employees'],
  ['newHires', 'New hires (period)'],
  ['resigned', 'Resigned employees'],
  ['avgTenureYears', 'Average tenure (years)'],
  ['companies', 'Companies'],
  ['departments', 'Departments'],
  ['locations', 'Work locations']
];
// Navigation: [id, label, permission, built?]. Visibility only; the server enforces every permission.
const NAV = [
  ['dashboard', 'Dashboard', 'dash.view', true],
  ['inbox', 'Inbox', 'inbox.read', true],
  ['employees', 'Employee Master List', 'emp.read', true],
  ['register', 'Employee Registration', 'emp.write', true],
  ['attendance', 'Attendance', 'emp.read', true],
  ['executive', 'Executive Summary', 'exec.view', true],
  ['reports', 'HR Reports', 'report.run', true],
  ['audit', 'Audit Logs', 'audit.read', true],
  ['announcements', 'Create Announcement', 'announcements.manage', true],
  ['accounts', 'Accounts', 'admin.manage', true],
  ['account-requests', 'Account Requests', 'admin.manage', true],
  ['account-settings', 'Change Password', 'account.password', true]
];
const USER_NAV = [
  ['user-dashboard', 'Submitted Forms', 'forms.self', true],
  ['inbox', 'Inbox', 'inbox.read', true],
  ['user-forms', 'Forms', 'forms.self', true],
  ['account-settings', 'Change Password', 'account.password', true]
];
const FORM_NAV = [
  ['user-forms', 'Fill Out', 'forms.self', true],
  ['user-dashboard', 'My Submissions', 'forms.self', true],
  ['leave-requests', 'Review Requests', 'forms.review', true]
];
const PALETTE = [
  '#6b2638',
  '#f6a53a',
  '#a1566a',
  '#8a8f98',
  '#c98a1b',
  '#3d1620',
  '#d9b3be',
  '#5b6678'
];
let charts = {},
  session = null;
let activeIncidentCaseCount = 0;

function positionNavigationNotificationDots() {
  const sidebar = document.getElementById('side');
  if (!sidebar) return;
  const sidebarRect = sidebar.getBoundingClientRect();
  document.querySelectorAll('#nav .nav-notification-dot').forEach((dot) => {
    const summary = dot.closest('summary');
    if (!summary || dot.hidden) return;
    const summaryRect = summary.getBoundingClientRect();
    dot.style.left = `${sidebarRect.right}px`;
    dot.style.top = `${summaryRect.top + 7}px`;
  });
}

function updateNavigationNotificationDot(id, hasNotifications) {
  const dot = document.getElementById(id);
  if (!dot) return;
  const group = dot.closest('details');
  dot.hidden = !hasNotifications || Boolean(group?.open);
  positionNavigationNotificationDots();
}

function updateFormsNotificationDot() {
  const badge = document.getElementById('hr-review-count');
  updateNavigationNotificationDot(
    'forms-notification-dot',
    Boolean(badge && !badge.hidden)
  );
}

window.updateIncidentNotificationDot = (activeCount) => {
  activeIncidentCaseCount = Number(activeCount) || 0;
  updateNavigationNotificationDot(
    'incident-management-count',
    activeIncidentCaseCount > 0
  );
};

async function init() {
  setupBackToTop();
  try {
    session = await api('getSession');
    if (session.error) {
      showLogin();
      return;
    }
    hideLogin();
    $('uemail').textContent = session.email;
    $('urole').textContent = session.role.replaceAll('_', ' ').toUpperCase();
    const isFormSubmitter = ['STAFF', 'HEAD'].includes(session.role);
    const isHead = session.role === 'HEAD';
    const navItems = isFormSubmitter
      ? USER_NAV.filter(
          (item) => !['user-dashboard', 'user-forms'].includes(item[0])
        )
      : NAV;
    const createNavLink = (n) => {
      const a = document.createElement('a');
      a.textContent = n[1];
      a.tabIndex = 0;
      a.dataset.id = n[0];
      if (n[0] === 'leave-requests') {
        const count = document.createElement('span');
        count.id = 'hr-review-count';
        count.className = 'nav-count';
        count.hidden = true;
        count.setAttribute('aria-label', 'pending submissions');
        a.appendChild(count);
      } else if (n[0] === 'inbox') {
        const count = document.createElement('span');
        count.id = 'inbox-count';
        count.className = 'nav-count';
        count.hidden = true;
        count.setAttribute('aria-label', 'unseen inbox entries');
        a.appendChild(count);
      } else if (n[0] === 'incident-track' || n[0] === 'incident-review') {
        const count = document.createElement('span');
        count.id = `${n[0]}-count`;
        count.className = 'nav-count';
        count.hidden = true;
        count.setAttribute('aria-label', 'incident cases requiring attention');
        a.appendChild(count);
      }
      a.onclick = () => go(n);
      a.onkeydown = (e) => {
        if (e.key === 'Enter') go(n);
      };
      return a;
    };
    const addNavLink = (n) => $('nav').appendChild(createNavLink(n));
    const addNavGroup = (label, items, isForms = false) => {
      if (!items.length) return;
      if (items.length === 1) {
        addNavLink(items[0]);
        return;
      }
      const group = document.createElement('details');
      group.className = isForms ? 'nav-group form-nav-group' : 'nav-group';
      const summary = document.createElement('summary');
      const title = document.createElement('span');
      title.textContent = label;
      summary.appendChild(title);
      if (label === 'Incident Management' || isForms) {
        group.classList.add('notification-nav-group');
        const count = document.createElement('span');
        count.id = isForms
          ? 'forms-notification-dot'
          : 'incident-management-count';
        count.className = 'nav-count nav-notification-dot';
        count.hidden = true;
        count.setAttribute(
          'aria-label',
          isForms ? 'pending form reviews' : 'active incident cases'
        );
        summary.appendChild(count);
        group.addEventListener('toggle', () =>
          isForms
            ? updateFormsNotificationDot()
            : window.updateIncidentNotificationDot(activeIncidentCaseCount)
        );
      }
      group.appendChild(summary);
      const children = document.createElement('div');
      children.className = 'nav-group-children';
      items.forEach((item) => children.appendChild(createNavLink(item)));
      group.appendChild(children);
      $('nav').appendChild(group);
    };
    const canManageForms = session.perms.includes('forms.review');
    const formItems = FORM_NAV.filter((n) =>
      n[0] === 'leave-requests' ? canManageForms : session.perms.includes(n[2])
    ).map((item) =>
      session.role === 'ADMIN' && item[0] === 'leave-requests'
        ? [item[0], 'Manage Forms', item[2], item[3]]
        : item
    );
    const visibleNavItems = navItems.filter((n) =>
      session.perms.includes(n[2])
    );
    const isHrAdmin = ['HR', 'ADMIN'].includes(session.role);
    if (isHrAdmin) {
      visibleNavItems.filter((n) => n[0] === 'dashboard').forEach(addNavLink);
      addNavGroup('Forms', formItems, true);

      const groupedItems = new Set([
        'employees',
        'register',
        'attendance',
        'executive',
        'reports',
        'audit',
        'announcements',
        ...(session.role === 'ADMIN'
          ? ['accounts', 'account-requests', 'account-settings']
          : [])
      ]);
      const groupItems = (ids) =>
        visibleNavItems.filter((n) => ids.includes(n[0]));
      addNavGroup(
        'Employees',
        groupItems(['employees', 'register', 'attendance'])
      );
      addNavGroup(
        'Reports',
        groupItems(['executive', 'reports', 'audit', 'announcements'])
      );
      addNavGroup(
        'Incident Management',
        window.INCIDENT_MANAGEMENT_NAVIGATION.forRole(session.role)
      );
      visibleNavItems.filter((n) => n[0] === 'inbox').forEach(addNavLink);
      if (session.role === 'ADMIN') {
        addNavGroup(
          'Manage Accounts',
          groupItems(['accounts', 'account-requests', 'account-settings'])
        );
      }
      visibleNavItems
        .filter(
          (n) =>
            !['dashboard', 'inbox'].includes(n[0]) && !groupedItems.has(n[0])
        )
        .forEach(addNavLink);
    } else {
      addNavGroup('Forms', formItems, true);
      addNavGroup(
        'Incident Management',
        window.INCIDENT_MANAGEMENT_NAVIGATION.forRole(session.role)
      );
      visibleNavItems.forEach(addNavLink);
    }
    $('nav').addEventListener('scroll', positionNavigationNotificationDots, {
      passive: true
    });
    window.addEventListener('resize', positionNavigationNotificationDots);
    $('menuBtn').onclick = () => document.body.classList.toggle('open');
    $('logoutBtn').onclick = async () => {
      const finishLoading = AppLoading.begin();
      try {
        const response = await fetch(API_BASE + '/logout', {
          method: 'POST',
          credentials: 'include'
        });
        if (!response.ok) throw new Error('Sign out failed.');
        location.reload();
      } catch (error) {
        showErr(error.message || String(error));
      } finally {
        finishLoading();
      }
    };
    if (session.perms.includes('inbox.read')) {
      window
        .refreshInboxBadge()
        .catch((error) => showErr(error.message || String(error)));
      window.setInterval(() => {
        if (!document.hidden)
          window
            .refreshInboxBadge()
            .catch((error) => showErr(error.message || String(error)));
      }, 60000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden)
          window
            .refreshInboxBadge()
            .catch((error) => showErr(error.message || String(error)));
        if (!document.hidden)
          window
            .refreshIncidentBadges()
            .catch((error) => showErr(error.message || String(error)));
      });
      window
        .refreshIncidentBadges()
        .catch((error) => showErr(error.message || String(error)));
      window.setInterval(() => {
        if (!document.hidden)
          window
            .refreshIncidentBadges()
            .catch((error) => showErr(error.message || String(error)));
      }, 60000);
      window
        .showPendingAnnouncements()
        .catch((error) => showErr(error.message || String(error)));
      window.setInterval(() => {
        if (!document.hidden)
          window
            .showPendingAnnouncements()
            .catch((error) => showErr(error.message || String(error)));
      }, 60000);
    }
    if (isFormSubmitter) {
      go(USER_NAV[0]);
      if (isHead) {
        window
          .refreshSubmittedFormsBadge('ALL')
          .catch((error) => showErr(error.message || String(error)));
        window.setInterval(() => {
          if (!document.hidden)
            window
              .refreshSubmittedFormsBadge('ALL')
              .catch((error) => showErr(error.message || String(error)));
        }, 60000);
      }
      return;
    }
    $('applyBtn').onclick = loadDashboard;
    $('resetBtn').onclick = () => {
      $('filters').reset();
      loadDashboard();
    };
    buildKpiAndChartShells();
    if (session.perms.includes('dash.view')) {
      await loadOptions();
      go(NAV[0]);
    }
    if (session.perms.includes('forms.review')) {
      const reviewBadgeScope = 'ALL';
      window
        .refreshSubmittedFormsBadge(reviewBadgeScope)
        .catch((error) => showErr(error.message || String(error)));
      window.setInterval(() => {
        if (!document.hidden)
          window
            .refreshSubmittedFormsBadge(reviewBadgeScope)
            .catch((error) => showErr(error.message || String(error)));
      }, 60000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden)
          window
            .refreshSubmittedFormsBadge(reviewBadgeScope)
            .catch((error) => showErr(error.message || String(error)));
      });
    }
  } catch (e) {
    showLogin(e.message || String(e), true);
  }
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
  let feedback = message;
  let feedbackIsError = isError;
  const render = () => {
    card.replaceChildren();
    const title = document.createElement('h1');
    title.textContent = 'HR Management System';
    card.append(title);
    const email = addLoginInput(
      card,
      'Email',
      'email',
      'email',
      'username',
      true
    );
    const password = addLoginInput(
      card,
      'Password',
      'password',
      'password',
      'current-password',
      true
    );
    if (feedback)
      AppFeedback.show(feedback, feedbackIsError ? 'error' : 'success');
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Sign in';
    card.appendChild(submit);

    card.onsubmit = async (event) => {
      event.preventDefault();
      submit.disabled = true;
      const finishLoading = AppLoading.begin();
      try {
        const response = await fetch(API_BASE + '/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.value, password: password.value })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Sign in failed.');
        location.reload();
        return;
      } catch (cause) {
        AppErrors.show(cause.message || String(cause));
        feedbackIsError = true;
      } finally {
        submit.disabled = false;
        finishLoading();
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
  AppLoading.refresh();
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
  document.body.classList.remove('open');
  showErr('');
  document
    .querySelectorAll('#nav a')
    .forEach((a) => a.classList.toggle('on', a.dataset.id === n[0]));
  document.querySelectorAll('#nav .nav-group').forEach((group) => {
    const containsActiveLink = Boolean(
      group.querySelector(`a[data-id="${n[0]}"]`)
    );
    group.classList.toggle('has-active', containsActiveLink);
    if (containsActiveLink) group.open = true;
  });
  $('title').textContent = n[0] === 'accounts' ? 'Manage Accounts' : n[1];
  document.querySelectorAll('.view').forEach((v) => (v.hidden = true));
  if (n[0] === 'dashboard') {
    $('view-dashboard').hidden = false;
    loadDashboard();
  } else if (window.VIEWS && VIEWS[n[0]]) {
    $('view-' + n[0]).hidden = false;
    VIEWS[n[0]]();
  } else {
    $('view-soon').hidden = false;
    $('soonMsg').textContent =
      n[1] + ' will be available in the next development stage.';
  }
  AppLoading.refresh();
}

function setSubmittedFormsCount(count, scope = 'HR') {
  const badge = $('hr-review-count');
  if (!badge) return;
  const pending = Number(count) || 0;
  badge.textContent = pending > 99 ? '99+' : String(pending);
  badge.hidden = pending === 0;
  updateFormsNotificationDot();
  const link = badge.parentElement;
  link.setAttribute('aria-label', `Manage Forms, ${pending} pending`);
  link.title = `${pending} pending form${pending === 1 ? '' : 's'}`;
}

function setInboxCount(count) {
  const badge = $('inbox-count');
  if (!badge) return;
  const unseen = Number(count) || 0;
  badge.textContent = unseen > 99 ? '99+' : String(unseen);
  badge.hidden = unseen === 0;
  const link = badge.parentElement;
  link.setAttribute(
    'aria-label',
    `Inbox, ${unseen} unseen item${unseen === 1 ? '' : 's'}`
  );
  link.title = `${unseen} unseen inbox item${unseen === 1 ? '' : 's'}`;
}

async function refreshInboxBadge() {
  setInboxCount(await api('getInboxNotificationCount'));
}
window.refreshInboxBadge = refreshInboxBadge;

async function loadOptions() {
  const o = await api('getFilterOptions');
  FILTER_KEYS.forEach((k) => {
    const s = $('f_' + k);
    s.innerHTML = '';
    ['All'].concat(o[k]).forEach((v, i) => {
      const op = document.createElement('option');
      op.value = i ? v : '';
      op.textContent = v;
      s.appendChild(op);
    });
  });
}

function getFilters() {
  const f = {};
  ['dateFrom', 'dateTo'].concat(FILTER_KEYS).forEach((k) => {
    const v = $('f_' + k).value;
    if (v) f[k] = v;
  });
  return f;
}

function buildKpiAndChartShells() {
  $('kpis').innerHTML = '';
  $('charts').innerHTML = '';
  KPIS.forEach((k) => {
    const d = document.createElement('div');
    d.className = 'kpi ' + (k[2] || '');
    d.innerHTML = '<b id="k_' + k[0] + '">–</b><span>' + k[1] + '</span>';
    $('kpis').appendChild(d);
  });
  CHARTS.forEach((c) => {
    const p = document.createElement('div');
    p.className = 'panel';
    p.innerHTML =
      '<h2>' +
      c[1] +
      '</h2><div class="chartbox"><canvas id="c_' +
      c[0] +
      '" role="img" aria-label="' +
      c[1] +
      '"></canvas></div><p class="note" id="n_' +
      c[0] +
      '"></p>';
    $('charts').appendChild(p);
  });
}

async function loadDashboard() {
  const finishLoading = AppLoading.begin();
  showErr('');
  try {
    render(await api('getDashboard', getFilters()));
  } catch (e) {
    showErr(e.message || String(e));
  } finally {
    finishLoading();
  }
}

function render(d) {
  KPIS.forEach((k) => {
    const v = d.kpis[k[0]];
    $('k_' + k[0]).textContent = v === null || v === undefined ? 'n/a' : v;
  });
  CHARTS.forEach((c) => {
    const data = d.charts[c[3]],
      box = $('c_' + c[0]);
    if (charts[c[0]]) charts[c[0]].destroy();
    $('n_' + c[0]).textContent = data.length
      ? ''
      : 'No records match the selected filters.';
    if (!data.length) return;
    const horizontal =
      c[2] === 'bar' && ['company', 'department', 'location'].includes(c[0]);
    charts[c[0]] = new Chart(box, {
      type: c[2],
      data: {
        labels: data.map((x) =>
          c[0] === 'hiringTrend' ? DateUtils.formatMonth(x.label) : x.label
        ),
        datasets: [
          {
            data: data.map((x) => x.value),
            backgroundColor:
              c[2] === 'line'
                ? '#f6a53a'
                : c[2] === 'doughnut'
                  ? PALETTE
                  : '#6b2638',
            borderColor: '#f6a53a',
            tension: 0.25
          }
        ]
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: c[2] === 'doughnut', position: 'bottom' }
        },
        scales:
          c[2] === 'doughnut'
            ? {}
            : { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  });
  $('obs').innerHTML = '';
  d.observations.forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    $('obs').appendChild(li);
  });
  $('asof').textContent =
    'Reporting date ' +
    DateUtils.formatDate(d.asOf) +
    ' · new hires counted from ' +
    DateUtils.formatDate(d.from);
  const q = d.quality,
    box = $('quality');
  box.innerHTML = '';
  if (q.overallPct === null) {
    box.textContent = 'No records to assess.';
    return;
  }
  const row = (l, p) => {
    const w = document.createElement('div');
    w.innerHTML =
      '<div class="q"><span></span><span>' +
      p +
      '%</span></div><div class="bar"><i style="width:' +
      p +
      '%"></i></div>';
    w.querySelector('span').textContent = l;
    box.appendChild(w);
  };
  row('Overall completeness', q.overallPct);
  q.lowestFields.forEach((x) => row(x.label, x.pct));
  const g = document.createElement('p');
  g.className = 'note';
  g.textContent =
    q.govInfoComplete +
    ' employee(s) have complete government information; ' +
    q.govInfoIncomplete +
    ' do not.';
  box.appendChild(g);
}
window.initializeDashboard = init;
