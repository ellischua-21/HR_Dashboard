let pendingIncidentCaseId = null;
let incidentFileContext = null;

const incidentElement = (tag, className = '', text = undefined) =>
  el(tag, text, className);
const setIncidentFeedback = window.AppUI.feedback;

const incidentEmployeeSearches = [];
function wireIncidentSearch(input, employeeId, suggestions, purpose) {
  const search = window.createEmployeeSearch({
    input,
    suggestions,
    search: (query) => api('searchIncidentEmployees', query, purpose),
    getOwner: () => session?.email,
    details: (employee) => [
      `Employee ID: ${employee.employeeId}`,
      employee.employeeNo,
      employee.department,
      employee.position
    ],
    onClear: () => {
      employeeId.value = '';
    },
    onSelect: (employee) => {
      employeeId.value = employee.employeeId;
    }
  });
  incidentEmployeeSearches.push(search);
}

function buildParticipantInputs(containerId, title) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  const fields = [];
  for (let number = 1; number <= 3; number += 1) {
    const field = incidentElement('div', 'incident-search-field');
    const label = incidentElement('label', '', `${number}. ${title}`);
    const input = incidentElement('input');
    input.type = 'search';
    input.id = `${containerId}-${number}`;
    label.htmlFor = input.id;
    const employeeId = incidentElement('input');
    employeeId.type = 'hidden';
    const suggestions = incidentElement('div', 'incident-suggestions');
    suggestions.setAttribute('role', 'listbox');
    suggestions.hidden = true;
    field.append(label, input, employeeId, suggestions);
    wireIncidentSearch(input, employeeId, suggestions, 'participant');
    container.appendChild(field);
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
  button.disabled = true;
  try {
    const evidence = await readIncidentEvidenceFiles(files);
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
    incidentEmployeeSearches.forEach((search) => search.reset());
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

function appendIncidentFieldGroup(parent, title, fields) {
  const section = incidentElement('section', 'incident-case-section');
  section.appendChild(incidentElement('h3', '', title));
  const grid = incidentElement('div', 'incident-case-grid');
  fields.forEach(([label, value]) => appendCaseField(grid, label, value));
  section.appendChild(grid);
  parent.appendChild(section);
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
      incident.reportedEmployeeEmail.toLowerCase() ===
        incident.currentUserEmail.toLowerCase()
    );
  if (role === 'HEAD')
    return (
      incident.status === 'PENDING SIGNATURE' &&
      ['HEAD', 'HR'].includes(incident.currentUserRole) &&
      incident.assignedHeadEmail?.toLowerCase() ===
        incident.currentUserEmail.toLowerCase()
    );
  return role === 'HR' && incident.status === 'SIGNED' && incident.canReview;
}

function renderIncidentSignature(
  parent,
  incident,
  role,
  label,
  padSetup,
  ui = {}
) {
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
    const sign = incidentElement('button', '', 'Sign');
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
          await (ui.reload || openIncidentCase)(incident.id);
        } catch (error) {
          setIncidentFeedback(
            ui.feedback || document.getElementById('ir-case-feedback'),
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

function renderIncidentReport(body, incident) {
  const print = incidentElement('button', 'ghost', 'Print / Save IR as PDF');
  print.type = 'button';
  print.addEventListener('click', () => {
    try {
      openIncidentReportPreview(incident);
    } catch (error) {
      window.alert(error.message || String(error));
    }
  });
  body.appendChild(print);
  appendIncidentFieldGroup(body, 'Reporter Details', [
    ['Reported By', incident.reporterName],
    ['Department', incident.department],
    ['Position', incident.position],
    ['Date of Report', incident.dateReported]
  ]);
  appendIncidentFieldGroup(body, 'Reported Employee Details', [
    ['Employee Being Reported', incident.reportedEmployeeName],
    ['Employee ID', incident.reportedEmployeeId],
    ['Employee Department', incident.reportedEmployeeDepartment],
    ['Employee Position', incident.reportedEmployeePosition],
    ['Assigned Head', incident.assignedHeadEmail || 'None assigned']
  ]);
  appendIncidentFieldGroup(body, 'Incident Details', [
    ['Status', incident.status],
    ['Subject', incident.subject],
    ['Date of Incident', incident.incidentDate],
    ['Location', incident.location],
    ['Time', String(incident.incidentTime).slice(0, 5)]
  ]);

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
      link.href = `${API_BASE}/incidents/evidence/${file.id}`;
      link.download = file.fileName;
      item.appendChild(link);
      list.appendChild(item);
    });
    evidenceSection.appendChild(list);
  }
  body.appendChild(evidenceSection);
}

