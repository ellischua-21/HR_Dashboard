// Attendance presentation shared by the HR list and the employee dashboard.
(function () {
  const timeFields = [
    ['timeIn', 'Time In'],
    ['amBreakOut', 'AM Out'],
    ['amBreakIn', 'AM In'],
    ['lunchOut', 'Lunch Out'],
    ['lunchIn', 'Lunch In'],
    ['pmBreakOut', 'PM Out'],
    ['pmBreakIn', 'PM In'],
    ['timeOut', 'Time Out']
  ];
  const popovers = new Set();

  function formatEmployeeName(value) {
    return String(value || '').replace(/\p{L}[\p{L}\p{M}]*/gu, (word) => {
      if (
        word !== word.toLocaleUpperCase() &&
        word !== word.toLocaleLowerCase()
      )
        return word;
      return word
        .toLocaleLowerCase()
        .replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase());
    });
  }

  function weekday(date) {
    return date
      ? new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          timeZone: 'Asia/Manila'
        }).format(new Date(`${date}T12:00:00+08:00`))
      : '';
  }

  function shiftDate(date, offset) {
    return new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000)
      .toISOString()
      .slice(0, 10);
  }

  function createTimeLogPopover(panel) {
    // Keep viewport-positioned overlays outside component containment and scrolling panels.
    document.body.appendChild(panel);
    let openButton = null;
    function close(restoreFocus = false) {
      const button = openButton;
      if (button) button.setAttribute('aria-expanded', 'false');
      openButton = null;
      panel.hidden = true;
      if (restoreFocus && button) button.focus();
    }
    function toggle(button, record) {
      if (openButton === button) return close();
      popovers.forEach((popover) => popover.close());
      panel.replaceChildren();
      const header = el('div', undefined, 'attendance-time-log-header');
      for (const label of ['Time', 'Device Name', 'Device Serial No.'])
        header.appendChild(el('strong', label));
      panel.appendChild(header);
      const logs = record.timeLogs || [];
      if (!logs.length) panel.appendChild(el('p', 'No time logs available.'));
      for (const log of logs) {
        const item = el('div', undefined, 'attendance-time-log-item');
        const formatted = DateUtils.formatTime(log.time) || '—';
        const time = /^\d{2}$/.test(log.seconds || '')
          ? formatted.replace(/ (AM|PM)$/, `:${log.seconds} $1`)
          : formatted;
        item.append(
          el('span', time),
          el('span', log.device || '—'),
          el('span', log.deviceSerialNo || '—')
        );
        panel.appendChild(item);
      }
      panel.hidden = false;
      const anchor = button.getBoundingClientRect();
      const bounds = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8))}px`;
      const below = anchor.bottom + 4;
      panel.style.top = `${below + bounds.height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - bounds.height - 4)}px`;
      openButton = button;
      button.setAttribute('aria-expanded', 'true');
    }
    document.addEventListener('click', (event) => {
      if (
        openButton &&
        !openButton.contains(event.target) &&
        !panel.contains(event.target)
      )
        close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && openButton) close(true);
    });
    document.addEventListener(
      'scroll',
      (event) => {
        if (openButton && !panel.contains(event.target)) close();
      },
      true
    );
    window.addEventListener('resize', () => close());
    const popover = { toggle, close };
    popovers.add(popover);
    return popover;
  }

  window.AttendanceUI = {
    timeFields,
    formatEmployeeName,
    weekday,
    shiftDate,
    createTimeLogPopover,
    closeAll: () => popovers.forEach((popover) => popover.close())
  };
})();
