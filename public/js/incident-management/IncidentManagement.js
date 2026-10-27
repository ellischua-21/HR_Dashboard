const INCIDENT_API_BASE = window.HR_API_BASE || 'http://localhost:3001/api';
let pendingIncidentCaseId = null;
let incidentFileContext = null;

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
        `${file.fileName} (${formatIncidentBytes(file.byteSize)})`
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

  setIncidentFeedback(document.getElementById('ir-case-feedback'), '');
  const dialog = document.getElementById('ir-case-dialog');
  if (!dialog.open) dialog.showModal();
  window.requestAnimationFrame(() => padSetup.forEach((setup) => setup()));
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

async function loadIncidentReview() {
  const rows = await api('listIncidentsForReview');
  renderIncidentRows(rows, 'ir-review-rows', 'ir-review-empty');
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
  go(
    target === 'incident-review'
      ? ['incident-review', 'Review']
      : ['incident-track', 'Track']
  );
}

window.openIncidentCase = openIncidentCase;
window.openIncidentRoute = openIncidentRoute;
window.refreshIncidentBadges = refreshIncidentBadges;
window.selectIncidentCase = (incidentId) => openIncidentCase(incidentId);
VIEWS['incident-file'] = guard(loadIncidentFile);
VIEWS['incident-track'] = guard(loadIncidentTrack);
VIEWS['incident-review'] = guard(loadIncidentReview);

document.getElementById('ir-track-refresh').onclick = guard(loadIncidentTrack);
document.getElementById('ir-review-refresh').onclick =
  guard(loadIncidentReview);
document.getElementById('ir-case-close').onclick = () =>
  document.getElementById('ir-case-dialog').close();
