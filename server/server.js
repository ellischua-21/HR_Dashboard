require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { pool, initializeDatabase } = require('./db/database');
const { ROLE_PERMS } = require('./config/Config');
const { getSession } = require('./middleware/Auth');
const dashboard = require('./services/DashboardService');
const employees = require('./services/EmployeeService');
const reports = require('./services/ReportService');
const imports = require('./services/ImportService');
const audit = require('./services/AuditService');
const announcements = require('./services/AnnouncementService');
const inbox = require('./services/InboxService');
const accounts = require('./services/AccountService');
const userForms = require('./services/FormService');
const { verifyPassword } = require('./utils/Password');

const app = express();
const port = Number(process.env.API_PORT || 3001);
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('Set SESSION_SECRET to a random value of at least 32 characters in your .env file.');
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  const configured = (process.env.CORS_ORIGINS || 'http://localhost,http://127.0.0.1')
    .split(',').map(origin => origin.trim()).filter(Boolean);
  const origin = req.get('Origin');
  if (origin && configured.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '25mb' }));
app.use(session({
  name: 'hr_dashboard_session',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 8 * 60 * 60 * 1000 }
}));

app.post('/api/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password;
    const [rows] = await pool.execute(
      'SELECT email, role, active, password_hash FROM user_roles WHERE email = ? LIMIT 1', [email]);
    const user = rows[0];
    if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!Object.prototype.hasOwnProperty.call(ROLE_PERMS, user.role)) {
      return res.status(403).json({ error: 'This account has an unrecognized role.' });
    }
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.userEmail = user.email;
    res.json(await getSession(req));
  } catch (error) {
    next(error);
  }
});

app.post('/api/logout', (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('hr_dashboard_session', { httpOnly: true, sameSite: 'lax' });
    res.json({ ok: true });
  });
});

const methods = {
  getSession: req => getSession(req),
  getFilterOptions: req => dashboard.getFilterOptions(req),
  getDashboard: (req, filters) => dashboard.getDashboard(req, filters),
  getExecutiveSummary: (req, filters) => dashboard.getExecutiveSummary(req, filters),
  listEmployees: (req, params) => employees.listEmployees(req, params),
  getEmployee: (req, recordId) => employees.getEmployee(req, recordId),
  getFormOptions: req => employees.getFormOptions(req),
  getFormMeta: req => employees.getFormMeta(req),
  saveEmployee: (req, data) => employees.saveEmployee(req, data),
  archiveEmployee: (req, recordId) => employees.archiveEmployee(req, recordId),
  importEmployees: (req, records, commit) => imports.importEmployees(req, records, commit),
  listReports: req => reports.listReports(req),
  runReport: (req, id, filters, options) => reports.runReport(req, id, filters, options),
  exportReportCsv: (req, id, filters) => reports.exportReportCsv(req, id, filters),
  getAuditLogs: (req, limit, filters) => audit.getAuditLogs(req, limit, filters),
  createAnnouncement: (req, title, message) => announcements.createAnnouncement(req, title, message),
  listAnnouncementsForManagement: req => announcements.listAnnouncementsForManagement(req),
  listUnseenAnnouncements: req => announcements.listUnseenAnnouncements(req),
  markAnnouncementsSeen: (req, ids) => announcements.markAnnouncementsSeen(req, ids),
  getInbox: req => inbox.getInbox(req),
  getInboxNotificationCount: req => inbox.getInboxNotificationCount(req),
  markInboxSeen: req => inbox.markInboxSeen(req),
  listAssignableHeads: req => accounts.listAssignableHeads(req),
  getAccountManagement: req => accounts.getAccountManagement(req),
  assignAccountHead: (req, email, headEmail) => accounts.assignAccountHead(req, email, headEmail),
  setHrHeadAccount: (req, email, isHrHead) => accounts.setHrHeadAccount(req, email, isHrHead),
  saveAccountChanges: (req, changes) => accounts.saveAccountChanges(req, changes),
  approveAccountRequest: (req, requestId) => accounts.approveAccountRequest(req, requestId),
  rejectAccountRequest: (req, requestId) => accounts.rejectAccountRequest(req, requestId),
  changeMyPassword: (req, currentPassword, newPassword) => accounts.changeMyPassword(req, currentPassword, newPassword),
  listMyForms: req => userForms.listMyForms(req),
  submitLeaveForm: (req, data) => userForms.submitLeaveForm(req, data),
  submitUserForm: (req, templateKey, data) => userForms.submitUserForm(req, templateKey, data),
  updateMyForm: (req, formId, templateKey, data) => userForms.updateMyForm(req, formId, templateKey, data),
  listFormsForReview: (req, scope) => userForms.listFormsForReview(req, scope),
  getFormReviewSummary: (req, scope) => userForms.getFormReviewSummaryForUser(req, scope),
  reviewUserForm: (req, formId, decision, notes, signature) => userForms.reviewUserForm(req, formId, decision, notes, signature)
};

app.post('/api/:method', async (req, res, next) => {
  try {
    const method = Object.prototype.hasOwnProperty.call(methods, req.params.method) ? methods[req.params.method] : null;
    if (!method) return res.status(404).json({ error: 'Unknown API method.' });
    const args = Array.isArray(req.body.args) ? req.body.args : [];
    res.json(await method(req, ...args));
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  const status = Number(error.status) || 500;
  res.status(status).json({ error: status >= 500 ? 'The request failed. Check the Node.js server log.' : error.message });
});

initializeDatabase().then(() => {
  app.listen(port, '127.0.0.1', () => {
    console.log(`HR Dashboard API ready at http://127.0.0.1:${port}`);
  });
}).catch(async error => {
  console.error('Could not initialize the MySQL database:', error);
  await pool.end();
  process.exitCode = 1;
});

module.exports = { app, verifyPassword };
