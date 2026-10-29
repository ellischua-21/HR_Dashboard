// Small browser helpers shared by page controllers.
const el = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};

window.AppUI = {
  tableCell: (value) => el('td', value == null ? '' : String(value)),
  emptyRow(body, columns, message) {
    const row = el('tr');
    const cell = el('td', message);
    cell.colSpan = columns;
    row.appendChild(cell);
    body.appendChild(row);
  },
  dateTime(value, empty = '') {
    return DateUtils.formatDateTime(value, empty);
  },
  feedback(element, message, isError = false) {
    element.textContent = message;
    element.className = isError ? 'errs' : 'okmsg';
    element.hidden = !message;
  },
  download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = el('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

function download(name, text) {
  window.AppUI.download(name, '\ufeff' + text, 'text/csv');
}
