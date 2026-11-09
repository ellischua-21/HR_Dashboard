(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.IncidentWorkflowDefinition = value;
})(typeof window === 'undefined' ? globalThis : window, function () {
  return {
    classifications: [
      'Attendance / Punctuality',
      'Negligence / Work Performance',
      'Insubordination',
      'Dishonesty',
      'Violation Of Procedure',
      'Misconduct',
      'Loss / Damage',
      'Other'
    ],
    evidenceTypes: [
      'Incident Report',
      'CCTV Footage',
      'Photographs / Videos',
      'Emails / Messages',
      'Attendance Records',
      'Transaction / Inventory Records',
      'Witness Statements',
      'Other'
    ],
    reviewIndicators: [
      'Explanation Received Within Prescribed Period',
      'Extension Requested',
      'Administrative Hearing Requested',
      'No Explanation Received',
      'Further Investigation Required',
      'Additional Evidence Reviewed'
    ],
    responseCalendarDays: 5,
    evidenceAccept:
      '.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.xls,.xlsx,.ppt,.pptx,.rtf,.mp3,.wav,.mp4,.mov',
    directive:
      'Based on the foregoing reported facts and alleged violation, you are directed to submit a written explanation addressing the allegations in this Notice. Include your account of the incident, relevant circumstances, and supporting documents or evidence that may establish your position.\n\nYou are given five (5) calendar days from receipt of this Notice to prepare and submit your written explanation to Human Resources. The period is computed from the date you receive this Notice.\n\nYou have an opportunity to be heard and present your side and evidence. You may request an administrative conference or hearing or submit a written request to clarify a matter relevant to your defense.\n\nFailure to submit an explanation within the prescribed period is not automatically an admission of the allegations. The company may evaluate the available evidence after providing a reasonable opportunity to respond.\n\nNo final determination has been made at this stage. Any disciplinary action will be determined only after considering your explanation, the evidence, and applicable company rules and Philippine labor laws.'
  };
});
