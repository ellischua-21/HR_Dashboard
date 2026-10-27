// Role grants and account-request role normalization.
const ROLE_PERMS = {
  ADMIN: [
    'incidents.coc.manage',
    'dash.view',
    'exec.view',
    'emp.read',
    'emp.write',
    'emp.sensitive',
    'emp.export',
    'emp.archive',
    'admin.manage',
    'audit.read',
    'report.run',
    'forms.review',
    'announcements.manage',
    'inbox.read',
    'account.password'
  ],
  HR: [
    'incidents.coc.manage',
    'dash.view',
    'exec.view',
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
    'forms.self',
    'forms.review',
    'announcements.read',
    'inbox.read',
    'account.password'
  ],
  STAFF: ['forms.self', 'announcements.read', 'inbox.read', 'account.password']
};

const ACCOUNT_ROLE_MAP = {
  STAFF: 'STAFF',
  HEAD: 'HEAD',
  HR: 'HR',
  ADMIN: 'ADMIN'
};

module.exports = { ROLE_PERMS, ACCOUNT_ROLE_MAP };
