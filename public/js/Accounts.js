const accountCell = value => {
  const cell = document.createElement('td');
  cell.textContent = value === null || value === undefined ? '' : String(value);
  return cell;
};

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

async function loadAccountManagement() {
  const result = await api('getAccountManagement');
  const requests = $('am_requests');
  requests.replaceChildren();

  if (!result.requests.length) {
    appendEmptyRow(requests, 6, 'No pending account requests.');
  }
  result.requests.forEach(request => {
    const row = document.createElement('tr');
    row.append(
      accountCell(request.full_name),
      accountCell(request.email),
      accountCell(request.assigned_role),
      accountCell(request.assigned_head_name
        ? `${request.assigned_head_name}${request.assigned_head_email ? ` (${request.assigned_head_email})` : ''}`
        : request.assigned_head_email || '—'),
      accountCell(formatAccountDate(request.requested_at)));

    const actions = document.createElement('td');
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.textContent = 'Approve';
    approve.onclick = async () => {
      if (!confirm(`Approve ${request.email} as ${request.assigned_role}?`)) return;
      approve.disabled = true;
      try {
        await api('approveAccountRequest', request.id);
        await loadAccountManagement();
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
      if (!confirm(`Reject and remove the account request from ${request.email}?`)) return;
      reject.disabled = true;
      try {
        await api('rejectAccountRequest', request.id);
        await loadAccountManagement();
      } catch (error) {
        showErr(error.message || String(error));
        reject.disabled = false;
      }
    };
    actions.append(approve, reject);
    row.appendChild(actions);
    requests.appendChild(row);
  });

  const headOptions = result.availableHeads || [];
  [
    ['users', 'am_users', true],
    ['heads', 'am_heads', true],
    ['hr', 'am_hr', false],
    ['admins', 'am_admins', false]
  ].forEach(([group, id, canAssignHead]) => {
    const body = $(id);
    body.replaceChildren();
    const accounts = result.accounts[group];
    if (!accounts.length) {
      appendEmptyRow(body, canAssignHead ? 7 : 5, 'No accounts in this list.');
      return;
    }
    accounts.forEach(account => {
      const row = document.createElement('tr');
      row.append(accountCell(account.full_name || ''), accountCell(account.email), accountCell(account.role));
      if (canAssignHead) {
        row.appendChild(accountCell(account.assigned_head_name || account.assigned_head_email || 'Unassigned'));
        const assignmentCell = document.createElement('td');
        const head = document.createElement('select');
        head.setAttribute('aria-label', `Assigned Head for ${account.email}`);
        const none = document.createElement('option');
        none.value = '';
        none.textContent = account.role === 'HEAD' ? 'No assigned Head (optional)' : 'Select a Head';
        head.appendChild(none);
        headOptions.filter(optionAccount => optionAccount.email !== account.email).forEach(optionAccount => {
          const option = document.createElement('option');
          option.value = optionAccount.email;
          option.textContent = `${optionAccount.full_name || optionAccount.email} (${optionAccount.email})`;
          head.appendChild(option);
        });
        head.value = account.assigned_head_email || '';
        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = 'Save';
        save.onclick = async () => {
          save.disabled = true;
          try {
            await api('assignAccountHead', account.email, head.value);
            await loadAccountManagement();
          } catch (error) {
            showErr(error.message || String(error));
            save.disabled = false;
          }
        };
        row.append(accountCell(account.active ? 'Active' : 'Inactive'), accountCell(formatAccountDate(account.created_at)));
        assignmentCell.append(head, save);
        row.appendChild(assignmentCell);
      } else {
        row.append(accountCell(account.active ? 'Active' : 'Inactive'), accountCell(formatAccountDate(account.created_at)));
      }
      body.appendChild(row);
    });
  });
}

VIEWS.accounts = guard(loadAccountManagement);
$('am_refresh').onclick = guard(loadAccountManagement);
