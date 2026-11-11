const { pool } = require('../db/database');
const { requirePerm } = require('../middleware/Auth');
const { httpError } = require('../utils/HttpError');
const WorkTime = require('../../shared/WorkTime');

const reviewers = new Set(['HR']);
const viewers = new Set(['HR', 'ADMIN']);
function identity(type, id) {
  if (
    !['FORM', 'INCIDENT'].includes(type) ||
    !Number.isSafeInteger(Number(id)) ||
    Number(id) < 1
  )
    throw httpError('Choose a valid review task.', 400);
  return Number(id);
}
async function source(db, type, id, lock = false) {
  identity(type, id);
  const [rows] = await db.execute(
    type === 'FORM'
      ? `SELECT f.*, u.role AS submitter_role FROM user_forms f
       LEFT JOIN user_roles u ON u.email = f.user_email WHERE f.id = ?${lock ? ' FOR UPDATE' : ''}`
      : `SELECT * FROM incident_reports WHERE id = ?${lock ? ' FOR UPDATE' : ''}`,
    [id]
  );
  const row = rows[0];
  if (!row) throw httpError('Review task not found.', 404);
  if (type === 'FORM') {
    const phase =
      row.review_stage === 'HEAD' && row.template_key !== 'nexus-accountability'
        ? 'HEAD'
        : 'HR';
    if (phase === 'HEAD' && row.submitter_role !== 'HR') return null;
    return {
      type,
      id,
      phase,
      stage: row.review_stage,
      done: row.status !== 'PENDING',
      waiting: '',
      canTake: (user) =>
        reviewers.has(user.role) &&
        row.user_email.toLowerCase() !== user.email.toLowerCase() &&
        (phase === 'HR' ||
          (user.role === 'HR' &&
            user.is_hr_head &&
            row.head_reviewer_email === user.email))
    };
  }
  if (Number(row.workflow_version) !== 2) return null;
  const [[workflow]] = await db.execute(
    'SELECT phase, explanation_submitted_at, hearing_status FROM incident_workflows WHERE incident_id = ?',
    [id]
  );
  if (!workflow?.explanation_submitted_at) return null;
  const [[requests]] = await db.execute(
    `SELECT COUNT(*) AS count FROM incident_information_requests
    WHERE incident_id = ? AND status = 'PENDING'`,
    [id]
  );
  const waiting =
    workflow.hearing_status === 'SCHEDULED'
      ? 'Awaiting hearing completion'
      : workflow.phase === 'MANAGEMENT'
        ? 'Awaiting Management approval'
        : Number(requests.count)
          ? 'Awaiting requested information'
          : '';
  const [participants] = await db.execute(
    `SELECT e.personal_email FROM incident_participants p JOIN employees e ON e.record_id=p.employee_record_id WHERE p.incident_id=?`,
    [id]
  );
  return {
    type,
    id,
    phase: 'HR',
    stage: row.status,
    done: row.status === 'CLOSED',
    waiting,
    canTake: (user) =>
      reviewers.has(user.role) &&
      ![
        row.reporter_email,
        row.reported_employee_email,
        ...participants.map((p) => p.personal_email)
      ]
        .filter(Boolean)
        .some((email) => email.toLowerCase() === user.email.toLowerCase())
  };
}
async function event(
  db,
  task,
  action,
  actor,
  remarks = '',
  credit = 0,
  previousOwner = task.owner_email
) {
  await db.execute(
    `INSERT INTO hr_task_events
    (task_id, action, actor_email, previous_owner, owner_email, credit_owner, active_ms, event_ms, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      action,
      actor || 'SYSTEM',
      previousOwner,
      task.owner_email,
      credit ? previousOwner : null,
      credit,
      Date.now(),
      String(remarks).slice(0, 1000)
    ]
  );
  // Serialize revision updates inside the same transaction. MAX(event.id) alone
  // can miss an earlier ID that commits after a later transaction.
  await db.execute(
    'UPDATE hr_task_revision SET revision = revision + 1 WHERE id = 1'
  );
}
function elapsed(task, now = Date.now()) {
  return task.run_started_ms == null
    ? 0
    : WorkTime.milliseconds(Number(task.run_started_ms), now);
}
// Called in the resource's own transaction, after its row has been locked.
async function sync(db, type, id, actor = 'SYSTEM', activity = '') {
  const current = await source(db, type, Number(id));
  if (!current) return null;
  const [existing] = await db.execute(
    `SELECT * FROM hr_tasks WHERE resource_type = ? AND resource_id = ? AND phase = ? FOR UPDATE`,
    [type, id, current.phase]
  );
  if (!existing.length && current.done) return null;
  const now = Date.now();
  if (!existing.length) {
    await db.execute(
      `INSERT IGNORE INTO hr_tasks (resource_type, resource_id, phase, state, stage, waiting_reason, updated_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        id,
        current.phase,
        current.waiting ? 'WAITING' : 'READY',
        current.stage,
        current.waiting,
        now
      ]
    );
  }
  const [[task]] = await db.execute(
    `SELECT * FROM hr_tasks WHERE resource_type = ? AND resource_id = ? AND phase = ? FOR UPDATE`,
    [type, id, current.phase]
  );
  if (!existing.length)
    await event(db, task, 'REGISTERED', actor, current.stage);
  const state = current.done
    ? 'COMPLETED'
    : current.waiting
      ? 'WAITING'
      : 'READY';
  if (
    state !== task.state ||
    task.stage !== current.stage ||
    task.waiting_reason !== current.waiting
  ) {
    const credit = elapsed(task, now);
    const running = state === 'READY' && task.owner_email;
    await db.execute(
      `UPDATE hr_tasks SET state = ?, stage = ?, waiting_reason = ?, active_ms = active_ms + ?,
      run_started_ms = ?, completed_ms = ?, updated_ms = ? WHERE id = ?`,
      [
        state,
        current.stage,
        current.waiting,
        credit,
        running ? now : null,
        current.done ? now : null,
        Math.max(now, Number(task.updated_ms) + 1),
        task.id
      ]
    );
    await event(
      db,
      task,
      current.done ? 'COMPLETED' : current.waiting ? 'PAUSED' : 'RESUMED',
      actor,
      current.waiting || current.stage,
      credit
    );
  }
  if (activity && task.owner_email && actor !== 'SYSTEM')
    await event(db, task, 'ACTIVITY', actor, activity);
  return task.id;
}
async function assertOwner(db, type, id, user) {
  await sync(db, type, id, user.email);
  const current = await source(db, type, Number(id));
  if (!current || !current.canTake(user))
    throw httpError('You cannot review this task.', 403);
  const [[task]] = await db.execute(
    `SELECT * FROM hr_tasks WHERE resource_type = ? AND resource_id = ? AND phase = ? FOR UPDATE`,
    [type, id, current.phase]
  );
  if (
    !task?.owner_email ||
    task.owner_email.toLowerCase() !== user.email.toLowerCase()
  )
    throw httpError(
      task?.owner_email
        ? 'This task belongs to another reviewer. You can still view it.'
        : 'Take this task before reviewing it.',
      409
    );
  if (current.done || current.waiting)
    throw httpError(current.waiting || 'This task is complete.', 409);
}
async function taskInfo(db, type, id, user) {
  if (!viewers.has(user.role)) return null;
  const current = await source(db, type, Number(id));
  if (!current) return null;
  const [[row]] = await db.execute(
    `SELECT t.*, COALESCE(NULLIF(u.full_name, ''), t.owner_email) AS owner_name,
    (SELECT COALESCE(SUM(e.active_ms), 0) FROM hr_task_events e WHERE e.task_id = t.id AND LOWER(e.credit_owner) = LOWER(t.owner_email)) AS owner_ms
    FROM hr_tasks t LEFT JOIN user_roles u ON u.email = t.owner_email
    WHERE t.resource_type = ? AND t.resource_id = ? AND t.phase = ?`,
    [type, id, current.phase]
  );
  if (!row) return null;
  const now = Date.now();
  return {
    id: Number(row.id),
    type,
    resourceId: Number(id),
    owner: row.owner_email,
    ownerName: row.owner_name,
    state: row.state,
    stage: row.stage,
    waitingReason: row.waiting_reason,
    isMine:
      user.role === 'HR' &&
      row.owner_email?.toLowerCase() === user.email.toLowerCase(),
    canTake:
      !row.owner_email &&
      !current.done &&
      !current.waiting &&
      current.canTake(user),
    activeMs: Number(row.owner_ms),
    runStartedMs:
      row.run_started_ms == null ? null : Number(row.run_started_ms),
    takenMs: row.taken_ms == null ? null : Number(row.taken_ms),
    serverNow: now
  };
}
async function attachForms(forms, user) {
  if (!viewers.has(user.role) || !forms.length) return forms;
  const [rows] = await pool.execute(
    `SELECT t.*, COALESCE(NULLIF(u.full_name, ''), t.owner_email) AS owner_name,
    (SELECT COALESCE(SUM(e.active_ms), 0) FROM hr_task_events e WHERE e.task_id = t.id AND LOWER(e.credit_owner) = LOWER(t.owner_email)) AS owner_ms
    FROM hr_tasks t LEFT JOIN user_roles u ON u.email = t.owner_email
    WHERE t.resource_type = 'FORM' AND t.resource_id IN (${forms.map(() => '?').join(',')})`,
    forms.map((form) => form.id)
  );
  const indexed = new Map(
    rows.map((row) => [`${row.resource_id}:${row.phase}`, row])
  );
  const now = Date.now();
  return forms.map((form) => {
    const row = indexed.get(`${form.id}:${form.review_stage}`);
    if (!row) return form;
    const mine =
      user.role === 'HR' &&
      row.owner_email?.toLowerCase() === user.email.toLowerCase();
    return {
      ...form,
      task: {
        id: Number(row.id),
        type: 'FORM',
        resourceId: Number(form.id),
        owner: row.owner_email,
        ownerName: row.owner_name,
        state: row.state,
        stage: row.stage,
        waitingReason: row.waiting_reason,
        isMine: mine,
        canTake:
          user.role === 'HR' &&
          !row.owner_email &&
          form.status === 'PENDING' &&
          form.user_email !== user.email &&
          (row.phase === 'HR' ||
            (user.role === 'HR' &&
              user.is_hr_head &&
              form.head_reviewer_email === user.email)),
        activeMs: Number(row.owner_ms),
        runStartedMs:
          row.run_started_ms == null ? null : Number(row.run_started_ms),
        takenMs: row.taken_ms == null ? null : Number(row.taken_ms),
        serverNow: now
      }
    };
  });
}
async function changeOwner(
  req,
  type,
  resourceId,
  nextOwner,
  reason,
  reassign = false
) {
  const user = await requirePerm(
    req,
    reassign ? 'admin.manage' : 'forms.review'
  );
  if (
    (!reassign && !reviewers.has(user.role)) ||
    (reassign && user.role !== 'ADMIN')
  )
    throw httpError(
      'Only HR can take tasks; ADMIN may assign them for oversight.',
      403
    );
  const id = identity(type, resourceId);
  const remarks = String(reason || '').trim();
  if (reassign && (!remarks || remarks.length > 1000))
    throw httpError(
      'Enter a reassignment reason (up to 1,000 characters).',
      400
    );
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const current = await source(db, type, id, true);
    if (!current || current.done)
      throw httpError('This task is not available for review.', 409);
    if (reassign && type === 'INCIDENT')
      await assertIncidentAssignmentScope(db, id, user);
    await sync(db, type, id, user.email);
    const [[task]] = await db.execute(
      `SELECT * FROM hr_tasks WHERE resource_type = ? AND resource_id = ? AND phase = ? FOR UPDATE`,
      [type, id, current.phase]
    );
    let owner = user;
    if (reassign) {
      const [[account]] = await db.execute(
        'SELECT * FROM user_roles WHERE email = ? AND active = 1',
        [String(nextOwner || '')]
      );
      owner = account;
    } else if (task.owner_email)
      throw httpError(
        'This task has already been taken. Refresh to see its owner.',
        409
      );
    if (!owner || !current.canTake(owner))
      throw httpError(
        'Choose an authorized, active reviewer for this task.',
        400
      );
    if (!reassign && current.waiting) throw httpError(current.waiting, 409);
    if (task.owner_email?.toLowerCase() === owner.email.toLowerCase())
      throw httpError('This reviewer already owns the task.', 409);
    const now = Date.now(),
      credit = elapsed(task, now),
      previous = task.owner_email;
    await db.execute(
      `UPDATE hr_tasks SET owner_email = ?, taken_ms = COALESCE(taken_ms, ?), active_ms = active_ms + ?,
      run_started_ms = ?, updated_ms = ? WHERE id = ?`,
      [
        owner.email,
        now,
        credit,
        current.waiting ? null : now,
        Math.max(now, Number(task.updated_ms) + 1),
        task.id
      ]
    );
    task.owner_email = owner.email;
    await event(
      db,
      task,
      reassign ? 'REASSIGNED' : 'TAKEN',
      user.email,
      remarks,
      credit,
      previous
    );
    await require('./AuditService').logAudit(
      user.email,
      reassign ? 'HR_TASK_REASSIGNED' : 'HR_TASK_TAKEN',
      `${type}:${id}`,
      `${previous || 'Unassigned'} -> ${owner.email}${remarks ? ': ' + remarks : ''}`,
      db
    );
    if (reassign && owner.email !== user.email) {
      if (type === 'FORM')
        await db.execute(
          "DELETE FROM inbox_views WHERE user_email = ? AND item_type = 'FORM' AND item_id = ?",
          [owner.email, id]
        );
      else
        await db.execute(
          `INSERT IGNORE INTO incident_notifications (incident_id, recipient_email, notification_type)
        VALUES (?, ?, ?)`,
          [id, owner.email, `TASK_${now}`]
        );
    }
    await db.commit();
    return { ok: true };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
async function getRevision(req) {
  const user = await requirePerm(req, 'inbox.read');
  if (!viewers.has(user.role)) throw httpError('Access denied.', 403);
  const [[row]] = await pool.execute(
    'SELECT revision FROM hr_task_revision WHERE id = 1'
  );
  return { revision: String(row.revision) };
}
async function assignees(req, type, resourceId) {
  const user = await requirePerm(req, 'admin.manage');
  if (user.role !== 'ADMIN')
    throw httpError('Only ADMIN can assign review tasks.', 403);
  const current = await source(pool, type, identity(type, resourceId));
  if (!current || current.done) return [];
  if (type === 'INCIDENT')
    await assertIncidentAssignmentScope(pool, Number(resourceId), user);
  const [rows] = await pool.execute(
    "SELECT email, full_name, role, is_hr_head, active FROM user_roles WHERE active = 1 AND role = 'HR' ORDER BY full_name, email"
  );
  return rows
    .filter((account) => current.canTake(account))
    .map((account) => ({
      email: account.email,
      name: account.full_name || account.email,
      role: account.role
    }));
}
async function assertIncidentAssignmentScope(db, id, user) {
  const access = require('./incident-management/WorkflowAccess');
  const row = await access.load(db, id),
    rights = await access.access(db, user, row);
  if (
    !(await access.adminHead(db, user.email)) ||
    !(rights.assigned || rights.manager)
  )
    throw httpError(
      'Only an ADMIN HEAD assigned to this incident may reassign its HR task.',
      403
    );
}
// Reporting-line changes release a Head HR task so the new authorized Head HR
// still explicitly takes it. Already-earned time stays with the previous owner.
async function releaseChangedHeadTasks(db, actor) {
  const [rows] =
    await db.execute(`SELECT t.*, f.review_stage FROM hr_tasks t JOIN user_forms f ON f.id = t.resource_id
    WHERE t.resource_type = 'FORM' AND t.phase = 'HEAD' AND t.state <> 'COMPLETED'
      AND (f.review_stage = 'HR' OR (t.owner_email IS NOT NULL
        AND (f.head_reviewer_email IS NULL OR LOWER(t.owner_email) <> LOWER(f.head_reviewer_email)))) FOR UPDATE`);
  for (const task of rows) {
    if (task.owner_email)
      await releaseOwner(
        db,
        task,
        actor,
        'Assigned Head HR changed. Awaiting the new reviewer to take the task.'
      );
    if (task.review_stage === 'HR') {
      // Keep the task identity and earned time instead of creating a second task.
      await db.execute(
        `UPDATE hr_tasks SET phase = 'HR', stage = 'HR', state = 'READY',
          waiting_reason = '', run_started_ms = NULL, updated_ms = ? WHERE id = ?`,
        [Math.max(Date.now(), Number(task.updated_ms) + 1), task.id]
      );
      await event(
        db,
        task,
        'REROUTED',
        actor,
        'Head HR own form moved to HR review. Another HR must take the task.'
      );
    }
  }
}
async function releaseOwner(db, task, actor, reason) {
  const now = Date.now(),
    credit = elapsed(task, now),
    previous = task.owner_email;
  await db.execute(
    'UPDATE hr_tasks SET owner_email = NULL, run_started_ms = NULL, active_ms = active_ms + ?, updated_ms = ? WHERE id = ?',
    [credit, now, task.id]
  );
  task.owner_email = null;
  await event(db, task, 'RELEASED', actor, reason, credit, previous);
}
async function releaseAdminOwnedTasks() {
  const [candidates] =
    await pool.execute(`SELECT t.id, t.resource_type, t.resource_id FROM hr_tasks t
    JOIN user_roles u ON u.email = t.owner_email WHERE u.role = 'ADMIN' AND t.state NOT IN ('COMPLETED','ARCHIVED')`);
  for (const candidate of candidates) {
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      // Follow the same parent-then-task lock order as taking and processing.
      await source(
        db,
        candidate.resource_type,
        Number(candidate.resource_id),
        true
      );
      const [[task]] = await db.execute(
        `SELECT t.* FROM hr_tasks t JOIN user_roles u ON u.email = t.owner_email
        WHERE t.id = ? AND u.role = 'ADMIN' AND t.state <> 'COMPLETED' FOR UPDATE`,
        [candidate.id]
      );
      if (task)
        await releaseOwner(
          db,
          task,
          'SYSTEM',
          'ADMIN access changed to view-only. Available for an HR reviewer.'
        );
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      db.release();
    }
  }
}
module.exports = {
  sync,
  assertOwner,
  taskInfo,
  attachForms,
  elapsed,
  takeTask: (req, type, id) => changeOwner(req, type, id),
  reassignTask: (req, type, id, email, reason) =>
    changeOwner(req, type, id, email, reason, true),
  getRevision,
  assignees,
  releaseChangedHeadTasks,
  releaseAdminOwnedTasks
};
