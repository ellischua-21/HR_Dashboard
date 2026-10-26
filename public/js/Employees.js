window.VIEWS = {};
let META = null,
  EQ = { page: 1, sortKey: 'name', sortDir: 'asc' },
  PENDING = null,
  CUR = null,
  IMP = null,
  HEAD_OPTIONS = [];
const SECTIONS = [
  [
    'Personal information',
    [
      'last_name',
      'first_name',
      'middle_name',
      'birthday',
      'age',
      'birth_place',
      'gender',
      'civil_status',
      'education'
    ]
  ],
  [
    'Employment information',
    [
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
    ]
  ],
  [
    'Contact information',
    [
      'address',
      'permanent_address',
      'contact_no',
      'landline_no',
      'personal_email',
      'company_contact_no'
    ]
  ],
  [
    'Family background',
    [
      'father_name',
      'father_occupation',
      'mother_maiden',
      'mother_occupation',
      'siblings',
      'spouse_name',
      'children'
    ]
  ],
  [
    'Church and Organizations/Memberships',
    ['church_has', 'church_position', 'orgs']
  ],
  [
    'Contact in case of emergency',
    [
      'emergency_name',
      'emergency_address',
      'emergency_no',
      'emergency_relationship'
    ]
  ],
  ['Social Media', ['facebook', 'instagram', 'tiktok', 'youtube', 'twitter']],
  [
    'Benefits and government information',
    ['hmo', 'tin', 'pagibig', 'sss', 'philhealth', 'gov_deduction']
  ],
  ['Compensation information', ['salary_structure', 'fte']]
];
const TABLES = {
  siblings: {
    title: 'Siblings',
    count: 'No. of Siblings',
    cols: [
      ['name', 'Name'],
      ['address', 'Address'],
      ['contact', 'Contact No.'],
      ['occupation', 'Occupation']
    ]
  },
  children: {
    title: 'Children',
    count: 'No. of Children',
    cols: [
      ['name', 'Name'],
      ['address', 'Address'],
      ['age', 'Age'],
      ['contact', 'Contact No.']
    ]
  },
  orgs: {
    title: 'Organizations/Memberships',
    count: 'No. of memberships',
    cols: [
      ['org', 'Organization'],
      ['position', 'Position'],
      ['year', 'Year Joined']
    ]
  }
};
let _xl = null; // SheetJS (~900 KB) loads only when an import file is chosen, so the app opens faster
const loadXlsx = () =>
  _xl ||
  (_xl = new Promise((ok, no) => {
    if (window.XLSX) return ok();
    const s = document.createElement('script');
    s.src =
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = ok;
    s.onerror = () => no(new Error('Could not load the Excel reader.'));
    document.head.appendChild(s);
  }));
function rowsTable(k, json) {
  const T = TABLES[k];
  let rows = [];
  try {
    rows = JSON.parse(json || '[]');
  } catch (e) {}
  const w = el('div');
  w.appendChild(el('h3', T.count + ': ' + rows.length));
  if (!rows.length) return w;
  const tb = el('table'),
    h = el('tr');
  T.cols.forEach((c) => h.appendChild(el('th', c[1])));
  tb.appendChild(h);
  rows.forEach((r) => {
    const tr = el('tr');
    T.cols.forEach((c) => tr.appendChild(el('td', r[c[0]] || '')));
    tb.appendChild(tr);
  });
  const tw = el('div', undefined, 'tablewrap');
  tw.appendChild(tb);
  w.appendChild(tw);
  return w;
}
function tableEditor(k, json) {
  const T = TABLES[k],
    wrap = el('div'),
    cnt = el('p', '', 'note'),
    tb = el('table'),
    head = el('tr'),
    body = el('tbody');
  wrap.id = 'ff_' + k;
  T.cols.forEach((c) => head.appendChild(el('th', c[1])));
  head.appendChild(el('th', ''));
  const th = el('thead');
  th.appendChild(head);
  tb.appendChild(th);
  tb.appendChild(body);
  const upd = () => {
    cnt.textContent = T.count + ': ' + body.children.length;
  };
  const add = (r) => {
    const tr = el('tr');
    T.cols.forEach((c) => {
      const td = el('td'),
        i = el('input');
      i.dataset.c = c[0];
      i.value = (r && r[c[0]]) || '';
      i.setAttribute('aria-label', c[1]);
      td.appendChild(i);
      tr.appendChild(td);
    });
    const td = el('td'),
      x = el('button', 'Remove', 'ghost');
    x.type = 'button';
    x.onclick = () => {
      tr.remove();
      upd();
    };
    td.appendChild(x);
    tr.appendChild(td);
    body.appendChild(tr);
    upd();
  };
  let rows = [];
  try {
    rows = JSON.parse(json || '[]');
  } catch (e) {}
  rows.forEach(add);
  const ab = el('button', 'Add row', 'ghost');
  ab.type = 'button';
  ab.onclick = () => add();
  upd();
  wrap.appendChild(el('h3', T.title));
  wrap.appendChild(cnt);
  const w = el('div', undefined, 'tablewrap');
  w.appendChild(tb);
  wrap.appendChild(w);
  wrap.appendChild(ab);
  return wrap;
}
const collect = (k) =>
  Array.from(document.querySelectorAll('#ff_' + k + ' tbody tr'))
    .map((tr) => {
      const o = {};
      tr.querySelectorAll('input').forEach((i) => {
        o[i.dataset.c] = i.value.trim();
      });
      return o;
    })
    .filter((o) => Object.values(o).some(Boolean));
