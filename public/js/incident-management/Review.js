(function () {
  const ui = window.IncidentCaseUI,
    el = ui.element;
  const byId = (id) => document.getElementById(id);
  let category = 'ALL',
    actor = '',
    request = 0,
    timer,
    polling = false;
  const visible = () => !byId('view-incident-review').hidden;
  const allowed = () => ['HEAD', 'HR', 'ADMIN'].includes(session?.role);
  const title = (key) =>
    ({
      ALL: 'All',
      FOR_REVIEW: 'For Review',
      NTE_ISSUED: 'NTE Issued',
      IR_FILED: 'IR Filed',
      CLOSED: 'Closed'
    })[key] || key;
  async function fetchList() {
    if (!allowed()) throw new Error('You cannot access incident Review.');
    const ticket = ++request,
      owner = session.email;
    const data = await api('getIncidentReviewDashboard', {
      category,
      search: byId('ir-review-search').value
    });
    if (ticket !== request || owner !== session?.email) return;
    const tabs = byId('ir-review-categories'),
      summary = byId('ir-review-summary'),
      list = byId('ir-review-list');
    tabs.replaceChildren();
    summary.replaceChildren();
    for (const key of data.categories) {
      const button = el('button', key === category ? '' : 'ghost', title(key));
      button.type = 'button';
      button.setAttribute('aria-pressed', String(key === category));
      button.onclick = () => {
        category = key;
        fetchList().catch((error) => ui.feedback(error.message, true));
      };
      tabs.appendChild(button);
      const card = el('article');
      card.append(
        el('span', '', key === 'ALL' ? 'Total Cases' : title(key)),
        el('strong', '', Number(data.summary[key] || 0).toLocaleString())
      );
      summary.appendChild(card);
    }
    const scrollTop = list.scrollTop;
    list.replaceChildren();
    for (const incident of data.cases) {
      const row = el('article', 'incident-review-case'),
        details = el('div', 'incident-review-case-details');
      const header = el('div', 'incident-review-case-heading');
      header.append(
        el('strong', '', incident.caseNumber),
        el(
          'span',
          'badge',
          incident.legacy
            ? 'Read-Only Legacy Record'
            : window.IncidentProgress.label(incident.status)
        )
      );
      details.append(header, el('h3', '', incident.subject));
      const metadata = el('dl', 'incident-review-case-meta');
      for (const [label, value] of [
        ['Reported Employee', incident.reportedEmployeeName],
        ['Reported By', incident.reporterName],
        ['Date Filed', DateUtils.formatDate(incident.dateFiled)],
        [
          'Assigned Reviewer',
          incident.taskOwner || incident.assignedHeadEmail || 'Unassigned'
        ]
      ]) {
        const field = el('div');
        field.append(el('dt', '', label), el('dd', '', value));
        metadata.appendChild(field);
      }
      details.appendChild(metadata);
      const view = el('button', 'ghost', 'View');
      view.type = 'button';
      view.onclick = () =>
        window.openIncidentRoute(incident.id, 'incident-track');
      row.append(details, view);
      list.appendChild(row);
    }
    list.scrollTop = scrollTop;
    byId('ir-review-empty').hidden = data.total > 0;
  }
  async function load(id = null) {
    if (actor !== session.email) {
      actor = session.email;
      category = 'ALL';
      byId('ir-review-search').value = '';
    }
    await fetchList();
    if (id) window.openIncidentRoute(id, 'incident-track');
  }
  byId('ir-review-search').oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => fetchList().catch((error) => ui.feedback(error.message, true)),
      300
    );
  };
  setInterval(async () => {
    if (!visible() || document.hidden || !allowed() || polling) return;
    polling = true;
    try {
      await fetchList();
    } catch (error) {
      ui.feedback(error.message, true);
    } finally {
      polling = false;
    }
  }, 45000);
  window.addEventListener('review-tasks-changed', () => {
    if (visible())
      fetchList().catch((error) => ui.feedback(error.message, true));
  });
  window.IncidentReview = { load };
})();
