const accountCell = window.AppUI.tableCell;

const pendingHeadAssignments = new Map();
let pendingHrHeadEmail;
let hrHeadChanged = false;
let accountSaveBusy = false;
let lookupSaveBusy = false;
let accountTab = 'staff';

function selectAccountTab(key) {
  accountTab = key;
  document.querySelectorAll('[data-account-tab]').forEach((button) => {
    const selected = button.dataset.accountTab === key;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.classList.toggle('ghost', !selected);
  });
  document.querySelectorAll('[data-account-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.accountPanel !== key;
  });
}
const accountTabs = Array.from(document.querySelectorAll('[data-account-tab]'));
accountTabs.forEach((button, index) => {
  button.onclick = () => selectAccountTab(button.dataset.accountTab);
  button.onkeydown = (event) => {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % accountTabs.length
        : event.key === 'ArrowLeft'
          ? (index + accountTabs.length - 1) % accountTabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? accountTabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    accountTabs[next].click();
    accountTabs[next].focus();
  };
});

function hasAccountChanges() {
  return (
    pendingHeadAssignments.size > 0 ||
    hrHeadChanged ||
    Boolean(window.IncidentAssignments?.dirty())
  );
}

function updateAccountSaveButton() {
  const button = $('am_save_changes');
  button.disabled = accountSaveBusy || lookupSaveBusy || !hasAccountChanges();
  button.textContent = 'Save Changes';
  document.querySelectorAll('.hr-head-toggle').forEach((toggle) => {
    toggle.disabled = accountSaveBusy || toggle.dataset.inactive === 'true';
  });
  document
    .querySelectorAll(
      '.account-head-assignment, #incident-department-assignments select, #incident-management-approver'
    )
    .forEach((select) => {
      select.disabled = accountSaveBusy;
    });
  document
    .querySelectorAll('[data-lookup-list], #am_panel_settings input')
    .forEach((control) => {
      control.disabled = accountSaveBusy || lookupSaveBusy;
    });
}

function stagedHrHeadEmail(accounts) {
  return hrHeadChanged
    ? pendingHrHeadEmail
    : accounts.find((account) => account.is_hr_head)?.email || '';
}

async function saveAccountChanges() {
  if (accountSaveBusy || lookupSaveBusy || !hasAccountChanges()) return;
  accountSaveBusy = true;
  const button = $('am_save_changes');
  button.textContent = 'Save Changes';
  button.disabled = true;
  updateAccountSaveButton();
  showErr('');
  try {
    await api('saveAccountChanges', {
      headAssignments: Array.from(
        pendingHeadAssignments,
        ([email, assignment]) => ({ email, ...assignment })
      ),
      hrHeadChanged,
      hrHeadEmail: pendingHrHeadEmail || null,
      incidentConfiguration: window.IncidentAssignments?.dirty()
        ? window.IncidentAssignments.value()
        : undefined
    });
    pendingHeadAssignments.clear();
    pendingHrHeadEmail = undefined;
    hrHeadChanged = false;
    await loadAccountManagement();
    await window.IncidentAssignments?.load();
    AppFeedback.success('Saved successfully.');
  } catch (error) {
    showErr(error.message || String(error));
  } finally {
    accountSaveBusy = false;
    updateAccountSaveButton();
  }
}

const appendEmptyRow = window.AppUI.emptyRow;
const formatAccountDate = window.AppUI.dateTime;

