// A fixed display format with native ISO controls retained for existing code,
// FormData, min/max/step validation, and the browser's calendar/time picker.
(function () {
  if (
    typeof HTMLInputElement === 'undefined' ||
    typeof MutationObserver === 'undefined'
  )
    return;
  const states = new WeakMap();
  const controls = new Set();
  const valueProperty = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  );
  const types = ['date', 'time', 'datetime-local'];
  const formats = {
    date: 'MM/DD/YYYY',
    time: 'h:mm AM/PM',
    'datetime-local': 'MM/DD/YYYY h:mm AM/PM'
  };
  let sequence = 0;

  function enhance(source) {
    if (states.has(source)) {
      controls.add(source);
      states.get(source).sync();
      return;
    }
    if (!types.includes(source.type) || !source.parentNode) return;
    const type = source.type;
    const labels = [...(source.labels || [])];
    const wrapper = document.createElement('span');
    wrapper.className = 'date-time-entry';
    const display = document.createElement('input');
    display.type = 'text';
    display.id = source.id
      ? `${source.id}-display`
      : `date-time-entry-${++sequence}`;
    display.placeholder = formats[type];
    display.autocomplete = 'off';
    display.maxLength = type === 'date' ? 10 : type === 'time' ? 8 : 19;
    display.setAttribute(
      'aria-label',
      source.getAttribute('aria-label') ||
        labels[0]?.textContent.trim() ||
        formats[type]
    );
    if (source.hasAttribute('aria-describedby'))
      display.setAttribute(
        'aria-describedby',
        source.getAttribute('aria-describedby')
      );
    const picker = document.createElement('button');
    picker.type = 'button';
    picker.className = 'ghost date-time-entry-picker';
    picker.textContent = type === 'time' ? '◷' : '▦';
    picker.setAttribute(
      'aria-label',
      type === 'time' ? 'Choose time' : 'Choose date'
    );
    picker.title = picker.getAttribute('aria-label');
    let editing = false;
    const getValue = () => valueProperty.get.call(source);

    function validate() {
      const raw = display.value.trim();
      let error =
        raw && !DateUtils.parseInput(raw, type)
          ? `Enter ${formats[type]}.`
          : '';
      const validity = source.validity;
      if (!error && validity.rangeUnderflow)
        error = `Enter ${DateUtils.formatField(source.min, type)} or later.`;
      if (!error && validity.rangeOverflow)
        error = `Enter ${DateUtils.formatField(source.max, type)} or earlier.`;
      if (!error && validity.stepMismatch) error = source.validationMessage;
      display.setCustomValidity(error);
    }

    function sync() {
      if (!editing) display.value = DateUtils.formatField(getValue(), type);
      display.required = source.required;
      display.disabled = source.disabled;
      display.readOnly = source.readOnly;
      picker.disabled = source.disabled || source.readOnly;
      validate();
    }

    states.set(source, { sync });
    controls.add(source);
    source.parentNode.insertBefore(wrapper, source);
    wrapper.append(source, display, picker);
    for (const label of labels)
      if (source.id && label.htmlFor === source.id) label.htmlFor = display.id;
    source.classList.add('date-time-entry-source');
    source.tabIndex = -1;
    source.setAttribute('aria-hidden', 'true');
    Object.defineProperty(source, 'value', {
      configurable: true,
      get: getValue,
      set(value) {
        valueProperty.set.call(source, value);
        sync();
      }
    });
    source.reportValidity = () => {
      validate();
      return display.reportValidity();
    };
    source.addEventListener('focus', () => display.focus());
    source.addEventListener('input', sync);
    source.addEventListener('change', sync);
    source.addEventListener('invalid', (event) => {
      event.preventDefault();
      validate();
      display.focus();
      display.reportValidity();
    });
    for (const eventName of ['input', 'change'])
      display.addEventListener(eventName, () => {
        valueProperty.set.call(
          source,
          DateUtils.parseInput(display.value, type)
        );
        validate();
        if (eventName === 'change' && !display.validity.valid) {
          display.reportValidity();
          return;
        }
        if (eventName === 'change') sync();
        editing = true;
        try {
          source.dispatchEvent(new Event(eventName, { bubbles: true }));
        } finally {
          editing = false;
        }
      });
    picker.addEventListener('click', () => {
      if (typeof source.showPicker === 'function') source.showPicker();
      else {
        source.focus();
        source.click();
      }
    });
    sync();
  }

  function scan(node) {
    if (node instanceof HTMLInputElement) enhance(node);
    node
      .querySelectorAll?.(
        'input[type="date"], input[type="time"], input[type="datetime-local"]'
      )
      .forEach(enhance);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const state = states.get(mutation.target);
        if (state) state.sync();
        else scan(mutation.target);
      } else mutation.addedNodes.forEach(scan);
    }
    for (const source of controls)
      if (!source.isConnected) controls.delete(source);
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'type',
      'value',
      'required',
      'disabled',
      'readonly',
      'min',
      'max',
      'step'
    ]
  });
  document.addEventListener('reset', (event) => {
    queueMicrotask(() => {
      for (const source of controls)
        if (source.form === event.target) states.get(source).sync();
    });
  });
  scan(document.body);
})();
