(function (root, factory) {
  const templates = factory();
  if (typeof module === 'object' && module.exports) module.exports = templates;
  if (root) root.FORM_TEMPLATES = templates;
})(typeof window === 'undefined' ? globalThis : window, function () {
  const timeRecordColumns = [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'inStart', label: 'Time in', type: 'time' },
    { name: 'amBreakOut', label: 'AM break out', type: 'time' },
    { name: 'amBreakIn', label: 'AM break in', type: 'time' },
    { name: 'lunchBreakOut', label: 'Lunch break out', type: 'time' },
    { name: 'lunchBreakIn', label: 'Lunch break in', type: 'time' },
    { name: 'pmBreakOut', label: 'PM break out', type: 'time' },
    { name: 'pmBreakIn', label: 'PM break in', type: 'time' },
    { name: 'outEnd', label: 'Time out', type: 'time' }
  ];
  const legacyTimeRecordFields = timeRecordColumns.map((column) => ({
    ...column,
    legacyTimeRecordColumn: true
  }));
  return [
    {
      key: 'leave-2026',
      title: 'Leave Application',
      source: 'Leave Form_2026.xlsx',
      prefix: 'LEAVE',
      sequenceWidth: 6,
      description:
        'Request leave by selecting a leave type, dates, duration, reason, and pay option.',
      fields: []
    },
    {
      key: 'authority-to-deduct',
      title: 'Authority to Deduct',
      source: 'AUTHORITY TO DEDUCT.pdf',
      prefix: 'ATD',
      sequenceWidth: 6,
      description:
        'Authorize an account deduction by listing its particulars and amount.',
      fields: [
        {
          name: 'name',
          label: 'Employee name',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'employeeNo',
          label: 'Employee number',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'department',
          label: 'Department',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'date',
          label: 'Date',
          type: 'date',
          required: true,
          defaultToday: true
        },
        {
          name: 'particulars',
          label: 'Particulars',
          type: 'textarea',
          required: true,
          maxLength: 500
        },
        {
          name: 'amount',
          label: 'Amount',
          type: 'number',
          required: true,
          min: 0.01,
          max: 10000000,
          step: 0.01
        },
        {
          name: 'employeeAcknowledgment',
          label:
            'This is to acknowledge and authorize Accounting to deduct the amount stated above from my account.',
          type: 'checkbox',
          required: true,
          afterConfirmation: true
        }
      ],
      hrSignatureRequired: false
    },
    {
      key: 'nexus-no-in-out',
      title: 'Time-In/Out Correction Request',
      source: 'NEXUS NO IN & OUT FORM 2025.docx',
      prefix: 'NIO',
      sequenceWidth: 6,
      description:
        'Report a missed time-in or time-out with the reason and recorded time details.',
      fields: [
        {
          name: 'name',
          label: 'Employee name',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'department',
          label: 'Department',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'employeeNo',
          label: 'Employee number',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'reason',
          label: 'Reason',
          type: 'textarea',
          required: true,
          maxLength: 500
        },
        ...legacyTimeRecordFields,
        {
          name: 'witnessName',
          label: 'Witness name',
          type: 'text',
          maxLength: 191
        },
        {
          name: 'timeRecords',
          label: 'Daily time records',
          type: 'time-records',
          columns: timeRecordColumns
        }
      ]
    },
    {
      key: 'official-business-trip',
      title: 'Official Business / Travel Request',
      source: 'Official Business Trip Form.pdf',
      prefix: 'TRV',
      sequenceWidth: 6,
      description:
        'Request an official trip with its destination, purpose, and travel schedule.',
      fields: [
        {
          name: 'name',
          label: 'Employee name',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'employeeNo',
          label: 'Employee number',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'department',
          label: 'Department',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'position',
          label: 'Position',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'destination',
          label: 'Destination',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'purpose',
          label: 'Purpose',
          type: 'textarea',
          required: true,
          maxLength: 500
        },
        {
          name: 'departure',
          label: 'Date/time of departure',
          type: 'datetime-local',
          required: true
        },
        {
          name: 'return',
          label: 'Date/time of return',
          type: 'datetime-local',
          required: true
        }
      ],
      hrSignatureRequired: false
    },
    {
      key: 'ot-slip',
      title: 'Overtime Request',
      source: 'OT SLIP_1.pdf',
      prefix: 'OT',
      sequenceWidth: 6,
      description:
        'Request overtime by entering your regular shift, authorized hours, and reason.',
      fields: [
        {
          name: 'name',
          label: 'Employee name',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'employeeNo',
          label: 'Employee number',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'department',
          label: 'Department',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'regularShiftTime',
          label: 'Regular shift time',
          type: 'text',
          required: true,
          maxLength: 100
        },
        {
          name: 'overtimeDate',
          label: 'Date of authorized overtime',
          type: 'date',
          required: true
        },
        {
          name: 'timeFrom',
          label: 'Authorized time from',
          type: 'time',
          required: true
        },
        {
          name: 'timeTo',
          label: 'Authorized time to',
          type: 'time',
          required: true
        },
        {
          name: 'overtimeHours',
          label: 'Overtime hours',
          type: 'number',
          required: true,
          min: 0.25,
          max: 24,
          step: 0.25
        },
        {
          name: 'reason',
          label: 'Reason for request',
          type: 'textarea',
          required: true,
          maxLength: 500
        }
      ]
    },
    {
      key: 'time-in-out',
      title: 'Time In/Out Record',
      source: 'TIME IN AND OUT FORM.pdf',
      prefix: 'TIO',
      sequenceWidth: 6,
      description:
        'Submit a daily time-in/out record, including break times when applicable.',
      fields: [
        {
          name: 'name',
          label: 'Employee name',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'employeeNo',
          label: 'Employee number',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'department',
          label: 'Department',
          type: 'text',
          required: true,
          maxLength: 191
        },
        ...legacyTimeRecordFields,
        {
          name: 'timeRecords',
          label: 'Daily time records',
          type: 'time-records',
          columns: timeRecordColumns
        }
      ],
      hrSignatureRequired: false
    },
    {
      key: 'nexus-accountability',
      title: 'Company Property Accountability',
      source: 'NEXUS_accountability.pdf',
      prefix: 'NAC',
      sequenceWidth: 6,
      description:
        'Record company property entrusted to you, including quantities, tag numbers, and return details.',
      fields: [
        {
          name: 'name',
          label: 'Employee name',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'department',
          label: 'Department',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'date',
          label: 'Date',
          type: 'date',
          required: true,
          defaultToday: true
        },
        {
          name: 'propertyRecords',
          label: 'Company property',
          type: 'time-records',
          showRowNumber: true,
          columns: [
            {
              name: 'particulars',
              label: 'Particulars / Property Description',
              type: 'text',
              required: true
            },
            {
              name: 'quantity',
              label: 'Qty',
              type: 'number',
              min: 1,
              max: 1000000,
              step: 1,
              required: true
            },
            { name: 'tagNumber', label: 'Tag #', type: 'text' },
            { name: 'dateIssued', label: 'Date Issued', type: 'date' },
            { name: 'dateReturned', label: 'Date Returned', type: 'date' },
            { name: 'remarks', label: 'Remarks', type: 'text' }
          ]
        },
        {
          name: 'propertyAcknowledgment',
          label:
            'I hereby acknowledge and certify that all listed above are my responsibility and will take proper care of all company properties that I am entrusted with. I further understand that upon resignation or termination, I agree to return all Nexus Ingredients Corporation property. I also understand that I may be subject for the replacement value or be held financially responsible of any damaged, lost or stolen property while in my custody.',
          type: 'checkbox',
          required: true,
          afterConfirmation: true
        }
      ],
      headReviewRequired: false,
      headSignatureRequired: false,
      hrSignatureRequired: false
    }
  ];
});
