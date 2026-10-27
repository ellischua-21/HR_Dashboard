(function () {
  const ui = window.IncidentCaseUI,
    el = ui.element;
  const byId = (id) => document.getElementById(id);
  const severities = ['Light', 'Moderate', 'Grave', 'Intolerable'];
  let guide = null,
    actor = '',
    guideRequest = 0,
    historyRequest = 0;
  let employeeEmail = '',
    page = 1;
  const label = (value) => window.IncidentProgress.label(value);
  const feedback = (id, text, error = false) =>
    ui.feedback(byId(id), text, error);
  const canManageRecords = () =>
    ['HR', 'ADMIN'].includes(session?.role) &&
    session.perms.includes('emp.read');

  function renderGuide() {
    if (!guide) return;
    const search = byId('ir-coc-search').value.trim().toLowerCase(),
      severity = byId('ir-coc-severity').value;
    const root = byId('ir-coc-guide');
    root.replaceChildren();
    const matches = (value) =>
      String(value || '')
        .toLowerCase()
        .includes(search);
    guide.provisions.forEach((provision) => {
      const provisionMatches = [
        provision.code,
        provision.title,
        provision.description
      ].some(matches);
      const rules = provision.rules.filter(
        (rule) =>
          (severity === 'ALL' || rule.severity === severity) &&
          (!search ||
            provisionMatches ||
            [
              rule.violationTitle,
              rule.severity,
              ...rule.actions.map(
                (action) => action.correctiveAction + ' ' + action.details
              )
            ].some(matches))
      );
      if (
        (!rules.length && severity !== 'ALL') ||
        (search && !provisionMatches && !rules.length)
      )
        return;
      const card = el('details', 'incident-coc-provision');
      card.open = Boolean(search || severity !== 'ALL');
      card.appendChild(
        el('summary', '', `${provision.code} · ${provision.title}`)
      );
      card.appendChild(
        el('p', 'incident-policy-description', provision.description)
      );
      rules.forEach((rule) => {
        const section = el('section', 'incident-code-rule-card');
        section.append(
          el('h4', '', rule.violationTitle),
          el('p', '', `Severity: ${rule.severity}`)
        );
        section.appendChild(
          el(
            'p',
            'note',
            `Count: ${rule.occurrenceScope.replaceAll('_', ' ').toLowerCase()}${rule.occurrenceWindowDays ? ` · ${rule.occurrenceWindowDays} days` : ' · All history'}`
          )
        );
        const list = el('ul');
        rule.actions.forEach((action) =>
          list.appendChild(
            el(
              'li',
              '',
              `Occurrence ${Number(action.priorOffenses) + 1}: ${action.correctiveAction}${action.details ? ' — ' + action.details : ''}`
            )
          )
        );
        section.appendChild(
          rule.actions.length
            ? list
            : el(
                'p',
                'note',
                'No corrective actions configured for this violation.'
              )
        );
        card.appendChild(section);
      });
      root.appendChild(card);
    });
    if (!root.children.length)
      root.appendChild(el('p', 'note', 'No matching provisions.'));
    const matrix = byId('ir-coc-matrix');
    matrix.replaceChildren();
    guide.matrix
      .filter((row) => severity === 'ALL' || row.severity === severity)
      .forEach((row) => {
        const tr = el('tr');
        [row.severity, row.occurrence, row.correctiveAction].forEach((value) =>
          tr.appendChild(el('td', '', String(value)))
        );
        matrix.appendChild(tr);
      });
  }

  function matrixRow(
    row = { severity: 'Light', occurrence: 1, correctiveAction: '' }
  ) {
    const tr = el('tr'),
      severity = el('select'),
      occurrence = el('input'),
      action = el('textarea');
    severities.forEach((value) => severity.add(new Option(value, value)));
    severity.value = row.severity;
    severity.setAttribute('aria-label', 'Severity');
    occurrence.type = 'number';
    occurrence.min = '1';
    occurrence.max = '1001';
    occurrence.required = true;
    occurrence.value = row.occurrence;
    occurrence.setAttribute('aria-label', 'Occurrence');
    action.value = row.correctiveAction;
    action.rows = 2;
    action.maxLength = 1000;
    action.required = true;
    action.setAttribute('aria-label', 'Corrective action');
    [severity, occurrence, action].forEach((control) => {
      const td = el('td');
      td.appendChild(control);
      tr.appendChild(td);
    });
    const td = el('td'),
      remove = el('button', 'ghost', 'Remove');
    remove.type = 'button';
    remove.onclick = () => tr.remove();
    td.appendChild(remove);
    tr.appendChild(td);
    byId('ir-coc-matrix-editor').appendChild(tr);
  }
  function readMatrix() {
    return [...byId('ir-coc-matrix-editor').rows].map((row) => ({
      severity: row.querySelector('select').value,
      occurrence: Number(row.querySelector('input').value),
      correctiveAction: row.querySelector('textarea').value
    }));
  }

  async function loadGuide(selectedId = null, configure = false) {
    const ticket = ++guideRequest,
      owner = session.email;
    try {
      const data = await api('getIncidentCodeGuide', selectedId);
      if (ticket !== guideRequest || owner !== session?.email) return;
      guide = data;
      const select = byId('ir-coc-version');
      select.replaceChildren(new Option('Current effective policy', ''));
      data.versions.forEach((version) =>
        select.add(
          new Option(
            `${version.version} · ${version.effectiveDate}`,
            version.id
          )
        )
      );
      select.value = selectedId || '';
      byId('ir-coc-policy-meta').textContent = data.policy
        ? `${data.policy.version} · Effective ${data.policy.effectiveDate} · Approved by ${data.policy.approvedBy}`
        : 'Draft reference · No approved policy version is effective yet.';
      byId('ir-coc-matrix-note').textContent = data.policy
        ? 'This matrix is guidance. HR evaluates and approves each decision using the applicable violation rule.'
        : 'Draft matrix for review. These actions are not automatically imposed.';
      byId('ir-coc-download').hidden = !data.policy?.pdfName;
      byId('ir-coc-management').hidden = !data.canManage;
      if (configure) {
        renderIncidentCodeConfiguration(data.draft?.provisions || []);
        byId('ir-coc-matrix-editor').replaceChildren();
        if (data.canManage) data.draft.matrix.forEach(matrixRow);
      }
      renderGuide();
      feedback('ir-coc-feedback', '');
    } catch (error) {
      if (ticket === guideRequest && owner === session?.email)
        feedback('ir-coc-feedback', error.message || String(error), true);
    }
  }

  async function loadHistory() {
    const ticket = ++historyRequest,
      owner = session.email;
    try {
      const data = await api('listIncidentViolations', { employeeEmail, page });
      if (ticket !== historyRequest || owner !== session?.email) return;
      page = data.page;
      byId('ir-violation-owner').textContent = data.employeeEmail;
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
  async function load() {
    if (actor !== session.email) {
      actor = session.email;
      employeeEmail = session.email;
      page = 1;
      ++guideRequest;
      ++historyRequest;
      guide = null;
      byId('ir-coc-management').hidden = true;
      byId('ir-coc-download').hidden = true;
      byId('ir-coc-policy-meta').textContent = '';
      byId('ir-violation-owner').textContent = '';
      byId('ir-coc-matrix').replaceChildren();
      byId('ir-violation-employee').value = employeeEmail;
      byId('ir-violation-rows').replaceChildren();
      byId('ir-coc-guide').replaceChildren();
      byId('ir-coc-search').value = '';
      byId('ir-coc-severity').value = 'ALL';
      byId('ir-coc-publish-form').reset();
      byId('ir-coc-management').open = false;
    }
    byId('ir-violation-employee-form').hidden = !canManageRecords();
    await Promise.all([loadGuide(null, true), loadHistory()]);
  }
  byId('ir-coc-search').oninput = renderGuide;
  byId('ir-coc-severity').onchange = renderGuide;
  byId('ir-coc-version').onchange = (event) =>
    loadGuide(event.target.value || null);
  byId('ir-coc-matrix-add').onclick = () => matrixRow();
  byId('ir-violation-employee-form').onsubmit = (event) => {
    event.preventDefault();
    employeeEmail = byId('ir-violation-employee').value.trim();
    page = 1;
    loadHistory();
  };
  byId('ir-violation-own').onclick = () => {
    employeeEmail = session.email;
    byId('ir-violation-employee').value = employeeEmail;
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
  byId('ir-coc-download').onclick = async () => {
    if (!guide?.policy) return;
    try {
      const file = await api('getIncidentPolicyPdf', guide.policy.id);
      const link = el('a');
      link.href = file.dataUrl;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      feedback('ir-coc-feedback', error.message || String(error), true);
    }
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
    const form = event.currentTarget,
      button = form.querySelector('[type="submit"]');
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
      await loadGuide(null, true);
      feedback('ir-coc-publish-feedback', 'Published successfully.');
    } catch (error) {
      feedback('ir-coc-publish-feedback', error.message || String(error), true);
    } finally {
      button.disabled = false;
    }
  };
  window.IncidentConduct = { load };
})();
