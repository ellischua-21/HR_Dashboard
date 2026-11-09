(function () {
  const node = (tag, text, className) => el(tag, text, className);
  let fieldId = 0;
  const definition = window.IncidentWorkflowDefinition;
  const dateTime = (value) => (value ? DateUtils.formatDateTime(value) : '—');
  function section(parent, title) {
    const box = node(
      'section',
      undefined,
      'incident-case-section incident-detail-panel'
    );
    box.appendChild(node('h3', title));
    parent.appendChild(box);
    return box;
  }
  function input(parent, title, options = {}) {
    const label = node('label', title),
      control = node(
        options.options ? 'select' : options.area ? 'textarea' : 'input'
      );
    control.id = `incident-workflow-field-${++fieldId}`;
    label.htmlFor = control.id;
    if (options.options)
      for (const option of options.options)
        control.add(
          new Option(
            typeof option === 'string' ? option : option.label,
            typeof option === 'string' ? option : option.value
          )
        );
    else if (options.area) {
      control.rows = options.rows || 4;
      control.maxLength = 12000;
    } else {
      control.type = options.type || 'text';
      if (['text', 'search'].includes(control.type)) control.maxLength = 191;
    }
    if (options.type === 'file') {
      control.multiple = true;
      control.accept = definition.evidenceAccept;
    } else control.value = options.value ?? '';
    control.required = Boolean(options.required);
    control.readOnly = Boolean(options.readonly);
    if (options.placeholder) control.placeholder = options.placeholder;
    if (options.min != null) control.min = options.min;
    if (options.max != null) control.max = options.max;
    if (options.type === 'checkbox') {
      label.classList.add('workflow-checkbox');
      label.prepend(control);
    } else label.appendChild(control);
    parent.appendChild(label);
    return control;
  }
  function button(parent, title, fn, ghost = false) {
    const result = node('button', title, ghost ? 'ghost' : '');
    result.type = 'button';
    result.onclick = async () => {
      result.disabled = true;
      try {
        await fn();
      } catch (error) {
        AppErrors.show(error.message);
      } finally {
        result.disabled = false;
      }
    };
    parent.appendChild(result);
    return result;
  }
  function details(parent, values) {
    const list = node('dl', undefined, 'workflow-details');
    for (const [title, value] of values) {
      const pair = node('div');
      if (
        String(value || '').length > 120 ||
        /Findings|Statement|Remarks|Response|Information Required|What|Who|Why|How|Location|Witnesses|Others Involved/i.test(
          title
        )
      )
        pair.classList.add('workflow-field-wide');
      pair.append(node('dt', title), node('dd', value || '—'));
      list.appendChild(pair);
    }
    parent.appendChild(list);
  }
  function signature(parent, title = 'Signature') {
    const box = node('div', undefined, 'workflow-signature'),
      label = node('label', title),
      canvas = node(
        'canvas',
        undefined,
        'signature-pad incident-signature-pad'
      );
    canvas.width = 560;
    canvas.height = 120;
    canvas.setAttribute('aria-label', title);
    label.dataset.requiredLabel = '';
    const clear = node('button', 'Clear Signature', 'ghost');
    clear.type = 'button';
    box.append(label, canvas, clear);
    parent.appendChild(box);
    let pad;
    requestAnimationFrame(() => {
      pad = window.createSignaturePad(canvas, clear);
    });
    return () => {
      const data = pad?.toDataURL();
      if (!data) throw new Error('Draw your signature first.');
      return data;
    };
  }
  function signed(parent, title, image, name, timestamp) {
    const box = node('div', undefined, 'workflow-signed');
    box.appendChild(node('strong', title));
    if (image) {
      const img = node('img');
      img.src = image;
      img.alt = title;
      box.appendChild(img);
    }
    box.append(node('span', name || '—'), node('time', dateTime(timestamp)));
    parent.appendChild(box);
  }
  function editor(parent, title, build) {
    const wrap = node('section', undefined, 'workflow-action'),
      body = node('div', undefined, 'workflow-action-body');
    body.hidden = true;
    const toggle = button(
      wrap,
      title,
      () => {
        body.hidden = !body.hidden;
        if (!body.hidden && !body.childElementCount) build(body);
      },
      true
    );
    toggle.setAttribute('aria-expanded', 'false');
    const original = toggle.onclick;
    toggle.onclick = async () => {
      await original();
      toggle.setAttribute('aria-expanded', String(!body.hidden));
    };
    wrap.appendChild(body);
    parent.appendChild(wrap);
  }
  function form(parent, title, handler) {
    const result = node('form', undefined, 'workflow-form');
    parent.appendChild(result);
    result.noValidate = true;
    const submit = node('button', title);
    submit.type = 'submit';
    result.onsubmit = async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        const invalid = [...result.elements].find(
          (control) => control.willValidate && !control.validity.valid
        );
        if (invalid) {
          invalid.focus();
          throw new Error(
            invalid.validity.valueMissing
              ? 'Complete the required fields.'
              : invalid.validationMessage
          );
        }
        await handler();
      } catch (error) {
        AppErrors.show(error.message);
      } finally {
        submit.disabled = false;
      }
    };
    return {
      element: result,
      finish: () => {
        const actions = node('div', undefined, 'actions');
        actions.appendChild(submit);
        result.appendChild(actions);
        return actions;
      }
    };
  }
  async function commit(
    incident,
    action,
    payload,
    reload,
    confirmMessage = ''
  ) {
    if (
      confirmMessage &&
      !(await appConfirm(confirmMessage, {
        title: 'Confirm Action',
        confirmText: 'Proceed',
        danger: action === 'CLOSE'
      }))
    )
      return false;
    await api('incidentWorkflowAction', incident.id, action, payload);
    await reload();
    await Promise.all([
      window.refreshIncidentBadges(),
      window.refreshInboxBadge()
    ]);
    AppFeedback.success(
      action === 'SAVE_NTE' ||
        action === 'SAVE_EXPLANATION' ||
        action === 'SAVE_REVIEW'
        ? 'Saved successfully.'
        : 'Processed successfully.'
    );
    return true;
  }
  function search(parent, title, selected) {
    const wrapper = node('div', undefined, 'incident-search-field'),
      control = node('input');
    control.type = 'search';
    control.id = `incident-workflow-field-${++fieldId}`;
    control.placeholder = 'Search name or email';
    control.setAttribute('aria-label', title);
    wrapper.appendChild(control);
    const options = node('div', undefined, 'incident-suggestions');
    options.hidden = true;
    options.setAttribute('role', 'listbox');
    wrapper.appendChild(options);
    parent.appendChild(wrapper);
    return { control, search: bindSearch(control, options, selected) };
  }
  function bindSearch(control, options, selected) {
    return window.createEmployeeSearch({
      input: control,
      suggestions: options,
      search: (query) => api('searchIncidentEmployees', query, 'reported'),
      getOwner: () => session.email,
      details: (employee) => [
        employee.employeeNo,
        employee.department,
        employee.position
      ],
      onClear: () => selected(null),
      onSelect: selected
    });
  }

  async function loadFile() {
    const root = document.getElementById('ir-workflow-file'),
      context = await api('getIncidentFileContext');
    root.replaceChildren();
    if (!context.canFile) {
      root.appendChild(
        node(
          'p',
          'Your account has view-only Incident Management access.',
          'panel'
        )
      );
      return;
    }
    let records = [];
    const f = form(root, 'File Reports', async () => {
      const reports = [];
      for (const record of records) reports.push(await record.value());
      if (
        !(await appConfirm(
          'File these Incident Reports? Each employee will have a separate IR number in this case.',
          { title: 'File Incident Reports', confirmText: 'File' }
        ))
      )
        return;
      const result = await api('submitIncidentGroup', { reports });
      AppFeedback.success('Filed successfully.');
      await window.refreshIncidentBadges();
      await window.openIncidentRoute(result.reports[0].id, 'incident-track');
    });
    f.element.classList.add('panel', 'incident-form');
    details(f.element, [
      ['IR Reference Number(s)', 'Assigned When Filed (One Per Report)'],
      ['Date Issued', DateUtils.formatDate(context.dateReported)]
    ]);
    const reportsBox = node('div');
    f.element.appendChild(reportsBox);
    function add(copy = null) {
      const card = document
        .getElementById('incident-report-template')
        .content.firstElementChild.cloneNode(true);
      const field = (key) => card.querySelector('[data-field="' + key + '"]');
      const [person, position, department, supervisor, files] = [
        'employeeSearch',
        'position',
        'department',
        'supervisor',
        'files'
      ].map(field);
      card.querySelectorAll('input,textarea').forEach((control) => {
        control.id = 'incident-workflow-field-' + ++fieldId;
      });
      files.accept = definition.evidenceAccept;
      const keys = ['date', 'time', 'where', 'what', 'why', 'how'];
      keys.forEach((key) => {
        field(key).value = copy?.[key] || '';
      });
      let employee = null,
        concernedEmployee = null;
      reportsBox.appendChild(card);
      bindSearch(person, field('employeeSuggestions'), (value) => {
        employee = value;
        position.value = value?.position || '';
        department.value = value?.department || '';
        supervisor.value = value?.supervisorName || '';
      });
      bindSearch(
        field('concernedSearch'),
        field('concernedSuggestions'),
        (value) => {
          concernedEmployee = value;
          field('concernedPosition').value = value?.position || '';
          field('concernedDepartment').value = value?.department || '';
          field('concernedSupervisor').value = value?.supervisorName || '';
        }
      );
      function addEmployeeSelectors(target, title) {
        const slots = [];
        for (let index = 0; index < 5; index++) {
          let selected = null;
          const { control } = search(
            target,
            `${title} ${index + 1}`,
            (value) => (selected = value)
          );
          slots.push({ control, selected: () => selected });
        }
        return slots;
      }
      function selectedEmployeeIds(slots, title) {
        if (slots.some((slot) => slot.control.value.trim() && !slot.selected()))
          throw new Error(
            `Choose each ${title.toLowerCase()} employee from the suggestions, or clear the field.`
          );
        const ids = slots
          .map((slot) => slot.selected()?.employeeId)
          .filter(Boolean);
        if (new Set(ids.map(String)).size !== ids.length)
          throw new Error(`Select each ${title.toLowerCase()} employee only once.`);
        return ids;
      }
      const involved = addEmployeeSelectors(
          card.querySelector('[data-involved-selectors]'),
          'Others Involved'
        ),
        witnesses = addEmployeeSelectors(
          card.querySelector('[data-witness-selectors]'),
          'Witness'
        );
      const record = {
        card,
        value: async () => {
          if (!employee)
            throw new Error(
              'Select the employee being reported from the suggestions.'
            );
          if (!concernedEmployee)
            throw new Error(
              'Select the employee concerned from the suggestions.'
            );
          return {
            employeeId: employee.employeeId,
            concernedEmployeeId: concernedEmployee.employeeId,
            ...Object.fromEntries(keys.map((key) => [key, field(key).value])),
            involved: selectedEmployeeIds(involved, 'Others Involved'),
            witnesses: selectedEmployeeIds(witnesses, 'Witnesses'),
            files: await readIncidentEvidenceFiles(files.files)
          };
        },
        copy: () =>
          Object.fromEntries(keys.map((key) => [key, field(key).value]))
      };
      records.push(record);
      function headings() {
        records.forEach((record, index) => {
          record.card.querySelector('[data-report-heading]').textContent =
            'Incident Report ' + (index + 1);
        });
      }
      headings();
      const actions = card.querySelector('[data-report-actions]');
      button(
        actions,
        'File Another',
        () => {
          if (records.length >= 10)
            throw new Error('File no more than 10 reports in a session.');
          add(record.copy());
        },
        true
      );
      button(
        actions,
        'Remove Report',
        () => {
          if (records.length === 1)
            throw new Error('Keep at least one report.');
          records = records.filter((item) => item !== record);
          card.remove();
          headings();
        },
        true
      );
      person.focus();
    }
    add();
    f.finish();
  }
  function attachments(parent, incident, sectionNumber) {
    const files = incident.files.filter(
      (file) => Number(file.sectionNumber) === sectionNumber && !file.requestId
    );
    if (!files.length) return;
    const list = node('ul', undefined, 'workflow-attachments');
    for (const file of files) {
      const li = node('li'),
        a = node('a', file.fileName);
      a.href = `${API_BASE}/incidents/evidence/${file.id}`;
      a.target = '_blank';
      a.rel = 'noopener';
      li.appendChild(a);
      list.appendChild(li);
    }
    parent.appendChild(list);
  }
  function renderRequests(root, incident, reload) {
    if (!incident.informationRequests.length) return;
    const panel = section(root, 'Information Requests');
    for (const request of incident.informationRequests) {
      const card = section(
        panel,
        request.status === 'PENDING'
          ? 'Awaiting Response'
          : 'Response Submitted'
      );
      details(card, [
        ['Requested From', request.recipientEmail],
        ['Requested By', request.requestedBy],
        ['Requested On', dateTime(request.createdAt)],
        ['Information Required', request.requestText]
      ]);
      if (request.responseText)
        details(card, [
          ['Response', request.responseText],
          ['Submitted On', dateTime(request.respondedAt)]
        ]);
      for (const file of incident.files.filter(
        (file) => Number(file.requestId) === Number(request.id)
      )) {
        const a = node('a', file.fileName);
        a.href = `${API_BASE}/incidents/evidence/${file.id}`;
        a.target = '_blank';
        a.rel = 'noopener';
        card.appendChild(a);
      }
      if (
        incident.status !== 'CLOSED' &&
        request.status === 'PENDING' &&
        request.recipientEmail.toLowerCase() === session.email.toLowerCase()
      ) {
        let statement, files;
        const f = form(card, 'Submit Response', async () =>
          commit(
            incident,
            'RESPOND',
            {
              requestId: request.id,
              statement: statement.value,
              files: await readIncidentEvidenceFiles(files.files)
            },
            reload,
            'Submit this response? It cannot be replaced afterward.'
          )
        );
        statement = input(f.element, 'Your Response', {
          area: true,
          required: true
        });
        files = input(f.element, 'Supporting Files', { type: 'file' });
        f.finish();
      }
    }
  }
  function requestEditor(root, incident, reload, headOnly = false) {
    editor(
      root,
      headOnly ? 'Request More Evidence' : 'Request Information From Employees',
      (body) => {
        const fields = [];
        const people = headOnly
          ? [{ email: incident.reporterEmail, name: incident.reporterName }]
          : [
              { email: incident.reporterEmail, name: incident.reporterName },
              {
                email: incident.reportedEmployeeEmail,
                name: incident.reportedEmployeeName
              },
              ...(incident.assignedHeadEmail
                ? [
                    {
                      email: incident.assignedHeadEmail,
                      name: incident.assignedHeadEmail
                    }
                  ]
                : []),
              ...(incident.report.involved || []).map((person) => ({
                email: person.email,
                name: person.name
              })),
              ...(incident.report.concernedEmployee
                ? [incident.report.concernedEmployee]
                : []),
              ...(incident.report.witnesses || []).map((w) => ({
                email: w.email,
                name: w.name
              }))
            ];
        const f = form(body, 'Send Requests', async () => {
          const requests = fields
            .filter((item) => item.check.checked)
            .map((item) => ({ email: item.email, text: item.text.value }));
          if (!requests.length)
            throw new Error('Select at least one employee.');
          await commit(
            incident,
            'REQUEST_INFORMATION',
            { requests },
            reload,
            'Send these requests and wait for the selected employees to respond?'
          );
        });
        const seen = new Set();
        for (const person of people) {
          if (
            seen.has(person.email) ||
            person.email.toLowerCase() === session.email.toLowerCase()
          )
            continue;
          seen.add(person.email);
          const box = node('div', undefined, 'workflow-request-person'),
            label = node('label', person.name),
            check = node('input');
          check.type = 'checkbox';
          label.classList.add('workflow-checkbox');
          label.prepend(check);
          box.appendChild(label);
          const text = input(box, 'Information Required', { area: true });
          text.closest('label').hidden = true;
          check.onchange = () => {
            text.closest('label').hidden = !check.checked;
            text.required = check.checked;
          };
          f.element.appendChild(box);
          fields.push({ email: person.email, check, text });
        }
        f.finish();
      }
    );
  }
  function nteEditor(root, incident, reload) {
    editor(root, 'Prepare Notice To Explain', (body) => {
      const saved = incident.nte || {},
        f = form(body, 'Issue NTE', async () =>
          commit(
            incident,
            'ISSUE_NTE',
            { ...(await value()), signature: sign() },
            reload,
            'Issue this Notice To Explain? The issued document will be preserved.'
          )
        );
      details(f.element, [
        ['Directed To', incident.reportedEmployeeName],
        ['IR Number', incident.caseNumber]
      ]);
      const third = section(
        f.element,
        'III. Alleged Company Policy / Rule Violated'
      );
      const policy = input(third, 'Applicable Policy / Handbook Provision', {
          area: true,
          required: true,
          value: saved.policy
        }),
        rule = input(third, 'Specific Rule / Section Number', {
          value: saved.rule
        });
      const classification = input(third, 'Preliminary Classification', {
          required: true,
          value: saved.classification,
          options: [
            { label: 'Select A Classification', value: '' },
            ...definition.classifications
          ]
        }),
        other = input(third, 'Other Classification', {
          value: saved.otherClassification
        });
      const penalty = input(third, 'Preliminary Corresponding Penalty', {
        value: saved.possiblePenalty
      });
      classification.onchange = () => {
        other.required = classification.value === 'Other';
        other.closest('label').hidden = !other.required;
      };
      classification.onchange();
      const fourth = section(f.element, 'IV. Supporting Documents / Evidence'),
        types = [];
      for (const title of definition.evidenceTypes) {
        const label = node('label', title),
          check = node('input');
        check.type = 'checkbox';
        check.checked = (saved.evidenceTypes || []).includes(title);
        label.classList.add('workflow-checkbox');
        label.prepend(check);
        fourth.appendChild(label);
        types.push({ title, check });
      }
      const evidenceDetails = input(
          fourth,
          'Details Of Attachments / Evidence',
          { area: true, value: saved.evidenceDetails }
        ),
        files = input(fourth, 'Attach Evidence', { type: 'file' });
      const sign = signature(
        f.element,
        'VI. Prepared / Issued By — HEAD Signature'
      );
      const value = async () => ({
        policy: policy.value,
        rule: rule.value,
        classification: classification.value,
        otherClassification: other.value,
        possiblePenalty: penalty.value,
        evidenceTypes: types.filter((t) => t.check.checked).map((t) => t.title),
        evidenceDetails: evidenceDetails.value,
        files: await readIncidentEvidenceFiles(files.files)
      });
      const actions = f.finish();
      button(
        actions,
        'Save Draft',
        async () => commit(incident, 'SAVE_NTE', await value(), reload),
        true
      );
    });
  }
  const directive = definition.directive;
  function documents(root, incident, includeBlankSections = false) {
    const report = incident.report;
    const first = section(root, 'I. Employee Information');
    details(first, [
      ['Employee Being Reported', report.employee.name],
      ['Position', report.employee.position],
      ['Department', report.employee.department],
      ['Immediate Supervisor', report.employee.supervisor]
    ]);
    details(first, [
      [
        'Employee Concerned',
        report.concernedEmployee?.name || report.employee.name
      ],
      [
        'Position',
        report.concernedEmployee?.position || report.employee.position
      ],
      [
        'Department',
        report.concernedEmployee?.department || report.employee.department
      ],
      [
        'Immediate Supervisor',
        report.concernedEmployee?.supervisor || report.employee.supervisor
      ]
    ]);
    const second = section(root, 'II. Details Of The Alleged Incident');
    const involved = (report.involved || [])
      .map((person) => person.name)
      .filter(Boolean)
      .join(', ');
    const witnesses = (report.witnesses || [])
      .map((person) => person.name)
      .filter(Boolean)
      .join(', ');
    details(second, [
      ['What Happened', report.what],
      ['Date', DateUtils.formatDate(report.date)],
      ['Time', DateUtils.formatTime(report.time)],
      ['Location', report.where],
      ['Others Involved', involved || report.who],
      ['Witnesses', witnesses],
      ['Why Is This Being Reported?', report.why],
      ['How Did It Happen?', report.how]
    ]);
    attachments(second, incident, 2);
    if (!incident.nte) return;
    const nte = incident.nte;
    const third = section(root, 'III. Alleged Company Policy / Rule Violated');
    details(third, [
      ['Applicable Policy / Handbook Provision', nte.policy],
      ['Specific Rule / Section Number', nte.rule],
      [
        'Preliminary Classification',
        nte.classification === 'Other'
          ? nte.otherClassification
          : nte.classification
      ],
      ['Preliminary Corresponding Penalty', nte.possiblePenalty]
    ]);
    const fourth = section(root, 'IV. Supporting Documents / Evidence');
    details(fourth, [
      ['Evidence Types', (nte.evidenceTypes || []).join(', ')],
      ['Evidence Details', nte.evidenceDetails]
    ]);
    attachments(fourth, incident, 4);
    if (incident.rights.maxSection >= 5) {
      const fifth = section(root, 'V. Directive To Submit Written Explanation');
      fifth.appendChild(node('p', directive, 'incident-case-text'));
    }
    if (incident.rights.maxSection >= 6) {
      const sixth = section(root, 'VI. Issuance And Acknowledgment');
      details(sixth, [
        ['IR / NTE Reference', incident.caseNumber],
        ['Date Issued', DateUtils.formatDate(nte.dateIssued)],
        ['Issuer Position', nte.issuerPosition],
        [
          'Explanation Deadline',
          incident.deadlineDate
            ? DateUtils.formatDate(incident.deadlineDate)
            : 'Awaiting Receipt Acknowledgment'
        ]
      ]);
      if (includeBlankSections && !incident.receipt)
        details(sixth, [
          ['Employee Acknowledgment Of Receipt', ''],
          ['Date And Time Received', ''],
          ['Witness If Employee Refuses To Acknowledge Receipt', '']
        ]);
      signed(
        sixth,
        'Prepared / Issued By',
        nte.signature,
        nte.issuerName,
        nte.issuedAt
      );
      if (incident.receipt)
        signed(
          sixth,
          'Employee Acknowledgment Of Receipt',
          incident.receipt.signature,
          incident.receipt.employeeName,
          incident.receipt.receivedAt
        );
    }
    if (incident.explanation && incident.rights.maxSection >= 7) {
      const seventh = section(root, 'VII. Employee’s Written Explanation');
      details(seventh, [
        ['Employee Statement', incident.explanation.statement],
        ['Submitted On', dateTime(incident.explanation.submittedAt)],
        [
          'Hearing Requested',
          incident.explanation.hearingRequested ? 'Yes' : 'No'
        ]
      ]);
      attachments(seventh, incident, 7);
      signed(
        seventh,
        'Employee Signature',
        incident.explanation.signature,
        incident.explanation.employeeName,
        incident.explanation.submittedAt
      );
    }
    if (
      includeBlankSections &&
      !incident.explanation &&
      incident.rights.maxSection >= 7
    ) {
      const seventh = section(root, 'VII. Employee’s Written Explanation');
      details(seventh, [
        ['Employee Statement', ''],
        ['Supporting Documents Submitted', ''],
        ['Date Submitted', ''],
        ['Employee Signature', '']
      ]);
    }
    if (incident.hrReview && incident.rights.maxSection >= 8) {
      const eighth = section(
        root,
        'VIII. HR Administrative Review — Internal Use Only'
      );
      const review = incident.hrReview;
      details(eighth, [
        ['Review Indicators', (review.checks || []).join(', ')],
        ['Date Explanation Received', dateTime(incident.submittedAt)],
        ['HR Findings / Assessment', review.findings],
        [
          'Finding',
          review.finding === 'SUBSTANTIATED'
            ? 'Violation Established'
            : 'No Violation Established'
        ],
        ['Severity', review.severity],
        ['Previous Relevant Offenses', String(review.previousOffenses)],
        ['Recommended Corrective Action', review.correctiveAction],
        ['Additional Remarks', review.remarks],
        ['Reviewed By HR', review.reviewerName],
        ['Review Date', dateTime(review.reviewedAt)],
        [
          'Management Approval',
          incident.management
            ? incident.management.approved
              ? 'Approved'
              : 'Returned'
            : 'Pending'
        ],
        ['Management Approver', incident.management?.approverName],
        ['Approval / Return Date', dateTime(incident.management?.recordedAt)],
        ['Management Remarks', incident.management?.remarks]
      ]);
    }
    if (
      includeBlankSections &&
      !incident.hrReview &&
      incident.rights.maxSection >= 8
    ) {
      const eighth = section(
        root,
        'VIII. HR Administrative Review — Internal Use Only'
      );
      details(eighth, [
        ['Review Indicators', definition.reviewIndicators.join(' / ')],
        ['Date Explanation Received', dateTime(incident.submittedAt)],
        ['HR Findings / Assessment', ''],
        ['HR Recommendation', ''],
        ['Reviewed By HR / Date', ''],
        ['Approved By Authorized Management / Date', '']
      ]);
    }
  }
  function employeeActions(root, incident, reload) {
    if (!incident.rights.reported || incident.phase !== 'EMPLOYEE') return;
    const panel = section(root, 'Your Response');
    if (!incident.receivedAt) {
      panel.appendChild(
        node(
          'p',
          'I acknowledge receipt of this Notice To Explain. My signature confirms receipt only and does not signify admission or agreement with the allegations.'
        )
      );
      let sign;
      const f = form(panel, 'Sign', async () =>
        commit(
          incident,
          'ACKNOWLEDGE',
          { signature: sign() },
          reload,
          'Acknowledge receipt of this Notice To Explain? Your five-calendar-day response period will start today.'
        )
      );
      sign = signature(f.element, 'Employee Acknowledgment Of Receipt');
      f.finish();
      return;
    }
    panel.appendChild(
      node(
        'p',
        incident.daysRemaining < 0
          ? 'Explanation Overdue'
          : incident.daysRemaining === 0
            ? 'Explanation Due Today'
            : `${incident.daysRemaining} Calendar Days Remaining`,
        'badge'
      )
    );
    let statement, files, hearing, sign;
    const f = form(panel, 'Submit Explanation', async () =>
      commit(
        incident,
        'SUBMIT_EXPLANATION',
        { ...(await value()), signature: sign() },
        reload,
        'Submit this signed explanation? It will be preserved and cannot be overwritten.'
      )
    );
    statement = input(f.element, 'VII. Your Written Explanation', {
      area: true,
      required: true,
      value: incident.explanationDraft?.statement
    });
    hearing = input(f.element, 'Request An Administrative Hearing', {
      type: 'checkbox'
    });
    hearing.checked = Boolean(incident.explanationDraft?.hearingRequested);
    files = input(f.element, 'Supporting Documents', { type: 'file' });
    attachments(f.element, incident, 7);
    sign = signature(f.element, 'Employee Explanation Signature');
    const value = async () => ({
      statement: statement.value,
      hearingRequested: hearing.checked,
      files: await readIncidentEvidenceFiles(files.files)
    });
    const actions = f.finish();
    button(
      actions,
      'Save Draft',
      async () => commit(incident, 'SAVE_EXPLANATION', await value(), reload),
      true
    );
    editor(panel, 'Request An Extension', (body) => {
      let days, reason;
      const extension = form(body, 'Send Extension Request', async () =>
        commit(
          incident,
          'REQUEST_EXTENSION',
          { days: Number(days.value), reason: reason.value },
          reload
        )
      );
      days = input(extension.element, 'Additional Calendar Days', {
        type: 'number',
        required: true,
        min: 1,
        max: 60
      });
      reason = input(extension.element, 'Reason', {
        area: true,
        required: true
      });
      extension.finish();
    });
  }
  function extensions(root, incident, reload) {
    if (!incident.extensions.length) return;
    const panel = section(root, 'Explanation Extension Requests');
    for (const request of incident.extensions) {
      const card = section(panel, FormStatus.titleCase(request.status));
      details(card, [
        ['Requested Days', String(request.requested_days)],
        ['Reason', request.reason],
        [
          'Approved Days',
          request.approved_days == null ? '—' : String(request.approved_days)
        ],
        [
          'Updated Deadline',
          request.new_deadline
            ? DateUtils.formatDate(request.new_deadline)
            : '—'
        ],
        ['HR Remarks', request.review_reason]
      ]);
      if (
        incident.rights.hr &&
        incident.phase === 'EMPLOYEE' &&
        request.status === 'PENDING'
      ) {
        let days, reason;
        const f = form(card, 'Approve Extension', async () =>
          commit(
            incident,
            'REVIEW_EXTENSION',
            {
              requestId: request.id,
              approve: true,
              days: Number(days.value),
              reason: reason.value
            },
            reload,
            'Approve this extension and update the explanation deadline?'
          )
        );
        days = input(f.element, 'Approved Calendar Days', {
          type: 'number',
          required: true,
          min: 1,
          max: 60,
          value: request.requested_days
        });
        reason = input(f.element, 'Review Remarks', { area: true });
        const actions = f.finish();
        button(
          actions,
          'Reject',
          () =>
            commit(
              incident,
              'REVIEW_EXTENSION',
              { requestId: request.id, approve: false, reason: reason.value },
              reload,
              'Reject this extension request?'
            ),
          true
        );
      }
    }
  }
  function hrActions(root, incident, reload) {
    if (!incident.rights.hr || !incident.submittedAt) return;
    if (incident.task) root.appendChild(TaskUI.render(incident.task, reload));
    if (!incident.task?.isMine) return;
    const waiting = incident.informationRequests.some(
      (r) => r.status === 'PENDING'
    );
    if (incident.hearingStatus === 'SCHEDULED') {
      const panel = section(root, 'Hearing Completion');
      let remarks;
      const f = form(panel, 'Mark Hearing Completed', async () =>
        commit(
          incident,
          'HEARING',
          { completed: true, details: remarks.value },
          reload,
          'Confirm that the external hearing has finished?'
        )
      );
      remarks = input(f.element, 'Hearing Completion Remarks', {
        area: true,
        required: true
      });
      f.finish();
      return;
    }
    if (waiting) {
      root.appendChild(
        node('p', 'Awaiting The Requested Employee Responses.', 'badge')
      );
      return;
    }
    if (incident.phase === 'HR') {
      editor(root, 'Schedule Hearing', (body) => {
        let details;
        const f = form(body, 'Schedule And Notify', async () =>
          commit(
            incident,
            'HEARING',
            { details: details.value },
            reload,
            'Notify involved employees and pause this task for a hearing?'
          )
        );
        details = input(f.element, 'Hearing Details', {
          area: true,
          required: true
        });
        f.finish();
      });
      requestEditor(root, incident, reload);
    }
    if (incident.phase === 'HR')
      editor(root, 'Review NTE And Recommend Action', (body) => {
        const saved = incident.hrReview || {};
        let finding, severity, findings, remarks, manager;
        const f = form(body, 'Send For Management Approval', async () =>
          commit(
            incident,
            'SEND_APPROVAL',
            value(),
            reload,
            'Send this recommendation for Management approval?'
          )
        );
        const box = section(f.element, 'VIII. HR Administrative Review'),
          checks = [];
        for (const title of definition.reviewIndicators) {
          const label = node('label', title),
            check = node('input');
          check.type = 'checkbox';
          check.checked = (saved.checks || []).includes(title);
          label.classList.add('workflow-checkbox');
          label.prepend(check);
          box.appendChild(label);
          checks.push({ title, check });
        }
        findings = input(box, 'HR Findings / Assessment', {
          area: true,
          required: true,
          value: saved.findings
        });
        finding = input(box, 'Finding', {
          required: true,
          value: saved.finding || 'NOT_SUBSTANTIATED',
          options: [
            { label: 'No Violation Established', value: 'NOT_SUBSTANTIATED' },
            { label: 'Violation Established', value: 'SUBSTANTIATED' }
          ]
        });
        severity = input(box, 'Violation Severity', {
          value: saved.severity || '',
          options: [
            { label: 'Select A Severity', value: '' },
            'Light',
            'Moderate',
            'Grave',
            'Intolerable'
          ]
        });
        const previous = input(box, 'Previous Relevant Offenses', {
            readonly: true,
            value: saved.previousOffenses ?? ''
          }),
          action = input(box, 'Recommended Corrective Action', {
            readonly: true,
            value: saved.correctiveAction || 'No Further Action'
          });
        let revision = 0;
        const update = async () => {
          const ticket = ++revision;
          severity.required = finding.value === 'SUBSTANTIATED';
          severity.disabled = finding.value !== 'SUBSTANTIATED';
          if (!severity.required) {
            action.value = 'No Further Action';
            previous.value = '0';
            return;
          }
          if (!severity.value) {
            action.value = '';
            previous.value = '';
            return;
          }
          try {
            const result = await api(
              'getIncidentCorrectiveAction',
              incident.id,
              severity.value
            );
            if (ticket === revision) {
              action.value = result.correctiveAction;
              previous.value = result.previousOffenses;
            }
          } catch (error) {
            if (ticket === revision) {
              action.value = '';
              AppErrors.show(error.message);
            }
          }
        };
        finding.onchange = update;
        severity.onchange = update;
        update();
        remarks = input(box, 'Additional Remarks', {
          area: true,
          value: saved.remarks
        });
        manager = input(box, 'Management Approver', {
          required: true,
          value: incident.defaultManager || '',
          options: [
            { label: 'Select An Approver', value: '' },
            ...incident.managers.map((item) => ({
              label: item.name,
              value: item.email
            }))
          ]
        });
        const value = () => ({
          findings: findings.value,
          finding: finding.value,
          severity: severity.value,
          remarks: remarks.value,
          managementEmail: manager.value,
          checks: checks
            .filter((item) => item.check.checked)
            .map((item) => item.title)
        });
        const actions = f.finish();
        button(
          actions,
          'Save Draft',
          () => commit(incident, 'SAVE_REVIEW', value(), reload),
          true
        );
      });
    if (incident.phase === 'MANAGEMENT')
      root.appendChild(node('p', 'Awaiting Management Approval.', 'badge'));
    if (incident.phase === 'FINAL_ACTION') {
      button(root, 'Issue Approved Final Decision', () =>
        commit(
          incident,
          'ISSUE_DECISION',
          {},
          reload,
          'Issue the Management-approved final decision and notify the involved employees?'
        )
      );
      button(
        root,
        'Revise Evaluation',
        () =>
          commit(
            incident,
            'REVISE_REVIEW',
            {},
            reload,
            'Reopen this recommendation? New Management approval will be required.'
          ),
        true
      );
    }
    if (incident.phase === 'FINALIZED') closure(root, incident, reload);
  }
  function closure(root, incident, reload) {
    editor(
      root,
      incident.phase === 'HEAD' ? 'Close For Documentation' : 'Close Case',
      (body) => {
        let reason;
        const f = form(body, 'Close Case', async () =>
          commit(
            incident,
            'CLOSE',
            { reason: reason.value },
            reload,
            'Close this Incident Report? It will become read-only.'
          )
        );
        reason = input(f.element, 'Closure Reason', {
          area: true,
          required: true
        });
        f.finish();
      }
    );
  }
  function render(root, incident, reload) {
    const group = section(root, 'Related Incident Reports');
    group.classList.add('workflow-related-reports');
    const links = node('div', undefined, 'actions');
    for (const sibling of incident.siblings) {
      const b = button(
        links,
        `${sibling.caseNumber} · ${sibling.reportedEmployeeName} · ${window.IncidentProgress.label(sibling.status)}`,
        () => window.IncidentTrack.select(sibling.id),
        Number(sibling.id) !== incident.id
      );
      b.setAttribute(
        'aria-current',
        Number(sibling.id) === incident.id ? 'true' : 'false'
      );
    }
    group.appendChild(links);
    button(
      group,
      'View Document',
      () => {
        const preview = window.open('', '_blank');
        if (!preview) throw new Error('Allow popups to view the document.');
        const copy = node('div');
        documents(copy, incident, true);
        preview.document
          .write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeIncidentHtml(incident.caseNumber)}</title><style>
        @page{size:letter;margin:18mm}body{font:14px Arial,sans-serif;color:#252525;line-height:1.5;max-width:820px;margin:24px auto;padding:0 16px}h1{font-size:22px;text-align:center}h3{font-size:15px;margin-top:22px;border-bottom:1px solid #777;padding-bottom:6px}.workflow-details{display:grid;grid-template-columns:1fr 1fr;gap:10px 22px}.workflow-details>div{min-width:0;break-inside:avoid}.workflow-field-wide{grid-column:1/-1}.incident-case-text{white-space:pre-wrap}dt{font-weight:700;font-size:12px}dd{margin:3px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.workflow-signed{display:inline-grid;gap:5px;width:45%;vertical-align:top;margin:16px 2% 0 0}.workflow-signed img{width:240px;max-width:100%;height:70px;object-fit:contain;object-position:center bottom}.workflow-signed time{font-size:12px}section{break-inside:auto}a{overflow-wrap:anywhere}@media print{button{display:none}body{margin:0;padding:0}}@media(max-width:600px){.workflow-details{grid-template-columns:1fr}}
      </style></head><body><button onclick="window.print()">Print / Save As PDF</button><h1>${incident.nteIssuedAt ? 'Notice To Explain' : 'Incident Report'}</h1><p><strong>IR / NTE Reference:</strong> ${escapeIncidentHtml(incident.caseNumber)}</p>${copy.innerHTML}</body></html>`);
        preview.document.close();
      },
      true
    );
    const reporter = section(root, 'Reporter Details');
    details(reporter, [
      ['Reported By', incident.reporterName],
      ['Department', incident.department],
      ['Filed On', dateTime(incident.createdAt)],
      [
        'Reviewing HEAD',
        incident.assignedHeadEmail ||
          'Awaiting An ADMIN HEAD To Take This Report'
      ]
    ]);
    documents(root, incident);
    if (incident.hearingStatus !== 'NONE') {
      const panel = section(root, 'Hearing');
      details(panel, [
        ['Status', FormStatus.titleCase(incident.hearingStatus)],
        ['Hearing Details', incident.hearingDetails],
        ['Completed On', dateTime(incident.hearingCompletedAt)]
      ]);
      if (incident.hearingCompletionNotes)
        details(panel, [
          ['Completion Remarks', incident.hearingCompletionNotes]
        ]);
    }
    renderRequests(root, incident, reload);
    extensions(root, incident, reload);
    if (incident.status !== 'CLOSED') {
      if (incident.rights.poolReviewer)
        button(root, 'Take HEAD Review Task', () =>
          commit(incident, 'TAKE_HEAD', {}, reload)
        );
      if (incident.rights.head && incident.phase === 'HEAD') {
        const waiting = incident.informationRequests.some(
          (r) => r.status === 'PENDING'
        );
        if (waiting)
          root.appendChild(
            node('p', 'Awaiting The Filing Supervisor’s Response.', 'badge')
          );
        else {
          requestEditor(root, incident, reload, true);
          nteEditor(root, incident, reload);
          closure(root, incident, reload);
        }
      }
      employeeActions(root, incident, reload);
      hrActions(root, incident, reload);
      if (incident.rights.manager && incident.phase === 'MANAGEMENT') {
        const panel = section(root, 'Management Approval');
        let remarks;
        const f = form(panel, 'Approve Recommendation', async () =>
          commit(
            incident,
            'MANAGEMENT',
            { approve: true, remarks: remarks.value },
            reload,
            'Approve this HR recommendation? HR will then be able to issue the final decision.'
          )
        );
        remarks = input(f.element, 'Management Remarks', { area: true });
        const actions = f.finish();
        button(
          actions,
          'Return To HR',
          () => {
            if (!remarks.value.trim())
              throw new Error(
                'Enter a reason for returning the recommendation.'
              );
            return commit(
              incident,
              'MANAGEMENT',
              { approve: false, remarks: remarks.value },
              reload,
              'Return this recommendation to HR for revision?'
            );
          },
          true
        );
      }
    }
    if (incident.decision) {
      const panel = section(root, 'Final Decision');
      details(panel, [
        [
          'Finding',
          incident.decision.outcome === 'NO_VIOLATION'
            ? 'No Violation Established'
            : 'Violation Established'
        ],
        ['Findings', incident.decision.findings],
        ['Approved Corrective Action', incident.decision.correctiveAction],
        ['Severity', incident.decision.severity],
        [
          'Occurrence',
          incident.decision.occurrence
            ? String(incident.decision.occurrence)
            : '—'
        ],
        ['Approved By', incident.decision.approvedBy],
        ['Issued On', dateTime(incident.decision.issuedAt)]
      ]);
    }
    if (incident.closedAt) {
      const panel = section(root, 'Closure');
      details(panel, [
        ['Closed On', dateTime(incident.closedAt)],
        ['Closure Reason', incident.closureReason]
      ]);
    }
    window.IncidentTimeline.render(root, incident);
    if (incident.internalActivity?.length) {
      const panel = section(root, 'Internal Activity History');
      for (const entry of incident.internalActivity)
        details(panel, [
          ['Action', FormStatus.titleCase(entry.action)],
          ['Performed By', entry.performedBy],
          ['Date And Time', dateTime(entry.createdAt)],
          ['Remarks', entry.details]
        ]);
    }
  }
  window.IncidentWorkflow = { loadFile, render };
})();
