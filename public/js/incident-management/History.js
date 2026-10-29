(function () {
  const ui = window.IncidentCaseUI,
    el = ui.element;
  const byId = (id) => document.getElementById(id);
  const state = {
    page: 1,
    pages: 1,
    search: '',
    caseNumber: '',
    from: '',
    to: '',
    outcome: 'ALL'
  };
  let owner = '',
    request = 0;
  const allowed = () => ['STAFF', 'HEAD'].includes(session?.role);
  const feedback = (text, error = false) =>
    ui.feedback(byId('ir-history-feedback'), text, error);

  async function open(id) {
    try {
      await window.openIncidentCase(id, { archived: true });
    } catch (error) {
      feedback(error.message || String(error), true);
    }
  }
  async function fetchCases() {
    if (!allowed())
      throw new Error('History is available to STAFF and HEAD accounts.');
    const ticket = ++request,
      account = session.email;
    const body = byId('ir-history-rows');
    body.setAttribute('aria-busy', 'true');
    try {
      const data = await api('listIncidentsForHistory', state);
      if (ticket !== request || session?.email !== account) return;
      state.page = data.page;
      state.pages = data.pages;
      body.replaceChildren();
      data.cases.forEach((incident) => {
        const row = el('tr');
        [
          incident.caseNumber,
          incident.subject,
          DateUtils.formatDate(incident.dateFiled),
          incident.closedAt
            ? DateUtils.formatDateTime(incident.closedAt)
            : 'Not recorded',
          window.IncidentProgress.label(incident.outcome)
        ].forEach((value) => row.appendChild(el('td', '', value)));
        const action = el('td'),
          view = el('button', 'ghost', 'View Details');
        view.type = 'button';
        view.setAttribute('aria-label', `View ${incident.caseNumber}`);
        view.onclick = () => open(incident.id);
        action.appendChild(view);
        row.appendChild(action);
        body.appendChild(row);
      });
      byId('ir-history-empty').hidden = data.total > 0;
      byId('ir-history-page').textContent =
        `Page ${data.page} of ${data.pages} · ${data.total} case${data.total === 1 ? '' : 's'}`;
      byId('ir-history-previous').disabled = data.page <= 1;
      byId('ir-history-next').disabled = data.page >= data.pages;
      feedback('');
    } catch (error) {
      if (ticket === request && session?.email === account)
        feedback(error.message || String(error), true);
    } finally {
      if (ticket === request) body.setAttribute('aria-busy', 'false');
    }
  }
  async function load(selectedId = null) {
    if (!allowed())
      throw new Error('History is available to STAFF and HEAD accounts.');
    if (owner !== session.email) {
      owner = session.email;
      ++request;
      byId('ir-history-filters').reset();
      Object.assign(state, {
        page: 1,
        search: '',
        caseNumber: '',
        from: '',
        to: '',
        outcome: 'ALL'
      });
      byId('ir-history-rows').replaceChildren();
    }
    await fetchCases();
    if (selectedId) await open(selectedId);
  }
  byId('ir-history-filters').onsubmit = (event) => {
    event.preventDefault();
    for (const [key, id] of [
      ['search', 'search'],
      ['caseNumber', 'number'],
      ['from', 'from'],
      ['to', 'to'],
      ['outcome', 'outcome']
    ])
      state[key] = byId(`ir-history-${id}`).value;
    state.page = 1;
    fetchCases();
  };
  byId('ir-history-clear').onclick = () => {
    byId('ir-history-filters').reset();
    Object.assign(state, {
      page: 1,
      search: '',
      caseNumber: '',
      from: '',
      to: '',
      outcome: 'ALL'
    });
    fetchCases();
  };
  byId('ir-history-previous').onclick = () => {
    --state.page;
    fetchCases();
  };
  byId('ir-history-next').onclick = () => {
    ++state.page;
    fetchCases();
  };
  window.IncidentHistory = { load };
})();
