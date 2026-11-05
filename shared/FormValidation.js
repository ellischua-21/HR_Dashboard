(function (root, factory) {
  const validation = factory();
  if (typeof module === 'object' && module.exports) module.exports = validation;
  if (root) root.FormValidation = validation;
})(typeof window === 'undefined' ? globalThis : window, function () {
  return {
    hasSufficientExplanation(value) {
      return Array.from(String(value || '').replace(/\s/gu, '')).length >= 10;
    }
  };
});