const COLS = [
  ['emp_no', 'Employee no.', 1],
  ['name', 'Name', 1],
  ['company', 'Company', 1],
  ['department', 'Department', 1],
  ['position', 'Position', 1],
  ['status', 'Status', 1],
  ['tenure_years', 'Tenure (yrs)', 0]
];
const el = (t, txt, cls) => {
  const e = document.createElement(t);
  if (txt !== undefined) e.textContent = txt;
  if (cls) e.className = cls;
  return e;
};
const fld = (k) => META.fields.find((f) => f.key === k);
const can = (p) => session.perms.includes(p);
async function ensureMeta() {
  if (!META) META = await api('getFormMeta');
}
function download(name, text) {
  const a = el('a');
  a.href = URL.createObjectURL(
    new Blob(['\ufeff' + text], { type: 'text/csv' })
  );
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
const guard =
  (fn) =>
  async (...a) => {
    try {
      showErr('');
      busy(true);
      await fn(...a);
    } catch (e) {
      showErr(e.message || String(e));
    } finally {
      busy(false);
    }
  };

/* ---------- Employee list ---------- */
VIEWS.employees = guard(async () => {
  $('e_import').hidden = !can('emp.write');
  $('e_add').hidden = !can('emp.write');
  $('e_export').hidden = !can('emp.export');
  const list = loadEmployees(); // start the list right away
  await ensureMeta(); // filter dropdowns load in parallel
  [
    ['company', 'Company_List', 'All companies'],
    ['department', 'Department_List', 'All departments'],
    ['status', 'Employment_Status_List', 'All statuses']
  ].forEach(([k, l, all]) => {
    const s = $('e_' + k);
    if (s.options.length) return;
    [all].concat(META.lists[l]).forEach((v, i) => {
      const o = el('option', v);
      o.value = i ? v : '';
      s.appendChild(o);
    });
  });
  await list;
});
const empFilters = () => {
  const f = {};
  ['company', 'department', 'status'].forEach((k) => {
    if ($('e_' + k).value) f[k] = $('e_' + k).value;
  });
  return f;
};
async function loadEmployees() {
  $('e_body').innerHTML = '<tr><td colspan="7">Loading…</td></tr>';
  const r = await api(
    'listEmployees',
    Object.assign(
      {
        search: $('e_search').value,
        page: EQ.page,
        sortKey: EQ.sortKey,
        sortDir: EQ.sortDir
      },
      empFilters()
    )
  );
  const h = $('e_head');
  h.innerHTML = '';
  const tr = el('tr');
  COLS.forEach((c) => {
    const th = el(
      'th',
      c[1] + (EQ.sortKey === c[0] ? (EQ.sortDir === 'asc' ? ' ▲' : ' ▼') : '')
    );
    if (c[2])
      th.onclick = guard(async () => {
        EQ.sortDir =
          EQ.sortKey === c[0] && EQ.sortDir === 'asc' ? 'desc' : 'asc';
        EQ.sortKey = c[0];
        await loadEmployees();
      });
    tr.appendChild(th);
  });
  h.appendChild(tr);
  const b = $('e_body');
  b.innerHTML = '';
  if (!r.rows.length) {
    const t = el('tr'),
      d = el('td', 'No employees match. Add an employee or import a file.');
    d.colSpan = COLS.length;
    t.appendChild(d);
    b.appendChild(t);
  }
  r.rows.forEach((e) => {
    const t = el('tr');
    COLS.forEach((c) => {
      const d = el('td');
      if (c[0] === 'status')
        d.appendChild(
          el(
            'span',
            e.status,
            'badge ' +
              (['Resigned', 'Terminated', 'Retired', 'Inactive'].includes(
                e.status
              )
                ? 'off'
                : 'ok')
          )
        );
      else d.textContent = e[c[0]] === undefined ? '' : e[c[0]];
      t.appendChild(d);
    });
    t.tabIndex = 0;
    t.onclick = guard(() => showProfile(e.record_id));
    t.onkeydown = (ev) => {
      if (ev.key === 'Enter') t.onclick();
    };
    b.appendChild(t);
  });
  const last = Math.max(1, Math.ceil(r.total / r.pageSize));
  $('e_info').textContent =
    r.total + ' employee(s) · page ' + r.page + ' of ' + last;
  $('e_prev').disabled = r.page <= 1;
  $('e_next').disabled = r.page >= last;
}
$('e_go').onclick = guard(async () => {
  EQ.page = 1;
  await loadEmployees();
});
$('e_search').onkeydown = (e) => {
  if (e.key === 'Enter') $('e_go').onclick();
};
['company', 'department', 'status'].forEach(
  (k) => ($('e_' + k).onchange = $('e_go').onclick)
);
$('e_prev').onclick = guard(async () => {
  EQ.page--;
  await loadEmployees();
});
$('e_next').onclick = guard(async () => {
  EQ.page++;
  await loadEmployees();
});
$('e_add').onclick = () => {
  PENDING = null;
  go(NAV.find((n) => n[0] === 'register'));
};
$('e_export').onclick = guard(async () => {
  const r = await api('exportReportCsv', 'master', empFilters());
  download(r.filename, r.csv);
});

/* ---------- Profile ---------- */
async function showProfile(id) {
  CUR = await api('getEmployee', id);
  const body = $('p_body');
  body.innerHTML = '';
  body.appendChild(el('h2', CUR.name));
  body.appendChild(
    el('p', CUR.position + ' · ' + CUR.department + ' · ' + CUR.company, 'note')
  );
  SECTIONS.forEach(([title, keys]) => {
    const dl = el('dl'),
      tabs = [];
    keys.forEach((k) => {
      const f = fld(k);
      if (!f) return;
      if (f.type === 'json') {
        tabs.push(f);
        return;
      }
      dl.appendChild(el('dt', f.label));
      dl.appendChild(el('dd', CUR[k] === '' || CUR[k] == null ? '–' : CUR[k]));
    });
    if (!dl.childElementCount && !tabs.length) return;
    body.appendChild(el('h3', title));
    body.appendChild(dl);
    tabs.forEach((f) => body.appendChild(rowsTable(f.key, CUR[f.key])));
  });
  const dl = el('dl');
  [
    ['Age', CUR.age],
    ['Tenure (years)', CUR.tenure_years],
    ['FTE', CUR.fte],
    ['Record ID', CUR.record_id]
  ].forEach(([a, b]) => {
    dl.appendChild(el('dt', a));
    dl.appendChild(el('dd', b === '' ? '–' : b));
  });
  body.appendChild(el('h3', 'Calculated'));
  body.appendChild(dl);
  $('p_edit').hidden = !can('emp.write');
  $('p_archive').hidden = !can('emp.archive');
  $('profile').showModal();
}
$('p_close').onclick = () => $('profile').close();
$('p_print').onclick = () => window.print();
$('p_edit').onclick = () => {
  PENDING = CUR;
  $('profile').close();
  go(NAV.find((n) => n[0] === 'register'));
};
$('p_archive').onclick = guard(async () => {
  if (
    !confirm(
      'Archive ' + CUR.name + '? The record is kept but hidden from lists.'
    )
  )
    return;
  await api('archiveEmployee', CUR.record_id);
  $('profile').close();
  await loadEmployees();
});

/* ---------- Registration / update form ---------- */
VIEWS.register = guard(async () => {
  await ensureMeta();
  const rec = PENDING;
  PENDING = null;
  CUR = rec;
  HEAD_OPTIONS = rec ? [] : await api('listAssignableHeads');
  $('r_mode').textContent = rec
    ? 'Editing ' + rec.name + ' (' + rec.record_id + ')'
    : 'New employee. Fields marked * are required.';
  $('r_msg').textContent = '';
  $('r_msg').hidden = true;
  $('r_account_access').hidden = Boolean(rec);
  $('r_account_role').disabled = Boolean(rec);
  $('r_account_password').disabled = Boolean(rec);
  $('r_account_password_confirm').disabled = Boolean(rec);
  $('r_preview').disabled = false;
  const box = $('r_form');
  box.innerHTML = '';
  SECTIONS.forEach(([title, keys]) => {
    const fs = el('fieldset'),
      g = el('div', undefined, 'fgrid'),
      tabs = [];
    fs.appendChild(el('legend', title));
    keys.forEach((k) => {
      if (k === 'age') {
        const l = el('label', 'Age (automatic)'),
          i = el('input');
        i.id = 'ff_age';
        i.readOnly = true;
        l.appendChild(i);
        g.appendChild(l);
        return;
      }
      const f = fld(k);
      if (!f) return;
      if (f.type === 'json') {
        tabs.push(f);
        return;
      }
      const lab = el('label', f.label + (f.required ? ' *' : ''));
      let inp;
      if (f.type === 'list') {
        inp = el('select');
        [''].concat(META.lists[f.list]).forEach((v) => {
          const o = el('option', v || 'Select…');
          o.value = v;
          inp.appendChild(o);
        });
      } else {
        inp = el('input');
        inp.type =
          f.type === 'date'
            ? 'date'
            : f.type === 'email'
              ? 'email'
              : f.type === 'number'
                ? 'number'
                : 'text';
        if (f.type === 'number') {
          inp.step = '0.01';
          if (k === 'fte') {
            inp.min = 0;
            inp.max = 1;
          }
        }
      }
      inp.id = 'ff_' + k;
      if (rec && rec[k] !== undefined) inp.value = rec[k];
      if (k === 'reports_to' && !rec) {
        inp.type = 'search';
        inp.placeholder = 'Search Head name or email';
        inp.autocomplete = 'off';
        inp.setAttribute('role', 'combobox');
        inp.setAttribute('aria-autocomplete', 'list');
        const selectedHead = el('input');
        selectedHead.type = 'hidden';
        selectedHead.id = 'ff_assigned_head_email';
        const results = el('div', undefined, 'head-search-results');
        results.id = 'r_assigned_head_results';
        results.hidden = true;
        inp.oninput = () =>
          renderAssignableHeadOptions(inp, selectedHead, results);
        lab.append(inp, selectedHead, results);
      } else {
        lab.appendChild(inp);
      }
      g.appendChild(lab);
    });
    if (!g.childElementCount && !tabs.length) return;
    fs.appendChild(g);
    tabs.forEach((f) => fs.appendChild(tableEditor(f.key, rec && rec[f.key])));
    box.appendChild(fs);
  });
  $('r_account_role').value = 'STAFF';
  $('r_account_role').onchange = updateRegistrationRoleHelp;
  if ($('ff_assigned_head_email')) $('ff_assigned_head_email').value = '';
  updateRegistrationRoleHelp();
  const calc = () => {
    const b = $('ff_birthday') && $('ff_birthday').value;
    if ($('ff_age'))
      $('ff_age').value = b
        ? Math.floor((Date.now() - new Date(b)) / 31557600000)
        : '';
  };
  if ($('ff_birthday')) {
    $('ff_birthday').onchange = calc;
    calc();
  }
});
function updateRegistrationRoleHelp() {
  const role = $('r_account_role').value;
  $('r_head_assignment_note').textContent =
    role === 'STAFF'
      ? 'Assign a Head to this STAFF account. Pending Head requests can be selected, but must be approved first.'
      : role === 'HEAD'
        ? 'Assigning a Head is optional. If selected, approve that Head account first.'
        : 'HR accounts do not have an assigned Head.';
  if (role === 'HR') {
    const assignedHead = $('ff_assigned_head_email');
    if (assignedHead) assignedHead.value = '';
    const results = $('r_assigned_head_results');
    if (results) results.hidden = true;
  }
}
function renderAssignableHeadOptions(input, selected, results) {
  selected.value = '';
  const term = input.value.trim().toLocaleLowerCase();
  results.replaceChildren();
  const matches = term
    ? HEAD_OPTIONS.filter((head) =>
        `${head.full_name} ${head.email}`.toLocaleLowerCase().includes(term)
      ).slice(0, 8)
    : [];
  matches.forEach((head) => {
    const assignmentStatus =
      head.assignment_status === 'PENDING' ? ' · pending approval' : '';
    const option = el(
      'button',
      `${head.full_name || head.email} (${head.email})${assignmentStatus}`
    );
    option.type = 'button';
    option.setAttribute('role', 'option');
    option.onclick = () => {
      input.value = head.full_name || head.email;
      selected.value = head.email;
      results.hidden = true;
    };
    results.appendChild(option);
  });
  results.hidden = matches.length === 0;
}
const formData = () => {
  const d = {};
  META.fields.forEach((f) => {
    if (f.type === 'json') d[f.key] = collect(f.key);
    else {
      const i = $('ff_' + f.key);
      if (i) d[f.key] = i.value.trim();
    }
  });
  if (CUR && CUR.record_id) d.record_id = CUR.record_id;
  else
    d.accountAccess = {
      role: $('r_account_role').value,
      password: $('r_account_password').value,
      assignedHeadEmail: $('ff_assigned_head_email')
        ? $('ff_assigned_head_email').value
        : ''
    };
  return d;
};
$('r_preview').onclick = () => {
  const d = formData(),
    miss = META.fields
      .filter((f) => f.required && !d[f.key])
      .map((f) => f.label);
  if (!CUR || !CUR.record_id) {
    if (!d.personal_email) miss.push('Personal Email');
    if (d.accountAccess.role === 'STAFF' && !d.accountAccess.assignedHeadEmail)
      miss.push('Assigned Head');
    if (
      d.accountAccess.password.length < 12 ||
      d.accountAccess.password.length > 128
    )
      miss.push('Initial password (12–128 characters)');
    if (d.accountAccess.password !== $('r_account_password_confirm').value)
      miss.push('Matching password confirmation');
  }
  if (miss.length) {
    showErr('Please complete: ' + miss.join(', '));
    return;
  }
  showErr('');
  const dl = el('dl');
  META.fields.forEach((f) => {
    const v = d[f.key];
    if (Array.isArray(v) ? v.length : v) {
      dl.appendChild(el('dt', f.label));
      dl.appendChild(
        el(
          'dd',
          Array.isArray(v)
            ? v.length +
                ' row(s): ' +
                v
                  .map((r) => Object.values(r).filter(Boolean).join(' / '))
                  .join('; ')
            : v
        )
      );
    }
  });
  if (!CUR || !CUR.record_id) {
    dl.appendChild(el('dt', 'Account role'));
    dl.appendChild(el('dd', d.accountAccess.role));
    dl.appendChild(el('dt', 'Assigned Head'));
    dl.appendChild(el('dd', d.accountAccess.assignedHeadEmail || 'None'));
    dl.appendChild(el('dt', 'Account approval'));
    dl.appendChild(el('dd', 'Pending ADMIN approval'));
  }
  $('pv_body').innerHTML = '';
  $('pv_body').appendChild(dl);
  $('pv_err').innerHTML = '';
  $('preview').showModal();
};
$('pv_back').onclick = () => $('preview').close();
$('pv_save').onclick = guard(async () => {
  const r = await api('saveEmployee', formData());
  if (!r.ok) {
    const e = el('div', undefined, 'errs');
    r.errors.forEach((x) => e.appendChild(el('div', '• ' + x)));
    $('pv_err').innerHTML = '';
    $('pv_err').appendChild(e);
    return;
  }
  $('preview').close();
  showErr('');
  $('r_msg').textContent =
    `Employee ${r.record_id} was saved. The ${r.accountRequestRole || $('r_account_role').value} account request for ${r.accountEmail || $('ff_personal_email').value} is pending ADMIN approval.`;
  $('r_msg').hidden = false;
  $('r_preview').disabled = true;
});
$('r_cancel').onclick = () => go(NAV.find((n) => n[0] === 'employees'));

/* ---------- Import with column mapping ---------- */
$('e_import').onclick = () => {
  $('importPanel').hidden = !$('importPanel').hidden;
};
const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
$('i_tpl').onclick = () =>
  download(
    'employee_import_template.csv',
    META.fields
      .filter((f) => f.type !== 'json')
      .map((f) => '"' + f.label + '"')
      .join(',') + '\n'
  );
$('i_file').onchange = guard(async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: true
  });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false
  });
  if (rows.length < 2) throw new Error('The file has no data rows.');
  IMP = { head: rows[0].map(String), data: rows.slice(1) };
  const m = $('i_map');
  m.innerHTML = '';
  const t = el('table'),
    th = el('tr');
  ['File column', 'Example', 'Import into'].forEach((x) =>
    th.appendChild(el('th', x))
  );
  t.appendChild(th);
  IMP.head.forEach((h, i) => {
    const tr = el('tr');
    tr.appendChild(el('td', h));
    tr.appendChild(
      el(
        'td',
        String(IMP.data[0][i] === undefined ? '' : IMP.data[0][i]).slice(0, 30)
      )
    );
    const s = el('select');
    s.dataset.col = i;
    const sk = el('option', 'Skip this column');
    sk.value = '';
    s.appendChild(sk);
    META.fields
      .filter((f) => f.type !== 'json')
      .forEach((f) => {
        const o = el('option', f.label);
        o.value = f.key;
        if (norm(f.label) === norm(h) || norm(f.key) === norm(h))
          o.selected = true;
        s.appendChild(o);
      });
    const td = el('td');
    td.appendChild(s);
    tr.appendChild(td);
    t.appendChild(tr);
  });
  m.appendChild(t);
  m.hidden = false;
  $('i_act').hidden = false;
  $('i_commit').disabled = true;
  $('i_result').innerHTML = '';
});
const isoDate = (v) => {
  if (v instanceof Date)
    return (
      v.getFullYear() +
      '-' +
      String(v.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(v.getDate()).padStart(2, '0')
    );
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return s && !isNaN(d) ? isoDate(d) : s;
};
function buildRecords() {
  const map = {};
  document.querySelectorAll('#i_map select').forEach((s) => {
    if (s.value) map[s.dataset.col] = s.value;
  });
  if (!Object.values(map).includes('emp_no'))
    throw new Error('Map a column to Employee Number before continuing.');
  return IMP.data.map((r, n) => {
    const o = { _line: n + 2 };
    Object.keys(map).forEach((c) => {
      const f = fld(map[c]);
      let v = r[c];
      if (f.type === 'date') v = isoDate(v);
      o[map[c]] = v === undefined ? '' : String(v);
    });
    return o;
  });
}
async function runImport(commit) {
  const recs = buildRecords(),
    res = { total: 0, valid: 0, imported: 0, errors: [] };
  for (let i = 0; i < recs.length; i += 300) {
    const r = await api('importEmployees', recs.slice(i, i + 300), commit);
    res.total += r.total;
    res.valid += r.valid;
    res.imported += r.imported;
    res.errors = res.errors.concat(r.errors);
  }
  const box = $('i_result');
  box.innerHTML = '';
  box.appendChild(
    el(
      'div',
      (commit
        ? res.imported + ' employee(s) imported. '
        : res.valid + ' of ' + res.total + ' row(s) are valid. ') +
        (res.errors.length ? res.errors.length + ' row(s) have errors.' : ''),
      res.errors.length && !commit ? 'errs' : 'okmsg'
    )
  );
  if (res.errors.length) {
    const e = el('div', undefined, 'errs');
    res.errors
      .slice(0, 50)
      .forEach((x) =>
        e.appendChild(el('div', 'Row ' + x.row + ': ' + x.errors.join('; ')))
      );
    if (res.errors.length > 50)
      e.appendChild(el('div', '…and ' + (res.errors.length - 50) + ' more.'));
    box.appendChild(e);
  }
  $('i_commit').disabled = commit || res.valid === 0;
  if (commit) loadEmployees();
}
$('i_validate').onclick = guard(() => runImport(false));
$('i_commit').onclick = guard(async () => {
  if (confirm('Import all valid rows now? Rows with errors will be skipped.'))
    await runImport(true);
});
