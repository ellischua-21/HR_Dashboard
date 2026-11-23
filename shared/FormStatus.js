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

  function assignedReviewerRole(accountRole) {
    if (['STAFF', 'SUPERVISOR'].includes(accountRole)) return 'SUPERVISOR';
    return accountRole === 'HEAD' ? 'HEAD' : null;
  }

  function assignedReviewerRoles(accountRole) {
    if (accountRole === 'ADMIN') return ['ADMIN'];
    if (accountRole === 'HR') return ['HR', 'ADMIN'];
    const primary = assignedReviewerRole(accountRole);
    if (!primary) return [];
    return ['STAFF', 'SUPERVISOR'].includes(accountRole)
      ? ['SUPERVISOR', 'HEAD', 'ADMIN']
      : [primary, 'ADMIN'];
  }

  function reviewerLabel(submitterRole) {
    return assignedReviewerRole(submitterRole) === 'SUPERVISOR'
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

  function canReviewHeadStage(reviewer, form) {
    // HR reporting assignments do not replace the designated Head HR workflow.
    return (
      form.review_stage === 'HEAD' &&
      form.template_key !== 'nexus-accountability' &&
      String(form.user_email || '').toLowerCase() !==
        String(reviewer.email || '').toLowerCase() &&
      isAssignedReviewer(form, reviewer.email) &&
      ((form.submitter_role !== 'HR' &&
        assignedReviewerRoles(form.submitter_role).includes(reviewer.role)) ||
        (reviewer.role === 'HR' &&
          reviewer.is_hr_head &&
          form.submitter_role === 'HR'))
    );
  }

  return {
    assignedReviewerRole,
    assignedReviewerRoles,
    canReviewHeadStage,
    titleCase,
    reviewerLabel,
    formatFormStatus,
    canEditForm,
    isAssignedReviewer
  };
});
