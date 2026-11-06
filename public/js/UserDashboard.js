let mySubmittedForms = [];
let formsForReview = [];
let formToSign = null;
let formToApprove = null;
let formBeingEdited = null;
let activeReviewScope = 'HR';
let reviewLoadVersion = 0;
let employeeProfile = {};
let assignedFormReviewer = null;
let leaveBalanceRequest = 0;

const APPLICANT_IDENTITY_FIELDS = new Set([
  'name',
  'employeeNo',
  'position',
  'department'
]);

function applyApplicantIdentity(input, fieldName) {
  if (!APPLICANT_IDENTITY_FIELDS.has(fieldName)) return;
  const profileKey = fieldName === 'employeeNo' ? 'emp_no' : fieldName;
  if (!formBeingEdited) {
    if (fieldName === 'name') {
      input.value = employeeProfile.name || session.full_name || session.email;
    } else {
      input.value = employeeProfile[profileKey] || '';
    }
  }
  input.readOnly = true;
}

const userCell = window.AppUI.tableCell;
const userEmptyRow = window.AppUI.emptyRow;

function fillFormTypeFilter(select) {
  select.replaceChildren();
  const allTypes = document.createElement('option');
  allTypes.value = '';
  allTypes.textContent = 'All Form Types';
  select.appendChild(allTypes);
  FORM_TEMPLATES.forEach((template) => {
    const option = document.createElement('option');
    option.value = template.key;
    option.textContent = template.title;
    select.appendChild(option);
  });
}

const userDate = window.AppUI.dateTime;

function leaveLabel(form) {
  const data = form.form_data;
  return data.leaveType === 'Others' && data.otherLeaveType
    ? `Other: ${data.otherLeaveType}`
    : data.leaveType;
}

function leaveRange(form) {
  const data = form.form_data;
  return `${DateUtils.formatDate(data.dateFrom)} to ${DateUtils.formatDate(data.dateTo)}`;
}

function formTemplate(templateKey) {
  return (
    FORM_TEMPLATES.find((template) => template.key === templateKey) || {
      key: templateKey,
      title: 'Submitted Form',
      fields: []
    }
  );
}

function formSummary(form) {
  const data = form.form_data;
  if (form.template_key === 'leave-2026')
    return `${leaveLabel(form)} · ${leaveRange(form)} · ${data.days} day(s)`;
  return formTemplate(form.template_key)
    .fields.filter(
      (field) =>
        data[field.name] !== '' &&
        data[field.name] !== null &&
        data[field.name] !== undefined
    )
    .slice(0, 3)
    .map(
      (field) =>
        `${field.label}: ${String(DateUtils.formatField(data[field.name], field.type)).slice(0, 80)}`
    )
    .join(' · ');
}

function matchesFormFilters(form, status, search, templateKey = '') {
  if (status && form.status !== status) return false;
  if (templateKey && form.template_key !== templateKey) return false;
  if (!search) return true;
  const { signature, ...searchableFormData } = form.form_data || {};
  const searchable = [
    form.control_no,
    formTemplate(form.template_key).title,
    formSummary(form),
    form.status,
    form.review_notes,
    form.applicant_name,
    form.user_email,
    JSON.stringify(searchableFormData)
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
  return searchable.includes(search.toLocaleLowerCase());
}

function updateFormSummary(summary) {
  $('uf_total').textContent = String(summary.total);
  $('uf_pending').textContent = String(summary.pending);
  $('uf_approved').textContent = String(summary.approved);
  $('uf_rejected').textContent = String(summary.rejected);
}

function canEditSubmittedForm(form) {
  return FormStatus.canEditForm(session.role, form);
}

function appendFormField(parent, label, value, className = '') {
  const item = document.createElement('div');
  item.className = 'leave-sheet-field' + (className ? ` ${className}` : '');
  const caption = document.createElement('span');
  caption.className = 'leave-sheet-label';
  caption.textContent = label;
  const content = document.createElement('strong');
  content.textContent =
    value === null || value === undefined || value === ''
      ? '\u00a0'
      : String(value);
  item.append(caption, content);
  parent.appendChild(item);
}

const leaveSignaturePad = window.createSignaturePad(
  $('leave-signature-pad'),
  $('leave-signature-clear')
);
const templateSignaturePad = window.createSignaturePad(
  $('template-signature-pad'),
  $('template-signature-clear')
);
const headSignaturePad = window.createSignaturePad(
  $('head-signature-pad'),
  $('head-signature-clear')
);
const hrSignaturePad = window.createSignaturePad(
  $('hr-signature-pad'),
  $('hr-signature-clear')
);

function buildLeaveSheet(data, metadata = {}) {
  const sheet = document.createElement('article');
  sheet.className = 'leave-sheet';
  const heading = document.createElement('header');
  heading.className = 'leave-sheet-heading';
  const title = document.createElement('h1');
  title.textContent = 'LEAVE APPLICATION FORM';
  heading.appendChild(title);
  sheet.appendChild(heading);

  const control = document.createElement('div');
  control.className = 'leave-sheet-topline';
  control.textContent = `SERIAL NUMBER: ${metadata.controlNo || ''}    DATE FILED: ${userDate(metadata.submittedAt)}`;
  sheet.appendChild(control);

  const identity = document.createElement('div');
  identity.className = 'leave-sheet-grid';
  appendFormField(
    identity,
    'NAME',
    data.name || session.full_name || session.email,
    'wide'
  );
  appendFormField(identity, 'EMPLOYEE NUMBER', data.employeeNo);
  appendFormField(identity, 'POSITION', data.position);
  appendFormField(identity, 'DEPARTMENT', data.department);
  sheet.appendChild(identity);

  const requestHeading = document.createElement('h2');
  requestHeading.textContent = 'LEAVE APPLICATION';
  sheet.appendChild(requestHeading);
  const leave = document.createElement('div');
  leave.className = 'leave-sheet-grid leave-sheet-request';
  appendFormField(
    leave,
    'TYPE OF LEAVE',
    leaveLabel({ form_data: data }),
    'wide'
  );
  appendFormField(leave, 'FROM', DateUtils.formatDate(data.dateFrom));
  appendFormField(leave, 'TO', DateUtils.formatDate(data.dateTo));
  appendFormField(leave, 'NO. OF DAYS', data.days);
  appendFormField(leave, 'REASON', data.reason, 'wide');
  appendFormField(leave, 'WITH PAY', data.payType === 'WITH_PAY' ? 'X' : '');
  appendFormField(
    leave,
    'WITHOUT PAY',
    data.payType === 'WITHOUT_PAY' ? 'X' : ''
  );
  sheet.appendChild(leave);

  const status = document.createElement('p');
  status.className = 'leave-sheet-status';
  status.textContent = `Status: ${FormStatus.formatFormStatus(metadata.status, metadata.reviewStage, metadata.submitterRole)}`;
  sheet.appendChild(status);

  const signatures = document.createElement('div');
  signatures.className = 'leave-sheet-signatures';
  [
    ['Employee Signature', data.signature],
    [
      `${FormStatus.reviewerLabel(metadata.submitterRole)} Signature`,
      metadata.headSignature
    ],
    ['HR Approval', metadata.hrSignature]
  ].forEach(([label, signature]) => {
    const field = document.createElement('div');
    field.className = 'leave-sheet-signature';
    if (signature) {
      const image = document.createElement('img');
      image.src = signature;
      image.alt = label;
      field.appendChild(image);
    }
    const line = document.createElement('span');
    const caption = document.createElement('small');
    caption.textContent = label;
    field.append(line, caption);
    signatures.appendChild(field);
  });
  sheet.appendChild(signatures);

  const hr = document.createElement('section');
  hr.className = 'leave-sheet-hr';
  const hrTitle = document.createElement('h2');
  hrTitle.textContent = 'FOR HR USE ONLY';
  hr.appendChild(hrTitle);
  const balances = document.createElement('div');
  balances.className = 'leave-sheet-grid';
  appendFormField(balances, 'VL BALANCE', data.vlBalance ?? '');
  appendFormField(balances, 'SL BALANCE', data.slBalance ?? '');
  appendFormField(balances, 'SIL BALANCE', data.silBalance || '');
  hr.appendChild(balances);
  sheet.appendChild(hr);
  return sheet;
}

async function centerSignatureImages(container) {
  const images = Array.from(
    container.querySelectorAll('.leave-sheet-signature img')
  );
  await Promise.all(
    images.map(async (image) => {
      try {
        if (!image.complete)
          await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
          });
        const source = document.createElement('canvas');
        source.width = image.naturalWidth;
        source.height = image.naturalHeight;
        const sourceContext = source.getContext('2d', {
          willReadFrequently: true
        });
        sourceContext.drawImage(image, 0, 0);
        const { data, width, height } = sourceContext.getImageData(
          0,
          0,
          source.width,
          source.height
        );
        let minX = width,
          minY = height,
          maxX = -1,
          maxY = -1;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            if (
              data[offset + 3] > 0 &&
              (data[offset] < 245 ||
                data[offset + 1] < 245 ||
                data[offset + 2] < 245)
            ) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
        }
        if (maxX < minX || maxY < minY) return;
        const normalized = document.createElement('canvas');
        normalized.width = 560;
        normalized.height = 112;
        const context = normalized.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, normalized.width, normalized.height);
        const sourceWidth = maxX - minX + 1;
        const sourceHeight = maxY - minY + 1;
        const scale = Math.min(520 / sourceWidth, 90 / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        context.drawImage(
          source,
          minX,
          minY,
          sourceWidth,
          sourceHeight,
          (normalized.width - drawWidth) / 2,
          (normalized.height - drawHeight) / 2,
          drawWidth,
          drawHeight
        );
        image.src = normalized.toDataURL('image/png');
        await image.decode();
      } catch (_) {
        // Keep the original signature if the browser cannot normalize its image.
      }
    })
  );
}

