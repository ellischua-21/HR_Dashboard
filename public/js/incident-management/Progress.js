(function () {
  const labels = {
    'PENDING SIGNATURE': 'Pending Signature',
    SIGNED: 'Signed',
    UNDER_REVIEW: 'Under Review',
    'UNDER INVESTIGATION': 'Under Investigation',
    'NTE ISSUED': 'NTE Issued',
    'EXPLANATION SENT': 'Explanation Sent',
    EVALUATION: 'Evaluation',
    'DECISION ISSUED': 'Decision Issued',
    CLOSED: 'Closed'
  };
  const states = {
    completed: 'Completed',
    current: 'Current stage',
    upcoming: 'Upcoming',
    skipped: 'Not required / skipped',
    closed: 'Closed here',
    discontinued: 'Path discontinued'
  };
  const label = (status) => labels[status] || status;
  const dateTime = (value) =>
    value ? new Date(value).toLocaleString() : 'Not reached';

  function render(root, incident) {
    const el = window.IncidentCaseUI.element;
    const tracking = incident.tracking;
    const current = tracking.stages.find(
      (stage) => stage.key === tracking.currentStage
    );
    root.replaceChildren(
      el('h3', '', `${incident.caseNumber} · ${incident.subject}`),
      el(
        'p',
        '',
        tracking.closed
          ? `Closed · ${tracking.completedProcess ? 'Decision issued' : `Closed during ${current.label.toLowerCase()}`}`
          : `Current stage: ${current.label}`
      )
    );
    const scroll = el('div', 'incident-track-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute(
      'aria-label',
      'Case progress. Scroll horizontally to view all stages.'
    );
    const list = el('ol', 'incident-track-progress');
    list.setAttribute('aria-label', 'Incident stages');
    tracking.stages.forEach((stage, index) => {
      const step = el('li', `incident-track-step is-${stage.state}`);
      if (stage.state === 'current') step.setAttribute('aria-current', 'step');
      const marker = el(
        'span',
        'incident-track-marker',
        stage.state === 'completed'
          ? '✓'
          : stage.state === 'closed'
            ? '×'
            : stage.state === 'skipped'
              ? '–'
              : String(index + 1)
      );
      marker.setAttribute('aria-hidden', 'true');
      const date = el(
        'time',
        '',
        stage.reachedAt ? dateTime(stage.reachedAt) : '—'
      );
      if (stage.reachedAt)
        date.dateTime = new Date(stage.reachedAt).toISOString();
      step.append(
        marker,
        el('strong', '', stage.label),
        el('span', 'incident-track-state', states[stage.state]),
        date
      );
      list.appendChild(step);
    });
    scroll.appendChild(list);
    root.appendChild(scroll);
    if (tracking.closed)
      root.appendChild(
        el(
          'p',
          'incident-track-closure',
          `${tracking.closureReason}${tracking.closedAt ? ` Closed ${dateTime(tracking.closedAt)}.` : ''}`
        )
      );
    root.hidden = false;
    requestAnimationFrame(() => {
      const step =
        list.querySelector('[aria-current="step"], .is-closed') ||
        list.lastElementChild;
      scroll.scrollLeft = Math.max(
        0,
        step.offsetLeft -
          list.offsetLeft -
          scroll.clientWidth / 2 +
          step.clientWidth / 2
      );
    });
  }
  window.IncidentProgress = { render, label, dateTime };
})();
