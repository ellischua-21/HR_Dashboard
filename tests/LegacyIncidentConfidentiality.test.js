const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../server/db/database');
const legacy = require('../server/services/IncidentService');
const { accountIdentityMock } = require('./helpers/AccountFixtures');
const facade = require('../server/services/IncidentWorkflowService');
const reports = require('../server/services/incident-management/WorkflowReports');
const access = require('../server/services/incident-management/WorkflowAccess');

function caseFixture(t, involvement, role = 'ADMIN', issued = false) {
  const account = { email: 'viewer@example.com', role, active: 1 };
  const identity = accountIdentityMock(() => account);
  const incident = {
    id: 1,
    workflow_version: 1,
    caseNumber: 'IR-TEST-1',
    reporterEmail:
      involvement === 'reporter' ? account.email : 'reporter@example.com',
    reportedEmployeeEmail:
      involvement === 'reported' || involvement === 'overlap'
        ? account.email
        : 'employee@example.com',
    assignedHeadEmail:
      involvement === 'assigned' || involvement === 'overlap'
        ? account.email
        : 'head@example.com',
    status: 'NTE ISSUED',
    documentVersion: 1,
    createdAt: '2026-10-01 08:00:00'
  };
  const requests = [
    {
      id: 1,
      recipientEmail: account.email,
      requestedBy: 'hr@example.com',
      requestText: 'Your request'
    },
    {
      id: 2,
      recipientEmail: 'other@example.com',
      requestedBy: 'hr@example.com',
      requestText: 'PRIVATE witness request'
    }
  ];
  const files = [
    { id: 1, requestId: null, fileName: 'report.txt' },
    { id: 2, requestId: 1, fileName: 'own-response.txt' },
    { id: 3, requestId: 2, fileName: 'PRIVATE witness response.txt' }
  ];
  const audit = [];
  t.mock.method(pool, 'query', async () => {
    throw new Error('Unexpected pool query');
  });
  t.mock.method(pool, 'getConnection', async () => {
    throw new Error('Unexpected transaction');
  });
  t.mock.method(pool, 'execute', async (sql, values) => {
    if (sql.startsWith('INSERT INTO audit_logs')) {
      audit.push(values);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('SELECT workflow_version'))
      return [[{ workflow_version: 1 }]];
    if (sql.includes('SELECT r.id FROM incident_reports'))
      return [involvement === 'unrelated' && role !== 'HR' ? [] : [{ id: 1 }]];
    if (sql.includes('FROM incident_reports WHERE id = ? LIMIT 1'))
      return [[{ ...incident }]];
    if (sql.includes('SELECT 1 FROM incident_participants p'))
      return [involvement === 'witness' ? [{ exists: 1 }] : []];
    if (sql.includes('FROM incident_participants WHERE'))
      return [[{ participantType: 'WITNESS', name: 'Sample Witness' }]];
    if (sql.includes('FROM incident_signatures')) return [[]];
    if (sql.includes('FROM incident_evidence e')) {
      assert.deepEqual(values.slice(2), [account.email, account.email]);
      return [
        values[1] === 1 ? files : files.filter((file) => file.requestId !== 2)
      ];
    }
    if (sql.includes('FROM incident_activity'))
      return [
        [
          {
            action: 'IR_SUBMITTED',
            details: 'Report filed',
            actorEmail: incident.reporterEmail,
            createdAt: incident.createdAt
          },
          {
            action: 'PRIVATE_HR_NOTE',
            details: 'PRIVATE internal activity',
            actorEmail: 'hr@example.com',
            createdAt: incident.createdAt
          }
        ]
      ];
    if (sql.includes('FROM incident_information_requests WHERE'))
      return [requests];
    if (sql.includes('FROM incident_ntes WHERE incident_id'))
      return [
        values[1] === 1 || issued
          ? [
              {
                id: 7,
                status: issued ? 'ISSUED' : 'DRAFT',
                allegation: issued ? 'Issued allegation' : 'PRIVATE draft NTE',
                deadlineDate: '2026-10-10'
              }
            ]
          : []
      ];
    if (sql.includes('FROM incident_explanation_drafts d')) return [[]];
    if (sql.includes('FROM incident_explanations e')) return [[]];
    if (sql.includes('FROM incident_deadline_extensions'))
      return [[{ reason: 'PRIVATE extension reason' }]];
    if (sql.includes('FROM incident_explanation_addenda a')) return [[]];
    if (sql.includes('FROM incident_evaluations WHERE'))
      return [[{ id: 8, findings: 'PRIVATE evaluation' }]];
    if (sql.includes('FROM incident_evaluation_allowed_actions')) return [[]];
    if (sql.includes('FROM incident_disciplinary_history'))
      return [[{ violationTitle: 'PRIVATE disciplinary record' }]];
    if (sql.includes('FROM incident_decisions d'))
      return [
        issued
          ? [
              {
                id: 9,
                finalAction: 'Issued action',
                closureReason: 'PRIVATE closure reason'
              }
            ]
          : []
      ];
    if (sql.includes('FROM incident_nte_evidence WHERE'))
      return [[{ id: 10, fileName: 'issued-evidence.txt' }]];
    if (sql.includes('FROM incident_document_policies')) return [[]];
    return identity(sql, values);
  });
  return { req: { session: { userEmail: account.email } }, audit, incident };
}