async function showFormContents(form) {
  const content = $('uf_form_view');
  const template = formTemplate(form.template_key);
  $('leave-view-dialog').setAttribute('aria-label', template.title);
  const metadata = {
    controlNo: form.control_no,
    submittedAt: form.submitted_at,
    status: form.status,
    reviewStage: form.review_stage,
    submitterRole: form.submitter_role || session.role,
    headSignature: form.head_signature,
    headSignedBy: form.head_signed_by,
    headSignedAt: form.head_signed_at,
    hrSignature: form.hr_signature,
    reviewedByName: form.reviewed_by_name,
    reviewedByRole: form.reviewed_by_role,
    reviewedAt: form.reviewed_at,
    reviewNotes: form.status === 'REJECTED' ? form.review_notes : ''
  };
  content.replaceChildren(
    form.template_key === 'leave-2026'
      ? buildLeaveSheet(form.form_data, metadata)
      : buildGenericFormSheet(form.form_data, metadata, template)
  );
  await centerSignatureImages(content);
  $('leave-view-dialog').showModal();
}

async function loadMyForms() {
  const result = await api('listMyForms');
  employeeProfile = result.employeeProfile || {};
  assignedFormReviewer = result.assignedHead || null;
  mySubmittedForms = result.forms;
  const assignedHeadLabel = $('uf_assigned_head');
  if (result.assignedHead) {
    assignedHeadLabel.textContent = `Your ${session.role === 'STAFF' ? 'Supervisor' : session.role === 'HR' ? 'Head HR' : 'Head'}: ${result.assignedHead.full_name} (${result.assignedHead.email})${result.assignedHead.active ? '' : ' — inactive'}`;
    assignedHeadLabel.hidden = false;
  } else if (session.role === 'HR' && session.is_hr_head) {
    assignedHeadLabel.textContent =
      'Your forms go directly to the HR review queue.';
    assignedHeadLabel.hidden = false;
  } else if (session.role === 'HR') {
    assignedHeadLabel.textContent =
      'Your forms are routed to the designated Head HR.';
    assignedHeadLabel.hidden = false;
  } else if (['STAFF', 'SUPERVISOR'].includes(session.role)) {
    assignedHeadLabel.textContent = `No assigned ${session.role === 'STAFF' ? 'Supervisor' : 'Head'} yet`;
    assignedHeadLabel.hidden = false;
  } else {
    assignedHeadLabel.textContent = '';
    assignedHeadLabel.hidden = true;
  }
  updateFormSummary(result.summary);
  renderMyForms();
}

function renderMyForms() {
  const body = $('uf_history');
  const status = $('uf_history_status').value;
  const templateKey = $('uf_history_type').value;
  const search = $('uf_history_search').value.trim();
  const forms = mySubmittedForms
    .filter((form) => matchesFormFilters(form, status, search, templateKey))
    .sort(
      (left, right) =>
        new Date(right.submitted_at) - new Date(left.submitted_at) ||
        right.id - left.id
    );
  body.replaceChildren();
  if (!mySubmittedForms.length) {
    userEmptyRow(body, 7, 'You have not submitted any forms yet.');
    return;
  }
  if (!forms.length) {
    userEmptyRow(body, 7, 'No forms match the selected filters.');
    return;
  }
  forms.forEach((form) => {
    const row = document.createElement('tr');
    row.append(
      userCell(form.control_no),
      userCell(formTemplate(form.template_key).title),
      userCell(form.days_pending === null ? '—' : form.days_pending),
      userCell(userDate(form.submitted_at)),
      userCell(
        FormStatus.formatFormStatus(
          form.status,
          form.review_stage,
          form.submitter_role || session.role
        )
      )
    );
    const notes = document.createElement('td');
    notes.textContent =
      form.status === 'REJECTED' ? form.review_notes || '' : '';
    const actions = document.createElement('td');
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'ghost';
    view.textContent = 'View form';
    view.onclick = () => showFormContents(form);
    const print = document.createElement('button');
    print.type = 'button';
    print.className = 'ghost';
    print.textContent = 'Print / Save PDF';
    print.onclick = () => printSavedForm(form);
    actions.append(view);
    if (canEditSubmittedForm(form)) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'ghost';
      edit.textContent = 'Edit';
      edit.onclick = () =>
        form.template_key === 'leave-2026'
          ? openLeaveForm(form)
          : openTemplateForm(formTemplate(form.template_key), form);
      actions.appendChild(edit);
    }
    actions.appendChild(print);
    row.append(notes, actions);
    body.appendChild(row);
  });
}

