(function () {
  const ui = window.IncidentCaseUI;
  const el = ui.element;
  const byId = (id) => document.getElementById(id);
  const state = {
    category: 'ONGOING',
    stage: 'ALL',
    search: ''
  };
  let actor = '';
  let listRequest = 0;
  let timer;
  let polling = false;
  const visible = () => !byId('view-incident-review').hidden;
  const allowed = () => ['HR', 'ADMIN'].includes(session?.role);
  const formatDate = (value) => (value ? DateUtils.formatDateTime(value) : '—');

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
    const summary = data.summary || {};
    let summaryReady = true;
    for (const [name, key] of [
      ['total', 'totalCases'],
      ['ongoing', 'ongoing'],
      ['waiting', 'waiting'],
      ['nte', 'nte'],
      ['closed', 'closed']
    ]) {
      const value = Number(summary[key]);
      if (summary[key] == null || !Number.isFinite(value)) {
        byId(`ir-review-${name}`).textContent = '—';
        summaryReady = false;
      } else {
        byId(`ir-review-${name}`).textContent = value.toLocaleString();
      }
    }
    const list = byId('ir-review-list');
    const scrollTop = list.scrollTop;
    list.replaceChildren();
    data.cases.forEach((incident) => {
      const row = el('article', 'incident-review-case');
      row.setAttribute('role', 'listitem');
      row.dataset.caseId = incident.id;
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
        ['Date filed', DateUtils.formatDate(incident.dateFiled)],
        ['Last updated', formatDate(incident.updatedAt)],
        ['Assigned To', incident.taskOwner || 'Unassigned']
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
      const button = el('button', 'ghost', 'View');
      button.type = 'button';
      button.setAttribute(
        'aria-label',
        `${button.textContent} ${incident.caseNumber}`
      );
      button.onclick = () =>
        window.openIncidentRoute(incident.id, 'incident-track');
      row.append(details, button);
      list.appendChild(row);
    });
    list.scrollTop = scrollTop;
    byId('ir-review-empty').hidden = data.total > 0;
    byId('ir-review-results').textContent =
      `${state.category[0]}${state.category.slice(1).toLowerCase()} · ${data.total} matching case${data.total === 1 ? '' : 's'}`;
    return summaryReady;
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
        allRows: true
      });
      if (ticket !== listRequest || owner !== session?.email) return;
      const summaryReady = renderCases(data);
      ui.feedback(
        summaryReady
          ? ''
          : 'Review analytics are outdated. Restart the Node.js server to load the latest counts.',
        !summaryReady
      );
    } catch (error) {
      if (ticket === listRequest && owner === session?.email)
        ui.feedback(error.message || String(error), true);
      throw error;
    } finally {
      if (ticket === listRequest)
        byId('ir-review-list').setAttribute('aria-busy', 'false');
    }
  }

  async function load(requestedId = null) {
    if (!allowed()) {
      throw new Error('Only HR and ADMIN can access Review.');
    }
    if (actor !== session.email) {
      actor = session.email;
      ++listRequest;
      Object.assign(state, {
        category: 'ONGOING',
        stage: 'ALL',
        search: ''
      });
    }
    syncFilters();
    await fetchList();
    if (requestedId) window.openIncidentRoute(requestedId, 'incident-track');
  }

  const applyFilters = () => {
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
  setInterval(async () => {
    if (!visible() || document.hidden || !allowed() || polling) return;
    polling = true;
    try {
      await fetchList();
    } catch (error) {
      ui.feedback(error.message || String(error), true);
    } finally {
      polling = false;
    }
  }, 60000);
  window.addEventListener('review-tasks-changed', () => {
    if (visible()) fetchList().catch(() => {});
  });
  window.IncidentReview = { load };
})();
