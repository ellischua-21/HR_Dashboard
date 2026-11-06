const loaderScript = document.currentScript;
const assetVersion = new URL(loaderScript.src).searchParams.get('v') || 'dev';
const appBaseUrl = new URL('../', loaderScript.src);
const stylesheet = document.getElementById('app-styles');
if (stylesheet)
  stylesheet.href = new URL(
    `css/Styles.css?v=${encodeURIComponent(assetVersion)}`,
    appBaseUrl
  );

(async function loadDashboard() {
  const finishLoading = AppLoading.begin();
  try {
    const fragments = [
      ['dashboard-fragment', 'views/Dashboard.html'],
      ['employees-fragment', 'views/Employees.html'],
      ['attendance-fragment', 'views/Attendance.html'],
      ['employee-dashboard-fragment', 'views/EmployeeDashboard.html'],
      ['reports-fragment', 'views/Reports.html'],
      ['accounts-fragment', 'views/Accounts.html'],
      ['account-settings-fragment', 'views/AccountSettings.html'],
      ['user-dashboard-fragment', 'views/UserDashboard.html'],
      [
        'incident-management-fragment',
        'views/incident-management/IncidentManagement.html'
      ]
    ];
    for (const [target, path] of fragments) {
      const url = new URL(
        `${path}?v=${encodeURIComponent(assetVersion)}`,
        appBaseUrl
      );
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Could not load ${path} (${response.status}).`);
      document.getElementById(target).innerHTML = await response.text();
    }
    for (const path of [
      '../shared/FormTemplates.js',
      '../shared/FormValidation.js',
      '../shared/FormStatus.js',
      '../shared/DateUtils.js',
      'js/DateTimeInputs.js',
      'js/incident-management/Navigation.js',
      'js/SignaturePad.js',
      'js/UI.js',
      'js/RequiredFields.js',
      'js/AppConfirm.js',
      'js/OutsideDismiss.js',
      'js/EmployeeSearch.js',
      'js/Main.js',
      'js/Employees.js',
      'js/AttendanceUI.js',
      'js/Attendance.js',
      'js/EmployeeDashboard.js',
      'js/Reports.js',
      'js/Accounts.js',
      'js/UserDashboard.js',
      'js/AccountSettings.js',
      'js/incident-management/Documents.js',
      'js/incident-management/Evaluation.js',
      'js/incident-management/Notice.js',
      'js/incident-management/IncidentManagement.js',
      'js/incident-management/Investigation.js',
      'js/incident-management/Progress.js',
      'js/incident-management/Timeline.js',
      'js/incident-management/Track.js',
      'js/incident-management/Review.js',
      'js/incident-management/History.js',
      'js/incident-management/CodeOfConduct.js'
    ]) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL(
          `${path}?v=${encodeURIComponent(assetVersion)}`,
          appBaseUrl
        );
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Could not load ${path}.`));
        document.body.appendChild(script);
      });
    }
    await window.initializeDashboard();
  } finally {
    finishLoading();
  }
})().catch((error) => {
  AppErrors.show(error.message || String(error));
});
