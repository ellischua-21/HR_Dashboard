// Shared transient feedback, including messages raised during startup.
(function () {
  let popup;
  let message;
  let validationPending = false;
  let dismissTimer;

  function clear() {
    clearTimeout(dismissTimer);
    if (!popup) return;
    if (popup.hidePopover && popup.matches(':popover-open'))
      popup.hidePopover();
    popup.hidden = true;
  }

  function show(value, kind = 'info') {
    if (!value) return clear();
    clearTimeout(dismissTimer);
    if (!popup) {
      popup = document.createElement('div');
      popup.className = 'feedback-popup';
      popup.setAttribute('aria-atomic', 'true');
      // The top layer keeps feedback visible above open dialogs.
      if (typeof popup.showPopover === 'function')
        popup.setAttribute('popover', 'manual');
      message = document.createElement('span');
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'ghost';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Dismiss message');
      close.onclick = clear;
      popup.append(message, close);
      document.body.appendChild(popup);
    }
    message.textContent = String(value);
    popup.dataset.kind = kind;
    popup.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const host =
      document.activeElement?.closest('dialog[open]') ||
      document.querySelector('dialog[open]') ||
      document.body;
    if (popup.parentElement !== host) {
      if (popup.hidePopover && popup.matches(':popover-open'))
        popup.hidePopover();
      host.appendChild(popup);
    }
    popup.hidden = false;
    if (popup.showPopover && !popup.matches(':popover-open'))
      popup.showPopover();
    dismissTimer = setTimeout(clear, 1500);
  }

  window.AppFeedback = {
    show,
    success: (value) => show(value, 'success'),
    clear
  };
  window.AppErrors = { show: (value) => show(value, 'error'), clear };

  // Keep native constraints and submission blocking; use the same popup for validation.
  document.addEventListener(
    'invalid',
    (event) => {
      event.preventDefault();
      if (validationPending) return;
      validationPending = true;
      const input = event.target;
      const label =
        input.getAttribute('aria-label') ||
        input.labels?.[0]?.textContent?.trim() ||
        '';
      AppErrors.show(
        `${label ? label + ': ' : ''}${input.validationMessage || 'Check this field.'}`
      );
      queueMicrotask(() => {
        validationPending = false;
        if (input.isConnected) input.focus();
      });
    },
    true
  );
})();
