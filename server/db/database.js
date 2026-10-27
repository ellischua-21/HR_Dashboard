const mysql = require('mysql2/promise');
const { EMP_FIELDS, LISTS } = require('../config/EmployeeSchema');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hr_dashboard',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  charset: 'utf8mb4'
});

const quote = (name) => '`' + name.replace(/`/g, '``') + '`';

function employeeColumn(field) {
  const [key, , type] = field;
  if (key === 'record_id') return `${quote(key)} VARCHAR(20) NOT NULL`;
  if (key === 'seq_no') return `${quote(key)} INT NULL`;
  if (type === 'json') return `${quote(key)} JSON NULL`;
  if (type === 'date') return `${quote(key)} DATE NULL`;
  if (type === 'number') return `${quote(key)} DECIMAL(12,2) NULL`;
  if (key === 'emp_no') return `${quote(key)} VARCHAR(191) NULL`;
  return `${quote(key)} TEXT NULL`;
}

async function initializeDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS employees (
    ${EMP_FIELDS.map(employeeColumn).join(',\n    ')},
    PRIMARY KEY (${quote('record_id')}),
    UNIQUE KEY uq_employee_seq (${quote('seq_no')}),
    UNIQUE KEY uq_employee_number (${quote('emp_no')}),
    KEY idx_employee_company (${quote('company')}(64)),
    KEY idx_employee_department (${quote('department')}(64)),
    KEY idx_employee_location (${quote('location')}(64)),
    KEY idx_employee_status (${quote('status')}(64)),
    KEY idx_employee_rank (${quote('rank')}(64)),
    KEY idx_employee_employment_date (${quote('date_employed')})
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Keep the existing personal login address while removing the obsolete Email and
  // Corporate Email employee fields. Older installs used corp_email for Personal Email.
  const [personalEmailColumn] = await pool.query(
    "SHOW COLUMNS FROM employees LIKE 'personal_email'"
  );
  const [legacyCorpEmailColumn] = await pool.query(
    "SHOW COLUMNS FROM employees LIKE 'corp_email'"
  );
  if (!personalEmailColumn.length) {
    if (legacyCorpEmailColumn.length) {
      await pool.query(
        'ALTER TABLE employees CHANGE COLUMN corp_email personal_email TEXT NULL'
      );
    } else {
      await pool.query(
        'ALTER TABLE employees ADD COLUMN personal_email TEXT NULL'
      );
    }
  }
  for (const obsoleteColumn of ['corp_email', 'email']) {
    const [column] = await pool.query(
      `SHOW COLUMNS FROM employees LIKE '${obsoleteColumn}'`
    );
    if (column.length)
      await pool.query(
        `ALTER TABLE employees DROP COLUMN \`${obsoleteColumn}\``
      );
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS user_roles (
    email VARCHAR(191) NOT NULL,
    full_name VARCHAR(191) NOT NULL DEFAULT '',
    role VARCHAR(40) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    extra_perms TEXT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const [userColumns] = await pool.query(
    "SHOW COLUMNS FROM user_roles LIKE 'full_name'"
  );
  if (!userColumns.length) {
    await pool.query(
      "ALTER TABLE user_roles ADD COLUMN full_name VARCHAR(191) NOT NULL DEFAULT '' AFTER email"
    );
  }
  const [headColumns] = await pool.query(
    "SHOW COLUMNS FROM user_roles LIKE 'assigned_head_email'"
  );
  if (!headColumns.length) {
    await pool.query(
      'ALTER TABLE user_roles ADD COLUMN assigned_head_email VARCHAR(191) NULL AFTER role'
    );
  }
  const [hrHeadColumns] = await pool.query(
    "SHOW COLUMNS FROM user_roles LIKE 'is_hr_head'"
  );
  if (!hrHeadColumns.length) {
    await pool.query(
      'ALTER TABLE user_roles ADD COLUMN is_hr_head TINYINT(1) NOT NULL DEFAULT 0 AFTER assigned_head_email'
    );
  }
  await pool.query(
    "UPDATE user_roles SET role = 'STAFF' WHERE role IN ('USER', 'MANAGER')"
  );
  await pool.query(
    "UPDATE user_roles SET role = 'STAFF' WHERE role = 'EXECUTIVE'"
  );
  await pool.query("UPDATE user_roles SET role = 'HR' WHERE role = 'HR_STAFF'");
  await pool.query(
    "UPDATE user_roles SET role = 'ADMIN' WHERE role IN ('SYSTEM_ADMIN', 'HR_ADMIN')"
  );

  await pool.query(`CREATE TABLE IF NOT EXISTS account_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    full_name VARCHAR(191) NOT NULL,
    email VARCHAR(191) NOT NULL,
    assigned_role VARCHAR(16) NOT NULL DEFAULT 'STAFF',
    assigned_head_email VARCHAR(191) NULL,
    password_hash VARCHAR(255) NOT NULL,
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_account_request_email (email),
    KEY idx_account_request_date (requested_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const accountRequestColumns = [
    ['assigned_role', "VARCHAR(16) NOT NULL DEFAULT 'STAFF' AFTER email"],
    ['assigned_head_email', 'VARCHAR(191) NULL AFTER assigned_role']
  ];
  for (const [column, definition] of accountRequestColumns) {
    const [existing] = await pool.query(
      `SHOW COLUMNS FROM account_requests LIKE '${column}'`
    );
    if (!existing.length) {
      await pool.query(
        `ALTER TABLE account_requests ADD COLUMN \`${column}\` ${definition}`
      );
    }
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS user_forms (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    control_no VARCHAR(32) NULL,
    user_email VARCHAR(191) NOT NULL,
    template_key VARCHAR(64) NOT NULL,
    form_data JSON NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    review_stage VARCHAR(10) NOT NULL DEFAULT 'HR',
    head_reviewer_email VARCHAR(191) NULL,
    head_signature MEDIUMTEXT NULL,
    head_signed_by VARCHAR(191) NULL,
    head_signed_at TIMESTAMP NULL,
    hr_signature MEDIUMTEXT NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(191) NULL,
    reviewed_at TIMESTAMP NULL,
    review_notes VARCHAR(500) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_form_control (control_no),
    KEY idx_user_form_owner (user_email, submitted_at),
    KEY idx_user_form_status (status, submitted_at),
    KEY idx_user_form_head_queue (head_reviewer_email, review_stage, submitted_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const formColumns = [
    ['review_stage', "VARCHAR(10) NOT NULL DEFAULT 'HR' AFTER status"],
    ['head_reviewer_email', 'VARCHAR(191) NULL AFTER review_stage'],
    ['head_signature', 'MEDIUMTEXT NULL AFTER head_reviewer_email'],
    ['head_signed_by', 'VARCHAR(191) NULL AFTER head_signature'],
    ['head_signed_at', 'TIMESTAMP NULL AFTER head_signed_by'],
    ['hr_signature', 'MEDIUMTEXT NULL AFTER head_signed_at']
  ];
  for (const [column, definition] of formColumns) {
    const [existing] = await pool.query(
      `SHOW COLUMNS FROM user_forms LIKE '${column}'`
    );
    if (!existing.length) {
      await pool.query(
        `ALTER TABLE user_forms ADD COLUMN \`${column}\` ${definition}`
      );
    }
  }
  const [headIndexes] = await pool.query(
    "SHOW INDEX FROM user_forms WHERE Key_name = 'idx_user_form_head_queue'"
  );
  if (!headIndexes.length) {
    await pool.query(
      'ALTER TABLE user_forms ADD KEY idx_user_form_head_queue (head_reviewer_email, review_stage, submitted_at)'
    );
  }
  await pool.query(
    "UPDATE user_forms SET review_stage = 'HR' WHERE review_stage NOT IN ('HEAD', 'HR')"
  );

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_reports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    case_number VARCHAR(20) NOT NULL,
    reporter_email VARCHAR(191) NOT NULL,
    reporter_employee_id VARCHAR(20) NULL,
    reporter_name VARCHAR(191) NOT NULL,
    department VARCHAR(191) NOT NULL DEFAULT '',
    position VARCHAR(191) NOT NULL DEFAULT '',
    reported_employee_id VARCHAR(20) NOT NULL,
    reported_employee_email VARCHAR(191) NOT NULL,
    reported_employee_name VARCHAR(191) NOT NULL,
    assigned_head_email VARCHAR(191) NULL,
    date_reported DATE NOT NULL,
    subject VARCHAR(191) NOT NULL,
    incident_date DATE NOT NULL,
    location VARCHAR(191) NOT NULL,
    incident_time TIME NOT NULL,
    description MEDIUMTEXT NOT NULL,
    comments TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING SIGNATURE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_incident_case_number (case_number),
    KEY idx_incident_reporter (reporter_email, created_at),
    KEY idx_incident_employee (reported_employee_email, status, created_at),
    KEY idx_incident_head (assigned_head_email, status, created_at),
    KEY idx_incident_status (status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [incidentReporterIdColumn] = await pool.query(
    "SHOW COLUMNS FROM incident_reports LIKE 'reporter_employee_id'"
  );
  if (
    incidentReporterIdColumn[0] &&
    incidentReporterIdColumn[0].Null === 'NO'
  ) {
    await pool.query(
      'ALTER TABLE incident_reports MODIFY COLUMN reporter_employee_id VARCHAR(20) NULL'
    );
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_case_sequences (
    case_year SMALLINT UNSIGNED NOT NULL,
    sequence_value INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (case_year)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_participants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    incident_id BIGINT UNSIGNED NOT NULL,
    participant_type VARCHAR(16) NOT NULL,
    employee_record_id VARCHAR(20) NULL,
    full_name VARCHAR(191) NOT NULL,
    sort_order TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_incident_participants (incident_id, participant_type, sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_signatures (
    incident_id BIGINT UNSIGNED NOT NULL,
    signatory_role VARCHAR(16) NOT NULL,
    signer_email VARCHAR(191) NOT NULL,
    signature_data MEDIUMTEXT NOT NULL,
    signed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (incident_id, signatory_role),
    KEY idx_incident_signature_signer (signer_email, signed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_evidence (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    incident_id BIGINT UNSIGNED NOT NULL,
    file_name VARCHAR(191) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    byte_size INT UNSIGNED NOT NULL,
    file_data MEDIUMBLOB NOT NULL,
    uploaded_by VARCHAR(191) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_incident_evidence_case (incident_id, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    incident_id BIGINT UNSIGNED NOT NULL,
    recipient_email VARCHAR(191) NOT NULL,
    notification_type VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    viewed_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_incident_notification (incident_id, recipient_email, notification_type),
    KEY idx_incident_notification_inbox (recipient_email, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_activity (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    incident_id BIGINT UNSIGNED NOT NULL,
    actor_email VARCHAR(191) NOT NULL,
    action VARCHAR(40) NOT NULL,
    details TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_incident_activity_case (incident_id, created_at, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_information_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    incident_id BIGINT UNSIGNED NOT NULL,
    requested_by VARCHAR(191) NOT NULL,
    recipient_email VARCHAR(191) NOT NULL,
    request_text TEXT NOT NULL,
    response_text TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    responded_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_incident_info_request_case (incident_id, created_at),
    KEY idx_incident_info_request_recipient (recipient_email, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const [incidentEvidenceRequestColumn] = await pool.query(
    "SHOW COLUMNS FROM incident_evidence LIKE 'request_id'"
  );
  if (!incidentEvidenceRequestColumn.length) {
    await pool.query(
      'ALTER TABLE incident_evidence ADD COLUMN request_id BIGINT UNSIGNED NULL AFTER incident_id'
    );
    await pool.query(
      'ALTER TABLE incident_evidence ADD KEY idx_incident_evidence_request (request_id, id)'
    );
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_code_provisions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    provision_code VARCHAR(100) NOT NULL,
    title VARCHAR(191) NOT NULL,
    description TEXT NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_by VARCHAR(191) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_incident_code_provision (provision_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_code_rules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    provision_id BIGINT UNSIGNED NOT NULL,
    violation_title VARCHAR(191) NOT NULL,
    severity VARCHAR(24) NOT NULL,
    occurrence_scope VARCHAR(24) NOT NULL DEFAULT 'SAME_RULE',
    occurrence_window_days INT UNSIGNED NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_by VARCHAR(191) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_incident_code_rules (provision_id, active, severity)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_code_rule_actions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    rule_id BIGINT UNSIGNED NOT NULL,
    prior_offenses INT UNSIGNED NOT NULL DEFAULT 0,
    decision_type VARCHAR(32) NOT NULL DEFAULT 'OTHER_CORRECTIVE_ACTION',
    corrective_action VARCHAR(191) NOT NULL,
    details TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_incident_code_rule_action (rule_id, prior_offenses),
    KEY idx_incident_code_action_rule (rule_id, prior_offenses)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const [incidentActionDecisionTypeColumn] = await pool.query(
    "SHOW COLUMNS FROM incident_code_rule_actions LIKE 'decision_type'"
  );
  if (!incidentActionDecisionTypeColumn.length) {
    await pool.query(
      "ALTER TABLE incident_code_rule_actions ADD COLUMN decision_type VARCHAR(32) NOT NULL DEFAULT 'OTHER_CORRECTIVE_ACTION' AFTER prior_offenses"
    );
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_evaluations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    incident_id BIGINT UNSIGNED NOT NULL,
    finding VARCHAR(24) NOT NULL,
    findings MEDIUMTEXT NOT NULL,
    rule_id BIGINT UNSIGNED NULL,
    violation_title VARCHAR(191) NULL,
    code_reference VARCHAR(191) NULL,
    severity VARCHAR(24) NULL,
    previous_offenses INT UNSIGNED NOT NULL DEFAULT 0,
    suggested_action VARCHAR(191) NULL,
    recommended_action VARCHAR(191) NULL,
    recommendation_justification TEXT NOT NULL,
    remarks TEXT NOT NULL,
    evaluated_by VARCHAR(191) NOT NULL,
    evaluated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_incident_evaluation_case (incident_id),
    KEY idx_incident_evaluation_rule (rule_id, severity)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_evaluation_allowed_actions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    evaluation_id BIGINT UNSIGNED NOT NULL,
    prior_offenses INT UNSIGNED NOT NULL,
    decision_type VARCHAR(32) NOT NULL,
    corrective_action VARCHAR(191) NOT NULL,
    details TEXT NOT NULL,
    PRIMARY KEY (id),
    KEY idx_incident_eval_allowed_actions (evaluation_id, prior_offenses)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [incidentEvaluationActionTypeColumn] = await pool.query(
    "SHOW COLUMNS FROM incident_evaluation_allowed_actions LIKE 'decision_type'"
  );
  if (!incidentEvaluationActionTypeColumn.length) {
    await pool.query(
      "ALTER TABLE incident_evaluation_allowed_actions ADD COLUMN decision_type VARCHAR(32) NOT NULL DEFAULT 'OTHER_CORRECTIVE_ACTION' AFTER prior_offenses"
    );
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_decisions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    incident_id BIGINT UNSIGNED NOT NULL,
    evaluation_id BIGINT UNSIGNED NOT NULL,
    outcome VARCHAR(32) NOT NULL,
    violation_title VARCHAR(191) NULL,
    code_reference VARCHAR(191) NULL,
    severity VARCHAR(24) NULL,
    final_action VARCHAR(191) NULL,
    effective_date DATE NULL,
    decision_reason TEXT NOT NULL,
    approver_email VARCHAR(191) NOT NULL,
    approver_name VARCHAR(191) NOT NULL,
    approval_signature MEDIUMTEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ISSUED',
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    closure_reason TEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_incident_decision_case (incident_id),
    KEY idx_incident_decision_status (status, issued_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_disciplinary_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    incident_id BIGINT UNSIGNED NOT NULL,
    decision_id BIGINT UNSIGNED NOT NULL,
    employee_email VARCHAR(191) NOT NULL,
    rule_id BIGINT UNSIGNED NULL,
    violation_title VARCHAR(191) NOT NULL,
    code_reference VARCHAR(191) NOT NULL,
    severity VARCHAR(24) NOT NULL,
    corrective_action VARCHAR(191) NOT NULL,
    effective_date DATE NULL,
    finalized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_incident_disciplinary_case (incident_id),
    KEY idx_incident_disciplinary_employee (employee_email, finalized_at),
    KEY idx_incident_disciplinary_rule (rule_id, finalized_at),
    KEY idx_incident_disciplinary_severity (severity, finalized_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_ntes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    incident_id BIGINT UNSIGNED NOT NULL,
    provision_id BIGINT UNSIGNED NOT NULL,
    provision_code VARCHAR(100) NOT NULL,
    provision_title VARCHAR(191) NOT NULL,
    provision_text TEXT NOT NULL,
    allegation MEDIUMTEXT NOT NULL,
    issuance_date DATE NOT NULL,
    receipt_date DATE NOT NULL,
    response_working_days TINYINT UNSIGNED NOT NULL DEFAULT 5,
    deadline_date DATE NOT NULL,
    signer_email VARCHAR(191) NOT NULL,
    signer_name VARCHAR(191) NOT NULL,
    signature_data MEDIUMTEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    issued_at TIMESTAMP NULL,
    overdue_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_incident_nte_case (incident_id),
    KEY idx_incident_nte_deadline (status, deadline_date, overdue_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_nte_evidence (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nte_id BIGINT UNSIGNED NOT NULL,
    file_name VARCHAR(191) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    byte_size INT UNSIGNED NOT NULL,
    file_data MEDIUMBLOB NOT NULL,
    uploaded_by VARCHAR(191) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_incident_nte_evidence (nte_id, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_explanation_drafts (
    nte_id BIGINT UNSIGNED NOT NULL,
    employee_email VARCHAR(191) NOT NULL,
    explanation MEDIUMTEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (nte_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_explanation_draft_evidence (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nte_id BIGINT UNSIGNED NOT NULL,
    file_name VARCHAR(191) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    byte_size INT UNSIGNED NOT NULL,
    file_data MEDIUMBLOB NOT NULL,
    PRIMARY KEY (id),
    KEY idx_incident_explanation_draft_files (nte_id, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_explanations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nte_id BIGINT UNSIGNED NOT NULL,
    submitted_by VARCHAR(191) NOT NULL,
    explanation MEDIUMTEXT NOT NULL,
    source VARCHAR(24) NOT NULL DEFAULT 'HRIS',
    other_channel VARCHAR(191) NULL,
    submitted_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_incident_explanations (nte_id, submitted_at, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_explanation_evidence (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    explanation_id BIGINT UNSIGNED NOT NULL,
    file_name VARCHAR(191) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    byte_size INT UNSIGNED NOT NULL,
    file_data MEDIUMBLOB NOT NULL,
    uploaded_by VARCHAR(191) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_incident_explanation_evidence (explanation_id, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_explanation_addenda (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nte_id BIGINT UNSIGNED NOT NULL,
    submitted_by VARCHAR(191) NOT NULL,
    statement MEDIUMTEXT NOT NULL,
    submitted_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_incident_explanation_addenda (nte_id, submitted_at, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_explanation_addendum_evidence (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    addendum_id BIGINT UNSIGNED NOT NULL,
    file_name VARCHAR(191) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    byte_size INT UNSIGNED NOT NULL,
    file_data MEDIUMBLOB NOT NULL,
    uploaded_by VARCHAR(191) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_incident_explanation_addendum_evidence (addendum_id, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_deadline_extensions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nte_id BIGINT UNSIGNED NOT NULL,
    previous_deadline DATE NOT NULL,
    extended_deadline DATE NOT NULL,
    reason TEXT NOT NULL,
    approved_by VARCHAR(191) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_incident_deadline_extensions (nte_id, created_at, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS incident_nte_reminders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nte_id BIGINT UNSIGNED NOT NULL,
    employee_email VARCHAR(191) NOT NULL,
    reminder_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_incident_nte_daily_reminder (nte_id, reminder_date),
    KEY idx_incident_nte_reminder_employee (employee_email, reminder_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS form_serial_sequences (
    template_key VARCHAR(64) NOT NULL,
    serial_year SMALLINT UNSIGNED NOT NULL,
    sequence_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (template_key, serial_year)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS lookup_values (
    list_name VARCHAR(100) NOT NULL,
    \`value\` VARCHAR(191) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (list_name, \`value\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_email VARCHAR(191) NOT NULL,
    action VARCHAR(40) NOT NULL,
    record_id VARCHAR(20) NOT NULL DEFAULT '',
    detail VARCHAR(500) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY idx_audit_time (event_time),
    KEY idx_audit_user_time (user_email, event_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [auditUserTimeIndexes] = await pool.query(
    "SHOW INDEX FROM audit_logs WHERE Key_name = 'idx_audit_user_time'"
  );
  if (!auditUserTimeIndexes.length) {
    await pool.query(
      'ALTER TABLE audit_logs ADD KEY idx_audit_user_time (user_email, event_time)'
    );
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS hr_announcements (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(160) NOT NULL,
    message TEXT NOT NULL,
    created_by VARCHAR(191) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_announcement_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS announcement_views (
    announcement_id BIGINT UNSIGNED NOT NULL,
    user_email VARCHAR(191) NOT NULL,
    viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (announcement_id, user_email),
    KEY idx_announcement_view_user (user_email, viewed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS inbox_views (
    user_email VARCHAR(191) NOT NULL,
    item_type VARCHAR(16) NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_email, item_type, item_id),
    KEY idx_inbox_view_user (user_email, viewed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) NOT NULL,
    setting_value VARCHAR(255) NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    PRIMARY KEY (setting_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS counters (
    counter_name VARCHAR(100) NOT NULL,
    counter_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (counter_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const insertLookup =
    'INSERT IGNORE INTO lookup_values (list_name, `value`, active) VALUES (?, ?, 1)';
  for (const [listName, values] of Object.entries(LISTS)) {
    for (const value of values)
      await pool.execute(insertLookup, [listName, value]);
  }
  await pool.execute(
    'INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
    ['PAGE_SIZE', '25', 'Rows per page']
  );
  await pool.execute(
    'INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
    ['TENURE_RULE', 'FROM_DATE_EMPLOYED', 'Tenure calculation rule']
  );
  await pool.execute(
    'INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
    ['HRIS_DATA_VER', '0', 'Data version used for cache invalidation']
  );
  await pool.execute(
    'INSERT IGNORE INTO counters (counter_name, counter_value) VALUES (?, ?)',
    ['HRIS_EMP_COUNTER', 0]
  );
  const connection = await pool.getConnection();
  try {
    await syncCounter(connection);
  } finally {
    connection.release();
  }
}

async function getLists() {
  const [rows] = await pool.query(
    'SELECT list_name, `value` FROM lookup_values WHERE active = 1 ORDER BY `value`'
  );
  const result = Object.fromEntries(
    Object.keys(LISTS).map((name) => [name, []])
  );
  rows.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(result, row.list_name))
      result[row.list_name].push(row.value);
  });
  return result;
}

async function nextSequence(connection) {
  const [rows] = await connection.execute(
    'SELECT counter_value FROM counters WHERE counter_name = ? FOR UPDATE',
    ['HRIS_EMP_COUNTER']
  );
  if (!rows.length) throw new Error('Employee counter is not initialized.');
  const next = Number(rows[0].counter_value) + 1;
  await connection.execute(
    'UPDATE counters SET counter_value = ? WHERE counter_name = ?',
    [next, 'HRIS_EMP_COUNTER']
  );
  return next;
}

async function syncCounter(connection) {
  const [rows] = await connection.execute(
    'SELECT COALESCE(MAX(seq_no), 0) AS last_value FROM employees'
  );
  await connection.execute(
    'UPDATE counters SET counter_value = GREATEST(counter_value, ?) WHERE counter_name = ?',
    [Number(rows[0].last_value), 'HRIS_EMP_COUNTER']
  );
}

module.exports = {
  pool,
  initializeDatabase,
  getLists,
  nextSequence,
  syncCounter,
  quote
};
