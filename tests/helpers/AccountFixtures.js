const assert = require('node:assert/strict');

// Exercise real authentication logic with one linked, active employee fixture.
// Read the account on each call so role changes in permission tests take effect.
function accountIdentityMock(getAccount) {
  return async (sql, values) => {
    const account = getAccount();
    assert.deepEqual(values, [account.email]);
    if (/\bFROM user_roles\b/.test(sql)) return [[account]];
    if (/\bFROM employees\b/.test(sql))
      return [
        [
          {
            record_id: 'TEST-REVIEWER',
            name: 'Sample Reviewer',
            personal_email: account.email,
            emp_no: 'TEST-001',
            status: 'Regular',
            record_status: 'Active'
          }
        ]
      ];
    throw new Error('Unexpected authentication query: ' + sql);
  };
}

module.exports = { accountIdentityMock };
