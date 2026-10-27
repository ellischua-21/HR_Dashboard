function renderIncidentCodeConfiguration(provisions) {
  incidentCodeProvisions = provisions;
  const form = document.getElementById('incident-code-provision-form');
  const canManage =
    ['HR', 'ADMIN'].includes(session.role) &&
    session.perms.includes('incidents.coc.manage');
  form.hidden = !canManage;
  const ruleForm = document.getElementById('incident-code-rule-form');
  const actionForm = document.getElementById('incident-code-action-form');
  ruleForm.hidden = !canManage;
  actionForm.hidden = !canManage;
  const provisionSelect = document.getElementById(
    'incident-code-rule-provision'
  );
  const ruleSelect = document.getElementById('incident-code-action-rule');
  provisionSelect.replaceChildren(new Option('Select a provision', ''));
  ruleSelect.replaceChildren(new Option('Select a violation rule', ''));
  incidentCodeProvisions.forEach((provision) => {
    provisionSelect.add(
      new Option(`${provision.code} — ${provision.title}`, provision.id)
    );
    (provision.rules || []).forEach((rule) => {
      const label = `${provision.code} — ${rule.violationTitle} (${rule.severity})`;
      ruleSelect.add(new Option(label, rule.id));
    });
  });
  const body = document.getElementById('incident-code-provision-rows');
  body.replaceChildren();
  document.getElementById('incident-code-provision-empty').hidden =
    incidentCodeProvisions.length > 0;
  incidentCodeProvisions.forEach((provision) => {
    const row = incidentElement('tr');
    row.append(
      incidentElement('td', '', provision.code),
      incidentElement('td', '', provision.title)
    );
    const details = incidentElement('td');
    details.appendChild(incidentElement('p', '', provision.description));
    (provision.rules || []).forEach((rule) => {
      const ruleCard = incidentElement('div', 'incident-code-rule-card');
      ruleCard.appendChild(
        incidentElement(
          'strong',
          '',
          `${rule.violationTitle} · ${rule.severity}`
        )
      );
      ruleCard.appendChild(
        incidentElement(
          'p',
          'note',
          `Occurrence count: ${rule.occurrenceScope.replaceAll('_', ' ').toLowerCase()}${rule.occurrenceWindowDays ? `, last ${rule.occurrenceWindowDays} days` : ', all history'}`
        )
      );
      (rule.actions || []).forEach((action) => {
        const actionLine = incidentElement(
          'p',
          '',
          `${action.priorOffenses} prior offense(s): ${action.decisionType.replaceAll('_', ' ')} · ${action.correctiveAction}${action.details ? ` — ${action.details}` : ''}`
        );
        if (canManage) {
          const removeAction = incidentElement('button', 'ghost', 'Remove');
          removeAction.type = 'button';
          removeAction.onclick = async () => {
            if (
              !window.confirm(
                'Remove this occurrence action from the active Code of Conduct rule?'
              )
            )
              return;
            try {
              await api('deleteIncidentCodeRuleAction', action.id);
              await loadIncidentCodeOfConduct();
            } catch (error) {
              window.alert(error.message || String(error));
            }
          };
          actionLine.append(' ', removeAction);
        }
        ruleCard.appendChild(actionLine);
      });
      if (canManage) {
        const editRule = incidentElement('button', 'ghost', 'Edit rule');
        editRule.type = 'button';
        editRule.onclick = () => {
          document.getElementById('incident-code-rule-id').value = rule.id;
          provisionSelect.value = String(provision.id);
          document.getElementById('incident-code-rule-title').value =
            rule.violationTitle;
          document.getElementById('incident-code-rule-severity').value =
            rule.severity;
          document.getElementById('incident-code-rule-scope').value =
            rule.occurrenceScope;
          document.getElementById('incident-code-rule-window').value =
            rule.occurrenceWindowDays || '';
          ruleForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        const deactivateRule = incidentElement('button', 'ghost', 'Deactivate');
        deactivateRule.type = 'button';
        deactivateRule.onclick = async () => {
          if (
            !window.confirm(
              'Deactivate this COC violation rule? Historical records will be preserved.'
            )
          )
            return;
          try {
            await api('deactivateIncidentCodeRule', rule.id);
            await loadIncidentCodeOfConduct();
          } catch (error) {
            window.alert(error.message || String(error));
          }
        };
        ruleCard.append(editRule, deactivateRule);
      }
      details.appendChild(ruleCard);
    });
    row.appendChild(details);
    const action = incidentElement('td');
    if (canManage) {
      const edit = incidentElement('button', 'ghost', 'Edit');
      edit.type = 'button';
      edit.onclick = () => {
        document.getElementById('incident-code-provision-id').value =
          provision.id;
        document.getElementById('incident-code-provision-code').value =
          provision.code;
        document.getElementById('incident-code-provision-title').value =
          provision.title;
        document.getElementById('incident-code-provision-description').value =
          provision.description;
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      action.appendChild(edit);
    }
    row.appendChild(action);
    body.appendChild(row);
  });
}

document
  .getElementById('incident-code-rule-form')
  .addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.getElementById('incident-code-rule-feedback');
    try {
      await api('saveIncidentCodeRule', {
        id: document.getElementById('incident-code-rule-id').value,
        provisionId: document.getElementById('incident-code-rule-provision')
          .value,
        violationTitle: document.getElementById('incident-code-rule-title')
          .value,
        severity: document.getElementById('incident-code-rule-severity').value,
        occurrenceScope: document.getElementById('incident-code-rule-scope')
          .value,
        occurrenceWindowDays: document.getElementById(
          'incident-code-rule-window'
        ).value
      });
      form.reset();
      document.getElementById('incident-code-rule-id').value = '';
      setIncidentFeedback(feedback, 'COC rule saved.');
      await loadIncidentCodeOfConduct();
    } catch (error) {
      setIncidentFeedback(feedback, error.message || String(error), true);
    }
  });
