const {
  EMP_FIELDS,
  F,
  ACTIVE_STATUSES,
  AGE_BANDS
} = require('../config/EmployeeSchema');
const { CFG } = require('../config/Config');
const { requirePerm } = require('../middleware/Auth');
const { logAudit } = require('./AuditService');
const {
  filterRows,
  tally,
  ageBand,
  parseDate,
  todayInManila,
  readAllEmployees
} = require('./DashboardService');

const isActive = (employee) => ACTIVE_STATUSES.includes(employee.status);
const REPORTS = {
  master: { t: 'Employee Master List', type: 'list', cols: 'master' },
  active: {
    t: 'Active Employee Listing',
    type: 'list',
    cols: ['emp_no', 'name', 'company', 'department', 'position', 'status'],
    where: isActive
  },
  inactive: {
    t: 'Inactive Employee Listing',
    type: 'list',
    cols: ['emp_no', 'name', 'company', 'department', 'position', 'status'],
    where: (employee) => !isActive(employee)
  },
  hc_company: { t: 'Headcount by Company', type: 'group', key: 'company' },
  hc_department: {
    t: 'Headcount by Department',
    type: 'group',
    key: 'department'
  },
  hc_location: {
    t: 'Headcount by Work Location',
    type: 'group',
    key: 'location'
  },
  demographics: { t: 'Employee Demographics', type: 'demo' },
  tenure: {
    t: 'Employee Tenure Report',
    type: 'list',
    cols: [
      'emp_no',
      'name',
      'company',
      'department',
      'date_employed',
      'tenure_years'
    ]
  },
  rank: { t: 'Employee Rank Report', type: 'group', key: 'rank' },
  education: {
    t: 'Employee Education Level Report',
    type: 'group',
    key: 'education'
  },
  hmo: {
    t: 'Employee HMO Enrollment Report',
    type: 'list',
    cols: ['emp_no', 'name', 'company', 'hmo'],
    blank: { hmo: 'Not enrolled' }
  },
  gov_complete: { t: 'Government Information Completeness', type: 'gov' },
  quality: { t: 'Employee Data Quality Report', type: 'quality' },
  directory: {
    t: 'Employee Directory',
    type: 'list',
    cols: [
      'name',
      'position',
      'department',
      'company',
      'location',
      'personal_email',
      'company_contact_no'
    ]
  }
};

async function listReports(req) {
  await requirePerm(req, 'report.run');
  return Object.keys(REPORTS).map((id) => ({ id, title: REPORTS[id].t }));
}

