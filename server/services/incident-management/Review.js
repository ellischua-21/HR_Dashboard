// Review labels describe each role's queue; they do not change case stages.
function categoriesForRole(role) {
  if (role === 'HEAD') return ['ALL', 'FOR_REVIEW', 'NTE_ISSUED', 'CLOSED'];
  if (role === 'HR') return ['ALL', 'NTE_ISSUED', 'FOR_REVIEW', 'CLOSED'];
  return ['ALL', 'IR_FILED', 'NTE_ISSUED', 'CLOSED'];
}
function categoryForIncident(row, user) {
  if (row.legacy || row.status === 'CLOSED') return 'CLOSED';
  if (user.role === 'HR')
    return row.phase === 'EMPLOYEE' ? 'NTE_ISSUED' : 'FOR_REVIEW';
  return row.status === 'IR FILED'
    ? user.role === 'HEAD'
      ? 'FOR_REVIEW'
      : 'IR_FILED'
    : 'NTE_ISSUED';
}
module.exports = { categoriesForRole, categoryForIncident };
