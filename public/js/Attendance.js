(function () {
  let configured = false;
  let activeQuery = null;
  let page = 1;
  let hasMore = false;
  let pending = false;
  const columns = [
    ['firstName', 'First Name'],
    ['lastName', 'Last Name'],
    ['employeeNo', 'ID'],
    ['department', 'Department'],
    ['date', 'Date'],
    ['time', 'Time'],
    ['timeIn', 'Time in'],
    ['timeOut', 'Time out'],
    ['workHours', 'Work hours'],
    ['weekday', 'Weekday'],
    ['dataSource', 'Data Source'],
    ['device', 'Device Name'],
    ['deviceSerialNo', 'Device Serial No.'],
    ['status', 'Status']
  ];

  function setPending(value) {
    pending = value;
    $('attendance-load').disabled = value || !configured;
    $('attendance-refresh').disabled = value || !configured;
    $('attendance-date').disabled = value || !configured;
    $('attendance-previous-day').disabled = value || !configured;
    $('attendance-next-day').disabled = value || !configured;
    $('attendance-prev').disabled = value || !activeQuery || page <= 1;
    $('attendance-next').disabled = value || !activeQuery || !hasMore;
  }

  function updateOptions(select, values) {
    const selected = select.value;
    select.replaceChildren(new Option('All', ''));
    values.forEach((value) => select.add(new Option(value, value)));
    if (values.includes(selected)) select.value = selected;
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
        if (key === 'date') value = DateUtils.formatDate(value);
        else if (['time', 'timeIn', 'timeOut'].includes(key))
          value = DateUtils.formatTime(value);
        row.appendChild(AppUI.tableCell(value || '—'));
      });
      body.appendChild(row);
    });
  }

  async function loadRecords(query, refresh = false) {
    if (pending || !configured) return;
    setPending(true);
    try {
      const result = await api('listAttendance', { ...query, refresh });
      activeQuery = { ...query };
      page = result.page;
      hasMore = result.hasMore;
      updateOptions($('attendance-department'), result.departments || []);
      updateOptions($('attendance-status'), result.statuses || []);
      drawTable(result.rows);
      $('attendance-info').textContent =
        `Page ${page} | ${result.total} matching records | Retrieved ${AppUI.dateTime(result.fetchedAt)}`;
    } catch (error) {
      activeQuery = null;
      hasMore = false;
      drawTable([], 'Attendance could not be loaded.');
      $('attendance-info').textContent = '';
      AppErrors.show(error.message || 'Could not load attendance.');
    } finally {
      setPending(false);
    }
  }

  function currentFilters(pageNumber = 1) {
    return {
      dateFrom: $('attendance-date').value,
      dateTo: $('attendance-date').value,
      employee: $('attendance-employee').value.trim(),
      department: $('attendance-department').value,
      status: $('attendance-status').value,
      page: pageNumber
    };
  }

  $('attendance-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    loadRecords(currentFilters());
  });
  $('attendance-prev').onclick = () =>
    activeQuery && loadRecords({ ...activeQuery, page: page - 1 });
  $('attendance-next').onclick = () =>
    activeQuery && loadRecords({ ...activeQuery, page: page + 1 });
  $('attendance-refresh').onclick = () => {
    if ($('attendance-filters').reportValidity()) {
      loadRecords(currentFilters(), true);
    }
  };
  $('attendance-date').onchange = () => {
    if ($('attendance-date').reportValidity()) loadRecords(currentFilters());
  };
  function changeDay(offset) {
    if (pending || !configured) return;
    const picker = $('attendance-date');
    if (!picker.reportValidity()) return;
    picker.value = new Date(picker.valueAsNumber + offset * 86400000)
      .toISOString()
      .slice(0, 10);
    loadRecords(currentFilters());
  }
  $('attendance-previous-day').onclick = () => changeDay(-1);
  $('attendance-next-day').onclick = () => changeDay(1);

  VIEWS.attendance = async () => {
    if (!['HR', 'ADMIN'].includes(session.role)) return;
    const today = DateUtils.manilaDate();
    if (!$('attendance-date').value) $('attendance-date').value = today;
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