function renderAccountRequests(requestList) {
  const requests = $('am_requests');
  requests.replaceChildren();

  if (!requestList.length) {
    appendEmptyRow(requests, 6, 'No pending account requests.');
  }
  requestList.forEach((request) => {
    const row = document.createElement('tr');
    row.append(
      accountCell(request.full_name),
      accountCell(request.email),
      accountCell(request.assigned_role),
      accountCell(
        [
          request.assigned_head_name || request.assigned_head_email,
          request.secondary_head_name || request.secondary_head_email
        ]
          .filter(Boolean)
          .join(' / ') || 'None'
      ),
      accountCell(formatAccountDate(request.requested_at))
    );

    const actions = document.createElement('td');
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.textContent = 'Approve';
    approve.onclick = async () => {
      if (
        !(await window.appConfirm(
          `Approve ${request.email} as ${request.assigned_role}?`,
          {
            title: 'Approve account request',
            confirmText: 'Approve'
          }
        ))
      )
        return;
      approve.disabled = true;
      try {
        await api('approveAccountRequest', request.id);
        await loadAccountRequests();
      } catch (error) {
        showErr(error.message || String(error));
        approve.disabled = false;
      }
    };

    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'ghost';
    reject.textContent = 'Reject';
    reject.onclick = async () => {
      if (
        !(await window.appConfirm(
          `Reject and remove the account request from ${request.email}?`,
          {
            title: 'Reject account request',
            confirmText: 'Reject',
            danger: true
          }
        ))
      )
        return;
      reject.disabled = true;
      try {
        await api('rejectAccountRequest', request.id);
        await loadAccountRequests();
      } catch (error) {
        showErr(error.message || String(error));
        reject.disabled = false;
      }
    };
    actions.append(approve, reject);
    row.appendChild(actions);
    requests.appendChild(row);
  });
}

async function loadAccountRequests() {
  const result = await api('getAccountManagement');
  renderAccountRequests(result.requests || []);
}

async function loadAccountManagement() {
  const result = await api('getAccountManagement');
  renderAccountManagement(result);
}

function renderAccountManagement(result) {
  if (result.lookupLists) {
    for (const [key, list] of [
      ['company', 'Company_List'],
      ['location', 'Location_List'],
      ['department', 'Department_List']
    ])
      $('am_' + key + '_values').textContent = (
        result.lookupLists[list] || []
      ).join(', ');
  }
  [
    ['users', 'am_users', true],
    ['supervisors', 'am_supervisors', true],
    ['heads', 'am_heads', false],
    ['hr', 'am_hr', 'hr'],
    ['admins', 'am_admins', false]
  ].forEach(([group, id, canAssignHead]) => {
    const body = $(id);
    body.replaceChildren();
    const accounts = result.accounts[group] || [];
    if (!accounts.length) {
      appendEmptyRow(
        body,
        canAssignHead === true ? 7 : canAssignHead === 'hr' ? 6 : 5,
        'No accounts in this list.'
      );
      return;
    }
    accounts.forEach((account) => {
      const row = document.createElement('tr');
      row.append(
        accountCell(account.full_name || ''),
        accountCell(account.email),
        accountCell(account.role)
      );
      if (canAssignHead === true) {
        row.appendChild(
          accountCell(
            [
              account.assigned_head_name || account.assigned_head_email,
              account.secondary_head_name || account.secondary_head_email
            ]
              .filter(Boolean)
              .join(' / ') || 'Unassigned'
          )
        );
        const assignmentCell = document.createElement('td');
        const reviewerRole = account.role === 'STAFF' ? 'Supervisor' : 'Head';
        const saved = {
          headEmail: account.assigned_head_email || '',
          secondaryHeadEmail: account.secondary_head_email || ''
        };
        const staged = pendingHeadAssignments.get(account.email) || saved;
        const selections = {};
        for (const [key, label] of [
          ['headEmail', reviewerRole],
          ['secondaryHeadEmail', `Second ${reviewerRole} (optional)`]
        ]) {
          const wrapper = document.createElement('label');
          wrapper.textContent = label;
          const select = document.createElement('select');
          select.className = 'account-head-assignment';
          select.setAttribute('aria-label', `${label} for ${account.email}`);
          const none = document.createElement('option');
          none.value = '';
          none.textContent =
            key === 'headEmail' ? `Select a ${reviewerRole}` : 'None';
          select.appendChild(none);
          (account.role === 'STAFF'
            ? result.availableSupervisors || []
            : result.availableHeads || []
          )
            .filter((optionAccount) => optionAccount.email !== account.email)
            .forEach((optionAccount) => {
              const option = document.createElement('option');
              option.value = optionAccount.email;
              option.textContent = `${optionAccount.full_name || optionAccount.email} (${optionAccount.email})`;
              select.appendChild(option);
            });
          select.value = staged[key];
          selections[key] = select;
          select.onchange = () => {
            if (accountSaveBusy) return;
            const next = {
              headEmail: selections.headEmail.value,
              secondaryHeadEmail: selections.secondaryHeadEmail.value
            };
            if (
              next.headEmail === saved.headEmail &&
              next.secondaryHeadEmail === saved.secondaryHeadEmail
            )
              pendingHeadAssignments.delete(account.email);
            else pendingHeadAssignments.set(account.email, next);
            updateAccountSaveButton();
          };
          wrapper.appendChild(select);
          assignmentCell.appendChild(wrapper);
        }
        row.append(
          accountCell(account.active ? 'Active' : 'Inactive'),
          accountCell(formatAccountDate(account.created_at))
        );
        row.appendChild(assignmentCell);
      } else if (canAssignHead === 'hr') {
        const toggleCell = document.createElement('td');
        const toggle = document.createElement('button');
        toggle.type = 'button';
        const selectedHr = stagedHrHeadEmail(result.accounts.hr);
        const selected = selectedHr === account.email;
        toggle.className =
          'ghost hr-head-toggle' + (selected ? ' selected' : '');
        toggle.textContent = selected ? 'On' : 'Off';
        toggle.setAttribute('aria-pressed', String(selected));
        toggle.setAttribute(
          'aria-label',
          `${selected ? 'Remove' : 'Designate'} ${account.full_name || account.email} as Head HR; Save Changes to apply`
        );
        toggle.dataset.inactive = String(!account.active);
        toggle.disabled = accountSaveBusy || !account.active;
        toggle.onclick = () => {
          if (accountSaveBusy) return;
          pendingHrHeadEmail =
            selectedHr === account.email ? '' : account.email;
          hrHeadChanged =
            pendingHrHeadEmail !==
            (result.accounts.hr.find((item) => item.is_hr_head)?.email || '');
          if (!hrHeadChanged) pendingHrHeadEmail = undefined;
          renderAccountManagement(result);
          updateAccountSaveButton();
        };
        toggleCell.appendChild(toggle);
        row.append(
          toggleCell,
          accountCell(account.active ? 'Active' : 'Inactive'),
          accountCell(formatAccountDate(account.created_at))
        );
      } else {
        row.append(
          accountCell(account.active ? 'Active' : 'Inactive'),
          accountCell(formatAccountDate(account.created_at))
        );
      }
      body.appendChild(row);
    });
  });
  updateAccountSaveButton();
}