for (const involvement of [
  'reported',
  'reporter',
  'witness',
  'assigned',
  'overlap'
]) {
  test(`legacy ADMIN ${involvement} receives permitted case data without HR internals`, async (t) => {
    const { req } = caseFixture(t, involvement);
    const result = await facade.getIncidentCase(req, 1);
    assert.equal(result.legacy, true);
    assert.equal(result.canReview, false);
    assert.equal(result.canViewReview, false);
    assert.equal(result.nte, null);
    assert.equal(result.evaluation, null);
    assert.deepEqual(result.disciplinaryHistory, []);
    assert.deepEqual(result.activity, []);
    assert.deepEqual(result.deadlineExtensions, []);
    assert.deepEqual(
      result.informationRequests.map((request) => request.id),
      [1]
    );
    assert.deepEqual(
      result.evidence.map((file) => file.id),
      [1, 2]
    );
    assert.ok(result.tracking.stages.length);
    assert.ok(result.timeline.some((event) => event.action === 'IR_SUBMITTED'));
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  });
}

for (const role of ['STAFF', 'SUPERVISOR', 'HEAD']) {
  test(`legacy ${role} retains issued employee documents and tracking`, async (t) => {
    const { req } = caseFixture(t, 'reported', role, true);
    const result = await facade.getIncidentCase(req, 1);
    assert.equal(result.nte.status, 'ISSUED');
    assert.equal(result.decision.finalAction, 'Issued action');
    assert.ok(result.tracking.stages.length);
    assert.equal(result.evaluation, null);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  });
}

test('unassigned ADMIN cannot read an unrelated legacy case', async (t) => {
  const { req } = caseFixture(t, 'unrelated');
  // Preserve the facade's existing unavailable-record error contract.
  await assert.rejects(facade.getIncidentCase(req, 1), { status: 409 });
  await assert.rejects(legacy.getIncidentCase(req, 1), { status: 403 });
});

test('legacy HR keeps internal read access and audited historical documents', async (t) => {
  const { req, audit } = caseFixture(t, 'unrelated', 'HR');
  const result = await facade.getIncidentCase(req, 1);
  assert.equal(result.nte.status, 'DRAFT');
  assert.equal(result.evaluation.findings, 'PRIVATE evaluation');
  assert.equal(result.disciplinaryHistory.length, 1);
  assert.equal(result.informationRequests.length, 2);
  assert.equal(result.evidence.length, 3);
  assert.equal(result.activity.length, 2);
  assert.equal(result.canViewReview, true);
  assert.ok(audit.some((entry) => entry[1] === 'READ'));
});

test('reported ADMIN retains issued NTE and decision without internal closure notes', async (t) => {
  const { req } = caseFixture(t, 'reported', 'ADMIN', true);
  const result = await facade.getIncidentCase(req, 1);
  assert.equal(result.nte.status, 'ISSUED');
  assert.equal(result.nte.evidence[0].id, 10);
  assert.equal(result.decision.finalAction, 'Issued action');
  assert.equal(result.decision.closureReason, null);
  assert.equal(result.evaluation, null);
});

test('ADMIN reported employee cannot download an unissued legacy NTE attachment', async (t) => {
  const account = { email: 'admin@example.com', role: 'ADMIN', active: 1 };
  const identity = accountIdentityMock(() => account);
  t.mock.method(pool, 'execute', async (sql, values) => {
    if (sql.includes('FROM incident_nte_evidence'))
      return [
        [
          {
            id: 1,
            nteStatus: 'DRAFT',
            employeeEmail: account.email,
            caseNumber: 'IR-TEST-1',
            fileName: 'draft.txt',
            fileData: Buffer.from('Confidential draft')
          }
        ]
      ];
    if (sql.startsWith('INSERT INTO audit_logs')) return [{ affectedRows: 1 }];
    return identity(sql, values);
  });
  await assert.rejects(
    legacy.getIncidentNteEvidence({ session: { userEmail: account.email } }, 1),
    { status: 403 }
  );
});