function buildFormCatalog() {
  const catalog = $('uf_form_catalog');
  catalog.replaceChildren();
  FORM_TEMPLATES.forEach((template) => {
    const card = document.createElement('article');
    card.className = 'panel form-template';
    const title = document.createElement('h2');
    title.textContent = template.title;
    const description = document.createElement('p');
    description.textContent = template.description;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Fill out form';
    open.onclick = () =>
      template.key === 'leave-2026'
        ? openLeaveForm()
        : openTemplateForm(template);
    actions.appendChild(open);
    card.append(title, description, actions);
    catalog.appendChild(card);
  });
}

function getTimeRecordRows(formData, field) {
  if (Array.isArray(formData?.[field.name])) return formData[field.name];
  const hasLegacyRow = field.columns.some((column) =>
    Object.prototype.hasOwnProperty.call(formData || {}, column.name)
  );
  if (hasLegacyRow) {
    return [
      Object.fromEntries(
        field.columns.map((column) => [
          column.name,
          formData[column.name] || ''
        ])
      )
    ];
  }
  return [{}];
}

function createTimeRecordEditor(field, formData) {
  const section = document.createElement('section');
  section.className = 'time-record-editor';
  if (field.showRowNumber)
    section.classList.add('property-accountability-editor');
  section.dataset.timeRecords = field.name;
  const heading = document.createElement('h3');
  heading.textContent = field.label;
  const scroll = document.createElement('div');
  scroll.className = 'time-record-scroll';
  const table = document.createElement('table');
  table.className = 'time-record-table';
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  if (field.showRowNumber) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = '#';
    header.appendChild(cell);
  }
  field.columns.forEach((column) => {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = column.label;
    header.appendChild(cell);
  });
  thead.appendChild(header);
  const tbody = document.createElement('tbody');
  const addRecord = (record = {}) => {
    const row = document.createElement('tr');
    if (field.showRowNumber) {
      const numberCell = document.createElement('td');
      numberCell.textContent = String(tbody.rows.length + 1);
      numberCell.className = 'time-record-row-number';
      row.appendChild(numberCell);
    }
    field.columns.forEach((column) => {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.type = column.type;
      input.value = record[column.name] || '';
      if (column.required) input.required = true;
      if (column.min !== undefined) input.min = String(column.min);
      if (column.max !== undefined) input.max = String(column.max);
      if (column.step !== undefined) input.step = String(column.step);
      input.dataset.timeRecordField = column.name;
      input.setAttribute(
        'aria-label',
        `${column.label}, day record ${tbody.rows.length + 1}`
      );
      cell.appendChild(input);
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  };
  getTimeRecordRows(formData, field).forEach(addRecord);
  table.append(thead, tbody);
  scroll.appendChild(table);
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'ghost';
  addButton.textContent = 'Add row';
  addButton.onclick = () => {
    if (tbody.rows.length >= 100) return;
    addRecord();
  };
  section.append(heading, scroll, addButton);
  return section;
}

function openTemplateForm(template, existingForm = null) {
  const form = $('user-template-form');
  const confirmation = $('user-template-confirmation');
  form.reset();
  formBeingEdited = existingForm;
  form.dataset.templateKey = template.key;
  $('user-template-title').textContent = existingForm
    ? `Edit ${template.title}`
    : template.title;
  $('user-template-dialog').classList.toggle(
    'time-record-dialog',
    template.fields.some((field) => field.type === 'time-records')
  );
  const fields = $('user-template-fields');
  fields.replaceChildren();
  const deferredFields = [];
  let correctionReason = null;
  template.fields.forEach((field) => {
    if (field.type === 'time-records') {
      fields.appendChild(
        createTimeRecordEditor(field, existingForm?.form_data || {})
      );
      return;
    }
    if (field.legacyTimeRecordColumn) return;
    if (field.afterConfirmation) {
      deferredFields.push(field);
      return;
    }
    const label = document.createElement('label');
    if (field.type === 'checkbox') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'acknowledgment-checkbox';
      input.name = field.name;
      input.required = Boolean(field.required);
      input.checked = Boolean(
        existingForm && existingForm.form_data[field.name]
      );
      const text = document.createElement('span');
      text.textContent = field.label;
      label.className = 'form-acknowledgment';
      label.append(input, text);
      fields.appendChild(label);
      return;
    }
    const input = document.createElement(
      field.type === 'textarea' ? 'textarea' : 'input'
    );
    if (field.type === 'textarea') {
      label.classList.add('form-narrative-field');
      input.rows = 3;
    }
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.explanation) input.dataset.explanation = 'true';
    if (field.type !== 'textarea') input.type = field.type;
    input.name = field.name;
    label.textContent = field.label;
    label.appendChild(input);
    if (template.key === 'nexus-no-in-out' && field.name === 'reason')
      correctionReason = label;
    else fields.appendChild(label);
    input.required = Boolean(field.required);
    if (field.maxLength) input.maxLength = field.maxLength;
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
    if (field.step !== undefined) input.step = String(field.step);
    if (field.name === 'reportsTo') {
      input.value = existingForm?.form_data?.reportsTo ?? assignedFormReviewer?.full_name ?? '';
      input.readOnly = true;
    } else if (existingForm) {
      input.value =
        existingForm.form_data[field.name] === undefined
          ? ''
          : String(existingForm.form_data[field.name]);
    } else if (field.defaultToday && field.type === 'date') {
      input.value = DateUtils.manilaDate();
    } else if (
      Object.prototype.hasOwnProperty.call(
        employeeProfile,
        field.name === 'employeeNo' ? 'emp_no' : field.name
      )
    ) {
      input.value =
        employeeProfile[field.name === 'employeeNo' ? 'emp_no' : field.name] ||
        '';
    } else if (field.name === 'name') {
      input.value = session.full_name || session.email;
    }
    applyApplicantIdentity(input, field.name);
  });
  confirmation.className = 'form-acknowledgment';
  const confirmationInput = confirmation.querySelector('input');
  confirmationInput.type = 'checkbox';
  confirmationInput.className = 'acknowledgment-checkbox';
  fields.appendChild(confirmation);
  if (correctionReason) fields.appendChild(correctionReason);
  deferredFields.forEach((field) => {
    const label = document.createElement('label');
    label.className = 'form-acknowledgment';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'acknowledgment-checkbox';
    input.name = field.name;
    input.required = Boolean(field.required);
    input.checked = Boolean(existingForm?.form_data?.[field.name]);
    const text = document.createElement('span');
    text.textContent = field.label;
    label.append(input, text);
    fields.appendChild(label);
  });
  $('user-template-submit').textContent = existingForm
    ? 'Save changes'
    : 'Submit for review';
  $('user-template-dialog').showModal();
  templateSignaturePad.clear();
}

