(function () {
  let configured = false;
  let pending = false;
  const columns = [
    ['firstName', 'First Name'],
    ['lastName', 'Last Name'],
    ['employeeNo', 'ID'],
    ['department', 'Department'],
    ['timeIn', 'Time In'],
    ['amBreakOut', 'AM Out'],
    ['amBreakIn', 'AM In'],
    ['lunchOut', 'Lunch Out'],
    ['lunchIn', 'Lunch In'],
    ['pmBreakOut', 'PM Out'],
    ['pmBreakIn', 'PM In'],
    ['timeOut', 'Time Out'],
    ['workHours', 'Work Hours'],
    ['dataSource', 'Data Source'],
    ['device', 'Device Name'],
    ['deviceSerialNo', 'Device Serial No.'],
    ['status', 'Status']
  ];
  const timeColumns = new Set([
    'timeIn', 'amBreakOut', 'amBreakIn', 'lunchOut', 'lunchIn',
    'pmBreakOut', 'pmBreakIn', 'timeOut'
  ]);

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
    const [year, month, day] = input.value.split('-').map(Number);
    weekday.textContent = new Intl.DateTimeFormat('en-US', {
      weekday: 'long'
    }).format(new Date(year, month - 1, day));
  }

  function drawTable(rows, emptyMessage) {
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
        let value = record[key];
        if (
          [
            'timeIn',
            'amBreakOut',
            'amBreakIn',
            'lunchOut',
            'lunchIn',
            'pmBreakOut',
            'pmBreakIn',
            'timeOut'
          ].includes(key)
        )
          value = DateUtils.formatTime(value);
        row.appendChild(AppUI.tableCell(value || '—'));
      });
      const statusCell = row.lastElementChild;
      const status = String(record.status || 'Not calculated');
      const normalizedStatus = status.toLowerCase();
      const statusBadge = document.createElement('span');
      statusBadge.className = 'attendance-status-badge';
      if (normalizedStatus === 'normal')
        statusBadge.classList.add('is-normal');
      else if (
        normalizedStatus.includes('late') ||
        normalizedStatus.includes('early')
      )
        statusBadge.classList.add('is-exception');
      else if (normalizedStatus === 'absent')
        statusBadge.classList.add('is-absent');
      else statusBadge.classList.add('is-neutral');
      statusBadge.textContent = status;
      statusCell.replaceChildren(statusBadge);
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
    picker.value = new Date(picker.valueAsNumber + offset * 86400000)
      .toISOString()
      .slice(0, 10);
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
