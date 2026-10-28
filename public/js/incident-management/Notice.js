// NTE drafting, receipt, deadlines, and employee explanations.
function renderIncidentNte(parent, incident, padSetup, ui = {}) {
  if (
    !incident.nte &&
    !(
      incident.canReview &&
      ['UNDER_REVIEW', 'UNDER INVESTIGATION'].includes(incident.status)
    )
  )
    return;
  const section = incidentElement('section', 'incident-case-section');
  section.appendChild(incidentElement('h3', '', 'Notice to Explain'));
  const employeeCanAccess =
    incident.reportedEmployeeEmail.toLowerCase() ===
    incident.currentUserEmail.toLowerCase();

  if (incident.nte?.status === 'ISSUED') {
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
      link.href = `${API_BASE}/incidents/nte-evidence/${file.id}`;
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
    if (incident.status === 'NTE ISSUED') section.appendChild(countdown);
  }

  if (
    incident.canReview &&
    ['UNDER_REVIEW', 'UNDER INVESTIGATION'].includes(incident.status) &&
    (!incident.nte || incident.nte.status === 'DRAFT')
  ) {
    const toggleEditor = incidentElement('button', 'ghost', 'Prepare NTE');
    toggleEditor.type = 'button';
    const editor = incidentElement('div', 'incident-nte-editor');
    editor.hidden = true;
    toggleEditor.onclick = () => {
      editor.hidden = !editor.hidden;
      toggleEditor.textContent = editor.hidden
        ? 'Prepare NTE'
        : 'Hide NTE form';
    };
    const allegation = incidentElement('textarea');
    allegation.rows = 5;
    allegation.maxLength = 12000;
    allegation.placeholder = 'Explain the specific allegation';
    allegation.value = incident.nte?.allegation || '';
    const issueDate = incidentElement('input');
    issueDate.type = 'date';
    issueDate.value = incident.nte?.issuanceDate || DateUtils.manilaDate();
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
        deadline.value = DateUtils.addWorkingDays(
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
    field('Date of issuance', issueDate);
    field('Documented date of receipt', receiptDate);
    field('Response period (working days)', responseDays);
    field('Explanation deadline (confirm HR policy)', deadline);
    const deadlineNote = incidentElement(
      'p',
      'note',
      'The response period defaults to five working days and can be changed for this NTE. The calculated deadline skips weekends; adjust it to match the HR-approved procedure and calendar.'
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
        await (ui.reload || openIncidentCase)(incident.id);
        setIncidentFeedback(
          ui.feedback || document.getElementById('ir-case-feedback'),
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
        openNtePreview(incident, {
          provisionCode: incident.nte?.provisionCode || '',
          provisionTitle: incident.nte?.provisionTitle || '',
          provisionText: incident.nte?.provisionText || '',
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
        await (ui.reload || openIncidentCase)(incident.id);
        setIncidentFeedback(
          ui.feedback || document.getElementById('ir-case-feedback'),
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
    section.append(toggleEditor, editor);
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
      link.href = `${API_BASE}/incidents/explanation-draft-evidence/${file.id}`;
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
        await (ui.reload || openIncidentCase)(incident.id);
        setIncidentFeedback(
          ui.feedback || document.getElementById('ir-case-feedback'),
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
        !(await window.appConfirm(
          'Submit this explanation to HR? A submitted explanation cannot be edited.',
          { title: 'Submit explanation', confirmText: 'Submit' }
        ))
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
        await (ui.reload || openIncidentCase)(incident.id);
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
        link.href = `${API_BASE}/incidents/explanation-evidence/${file.id}`;
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
        link.href = `${API_BASE}/incidents/explanation-addendum-evidence/${file.id}`;
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
        await (ui.reload || openIncidentCase)(incident.id);
        setIncidentFeedback(
          ui.feedback || document.getElementById('ir-case-feedback'),
          'Additional statement submitted.'
        );
      } catch (error) {
        setIncidentFeedback(
          ui.feedback || document.getElementById('ir-case-feedback'),
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
        await (ui.reload || openIncidentCase)(incident.id);
        setIncidentFeedback(
          ui.feedback || document.getElementById('ir-case-feedback'),
          `Deadline extended to ${result.deadlineDate}.`
        );
      } catch (error) {
        setIncidentFeedback(
          ui.feedback || document.getElementById('ir-case-feedback'),
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
        await (ui.reload || openIncidentCase)(incident.id);
        setIncidentFeedback(
          ui.feedback || document.getElementById('ir-case-feedback'),
          'Explanation recorded.'
        );
      } catch (error) {
        setIncidentFeedback(
          ui.feedback || document.getElementById('ir-case-feedback'),
          error.message || String(error),
          true
        );
      }
    };
    hr.append(channel, receivedAt, outsideText, outsideFiles, recordOutside);
    section.appendChild(hr);
  }

  if (incident.canReview && incident.status === 'EXPLANATION SENT') {
    const start = incidentElement('button', '', 'Start evaluation');
    start.type = 'button';
    start.onclick = async () => {
      try {
        await api('startIncidentEvaluation', incident.id);
        await (ui.reload || openIncidentCase)(incident.id);
      } catch (error) {
        setIncidentFeedback(
          ui.feedback || document.getElementById('ir-case-feedback'),
          error.message || String(error),
          true
        );
      }
    };
    section.appendChild(start);
  }
  parent.appendChild(section);
}
