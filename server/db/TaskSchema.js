const WorkTime = require('../../shared/WorkTime');
// Preserve task history; remove only the retired duration-target configuration.
async function initializeTaskSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS hr_tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    resource_type VARCHAR(12) NOT NULL,
    resource_id BIGINT UNSIGNED NOT NULL,
    phase VARCHAR(8) NOT NULL DEFAULT 'HR',
    owner_email VARCHAR(191) NULL,
    state VARCHAR(12) NOT NULL DEFAULT 'READY',
    stage VARCHAR(40) NOT NULL,
    waiting_reason VARCHAR(191) NOT NULL DEFAULT '',
    taken_ms BIGINT NULL,
    run_started_ms BIGINT NULL,
    active_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_ms BIGINT NOT NULL,
    completed_ms BIGINT NULL,
    UNIQUE KEY uq_hr_task_resource (resource_type, resource_id, phase),
    KEY idx_hr_task_owner (owner_email, state),
    KEY idx_hr_task_completion (completed_ms)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS hr_task_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    task_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(40) NOT NULL,
    actor_email VARCHAR(191) NOT NULL,
    previous_owner VARCHAR(191) NULL,
    owner_email VARCHAR(191) NULL,
    credit_owner VARCHAR(191) NULL,
    active_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
    event_ms BIGINT NOT NULL,
    remarks VARCHAR(1000) NOT NULL DEFAULT '',
    KEY idx_hr_task_event (task_id, id),
    KEY idx_hr_task_event_date (event_ms, action),
    KEY idx_hr_task_credit (task_id, credit_owner),
    CONSTRAINT fk_hr_task_event FOREIGN KEY (task_id) REFERENCES hr_tasks(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS hr_task_revision (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 0
  ) ENGINE=InnoDB`);
  await pool.query('INSERT IGNORE INTO hr_task_revision (id) VALUES (1)');
  const [oldSettings] = await pool.query(
    "SHOW TABLES LIKE 'hr_performance_settings'"
  );
  if (oldSettings.length) {
    const [revisionColumn] = await pool.query(
      "SHOW COLUMNS FROM hr_performance_settings LIKE 'revision'"
    );
    if (revisionColumn.length)
      await pool.query(`UPDATE hr_task_revision SET revision = GREATEST(revision,
      COALESCE((SELECT MAX(revision) FROM hr_performance_settings), 0)) WHERE id = 1`);
    await pool.query('DROP TABLE hr_performance_settings');
  }
  for (const [table, name, columns] of [
    ['hr_task_events', 'idx_hr_task_credit', 'task_id, credit_owner'],
    ['user_forms', 'idx_form_completion_kpi', 'reviewed_at, reviewed_by'],
    [
      'incident_activity',
      'idx_incident_action_kpi',
      'action, created_at, actor_email'
    ]
  ]) {
    const [indexes] = await pool.query(
      `SHOW INDEX FROM ${table} WHERE Key_name = ?`,
      [name]
    );
    if (!indexes.length)
      await pool.query(`ALTER TABLE ${table} ADD INDEX ${name} (${columns})`);
  }
  const now = Date.now();
  const [legacyTasks] =
    await pool.execute(`SELECT t.id,t.resource_id FROM hr_tasks t JOIN incident_reports i ON i.id=t.resource_id
    WHERE t.resource_type='INCIDENT' AND i.workflow_version=1 AND t.state NOT IN ('COMPLETED','ARCHIVED')`);
  for (const candidate of legacyTasks) {
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      await db.execute(
        'SELECT id FROM incident_reports WHERE id=? FOR UPDATE',
        [candidate.resource_id]
      );
      const [[task]] = await db.execute(
        'SELECT * FROM hr_tasks WHERE id=? FOR UPDATE',
        [candidate.id]
      );
      if (task && !['COMPLETED', 'ARCHIVED'].includes(task.state)) {
        const earned =
          task.run_started_ms == null
            ? 0
            : WorkTime.milliseconds(Number(task.run_started_ms), now);
        await db.execute(
          "UPDATE hr_tasks SET state='ARCHIVED',active_ms=active_ms+?,run_started_ms=NULL,updated_ms=? WHERE id=?",
          [earned, now, task.id]
        );
        await db.execute(
          `INSERT INTO hr_task_events (task_id,action,actor_email,previous_owner,owner_email,credit_owner,active_ms,event_ms,remarks)
          VALUES (?,'ARCHIVED','SYSTEM',?,?,?,?,?,'Legacy incident made read-only; recorded time retained.')`,
          [
            task.id,
            task.owner_email,
            task.owner_email,
            earned ? task.owner_email : null,
            earned,
            now
          ]
        );
        await db.execute(
          'UPDATE hr_task_revision SET revision=revision+1 WHERE id=1'
        );
      }
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      db.release();
    }
  }
  await pool.execute(
    `INSERT IGNORE INTO hr_tasks
    (resource_type, resource_id, phase, stage, updated_ms)
    SELECT 'FORM', f.id, IF(f.review_stage = 'HEAD' AND f.template_key <> 'nexus-accountability', 'HEAD', 'HR'), f.review_stage, ?
    FROM user_forms f JOIN user_roles u ON u.email = f.user_email
    WHERE f.status = 'PENDING' AND (f.review_stage = 'HR' OR f.template_key = 'nexus-accountability' OR u.role = 'HR')`,
    [now]
  );
  await pool.execute(
    `INSERT IGNORE INTO hr_tasks
    (resource_type, resource_id, stage, state, waiting_reason, updated_ms)
    SELECT 'INCIDENT', i.id, i.status,
      IF(w.hearing_status = 'SCHEDULED' OR w.phase = 'MANAGEMENT' OR EXISTS (
        SELECT 1 FROM incident_information_requests r WHERE r.incident_id = i.id AND r.status = 'PENDING'), 'WAITING', 'READY'),
      CASE WHEN w.hearing_status = 'SCHEDULED' THEN 'Awaiting hearing completion'
        WHEN w.phase = 'MANAGEMENT' THEN 'Awaiting Management approval'
        WHEN EXISTS (SELECT 1 FROM incident_information_requests r WHERE r.incident_id = i.id AND r.status = 'PENDING')
          THEN 'Awaiting requested information' ELSE '' END, ?
    FROM incident_reports i JOIN incident_workflows w ON w.incident_id = i.id
    WHERE i.workflow_version = 2 AND w.explanation_submitted_at IS NOT NULL AND i.status <> 'CLOSED'`,
    [now]
  );
}
module.exports = { initializeTaskSchema };
