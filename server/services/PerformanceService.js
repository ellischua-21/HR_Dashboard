const { pool } = require('../db/database');
const { requirePerm } = require('../middleware/Auth');
const { httpError } = require('../utils/HttpError');
const { isValidDate } = require('../utils/Validation');
const DateUtils = require('../../shared/DateUtils');
const Tasks = require('./TaskService');
const templates = require('../../shared/FormTemplates');
const { incidentAccessScope } = require('./incident-management/Tracking');

async function admin(req) {
  const user = await requirePerm(req, 'admin.manage');
  if (user.role !== 'ADMIN')
    throw httpError('Only ADMIN can view HR performance.', 403);
  return user;
}
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
async function getDashboard(req, input = {}) {
  const user = await admin(req);
  const incidentOversight =
    await require('./incident-management/WorkflowAccess').adminHead(
      pool,
      user.email
    );
  const incidentScope = incidentAccessScope(user, 'i');
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw httpError('Choose valid performance filters.', 400);
  const today = DateUtils.manilaDate();
  const from = input.from || `${today.slice(0, 7)}-01`,
    to = input.to || today;
  if (
    !isValidDate(from) ||
    !isValidDate(to) ||
    from > to ||
    Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) >
      366 * 86400000
  )
    throw httpError('Choose a valid date range of up to one year.', 400);
  const type = input.type || 'ALL',
    state = input.state || 'ALL',
    email = String(input.email || '').toLowerCase();
  if (!['DAY', 'WEEK', 'MONTH'].includes(input.interval || 'WEEK'))
    throw httpError('Choose a valid chart interval.', 400);
  if (
    !['ALL', 'FORM', 'INCIDENT'].includes(type) ||
    !['ALL', 'UNASSIGNED', 'READY', 'WAITING', 'COMPLETED'].includes(state)
  )
    throw httpError('Choose valid performance filters.', 400);
  const start = Date.parse(`${from}T00:00:00+08:00`),
    end = Date.parse(`${to}T23:59:59.999+08:00`);
  const [[accounts], [formRows], [incidentReviews], [assignments], [tracked]] =
    await Promise.all([
      pool.execute(
        "SELECT email, COALESCE(NULLIF(full_name, ''), email) AS name, role, active FROM user_roles WHERE role = 'HR' ORDER BY full_name, email"
      ),
      pool.execute(
        `SELECT f.id, f.reviewed_by AS email, f.reviewed_at AS completedAt, f.status
      FROM user_forms f JOIN user_roles u ON u.email = f.reviewed_by AND u.role = 'HR'
      WHERE f.status IN ('APPROVED', 'REJECTED') AND f.reviewed_at >= ? AND f.reviewed_at < DATE_ADD(?, INTERVAL 1 DAY)`,
        [from, to]
      ),
      pool.execute(
        `SELECT a.incident_id AS incidentId, i.case_number AS caseNumber, a.actor_email AS email, MIN(a.created_at) AS reviewedAt
      FROM incident_activity a JOIN user_roles u ON u.email = a.actor_email AND u.role = 'HR'
      JOIN incident_reports i ON i.id = a.incident_id
      WHERE a.action IN ('HR_REVIEW_STARTED', 'INVESTIGATION_STARTED', 'INVESTIGATION_NOTE',
        'INFORMATION_REQUESTED', 'NTE_DRAFT_SAVED', 'NTE_ISSUED', 'EVALUATION_STARTED', 'EVALUATION_SAVED',
        'DECISION_ISSUED', 'CLOSED_FOR_DOCUMENTATION', 'INVESTIGATION_CLOSED', 'DECISION_CASE_CLOSED', 'MANAGEMENT_REQUESTED', 'CASE_CLOSED')
      AND a.created_at >= ? AND a.created_at < DATE_ADD(?, INTERVAL 1 DAY) GROUP BY a.incident_id, i.case_number, a.actor_email`,
        [from, to]
      ),
      pool.execute(
        `SELECT t.id AS taskId, t.resource_id AS incidentId, i.case_number AS caseNumber, i.subject,
          e.owner_email AS email, COALESCE(NULLIF(u.full_name, ''), e.owner_email) AS reviewerName,
          MAX(e.event_ms) AS takenMs, t.owner_email AS currentOwner, t.state,
          MAX(CASE WHEN ${incidentScope.sql} THEN 1 ELSE 0 END) AS canViewCase
        FROM hr_task_events e JOIN hr_tasks t ON t.id = e.task_id AND t.resource_type = 'INCIDENT'
        JOIN incident_reports i ON i.id = t.resource_id
        JOIN user_roles u ON u.email = e.owner_email AND u.role = 'HR'
        WHERE e.action IN ('TAKEN', 'REASSIGNED') AND e.event_ms BETWEEN ? AND ?
        GROUP BY t.id, t.resource_id, i.case_number, i.subject, e.owner_email, u.full_name, t.owner_email, t.state
        ORDER BY takenMs DESC, t.id DESC`,
        [...incidentScope.values, start, end]
      ),
      pool.execute(
        `SELECT t.*, COALESCE(NULLIF(u.full_name, ''), t.owner_email) AS ownerName,
      COALESCE(f.control_no, i.case_number) AS reference,
      COALESCE(i.subject, f.template_key) AS title,
      COALESCE(i.reported_employee_name, applicant.full_name, f.user_email) AS employeeName,
      (SELECT MAX(e.event_ms) FROM hr_task_events e WHERE e.task_id = t.id AND e.action IN ('TAKEN', 'REASSIGNED', 'ACTIVITY', 'COMPLETED')) AS lastActionMs
      , i.assigned_head_email AS incidentHead, iw.management_email AS incidentManager,
      (${incidentScope.sql}) AS canViewCase
      FROM hr_tasks t LEFT JOIN user_roles u ON u.email = t.owner_email
      LEFT JOIN user_forms f ON t.resource_type = 'FORM' AND f.id = t.resource_id
      LEFT JOIN user_roles applicant ON applicant.email = f.user_email
      LEFT JOIN incident_reports i ON t.resource_type = 'INCIDENT' AND i.id = t.resource_id
      LEFT JOIN incident_workflows iw ON iw.incident_id = i.id
      WHERE (t.owner_email IS NULL OR u.role = 'HR')
        AND (t.resource_type <> 'INCIDENT' OR i.workflow_version = 2 OR t.state = 'COMPLETED')
        AND (t.state <> 'COMPLETED' OR t.completed_ms BETWEEN ? AND ?)`,
        [...incidentScope.values, start, end]
      )
    ]);
  if (
    email &&
    !accounts.some((account) => account.email.toLowerCase() === email)
  )
    throw httpError('Choose a valid reviewer.', 400);
  const now = Date.now();
  const taskIds = tracked.map((row) => row.id);
  const [credits] = taskIds.length
    ? await pool.execute(
        `SELECT e.task_id, e.credit_owner, SUM(e.active_ms) AS activeMs
    FROM hr_task_events e JOIN user_roles u ON u.email = e.credit_owner AND u.role = 'HR'
    WHERE e.task_id IN (${taskIds.map(() => '?').join(',')})
    GROUP BY e.task_id, e.credit_owner`,
        taskIds
      )
    : [[]];
  const creditMap = new Map(
    credits.map((row) => [
      `${row.task_id}:${row.credit_owner.toLowerCase()}`,
      Number(row.activeMs)
    ])
  );
  const hrTotals = new Map();
  for (const row of credits)
    hrTotals.set(
      String(row.task_id),
      (hrTotals.get(String(row.task_id)) || 0) + Number(row.activeMs)
    );
  const tasks = tracked.map((row) => {
    const accrued = hrTotals.get(String(row.id)) || 0;
    const live = Tasks.elapsed(row, now),
      duration = accrued + live;
    const ownerMs =
      (creditMap.get(`${row.id}:${row.owner_email?.toLowerCase()}`) || 0) +
      live;
    return {
      id: Number(row.id),
      type: row.resource_type,
      resourceId: Number(row.resource_id),
      phase: row.phase,
      reference: row.reference,
      title:
        row.resource_type === 'FORM'
          ? templates.find((template) => template.key === row.title)?.title ||
            row.title
          : row.canViewCase
            ? row.title
            : 'Restricted Incident',
      employeeName:
        row.resource_type === 'FORM' || row.canViewCase ? row.employeeName : '',
      canViewCase: row.resource_type === 'FORM' || Boolean(row.canViewCase),
      owner: row.owner_email,
      ownerName: row.ownerName,
      stage: row.stage,
      state: row.state,
      waitingReason: row.waiting_reason,
      canReassign:
        row.resource_type === 'FORM' ||
        (incidentOversight &&
          [row.incidentHead, row.incidentManager].some(
            (email) => email?.toLowerCase() === user.email.toLowerCase()
          )),
      activeMs: accrued,
      runStartedMs:
        row.run_started_ms == null ? null : Number(row.run_started_ms),
      duration,
      ownerMs,
      ownerActiveMs: ownerMs - live,
      takenMs: row.taken_ms == null ? null : Number(row.taken_ms),
      lastActionMs: row.lastActionMs == null ? null : Number(row.lastActionMs),
      completedMs: row.completed_ms == null ? null : Number(row.completed_ms),
      serverNow: now
    };
  });
  const selected = (resource) => type === 'ALL' || resource === type;
  const waitingForEmployee = (task) =>
    task.state === 'WAITING' &&
    task.waitingReason === 'Awaiting requested information';
  const uniqueIncidentReviews = new Map();
  for (const review of incidentReviews) {
    if (email && review.email.toLowerCase() !== email) continue;
    const id = String(review.incidentId);
    const previous = uniqueIncidentReviews.get(id);
    if (!previous || String(review.reviewedAt) < String(previous.reviewedAt))
      uniqueIncidentReviews.set(id, review);
  }
  const completions = [
    ...formRows.map((row) => ({ ...row, type: 'FORM' })),
    ...[...uniqueIncidentReviews.values()].map((row) => ({
      ...row,
      completedAt: row.reviewedAt,
      type: 'INCIDENT'
    }))
  ].filter(
    (row) => selected(row.type) && (!email || row.email.toLowerCase() === email)
  );
  const selectedTasks = tasks.filter(
    (task) =>
      selected(task.type) && (!email || task.owner?.toLowerCase() === email)
  );
  // Backlog is the current HR-wide queue, including work with no reviewer yet.
  // Reviewer and completion-date filters must not hide that unassigned work.
  const backlog = tasks.filter(
    (task) => selected(task.type) && task.state !== 'COMPLETED'
  );
  // Count reports, not activity rows. Multiple stages/actions on the same report
  // earn one reviewed-report count per HR in the selected period.
  const reviewedIncidents = new Map();
  if (type !== 'FORM') {
    for (const entry of incidentReviews) {
      const reviewer = entry.email.toLowerCase();
      if (!reviewedIncidents.has(reviewer))
        reviewedIncidents.set(reviewer, new Set());
      reviewedIncidents.get(reviewer).add(String(entry.incidentId));
    }
  }
  const comparison = accounts
    .filter((account) => !email || account.email.toLowerCase() === email)
    .map((account) => {
      const key = account.email.toLowerCase(),
        owned = selectedTasks.filter(
          (task) => task.owner?.toLowerCase() === key
        );
      const completed = owned.filter(
        (task) =>
          task.state === 'COMPLETED' &&
          task.completedMs >= start &&
          task.completedMs <= end
      );
      return {
        ...account,
        forms: completions.filter(
          (row) => row.email.toLowerCase() === key && row.type === 'FORM'
        ).length,
        incidentsReviewed: reviewedIncidents.get(key)?.size || 0,
        assigned: owned.filter((task) => task.state !== 'COMPLETED').length,
        waiting: owned.filter(waitingForEmployee).length,
        medianMs: median(completed.map((task) => task.ownerMs))
      };
    });
  const allCompleted = selectedTasks.filter(
    (task) => task.state === 'COMPLETED'
  );
  const buckets = new Map();
  for (const row of completions) {
    const day = String(row.completedAt).slice(0, 10);
    const key =
      input.interval === 'MONTH'
        ? day.slice(0, 7)
        : input.interval === 'WEEK'
          ? (() => {
              const date = new Date(`${day}T00:00:00Z`);
              date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
              return date.toISOString().slice(0, 10);
            })()
          : day;
    const bucket = buckets.get(key) || { period: key, forms: 0, incidents: 0 };
    bucket[row.type === 'FORM' ? 'forms' : 'incidents']++;
    buckets.set(key, bucket);
  }
  return {
    from,
    to,
    accounts,
    comparison,
    serverNow: now,
    summary: {
      forms: completions.filter((row) => row.type === 'FORM').length,
      incidentsReviewed: completions.filter((row) => row.type === 'INCIDENT')
        .length,
      totalBacklog: backlog.length,
      unassignedBacklog: backlog.filter((task) => !task.owner).length,
      waiting: selectedTasks.filter(waitingForEmployee).length,
      medianMs: median(allCompleted.map((task) => task.duration))
    },
    tasks: selectedTasks
      .filter(
        (task) =>
          state === 'ALL' ||
          (state === 'UNASSIGNED'
            ? !task.owner && task.state !== 'COMPLETED'
            : task.state === state)
      )
      .sort((a, b) => b.duration - a.duration),
    trend: [...buckets.values()].sort((a, b) =>
      a.period.localeCompare(b.period)
    ),
    incidentAssignments:
      type === 'FORM'
        ? []
        : assignments
            .filter((row) => !email || row.email.toLowerCase() === email)
            .map((row) => ({
              ...row,
              subject: row.canViewCase ? row.subject : '',
              canViewCase: Boolean(row.canViewCase),
              takenMs: Number(row.takenMs)
            }))
  };
}
async function history(req, taskId) {
  await admin(req);
  const id = Number(taskId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid task.', 400);
  const [rows] = await pool.execute(
    `SELECT e.*, COALESCE(NULLIF(u.full_name, ''), e.actor_email) AS actorName
    FROM hr_task_events e LEFT JOIN user_roles u ON u.email = e.actor_email WHERE e.task_id = ? ORDER BY e.id`,
    [id]
  );
  return rows;
}
module.exports = { getDashboard, history };
