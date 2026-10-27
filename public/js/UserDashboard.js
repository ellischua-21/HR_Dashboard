let mySubmittedForms = [];
let formsForReview = [];
let formToSign = null;
let formToApprove = null;
let formBeingEdited = null;
let activeReviewScope = 'HR';
let employeeProfile = {};

const userCell = (value) => {
  const cell = document.createElement('td');
  cell.textContent = value === null || value === undefined ? '' : String(value);
  return cell;
};

function userEmptyRow(body, columns, message) {
  const row = document.createElement('tr');
  const cell = userCell(message);
  cell.colSpan = columns;
  row.appendChild(cell);
  body.appendChild(row);
}

function fillFormTypeFilter(select) {
  select.replaceChildren();
  const allTypes = document.createElement('option');
  allTypes.value = '';
  allTypes.textContent = 'All form types';
  select.appendChild(allTypes);
  FORM_TEMPLATES.forEach((template) => {
    const option = document.createElement('option');
    option.value = template.key;
    option.textContent = template.title;
    select.appendChild(option);
  });
}

function userDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function leaveLabel(form) {
  const data = form.form_data;
  return data.leaveType === 'Others' && data.otherLeaveType
    ? `Other: ${data.otherLeaveType}`
    : data.leaveType;
}

function leaveRange(form) {
  const data = form.form_data;
  return `${data.dateFrom} to ${data.dateTo}`;
}

function formTemplate(templateKey) {
  return (
    FORM_TEMPLATES.find((template) => template.key === templateKey) || {
      key: templateKey,
      title: 'Submitted form',
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
    .map((field) => `${field.label}: ${String(data[field.name]).slice(0, 80)}`)
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
  return (
    ['STAFF', 'HEAD', 'HR'].includes(session.role) &&
    form.status === 'PENDING' &&
    form.review_stage === 'HEAD' &&
    Boolean(form.head_reviewer_email)
  );
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

function createSignaturePad(canvas, clearButton) {
  const context = canvas.getContext('2d');
  let hasSignature = false;
  let drawing = false;

  function clear() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, bounds.width, bounds.height);
    context.strokeStyle = '#14213d';
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    hasSignature = false;
  }

  function position(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const point = position(event);
    context.beginPath();
    context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fillStyle = context.strokeStyle;
    context.fill();
    context.beginPath();
    context.moveTo(point.x, point.y);
    hasSignature = true;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    const point = position(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    hasSignature = true;
  });
  const stopDrawing = () => {
    drawing = false;
  };
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);
  clearButton.addEventListener('click', clear);
  clear();

  return {
    clear,
    hasSignature: () => hasSignature,
    toDataURL: () => {
      if (!hasSignature) return '';
      const { data, width, height } = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );
      let minX = width,
        minY = height,
        maxX = -1,
        maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          if (
            data[offset] < 245 ||
            data[offset + 1] < 245 ||
            data[offset + 2] < 245
          ) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      if (maxX < minX || maxY < minY) return '';
      const output = document.createElement('canvas');
      output.width = 560;
      output.height = 112;
      const outputContext = output.getContext('2d');
      outputContext.fillStyle = '#fff';
      outputContext.fillRect(0, 0, output.width, output.height);
      const sourceWidth = maxX - minX + 1;
      const sourceHeight = maxY - minY + 1;
      const scale = Math.min(520 / sourceWidth, 90 / sourceHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      outputContext.drawImage(
        canvas,
        minX,
        minY,
        sourceWidth,
        sourceHeight,
        (output.width - drawWidth) / 2,
        (output.height - drawHeight) / 2,
        drawWidth,
        drawHeight
      );
      return output.toDataURL('image/png');
    }
  };
}

