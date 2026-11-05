// Keep required indicators in sync with native and workflow-only requirements.
(function () {
  if (typeof MutationObserver === 'undefined') return;
  const selector = 'input, select, textarea';
  const required = (control) =>
    (control.required || control.dataset.requiredIndicator === 'true') &&
    !control.disabled &&
    !control.readOnly &&
    control.getAttribute('aria-hidden') !== 'true';

  function mark(target, needed) {
    const existing = target.querySelector(
      ':scope > .required-indicator, :scope > span > .required-indicator'
    );
    if (!needed) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const textNode = [...target.childNodes].find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
    );
    const textContainer =
      target.querySelector(':scope > .required-label-text') ||
      [...target.children].find(
        (child) =>
          child.tagName === 'SPAN' &&
          !child.classList.contains('date-time-entry')
      );
    const labelText = textNode?.textContent || textContainer?.textContent || '';
    if (/\*\s*$/.test(labelText)) return;
    let container = textContainer;
    if (textNode) {
      container = document.createElement('span');
      container.className = 'required-label-text';
      target.insertBefore(container, textNode);
      container.appendChild(textNode);
    }
    if (!container) container = target;
    const star = document.createElement('span');
    star.className = 'required-indicator';
    star.textContent = '*';
    star.setAttribute('aria-hidden', 'true');
    container.appendChild(star);
  }

  const markedHeaders = new Set();
  function update() {
    document.querySelectorAll('label').forEach((label) => {
      const controls = [...label.querySelectorAll(selector)];
      if (label.control && !controls.includes(label.control))
        controls.push(label.control);
      const radioGroup =
        controls.some((control) => control.type === 'radio') &&
        label.closest('fieldset');
      mark(label, !radioGroup && controls.some(required));
    });
    document.querySelectorAll('fieldset').forEach((fieldset) => {
      const legend = fieldset.querySelector(':scope > legend');
      if (legend)
        mark(
          legend,
          [...fieldset.querySelectorAll('input[type="radio"]')].some(required)
        );
    });
    const neededHeaders = new Set();
    document
      .querySelectorAll(
        'td input[required], td select[required], td textarea[required], td [data-required-indicator="true"]'
      )
      .forEach((control) => {
        if (!required(control)) return;
        const cell = control.closest('td');
        const table = cell?.closest('table');
        const header =
          table?.tHead?.rows[table.tHead.rows.length - 1]?.cells[
            cell.cellIndex
          ];
        if (header) neededHeaders.add(header);
      });
    markedHeaders.forEach((header) => {
      if (!neededHeaders.has(header)) mark(header, false);
    });
    neededHeaders.forEach((header) => mark(header, true));
    markedHeaders.clear();
    neededHeaders.forEach((header) => markedHeaders.add(header));
    document
      .querySelectorAll('[data-required-label]')
      .forEach((label) => mark(label, true));
  }
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      update();
    });
  }
  new MutationObserver(schedule).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'required',
      'disabled',
      'readonly',
      'data-required-indicator'
    ]
  });
  schedule();
})();
