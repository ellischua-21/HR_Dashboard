(() => {
  let dialog;
  let resolveCurrent;

  function getDialog() {
    if (dialog?.isConnected) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'app-confirm-dialog';
    dialog.dataset.outsideDismiss = 'never';
    dialog.setAttribute('aria-labelledby', 'app-confirm-title');
    dialog.innerHTML = `
      <form method="dialog" class="app-confirm-card">
        <h2 id="app-confirm-title"></h2>
        <p class="app-confirm-message"></p>
        <div class="app-confirm-actions">
          <button type="button" class="ghost app-confirm-cancel"></button>
          <button type="button" class="app-confirm-accept"></button>
        </div>
      </form>`;
    document.body.appendChild(dialog);

    const finish = (answer) => {
      if (!resolveCurrent) return;
      const resolve = resolveCurrent;
      resolveCurrent = null;
      dialog.close();
      resolve(answer);
    };
    dialog
      .querySelector('.app-confirm-cancel')
      .addEventListener('click', () => finish(false));
    dialog
      .querySelector('.app-confirm-accept')
      .addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    return dialog;
  }

  window.appConfirm = function appConfirm(message, options = {}) {
    const modal = getDialog();
    if (resolveCurrent) {
      const resolvePrevious = resolveCurrent;
      resolveCurrent = null;
      modal.close();
      resolvePrevious(false);
    }
    modal.querySelector('#app-confirm-title').textContent =
      options.title || 'Please confirm';
    modal.querySelector('.app-confirm-message').textContent = String(
      message || ''
    );
    const cancel = modal.querySelector('.app-confirm-cancel');
    const accept = modal.querySelector('.app-confirm-accept');
    cancel.textContent = options.cancelText || 'Cancel';
    accept.textContent = options.confirmText || 'Confirm';
    accept.classList.toggle('danger', options.danger === true);
    return new Promise((resolve) => {
      resolveCurrent = resolve;
      modal.showModal();
      cancel.focus();
    });
  };
})();
