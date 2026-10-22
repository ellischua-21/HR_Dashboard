(async function loadDashboard() {
  const fragments = [
    ['dashboard-fragment', 'views/Dashboard.html'],
    ['employees-fragment', 'views/Employees.html'],
    ['reports-fragment', 'views/Reports.html'],
    ['accounts-fragment', 'views/Accounts.html'],
    ['account-settings-fragment', 'views/AccountSettings.html'],
    ['user-dashboard-fragment', 'views/UserDashboard.html']
  ];
  for (const [target, path] of fragments) {
    const response = await fetch(`${path}?v=20261022-5`);
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
    document.getElementById(target).innerHTML = await response.text();
  }
  for (const path of ['../shared/FormTemplates.js', 'js/Main.js', 'js/Employees.js', 'js/Reports.js', 'js/Accounts.js', 'js/UserDashboard.js', 'js/AccountSettings.js']) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${path}?v=20261022-5`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${path}.`));
      document.body.appendChild(script);
    });
  }
  window.initializeDashboard();
})().catch(error => {
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
