// Company attendance rules use Manila local time. Scanner status codes are ignored.
const ATTENDANCE_RULES = Object.freeze({
  lateFrom: 8 * 60 + 11,
  regularOut: 18 * 60 + 30,
  overtimeFrom: 19 * 60 + 1,
  morningBreak: 10 * 60,
  afternoonBreak: 15 * 60,
  breakStartGrace: 3,
  maximumBreakMinutes: 15,
  lunchStartEarliest: 11 * 60 + 55,
  lunchStartLatest: 12 * 60 + 10,
  lunchMinutes: 60
});

function minutesOfDay(value) {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function attendanceStatus(timeIn, timeOut) {
  const arrival = minutesOfDay(timeIn);
  const departure = minutesOfDay(timeOut);
  if (arrival === null) return 'Absent';
  const late = arrival >= ATTENDANCE_RULES.lateFrom;
  const early =
    departure !== null &&
    departure > arrival &&
    departure < ATTENDANCE_RULES.regularOut;
  if (late && early) return 'Late and early departure';
  if (late) return 'Late';
  if (early) return 'Early departure';
  return 'On-time';
}

function isOvertime(timeIn, timeOut) {
  const arrival = minutesOfDay(timeIn);
  const departure = minutesOfDay(timeOut);
  return (
    arrival !== null &&
    departure !== null &&
    departure > arrival &&
    departure >= ATTENDANCE_RULES.overtimeFrom
  );
}

function breakStatus(gap, period) {
  if (!gap) return null;
  const start =
    minutesOfDay(gap.start.time) + (gap.start.sortTime % 60000) / 60000;
  if (period === 'Lunch') {
    const outsideWindow =
      start < ATTENDANCE_RULES.lunchStartEarliest ||
      start > ATTENDANCE_RULES.lunchStartLatest;
    const tooLong = gap.duration > ATTENDANCE_RULES.lunchMinutes;
    const reasons = [];
    if (outsideWindow)
      reasons.push('Lunch out is outside the allowed start window.');
    if (tooLong) reasons.push('Lunch exceeds 1 hour.');
    return {
      period,
      status: outsideWindow || tooLong ? 'Abnormal' : 'Normal',
      reason:
        reasons.join(' ') ||
        'Lunch started within the allowed window and lasted no more than 1 hour.'
    };
  }
  const expected =
    period === 'AM'
      ? ATTENDANCE_RULES.morningBreak
      : ATTENDANCE_RULES.afternoonBreak;
  const outsideWindow =
    Math.abs(start - expected) > ATTENDANCE_RULES.breakStartGrace;
  const tooLong = gap.duration > ATTENDANCE_RULES.maximumBreakMinutes;
  const reasons = [];
  if (outsideWindow)
    reasons.push('Break out is outside the allowed start window.');
  if (tooLong) reasons.push('Break exceeds 15 minutes.');
  return {
    period,
    status: outsideWindow || tooLong ? 'Abnormal' : 'Normal',
    reason:
      reasons.join(' ') ||
      'Break starts within the grace period and lasts no more than 15 minutes.'
  };
}

module.exports = {
  ATTENDANCE_RULES,
  minutesOfDay,
  attendanceStatus,
  isOvertime,
  breakStatus
};
