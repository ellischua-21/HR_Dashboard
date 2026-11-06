(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.WorkTime = value;
})(typeof window === 'undefined' ? globalThis : window, function () {
  const DAY = 86400000;
  const OFFSET = 8 * 3600000;
  // Manila, Monday–Friday, 8:00 AM–6:30 PM. No lunch deduction is assumed.
  function milliseconds(from, to) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
    const first = Math.floor((from + OFFSET) / DAY);
    const last = Math.floor((to + OFFSET) / DAY);
    function contribution(day) {
      const weekday = new Date(day * DAY).getUTCDay();
      if (weekday === 0 || weekday === 6) return 0;
      const base = day * DAY - OFFSET;
      return Math.max(
        0,
        Math.min(to, base + 18.5 * 3600000) - Math.max(from, base + 8 * 3600000)
      );
    }
    if (first === last) return contribution(first);
    // Only interior days can be counted as complete weeks.
    const weeks = Math.floor((last - first - 1) / 7);
    let total =
      contribution(first) + contribution(last) + weeks * 5 * 10.5 * 3600000;
    for (let day = first + 1 + weeks * 7; day < last; day++)
      total += contribution(day);
    return total;
  }
  function format(value) {
    const seconds = Math.max(0, Math.floor(Number(value || 0) / 1000));
    return [
      Math.floor(seconds / 3600),
      Math.floor(seconds / 60) % 60,
      seconds % 60
    ]
      .map((part) => String(part).padStart(2, '0'))
      .join(':');
  }
  return { milliseconds, format };
});
