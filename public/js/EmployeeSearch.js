// Shared behavior for employee suggestions. Each page supplies its lookup and selection rules.
window.createEmployeeSearch = function createEmployeeSearch({
  input,
  suggestions,
  search,
  onSelect = () => {},
  onClear = () => {},
  details = (employee) => [employee.employeeNo, employee.department],
  getOwner = () => '',
  delay = 250,
  minLength = 2
}) {
  let request = 0;
  let timer;
  let selected = null;
  let matches = [];
  let highlighted = -1;
  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  suggestions.setAttribute('role', 'listbox');
  if (!suggestions.id) suggestions.id = `${input.id}-suggestions`;
  input.setAttribute('aria-controls', suggestions.id);

  function hide() {
    suggestions.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    highlighted = -1;
  }
  function show() {
    suggestions.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function reset(clearInput = true) {
    ++request;
    clearTimeout(timer);
    selected = null;
    matches = [];
    if (clearInput) input.value = '';
    suggestions.replaceChildren();
    hide();
    onClear();
  }
  function choose(employee) {
    ++request;
    clearTimeout(timer);
    selected = employee;
    matches = [];
    input.value = employee.name || '';
    suggestions.replaceChildren();
    hide();
    onSelect(employee);
  }
  function message(text) {
    const node = document.createElement('p');
    node.className = 'incident-no-suggestions';
    node.textContent = text;
    suggestions.replaceChildren(node);
  }
  function render() {
    suggestions.replaceChildren();
    matches.forEach((employee, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.id = `${suggestions.id}-${index}`;
      option.className = 'incident-suggestion';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === highlighted));
      const name = document.createElement('strong');
      name.textContent = employee.name || '';
      const caption = document.createElement('small');
      caption.textContent = details(employee).filter(Boolean).join(' · ');
      option.append(name, caption);
      // Keep input focus until click, so blur cannot remove the selected option.
      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => choose(employee));
      suggestions.appendChild(option);
    });
    if (!matches.length) message('No matching employees.');
  }
  input.addEventListener('input', () => {
    reset(false);
    const query = input.value.trim();
    if (query.length < minLength) return;
    const ticket = request;
    const owner = getOwner();
    timer = setTimeout(async () => {
      try {
        const rows = await search(query);
        if (ticket !== request || owner !== getOwner()) return;
        matches = rows;
        render();
      } catch (error) {
        if (ticket !== request || owner !== getOwner()) return;
        message(error.message || String(error));
      }
      if (
        document.activeElement === input ||
        suggestions.contains(document.activeElement)
      )
        show();
    }, delay);
  });
  input.addEventListener('focus', () => {
    if (suggestions.childElementCount) show();
  });
  const hideAfterBlur = () =>
    setTimeout(() => {
      if (
        document.activeElement !== input &&
        !suggestions.contains(document.activeElement)
      )
        hide();
    }, 0);
  input.addEventListener('blur', hideAfterBlur);
  suggestions.addEventListener('focusout', hideAfterBlur);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') return hide();
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && matches.length) {
      event.preventDefault();
      highlighted = Math.max(
        0,
        Math.min(
          matches.length - 1,
          highlighted + (event.key === 'ArrowDown' ? 1 : -1)
        )
      );
      render();
      show();
      input.setAttribute(
        'aria-activedescendant',
        `${suggestions.id}-${highlighted}`
      );
      suggestions.children[highlighted].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && !suggestions.hidden && matches.length) {
      event.preventDefault();
      choose(matches[Math.max(0, highlighted)]);
    }
  });
  hide();
  return { reset, getSelection: () => selected };
};
