let OPTS = null, RP = { page: 1, sortCol: -1, sortDir: 'asc' }, xch = {};
const ALLF = [['company', 'All companies'], ['department', 'All departments'], ['location', 'All locations'], ['status', 'All statuses'], ['rank', 'All ranks'], ['function_type', 'All function types']];
async function ensureOpts() { if (!OPTS) OPTS = await api('getFilterOptions'); }
function buildFilters(id, keys) {
  const box = $(id); if (box.childElementCount) return;
  keys.forEach(([k, all]) => { const s = el('select'); s.dataset.k = k; s.setAttribute('aria-label', all); [all].concat(OPTS[k]).forEach((v, i) => { const o = el('option', v); o.value = i ? v : ''; s.appendChild(o); }); box.appendChild(s); });
  [['dateFrom', 'From'], ['dateTo', 'To']].forEach(([k, t]) => { const l = el('label', t), i = el('input'); i.type = 'date'; i.dataset.k = k; l.appendChild(i); box.appendChild(l); });
}
const readF = id => { const f = {}; $(id).querySelectorAll('[data-k]').forEach(i => { if (i.value) f[i.dataset.k] = i.value; }); return f; };

/* ---------- Reports ---------- */
VIEWS.reports = guard(async () => {
  await ensureOpts(); buildFilters('rp_filters', ALLF);
  if (!$('rp_id').options.length) (await api('listReports')).forEach(r => { const o = el('option', r.title); o.value = r.id; $('rp_id').appendChild(o); });
  $('rp_export').hidden = !can('emp.export'); RP.page = 1; RP.sortCol = -1; await runRep();
});
async function runRep() {
  const r = await api('runReport', $('rp_id').value, readF('rp_filters'), { page: RP.page, pageSize: 100, sortCol: RP.sortCol, sortDir: RP.sortDir });
  const h = $('rp_head'); h.innerHTML = ''; const tr = el('tr');
  r.columns.forEach((c, i) => { const th = el('th', c + (RP.sortCol === i ? (RP.sortDir === 'asc' ? ' ▲' : ' ▼') : '')); th.onclick = guard(async () => { RP.sortDir = RP.sortCol === i && RP.sortDir === 'asc' ? 'desc' : 'asc'; RP.sortCol = i; await runRep(); }); tr.appendChild(th); });
  h.appendChild(tr); const b = $('rp_body'); b.innerHTML = '';
  if (!r.rows.length) { const t = el('tr'), d = el('td', 'No records for this report and filter selection.'); d.colSpan = r.columns.length; t.appendChild(d); b.appendChild(t); }
  r.rows.forEach(row => { const t = el('tr'); row.forEach(v => t.appendChild(el('td', v === null || v === undefined ? '' : v))); b.appendChild(t); });
  const last = Math.max(1, Math.ceil(r.total / r.pageSize));
  $('rp_info').textContent = r.title + ': ' + r.total + ' row(s) · page ' + r.page + ' of ' + last; $('rp_prev').disabled = r.page <= 1; $('rp_next').disabled = r.page >= last;
}
$('rp_run').onclick = guard(async () => { RP.page = 1; RP.sortCol = -1; await runRep(); });
$('rp_id').onchange = $('rp_run').onclick;
$('rp_prev').onclick = guard(async () => { RP.page--; await runRep(); }); $('rp_next').onclick = guard(async () => { RP.page++; await runRep(); });
$('rp_print').onclick = () => window.print();
$('rp_export').onclick = guard(async () => { const r = await api('exportReportCsv', $('rp_id').value, readF('rp_filters')); download(r.filename, r.csv); });

