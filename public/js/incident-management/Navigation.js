// Navigation entries only. Page routes and behavior will be added with their specifications.
(function (global) {
  const NAVIGATION_BY_ROLE = {
    STAFF: [
      ['incident-track', 'Track'],
      ['incident-history', 'History'],
      ['incident-code-of-conduct', 'Code of Conduct']
    ],
    HEAD: [
      ['incident-file', 'File'],
      ['incident-track', 'Track'],
      ['incident-history', 'History'],
      ['incident-code-of-conduct', 'Code of Conduct']
    ],
    HR: [
      ['incident-file', 'File'],
      ['incident-track', 'Track'],
      ['incident-review', 'Review'],
      ['incident-code-of-conduct', 'Code of Conduct']
    ],
    ADMIN: [
      ['incident-file', 'File'],
      ['incident-track', 'Track'],
      ['incident-review', 'Review'],
      ['incident-code-of-conduct', 'Code of Conduct']
    ]
  };

  global.INCIDENT_MANAGEMENT_NAVIGATION = {
    forRole(role) {
      return (NAVIGATION_BY_ROLE[role] || []).map((item) => [...item]);
    }
  };
})(window);
