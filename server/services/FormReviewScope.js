function buildReviewScope(reviewer, requestedScope = null) {
  const hasReviewAccess = Boolean(
    reviewer.perms && (reviewer.perms.includes('forms.review') || reviewer.perms.includes('forms.view'))
  );
  const defaultScope =
    reviewer &&
    (['SUPERVISOR', 'HEAD'].includes(reviewer.role) ||
      (reviewer.role === 'HR' && reviewer.is_hr_head))
      ? 'HEAD'
      : 'HR';
  const scope = String(requestedScope || defaultScope).toUpperCase();
  const branches = [];
  const hrQueueStageFilter =
    "(f.review_stage = 'HR' OR (f.template_key = 'nexus-accountability' AND f.review_stage = 'HEAD'))";

  function addBranch(where, values, pendingStage) {
    branches.push({ where, values, pendingStage });
  }

  if (scope === 'ALL') {
    if (['SUPERVISOR', 'HEAD'].includes(reviewer.role)) {
      addBranch(
        `f.template_key <> 'nexus-accountability' AND (f.head_reviewer_email = ? OR f.secondary_head_reviewer_email = ?) AND f.user_email IN (SELECT email FROM user_roles WHERE role = '${reviewer.role === 'SUPERVISOR' ? 'STAFF' : 'SUPERVISOR'}')`,
        [reviewer.email, reviewer.email],
        'HEAD'
      );
    } else if (reviewer.role === 'HR' && reviewer.is_hr_head) {
      addBranch(
        "f.template_key <> 'nexus-accountability' AND (f.head_reviewer_email = ? OR f.secondary_head_reviewer_email = ?) AND f.user_email IN (SELECT email FROM user_roles WHERE role = 'HR')",
        [reviewer.email, reviewer.email],
        'HEAD'
      );
    }

    if (hasReviewAccess && ['HR', 'ADMIN'].includes(reviewer.role)) {
      const excludeOwn = reviewer.role === 'HR';
      addBranch(
        `${hrQueueStageFilter}${excludeOwn ? ' AND f.user_email <> ?' : ''}`,
        excludeOwn ? [reviewer.email] : [],
        'HR_OR_NEXUS'
      );
    }
  } else if (scope === 'HEAD') {
    if (
      ['SUPERVISOR', 'HEAD'].includes(reviewer.role) ||
      (reviewer.role === 'HR' && reviewer.is_hr_head)
    ) {
      const submitterRole =
        reviewer.role === 'SUPERVISOR'
          ? 'STAFF'
          : reviewer.role === 'HEAD'
            ? 'SUPERVISOR'
            : 'HR';
      addBranch(
        `f.template_key <> 'nexus-accountability' AND (f.head_reviewer_email = ? OR f.secondary_head_reviewer_email = ?) AND f.user_email IN (SELECT email FROM user_roles WHERE role = '${submitterRole}')`,
        [reviewer.email, reviewer.email],
        'HEAD'
      );
    }
  } else {
    const excludeOwn = reviewer.role === 'HR';
    addBranch(
      `${hrQueueStageFilter}${excludeOwn ? ' AND f.user_email <> ?' : ''}`,
      excludeOwn ? [reviewer.email] : [],
      'HR_OR_NEXUS'
    );
  }

  return {
    whereSql: branches.length
      ? `(${branches.map((branch) => `(${branch.where})`).join(' OR ')})`
      : '1 = 0',
    whereValues: branches.flatMap((branch) => branch.values),
    pendingSql: branches.length
      ? `(${branches
          .map(
            (branch) =>
              `((${branch.where}) AND f.status = 'PENDING' AND ${
                branch.pendingStage === 'HR_OR_NEXUS'
                  ? hrQueueStageFilter
                  : `f.review_stage = '${branch.pendingStage}'`
              })`
          )
          .join(' OR ')})`
      : '0',
    pendingValues: branches.flatMap((branch) => branch.values)
  };
}

module.exports = { buildReviewScope };