let incidentOpenRequest = 0;
function renderIncidentReviewActions(incident, ui = {}) {
  const workflow = incidentElement('section', 'incident-case-section');
  workflow.appendChild(incidentElement('h3', '', 'HR Review'));
  const actions = incidentElement('div', 'actions');
  const investigate = incidentElement(
    'button',
    '',
    'Require further investigation'
  );
  investigate.type = 'button';
  investigate.onclick = () =>
    runIncidentTransition(incident, 'START_INVESTIGATION', '', ui);
  actions.appendChild(investigate);
  workflow.append(
    incidentElement(
      'p',
      'note',
      'Further investigation moves the case to the investigation stage.'
    ),
    actions
  );
  return workflow;
}

function renderIncidentClosureAction(incident, ui = {}) {
  if (
    !incident.canReview ||
    !['UNDER_REVIEW', 'UNDER INVESTIGATION'].includes(incident.status)
  )
    return null;
  const isInvestigation = incident.status === 'UNDER INVESTIGATION';
  const workflow = incidentElement('section', 'incident-case-section');
  const toggle = incidentElement('button', 'ghost', 'Close for documentation');
  toggle.type = 'button';
  const reason = incidentElement('textarea');
  reason.rows = 3;
  reason.maxLength = 4000;
  reason.placeholder = isInvestigation
    ? 'Investigation findings and reason for closure (required)'
    : 'Reason for closing the case (required)';
  const reasonFeedback = incidentElement(
    'p',
    'errs',
    isInvestigation
      ? 'Enter the investigation findings and reason for closure.'
      : 'Enter a reason for closing the case.'
  );
  reasonFeedback.hidden = true;
  reason.addEventListener('input', () => {
    if (reason.value.trim()) reasonFeedback.hidden = true;
  });
  const panel = incidentElement('div', 'incident-case-section');
  panel.hidden = true;
  const confirmClose = incidentElement('button', '', 'Confirm closure');
  confirmClose.type = 'button';
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    toggle.textContent = panel.hidden
      ? 'Close for documentation'
      : 'Hide closure form';
  };
  confirmClose.onclick = () => {
    if (!reason.value.trim()) {
      reasonFeedback.hidden = false;
      reason.focus();
      return;
    }
    reasonFeedback.hidden = true;
    runIncidentTransition(
      incident,
      isInvestigation ? 'CLOSE_INVESTIGATION' : 'CLOSE_DOCUMENTATION',
      reason.value,
      ui
    );
  };
  panel.append(
    incidentElement(
      'p',
      'note',
      'Closing for documentation requires a reason. It does not record a disciplinary violation.'
    ),
    reason,
    reasonFeedback,
    confirmClose
  );
  workflow.append(toggle, panel);
  return workflow;
}

async function openIncidentCase(incidentId, options = {}) {
  const ticket = ++incidentOpenRequest;
  const owner = session?.email;
  let incident = await api('getIncidentCase', incidentId);
  if (options.archived && incident.status !== 'CLOSED')
    throw new Error('This case has not been closed. Open it in Track.');
  if (
    ticket !== incidentOpenRequest ||
    owner !== session?.email ||
    (options.archived &&
      document.getElementById('view-incident-history').hidden)
  )
    return;
  if (
    incident.canReview &&
    incident.status === 'EXPLANATION SENT' &&
    incident.explanations.length
  ) {
    try {
      await api('startIncidentEvaluation', incident.id);
    } catch (error) {
      const current = await api('getIncidentCase', incident.id);
      if (current.status !== 'EVALUATION') throw error;
    }
    incident = await api('getIncidentCase', incident.id);
  }
  if (
    ticket !== incidentOpenRequest ||
    owner !== session?.email ||
    (options.archived &&
      document.getElementById('view-incident-history').hidden)
  )
    return;
  const body = document.getElementById('ir-case-body');
  const feedback = document.getElementById('ir-case-feedback');
  const ui = { feedback, reload: (id) => openIncidentCase(id, options) };
  const padSetup = [];
  body.replaceChildren();
  document.getElementById('ir-case-title').textContent = incident.caseNumber;
  if (incident.status === 'CLOSED') {
    const progress = incidentElement('section', 'incident-review-progress');
    body.appendChild(progress);
    window.IncidentProgress.render(progress, incident);
    if (incident.status === 'CLOSED')
      body.appendChild(
        incidentElement(
          'p',
          'note',
          'Archived case. This workspace is read-only.'
        )
      );
  }
  renderIncidentReport(body, incident);
  if (incident.policyReferences?.length) {
    const references = incidentElement('section', 'incident-case-section');
    references.appendChild(
      incidentElement('h3', '', 'Recorded policy references')
    );
    for (const reference of incident.policyReferences)
      references.appendChild(
        incidentElement(
          'p',
          '',
          reference.documentType +
            ': ' +
            (reference.version
              ? reference.version + ' · Effective ' + reference.effectiveDate
              : 'Captured working configuration (unpublished)') +
            ' · ' +
            new Date(reference.capturedAt).toLocaleString()
        )
      );
    body.appendChild(references);
  }

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
    padSetup,
    ui
  );
  if (incident.assignedHeadEmail)
    renderIncidentSignature(
      signatures,
      incident,
      'HEAD',
      'Head Supervisor Signature',
      padSetup,
      ui
    );
  renderIncidentSignature(
    signatures,
    incident,
    'HR',
    'HRD Signature',
    padSetup,
    ui
  );
  body.appendChild(signatures);
  renderIncidentNte(body, incident, padSetup, ui);

  if (incident.canReview && incident.status === 'UNDER_REVIEW')
    body.appendChild(renderIncidentReviewActions(incident, ui));
  window.IncidentInvestigation.render(body, incident, ui);
  window.IncidentTimeline.render(body, incident);
  if (incident.canReview && incident.activity.length) {
    const history = incidentElement('section', 'incident-case-section');
    history.appendChild(incidentElement('h3', '', 'Internal Case Activity'));
    const list = incidentElement('ol');
    incident.activity.forEach((entry) => {
      const item = incidentElement(
        'li',
        '',
        `${entry.action.replaceAll('_', ' ')} — ${entry.details} · ${entry.actorEmail} · ${new Date(entry.createdAt).toLocaleString()}`
      );
      if (
        entry.previousStatus &&
        entry.newStatus &&
        entry.previousStatus !== entry.newStatus
      )
        item.appendChild(
          incidentElement(
            'p',
            'note',
            `${window.IncidentProgress.label(entry.previousStatus)} → ${window.IncidentProgress.label(entry.newStatus)}`
          )
        );
      if (entry.documentReference)
        item.appendChild(incidentElement('p', 'note', entry.documentReference));
      list.appendChild(item);
    });
    history.appendChild(list);
    body.appendChild(history);
  }

  renderIncidentEvaluation(body, incident, padSetup, ui);
  renderIncidentDecision(body, incident, ui);

  setIncidentFeedback(feedback, '');
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

