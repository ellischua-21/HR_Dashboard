// Evaluation and decision controls shared by Track and case document views.
function renderIncidentDecision(parent, incident, ui = {}) {
  if (!incident.decision) return;
  const section = incidentElement('section', 'incident-case-section');
  section.appendChild(incidentElement('h3', '', 'Final Decision'));
  const decision = incident.decision;
  const labels = {
    NO_VIOLATION: 'No Violation Established',
    WRITTEN_WARNING: 'Written Warning',
    SUSPENSION: 'Suspension',
    TERMINATION: 'Termination',
    OTHER_CORRECTIVE_ACTION: 'Other Corrective Action'
  };
  decision.outcomeLabel = labels[decision.outcome] || decision.outcome;
  section.append(
    incidentElement('p', '', `Outcome: ${decision.outcomeLabel}`),
    incidentElement(
      'p',
      '',
      `Issued: ${DateUtils.formatDateTime(decision.issuedAt)}`
    ),
    incidentElement(
      'p',
      '',
      `Delivered to employee inbox: ${DateUtils.formatDateTime(decision.deliveredAt)}`
    ),
    incidentElement('h4', '', 'Evaluation findings'),
    incidentElement(
      'p',
      'incident-case-text',
      decision.evaluationFindings || ''
    ),
    incidentElement('p', 'incident-case-text', decision.decisionReason)
  );
  if (decision.violationTitle)
    section.appendChild(
      incidentElement(
        'p',
        '',
        `Established violation: ${[decision.violationTitle, decision.codeReference, decision.severity].filter(Boolean).join(' · ')}`
      )
    );
  if (decision.finalAction)
    section.appendChild(
      incidentElement(
        'p',
        '',
        `Approved corrective action: ${decision.finalAction}`
      )
    );
  const preview = incidentElement('button', 'ghost', 'View / Print decision');
  preview.type = 'button';
  preview.onclick = () => {
    const windowRef = window.open('', '_blank');
    if (!windowRef) return;
    windowRef.document.open();
    windowRef.document.write(createDecisionDocumentHtml(incident, decision));
    windowRef.document.close();
  };
  section.appendChild(preview);
  if (incident.canReview && incident.status === 'DECISION ISSUED') {
    const reason = incidentElement('textarea');
    reason.rows = 3;
    reason.maxLength = 4000;
    reason.placeholder = 'Administrative completion notes (required)';
    reason.required = true;
    reason.setAttribute('aria-label', 'Administrative completion notes');
    const close = incidentElement(
      'button',
      '',
      'Complete delivery and close case'
    );
    close.type = 'button';
    close.onclick = async () => {
      if (!reason.value.trim()) {
        setIncidentFeedback('Enter the completion notes before closing.', true);
        reason.focus();
        return;
      }
      try {
        if (
          !(await window.appConfirm(
            'Record administrative completion and close this case?',
            {
              title: 'Close case',
              confirmText: 'Close case',
              danger: true
            }
          ))
        )
          return;
        close.disabled = true;
        await api('closeIncidentDecision', incident.id, reason.value);
        await refreshIncidentBadges().catch(console.error);
        await (ui.reload || openIncidentCase)(incident.id);
      } catch (error) {
        setIncidentFeedback(error.message || String(error), true);
      } finally {
        close.disabled = false;
      }
    };
    section.append(reason, close);
  }
  if (decision.closedAt && incident.canReview)
    section.appendChild(
      incidentElement(
        'p',
        'note',
        `Case closed ${DateUtils.formatDateTime(decision.closedAt)}: ${decision.closureReason || ''}`
      )
    );
  parent.appendChild(section);
}

