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

module.exports = { ROLE_PERMS, ACCOUNT_ROLE_MAP };