function setOtherLeaveVisibility() {
  const isOther = $('leave-form').elements.leaveType.value === 'Others';
  $('leave-other-wrap').hidden = !isOther;
  $('leave-form').elements.otherLeaveType.required = isOther;
}

function updateLeaveAllocation(saved = {}) {
  const form = $('leave-form');
  const target = $('leave-year-allocation');
  const first = Number(form.elements.dateFrom.value.slice(0, 4));
  const last = Number(form.elements.dateTo.value.slice(0, 4));
  const prior = Object.fromEntries(Array.from(target.querySelectorAll('input'), (input) => [input.name, input.value]));
  target.replaceChildren();
  const paidAllowance = form.elements.payType.value === 'WITH_PAY' &&
    ['Sick Leave (SL)', 'Vacation Leave (VL)'].includes(form.elements.leaveType.value);
  target.hidden = !(paidAllowance && first && last && last === first + 1);
  if (target.hidden) return;
  [first, last].forEach((year) => {
    const label = document.createElement('label');
    label.textContent = `Leave Days In ${year}`;
    const input = document.createElement('input');
    input.type = 'number'; input.min = '0'; input.step = '0.5'; input.required = true;
    input.name = `leaveDays${year}`;
    input.value = prior[input.name] ?? saved[year] ?? '';
    label.appendChild(input);
    target.appendChild(label);
  });
}

async function refreshLeaveBalances(selectPay = false) {
  const form = $('leave-form');
  const year = Number(form.elements.dateFrom.value.slice(0, 4)) || Number(DateUtils.manilaDate().slice(0, 4));
  const request = ++leaveBalanceRequest;
  $('leave-available-balances').hidden = true;
  try {
    const balances = await api('getMyLeaveBalances', year);
    if (request !== leaveBalanceRequest) return;
    $('leave-sick-balance').textContent = `${balances.SL} left`;
    $('leave-vacation-balance').textContent = `${balances.VL} left`;
    $('leave-balance-year').textContent = String(year);
    $('leave-available-balances').hidden = false;
    if (selectPay) {
      const type = form.elements.leaveType.value;
      const available = type === 'Sick Leave (SL)' ? balances.SL : type === 'Vacation Leave (VL)' ? balances.VL : null;
      form.elements.payType.value = available === null || (balances.eligible && available > 0) ? 'WITH_PAY' : 'WITHOUT_PAY';
      updateLeaveAllocation();
    }
  } catch (error) {
    if (request === leaveBalanceRequest) showErr(error.message || String(error));
  }
}

function openLeaveForm(existingForm = null) {
  const form = $('leave-form');
  form.reset();
  formBeingEdited = existingForm;
  form.elements.name.value =
    employeeProfile.name || session.full_name || session.email;
  form.elements.employeeNo.value = employeeProfile.emp_no || '';
  form.elements.position.value = employeeProfile.position || '';
  form.elements.department.value = employeeProfile.department || '';
  $('leave-form-title').textContent = existingForm
    ? 'Edit Leave Application'
    : 'Leave Application';
  $('leave-form-submit').textContent = existingForm
    ? 'Save changes'
    : 'Submit for review';
  $('leave-form').elements.otherLeaveType.required = false;
  if (existingForm) {
    const data = existingForm.form_data;
    [
      'name',
      'employeeNo',
      'position',
      'department',
      'leaveType',
      'otherLeaveType',
      'dateFrom',
      'dateTo',
      'days',
      'reason'
    ].forEach((name) => {
      form.elements[name].value = data[name] === undefined ? '' : data[name];
    });
    form.querySelectorAll('[name="payType"]').forEach((option) => {
      option.checked = option.value === data.payType;
    });
  }
  ['name', 'employeeNo', 'position', 'department'].forEach((name) => {
    form.elements[name].readOnly = true;
  });
  setOtherLeaveVisibility();
  updateLeaveAllocation(existingForm?.form_data?.yearAllocation || {});
  if (!existingForm) form.elements.payType.value = 'WITH_PAY';
  refreshLeaveBalances(!existingForm);
  $('leave-form-dialog').showModal();
  leaveSignaturePad.clear();
}

async function submitLeaveRequest(event) {
  event.preventDefault();
  const form = $('leave-form');
  if (!FormValidation.hasSufficientExplanation(form.elements.reason.value)) {
    showErr('Insufficient explanation.');
    form.elements.reason.focus();
    return;
  }
  if (!leaveSignaturePad.hasSignature()) {
    showErr('Draw your electronic signature before submitting.');
    return;
  }
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const values = new FormData(form);
    const formData = {
      name: values.get('name'),
      employeeNo: values.get('employeeNo'),
      position: values.get('position'),
      department: values.get('department'),
      leaveType: values.get('leaveType'),
      otherLeaveType: values.get('otherLeaveType'),
      dateFrom: values.get('dateFrom'),
      dateTo: values.get('dateTo'),
      days: values.get('days'),
      reason: values.get('reason'),
      yearAllocation: Object.fromEntries(Array.from($('leave-year-allocation').querySelectorAll('input'), (input) => [input.name.replace('leaveDays', ''), input.value])),
      payType: values.get('payType'),
      signature: leaveSignaturePad.toDataURL()
    };
    if (formBeingEdited) {
      await api(
        'updateMyForm',
        formBeingEdited.id,
        formBeingEdited.template_key,
        formData
      );
    } else {
      await api('submitLeaveForm', formData);
    }
    $('leave-form-dialog').close();
    const wasEdited = Boolean(formBeingEdited);
    formBeingEdited = null;
    if (wasEdited) await loadMyForms();
    else go(FORM_NAV.find(([id]) => id === 'user-dashboard'));
    AppFeedback.success(
      wasEdited ? 'Changes saved successfully.' : 'Submitted successfully.'
    );
  } catch (error) {
    showErr(error.message || String(error));
  } finally {
    submit.disabled = false;
  }
}

async function printSavedLeaveForm(form) {
  await printLeaveForm(form.form_data, {
    controlNo: form.control_no,
    submittedAt: form.submitted_at,
    status: form.status,
    headSignature: form.head_signature,
    hrSignature: form.hr_signature,
    reviewedByName: form.reviewed_by_name,
    reviewedByRole: form.reviewed_by_role,
    reviewedAt: form.reviewed_at,
    reviewStage: form.review_stage,
    submitterRole: form.submitter_role || session.role,
    reviewNotes: form.review_notes
  });
}

