(function () {
  const profileSummary = $('employee-profile-summary');
  const jobDetails = $('employee-job-details');
  const expanded = $('employee-profile-expanded');
  const date = $('employee-attendance-date');
  const filter = $('employee-attendance-filters');
  const logButton = $('employee-time-logs-toggle');
  const logs = AttendanceUI.createTimeLogPopover($('employee-time-logs'));
  let profile = null;
  let profileRendered = false;
  let currentRecord = null;
  let profileRequest = 0;
  let attendanceRequest = 0;

  function renderFields(target, fields) {
    target.replaceChildren();
    for (const [label, value] of fields) {
      const row = el('div');
      row.append(
        el('dt', label),
        el('dd', value === '' || value == null ? '—' : String(value))
      );
      target.appendChild(row);
    }
  }

  function renderTimes(times = {}) {
    renderFields(
      $('employee-daily-times'),
      AttendanceUI.timeFields.map(([key, label]) => [
        label,
        DateUtils.formatTime(times[key]) || '—'
      ])
    );
    Array.from($('employee-daily-times').children).forEach((row, index) => {
      const [key] = AttendanceUI.timeFields[index];
      row.querySelector('dd').classList.toggle('is-empty', !times[key]);
    });
  }

  async function loadProfile() {
    const ticket = ++profileRequest;
    const owner = session.email;
    profile = null;
    profileRendered = false;
    expanded.open = false;
    $('employee-profile-details').replaceChildren();
    profileSummary.replaceChildren();
    jobDetails.replaceChildren();
    $('employee-greeting').textContent = '';
    $('employee-avatar').textContent = '';
    try {
      const result = await api('getMyEmployeeProfile');
      if (ticket !== profileRequest || owner !== session?.email) return;
      profile = result;
      const employee = result.employee;
      const firstName = AttendanceUI.formatEmployeeName(employee.first_name);
      $('employee-avatar').textContent = [
        employee.first_name,
        employee.last_name
      ]
        .map((name) =>
          String(name || '')
            .trim()
            .charAt(0)
            .toLocaleUpperCase()
        )
        .join('');
      $('employee-greeting').textContent = firstName
        ? `Hello, ${firstName}!`
        : 'Hello!';
      renderFields(profileSummary, [
        ['Name', employee.name],
        ['Employee Number', employee.emp_no],
        ['Personal Email', employee.personal_email],
        ['Mobile Number', employee.contact_no],
        ['Birthday', DateUtils.formatDate(employee.birthday)],
        ['Employment Status', employee.status]
      ]);
      renderFields(jobDetails, [
        ['Job Title', employee.position],
        ['Department', employee.department],
        ['Direct Manager', result.directManager],
        ['Work Location', employee.location],
        ['Start Date', DateUtils.formatDate(employee.date_employed)]
      ]);
      renderFullProfile();
    } catch (error) {
      if (
        ticket === profileRequest &&
        owner === session?.email &&
        !$('view-employee-dashboard').hidden
      )
        AppErrors.show(error.message);
    }
  }

  function renderFullProfile() {
    expanded.querySelector('summary').textContent = expanded.open
      ? 'Hide Full Profile'
      : 'View Full Profile';
    if (!expanded.open || !profile || profileRendered) return;
    const fields = profile.fields;
    renderEmployeeDetails(
      $('employee-profile-details'),
      {
        columns: fields.map((field) => field.label),
        columnKeys: fields.map((field) => field.key),
        columnTypes: fields.map((field) => field.type)
      },
      fields.map((field) => profile.employee[field.key])
    );
    profileRendered = true;
  }
  expanded.addEventListener('toggle', renderFullProfile);

  function setPending(pending) {
    date.disabled = pending;
    $('employee-previous-day').disabled = pending;
    $('employee-next-day').disabled = pending;
    $('employee-attendance-refresh').disabled = pending;
    logButton.disabled = pending;
    $('employee-daily-times').setAttribute('aria-busy', String(pending));
  }

  async function loadAttendance(refresh = false) {
    if (!date.reportValidity()) return;
    const ticket = ++attendanceRequest;
    const owner = session.email;
    const selectedDate = date.value;
    logs.close();
    currentRecord = null;
    renderTimes();
    $('employee-attendance-weekday').textContent =
      AttendanceUI.weekday(selectedDate);
    setPending(true);
    try {
      const record = await api('getMyDailyAttendance', {
        date: selectedDate,
        refresh
      });
      if (ticket !== attendanceRequest || owner !== session?.email) return;
      currentRecord = record;
      renderTimes(record.times);
    } catch (error) {
      if (
        ticket === attendanceRequest &&
        owner === session?.email &&
        !$('view-employee-dashboard').hidden
      )
        AppErrors.show(error.message);
    } finally {
      if (ticket === attendanceRequest) setPending(false);
    }
  }

  logButton.onclick = () => logs.toggle(logButton, currentRecord || {});
  filter.onsubmit = (event) => {
    event.preventDefault();
    loadAttendance(true);
  };
  date.onchange = () => loadAttendance();
  const changeDay = (offset) => {
    if (date.disabled || !date.reportValidity()) return;
    date.value = AttendanceUI.shiftDate(date.value, offset);
    loadAttendance();
  };
  $('employee-previous-day').onclick = () => changeDay(-1);
  $('employee-next-day').onclick = () => changeDay(1);

  VIEWS['employee-dashboard'] = guard(async () => {
    if (!can('employee.self')) return;
    // A fresh page entry opens today's records; day controls stay within this page.
    date.value = DateUtils.manilaDate();
    await Promise.all([loadProfile(), loadAttendance()]);
  });
})();
