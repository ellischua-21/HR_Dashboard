const test = require('node:test');
const assert = require('node:assert/strict');

const validReport = {
  reportedEmployeeId: 'E-2',
  subject: 'Incident',
  incidentDate: '2026-10-20',
  location: 'Office',
  incidentTime: '09:30',
  description: 'A report description.',
  comments: ''
};

test('HEAD filing creates a versioned pending case and requests employee and assigned-head signatures', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  const statements = [];
  t.mock.method(pool, 'execute', async (sql) => {
    if (sql.includes('FROM user_roles'))
      return [
        [
          {
            email: 'head@example.com',
            full_name: 'Reporting Head',
            role: 'HEAD',
            active: 1,
            extra_perms: ''
          }
        ]
      ];
    throw new Error('Unexpected pool query.');
  });
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values = []) => {
      statements.push({ sql, values });
      if (sql.includes('ORDER BY e.record_id LIMIT 1'))
        return [
          [
            {
              record_id: 'E-1',
              name: 'Reporting Head',
              department: 'HR',
              position: 'Head'
            }
          ]
        ];
      if (sql.includes('JOIN user_roles u ON LOWER(u.email)'))
        return [
          [
            {
              record_id: 'E-2',
              name: 'Employee',
              emp_no: 'EMP-2',
              department: 'Operations',
              position: 'Staff',
              email: 'employee@example.com',
              role: 'STAFF',
              assigned_head_email: 'assigned@example.com',
              is_hr_head: 0
            }
          ]
        ];
      if (sql.includes('WHERE email = ? LIMIT 1'))
        return [[{ email: 'assigned@example.com', role: 'HEAD', active: 1 }]];
      if (sql.includes('SELECT sequence_value FROM incident_case_sequences'))
        return [[{ sequence_value: 17 }]];
      if (sql.includes('INSERT INTO incident_reports'))
        return [{ insertId: 41 }];
      if (sql.includes('FROM incident_participants')) return [[]];
      if (sql.includes("role IN ('HR', 'ADMIN')"))
        return [[{ email: 'hr@example.com' }]];
      return [{ insertId: 1, affectedRows: 1 }];
    }
  }));

  const result = await incidents.submitIncidentReport(
    { session: { userEmail: 'head@example.com' } },
    validReport
  );
  const reportInsert = statements.find((item) =>
    item.sql.includes('INSERT INTO incident_reports')
  );
  assert.equal(result.status, 'PENDING SIGNATURE');
  assert.equal(result.caseNumber, 'IR-2026-00017');
  assert.match(reportInsert.values[17], /^[a-f0-9]{64}$/);
  assert.ok(
    statements.some((item) =>
      item.sql.includes('INSERT INTO incident_case_subjects')
    )
  );
  assert.ok(
    statements.some((item) =>
      item.sql.includes("VALUES (?, ?, 'EMPLOYEE_SIGNATURE')")
    )
  );
  assert.ok(
    statements.some((item) =>
      item.sql.includes("VALUES (?, ?, 'HEAD_SIGNATURE')")
    )
  );
});

test('STAFF cannot submit an Incident Report through the backend', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  let openedConnection = false;
  t.mock.method(pool, 'execute', async () => [
    [
      {
        email: 'staff@example.com',
        role: 'STAFF',
        active: 1,
        extra_perms: ''
      }
    ]
  ]);
  t.mock.method(pool, 'getConnection', async () => {
    openedConnection = true;
    throw new Error(
      'STAFF must be denied before opening the case transaction.'
    );
  });
  await assert.rejects(
    incidents.submitIncidentReport(
      { session: { userEmail: 'staff@example.com' } },
      validReport
    ),
    { status: 403 }
  );
  assert.equal(openedConnection, false);
});

