const mysql = require('mysql2/promise');
const { EMP_FIELDS, LISTS } = require('../config/Config');

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

const quote = name => '`' + name.replace(/`/g, '``') + '`';

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
  const [personalEmailColumn] = await pool.query("SHOW COLUMNS FROM employees LIKE 'personal_email'");
  const [legacyCorpEmailColumn] = await pool.query("SHOW COLUMNS FROM employees LIKE 'corp_email'");
  if (!personalEmailColumn.length) {
    if (legacyCorpEmailColumn.length) {
      await pool.query('ALTER TABLE employees CHANGE COLUMN corp_email personal_email TEXT NULL');
    } else {
      await pool.query('ALTER TABLE employees ADD COLUMN personal_email TEXT NULL');
    }
  }
  for (const obsoleteColumn of ['corp_email', 'email']) {
    const [column] = await pool.query(`SHOW COLUMNS FROM employees LIKE '${obsoleteColumn}'`);
    if (column.length) await pool.query(`ALTER TABLE employees DROP COLUMN \`${obsoleteColumn}\``);
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

  const [userColumns] = await pool.query("SHOW COLUMNS FROM user_roles LIKE 'full_name'");
  if (!userColumns.length) {
    await pool.query("ALTER TABLE user_roles ADD COLUMN full_name VARCHAR(191) NOT NULL DEFAULT '' AFTER email");
  }
  const [headColumns] = await pool.query("SHOW COLUMNS FROM user_roles LIKE 'assigned_head_email'");
  if (!headColumns.length) {
    await pool.query("ALTER TABLE user_roles ADD COLUMN assigned_head_email VARCHAR(191) NULL AFTER role");
  }
  const [hrHeadColumns] = await pool.query("SHOW COLUMNS FROM user_roles LIKE 'is_hr_head'");
  if (!hrHeadColumns.length) {
    await pool.query("ALTER TABLE user_roles ADD COLUMN is_hr_head TINYINT(1) NOT NULL DEFAULT 0 AFTER assigned_head_email");
  }
  await pool.query("UPDATE user_roles SET role = 'STAFF' WHERE role IN ('USER', 'MANAGER')");
  await pool.query("UPDATE user_roles SET role = 'STAFF' WHERE role = 'EXECUTIVE'");
  await pool.query("UPDATE user_roles SET role = 'HR' WHERE role = 'HR_STAFF'");
  await pool.query("UPDATE user_roles SET role = 'ADMIN' WHERE role IN ('SYSTEM_ADMIN', 'HR_ADMIN')");

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
    const [existing] = await pool.query(`SHOW COLUMNS FROM account_requests LIKE '${column}'`);
    if (!existing.length) {
      await pool.query(`ALTER TABLE account_requests ADD COLUMN \`${column}\` ${definition}`);
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
    const [existing] = await pool.query(`SHOW COLUMNS FROM user_forms LIKE '${column}'`);
    if (!existing.length) {
      await pool.query(`ALTER TABLE user_forms ADD COLUMN \`${column}\` ${definition}`);
    }
  }
  const [headIndexes] = await pool.query("SHOW INDEX FROM user_forms WHERE Key_name = 'idx_user_form_head_queue'");
  if (!headIndexes.length) {
    await pool.query(
      'ALTER TABLE user_forms ADD KEY idx_user_form_head_queue (head_reviewer_email, review_stage, submitted_at)');
  }
  await pool.query("UPDATE user_forms SET review_stage = 'HR' WHERE review_stage NOT IN ('HEAD', 'HR')");

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
    "SHOW INDEX FROM audit_logs WHERE Key_name = 'idx_audit_user_time'");
  if (!auditUserTimeIndexes.length) {
    await pool.query('ALTER TABLE audit_logs ADD KEY idx_audit_user_time (user_email, event_time)');
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

  const insertLookup = 'INSERT IGNORE INTO lookup_values (list_name, `value`, active) VALUES (?, ?, 1)';
  for (const [listName, values] of Object.entries(LISTS)) {
    for (const value of values) await pool.execute(insertLookup, [listName, value]);
  }
  await pool.execute(
    'INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
    ['PAGE_SIZE', '25', 'Rows per page']);
  await pool.execute(
    'INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
    ['TENURE_RULE', 'FROM_DATE_EMPLOYED', 'Tenure calculation rule']);
  await pool.execute(
    'INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
    ['HRIS_DATA_VER', '0', 'Data version used for cache invalidation']);
  await pool.execute('INSERT IGNORE INTO counters (counter_name, counter_value) VALUES (?, ?)', ['HRIS_EMP_COUNTER', 0]);
  const connection = await pool.getConnection();
  try {
    await syncCounter(connection);
  } finally {
    connection.release();
  }
}

async function getLists() {
  const [rows] = await pool.query('SELECT list_name, `value` FROM lookup_values WHERE active = 1 ORDER BY `value`');
  const result = Object.fromEntries(Object.keys(LISTS).map(name => [name, []]));
  rows.forEach(row => {
    if (Object.prototype.hasOwnProperty.call(result, row.list_name)) result[row.list_name].push(row.value);
  });
  return result;
}

async function nextSequence(connection) {
  const [rows] = await connection.execute(
    'SELECT counter_value FROM counters WHERE counter_name = ? FOR UPDATE', ['HRIS_EMP_COUNTER']);
  if (!rows.length) throw new Error('Employee counter is not initialized.');
  const next = Number(rows[0].counter_value) + 1;
  await connection.execute('UPDATE counters SET counter_value = ? WHERE counter_name = ?', [next, 'HRIS_EMP_COUNTER']);
  return next;
}

async function syncCounter(connection) {
  const [rows] = await connection.execute('SELECT COALESCE(MAX(seq_no), 0) AS last_value FROM employees');
  await connection.execute(
    'UPDATE counters SET counter_value = GREATEST(counter_value, ?) WHERE counter_name = ?',
    [Number(rows[0].last_value), 'HRIS_EMP_COUNTER']);
}

module.exports = { pool, initializeDatabase, getLists, nextSequence, syncCounter, quote };
