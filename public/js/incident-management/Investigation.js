// Information recorded by the retired workflow is never editable here.
(function () {
  function render(parent, incident) {
    if (!incident.informationRequests?.length) return;
    const box = incidentElement('section', 'incident-case-section');
    box.appendChild(incidentElement('h3', '', 'Original Information Requests'));
    for (const request of incident.informationRequests)
      appendIncidentFieldGroup(box, 'Recorded Request', [
        ['Requested From', request.recipientEmail],
        ['Requested Information', request.requestText],
        ['Response', request.responseText],
        ['Requested On', DateUtils.formatDateTime(request.createdAt)],
        [
          'Responded On',
          request.respondedAt
            ? DateUtils.formatDateTime(request.respondedAt)
            : 'Not Recorded'
        ]
      ]);
    parent.appendChild(box);
  }
  window.IncidentInvestigation = { render };
})();
