let pendingIncidentCaseId = null;
const incidentElement = (tag, className = '', text = undefined) =>
  el(tag, text, className);
const setIncidentFeedback = window.AppUI.feedback;
async function loadIncidentFile() {
  await window.IncidentWorkflow.loadFile();
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

function appendCaseField(parent, label, value) {
  const item = incidentElement('div', 'incident-case-field');
  item.append(
    incidentElement('strong', '', label),
    incidentElement('span', '', value || '—')
  );
  parent.appendChild(item);
}

function appendIncidentFieldGroup(parent, title, fields) {
  const section = incidentElement(
    'section',
    'incident-case-section incident-detail-panel'
  );
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
  const section = incidentElement(
    'section',
    'incident-case-section incident-detail-panel'
  );
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

function renderIncidentSignature(parent, incident, role, title) {
  const signature = incident.signatures.find((item) => item.role === role);
  if (!signature) return;
  const box = incidentElement('section', 'incident-signature-field');
  box.appendChild(incidentElement('h3', '', title));
  const image = incidentElement('img', 'incident-signature-image');
  image.src = signature.signature;
  image.alt = title;
  box.append(
    image,
    incidentElement(
      'p',
      'note',
      signature.signerEmail +
        ' · ' +
        DateUtils.formatDateTime(signature.signedAt)
    )
  );
  parent.appendChild(box);
}

function renderIncidentReport(body, incident) {
  const print = incidentElement('button', 'ghost', 'Print / Save IR as PDF');
  print.type = 'button';
  print.addEventListener('click', () => {
    try {
      openIncidentReportPreview(incident);
    } catch (error) {
      AppErrors.show(error.message || String(error));
    }
  });
  body.appendChild(print);
  const parties = incidentElement('div', 'incident-party-details');
  appendIncidentFieldGroup(parties, 'Reporter Details', [
    ['Reported By', incident.reporterName],
    ['Department', incident.department],
    ['Position', incident.position],
    ['Date of Report', DateUtils.formatDate(incident.dateReported)]
  ]);
  appendIncidentFieldGroup(parties, 'Reported Employee Details', [
    ['Employee Being Reported', incident.reportedEmployeeName],
    ['Employee ID', incident.reportedEmployeeId],
    ['Employee Department', incident.reportedEmployeeDepartment],
    ['Employee Position', incident.reportedEmployeePosition],
    [
      incident.assignedReviewerRole === 'SUPERVISOR'
        ? 'Assigned Supervisor'
        : 'Assigned Head',
      incident.assignedHeadEmail || 'None assigned'
    ]
  ]);
  body.appendChild(parties);
  appendIncidentFieldGroup(body, 'Incident Details', [
    ['Status', incident.status],
    ['Subject', incident.subject],
    ['Date of Incident', DateUtils.formatDate(incident.incidentDate)],
    ['Location', incident.location],
    ['Time', DateUtils.formatTime(incident.incidentTime)]
  ]);

  const narrative = incidentElement(
    'section',
    'incident-case-section incident-detail-panel'
  );
  narrative.appendChild(incidentElement('h3', '', 'Incident Description'));
  narrative.appendChild(
    incidentElement('p', 'incident-case-text', incident.description)
  );
  appendCaseField(narrative, 'Comment', incident.comments);
  body.appendChild(narrative);
  appendIncidentParticipantList(body, 'INVOLVED', incident.participants);
  appendIncidentParticipantList(body, 'WITNESS', incident.participants);

  const evidenceSection = incidentElement(
    'section',
    'incident-case-section incident-detail-panel'
  );
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
function renderLegacyIncident(parent, incident) {
  parent.appendChild(incidentElement('p', 'badge', 'Read-Only Legacy Record'));
  renderIncidentReport(parent, incident);
  for (const [role, title] of [
    ['EMPLOYEE', 'Employee Signature'],
    [
      'HEAD',
      incident.assignedReviewerRole === 'SUPERVISOR'
        ? 'Supervisor Signature'
        : 'Head Signature'
    ],
    ['HR', 'HR Signature']
  ])
    renderIncidentSignature(parent, incident, role, title);
  renderIncidentNte(parent, incident);
  window.IncidentInvestigation.render(parent, incident);
  renderIncidentEvaluation(parent, incident);
  renderIncidentDecision(parent, incident);
  window.IncidentTimeline.render(parent, incident);
  if (incident.activity?.length) {
    const history = incidentElement('section', 'incident-case-section');
    history.appendChild(incidentElement('h3', '', 'Internal Activity History'));
    for (const entry of incident.activity)
      appendIncidentFieldGroup(history, FormStatus.titleCase(entry.action), [
        ['Performed By', entry.actorEmail],
        ['Date And Time', DateUtils.formatDateTime(entry.createdAt)],
        ['Remarks', entry.details]
      ]);
    parent.appendChild(history);
  }
}

async function openIncidentCase(incidentId) {
  const ticket = ++incidentOpenRequest,
    owner = session?.email;
  const incident = await api('getIncidentCase', incidentId);
  if (ticket !== incidentOpenRequest || owner !== session?.email) return;
  if (incident.workflowVersion === 2)
    return window.openIncidentRoute(incident.id, 'incident-track');
  document.getElementById('ir-case-title').textContent = incident.caseNumber;
  const body = document.getElementById('ir-case-body');
  body.replaceChildren();
  renderLegacyIncident(body, incident);
  const dialog = document.getElementById('ir-case-dialog');
  if (!dialog.open) dialog.showModal();
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
  window.updateIncidentNotificationDot(
    session.role === 'HEAD'
      ? counts.track + counts.review
      : ['HR', 'ADMIN'].includes(session.role)
        ? counts.review
        : counts.track
  );
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
  renderLegacy: renderLegacyIncident,
  renderSignature: renderIncidentSignature,
  renderNte: renderIncidentNte,
  renderEvaluation: renderIncidentEvaluation,
  renderDecision: renderIncidentDecision,
  readEvidenceFiles: readIncidentEvidenceFiles,
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