function buildGenericFormSheet(formData, metadata, template) {
  const sheet = document.createElement('article');
  sheet.className = 'leave-sheet';
  const heading = document.createElement('header');
  heading.className = 'leave-sheet-heading';
  const title = document.createElement('h1');
  title.textContent = template.title.toUpperCase();
  heading.appendChild(title);
  sheet.appendChild(heading);

  const control = document.createElement('div');
  control.className = 'leave-sheet-topline';
  control.textContent = `SERIAL NUMBER: ${metadata.controlNo || ''}    DATE FILED: ${userDate(metadata.submittedAt)}`;
  sheet.appendChild(control);

  const fields = document.createElement('div');
  fields.className = 'leave-sheet-grid leave-sheet-request';
  appendFormField(
    fields,
    'NAME',
    formData.name || session.full_name || session.email,
    'wide'
  );
  template.fields.forEach((field) => {
    if (field.name === 'name') return;
    if (field.type === 'time-records' || field.legacyTimeRecordColumn) return;
    if (field.name === 'reportsTo' && !formData.reportsTo) return;
    const value =
      field.type === 'checkbox'
        ? formData[field.name]
          ? 'Acknowledged'
          : 'Not acknowledged'
        : DateUtils.formatField(formData[field.name], field.type);
    appendFormField(
      fields,
      field.label.toUpperCase(),
      value,
      field.type === 'textarea' ? 'wide' : ''
    );
  });
  if (template.key === 'nexus-no-in-out' && formData.witnessName)
    appendFormField(fields, 'WITNESS NAME', formData.witnessName);
  sheet.appendChild(fields);
  const timeRecordField = template.fields.find(
    (field) => field.type === 'time-records'
  );
  if (timeRecordField)
    appendTimeRecordsToSheet(
      sheet,
      getTimeRecordRows(formData, timeRecordField),
      timeRecordField
    );

  const status = document.createElement('p');
  status.className = 'leave-sheet-status';
  status.textContent = `Status: ${FormStatus.formatFormStatus(metadata.status, metadata.reviewStage, metadata.submitterRole)}`;
  sheet.appendChild(status);

  const signatures = document.createElement('div');
  signatures.className = 'leave-sheet-signatures';
  const signatureFields = [['Employee Signature', formData.signature]];
  if (template.headSignatureRequired !== false)
    signatureFields.push([
      `${FormStatus.reviewerLabel(metadata.submitterRole)} Signature`,
      metadata.headSignature
    ]);
  if (template.hrSignatureRequired !== false)
    signatureFields.push(['HR Approval', metadata.hrSignature]);
  signatures.classList.toggle('two-signatures', signatureFields.length === 2);
  signatureFields.forEach(([label, signature]) => {
    const field = document.createElement('div');
    field.className = 'leave-sheet-signature';
    if (signature) {
      const image = document.createElement('img');
      image.src = signature;
      image.alt = label;
      field.appendChild(image);
    }
    const line = document.createElement('span');
    const caption = document.createElement('small');
    caption.textContent = label;
    field.append(line, caption);
    signatures.appendChild(field);
  });
  sheet.appendChild(signatures);

  if (metadata.status === 'REJECTED' && metadata.reviewNotes) {
    const reason = document.createElement('section');
    reason.className = 'leave-sheet-hr';
    const reasonTitle = document.createElement('h2');
    reasonTitle.textContent = 'REJECTION REASON';
    reason.append(reasonTitle);
    const value = document.createElement('p');
    value.textContent = metadata.reviewNotes;
    reason.appendChild(value);
    sheet.appendChild(reason);
  }
  return sheet;
}

