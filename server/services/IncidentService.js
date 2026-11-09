// Read-only support for documents created before the section-based workflow.
const { httpError } = require('../utils/HttpError');
const { pool } = require('../db/database');
const { requirePerm } = require('../middleware/Auth');
const { logAudit } = require('./AuditService');
const {
  canViewIncident,
  incidentAccessScope,
  buildIncidentTracking
} = require('./incident-management/Tracking');
const { publicTimeline } = require('./incident-management/Activity');
const {
  manilaDate: currentManilaDate,
  workingDaysBetween
} = require('../../shared/DateUtils');
const VIEW_ROLES = new Set(['HR', 'ADMIN']);

async function getIncidentTrackingVersion(req, incidentId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(incidentId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid Incident Report.', 400);
  const scope = incidentAccessScope(user);
  const [[row]] = await pool.execute(
    `SELECT CONCAT_WS(':', status, updated_at,
       (SELECT COALESCE(MAX(a.id), 0) FROM incident_activity a WHERE a.incident_id = incident_reports.id),
       (SELECT COALESCE(MAX(s.signed_at), '') FROM incident_signatures s WHERE s.incident_id = incident_reports.id),
       (SELECT COALESCE(MAX(t.updated_ms), 0) FROM hr_tasks t WHERE t.resource_type = 'INCIDENT' AND t.resource_id = incident_reports.id)) AS version
     FROM incident_reports WHERE id = ? AND ${scope.sql}`,
    [id, ...scope.values]
  );
  if (!row) throw httpError('Incident Report not found or access denied.', 404);
  return row;
}

async function getIncidentNteEvidence(req, evidenceId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(evidenceId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid NTE attachment.', 400);
  const [rows] = await pool.execute(
    `SELECT f.id, f.file_name AS fileName, f.mime_type AS mimeType, f.file_data AS fileData,
            n.status AS nteStatus, i.case_number AS caseNumber,
            i.reported_employee_email AS employeeEmail
     FROM incident_nte_evidence f JOIN incident_ntes n ON n.id = f.nte_id
     JOIN incident_reports i ON i.id = n.incident_id WHERE f.id = ? LIMIT 1`,
    [id]
  );
  const file = rows[0];
  if (!file) throw httpError('NTE attachment not found.', 404);
  if (
    !VIEW_ROLES.has(user.role) &&
    (file.nteStatus !== 'ISSUED' ||
      file.employeeEmail.toLowerCase() !== user.email.toLowerCase())
  )
    throw httpError('You do not have access to this NTE attachment.', 403);
  await logAudit(
    user.email,
    'READ',
    file.caseNumber,
    `Downloaded NTE attachment ${file.id}: ${file.fileName}.`
  );
  return file;
}

async function getIncidentExplanationEvidence(req, evidenceId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(evidenceId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid explanation attachment.', 400);
  const [rows] = await pool.execute(
    `SELECT f.id, f.file_name AS fileName, f.mime_type AS mimeType, f.file_data AS fileData,
            i.case_number AS caseNumber, i.reported_employee_email AS employeeEmail
     FROM incident_explanation_evidence f JOIN incident_explanations e ON e.id = f.explanation_id
     JOIN incident_ntes n ON n.id = e.nte_id JOIN incident_reports i ON i.id = n.incident_id
     WHERE f.id = ? LIMIT 1`,
    [id]
  );
  const file = rows[0];
  if (!file) throw httpError('Explanation attachment not found.', 404);
  if (
    !VIEW_ROLES.has(user.role) &&
    file.employeeEmail.toLowerCase() !== user.email.toLowerCase()
  )
    throw httpError(
      'You do not have access to this explanation attachment.',
      403
    );
  await logAudit(
    user.email,
    'READ',
    file.caseNumber,
    `Downloaded explanation attachment ${file.id}: ${file.fileName}.`
  );
  return file;
}

async function getIncidentExplanationDraftEvidence(req, evidenceId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(evidenceId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid draft attachment.', 400);
  const [rows] = await pool.execute(
    `SELECT f.id, f.file_name AS fileName, f.mime_type AS mimeType, f.file_data AS fileData,
            i.case_number AS caseNumber, d.employee_email AS employeeEmail
     FROM incident_explanation_draft_evidence f
     JOIN incident_explanation_drafts d ON d.nte_id = f.nte_id
     JOIN incident_ntes n ON n.id = d.nte_id
     JOIN incident_reports i ON i.id = n.incident_id
     WHERE f.id = ? LIMIT 1`,
    [id]
  );
  const file = rows[0];
  if (!file) throw httpError('Draft attachment not found.', 404);
  if (
    !VIEW_ROLES.has(user.role) &&
    file.employeeEmail.toLowerCase() !== user.email.toLowerCase()
  )
    throw httpError('You do not have access to this draft attachment.', 403);
  await logAudit(
    user.email,
    'READ',
    file.caseNumber,
    `Downloaded draft explanation attachment ${file.id}: ${file.fileName}.`
  );
  return file;
}

async function getIncidentExplanationAddendumEvidence(req, evidenceId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(evidenceId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid additional statement attachment.', 400);
  const [rows] = await pool.execute(
    `SELECT f.id, f.file_name AS fileName, f.mime_type AS mimeType, f.file_data AS fileData,
            i.case_number AS caseNumber, i.reported_employee_email AS employeeEmail
     FROM incident_explanation_addendum_evidence f
     JOIN incident_explanation_addenda a ON a.id = f.addendum_id
     JOIN incident_ntes n ON n.id = a.nte_id
     JOIN incident_reports i ON i.id = n.incident_id WHERE f.id = ? LIMIT 1`,
    [id]
  );
  const file = rows[0];
  if (!file) throw httpError('Additional statement attachment not found.', 404);
  if (
    !VIEW_ROLES.has(user.role) &&
    file.employeeEmail.toLowerCase() !== user.email.toLowerCase()
  )
    throw httpError('You do not have access to this attachment.', 403);
  await logAudit(
    user.email,
    'READ',
    file.caseNumber,
    `Downloaded statement attachment ${file.id}: ${file.fileName}.`
  );
  return file;
}

async function getIncidentCase(req, incidentId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(incidentId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid Incident Report.', 400);
  const [rows] = await pool.execute(
    `SELECT id, case_number AS caseNumber, reporter_email AS reporterEmail,
            reporter_employee_id AS reporterEmployeeId, reporter_name AS reporterName,
            department, position, reported_employee_id AS reportedEmployeeId,
            reported_employee_email AS reportedEmployeeEmail,
            reported_employee_name AS reportedEmployeeName,
            (SELECT e.department FROM employees e WHERE e.record_id = incident_reports.reported_employee_id LIMIT 1) AS reportedEmployeeDepartment,
            (SELECT e.position FROM employees e WHERE e.record_id = incident_reports.reported_employee_id LIMIT 1) AS reportedEmployeePosition,
            assigned_head_email AS assignedHeadEmail,
            (SELECT u.role FROM user_roles u WHERE u.email = incident_reports.assigned_head_email LIMIT 1) AS assignedReviewerRole,
            date_reported AS dateReported, subject, incident_date AS incidentDate,
            location, incident_time AS incidentTime, description, comments, status,
            document_version AS documentVersion,
            created_at AS createdAt, updated_at AS updatedAt
     FROM incident_reports WHERE id = ? LIMIT 1`,
    [id]
  );
  const incident = rows[0];
  if (!incident) throw httpError('Incident Report not found.', 404);
  let isParticipant = false;
  if (!canViewIncident(user, incident)) {
    const [participants] = await pool.execute(
      `SELECT 1 FROM incident_participants p
       JOIN employees e ON e.record_id = p.employee_record_id
       JOIN user_roles u ON LOWER(u.email) = LOWER(e.personal_email) AND u.active = 1
       WHERE p.incident_id = ? AND LOWER(u.email) = LOWER(?) LIMIT 1`,
      [id, user.email]
    );
    isParticipant = participants.length > 0;
  }
  if (!canViewIncident(user, incident) && !isParticipant)
    throw httpError('You do not have access to this Incident Report.', 403);

  await logAudit(
    user.email,
    'READ',
    incident.caseNumber,
    'Viewed Incident Management case details.'
  );

  const [[participants], [signatures], [evidence], [activity], [requests]] =
    await Promise.all([
      pool.execute(
        `SELECT participant_type AS participantType,
              employee_record_id AS employeeId, full_name AS name, sort_order AS sortOrder
       FROM incident_participants WHERE incident_id = ?
       ORDER BY participant_type, sort_order`,
        [id]
      ),
      pool.execute(
        `SELECT signatory_role AS role, signer_email AS signerEmail,
              signature_data AS signature, document_version AS documentVersion,
              signed_at AS signedAt
       FROM incident_signatures WHERE incident_id = ?`,
        [id]
      ),
      pool.execute(
        `SELECT id, file_name AS fileName, mime_type AS mimeType,
              byte_size AS byteSize, uploaded_by AS uploadedBy, request_id AS requestId,
              created_at AS createdAt
       FROM incident_evidence e
       WHERE incident_id = ? AND (
         e.request_id IS NULL OR ? = 1 OR EXISTS (
           SELECT 1 FROM incident_information_requests r
           WHERE r.id = e.request_id AND
             (LOWER(r.recipient_email) = LOWER(?) OR LOWER(r.requested_by) = LOWER(?))
         )
       ) ORDER BY id`,
        [id, VIEW_ROLES.has(user.role) ? 1 : 0, user.email, user.email]
      ),
      pool.execute(
        `SELECT action, details, actor_email AS actorEmail, created_at AS createdAt,
              previous_status AS previousStatus, new_status AS newStatus, document_reference AS documentReference
       FROM incident_activity WHERE incident_id = ? ORDER BY created_at, id`,
        [id]
      ),
      pool.execute(
        `SELECT id, requested_by AS requestedBy, recipient_email AS recipientEmail,
              request_text AS requestText, response_text AS responseText, status,
              created_at AS createdAt, responded_at AS respondedAt
       FROM incident_information_requests WHERE incident_id = ? ORDER BY created_at, id`,
        [id]
      )
    ]);
  const canViewNte =
    VIEW_ROLES.has(user.role) ||
    incident.reportedEmployeeEmail.toLowerCase() === user.email.toLowerCase();
  let nte = null;
  let evaluation = null;
  let decision = null;
  let disciplinaryHistory = [];
  let explanationDraft = null;
  let explanations = [];
  let addenda = [];
  let extensions = [];
  if (canViewNte) {
    const [[nteRows], [draftRows], [explanationRows], [extensionRows]] =
      await Promise.all([
        pool.execute(
          `SELECT id, provision_id AS provisionId, provision_code AS provisionCode, provision_title AS provisionTitle,
                provision_text AS provisionText, allegation,
                DATE_FORMAT(issuance_date, '%Y-%m-%d') AS issuanceDate,
                DATE_FORMAT(receipt_date, '%Y-%m-%d') AS receiptDate,
                response_working_days AS responseWorkingDays,
                DATE_FORMAT(deadline_date, '%Y-%m-%d') AS deadlineDate, signer_email AS signerEmail,
                signer_name AS signerName, signature_data AS signature, status,
                issued_at AS issuedAt, overdue_at AS overdueAt
         FROM incident_ntes WHERE incident_id = ? AND (? = 1 OR status = 'ISSUED') LIMIT 1`,
          [id, VIEW_ROLES.has(user.role) ? 1 : 0]
        ),
        pool.execute(
          `SELECT d.explanation, d.updated_at AS updatedAt
         FROM incident_explanation_drafts d JOIN incident_ntes n ON n.id = d.nte_id
         WHERE n.incident_id = ? AND d.employee_email = ? LIMIT 1`,
          [id, user.email]
        ),
        pool.execute(
          `SELECT e.id, explanation, source, other_channel AS otherChannel,
                submitted_by AS submittedBy, submitted_at AS submittedAt
         FROM incident_explanations e JOIN incident_ntes n ON n.id = e.nte_id
         WHERE n.incident_id = ? ORDER BY submitted_at, e.id`,
          [id]
        ),
        VIEW_ROLES.has(user.role)
          ? pool.execute(
              `SELECT previous_deadline AS previousDeadline,
                    extended_deadline AS extendedDeadline, reason,
                    approved_by AS approvedBy, x.created_at AS createdAt
             FROM incident_deadline_extensions x JOIN incident_ntes n ON n.id = x.nte_id
             WHERE n.incident_id = ? ORDER BY x.created_at, x.id`,
              [id]
            )
          : Promise.resolve([[], []])
      ]);
    nte = nteRows[0] || null;
    if (nte)
      nte.daysRemaining = workingDaysBetween(
        currentManilaDate(),
        nte.deadlineDate
      );
    explanationDraft = draftRows[0] || null;
    explanations = explanationRows;
    extensions = extensionRows;
    const [addendumRows] = await pool.execute(
      `SELECT a.id, a.statement, a.submitted_by AS submittedBy,
              a.submitted_at AS submittedAt
       FROM incident_explanation_addenda a JOIN incident_ntes n ON n.id = a.nte_id
       WHERE n.incident_id = ? ORDER BY a.submitted_at, a.id`,
      [id]
    );
    addenda = addendumRows;
    if (VIEW_ROLES.has(user.role)) {
      const [[evaluationRow]] = await pool.execute(
        `SELECT id, finding, findings, rule_id AS ruleId, violation_title AS violationTitle,
                code_reference AS codeReference, severity, previous_offenses AS previousOffenses,
                suggested_action AS suggestedAction, recommended_action AS recommendedAction,
                recommendation_justification AS recommendationJustification, remarks,
                evaluated_by AS evaluatedBy, evaluated_at AS evaluatedAt
         FROM incident_evaluations WHERE incident_id = ? LIMIT 1`,
        [id]
      );
      evaluation = evaluationRow || null;
      if (evaluation) {
        const [allowedActions] = await pool.execute(
          `SELECT prior_offenses AS priorOffenses, decision_type AS decisionType,
                  corrective_action AS correctiveAction, details
           FROM incident_evaluation_allowed_actions WHERE evaluation_id = ? ORDER BY prior_offenses`,
          [evaluation.id]
        );
        evaluation.allowedActions = allowedActions;
      }
      const [historyRows] = await pool.execute(
        `SELECT incident_id AS incidentId, violation_title AS violationTitle,
                code_reference AS codeReference, severity, corrective_action AS correctiveAction,
                effective_date AS effectiveDate, finalized_at AS finalizedAt
         FROM incident_disciplinary_history WHERE LOWER(employee_email) = LOWER(?) ORDER BY finalized_at DESC, id DESC`,
        [incident.reportedEmployeeEmail]
      );
      disciplinaryHistory = historyRows;
    }
  }
  if (canViewNte) {
    const [decisionRows] = await pool.execute(
      `SELECT d.id, d.outcome, d.violation_title AS violationTitle, d.code_reference AS codeReference,
              d.severity, d.final_action AS finalAction, d.effective_date AS effectiveDate,
              d.decision_reason AS decisionReason, d.approver_email AS approverEmail,
              d.approver_name AS approverName, d.approval_signature AS approvalSignature,
              d.issued_at AS issuedAt, d.delivered_at AS deliveredAt, d.closed_at AS closedAt,
              d.closure_reason AS closureReason, e.findings AS evaluationFindings
       FROM incident_decisions d JOIN incident_evaluations e ON e.id = d.evaluation_id
       WHERE d.incident_id = ? AND d.status = 'ISSUED' LIMIT 1`,
      [id]
    );
    decision = decisionRows[0] || null;
    if (decision && !VIEW_ROLES.has(user.role)) decision.closureReason = null;
  }
  if (nte) {
    const [nteEvidence] = await pool.execute(
      `SELECT id, file_name AS fileName, mime_type AS mimeType, byte_size AS byteSize
       FROM incident_nte_evidence WHERE nte_id = ? ORDER BY id`,
      [nte.id]
    );
    nte.evidence = nteEvidence;
  }
  if (explanations.length) {
    const ids = explanations.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');
    const [files] = await pool.execute(
      `SELECT id, explanation_id AS explanationId, file_name AS fileName,
              mime_type AS mimeType, byte_size AS byteSize
       FROM incident_explanation_evidence WHERE explanation_id IN (${placeholders}) ORDER BY id`,
      ids
    );
    explanations.forEach((row) => {
      row.evidence = files.filter(
        (file) => Number(file.explanationId) === Number(row.id)
      );
    });
  }
  if (explanationDraft) {
    const [draftEvidence] = await pool.execute(
      `SELECT id, file_name AS fileName, mime_type AS mimeType, byte_size AS byteSize
       FROM incident_explanation_draft_evidence WHERE nte_id = (SELECT id FROM incident_ntes WHERE incident_id = ?) ORDER BY id`,
      [id]
    );
    explanationDraft.evidence = draftEvidence;
  }
  if (addenda.length) {
    const ids = addenda.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');
    const [files] = await pool.execute(
      `SELECT id, addendum_id AS addendumId, file_name AS fileName,
              mime_type AS mimeType, byte_size AS byteSize
       FROM incident_explanation_addendum_evidence
       WHERE addendum_id IN (${placeholders}) ORDER BY id`,
      ids
    );
    addenda.forEach((row) => {
      row.evidence = files.filter(
        (file) => Number(file.addendumId) === Number(row.id)
      );
    });
  }
  const policyReferences = [];
  if (canViewNte) {
    const [references] = await pool.execute(
      'SELECT document_type AS documentType, snapshot, captured_at AS capturedAt FROM incident_document_policies WHERE incident_id = ?',
      [id]
    );
    for (const reference of references) {
      if (
        reference.documentType === 'EVALUATION' &&
        !VIEW_ROLES.has(user.role) &&
        !decision
      )
        continue;
      const snapshot =
        typeof reference.snapshot === 'string'
          ? JSON.parse(reference.snapshot)
          : reference.snapshot;
      policyReferences.push({
        documentType: reference.documentType,
        version: snapshot.version,
        effectiveDate: snapshot.effectiveDate,
        capturedAt: reference.capturedAt
      });
    }
  }
  const task = null;
  return {
    ...incident,
    policyReferences,
    timeline: publicTimeline(incident, activity, signatures),
    tracking: buildIncidentTracking(
      incident,
      signatures,
      activity,
      nte,
      explanations,
      decision
    ),
    participants,
    signatures,
    evidence,
    activity: VIEW_ROLES.has(user.role) ? activity : [],
    informationRequests: VIEW_ROLES.has(user.role)
      ? requests
      : requests.filter(
          (request) =>
            request.recipientEmail.toLowerCase() === user.email.toLowerCase()
        ),
    nte,
    evaluation,
    decision,
    disciplinaryHistory,
    explanationDraft,
    explanations,
    explanationAddenda: addenda,
    deadlineExtensions: extensions,
    task,
    canManageTask:
      user.role === 'HR' && Boolean(task?.isMine && task.state === 'READY'),
    canViewReview: VIEW_ROLES.has(user.role),
    canReview: false,
    currentUserName: user.full_name || user.email,
    currentUserEmail: user.email,
    currentUserRole: user.role
  };
}

async function getIncidentEvidence(req, evidenceId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(evidenceId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid evidence file.', 400);
  const [rows] = await pool.execute(
    `SELECT e.id, e.request_id AS requestId, e.file_name AS fileName,
            e.mime_type AS mimeType, e.file_data AS fileData,
            i.case_number AS caseNumber,
            i.reporter_email, i.reported_employee_email, i.assigned_head_email,
            r.recipient_email AS requestRecipient, r.requested_by AS requestCreator,
            EXISTS (
              SELECT 1 FROM incident_participants p
              JOIN employees pe ON pe.record_id = p.employee_record_id
              WHERE p.incident_id = i.id AND LOWER(pe.personal_email) = LOWER(?)
            ) AS isParticipant
     FROM incident_evidence e
     JOIN incident_reports i ON i.id = e.incident_id
     LEFT JOIN incident_information_requests r ON r.id = e.request_id
     WHERE e.id = ? LIMIT 1`,
    [user.email, id]
  );
  const evidence = rows[0];
  if (!evidence) throw httpError('Evidence file not found.', 404);
  if (
    !VIEW_ROLES.has(user.role) &&
    (evidence.requestId
      ? ![evidence.requestRecipient, evidence.requestCreator].some(
          (email) => email && email.toLowerCase() === user.email.toLowerCase()
        )
      : ![
          evidence.reporter_email,
          evidence.reported_employee_email,
          evidence.assigned_head_email
        ].some(
          (email) => email && email.toLowerCase() === user.email.toLowerCase()
        ) && !evidence.isParticipant)
  ) {
    throw httpError('You do not have access to this evidence file.', 403);
  }
  await logAudit(
    user.email,
    'READ',
    evidence.caseNumber,
    `Downloaded incident evidence ${evidence.id}: ${evidence.fileName}.`
  );
  return evidence;
}

async function markIncidentNotificationSeen(req, notificationId) {
  const user = await requirePerm(req, 'inbox.read');
  const id = Number(notificationId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw httpError('Choose a valid notification.', 400);
  const [[notification]] = await pool.execute(
    `SELECT n.incident_id AS incidentId, n.notification_type AS notificationType,
            i.reported_employee_email AS reportedEmployeeEmail
     FROM incident_notifications n
     JOIN incident_reports i ON i.id = n.incident_id
     WHERE n.id = ? AND n.recipient_email = ? LIMIT 1`,
    [id, user.email]
  );
  if (
    notification?.notificationType === 'EMPLOYEE_SIGNATURE' &&
    notification.reportedEmployeeEmail?.toLowerCase() ===
      user.email.toLowerCase()
  ) {
    await pool.execute(
      `UPDATE incident_notifications
       SET viewed_at = COALESCE(viewed_at, CURRENT_TIMESTAMP)
       WHERE recipient_email = ? AND (id = ? OR (incident_id = ? AND notification_type = 'IR_SUBMITTED'))`,
      [user.email, id, notification.incidentId]
    );
  } else {
    await pool.execute(
      `UPDATE incident_notifications SET viewed_at = COALESCE(viewed_at, CURRENT_TIMESTAMP)
       WHERE id = ? AND recipient_email = ?`,
      [id, user.email]
    );
  }
  return { ok: true };
}

module.exports = {
  getIncidentTrackingVersion,
  getIncidentNteEvidence,
  getIncidentExplanationEvidence,
  getIncidentExplanationDraftEvidence,
  getIncidentExplanationAddendumEvidence,
  getIncidentCase,
  getIncidentEvidence,
  markIncidentNotificationSeen
};
