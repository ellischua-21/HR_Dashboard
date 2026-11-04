// Print and download layouts for Incident Report, NTE, explanation, and decision documents.
function escapeIncidentHtml(value) {
  return String(value || '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
  );
}

function createNteDocumentHtml(incident, nte) {
  const evidence = (nte.evidence || [])
    .map((file) => `<li>${escapeIncidentHtml(file.fileName)}</li>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Notice to Explain — ${escapeIncidentHtml(incident.caseNumber)}</title>
  <style>@page{size:letter;margin:22mm}body{font:14px Arial,sans-serif;color:#172033;line-height:1.5;max-width:780px;margin:24px auto}h1{text-align:center;font-size:22px}h2{font-size:16px;border-bottom:1px solid #999;padding-bottom:5px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px}.label{font-weight:700}pre{font:inherit;white-space:pre-wrap}.signature{max-width:240px;max-height:80px}button{padding:8px 14px}@media print{button{display:none}body{margin:0}}</style></head><body>
  <button onclick="window.print()">Print / Save as PDF</button><h1>NOTICE TO EXPLAIN</h1>
  <div class="meta"><div><span class="label">Case Number:</span> ${escapeIncidentHtml(incident.caseNumber)}</div><div><span class="label">Date Issued:</span> ${escapeIncidentHtml(DateUtils.formatDate(nte.issuanceDate))}</div>
  <div><span class="label">Directed to:</span> ${escapeIncidentHtml(incident.reportedEmployeeName)} (${escapeIncidentHtml(incident.reportedEmployeeEmail)})</div><div><span class="label">Employee ID:</span> ${escapeIncidentHtml(incident.reportedEmployeeId)}</div>
  <div><span class="label">Department:</span> ${escapeIncidentHtml(incident.reportedEmployeeDepartment)}</div><div><span class="label">Position:</span> ${escapeIncidentHtml(incident.reportedEmployeePosition)}</div>
  <div><span class="label">Date of Receipt:</span> ${escapeIncidentHtml(DateUtils.formatDate(nte.receiptDate))}</div><div><span class="label">Response Period:</span> ${escapeIncidentHtml(nte.responseWorkingDays)} working days</div><div><span class="label">Explanation Deadline:</span> ${escapeIncidentHtml(DateUtils.formatDate(nte.deadlineDate))}</div></div>
  <h2>Incident Details</h2><div class="meta"><div><span class="label">Subject:</span> ${escapeIncidentHtml(incident.subject)}</div><div><span class="label">Date:</span> ${escapeIncidentHtml(DateUtils.formatDate(incident.incidentDate))}</div><div><span class="label">Location:</span> ${escapeIncidentHtml(incident.location)}</div><div><span class="label">Time:</span> ${escapeIncidentHtml(DateUtils.formatTime(incident.incidentTime))}</div></div><pre>${escapeIncidentHtml(incident.description)}</pre>
  ${nte.provisionCode || nte.provisionTitle || nte.provisionText ? `<h2>Code of Conduct Reference</h2><p><strong>${escapeIncidentHtml([nte.provisionCode, nte.provisionTitle].filter(Boolean).join(' — '))}</strong></p><pre>${escapeIncidentHtml(nte.provisionText || '')}</pre>` : ''}<h2>Explanation of the Allegation</h2><pre>${escapeIncidentHtml(nte.allegation)}</pre>
  <h2>Supporting Evidence</h2><ul>${evidence || '<li>None attached</li>'}</ul>
  <h2>Authorized HR Signatory</h2><p>${escapeIncidentHtml(nte.signerName)} (${escapeIncidentHtml(nte.signerEmail)})</p>${nte.signature ? `<img class="signature" src="${nte.signature}" alt="HR signature">` : ''}
  <p>Please provide your explanation by the deadline stated above. Issuance of this notice does not establish that an allegation is true.</p></body></html>`;
}

function openNtePreview(incident, nte) {
  const preview = window.open('', '_blank');
  if (!preview)
    throw new Error('Allow the preview window to open, then try again.');
  preview.document.open();
  preview.document.write(createNteDocumentHtml(incident, nte));
  preview.document.close();
}

function createIncidentReportDocumentHtml(incident) {
  const signatures = (incident.signatures || [])
    .map((item) => {
      const signature = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(
        item.signature || ''
      )
        ? `<img class="signature" src="${item.signature}" alt="${escapeIncidentHtml(item.role)} signature">`
        : 'Not signed';
      const labels = {
        EMPLOYEE: 'Employee',
        HEAD:
          incident.assignedReviewerRole === 'SUPERVISOR'
            ? 'Assigned Supervisor'
            : 'Assigned Head',
        HR: 'HR'
      };
      return `<tr><td>${escapeIncidentHtml(labels[item.role] || item.role)}</td><td>${signature}</td><td>${escapeIncidentHtml(item.signerEmail)}</td><td>${escapeIncidentHtml(DateUtils.formatDateTime(item.signedAt))}</td></tr>`;
    })
    .join('');
  const participants = (type) =>
    (incident.participants || [])
      .filter((item) => item.participantType === type)
      .map((item) => escapeIncidentHtml(item.name))
      .join(', ') || 'None recorded';
  const evidence = (incident.evidence || [])
    .map((item) => `<li>${escapeIncidentHtml(item.fileName)}</li>`)
    .join('');
  const fields = [
    ['Case Number', incident.caseNumber],
    ['Reported By', incident.reporterName],
    ['Department', incident.department],
    ['Position', incident.position],
    ['Reported Employee', incident.reportedEmployeeName],
    ['Employee ID', incident.reportedEmployeeId],
    ['Date Reported', DateUtils.formatDate(incident.dateReported)],
    ['Incident Date', DateUtils.formatDate(incident.incidentDate)],
    ['Incident Time', DateUtils.formatTime(incident.incidentTime)],
    ['Location', incident.location],
    ['Subject', incident.subject]
  ]
    .map(
      ([label, value]) =>
        `<div><strong>${escapeIncidentHtml(label)}:</strong> ${escapeIncidentHtml(value)}</div>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Incident Report - ${escapeIncidentHtml(incident.caseNumber)}</title><style>@page{size:letter;margin:20mm}body{font:14px Arial,sans-serif;color:#172033;line-height:1.5;max-width:780px;margin:24px auto}h1{text-align:center;font-size:22px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0}pre{font:inherit;white-space:pre-wrap}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aab2bd;padding:8px;text-align:left;vertical-align:top}.signature{max-width:140px;max-height:60px}button{padding:8px 14px}@media print{button{display:none}body{margin:0}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h1>INCIDENT REPORT</h1><div class="meta">${fields}</div><h2>Incident Description</h2><pre>${escapeIncidentHtml(incident.description)}</pre><h2>Comments</h2><pre>${escapeIncidentHtml(incident.comments || '')}</pre><p><strong>Persons Involved:</strong> ${participants('INVOLVED')}</p><p><strong>Witnesses:</strong> ${participants('WITNESS')}</p><h2>Supporting Evidence</h2><ul>${evidence || '<li>None attached</li>'}</ul><h2>Signatures</h2><table><thead><tr><th>Role</th><th>Signature</th><th>Signed By</th><th>Date</th></tr></thead><tbody>${signatures || '<tr><td colspan="4">No signatures recorded</td></tr>'}</tbody></table></body></html>`;
}

function openIncidentReportPreview(incident) {
  const preview = window.open('', '_blank');
  if (!preview)
    throw new Error('Allow the preview window to open, then try again.');
  preview.document.open();
  preview.document.write(createIncidentReportDocumentHtml(incident));
  preview.document.close();
}

function createDecisionDocumentHtml(incident, decision) {
  const signature = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(
    decision.approvalSignature || ''
  )
    ? `<img class="signature" src="${decision.approvalSignature}" alt="Authorized approval signature">`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Final Decision — ${escapeIncidentHtml(incident.caseNumber)}</title>
    <style>@page{size:letter;margin:22mm}body{font:14px Arial,sans-serif;color:#172033;line-height:1.5;max-width:780px;margin:24px auto}h1{text-align:center;font-size:22px}h2{font-size:16px;border-bottom:1px solid #999;padding-bottom:5px}pre{font:inherit;white-space:pre-wrap}.signature{max-width:240px;max-height:80px}button{padding:8px 14px}@media print{button{display:none}body{margin:0}}</style></head><body>
    <button onclick="window.print()">Print / Save as PDF</button><h1>FINAL DECISION</h1>
    <p><strong>Case Number:</strong> ${escapeIncidentHtml(incident.caseNumber)}</p><p><strong>Employee:</strong> ${escapeIncidentHtml(incident.reportedEmployeeName)} (${escapeIncidentHtml(incident.reportedEmployeeId)})</p>
    <p><strong>Decision issued:</strong> ${escapeIncidentHtml(DateUtils.formatDateTime(decision.issuedAt))}</p><h2>Evaluation Findings</h2><p><strong>Finding:</strong> ${decision.outcome === 'NO_VIOLATION' ? 'No Violation Established' : 'Violation Established'}</p><pre>${escapeIncidentHtml(decision.evaluationFindings || '')}</pre>
    ${decision.outcome !== 'NO_VIOLATION' ? `<p><strong>Violation:</strong> ${escapeIncidentHtml([decision.violationTitle, decision.codeReference, decision.severity].filter(Boolean).join(' · '))}</p>` : ''}
    <h2>Approved Decision</h2><p><strong>Outcome:</strong> ${escapeIncidentHtml(decision.outcomeLabel || decision.outcome.replaceAll('_', ' '))}</p>${decision.finalAction ? `<p><strong>Corrective action:</strong> ${escapeIncidentHtml(decision.finalAction)}</p>` : ''}<pre>${escapeIncidentHtml(decision.decisionReason)}</pre>
    <h2>Authorized Approval</h2><p>${escapeIncidentHtml(decision.approverName)} (${escapeIncidentHtml(decision.approverEmail)})</p>${signature}<p><strong>Delivered:</strong> ${escapeIncidentHtml(DateUtils.formatDateTime(decision.deliveredAt))}</p></body></html>`;
}