const leaveSignaturePad = createSignaturePad(
  $('leave-signature-pad'),
  $('leave-signature-clear')
);
const templateSignaturePad = createSignaturePad(
  $('template-signature-pad'),
  $('template-signature-clear')
);
const headSignaturePad = createSignaturePad(
  $('head-signature-pad'),
  $('head-signature-clear')
);
const hrSignaturePad = createSignaturePad(
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
  const year = document.createElement('p');
  year.textContent = 'HR FORM REVISED 2026';
  heading.append(title, year);
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
  appendFormField(leave, 'FROM', data.dateFrom);
  appendFormField(leave, 'TO', data.dateTo);
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
  status.textContent = `Status: ${FormStatus.formatFormStatus(metadata.status, metadata.reviewStage)}`;
  sheet.appendChild(status);

  const signatures = document.createElement('div');
  signatures.className = 'leave-sheet-signatures';
  [
    ['Employee Signature', data.signature],
    ['Head Signature', metadata.headSignature],
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
  appendFormField(balances, 'VL BALANCE', data.vlBalance || '');
  appendFormField(balances, 'SL BALANCE', data.slBalance || '');
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
  $('uf_form_view_title').textContent = template.title;
  const metadata = {
    controlNo: form.control_no,
    submittedAt: form.submitted_at,
    status: form.status,
    reviewStage: form.review_stage,
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
  mySubmittedForms = result.forms;
  const assignedHeadLabel = $('uf_assigned_head');
  if (result.assignedHead) {
    assignedHeadLabel.textContent = `Your Head: ${result.assignedHead.full_name} (${result.assignedHead.email})${result.assignedHead.active ? '' : ' — inactive'}`;
    assignedHeadLabel.hidden = false;
  } else if (session.role === 'HR' && session.is_hr_head) {
    assignedHeadLabel.textContent =
      'Your forms go directly to the HR review queue.';
    assignedHeadLabel.hidden = false;
  } else if (session.role === 'HR') {
    assignedHeadLabel.textContent =
      'Your forms are routed to the designated Head HR.';
    assignedHeadLabel.hidden = false;
  } else if (session.role === 'STAFF' || session.role === 'USER') {
    assignedHeadLabel.textContent = 'No assigned Head yet';
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
      userCell(FormStatus.formatFormStatus(form.status, form.review_stage))
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

function openTemplateForm(template, existingForm = null) {
  const form = $('user-template-form');
  const confirmation = $('user-template-confirmation');
  form.reset();
  formBeingEdited = existingForm;
  form.dataset.templateKey = template.key;
  $('user-template-title').textContent = existingForm
    ? `Edit ${template.title}`
    : template.title;
  $('user-template-feedback').hidden = true;
  const fields = $('user-template-fields');
  fields.replaceChildren();
  template.fields.forEach((field) => {
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
    label.textContent = field.label;
    const input = document.createElement(
      field.type === 'textarea' ? 'textarea' : 'input'
    );
    if (field.type !== 'textarea') input.type = field.type;
    input.name = field.name;
    input.required = Boolean(field.required);
    if (field.maxLength) input.maxLength = field.maxLength;
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
    if (field.step !== undefined) input.step = String(field.step);
    label.appendChild(input);
    fields.appendChild(label);
    if (existingForm) {
      input.value =
        existingForm.form_data[field.name] === undefined
          ? ''
          : String(existingForm.form_data[field.name]);
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
  });
  confirmation.className = 'form-acknowledgment';
  const confirmationInput = confirmation.querySelector('input');
  confirmationInput.type = 'checkbox';
  confirmationInput.className = 'acknowledgment-checkbox';
  fields.appendChild(confirmation);
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
  setOtherLeaveVisibility();
  $('uf_submit_feedback').hidden = true;
  $('leave-form-dialog').showModal();
  leaveSignaturePad.clear();
}

async function submitLeaveRequest(event) {
  event.preventDefault();
  const form = $('leave-form');
  const feedback = $('uf_submit_feedback');
  if (!leaveSignaturePad.hasSignature()) {
    feedback.textContent = 'Draw your electronic signature before submitting.';
    feedback.hidden = false;
    return;
  }
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  feedback.hidden = true;
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
    else go(USER_NAV[0]);
    $('uf_global_feedback').textContent = wasEdited
      ? 'Changes saved successfully.'
      : 'Submitted successfully.';
    $('uf_global_feedback').hidden = false;
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
  const year = document.createElement('p');
  year.textContent = 'NEXUS INGREDIENTS INC.';
  heading.append(title, year);
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
    const value =
      field.type === 'checkbox'
        ? formData[field.name]
          ? 'Acknowledged'
          : 'Not acknowledged'
        : formData[field.name];
    appendFormField(
      fields,
      field.label.toUpperCase(),
      value,
      field.type === 'textarea' ? 'wide' : ''
    );
  });
  sheet.appendChild(fields);

  const status = document.createElement('p');
  status.className = 'leave-sheet-status';
  status.textContent = `Status: ${FormStatus.formatFormStatus(metadata.status, metadata.reviewStage)}`;
  sheet.appendChild(status);

  const signatures = document.createElement('div');
  signatures.className = 'leave-sheet-signatures';
  const signatureFields = [
    ['Employee Signature', formData.signature],
    ['Head Signature', metadata.headSignature]
  ];
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
    userCell(FormStatus.formatFormStatus(form.status, form.review_stage)),
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
  const noHrSignature =
    !isHead && formTemplate(form.template_key).hrSignatureRequired === false;
  const canReviewStage = isHead
    ? (session.role === 'HEAD' &&
        ['STAFF', 'HEAD'].includes(form.submitter_role)) ||
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
          ? noHrSignature
            ? 'Approve'
            : isHead && !(session.is_hr_head && form.submitter_role === 'HR')
              ? 'Sign and forward'
              : 'Sign and approve'
          : 'Reject';
      if (decision === 'REJECTED') button.className = 'ghost';
      button.onclick = async () => {
        if (decision === 'REJECTED') {
          openFormRejection(form);
          return;
        }
        if (isHead) {
          openHeadSignature(form);
          return;
        }
        if (noHrSignature) {
          await approveWithoutHrSignature(form, button);
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
    session.role === 'HEAD'
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
          ? `Rejected by ${form.reviewed_by_role === 'HEAD' ? 'Head' : form.reviewed_by_role === 'ADMIN' ? 'Admin' : 'HR'}: ${form.reviewed_by_name || 'reviewer'}`
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

async function approveWithoutHrSignature(form, button) {
  button.disabled = true;
  try {
    await api('reviewUserForm', form.id, 'APPROVED', '', '');
    await loadFormsForReview();
    $('uf_review_feedback').textContent = 'Approved successfully.';
    $('uf_review_feedback').hidden = false;
  } catch (error) {
    showErr(error.message || String(error));
    button.disabled = false;
  }
}

function setHrLeaveBalances(containerId, form) {
  const container = $(containerId);
  const visible =
    form.template_key === 'leave-2026' && form.review_stage === 'HR';
  container.hidden = !visible;
  const data = form.form_data || {};
  ['vlBalance', 'slBalance', 'silBalance'].forEach((name) => {
    container.querySelector(`[name="${name}"]`).value = data[name] || '';
  });
}

function getHrLeaveBalances(containerId, form) {
  if (form.template_key !== 'leave-2026' || form.review_stage !== 'HR')
    return null;
  const container = $(containerId);
  return {
    vlBalance: container.querySelector('[name="vlBalance"]').value.trim(),
    slBalance: container.querySelector('[name="slBalance"]').value.trim(),
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
    session.is_hr_head ? 'Head HR signature' : 'Head signature';
  $('head-signature-form').querySelector('[type="submit"]').textContent =
    hrHeadApproval ? 'Sign and approve' : 'Sign and forward to HR/Admin';
  $('head-signature-feedback').hidden = true;
  $('head-signature-dialog').showModal();
  headSignaturePad.clear();
}

async function signAndForwardForm(event) {
  event.preventDefault();
  if (!formToSign) return;
  const feedback = $('head-signature-feedback');
  if (!headSignaturePad.hasSignature()) {
    feedback.textContent =
      session.is_hr_head && formToSign.submitter_role === 'HR'
        ? 'Draw your signature before approving this HR form.'
        : 'Draw your signature before forwarding this form.';
    feedback.hidden = false;
    return;
  }
  const submit = $('head-signature-form').querySelector('[type="submit"]');
  submit.disabled = true;
  feedback.hidden = true;
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
    $('uf_review_feedback').textContent = isHrHeadApproval
      ? 'Approved successfully.'
      : 'Forwarded successfully.';
    $('uf_review_feedback').hidden = false;
    await loadFormsForReview();
  } catch (error) {
    feedback.textContent = error.message || String(error);
    feedback.hidden = false;
  } finally {
    submit.disabled = false;
  }
}

function openFormRejection(form) {
  formToReject = form;
  $('form-rejection-control').textContent = `Serial Number ${form.control_no}`;
  $('form-rejection-reason').value = '';
  setHrLeaveBalances('form-rejection-leave-balances', form);
  $('form-rejection-feedback').hidden = true;
  $('form-rejection-dialog').showModal();
  $('form-rejection-reason').focus();
}

async function rejectSelectedForm(event) {
  event.preventDefault();
  if (!formToReject) return;
  const reason = $('form-rejection-reason').value.trim();
  const feedback = $('form-rejection-feedback');
  if (!reason) {
    feedback.textContent = 'Enter a reason for rejection.';
    feedback.hidden = false;
    return;
  }

  const submit = $('form-rejection-form').querySelector('[type="submit"]');
  submit.disabled = true;
  feedback.hidden = true;
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
    $('uf_review_feedback').textContent = 'Rejected successfully.';
    $('uf_review_feedback').hidden = false;
  } catch (error) {
    feedback.textContent = error.message || String(error);
    feedback.hidden = false;
  } finally {
    submit.disabled = false;
  }
}

function openHrSignature(form) {
  formToApprove = form;
  $('hr-signature-control').textContent = `Serial Number ${form.control_no}`;
  $('hr-signature-feedback').hidden = true;
  setHrLeaveBalances('hr-leave-balances', form);
  $('hr-signature-dialog').showModal();
  hrSignaturePad.clear();
}

async function signAndApproveForm(event) {
  event.preventDefault();
  if (!formToApprove) return;
  const feedback = $('hr-signature-feedback');
  if (!hrSignaturePad.hasSignature()) {
    feedback.textContent = 'Draw your signature before approving this form.';
    feedback.hidden = false;
    return;
  }
  const submit = $('hr-signature-form').querySelector('[type="submit"]');
  submit.disabled = true;
  feedback.hidden = true;
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
    $('uf_review_feedback').textContent = 'Approved successfully.';
    $('uf_review_feedback').hidden = false;
  } catch (error) {
    feedback.textContent = error.message || String(error);
    feedback.hidden = false;
  } finally {
    submit.disabled = false;
  }
}

async function loadFormsForReview(scope = activeReviewScope) {
  activeReviewScope = 'ALL';
  const result = await api('listFormsForReview', activeReviewScope);
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
      'No forms are available for your review permissions.'
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
  const feedback = $('user-template-feedback');
  if (!templateSignaturePad.hasSignature()) {
    feedback.textContent = 'Draw your electronic signature before submitting.';
    feedback.hidden = false;
    return;
  }
  submit.disabled = true;
  feedback.hidden = true;
  try {
    const values = new FormData(form);
    const data = {};
    template.fields.forEach((field) => {
      data[field.name] =
        field.type === 'checkbox'
          ? values.get(field.name) === 'on'
          : values.get(field.name) || '';
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
    else go(USER_NAV[0]);
    $('uf_global_feedback').textContent = wasEdited
      ? 'Changes saved successfully.'
      : 'Submitted successfully.';
    $('uf_global_feedback').hidden = false;
  } catch (error) {
    feedback.textContent = error.message || String(error);
    feedback.hidden = false;
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

async function showPendingAnnouncements() {
  pendingAnnouncements = await api('listUnseenAnnouncements');
  if (!pendingAnnouncements.length) return;
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
  $('staff-announcements-feedback').hidden = true;
  $('staff-announcements-dialog').showModal();
}

async function acknowledgePendingAnnouncements() {
  const button = $('staff-announcements-acknowledge');
  const feedback = $('staff-announcements-feedback');
  button.disabled = true;
  feedback.hidden = true;
  try {
    await api(
      'markAnnouncementsSeen',
      pendingAnnouncements.map((announcement) => announcement.id)
    );
    pendingAnnouncements = [];
    $('staff-announcements-dialog').close();
  } catch (error) {
    feedback.textContent = error.message || String(error);
    feedback.hidden = false;
  } finally {
    button.disabled = false;
  }
}

window.showPendingAnnouncements = showPendingAnnouncements;

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
$('leave-form').elements.leaveType.onchange = setOtherLeaveVisibility;
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
