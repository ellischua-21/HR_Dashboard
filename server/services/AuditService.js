const { pool } = require('../db/database');

async function logAudit(userEmail, action, recordId, detail, connection = pool) {
  if (['CREATE', 'UPDATE', 'ARCHIVE'].includes(action)) {
    await connection.execute(
      'UPDATE system_settings SET setting_value = ? WHERE setting_key = ?',
      [String(Date.now()), 'HRIS_DATA_VER']);
  }
  await connection.execute(
    'INSERT INTO audit_logs (user_email, action, record_id, detail) VALUES (?, ?, ?, ?)',
    [userEmail || 'unknown', action, recordId || '', String(detail || '').slice(0, 500)]);
}

async function getAuditLogs(req, limit) {
  await require('../middleware/Auth').requirePerm(req, 'audit.read');
  const take = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const [rows] = await pool.execute(
    `SELECT event_time, user_email, action, record_id, detail FROM audit_logs ORDER BY id DESC LIMIT ${take}`);
  return rows.map(row => [row.event_time, row.user_email, row.action, row.record_id, row.detail]);
}

module.exports = { logAudit, getAuditLogs };
