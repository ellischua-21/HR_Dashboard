(function () {
  let original = '',
    loaded = false;
  const container = document.getElementById('incident-department-assignments');
  const manager = document.getElementById('incident-management-approver');
  function value() {
    return {
      assignments: [...container.querySelectorAll('select')]
        .filter((select) => select.value)
        .map((select) => ({
          department: select.dataset.department,
          reviewerEmail: select.value
        })),
      managementEmail: manager.value
    };
  }
  async function load(preserveDraft = false) {
    const draft = preserveDraft && loaded ? value() : null;
    const draftDepartments = new Set(
      [...container.querySelectorAll('select')].map((select) =>
        select.dataset.department.toLowerCase()
      )
    );
    const data = await api('getIncidentWorkflowConfiguration');
    container.replaceChildren();
    for (const department of data.departments) {
      const isHeads = department.toLowerCase() === 'heads',
        assigned = data.assignments.filter(
          (row) => row.department.toLowerCase() === department.toLowerCase()
        );
      const group = isHeads ? el('div') : null,
        reviewerFields = isHeads ? el('div') : null;
      if (isHeads) {
        group.className = 'incident-head-reviewer-field';
        reviewerFields.className = 'incident-head-reviewers';
        group.appendChild(el('span', 'Heads'));
      }
      for (let slot = 0; slot < (isHeads ? 2 : 1); slot++) {
        const label = isHeads ? null : el('label', department),
          select = el('select');
        select.dataset.department = department;
        if (isHeads)
          select.setAttribute('aria-label', `Heads reviewer ${slot + 1}`);
        select.add(new Option('Unassigned', ''));
        data.accounts
          .filter((account) =>
            IncidentWorkflowDefinition.canAssignDepartmentHead(
              account,
              department
            )
          )
          .forEach((account) =>
            select.add(
              new Option(
                `${account.name} (${account.role === 'HR' && account.is_hr_head ? 'Head HR' : account.role})`,
                account.email
              )
            )
          );
        select.value = assigned[slot]?.reviewerEmail || '';
        select.onchange = () => {
          updateHeadReviewerChoices();
          updateManagers();
          updateAccountSaveButton();
        };
        if (isHeads) reviewerFields.appendChild(select);
        else {
          label.appendChild(select);
          container.appendChild(label);
        }
      }
      if (isHeads) {
        group.appendChild(reviewerFields);
        container.appendChild(group);
      }
    }
    function updateHeadReviewerChoices() {
      const selects = [
        ...container.querySelectorAll('select[data-department="Heads"]')
      ];
      for (const select of selects) {
        const selectedElsewhere = new Set(
          selects
            .filter((other) => other !== select)
            .map((other) => other.value)
            .filter(Boolean)
        );
        [...select.options].forEach((option) => {
          option.disabled = Boolean(
            option.value && selectedElsewhere.has(option.value)
          );
        });
      }
    }
    function updateManagers() {
      const selected = manager.value;
      manager.replaceChildren(new Option('Select An Approver', ''));
      data.approvers.forEach((account) =>
        manager.add(new Option(account.name, account.email))
      );
      manager.value = selected;
    }
    updateHeadReviewerChoices();
    updateManagers();
    manager.value = data.managementEmail;
    manager.onchange = updateAccountSaveButton;
    loaded = true;
    original = JSON.stringify(value());
    if (draft) {
      const slots = new Map();
      for (const select of container.querySelectorAll('select')) {
        const key = select.dataset.department.toLowerCase();
        if (!draftDepartments.has(key)) continue;
        const slot = slots.get(key) || 0;
        select.value =
          draft.assignments.filter(
            (row) => row.department.toLowerCase() === key
          )[slot]?.reviewerEmail || '';
        slots.set(key, slot + 1);
      }
      manager.value = draft.managementEmail;
      updateHeadReviewerChoices();
      updateManagers();
    }
    updateAccountSaveButton();
  }
  window.IncidentAssignments = {
    load,
    value,
    dirty: () => loaded && original !== JSON.stringify(value())
  };
})();
