const INCIDENT_API_BASE = window.HR_API_BASE || 'http://localhost:3001/api';
let pendingIncidentCaseId = null;
let incidentFileContext = null;
let incidentCodeProvisions = [];

function incidentElement(tag, className = '', text = undefined) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setIncidentFeedback(element, message, isError = false) {
  element.textContent = message;
  element.className = isError ? 'errs' : 'okmsg';
  element.hidden = !message;
}

function wireIncidentSearch(input, employeeId, suggestions, purpose) {
  let requestNumber = 0;
  let timer = null;
  input.autocomplete = 'off';
  input.addEventListener('input', () => {
    employeeId.value = '';
    const current = ++requestNumber;
    clearTimeout(timer);
    suggestions.replaceChildren();
    if (input.value.trim().length < 2) {
      suggestions.hidden = true;
      return;
    }
    timer = setTimeout(async () => {
      try {
        const matches = await api(
          'searchIncidentEmployees',
          input.value.trim(),
          purpose
        );
        if (current !== requestNumber) return;
        suggestions.replaceChildren();
        matches.forEach((employee) => {
          const option = incidentElement('button', 'incident-suggestion');
          option.type = 'button';
          option.setAttribute('role', 'option');
          option.append(
            incidentElement('strong', '', employee.name || ''),
            incidentElement(
              'small',
              '',
              [
                `Employee ID: ${employee.employeeId}`,
                employee.employeeNo,
                employee.department,
                employee.position
              ]
                .filter(Boolean)
                .join(' · ')
            )
          );
          option.addEventListener('click', () => {
            input.value = employee.name || '';
            employeeId.value = employee.employeeId;
            suggestions.hidden = true;
            suggestions.replaceChildren();
          });
          suggestions.appendChild(option);
        });
        if (!matches.length) {
          suggestions.appendChild(
            incidentElement(
              'p',
              'incident-no-suggestions',
              'No matching employees.'
            )
          );
        }
        suggestions.hidden = false;
      } catch (error) {
        if (current !== requestNumber) return;
        suggestions.replaceChildren(
          incidentElement(
            'p',
            'incident-no-suggestions',
            error.message || String(error)
          )
        );
        suggestions.hidden = false;
      }
    }, 250);
  });
  input.addEventListener('blur', () => {
    window.setTimeout(() => (suggestions.hidden = true), 150);
  });
  input.addEventListener('focus', () => {
    if (suggestions.childElementCount) suggestions.hidden = false;
  });
}

function buildParticipantInputs(containerId, title) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  const fields = [];
  for (let number = 1; number <= 3; number += 1) {
    const label = incidentElement('label', 'incident-search-field');
    label.append(document.createTextNode(`${number}. ${title}`));
    const input = incidentElement('input');
    input.type = 'search';
    const employeeId = incidentElement('input');
    employeeId.type = 'hidden';
    const suggestions = incidentElement('div', 'incident-suggestions');
    suggestions.setAttribute('role', 'listbox');
    suggestions.hidden = true;
    label.append(input, employeeId, suggestions);
    wireIncidentSearch(input, employeeId, suggestions, 'participant');
    container.appendChild(label);
    fields.push({ input, employeeId });
  }
  return fields;
}

const incidentPersonInputs = buildParticipantInputs(
  'ir-persons-involved',
  'Person involved'
);
const incidentWitnessInputs = buildParticipantInputs('ir-witnesses', 'Witness');
const reportedEmployeeInput = document.getElementById('ir-reported-employee');
const reportedEmployeeId = document.getElementById('ir-reported-employee-id');
wireIncidentSearch(
  reportedEmployeeInput,
  reportedEmployeeId,
  document.getElementById('ir-reported-employee-options'),
  'reported'
);

async function loadIncidentFile() {
  const feedback = document.getElementById('ir-file-feedback');
  setIncidentFeedback(feedback, '');
  try {
    incidentFileContext = await api('getIncidentFileContext');
    document.getElementById('ir-reporter-name').value =
      incidentFileContext.reporter.name;
    document.getElementById('ir-reporter-department').value =
      incidentFileContext.reporter.department;
    document.getElementById('ir-reporter-position').value =
      incidentFileContext.reporter.position;
    document.getElementById('ir-date-reported').value =
      incidentFileContext.dateReported;
  } catch (error) {
    setIncidentFeedback(feedback, error.message || String(error), true);
  }
}

function formatIncidentBytes(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readIncidentFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function incidentFileMimeType(file) {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop().toLowerCase();
  return (
    {
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      rtf: 'application/rtf',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      txt: 'text/plain',
      csv: 'text/csv',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      pdf: 'application/pdf'
    }[extension] || ''
  );
}

function participantValues(fields) {
  return fields.map(({ input, employeeId }) => ({
    employeeId: employeeId.value,
    name: input.value.trim()
  }));
}

async function submitIncidentReport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById('ir-submit');
  const feedback = document.getElementById('ir-file-feedback');
  const files = [...document.getElementById('ir-evidence').files];
  setIncidentFeedback(feedback, '');
  if (!reportedEmployeeId.value) {
    setIncidentFeedback(
      feedback,
      'Select the reported employee from the suggestions.',
      true
    );
    return;
  }
  if (files.length > 10 || files.some((file) => file.size > 8 * 1024 * 1024)) {
    setIncidentFeedback(
      feedback,
      'Attach up to 10 files, each 8 MB or smaller.',
      true
    );
    return;
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > 18 * 1024 * 1024) {
    setIncidentFeedback(
      feedback,
      'The combined evidence files must be 18 MB or smaller.',
      true
    );
    return;
  }

  button.disabled = true;
  try {
    const evidence = await Promise.all(
      files.map(async (file) => ({
        fileName: file.name,
        mimeType: incidentFileMimeType(file),
        dataUrl: await readIncidentFile(file)
      }))
    );
    const result = await api('submitIncidentReport', {
      reportedEmployeeId: reportedEmployeeId.value,
      subject: document.getElementById('ir-subject').value,
      incidentDate: document.getElementById('ir-incident-date').value,
      location: document.getElementById('ir-location').value,
      incidentTime: document.getElementById('ir-time').value,
      description: document.getElementById('ir-description').value,
      personsInvolved: participantValues(incidentPersonInputs),
      witnesses: participantValues(incidentWitnessInputs),
      comments: document.getElementById('ir-comments').value,
      evidence
    });
    form.reset();
    document.getElementById('ir-reporter-name').value =
      incidentFileContext.reporter.name;
    document.getElementById('ir-reporter-department').value =
      incidentFileContext.reporter.department;
    document.getElementById('ir-reporter-position').value =
      incidentFileContext.reporter.position;
    reportedEmployeeId.value = '';
    [...incidentPersonInputs, ...incidentWitnessInputs].forEach((field) => {
      field.employeeId.value = '';
    });
    document
      .querySelectorAll('#incident-file-form .incident-suggestions')
      .forEach((suggestions) => {
        suggestions.replaceChildren();
        suggestions.hidden = true;
      });
    document.getElementById('ir-evidence-list').textContent = '';
    setIncidentFeedback(
      feedback,
      `Incident Report submitted. Case ${result.caseNumber}.`
    );
    document.getElementById('ir-date-reported').value = result.dateReported;
    await window.refreshInboxBadge().catch((error) => console.error(error));
    await refreshIncidentBadges().catch((error) => console.error(error));
  } catch (error) {
    setIncidentFeedback(feedback, error.message || String(error), true);
  } finally {
    button.disabled = false;
  }
}

