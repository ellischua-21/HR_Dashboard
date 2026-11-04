const accountCell = window.AppUI.tableCell;

const pendingHeadAssignments = new Map();
let pendingHrHeadEmail;
let hrHeadChanged = false;
let accountSaveBusy = false;

function hasAccountChanges() {
  return pendingHeadAssignments.size > 0 || hrHeadChanged;
}

function updateAccountSaveButton() {
  const button = $('am_save_changes');
  button.disabled = accountSaveBusy || !hasAccountChanges();
  button.textContent = 'Save Changes';
  document.querySelectorAll('.hr-head-toggle').forEach((toggle) => {
    toggle.disabled = accountSaveBusy || toggle.dataset.inactive === 'true';
  });
  document.querySelectorAll('.account-head-assignment').forEach((select) => {
    select.disabled = accountSaveBusy;
  });
}

function stagedHrHeadEmail(accounts) {
  return hrHeadChanged
    ? pendingHrHeadEmail
    : accounts.find((account) => account.is_hr_head)?.email || '';
}

async function saveAccountChanges() {
  if (accountSaveBusy || !hasAccountChanges()) return;
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
        ([email, headEmail]) => ({ email, headEmail })
      ),
      hrHeadChanged,
      hrHeadEmail: pendingHrHeadEmail || null
    });
    pendingHeadAssignments.clear();
    pendingHrHeadEmail = undefined;
    hrHeadChanged = false;
    await loadAccountManagement();
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
        request.assigned_head_name
          ? `${request.assigned_head_name}${request.assigned_head_email ? ` (${request.assigned_head_email})` : ''}`
          : request.assigned_head_email || '—'
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
            account.assigned_head_name ||
              account.assigned_head_email ||
              'Unassigned'
          )
        );
        const assignmentCell = document.createElement('td');
        const head = document.createElement('select');
        head.className = 'account-head-assignment';
        const reviewerRole = account.role === 'STAFF' ? 'Supervisor' : 'Head';
        head.setAttribute(
          'aria-label',
          `Assigned ${reviewerRole} for ${account.email}`
        );
        const none = document.createElement('option');
        none.value = '';
        none.textContent = `Select a ${reviewerRole}`;
        head.appendChild(none);
        (account.role === 'STAFF'
          ? result.availableSupervisors || []
          : result.availableHeads || []
        )
          .filter((optionAccount) => optionAccount.email !== account.email)
          .forEach((optionAccount) => {
            const option = document.createElement('option');
            option.value = optionAccount.email;
            option.textContent = `${optionAccount.full_name || optionAccount.email} (${optionAccount.email})`;
            head.appendChild(option);
          });
        head.value = pendingHeadAssignments.has(account.email)
          ? pendingHeadAssignments.get(account.email)
          : account.assigned_head_email || '';
        head.onchange = () => {
          if (accountSaveBusy) return;
          if (head.value === (account.assigned_head_email || ''))
            pendingHeadAssignments.delete(account.email);
          else pendingHeadAssignments.set(account.email, head.value);
          updateAccountSaveButton();
        };
        row.append(
          accountCell(account.active ? 'Active' : 'Inactive'),
          accountCell(formatAccountDate(account.created_at))
        );
        assignmentCell.append(head);
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
  updateAccountSaveButton();
  await loadAccountManagement();
});
VIEWS['account-requests'] = guard(loadAccountRequests);
$('am_refresh').onclick = async () => {
  await guard(loadAccountRequests)();
};
$('am_save_changes').onclick = saveAccountChanges;
