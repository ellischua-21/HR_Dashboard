let OPTS = null,
  RP = { sortCol: -1, sortDir: 'asc' },
  xch = {};
const ALLF = [
  ['company', 'All Companies'],
  ['department', 'All Departments'],
  ['location', 'All Locations'],
  ['status', 'All Statuses'],
  ['rank', 'All Ranks'],
  ['function_type', 'All Function Types']
];
async function ensureOpts() {
  if (!OPTS) OPTS = await api('getFilterOptions');
}
function buildFilters(id, keys) {
  const box = $(id);
  if (box.childElementCount) return;
  keys.forEach(([k, all]) => {
    const s = el('select');
    s.dataset.k = k;
    s.setAttribute('aria-label', all);
    [all].concat(OPTS[k]).forEach((v, i) => {
      const o = el('option', v);
      o.value = i ? v : '';
      s.appendChild(o);
    });
    box.appendChild(s);
  });
  [
    ['dateFrom', 'From'],
    ['dateTo', 'To']
  ].forEach(([k, t]) => {
    const l = el('label', t),
      i = el('input');
    i.type = 'date';
    i.dataset.k = k;
    l.appendChild(i);
    box.appendChild(l);
  });
}
const readF = (id) => {
  const f = {};
  $(id)
    .querySelectorAll('[data-k]')
    .forEach((i) => {
      if (i.value) f[i.dataset.k] = i.value;
    });
  return f;
};

/* ---------- Reports ---------- */
VIEWS.reports = guard(async () => {
  await ensureOpts();
  buildFilters('rp_filters', ALLF);
  if (!$('rp_id').options.length)
    (await api('listReports')).forEach((r) => {
      const o = el('option', r.title);
      o.value = r.id;
      $('rp_id').appendChild(o);
    });
  $('rp_export').hidden = !can('emp.export');
  RP.sortCol = -1;
  await runRep();
});
async function runRep() {
  const r = await api('runReport', $('rp_id').value, readF('rp_filters'), {
    allRows: true,
    sortCol: RP.sortCol,
    sortDir: RP.sortDir
  });
  const h = $('rp_head');
  h.innerHTML = '';
  const tr = el('tr');
  const isMaster =
    $('rp_id').value === 'master' && r.columnKeys?.[0] === 'record_id';
  const table = h.closest('table');
  table.classList.toggle('report-table-master', isMaster);
  table.querySelector('colgroup')?.remove();
  const columns = document.createElement('colgroup');
  const widths = r.columns.map((_, index) =>
    isMaster && index === 0
      ? 120
      : isMaster && index === 1
        ? 72
        : isMaster && index === 2
          ? 200
          : 180
  );
  if (isMaster) widths.unshift(48);
  widths.forEach((width) => {
    const column = document.createElement('col');
    column.style.width = `${width}px`;
    columns.appendChild(column);
  });
  table.style.width = `${widths.reduce((total, width) => total + width, 0)}px`;
  table.insertBefore(columns, table.firstChild);
  if (isMaster) {
    const th = el('th');
    th.scope = 'col';
    th.setAttribute('aria-label', 'Employee details');
    tr.appendChild(th);
  }
  r.columns.forEach((c, i) => {
    const th = el(
      'th',
      c + (RP.sortCol === i ? (RP.sortDir === 'asc' ? ' ▲' : ' ▼') : '')
    );
    th.onclick = guard(async () => {
      RP.sortDir = RP.sortCol === i && RP.sortDir === 'asc' ? 'desc' : 'asc';
      RP.sortCol = i;
      await runRep();
    });
    tr.appendChild(th);
  });
  h.appendChild(tr);
  const b = $('rp_body');
  b.innerHTML = '';
  if (!r.rows.length) {
    const t = el('tr'),
      d = el('td', 'No records for this report and filter selection.');
    d.colSpan = r.columns.length + (isMaster ? 1 : 0);
    t.appendChild(d);
    b.appendChild(t);
  }
  r.rows.forEach((row) => {
    const t = el('tr');
    if (isMaster) {
      const cell = el('td');
      const button = el('button', '▾', 'ghost report-details-toggle');
      button.type = 'button';
      button.setAttribute(
        'aria-label',
        `View details for ${row[r.columnKeys.indexOf('name')] || row[0]}`
      );
      button.onclick = guard(() => showEmployeeDetails(r, row));
      cell.appendChild(button);
      t.appendChild(cell);
    }
    row.forEach((v, index) =>
      t.appendChild(
        el(
          'td',
          v === null || v === undefined
            ? ''
            : formatReportValue(
                v,
                r.columnTypes?.[index],
                r.columnKeys?.[index]
              )
        )
      )
    );
    b.appendChild(t);
  });
  $('rp_info').textContent = r.title + ': ' + r.total + ' row(s)';
}
$('rp_run').onclick = guard(async () => {
  RP.sortCol = -1;
  await runRep();
});
$('rp_id').onchange = $('rp_run').onclick;
$('rp_print').onclick = () => window.print();
$('rp_export').onclick = guard(async () => {
  const r = await api('exportReportCsv', $('rp_id').value, readF('rp_filters'));
  download(r.filename, r.csv);
});