function appendTimeRecordsToSheet(sheet, records, field) {
  const heading = document.createElement('h2');
  heading.textContent = field.label.toUpperCase();
  const scroll = document.createElement('div');
  scroll.className = 'time-record-print-scroll';
  const table = document.createElement('table');
  table.className = 'time-record-print-table';
  if (field.showRowNumber)
    table.classList.add('property-accountability-print-table');
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  field.columns.forEach((column) => {
    const cell = document.createElement('th');
    cell.textContent = column.label.toUpperCase();
    header.appendChild(cell);
  });
  if (field.showRowNumber) {
    const cell = document.createElement('th');
    cell.textContent = '#';
    header.insertBefore(cell, header.firstChild);
  }
  thead.appendChild(header);
  const tbody = document.createElement('tbody');
  records.forEach((record, index) => {
    const row = document.createElement('tr');
    if (field.showRowNumber) {
      const cell = document.createElement('td');
      cell.textContent = String(index + 1);
      row.appendChild(cell);
    }
    field.columns.forEach((column) => {
      const cell = document.createElement('td');
      cell.textContent =
        DateUtils.formatField(record[column.name], column.type) || '';
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
  table.append(thead, tbody);
  scroll.appendChild(table);
  sheet.append(heading, scroll);
}

async function printSavedForm(form) {
  if (form.template_key === 'leave-2026') {
    await printSavedLeaveForm(form);
    return;
  }
  const template = formTemplate(form.template_key);
  const root = $('leave-print-root');
  root.replaceChildren(
    buildGenericFormSheet(
      form.form_data,
      {
        controlNo: form.control_no,
        submittedAt: form.submitted_at,
        status: form.status,
        headSignature: form.head_signature,
        hrSignature: form.hr_signature,
        reviewedByName: form.reviewed_by_name,
        reviewedByRole: form.reviewed_by_role,
        reviewedAt: form.reviewed_at,
        reviewStage: form.review_stage,
        submitterRole: form.submitter_role || session.role,
        reviewNotes: form.status === 'REJECTED' ? form.review_notes : ''
      },
      template
    )
  );
  await centerSignatureImages(root);
  openPrintDialog();
}

async function printLeaveForm(data, metadata) {
  const root = $('leave-print-root');
  root.replaceChildren(buildLeaveSheet(data, metadata));
  await centerSignatureImages(root);
  openPrintDialog();
}

function openPrintDialog() {
  const cleanup = () => document.body.classList.remove('printing-leave-form');
  window.addEventListener('afterprint', cleanup, { once: true });
  document.body.classList.add('printing-leave-form');
  try {
    window.print();
  } catch (error) {
    cleanup();
    showErr(
      `The form was saved, but the print dialog could not be opened. ${error.message || String(error)}`
    );
  }
}

function reviewRow(form) {
  const row = document.createElement('tr');
  const reviewReason = userCell(
    form.status === 'REJECTED' ? form.review_notes || '-' : '-'
  );
  reviewReason.className = 'review-reason-cell';
  row.append(
    userCell(form.control_no),
    userCell(formTemplate(form.template_key).title),
    userCell(`${form.applicant_name || ''} (${form.user_email})`),
    userCell(userDate(form.submitted_at)),
    userCell(
      FormStatus.formatFormStatus(
        form.status,
        form.review_stage,
        form.submitter_role
      )
    ),
    reviewReason
  );
  const actions = document.createElement('td');
  actions.className = 'form-review-actions';
  const view = document.createElement('button');
  view.type = 'button';
  view.className = 'ghost';
  view.textContent = 'View form';
  view.onclick = () => showFormContents(form);
  actions.appendChild(view);
  const isHead = form.review_stage === 'HEAD';
  const activeTemplate = formTemplate(form.template_key);
  const noReviewerSignature = isHead
    ? activeTemplate.headSignatureRequired === false
    : activeTemplate.hrSignatureRequired === false;
  const canReviewStage = isHead
    ? (session.role === 'SUPERVISOR' && form.submitter_role === 'STAFF') ||
      (session.role === 'HEAD' && form.submitter_role === 'SUPERVISOR') ||
      (session.role === 'HR' &&
        session.is_hr_head &&
        form.submitter_role === 'HR')
    : ['HR', 'ADMIN'].includes(session.role) &&
      session.perms.includes('forms.review');
  const awaitingReviewer = form.status === 'PENDING' && canReviewStage;
  if (awaitingReviewer) {
    ['APPROVED', 'REJECTED'].forEach((decision) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent =
        decision === 'APPROVED'
          ? noReviewerSignature
            ? 'Approve'
            : 'Sign'
          : 'Reject';
      if (decision === 'REJECTED') button.className = 'ghost';
      button.onclick = async () => {
        if (decision === 'REJECTED') {
          openFormRejection(form);
          return;
        }
        if (isHead) {
          if (noReviewerSignature) {
            await approveWithoutReviewerSignature(form, button);
            return;
          }
          openHeadSignature(form);
          return;
        }
        if (noReviewerSignature) {
          await approveWithoutReviewerSignature(form, button);
          return;
        }
        openHrSignature(form);
      };
      actions.appendChild(button);
    });
  } else if (
    form.status === 'PENDING' &&
    form.review_stage === 'HR' &&
    form.head_reviewer_email === session.email &&
    ['SUPERVISOR', 'HEAD'].includes(session.role)
  ) {
    actions.appendChild(
      document.createTextNode(
        `Signed and forwarded to HR/Admin · ${form.head_signed_by || ''} ${userDate(form.head_signed_at)}`
      )
    );
  } else {
    const reviewerAction =
      form.status === 'APPROVED'
        ? `Approved by ${form.reviewed_by_role === 'ADMIN' ? 'Admin' : 'HR'}: ${form.reviewed_by_name || 'HR/Admin'}`
        : form.status === 'REJECTED'
          ? `Rejected by ${form.reviewed_by_role === 'SUPERVISOR' ? 'Supervisor' : form.reviewed_by_role === 'HEAD' ? 'Head' : form.reviewed_by_role === 'ADMIN' ? 'Admin' : 'HR'}: ${form.reviewed_by_name || 'reviewer'}`
          : form.reviewed_by_name;
    const reviewDetails = document.createElement('span');
    reviewDetails.textContent = [reviewerAction, userDate(form.reviewed_at)]
      .filter(Boolean)
      .join(' · ');
    actions.appendChild(reviewDetails);
  }
  row.appendChild(actions);
  return row;
}

async function approveWithoutReviewerSignature(form, button) {
  button.disabled = true;
  try {
    await api('reviewUserForm', form.id, 'APPROVED', '', '');
    await loadFormsForReview();
    AppFeedback.success('Approved successfully.');
  } catch (error) {
    showErr(error.message || String(error));
    button.disabled = false;
  }
}

async function setHrLeaveBalances(containerId, form) {
  const container = $(containerId);
  const visible =
    form.template_key === 'leave-2026' && form.review_stage === 'HR';
  container.hidden = !visible;
  const data = form.form_data || {};
  container.querySelector('[name="silBalance"]').value = data.silBalance || '';
  container.querySelector('[name="vlBalance"]').value = '';
  container.querySelector('[name="slBalance"]').value = '';
  if (!visible) return;
  try {
    const balances = await api('getReviewLeaveBalances', form.id);
    container.querySelector('[name="vlBalance"]').value = balances.VL;
    container.querySelector('[name="slBalance"]').value = balances.SL;
  } catch (error) { showErr(error.message || String(error)); }
}

function getHrLeaveBalances(containerId, form) {
  if (form.template_key !== 'leave-2026' || form.review_stage !== 'HR')
    return null;
  const container = $(containerId);
  return {
    silBalance: container.querySelector('[name="silBalance"]').value.trim()
  };
}

let formToReject = null;

function openHeadSignature(form) {
  formToSign = form;
  $('head-signature-control').textContent = `Serial Number ${form.control_no}`;
  const hrHeadApproval = session.is_hr_head && form.submitter_role === 'HR';
  $('head-signature-dialog').querySelector('h2').textContent = hrHeadApproval
    ? 'Sign and approve HR form'
    : 'Sign and forward form';
  $('head-signature-pad').previousElementSibling.textContent =
    session.is_hr_head
      ? 'Head HR signature'
      : session.role === 'SUPERVISOR'
        ? 'Supervisor signature'
        : 'Head signature';
  $('head-signature-form').querySelector('[type="submit"]').textContent =
    'Sign';
  $('head-signature-dialog').showModal();
  headSignaturePad.clear();
}

async function signAndForwardForm(event) {
  event.preventDefault();
  if (!formToSign) return;
  if (!headSignaturePad.hasSignature()) {
    showErr(
      session.is_hr_head && formToSign.submitter_role === 'HR'
        ? 'Draw your signature before approving this HR form.'
        : 'Draw your signature before forwarding this form.'
    );
    return;
  }
  const submit = $('head-signature-form').querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const isHrHeadApproval =
      session.is_hr_head && formToSign.submitter_role === 'HR';
    await api(
      'reviewUserForm',
      formToSign.id,
      'APPROVED',
      '',
      headSignaturePad.toDataURL()
    );
    $('head-signature-dialog').close();
    formToSign = null;
    AppFeedback.success(
      isHrHeadApproval ? 'Approved successfully.' : 'Forwarded successfully.'
    );
    await loadFormsForReview();
  } catch (error) {
    showErr(error.message || String(error));
  } finally {
    submit.disabled = false;
  }
}

function openFormRejection(form) {
  formToReject = form;
  $('form-rejection-control').textContent = `Serial Number ${form.control_no}`;
  $('form-rejection-reason').value = '';
  setHrLeaveBalances('form-rejection-leave-balances', form);
  $('form-rejection-dialog').showModal();
  $('form-rejection-reason').focus();
}

async function rejectSelectedForm(event) {
  event.preventDefault();
  if (!formToReject) return;
  const reason = $('form-rejection-reason').value.trim();
  if (!reason) {
    showErr('Enter a reason for rejection.');
    return;
  }

  const submit = $('form-rejection-form').querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api(
      'reviewUserForm',
      formToReject.id,
      'REJECTED',
      reason,
      '',
      getHrLeaveBalances('form-rejection-leave-balances', formToReject)
    );
    $('form-rejection-dialog').close();
    formToReject = null;
    await loadFormsForReview();
    AppFeedback.success('Rejected successfully.');
  } catch (error) {
    showErr(error.message || String(error));
  } finally {
    submit.disabled = false;
  }
}

function openHrSignature(form) {
  formToApprove = form;
  $('hr-signature-control').textContent = `Serial Number ${form.control_no}`;
  setHrLeaveBalances('hr-leave-balances', form);
  $('hr-signature-dialog').showModal();
  hrSignaturePad.clear();
}

async function signAndApproveForm(event) {
  event.preventDefault();
  if (!formToApprove) return;
  if (!hrSignaturePad.hasSignature()) {
    showErr('Draw your signature before approving this form.');
    return;
  }
  const submit = $('hr-signature-form').querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api(
      'reviewUserForm',
      formToApprove.id,
      'APPROVED',
      '',
      hrSignaturePad.toDataURL(),
      getHrLeaveBalances('hr-leave-balances', formToApprove)
    );
    $('hr-signature-dialog').close();
    formToApprove = null;
    await loadFormsForReview();
    AppFeedback.success('Approved successfully.');
  } catch (error) {
    showErr(error.message || String(error));
  } finally {
    submit.disabled = false;
  }
}

