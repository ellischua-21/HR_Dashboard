const {
  EMP_FIELDS,
  F,
  ACTIVE_STATUSES,
  AGE_BANDS,
  TENURE_BANDS
} = require('../config/EmployeeSchema');
const { pool, getLists } = require('../db/database');
const { requirePerm } = require('../middleware/Auth');

const { manilaDate: todayInManila } = require('../../shared/DateUtils');

const {
  EMPLOYEE_FILTER_KEYS: dims,
  normalizeEmployeeFilters
} = require('../utils/EmployeeFilters');
const dateString = (date) => date.toISOString().slice(0, 10);
const parseDate = (value) =>
  value ? new Date(String(value).slice(0, 10) + 'T00:00:00Z') : null;
const monthStart = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const plusMonths = (date, count) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));

function withCalc(employee, asOf = todayInManila()) {
  const asOfDate = parseDate(asOf);
  const yearsSince = (value) =>
    value ? (asOfDate - parseDate(value)) / (365.25 * 86400000) : '';
  employee.age = employee.birthday
    ? Math.floor(yearsSince(employee.birthday))
    : '';
  employee.tenure_years = employee.date_employed
    ? Math.round(yearsSince(employee.date_employed) * 10) / 10
    : '';
  return employee;
}

function normalizeEmployee(row) {
  const result = { ...row };
  EMP_FIELDS.forEach((field) => {
    const key = field[0];
    if (result[key] === null || result[key] === undefined) result[key] = '';
    else if (field[2] === 'json' && typeof result[key] !== 'string')
      result[key] = JSON.stringify(result[key]);
    else if (field[2] === 'number' && result[key] !== '')
      result[key] = Number(result[key]);
    else if (field[2] === 'date' && result[key] !== '')
      result[key] = String(result[key]).slice(0, 10);
  });
  return result;
}

async function readAllEmployees() {
  const [rows] = await pool.query('SELECT * FROM employees ORDER BY seq_no');
  return rows.map(normalizeEmployee);
}

function filterRows(rows, filters, asOf) {
  return rows
    .filter(
      (employee) =>
        employee.record_status !== 'Archived' &&
        dims.every((key) => !filters[key] || employee[key] === filters[key])
    )
    .map((employee) => withCalc({ ...employee }, asOf));
}

