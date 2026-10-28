const accountCell = (value) => {
  const cell = document.createElement('td');
  cell.textContent = value === null || value === undefined ? '' : String(value);
  return cell;
};

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
  if (!accountSaveBusy && button.dataset.saved !== 'true')
    button.textContent = 'Save Changes';
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
  button.dataset.saved = 'false';
  button.innerHTML =
    '<span class="refresh-spinner" aria-hidden="true"></span> Saving changes…';
  button.disabled = true;
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
    button.dataset.saved = 'true';
    button.textContent = 'Saved successfully.';
    window.setTimeout(() => {
      button.dataset.saved = 'false';
      updateAccountSaveButton();
    }, 1800);
  } catch (error) {
    showErr(error.message || String(error));
  } finally {
    accountSaveBusy = false;
    updateAccountSaveButton();
  }
}

function appendEmptyRow(body, columns, message) {
  const row = document.createElement('tr');
  const cell = accountCell(message);
  cell.colSpan = columns;
  row.appendChild(cell);
  body.appendChild(row);
}

function formatAccountDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

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
      if (!(await window.appConfirm(`Approve ${request.email} as ${request.assigned_role}?`, {
        title: 'Approve account request', confirmText: 'Approve'
      })))
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
        !(await window.appConfirm(`Reject and remove the account request from ${request.email}?`, {
          title: 'Reject account request', confirmText: 'Reject', danger: true
        }))
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

  const headOptions = result.availableHeads || [];
  [
    ['users', 'am_users', true],
    ['heads', 'am_heads', true],
    ['hr', 'am_hr', 'hr'],
    ['admins', 'am_admins', false]
  ].forEach(([group, id, canAssignHead]) => {
    const body = $(id);
    body.replaceChildren();
    const accounts = result.accounts[group];
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
        head.setAttribute('aria-label', `Assigned Head for ${account.email}`);
        const none = document.createElement('option');
        none.value = '';
        none.textContent =
          account.role === 'HEAD'
            ? 'No assigned Head (optional)'
            : 'Select a Head';
        head.appendChild(none);
        headOptions
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
          `${selected ? 'Remove' : 'Designate'} ${account.full_name || account.email} as Head HR`
        );
        toggle.disabled = !account.active;
        toggle.onclick = () => {
          pendingHrHeadEmail = selected ? '' : account.email;
          hrHeadChanged =
            pendingHrHeadEmail !==
            (result.accounts.hr.find((item) => item.is_hr_head)?.email || '');
          if (!hrHeadChanged) pendingHrHeadEmail = undefined;
          loadAccountManagement().catch((error) =>
            showErr(error.message || String(error))
          );
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

VIEWS.accounts = guard(loadAccountManagement);
VIEWS['account-requests'] = guard(loadAccountRequests);
$('am_refresh').onclick = async () => {
  await guard(loadAccountRequests)();
};
$('am_save_changes').onclick = saveAccountChanges;
