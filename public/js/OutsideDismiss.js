// Shared outside-click behavior for navigation and dismissible dialogs.
(function () {
  const dirtyDialogs = new WeakSet();
  const sidebar = document.getElementById('side');
  const menuButton = document.getElementById('menuBtn');
  const navigation = document.getElementById('nav');
  let backdropStart = null;

  function openNavigationGroup(selected = null) {
    navigation.querySelectorAll('.nav-group').forEach((group) => {
      group.open = group === selected;
    });
    requestAnimationFrame(() => window.positionNavigationNotificationDots?.());
  }

  // Switch groups on click, after its target is fixed. Collapsing on pointerdown
  // shifts the sidebar before the click and can activate the wrong summary.
  navigation.addEventListener('click', (event) => {
    const summary =
      event.target instanceof Element ? event.target.closest('summary') : null;
    const group = summary?.parentElement;
    if (!group?.matches('.nav-group') || !navigation.contains(group)) return;
    event.preventDefault();
    openNavigationGroup(group.open ? null : group);
  });

  function setSidebarOpen(open) {
    document.body.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', String(open));
  }

  function outsideDialog(event, dialog) {
    const bounds = dialog.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX >= bounds.right ||
      event.clientY < bounds.top ||
      event.clientY >= bounds.bottom
    );
  }

  function editableDialog(target) {
    return target instanceof Element ? target.closest('dialog[open]') : null;
  }

  function markDirty(event) {
    const dialog = editableDialog(event.target);
    if (dialog && event.target.matches('input, select, textarea'))
      dirtyDialogs.add(dialog);
  }

  menuButton.setAttribute('aria-controls', 'side');
  setSidebarOpen(false);
  menuButton.addEventListener('click', () =>
    setSidebarOpen(!document.body.classList.contains('open'))
  );
  window.addEventListener('resize', () => {
    if (window.innerWidth > 800) setSidebarOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (
      event.key === 'Escape' &&
      document.body.classList.contains('open') &&
      !document.querySelector('dialog[open]')
    ) {
      setSidebarOpen(false);
      menuButton.focus();
    }
  });
  document.addEventListener('input', markDirty, true);
  document.addEventListener('change', markDirty, true);
  document.addEventListener(
    'close',
    (event) => {
      if (event.target instanceof HTMLDialogElement)
        dirtyDialogs.delete(event.target);
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target;
      const dialog = editableDialog(target);
      backdropStart =
        dialog && target === dialog && outsideDialog(event, dialog)
          ? dialog
          : null;
      if (dialog && target instanceof Element) {
        const button = target.closest('button');
        if (
          target.matches('canvas.signature-pad') ||
          (button &&
            /^(add row|add another request|add all employees|remove|remove row|remove request|clear signature)$/i.test(
              button.textContent.trim()
            ))
        )
          dirtyDialogs.add(dialog);
      }
      if (
        document.body.classList.contains('open') &&
        !sidebar.contains(target) &&
        !menuButton.contains(target)
      )
        setSidebarOpen(false);
      if (!navigation.contains(target)) openNavigationGroup();
      const feedback = document.querySelector('.feedback-popup:not([hidden])');
      if (feedback && !feedback.contains(target)) window.AppFeedback?.clear();
    },
    true
  );
  document.addEventListener(
    'pointercancel',
    () => {
      backdropStart = null;
    },
    true
  );

  document.addEventListener('click', (event) => {
    const dialog = editableDialog(event.target);
    if (
      !dialog ||
      event.target !== dialog ||
      backdropStart !== dialog ||
      !outsideDialog(event, dialog)
    )
      return;
    backdropStart = null;
    if (dialog.dataset.outsideDismiss === 'never') return;
    if (dirtyDialogs.has(dialog)) {
      window.AppErrors?.show('Save or cancel your changes first.');
      return;
    }
    const closeButton =
      dialog.dataset.outsideDismissTarget &&
      dialog.querySelector(`#${dialog.dataset.outsideDismissTarget}`);
    if (closeButton) closeButton.click();
    else dialog.close();
  });

  window.AppOutsideDismiss = {
    openNavigationGroup,
    closeSidebar: () => setSidebarOpen(false),
    clearDirty: (dialog) => dirtyDialogs.delete(dialog)
  };
})();
