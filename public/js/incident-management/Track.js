(function () {
  const ui = window.IncidentCaseUI;
  const el = ui.element;
  const byId = (id) => document.getElementById(id);
  const input = byId('ir-track-selector');
  const options = byId('ir-track-options');
  const content = byId('ir-track-content');
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
    value ? DateUtils.formatDateTime(value) : 'Not reached';
  const label = (item) =>
    `${item.caseNumber} · ${item.subject} · ${item.reportedEmployeeName}`;
  const statusLabel = (value) => FormStatus.titleCase(value);
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
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (
        !options.hidden &&
        !input.contains(event.target) &&
        !options.contains(event.target)
      )
        closeOptions();
    },
    true
  );
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
    window.IncidentProgress.render(byId('ir-track-progress-panel'), incident);
  }

  function renderContent(incident) {
    content.replaceChildren();
    if (incident.workflowVersion === 2)
      window.IncidentWorkflow.render(content, incident, () =>
        select(incident.id)
      );
    else ui.renderLegacy(content, incident);
    byId('ir-track-actions').replaceChildren();
    byId('ir-track-content-panel').hidden = false;
    dirty = false;
  }

  async function select(id) {
    closeOptions();
    const ticket = ++requestId;
    const owner = session?.email;
    selectedId = Number(id);
    const chosen = cases.find((item) => Number(item.id) === selectedId);
    if (chosen) input.value = label(chosen);

    byId('ir-track-content-panel').hidden = true;
    byId('ir-track-progress-panel').hidden = true;
    try {
      const [snapshot, incident] = await Promise.all([
        api('getIncidentTrackingVersion', selectedId),
        api('getIncidentCase', selectedId)
      ]);
      if (!isCurrent(ticket, owner)) return;
      version = `${snapshot.version}:${DateUtils.manilaDate()}`;
      input.value = label(incident);
      renderProgress(incident);
      renderContent(incident);
    } catch (error) {
      if (isCurrent(ticket, owner))
        ui.feedback(error.message || String(error), true);
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
      if (`${snapshot.version}:${DateUtils.manilaDate()}` !== version) {
        if (dirty)
          ui.feedback(
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
      ui.feedback(error.message || 'Could not refresh case status.', true);
    } finally {
      refreshing = false;
    }
  }, 45000);
  window.addEventListener('review-tasks-changed', () => {
    if (visible() && !refreshing && !document.querySelector('dialog[open]'))
      load(null, false).catch((error) => ui.feedback(error.message, true));
  });
  window.IncidentTrack = { load, select };
})();
