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

  function reviewerLabel(submitterRole) {
    return submitterRole === 'STAFF'
      ? 'Supervisor'
      : submitterRole === 'HR'
        ? 'Head HR'
        : 'Head';
  }

  function formatFormStatus(status, reviewStage, submitterRole) {
    const normalized = String(status || 'PENDING')
      .trim()
      .toUpperCase();
    if (normalized === 'PENDING') {
      return String(reviewStage || '').toUpperCase() === 'HEAD'
        ? `Pending ${reviewerLabel(submitterRole)} Signature`
        : 'Pending HR/Admin Review';
    }
    return titleCase(normalized);
  }

  function isAssignedReviewer(form, email) {
    const normalized = String(email || '')
      .trim()
      .toLowerCase();
    return (
      Boolean(normalized) &&
      [form.head_reviewer_email, form.secondary_head_reviewer_email].some(
        (value) =>
          String(value || '')
            .trim()
            .toLowerCase() === normalized
      )
    );
  }

  function canEditForm(role, form) {
    return (
      ['STAFF', 'SUPERVISOR', 'HEAD', 'HR'].includes(role) &&
      form.status === 'PENDING' &&
      !Number(form.task_taken || 0) &&
      form.review_stage === 'HEAD' &&
      Boolean(form.head_reviewer_email)
    );
  }

  return {
    titleCase,
    reviewerLabel,
    formatFormStatus,
    canEditForm,
    isAssignedReviewer
  };
});