document.getElementById('incident-code-rule-reset').onclick = () => {
  document.getElementById('incident-code-rule-form').reset();
  document.getElementById('incident-code-rule-id').value = '';
};
document
  .getElementById('incident-code-action-form')
  .addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.getElementById('incident-code-action-feedback');
    try {
      await api(
        'saveIncidentCodeRuleAction',
        document.getElementById('incident-code-action-rule').value,
        document.getElementById('incident-code-action-count').value,
        document.getElementById('incident-code-action-name').value,
        document.getElementById('incident-code-action-type').value,
        document.getElementById('incident-code-action-details').value
      );
      const selectedRule = document.getElementById(
        'incident-code-action-rule'
      ).value;
      form.reset();
      await loadIncidentCodeOfConduct();
      document.getElementById('incident-code-action-rule').value = selectedRule;
      setIncidentFeedback(feedback, 'Corrective action rule saved.');
    } catch (error) {
      setIncidentFeedback(feedback, error.message || String(error), true);
    }
  });

document
  .getElementById('incident-code-provision-form')
  .addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.getElementById(
      'incident-code-provision-feedback'
    );
    try {
      await api('saveIncidentCodeProvision', {
        id: document.getElementById('incident-code-provision-id').value,
        code: document.getElementById('incident-code-provision-code').value,
        title: document.getElementById('incident-code-provision-title').value,
        description: document.getElementById(
          'incident-code-provision-description'
        ).value
      });
      form.reset();
      document.getElementById('incident-code-provision-id').value = '';
      setIncidentFeedback(feedback, 'Provision saved.');
      await loadIncidentCodeOfConduct();
    } catch (error) {
      setIncidentFeedback(feedback, error.message || String(error), true);
    }
  });
document.getElementById('incident-code-provision-reset').onclick = () => {
  document.getElementById('incident-code-provision-form').reset();
  document.getElementById('incident-code-provision-id').value = '';
  setIncidentFeedback(
    document.getElementById('incident-code-provision-feedback'),
    ''
  );
};
