const { responseCalendarDays } = require('../../shared/IncidentWorkflow');

// Version 1 records remain intact. Version 2 uses the section-based workflow.
async function initializeIncidentWorkflowSchema(pool) {
  for (const [table, column, definition] of [
    [
      'incident_reports',
      'workflow_version',
      'TINYINT UNSIGNED NOT NULL DEFAULT 1'
    ],
    ['incident_reports', 'group_id', 'BIGINT UNSIGNED NULL'],
    [
      'incident_evidence',
      'section_number',
      'TINYINT UNSIGNED NOT NULL DEFAULT 2'
    ],
    [
      'incident_information_requests',
      'section_number',
      'TINYINT UNSIGNED NOT NULL DEFAULT 4'
    ]
  ]) {
    const [columns] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [
      column
    ]);
    if (!columns.length)
      await pool.query(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
      );
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS incident_groups (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    reporter_email VARCHAR(191) NOT NULL,
    department VARCHAR(191) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS incident_department_reviewers (
    department VARCHAR(191) NOT NULL PRIMARY KEY,
    reviewer_email VARCHAR(191) NOT NULL,
    updated_by VARCHAR(191) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [reviewerPrimaryKey] = await pool.query(
    "SHOW INDEX FROM incident_department_reviewers WHERE Key_name = 'PRIMARY'"
  );
  if (
    reviewerPrimaryKey.length &&
    !reviewerPrimaryKey.some(
      (column) => column.Column_name === 'reviewer_email'
    )
  )
    await pool.query(
      'ALTER TABLE incident_department_reviewers DROP PRIMARY KEY, ADD PRIMARY KEY (department, reviewer_email)'
    );
  await pool.query(`CREATE TABLE IF NOT EXISTS incident_workflow_settings (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    management_email VARCHAR(191) NULL,
    updated_by VARCHAR(191) NULL,
    reviewer_defaults_seeded TINYINT UNSIGNED NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [settingsColumns] = await pool.query(
    "SHOW COLUMNS FROM incident_workflow_settings LIKE 'reviewer_defaults_seeded'"
  );
  if (!settingsColumns.length)
    await pool.query(
      'ALTER TABLE incident_workflow_settings ADD COLUMN reviewer_defaults_seeded TINYINT UNSIGNED NOT NULL DEFAULT 0'
    );
  await pool.query(
    'INSERT IGNORE INTO incident_workflow_settings (id) VALUES (1)'
  );
  await seedKnownReviewers(pool);
  await pool.query(`CREATE TABLE IF NOT EXISTS incident_workflows (
    incident_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    report JSON NOT NULL,
    nte JSON NULL,
    receipt JSON NULL,
    explanation JSON NULL,
    explanation_draft JSON NULL,
    hr_review JSON NULL,
    management JSON NULL,
    decision JSON NULL,
    phase VARCHAR(24) NOT NULL DEFAULT 'HEAD',
    head_pool TINYINT UNSIGNED NOT NULL DEFAULT 0,
    nte_issued_at DATETIME NULL,
    received_at DATETIME NULL,
    deadline_date DATE NULL,
    explanation_submitted_at DATETIME NULL,
    hearing_status VARCHAR(16) NOT NULL DEFAULT 'NONE',
    hearing_details TEXT NULL,
    hearing_completed_at DATETIME NULL,
    hearing_completion_notes TEXT NULL,
    management_email VARCHAR(191) NULL,
    approved_at DATETIME NULL,
    decision_issued_at DATETIME NULL,
    closed_at DATETIME NULL,
    closure_reason TEXT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    KEY idx_workflow_phase (phase, incident_id),
    KEY idx_workflow_deadline (deadline_date, explanation_submitted_at),
    KEY idx_workflow_management (management_email, phase)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  for (const [column, definition] of [
    ['hearing_completed_at', 'DATETIME NULL'],
    ['hearing_completion_notes', 'TEXT NULL']
  ]) {
    const [columns] = await pool.query(
      'SHOW COLUMNS FROM incident_workflows LIKE ?',
      [column]
    );
    if (!columns.length)
      await pool.query(
        `ALTER TABLE incident_workflows ADD COLUMN ${column} ${definition}`
      );
  }
  // Fill missing issued deadlines without shortening existing periods or extensions.
  await pool.execute(
    `UPDATE incident_workflows w JOIN incident_reports r ON r.id=w.incident_id
    SET w.deadline_date=DATE_ADD(COALESCE(
      STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(w.nte,'$.dateIssued')),'%Y-%m-%d'),
      DATE(w.nte_issued_at)),INTERVAL ? DAY)
    WHERE r.workflow_version=2 AND r.status<>'CLOSED' AND w.phase='EMPLOYEE'
      AND w.nte_issued_at IS NOT NULL AND w.deadline_date IS NULL`,
    [responseCalendarDays]
  );
  await pool.query(`CREATE TABLE IF NOT EXISTS incident_extension_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    incident_id BIGINT UNSIGNED NOT NULL,
    requested_by VARCHAR(191) NOT NULL,
    requested_days TINYINT UNSIGNED NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    approved_days TINYINT UNSIGNED NULL,
    previous_deadline DATE NULL,
    new_deadline DATE NULL,
    reviewed_by VARCHAR(191) NULL,
    review_reason TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME NULL,
    KEY idx_extension_case (incident_id, status, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS incident_workflow_reminders (
    incident_id BIGINT UNSIGNED NOT NULL,
    employee_email VARCHAR(191) NOT NULL,
    reminder_date DATE NOT NULL,
    PRIMARY KEY (incident_id, employee_email, reminder_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS incident_workflow_documents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    incident_id BIGINT UNSIGNED NOT NULL,
    document_type VARCHAR(32) NOT NULL,
    snapshot JSON NOT NULL,
    recorded_by VARCHAR(191) NOT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_workflow_document (incident_id, document_type, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [indexes] = await pool.execute(
    "SHOW INDEX FROM incident_reports WHERE Key_name = 'idx_incident_group'"
  );
  if (!indexes.length)
    await pool.query(
      'ALTER TABLE incident_reports ADD INDEX idx_incident_group (group_id, id)'
    );
}

// Apply the requested department defaults once using only real, active matching
// accounts. Missing future HEAD accounts remain unassigned; no accounts are made.
async function seedKnownReviewers(pool) {
  const [[settings]] = await pool.query(
    'SELECT reviewer_defaults_seeded AS seeded FROM incident_workflow_settings WHERE id = 1'
  );
  if (Number(settings.seeded)) return;
  const defaults = [
    ['Paso Warehouse', 'HEAD', ['head1', 'h1'], ['head1']],
    ['Dalisay/E-commerce', 'HEAD', ['head2', 'h2'], ['head2']],
    ['Marketing', 'ADMIN', ['admin1', 'a1'], ['admin1', 'administrator1']],
    ['Procurement', 'ADMIN', ['admin1', 'a1'], ['admin1', 'administrator1']],
    ['Heads', 'ADMIN', ['admin1', 'a1'], ['admin1', 'administrator1']],
    ['Heads', 'ADMIN', ['admin2', 'a2'], ['admin2', 'administrator2']],
    ['Accounting', 'ADMIN', ['admin2', 'a2'], ['admin2', 'administrator2']],
    ['HR', 'ADMIN', ['admin2', 'a2'], ['admin2', 'administrator2']],
    [
      'Human Resources',
      'ADMIN',
      ['admin2', 'a2'],
      ['admin2', 'administrator2']
    ],
    ['Printing', 'HEAD', ['head3', 'h3'], ['head3']],
    ['Sales', 'HEAD', ['head4', 'h4'], ['head4']],
    ['Stores', 'HEAD', ['head5', 'h5'], ['head5']]
  ];
  for (const [department, role, emailNames, fullNames] of defaults) {
    await pool.query(
      'DELETE FROM incident_department_reviewers WHERE LOWER(department)=LOWER(?)',
      [department]
    );
    const emailMarks = emailNames.map(() => '?').join(',');
    const nameMarks = fullNames.map(() => '?').join(',');
    const [accounts] = await pool.query(
      `SELECT u.email, LOWER(SUBSTRING_INDEX(u.email, '@', 1)) AS email_name,
      LOWER(REPLACE(REPLACE(u.full_name, ' ', ''), '.', '')) AS full_name_key
      FROM user_roles u WHERE u.role = ? AND u.active = 1
      AND (LOWER(SUBSTRING_INDEX(u.email, '@', 1)) IN (${emailMarks})
        OR LOWER(REPLACE(REPLACE(u.full_name, ' ', ''), '.', '')) IN (${nameMarks}))
      AND EXISTS (SELECT 1 FROM employees e WHERE LOWER(e.personal_email)=LOWER(u.email)
        AND e.record_status <> 'Archived') ORDER BY u.email`,
      [role, ...emailNames, ...fullNames]
    );
    const account = accounts.find(
      (candidate) =>
        emailNames.includes(candidate.email_name) ||
        fullNames.includes(candidate.full_name_key)
    );
    if (account)
      await pool.query(
        'INSERT IGNORE INTO incident_department_reviewers (department, reviewer_email, updated_by) VALUES (?, ?, ?)',
        [department, account.email, 'SYSTEM_DEFAULT']
      );
  }
  await pool.query(
    'UPDATE incident_workflow_settings SET reviewer_defaults_seeded = 1 WHERE id = 1'
  );
}
module.exports = { initializeIncidentWorkflowSchema };
