// Archived notices and explanations are displayed without editing controls.
function renderIncidentNte(parent, incident) {
  if (!incident.nte) return;
  const nte = incident.nte;
  const section = incidentElement('section', 'incident-case-section');
  section.appendChild(incidentElement('h3', '', 'Notice To Explain'));
  appendIncidentFieldGroup(section, 'Issued Notice', [
    ['Date Issued', DateUtils.formatDate(nte.issuanceDate)],
    ['Receipt Date', DateUtils.formatDate(nte.receiptDate)],
    ['Original Explanation Deadline', DateUtils.formatDate(nte.deadlineDate)],
    ['Allegation', nte.allegation],
    [
      'Policy Reference',
      [nte.provisionCode, nte.provisionTitle, nte.provisionText]
        .filter(Boolean)
        .join(' — ')
    ]
  ]);
  const view = incidentElement('button', 'ghost', 'View Original NTE');
  view.type = 'button';
  view.onclick = () => openNtePreview(incident, nte);
  section.appendChild(view);
  for (const file of nte.evidence || []) {
    const link = incidentElement('a', '', file.fileName);
    link.href = API_BASE + '/incidents/nte-evidence/' + file.id;
    link.target = '_blank';
    link.rel = 'noopener';
    section.appendChild(link);
  }
  for (const explanation of incident.explanations || []) {
    appendIncidentFieldGroup(section, 'Submitted Explanation', [
      ['Employee Statement', explanation.explanation],
      ['Submitted On', DateUtils.formatDateTime(explanation.submittedAt)],
      ['Channel', explanation.channel]
    ]);
    for (const file of explanation.evidence || []) {
      const link = incidentElement('a', '', file.fileName);
      link.href = API_BASE + '/incidents/explanation-evidence/' + file.id;
      link.target = '_blank';
      link.rel = 'noopener';
      section.appendChild(link);
    }
  }
  for (const addendum of incident.explanationAddenda || [])
    appendIncidentFieldGroup(section, 'Additional Statement', [
      ['Statement', addendum.statement],
      ['Submitted On', DateUtils.formatDateTime(addendum.submittedAt)]
    ]);
  parent.appendChild(section);
}
