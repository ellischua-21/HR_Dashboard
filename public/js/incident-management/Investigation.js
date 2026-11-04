// Investigation controls shared by Track and archived case documents.
(function () {
  const ui = window.IncidentCaseUI;
  const el = ui.element;
  const dateTime = (value) => window.AppUI.dateTime(value, 'Not reached');
  function renderInformationRequests(parent, incident, controls) {
    const section = el('section', 'incident-case-section');
    section.appendChild(el('h3', '', 'Information Requests'));
    if (!incident.informationRequests.length)
      section.appendChild(
        el(
          'p',
          'note',
          'No information requests are available to your account.'
        )
      );
    incident.informationRequests.forEach((request) => {
      const card = el('section', 'incident-case-section');
      card.append(
        el(
          'h4',
          '',
          request.status === 'PENDING'
            ? 'Awaiting response'
            : 'Response received'
        ),
        el('p', 'incident-case-text', request.requestText),
        el('p', 'note', `Requested ${dateTime(request.createdAt)}`)
      );
      if (request.responseText)
        card.appendChild(el('p', 'incident-case-text', request.responseText));
      if (request.respondedAt)
        card.appendChild(
          el('p', 'note', `Responded ${dateTime(request.respondedAt)}`)
        );
      if (
        incident.status === 'UNDER INVESTIGATION' &&
        request.status === 'PENDING' &&
        String(request.recipientEmail || '')
          .trim()
          .toLowerCase() ===
          String(incident.currentUserEmail || session?.email || '')
            .trim()
            .toLowerCase()
      ) {
        const form = el('form');
        const text = el('textarea');
        text.rows = 4;
        text.maxLength = 4000;
        const textLabel = el('label', '', 'Your Response');
        textLabel.appendChild(text);
        const files = el('input');
        files.type = 'file';
        files.multiple = true;
        const fileLabel = el('label', '', 'Requested Supporting Evidence');
        fileLabel.appendChild(files);
        const actions = el('div', 'actions incident-track-actions');
        const submit = el('button', '', 'Submit information');
        submit.type = 'submit';
        actions.appendChild(submit);
        form.append(textLabel, fileLabel, actions);
        form.onsubmit = async (event) => {
          event.preventDefault();
          submit.disabled = true;
          try {
            await api(
              'respondToIncidentInformation',
              incident.id,
              request.id,
              text.value,
              await ui.readEvidenceFiles(files.files)
            );
            await controls.reload(incident.id);
            ui.feedback('Information submitted.');
            await window.refreshIncidentBadges();
          } catch (error) {
            ui.feedback(error.message || String(error), true);
          } finally {
            submit.disabled = false;
          }
        };
        card.appendChild(form);
      }
      section.appendChild(card);
    });
    if (incident.canReview && incident.activity.length) {
      const updates = el('details');
      updates.appendChild(
        el('summary', '', 'Authorized investigation updates')
      );
      const list = el('ul');
      incident.activity
        .filter((entry) =>
          [
            'INVESTIGATION_STARTED',
            'INVESTIGATION_NOTE',
            'INFORMATION_REQUESTED',
            'INFORMATION_PROVIDED'
          ].includes(entry.action)
        )
        .forEach((entry) =>
          list.appendChild(
            el('li', '', `${dateTime(entry.createdAt)} · ${entry.details}`)
          )
        );
      updates.appendChild(list);
      section.appendChild(updates);
    }
    parent.appendChild(section);
  }

  async function renderInvestigationRequests(parent, incident, controls) {
    const section = el('section', 'incident-case-section');
    section.append(
      el('h3', '', 'Request Information From Employees'),
      el(
        'p',
        'note',
        'Create a separate request for each employee. Each request is delivered only to its selected recipient.'
      )
    );
    const rows = el('div', 'incident-investigation-request-list');
    let recipients = [];
    const requestRows = [];

    function addRequestRow(selectedEmail = '') {
      const row = el('div', 'incident-case-section');
      const recipient = el('select');
      recipient.setAttribute('aria-label', 'Information request recipient');
      recipient.add(new Option('Select an employee', ''));
      recipients.forEach((person) =>
        recipient.add(
          new Option(`${person.name} (${person.email})`, person.email)
        )
      );
      recipient.value = selectedEmail;
      const recipientLabel = el('label', '', 'Send To');
      recipientLabel.appendChild(recipient);
      const requestText = el('textarea');
      requestText.rows = 3;
      requestText.maxLength = 4000;
      requestText.placeholder = 'What information or explanation is needed?';
      const requestLabel = el('label', '', 'Request');
      requestLabel.appendChild(requestText);
      const remove = el('button', 'ghost', 'Remove request');
      remove.type = 'button';
      remove.onclick = () => {
        requestRows.splice(requestRows.indexOf(entry), 1);
        row.remove();
      };
      const entry = { row, recipient, requestText };
      requestRows.push(entry);
      row.append(recipientLabel, requestLabel, remove);
      rows.appendChild(row);
      return entry;
    }

    const add = el('button', 'ghost', 'Add another request');
    add.type = 'button';
    add.onclick = () => addRequestRow();
    const addAll = el('button', 'ghost', 'Add all employees');
    addAll.type = 'button';
    addAll.onclick = () => {
      for (let index = requestRows.length - 1; index >= 0; index -= 1) {
        const entry = requestRows[index];
        if (!entry.recipient.value && !entry.requestText.value.trim()) {
          entry.row.remove();
          requestRows.splice(index, 1);
        }
      }
      const selected = new Set(
        requestRows
          .map((entry) => entry.recipient.value.toLowerCase())
          .filter(Boolean)
      );
      recipients.forEach((person) => {
        if (!selected.has(person.email.toLowerCase()))
          addRequestRow(person.email);
      });
    };
    const send = el('button', '', 'Send requests');
    send.type = 'button';
    send.onclick = async () => {
      const requests = requestRows.map((entry) => ({
        recipientEmail: entry.recipient.value,
        requestText: entry.requestText.value.trim()
      }));
      const invalid = requests.some(
        (request) => !request.recipientEmail || !request.requestText
      );
      if (!requests.length || invalid) {
        AppErrors.show('Select an employee and enter a request in every row.');
        return;
      }
      if (
        !(await window.appConfirm(
          `Send information requests to ${requests.length} employee${requests.length === 1 ? '' : 's'}?`,
          { title: 'Send information requests', confirmText: 'Send requests' }
        ))
      )
        return;
      send.disabled = true;
      try {
        await api('requestIncidentInformationBatch', incident.id, requests);
        await controls.reload(incident.id);
        ui.feedback('Requests sent.');
        await window.refreshInboxBadge().catch(() => {});
      } catch (error) {
        AppErrors.show(error.message || String(error));
      } finally {
        send.disabled = false;
      }
    };
    section.append(rows, el('div', 'actions'));
    const actions = section.lastElementChild;
    actions.append(add, addAll, send);
    parent.appendChild(section);
    try {
      recipients = await api('listIncidentRequestRecipients', incident.id);
      requestRows.length = 0;
      rows.replaceChildren();
      if (!recipients.length) {
        AppErrors.show('No employees are available for requests.');
        add.disabled = addAll.disabled = send.disabled = true;
        return;
      }
      addRequestRow();
    } catch (error) {
      AppErrors.show(error.message || String(error));
      add.disabled = addAll.disabled = send.disabled = true;
    }
  }

  function renderActions(parent, incident, controls) {
    const workflow = el('section', 'incident-case-section');
    workflow.appendChild(el('h3', '', 'Investigation Findings'));
    const note = el('textarea');
    note.rows = 4;
    note.maxLength = 4000;
    note.placeholder = 'Investigation findings or notes (required)';
    const files = el('input');
    files.type = 'file';
    files.multiple = true;
    files.accept =
      '.pdf,.doc,.docx,.rtf,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.mp3,.wav,.mp4,.mov';
    const saveNote = el('button', '', 'Save investigation note');
    saveNote.type = 'button';
    saveNote.onclick = async () => {
      if (!note.value.trim()) {
        AppErrors.show('Enter the investigation findings or notes.');
        note.focus();
        return;
      }
      saveNote.disabled = true;
      try {
        await api(
          'addIncidentInvestigationNote',
          incident.id,
          note.value,
          await ui.readEvidenceFiles(files.files)
        );
        await controls.reload(incident.id);
      } catch (error) {
        AppErrors.show(error.message || String(error));
      } finally {
        saveNote.disabled = false;
      }
    };
    workflow.append(
      el('h4', '', 'Record Findings And Evidence'),
      note,
      files,
      saveNote
    );
    parent.appendChild(workflow);
  }

  function render(parent, incident, controls) {
    const hasPendingRequests = incident.informationRequests.some(
      (request) => request.status === 'PENDING'
    );
    if (incident.informationRequests.length)
      renderInformationRequests(parent, incident, controls);
    if (incident.canReview && incident.status === 'UNDER INVESTIGATION') {
      if (hasPendingRequests) {
        parent.appendChild(
          el(
            'p',
            'note',
            'Waiting for the requested responses. Case actions will be available after all responses are received.'
          )
        );
      } else {
        renderActions(parent, incident, controls);
        renderInvestigationRequests(parent, incident, controls);
      }
    } else if (
      !incident.canReview &&
      incident.informationRequests.some(
        (request) => request.status === 'RESPONDED'
      ) &&
      !hasPendingRequests
    ) {
      parent.appendChild(
        el(
          'p',
          'note',
          'Your requested response has been submitted. You can view the case progress while HR reviews it.'
        )
      );
    }
  }
  window.IncidentInvestigation = { render };
})();
