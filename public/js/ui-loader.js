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
  const fragments = [
    ['dashboard-fragment', 'views/Dashboard.html'],
    ['employees-fragment', 'views/Employees.html'],
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
    '../shared/FormStatus.js',
    'js/incident-management/Navigation.js',
    'js/SignaturePad.js',
    'js/Main.js',
    'js/Employees.js',
    'js/Reports.js',
    'js/Accounts.js',
    'js/UserDashboard.js',
    'js/AccountSettings.js',
    'js/incident-management/IncidentManagement.js',
    'js/incident-management/Progress.js',
    'js/incident-management/Track.js',
    'js/incident-management/Review.js'
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
  window.initializeDashboard();
})().catch((error) => {
  const status = document.getElementById('bootstrap-status');
  if (status) {
    status.className = 'login-error';
    status.textContent = error.message || String(error);
    return;
  }
  const message = document.getElementById('err');
  if (message) {
    message.textContent = error.message || String(error);
    message.hidden = false;
  } else {
    console.error(error);
  }
});
