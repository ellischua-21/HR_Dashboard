// Initial draft supplied for Part 8. Publication requires an authorized user's approval.
const MATRIX = [
  [
    'Light',
    [
      'Written Warning/Reprimand',
      '4 days Suspension',
      '6 days Suspension',
      '15 days Suspension',
      'Termination'
    ]
  ],
  [
    'Moderate',
    [
      'Written Warning with stern warning for suspension',
      '6 days Suspension',
      '15 days Suspension',
      'Termination'
    ]
  ],
  [
    'Grave',
    [
      '30 days Suspension (Final Warning or preventive suspension)',
      'Termination'
    ]
  ],
  ['Intolerable', ['Termination']]
].flatMap(([severity, actions]) =>
  actions.map((correctiveAction, index) => ({
    severity,
    occurrence: index + 1,
    correctiveAction
  }))
);

module.exports = { MATRIX };
