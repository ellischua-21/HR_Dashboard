(function () {
  let configured = false;
  let pending = false;
  const timeLogs = AttendanceUI.createTimeLogPopover($('attendance-time-logs'));
  const columns = [
    ['firstName', 'First Name'],
    ['lastName', 'Last Name'],
    ['employeeNo', 'ID'],
    ['department', 'Department'],
    ...AttendanceUI.timeFields,
    ['workHours', 'Work Hours'],
    ['dataSource', 'Data Source'],
    ['device', 'Device Name'],
    ['status', 'Status'],
    ['timeLogs', 'Time Logs']
  ];
  const timeColumns = new Set(AttendanceUI.timeFields.map(([key]) => key));
  const statusColors = {
    'on-time': 'is-normal',
    late: 'is-late',
    'early departure': 'is-early',
    'late and early departure': 'is-late-early',
    absent: 'is-absent'
  };

  const formatEmployeeName = AttendanceUI.formatEmployeeName;

  function setPending(value) {
    pending = value;
    $('attendance-load').disabled = value || !configured;
    $('attendance-refresh').disabled = value || !configured;
    $('attendance-date').disabled = value || !configured;
    $('attendance-previous-day').disabled = value || !configured;
    $('attendance-next-day').disabled = value || !configured;
  }

  function updateOptions(select, values) {
    const selected = select.value;
    select.replaceChildren(new Option('All', ''));
    values.forEach((value) => select.add(new Option(value, value)));
    if (values.includes(selected)) select.value = selected;
  }

  function updateAttendanceWeekday() {
    const input = $('attendance-date');
    const weekday = $('attendance-weekday');
    if (!input.value) {
      weekday.textContent = '';
      return;
    }
    weekday.textContent = AttendanceUI.weekday(input.value);
  }

  function drawTable(rows, emptyMessage) {
    timeLogs.close();
    const header = document.createElement('tr');
    columns.forEach(([, label]) => {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      header.appendChild(cell);
    });
    $('attendance-head').replaceChildren(header);
    const body = $('attendance-body');
    body.replaceChildren();
    if (!rows.length) {
      AppUI.emptyRow(
        body,
        columns.length,
        emptyMessage || 'No attendance records found.'
      );
      return;
    }
    rows.forEach((record) => {
      const row = document.createElement('tr');
      columns.forEach(([key]) => {
        if (key === 'timeLogs') {
          const cell = AppUI.tableCell('');
          cell.className = 'attendance-time-logs-cell';
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'attendance-time-logs-toggle';
          button.textContent = '▾';
          button.setAttribute('aria-controls', 'attendance-time-logs');
          button.setAttribute('aria-expanded', 'false');
          const employee = [
            formatEmployeeName(record.firstName),
            formatEmployeeName(record.lastName),
            record.employeeNo
          ]
            .filter(Boolean)
            .join(' ');
          button.setAttribute(
            'aria-label',
            `Show time logs for ${employee || 'employee'}`
          );
          button.addEventListener('click', () =>
            timeLogs.toggle(button, record)
          );
          cell.appendChild(button);
          row.appendChild(cell);
          return;
        }
        if (key === 'device') {
          const cell = AppUI.tableCell('');
          cell.classList.add('attendance-wrap-cell');
          const names = record.deviceNames?.length
            ? record.deviceNames
            : record.device
              ? [record.device]
              : [];
          if (!names.length) cell.textContent = '—';
          names.forEach((name) => {
            const item = document.createElement('div');
            item.textContent = name;
            cell.appendChild(item);
          });
          row.appendChild(cell);
          return;
        }
        let value = record[key];
        if (key === 'firstName' || key === 'lastName')
          value = formatEmployeeName(value);
        if (timeColumns.has(key)) value = DateUtils.formatTime(value);
        const cell = AppUI.tableCell(value || '—');
        if (['firstName', 'lastName', 'department'].includes(key))
          cell.classList.add('attendance-wrap-cell');
        row.appendChild(cell);
      });
      const statusCell =
        row.children[columns.findIndex(([key]) => key === 'status')];
      const status = String(record.status || '—');
      const normalizedStatus = status.toLowerCase();
      const statusBadge = document.createElement('span');
      statusBadge.className = 'attendance-status-badge';
      statusBadge.classList.add(statusColors[normalizedStatus] || 'is-neutral');
      statusBadge.textContent = status;
      statusBadge.title = status;
      statusCell.replaceChildren(statusBadge);
      if (record.overtime) {
        const overtimeBadge = document.createElement('span');
        overtimeBadge.className =
          'attendance-status-badge attendance-additional-status is-overtime';
        overtimeBadge.textContent = 'Overtime';
        statusCell.appendChild(overtimeBadge);
      }
      const breaks = record.breakStatuses || [];
      if (breaks.length) {
        const abnormal = breaks.some((entry) => entry.status === 'Abnormal');
        const badge = document.createElement('span');
        badge.className =
          'attendance-status-badge attendance-additional-status';
        badge.classList.add(abnormal ? 'is-abnormal-break' : 'is-normal-break');
        badge.textContent = abnormal ? 'Abnormal Break' : 'Normal Break';
        badge.title = breaks
          .map(
            (entry) => `${entry.period}: ${entry.status}. ${entry.reason || ''}`
          )
          .join('\n');
        badge.setAttribute(
          'aria-label',
          `${badge.textContent}. ${badge.title}`
        );
        statusCell.appendChild(badge);
      }
      timeColumns.forEach((key) => {
        const columnIndex = columns.findIndex(
          ([columnKey]) => columnKey === key
        );
        const cell = row.children[columnIndex];
        cell.classList.add('attendance-time-cell');
        if (!record[key]) {
          cell.classList.add('is-missing-scan');
          cell.title = 'No scan recorded';
          cell.setAttribute('aria-label', 'No scan recorded');
        }
      });
      body.appendChild(row);
    });
  }

  async function loadRecords(query, refresh = false) {
    if (pending || !configured) return;
    setPending(true);
    try {
      const result = await api('listAttendance', { ...query, refresh });
      updateOptions($('attendance-department'), result.departments || []);
      updateOptions($('attendance-status'), result.statuses || []);
      drawTable(result.rows);
      $('attendance-info').textContent =
        `${result.total} matching records | Retrieved ${AppUI.dateTime(result.fetchedAt)}`;
    } catch (error) {
      drawTable([], 'Attendance could not be loaded.');
      $('attendance-info').textContent = '';
      AppErrors.show(error.message || 'Could not load attendance.');
    } finally {
      setPending(false);
    }
  }

  function currentFilters() {
    return {
      dateFrom: $('attendance-date').value,
      dateTo: $('attendance-date').value,
      employee: $('attendance-employee').value.trim(),
      department: $('attendance-department').value,
      status: $('attendance-status').value
    };
  }

  $('attendance-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    loadRecords(currentFilters());
  });
  $('attendance-refresh').onclick = () => {
    if ($('attendance-filters').reportValidity()) {
      loadRecords(currentFilters(), true);
    }
  };
  $('attendance-date').onchange = () => {
    updateAttendanceWeekday();
    if ($('attendance-date').reportValidity()) loadRecords(currentFilters());
  };
  function changeDay(offset) {
    if (pending || !configured) return;
    const picker = $('attendance-date');
    if (!picker.reportValidity()) return;
    picker.value = AttendanceUI.shiftDate(picker.value, offset);
    updateAttendanceWeekday();
    loadRecords(currentFilters());
  }
  $('attendance-previous-day').onclick = () => changeDay(-1);
  $('attendance-next-day').onclick = () => changeDay(1);

  VIEWS.attendance = async () => {
    if (!['HR', 'ADMIN'].includes(session.role)) return;
    const today = DateUtils.manilaDate();
    if (!$('attendance-date').value) $('attendance-date').value = today;
    updateAttendanceWeekday();
    try {
      const context = await api('getAttendanceContext');
      configured = context.configured;
      if (!configured) {
        AppErrors.show(
          `Add ${context.missing.join(', ')} to .env and restart the Node.js server.`
        );
        setPending(false);
        return;
      }
      await loadRecords(currentFilters());
    } catch (error) {
      configured = false;
      AppErrors.show(
        error.message || 'Could not load attendance configuration.'
      );
      setPending(false);
    }
  };
})();
