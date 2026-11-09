// Shared ownership controls and server-based working-time clocks.
(function () {
  let revision = null,
    polling = false;
  function clock(task) {
    const node = el('time', '', 'task-clock');
    node.title =
      'Working time: Monday–Friday, 8:00 AM–6:30 PM (Philippine time)';
    const anchor = performance.now();
    node._taskClock = () =>
      WorkTime.format(
        Number(task.activeMs || 0) +
          (task.runStartedMs == null
            ? 0
            : WorkTime.milliseconds(
                Number(task.runStartedMs),
                Number(task.serverNow) + performance.now() - anchor
              ))
      );
    node.textContent = node._taskClock();
    return node;
  }
  function changed(local = false) {
    if (!local) window.dispatchEvent(new Event('review-tasks-changed'));
    Promise.allSettled([
      window.refreshInboxBadge?.(),
      window.refreshIncidentBadges?.(),
      window.refreshSubmittedFormsBadge?.('ALL')
    ]);
  }
  function render(task, reload, compact = false) {
    const panel = el(
      'section',
      undefined,
      compact ? 'task-ownership task-ownership-compact' : 'task-ownership'
    );
    if (!task) return panel;
    const details = el('div', undefined, 'task-ownership-details');
    details.append(
      el(
        'strong',
        task.owner
          ? `Assigned To: ${task.ownerName || task.owner}`
          : 'Unassigned'
      )
    );
    if (task.takenMs != null) {
      const timing = el('span');
      timing.append('HR Time: ', clock(task));
      details.appendChild(timing);
    }
    if (task.state === 'WAITING')
      details.appendChild(el('span', task.waitingReason, 'task-waiting'));
    else if (task.owner && !task.isMine)
      details.appendChild(el('span', 'View Only', 'badge'));
    panel.appendChild(details);
    const actions = el('div', undefined, 'actions');
    if (session.role === 'HR' && task.canTake) {
      const take = el('button', 'Take Task');
      take.type = 'button';
      take.onclick = async () => {
        take.disabled = true;
        try {
          await api('takeReviewTask', task.type, task.resourceId);
          changed(true);
          await reload();
          AppFeedback.success('Task taken.');
        } catch (error) {
          AppErrors.show(error.message);
          await reload();
        } finally {
          take.disabled = false;
        }
      };
      actions.appendChild(take);
    }
    if (
      session.role === 'ADMIN' &&
      task.canReassign !== false &&
      task.state !== 'COMPLETED' &&
      task.stage !== 'PENDING SIGNATURE'
    ) {
      const reassign = el(
        'button',
        task.owner ? 'Reassign' : 'Assign',
        'ghost'
      );
      reassign.type = 'button';
      reassign.onclick = () =>
        assign(task, reload).catch((error) => AppErrors.show(error.message));
      actions.appendChild(reassign);
    }
    panel.appendChild(actions);
    return panel;
  }
  async function assign(task, reload) {
    const accounts = await api(
      'getReviewTaskAssignees',
      task.type,
      task.resourceId
    );
    const dialog = el('dialog', undefined, 'task-assignment-dialog');
    const form = el('form'),
      heading = el('h2', 'Assign Review Task');
    const label = el('label', 'Reviewer'),
      select = el('select');
    select.required = true;
    select.appendChild(new Option('Select a reviewer', ''));
    accounts.forEach((account) =>
      select.add(new Option(`${account.name} (${account.role})`, account.email))
    );
    label.appendChild(select);
    const reasonLabel = el('label', 'Reason'),
      reason = el('textarea');
    reason.required = true;
    reason.maxLength = 1000;
    reason.rows = 3;
    reasonLabel.appendChild(reason);
    const actions = el('div', undefined, 'actions'),
      save = el('button', 'Save Changes'),
      cancel = el('button', 'Cancel', 'ghost');
    save.type = 'submit';
    cancel.type = 'button';
    cancel.onclick = () => dialog.close();
    actions.append(save, cancel);
    form.append(heading, label, reasonLabel, actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.showModal();
    form.onsubmit = async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        await api(
          'reassignReviewTask',
          task.type,
          task.resourceId,
          select.value,
          reason.value
        );
        dialog.close();
        changed(true);
        await reload();
        AppFeedback.success('Assigned successfully.');
      } catch (error) {
        AppErrors.show(error.message);
      } finally {
        save.disabled = false;
      }
    };
  }
  async function poll() {
    if (
      polling ||
      document.hidden ||
      !session ||
      !['HR', 'ADMIN'].includes(session.role)
    )
      return;
    polling = true;
    try {
      const result = await apiBackground('getReviewTaskRevision');
      if (revision !== result.revision) changed();
      revision = result.revision;
    } catch (_) {
      /* Existing foreground requests show connection errors. */
    } finally {
      polling = false;
    }
  }
  setInterval(poll, 10000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) poll();
  });
  setInterval(() => {
    if (document.hidden || !session || !['HR', 'ADMIN'].includes(session.role))
      return;
    document.querySelectorAll('.task-clock').forEach((node) => {
      if (node._taskClock) node.textContent = node._taskClock();
    });
  }, 1000);
  window.TaskUI = { render, clock, changed };
})();