document.getElementById('ir-evidence').addEventListener('change', (event) => {
  const files = [...event.currentTarget.files];
  document.getElementById('ir-evidence-list').textContent = files.length
    ? files
        .map((file) => `${file.name} (${formatIncidentBytes(file.size)})`)
        .join(' · ')
    : 'No evidence attached.';
});
document
  .getElementById('incident-file-form')
  .addEventListener('submit', submitIncidentReport);

function appendCaseField(parent, label, value) {
  const item = incidentElement('div', 'incident-case-field');
  item.append(
    incidentElement('strong', '', label),
    incidentElement('span', '', value || '—')
  );
  parent.appendChild(item);
}

function appendIncidentParticipantList(parent, type, participants) {
  const people = participants.filter(
    (person) => person.participantType === type
  );
  const section = incidentElement('section', 'incident-case-section');
  section.appendChild(
    incidentElement(
      'h3',
      '',
      type === 'INVOLVED' ? 'Names of Persons Involved' : 'Names of Witnesses'
    )
  );
  if (!people.length) {
    section.appendChild(incidentElement('p', 'note', 'None listed.'));
  } else {
    const list = incidentElement('ol');
    people.forEach((person) => {
      const item = incidentElement(
        'li',
        '',
        person.employeeId
          ? `${person.name} (Employee ID: ${person.employeeId})`
          : person.name
      );
      list.appendChild(item);
    });
    section.appendChild(list);
  }
  parent.appendChild(section);
}

function incidentSignatureFor(signatures, role) {
  return signatures.find((signature) => signature.role === role);
}

function canSignIncidentAs(incident, role) {
  if (incident.signatures.some((signature) => signature.role === role))
    return false;
  if (role === 'EMPLOYEE')
    return (
      incident.status === 'PENDING SIGNATURE' &&
      incident.reportedEmployeeEmail === incident.currentUserEmail
    );
  if (role === 'HEAD')
    return (
      incident.status === 'PENDING SIGNATURE' &&
      incident.assignedHeadEmail === incident.currentUserEmail
    );
  return role === 'HR' && incident.status === 'SIGNED' && incident.canReview;
}

function renderIncidentSignature(parent, incident, role, label, padSetup) {
  const signature = incidentSignatureFor(incident.signatures, role);
  const section = incidentElement('section', 'incident-signature-field');
  section.appendChild(incidentElement('h3', '', label));
  if (signature) {
    const image = incidentElement('img', 'incident-signature-image');
    image.src = signature.signature;
    image.alt = `${label} signature`;
    section.appendChild(image);
    section.appendChild(
      incidentElement(
        'p',
        'note',
        `Signed by ${signature.signerEmail} · ${new Date(signature.signedAt).toLocaleString()}`
      )
    );
  } else if (canSignIncidentAs(incident, role)) {
    const canvas = incidentElement(
      'canvas',
      'signature-pad incident-signature-pad'
    );
    canvas.width = 560;
    canvas.height = 120;
    canvas.setAttribute('aria-label', `Sign as ${label}`);
    const controls = incidentElement('div', 'actions');
    const clear = incidentElement('button', 'ghost', 'Clear signature');
    const sign = incidentElement('button', '', `Sign as ${label}`);
    clear.type = sign.type = 'button';
    controls.append(clear, sign);
    section.append(canvas, controls);
    padSetup.push(() => {
      const pad = window.createSignaturePad(canvas, clear);
      sign.addEventListener('click', async () => {
        sign.disabled = true;
        try {
          const data = pad.toDataURL();
          if (!data) throw new Error('Draw your signature first.');
          await api('signIncidentCase', incident.id, role, data);
          await window
            .refreshInboxBadge()
            .catch((error) => console.error(error));
          await refreshIncidentBadges().catch((error) => console.error(error));
          await openIncidentCase(incident.id);
          if (!document.getElementById('view-incident-track').hidden)
            await loadIncidentTrack();
          if (!document.getElementById('view-incident-review').hidden)
            await loadIncidentReview();
        } catch (error) {
          setIncidentFeedback(
            document.getElementById('ir-case-feedback'),
            error.message || String(error),
            true
          );
        } finally {
          sign.disabled = false;
        }
      });
    });
  } else {
    section.appendChild(incidentElement('p', 'note', 'Signature pending.'));
  }
  parent.appendChild(section);
}

function escapeIncidentHtml(value) {
  return String(value || '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
  );
}

