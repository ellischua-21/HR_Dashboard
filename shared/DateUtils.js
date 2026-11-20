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

  function ageOnDate(birthday, asOf = manilaDate()) {
    if (!isValidDate(birthday) || !isValidDate(asOf) || birthday > asOf)
      return '';
    const [birthYear, birthMonth, birthDay] = birthday.split('-').map(Number);
    const [year, month, day] = asOf.split('-').map(Number);
    const birthdayPending =
      month < birthMonth || (month === birthMonth && day < birthDay);
    return year - birthYear - Number(birthdayPending);
  }

  function tenureYearsOnDate(employed, asOf = manilaDate()) {
    if (!isValidDate(employed) || !isValidDate(asOf)) return '';
    return (
      Math.round(
        ((Date.parse(asOf) - Date.parse(employed)) / (365.25 * DAY_MS)) * 10
      ) / 10
    );
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

  const displayDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const displayTimeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  function displayTimestamp(value) {
    if (value instanceof Date) return value;
    const raw = String(value).trim();
    // Database datetime values and datetime-local inputs represent Manila wall time.
    const local =
      /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw);
    return new Date(local ? raw.replace(' ', 'T') + '+08:00' : raw);
  }

  function formatDate(value, empty = '') {
    if (value == null || value === '') return empty;
    const raw = String(value).trim();
    const displayCalendarDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    if (displayCalendarDate) {
      const [, month, day, year] = displayCalendarDate;
      return isValidDate(`${year}-${month}-${day}`)
        ? `${month}/${day}/${year}`
        : raw;
    }
    const calendarDate = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(raw);
    if (calendarDate) {
      const [, year, month, day] = calendarDate;
      return isValidDate(`${year}-${month}-${day}`)
        ? `${month}/${day}/${year}`
        : raw;
    }
    const date = displayTimestamp(value);
    return Number.isNaN(date.getTime())
      ? raw
      : displayDateFormatter.format(date);
  }

  function formatTime(value, empty = '') {
    if (value == null || value === '') return empty;
    const raw = String(value).trim();
    const clock = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(AM|PM)?$/i.exec(
      raw
    );
    if (clock) {
      const hour = Number(clock[1]);
      const minute = Number(clock[2]);
      const period = clock[3]?.toUpperCase();
      if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23))
        return raw;
      return `${hour % 12 || 12}:${clock[2]} ${period || (hour >= 12 ? 'PM' : 'AM')}`;
    }
    const date = displayTimestamp(value);
    return Number.isNaN(date.getTime())
      ? raw
      : displayTimeFormatter.format(date);
  }

  function formatDateTime(value, empty = '') {
    if (value == null || value === '') return empty;
    if (
      /^(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{2}\/\d{2}\/\d{4})$/.test(
        String(value).trim()
      )
    )
      return formatDate(value, empty);
    const date = displayTimestamp(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : `${formatDate(date)} ${formatTime(date)}`;
  }

  function formatField(value, type) {
    if (type === 'date') return formatDate(value);
    if (type === 'time') return formatTime(value);
    if (type === 'datetime-local') return formatDateTime(value);
    return value;
  }

  function formatMonth(value) {
    const month = /^(\d{4})-(\d{2})$/.exec(String(value));
    return month ? `${month[2]}/${month[1]}` : value;
  }

  // Convert explicitly formatted entry text back to native input/API values.
  function parseInput(value, type) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (type === 'date') {
      if (isValidDate(raw)) return raw;
      const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
      if (!parts) return '';
      const iso = `${parts[3]}-${parts[1]}-${parts[2]}`;
      return isValidDate(iso) ? iso : '';
    }
    if (type === 'time') {
      const parts = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(raw);
      if (!parts) return '';
      let hour = Number(parts[1]);
      if (
        Number(parts[2]) > 59 ||
        (parts[3] ? hour < 1 || hour > 12 : hour > 23)
      )
        return '';
      if (parts[3])
        hour = (hour % 12) + (parts[3].toUpperCase() === 'PM' ? 12 : 0);
      return `${String(hour).padStart(2, '0')}:${parts[2]}`;
    }
    if (type === 'datetime-local') {
      const parts = /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})[ T](.+)$/.exec(
        raw
      );
      if (!parts) return '';
      const date = parseInput(parts[1], 'date');
      const time = parseInput(parts[2], 'time');
      return date && time ? `${date}T${time}` : '';
    }
    return raw;
  }

  return {
    isValidDate,
    manilaDate,
    ageOnDate,
    tenureYearsOnDate,
    addWorkingDays,
    workingDaysBetween,
    formatDate,
    formatTime,
    formatDateTime,
    formatField,
    formatMonth,
    parseInput
  };
});
