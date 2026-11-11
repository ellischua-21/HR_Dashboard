// Role grants and account-request role normalization.
const ROLE_PERMS = {
  ADMIN: [
    'exec.view',
    'emp.read',
    'emp.write',
    'emp.export',
    'emp.archive',
    'admin.manage',
    'audit.read',
    'report.run',
    'forms.view',
    'announcements.manage',
    'inbox.read',
    'account.password'
  ],
  HR: [
    'incidents.coc.manage',
    'dash.view',
    'emp.read',
    'emp.write',
    'emp.export',
    'emp.archive',
    'report.run',
    'forms.self',
    'forms.review',
    'announcements.manage',
    'inbox.read',
    'account.password'
  ],
  HEAD: [
    'employee.self',
    'forms.self',
    'forms.review',
    'announcements.read',
    'inbox.read',
    'account.password'
  ],
  STAFF: [
    'employee.self',
    'forms.self',
    'announcements.read',
    'inbox.read',
    'account.password'
  ]
};

const ACCOUNT_ROLE_MAP = {
  STAFF: 'STAFF',
  SUPERVISOR: 'SUPERVISOR',
  HEAD: 'HEAD',
  HR: 'HR',
  ADMIN: 'ADMIN'
};

ROLE_PERMS.SUPERVISOR = [...ROLE_PERMS.HEAD];

// These capabilities follow the documented role grants, never residual extras.
const ROLE_ONLY_PERMISSIONS = new Set([
  'admin.manage',
  'audit.read',
  'exec.view',
  'dash.view',
  'emp.read',
  'emp.write',
  'emp.export',
  'emp.archive',
  'report.run',
  'announcements.manage',
  'forms.review',
  'forms.view',
  'incidents.coc.manage'
]);

function isRolePermissionAllowed(role, permission) {
  return (
    !ROLE_ONLY_PERMISSIONS.has(permission) ||
    (Object.prototype.hasOwnProperty.call(ROLE_PERMS, role) &&
      ROLE_PERMS[role].includes(permission))
  );
}

module.exports = { ROLE_PERMS, ACCOUNT_ROLE_MAP, isRolePermissionAllowed };