async function runIncidentTransition(incident, action, details, ui = {}) {
  if (
    action.startsWith('CLOSE_') &&
    !(await window.appConfirm(
      'Close this case? This decision will be recorded in the case history.',
      { title: 'Close case', confirmText: 'Close case', danger: true }
    ))
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
    await (ui.reload || openIncidentCase)(incident.id);
    setIncidentFeedback(
      ui.feedback || document.getElementById('ir-case-feedback'),
      `Case updated: ${result.status}.`
    );
  } catch (error) {
    setIncidentFeedback(
      ui.feedback || document.getElementById('ir-case-feedback'),
      error.message || String(error),
      true
    );
  }
}

async function loadIncidentTrack() {
  const requested = pendingIncidentCaseId;
  pendingIncidentCaseId = null;
  await window.IncidentTrack.load(requested);
}

async function loadIncidentHistory() {
  const requested = pendingIncidentCaseId;
  pendingIncidentCaseId = null;
  await window.IncidentHistory.load(requested);
}

async function loadIncidentReview() {
  const requested = pendingIncidentCaseId;
  pendingIncidentCaseId = null;
  await window.IncidentReview.load(requested);
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
    badge.hidden =
      value === 0 ||
      (badge.id === 'incident-track-count' &&
        ['HR', 'ADMIN'].includes(session.role));
    badge.parentElement.title = `${value} active case${value === 1 ? '' : 's'}`;
  });
}

async function openIncidentRoute(incidentId, target, notificationId = null) {
  if (notificationId)
    await api('markIncidentNotificationSeen', notificationId).catch(() => {});
  pendingIncidentCaseId = Number(incidentId);
  go(['incident-track', 'Track']);
}

window.openIncidentCase = openIncidentCase;
window.openIncidentRoute = openIncidentRoute;
window.refreshIncidentBadges = refreshIncidentBadges;
window.IncidentCaseUI = {
  renderReport: renderIncidentReport,
  renderSignature: renderIncidentSignature,
  renderNte: renderIncidentNte,
  renderEvaluation: renderIncidentEvaluation,
  renderReviewActions: renderIncidentReviewActions,
  renderClosureAction: renderIncidentClosureAction,
  renderDecision: renderIncidentDecision,
  readEvidenceFiles: readIncidentEvidenceFiles,
  transition: runIncidentTransition,
  element: incidentElement,
  feedback: setIncidentFeedback
};

async function loadIncidentCodeOfConduct() {
  await window.IncidentConduct.load();
}

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
document.getElementById('ir-case-close').onclick = () =>
  document.getElementById('ir-case-dialog').close();

document.getElementById('ir-case-dialog').addEventListener('close', () => {
  ++incidentOpenRequest;
});