/* ---------- Executive summary (aggregates only) ---------- */
const XC = [
  ['company', 'Headcount By Company', 'bar'],
  ['department', 'Headcount By Department', 'bar'],
  ['location', 'Headcount By Work Location', 'bar'],
  ['status', 'Employment Status', 'doughnut'],
  ['age', 'Age Groups', 'bar'],
  ['tenure', 'Tenure Distribution', 'bar'],
  ['hiringTrend', 'Monthly Hiring Trend', 'line']
];
const XK = [
  ['headcount', 'Total Workforce'],
  ['active', 'Active Workforce'],
  ['fte', 'FTE'],
  ['newHires', 'New Hires'],
  ['resigned', 'Resigned (Status-Based)'],
  ['avgTenureYears', 'Average Tenure (Years)']
];
function drawChart(id, type, data, horizontal) {
  if (xch[id]) xch[id].destroy();
  if (!data.length) return;
  xch[id] = new Chart($(id), {
    type: type,
    data: {
      labels: data.map((x) =>
        id === 'hiringTrend' ? DateUtils.formatMonth(x.label) : x.label
      ),
      datasets: [
        {
          data: data.map((x) => x.value),
          backgroundColor: type === 'doughnut' ? PALETTE : '#c86b4b',
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
      plugins: { legend: { display: type === 'doughnut', position: 'bottom' } },
      scales:
        type === 'doughnut'
          ? {}
          : { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}
VIEWS.executive = guard(async () => {
  await ensureOpts();
  buildFilters('ex_filters', [ALLF[0], ALLF[1]]);
  if (!$('ex_charts').childElementCount)
    XC.forEach((c) => {
      const p = el('div', undefined, 'panel');
      p.appendChild(el('h2', c[1]));
      const b = el('div', undefined, 'chartbox'),
        cv = el('canvas');
      cv.id = 'x_' + c[0];
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', c[1]);
      b.appendChild(cv);
      p.appendChild(b);
      $('ex_charts').appendChild(p);
    });
  await loadExec();
});
async function loadExec() {
  const d = await api('getExecutiveSummary', readF('ex_filters')),
    c = d.current;
  $('ex_period').textContent =
    'Reporting date ' +
    DateUtils.formatDate(c.asOf) +
    ' · compared with ' +
    DateUtils.formatDate(d.prior.asOf);
  const k = $('ex_kpis');
  k.innerHTML = '';
  XK.forEach(([key, label], i) => {
    const v = c.kpis[key],
      p = d.prior.kpis[key],
      box = el('div', undefined, 'kpi' + (i < 2 ? ' hero' : ''));
    box.appendChild(el('b', v === null ? 'n/a' : v));
    box.appendChild(el('span', label));
    const delta =
      v !== null && p !== null && p !== undefined
        ? ' · prior year ' +
          p +
          ' (' +
          (v - p >= 0 ? '+' : '') +
          Math.round((v - p) * 100) / 100 +
          ')'
        : ' · no prior-year data';
    box.appendChild(el('div', delta.slice(3), 'note'));
    k.appendChild(box);
  });
  XC.forEach((x) =>
    drawChart(
      'x_' + x[0],
      x[2],
      c.charts[x[0]],
      x[2] === 'bar' && ['company', 'department', 'location'].includes(x[0])
    )
  );
  const t = $('ex_tables');
  t.innerHTML = '';
  [
    ['company', 'By Company'],
    ['department', 'By Department'],
    ['location', 'By Work Location']
  ].forEach(([key, title]) => {
    const p = el('div', undefined, 'panel');
    p.appendChild(el('h2', title));
    const tb = el('table');
    const thead = el('thead');
    const headings = el('tr');
    [
      key === 'location' ? 'Work Location' : FormStatus.titleCase(key),
      'Headcount',
      'Percentage'
    ].forEach((label) => headings.appendChild(el('th', label)));
    thead.appendChild(headings);
    const tbody = el('tbody');
    tb.append(thead, tbody);
    c.charts[key].forEach((x) => {
      const r = el('tr');
      r.appendChild(el('td', x.label));
      r.appendChild(el('td', x.value));
      r.appendChild(
        el(
          'td',
          c.kpis.headcount
            ? Math.round((x.value / c.kpis.headcount) * 1000) / 10 + '%'
            : ''
        )
      );
      tbody.appendChild(r);
    });
    const wrap = el('div', undefined, 'tablewrap');
    wrap.appendChild(tb);
    p.appendChild(wrap);
    t.appendChild(p);
  });
  const n = $('ex_notes');
  n.innerHTML = '';
  c.observations.concat(d.notes).forEach((s) => n.appendChild(el('li', s)));
  [
    ['Employee movement trends', d.pending.movement],
    ['Absenteeism and absence cost', d.pending.absence],
    ['Manpower requests', d.pending.manpower],
    ['Disciplinary summaries', d.pending.disciplinary]
  ].forEach(([a, b]) =>
    n.appendChild(el('li', a + ': available in ' + b + '.'))
  );
}
$('ex_run').onclick = guard(loadExec);
$('ex_print').onclick = () => window.print();

/* ---------- Audit logs ---------- */
async function loadAuditLogs() {
  const filters = {
    allRows: true,
    from: $('au_from').value,
    to: $('au_to').value,
    user: $('au_user').value.trim()
  };
  const rows = await api('getAuditLogs', 300, filters),
    b = $('au_body');
  b.innerHTML = '';
  rows.forEach((r) => {
    const t = el('tr');
    r.forEach((v, index) =>
      t.appendChild(el('td', index === 0 ? DateUtils.formatDateTime(v) : v))
    );
    b.appendChild(t);
  });
  if (!rows.length) {
    const t = el('tr'),
      d = el('td', 'No audit events match these filters.');
    d.colSpan = 5;
    t.appendChild(d);
    b.appendChild(t);
  }
}
VIEWS.audit = guard(loadAuditLogs);
$('au_apply').onclick = guard(loadAuditLogs);
$('au_clear').onclick = guard(async () => {
  $('au_from').value = '';
  $('au_to').value = '';
  $('au_user').value = '';
  await loadAuditLogs();
});

/* ---------- Inbox ---------- */
let inboxItems = [];

async function loadInbox() {
  setInboxCount(0);
  await api('markInboxSeen');
  inboxItems = await api('getInbox');
  renderInbox();
  await refreshInboxBadge();
}

function renderInbox() {
  const items = $('inbox-items');
  const type = $('inbox-type-filter').value;
  const status = $('inbox-status-filter').value;
  const visibleItems = inboxItems.filter(
    (item) =>
      (!type || item.type === type) && (!status || item.status === status)
  );
  items.replaceChildren();
  $('inbox-empty').hidden = visibleItems.length > 0;

  visibleItems.forEach((item) => {
    const card = el('article', undefined, 'announcement-card inbox-card');
    const heading = el('div', undefined, 'inbox-heading');
    heading.appendChild(el('h3', item.title));
    heading.appendChild(el('span', item.type === 'INCIDENT' ? window.IncidentProgress.label(item.status) : FormStatus.titleCase(item.status), 'badge'));
    card.appendChild(heading);
    card.appendChild(el('p', item.message, 'announcement-message'));
    const detail =
      item.type === 'ANNOUNCEMENT'
        ? `From ${item.createdBy} · ${DateUtils.formatDateTime(item.createdAt)}`
        : `Received ${DateUtils.formatDateTime(item.createdAt)}`;
    card.appendChild(el('p', detail, 'note'));

    if (item.type === 'ANNOUNCEMENT' && item.status === 'NEW') {
      const acknowledge = el('button', 'Acknowledge');
      acknowledge.type = 'button';
      acknowledge.onclick = guard(async () => {
        acknowledge.disabled = true;
        try {
          await api('markAnnouncementsSeen', [item.announcementId]);
          await loadInbox();
        } finally {
          acknowledge.disabled = false;
        }
      });
      card.appendChild(acknowledge);
    } else if (item.type === 'FORM') {
      const formsTitle = session.role === 'ADMIN' ? 'View Forms' : 'Review Requests';
      const target = [
        'leave-requests',
        formsTitle,
        item.reviewPermission,
        true
      ];
      const view = el('button', `View in ${formsTitle}`);
      view.type = 'button';
      view.onclick = () => go(target);
      card.appendChild(view);
    } else if (item.type === 'INCIDENT') {
      const view = el('button', 'Open Incident Report');
      view.type = 'button';
      view.onclick = () =>
        window.openIncidentRoute(
          item.incidentId,
          item.target,
          item.notificationId
        );
      card.appendChild(view);
    }

    items.appendChild(card);
  });
}

VIEWS.inbox = guard(loadInbox);
$('inbox-refresh').onclick = guard(loadInbox);
$('inbox-type-filter').onchange = renderInbox;
$('inbox-status-filter').onchange = renderInbox;

/* ---------- HR announcements ---------- */
async function loadAnnouncementsForManagement() {
  const announcements = await api('listAnnouncementsForManagement');
  const list = $('announcement-list');
  list.replaceChildren();
  if (!announcements.length) {
    list.appendChild(el('p', 'No announcements have been published.'));
    return;
  }
  announcements.forEach((announcement) => {
    const card = el('article', undefined, 'announcement-card');
    card.appendChild(el('h3', announcement.title));
    card.appendChild(el('p', announcement.message, 'announcement-message'));
    card.appendChild(
      el(
        'p',
        `Published by ${announcement.created_by_name} · ${DateUtils.formatDateTime(announcement.created_at)}`,
        'note'
      )
    );
    list.appendChild(card);
  });
}

VIEWS.announcements = guard(loadAnnouncementsForManagement);
$('announcement-create-form').onsubmit = guard(async (event) => {
  event.preventDefault();
  const submit = $('announcement-create-form').querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api(
      'createAnnouncement',
      $('announcement-title').value,
      $('announcement-message').value
    );
    $('announcement-create-form').reset();
    AppFeedback.success('Published successfully.');
    await loadAnnouncementsForManagement();
  } finally {
    submit.disabled = false;
  }
});
