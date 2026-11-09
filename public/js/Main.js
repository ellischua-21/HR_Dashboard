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
const apiBackground = async (fn, ...args) => {
  const response = await fetch(API_BASE + '/' + encodeURIComponent(fn), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed.');
  return result;
};
const api = (fn, ...args) => AppLoading.run(() => apiBackground(fn, ...args));
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
  ['company', 'Headcount By Company', 'bar', 'company'],
  ['department', 'Headcount By Department', 'bar', 'department'],
  ['location', 'Headcount By Work Location', 'bar', 'location'],
  ['status', 'Employment Status', 'doughnut', 'status'],
  ['gender', 'Gender Distribution', 'doughnut', 'gender'],
  ['age', 'Age Groups', 'bar', 'age'],
  ['education', 'Education Level', 'bar', 'education'],
  ['rank', 'Employee Rank', 'bar', 'rank'],
  ['functionType', 'Function Type', 'bar', 'functionType'],
  ['tenure', 'Tenure Distribution', 'bar', 'tenure'],
  ['hiringTrend', 'Monthly Hiring Trend', 'line', 'hiringTrend']
];
const KPIS = [
  ['headcount', 'Total Headcount', 'hero'],
  ['fte', 'Full-Time Equivalent (FTE)', 'hero'],
  ['active', 'Active Employees'],
  ['inactive', 'Inactive Employees'],
  ['newHires', 'New Hires (Period)'],
  ['resigned', 'Resigned Employees'],
  ['avgTenureYears', 'Average Tenure (Years)'],
  ['companies', 'Companies'],
  ['departments', 'Departments'],
  ['locations', 'Work Locations']
];
// Navigation: [id, label, permission]. Visibility only; the server enforces every permission.
const NAV = [
  ['dashboard', 'Dashboard', 'dash.view'],
  ['inbox', 'Inbox', 'inbox.read'],
  ['employees', 'Employee Master List', 'emp.read'],
  ['register', 'Employee Registration', 'emp.write'],
  ['attendance', 'Attendance', 'emp.read'],
  ['executive', 'Executive Summary', 'exec.view'],
  ['reports', 'HR Reports', 'report.run'],
  ['hr-performance', 'HR Performance', 'admin.manage'],
  ['audit', 'Audit Logs', 'audit.read'],
  ['announcements', 'Create Announcement', 'announcements.manage'],
  ['accounts', 'Accounts', 'admin.manage'],
  ['account-requests', 'Account Requests', 'admin.manage'],
  ['account-settings', 'Change Password', 'account.password']
];
const USER_NAV = [
  ['employee-dashboard', 'Dashboard', 'employee.self'],
  ['user-dashboard', 'Submitted Forms', 'forms.self'],
  ['inbox', 'Inbox', 'inbox.read'],
  ['user-forms', 'Forms', 'forms.self'],
  ['account-settings', 'Change Password', 'account.password']
];
const FORM_NAV = [
  ['user-forms', 'Fill Out', 'forms.self'],
  ['user-dashboard', 'My Submissions', 'forms.self'],
  ['leave-requests', 'Review Requests', 'forms.review']
];
const PALETTE = [
  '#c86b4b',
  '#6b8e23',
  '#a75b43',
  '#9b855e',
  '#d19b6f',
  '#4f6240',
  '#c88f7e',
  '#79685b'
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
    const isFormSubmitter = ['STAFF', 'SUPERVISOR', 'HEAD'].includes(
      session.role
    );
    const isHead = ['SUPERVISOR', 'HEAD'].includes(session.role);
    const navItems = isFormSubmitter
      ? USER_NAV.filter(
          (item) => !['user-dashboard', 'user-forms'].includes(item[0])
        )
      : session.role === 'ADMIN'
        ? NAV.filter((item) => item[0] !== 'dashboard').map((item) =>
            item[0] === 'hr-performance'
              ? [item[0], 'Dashboard', item[2]]
              : item
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
    const canViewForms = session.perms.some((permission) =>
      ['forms.review', 'forms.view'].includes(permission)
    );
    const formItems = FORM_NAV.filter((n) =>
      n[0] === 'leave-requests' ? canViewForms : session.perms.includes(n[2])
    ).map((item) =>
      session.role === 'ADMIN' && item[0] === 'leave-requests'
        ? [item[0], 'View Forms', 'forms.view']
        : item
    );
    const visibleNavItems = navItems.filter((n) =>
      session.perms.includes(n[2])
    );
    const isHrAdmin = ['HR', 'ADMIN'].includes(session.role);
    if (isHrAdmin) {
      const landingId =
        session.role === 'ADMIN' ? 'hr-performance' : 'dashboard';
      visibleNavItems.filter((n) => n[0] === landingId).forEach(addNavLink);
      addNavGroup('Forms', formItems, true);

      const groupedItems = new Set([
        'employees',
        'register',
        'attendance',
        'executive',
        'hr-performance',
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
        window.INCIDENT_MANAGEMENT_NAVIGATION.forRole(
          session.role,
          session.is_hr_head
        )
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
      visibleNavItems
        .filter((n) => n[0] === 'employee-dashboard')
        .forEach(addNavLink);
      addNavGroup('Forms', formItems, true);
      addNavGroup(
        'Incident Management',
        window.INCIDENT_MANAGEMENT_NAVIGATION.forRole(
          session.role,
          session.is_hr_head
        )
      );
      visibleNavItems
        .filter((n) => n[0] !== 'employee-dashboard')
        .forEach(addNavLink);
    }
    $('nav').addEventListener('scroll', positionNavigationNotificationDots, {
      passive: true
    });
    window.addEventListener('resize', positionNavigationNotificationDots);
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
    if (session.role === 'ADMIN') {
      go(['hr-performance', 'Dashboard', 'admin.manage']);
    } else if (session.perms.includes('dash.view')) {
      await loadOptions();
      go(NAV[0]);
    }
    if (
      session.perms.some((permission) =>
        ['forms.review', 'forms.view'].includes(permission)
      )
    ) {
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
  if (
    session.role === 'ADMIN' &&
    ['dashboard', 'hr-performance'].includes(n[0])
  ) {
    n = ['hr-performance', 'Dashboard', 'admin.manage'];
  }
  if (n[0] === 'executive' && !can('exec.view')) return;
  window.AttendanceUI?.closeAll();
  window.AppOutsideDismiss.closeSidebar();
  showErr('');
  document
    .querySelectorAll('#nav a')
    .forEach((a) => a.classList.toggle('on', a.dataset.id === n[0]));
  document.querySelectorAll('#nav .nav-group').forEach((group) => {
    const containsActiveLink = Boolean(
      group.querySelector(`a[data-id="${n[0]}"]`)
    );
    group.classList.toggle('has-active', containsActiveLink);
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
  link.setAttribute(
    'aria-label',
    `${session.role === 'ADMIN' ? 'View Forms' : 'Review Requests'}, ${pending} pending`
  );
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
                ? '#6b8e23'
                : c[2] === 'doughnut'
                  ? PALETTE
                  : '#c86b4b',
            borderColor: '#6b8e23',
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