test('HR signing a signed case records the document version and starts UNDER_REVIEW', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  const statements = [];
  t.mock.method(pool, 'execute', async () => [
    [
      {
        email: 'hr@example.com',
        role: 'HR',
        active: 1,
        extra_perms: ''
      }
    ]
  ]);
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values = []) => {
      statements.push({ sql, values });
      if (sql.includes('FROM incident_reports WHERE id = ? FOR UPDATE'))
        return [
          [
            {
              id: 41,
              case_number: 'IR-2026-00017',
              status: 'SIGNED',
              reporter_email: 'head@example.com',
              reported_employee_email: 'employee@example.com',
              reported_employee_name: 'Employee',
              assigned_head_email: 'assigned@example.com',
              document_version: 'a'.repeat(64)
            }
          ]
        ];
      if (sql.includes('FROM incident_participants')) return [[]];
      if (sql.includes("role IN ('HR', 'ADMIN')"))
        return [[{ email: 'hr@example.com' }]];
      return [{ insertId: 1, affectedRows: 1 }];
    }
  }));

  const result = await incidents.signIncidentCase(
    { session: { userEmail: 'hr@example.com' } },
    41,
    'HR',
    'data:image/png;base64,aA=='
  );
  const signatureInsert = statements.find((item) =>
    item.sql.includes('INSERT INTO incident_signatures')
  );
  assert.equal(result.status, 'UNDER_REVIEW');
  assert.equal(signatureInsert.values[4], 'a'.repeat(64));
  assert.ok(
    statements.some((item) => item.sql.includes("SET status = 'UNDER_REVIEW'"))
  );
});

test('a case participant cannot download evidence submitted for another information request', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  const statements = [];
  t.mock.method(pool, 'execute', async (sql) => {
    statements.push(sql);
    if (sql.includes('FROM user_roles'))
      return [
        [
          {
            email: 'participant@example.com',
            role: 'HEAD',
            active: 1,
            extra_perms: ''
          }
        ]
      ];
    if (sql.includes('FROM incident_evidence e'))
      return [
        [
          {
            id: 4,
            requestId: 9,
            fileName: 'confidential.pdf',
            caseNumber: 'IR-2026-1',
            reporter_email: 'reporter@example.com',
            reported_employee_email: 'employee@example.com',
            assigned_head_email: 'head@example.com',
            requestRecipient: 'employee@example.com',
            requestCreator: 'hr@example.com',
            isParticipant: 1
          }
        ]
      ];
    throw new Error('Unexpected database query.');
  });

  await assert.rejects(
    incidents.getIncidentEvidence(
      { session: { userEmail: 'participant@example.com' } },
      4
    ),
    { status: 403 }
  );
  assert.equal(
    statements.some((sql) => sql.includes('INSERT INTO audit_logs')),
    false
  );
});

test('the recipient of an information request can download its submitted evidence and the read is audited', async (t) => {
  const { pool } = require('../server/db/database');
  const incidents = require('../server/services/IncidentService');
  const statements = [];
  t.mock.method(pool, 'execute', async (sql) => {
    statements.push(sql);
    if (sql.includes('FROM user_roles'))
      return [
        [
          {
            email: 'employee@example.com',
            role: 'STAFF',
            active: 1,
            extra_perms: ''
          }
        ]
      ];
    if (sql.includes('FROM incident_evidence e'))
      return [
        [
          {
            id: 4,
            requestId: 9,
            fileName: 'response.pdf',
            caseNumber: 'IR-2026-1',
            reporter_email: 'reporter@example.com',
            reported_employee_email: 'employee@example.com',
            assigned_head_email: 'head@example.com',
            requestRecipient: 'employee@example.com',
            requestCreator: 'hr@example.com',
            isParticipant: 0
          }
        ]
      ];
    if (sql.includes('INSERT INTO audit_logs')) return [{ affectedRows: 1 }];
    throw new Error('Unexpected database query.');
  });

  const file = await incidents.getIncidentEvidence(
    { session: { userEmail: 'employee@example.com' } },
    4
  );
  assert.equal(file.fileName, 'response.pdf');
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO audit_logs')));
});