async function buildReport(id, filters, user) {
  const definition = REPORTS[id];
  if (!definition)
    throw new Error(
      'Unknown report: "' +
        id +
        '". Valid ids: ' +
        Object.keys(REPORTS).join(', ')
    );
  const asOf = filters.dateTo || todayInManila();
  let rows = filterRows(await readAllEmployees(), filters, asOf)
    .filter(
      (employee) =>
        !filters.dateFrom ||
        parseDate(employee.date_employed) >= parseDate(filters.dateFrom)
    )
    .filter((employee) => parseDate(employee.date_employed) <= parseDate(asOf));
  if (definition.where) rows = rows.filter(definition.where);
  const label = (key) => (F.get(key) ? F.get(key)[1] : key);

  if (definition.type === 'list') {
    let keys = definition.cols;
    if (keys === 'master') {
      const canSeeSensitive = user.perms.includes('emp.sensitive');
      keys = EMP_FIELDS.filter(
        (field) =>
          field[0] !== 'docs' && (canSeeSensitive || !F.has(field, 'S'))
      )
        .map((field) => field[0])
        .concat(['age', 'tenure_years']);
    }
    return {
      columns: keys.map(label),
      rows: rows.map((employee) =>
        keys.map(
          (key) =>
            (employee[key] === '' &&
              definition.blank &&
              definition.blank[key]) ||
            employee[key]
        )
      )
    };
  }
  if (definition.type === 'group') {
    const groups = new Map();
    rows.forEach((employee) => {
      const key = employee[definition.key] || 'Unspecified';
      const counts = groups.get(key) || [0, 0, 0];
      counts[0]++;
      if (isActive(employee)) counts[1]++;
      counts[2] += Number(employee.fte) || 0;
      groups.set(key, counts);
    });
    return {
      columns: [
        label(definition.key),
        'Headcount',
        'Active',
        'Inactive',
        'FTE',
        '% of Total'
      ],
      rows: [...groups.keys()].sort().map((key) => {
        const counts = groups.get(key);
        return [
          key,
          counts[0],
          counts[1],
          counts[0] - counts[1],
          Math.round(counts[2] * 100) / 100,
          rows.length ? Math.round((counts[0] / rows.length) * 1000) / 10 : 0
        ];
      })
    };
  }
  if (definition.type === 'demo') {
    const output = [];
    const add = (dimension, items) =>
      items.forEach((item) =>
        output.push([
          dimension,
          item.label,
          item.value,
          rows.length ? Math.round((item.value / rows.length) * 1000) / 10 : 0
        ])
      );
    add(
      'Gender',
      tally(rows, (employee) => employee.gender)
    );
    add('Age Group', tally(rows, ageBand, AGE_BANDS));
    add(
      'Civil Status',
      tally(rows, (employee) => employee.civil_status)
    );
    add(
      'Education',
      tally(rows, (employee) => employee.education)
    );
    return {
      columns: ['Dimension', 'Category', 'Count', '% of Total'],
      rows: output
    };
  }
  if (definition.type === 'gov') {
    const fields = ['tin', 'pagibig', 'sss', 'philhealth'];
    return {
      columns: [
        'Employee Number',
        'Name',
        'TIN',
        'Pag-IBIG',
        'SSS',
        'PhilHealth'
      ],
      rows: rows.map((employee) =>
        [employee.emp_no, employee.name].concat(
          fields.map((key) => (employee[key] !== '' ? 'Complete' : 'Missing'))
        )
      )
    };
  }
  if (definition.type === 'quality') {
    const checked = EMP_FIELDS.filter(
      (field) => !F.has(field, 'C') && !F.has(field, 'O') && field[0] !== 'docs'
    );
    return {
      columns: [
        'Employee Number',
        'Name',
        'Missing Fields (count)',
        'Missing Field Names'
      ],
      rows: rows
        .map((employee) => {
          const missing = checked
            .filter(
              (field) => employee[field[0]] === '' || employee[field[0]] == null
            )
            .map((field) => field[1]);
          return [
            employee.emp_no,
            employee.name,
            missing.length,
            missing.join(', ')
          ];
        })
        .filter((row) => row[2] > 0)
    };
  }
  throw new Error('Unsupported report type.');
}

async function runReport(req, id, filters, options) {
  const user = await requirePerm(req, 'report.run');
  id = id || 'master';
  options = options || {};
  const report = await buildReport(id, filters || {}, user);
  const column = Number(options.sortCol);
  if (!Number.isNaN(column) && column >= 0 && column < report.columns.length) {
    const direction = options.sortDir === 'desc' ? -1 : 1;
    report.rows.sort(
      (a, b) =>
        (a[column] > b[column] ? 1 : a[column] < b[column] ? -1 : 0) * direction
    );
  }
  const pageSize = Math.min(Number(options.pageSize) || CFG.PAGE_SIZE, 200);
  const page = Math.max(Number(options.page) || 1, 1);
  return {
    title: REPORTS[id].t,
    columns: report.columns,
    total: report.rows.length,
    page,
    pageSize,
    rows: report.rows.slice((page - 1) * pageSize, page * pageSize)
  };
}

async function exportReportCsv(req, id, filters) {
  const user = await requirePerm(req, 'emp.export');
  await requirePerm(req, 'report.run');
  const report = await buildReport(id, filters || {}, user);
  const escape = (value) => {
    let text = String(value === null || value === undefined ? '' : value);
    if (/^[=+\-@]/.test(text) && Number.isNaN(Number(text))) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  await logAudit(
    user.email,
    'EXPORT',
    '',
    id + ' rows=' + report.rows.length + ' cols=' + report.columns.length
  );
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
    .format(new Date())
    .replace(/-/g, '');
  return {
    filename: id + '_' + date + '.csv',
    csv: [report.columns]
      .concat(report.rows)
      .map((row) => row.map(escape).join(','))
      .join('\n')
  };
}

module.exports = {
  listReports,
  runReport,
  exportReportCsv,
  buildReport,
  REPORTS
};
