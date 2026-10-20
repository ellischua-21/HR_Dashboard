(function (root, factory) {
  const templates = factory();
  if (typeof module === 'object' && module.exports) module.exports = templates;
  if (root) root.FORM_TEMPLATES = templates;
})(typeof window === 'undefined' ? globalThis : window, function () {
  return [
    {
      key: 'leave-2026',
      title: 'Leave Application',
      source: 'Leave Form_2026.xlsx',
      prefix: 'LEAVE',
      sequenceWidth: 6,
      description: 'Request leave by selecting a leave type, dates, duration, reason, and pay option.',
      fields: []
    },
    {
      key: 'authority-to-deduct',
      title: 'Authority to Deduct',
      source: 'AUTHORITY TO DEDUCT.pdf',
      prefix: 'ATD',
      sequenceWidth: 6,
      description: 'Authorize an account deduction by listing its particulars and amount.',
      fields: [
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'particulars', label: 'Particulars', type: 'textarea', required: true, maxLength: 500 },
        { name: 'amount', label: 'Amount', type: 'number', required: true, min: 0.01, max: 10000000, step: 0.01 }
      ]
    },
    {
      key: 'nexus-no-in-out',
      title: 'Time-In/Out Correction Request',
      source: 'NEXUS NO IN & OUT FORM 2025.docx',
      prefix: 'NIO',
      sequenceWidth: 6,
      description: 'Report a missed time-in or time-out with the reason and recorded time details.',
      fields: [
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'department', label: 'Department', type: 'text', required: true, maxLength: 191 },
        { name: 'employeeNo', label: 'Employee number', type: 'text', required: true, maxLength: 191 },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, maxLength: 500 },
        { name: 'inStart', label: 'Time in / start', type: 'time' },
        { name: 'amBreakOut', label: 'AM break out', type: 'time' },
        { name: 'amBreakIn', label: 'AM break in', type: 'time' },
        { name: 'lunchBreakOut', label: 'Lunch break out', type: 'time' },
        { name: 'lunchBreakIn', label: 'Lunch break in', type: 'time' },
        { name: 'pmBreakOut', label: 'PM break out', type: 'time' },
        { name: 'pmBreakIn', label: 'PM break in', type: 'time' },
        { name: 'outEnd', label: 'Time out / end', type: 'time' },
        { name: 'witnessName', label: 'Witness name', type: 'text', maxLength: 191 }
      ]
    },
    {
      key: 'official-business-trip',
      title: 'Official Business / Travel Request',
      source: 'Official Business Trip Form.pdf',
      prefix: 'TRV',
      sequenceWidth: 6,
      description: 'Request an official trip with its destination, purpose, and travel schedule.',
      fields: [
        { name: 'department', label: 'Department', type: 'text', required: true, maxLength: 191 },
        { name: 'position', label: 'Position', type: 'text', required: true, maxLength: 191 },
        { name: 'destination', label: 'Destination', type: 'text', required: true, maxLength: 191 },
        { name: 'purpose', label: 'Purpose', type: 'textarea', required: true, maxLength: 500 },
        { name: 'departure', label: 'Date/time of departure', type: 'datetime-local', required: true },
        { name: 'return', label: 'Date/time of return', type: 'datetime-local', required: true }
      ]
    },
    {
      key: 'ot-slip',
      title: 'Overtime Request',
      source: 'OT SLIP_1.pdf',
      prefix: 'OT',
      sequenceWidth: 6,
      description: 'Request overtime by entering your regular shift, authorized hours, and reason.',
      fields: [
        { name: 'department', label: 'Department', type: 'text', required: true, maxLength: 191 },
        { name: 'regularShiftTime', label: 'Regular shift time', type: 'text', required: true, maxLength: 100 },
        { name: 'overtimeDate', label: 'Date of authorized overtime', type: 'date', required: true },
        { name: 'timeFrom', label: 'Authorized time from', type: 'time', required: true },
        { name: 'timeTo', label: 'Authorized time to', type: 'time', required: true },
        { name: 'overtimeHours', label: 'Overtime hours', type: 'number', required: true, min: 0.25, max: 24, step: 0.25 },
        { name: 'reason', label: 'Reason for request', type: 'textarea', required: true, maxLength: 500 }
      ]
    },
    {
      key: 'time-in-out',
      title: 'Time In/Out Record',
      source: 'TIME IN AND OUT FORM.pdf',
      prefix: 'TIO',
      sequenceWidth: 6,
      description: 'Submit a daily time-in/out record, including break times when applicable.',
      fields: [
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'inStart', label: 'Time in / start', type: 'time' },
        { name: 'amBreakOut', label: 'AM break out', type: 'time' },
        { name: 'amBreakIn', label: 'AM break in', type: 'time' },
        { name: 'lunchBreakOut', label: 'Lunch break out', type: 'time' },
        { name: 'lunchBreakIn', label: 'Lunch break in', type: 'time' },
        { name: 'pmBreakOut', label: 'PM break out', type: 'time' },
        { name: 'pmBreakIn', label: 'PM break in', type: 'time' },
        { name: 'outEnd', label: 'Time out / end', type: 'time' }
      ]
    }
  ];
});