function manilaTodayInputValue() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addWorkingDaysInBrowser(dateValue, count) {
  if (!dateValue) return '';
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  let remaining = Number(count);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining--;
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function createNteDocumentHtml(incident, nte) {
  const evidence = (nte.evidence || [])
    .map((file) => `<li>${escapeIncidentHtml(file.fileName)}</li>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Notice to Explain — ${escapeIncidentHtml(incident.caseNumber)}</title>
  <style>@page{size:letter;margin:22mm}body{font:14px Arial,sans-serif;color:#172033;line-height:1.5;max-width:780px;margin:24px auto}h1{text-align:center;font-size:22px}h2{font-size:16px;border-bottom:1px solid #999;padding-bottom:5px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px}.label{font-weight:700}pre{font:inherit;white-space:pre-wrap}.signature{max-width:240px;max-height:80px}button{padding:8px 14px}@media print{button{display:none}body{margin:0}}</style></head><body>
  <button onclick="window.print()">Print / Save as PDF</button><h1>NOTICE TO EXPLAIN</h1>
  <div class="meta"><div><span class="label">Case Number:</span> ${escapeIncidentHtml(incident.caseNumber)}</div><div><span class="label">Date Issued:</span> ${escapeIncidentHtml(nte.issuanceDate)}</div>
  <div><span class="label">Employee:</span> ${escapeIncidentHtml(incident.reportedEmployeeName)}</div><div><span class="label">Employee ID:</span> ${escapeIncidentHtml(incident.reportedEmployeeId)}</div>
  <div><span class="label">Department:</span> ${escapeIncidentHtml(incident.reportedEmployeeDepartment)}</div><div><span class="label">Position:</span> ${escapeIncidentHtml(incident.reportedEmployeePosition)}</div>
  <div><span class="label">Date of Receipt:</span> ${escapeIncidentHtml(nte.receiptDate)}</div><div><span class="label">Response Period:</span> ${escapeIncidentHtml(nte.responseWorkingDays)} working days</div><div><span class="label">Explanation Deadline:</span> ${escapeIncidentHtml(nte.deadlineDate)}</div></div>
  <h2>Incident Details</h2><div class="meta"><div><span class="label">Subject:</span> ${escapeIncidentHtml(incident.subject)}</div><div><span class="label">Date:</span> ${escapeIncidentHtml(incident.incidentDate)}</div><div><span class="label">Location:</span> ${escapeIncidentHtml(incident.location)}</div><div><span class="label">Time:</span> ${escapeIncidentHtml(String(incident.incidentTime).slice(0, 5))}</div></div><pre>${escapeIncidentHtml(incident.description)}</pre>
  <h2>Alleged Violation</h2><p><strong>${escapeIncidentHtml(nte.provisionCode)} — ${escapeIncidentHtml(nte.provisionTitle)}</strong></p><pre>${escapeIncidentHtml(nte.provisionText)}</pre><h2>Explanation of the Allegation</h2><pre>${escapeIncidentHtml(nte.allegation)}</pre>
  <h2>Supporting Evidence</h2><ul>${evidence || '<li>None attached</li>'}</ul>
  <h2>Authorized HR Signatory</h2><p>${escapeIncidentHtml(nte.signerName)} (${escapeIncidentHtml(nte.signerEmail)})</p>${nte.signature ? `<img class="signature" src="${nte.signature}" alt="HR signature">` : ''}
  <p>Please provide your explanation by the deadline stated above. Issuance of this notice does not establish that an allegation is true.</p></body></html>`;
}

function downloadIncidentHtml(filename, html) {
  const url = URL.createObjectURL(
    new Blob([html], { type: 'text/html;charset=utf-8' })
  );
  const link = incidentElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openNtePreview(incident, nte) {
  const preview = window.open('', '_blank');
  if (!preview)
    throw new Error('Allow the preview window to open, then try again.');
  preview.document.open();
  preview.document.write(createNteDocumentHtml(incident, nte));
  preview.document.close();
}

function renderIncidentNte(parent, incident, padSetup) {
  if (
    !incident.nte &&
    !(
      incident.canReview &&
      ['UNDER_REVIEW', 'UNDER INVESTIGATION'].includes(incident.status)
    )
  )
    return;
  const section = incidentElement('section', 'incident-case-section');
  section.appendChild(
    incidentElement(
      'h3',
      '',
      incident.nte ? 'Notice to Explain' : 'Notice to Explain'
    )
  );
  const employeeCanAccess =
    incident.reportedEmployeeEmail.toLowerCase() ===
    incident.currentUserEmail.toLowerCase();

  if (incident.nte && ['ISSUED'].includes(incident.nte.status)) {
    const nte = incident.nte;
    section.appendChild(
      incidentElement(
        'p',
        'note',
        `Issued ${nte.issuanceDate}. Receipt documented ${nte.receiptDate}. Deadline: ${nte.deadlineDate}${nte.overdueAt ? ' · Overdue' : ''}.`
      )
    );
    const view = incidentElement('button', 'ghost', 'View NTE');
    view.type = 'button';
    view.onclick = () => openNtePreview(incident, nte);
    const download = incidentElement('button', 'ghost', 'Download NTE');
    download.type = 'button';
    download.onclick = () =>
      downloadIncidentHtml(
        `${incident.caseNumber}-NTE.html`,
        createNteDocumentHtml(incident, nte)
      );
    section.append(view, download);
    (nte.evidence || []).forEach((file) => {
      const link = incidentElement(
        'a',
        '',
        `${file.fileName} (${formatIncidentBytes(file.byteSize)})`
      );
      link.href = `${INCIDENT_API_BASE}/incidents/nte-evidence/${file.id}`;
      link.download = file.fileName;
      section.appendChild(link);
    });
    const days = Number(nte.daysRemaining);
    const countdown = incidentElement(
      'p',
      nte.overdueAt ? 'errs' : 'note',
      nte.overdueAt
        ? 'Explanation overdue'
        : days === 0
          ? 'Explanation due today'
          : `${days} working day${days === 1 ? '' : 's'} remaining`
    );
    section.appendChild(countdown);
  }

  if (
    incident.canReview &&
    ['UNDER_REVIEW', 'UNDER INVESTIGATION'].includes(incident.status) &&
    (!incident.nte || incident.nte.status === 'DRAFT')
  ) {
    const editor = incidentElement('div', 'incident-nte-editor');
    editor.appendChild(incidentElement('h4', '', 'Prepare and issue an NTE'));
    const provision = incidentElement('select');
    provision.appendChild(
      new Option('Loading Code of Conduct provisions…', '')
    );
    const allegation = incidentElement('textarea');
    allegation.rows = 5;
    allegation.maxLength = 12000;
    allegation.placeholder = 'Explain the specific allegation';
    allegation.value = incident.nte?.allegation || '';
    const issueDate = incidentElement('input');
    issueDate.type = 'date';
    issueDate.value = incident.nte?.issuanceDate || manilaTodayInputValue();
    const receiptDate = incidentElement('input');
    receiptDate.type = 'date';
    receiptDate.value = incident.nte?.receiptDate || '';
    const responseDays = incidentElement('input');
    responseDays.type = 'number';
    responseDays.min = '1';
    responseDays.max = '60';
    responseDays.value = incident.nte?.responseWorkingDays || '5';
    const deadline = incidentElement('input');
    deadline.type = 'date';
    deadline.value = incident.nte?.deadlineDate || '';
    const updateCalculatedDeadline = () => {
      if (receiptDate.value)
        deadline.value = addWorkingDaysInBrowser(
          receiptDate.value,
          responseDays.value
        );
    };
    receiptDate.addEventListener('change', updateCalculatedDeadline);
    responseDays.addEventListener('change', updateCalculatedDeadline);
    if (!deadline.value && receiptDate.value) updateCalculatedDeadline();
    const evidence = incidentElement('input');
    evidence.type = 'file';
    evidence.multiple = true;
    evidence.accept =
      '.pdf,.doc,.docx,.rtf,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.mp3,.wav,.mp4,.mov';
    const fields = incidentElement('div', 'fgrid');
    const field = (label, input) => {
      const wrapper = incidentElement('label', '', label);
      wrapper.appendChild(input);
      fields.appendChild(wrapper);
    };
    field('Alleged Code of Conduct provision', provision);
    field('Date of issuance', issueDate);
    field('Documented date of receipt', receiptDate);
    field('Response period (working days)', responseDays);
    field('Explanation deadline (confirm HR policy)', deadline);
    const provisionText = incidentElement(
      'p',
      'note',
      'Select a provision to include its current Code of Conduct text.'
    );
    const deadlineNote = incidentElement(
      'p',
      'note',
      'The response period defaults to five working days and can be changed for this NTE. The calculated deadline skips weekends; adjust it to match the HR-approved procedure and calendar.'
    );
    provision.addEventListener('change', () => {
      const item = incidentCodeProvisions.find(
        (row) => String(row.id) === provision.value
      );
      provisionText.textContent = item ? item.description : '';
    });
    const savedProvisionId = incident.nte?.provisionId;
    api('listIncidentCodeProvisions')
      .then((rows) => {
        incidentCodeProvisions = rows;
        provision.replaceChildren(new Option('Select a provision', ''));
        rows.forEach((row) =>
          provision.add(new Option(`${row.code} — ${row.title}`, row.id))
        );
        if (savedProvisionId) provision.value = String(savedProvisionId);
        provision.dispatchEvent(new Event('change'));
      })
      .catch((error) =>
        provision.replaceChildren(
          new Option(error.message || 'Could not load provisions', '')
        )
      );
    const signatureCanvas = incidentElement(
      'canvas',
      'signature-pad incident-signature-pad'
    );
    signatureCanvas.width = 560;
    signatureCanvas.height = 120;
    signatureCanvas.setAttribute(
      'aria-label',
      'Authorized HR signatory signature'
    );
    let ntePad = null;
    const clear = incidentElement('button', 'ghost', 'Clear signature');
    clear.type = 'button';
    const signatureControls = incidentElement('div', 'actions');
    signatureControls.appendChild(clear);
    const currentUser = incidentElement(
      'p',
      'note',
      `Authorized HR signatory: ${incident.currentUserEmail}`
    );
    const feedback = incidentElement('p');
    feedback.hidden = true;
    const values = async () => ({
      provisionId: provision.value,
      allegation: allegation.value,
      issuanceDate: issueDate.value,
      receiptDate: receiptDate.value,
      responseWorkingDays: responseDays.value,
      deadlineDate: deadline.value,
      evidence: await readIncidentEvidenceFiles(evidence.files)
    });
    const save = incidentElement('button', 'ghost', 'Save NTE draft');
    save.type = 'button';
    save.onclick = async () => {
      save.disabled = true;
      try {
        await api('saveIncidentNteDraft', incident.id, await values());
        await openIncidentCase(incident.id);
        setIncidentFeedback(
          document.getElementById('ir-case-feedback'),
          'NTE draft saved.'
        );
      } catch (error) {
        setIncidentFeedback(feedback, error.message || String(error), true);
      } finally {
        save.disabled = false;
      }
    };
    const preview = incidentElement('button', 'ghost', 'Preview NTE');
    preview.type = 'button';
    preview.onclick = async () => {
      try {
        const selected = incidentCodeProvisions.find(
          (row) => String(row.id) === provision.value
        );
        if (!selected) throw new Error('Select a Code of Conduct provision.');
        openNtePreview(incident, {
          provisionCode: selected.code,
          provisionTitle: selected.title,
          provisionText: selected.description,
          allegation: allegation.value,
          issuanceDate: issueDate.value,
          receiptDate: receiptDate.value,
          deadlineDate: deadline.value,
          signerName: incident.currentUserName,
          signerEmail: incident.currentUserEmail,
          evidence: [...evidence.files].map((file) => ({ fileName: file.name }))
        });
      } catch (error) {
        setIncidentFeedback(feedback, error.message || String(error), true);
      }
    };
    const issue = incidentElement('button', '', 'Issue NTE');
    issue.type = 'button';
    issue.onclick = async () => {
      issue.disabled = true;
      try {
        const signature = ntePad.toDataURL();
        if (!signature)
          throw new Error('Add the authorized HR signature before issuing.');
        const result = await api('issueIncidentNte', incident.id, {
          ...(await values()),
          signature
        });
        await window.refreshInboxBadge().catch(() => {});
        await refreshIncidentBadges();
        await openIncidentCase(incident.id);
        setIncidentFeedback(
          document.getElementById('ir-case-feedback'),
          `NTE issued. Deadline: ${result.deadlineDate}.`
        );
      } catch (error) {
        setIncidentFeedback(feedback, error.message || String(error), true);
      } finally {
        issue.disabled = false;
      }
    };
    signatureControls.append(save, preview, issue);
    editor.append(
      fields,
      provisionText,
      deadlineNote,
      incidentElement('label', '', 'Explanation of the allegation'),
      allegation,
      incidentElement('label', '', 'NTE supporting evidence'),
      evidence,
      currentUser,
      signatureCanvas,
      signatureControls,
      feedback
    );
    section.appendChild(editor);
    padSetup.push(() => {
      ntePad = window.createSignaturePad(signatureCanvas, clear);
    });
  }

  if (employeeCanAccess && incident.status === 'NTE ISSUED') {
    const form = incidentElement('section', 'incident-case-section');
    form.appendChild(incidentElement('h4', '', 'Submit your explanation'));
    const explanation = incidentElement('textarea');
    explanation.rows = 8;
    explanation.maxLength = 20000;
    explanation.placeholder = 'Write your explanation';
    explanation.value = incident.explanationDraft?.explanation || '';
    const attachments = incidentElement('input');
    attachments.type = 'file';
    attachments.multiple = true;
    attachments.accept =
      '.pdf,.doc,.docx,.rtf,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.mp3,.wav,.mp4,.mov';
    const draftFiles = incidentElement('ul');
    (incident.explanationDraft?.evidence || []).forEach((file) => {
      const item = incidentElement('li');
      const link = incidentElement(
        'a',
        '',
        `${file.fileName} (saved draft attachment)`
      );
      link.href = `${INCIDENT_API_BASE}/incidents/explanation-draft-evidence/${file.id}`;
      link.download = file.fileName;
      item.appendChild(link);
      draftFiles.appendChild(item);
    });
    const feedback = incidentElement('p');
    feedback.hidden = true;
    const saveDraft = incidentElement('button', 'ghost', 'Save draft');
    saveDraft.type = 'button';
    saveDraft.onclick = async () => {
      saveDraft.disabled = true;
      try {
        await api(
          'saveIncidentExplanationDraft',
          incident.id,
          explanation.value,
          await readIncidentEvidenceFiles(attachments.files)
        );
        await openIncidentCase(incident.id);
        setIncidentFeedback(
          document.getElementById('ir-case-feedback'),
          'Explanation draft saved.'
        );
      } catch (error) {
        setIncidentFeedback(feedback, error.message || String(error), true);
      } finally {
        saveDraft.disabled = false;
      }
    };
    const submit = incidentElement('button', '', 'Submit explanation to HR');
    submit.type = 'button';
    submit.onclick = async () => {
      if (
        !window.confirm(
          'Submit this explanation to HR? A submitted explanation cannot be edited.'
        )
      )
        return;
      submit.disabled = true;
      try {
        await api(
          'submitIncidentExplanation',
          incident.id,
          explanation.value,
          await readIncidentEvidenceFiles(attachments.files)
        );
        await window.refreshInboxBadge().catch(() => {});
        await refreshIncidentBadges();
        await openIncidentCase(incident.id);
      } catch (error) {
        setIncidentFeedback(feedback, error.message || String(error), true);
      } finally {
        submit.disabled = false;
      }
    };
    form.append(
      explanation,
      incidentElement('label', '', 'Supporting evidence'),
      attachments,
      draftFiles,
      feedback,
      saveDraft,
      submit
    );
    section.appendChild(form);
  }

  if (incident.explanations.length) {
    const records = incidentElement('section', 'incident-case-section');
    records.appendChild(
      incidentElement('h4', '', 'Submitted explanation record')
    );
    incident.explanations.forEach((record) => {
      records.append(
        incidentElement(
          'p',
          'note',
          `${record.source === 'OTHER_CHANNEL' ? `Received through ${record.otherChannel}` : 'Submitted through HRIS'} · ${new Date(record.submittedAt).toLocaleString()}`
        ),
        incidentElement('p', 'incident-case-text', record.explanation)
      );
      const download = incidentElement(
        'button',
        'ghost',
        'Download explanation'
      );
      download.type = 'button';
      download.onclick = () =>
        downloadIncidentHtml(
          `${incident.caseNumber}-explanation.html`,
          `<!doctype html><meta charset="utf-8"><title>Employee Explanation</title><h1>Employee Explanation — ${escapeIncidentHtml(incident.caseNumber)}</h1><p>Submitted ${escapeIncidentHtml(record.submittedAt)}</p><pre style="white-space:pre-wrap;font:16px Arial">${escapeIncidentHtml(record.explanation)}</pre>`
        );
      records.appendChild(download);
      (record.evidence || []).forEach((file) => {
        const link = incidentElement('a', '', file.fileName);
        link.href = `${INCIDENT_API_BASE}/incidents/explanation-evidence/${file.id}`;
        link.download = file.fileName;
        records.appendChild(link);
      });
    });
    section.appendChild(records);
  }

  if (incident.explanationAddenda.length) {
    const addendaSection = incidentElement('section', 'incident-case-section');
    addendaSection.appendChild(
      incidentElement('h4', '', 'Additional statements')
    );
    incident.explanationAddenda.forEach((addendum) => {
      addendaSection.append(
        incidentElement(
          'p',
          'note',
          `Submitted ${new Date(addendum.submittedAt).toLocaleString()}`
        ),
        incidentElement('p', 'incident-case-text', addendum.statement)
      );
      const download = incidentElement('button', 'ghost', 'Download statement');
      download.type = 'button';
      download.onclick = () =>
        downloadIncidentHtml(
          `${incident.caseNumber}-additional-statement-${addendum.id}.html`,
          `<!doctype html><meta charset="utf-8"><title>Additional Statement</title><h1>Additional Statement — ${escapeIncidentHtml(incident.caseNumber)}</h1><p>Submitted ${escapeIncidentHtml(addendum.submittedAt)}</p><pre style="white-space:pre-wrap;font:16px Arial">${escapeIncidentHtml(addendum.statement)}</pre>`
        );
      addendaSection.appendChild(download);
      (addendum.evidence || []).forEach((file) => {
        const link = incidentElement('a', '', file.fileName);
        link.href = `${INCIDENT_API_BASE}/incidents/explanation-addendum-evidence/${file.id}`;
        link.download = file.fileName;
        addendaSection.appendChild(link);
      });
    });
    section.appendChild(addendaSection);
  }

  if (
    employeeCanAccess &&
    incident.explanations.length &&
    incident.status !== 'CLOSED'
  ) {
    const addendumForm = incidentElement('section', 'incident-case-section');
    addendumForm.appendChild(
      incidentElement('h4', '', 'Submit an additional statement')
    );
    addendumForm.appendChild(
      incidentElement(
        'p',
        'note',
        'Additional statements are saved as separate records and do not replace your submitted explanation.'
      )
    );
    const statement = incidentElement('textarea');
    statement.rows = 5;
    statement.maxLength = 20000;
    statement.placeholder = 'Write an additional statement';
    const files = incidentElement('input');
    files.type = 'file';
    files.multiple = true;
    files.accept =
      '.pdf,.doc,.docx,.rtf,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.mp3,.wav,.mp4,.mov';
    const submit = incidentElement('button', '', 'Submit additional statement');
    submit.type = 'button';
    submit.onclick = async () => {
      submit.disabled = true;
      try {
        await api(
          'submitIncidentExplanationAddendum',
          incident.id,
          statement.value,
          await readIncidentEvidenceFiles(files.files)
        );
        await openIncidentCase(incident.id);
        setIncidentFeedback(
          document.getElementById('ir-case-feedback'),
          'Additional statement submitted.'
        );
      } catch (error) {
        setIncidentFeedback(
          document.getElementById('ir-case-feedback'),
          error.message || String(error),
          true
        );
      } finally {
        submit.disabled = false;
      }
    };
    addendumForm.append(files, statement, submit);
    section.appendChild(addendumForm);
  }

  if (incident.canReview && incident.status === 'NTE ISSUED') {
    const hr = incidentElement('section', 'incident-case-section');
    hr.appendChild(incidentElement('h4', '', 'HR response tracking'));
    const extendDate = incidentElement('input');
    extendDate.type = 'date';
    extendDate.value = incident.nte?.deadlineDate || '';
    const extendReason = incidentElement('textarea');
    extendReason.rows = 2;
    extendReason.maxLength = 2000;
    extendReason.placeholder = 'Approved extension reason';
    const extend = incidentElement(
      'button',
      'ghost',
      'Record approved extension'
    );
    extend.type = 'button';
    extend.onclick = async () => {
      try {
        const result = await api(
          'extendIncidentDeadline',
          incident.id,
          extendDate.value,
          extendReason.value
        );
        await openIncidentCase(incident.id);
        setIncidentFeedback(
          document.getElementById('ir-case-feedback'),
          `Deadline extended to ${result.deadlineDate}.`
        );
      } catch (error) {
        setIncidentFeedback(
          document.getElementById('ir-case-feedback'),
          error.message || String(error),
          true
        );
      }
    };
    hr.append(
      incidentElement('label', '', 'New explanation deadline'),
      extendDate,
      extendReason,
      extend
    );
    const channel = incidentElement('input');
    channel.maxLength = 191;
    channel.placeholder = 'Authorized channel';
    const receivedAt = incidentElement('input');
    receivedAt.type = 'datetime-local';
    const outsideText = incidentElement('textarea');
    outsideText.rows = 3;
    outsideText.maxLength = 20000;
    outsideText.placeholder = 'Explanation received through the other channel';
    const outsideFiles = incidentElement('input');
    outsideFiles.type = 'file';
    outsideFiles.multiple = true;
    const recordOutside = incidentElement(
      'button',
      'ghost',
      'Record external explanation'
    );
    recordOutside.type = 'button';
    recordOutside.onclick = async () => {
      try {
        await api(
          'recordExternalIncidentExplanation',
          incident.id,
          outsideText.value,
          channel.value,
          receivedAt.value,
          await readIncidentEvidenceFiles(outsideFiles.files)
        );
        await window.refreshInboxBadge().catch(() => {});
        await openIncidentCase(incident.id);
        setIncidentFeedback(
          document.getElementById('ir-case-feedback'),
          'Explanation recorded.'
        );
      } catch (error) {
        setIncidentFeedback(
          document.getElementById('ir-case-feedback'),
          error.message || String(error),
          true
        );
      }
    };
    hr.append(channel, receivedAt, outsideText, outsideFiles, recordOutside);
    section.appendChild(hr);
  }

  if (
    incident.canReview &&
    incident.status === 'EXPLANATION SENT' &&
    incident.explanations.length
  ) {
    const start = incidentElement('button', '', 'Start evaluation');
    start.type = 'button';
    start.onclick = async () => {
      try {
        await api('startIncidentEvaluation', incident.id);
        await loadIncidentReview();
        await openIncidentCase(incident.id);
      } catch (error) {
        setIncidentFeedback(
          document.getElementById('ir-case-feedback'),
          error.message || String(error),
          true
        );
      }
    };
    section.appendChild(start);
  }
  parent.appendChild(section);
}

async function openIncidentCase(incidentId) {
  const incident = await api('getIncidentCase', incidentId);
  const body = document.getElementById('ir-case-body');
  const padSetup = [];
  body.replaceChildren();
  document.getElementById('ir-case-title').textContent = incident.caseNumber;

  const summary = incidentElement('div', 'incident-case-grid');
  [
    ['Status', incident.status],
    ['Reported By', incident.reporterName],
    ['Department', incident.department],
    ['Position', incident.position],
    ['Date of Report', incident.dateReported],
    ['Employee Being Reported', incident.reportedEmployeeName],
    ['Employee ID', incident.reportedEmployeeId],
    ['Assigned Head', incident.assignedHeadEmail || 'None assigned'],
    ['Subject', incident.subject],
    ['Date of Incident', incident.incidentDate],
    ['Location', incident.location],
    ['Time', String(incident.incidentTime).slice(0, 5)]
  ].forEach(([label, value]) => appendCaseField(summary, label, value));
  body.appendChild(summary);

  const narrative = incidentElement('section', 'incident-case-section');
  narrative.appendChild(incidentElement('h3', '', 'Incident Description'));
  narrative.appendChild(
    incidentElement('p', 'incident-case-text', incident.description)
  );
  appendCaseField(narrative, 'Comment', incident.comments);
  body.appendChild(narrative);
  appendIncidentParticipantList(body, 'INVOLVED', incident.participants);
  appendIncidentParticipantList(body, 'WITNESS', incident.participants);

  const evidenceSection = incidentElement('section', 'incident-case-section');
  evidenceSection.appendChild(incidentElement('h3', '', 'Supporting Evidence'));
  if (!incident.evidence.length) {
    evidenceSection.appendChild(
      incidentElement('p', 'note', 'No evidence attached.')
    );
  } else {
    const list = incidentElement('ul');
    incident.evidence.forEach((file) => {
      const item = incidentElement('li');
      const link = incidentElement(
        'a',
        '',
        `${file.fileName} (${formatIncidentBytes(file.byteSize)})${file.requestId ? ` · Response to request #${file.requestId}` : ''}`
      );
      link.href = `${INCIDENT_API_BASE}/incidents/evidence/${file.id}`;
      link.download = file.fileName;
      item.appendChild(link);
      list.appendChild(item);
    });
    evidenceSection.appendChild(list);
  }
  body.appendChild(evidenceSection);

  const signatures = incidentElement('section', 'incident-case-section');
  signatures.appendChild(
    incidentElement('h3', '', 'Acknowledgment Signatures')
  );
  signatures.appendChild(
    incidentElement(
      'p',
      'note',
      'A signature acknowledges receipt of this report; it does not indicate admission of wrongdoing.'
    )
  );
  renderIncidentSignature(
    signatures,
    incident,
    'EMPLOYEE',
    'Employee Signature',
    padSetup
  );
  if (incident.assignedHeadEmail)
    renderIncidentSignature(
      signatures,
      incident,
      'HEAD',
      'Head Supervisor Signature',
      padSetup
    );
  renderIncidentSignature(
    signatures,
    incident,
    'HR',
    'HRD Signature',
    padSetup
  );
  body.appendChild(signatures);
  renderIncidentNte(body, incident, padSetup);

  if (
    incident.canReview &&
    ['UNDER_REVIEW', 'UNDER INVESTIGATION'].includes(incident.status)
  ) {
    const workflow = incidentElement('section', 'incident-case-section');
    workflow.appendChild(
      incidentElement(
        'h3',
        '',
        incident.status === 'UNDER_REVIEW' ? 'HR Review' : 'Investigation'
      )
    );
    if (incident.status === 'UNDER_REVIEW') {
      const reason = incidentElement('textarea');
      reason.rows = 3;
      reason.maxLength = 4000;
      reason.placeholder = 'Reason or preliminary findings';
      const actions = incidentElement('div', 'actions');
      const close = incidentElement(
        'button',
        'ghost',
        'Close for documentation'
      );
      const investigate = incidentElement(
        'button',
        '',
        'Further investigation required'
      );
      close.type = investigate.type = 'button';
      close.onclick = () =>
        runIncidentTransition(incident, 'CLOSE_DOCUMENTATION', reason.value);
      investigate.onclick = () =>
        runIncidentTransition(incident, 'START_INVESTIGATION', reason.value);
      actions.append(close, investigate);
      workflow.append(
        incidentElement(
          'p',
          'note',
          'Closing for documentation requires a reason. It does not record a disciplinary violation.'
        ),
        reason,
        actions,
        incidentElement(
          'p',
          'note',
          'NTE preparation and issuance will be added with the next specification part. An NTE is never issued automatically.'
        )
      );
    } else {
      const note = incidentElement('textarea');
      note.rows = 4;
      note.maxLength = 4000;
      note.placeholder = 'Investigation findings or notes (required)';
      const files = incidentElement('input');
      files.type = 'file';
      files.multiple = true;
      files.accept =
        '.pdf,.doc,.docx,.rtf,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.mp3,.wav,.mp4,.mov';
      const saveNote = incidentElement('button', '', 'Save investigation note');
      saveNote.type = 'button';
      saveNote.onclick = async () => {
        saveNote.disabled = true;
        try {
          await api(
            'addIncidentInvestigationNote',
            incident.id,
            note.value,
            await readIncidentEvidenceFiles(files.files)
          );
          await openIncidentCase(incident.id);
        } catch (error) {
          setIncidentFeedback(
            document.getElementById('ir-case-feedback'),
            error.message || String(error),
            true
          );
        } finally {
          saveNote.disabled = false;
        }
      };
      const closeReason = incidentElement('textarea');
      closeReason.rows = 3;
      closeReason.maxLength = 4000;
      closeReason.placeholder =
        'Investigation findings and reason for closure (required)';
      const close = incidentElement('button', 'ghost', 'Close case');
      close.type = 'button';
      close.onclick = () =>
        runIncidentTransition(
          incident,
          'CLOSE_INVESTIGATION',
          closeReason.value
        );
      workflow.append(
        incidentElement('h4', '', 'Record findings and evidence'),
        note,
        files,
        saveNote,
        incidentElement('h4', '', 'Close without disciplinary proceedings'),
        closeReason,
        close
      );

      const requestForm = incidentElement('div', 'incident-case-section');
      requestForm.appendChild(
        incidentElement('h4', '', 'Request additional information')
      );
      const recipient = incidentElement('select');
      recipient.setAttribute('aria-label', 'Information recipient');
      recipient.appendChild(new Option('Loading participants…', ''));
      const requestText = incidentElement('textarea');
      requestText.rows = 3;
      requestText.maxLength = 4000;
      requestText.placeholder = 'Specify what information is needed';
      const sendRequest = incidentElement('button', '', 'Send request');
      sendRequest.type = 'button';
      sendRequest.onclick = async () => {
        sendRequest.disabled = true;
        try {
          await api(
            'requestIncidentInformation',
            incident.id,
            recipient.value,
            requestText.value
          );
          await openIncidentCase(incident.id);
        } catch (error) {
          setIncidentFeedback(
            document.getElementById('ir-case-feedback'),
            error.message || String(error),
            true
          );
        } finally {
          sendRequest.disabled = false;
        }
      };
      requestForm.append(recipient, requestText, sendRequest);
      workflow.appendChild(requestForm);
      api('listIncidentRequestRecipients', incident.id)
        .then((rows) => {
          recipient.replaceChildren(new Option('Select a participant', ''));
          rows.forEach((row) =>
            recipient.add(new Option(`${row.name} (${row.email})`, row.email))
          );
        })
        .catch((error) => {
          recipient.replaceChildren(
            new Option(error.message || 'Participants unavailable', '')
          );
        });
    }
    body.appendChild(workflow);
  }

  if (incident.status === 'UNDER INVESTIGATION') {
    incident.informationRequests
      .filter(
        (request) =>
          request.recipientEmail.toLowerCase() ===
            incident.currentUserEmail.toLowerCase() &&
          request.status === 'PENDING'
      )
      .forEach((request) => {
        const response = incidentElement('section', 'incident-case-section');
        response.append(
          incidentElement('h3', '', 'Information requested from you'),
          incidentElement('p', '', request.requestText)
        );
        const responseText = incidentElement('textarea');
        responseText.rows = 3;
        responseText.maxLength = 4000;
        responseText.placeholder =
          'Your response (optional when attaching evidence)';
        const responseFiles = incidentElement('input');
        responseFiles.type = 'file';
        responseFiles.multiple = true;
        const submit = incidentElement('button', '', 'Submit information');
        submit.type = 'button';
        submit.onclick = async () => {
          submit.disabled = true;
          try {
            await api(
              'respondToIncidentInformation',
              incident.id,
              request.id,
              responseText.value,
              await readIncidentEvidenceFiles(responseFiles.files)
            );
            await openIncidentCase(incident.id);
          } catch (error) {
            setIncidentFeedback(
              document.getElementById('ir-case-feedback'),
              error.message || String(error),
              true
            );
          } finally {
            submit.disabled = false;
          }
        };
        response.append(responseText, responseFiles, submit);
        body.appendChild(response);
      });
  }

  if (incident.informationRequests.length) {
    const requestsSection = incidentElement('section', 'incident-case-section');
    requestsSection.appendChild(
      incidentElement('h3', '', 'Information Requests')
    );
    incident.informationRequests.forEach((request) => {
      requestsSection.append(
        incidentElement(
          'p',
          '',
          `${request.status}: ${request.requestText} — ${request.recipientEmail}`
        )
      );
      if (request.responseText)
        requestsSection.appendChild(
          incidentElement('p', 'note', `Response: ${request.responseText}`)
        );
    });
    body.appendChild(requestsSection);
  }
  if (incident.activity.length) {
    const history = incidentElement('section', 'incident-case-section');
    history.appendChild(incidentElement('h3', '', 'Case Activity'));
    const list = incidentElement('ol');
    incident.activity.forEach((entry) =>
      list.appendChild(
        incidentElement(
          'li',
          '',
          `${entry.action.replaceAll('_', ' ')} — ${entry.details} · ${entry.actorEmail} · ${new Date(entry.createdAt).toLocaleString()}`
        )
      )
    );
    history.appendChild(list);
    body.appendChild(history);
  }

  setIncidentFeedback(document.getElementById('ir-case-feedback'), '');
  const dialog = document.getElementById('ir-case-dialog');
  if (!dialog.open) dialog.showModal();
  window.requestAnimationFrame(() => padSetup.forEach((setup) => setup()));
}

async function readIncidentEvidenceFiles(fileList) {
  const files = [...(fileList || [])];
  if (
    files.length > 10 ||
    files.some((file) => file.size > 8 * 1024 * 1024) ||
    files.reduce((sum, file) => sum + file.size, 0) > 18 * 1024 * 1024
  )
    throw new Error(
      'Attach up to 10 files, each 8 MB or smaller and 18 MB total.'
    );
  return Promise.all(
    files.map(async (file) => ({
      fileName: file.name,
      mimeType: incidentFileMimeType(file),
      dataUrl: await readIncidentFile(file)
    }))
  );
}

async function runIncidentTransition(incident, action, details) {
  if (
    action.startsWith('CLOSE_') &&
    !window.confirm(
      'Close this case? This decision will be recorded in the case history.'
    )
  )
    return;
  try {
    const result = await api(
      'transitionIncident',
      incident.id,
      action,
      details
    );
    await window.refreshInboxBadge().catch(() => {});
    await refreshIncidentBadges();
    if (
      document.getElementById('view-incident-track') &&
      !document.getElementById('view-incident-track').hidden
    )
      await loadIncidentTrack();
    if (
      document.getElementById('view-incident-history') &&
      !document.getElementById('view-incident-history').hidden
    )
      await loadIncidentHistory();
    if (
      document.getElementById('view-incident-review') &&
      !document.getElementById('view-incident-review').hidden
    )
      await loadIncidentReview();
    await openIncidentCase(incident.id);
    setIncidentFeedback(
      document.getElementById('ir-case-feedback'),
      `Case updated: ${result.status}.`
    );
  } catch (error) {
    setIncidentFeedback(
      document.getElementById('ir-case-feedback'),
      error.message || String(error),
      true
    );
  }
}

function renderIncidentRows(rows, targetId, emptyId) {
  const body = document.getElementById(targetId);
  body.replaceChildren();
  document.getElementById(emptyId).hidden = rows.length > 0;
  rows.forEach((incident) => {
    const row = incidentElement('tr');
    [
      incident.caseNumber,
      incident.subject,
      incident.reportedEmployeeName,
      incident.incidentDate,
      incident.status
    ].forEach((value) => row.appendChild(incidentElement('td', '', value)));
    if (targetId === 'ir-track-rows') {
      let deadlineLabel = '—';
      if (incident.explanationDeadline) {
        deadlineLabel = incident.explanationOverdue
          ? `Overdue · ${incident.explanationDeadline}`
          : Number(incident.daysRemaining) === 0
            ? `Due today · ${incident.explanationDeadline}`
            : `${incident.daysRemaining} working days · ${incident.explanationDeadline}`;
      }
      row.appendChild(
        incidentElement(
          'td',
          incident.explanationOverdue ? 'errs' : '',
          deadlineLabel
        )
      );
    }
    const action = incidentElement('td');
    const open = incidentElement('button', 'ghost', 'Open');
    open.type = 'button';
    open.addEventListener('click', () => openIncidentCase(incident.id));
    action.appendChild(open);
    row.appendChild(action);
    body.appendChild(row);
  });
}

async function loadIncidentTrack() {
  const rows = await api('listIncidentsForTrack');
  renderIncidentRows(rows, 'ir-track-rows', 'ir-track-empty');
  if (pendingIncidentCaseId) {
    const id = pendingIncidentCaseId;
    pendingIncidentCaseId = null;
    await openIncidentCase(id);
  }
}

async function loadIncidentHistory() {
  const rows = await api('listIncidentsForHistory');
  renderIncidentRows(rows, 'ir-history-rows', 'ir-history-empty');
  if (pendingIncidentCaseId) {
    const id = pendingIncidentCaseId;
    pendingIncidentCaseId = null;
    await openIncidentCase(id);
  }
}

async function loadIncidentReview() {
  const rows = await api('listIncidentsForReview');
  const filter = document.getElementById('ir-review-status-filter').value;
  renderIncidentRows(
    rows.filter(
      (row) =>
        filter === 'ALL' ||
        (filter === 'CLOSED'
          ? row.status === 'CLOSED'
          : row.status !== 'CLOSED')
    ),
    'ir-review-rows',
    'ir-review-empty'
  );
  if (pendingIncidentCaseId) {
    const id = pendingIncidentCaseId;
    pendingIncidentCaseId = null;
    await openIncidentCase(id);
  }
}

async function refreshIncidentBadges() {
  const counts = await api('getIncidentBadgeCounts');
  [
    [document.getElementById('incident-track-count'), counts.track],
    [document.getElementById('incident-review-count'), counts.review]
  ].forEach(([badge, count]) => {
    if (!badge) return;
    const value = Number(count) || 0;
    badge.textContent = value > 99 ? '99+' : String(value);
    badge.hidden = value === 0;
    badge.parentElement.title = `${value} case${value === 1 ? '' : 's'} need attention`;
  });
}

async function openIncidentRoute(incidentId, target, notificationId = null) {
  if (notificationId)
    await api('markIncidentNotificationSeen', notificationId).catch(() => {});
  pendingIncidentCaseId = Number(incidentId);
  const destination = {
    'incident-review': ['incident-review', 'Review'],
    'incident-history': ['incident-history', 'History'],
    'incident-track': ['incident-track', 'Track']
  }[target] || ['incident-track', 'Track'];
  go(destination);
}

window.openIncidentCase = openIncidentCase;
window.openIncidentRoute = openIncidentRoute;
window.refreshIncidentBadges = refreshIncidentBadges;
window.selectIncidentCase = (incidentId) => openIncidentCase(incidentId);

async function loadIncidentCodeOfConduct() {
  incidentCodeProvisions = await api('listIncidentCodeProvisions');
  const form = document.getElementById('incident-code-provision-form');
  const canManage = ['HR', 'ADMIN'].includes(session.role);
  form.hidden = !canManage;
  const body = document.getElementById('incident-code-provision-rows');
  body.replaceChildren();
  document.getElementById('incident-code-provision-empty').hidden =
    incidentCodeProvisions.length > 0;
  incidentCodeProvisions.forEach((provision) => {
    const row = incidentElement('tr');
    [provision.code, provision.title, provision.description].forEach((value) =>
      row.appendChild(incidentElement('td', '', value))
    );
    const action = incidentElement('td');
    if (canManage) {
      const edit = incidentElement('button', 'ghost', 'Edit');
      edit.type = 'button';
      edit.onclick = () => {
        document.getElementById('incident-code-provision-id').value =
          provision.id;
        document.getElementById('incident-code-provision-code').value =
          provision.code;
        document.getElementById('incident-code-provision-title').value =
          provision.title;
        document.getElementById('incident-code-provision-description').value =
          provision.description;
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      action.appendChild(edit);
    }
    row.appendChild(action);
    body.appendChild(row);
  });
}

document
  .getElementById('incident-code-provision-form')
  .addEventListener('submit', async (event) => {
    event.preventDefault();
    const feedback = document.getElementById(
      'incident-code-provision-feedback'
    );
    try {
      await api('saveIncidentCodeProvision', {
        id: document.getElementById('incident-code-provision-id').value,
        code: document.getElementById('incident-code-provision-code').value,
        title: document.getElementById('incident-code-provision-title').value,
        description: document.getElementById(
          'incident-code-provision-description'
        ).value
      });
      event.currentTarget.reset();
      document.getElementById('incident-code-provision-id').value = '';
      setIncidentFeedback(feedback, 'Provision saved.');
      await loadIncidentCodeOfConduct();
    } catch (error) {
      setIncidentFeedback(feedback, error.message || String(error), true);
    }
  });
document.getElementById('incident-code-provision-reset').onclick = () => {
  document.getElementById('incident-code-provision-form').reset();
  document.getElementById('incident-code-provision-id').value = '';
  setIncidentFeedback(
    document.getElementById('incident-code-provision-feedback'),
    ''
  );
};

VIEWS['incident-file'] = guard(loadIncidentFile);
VIEWS['incident-track'] = guard(loadIncidentTrack);
VIEWS['incident-review'] = guard(loadIncidentReview);
VIEWS['incident-history'] = guard(loadIncidentHistory);
VIEWS['incident-code-of-conduct'] = guard(loadIncidentCodeOfConduct);

document.getElementById('ir-track-refresh').onclick = guard(loadIncidentTrack);
document.getElementById('ir-review-refresh').onclick =
  guard(loadIncidentReview);
document.getElementById('ir-history-refresh').onclick =
  guard(loadIncidentHistory);
document.getElementById('ir-review-status-filter').onchange =
  guard(loadIncidentReview);
document.getElementById('ir-case-close').onclick = () =>
  document.getElementById('ir-case-dialog').close();
