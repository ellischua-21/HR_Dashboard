(function (root, factory) {
  const dates = factory();
  if (typeof module === 'object' && module.exports) module.exports = dates;
  if (root) root.DateUtils = dates;
})(typeof window === 'undefined' ? globalThis : window, function () {
  const DAY_MS = 86400000;
  const manilaFormatter = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  function isValidDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return false;
    const date = new Date(value + 'T00:00:00Z');
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }

  function manilaDate(date = new Date()) {
    const parts = Object.fromEntries(
      manilaFormatter
        .formatToParts(date)
        .map(({ type, value }) => [type, value])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  // The response period excludes its receipt day and skips Saturdays/Sundays.
  // Holidays are not part of the current HRIS calendar.
  function addWorkingDays(value, count) {
    const days = Number(count);
    if (
      !isValidDate(value) ||
      !Number.isSafeInteger(days) ||
      days < 0 ||
      days > 36500
    )
      return '';
    const date = new Date(value + 'T00:00:00Z');
    let remaining = days;
    while (remaining > 0) {
      date.setUTCDate(date.getUTCDate() + 1);
      if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) --remaining;
    }
    return date.toISOString().slice(0, 10);
  }

  function workingDaysBetween(from, through) {
    if (!isValidDate(from) || !isValidDate(through) || through <= from)
      return 0;
    const cursor = new Date(from + 'T00:00:00Z');
    const distance = Math.round(
      (new Date(through + 'T00:00:00Z') - cursor) / DAY_MS
    );
    let days = Math.floor(distance / 7) * 5;
    for (let index = 0; index < distance % 7; ++index) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) ++days;
    }
    return days;
  }

  return { isValidDate, manilaDate, addWorkingDays, workingDaysBetween };
});