VIEWS.accounts = guard(async () => {
  // Each visit starts from saved assignments, rather than a previous draft.
  pendingHeadAssignments.clear();
  pendingHrHeadEmail = undefined;
  hrHeadChanged = false;
  selectAccountTab(accountTab);
  updateAccountSaveButton();
  await loadAccountManagement();
  await window.IncidentAssignments?.load();
});
VIEWS['account-requests'] = guard(loadAccountRequests);
$('am_refresh').onclick = async () => {
  await guard(loadAccountRequests)();
};
$('am_save_changes').onclick = saveAccountChanges;
document.querySelectorAll('[data-lookup-list]').forEach((button) => {
  button.onclick = guard(async () => {
    if (accountSaveBusy || lookupSaveBusy) return;
    const input = $(button.dataset.lookupInput);
    const value = input.value.trim();
    if (!value) {
      showErr('Enter a name before selecting Add.');
      input.focus();
      return;
    }
    lookupSaveBusy = true;
    updateAccountSaveButton();
    try {
      const result = await api(
        'addEmployeeLookupValue',
        button.dataset.lookupList,
        value
      );
      input.value = '';
      window.dispatchEvent(new Event('employee-options-changed'));
      await loadAccountManagement();
      await window.IncidentAssignments?.load(true);
      AppFeedback.success(result.value + ' is available in dropdowns.');
    } finally {
      lookupSaveBusy = false;
      updateAccountSaveButton();
    }
  });
});
