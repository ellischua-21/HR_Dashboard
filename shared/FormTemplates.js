(function (root, factory) {
  const templates = factory();
  if (typeof module === 'object' && module.exports) module.exports = templates;
  if (root) root.FORM_TEMPLATES = templates;
})(typeof window === 'undefined' ? globalThis : window, function () {
  const timeRecordColumns = [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'inStart', label: 'Time In', type: 'time' },
    { name: 'amBreakOut', label: 'AM Out', type: 'time' },
    { name: 'amBreakIn', label: 'AM In', type: 'time' },
    { name: 'lunchBreakOut', label: 'Lunch Break Out', type: 'time' },
    { name: 'lunchBreakIn', label: 'Lunch Break In', type: 'time' },
    { name: 'pmBreakOut', label: 'PM Out', type: 'time' },
    { name: 'pmBreakIn', label: 'PM In', type: 'time' },
    { name: 'outEnd', label: 'Time Out', type: 'time' }
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
      title: 'Authority To Deduct',
      source: 'AUTHORITY TO DEDUCT.pdf',
      prefix: 'ATD',
      sequenceWidth: 6,
      description:
        'Authorize an account deduction by listing its particulars and amount.',
      fields: [
        {
          name: 'name',
          label: 'Employee Name',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'employeeNo',
          label: 'Employee Number',
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
          explanation: true,
          placeholder: 'What is the deduction for, and why is it being deducted?',
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
          label: 'Employee Name',
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
          label: 'Employee Number',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'reason',
          label: 'Reason',
          type: 'textarea',
          explanation: true,
          placeholder: 'Why is the record incorrect? What happened, and who was with you, if anyone?',
          required: true,
          maxLength: 500
        },
        ...legacyTimeRecordFields,
        {
          name: 'reportsTo',
          label: 'Reports To',
          type: 'text',
          maxLength: 191
        },
        {
          name: 'timeRecords',
          label: 'Daily Time Records',
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
          label: 'Employee Name',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'employeeNo',
          label: 'Employee Number',
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
          explanation: true,
          placeholder: 'What is the purpose of your trip, and who will be joining you?',
          required: true,
          maxLength: 500
        },
        {
          name: 'departure',
          label: 'Date/Time Of Departure',
          type: 'datetime-local',
          required: true
        },
        {
          name: 'return',
          label: 'Date/Time Of Return',
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
          label: 'Employee Name',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'employeeNo',
          label: 'Employee Number',
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
          label: 'Regular Shift Time',
          type: 'text',
          required: true,
          maxLength: 100
        },
        {
          name: 'overtimeDate',
          label: 'Date Of Authorized Overtime',
          type: 'date',
          required: true
        },
        {
          name: 'timeFrom',
          label: 'Authorized Time From',
          type: 'time',
          required: true
        },
        {
          name: 'timeTo',
          label: 'Authorized Time To',
          type: 'time',
          required: true
        },
        {
          name: 'overtimeHours',
          label: 'Overtime Hours',
          type: 'number',
          required: true,
          min: 0.25,
          max: 24,
          step: 0.25
        },
        {
          name: 'reason',
          label: 'Reason For Request',
          type: 'textarea',
          explanation: true,
          placeholder: 'What work requires overtime, and why is overtime needed?',
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
          label: 'Employee Name',
          type: 'text',
          required: true,
          maxLength: 191
        },
        {
          name: 'employeeNo',
          label: 'Employee Number',
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
          label: 'Daily Time Records',
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
          label: 'Employee Name',
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
          label: 'Company Property',
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
            'I hereby acknowledge and certify that all listed above are my responsibility and will take proper care of all company properties that I am entrusted with. I further understand that upon resignation or termination, I agree to return all company property. I also understand that I may be subject for the replacement value or be held financially responsible of any damaged, lost or stolen property while in my custody.',
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