function attachmentFixture(t) {
  const account = { email: 'viewer@example.com', role: 'ADMIN', active: 1 };
  const identity = accountIdentityMock(() => account);
  const file = {
    id: 1,
    incident_id: 1,
    nteStatus: 'DRAFT',
    caseNumber: 'IR-TEST-1',
    employeeEmail: account.email,
    fileName: 'evidence.txt',
    mimeType: 'text/plain',
    fileData: Buffer.from('Synthetic evidence'),
    reporter_email: 'reporter@example.com',
    reported_employee_email: account.email,
    assigned_head_email: 'head@example.com',
    requestId: 2,
    requestRecipient: 'other@example.com',
    requestCreator: 'hr@example.com',
    isParticipant: 1
  };
  const audit = [];
  t.mock.method(pool, 'query', async () => {
    throw new Error('Unexpected query');
  });
  t.mock.method(pool, 'getConnection', async () => {
    throw new Error('Unexpected transaction');
  });
  t.mock.method(pool, 'execute', async (sql, values) => {
    if (sql.startsWith('INSERT INTO audit_logs')) {
      audit.push(values);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('SELECT workflow_version'))
      return [[{ workflow_version: 1 }]];
    if (sql.includes('SELECT r.id FROM incident_reports')) return [[{ id: 1 }]];
    if (sql.includes('FROM incident_')) return [[{ ...file }]];
    return identity(sql, values);
  });
  return {
    account,
    file,
    audit,
    req: { session: { userEmail: account.email } }
  };
}

for (const method of [
  'getIncidentNteEvidence',
  'getIncidentExplanationEvidence',
  'getIncidentExplanationDraftEvidence',
  'getIncidentExplanationAddendumEvidence'
]) {
  test(`${method} enforces legacy document ownership through the API facade`, async (t) => {
    const { account, file, req, audit } = attachmentFixture(t);
    // An ADMIN assigned as HEAD but not the document's employee is not HR.
    file.assigned_head_email = account.email;
    file.employeeEmail = 'other@example.com';
    for (const read of [legacy[method], facade[method]])
      await assert.rejects(read(req, 1), { status: 403 });
    assert.equal(audit.length, 0);
    file.employeeEmail = account.email;
    if (method === 'getIncidentNteEvidence') {
      await assert.rejects(facade[method](req, 1), { status: 403 });
      file.nteStatus = 'ISSUED';
    }
    assert.equal(
      (await facade[method](req, 1)).fileData.toString(),
      'Synthetic evidence'
    );
    assert.ok(
      audit.some((entry) => entry[0] === account.email && entry[1] === 'READ')
    );
    account.role = 'HR';
    file.employeeEmail = 'other@example.com';
    file.nteStatus = 'DRAFT';
    assert.ok((await facade[method](req, 1)).fileData);
  });
}

test('ADMIN witnesses and assigned HEADs cannot bypass request-specific evidence access', async (t) => {
  const { account, file, req } = attachmentFixture(t);
  file.assigned_head_email = account.email;
  for (const read of [legacy.getIncidentEvidence, facade.getIncidentEvidence])
    await assert.rejects(read(req, 1), { status: 403 });
  file.requestRecipient = account.email;
  assert.ok((await facade.getIncidentEvidence(req, 1)).fileData);
  file.requestRecipient = 'other@example.com';
  file.requestCreator = account.email;
  assert.ok((await facade.getIncidentEvidence(req, 1)).fileData);
  file.requestId = null;
  assert.ok((await facade.getIncidentEvidence(req, 1)).fileData);
  file.assigned_head_email = 'head@example.com';
  file.reported_employee_email = 'employee@example.com';
  file.isParticipant = 0;
  await assert.rejects(legacy.getIncidentEvidence(req, 1), { status: 403 });
  account.role = 'HR';
  file.requestId = 2;
  assert.ok((await facade.getIncidentEvidence(req, 1)).fileData);
});

test('current workflow still dispatches case and evidence reads to current services', async (t) => {
  t.mock.method(pool, 'execute', async (sql) => {
    if (sql.includes('SELECT workflow_version'))
      return [[{ workflow_version: 2 }]];
    if (sql.includes('SELECT incident_id FROM incident_evidence'))
      return [[{ incident_id: 1 }]];
    throw new Error('Unexpected legacy query: ' + sql);
  });
  const req = { session: { userEmail: 'admin@example.com' } };
  t.mock.method(reports, 'view', async (received, id) => {
    assert.equal(received, req);
    assert.equal(id, 1);
    return { current: true };
  });
  t.mock.method(reports, 'evidenceFile', async (received, id) => {
    assert.equal(received, req);
    assert.equal(id, 2);
    return { currentFile: true };
  });
  assert.deepEqual(await facade.getIncidentCase(req, 1), { current: true });
  assert.deepEqual(await facade.getIncidentEvidence(req, 2), {
    currentFile: true
  });
});

test('current assigned HEAD and Management Approver rights remain unchanged', async (t) => {
  t.mock.method(pool, 'execute', async () => [[]]);
  const row = {
    id: 1,
    reported_employee_email: 'employee@example.com',
    reporter_email: 'reporter@example.com',
    assigned_head_email: 'head@example.com',
    management_email: 'manager@example.com'
  };
  const head = await access.access(
    pool,
    { email: 'head@example.com', role: 'ADMIN' },
    row
  );
  assert.equal(head.head, true);
  assert.equal(head.maxSection, 8);
  const manager = await access.access(
    pool,
    { email: 'manager@example.com', role: 'ADMIN' },
    row
  );
  assert.equal(manager.manager, true);
  assert.equal(manager.maxSection, 8);
});
