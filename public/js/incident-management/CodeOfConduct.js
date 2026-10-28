(function () {
  const ui = window.IncidentCaseUI;
  const el = ui.element;
  const byId = (id) => document.getElementById(id);
  const severities = ['Light', 'Moderate', 'Grave', 'Intolerable'];
  let guide = null;
  let actor = '';
  let guideRequest = 0;
  let historyRequest = 0;
  let employeeEmail = '';
  let page = 1;

  const feedback = (id, message, error = false) =>
    ui.feedback(byId(id), message, error);
  const canSearchHistory = () =>
    session?.role === 'HR' && (session.perms || []).includes('emp.read');

  function renderMatrix() {
    if (!guide) return;
    const body = byId('ir-coc-matrix');
    body.replaceChildren();
    guide.matrix.forEach((row) => {
      const tr = el('tr');
      [row.severity, row.occurrence, row.correctiveAction].forEach((value) =>
        tr.appendChild(el('td', '', String(value)))
      );
      body.appendChild(tr);
    });
    if (!body.children.length) {
      const row = el('tr');
      row.appendChild(el('td', 'note', 'No matching matrix entries.'));
      body.appendChild(row);
    }
  }

  function addMatrixRow(
    item = { severity: 'Light', occurrence: 1, correctiveAction: '' }
  ) {
    const row = el('tr');
    const severity = el('select');
    severities.forEach((value) => severity.add(new Option(value, value)));
    severity.value = item.severity;
    severity.setAttribute('aria-label', 'Severity');
    const occurrence = el('input');
    occurrence.type = 'number';
    occurrence.min = '1';
    occurrence.max = '1001';
    occurrence.required = true;
    occurrence.value = item.occurrence;
    occurrence.setAttribute('aria-label', 'Occurrence');
    const action = el('textarea');
    action.value = item.correctiveAction;
    action.rows = 2;
    action.maxLength = 1000;
    action.required = true;
    action.setAttribute('aria-label', 'Corrective action');
    [severity, occurrence, action].forEach((control) => {
      const cell = el('td');
      cell.appendChild(control);
      row.appendChild(cell);
    });
    const removeCell = el('td');
    const remove = el('button', 'ghost', 'Remove');
    remove.type = 'button';
    remove.onclick = () => row.remove();
    removeCell.appendChild(remove);
    row.appendChild(removeCell);
    byId('ir-coc-matrix-editor').appendChild(row);
  }

  function readMatrix() {
    return [...byId('ir-coc-matrix-editor').rows].map((row) => ({
      severity: row.querySelector('select').value,
      occurrence: Number(row.querySelector('input').value),
      correctiveAction: row.querySelector('textarea').value
    }));
  }

  async function loadGuide(configure = false) {
    const ticket = ++guideRequest;
    const owner = session.email;
    try {
      const data = await api('getIncidentCodeGuide', null);
      if (ticket !== guideRequest || owner !== session?.email) return;
      guide = data;
      byId('ir-coc-management').hidden = !data.canManage;
      if (configure) {
        byId('ir-coc-matrix-editor').replaceChildren();
        if (data.canManage) (data.draft?.matrix || []).forEach(addMatrixRow);
      }
      renderMatrix();
      feedback('ir-coc-feedback', '');
    } catch (error) {
      if (ticket === guideRequest && owner === session?.email)
        feedback('ir-coc-feedback', error.message || String(error), true);
    }
  }

  async function loadHistory() {
    const ticket = ++historyRequest;
    const owner = session.email;
    try {
      const data = await api('listIncidentViolations', { employeeEmail, page });
      if (ticket !== historyRequest || owner !== session?.email) return;
      page = data.page;
      const body = byId('ir-violation-rows');
      body.replaceChildren();
      data.records.forEach((record) => {
        const row = el('tr');
        [
          record.violationDate,
          record.caseNumber,
          record.violationTitle,
          record.severity,
          record.occurrenceNumber,
          record.correctiveAction,
          new Date(record.decisionDate).toLocaleString(),
          record.status
        ].forEach((value) =>
          row.appendChild(el('td', '', String(value ?? '—')))
        );
        body.appendChild(row);
      });
      byId('ir-violation-empty').hidden = data.total > 0;
      byId('ir-violation-page').textContent =
        `Page ${data.page} of ${data.pages} · ${data.total} record${data.total === 1 ? '' : 's'}`;
      byId('ir-violation-previous').disabled = data.page <= 1;
      byId('ir-violation-next').disabled = data.page >= data.pages;
      feedback('ir-violation-feedback', '');
    } catch (error) {
      if (ticket === historyRequest && owner === session?.email) {
        byId('ir-violation-rows').replaceChildren();
        feedback('ir-violation-feedback', error.message || String(error), true);
      }
    }
  }

  const employeeSearch = window.createEmployeeSearch({
    input: byId('ir-violation-employee'),
    suggestions: byId('ir-violation-options'),
    search: (query) =>
      api('searchIncidentEmployees', query, 'violation-history'),
    getOwner: () => session?.email,
    onClear: () => {
      employeeEmail = '';
    },
    onSelect: (employee) => {
      employeeEmail = employee.email;
    }
  });

  async function load() {
    if (actor !== session.email) {
      actor = session.email;
      employeeSearch.reset();
      employeeEmail = session.email;
      page = 1;
      ++guideRequest;
      ++historyRequest;
      guide = null;
      byId('ir-coc-management').hidden = true;
      byId('ir-coc-matrix').replaceChildren();
      byId('ir-violation-employee').value = '';
      byId('ir-violation-rows').replaceChildren();
      byId('ir-violation-options').replaceChildren();
      byId('ir-violation-options').hidden = true;
      byId('ir-coc-publish-form').reset();
    }
    byId('ir-violation-employee-form').hidden = !canSearchHistory();
    await Promise.all([loadGuide(true), loadHistory()]);
  }

  byId('ir-coc-matrix-add').onclick = () => addMatrixRow();
  byId('ir-violation-employee-form').onsubmit = (event) => {
    event.preventDefault();
    employeeEmail = employeeSearch.getSelection()?.email || '';
    if (!employeeEmail) {
      feedback(
        'ir-violation-feedback',
        'Select an employee from the suggestions.',
        true
      );
      return;
    }
    page = 1;
    loadHistory();
  };
  byId('ir-violation-own').onclick = () => {
    employeeSearch.reset();
    employeeEmail = session.email;
    byId('ir-violation-employee').value = '';
    byId('ir-violation-options').replaceChildren();
    byId('ir-violation-options').hidden = true;
    page = 1;
    loadHistory();
  };
  byId('ir-violation-previous').onclick = () => {
    --page;
    loadHistory();
  };
  byId('ir-violation-next').onclick = () => {
    ++page;
    loadHistory();
  };
  byId('ir-coc-save-draft').onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api('saveIncidentPolicyDraft', readMatrix());
      feedback('ir-coc-publish-feedback', 'Saved successfully.');
    } catch (error) {
      feedback('ir-coc-publish-feedback', error.message || String(error), true);
    } finally {
      button.disabled = false;
    }
  };
  byId('ir-coc-publish-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const file = byId('ir-coc-pdf').files[0];
      if (file && file.size > 4 * 1024 * 1024)
        throw new Error('Upload a PDF up to 4 MB.');
      await api('publishIncidentPolicy', {
        version: byId('ir-coc-new-version').value,
        effectiveDate: byId('ir-coc-effective').value,
        approved: byId('ir-coc-approved').checked,
        matrix: readMatrix(),
        pdf: file
          ? { fileName: file.name, dataUrl: await readIncidentFile(file) }
          : null
      });
      form.reset();
      await loadGuide(true);
      feedback('ir-coc-publish-feedback', 'Published successfully.');
    } catch (error) {
      feedback('ir-coc-publish-feedback', error.message || String(error), true);
    } finally {
      button.disabled = false;
    }
  };
  window.IncidentConduct = { load };
})();