async function loadFormsForReview(scope = activeReviewScope) {
  const request = ++reviewLoadVersion;
  const owner = session.email;
  activeReviewScope = 'ALL';
  const dateFromInput = $('uf_review_date_from');
  const dateToInput = $('uf_review_date_to');
  for (const input of [dateFromInput, dateToInput]) {
    if (input.reportValidity && !input.reportValidity()) return;
  }
  const dateFrom = dateFromInput.value;
  const dateTo = dateToInput.value;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    AppUI.feedback('The start date must be on or before the end date.', true);
    return;
  }
  const result = await api('listFormsForReview', activeReviewScope, {
    dateFrom,
    dateTo
  });
  if (request !== reviewLoadVersion || owner !== session.email) return;

  formsForReview = result.forms;
  const prefix = 'uf_review';
  $(`${prefix}_total`).textContent = String(result.summary.total);
  $(`${prefix}_pending`).textContent = String(result.summary.pending);
  $(`${prefix}_approved`).textContent = String(result.summary.approved);
  $(`${prefix}_rejected`).textContent = String(result.summary.rejected);
  setSubmittedFormsCount(result.summary.pending, activeReviewScope);
  renderFormsForReview();
}

function renderFormsForReview() {
  const prefix = 'uf_review';
  const body = $('uf_review');
  const status = $(`${prefix}_status`).value;
  const type = $(`${prefix}_type`).value;
  const search = $(`${prefix}_search`).value.trim();
  const forms = formsForReview
    .filter((form) => matchesFormFilters(form, status, search, type))
    .sort(
      (left, right) =>
        new Date(right.submitted_at) - new Date(left.submitted_at) ||
        right.id - left.id
    );
  body.replaceChildren();
  if (!formsForReview.length) {
    userEmptyRow(
      body,
      7,
      $('uf_review_date_from').value || $('uf_review_date_to').value
        ? 'No forms match the selected filters.'
        : 'No forms are available for your review permissions.'
    );
    return;
  }
  if (!forms.length) {
    userEmptyRow(body, 7, 'No forms match the selected filters.');
    return;
  }
  forms.forEach((form) => body.appendChild(reviewRow(form)));
}

async function submitTemplateForm(event) {
  event.preventDefault();
  const template = FORM_TEMPLATES.find(
    (item) => item.key === $('user-template-form').dataset.templateKey
  );
  if (!template) return;
  const form = $('user-template-form');
  const submit = form.querySelector('[type="submit"]');
  const explanation = form.querySelector('[data-explanation]');
  if (explanation && !FormValidation.hasSufficientExplanation(explanation.value)) {
    showErr('Insufficient explanation.');
    explanation.focus();
    return;
  }
  if (!templateSignaturePad.hasSignature()) {
    showErr('Draw your electronic signature before submitting.');
    return;
  }
  submit.disabled = true;
  try {
    const values = new FormData(form);
    const data = {};
    template.fields.forEach((field) => {
      if (field.type === 'time-records' || field.legacyTimeRecordColumn) return;
      data[field.name] =
        field.type === 'checkbox'
          ? values.get(field.name) === 'on'
          : values.get(field.name) || '';
    });
    form.querySelectorAll('[data-time-records]').forEach((editor) => {
      const records = Array.from(editor.querySelectorAll('tbody tr'), (row) =>
        Object.fromEntries(
          Array.from(
            row.querySelectorAll('[data-time-record-field]'),
            (input) => [input.dataset.timeRecordField, input.value]
          )
        )
      );
      data[editor.dataset.timeRecords] = records;
      if (
        ['time-in-out', 'nexus-no-in-out'].includes(template.key) &&
        records.length === 1
      ) {
        Object.assign(data, records[0]);
      }
    });
    data.signature = templateSignaturePad.toDataURL();
    if (formBeingEdited) {
      await api('updateMyForm', formBeingEdited.id, template.key, data);
    } else {
      await api('submitUserForm', template.key, data);
    }
    $('user-template-dialog').close();
    form.dataset.templateKey = '';
    const wasEdited = Boolean(formBeingEdited);
    formBeingEdited = null;
    if (wasEdited) await loadMyForms();
    else go(FORM_NAV.find(([id]) => id === 'user-dashboard'));
    AppFeedback.success(
      wasEdited ? 'Changes saved successfully.' : 'Submitted successfully.'
    );
  } catch (error) {
    showErr(error.message || String(error));
  } finally {
    submit.disabled = false;
  }
}

async function refreshSubmittedFormsBadge(scope = 'HR') {
  const requestedScope = String(scope).toUpperCase();
  const normalizedScope = ['HEAD', 'ALL'].includes(requestedScope)
    ? requestedScope
    : 'HR';
  const summary = await api('getFormReviewSummary', normalizedScope);
  setSubmittedFormsCount(summary.pending, normalizedScope);
}

window.refreshSubmittedFormsBadge = refreshSubmittedFormsBadge;

let pendingAnnouncements = [];
let pendingIncidentNotifications = [];
let dailyNteReminders = [];

