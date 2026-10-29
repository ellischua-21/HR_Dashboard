// One shared indicator for startup, authentication, and application requests.
(function () {
  let pending = 0;
  let indicator;

  function render() {
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = 'loading-circle';
      indicator.setAttribute('role', 'status');
      indicator.setAttribute('aria-label', 'Loading');
    }
    if (!pending) {
      indicator.remove();
      return;
    }
    const byId = (id) => document.getElementById(id);
    const app = byId('app');
    const attendance = byId('view-attendance');
    const target =
      app && !app.hidden
        ? attendance && !attendance.hidden
          ? byId('attendance-loading')
          : byId('busy')
        : byId('bootstrap-status') ||
          document.querySelector('#login-screen button[type="submit"]');
    if (target && indicator.parentElement !== target)
      target.appendChild(indicator);
  }

  window.AppLoading = {
    begin() {
      pending += 1;
      render();
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        pending -= 1;
        render();
      };
    },
    async run(action) {
      const finish = this.begin();
      try {
        return await action();
      } finally {
        finish();
      }
    },
    refresh: render
  };
})();
