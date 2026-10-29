(function () {
  function render(root, incident) {
    if (!incident.timeline?.length) return;
    const el = window.IncidentCaseUI.element;
    const section = el(
      'section',
      'incident-case-section incident-public-timeline'
    );
    section.appendChild(el('h3', '', 'Case Timeline'));
    const list = el('ol');
    for (const entry of incident.timeline) {
      const item = el('li');
      const time = el('time', '', DateUtils.formatDateTime(entry.createdAt));
      time.dateTime = new Date(entry.createdAt).toISOString();
      item.append(
        el('strong', '', entry.label),
        time,
        el('span', 'note', `By ${entry.performedBy || 'System'}`)
      );
      if (
        entry.previousStatus &&
        entry.newStatus &&
        entry.previousStatus !== entry.newStatus
      )
        item.appendChild(
          el(
            'span',
            'note',
            `${window.IncidentProgress.label(entry.previousStatus)} → ${window.IncidentProgress.label(entry.newStatus)}`
          )
        );
      list.appendChild(item);
    }
    section.appendChild(list);
    root.appendChild(section);
  }
  window.IncidentTimeline = { render };
})();
