function buildReviewScope(reviewer, requestedScope = null) {
  const hasReviewPermission = Boolean(
    reviewer.perms && reviewer.perms.includes('forms.review')
  );
  const defaultScope =
    reviewer &&
    (reviewer.role === 'HEAD' ||
      (reviewer.role === 'HR' && reviewer.is_hr_head))
      ? 'HEAD'
      : 'HR';
  const scope = String(requestedScope || defaultScope).toUpperCase();
  const branches = [];

  function addBranch(where, values, pendingStage) {
    branches.push({ where, values, pendingStage });
  }

  if (scope === 'ALL') {
    if (reviewer.role === 'HEAD') {
      addBranch(
        "f.head_reviewer_email = ? AND f.user_email IN (SELECT email FROM user_roles WHERE role IN ('STAFF', 'HEAD'))",
        [reviewer.email],
        'HEAD'
      );
    } else if (reviewer.role === 'HR' && reviewer.is_hr_head) {
      addBranch(
        "f.head_reviewer_email = ? AND f.user_email IN (SELECT email FROM user_roles WHERE role = 'HR')",
        [reviewer.email],
        'HEAD'
      );
    }

    if (hasReviewPermission && ['HR', 'ADMIN'].includes(reviewer.role)) {
      const excludeOwn = reviewer.role === 'HR';
      addBranch(
        `f.review_stage = 'HR'${excludeOwn ? ' AND f.user_email <> ?' : ''}`,
        excludeOwn ? [reviewer.email] : [],
        'HR'
      );
    }
  } else if (scope === 'HEAD') {
    addBranch('f.head_reviewer_email = ?', [reviewer.email], 'HEAD');
  } else {
    const excludeOwn = reviewer.role === 'HR';
    addBranch(
      `f.review_stage = 'HR'${excludeOwn ? ' AND f.user_email <> ?' : ''}`,
      excludeOwn ? [reviewer.email] : [],
      'HR'
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
              `((${branch.where}) AND f.status = 'PENDING' AND f.review_stage = '${branch.pendingStage}')`
          )
          .join(' OR ')})`
      : '0',
    pendingValues: branches.flatMap((branch) => branch.values)
  };
}

module.exports = { buildReviewScope };
