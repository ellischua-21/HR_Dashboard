(function (root, factory) {
  const status = factory();
  if (typeof module === 'object' && module.exports) module.exports = status;
  if (root) root.FormStatus = status;
})(typeof window === 'undefined' ? globalThis : window, function () {
  function titleCase(value) {
    return String(value || '')
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatFormStatus(status, reviewStage) {
    const normalized = String(status || 'PENDING')
      .trim()
      .toUpperCase();
    if (normalized === 'PENDING') {
      return String(reviewStage || '').toUpperCase() === 'HEAD'
        ? 'Pending Head Signature'
        : 'Pending HR/Admin Review';
    }
    return titleCase(normalized);
  }

  function canEditForm(role, form) {
    return (
      ['STAFF', 'HEAD', 'HR'].includes(role) &&
      form.status === 'PENDING' &&
      form.review_stage === 'HEAD' &&
      Boolean(form.head_reviewer_email)
    );
  }

  return { titleCase, formatFormStatus, canEditForm };
});