let announcementPopupLoading = false;
async function showPendingAnnouncements() {
  if (
    announcementPopupLoading ||
    !session ||
    document.hidden ||
    document.querySelector('dialog[open]')
  )
    return;
  announcementPopupLoading = true;
  try {
    await loadPendingAnnouncementsPopup();
  } finally {
    announcementPopupLoading = false;
  }
}
async function loadPendingAnnouncementsPopup() {
  const owner = session.email;
  const [announcements, notifications, reminders] = await Promise.all([
    session.perms.includes('announcements.read')
      ? api('listUnseenAnnouncements')
      : Promise.resolve([]),
    api('listPendingIncidentNotifications'),
    api('listDailyNteReminders')
  ]);
  if (owner !== session?.email) return;
  pendingAnnouncements = announcements;
  pendingIncidentNotifications = notifications;
  dailyNteReminders = reminders;
  if (
    !pendingAnnouncements.length &&
    !pendingIncidentNotifications.length &&
    !dailyNteReminders.length
  )
    return;
  const list = $('staff-announcements-list');
  list.replaceChildren();
  pendingAnnouncements.forEach((announcement) => {
    const card = document.createElement('article');
    card.className = 'announcement-card';
    const title = document.createElement('h3');
    title.textContent = announcement.title;
    const message = document.createElement('p');
    message.className = 'announcement-message';
    message.textContent = announcement.message;
    const details = document.createElement('p');
    details.className = 'note';
    details.textContent = `From ${announcement.created_by_name} · ${userDate(announcement.created_at)}`;
    card.append(title, message, details);
    list.appendChild(card);
  });
  pendingIncidentNotifications.forEach((notification) => {
    const card = document.createElement('article');
    card.className = 'announcement-card';
    const title = document.createElement('h3');
    title.textContent = notification.title;
    const message = document.createElement('p');
    message.className = 'announcement-message';
    message.textContent = notification.type.startsWith('INFO_REQ_')
      ? `${notification.caseNumber}: ${notification.requestText}`
      : notification.type === 'INVESTIGATION_STARTED'
        ? `A further investigation has started for ${notification.caseNumber}. Review the case in TRACK and respond to any information request addressed to you.`
        : notification.type === 'NTE_ISSUED'
          ? `${notification.caseNumber} has advanced. Open HRIS to view information available to your account.`
          : `${notification.caseNumber}: ${notification.subject} — ${notification.reportedEmployeeName}`;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open Incident Report';
    open.onclick = async () => {
      open.disabled = true;
      try {
        $('staff-announcements-dialog').close();
        await window.openIncidentRoute(
          notification.incidentId,
          notification.type === 'CASE_CLOSED' &&
            ['HR', 'ADMIN'].includes(session.role)
            ? 'incident-review'
            : notification.target,
          notification.id
        );
      } catch (error) {
        open.disabled = false;
        $('staff-announcements-dialog').showModal();
        showErr(error.message || String(error));
      }
    };
    card.append(title, message, open);
    list.appendChild(card);
  });
  dailyNteReminders.forEach((reminder) => {
    const card = document.createElement('article');
    card.className = 'announcement-card';
    const title = document.createElement('h3');
    title.textContent = 'You have an NTE requiring an explanation';
    const message = document.createElement('p');
    message.className = 'announcement-message';
    const days = Number(reminder.daysRemaining);
    message.textContent = reminder.overdueAt
      ? `${reminder.caseNumber}: your explanation is overdue. Please respond as soon as possible.`
      : days > 0
        ? `${reminder.caseNumber}: ${days} working day${days === 1 ? '' : 's'} remaining. Deadline: ${DateUtils.formatDate(reminder.deadlineDate)}.`
        : reminder.dueToday
          ? `${reminder.caseNumber}: your explanation is due today (${DateUtils.formatDate(reminder.deadlineDate)}).`
          : `${reminder.caseNumber}: 0 working days remaining. Deadline: ${DateUtils.formatDate(reminder.deadlineDate)}.`;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open case in Track';
    open.onclick = async () => {
      $('staff-announcements-dialog').close();
      await window.openIncidentRoute(reminder.incidentId, 'incident-track');
    };
    card.append(title, message, open);
    list.appendChild(card);
  });
  $('staff-announcements-dialog').querySelector('h2').textContent =
    'Notifications';
  $('staff-announcements-acknowledge').textContent = pendingAnnouncements.length
    ? 'Acknowledge announcements'
    : 'Close';
  $('staff-announcements-dialog').dataset.outsideDismiss =
    pendingAnnouncements.length ? 'never' : '';
  $('staff-announcements-dialog').showModal();
}

async function acknowledgePendingAnnouncements() {
  const button = $('staff-announcements-acknowledge');
  button.disabled = true;
  try {
    if (pendingAnnouncements.length)
      await api(
        'markAnnouncementsSeen',
        pendingAnnouncements.map((announcement) => announcement.id)
      );
    await Promise.all(
      pendingIncidentNotifications.map((notification) =>
        api('markIncidentNotificationSeen', notification.id)
      )
    );
    pendingAnnouncements = [];
    pendingIncidentNotifications = [];
    $('staff-announcements-dialog').close();
  } catch (error) {
    showErr(error.message || String(error));
  } finally {
    button.disabled = false;
  }
}

window.showPendingAnnouncements = showPendingAnnouncements;

['leave-form', 'user-template-form'].forEach((id) => {
  $(id).addEventListener('invalid', (event) => {
    if (event.target.dataset.explanation !== 'true') return;
    event.preventDefault();
    showErr('Insufficient explanation.');
    event.target.focus();
  }, true);
});

VIEWS['user-dashboard'] = guard(loadMyForms);
VIEWS['user-forms'] = guard(loadMyForms);
VIEWS['leave-requests'] = guard(() => loadFormsForReview('ALL'));
buildFormCatalog();
$('uf_history_type').replaceChildren();
fillFormTypeFilter($('uf_history_type'));
fillFormTypeFilter($('uf_review_type'));
$('uf_review_refresh').onclick = guard(() => loadFormsForReview('ALL'));
$('uf_history_status').onchange = renderMyForms;
$('uf_history_type').onchange = renderMyForms;
$('uf_history_search').oninput = renderMyForms;
$('uf_review_status').onchange = renderFormsForReview;
$('uf_review_type').onchange = renderFormsForReview;
$('uf_review_search').oninput = renderFormsForReview;
$('uf_review_date_from').onchange = guard(() => loadFormsForReview('ALL'));
$('uf_review_date_to').onchange = guard(() => loadFormsForReview('ALL'));
$('uf_review_clear_dates').onclick = guard(async () => {
  $('uf_review_date_from').value = '';
  $('uf_review_date_to').value = '';
  await loadFormsForReview('ALL');
});
$('leave-form').elements.leaveType.onchange = () => { setOtherLeaveVisibility(); refreshLeaveBalances(true); };
$('leave-form').elements.dateFrom.onchange = () => { updateLeaveAllocation(); refreshLeaveBalances(false); };
$('leave-form').elements.dateTo.onchange = () => updateLeaveAllocation();
$('leave-form').querySelectorAll('[name="payType"]').forEach((input) => {
  input.addEventListener('change', () => updateLeaveAllocation());
});
$('leave-form').onsubmit = submitLeaveRequest;
$('uf_cancel_leave').onclick = () => {
  $('leave-form-dialog').close();
  formBeingEdited = null;
};
$('uf_close_view').onclick = () => $('leave-view-dialog').close();
$('user-template-form').onsubmit = submitTemplateForm;
$('head-signature-form').onsubmit = signAndForwardForm;
$('hr-signature-form').onsubmit = signAndApproveForm;
$('hr-signature-cancel').onclick = () => {
  $('hr-signature-dialog').close();
  formToApprove = null;
};
$('head-signature-cancel').onclick = () => {
  $('head-signature-dialog').close();
  formToSign = null;
};
$('user-template-cancel').onclick = () => {
  $('user-template-dialog').close();
  $('user-template-form').dataset.templateKey = '';
  formBeingEdited = null;
};
$('form-rejection-form').onsubmit = rejectSelectedForm;
$('form-rejection-cancel').onclick = () => {
  $('form-rejection-dialog').close();
  formToReject = null;
};
$('staff-announcements-acknowledge').onclick = acknowledgePendingAnnouncements;
$('staff-announcements-dialog').addEventListener('cancel', (event) =>
  event.preventDefault()
);