/* ---------- Executive summary (aggregates only) ---------- */
const XC = [['company', 'Headcount by company', 'bar'], ['department', 'Headcount by department', 'bar'], ['location', 'Headcount by work location', 'bar'], ['status', 'Employment status', 'doughnut'], ['age', 'Age groups', 'bar'], ['tenure', 'Tenure distribution', 'bar'], ['hiringTrend', 'Monthly hiring trend', 'line']];
const XK = [['headcount', 'Total workforce'], ['active', 'Active workforce'], ['fte', 'FTE'], ['newHires', 'New hires'], ['resigned', 'Resigned (status-based)'], ['avgTenureYears', 'Average tenure (years)']];
function drawChart(id, type, data, horizontal) {
  if (xch[id]) xch[id].destroy(); if (!data.length) return;
  xch[id] = new Chart($(id), { type: type, data: { labels: data.map(x => x.label), datasets: [{ data: data.map(x => x.value), backgroundColor: type === 'doughnut' ? PALETTE : '#6b2638', borderColor: '#f6a53a', tension: .25 }] },
    options: { indexAxis: horizontal ? 'y' : 'x', responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: type === 'doughnut', position: 'bottom' } }, scales: type === 'doughnut' ? {} : { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
}
VIEWS.executive = guard(async () => {
  await ensureOpts(); buildFilters('ex_filters', [ALLF[0], ALLF[1]]);
  if (!$('ex_charts').childElementCount) XC.forEach(c => { const p = el('div', undefined, 'panel'); p.appendChild(el('h2', c[1])); const b = el('div', undefined, 'chartbox'), cv = el('canvas'); cv.id = 'x_' + c[0]; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', c[1]); b.appendChild(cv); p.appendChild(b); $('ex_charts').appendChild(p); });
  await loadExec();
});
async function loadExec() {
  const d = await api('getExecutiveSummary', readF('ex_filters')), c = d.current;
  $('ex_period').textContent = 'Reporting date ' + c.asOf + ' · compared with ' + d.prior.asOf;
  const k = $('ex_kpis'); k.innerHTML = '';
  XK.forEach(([key, label], i) => {
    const v = c.kpis[key], p = d.prior.kpis[key], box = el('div', undefined, 'kpi' + (i < 2 ? ' hero' : ''));
    box.appendChild(el('b', v === null ? 'n/a' : v)); box.appendChild(el('span', label));
    const delta = (v !== null && p !== null && p !== undefined) ? ' · prior year ' + p + ' (' + (v - p >= 0 ? '+' : '') + Math.round((v - p) * 100) / 100 + ')' : ' · no prior-year data';
    box.appendChild(el('div', delta.slice(3), 'note')); k.appendChild(box);
  });
  XC.forEach(x => drawChart('x_' + x[0], x[2], c.charts[x[0]], x[2] === 'bar' && ['company', 'department', 'location'].includes(x[0])));
  const t = $('ex_tables'); t.innerHTML = '';
  [['company', 'By company'], ['department', 'By department'], ['location', 'By work location']].forEach(([key, title]) => {
    const p = el('div', undefined, 'panel'); p.appendChild(el('h2', title)); const tb = el('table');
    c.charts[key].forEach(x => { const r = el('tr'); r.appendChild(el('td', x.label)); r.appendChild(el('td', x.value)); r.appendChild(el('td', c.kpis.headcount ? Math.round(x.value / c.kpis.headcount * 1000) / 10 + '%' : '')); tb.appendChild(r); });
    p.appendChild(tb); t.appendChild(p);
  });
  const n = $('ex_notes'); n.innerHTML = ''; c.observations.concat(d.notes).forEach(s => n.appendChild(el('li', s)));
  [['Employee movement trends', d.pending.movement], ['Absenteeism and absence cost', d.pending.absence], ['Manpower requests', d.pending.manpower], ['Disciplinary summaries', d.pending.disciplinary]].forEach(([a, b]) => n.appendChild(el('li', a + ': available in ' + b + '.')));
}
$('ex_run').onclick = guard(loadExec); $('ex_print').onclick = () => window.print();

/* ---------- Audit logs ---------- */
VIEWS.audit = guard(async () => {
  const rows = await api('getAuditLogs', 300), b = $('au_body'); b.innerHTML = '';
  rows.forEach(r => { const t = el('tr'); r.forEach(v => t.appendChild(el('td', v))); b.appendChild(t); });
  if (!rows.length) { const t = el('tr'), d = el('td', 'No audit events yet.'); d.colSpan = 5; t.appendChild(d); b.appendChild(t); }
});