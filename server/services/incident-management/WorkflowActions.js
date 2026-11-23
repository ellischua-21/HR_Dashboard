const A = require('./WorkflowAccess');
const { normalizeSignature } = require('./Validation');
const { readMatrix, matrixActionForOccurrence } = require('./Conduct');
const { manilaDate } = require('../../../shared/DateUtils');
const crypto = require('crypto');
const Tasks = require('../TaskService');
const {
  classifications,
  evidenceTypes,
  reviewIndicators,
  responseCalendarDays,
  directive
} = require('../../../shared/IncidentWorkflow');
const participantEmails = (report) =>
  [
    report.concernedEmployee?.email,
    ...(report.involved || []).map((person) => person.email),
    ...(report.witnesses || []).map((person) => person.email)
  ].filter(Boolean);
async function head(db, row, rights) {
  A.assert(
    rights.head && row.phase === 'HEAD',
    'Only the assigned department reviewer can perform HEAD review.'
  );
  A.assert(
    !(await A.pending(db, row.id)),
    'Wait for the requested information before continuing.'
  );
}
async function owner(db, row, user, rights, allowWaiting = false) {
  A.assert(rights.hr, 'Only an uninvolved HR can process this review.');
  if (!allowWaiting) await Tasks.assertOwner(db, 'INCIDENT', row.id, user);
  else {
    const task = await Tasks.taskInfo(db, 'INCIDENT', row.id, user);
    A.assert(task?.isMine, 'Only the assigned HR can update this task.');
  }
}
async function count(db, row, severity, lock = false) {
  const [records] = await db.execute(
    `SELECT h.id FROM incident_disciplinary_history h
    JOIN incident_decisions d ON d.id=h.decision_id AND d.status='ISSUED' AND d.outcome<>'NO_VIOLATION'
    JOIN incident_evaluations e ON e.id=d.evaluation_id AND e.finding='SUBSTANTIATED'
    WHERE LOWER(h.employee_email)=LOWER(?) AND h.severity=? AND h.incident_id<>?${lock ? ' FOR UPDATE' : ''}`,
    [row.reported_employee_email, severity, row.id]
  );
  return records.length;
}
async function recommendation(db, row, severity) {
  const previousOffenses = await count(db, row, severity),
    matrix = await readMatrix(db);
  const action = matrixActionForOccurrence(
    matrix,
    severity,
    previousOffenses + 1
  );
  A.assert(
    action,
    'Configure a corrective action for this severity and occurrence in Code Of Conduct.'
  );
  return {
    severity,
    previousOffenses,
    occurrence: previousOffenses + 1,
    correctiveAction: action.correctiveAction,
    matrix
  };
}
function nteInput(input, issue) {
  A.assert(
    classifications.includes(input.classification) ||
      (!issue && !input.classification),
    'Select a preliminary classification.'
  );
  return {
    policy: A.text(
      input.policy,
      'Applicable Policy / Handbook Provision',
      issue
    ),
    rule: A.text(input.rule, 'Specific Rule / Section Number', false, 191),
    classification: input.classification,
    otherClassification: A.text(
      input.otherClassification,
      'Other Classification',
      issue && input.classification === 'Other',
      191
    ),
    possiblePenalty: A.text(
      input.possiblePenalty,
      'Preliminary Possible Penalty',
      false,
      191
    ),
    evidenceTypes: (Array.isArray(input.evidenceTypes)
      ? input.evidenceTypes
      : []
    ).filter((v) => evidenceTypes.includes(v)),
    evidenceDetails: A.text(
      input.evidenceDetails,
      'Details Of Supporting Evidence',
      false
    ),
    responseCalendarDays
  };
}
async function takeHead(req, id) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    A.assert(
      rights.poolReviewer && row.phase === 'HEAD',
      'This report has already been assigned or is not available to you.'
    );
    await db.execute(
      'UPDATE incident_reports SET assigned_head_email=? WHERE id=?',
      [user.email, row.id]
    );
    await A.activity(
      db,
      row,
      user,
      'HEAD_TASK_TAKEN',
      'ADMIN acting as HEAD took this review.'
    );
  });
}
async function saveNte(req, id, input = {}, issue = false) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    await head(db, row, rights);
    const nte = nteInput(input, issue);
    await A.evidence(db, row, user, input.files, 4);
    if (issue) {
      nte.signature = normalizeSignature(input.signature);
      nte.issuerName = user.full_name || user.email;
      nte.issuerEmail = user.email;
      const [[employee]] = await db.execute(
        'SELECT position FROM employees WHERE record_id=?',
        [user.employee_id]
      );
      nte.issuerPosition = employee?.position || user.role;
      nte.issuedAt = A.now();
      nte.dateIssued = manilaDate();
      nte.directive = directive;
      const [files] = await db.execute(
        'SELECT id,SHA2(file_data,256) AS hash FROM incident_evidence WHERE incident_id=? AND section_number IN (2,4) ORDER BY id',
        [row.id]
      );
      nte.documentVersion = crypto
        .createHash('sha256')
        .update(JSON.stringify({ report: row.report, nte, files }))
        .digest('hex');
      await A.document(db, row, user, 'NTE_ISSUED', {
        report: row.report,
        nte,
        files
      });
      await db.execute(
        "UPDATE incident_workflows SET nte=?,nte_issued_at=CURRENT_TIMESTAMP,deadline_date=?,phase='EMPLOYEE' WHERE incident_id=?",
        [
          JSON.stringify(nte),
          A.calendarDays(nte.dateIssued, responseCalendarDays),
          row.id
        ]
      );
      await A.activity(
        db,
        row,
        user,
        'NTE_ISSUED',
        'Notice To Explain issued.',
        'NTE ISSUED'
      );
      await A.notify(db, row, 'NTE_ISSUED', user, [
        row.reporter_email,
        row.reported_employee_email,
        row.report.concernedEmployee?.email,
        ...(await A.reviewers(db))
      ]);
    } else {
      await db.execute(
        'UPDATE incident_workflows SET nte=? WHERE incident_id=?',
        [JSON.stringify(nte), row.id]
      );
      await A.activity(db, row, user, 'NTE_DRAFT_SAVED', 'Notice draft saved.');
    }
  });
}
async function recordReceipt(db, row, user, signature) {
  const receipt = {
    signature: normalizeSignature(signature),
    receivedAt: A.now(),
    employeeName: user.full_name || user.email,
    employeeEmail: user.email,
    documentVersion: row.nte.documentVersion
  };
  await A.document(db, row, user, 'NTE_RECEIPT', receipt);
  await db.execute(
    'UPDATE incident_workflows SET receipt=?,received_at=CURRENT_TIMESTAMP WHERE incident_id=?',
    [JSON.stringify(receipt), row.id]
  );
  await A.activity(
    db,
    row,
    user,
    'NTE_RECEIVED',
    'Receipt acknowledged; existing explanation deadline unchanged.'
  );
  await A.notify(db, row, 'NTE_RECEIVED', user, [
    row.assigned_head_email,
    ...(await A.reviewers(db))
  ]);
}
async function acknowledge(req, id, input = {}) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    A.assert(
      rights.reported && row.phase === 'EMPLOYEE' && !row.received_at,
      'Only the reported employee can acknowledge this notice once.'
    );
    await recordReceipt(db, row, user, input.signature);
  });
}
async function explanation(req, id, input = {}, submit = false) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    A.assert(
      rights.reported &&
        row.phase === 'EMPLOYEE' &&
        row.nte_issued_at &&
        !row.explanation_submitted_at,
      'Only the reported employee can respond to an outstanding issued NTE.'
    );
    const statement = submit
      ? A.explanation(input.statement, 'Employee Explanation')
      : A.text(input.statement, 'Employee Explanation', false);
    const record = {
      statement,
      hearingRequested: Boolean(input.hearingRequested)
    };
    if (submit) {
      record.signature = normalizeSignature(input.signature);
      record.submittedAt = A.now();
      record.employeeName = user.full_name || user.email;
      record.employeeEmail = user.email;
      record.documentVersion = row.nte.documentVersion;
      if (!row.received_at)
        await recordReceipt(db, row, user, record.signature);
      await A.document(db, row, user, 'EMPLOYEE_EXPLANATION', record);
      await db.execute(
        "UPDATE incident_workflows SET explanation=?,explanation_draft=NULL,explanation_submitted_at=CURRENT_TIMESTAMP,phase='HR' WHERE incident_id=?",
        [JSON.stringify(record), row.id]
      );
      await db.execute(
        "UPDATE incident_extension_requests SET status='RESOLVED',reviewed_at=CURRENT_TIMESTAMP,review_reason='Explanation submitted before extension review.' WHERE incident_id=? AND status='PENDING'",
        [row.id]
      );
      await A.activity(
        db,
        row,
        user,
        'EXPLANATION_SENT',
        'Signed employee explanation submitted.'
      );
      await A.notify(db, row, 'EXPLANATION_SENT', user, [
        row.assigned_head_email,
        ...(await A.reviewers(db))
      ]);
    } else {
      await db.execute(
        'UPDATE incident_workflows SET explanation_draft=? WHERE incident_id=?',
        [JSON.stringify(record), row.id]
      );
    }
    await A.evidence(db, row, user, input.files, 7);
  });
}
async function requestInformation(req, id, input = {}) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    if (row.phase === 'HEAD') await head(db, row, rights);
    else {
      A.assert(row.phase === 'HR');
      await owner(db, row, user, rights);
    }
    A.assert(
      !(await A.pending(db, row.id)),
      'Wait for all requested responses before sending another request.'
    );
    const requests = input.requests;
    A.assert(
      Array.isArray(requests) && requests.length > 0 && requests.length <= 25,
      'Select the employees who need to respond.'
    );
    const eligible = new Set(
      [
        row.reporter_email,
        row.reported_employee_email,
        row.assigned_head_email,
        ...participantEmails(row.report)
      ]
        .filter(Boolean)
        .map((v) => v.toLowerCase())
    );
    const used = new Set();
    for (const request of requests) {
      const email = String(request.email || '')
        .trim()
        .toLowerCase();
      A.assert(
        eligible.has(email) && !used.has(email) && !A.same(email, user.email),
        'Select an involved employee other than yourself, once per request.'
      );
      if (row.phase === 'HEAD')
        A.assert(
          A.same(email, row.reporter_email),
          'HEAD requests are directed to the filing supervisor.'
        );
      used.add(email);
      const [insert] = await db.execute(
        'INSERT INTO incident_information_requests (incident_id,requested_by,recipient_email,request_text,section_number) VALUES (?,?,?,?,?)',
        [
          row.id,
          user.email,
          email,
          A.explanation(request.text, 'Requested Information'),
          row.phase === 'HEAD' ? 4 : 8
        ]
      );
      await A.activity(
        db,
        row,
        user,
        'INFORMATION_REQUESTED',
        'Additional information requested.'
      );
      await A.notify(db, row, `INFO_REQ_${insert.insertId}`, user, [email]);
    }
  });
}
async function respond(req, id, input = {}) {
  return A.mutate(req, id, async (db, row, user) => {
    const [[request]] = await db.execute(
      'SELECT * FROM incident_information_requests WHERE id=? AND incident_id=? FOR UPDATE',
      [A.id(input.requestId), row.id]
    );
    A.assert(
      request &&
        A.same(request.recipient_email, user.email) &&
        request.status === 'PENDING',
      'This request is unavailable or already answered.'
    );
    await db.execute(
      "UPDATE incident_information_requests SET response_text=?,status='RESPONDED',responded_at=CURRENT_TIMESTAMP WHERE id=?",
      [A.explanation(input.statement, 'Response'), request.id]
    );
    await A.evidence(
      db,
      row,
      user,
      input.files,
      row.phase === 'HEAD' ? 4 : 8,
      request.id
    );
    await A.activity(
      db,
      row,
      user,
      'INFORMATION_PROVIDED',
      'Requested information submitted.'
    );
    await A.notify(db, row, `INFO_DONE_${request.id}`, user, [
      request.requested_by
    ]);
  });
}
async function requestExtension(req, id, input = {}) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    A.assert(
      rights.reported && row.phase === 'EMPLOYEE' && row.nte_issued_at,
      'Extensions can be requested for an outstanding issued NTE.'
    );
    const days = Number(input.days);
    A.assert(
      Number.isInteger(days) && days >= 1 && days <= 60,
      'Request between 1 and 60 calendar days.'
    );
    const [[existing]] = await db.execute(
      "SELECT id FROM incident_extension_requests WHERE incident_id=? AND status='PENDING'",
      [row.id]
    );
    A.assert(!existing, 'Your extension request is awaiting HR review.');
    const [insert] = await db.execute(
      'INSERT INTO incident_extension_requests (incident_id,requested_by,requested_days,reason) VALUES (?,?,?,?)',
      [
        row.id,
        user.email,
        days,
        A.explanation(input.reason, 'Extension Reason')
      ]
    );
    await A.activity(
      db,
      row,
      user,
      'EXTENSION_REQUESTED',
      'NTE response extension requested.'
    );
    await A.notify(
      db,
      row,
      `EXT_REQ_${insert.insertId}`,
      user,
      await A.reviewers(db)
    );
  });
}
async function reviewExtension(req, id, input = {}) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    A.assert(
      rights.hr && row.phase === 'EMPLOYEE' && !row.explanation_submitted_at,
      'Only HR can review an outstanding explanation extension.'
    );
    const [[request]] = await db.execute(
      "SELECT * FROM incident_extension_requests WHERE id=? AND incident_id=? AND status='PENDING' FOR UPDATE",
      [A.id(input.requestId), row.id]
    );
    A.assert(request, 'This extension has already been processed.');
    const days = input.approve ? Number(input.days) : 0;
    A.assert(
      !input.approve || (Number.isInteger(days) && days >= 1 && days <= 60),
      'Approve between 1 and 60 calendar days.'
    );
    const deadline = days
      ? A.calendarDays(row.deadline_date, days)
      : row.deadline_date;
    await db.execute(
      `UPDATE incident_extension_requests SET status=?,approved_days=?,previous_deadline=?,new_deadline=?,reviewed_by=?,review_reason=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`,
      [
        input.approve ? 'APPROVED' : 'REJECTED',
        days,
        row.deadline_date,
        deadline,
        user.email,
        A.text(input.reason, 'Review Remarks', false),
        request.id
      ]
    );
    if (days)
      await db.execute(
        'UPDATE incident_workflows SET deadline_date=? WHERE incident_id=?',
        [deadline, row.id]
      );
    await A.activity(
      db,
      row,
      user,
      'EXTENSION_REVIEWED',
      'Extension request processed.'
    );
    await A.notify(db, row, `EXT_DONE_${request.id}`, user, [
      row.reported_employee_email,
      row.assigned_head_email
    ]);
  });
}
async function hearing(req, id, input = {}) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    await owner(db, row, user, rights, Boolean(input.completed));
    A.assert(
      row.phase === 'HR',
      'Hearings must be completed before submitting a recommendation for approval.'
    );
    const done = Boolean(input.completed);
    A.assert(
      done
        ? row.hearing_status === 'SCHEDULED'
        : row.hearing_status !== 'SCHEDULED',
      'Update the current hearing before scheduling another.'
    );
    const details = A.text(
      input.details,
      done ? 'Hearing Completion Remarks' : 'Hearing Details'
    );
    if (done)
      await db.execute(
        "UPDATE incident_workflows SET hearing_status='COMPLETED',hearing_completed_at=CURRENT_TIMESTAMP,hearing_completion_notes=? WHERE incident_id=?",
        [details, row.id]
      );
    else
      await db.execute(
        "UPDATE incident_workflows SET hearing_status='SCHEDULED',hearing_details=?,hearing_completed_at=NULL,hearing_completion_notes=NULL WHERE incident_id=?",
        [details, row.id]
      );
    await A.activity(
      db,
      row,
      user,
      done ? 'HEARING_COMPLETED' : 'HEARING_SCHEDULED',
      details
    );
    await A.notify(
      db,
      row,
      `HEARING_${done ? 'DONE' : 'SET'}_${row.revision}`,
      user,
      [
        row.reporter_email,
        row.reported_employee_email,
        row.assigned_head_email,
        ...participantEmails(row.report)
      ]
    );
  });
}
async function saveReview(req, id, input = {}, send = false) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    A.assert(row.phase === 'HR');
    await owner(db, row, user, rights);
    A.assert(
      ['SUBSTANTIATED', 'NOT_SUBSTANTIATED'].includes(input.finding),
      'Select whether a violation was established.'
    );
    const review = {
      finding: input.finding,
      findings: A.explanation(input.findings, 'HR Findings / Assessment'),
      remarks: A.text(input.remarks, 'Additional Remarks', false),
      reviewedBy: user.email,
      reviewerName: user.full_name || user.email,
      reviewedAt: A.now(),
      checks: Array.isArray(input.checks)
        ? input.checks.filter((v) => reviewIndicators.includes(v))
        : []
    };
    if (review.finding === 'SUBSTANTIATED') {
      A.assert(
        ['Light', 'Moderate', 'Grave', 'Intolerable'].includes(input.severity),
        'Select the violation severity.'
      );
      Object.assign(review, await recommendation(db, row, input.severity));
    } else
      Object.assign(review, {
        severity: null,
        correctiveAction: 'No Further Action',
        previousOffenses: 0
      });
    if (send) {
      const [[settings]] = await db.execute(
        'SELECT management_email FROM incident_workflow_settings WHERE id=1'
      );
      const manager = String(
        input.managementEmail || settings.management_email || ''
      );
      A.assert(
        manager &&
          (await isActiveAdmin(db, manager)) &&
          !A.same(manager, row.reported_employee_email) &&
          !A.same(manager, row.reporter_email) &&
          !A.same(manager, row.report.concernedEmployee?.email) &&
          !(row.report.involved || []).some((person) =>
            A.same(person.email, manager)
          ) &&
          !(row.report.witnesses || []).some((w) => A.same(w.email, manager)),
        'Select an active, uninvolved ADMIN as Management approver.'
      );
      review.version = crypto
        .createHash('sha256')
        .update(JSON.stringify(review))
        .digest('hex');
      await A.document(db, row, user, 'HR_RECOMMENDATION', review);
      await db.execute(
        "UPDATE incident_workflows SET hr_review=?,management=NULL,approved_at=NULL,management_email=?,phase='MANAGEMENT' WHERE incident_id=?",
        [JSON.stringify(review), manager, row.id]
      );
      await A.activity(
        db,
        row,
        user,
        'MANAGEMENT_REQUESTED',
        'HR recommendation sent for Management approval.'
      );
      await A.notify(db, row, `MANAGEMENT_${row.revision}`, user, [manager]);
    } else {
      await db.execute(
        'UPDATE incident_workflows SET hr_review=? WHERE incident_id=?',
        [JSON.stringify(review), row.id]
      );
      await A.activity(
        db,
        row,
        user,
        'EVALUATION_SAVED',
        'HR assessment saved.'
      );
    }
  });
}
async function management(req, id, input = {}) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    A.assert(
      user.role === 'ADMIN' &&
        rights.manager &&
        row.phase === 'MANAGEMENT' &&
        !rights.reported &&
        !rights.reporter,
      'Only the designated, uninvolved Management approver can process this recommendation.'
    );
    const approved = Boolean(input.approve),
      record = {
        approved,
        remarks: A.text(input.remarks, 'Management Remarks', !approved),
        approvedBy: user.email,
        approverName: user.full_name || user.email,
        reviewVersion: row.hr_review.version,
        recordedAt: A.now()
      };
    await A.document(db, row, user, 'MANAGEMENT_REVIEW', record);
    await db.execute(
      `UPDATE incident_workflows SET management=?,approved_at=${approved ? 'CURRENT_TIMESTAMP' : 'NULL'},phase=? WHERE incident_id=?`,
      [JSON.stringify(record), approved ? 'FINAL_ACTION' : 'HR', row.id]
    );
    await A.activity(
      db,
      row,
      user,
      approved ? 'MANAGEMENT_APPROVED' : 'MANAGEMENT_RETURNED',
      'Management processed the HR recommendation.'
    );
    const [[task]] = await db.execute(
      "SELECT owner_email FROM hr_tasks WHERE resource_type='INCIDENT' AND resource_id=? AND phase='HR'",
      [row.id]
    );
    await A.notify(db, row, `MGMT_DONE_${row.revision}`, user, [
      task?.owner_email
    ]);
  });
}
async function isActiveAdmin(db, email) {
  const [[account]] = await db.execute(
    "SELECT 1 FROM user_roles u WHERE LOWER(u.email)=LOWER(?) AND u.role='ADMIN' AND u.active=1 AND EXISTS (SELECT 1 FROM employees e WHERE LOWER(e.personal_email)=LOWER(u.email) AND e.record_status<>'Archived') LIMIT 1",
    [email]
  );
  return Boolean(account);
}
async function issueDecision(req, id) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    A.assert(
      row.phase === 'FINAL_ACTION' &&
        row.approved_at &&
        row.management?.approved &&
        !row.decision_issued_at,
      'Management approval is required before issuing a final action.'
    );
    await owner(db, row, user, rights);
    A.assert(
      row.hr_review.version === row.management.reviewVersion,
      'This recommendation needs new Management approval.'
    );
    const review = row.hr_review,
      substantiated = review.finding === 'SUBSTANTIATED';
    await db.execute(
      'SELECT record_id FROM employees WHERE record_id=? FOR UPDATE',
      [row.reported_employee_id]
    );
    if (substantiated)
      A.assert(
        (await count(db, row, review.severity, true)) ===
          review.previousOffenses,
        'The employee’s finalized violation count changed. Return this recommendation for a new evaluation and Management approval.'
      );
    const [[subject]] = await db.execute(
      'SELECT id FROM incident_case_subjects WHERE incident_id=? ORDER BY id LIMIT 1',
      [row.id]
    );
    const action = review.correctiveAction,
      outcome = !substantiated
        ? 'NO_VIOLATION'
        : /terminat/i.test(action)
          ? 'TERMINATION'
          : /suspens/i.test(action)
            ? 'SUSPENSION'
            : /warning|reprimand/i.test(action)
              ? 'WRITTEN_WARNING'
              : 'OTHER_CORRECTIVE_ACTION';
    const [evaluation] = await db.execute(
      `INSERT INTO incident_evaluations (incident_id,subject_id,finding,findings,violation_title,code_reference,severity,previous_offenses,recommended_action,recommendation_justification,remarks,evaluated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.id,
        subject.id,
        review.finding,
        review.findings,
        row.subject,
        '',
        review.severity,
        review.previousOffenses,
        action,
        '',
        review.remarks,
        user.email
      ]
    );
    const [decision] = await db.execute(
      `INSERT INTO incident_decisions (incident_id,subject_id,evaluation_id,outcome,violation_title,code_reference,severity,final_action,decision_reason,approver_email,approver_name,approval_signature)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.id,
        subject.id,
        evaluation.insertId,
        outcome,
        row.subject,
        '',
        review.severity,
        action,
        review.findings,
        row.management.approvedBy,
        row.management.approverName,
        ''
      ]
    );
    if (substantiated)
      await db.execute(
        `INSERT INTO incident_disciplinary_history (incident_id,subject_id,decision_id,employee_email,violation_title,code_reference,severity,corrective_action) VALUES (?,?,?,?,?,?,?,?)`,
        [
          row.id,
          subject.id,
          decision.insertId,
          row.reported_employee_email,
          row.subject,
          '',
          review.severity,
          action
        ]
      );
    const record = {
      outcome,
      findings: review.findings,
      severity: review.severity,
      correctiveAction: action,
      occurrence: review.occurrence || null,
      issuedBy: user.email,
      issuedAt: A.now(),
      approvedBy: row.management.approverName,
      approvedAt: row.management.recordedAt
    };
    await A.document(db, row, user, 'FINAL_DECISION', record);
    await db.execute(
      "UPDATE incident_workflows SET decision=?,decision_issued_at=CURRENT_TIMESTAMP,phase='FINALIZED' WHERE incident_id=?",
      [JSON.stringify(record), row.id]
    );
    await A.activity(
      db,
      row,
      user,
      'DECISION_ISSUED',
      'Approved final decision issued.'
    );
    await A.notify(db, row, 'DECISION_ISSUED', user, [
      row.reported_employee_email,
      row.reporter_email,
      row.assigned_head_email,
      row.management_email,
      ...participantEmails(row.report)
    ]);
  });
}
async function revise(req, id) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    A.assert(
      row.phase === 'FINAL_ACTION',
      'Only an approved, unissued recommendation can be returned for revision.'
    );
    await owner(db, row, user, rights);
    await db.execute(
      "UPDATE incident_workflows SET phase='HR',management=NULL,approved_at=NULL WHERE incident_id=?",
      [row.id]
    );
    await A.activity(
      db,
      row,
      user,
      'EVALUATION_REOPENED',
      'HR reopened the recommendation; new Management approval is required.'
    );
  });
}
async function close(req, id, input = {}) {
  return A.mutate(req, id, async (db, row, user, rights) => {
    if (row.phase === 'HEAD') await head(db, row, rights);
    else {
      A.assert(
        row.phase === 'FINALIZED' && row.decision_issued_at,
        'Issue the approved final decision before closing.'
      );
      await owner(db, row, user, rights);
    }
    const reason = A.explanation(input.reason, 'Closure Reason');
    await db.execute(
      "UPDATE incident_workflows SET phase='CLOSED',closed_at=CURRENT_TIMESTAMP,closure_reason=? WHERE incident_id=?",
      [reason, row.id]
    );
    await db.execute(
      'UPDATE incident_decisions SET closed_at=CURRENT_TIMESTAMP,closure_reason=? WHERE incident_id=?',
      [reason, row.id]
    );
    await A.activity(db, row, user, 'CASE_CLOSED', reason, 'CLOSED');
    await A.notify(db, row, 'CASE_CLOSED', user, [
      row.reported_employee_email,
      row.reporter_email,
      row.assigned_head_email,
      row.management_email,
      ...participantEmails(row.report)
    ]);
  });
}
async function suggest(req, id, severity) {
  const user = await A.actor(req),
    row = await A.load(A.pool, id),
    rights = await A.access(A.pool, user, row);
  A.assert(rights.hr);
  return recommendation(A.pool, row, severity);
}
module.exports = {
  takeHead,
  saveNte,
  acknowledge,
  explanation,
  requestInformation,
  respond,
  requestExtension,
  reviewExtension,
  hearing,
  saveReview,
  management,
  issueDecision,
  revise,
  close,
  suggest
};
