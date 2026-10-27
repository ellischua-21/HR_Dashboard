function bindPasswordChange(formId, feedbackId) {
  const form = $(formId);
  const feedback = $(feedbackId);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    const currentPassword = values.get('currentPassword');
    const newPassword = values.get('newPassword');
    feedback.hidden = true;

    if (newPassword !== values.get('confirmPassword')) {
      feedback.className = 'login-error';
      feedback.textContent = 'The new passwords do not match.';
      feedback.hidden = false;
      return;
    }
    if (currentPassword === newPassword) {
      feedback.className = 'login-error';
      feedback.textContent =
        'Choose a new password different from your current password.';
      feedback.hidden = false;
      return;
    }

    submit.disabled = true;
    try {
      await api('changeMyPassword', currentPassword, newPassword);
      form.reset();
      feedback.className = 'okmsg';
      feedback.textContent = 'Password changed successfully.';
      feedback.hidden = false;
    } catch (error) {
      feedback.className = 'login-error';
      feedback.textContent = error.message || String(error);
      feedback.hidden = false;
    } finally {
      submit.disabled = false;
    }
  };
}

VIEWS['account-settings'] = () => {};
bindPasswordChange('account-password-form', 'account-password-feedback');
