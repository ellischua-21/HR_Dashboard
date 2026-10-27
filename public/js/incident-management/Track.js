(function () {
  const ui = window.IncidentCaseUI;
  const el = ui.element;
  const byId = (id) => document.getElementById(id);
  const input = byId('ir-track-selector');
  const options = byId('ir-track-options');
  const content = byId('ir-track-content');
  const feedback = byId('ir-track-action-feedback');
  const stateLabels = {
    completed: 'Completed',
    current: 'Current stage',
    upcoming: 'Upcoming',
    skipped: 'Not required / skipped',
    closed: 'Closed here',
    discontinued: 'Path discontinued'
  };
  let cases = [];
  let selectedId = null;
  let actor = '';
  let version = '';
  let requestId = 0;
  let highlighted = -1;
  let matches = [];
  let dirty = false;
  let refreshing = false;

  const dateTime = (value) =>
    value ? new Date(value).toLocaleString() : 'Not reached';
  const label = (item) =>
    `${item.caseNumber} · ${item.subject} · ${item.reportedEmployeeName}`;
  const statusLabel = (value) =>
    value
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .replace(/\bNte\b/g, 'NTE');
  const today = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(
      new Date()
    );
  const visible = () => !byId('view-incident-track').hidden;
  const isCurrent = (ticket, owner) =>
    ticket === requestId && owner === session?.email;

  function closeOptions() {
    options.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    highlighted = -1;
  }

  function showOptions() {
    const selected = cases.find((item) => Number(item.id) === selectedId);
    const query =
      input.value === (selected && label(selected))
        ? ''
        : input.value.trim().toLowerCase();
    matches = cases
      .filter((item) =>
        `${label(item)} ${statusLabel(item.status)}`
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 50);
    options.replaceChildren();
    if (!matches.length)
      options.appendChild(el('p', 'note', 'No matching cases.'));
    matches.forEach((item, index) => {
      const option = el('button', 'incident-track-option');
      option.type = 'button';
      option.id = `ir-track-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === highlighted));
      option.append(
        el('strong', '', item.caseNumber),
        el('span', '', `${item.subject} · ${item.reportedEmployeeName}`)
      );
      option.appendChild(el('small', 'note', statusLabel(item.status)));
      option.onmousedown = (event) => event.preventDefault();
      option.onclick = () => select(item.id);
      options.appendChild(option);
    });
    options.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (highlighted >= 0 && matches[highlighted]) {
      input.setAttribute(
        'aria-activedescendant',
        `ir-track-option-${highlighted}`
      );
      byId(`ir-track-option-${highlighted}`).scrollIntoView({
        block: 'nearest'
      });
    }
  }

  input.addEventListener('focus', showOptions);
  input.addEventListener('input', () => {
    highlighted = -1;
    showOptions();
  });
  input.addEventListener('blur', () => {
    closeOptions();
    const selected = cases.find((item) => Number(item.id) === selectedId);
    input.value = selected ? label(selected) : '';
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') return closeOptions();
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (options.hidden) showOptions();
      highlighted = Math.max(
        0,
        Math.min(
          matches.length - 1,
          highlighted + (event.key === 'ArrowDown' ? 1 : -1)
        )
      );
      showOptions();
    } else if (event.key === 'Enter' && !options.hidden && matches.length) {
      event.preventDefault();
      select(matches[Math.max(0, highlighted)].id);
    }
  });

  function renderProgress(incident) {
    const tracking = incident.tracking;
    const stages = byId('ir-track-progress');
    stages.replaceChildren();
    byId('ir-track-case-heading').textContent =
      `${incident.caseNumber} · ${incident.subject}`;
    const current = tracking.stages.find(
      (stage) => stage.key === tracking.currentStage
    );
    byId('ir-track-status').textContent = tracking.closed
      ? `Closed · ${tracking.completedProcess ? 'Decision issued' : `Closed during ${current.label.toLowerCase()}`}`
      : `Current stage: ${current.label}`;
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
      step.append(
        marker,
        el('strong', '', stage.label),
        el('span', 'incident-track-state', stateLabels[stage.state])
      );
      const date = el(
        'time',
        '',
        stage.reachedAt ? dateTime(stage.reachedAt) : '—'
      );
      if (stage.reachedAt)
        date.dateTime = new Date(stage.reachedAt).toISOString();
      step.appendChild(date);
      stages.appendChild(step);
    });
    const closure = byId('ir-track-closure');
    closure.hidden = !tracking.closed;
    closure.textContent = tracking.closed
      ? `${tracking.closureReason}${tracking.closedAt ? ` Closed ${dateTime(tracking.closedAt)}.` : ''}`
      : '';
    byId('ir-track-progress-panel').hidden = false;
    const step =
      stages.querySelector('[aria-current="step"], .is-closed') ||
      stages.lastElementChild;
    const scroller = stages.parentElement;
    scroller.scrollLeft = Math.max(
      0,
      step.offsetLeft -
        stages.offsetLeft -
        scroller.clientWidth / 2 +
        step.clientWidth / 2
    );
  }

  function renderInformationRequests(incident) {
    const section = el('section', 'incident-case-section');
    section.appendChild(el('h3', '', 'Information requests'));
    if (!incident.informationRequests.length)
      section.appendChild(
        el(
          'p',
          'note',
          'No information requests are available to your account.'
        )
      );
    incident.informationRequests.forEach((request) => {
      const card = el('section', 'incident-case-section');
      card.append(
        el(
          'h4',
          '',
          request.status === 'PENDING'
            ? 'Awaiting response'
            : 'Response received'
        ),
        el('p', 'incident-case-text', request.requestText),
        el('p', 'note', `Requested ${dateTime(request.createdAt)}`)
      );
      if (request.responseText)
        card.appendChild(el('p', 'incident-case-text', request.responseText));
      if (request.respondedAt)
        card.appendChild(
          el('p', 'note', `Responded ${dateTime(request.respondedAt)}`)
        );
      if (
        incident.status === 'UNDER INVESTIGATION' &&
        request.status === 'PENDING' &&
        request.recipientEmail.toLowerCase() ===
          incident.currentUserEmail.toLowerCase()
      ) {
        const form = el('form');
        const text = el('textarea');
        text.rows = 4;
        text.maxLength = 4000;
        const textLabel = el('label', '', 'Your response');
        textLabel.appendChild(text);
        const files = el('input');
        files.type = 'file';
        files.multiple = true;
        const fileLabel = el('label', '', 'Requested supporting evidence');
        fileLabel.appendChild(files);
        const actions = el('div', 'actions incident-track-actions');
        const submit = el('button', '', 'Submit information');
        submit.type = 'submit';
        actions.appendChild(submit);
        form.append(textLabel, fileLabel, actions);
        form.onsubmit = async (event) => {
          event.preventDefault();
          submit.disabled = true;
          try {
            await api(
              'respondToIncidentInformation',
              incident.id,
              request.id,
              text.value,
              await ui.readEvidenceFiles(files.files)
            );
            await select(incident.id);
            ui.feedback(feedback, 'Information submitted.');
            await window.refreshIncidentBadges();
          } catch (error) {
            ui.feedback(feedback, error.message || String(error), true);
          } finally {
            submit.disabled = false;
          }
        };
        card.appendChild(form);
      }
      section.appendChild(card);
    });
    if (incident.canReview && incident.activity.length) {
      const updates = el('details');
      updates.appendChild(
        el('summary', '', 'Authorized investigation updates')
      );
      const list = el('ul');
      incident.activity
        .filter((entry) =>
          [
            'INVESTIGATION_STARTED',
            'INVESTIGATION_NOTE',
            'INFORMATION_REQUESTED',
            'INFORMATION_PROVIDED'
          ].includes(entry.action)
        )
        .forEach((entry) =>
          list.appendChild(
            el('li', '', `${dateTime(entry.createdAt)} · ${entry.details}`)
          )
        );
      updates.appendChild(list);
      section.appendChild(updates);
    }
    content.appendChild(section);
  }

  function renderContent(incident) {
    content.replaceChildren();
    ui.feedback(feedback, '');
    const tracking = incident.tracking;
    const current = tracking.stages.find(
      (stage) => stage.key === tracking.currentStage
    );
    const messages = {
      'PENDING SIGNATURE':
        'The Incident Report is awaiting the required acknowledgment signatures.',
      SIGNED:
        'The required employee and Head signatures are complete. The report is awaiting HR review.',
      UNDER_REVIEW:
        'HR is currently reviewing the report and permitted supporting documents.',
      'UNDER INVESTIGATION':
        'The incident is under investigation. Respond to any information request addressed to you.',
      'NTE ISSUED':
        'A Notice to Explain has been issued. The reported employee can view the notice and submit an explanation below.',
      'EXPLANATION SENT':
        'The explanation has been submitted and is awaiting HR evaluation.',
      EVALUATION:
        'HR is evaluating the case. Internal findings are available only to authorized reviewers.',
      'DECISION ISSUED':
        'The final decision has been issued. Its document is available below to the reported employee and authorized reviewers.'
    };
    content.append(
      el('h3', '', tracking.closed ? 'Case closure' : current.label),
      el(
        'p',
        'incident-track-stage-message',
        tracking.closed
          ? tracking.closureReason
          : messages[incident.status] || 'Case progress is shown above.'
      )
    );
    const report = el('details', 'incident-track-report');
    report.open = ['PENDING SIGNATURE', 'SIGNED'].includes(incident.status);
    report.appendChild(
      el('summary', '', 'Incident Report and permitted supporting evidence')
    );
    ui.renderReport(report, incident);
    content.appendChild(report);
    const pads = [];
    const view = { ...incident, canReview: false };
    const controls = { reload: select, feedback };
    const signatories = el('details', 'incident-track-report');
    signatories.open = ['PENDING SIGNATURE', 'SIGNED'].includes(
      incident.status
    );
    signatories.appendChild(
      el('summary', '', 'Required signatories and completion status')
    );
    signatories.appendChild(
      el(
        'p',
        'note',
        'Signatures acknowledge receipt and do not indicate admission of wrongdoing.'
      )
    );
    const required = [
      ['EMPLOYEE', 'Employee Signature'],
      ...(incident.assignedHeadEmail ? [['HEAD', 'Head Signature']] : []),
      ['HR', 'HR Review Signature']
    ];
    const completion = el('ul', 'incident-track-signatories');
    required.forEach(([role, title]) => {
      const signed = incident.signatures.find((item) => item.role === role);
      completion.appendChild(
        el(
          'li',
          '',
          `${title}: ${signed ? `Completed ${dateTime(signed.signedAt)}` : 'Pending'}`
        )
      );
      ui.renderSignature(signatories, view, role, title, pads, controls);
    });
    signatories.insertBefore(completion, signatories.children[2] || null);
    content.appendChild(signatories);
    if (incident.status === 'UNDER_REVIEW') {
      const hrSignature = incident.signatures.find(
        (item) => item.role === 'HR'
      );
      content.appendChild(
        el(
          'p',
          'note',
          `HR assessment in progress${hrSignature ? ` since ${dateTime(hrSignature.signedAt)}` : ''}.`
        )
      );
    }
    if (incident.status === 'UNDER INVESTIGATION')
      renderInformationRequests(incident);
    if (incident.nte?.status === 'ISSUED') {
      ui.renderNte(content, view, pads, controls);
    } else if (
      ['NTE ISSUED', 'EXPLANATION SENT', 'EVALUATION'].includes(incident.status)
    ) {
      content.appendChild(
        el(
          'p',
          'note',
          'Notice and explanation documents are restricted to the reported employee and authorized reviewers.'
        )
      );
    }
    if (incident.status === 'EXPLANATION SENT') {
      const sent = tracking.stages.find(
        (stage) => stage.key === 'EXPLANATION SENT'
      );
      content.appendChild(
        el(
          'p',
          'note',
          `Explanation submitted ${dateTime(sent.reachedAt)}. Awaiting HR evaluation.`
        )
      );
    }
    if (
      incident.status === 'EVALUATION' &&
      incident.canReview &&
      incident.evaluation
    ) {
      const evaluation = el('details');
      evaluation.append(
        el('summary', '', 'Authorized evaluation findings'),
        el('p', 'incident-case-text', incident.evaluation.findings),
        el(
          'p',
          'note',
          `Recommendation: ${incident.evaluation.recommendedAction || 'No disciplinary action recommended'}`
        )
      );
      content.appendChild(evaluation);
    }
    ui.renderDecision(content, view);
    if (tracking.currentStage === 'DECISION ISSUED' && !incident.decision)
      content.appendChild(
        el(
          'p',
          'note',
          'Decision details are available to the reported employee and authorized reviewers.'
        )
      );
    const actions = byId('ir-track-actions');
    actions.replaceChildren();
    if (incident.canReview) {
      const review = el('button', '', 'Open in Review');
      review.type = 'button';
      review.onclick = () =>
        window.openIncidentRoute(incident.id, 'incident-review');
      actions.appendChild(review);
    }
    const refresh = el('button', 'ghost', 'Refresh status');
    refresh.type = 'button';
    refresh.onclick = () => select(incident.id);
    actions.appendChild(refresh);
    byId('ir-track-content-panel').hidden = false;
    dirty = false;
    window.requestAnimationFrame(() => pads.forEach((setup) => setup()));
  }

  async function select(id) {
    closeOptions();
    const ticket = ++requestId;
    const owner = session?.email;
    selectedId = Number(id);
    const chosen = cases.find((item) => Number(item.id) === selectedId);
    if (chosen) input.value = label(chosen);
    ui.feedback(byId('ir-track-feedback'), 'Loading case…');
    byId('ir-track-content-panel').hidden = true;
    byId('ir-track-progress-panel').hidden = true;
    try {
      const [snapshot, incident] = await Promise.all([
        api('getIncidentTrackingVersion', selectedId),
        api('getIncidentCase', selectedId)
      ]);
      if (!isCurrent(ticket, owner)) return;
      version = `${snapshot.version}:${today()}`;
      input.value = label(incident);
      renderProgress(incident);
      renderContent(incident);
      ui.feedback(byId('ir-track-feedback'), '');
    } catch (error) {
      if (isCurrent(ticket, owner))
        ui.feedback(
          byId('ir-track-feedback'),
          error.message || String(error),
          true
        );
    }
  }

  async function load(requestedId = null, force = true) {
    const owner = session?.email;
    if (!owner) return;
    if (actor !== owner) {
      actor = owner;
      selectedId = null;
      version = '';
      cases = [];
      dirty = false;
      input.value = '';
      ++requestId;
      byId('ir-track-content-panel').hidden = byId(
        'ir-track-progress-panel'
      ).hidden = true;
    }
    const rows = await api('listIncidentsForTrack');
    if (owner !== session?.email) return;
    cases = rows;
    if (selectedId && !cases.some((item) => Number(item.id) === selectedId)) {
      selectedId = null;
      version = '';
      ++requestId;
      byId('ir-track-content-panel').hidden = byId(
        'ir-track-progress-panel'
      ).hidden = true;
    }
    byId('ir-track-empty').hidden = cases.length > 0;
    const id = requestedId || selectedId || cases[0]?.id;
    if (!id) {
      selectedId = null;
      input.value = '';
      byId('ir-track-content-panel').hidden = byId(
        'ir-track-progress-panel'
      ).hidden = true;
      return;
    }
    if (force || requestedId || !version) await select(id);
    else {
      const snapshot = await api('getIncidentTrackingVersion', id);
      if (owner !== session?.email || Number(id) !== selectedId) return;
      if (`${snapshot.version}:${today()}` !== version) {
        if (dirty)
          ui.feedback(
            byId('ir-track-feedback'),
            'Case updates are available. Save your work, then refresh the status.'
          );
        else await select(id);
      }
    }
  }

  content.addEventListener('input', () => {
    dirty = true;
  });
  content.addEventListener('change', () => {
    dirty = true;
  });
  content.addEventListener('pointerdown', (event) => {
    if (event.target.tagName === 'CANVAS') dirty = true;
  });
  setInterval(async () => {
    if (!visible() || document.hidden || !session?.email || refreshing) return;
    refreshing = true;
    try {
      await load(null, false);
    } catch (error) {
      ui.feedback(
        byId('ir-track-feedback'),
        error.message || 'Could not refresh case status.',
        true
      );
    } finally {
      refreshing = false;
    }
  }, 45000);
  window.IncidentTrack = { load, select };
})();
