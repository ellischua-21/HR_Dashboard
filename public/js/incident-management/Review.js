(function () {
  const ui = window.IncidentCaseUI;
  const el = ui.element;
  const byId = (id) => document.getElementById(id);
  const workspace = byId('ir-review-workspace');
  const state = {
    category: 'ONGOING',
    stage: 'ALL',
    search: '',
    page: 1,
    pages: 1
  };
  let actor = '';
  let listRequest = 0;
  let openRequest = 0;
  let selectedId = null;
  let selectedVersion = '';
  let timer;
  let polling = false;
  const visible = () => !byId('view-incident-review').hidden;
  const allowed = () => ['HR', 'ADMIN'].includes(session?.role);
  const formatDate = (value) =>
    value ? new Date(value).toLocaleString() : '—';

  function syncFilters() {
    byId('ir-review-search').value = state.search;
    byId('ir-review-stage').value = state.stage;
    document.querySelectorAll('[data-review-category]').forEach((button) => {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.reviewCategory === state.category)
      );
    });
  }

  function renderCases(data) {
    for (const [name, key] of [
      ['total', 'totalCases'],
      ['under-review', 'underReview'],
      ['nte', 'nte'],
      ['closed', 'closed']
    ])
      byId(`ir-review-${name}`).textContent =
        data.summary[key].toLocaleString();
    state.page = data.page;
    state.pages = data.pages;
    const list = byId('ir-review-list');
    list.replaceChildren();
    data.cases.forEach((incident) => {
      const row = el('article', 'incident-review-case');
      row.setAttribute('role', 'listitem');
      row.dataset.caseId = incident.id;
      row.classList.toggle('is-selected', Number(incident.id) === selectedId);
      const details = el('div', 'incident-review-case-details');
      const heading = el('div', 'incident-review-case-heading');
      heading.append(
        el('strong', 'incident-review-number', incident.caseNumber),
        el(
          'span',
          'incident-review-status',
          window.IncidentProgress.label(incident.status)
        )
      );
      details.append(heading, el('h3', '', incident.subject));
      const metadata = el('dl', 'incident-review-case-meta');
      for (const [label, value] of [
        ['Reported employee', incident.reportedEmployeeName],
        ['Reported by', incident.reporterName],
        ['Date filed', incident.dateFiled],
        ['Last updated', formatDate(incident.updatedAt)]
      ]) {
        const pair = el('div');
        pair.append(el('dt', '', label), el('dd', '', value || '—'));
        metadata.appendChild(pair);
      }
      details.appendChild(metadata);
      if (incident.status === 'EVALUATION' && incident.hasEvaluation)
        details.appendChild(
          el('p', 'note', 'Evaluation saved · Final decision pending')
        );
      const button = el(
        'button',
        'ghost',
        incident.status === 'CLOSED' ? 'View' : 'Open'
      );
      button.type = 'button';
      button.setAttribute(
        'aria-label',
        `${button.textContent} ${incident.caseNumber}`
      );
      button.onclick = () => open(incident.id);
      row.append(details, button);
      list.appendChild(row);
    });
    byId('ir-review-empty').hidden = data.total > 0;
    byId('ir-review-results').textContent =
      `${state.category[0]}${state.category.slice(1).toLowerCase()} · ${data.total} matching case${data.total === 1 ? '' : 's'}`;
    byId('ir-review-page').textContent = `Page ${data.page} of ${data.pages}`;
    byId('ir-review-previous').disabled = data.page <= 1;
    byId('ir-review-next').disabled = data.page >= data.pages;
  }

  async function fetchList() {
    if (!allowed()) throw new Error('Only HR and ADMIN can access Review.');
    const ticket = ++listRequest;
    const owner = session.email;
    byId('ir-review-list').setAttribute('aria-busy', 'true');
    try {
      const data = await api('getIncidentReviewDashboard', {
        category: state.category,
        stage: state.stage,
        search: state.search,
        page: state.page,
        pageSize: 25
      });
      if (ticket !== listRequest || owner !== session?.email) return;
      renderCases(data);
      ui.feedback(byId('ir-review-feedback'), '');
    } catch (error) {
      if (ticket === listRequest && owner === session?.email)
        ui.feedback(
          byId('ir-review-feedback'),
          error.message || String(error),
          true
        );
      throw error;
    } finally {
      if (ticket === listRequest)
        byId('ir-review-list').setAttribute('aria-busy', 'false');
    }
  }

  async function caseOpened(incident) {
    selectedId = Number(incident.id);
    const category =
      incident.status === 'CLOSED'
        ? 'CLOSED'
        : incident.signatures.some((signature) => signature.role === 'HR')
          ? 'ONGOING'
          : 'WAITING';
    if (state.category !== category) {
      state.category = category;
      state.page = 1;
    }
    if (state.stage !== 'ALL' && state.stage !== incident.status) {
      state.stage = 'ALL';
      state.page = 1;
    }
    if (
      state.search &&
      !`${incident.caseNumber} ${incident.subject} ${incident.reportedEmployeeName} ${incident.reporterName}`
        .toLowerCase()
        .includes(state.search.toLowerCase())
    ) {
      state.search = '';
      state.page = 1;
    }
    syncFilters();
    byId('ir-review-case-status').textContent =
      `${window.IncidentProgress.label(incident.status)}${incident.status === 'CLOSED' ? ' · Read-only archive' : ''}`;
    const owner = session?.email;
    const id = selectedId;
    const [snapshot] = await Promise.allSettled([
      api('getIncidentTrackingVersion', incident.id),
      fetchList()
    ]);
    if (
      owner === session?.email &&
      selectedId === id &&
      snapshot.status === 'fulfilled'
    )
      selectedVersion = snapshot.value.version;
  }

  async function open(id) {
    if (!allowed()) return;
    const ticket = ++openRequest;
    const owner = session.email;
    selectedId = Number(id);
    selectedVersion = '';
    workspace.hidden = false;
    byId('ir-review-case-title').textContent = 'Loading case…';
    byId('ir-review-case-body').replaceChildren();
    ui.feedback(byId('ir-review-case-feedback'), '');
    try {
      await window.openIncidentCase(id);
      if (
        ticket === openRequest &&
        owner === session?.email &&
        visible() &&
        !workspace.hidden
      )
        workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (ticket === openRequest && owner === session?.email)
        ui.feedback(
          byId('ir-review-case-feedback'),
          error.message || String(error),
          true
        );
    }
  }

  function close() {
    ++openRequest;
    ui.cancelOpen();
    selectedId = null;
    selectedVersion = '';
    workspace.hidden = true;
    byId('ir-review-case-body').replaceChildren();
    byId('ir-review-list')
      .querySelectorAll('.is-selected')
      .forEach((row) => row.classList.remove('is-selected'));
  }

  async function load(requestedId = null) {
    if (!allowed()) {
      close();
      throw new Error('Only HR and ADMIN can access Review.');
    }
    if (actor !== session.email) {
      actor = session.email;
      ++listRequest;
      close();
      Object.assign(state, {
        category: 'ONGOING',
        stage: 'ALL',
        search: '',
        page: 1,
        pages: 1
      });
    }
    syncFilters();
    await fetchList();
    if (requestedId) await open(requestedId);
  }

  const applyFilters = () => {
    state.page = 1;
    fetchList().catch(() => {});
  };
  document.querySelectorAll('[data-review-category]').forEach((button) => {
    button.onclick = () => {
      state.category = button.dataset.reviewCategory;
      state.stage = 'ALL';
      syncFilters();
      applyFilters();
    };
  });
  byId('ir-review-stage').onchange = (event) => {
    state.stage = event.target.value;
    if (state.stage !== 'ALL')
      state.category =
        state.stage === 'CLOSED'
          ? 'CLOSED'
          : ['PENDING SIGNATURE', 'SIGNED'].includes(state.stage)
            ? 'WAITING'
            : 'ONGOING';
    syncFilters();
    applyFilters();
  };
  byId('ir-review-search').oninput = (event) => {
    state.search = event.target.value;
    clearTimeout(timer);
    timer = setTimeout(applyFilters, 300);
  };
  byId('ir-review-previous').onclick = () => {
    --state.page;
    fetchList().catch(() => {});
  };
  byId('ir-review-next').onclick = () => {
    ++state.page;
    fetchList().catch(() => {});
  };
  byId('ir-review-case-close').onclick = close;
  byId('ir-review-case-refresh').onclick = () => {
    if (selectedId) open(selectedId);
  };
  setInterval(async () => {
    if (!visible() || document.hidden || !allowed() || polling) return;
    polling = true;
    const id = selectedId;
    try {
      await fetchList();
      if (id && selectedVersion) {
        const snapshot = await api('getIncidentTrackingVersion', id);
        if (selectedId === id && snapshot.version !== selectedVersion)
          byId('ir-review-case-status').textContent =
            'This case was updated. Refresh the case to load the latest details.';
      }
    } catch (error) {
      ui.feedback(
        byId('ir-review-feedback'),
        error.message || String(error),
        true
      );
    } finally {
      polling = false;
    }
  }, 60000);
  window.IncidentReview = { load, caseOpened, open };
})();