function tally(rows, getKey, order) {
  const counts = new Map();
  rows.forEach((row) => {
    const key = getKey(row) || 'Unspecified';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const keys = order
    ? order.filter((key) => counts.has(key))
    : [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  return keys.map((label) => ({ label, value: counts.get(label) }));
}

const ageBand = (employee) =>
  employee.age === ''
    ? 'Unknown'
    : employee.age < 25
      ? 'Under 25'
      : employee.age < 35
        ? '25-34'
        : employee.age < 45
          ? '35-44'
          : employee.age < 55
            ? '45-54'
            : '55+';
const tenureBand = (employee) => {
  const years = Number(employee.tenure_years) || 0;
  return years < 1
    ? 'Under 1 yr'
    : years < 3
      ? '1-<3 yrs'
      : years < 5
        ? '3-<5 yrs'
        : years < 10
          ? '5-<10 yrs'
          : '10+ yrs';
};

async function getDashboard(req, filters) {
  await requirePerm(req, 'dash.view');
  return compute(filters || {});
}

async function compute(filters = {}) {
  filters = normalizeEmployeeFilters(filters);
  const asOf = filters.dateTo || todayInManila();
  const asOfDate = parseDate(asOf);
  const defaultFrom = plusMonths(monthStart(asOfDate), -11);
  const from = filters.dateFrom || dateString(defaultFrom);
  const fromDate = parseDate(from);
  const base = filterRows(await readAllEmployees(), filters, asOf);
  const population = base.filter(
    (employee) => parseDate(employee.date_employed) <= asOfDate
  );
  const active = population.filter((employee) =>
    ACTIVE_STATUSES.includes(employee.status)
  );
  const hires = base.filter((employee) => {
    const employed = parseDate(employee.date_employed);
    return employed >= fromDate && employed <= asOfDate;
  });
  const sum = (rows, key) =>
    rows.reduce((total, employee) => total + (Number(employee[key]) || 0), 0);
  const distinct = (key) =>
    new Set(population.map((employee) => employee[key]).filter(Boolean)).size;

  const kpis = {
    headcount: population.length,
    fte: Math.round(sum(active, 'fte') * 100) / 100,
    active: active.length,
    inactive: population.length - active.length,
    newHires: hires.length,
    resigned: population.filter((employee) => employee.status === 'Resigned')
      .length,
    avgTenureYears: active.length
      ? Math.round((sum(active, 'tenure_years') / active.length) * 10) / 10
      : null,
    companies: distinct('company'),
    departments: distinct('department'),
    locations: distinct('location')
  };

  const trend = [];
  for (
    let month = monthStart(fromDate);
    month <= asOfDate;
    month = plusMonths(month, 1)
  ) {
    trend.push({ label: dateString(month).slice(0, 7), value: 0 });
  }
  const limitedTrend = trend.slice(-60);
  hires.forEach((employee) => {
    const item = limitedTrend.find(
      (entry) => entry.label === String(employee.date_employed).slice(0, 7)
    );
    if (item) item.value++;
  });

  const by = (key) => tally(population, (employee) => employee[key]);
  const charts = {
    company: by('company'),
    department: by('department'),
    location: by('location'),
    status: by('status'),
    gender: by('gender'),
    education: by('education'),
    rank: by('rank'),
    functionType: by('function_type'),
    age: tally(population, ageBand, AGE_BANDS),
    tenure: tally(population, tenureBand, TENURE_BANDS),
    hiringTrend: limitedTrend
  };

  const checked = EMP_FIELDS.filter(
    (field) => !F.has(field, 'C') && !F.has(field, 'O') && field[0] !== 'docs'
  );
  const fieldPct = checked.map((field) => ({
    label: field[1],
    pct: population.length
      ? Math.round(
          (population.filter(
            (employee) =>
              employee[field[0]] !== '' && employee[field[0]] != null
          ).length /
            population.length) *
            100
        )
      : null
  }));
  const overall = population.length
    ? Math.round(
        fieldPct.reduce((total, field) => total + field.pct, 0) /
          fieldPct.length
      )
    : null;
  const governmentComplete = population.filter((employee) =>
    ['tin', 'pagibig', 'sss', 'philhealth'].every((key) => employee[key] !== '')
  ).length;
  const quality = {
    overallPct: overall,
    govInfoComplete: governmentComplete,
    govInfoIncomplete: population.length - governmentComplete,
    lowestFields: fieldPct
      .filter((field) => field.pct !== null)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 5)
  };

  const observations = [];
  if (population.length < 5)
    observations.push(
      'Insufficient data (fewer than 5 records) to produce reliable observations.'
    );
  else {
    const topCompany = charts.company[0];
    if (topCompany && charts.company.length > 1)
      observations.push(
        'Largest company: ' +
          topCompany.label +
          ' with ' +
          topCompany.value +
          ' employees (' +
          Math.round((topCompany.value / population.length) * 100) +
          '% of headcount).'
      );
    observations.push(
      Math.round((active.length / population.length) * 100) +
        '% of employees in the selected population have an active status.'
    );
    observations.push(
      hires.length + ' hire(s) with employment dates in the selected period.'
    );
    if (overall !== null && overall < 90)
      observations.push(
        'Overall data completeness is ' +
          overall +
          '%; review the Data Quality Report.'
      );
  }
  observations.push(
    'Note: resigned counts are status-based. Separation dates are tracked from Phase 2.'
  );

  return {
    asOf: dateString(asOfDate),
    from: dateString(fromDate),
    kpis,
    charts,
    quality,
    observations
  };
}

function shiftYear(value, amount) {
  const date = parseDate(value);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + amount);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return dateString(date);
}

async function getExecutiveSummary(req, filters) {
  await requirePerm(req, 'exec.view');
  const current = await compute(filters || {});
  const prior = await compute({
    ...filters,
    dateFrom: shiftYear(current.from, -1),
    dateTo: shiftYear(current.asOf, -1)
  });
  return {
    current,
    prior: { asOf: prior.asOf, kpis: prior.kpis },
    notes: [
      'Prior-year headcount is derived from employment dates only (separation dates are not yet recorded).'
    ],
    pending: {
      movement: 'Phase 2',
      absence: 'Phase 2',
      manpower: 'Phase 3',
      disciplinary: 'Phase 3 (aggregate only)'
    }
  };
}

async function getFilterOptions(req) {
  await requirePerm(req, 'dash.view');
  const lists = await getLists();
  return {
    company: lists.Company_List,
    department: lists.Department_List,
    location: lists.Location_List,
    status: lists.Employment_Status_List,
    rank: lists.Employee_Rank_List,
    function_type: lists.Function_Type_List
  };
}

module.exports = {
  getDashboard,
  getExecutiveSummary,
  getFilterOptions,
  readAllEmployees,
  filterRows,
  tally,
  ageBand,
  withCalc,
  parseDate,
  todayInManila,
  normalizeEmployee
};