function renderIncidentEvaluation(parent, incident, padSetup, ui = {}) {
  if (
    !incident.canReview ||
    (!['EVALUATION', 'DECISION ISSUED'].includes(incident.status) &&
      !(incident.status === 'CLOSED' && incident.decision))
  )
    return;
  const section = incidentElement('section', 'incident-case-section');
  section.appendChild(
    incidentElement('h3', '', 'Evaluation and Final Decision')
  );
  if (incident.evaluation) {
    const evaluation = incident.evaluation;
    section.append(
      incidentElement(
        'p',
        '',
        `Finding: ${evaluation.finding.replaceAll('_', ' ')}`
      ),
      incidentElement('p', 'incident-case-text', evaluation.findings),
      incidentElement('p', '', `Severity: ${evaluation.severity || 'None'}`),
      incidentElement(
        'p',
        '',
        `Previous relevant offenses: ${evaluation.previousOffenses}`
      ),
      incidentElement(
        'p',
        '',
        `Corrective action: ${evaluation.recommendedAction || 'None'}`
      )
    );
    if (evaluation.remarks)
      section.appendChild(
        incidentElement(
          'p',
          'incident-case-text',
          `Remarks: ${evaluation.remarks}`
        )
      );
  }
  if (incident.disciplinaryHistory?.length) {
    section.appendChild(
      incidentElement('h4', '', 'Finalized disciplinary history')
    );
    const history = incidentElement('ul');
    incident.disciplinaryHistory.forEach((item) =>
      history.appendChild(
        incidentElement(
          'li',
          '',
          `${item.finalizedAt ? DateUtils.formatDate(item.finalizedAt) : ''} · ${item.violationTitle} · ${item.severity} · ${item.correctiveAction}`
        )
      )
    );
    section.appendChild(history);
  }
  if (incident.status !== 'EVALUATION') {
    parent.appendChild(section);
    return;
  }
  const finding = incidentElement('select');
  finding.add(new Option('Select finding', ''));
  finding.add(new Option('Allegation substantiated', 'SUBSTANTIATED'));
  finding.add(new Option('Allegation not substantiated', 'NOT_SUBSTANTIATED'));
  finding.value = incident.evaluation?.finding || '';
  const severity = incidentElement('select');
  severity.add(new Option('Select severity', ''));
  ['Light', 'Moderate', 'Grave', 'Intolerable'].forEach((value) =>
    severity.add(new Option(value, value))
  );
  severity.value = incident.evaluation?.severity || '';
  const findings = incidentElement('textarea');
  findings.rows = 5;
  findings.maxLength = 20000;
  findings.placeholder = 'Evaluation findings and basis';
  findings.value = incident.evaluation?.findings || '';
  const recommendation = incidentElement('input');
  recommendation.maxLength = 191;
  recommendation.placeholder = 'Corrective action';
  recommendation.value = incident.evaluation?.recommendedAction || '';
  recommendation.readOnly = true;
  const remarks = incidentElement('textarea');
  remarks.rows = 3;
  remarks.maxLength = 5000;
  remarks.placeholder = 'Additional remarks';
  remarks.value = incident.evaluation?.remarks || '';
  const context = incidentElement('div', 'incident-evaluation-context');
  const field = (label, input) => {
    const wrapper = incidentElement('label', '', label);
    wrapper.appendChild(input);
    section.appendChild(wrapper);
  };
  field('Finding', finding);
  field('Violation severity', severity);
  field('Evaluation findings', findings);
  field('Corrective action', recommendation);
  field('Additional remarks', remarks);
  section.appendChild(context);
  const updateFindingFields = () => {
    const substantiated = finding.value === 'SUBSTANTIATED';
    [severity, recommendation].forEach(
      (control) => (control.disabled = !substantiated)
    );
    if (!substantiated) {
      severity.value = '';
      recommendation.value = '';
    }
    updatePriorOffenseCount();
  };
  let matrixRequest;
  const updatePriorOffenseCount = async () => {
    context.replaceChildren();
    if (finding.value !== 'SUBSTANTIATED' || !severity.value) {
      recommendation.value = '';
      return;
    }
    const selectedSeverity = severity.value;
    const relevant = (incident.disciplinaryHistory || []).filter(
      (item) => item.severity === selectedSeverity
    );
    context.appendChild(
      incidentElement(
        'p',
        'note',
        `Finalized prior offenses at this severity: ${relevant.length}. Applying matrix occurrence ${relevant.length + 1}.`
      )
    );
    recommendation.value = '';
    recommendation.placeholder = '';
    try {
      matrixRequest ||= api('getIncidentCodeGuide').then((data) => data.matrix);
      const matrix = await matrixRequest;
      if (
        finding.value !== 'SUBSTANTIATED' ||
        severity.value !== selectedSeverity
      )
        return;
      const matchingRows = (matrix || [])
        .filter((row) => row.severity === selectedSeverity)
        .sort(
          (left, right) => Number(left.occurrence) - Number(right.occurrence)
        );
      const occurrence = relevant.length + 1;
      const action =
        matchingRows.find((row) => Number(row.occurrence) === occurrence) ||
        matchingRows
          .filter((row) => Number(row.occurrence) <= occurrence)
          .at(-1);
      recommendation.value = action?.correctiveAction || '';
      recommendation.placeholder = action
        ? 'Corrective action from the Code of Conduct matrix'
        : 'No action is configured for this occurrence';
      if (!action)
        AppErrors.show(
          'No corrective action is configured for this occurrence. Update the Code of Conduct matrix.'
        );
    } catch (error) {
      recommendation.placeholder = 'Unable to load the Code of Conduct matrix';
      AppErrors.show(error.message || String(error));
    }
  };
  finding.addEventListener('change', updateFindingFields);
  severity.addEventListener('change', updatePriorOffenseCount);
  updateFindingFields();
  const authorized = incidentElement(
    'p',
    'note',
    `Authorized HR signatory: ${incident.currentUserEmail}`
  );
  const signatureCanvas = incidentElement(
    'canvas',
    'signature-pad incident-signature-pad'
  );
  signatureCanvas.width = 560;
  signatureCanvas.height = 120;
  signatureCanvas.setAttribute(
    'aria-label',
    'Authorized HR approval signature'
  );
  const clear = incidentElement('button', 'ghost', 'Clear signature');
  clear.type = 'button';
  let decisionPad;
  padSetup.push(() => {
    decisionPad = window.createSignaturePad(signatureCanvas, clear);
  });
  const process = incidentElement('button', '', 'Process Evaluation');
  process.type = 'button';
  process.onclick = async () => {
    if (!['SUBSTANTIATED', 'NOT_SUBSTANTIATED'].includes(finding.value)) {
      setIncidentFeedback('Select an evaluation finding.', true);
      return;
    }
    if (finding.value === 'SUBSTANTIATED' && !severity.value) {
      setIncidentFeedback('Select the violation severity.', true);
      return;
    }
    if (finding.value === 'SUBSTANTIATED' && !recommendation.value.trim()) {
      setIncidentFeedback('Enter the corrective action.', true);
      return;
    }
    if (!decisionPad?.toDataURL()) {
      setIncidentFeedback('Add the authorized HR signature.', true);
      return;
    }
    if (
      !(await window.appConfirm(
        'Approve and issue the final decision using this evaluation?',
        { title: 'Issue final decision', confirmText: 'Issue decision' }
      ))
    )
      return;
    process.disabled = true;
    try {
      const action = recommendation.value.trim();
      const actionLower = action.toLowerCase();
      const outcome =
        finding.value === 'NOT_SUBSTANTIATED'
          ? 'NO_VIOLATION'
          : /termination/.test(actionLower)
            ? 'TERMINATION'
            : /written warning|reprimand/.test(actionLower)
              ? 'WRITTEN_WARNING'
              : /suspension/.test(actionLower)
                ? 'SUSPENSION'
                : 'OTHER_CORRECTIVE_ACTION';
      await api('saveIncidentEvaluation', incident.id, {
        finding: finding.value,
        severity: severity.value,
        findings: findings.value,
        recommendedAction: action,
        remarks: remarks.value
      });
      await api('issueIncidentDecision', incident.id, {
        outcome,
        finalAction: action,
        decisionReason: [findings.value, remarks.value]
          .filter((value) => value.trim())
          .join('\n\n'),
        signature: decisionPad.toDataURL()
      });
      await window.refreshInboxBadge().catch(() => {});
      await refreshIncidentBadges();
      await (ui.reload || openIncidentCase)(incident.id);
    } catch (error) {
      setIncidentFeedback(error.message || String(error), true);
      process.disabled = false;
    }
  };
  section.append(authorized, signatureCanvas, clear, process);
  parent.appendChild(section);
}
