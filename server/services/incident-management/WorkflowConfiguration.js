const A = require('./WorkflowAccess');
const { requirePerm } = require('../../middleware/Auth');
const { logAudit } = require('../AuditService');
async function get(req) {
  const user = await requirePerm(req, 'admin.manage');
  A.assert(user.role === 'ADMIN');
  const [[assignments], [accounts], [approvers], [departments], [[settings]]] =
    await Promise.all([
      A.pool.execute(
        'SELECT department, reviewer_email AS reviewerEmail FROM incident_department_reviewers ORDER BY department, reviewer_email'
      ),
      A.pool
        .execute(`SELECT email, COALESCE(NULLIF(full_name, ''), email) AS name, role FROM user_roles
      WHERE role IN ('HEAD','ADMIN') AND active = 1 AND EXISTS
      (SELECT 1 FROM employees e WHERE LOWER(e.personal_email) = LOWER(user_roles.email) AND e.record_status <> 'Archived') ORDER BY full_name, email`),
      A.pool
        .execute(`SELECT email, COALESCE(NULLIF(full_name, ''), email) AS name FROM user_roles
      WHERE role = 'ADMIN' AND active = 1 AND EXISTS
      (SELECT 1 FROM employees e WHERE LOWER(e.personal_email) = LOWER(user_roles.email) AND e.record_status <> 'Archived') ORDER BY full_name, email`),
      A.pool.execute(
        "SELECT `value` AS department FROM lookup_values WHERE list_name = 'Department_List' AND active = 1 UNION SELECT DISTINCT department FROM employees WHERE record_status <> 'Archived' AND department <> '' ORDER BY department"
      ),
      A.pool.execute(
        'SELECT management_email AS managementEmail FROM incident_workflow_settings WHERE id = 1'
      )
    ]);
  return {
    assignments,
    accounts,
    approvers,
    departments: [
      ...new Map(
        [
          'Heads',
          ...departments.map((row) => row.department),
          ...assignments.map((row) => row.department)
        ].map((department) => {
          const key = department.trim().toLowerCase();
          return [key, key === 'heads' ? 'Heads' : department.trim()];
        })
      ).values()
    ].sort((first, second) => {
      const firstIsHeads = first.trim().toLowerCase() === 'heads';
      const secondIsHeads = second.trim().toLowerCase() === 'heads';
      if (firstIsHeads !== secondIsHeads) return firstIsHeads ? 1 : -1;
      return first.localeCompare(second);
    }),
    managementEmail: settings.managementEmail || ''
  };
}
async function save(req, input = {}, executor = null) {
  const user = await requirePerm(req, 'admin.manage');
  A.assert(user.role === 'ADMIN');
  A.assert(
    Array.isArray(input.assignments) && input.assignments.length <= 200,
    'Enter valid department assignments.'
  );
  const db = executor || (await A.pool.getConnection());
  try {
    if (!executor) await db.beginTransaction();
    await db.execute(
      'SELECT id FROM incident_workflow_settings WHERE id = 1 FOR UPDATE'
    );
    const assignments = [],
      seen = new Set(),
      departmentCounts = new Map();
    for (const item of input.assignments) {
      const department = A.text(item.department, 'Department', true, 191),
        email = A.text(item.reviewerEmail, 'Reviewer', true, 191).toLowerCase();
      const departmentKey = department.toLowerCase(),
        assignmentKey = `${departmentKey}:${email}`,
        assignmentCount = (departmentCounts.get(departmentKey) || 0) + 1;
      A.assert(
        !seen.has(assignmentKey),
        'Do not assign the same reviewer twice.'
      );
      A.assert(
        departmentKey === 'heads' ? assignmentCount <= 2 : assignmentCount <= 1,
        departmentKey === 'heads'
          ? 'Assign no more than two reviewers to the Heads department.'
          : 'Assign only one reviewer to each department.'
      );
      seen.add(assignmentKey);
      departmentCounts.set(departmentKey, assignmentCount);
      const [[account]] = await db.execute(
        "SELECT email,role FROM user_roles WHERE LOWER(email) = LOWER(?) AND role IN ('HEAD','ADMIN') AND active = 1 AND EXISTS (SELECT 1 FROM employees e WHERE LOWER(e.personal_email)=LOWER(user_roles.email) AND e.record_status<>'Archived')",
        [email]
      );
      A.assert(account, 'Choose an active HEAD or ADMIN reviewer.');
      A.assert(
        departmentKey !== 'heads' || account.role === 'ADMIN',
        'Only ADMIN accounts can review cases from the Heads department.'
      );
      assignments.push({ department, email: account.email });
    }
    const manager = String(input.managementEmail || '').trim();
    if (manager) {
      const [[account]] = await db.execute(
        "SELECT email FROM user_roles WHERE LOWER(email) = LOWER(?) AND role = 'ADMIN' AND active = 1 AND EXISTS (SELECT 1 FROM employees e WHERE LOWER(e.personal_email)=LOWER(user_roles.email) AND e.record_status<>'Archived')",
        [manager]
      );
      A.assert(account, 'Choose an active ADMIN as Management Approver.');
    }
    await db.execute('DELETE FROM incident_department_reviewers');
    for (const row of assignments)
      await db.execute(
        'INSERT INTO incident_department_reviewers (department, reviewer_email, updated_by) VALUES (?, ?, ?)',
        [row.department, row.email, user.email]
      );
    await db.execute(
      'UPDATE incident_workflow_settings SET management_email = ?, updated_by = ? WHERE id = 1',
      [manager || null, user.email]
    );
    await db.execute(
      'UPDATE hr_task_revision SET revision = revision + 1 WHERE id = 1'
    );
    await logAudit(
      user.email,
      'INCIDENT_WORKFLOW_CONFIG_UPDATED',
      '1',
      `Incident review configuration updated: ${assignments.length} assignments; Management approver ${manager ? 'selected' : 'cleared'}.`,
      db
    );
    if (!executor) await db.commit();
    return { ok: true };
  } catch (error) {
    if (!executor) await db.rollback();
    throw error;
  } finally {
    if (!executor) db.release();
  }
}
module.exports = { get, save };
