function bindPasswordChange(formId) {
  const form = $(formId);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    const currentPassword = values.get('currentPassword');
    const newPassword = values.get('newPassword');

    if (newPassword !== values.get('confirmPassword')) {
      AppErrors.show('The new passwords do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      AppErrors.show(
        'Choose a new password different from your current password.'
      );
      return;
    }

    submit.disabled = true;
    try {
      await api('changeMyPassword', currentPassword, newPassword);
      form.reset();
      AppFeedback.success('Password changed successfully.');
    } catch (error) {
      AppErrors.show(error.message || String(error));
    } finally {
      submit.disabled = false;
    }
  };
}

VIEWS['account-settings'] = () => {};
bindPasswordChange('account-password-form');
