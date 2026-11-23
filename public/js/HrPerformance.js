(function () {
  let data,
    version = 0,
    filtersDirty = false;
  const charts = new Map();
  const byId = (id) => document.getElementById(`performance-${id}`);
  const time = (value) =>
    value == null ? 'Not Available' : WorkTime.format(value);
  function cell(row, value) {
    const td = AppUI.tableCell(value);
    row.appendChild(td);
    return td;
  }
  function chart(id, labels, datasets, type = 'bar') {
    charts.get(id)?.destroy();
    if (!window.Chart) return;
    charts.set(
      id,
      new Chart(byId(`${id}-chart`), {
        type,
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: type === 'line' ? 1 : 0 }
            }
          }
        }
      })
    );
  }
  function series(label, values, color) {
    return {
      label,
      data: values,
      backgroundColor: color,
      borderColor: color,
      tension: 0.2
    };
  }
  function renderCharts() {
    const rows = data.comparison,
      names = rows.map((row) => row.name);
    chart('completions', names, [
      series(
        'Forms',
        rows.map((row) => row.forms),
        '#a65138'
      ),
      series(
        'Incidents Reviewed',
        rows.map((row) => row.incidentsReviewed),
        '#768758'
      )
    ]);
    chart(
      'trend',
      data.trend.map((row) =>
        row.period.length === 7
          ? `${row.period.slice(5)}/${row.period.slice(0, 4)}`
          : DateUtils.formatDate(row.period)
      ),
      [
        series(
          'Forms',
          data.trend.map((row) => row.forms),
          '#a65138'
        ),
        series(
          'Incidents Reviewed',
          data.trend.map((row) => row.incidents),
          '#768758'
        )
      ],
      'line'
    );
    chart('workload', names, [
      series(
        'Tasks Assigned',
        rows.map((row) => row.assigned),
        '#a65138'
      ),
      series(
        'Tasks Waiting for Employee Response',
        rows.map((row) => row.waiting),
        '#c49842'
      )
    ]);
    const tasks = data.tasks.filter((task) => task.state !== 'COMPLETED');
    const stages = new Map();
    tasks.forEach((task) =>
      stages.set(task.stage, (stages.get(task.stage) || 0) + 1)
    );
    chart(
      'stages',
      [...stages.keys()].map((stage) => FormStatus.titleCase(stage)),
      [series('Tasks', [...stages.values()], '#768758')]
    );
    const age = [0, 0, 0, 0];
    tasks
      .filter((task) => task.takenMs != null)
      .forEach(
        (task) =>
          age[
            task.duration <= 10.5 * 3600000
              ? 0
              : task.duration <= 31.5 * 3600000
                ? 1
                : task.duration <= 52.5 * 3600000
                  ? 2
                  : 3
          ]++
      );
    chart(
      'age',
      ['Up to 1 Workday', '1–3 Workdays', '3–5 Workdays', 'Over 5 Workdays'],
      [series('Tasks', age, '#c49842')]
    );
    const daily = new Map();
    data.tasks
      .filter((task) => task.state === 'COMPLETED')
      .forEach((task) => {
        const date = DateUtils.manilaDate(new Date(task.completedMs));
        const values = daily.get(date) || [];
        values.push(task.duration / 3600000);
        daily.set(date, values);
      });
    const periods = [...daily.keys()].sort();
    chart(
      'turnaround',
      periods.map((date) => DateUtils.formatDate(date)),
      [
        series(
          'Average Working Hours',
          periods.map(
            (date) =>
              daily.get(date).reduce((a, b) => a + b, 0) /
              daily.get(date).length
          ),
          '#a65138'
        )
      ],
      'line'
    );
  }
  function renderReviewers() {
    const body = byId('reviewer-rows');
    body.replaceChildren();
    data.comparison.forEach((reviewer) => {
      const row = el('tr');
      [
        reviewer.name,
        reviewer.role,
        reviewer.forms,
        reviewer.incidentsReviewed,
        reviewer.assigned,
        reviewer.waiting,
        time(reviewer.medianMs)
      ].forEach((value) => cell(row, value));
      body.appendChild(row);
    });
    if (!body.children.length) AppUI.emptyRow(body, 7, 'No reviewers found.');
  }
  async function openTask(task) {
    if (task.type === 'INCIDENT')
      return window.openIncidentRoute(task.resourceId, 'incident-track');
    await showFormContents(await api('getPerformanceForm', task.resourceId));
  }
  async function history(task) {
    const entries = await api('getReviewTaskHistory', task.id);
    const dialog = el('dialog', undefined, 'task-history-dialog'),
      heading = el('div', undefined, 'account-heading');
    heading.appendChild(el('h2', task.reference));
    const close = el('button', 'Close', 'ghost');
    close.type = 'button';
    close.onclick = () => dialog.close();
    heading.appendChild(close);
    dialog.appendChild(heading);
    const list = el('ol', undefined, 'task-history');
    entries.forEach((entry) => {
      const item = el('li');
      item.append(
        el('strong', FormStatus.titleCase(entry.action)),
        el(
          'p',
          `${entry.actorName} · ${DateUtils.formatDateTime(new Date(Number(entry.event_ms)))}`
        )
      );
      if (entry.action === 'REASSIGNED')
        item.appendChild(
          el(
            'p',
            `${entry.previous_owner || 'Unassigned'} → ${entry.owner_email}`
          )
        );
      if (entry.remarks) item.appendChild(el('p', entry.remarks));
      if (Number(entry.active_ms))
        item.appendChild(
          el('p', `Working Time Recorded: ${time(entry.active_ms)}`)
        );
      list.appendChild(item);
    });
    if (!entries.length)
      dialog.appendChild(el('p', 'No ownership history recorded.'));
    dialog.appendChild(list);
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.showModal();
  }
  function renderTasks() {
    const body = byId('task-rows');
    body.replaceChildren();
    data.tasks.forEach((task) => {
      const row = el('tr');
      [
        task.reference,
        task.title,
        task.employeeName,
        task.ownerName || 'Unassigned',
        task.type === 'INCIDENT'
          ? window.IncidentProgress.label(task.stage)
          : FormStatus.titleCase(task.stage),
        task.waitingReason ||
          (task.state === 'COMPLETED'
            ? 'Completed'
            : task.owner
              ? 'Awaiting HR'
              : 'Unassigned')
      ].forEach((value) => cell(row, value));
      const timing = cell(row, '');
      if (task.takenMs != null) timing.appendChild(TaskUI.clock(task));
      else timing.textContent = 'Not Started';
      const ownerTiming = cell(row, '');
      if (task.takenMs != null)
        ownerTiming.appendChild(
          TaskUI.clock({ ...task, activeMs: task.ownerActiveMs })
        );
      else ownerTiming.textContent = 'Not Started';
      cell(
        row,
        task.lastActionMs == null
          ? 'Not Available'
          : DateUtils.formatDateTime(new Date(task.lastActionMs))
      );
      const actionCell = cell(row, '');
      const actions = el('div', undefined, 'actions');
      actionCell.appendChild(actions);
      const view = el('button', 'View', 'ghost');
      view.type = 'button';
      view.onclick = () =>
        openTask(task).catch((error) => AppErrors.show(error.message));
      const log = el('button', 'History', 'ghost');
      log.type = 'button';
      log.onclick = () =>
        history(task).catch((error) => AppErrors.show(error.message));
      const ownership = TaskUI.render(
        {
          ...task,
          canTake: false,
          isMine: task.owner === session.email
        },
        load,
        true
      );
      if (task.canViewCase !== false) actions.appendChild(view);
      actions.append(log, ...ownership.querySelectorAll('button'));
      body.appendChild(row);
    });
    if (!body.children.length) AppUI.emptyRow(body, 10, 'No matching tasks.');
  }
  function renderAssignments() {
    const body = byId('assignment-rows');
    body.replaceChildren();
    data.incidentAssignments.forEach((entry) => {
      const row = el('tr');
      const isCurrent =
        entry.currentOwner?.toLowerCase() === entry.email.toLowerCase();
      [
        entry.caseNumber,
        entry.subject,
        entry.reviewerName,
        DateUtils.formatDateTime(new Date(entry.takenMs)),
        isCurrent
          ? entry.state === 'COMPLETED'
            ? 'Completed'
            : 'Current Owner'
          : 'Transferred'
      ].forEach((value) => cell(row, value));
      const view = el('button', 'View Case', 'ghost');
      view.type = 'button';
      view.onclick = () =>
        window.openIncidentRoute(entry.incidentId, 'incident-track');
      const action = cell(row, '');
      if (entry.canViewCase !== false) action.appendChild(view);
      body.appendChild(row);
    });
    if (!body.children.length)
      AppUI.emptyRow(
        body,
        6,
        'No incident tasks taken or assigned in this period.'
      );
  }
  async function load({ background = false } = {}) {
    if (session?.role !== 'ADMIN')
      throw new Error('Only ADMIN can view HR performance.');
    if (
      background &&
      (filtersDirty || byId('filters').contains(document.activeElement))
    )
      return;
    const ticket = ++version,
      owner = session.email;
    const result = await api('getHrPerformance', {
      from: byId('from').value,
      to: byId('to').value,
      email: byId('reviewer').value,
      type: byId('type').value,
      state: byId('state').value,
      interval: byId('interval').value
    });
    if (ticket !== version || owner !== session?.email) return;
    data = result;
    filtersDirty = false;
    byId('from').value = data.from;
    byId('to').value = data.to;
    const selected = byId('reviewer').value;
    byId('reviewer').replaceChildren(new Option('All Reviewers', ''));
    data.accounts.forEach((account) =>
      byId('reviewer').add(
        new Option(`${account.name} (${account.role})`, account.email)
      )
    );
    byId('reviewer').value = selected;
    const kpis = byId('kpis');
    kpis.replaceChildren();
    for (const [label, value, title] of [
      [
        'Forms Reviewed',
        data.summary.forms,
        'Final approvals and rejections in the selected period.'
      ],
      [
        'Incidents Reviewed',
        data.summary.incidentsReviewed,
        'Distinct incident reports reviewed in the selected period.'
      ],
      [
        'Total Backlog',
        data.summary.totalBacklog,
        'All unfinished HR tasks, assigned or unassigned, including tasks awaiting employees. Uses Request Type; independent of Reviewer, date range, and Task List Status.'
      ],
      [
        'Tasks Waiting for Employee Response',
        data.summary.waiting,
        'Current tasks awaiting signatures, explanations, or requested information.'
      ],
      [
        'Unassigned Backlog',
        data.summary.unassignedBacklog,
        'Unfinished HR tasks without an owner; a subset of Total Backlog. Uses Request Type; independent of Reviewer, date range, and Task List Status.'
      ],
      [
        'Typical HR Time',
        time(data.summary.medianMs),
        'Median working time for tracked completions in this period. Older durations are unavailable.'
      ]
    ]) {
      const card = el('article');
      card.title = title;
      card.append(el('span', label), el('strong', value));
      kpis.appendChild(card);
    }
    renderReviewers();
    renderTasks();
    renderAssignments();
    renderCharts();
  }
  byId('filters').onsubmit = (event) => {
    event.preventDefault();
    load().catch((error) => AppErrors.show(error.message));
  };
  byId('filters').addEventListener('input', () => {
    filtersDirty = true;
  });
  byId('filters').addEventListener('change', () => {
    filtersDirty = true;
  });
  byId('refresh').onclick = () =>
    load().catch((error) => AppErrors.show(error.message));
  window.addEventListener('review-tasks-changed', () => {
    if (
      session?.role === 'ADMIN' &&
      !$('view-hr-performance').hidden &&
      !document.querySelector('dialog[open]')
    )
      load({ background: true }).catch((error) =>
        AppErrors.show(error.message)
      );
  });
  setInterval(() => {
    if (
      session?.role === 'ADMIN' &&
      !$('view-hr-performance').hidden &&
      !document.hidden &&
      !document.querySelector('dialog[open]') &&
      !byId('filters').contains(document.activeElement)
    )
      load({ background: true }).catch((error) =>
        AppErrors.show(error.message)
      );
  }, 60000);
  VIEWS['hr-performance'] = guard(load);
})();
