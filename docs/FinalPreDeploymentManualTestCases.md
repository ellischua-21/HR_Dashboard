# Final Pre-Deployment Manual Test Cases

**Execute one case, record the result, then continue.** See the [main plan](FinalPreDeploymentManualTestingPlan.md) for roster aliases, fixtures, permissions, API replay instructions and release gates. Use the [results CSV](FinalPreDeploymentManualTestResults.csv) to track execution.

Prepared 11/13/2026; reviewed 11/23/2026 against application commit `5056004`. 190 cases. This revision updates procedures only; no manual case was executed or marked Pass. Previously recorded results/evidence are preserved; retest changed requirements. QA-only actions must not mutate imported real employee records.

Execution Scope separates live observation of business records from QA-only work. In mixed cases, perform only observational steps that fit existing data on the imported database; execute mutations, fixture creation and fault/security variants in QA. A live subset is not a full-case Pass. Every listed variant is required for complete sign-off. Preserve per-variant results in Notes / Evidence. “Reopen” means close the view and reload it through the named menu or Refresh; use a full page reload if necessary. “QA replay” means the credential-isolated API recipe in the main plan; never carry a privileged session cookie into an unauthorized-role test.

## Module index

| Case prefix | Cases | Open module |
| --- | --- | --- |
| BOOT | 8 | [Startup, navigation and shared controls](#boot-cases) |
| AUTH | 10 | [Login, identity, sessions and password](#auth-cases) |
| EMP | 15 | [Employee management](#emp-cases) |
| IMP | 9 | [Spreadsheet import](#imp-cases) |
| ACC | 13 | [Account and reviewer configuration](#acc-cases) |
| SELF | 4 | [Personal dashboard](#self-cases) |
| FORM | 22 | [Seven forms, routing and printing](#form-cases) |
| LEAVE | 10 | [Leave ledger and regularization](#leave-cases) |
| ATT | 14 | [Attendance and scanner integration](#att-cases) |
| REPORT | 8 | [Analytics, reports, exports and audit](#report-cases) |
| NOTIFY | 7 | [Announcements, Inbox and badges](#notify-cases) |
| INC | 35 | [Incident workflow and confidentiality](#inc-cases) |
| COC | 5 | [Code of Conduct and violation history](#coc-cases) |
| TASK | 10 | [Ownership, timing and HR Performance](#task-cases) |
| SEC | 8 | [Authorization, privacy and deployment boundary](#sec-cases) |
| OPS | 5 | [Operator-assisted integration and recovery](#ops-cases) |
| E2E | 7 | [Cross-module workflows](#e2e-cases) |

**Total:** 190 cases — 102 Critical, 77 High, 11 Medium. New cases start Not Tested; prior execution/evidence entries are preserved.

## BOOT cases

### BOOT-01 — Open the deployed root

**Test ID:** BOOT-01  
**Module and Feature:** Startup — Open the deployed root  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** All roles  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Apache and API already running in the isolated QA environment.

**Test Steps:**

1. Open the company test URL ending /HR_Dashboard/.
2. Confirm redirect to public/ and the sign-in screen.
3. Sign in with each role and check its landing page.

**Expected Result:** Root redirects successfully; STAFF/SUPERVISOR/HEAD land on their own dashboard, HR on workforce analytics, ADMIN on HR Performance.

**Data Integrity Check:** Read-only navigation creates no employee or account records.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### BOOT-02 — Recover from a missing browser asset

**Test ID:** BOOT-02  
**Module and Feature:** Startup — Recover from a missing browser asset  
**Priority:** High  
**Test Type:** Negative  
**Required Role:** Any  
**Execution Scope:** QA only
**Preconditions:** Browser DevTools Network request blocking available.

**Test Steps:**

1. Block views/Employees.html, then reload.
2. Read the startup error and select Reload Page.
3. Unblock the request and reload again.

**Expected Result:** Application stays hidden during failed startup; error names the failed resource; reload recovers without duplicate menus.

**Data Integrity Check:** No partial form or employee save occurs.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### BOOT-03 — Role menus and repeated entry

**Test ID:** BOOT-03  
**Module and Feature:** Navigation — Role menus and repeated entry  
**Priority:** High  
**Test Type:** Regression  
**Required Role:** Every role; Head HR separately  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Approved linked accounts from the fixture roster.

**Test Steps:**

1. Sign in to one account per browser profile.
2. Visit every visible menu, then revisit each three times.
3. Expand and collapse Forms, Reports, Employees, Incident Management and Manage Accounts where present.

**Expected Result:** Menus follow the role matrix; every visible page opens; one click invokes one action; no duplicate rows, dialogs or handlers accumulate.

**Data Integrity Check:** Accounts retain their own queues; navigating does not change stored business states.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### BOOT-04 — Mobile sidebar and stacking

**Test ID:** BOOT-04  
**Module and Feature:** Navigation — Mobile sidebar and stacking  
**Priority:** Medium  
**Test Type:** Functional  
**Required Role:** HR and STAFF  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Desktop browser with device emulation at 375 and 768 CSS pixels.

**Test Steps:**

1. Open Menu at each width and switch groups.
2. Click outside, reopen, then press Escape.
3. Scroll a wide table horizontally and vertically; open a dialog over it.

**Expected Result:** Sidebar closes by outside click/Escape; current menu stays identifiable; frozen headers do not cover navigation, feedback or dialogs.

**Data Integrity Check:** No writes; record any inaccessible action or clipped required field.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### BOOT-05 — Keyboard, zoom and signatures

**Test ID:** BOOT-05  
**Module and Feature:** Shared controls — Keyboard, zoom and signatures  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** STAFF and HR  
**Execution Scope:** QA only
**Preconditions:** Form requiring a signature; keyboard and touch or mouse available.

**Test Steps:**

1. At 200% zoom, use Tab/Shift+Tab and Enter to reach fields, suggestions, buttons and dialog controls.
2. Draw, clear and redraw a signature; rotate or resize the viewport.
3. Submit the completed synthetic form once.

**Expected Result:** Required markers remain associated with controls; focus and selected suggestions are visible; signature survives ordinary resizing and can be saved legibly.

**Data Integrity Check:** Exactly one signed form is saved; clearing an unsaved signature changes no prior record.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### BOOT-06 — Confirm, cancel and unsaved dialogs

**Test ID:** BOOT-06  
**Module and Feature:** Shared controls — Confirm, cancel and unsaved dialogs  
**Priority:** High  
**Test Type:** Regression  
**Required Role:** HR and STAFF  
**Execution Scope:** QA only
**Preconditions:** An employee profile and an unsaved form dialog.

**Test Steps:**

1. Open Archive, then cancel its confirmation.
2. Type in a form or draw a signature and click outside the dialog.
3. Use its explicit Cancel; open and dismiss a clean read-only dialog.

**Expected Result:** Cancel performs no archive; a dirty dialog stays open with save/cancel feedback; clean dismissible dialogs close; mandatory acknowledgment dialogs require their explicit action.

**Data Integrity Check:** Cancelled actions create no employee, form, archive or decision change.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### BOOT-07 — Dates, times and back-to-top

**Test ID:** BOOT-07  
**Module and Feature:** Shared controls — Dates, times and back-to-top  
**Priority:** Medium  
**Test Type:** Boundary  
**Required Role:** Any  
**Execution Scope:** Live observation / QA variants
**Preconditions:** A long page and date/time inputs.

**Test Steps:**

1. Enter 02/29/2028, then invalid 02/29/2027 and 02/30/2027.
2. Enter 12:00 AM and 12:00 PM in applicable controls.
3. Scroll more than 320 pixels and use the up-arrow button.

**Expected Result:** Valid leap date is accepted; impossible dates are rejected; midnight/noon stay distinct; displayed values use MM/DD/YYYY and AM/PM; up-arrow returns to top.

**Data Integrity Check:** Canonical dates and 24-hour times round-trip unchanged in saved test records.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### BOOT-08 — Loading and network recovery

**Test ID:** BOOT-08  
**Module and Feature:** Shared controls — Loading and network recovery  
**Priority:** High  
**Test Type:** Negative  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** DevTools Offline and slow-network controls available.

**Test Steps:**

1. Open a list under slow network and attempt its action twice.
2. Switch Offline and refresh the list.
3. Return Online and retry after checking whether any preceding save succeeded.

**Expected Result:** Loading feedback is visible and clears on success/error; error is understandable; retry restores usable controls; failed reads do not present stale data as newly retrieved.

**Data Integrity Check:** Compare list and reference numbers before retrying writes; report duplicate submissions separately.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

## AUTH cases

### AUTH-01 — Successful login and normalization

**Test ID:** AUTH-01  
**Module and Feature:** Authentication — Successful login and normalization  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** Every role  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Approved active account linked to exactly one unarchived employee.

**Test Steps:**

1. Sign in with the assigned Primary Email and password.
2. Repeat with surrounding spaces and changed email capitalization.
3. Reload and open Inbox. Verify Secondary Email and Corporate Email do not replace the Primary Email login.

**Expected Result:** Both email spellings resolve to the same account; role and employee name are correct; authenticated refresh works.

**Data Integrity Check:** No duplicate identity or account is created; employee data is read from the linked employee.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### AUTH-02 — Invalid and pending credentials

**Test ID:** AUTH-02  
**Module and Feature:** Authentication — Invalid and pending credentials  
**Priority:** Critical  
**Test Type:** Negative  
**Required Role:** Signed out  
**Execution Scope:** QA only
**Preconditions:** One pending request, one rejected request and one approved account.

**Test Steps:**

1. Attempt an unknown email, wrong password and blank required inputs.
2. Try the initial password of the pending request.
3. Reject that separate request as ADMIN, then try signing in again.

**Expected Result:** Unknown/wrong/pending/rejected credentials do not enter the application; generic invalid-credentials response does not disclose a password.

**Data Integrity Check:** Rejected request removal does not delete its employee; approved account remains unchanged.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### AUTH-03 — Employee identity is mandatory

**Test ID:** AUTH-03  
**Module and Feature:** Authentication — Employee identity is mandatory  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Ordinary HR/ADMIN and STAFF  
**Execution Scope:** QA only
**Preconditions:** Isolated fixtures with no matching employee, two active email matches, and an archived-only match; no real-data editing.

**Test Steps:**

1. Attempt login for each exceptional identity.
2. For an existing session, have the QA operator archive its synthetic employee, then request a protected read.
3. Restore the isolated fixture through the agreed QA process.

**Expected Result:** Ordinary accounts without exactly one current match cannot log in or continue protected operations; old sessions do not bypass identity checks.

**Data Integrity Check:** No placeholder employee is generated; ambiguous identities remain unrepaired by login.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### AUTH-04 — First setup ADMIN exception

**Test ID:** AUTH-04  
**Module and Feature:** Authentication — First setup ADMIN exception  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** First setup ADMIN; second ADMIN  
**Execution Scope:** QA only
**Preconditions:** Separate disposable first-install QA database; operator-provisioned accounts only.

**Test Steps:**

1. Sign in as the specifically flagged first setup ADMIN without an employee.
2. Attempt the same with a second unlinked ADMIN.
3. After importing a genuine matching employee, sign in again as the first setup ADMIN.

**Expected Result:** Only the explicitly flagged setup ADMIN can initially enter without an employee; later it uses the genuine profile; additional ADMINs receive no exception.

**Data Integrity Check:** No fabricated employee or broadened setup flag; inspect is_setup_admin read-only if needed.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### AUTH-05 — Logout and browser Back

**Test ID:** AUTH-05  
**Module and Feature:** Authentication — Logout and browser Back  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Any  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Authenticated session with a profile/form/case open.

**Test Steps:**

1. Sign out.
2. Press Back, reload, and reopen a previously captured protected API request.
3. Try the same evidence URL in a signed-out private window.

**Expected Result:** Logout destroys the session; subsequent protected requests/downloads fail authorization; reload shows login. Record any sensitive cached screen visible after Back as a privacy defect.

**Data Integrity Check:** No protected mutation succeeds after logout; response contains no employee or document payload.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### AUTH-06 — Session expiry

**Test ID:** AUTH-06  
**Module and Feature:** Authentication — Session expiry  
**Priority:** High  
**Test Type:** Security  
**Required Role:** Any  
**Execution Scope:** QA only
**Preconditions:** Dedicated QA session allowed to age for the configured eight-hour cookie lifetime.

**Test Steps:**

1. Record sign-in time and leave the session unused past eight hours.
2. Attempt a protected read and a pending form action.
3. Reload and sign in again.

**Expected Result:** Expired session is denied server-side; user can recover by signing in; no unsaved action is silently recorded under another account.

**Data Integrity Check:** Compare form/case version before and after the denied request.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### AUTH-07 — Current role and account status

**Test ID:** AUTH-07  
**Module and Feature:** Authentication — Current role and account status  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** STAFF plus QA operator  
**Execution Scope:** QA only
**Preconditions:** Isolated account whose active flag/role may be changed by an authorized QA operator; no browser account-disable feature assumed.

**Test Steps:**

1. Keep a session open.
2. Have the operator mark that synthetic account inactive, then replay a protected request.
3. Repeat with an authorized role change and refresh the session.

**Expected Result:** Inactive accounts lose protected access immediately; permissions follow the current stored role, not an old session payload or client-supplied role.

**Data Integrity Check:** Only the authorized fixture alteration exists; no extra grants appear.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### AUTH-08 — Change password successfully

**Test ID:** AUTH-08  
**Module and Feature:** Password — Change password successfully  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** Any  
**Execution Scope:** QA only
**Preconditions:** Known current password and a different 12–128 character test password.

**Test Steps:**

1. Open Change Password and enter current/new/confirmation.
2. Select Update Password and sign out.
3. Try the old password, then the new password.

**Expected Result:** Success feedback and cleared fields; old password fails and new password succeeds.

**Data Integrity Check:** ACCOUNT_PASSWORD_CHANGED audit exists; stored hash changes; no plaintext password in responses or audit details.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### AUTH-09 — Validation boundaries

**Test ID:** AUTH-09  
**Module and Feature:** Password — Validation boundaries  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** Any  
**Execution Scope:** QA only
**Preconditions:** Authenticated synthetic account.

**Test Steps:**

1. Try wrong current password, mismatching confirmation and same-as-current password in the UI.
2. Try new passwords of 11, 12, 128 and 129 characters, using a different value each time.
3. Sign out and confirm only the last accepted password works.

**Expected Result:** Wrong current, mismatch, same-value UI submission and out-of-range lengths are rejected; 12 and 128 character different passwords succeed.

**Data Integrity Check:** Rejected attempts do not change the hash; capture no actual passwords in evidence.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### AUTH-10 — Direct API and other-session behavior

**Test ID:** AUTH-10  
**Module and Feature:** Password — Direct API and other-session behavior  
**Priority:** High  
**Test Type:** Security  
**Required Role:** Same account in two separate browser profiles  
**Execution Scope:** QA only
**Preconditions:** Profile A and B authenticated; captured changeMyPassword request.

**Test Steps:**

1. In A, change to a different valid password.
2. In B, request a protected read.
3. In isolated QA only, replay the API request with current and new passwords identical.

**Expected Result:** Record actual session behavior: code does not revoke other sessions on password change and only the UI prevents same-value changes. Treat unmet organizational password/session requirements as release decisions, not assumed protections.

**Data Integrity Check:** No other account hash changes; evidence redacts request passwords.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

## EMP cases

### EMP-01 — Register a complete employee

**Test ID:** EMP-01  
**Module and Feature:** Employees — Register a complete employee  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** HR or ADMIN  
**Execution Scope:** QA only
**Preconditions:** QA employee only; active SUP-A with an eligible active reviewer; unused employee number and Primary Email. Repeat separately as HR and ADMIN.

**Test Steps:**

1. Open Employees → Employee Registration and complete required fields using current choices.
2. Choose STAFF, search Reports To and select SUP-A; enter matching initial passwords.
3. Review the preview and select Save Employee. Find the saved employee in the master list.
4. Check new-registration success leaves a blank form ready for the next employee.

**Expected Result:** HR creates one employee plus a pending account request; ADMIN creates one employee plus usable access immediately, without a pending request. Preview reflects the actor-specific outcome. Name is calculated as Last, First Middle; successful registration resets the form, record ID, passwords and reviewer selections.

**Data Integrity Check:** One employee identity; HR leaves one account_requests row and no login; ADMIN leaves one user_roles row and no pending request. Employee and account audit events commit together. An account/audit failure rolls back all related writes.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### EMP-02 — Required and numeric validation

**Test ID:** EMP-02  
**Module and Feature:** Employees — Required and numeric validation  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Unsaved registration with otherwise valid values.

**Test Steps:**

1. Leave each required field blank in turn: Last Name, First Name, Company Name, Work Location, Current Position, Department, Employee Rank, Date of Employment, Employment Status, and Birthday.
2. Try FTE -0.01, 0, 1 and 1.01; try a future birthday.
3. Register/edit with Employee Number, Middle Name, Primary Email and FTE blank; then supply Primary Email and valid account details.

**Expected Result:** Required blanks, future birthday and supplied FTE outside 0–1 reject. Employee Number, Middle Name, Primary Email, Secondary Email and FTE are optional employee fields. Blank Primary Email creates an employee-only record. A nonblank Primary Email on new registration requires valid account details. Invalid dropdown choices reject server-side.

**Data Integrity Check:** Invalid requests save neither employee nor pending account.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### EMP-03 — Family and conditional profile details

**Test ID:** EMP-03  
**Module and Feature:** Employees — Family and conditional profile details  
**Priority:** Medium  
**Test Type:** Functional  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Synthetic family/emergency/social information only.

**Test Steps:**

1. Add and remove sibling, child and organization rows; save two populated rows in each section.
2. Select Position In Church Yes without its position, then fill it.
3. Reopen and edit the profile.

**Expected Result:** Structured rows, row counts and labels render correctly; Yes requires a position; removed blank rows do not reappear; emergency and social fields persist.

**Data Integrity Check:** JSON uses supported columns only, at most 20 rows per section and 200 characters per cell; excess direct-API data is bounded rather than assumed rejected.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### EMP-04 — Search, filters, sorting and empty results

**Test ID:** EMP-04  
**Module and Feature:** Employees — Search, filters, sorting and empty results  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** HR and ADMIN  
**Execution Scope:** Live observation / QA variants
**Preconditions:** At least 30 employees across two companies, departments, ranks, locations and statuses.

**Test Steps:**

1. Open the master list and verify No. ascending, including 1, 2, 10 and a three-digit value. Search a partial name/employee number with Enter and Search.
2. Change the visible Company, Department and Status filters, then clear them. Location/Rank are report/API filters, not additional list controls.
3. Click sortable headers twice, then search an absent term.
4. Scroll horizontally/vertically at desktop and narrow widths. Check Account Status, No., Name of Employee and Employee Number stay frozen and header/body edges align.
5. Sort/filter again and resize. Inspect centered text, two-line Account Status, light green Active/light red Inactive, and unclipped three-digit No. values.

**Expected Result:** Rows/count and sort directions agree; default No. order is numeric ascending and all rows load without pagination. The separate account-status strip shows Active only for an active linked account; missing, inactive-account, pending-only and blank-email records show Inactive. Status follows the correct employee through sort/filter/resize. Four identity columns stay frozen/aligned; scrolling fields do not cover frozen headers. Record any mobile overlap/clipping as a defect.

**Data Integrity Check:** Read-only operations preserve employee count and values.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### EMP-05 — Full profile, edit preview and cancel

**Test ID:** EMP-05  
**Module and Feature:** Employees — Full profile, edit preview and cancel  
**Priority:** High  
**Test Type:** Regression  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Saved profile with populated optional and sensitive fields.

**Test Steps:**

1. Open a master-list row by click and keyboard Enter.
2. Edit its address and department, review the preview, then go Back and cancel.
3. Repeat and save; reopen from master list and HR Reports.

**Expected Result:** Cancel does not persist values. Successful employee editing closes the preview and returns to Employee Master List, rather than reopening the editing sections. Reopen from both master list and HR Reports to verify saved changes, untouched fields and existing profile/print controls.

**Data Integrity Check:** Same record_id and created metadata; modified metadata and UPDATE field list change once.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### EMP-06 — Duplicate employee number

**Test ID:** EMP-06  
**Module and Feature:** Employees — Duplicate employee number  
**Priority:** Critical  
**Test Type:** Negative  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Existing current and archived employee numbers.

**Test Steps:**

1. Register with a current employee number.
2. Repeat with the archived number and a case variant.
3. Correct to an unused number and save.

**Expected Result:** Duplicates are rejected according to deployed database collation; archived numbers remain reserved; corrected registration succeeds.

**Data Integrity Check:** Existing profiles and credentials are unchanged; exactly one final valid registration appears.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### EMP-07 — Email uniqueness and normalization

**Test ID:** EMP-07  
**Module and Feature:** Employees — Email uniqueness and normalization  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Unused email plus current and archived email owners.

**Test Steps:**

1. Create/edit to an existing email using case and whitespace variants.
2. Try the archived owner email.
3. Use an unused valid email and reopen the successful profile.

**Expected Result:** Collisions are rejected across active and archived records; comparisons ignore case/outer whitespace; original stored spelling is not arbitrarily rewritten.

**Data Integrity Check:** No second nonblank identity is committed; no historic attribution changes.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### EMP-08 — Linked email protection

**Test ID:** EMP-08  
**Module and Feature:** Employees — Linked email protection  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Employee linked to active account, inactive account or pending request; one imported unlinked employee.

**Test Steps:**

1. Attempt to change and clear each linked Primary Email.
2. Make an equivalent case/space-only edit and reopen.
3. Change an unlinked employee to an unused Primary Email; confirm Secondary/Corporate Email edits do not alter login identity.

**Expected Result:** Linked changes/clears are rejected; equivalent edit keeps stored spelling; unlinked change succeeds.

**Data Integrity Check:** Existing logins, reviewer assignments, signatures and pending requests keep their original identity.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### EMP-09 — Archive confirmation and consequences

**Test ID:** EMP-09  
**Module and Feature:** Employees — Archive confirmation and consequences  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** HR and the synthetic STAFF owner  
**Execution Scope:** QA only
**Preconditions:** Disposable employee with historical form/case and its own session open; separate backup QA admin.

**Test Steps:**

1. Open its profile, select Archive and cancel once.
2. Confirm Archive on the second attempt.
3. Refresh master list, reports, the employee session and historical form/case readers.

**Expected Result:** Archived employee leaves normal lists/reports; ordinary linked session is denied; historical transactions remain accessible to still-authorized reviewers. No restore/delete UI is assumed.

**Data Integrity Check:** record_status becomes Archived; no employee or historical form/case deletion; ARCHIVE audit recorded.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### EMP-10 — Text safety and real-world names

**Test ID:** EMP-10  
**Module and Feature:** Employees — Text safety and real-world names  
**Priority:** High  
**Test Type:** Security  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Synthetic Unicode name, apostrophe, ampersand, formula-like and markup-like values.

**Test Steps:**

1. Register/edit values such as Peña, O’Neil, A&B, and a harmless markup-like string.
2. Reopen profile, preview and directory report.
3. Export CSV and open it as data in a spreadsheet.

**Expected Result:** Unicode remains readable; markup does not execute; angle brackets are sanitized; formula-like nonnumeric text is neutralized. Record any unacceptable spelling/truncation as a data-quality issue.

**Data Integrity Check:** Stored text obeys existing sanitization; export does not execute a spreadsheet formula.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### EMP-11 — Read-only self profile updates

**Test ID:** EMP-11  
**Module and Feature:** Employees — Read-only self profile updates  
**Priority:** High  
**Test Type:** Integration  
**Required Role:** HR then STAFF  
**Execution Scope:** QA only
**Preconditions:** STAFF-A linked employee; known previous job/contact fields.

**Test Steps:**

1. As HR, update permitted job/contact fields and save.
2. As STAFF-A, reopen Dashboard and View Full Profile.
3. Compare job, personal and manager sections; attempt to edit the display.

**Expected Result:** Self profile reflects the same employee data after refresh and is read-only; direct manager prefers the account assignment over free-text Reports To.

**Data Integrity Check:** No second profile or stale old-account details; calculated age follows birthday.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### EMP-12 — Failed combined registration

**Test ID:** EMP-12  
**Module and Feature:** Employees — Failed combined registration  
**Priority:** Critical  
**Test Type:** Negative  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Valid employee form with invalid role/password/reviewer account request.

**Test Steps:**

1. Submit valid employee details but an invalid access request using captured QA request editing.
2. Observe the error.
3. Search the employee number and inspect Account Requests as ADMIN.

**Expected Result:** Combined save rolls back; a failed account request does not leave an orphan employee.

**Data Integrity Check:** Neither employee nor request nor success audit remains committed; a later valid retry can use the number/email.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### EMP-13 — Employment status is separate from login

**Test ID:** EMP-13  
**Module and Feature:** Employees — Employment status is separate from login  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** HR and synthetic STAFF  
**Execution Scope:** QA only
**Preconditions:** Active account linked to one unarchived employee; reversible QA employment-status edits.

**Test Steps:**

1. Change employee Employment Status to Resigned, Inactive or Terminated in separate trials.
2. Attempt login and protected read with active user_roles account.
3. Compare archive behavior separately.

**Expected Result:** Current authentication checks account active flag and unique nonarchived identity, not employment status. Record that these statuses alone do not disable login; if offboarding requires immediate denial, release needs a proven account-revocation procedure.

**Data Integrity Check:** No automatic deletion of account/history; status change is distinct from record_status archive.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________


### EMP-14 — Current headers, optional contacts and generated fields

**Test ID:** EMP-14
**Module and Feature:** Employees — Current headers, optional contacts and generated fields
**Priority:** High
**Test Type:** Regression
**Required Role:** HR and ADMIN
**Execution Scope:** QA only
**Preconditions:** QA profile with no login; current template and allowed choices.

**Test Steps:**

1. Compare registration, Edit, profile, master list and HR master-report labels with the current import template.
2. Check Primary Email, optional Secondary Email/Corporate Email, Mobile Number, HMO Provider and adjacent HMO Details. Verify Landline Number is absent.
3. Save comma/slash-separated mobile numbers as text, separate Primary/Secondary Emails and ordinary free text in HMO Details.
4. Repeat with Primary Email blank and no account details; verify the account-role card remains visible and permitted controls are interactive.
5. Verify generated name, No., tenure, record status and audit fields are outside registration but remain available in relevant records/reports.

**Expected Result:** Current labels/field order persist. Primary Email alone identifies login; Secondary/Corporate Email do not become login addresses. Mobile is text; each supplied email must be one valid email. HMO Provider uses configured choices; HMO Details is text without a provider allowlist, subject to ordinary sanitization/length limits. Blank Primary Email saves an employee-only record.

**Data Integrity Check:** No landline_no or duplicate account; optional values persist without changing unrelated fields.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.
**Notes / Evidence:** ____________________
**Variant / tester / execution date / defect reference:** ____________________



### EMP-15 — Successful edit versus new-registration reset

**Test ID:** EMP-15
**Module and Feature:** Employees — Successful edit versus new-registration reset
**Priority:** High
**Test Type:** Regression
**Required Role:** HR and ADMIN
**Execution Scope:** QA only
**Preconditions:** Disposable QA editing record, unused new-registration identities and invalid-save control.

**Test Steps:**

1. Edit one field, preview and save an existing employee; observe the destination.
2. Reopen the same employee from Employee Master List and compare saved fields/account state.
3. Register a new employee successfully; check personal fields, reviewer searches, passwords and second reviewer reset to blank/defaults.
4. Enter a second new employee without leaving the screen and save once.
5. Trigger a separate validation/server failure; check values remain for correction.

**Expected Result:** Edit success closes preview and returns to master list. New-registration success clears the form and saved record ID, restoring enabled preview/defaults. The next registration creates another identity. Failed saves do not clear values or navigate away.

**Data Integrity Check:** Edits retain record_id; new entries do not overwrite the previous employee or leak previous passwords/reviewers.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.
**Notes / Evidence:** ____________________
**Variant / tester / execution date / defect reference:** ____________________


## IMP cases

### IMP-01 — Template, mapping and preview

**Test ID:** IMP-01  
**Module and Feature:** Import — Template, mapping and preview  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** HR or ADMIN  
**Execution Scope:** QA only
**Preconditions:** Synthetic CSV/XLSX with three valid rows and one deliberate invalid row.

**Test Steps:**

1. On QA, download the current template and select a synthetic CSV/XLSX. Distinguish File column (uploaded header) from Import into (current destination).
2. Check Primary Email, Secondary Email and HMO Provider/HMO Details mappings; skip an optional column and Validate.
3. Skip optional Employee Number and verify validation can continue; skip required First Name separately.
4. Review original spreadsheet row errors and generated-field destinations without importing.

**Expected Result:** Template and destination choices use current master-list labels. Generated No./Name/Age/Tenure/audit fields cannot be written from the import. First worksheet only. Employee Number mapping is optional; skipping First Name or another required mapping blocks validation. Preview saves no employees.

**Data Integrity Check:** Employee count and counter are unchanged by preview.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### IMP-02 — Commit valid rows and preserve accounts

**Test ID:** IMP-02  
**Module and Feature:** Import — Commit valid rows and preserve accounts  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Validated mixed file and a previously approved account to compare.

**Test Steps:**

1. Select Import and cancel once.
2. Confirm Import on the second attempt.
3. Compare imported count, profiles and ADMIN Account Requests; log in to the pre-existing account.

**Expected Result:** Only valid new rows import; errors remain reviewable; imports create no routine account requests and do not overwrite existing credentials/roles.

**Data Integrity Check:** One new employee per committed valid row; imported metadata and bulk CREATE audit; invalid rows absent.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### IMP-03 — Duplicate and blank identities

**Test ID:** IMP-03  
**Module and Feature:** Import — Duplicate and blank identities  
**Priority:** Critical  
**Test Type:** Negative  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** QA file with duplicate nonblank employee numbers, current/archived Primary Emails, two valid blank-number/blank-email rows and optional Secondary Emails.

**Test Steps:**

1. Validate the mixed file.
2. Commit valid rows.
3. Revalidate the same file.

**Expected Result:** Duplicate nonblank numbers and Primary Emails reject, including current/archived conflicts. Blank numbers and Primary Emails are allowed with separate generated identities; Secondary Email is contact data. Reimport rejects already claimed nonblank identities. Rows with both identifiers blank cannot be recognized as the same employee: another import may create duplicates. Reconcile before any retry; never reimport the real workbook as a test.

**Data Integrity Check:** No duplicate nonblank email or employee number; two valid blank-email employees may exist.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### IMP-04 — Cross-chunk uniqueness and partial commit

**Test ID:** IMP-04  
**Module and Feature:** Import — Cross-chunk uniqueness and partial commit  
**Priority:** Critical  
**Test Type:** Boundary  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Disposable 301+ row file; row 301 duplicates a valid row 1 email/number.

**Test Steps:**

1. Validate all rows and note preview counts.
2. Commit the file through the UI.
3. Compare final totals and the duplicated identity across the 300-row boundary.

**Expected Result:** Each committed chunk revalidates; later duplicate is rejected even if preview could not reserve it; valid earlier chunks remain committed.

**Data Integrity Check:** Exactly one owner per duplicate identity; partial success is accurately reported, never represented as atomic full-file rollback.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### IMP-05 — Dates, leading zeros and lookup case

**Test ID:** IMP-05  
**Module and Feature:** Import — Dates, leading zeros and lookup case  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** CSV and XLSX copies with text employee number 000123, leap dates, mixed-case allowed lookup values and unknown department.

**Test Steps:**

1. Map and validate both formats.
2. Import the valid records from only one copy.
3. Reopen employee number and employment/birthday dates.

**Expected Result:** Text leading zeros survive; valid dates and case-insensitive import lookup matches normalize correctly; unknown lookup/impossible dates fail. Numeric spreadsheet cells may already have lost zeros: record that limitation.

**Data Integrity Check:** No one-day date shift or unintended field mapping; errors identify original source rows.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### IMP-06 — Empty, corrupt and unmapped input

**Test ID:** IMP-06  
**Module and Feature:** Import — Empty, corrupt and unmapped input  
**Priority:** Medium  
**Test Type:** Negative  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Header-only, unreadable and missing-required-column test files.

**Test Steps:**

1. Choose header-only, corrupt and invalid QA files and attempt validation.
2. Skip required First Name mapping, confirm the error and restore it. Skip optional Employee Number separately.
3. Select a valid file and retry without committing prior invalid data.

**Expected Result:** Header-only/corrupt input and missing required mappings/values show actionable errors. Optional Employee Number mapping is allowed to remain skipped. No stale file is accidentally committed.

**Data Integrity Check:** No changes from invalid inputs; successful retry imports only the selected file.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### IMP-07 — Import reader dependency failure

**Test ID:** IMP-07  
**Module and Feature:** Import — Import reader dependency failure  
**Priority:** High  
**Test Type:** Negative  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Fresh browser profile; DevTools can block the SheetJS CDN request.

**Test Steps:**

1. Block the xlsx library URL and select a file.
2. Record error and enabled controls.
3. Unblock, reload, and repeat import preview.

**Expected Result:** Excel-reader failure is shown; page remains navigable; fresh reload recovers. Record that a rejected cached loader promise may require reload.

**Data Integrity Check:** Failed library load creates no import records.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### IMP-08 — Competing edit and import

**Test ID:** IMP-08  
**Module and Feature:** Import — Competing edit and import  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** Two HR accounts  
**Execution Scope:** QA only
**Preconditions:** Isolated database; two new records targeting the same unused email.

**Test Steps:**

1. In two browser profiles, submit one registration/edit and one import for the same email together.
2. Refresh both lists and inspect both responses.
3. Retry the losing operation with another unused email.

**Expected Result:** Participating writers serialize; only one record claims the email; losing request gives a collision/retry error and can recover.

**Data Integrity Check:** Read-only DB check confirms one normalized email owner and no partial account request.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________


### IMP-09 — Blank identifiers, hyphens and repeat-import reconciliation

**Test ID:** IMP-09
**Module and Feature:** Import — Blank identifiers, hyphens and repeat-import reconciliation
**Priority:** Critical
**Test Type:** Boundary
**Required Role:** HR and ADMIN
**Execution Scope:** QA only
**Preconditions:** QA workbook with blank identifiers, sole hyphens in optional fields, hyphenated names and required-field hyphens.

**Test Steps:**

1. Validate optional blanks/hyphens without Employee Number mapping.
2. Use a sole hyphen in required Company/First Name/Birthday and check rejection.
3. Import valid rows once; compare generated No./record IDs, leading-zero supplied numbers and retained internal hyphens.
4. Revalidate rows with both Employee Number and Primary Email blank; do not commit again.
5. Reconcile source rows and valid/imported counts before considering any partial-import retry.

**Expected Result:** A sole trimmed hyphen becomes empty on import. Optional blanks are accepted; required blanks reject. Hyphens inside normal names/numbers survive. Missing numbers remain blank; generated No./record ID identifies the employee. Blank-number/blank-email rows may validate again because repeat-import deduplication cannot identify them.

**Data Integrity Check:** Commit only the intended first import. Keep the source-to-generated-ID manifest in protected QA evidence; do not reimport the completed real workbook to test this.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.
**Notes / Evidence:** ____________________
**Variant / tester / execution date / defect reference:** ____________________


## ACC cases

### ACC-01 — Approve reviewer chain in order

**Test ID:** ACC-01  
**Module and Feature:** Accounts — Approve reviewer chain in order  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** ADMIN  
**Execution Scope:** QA only
**Preconditions:** HR-created QA requests: HEAD-B→active ADMIN-A; SUP-B→pending HEAD-B; STAFF-B→pending SUP-B. Do not create this pending chain as ADMIN, whose saves apply immediately.

**Test Steps:**

1. Open Manage Accounts → Account Requests.
2. Try STAFF-B approval first; then approve HEAD-B, SUP-B and STAFF-B in that order.
3. Sign in as each approved account.

**Expected Result:** Early approval fails until its reviewer is active; ordered approval succeeds; each account receives its requested role and reviewer.

**Data Integrity Check:** Requests disappear only on approval; user_roles has correct role/reviewer and ACCOUNT_APPROVED audits; no password appears in payloads.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ACC-02 — Reject and repeat decisions

**Test ID:** ACC-02  
**Module and Feature:** Accounts — Reject and repeat decisions  
**Priority:** High  
**Test Type:** Negative  
**Required Role:** ADMIN  
**Execution Scope:** QA only
**Preconditions:** Disposable pending request; employee already saved.

**Test Steps:**

1. Reject the request and cancel once, then confirm.
2. Try approving/rejecting its stale request in another open tab.
3. Check the employee and try the rejected login.

**Expected Result:** Cancellation does nothing; confirmed rejection removes only the pending request; stale action fails; login is denied.

**Data Integrity Check:** One ACCOUNT_REJECTED event; employee remains; no newly active account.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ACC-03 — Stage reviewer changes and save

**Test ID:** ACC-03  
**Module and Feature:** Accounts — Stage reviewer changes and save  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** ADMIN  
**Execution Scope:** QA only
**Preconditions:** STAFF-A→SUP-A and SUP-A→HEAD-A; alternate active reviewers.

**Test Steps:**

1. In Manage Accounts → Accounts, open STAFF/SUPERVISOR tabs and search/select primary and second reviewers without saving.
2. Leave/reopen or Refresh and confirm those unsaved choices were not persisted.
3. Select again, Save Changes and reopen; verify both reviewer identities and single-list role tabs.
4. In ADMINS, assign another active ADMIN and optional second ADMIN; save/reopen, then clear both. Repeat in QA registration/Edit.
5. Repeat for HR with another HR/ADMIN; verify its separate Head HR toggle and unchanged designated Head HR form routing.

**Expected Result:** Search selections stage changes locally; typing without selection clears the hidden selected identity. Save Changes persists both slots together. Selected fields show names without appended email; suggestions retain email for disambiguation, with email fallback when a name is unavailable. HR/ADMIN reporting assignments are optional. A distinct second reviewer requires a primary. HR reporting assignments do not replace designated Head HR form routing.

**Data Integrity Check:** Only saved assignments change; HEAD_ASSIGNED audit for each saved assignment.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ACC-04 — Reject invalid reviewer assignments

**Test ID:** ACC-04  
**Module and Feature:** Accounts — Reject invalid reviewer assignments  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** ADMIN; unauthorized HR for replay  
**Execution Scope:** QA only
**Preconditions:** Captured saveAccountChanges request and disposable synthetic accounts.

**Test Steps:**

1. Attempt blank, self, inactive, wrong-role and duplicate assignments in QA request edits.
2. Attempt the same save as HR.
3. Reload Manage Accounts.

**Expected Result:** STAFF/SUPERVISOR need an active eligible SUPERVISOR, HEAD or ADMIN primary; HEAD needs another active HEAD or ADMIN. HR may leave both blank or use other HR/ADMIN; ADMIN may leave both blank or use other ADMINs. Self/inactive/wrong-role, duplicate-slot and second-only assignments reject. Invalid batches roll back; HR cannot save Manage Accounts assignments or grant ADMIN.

**Data Integrity Check:** All assignments in a failed batch retain their previous values; no success audit committed.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ACC-05 — Head HR designation and transfer

**Test ID:** ACC-05  
**Module and Feature:** Accounts — Head HR designation and transfer  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** ADMIN and two HR accounts  
**Execution Scope:** QA only
**Preconditions:** HR-A is Head HR; pending HR-B form assigned to HR-A; owned HEAD-stage task exists.

**Test Steps:**

1. Switch Head HR to HR-B without saving and inspect controls.
2. Save and reopen account management.
3. Open pending forms as both HRs and inspect ADMIN task history.

**Expected Result:** Exactly one saved Head HR; other pending HR forms move to replacement; replacement’s own pending form goes to HR queue for another HR; prior owner loses processing rights.

**Data Integrity Check:** Same form/task identity and earned time; previous approval signatures/history retained; old HEAD owner released.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ACC-06 — Prevent orphaning Head HR forms

**Test ID:** ACC-06  
**Module and Feature:** Accounts — Prevent orphaning Head HR forms  
**Priority:** Critical  
**Test Type:** Negative  
**Required Role:** ADMIN  
**Execution Scope:** QA only
**Preconditions:** Pending HR form assigned to current Head HR.

**Test Steps:**

1. Attempt to clear Head HR without a replacement.
2. Attempt an inactive/non-HR replacement using a QA request edit.
3. Reopen accounts and the pending form.

**Expected Result:** Removal without eligible replacement is blocked while forms depend on it; invalid replacement rejected.

**Data Integrity Check:** Head HR flag, form route, task owner and audit remain unchanged after failed save.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ACC-07 — Department and Management assignments

**Test ID:** ACC-07  
**Module and Feature:** Incident configuration — Department and Management assignments  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** ADMIN  
**Execution Scope:** QA only
**Preconditions:** Linked active HEAD/ADMIN accounts; Sales and HR labels available.

**Test Steps:**

1. Open Manage Accounts → Accounts → Organization Settings → Incident Reviewers.
2. Choose one reviewer per ordinary department, up to two distinct ADMINs for Heads, and an active ADMIN Management Approver.
3. Save Changes, refresh and file a QA Sales report.
4. For HR/Human Resources choose the active linked designated Head HR; file an uninvolved QA report and complete its HEAD-stage action.
5. Check own-department Head HR filing against STAFF and reports against Head HR use the Heads ADMIN pool; compare a saved HR HEAD-stage assignment after a designation change.

**Expected Result:** Saved map reappears; new report routes by filer department; Heads slots allow only ADMIN; one reviewer may cover multiple departments. HR/Human Resources also offers the active, employee-linked designated Head HR. That account can be saved for HR, receives the assigned incident in Review before NTE issuance, and can perform the HEAD stage when uninvolved. Ordinary HR and Head HR assigned to unrelated departments are rejected. Reports involving Head HR or their own-department filing use the Heads queue, preserving involvement restrictions. Existing saved case assignments remain actionable after the designation changes.

**Data Integrity Check:** INCIDENT_WORKFLOW_CONFIG_UPDATED records counts and selected/cleared status, without policy or copied employee details.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ACC-08 — Invalid maps and dynamic departments

**Test ID:** ACC-08  
**Module and Feature:** Incident configuration — Invalid maps and dynamic departments
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** ADMIN  
**Execution Scope:** QA only
**Preconditions:** QA configuration payload, active department choices, nonarchived employees and a new department added through Organization Settings.

**Test Steps:**

1. Try duplicate reviewer/department pairs, two Sales reviewers, three Heads reviewers and a HEAD in a Heads slot.
2. Try inactive/unlinked reviewers, ordinary HR, Head HR for an unrelated department and a non-ADMIN manager.
3. Compare department choices with active lookups, nonarchived employee departments and saved mappings; verify IT/new QA department are present.
4. Save a valid map and reopen; attempt unauthorized HR save.

**Expected Result:** Invalid maps reject atomically. Departments are populated dynamically from active choices, nonarchived employees and saved mappings, plus Heads; IT/Finance/Operations are not intentionally hidden. A new department has no invented reviewer. Configure an eligible reviewer before filing. Unauthorized HR writes reject.

**Data Integrity Check:** Existing map and manager remain unchanged after failure; verify the intended departments and eligible reviewers were actually configured.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ACC-09 — Historical route versus new assignments

**Test ID:** ACC-09  
**Module and Feature:** Incident configuration — Historical route versus new assignments  
**Priority:** High  
**Test Type:** Integration  
**Required Role:** ADMIN then old/new assigned reviewer  
**Execution Scope:** QA only
**Preconditions:** Existing pending report and new filing prepared.

**Test Steps:**

1. Change its department reviewer and default Management approver, then save.
2. Open the existing report using old/new accounts.
3. File another report and send a later HR recommendation with an eligible manager selected.

**Expected Result:** Existing stored assigned_head_email is not silently rewritten; new filing uses current mapping; explicit manager selection applies when recommendation is sent.

**Data Integrity Check:** Historical documents/attribution unchanged; record any stranded old reviewer as an operational blocker.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ACC-10 — No invented management functions

**Test ID:** ACC-10  
**Module and Feature:** Accounts — No invented management functions  
**Priority:** Medium  
**Test Type:** Regression  
**Required Role:** ADMIN  
**Execution Scope:** QA only
**Preconditions:** Manage Accounts open.

**Test Steps:**

1. Inspect Accounts and Account Requests sections.
2. Create pending requests as HR. Check the Account Requests number and yellow indicator on collapsed Manage Accounts; open/close the group, approve/reject, and verify the count clears at zero and refreshes after returning to the browser tab.
3. Save account changes as HR and approve/reject as ADMIN; repeat an edit as ADMIN and verify it applies immediately without a second approval.
4. As ADMIN, select ADMIN during registration and when editing another employee; verify it takes effect immediately. As HR, verify ADMIN is unavailable for assignment and a direct request with role ADMIN fails with 403.
5. Change an assigned incident reviewer from HEAD to ADMIN and back without manually clearing Incident Reviewers. Verify eligible department assignments remain. Change an otherwise unblocked account to STAFF/SUPERVISOR/ordinary HR, or an ADMIN in Heads to HEAD, and verify only incompatible department assignments are cleared automatically.

**Expected Result:** Employee Edit loads interactive account controls. Changing Assigned Role retains both reviewer names and linked account IDs; compatible selections remain in the save payload, while incompatible selections stay visible and must be corrected before saving. A fresh registration still clears previous entries. HR role/reviewer/password changes require ADMIN approval; ADMIN saves apply immediately. Blank password retains the current password. Profile-only edits create no request. Incident Reviewers membership alone does not block role changes; compatible assignments remain and incompatible department assignments are cleared automatically. Unsafe role changes (last active ADMIN, designated Head HR, or unresolved reporting/pending-form/Management duties or incompatible open incident reviews) are blocked; no general disable/delete control is claimed.

**Data Integrity Check:** Rejected requests leave account access unchanged. Approved same-role edits preserve permissions and active status; role changes clear extra permissions. Automatic incident-assignment cleanup is audited and rolls back together with the role change on failure.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ACC-11 — Imported employee account provisioning

**Test ID:** ACC-11  
**Module and Feature:** Accounts — Imported employee account provisioning
**Priority:** High  
**Test Type:** Integration  
**Required Role:** HR/ADMIN requests; ADMIN approves
**Execution Scope:** QA only
**Preconditions:** Imported employee with no account; do not create a second employee.

**Test Steps:**

1. Open an imported profile in Edit and save a profile-only change; verify no account request is created.
2. Reopen Edit, provide a unique Primary Email, choose a role/reviewer where applicable, enter and confirm a valid password, and save.
3. When saved by HR, verify login is unavailable until ADMIN approves; when saved by ADMIN, verify immediate login and no pending request.

**Expected Result:** Imported employees can obtain access through Edit without duplicate registration. First access needs Primary Email, valid matching passwords and a primary reviewer for STAFF/SUPERVISOR/HEAD; HR/ADMIN reporting reviewers are optional. HR requests need ADMIN approval; ADMIN saves apply immediately. Blank password retains an existing password; profile-only edits create no request.

**Data Integrity Check:** Exactly one employee identity remains; the request and approval are audited. Failed account requests roll back the accompanying employee edit.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________


### ACC-12 — Organization choices and current incident settings

**Test ID:** ACC-12
**Module and Feature:** Accounts — Organization choices and current incident settings
**Priority:** High
**Test Type:** Integration
**Required Role:** ADMIN; HR negative replay
**Execution Scope:** QA only
**Preconditions:** Temporary QA company/location/department names; current allowed lists recorded.

**Test Steps:**

1. Open Manage Accounts → Accounts → Organization Settings. Add Company Name, Work Location and Department using their Add buttons.
2. Leave without Save Changes and reopen: the added choices should already be saved.
3. Open fresh registration/Edit and import validation; use the new values. Check Sales, None and correctly spelled Logistics department choices.
4. Return to Incident Reviewers; find the new department, select an eligible reviewer and Management Approver, Save Changes and reopen.
5. Try equivalent duplicate/whitespace/case values, blank/over-191-character input and unauthorized HR API writes.

**Expected Result:** Add saves choices immediately; Save Changes separately saves reviewer/Management assignments. New choices propagate to employee selectors/import validation, without duplicate equivalent options. Company casing remains configured. New department existence alone does not assign a reviewer; invalid/non-ADMIN writes reject.

**Data Integrity Check:** lookup_values and LOOKUP_ADDED audit match successful changes. Use QA-only names because no general delete-choice UI exists.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.
**Notes / Evidence:** ____________________
**Variant / tester / execution date / defect reference:** ____________________



### ACC-13 — Reviewer search, role eligibility and second head

**Test ID:** ACC-13
**Module and Feature:** Accounts — Reviewer search, role eligibility and second head
**Priority:** Critical
**Test Type:** Regression
**Required Role:** ADMIN; HR employee editor
**Execution Scope:** QA only
**Preconditions:** QA employees in every role, two eligible reviewers, inactive/self/wrong-role identities.

**Test Steps:**

1. In registration/Edit test STAFF/SUPERVISOR→SUPERVISOR/HEAD/ADMIN, HEAD→HEAD/ADMIN, HR→HR/ADMIN and ADMIN→ADMIN in primary/second searches.
2. Search name/email and select with keyboard/click; check emails in suggestions and names in selected fields. Clear/retype and change roles.
3. Repeat both slots in STAFF, SUPERVISOR, HEAD, HR and ADMINS tabs; Save Changes and reopen.
4. Try duplicate slots, second-only, self, inactive/wrong-role and unselected free text; verify server rejection of invalid identities.
5. As HR verify allowed account-card edits remain interactive, but forced ADMIN grant/change rejects.

**Expected Result:** Search display and hidden account identities remain synchronized. STAFF/SUPERVISOR/HEAD require primary; HR/ADMIN reviewers are optional. Second is optional, distinct and requires primary. Selected names omit appended emails, except fallback when no name exists. Only ADMIN grants ADMIN. HR reporting choices preserve designated Head HR form routing.

**Data Integrity Check:** Only valid selected identities save. Passwords stay out of previews/logs; failed combined updates roll back; repeated entry creates no duplicate search handlers.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.
**Notes / Evidence:** ____________________
**Variant / tester / execution date / defect reference:** ____________________


## SELF cases

### SELF-01 — Correct own profile and expansion

**Test ID:** SELF-01  
**Module and Feature:** Personal dashboard — Correct own profile and expansion  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** STAFF, SUPERVISOR and HEAD  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Two different linked employee identities with distinct synthetic contact/family details.

**Test Steps:**

1. Open Dashboard and compare summary, job fields and greeting with fixture.
2. Expand/collapse Full Profile twice.
3. Sign out, switch account and reopen.

**Expected Result:** Each role sees only its own details; missing values show a dash; full profile renders once per load without duplicate sections; prior-account data clears.

**Data Integrity Check:** Profile response excludes supporting-document field; no third-party employee data.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### SELF-02 — Own attendance controls

**Test ID:** SELF-02  
**Module and Feature:** Personal dashboard — Own attendance controls  
**Priority:** High  
**Test Type:** Integration  
**Required Role:** STAFF  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Configured provider with matching employee number and registered first/last name.

**Test Steps:**

1. Open Dashboard and compare today’s eight time fields to the authorized HR attendance row.
2. Change date with calendar and arrows, then Refresh.
3. Open Time Logs, click outside and press Escape.

**Expected Result:** Only own scans appear; dates/weekdays agree; chronological logs include device and serial; popover dismisses; returning to Dashboard starts today again.

**Data Integrity Check:** Attendance reads do not alter scanner, employee or form data.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### SELF-03 — Identity collision privacy

**Test ID:** SELF-03  
**Module and Feature:** Personal dashboard — Identity collision privacy  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** STAFF and HR/ADMIN
**Execution Scope:** QA only
**Preconditions:** Isolated provider fixtures with a unique first/last name and differing scanner/HRIS numbers; duplicate employee names; same-name scanner identities across accounts.

**Test Steps:**

1. Load own Daily Attendance for the unique name with a different scanner number. Verify its times and Time Logs.
2. Introduce duplicate employee names or same-name scanner identities. Refresh the personal dashboard.
3. As HR/Admin, open Attendance, choose **Link employee** under the scanner ID, search the employee, check No./employee number/department, and confirm.
4. Refresh each duplicate employee's personal dashboard; reopen the HR dialog and verify the saved link. Rename the scanner identity and verify confirmation is required again.
5. Replay with another employee selector, an unauthorized STAFF confirmer, and a stale prior employee ID.

**Expected Result:** Unique names load despite different numbers. Ambiguous identities are withheld until confirmed. Only the selected employee sees the confirmed scans; saved links survive reload. Changed scanner names need confirmation again. Unauthorized confirmations and stale saves are rejected, and caller selectors cannot change self-service identity.

**Data Integrity Check:** No unrelated scan payload; link and audit are committed together. Confirmed links preserve provider-account boundaries. Use isolated data for link mutations.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### SELF-04 — Independent profile and attendance failures

**Test ID:** SELF-04  
**Module and Feature:** Personal dashboard — Independent profile and attendance failures  
**Priority:** High  
**Test Type:** Negative  
**Required Role:** HEAD  
**Execution Scope:** QA only
**Preconditions:** Valid profile; provider deliberately unavailable in QA.

**Test Steps:**

1. Open Dashboard with provider unavailable.
2. Expand Full Profile and navigate to Forms.
3. Restore provider and select Refresh.

**Expected Result:** Attendance error does not replace employee data or block other modules; refresh recovers; times are not invented.

**Data Integrity Check:** No profile mutation; unavailable scans remain blank/error.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

## FORM cases

### FORM-01 — Catalog and common submission

**Test ID:** FORM-01  
**Module and Feature:** Forms — Catalog and common submission  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** STAFF, SUPERVISOR, HEAD and HR  
**Execution Scope:** QA only
**Preconditions:** Valid linked profile and reviewer chain; HR has Head HR.

**Test Steps:**

1. Open Forms → Fill Out and count the templates.
2. Open each template, verify locked identity fields, complete its fields and acknowledgment boxes, draw signature and submit once.
3. Open My Submissions.

**Expected Result:** Seven templates appear, including Company Property Accountability; each successful submission appears with its serial; submission does not open Print automatically; ADMIN has no personal submission page.

**Data Integrity Check:** One saved form per intentional submit with session-derived applicant details and PNG signature.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-02 — Authority To Deduct amounts

**Test ID:** FORM-02  
**Module and Feature:** Forms — Authority To Deduct amounts  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** STAFF  
**Execution Scope:** QA only
**Preconditions:** Valid reviewer; Authority To Deduct open.

**Test Steps:**

1. Try amount 0, 0.01, 10000000, 10000000.01 and 1.001 in separate attempts.
2. Try a reason shorter than ten non-whitespace characters and unticked deduction authorization.
3. Submit a valid 123.45 request and view it.

**Expected Result:** Amount accepts 0.01–10000000 in 0.01 increments; insufficient particulars/missing acknowledgment reject; valid form preserves exact amount and authorization.

**Data Integrity Check:** ATD serial and stored particulars/amount agree; approval records authorization only, no payroll deduction engine is established.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-03 — Time-In/Out Correction rows

**Test ID:** FORM-03  
**Module and Feature:** Forms — Time-In/Out Correction rows  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** STAFF  
**Execution Scope:** QA only
**Preconditions:** Correction form; session has assigned SUP-A.

**Test Steps:**

1. Add two daily rows with distinct dates and selected corrected times.
2. Remove one row, enter a sufficient reason and submit.
3. Open saved form and print preview.

**Expected Result:** Selected rows and times persist; Reports To comes from current assigned reviewer; invalid dates/times reject; no external scanner write-back occurs.

**Data Integrity Check:** Only a form is created; scanner attendance is unchanged; NIO serial and row count are correct.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-04 — Official Business / Travel schedule

**Test ID:** FORM-04  
**Module and Feature:** Forms — Official Business / Travel schedule  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** SUPERVISOR  
**Execution Scope:** QA only
**Preconditions:** Travel request and assigned HEAD-A.

**Test Steps:**

1. Enter return before departure and attempt submit.
2. Use equal departure/return, then a later valid return with destination and sufficient purpose.
3. Submit and reopen the final chosen valid request.

**Expected Result:** Earlier return rejects; equal times are permitted by current validation; valid schedule round-trips with correct AM/PM.

**Data Integrity Check:** TRV reference, destination and canonical datetime values persist; no travel-booking operation is assumed.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-05 — Overtime Request boundaries

**Test ID:** FORM-05  
**Module and Feature:** Forms — Overtime Request boundaries  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** STAFF  
**Execution Scope:** QA only
**Preconditions:** Overtime form open.

**Test Steps:**

1. Try hours 0, 0.25, 24, 24.25 and 0.3 with otherwise valid details.
2. Enter valid shift/date/from/to and sufficient reason.
3. Submit 1.25 hours and reopen.

**Expected Result:** Only 0.25–24 in quarter-hour increments succeeds; date and times use valid formats. Hours are entered manually: no automatic reconciliation to the schedule is claimed.

**Data Integrity Check:** OT serial and exact requested hours persist; no scanner or payroll overtime is generated.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-06 — Time In/Out Record row validation

**Test ID:** FORM-06  
**Module and Feature:** Forms — Time In/Out Record row validation  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** STAFF  
**Execution Scope:** QA only
**Preconditions:** Time In/Out Record open.

**Test Steps:**

1. Attempt an empty grid, then a dated row with every time blank.
2. Add a valid time to one row and a second dated row.
3. Remove a row and submit; attempt 101 rows through a captured QA request.

**Expected Result:** At least one populated row and at least one time across records required; nonblank rows need dates; maximum 100 rows.

**Data Integrity Check:** TIO form contains the intended rows only; invalid oversized submission adds no form.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-07 — Company Property Accountability exception

**Test ID:** FORM-07  
**Module and Feature:** Forms — Company Property Accountability exception  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** STAFF then HR  
**Execution Scope:** QA only
**Preconditions:** Property form; HR available to claim its review.

**Test Steps:**

1. Add property description, integer quantity, tag, issued/returned dates and remarks; tick property acknowledgment and sign.
2. Submit, then open review queue as SUP-A and HR.
3. HR takes task and approves.

**Expected Result:** NAC form goes directly to HR, bypassing assigned Supervisor/Head; HR approval requires no reviewer signature; employee signature/acknowledgment remain required.

**Data Integrity Check:** One property form, no separate inventory/asset custody engine assumed; final APPROVED state has no fabricated HEAD signature.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-08 — Property row boundaries

**Test ID:** FORM-08  
**Module and Feature:** Forms — Property row boundaries  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** STAFF  
**Execution Scope:** QA only
**Preconditions:** Property form open.

**Test Steps:**

1. Try missing description and quantity 0, 1, 1000000, 1000001 and 1.5.
2. Try invalid issued/returned date formats and more than 100 rows through a QA replay.
3. Correct and submit one row.

**Expected Result:** Description and quantity required; integer quantity 1–1000000; valid dates and row cap enforced. A return-before-issue date relationship is not validated by current service: record policy need separately.

**Data Integrity Check:** Rejected requests leave no NAC form; accepted quantity is exact.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-09 — Required explanations and signatures

**Test ID:** FORM-09  
**Module and Feature:** Forms — Required explanations and signatures  
**Priority:** High  
**Test Type:** Negative  
**Required Role:** STAFF  
**Execution Scope:** QA only
**Preconditions:** Any applicable form open; otherwise valid values.

**Test Steps:**

1. Try blank signature, nine non-whitespace explanation characters, then ten.
2. Clear/redraw signature and try 500 then 501 explanation characters.
3. Send a malformed/non-PNG signature through a QA replay.

**Expected Result:** Applicant signature and sufficient explanation required; 500 character explanation cap enforced; malformed/oversized signature rejected.

**Data Integrity Check:** No invalid form saved; valid signature is attached to the correct account and serial.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-10 — Reviewer routing by submitter

**Test ID:** FORM-10  
**Module and Feature:** Forms — Reviewer routing by submitter  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** STAFF, SUPERVISOR, HEAD, HR, designated Head HR and assigned/unassigned ADMIN
**Execution Scope:** QA only
**Preconditions:** Complete account chain; use an ordinary form rather than NAC.

**Test Steps:**

1. Submit ordinary QA forms for STAFF with SUPERVISOR/HEAD/ADMIN reviewer variants; repeat SUPERVISOR with those three and HEAD with HEAD/ADMIN.
2. Check assigned reviewers' queues and Inbox; sign/forward to HR and compare an unassigned account of the same role.
3. Submit ordinary HR and Head HR forms; verify HR Reports To/second-head choices do not replace designated Head HR routing.
4. Check previously submitted forms retain stored reviewer slots after account-assignment changes.

**Expected Result:** STAFF→assigned SUPERVISOR/HEAD/ADMIN→HR; SUPERVISOR→assigned SUPERVISOR/HEAD/ADMIN→HR; HEAD→another assigned HEAD/ADMIN→HR; ordinary HR→Head HR for final decision; Head HR’s own form→another HR. Previously submitted forms retain their stored reviewers.

**Data Integrity Check:** Saved reviewer/stage match each route; no self-review or additional invented approval stage.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-11 — Missing or invalid routing configuration

**Test ID:** FORM-11  
**Module and Feature:** Forms — Missing or invalid routing configuration  
**Priority:** Critical  
**Test Type:** Negative  
**Required Role:** STAFF, SUPERVISOR and HR  
**Execution Scope:** QA only
**Preconditions:** Isolated fixtures with missing/inactive/wrong-role assigned reviewers and no designated Head HR.

**Test Steps:**

1. Attempt an ordinary form submission from each exceptional account.
2. Capture validation message.
3. Restore authorized reviewer configuration and retry.

**Expected Result:** Submission fails with reviewer configuration guidance; no form bypasses required route. NAC is separately tested as its intentional direct-HR exception.

**Data Integrity Check:** Failed ordinary submission creates no pending form or serial assignment.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-12 — Edit while assigned review is pending

**Test ID:** FORM-12  
**Module and Feature:** Forms — Edit while assigned review is pending  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** STAFF or HR applicant  
**Execution Scope:** QA only
**Preconditions:** Own ordinary form PENDING at HEAD stage, assigned reviewer, no taken HR task.

**Test Steps:**

1. Open My Submissions → Edit.
2. Change reason/date and draw a fresh signature; save.
3. Reopen and compare serial and submitted history.

**Expected Result:** Allowed edit succeeds with fresh signature; form type and original serial remain; identity fields cannot be reassigned.

**Data Integrity Check:** Same form ID/control number; updated form payload and edit audit; no duplicate form.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-13 — Edit restrictions

**Test ID:** FORM-13  
**Module and Feature:** Forms — Edit restrictions  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Applicant plus unrelated STAFF  
**Execution Scope:** QA only
**Preconditions:** Own forms rejected, approved, forwarded to HR or taken by Head HR; another employee’s editable form.

**Test Steps:**

1. Check Edit availability for each state.
2. Replay updateMyForm against restricted/other-owner IDs and change template key.
3. Reopen the original records.

**Expected Result:** Only own eligible PENDING assigned HEAD-stage forms can change; claimed, forwarded, reviewed, wrong-template and other-owner edits reject server-side.

**Data Integrity Check:** All rejected edits preserve payload, signature, reviewer, status and serial.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-14 — Supervisor/Head sign and forward

**Test ID:** FORM-14  
**Module and Feature:** Forms — Supervisor/Head sign and forward  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** Assigned SUPERVISOR/HEAD/ADMIN, HR and applicant
**Execution Scope:** QA only
**Preconditions:** Pending assigned STAFF, SUPERVISOR, and HEAD ordinary forms; one older SUPERVISOR form with a stored HEAD reviewer.

**Test Steps:**

1. Open Review Requests → View form.
2. Try approval without signature, then draw it and Sign.
3. Reload applicant, assigned reviewer and HR queues.
4. Register/edit SUPERVISOR with another SUPERVISOR/HEAD/ADMIN and HEAD with another HEAD/ADMIN. Check Reports To stays editable; verify self-assignment and roles outside the allowed matrix reject. Test either reviewer slot, signing and rejection; confirm the stored older SUPERVISOR form still accepts its original HEAD reviewer. Check the assigned ADMIN combined queue and Inbox before and after forwarding.
5. Attempt the same actions as an unassigned ADMIN, on an HR-stage form, on an HR employee form, and after the other reviewer has already advanced the stage; verify denial and unchanged data.

**Expected Result:** Required signature enforced; approval forwards with status still PENDING and stage HR; signed-by/time retained; applicant can no longer edit.

**Data Integrity Check:** One signature/forward event; no leave deduction at intermediate stage.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-15 — HR claim, signatures and final approval

**Test ID:** FORM-15  
**Module and Feature:** Forms — HR claim, signatures and final approval  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Form at HR stage; an uninvolved eligible HR.

**Test Steps:**

1. Open Review Requests and try processing before Take Task.
2. Take Task; approve a leave/correction/overtime form with required signature.
3. Approve ATD/TRV/TIO/NAC examples using their signature-free HR action.

**Expected Result:** Processing requires ownership; signature required only for configured templates; final APPROVED displays reviewer/time; ADMIN remains view-only at the HR stage. Explicitly assigned ADMIN first-stage reviews are covered by FORM-14.

**Data Integrity Check:** FORM_REVIEWED and task completion commit with status; no fabricated signature for signature-free templates.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-16 — Rejection at both stages

**Test ID:** FORM-16  
**Module and Feature:** Forms — Rejection at both stages  
**Priority:** Critical  
**Test Type:** Negative  
**Required Role:** Assigned reviewer then HR  
**Execution Scope:** QA only
**Preconditions:** Two separate pending ordinary forms; HR owns its task.

**Test Steps:**

1. Select Reject without reason and try again with over 500 characters.
2. Enter a valid reason and reject one at assigned-reviewer stage and one at HR stage.
3. Open each applicant’s My Submissions.

**Expected Result:** Blank/overlong reasons reject; valid rejections show REJECTED and the correct reviewer/reason; rejected forms cannot be edited or reapproved.

**Data Integrity Check:** One final decision each; no paid leave deduction; audit and task completion where applicable.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-17 — Lists, filters and document printing

**Test ID:** FORM-17  
**Module and Feature:** Forms — Lists, filters and document printing  
**Priority:** Medium  
**Test Type:** Regression  
**Required Role:** Applicant, reviewer and ADMIN  
**Execution Scope:** QA only
**Preconditions:** Mixed form types, states and submission dates.

**Test Steps:**

1. In My Submissions, combine status/type/search and clear them.
2. In Review Requests, apply date range, clear dates, refresh and use View form.
3. Print one of each template to PDF; cancel print once.

**Expected Result:** Newest first; serial/details search and inclusive submission dates return intended rows; summary cards have documented queue scope; all seven layouts show full rows/signatures with no unrelated page content.

**Data Integrity Check:** Printing/cancelling creates no new form and changes no decision.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-18 — Unauthorized, self and duplicate review

**Test ID:** FORM-18  
**Module and Feature:** Forms — Unauthorized, self and duplicate review  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Unassigned reviewer, applicant, ADMIN and owning HR  
**Execution Scope:** QA only
**Preconditions:** Pending owned form; two browser tabs.

**Test Steps:**

1. Replay approval as applicant, unrelated reviewer and unassigned ADMIN. Separately confirm an assigned ADMIN can act only at the eligible HEAD stage.
2. Race two assigned slots on a pending ordinary form in separate profiles; repeat final HR approval from the legitimate owner's two tabs.
3. Retry approval/rejection from a stale view and reopen the form.

**Expected Result:** Unauthorized/self actions reject. An assigned ADMIN can review a non-HR applicant at HEAD stage; unassigned ADMIN, HR-employee routing bypasses and ADMIN HR-stage processing reject. Either eligible slot can complete the one HEAD stage; one transition wins, with no stale overwrite.

**Data Integrity Check:** One decision, one final audit/task completion and at most one leave deduction.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-19 — Serial sequence and uncertain retry

**Test ID:** FORM-19  
**Module and Feature:** Forms — Serial sequence and uncertain retry  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** Two applicants  
**Execution Scope:** QA only
**Preconditions:** Isolated QA environment; same template and two distinct submissions.

**Test Steps:**

1. Submit the same template concurrently from both accounts.
2. Compare serials with a different template’s serial.
3. Interrupt one submission response, inspect My Submissions, then decide whether retry is needed.

**Expected Result:** Unique PREFIX-ManilaYear-six-digit sequence per template/year; no collision. Plain repeated new submissions are not guaranteed idempotent: check list before retry and report unexpected duplicates.

**Data Integrity Check:** One serial per saved row; prior serials retained; sequence gaps alone are not data loss.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-20 — Profile changes preserve historical applicant

**Test ID:** FORM-20  
**Module and Feature:** Forms — Profile changes preserve historical applicant  
**Priority:** High  
**Test Type:** Integration  
**Required Role:** HR and applicant  
**Execution Scope:** QA only
**Preconditions:** Already signed historical form; applicant profile edited afterward.

**Test Steps:**

1. Save a new job/name change in employee profile.
2. Open/print the old form.
3. Submit a new form and compare both documents.

**Expected Result:** New submission uses current centralized identity; existing historical form retains saved applicant/signatures; editing cannot impersonate another employee.

**Data Integrity Check:** No rewrite of historical control number, signer email or approval attribution.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### FORM-21 — Manila year rollover and concurrent serials

**Test ID:** FORM-21  
**Module and Feature:** Forms — Manila year rollover and concurrent serials  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** Two applicants and QA operator  
**Execution Scope:** QA only
**Preconditions:** Disposable clock-controlled runtime around Manila Dec 31/Jan 1; no production clock changes.

**Test Steps:**

1. Submit one template immediately before and after Manila year change.
2. Submit a second template in the new year.
3. Open previously issued documents.

**Expected Result:** Each template starts new-year sequence at 000001, independent of other templates; prior-year references stay unchanged; serial year follows Manila date rather than UTC date.

**Data Integrity Check:** Unique template/year sequence rows; no duplicate control number under concurrent submission.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________


### FORM-22 — Either assigned reviewer can complete the first stage

**Test ID:** FORM-22
**Module and Feature:** Forms — Either assigned reviewer can complete the first stage
**Priority:** Critical
**Test Type:** Integration
**Required Role:** Applicant, both assigned reviewers including assigned ADMIN, and HR
**Execution Scope:** QA only
**Preconditions:** QA ordinary forms with two stored reviewers; HR/NAC control forms.

**Test Steps:**

1. Submit an ordinary STAFF/SUPERVISOR/HEAD form with two reviewers; inspect both queues/Inbox.
2. Have only the second reviewer sign/forward; check HR receives it without primary approval.
3. On another form let primary reject; attempt a later action as second.
4. Race both slots in separate profiles on a fresh pending form.
5. Repeat with assigned ADMIN; compare unassigned ADMIN and unchanged HR/NAC exception routes.

**Expected Result:** Either slot can forward or reject; both approvals are never required. First successful action completes the single HEAD stage; other slot becomes nonactionable. Assigned ADMIN only acts for an eligible non-HR ordinary form. Final HR ownership/signature rules are unchanged.

**Data Integrity Check:** Stored slots and actual signing actor retained; one stage change/audit/notification outcome, no duplicate leave deduction.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.
**Notes / Evidence:** ____________________
**Variant / tester / execution date / defect reference:** ____________________


## LEAVE cases

### LEAVE-01 — All implemented types and pay choices

**Test ID:** LEAVE-01  
**Module and Feature:** Leave — All implemented types and pay choices  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** Eligible STAFF  
**Execution Scope:** QA only
**Preconditions:** Regular employee above Rank and File; leave form open.

**Test Steps:**

1. Try each listed leave type, including Others.
2. For Others, omit then fill Other Leave Type; use 0.5 day within one date.
3. Submit a valid WITHOUT_PAY request and reopen.

**Expected Result:** Six implemented leave choices available; Others needs description; days accept half increments; pay choice persists. No new cancellation status or SIL ledger is assumed.

**Data Integrity Check:** WITHOUT_PAY approval creates no SL/VL deduction.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### LEAVE-02 — Days and calendar boundaries

**Test ID:** LEAVE-02  
**Module and Feature:** Leave — Days and calendar boundaries  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** STAFF  
**Execution Scope:** QA only
**Preconditions:** Leave form otherwise complete.

**Test Steps:**

1. Try reversed dates, 0, 0.25, 0.5, 365 and 365.5 days.
2. Try 2 days inside a one-day date span.
3. Submit one valid half-day request.

**Expected Result:** Dates ordered; days greater than 0, at most 365, half-day increments and within inclusive calendar span; no automatic working-day-only leave calculation is assumed.

**Data Integrity Check:** Invalid requests save no form; accepted dates/days are exact.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### LEAVE-03 — Eligibility uses rank and status

**Test ID:** LEAVE-03  
**Module and Feature:** Leave — Eligibility uses rank and status  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** STAFF accounts with different employee ranks  
**Execution Scope:** QA only
**Preconditions:** Regular Supervisor, Regular Rank and File, Probationary Supervisor, Contractual and blank-rank historical fixture.

**Test Steps:**

1. Open balances and attempt WITH_PAY SL/VL for each fixture.
2. Repeat a positive test using STAFF login role but Supervisor employee rank.
3. Inspect the selected default pay option.

**Expected Result:** Only nonarchived Regular employee with nonblank rank above Rank and File receives allowance; account login role does not determine eligibility; unavailable allowance defaults to Without Pay.

**Data Integrity Check:** Ineligible balances are zero; old ledger rows are preserved.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### LEAVE-04 — Annual allowance and deduction timing

**Test ID:** LEAVE-04  
**Module and Feature:** Leave — Annual allowance and deduction timing  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** Eligible applicant, assigned reviewer and HR  
**Execution Scope:** QA only
**Preconditions:** Fresh eligible annual SL=5 and VL=5; no historical deductions.

**Test Steps:**

1. Open balances twice and submit 1.5 paid VL days.
2. Forward at assigned stage and check balances.
3. HR takes task, approves and checks balances again.

**Expected Result:** Repeated reads grant once; submission/forward reserve or deduct nothing; final approval changes VL to 3.5 and keeps SL=5.

**Data Integrity Check:** One annual grant per type/year and one -1.5 deduction linked to form; approval/task/audit agree.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### LEAVE-05 — Overdraw and competing paid approvals

**Test ID:** LEAVE-05  
**Module and Feature:** Leave — Overdraw and competing paid approvals  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** Two HR reviewers  
**Execution Scope:** QA only
**Preconditions:** Same employee with one day VL left; two pending one-day requests claimed separately.

**Test Steps:**

1. Approve both requests concurrently in separate browser profiles.
2. Refresh applicant balances and both form queues.
3. Inspect ledger read-only with QA operator.

**Expected Result:** Only affordable approval succeeds; second gets insufficient balance; no negative spend beyond available allowance.

**Data Integrity Check:** One final deduction; losing form remains pending and its approval/audit/task changes roll back.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### LEAVE-06 — Eligibility changes before approval

**Test ID:** LEAVE-06  
**Module and Feature:** Leave — Eligibility changes before approval  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Paid pending form; applicant initially eligible.

**Test Steps:**

1. Change applicant to an ineligible employment status or Rank and File using employee editing.
2. Attempt final paid approval.
3. Inspect balances, historical ledger and pending form.

**Expected Result:** Final approval rechecks current eligibility and rejects; retained earlier ledger entries do not authorize new paid leave.

**Data Integrity Check:** No new deduction or completed task; prior approved history remains.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### LEAVE-07 — Cross-year half-day allocation

**Test ID:** LEAVE-07  
**Module and Feature:** Leave — Cross-year half-day allocation  
**Priority:** Critical  
**Test Type:** Boundary  
**Required Role:** Eligible applicant and HR  
**Execution Scope:** QA only
**Preconditions:** Employee eligible in both years; Dec 31–Jan 1 period; isolated data.

**Test Steps:**

1. Enter 1.5 days and allocate 0.5 to year one, 1 to year two.
2. Try sums not equal to total, quarter-day entries and more days than a year segment contains.
3. Approve the valid form.

**Expected Result:** Ambiguous cross-year totals require explicit matching half-day allocation; invalid splits reject; each year uses its own available allowance.

**Data Integrity Check:** Separate deductions match each year/type; no carryover between years.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### LEAVE-08 — Cross-year rollback and historical reads

**Test ID:** LEAVE-08  
**Module and Feature:** Leave — Cross-year rollback and historical reads  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** HR plus QA operator  
**Execution Scope:** QA only
**Preconditions:** Isolated second-year insufficient balance; historical approved same/cross-year form fixtures.

**Test Steps:**

1. Attempt a two-year approval whose later year has insufficient balance.
2. Read both yearly balances repeatedly.
3. Load a historical form with missing ambiguous year allocation.

**Expected Result:** Later-year failure rolls back first-year deduction; historical deductions synchronize once; unresolved ambiguous historic allocation gives an error requiring HR attention, not a guessed split.

**Data Integrity Check:** No duplicate grants/deductions or partially committed approval.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### LEAVE-09 — HR-use fields are restricted

**Test ID:** LEAVE-09  
**Module and Feature:** Leave — HR-use fields are restricted  
**Priority:** High  
**Test Type:** Security  
**Required Role:** Owning HR, applicant and assigned reviewer  
**Execution Scope:** QA only
**Preconditions:** Leave review dialog open at HR stage.

**Test Steps:**

1. Read calculated SL/VL and enter SIL balance in its HR-only control.
2. Attempt changing SL/VL or unrelated form fields through hrFields in a QA replay.
3. Try HR fields from applicant/assigned non-HR reviewer.

**Expected Result:** Only silBalance text is accepted through HR review fields at the proper stage; calculated SL/VL cannot be overwritten through that object.

**Data Integrity Check:** Applicant payload, calculated balances and identity remain intact; SIL text is not an automatic allowance ledger.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### LEAVE-10 — Six-month change and annual grants

**Test ID:** LEAVE-10  
**Module and Feature:** Regularization — Six-month change and annual grants  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** HR plus QA operator  
**Execution Scope:** QA only
**Preconditions:** Isolated clock-controlled fixture: probationary employee one day before six months, one exactly due; different ranks; archived control.

**Test Steps:**

1. Observe profiles before the scheduled job.
2. Allow the already-configured startup/hourly job to run in the disposable environment.
3. Reload profiles/balances and allow a second run.

**Expected Result:** Due nonarchived Probationary employee becomes Regular; not-yet-due/archived employee unchanged; only eligible rank gains five SL and five VL; rerun adds no second grant.

**Data Integrity Check:** EMPLOYEE_REGULARIZED once; regularized_on is six-month date; job transaction is consistent.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

## ATT cases

### ATT-01 — Daily list, filters and ordering

**Test ID:** ATT-01  
**Module and Feature:** Attendance — Daily list, filters and ordering  
**Priority:** High  
**Test Type:** Integration  
**Required Role:** HR and ADMIN  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Configured QA Hik-Connect source with known scans in two departments.

**Test Steps:**

1. Open Employees → Attendance and compare today/date/weekday.
2. Use previous/next day, employee, department and main-status filters.
3. Clear filters and Refresh.

**Expected Result:** Date changes load automatically; rows group by department, newest first within group; totals and retrieved time match response. UI returns all rows, with no pagination or sortable headers.

**Data Integrity Check:** Read-only provider access; no enrollment or attendance database writes.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ATT-02 — Main status cutoffs

**Test ID:** ATT-02  
**Module and Feature:** Attendance — Main status cutoffs  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** HR  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Provider test records around 08:11, 18:30 and 19:01 Manila time.

**Test Steps:**

1. View arrival 08:10 versus 08:11 with same departure.
2. Compare 18:29/18:30 and 19:00/19:01 departure.
3. Filter Overtime and inspect combined badges.

**Expected Result:** Late starts 08:11; early departure before 18:30; overtime at/after 19:01 with valid arrival; overtime supplements arrival status.

**Data Integrity Check:** HRIS rules override device status; raw provider events unchanged.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ATT-03 — Missing scans and absence limits

**Test ID:** ATT-03  
**Module and Feature:** Attendance — Missing scans and absence limits  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** HR  
**Execution Scope:** Live observation / QA variants
**Preconditions:** One-scan, daily-summary-only and no-provider-row employee fixtures.

**Test Steps:**

1. Open selected date and inspect each fixture.
2. Check Time Out and Work Hours for one-scan employee.
3. Compare absence with available daily summary/roster evidence.

**Expected Result:** One distinct scan does not invent departure/hours; summary-only records can show Absent; an employee absent from both scans and summary has no row and cannot be counted as proven absent.

**Data Integrity Check:** No fabricated leave or roster entries.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ATT-04 — Break and lunch boundaries

**Test ID:** ATT-04  
**Module and Feature:** Attendance — Break and lunch boundaries  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** HR  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Known scan sequences with seconds; see docs/Attendance.md.

**Test Steps:**

1. Compare AM 09:57–10:12 versus 09:57–10:15 and PM 15:03–15:18 versus 15:04–15:19.
2. Compare lunch 11:55–12:55 and 12:10–13:10 with starts/durations one second outside limits.
3. Hover break badge and inspect reason.

**Expected Result:** 15-minute breaks within AM 09:57–10:03/PM 14:57–15:03 are Normal; longer/outside starts Abnormal; lunch starts 11:55–12:10 and lasts at most 60 minutes, using seconds.

**Data Integrity Check:** Badges derive from original timestamps; missing pairs do not create abnormality.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ATT-05 — Rescans, short lunch and final departure

**Test ID:** ATT-05  
**Module and Feature:** Attendance — Rescans, short lunch and final departure  
**Priority:** High  
**Test Type:** Regression  
**Required Role:** HR  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Arrival rescans across devices; short midday lunch; latest scan is break return.

**Test Steps:**

1. Open logs and compare inferred fields for each sequence.
2. Include rescan within two minutes of cluster start and a later departure.
3. Refresh immediately after lunch return.

**Expected Result:** Rescans do not shift all later pairs; short recognized lunch appears immediately; break/lunch return is not Time Out; gross Work Hours uses final departure minus arrival including breaks.

**Data Integrity Check:** Original log sequence remains intact, including extra scans.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ATT-06 — Time Logs and wide table

**Test ID:** ATT-06  
**Module and Feature:** Attendance — Time Logs and wide table  
**Priority:** Medium  
**Test Type:** Functional  
**Required Role:** HR  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Employee with several device names/serials and long names.

**Test Steps:**

1. Open Time Logs, inspect chronological times including seconds, devices and serials.
2. Dismiss with outside click/Escape; open another employee’s logs.
3. Scroll the table at desktop and 375-pixel width.

**Expected Result:** Correct employee logs and accessible toggle state; no hidden stale popover; long device/name fields wrap and frozen columns remain aligned.

**Data Integrity Check:** Read-only; no cross-row mixing.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ATT-07 — Multiple scanner accounts

**Test ID:** ATT-07  
**Module and Feature:** Attendance — Multiple scanner accounts  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** HR and STAFF  
**Execution Scope:** QA only
**Preconditions:** Two preconfigured QA provider accounts with same numeric ID for distinct names.

**Test Steps:**

1. Load combined daily list and compare both accounts.
2. Check department options and device logs.
3. Open each corresponding employee’s personal dashboard.

**Expected Result:** Provider-account rows remain separate even when numbers coincide. Unique registered first/last names link to the correct dashboard despite different HRIS numbers. Same-name scanner identities across accounts need explicit HR links; no ID-only disclosure or cross-account inference in the HR list.

**Data Integrity Check:** Provider accounts stay distinct; no deduplication assumed across accounts.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ATT-08 — Provider failure and fallback

**Test ID:** ATT-08  
**Module and Feature:** Attendance — Provider failure and fallback  
**Priority:** High  
**Test Type:** Negative  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Operator-controlled provider stub; no live credential changes.

**Test Steps:**

1. Return transaction failure for account two.
2. Restore transactions but fail daily-summary retrieval.
3. Refresh and inspect error/data and retrieved time.

**Expected Result:** Transaction failure yields no successful partial combined list and identifies account number; daily-summary failure falls back to scans; secrets/tokens absent in messages.

**Data Integrity Check:** Failed combined load is not cached as success; provider unchanged.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ATT-09 — Cache and refresh

**Test ID:** ATT-09  
**Module and Feature:** Attendance — Cache and refresh  
**Priority:** Medium  
**Test Type:** Regression  
**Required Role:** HR and STAFF  
**Execution Scope:** QA only
**Preconditions:** Provider fixture can add a scan; clock and retrieval times visible.

**Test Steps:**

1. Load a day, add a QA scan, then load again within 60 seconds without Refresh.
2. Select Refresh.
3. Reopen after cache expiry and compare shared/self attendance.

**Expected Result:** Normal reads may use 60-second cache; Refresh requests new data; own and HR attendance follow shared calculation; no indefinite stale display.

**Data Integrity Check:** Scans remain provider-owned, not stored as attendance punch rows. Only explicit confirmation creates/updates attendance_employee_links with an audit; normal reads do not create confirmed links.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### ATT-10 — Unavailable config and API ranges

**Test ID:** ATT-10  
**Module and Feature:** Attendance — Unavailable config and API ranges  
**Priority:** High  
**Test Type:** Negative  
**Required Role:** HR; STAFF replay  
**Execution Scope:** QA only
**Preconditions:** Unconfigured/partial configuration fixture and captured listAttendance QA request.

**Test Steps:**

1. Open Attendance without complete provider settings.
2. Replay invalid dates, reversed dates and a 32-day range.
3. Replay listAttendance as STAFF and getMyDailyAttendance with another employee ID.

**Expected Result:** Configuration guidance/disabled loading shown; API accepts at most 31 days; invalid range and unauthorized full list rejected; own endpoint ignores employee selectors.

**Data Integrity Check:** No provider calls with invalid config/ranges or unrelated attendance payload.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________


### ATT-11 — Unique names fill the existing personal dashboard

**Test ID:** ATT-11
**Module and Feature:** Attendance — Unique names fill the existing personal dashboard
**Priority:** Critical
**Test Type:** Integration
**Required Role:** STAFF, SUPERVISOR, HEAD; HR observer
**Execution Scope:** Live observation / QA variants
**Preconditions:** QA scanner fixtures with unique names/different or blank HRIS number, accents/case/spacing, unmatched/partial-name controls; real records may be observed only.

**Test Steps:**

1. Open HR Attendance on a known date and compare the fixture's scanner times/logs.
2. Open that employee's existing personal dashboard and compare all eight fields and Time Logs; repeat with blank/different HRIS number.
3. Test case/accent/whitespace variants and partial/fuzzy controls that must not auto-match.
4. Change date, Refresh and switch accounts during a slow read.
5. Check no-provider-row dates show dashes and no unrelated employee's scans appear.

**Expected Result:** Unique normalized first/last names match without equal scanner/HRIS numbers. Existing inference/AM-PM formatting fills the unchanged card. No partial/fuzzy guesses. Scanner-name ambiguity is checked among returned identities for the selected day, not a full enrollment directory. No scans means blank times.

**Data Integrity Check:** Session determines self identity; caller selectors do not. Automatic reads create no confirmed mapping and never change punches; namespaces remain separate.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.
**Notes / Evidence:** ____________________
**Variant / tester / execution date / defect reference:** ____________________



### ATT-12 — HR confirms duplicate-name attendance links

**Test ID:** ATT-12
**Module and Feature:** Attendance — HR confirms duplicate-name attendance links
**Priority:** Critical
**Test Type:** Integration
**Required Role:** HR/ADMIN with employee-write permission; two same-name STAFF accounts
**Execution Scope:** QA only
**Preconditions:** QA duplicate employees and/or same-name scanner IDs across provider namespaces; no confirmed link.

**Test Steps:**

1. Check ambiguous personal attendance is withheld with HR-confirmation guidance.
2. In Employees → Attendance choose Link employee under the correct scanner ID.
3. Search/select the employee using No., employee number and department to distinguish duplicates; unselected text must not save.
4. Cancel final confirmation once, then Confirm link. Reopen the dialog and reload the page.
5. Refresh both personal dashboards; only the selected employee receives that scanner's logs. Confirm a second namespace separately where needed.

**Expected Result:** Final confirmation identifies scanner name/ID/provider and target employee. Cancel writes nothing; save closes dialog. Confirmed links persist and override auto matching. Unresolved identities remain withheld and another provider's same ID is not linked implicitly.

**Data Integrity Check:** One attendance_employee_links row per provider/scanner ID, correct target/confirmer/time and transactional ATTENDANCE_EMPLOYEE_LINK audit. No scanner punch edits or real-link mutation in this QA case.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.
**Notes / Evidence:** ____________________
**Variant / tester / execution date / defect reference:** ____________________



### ATT-13 — Corrected links, changed scanner names and historical scope

**Test ID:** ATT-13
**Module and Feature:** Attendance — Corrected links, changed scanner names and historical scope
**Priority:** Critical
**Test Type:** Regression
**Required Role:** HR/ADMIN and old/new linked employees
**Execution Scope:** QA only
**Preconditions:** QA confirmed link, two targets, old/new scanner-name dates and archived-target control.

**Test Steps:**

1. Reopen Link employee, verify Confirmed status and selected employee; correct to another QA target and refresh both dashboards.
2. Change scanner name in the provider fixture, refresh and verify the previous link is withheld.
3. Reconfirm after checking the target; archive the QA target and check no automatic reassignment.
4. Read an earlier date; compare name-fingerprint behavior and same ID in another namespace.
5. Restore QA fixtures; do not repurpose a live provider namespace.

**Expected Result:** Correction changes the current mapping and selected recipient. Renamed scanner or archived target needs confirmation. Links are not effective-dated: reassignment affects matching-name historical reads, while old-name history may need a new confirmation. Different namespaces never share links by ID alone.

**Data Integrity Check:** No employee/form/punch rewriting; current link/audit reflect the correction. Record historical-data consequences before any operational reassignment.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.
**Notes / Evidence:** ____________________
**Variant / tester / execution date / defect reference:** ____________________



### ATT-14 — Attendance-link permissions, stale saves and rollback

**Test ID:** ATT-14
**Module and Feature:** Attendance — Attendance-link permissions, stale saves and rollback
**Priority:** Critical
**Test Type:** Security
**Required Role:** HR/ADMIN, STAFF and read-only negative actors
**Execution Scope:** QA only
**Preconditions:** Two HR profiles, captured QA requests, controlled audit failure and saved/unsaved links.

**Test Steps:**

1. Replay HR link context/confirmation as STAFF/unrelated role and HR without employee-write permission; check read/write-specific denials.
2. Try unknown provider/scanner/date/employee, changed scanner name and malformed prior employee ID.
3. Open one link in two HR profiles, save different targets in turn, then try the older stale request.
4. Race first confirmation to different targets and inspect winner/audit.
5. Inject audit failure in QA; confirm rollback, restore dependency, reopen and retry.

**Expected Result:** Only HR/Admin reads context; confirmation also needs employee-write. Input must identify a real scanner row and nonarchived employee. Stale/changed identities reject; conflicting saves require reopening. Mapping and success audit commit or roll back together.

**Data Integrity Check:** No private candidate payload to STAFF, unauthorized/stale overwrite or partial mapping. Compare both target dashboards after accepted saves.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.
**Notes / Evidence:** ____________________
**Variant / tester / execution date / defect reference:** ____________________


## REPORT cases

### REPORT-01 — Workforce totals and filters

**Test ID:** REPORT-01  
**Module and Feature:** HR Dashboard — Workforce totals and filters  
**Priority:** High  
**Test Type:** Integration  
**Required Role:** HR  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Known fixture manifest with employment dates, active/inactive statuses and FTE values.

**Test Steps:**

1. Open Dashboard and compare all ten KPI cards to fixture totals.
2. Apply company/department/location/status/rank/function and reporting dates.
3. Select Reset and inspect all eleven charts.

**Expected Result:** Counts, active FTE, hires and tenure match selected population; chart totals reconcile; Reset restores defaults; invalid date ranges reject.

**Data Integrity Check:** Dashboard excludes archived rows; active means Regular/Probationary/Contractual, distinct from archive status.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### REPORT-02 — Completeness and small populations

**Test ID:** REPORT-02  
**Module and Feature:** HR Dashboard — Completeness and small populations  
**Priority:** Medium  
**Test Type:** Boundary  
**Required Role:** HR  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Empty/one/four/five employee populations available through filters; missing government/optional details.

**Test Steps:**

1. Filter to each population size.
2. Inspect observations and completeness/lowest-fields cards.
3. Compare Government Information Completeness and Data Quality reports.

**Expected Result:** Empty data renders no invalid percentages; fewer than five warns about insufficient data; government completeness uses all four identifiers; quality includes configured nonoptional fields, not only mandatory registration fields.

**Data Integrity Check:** No inferred missing-data repair or employee edits.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### REPORT-03 — Execute every implemented report

**Test ID:** REPORT-03  
**Module and Feature:** HR Reports — Execute every implemented report  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** HR and ADMIN  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Fixture manifest; expected report IDs listed in main plan.

**Test Steps:**

1. Open Reports → HR Reports and run each of the 14 report choices.
2. Apply a department/date/status selection and compare expected employees/groups.
3. Clear filters and rerun.

**Expected Result:** All 14 render correct titles/columns/rows; headcount groups include active/inactive/FTE/percent; HMO blank shows Not enrolled; directory/government/quality/tenure/demographics match source.

**Data Integrity Check:** Read-only; no payroll, scheduling or other unimplemented report inferred.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### REPORT-04 — Sorting, date population and employee reader

**Test ID:** REPORT-04  
**Module and Feature:** HR Reports — Sorting, date population and employee reader  
**Priority:** High  
**Test Type:** Regression  
**Required Role:** HR  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Master report with long/structured profile fields and varied employment dates.

**Test Steps:**

1. Set From/To and run Master; note these filter employment dates, not record-modified dates.
2. Click numeric/text/date report headers twice.
3. Open View employee and compare sectioned read-only data.

**Expected Result:** Correct inclusive employment-date population; the HR master report initially uses No. ascending (1, 2, 10); sorting changes direction; master reader preserves all returned profile fields except docs; UI loads all rows rather than paging. The employee list's separate account-status strip does not appear in HR reports.

**Data Integrity Check:** Sorting/reader do not alter saved records.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### REPORT-05 — Filtered CSV and spreadsheet safety

**Test ID:** REPORT-05  
**Module and Feature:** Exports and print — Filtered CSV and spreadsheet safety  
**Priority:** High  
**Test Type:** Security  
**Required Role:** HR or ADMIN  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Master/report filters; quotes, commas, Unicode and formula-like synthetic text.

**Test Steps:**

1. Export filtered master list and one grouped report.
2. Open CSV as data and compare all rows/headers with chosen filters.
3. Print HR report and employee profile to PDF, then cancel one print.

**Expected Result:** CSV filename/date and quoting correct; exported population follows report filters, not necessarily list-only search/sort; formula-like text neutralized; print excludes navigation and is legible. Account status remains a separate screen-only employee-list strip and never appears in CSV headers, CSV values, or printed tables.

**Data Integrity Check:** EXPORT audit records report/row/column counts; no extra employee mutation.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### REPORT-06 — ADMIN comparison and placeholders

**Test ID:** REPORT-06  
**Module and Feature:** Executive Summary — ADMIN comparison and placeholders  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** ADMIN then HR  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Two-year employment-date fixtures.

**Test Steps:**

1. Open Reports → Executive Summary as ADMIN and apply company/department/date filters.
2. Compare current/prior-year KPIs and print.
3. Attempt getExecutiveSummary as HR.

**Expected Result:** ADMIN sees comparison derived from employment dates; separation-date precision and movement/absence/manpower/disciplinary panels are placeholders, not completed analytics; HR API access denied.

**Data Integrity Check:** No fabricated separation history or hidden dataset in HR response.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### REPORT-07 — Filters, ordering and sensitive actions

**Test ID:** REPORT-07  
**Module and Feature:** Audit — Filters, ordering and sensitive actions  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** ADMIN  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Known synthetic create/update/archive/export/access-denied/configuration events.

**Test Steps:**

1. Open Audit Logs; filter exact user email and an inclusive start/end minute.
2. Clear filters and inspect newest-first results.
3. Try reversed/impossible date-time and malformed email through UI/API.

**Expected Result:** Expected events visible with actor/action/record/detail; exact user filter works; end minute includes seconds through :59; invalid filters reject; UI requests all matching rows.

**Data Integrity Check:** Configuration events contain counts rather than employee/policy copies; passwords, tokens and file bodies absent.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### REPORT-08 — Authorization, empty and large results

**Test ID:** REPORT-08  
**Module and Feature:** Reports — Authorization, empty and large results  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** STAFF/SUPERVISOR/HEAD; HR for load  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Captured report/export/audit requests; disposable 300+ employee dataset.

**Test Steps:**

1. Replay list/run/export/master/profile/audit requests as unprivileged roles.
2. As HR run no-match and large master reports, then scroll/export.
3. Compare total and rows.

**Expected Result:** Server denies unauthorized employee/report access; HR cannot read ADMIN audit; empty states correct; large all-row lists remain usable, with measured browser timings recorded.

**Data Integrity Check:** No unrelated sensitive payload on denial; counts/exports match and no data changes.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

## NOTIFY cases

### NOTIFY-01 — Publish and validation

**Test ID:** NOTIFY-01  
**Module and Feature:** Announcements — Publish and validation  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** HR or ADMIN  
**Execution Scope:** QA only
**Preconditions:** Synthetic title/message prepared.

**Test Steps:**

1. Open Create Announcement; try blank title/message, title 161 and message 5001 characters.
2. Publish a valid 160/5000-or-shorter announcement once.
3. Refresh management list and sign in as a recipient.

**Expected Result:** Boundary errors reject; valid announcement appears newest first with author/time; recipient receives it; HTML delimiters do not execute markup.

**Data Integrity Check:** One announcement and ANNOUNCEMENT_CREATED audit on successful path; no update/delete workflow assumed.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### NOTIFY-02 — Login modal acknowledgment

**Test ID:** NOTIFY-02  
**Module and Feature:** Announcements — Login modal acknowledgment  
**Priority:** High  
**Test Type:** Regression  
**Required Role:** STAFF, SUPERVISOR and HEAD  
**Execution Scope:** QA only
**Preconditions:** New unacknowledged announcement for each account.

**Test Steps:**

1. Sign in and inspect blurred modal.
2. Attempt outside click/Escape dismissal, then use acknowledgment.
3. Reload and compare a second account.

**Expected Result:** Required acknowledgment cannot be dismissed casually; acknowledgment persists only for signed-in recipient; same announcement does not reappear for that account and remains unseen for another.

**Data Integrity Check:** One announcement_views pair per account/announcement; message retained.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### NOTIFY-03 — Types, status filters and seen semantics

**Test ID:** NOTIFY-03  
**Module and Feature:** Inbox — Types, status filters and seen semantics  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** Every role  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Mixed announcements, assigned form and accessible incident notifications.

**Test Steps:**

1. Open Inbox and note badge before/after.
2. Apply each available Type/Status filter and Refresh.
3. Open a form item and an incident item.

**Expected Result:** Opening Inbox marks its items seen, including announcements; items remain in history; form opens review page and incident opens the selected Track case; filters/empty state work.

**Data Integrity Check:** Seen rows scoped to recipient; no form approval/case closure from reading.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### NOTIFY-04 — Authors, actors and ownership

**Test ID:** NOTIFY-04  
**Module and Feature:** Inbox — Authors, actors and ownership  
**Priority:** High  
**Test Type:** Security  
**Required Role:** HR-A, HR-B and ADMIN  
**Execution Scope:** QA only
**Preconditions:** One HR-authored announcement, owned form/incident and third-party events.

**Test Steps:**

1. Check author’s Inbox versus other recipients.
2. Let HR-A take a task and refresh HR-B’s Inbox/count.
3. Perform an incident action and compare actor/recipient notifications.

**Expected Result:** Own announcement excluded from author Inbox; HR task ownership suppresses other HR actionable unseen counts without deleting history; actor excluded from newly generated notifications.

**Data Integrity Check:** Notification recipients and viewed timestamps remain scoped; no confidential action text leaked to unrelated roles.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### NOTIFY-05 — Badges and collapsed group dots

**Test ID:** NOTIFY-05  
**Module and Feature:** Notifications — Badges and collapsed group dots  
**Priority:** Medium  
**Test Type:** Regression  
**Required Role:** ADMIN, HR, assigned reviewer and STAFF
**Execution Scope:** Live observation / QA variants
**Preconditions:** Pending review items and unresolved accessible incidents; 100+ items for cap fixture.

**Test Steps:**

1. Inspect Inbox/review/incident badges and collapsed dots. As ADMIN check Account Requests after HR creates a QA request.
2. Approve/reject and check the pending count clears at zero; return to the tab and allow the 60-second visible polling cycle.
3. Compare a directly ADMIN-created account: it is immediately usable and must not increase the pending count.
4. Open Inbox, refresh task/case state and complete one item; compare its badge cycle.

**Expected Result:** Numbers cap at 99+; collapsed groups show yellow dots only while relevant counts exist. Account Requests includes HR pending requests and excludes immediately applied ADMIN saves. Reading Inbox does not approve accounts/resolve incidents; completed items leave actionable badge scope.

**Data Integrity Check:** Badge reads change only applicable seen markers, not workflow status.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### NOTIFY-06 — Recipient-only incident popups

**Test ID:** NOTIFY-06  
**Module and Feature:** Notifications — Recipient-only incident popups  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Reported employee, requested recipient and unrelated STAFF  
**Execution Scope:** QA only
**Preconditions:** Issued final decision and a pending information request with unique synthetic confidential text.

**Test Steps:**

1. Log in to each account and inspect popup content.
2. Use popup link to open Track, then acknowledge.
3. Replay another recipient’s notification ID when marking seen.

**Expected Result:** Decision popup belongs to reported employee; request popup belongs to selected recipient; links open authorized case; cannot mark another recipient’s item or expose their request text.

**Data Integrity Check:** Only own notification viewed_at changes; internal HR details absent from unauthorized responses.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### NOTIFY-07 — Polling, stale actions and limits

**Test ID:** NOTIFY-07  
**Module and Feature:** Notifications — Polling, stale actions and limits  
**Priority:** Medium  
**Test Type:** Boundary  
**Required Role:** HR and STAFF  
**Execution Scope:** QA only
**Preconditions:** Visible tab; notifications arriving while open; 500+ synthetic history items if available.

**Test Steps:**

1. Create a new event in another profile and wait 60 seconds.
2. Hide/show tab and refresh Inbox.
3. Review behavior at the 500-item query cap.

**Expected Result:** Visible polling/visibility return updates badges; stale notifications reflect current actionability; history beyond implementation caps is documented rather than treated as missing database records.

**Data Integrity Check:** No duplicate notification per unique case/recipient/type; no assumption of email/SMS delivery.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

## INC cases

### INC-01 — File a valid report

**Test ID:** INC-01  
**Module and Feature:** Incident filing — File a valid report  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** SUPERVISOR  
**Execution Scope:** QA only
**Preconditions:** Sales reviewer configured; reported, concerned, involved and witness employees have active linked accounts.

**Test Steps:**

1. Open Incident Management → File.
2. Select reported employee and employee concerned from suggestions; enter What, date/time, Where, Why/rule/duty and How; select optional participants and attach a small QA file.
3. File Reports and confirm.

**Expected Result:** One report opens in Track with IR-year-five-digit number and shared case reference; identity autofill correct; no initial IR signatures required; appropriate involved/reviewer recipients notified.

**Data Integrity Check:** One group/report/workflow/subject plus intended participant/evidence/activity records commit together.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-02 — Role and search restrictions

**Test ID:** INC-02  
**Module and Feature:** Incident filing — Role and search restrictions  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** STAFF, ordinary HR, Head HR, assigned and unassigned ADMIN  
**Execution Scope:** QA only
**Preconditions:** Accounts with/without department reviewer assignments.

**Test Steps:**

1. Attempt File as each role and replay submitIncidentGroup when menu absent.
2. As eligible filer search one character, then at least two characters.
3. Try typed text without selecting reported/concerned suggestions.

**Expected Result:** STAFF and ordinary HR cannot file; only Head HR may file as HR; ADMIN needs department assignment; search/select requires valid active-account employees, not arbitrary typed names.

**Data Integrity Check:** Denied filing creates no group, serial or file.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-03 — Grouped reports and removal

**Test ID:** INC-03  
**Module and Feature:** Incident filing — Grouped reports and removal  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** SUPERVISOR  
**Execution Scope:** QA only
**Preconditions:** Two distinct reported employees; complete first report.

**Test Steps:**

1. Use File Another and inspect copied date/time/place/What/Why/How.
2. Select different identities/outcomes data and remove/re-add a report.
3. Submit both; switch Related Incident Reports in Track.

**Expected Result:** File Another creates a separate report card, with its own IR number/outcome under the filing group. Each card's concerned employee, reported employee, involved people and witnesses share that card's IR number; adding participants creates no extra report. Last card cannot be removed; only accessible sibling reports are listed. Confirmation is singular for one card and states the report count for multiple cards.

**Data Integrity Check:** Two reports, one group; intended employee identities and separate attachments preserved.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-04 — Input and group boundaries

**Test ID:** INC-04  
**Module and Feature:** Incident filing — Input and group boundaries  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** SUPERVISOR  
**Execution Scope:** QA only
**Preconditions:** Unsaved valid filing; QA request editor.

**Test Steps:**

1. Omit required concerned/reported selection, place/date/time or sufficient What/Why/How.
2. Try duplicate participants within a category, more than five involved/witnesses, self-report and eleven reports.
3. Correct and submit one report.

**Expected Result:** Required details, ten-non-whitespace explanation minimum, duplicate/category caps, no self-report and maximum ten reports enforced; zero-report request rejected.

**Data Integrity Check:** Invalid grouped request rolls back every report rather than leaving a partial group.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-05 — Conflict and unassigned department

**Test ID:** INC-05  
**Module and Feature:** Incident routing — Conflict and unassigned department  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** SUPERVISOR and ADMIN  
**Execution Scope:** QA only
**Preconditions:** QA department with no reviewer, then reviewer listed as filer/reported/concerned/witness.

**Test Steps:**

1. Attempt filing with missing department assignment.
2. Configure a conflicting reviewer in an isolated fixture and attempt filing.
3. Choose an uninvolved eligible reviewer and retry.

**Expected Result:** No silent fallback reviewer; conflicts block filing with guidance; corrected configuration routes successfully.

**Data Integrity Check:** Rejected filing leaves no orphan group/evidence; intended route persisted on successful report.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-06 — Heads shared review pool race

**Test ID:** INC-06  
**Module and Feature:** Incident routing — Heads shared review pool race  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** Two ADMINs assigned to Heads  
**Execution Scope:** QA only
**Preconditions:** Report against HEAD/ADMIN or HEAD’s own-department STAFF filing; both reviewers uninvolved.

**Test Steps:**

1. Confirm report appears for eligible Heads reviewers.
2. Select Take HEAD Review Task simultaneously in two profiles.
3. Open as winner, loser and an involved ADMIN witness.

**Expected Result:** Exactly one uninvolved Heads ADMIN claims review; other can view permitted case but cannot take; involved filer/reported/witness cannot claim.

**Data Integrity Check:** assigned_head_email written once; one successful claim activity; no initial HR ownership/time.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-07 — Head HR filing conflict exclusion

**Test ID:** INC-07  
**Module and Feature:** Incident routing — Head HR filing conflict exclusion  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** Head HR, HR-department ADMIN reviewer and HR-B  
**Execution Scope:** QA only
**Preconditions:** QA Head HR files against STAFF in HR; the ordinary HR department reviewer is that Head HR. Two uninvolved Heads-pool ADMINs and HR-B are available.

**Test Steps:**

1. Head HR files a report.
2. Assigned ADMIN reviews/issues NTE; employee submits signed explanation.
3. Compare Head HR and HR-B task eligibility.

**Expected Result:** Head HR own-department filing against STAFF uses the Heads ADMIN pool, preventing self-review; reports against designated Head HR use that pool too. Other uninvolved filings follow the appropriate department mapping. Involved Head HR cannot evaluate their own filing; uninvolved HR-B can take the later task.

**Data Integrity Check:** Reporter attribution preserved; no HR self-review ownership.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-08 — Request more evidence and wait

**Test ID:** INC-08  
**Module and Feature:** HEAD review — Request more evidence and wait  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** Assigned HEAD and filing SUPERVISOR  
**Execution Scope:** QA only
**Preconditions:** New HEAD-phase report.

**Test Steps:**

1. HEAD requests more evidence with sufficient written request.
2. Try another request, Issue NTE or Close For Documentation before response.
3. Filing Supervisor responds once with text and file; HEAD refreshes.

**Expected Result:** Request goes only to filer at this stage; pending response blocks further HEAD processing; one recipient response unlocks actions; no overwritten response.

**Data Integrity Check:** Request PENDING→RESPONDED once; response evidence tied to request; restricted text/file not exposed to other participants.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-09 — NTE draft and issuance validation

**Test ID:** INC-09  
**Module and Feature:** HEAD review — NTE draft and issuance validation  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** Assigned HEAD  
**Execution Scope:** QA only
**Preconditions:** HEAD-phase report with no pending information requests.

**Test Steps:**

1. Open Prepare Notice To Explain, complete Sections III/IV and save draft.
2. Reopen and inspect draft; select Other without Other Classification and try Issue.
3. Complete applicable policy/classification and issuer signature, then Issue NTE.

**Expected Result:** Draft survives reload; issuance requires policy/classification/Other description/signature; fixed five-calendar-day directive and issuer identity included; phase becomes EMPLOYEE and public status NTE ISSUED.

**Data Integrity Check:** Immutable issued document snapshot/version and issuer signature; response deadline is set immediately to the Manila issuance date plus five calendar days.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-10 — Draft evidence visibility

**Test ID:** INC-10  
**Module and Feature:** HEAD review — Draft evidence visibility  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Reported employee, witness, assigned HEAD and HR  
**Execution Scope:** QA only
**Preconditions:** Saved unissued NTE and Section IV draft evidence.

**Test Steps:**

1. Read case and attempt draft file URL as each account.
2. Issue NTE as assigned HEAD.
3. Repeat case/file reads and compare available sections.

**Expected Result:** Before issue only authorized assigned HEAD sees NTE draft/evidence; ordinary HR internal access starts after issuance; post-issue visibility follows section ceiling.

**Data Integrity Check:** No leaked unissued notice/file content in successful unauthorized response or print.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-11 — Close for documentation

**Test ID:** INC-11  
**Module and Feature:** HEAD review — Close for documentation  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** Assigned HEAD  
**Execution Scope:** QA only
**Preconditions:** HEAD-phase report with no pending request; sibling remains open.

**Test Steps:**

1. Try Close For Documentation with empty/short reason.
2. Enter sufficient reason, confirm closure.
3. Check Track, sibling and violation history.

**Expected Result:** Closure reason required; only selected report closes; no confirmed violation or final disciplinary decision invented; group remains open until all siblings close.

**Data Integrity Check:** Closure activity/reason retained; no disciplinary history row or HR task added.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-12 — Issuance starts deadline; immediate response

**Test ID:** INC-12  
**Module and Feature:** Employee response — Issuance starts deadline; immediate response
**Priority:** Critical  
**Test Type:** Boundary  
**Required Role:** Reported employee  
**Execution Scope:** QA only
**Preconditions:** Issued NTE; receipt not yet signed; weekend/year-boundary date fixture.

**Test Steps:**

1. Issue the NTE as assigned HEAD and note its Manila issuance date.
2. Before signing, open it as the reported employee; verify the explanation field, signature and countdown are already available.
3. Compare the deadline with issuance plus five calendar days; submit the signed explanation later and verify the deadline does not reset.

**Expected Result:** Only the reported employee can respond; issuance starts the five-calendar-day period including weekends/holidays. No preliminary receipt step is required. Signed submission records receipt against the issued version and submits the explanation atomically; receipt never resets the deadline.

**Data Integrity Check:** One receipt snapshot/timestamp and explanation snapshot; deadline remains based on issuance (or an approved extension); issuer signature unchanged.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-13 — Draft then immutable explanation

**Test ID:** INC-13  
**Module and Feature:** Employee response — Draft then immutable explanation  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** Reported employee  
**Execution Scope:** QA only
**Preconditions:** NTE issued; phase EMPLOYEE. Exercise both unsigned and previously acknowledged receipt variants.

**Test Steps:**

1. Save an explanation draft with an attachment; verify no employee hearing-request control is present.
2. Reload and submit a sufficient explanation using the existing acknowledgment; if none exists, sign the acknowledgment once. Verify no second signature is requested.
3. Try resubmitting/editing explanation through stale UI/API.

**Expected Result:** Draft restores for owner without prior receipt; submission reuses the acknowledgment signature or records the one missing acknowledgment in the same transaction; submitted explanation immutable; HR becomes eligible only after submission; pending extension resolves if explanation arrives first.

**Data Integrity Check:** Draft cleared; submitted statement/signature/version snapshot retained; evidence preserved without unintended duplicate uploads.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-14 — Wrong author and premature actions

**Test ID:** INC-14  
**Module and Feature:** Employee response — Wrong author and premature actions  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Unrelated STAFF and other involved employee  
**Execution Scope:** QA only
**Preconditions:** Issued NTE for STAFF-A; STAFF-B has own account.

**Test Steps:**

1. Replay ACKNOWLEDGE/SAVE_EXPLANATION/SUBMIT_EXPLANATION as STAFF-B.
2. As STAFF-A save a draft before receipt, then attempt signed submission with a missing/invalid signature; also replay a response before NTE issuance.
3. Replay explanation after case closed.

**Expected Result:** Wrong-author, pre-issuance, invalid-signature and closed-case mutations reject regardless of visible buttons. The reported employee may save a draft before receipt; denied submissions leave the draft intact.

**Data Integrity Check:** No receipt/deadline/explanation/task or success audit changes from denied actions.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-15 — Extension request bounds and duplicate

**Test ID:** INC-15  
**Module and Feature:** Employee response — Extension request bounds and duplicate  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** Reported employee  
**Execution Scope:** QA only
**Preconditions:** NTE issued; explanation outstanding, including an unsigned receipt variant.

**Test Steps:**

1. Request extension of 0, 1, 60 and 61 days using UI/QA replay.
2. Submit one valid request with sufficient reason.
3. Try another request while the first remains pending.

**Expected Result:** Integer 1–60 days accepted; one pending extension at a time; requests are available immediately after issuance, without prior receipt; before-issuance/after-explanation requests rejected; deadline unchanged until HR approval.

**Data Integrity Check:** One PENDING extension; original deadline preserved while awaiting review.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-16 — Approve, adjust or reject extension

**Test ID:** INC-16  
**Module and Feature:** Employee response — Approve, adjust or reject extension  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** Uninvolved HR  
**Execution Scope:** QA only
**Preconditions:** Three separate pending extension fixtures in EMPLOYEE phase.

**Test Steps:**

1. Approve requested days on first, different valid days on second and reject third.
2. Attempt duplicate review from stale tab.
3. Compare employee deadlines and notifications.

**Expected Result:** HR may process extension before HR task exists; approved days add to previous deadline; rejection retains it; repeated review fails; employee/assigned HEAD notified.

**Data Integrity Check:** Approved/rejected extension keeps old/new deadline, days, reviewer/time/reason; no HR task prematurely started.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-17 — Daily reminders and overdue processing

**Test ID:** INC-17  
**Module and Feature:** Employee response — Daily reminders and overdue processing  
**Priority:** High  
**Test Type:** Integration  
**Required Role:** Reported employee and HR  
**Execution Scope:** QA only
**Preconditions:** Outstanding NTE before receipt, due today and overdue date fixtures; QA operator controls dates.

**Test Steps:**

1. Sign in twice on same Manila day and inspect reminder modal.
2. Repeat after calendar date changes.
3. Let the 15-minute overdue job run for overdue fixture and inspect HR Inbox.

**Expected Result:** At most one reminder per case/employee/day; countdown runs from issuance even without a receipt and distinguishes remaining days, due and overdue; overdue notifies HR but does not auto-admit violation, advance phase or sanction.

**Data Integrity Check:** Unique reminder/date and deduplicated overdue notification; no decision or disciplinary entry.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-18 — Take evaluation task

**Test ID:** INC-18  
**Module and Feature:** HR incident review — Take evaluation task  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** Uninvolved HR-A and HR-B  
**Execution Scope:** QA only
**Preconditions:** QA incident available through HEAD review, NTE issuance, employee explanation draft and submission; HR-A/HR-B are not incident participants. No HR task owner.

**Test Steps:**

1. Before the explanation is submitted, verify IR filing, NTE drafting/issuance, acknowledgment and an explanation draft do not enable HR Take Task/evaluation or start HR time. Issued-NTE viewing and extension handling may be available.
2. Submit the employee explanation, then open Review → For Review as HR-A. Verify the tracker shows Under HR Review, the outside card offers Take Task, and View opens the full permitted NTE and submitted explanation.
3. Try evaluation before Take Task, then take the task from the outside card as HR-A.
4. Refresh the list and open the same case as HR-B; the claimed card no longer offers Take Task.
5. As owner HR-A, review the whole NTE, employee explanation, IR and supporting records.

**Expected Result:** Formal HR evaluation starts only after explanation submission and requires HR task ownership. "Uninvolved" means the HR reviewer is not the filer, reported employee or another incident participant. HR-B can view authorized content but cannot process another owner’s task; HR time starts when taken, not at IR filing or NTE issuance.

**Data Integrity Check:** One task identity/owner; no HR time charged to HEAD/employee phase.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-19 — Information requests to multiple employees

**Test ID:** INC-19  
**Module and Feature:** HR incident review — Information requests to multiple employees  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** Owning HR and two involved recipients  
**Execution Scope:** QA only
**Preconditions:** HR-phase owned task, no pending requests.

**Test Steps:**

1. Send separate sufficient written requests to two involved employees.
2. Respond as first recipient and try evaluation/new requests.
3. Respond as second and refresh HR Track.

**Expected Result:** One request per selected recipient, maximum 25; cannot request self/outsider; all pending responses block processing; timer resumes only when all replied.

**Data Integrity Check:** Responses immutable and tied to distinct requests; request completion and task pause/resume consistent.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-20 — Hearing scheduling and completion

**Test ID:** INC-20  
**Module and Feature:** HR incident review — Hearing scheduling and completion  
**Priority:** High  
**Test Type:** Integration  
**Required Role:** Owning HR and HR-B  
**Execution Scope:** QA only
**Preconditions:** Owned HR-phase report; reported employee and HR-B accounts available.

**Test Steps:**

1. Schedule Hearing with details and inspect notifications/timer.
2. Attempt duplicate scheduling, processing and completion as HR-B, and replay HEARING and hearingRequested=true as the reported employee.
3. As owner enter completion remarks and mark completed.

**Expected Result:** Scheduled hearing pauses processing/time and notifies involved people; only owning HR schedules/completes; employee hearing requests and direct hearing mutations reject; required details/remarks enforced; resume follows completion and other outstanding waits.

**Data Integrity Check:** Hearing details, completion time/remarks and task history retained.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-21 — Assessment and corrective recommendation

**Test ID:** INC-21  
**Module and Feature:** HR incident review — Assessment and corrective recommendation  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** Owning HR  
**Execution Scope:** QA only
**Preconditions:** HR-phase ready task; configured matrix and known finalized same-severity history.

**Test Steps:**

1. Open Review NTE And Recommend Action.
2. Select violation established, findings, review indicators and severity; save draft.
3. Inspect occurrence and corrective action, then reopen draft.

**Expected Result:** Findings sufficient; allowed indicators retained; severity Light/Moderate/Grave/Intolerable; recommendation uses previous finalized same-severity offenses plus one and current matrix; draft persists.

**Data Integrity Check:** No disciplinary entry before issuance; recommendation captures matrix, counts and reviewer.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-22 — No-violation outcome

**Test ID:** INC-22  
**Module and Feature:** HR incident review — No-violation outcome  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** Owning HR  
**Execution Scope:** QA only
**Preconditions:** Separate HR-phase report ready for assessment.

**Test Steps:**

1. Choose No Violation Established, enter findings and save.
2. Send for Management approval; obtain approval and issue final decision.
3. Inspect employee violation history.

**Expected Result:** No severity/action sanction required; corrective action No Further Action; final outcome NO_VIOLATION; no confirmed-violation history entry.

**Data Integrity Check:** Evaluation and decision retained without disciplinary row.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-23 — Submit to uninvolved active ADMIN

**Test ID:** INC-23  
**Module and Feature:** Management approval — Submit to uninvolved active ADMIN  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Owning HR  
**Execution Scope:** QA only
**Preconditions:** Valid assessment; eligible manager and involved/inactive alternatives.

**Test Steps:**

1. Try sending with no available eligible approver, an involved ADMIN or inactive/non-ADMIN via QA replay.
2. Select an eligible Management approver and send.
3. Inspect manager Inbox and HR timer.

**Expected Result:** Only active linked uninvolved ADMIN accepted; default can be overridden with an eligible choice; phase MANAGEMENT; HR processing pauses; recommendation version/snapshot preserved.

**Data Integrity Check:** Invalid attempt leaves assessment phase/approval unchanged; valid send creates one approved-version candidate, not final decision.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-24 — Return recommendation with remarks

**Test ID:** INC-24  
**Module and Feature:** Management approval — Return recommendation with remarks  
**Priority:** High  
**Test Type:** Negative  
**Required Role:** Designated ADMIN and another ADMIN  
**Execution Scope:** QA only
**Preconditions:** Recommendation awaiting Management.

**Test Steps:**

1. Try action as unrelated ADMIN and return without remarks.
2. As designated ADMIN enter remarks and return.
3. HR revises and resends.

**Expected Result:** Wrong manager denied; return requires remarks; returns to HR and resumes eligible processing; resubmission requires a new version/approval.

**Data Integrity Check:** Earlier management review snapshot remains; no approval timestamp or final decision from returned review.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-25 — Approve and prevent premature issuance

**Test ID:** INC-25  
**Module and Feature:** Management approval — Approve and prevent premature issuance  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** Designated ADMIN and owning HR  
**Execution Scope:** QA only
**Preconditions:** MANAGEMENT-phase recommendation.

**Test Steps:**

1. Try Issue Approved Final Decision as HR before Management approves.
2. Designated manager approves.
3. As owner issue once, then replay from stale tab.

**Expected Result:** Premature issuance blocked; manager approval enables FINAL_ACTION; one issuance reaches FINALIZED; duplicate issuance rejected.

**Data Integrity Check:** Matching approval/review version; one evaluation/decision and at most one disciplinary row; signature-free Management record names approver/time.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-26 — Revise approved unissued recommendation

**Test ID:** INC-26  
**Module and Feature:** Management approval — Revise approved unissued recommendation  
**Priority:** Critical  
**Test Type:** Regression  
**Required Role:** Owning HR  
**Execution Scope:** QA only
**Preconditions:** Approved FINAL_ACTION recommendation, not yet issued.

**Test Steps:**

1. Select Revise Evaluation.
2. Attempt final issuance using old approval.
3. Edit findings/severity, resend and obtain new Management approval.

**Expected Result:** Revisions return to HR and invalidate current approval; old approval cannot authorize changed recommendation; new approval required.

**Data Integrity Check:** Old snapshots retained; latest approval version matches latest assessment.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-27 — Concurrent change to prior-offense count

**Test ID:** INC-27  
**Module and Feature:** Final action — Concurrent change to prior-offense count  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** Two HR owners and eligible manager  
**Execution Scope:** QA only
**Preconditions:** Two substantiated same-employee/same-severity cases approved against same previous count.

**Test Steps:**

1. Issue first case’s final decision.
2. Try issuing the second without reevaluation.
3. Revise second, recompute occurrence, obtain new approval and issue.

**Expected Result:** Second stale count is rejected; new occurrence/recommendation and Management approval required; no silent higher penalty under old approval.

**Data Integrity Check:** No second stale disciplinary row; approved snapshots remain historically unchanged.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-28 — Issue, notify and close

**Test ID:** INC-28  
**Module and Feature:** Final action — Issue, notify and close  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** Owning HR and reported employee  
**Execution Scope:** QA only
**Preconditions:** Issued final decision with phase FINALIZED.

**Test Steps:**

1. Reported employee opens final-decision popup/document.
2. HR tries Close Case with insufficient then sufficient reason and confirms.
3. Refresh Review/Track/History and ADMIN performance.

**Expected Result:** Decision readable only within case permissions; closure needs reason; report CLOSED; group closes only after all reports; active badges drop and HR task completes.

**Data Integrity Check:** Closure time/reason, decision, disciplinary history and task earnings preserved; no duplicate closure.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-29 — Selector, search and role Review filters

**Test ID:** INC-29  
**Module and Feature:** Incident readers — Selector, search and role Review filters  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** All roles; Review only HEAD/HR/ADMIN  
**Execution Scope:** QA only
**Preconditions:** Several open/closed/legacy cases; inaccessible control case.

**Test Steps:**

1. Search Track by reference/subject/person and choose using arrows/Enter; close options with Escape.
2. Open Review and test every role-specific category and search.
3. Use View to navigate to selected Track case.

**Expected Result:** Only authorized choices; maximum first 50 search matches offered; role categories/counters match main plan; selected case and progress correct; no nonexistent Review page for STAFF/SUPERVISOR.

**Data Integrity Check:** No mutation or unrelated case payload.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-30 — History and legacy archives

**Test ID:** INC-30  
**Module and Feature:** Incident readers — History and legacy archives  
**Priority:** High  
**Test Type:** Regression  
**Required Role:** STAFF/SUPERVISOR; HEAD via Review Closed  
**Execution Scope:** QA only
**Preconditions:** Closed current report plus approved legacy version-1 fixtures and attachments.

**Test Steps:**

1. Open History, combine search/reference/closure-date/outcome filters and Clear.
2. View Details and print; HEAD uses Review → Closed.
3. Attempt retired legacy mutation endpoint with captured fixture ID.

**Expected Result:** Historical documents/signatures/statuses retained; legacy labeled Read-Only Legacy Record even if old state was unfinished; retired writes reject 409; no current backlog for legacy work.

**Data Integrity Check:** Legacy rows/snapshots unchanged; ARCHIVED task earnings retained where present.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-31 — Section and request confidentiality matrix

**Test ID:** INC-31  
**Module and Feature:** Incident readers — Section and request confidentiality matrix  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Reported, filer, witness, HEAD, HR, assigned ADMIN and manager  
**Execution Scope:** QA only
**Preconditions:** Same case with NTE, explanation, internal assessment, decision and two private requests.

**Test Steps:**

1. Open case/document and inspect network payload under each role.
2. Compare with section-access table in main plan.
3. Attempt other-recipient request attachment and draft explanation as another participant.

**Expected Result:** Reported gets I–VII plus issued decision; filer/witness I–IV; HEAD I–VII plus allowed decision; uninvolved HR/assigned ADMIN/manager authorized internal sections; only recipient/reviewers see private request content.

**Data Integrity Check:** Neither JSON, printable document, filename nor file body leaks forbidden sections; record metadata leaks separately.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-32 — Attachments and actual file limits

**Test ID:** INC-32  
**Module and Feature:** Incident readers — Attachments and actual file limits  
**Priority:** Critical  
**Test Type:** Boundary  
**Required Role:** Eligible filer/HEAD/employee  
**Execution Scope:** QA only
**Preconditions:** Safe files: each allowed MIME family; 8 MB/8 MB+1, combined near 18 MB, 10/11 files.

**Test Steps:**

1. Attach valid small PDF/image/text/Office/audio/video samples and download them.
2. Attempt unsupported HTML/executable, malformed data and limit violations using QA replay where picker blocks.
3. Try 18 MB decoded files across a group and inspect response-size behavior.

**Expected Result:** Supported files download intact; max ten files per action, 8 MiB each, 18 MiB combined/group; unsupported types/oversize reject. JSON’s 25 MB encoded-body limit may reject near-18 MiB uploads; record actual boundary.

**Data Integrity Check:** Invalid operation rolls back; successful evidence uses safe attachment names, nosniff and private no-store headers.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-33 — Dirty drafts, polling and account switch

**Test ID:** INC-33  
**Module and Feature:** Incident readers — Dirty drafts, polling and account switch  
**Priority:** High  
**Test Type:** Regression  
**Required Role:** Two authorized accounts  
**Execution Scope:** QA only
**Preconditions:** Track open with editable draft and another actor changing case.

**Test Steps:**

1. Type unsaved draft text, wait at least 45 seconds while another actor updates case.
2. Reopen editor and inspect update-available feedback.
3. Save/reload deliberately; log out and change account during a slow read.

**Expected Result:** Background refresh does not silently overwrite dirty draft; explicit save/reload uses current state; old-account responses cannot replace new account’s case; no duplicate action controls.

**Data Integrity Check:** Unsaved browser-only draft is not promised across full reload; saved drafts persist with correct author.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-34 — Documents and multi-report progress

**Test ID:** INC-34  
**Module and Feature:** Incident readers — Documents and multi-report progress  
**Priority:** High  
**Test Type:** Regression  
**Required Role:** Reported employee and assigned reviewer  
**Execution Scope:** QA only
**Preconditions:** Group with one closed and one NTE-stage report; issued signatures and evidence.

**Test Steps:**

1. Open View Document and Print/Save As PDF for each accessible sibling.
2. Inspect sections, headings, long narrative/signatures and dates.
3. Close remaining sibling and reload shared circles.

**Expected Result:** Documents match authorized saved content; initial IR/NTE sections appropriate; the header uses the actual selected IR/NTE number, related-report buttons omit status and use spaced action rows, and shared five-stage IR Filed/Under HEAD Review/NTE Issued/Under HR Review/Closed progress waits for every report to close; one closure does not imply all outcomes match.

**Data Integrity Check:** Printing changes no snapshots; siblings retain separate notices/decisions.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### INC-35 — Unauthorized IDs and all mutation guards

**Test ID:** INC-35  
**Module and Feature:** Incident readers — Unauthorized IDs and all mutation guards  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Unrelated STAFF, involved HR and stale owner  
**Execution Scope:** QA only
**Preconditions:** Captured current case/read/version/action/evidence requests and closed/legacy IDs.

**Test Steps:**

1. Replay getIncidentCase/getIncidentTrackingVersion and evidence IDs as unrelated account.
2. Replay incidentWorkflowAction with unauthorized actor, invalid action, closed/legacy record and stale ownership.
3. Inspect response payload and original case.

**Expected Result:** Every protected read/action rejects wrong scope/stage/owner; known numeric IDs grant no access; no legacy write bypass via current facade.

**Data Integrity Check:** No report, task, audit-success, evidence or notification change from denied mutation.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

## COC cases

### COC-01 — Matrix and self violation history

**Test ID:** COC-01  
**Module and Feature:** Code of Conduct — Matrix and self violation history  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** Every role  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Finalized substantiated, pending, unsubstantiated and documentation-only cases for one employee.

**Test Steps:**

1. Open Code of Conduct and compare matrix to saved configuration.
2. Inspect own violation table.
3. Compare pending/no-violation/documentation-only cases.

**Expected Result:** Only issued substantiated non-NO_VIOLATION outcomes count as finalized violations; matrix readable by all roles; violation date/reference/severity/occurrence/action/decision date accurate.

**Data Integrity Check:** No pending allegation converted into disciplinary history by reading.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### COC-02 — Employee search privacy

**Test ID:** COC-02  
**Module and Feature:** Code of Conduct — Employee search privacy  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** HR/ADMIN and STAFF/SUPERVISOR/HEAD  
**Execution Scope:** QA only
**Preconditions:** Another employee with finalized history and an active account.

**Test Steps:**

1. As HR/ADMIN select employee suggestion and View Records, then View My Records.
2. Try typed text without selection.
3. Replay listIncidentViolations for another email as each non-HR/ADMIN role.

**Expected Result:** HR/ADMIN may search/read others; nonselected text rejected; other roles limited to self server-side; matrix management not granted to ADMIN.

**Data Integrity Check:** No unrelated employee violation payload in denied responses.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### COC-03 — Edit, remove and save matrix

**Test ID:** COC-03  
**Module and Feature:** Code of Conduct — Edit, remove and save matrix  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** Original matrix captured; isolated test environment.

**Test Steps:**

1. Edit one action, Add Matrix Row, remove a disposable row and Save Changes.
2. Reload guide and create a new same-severity recommendation.
3. Try saving as ADMIN.

**Expected Result:** Only HR can save; new recommendation uses new matrix; ADMIN mutation denied even if control forced visible.

**Data Integrity Check:** One INCIDENT_MATRIX_UPDATED event with row count; saved matrix matches displayed rows.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### COC-04 — Matrix bounds and fallback

**Test ID:** COC-04  
**Module and Feature:** Code of Conduct — Matrix bounds and fallback  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** HR  
**Execution Scope:** QA only
**Preconditions:** QA matrix with occurrence 1 and 3 for one severity.

**Test Steps:**

1. Try empty matrix, duplicate severity/occurrence, invalid severity, occurrence 0/1002, blank/192-character action and 101 rows.
2. Save valid rows and request recommendations for occurrence 2 and 4.
3. Use a severity with no applicable row.

**Expected Result:** Invalid matrices rejected; occurrence lookup uses exact row or last configured lower occurrence; no applicable action blocks recommendation with configuration guidance.

**Data Integrity Check:** Failed save preserves original matrix and audit; no guessed disciplinary action.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### COC-05 — Preserve approved policy snapshot

**Test ID:** COC-05  
**Module and Feature:** Code of Conduct — Preserve approved policy snapshot  
**Priority:** Critical  
**Test Type:** Regression  
**Required Role:** HR and manager  
**Execution Scope:** QA only
**Preconditions:** Approved unissued recommendation and previously issued final decision.

**Test Steps:**

1. Change live matrix after approval.
2. Open approved recommendation and issued document.
3. Prepare a fresh case recommendation of same severity.

**Expected Result:** Old captured recommendation/decision policy stays unchanged; fresh recommendation uses updated matrix; old history is not recalculated.

**Data Integrity Check:** Stored snapshots, prior corrective actions and approval versions unchanged.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

## TASK cases

### TASK-01 — Concurrent claim and stale processing

**Test ID:** TASK-01  
**Module and Feature:** Task ownership — Concurrent claim and stale processing  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** HR-A and HR-B  
**Execution Scope:** QA only
**Preconditions:** Unassigned HR-stage form and explained incident.

**Test Steps:**

1. Both profiles select Take Task for same item together.
2. Loser refreshes and attempts previously opened processing action.
3. Repeat for other resource type.

**Expected Result:** One owner per resource/phase; loser sees current owner and cannot process; active badges refresh within about ten seconds on visible HR tabs.

**Data Integrity Check:** One task identity and successful claim event; no duplicate earnings.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### TASK-02 — ADMIN assign/reassign and reason

**Test ID:** TASK-02  
**Module and Feature:** Task ownership — ADMIN assign/reassign and reason  
**Priority:** Critical  
**Test Type:** Functional  
**Required Role:** ADMIN and two HR reviewers  
**Execution Scope:** QA only
**Preconditions:** Owned form; ADMIN HEAD assigned/manager on incident for incident repetition.

**Test Steps:**

1. Open Dashboard → Review Tasks → Assign/Reassign.
2. Try blank reason then choose eligible HR and valid reason; save.
3. Old/new owners refresh and attempt processing.

**Expected Result:** Reason required up to 1000 characters; eligible active HR only; new owner can act, former cannot; related notification becomes visible to new owner.

**Data Integrity Check:** Previous owner retains credited time/history; HR_TASK_REASSIGNED audit and ownership agree.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### TASK-03 — Incident reassignment scope

**Test ID:** TASK-03  
**Module and Feature:** Task ownership — Incident reassignment scope  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Unassigned ADMIN, Management-only ADMIN, assigned ADMIN HEAD  
**Execution Scope:** QA only
**Preconditions:** Same explained incident, with authorized reviewer fixture.

**Test Steps:**

1. Try assignee lookup and reassignment as unassigned ADMIN.
2. Repeat as manager lacking department ADMIN HEAD assignment.
3. Repeat as department ADMIN HEAD assigned to case or its manager.

**Expected Result:** Only ADMIN with department HEAD assignment and case assigned/manager rights may reassign incident HR task; performance visibility alone does not grant action.

**Data Integrity Check:** Denied attempts preserve owner/time and disclose no expanded case data.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### TASK-04 — Working hours and persistence

**Test ID:** TASK-04  
**Module and Feature:** Task timer — Working hours and persistence  
**Priority:** High  
**Test Type:** Boundary  
**Required Role:** Owning HR and ADMIN  
**Execution Scope:** QA only
**Preconditions:** Isolated clock-controlled ready task near Friday 18:30 and Monday 08:00.

**Test Steps:**

1. Take task before shift boundary and record server timer.
2. Close browser and reopen after weekend/next shift; operator restarts QA API after snapshot if needed.
3. Compare known elapsed working intervals with task history.

**Expected Result:** Only Mon–Fri 08:00–18:30 Manila counted; no lunch or automatic holiday subtraction; browser absence/restart does not reset earned time; no negative duration.

**Data Integrity Check:** Server timestamps and stored earnings authoritative; no time charged twice after restart.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### TASK-05 — Pauses, transfers and completion

**Test ID:** TASK-05  
**Module and Feature:** Task timer — Pauses, transfers and completion  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** HR owner, ADMIN and recipient  
**Execution Scope:** QA only
**Preconditions:** Explained incident with information/hearing/Management waits.

**Test Steps:**

1. Record earned time, create each wait, then resume through valid response/completion/approval.
2. Reassign during a supported wait and inspect both owners.
3. Issue/close or finally review form and revisit history.

**Expected Result:** Waiting interval excluded; reassign checkpoints prior owner; new owner accrues only eligible running periods; completion stops time.

**Data Integrity Check:** Total equals recorded reviewers’ shares; histories retain reasons and pause/resume events.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### TASK-06 — Counts and filters

**Test ID:** TASK-06  
**Module and Feature:** HR Performance — Counts and filters  
**Priority:** High  
**Test Type:** Integration  
**Required Role:** ADMIN  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Known forms approved/rejected and incidents handled repeatedly/by two HRs; unresolved owned/unowned tasks.

**Test Steps:**

1. Apply date/reviewer/type/status/interval filters.
2. Compare cards, reviewer table and six charts with fixture manifest.
3. Repeat same incident actions by same HR and inspect counts.

**Expected Result:** Forms count final approvals/rejections; incident report counted once per HR and once across selected HR summary/trend; ADMIN excluded; current assignments include unfinished waits.

**Data Integrity Check:** Historical completions not assigned invented timing; no data mutations from analytics.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### TASK-07 — Backlog filter independence

**Test ID:** TASK-07  
**Module and Feature:** HR Performance — Backlog filter independence  
**Priority:** High  
**Test Type:** Regression  
**Required Role:** ADMIN  
**Execution Scope:** Live observation / QA variants
**Preconditions:** At least one owned wait, unowned ready task and completed task for each resource type.

**Test Steps:**

1. Record Total and Unassigned Backlog.
2. Change reviewer, completion dates and Task List Status independently.
3. Change Request Type to FORM then INCIDENT.

**Expected Result:** Backlog covers all unfinished HR tasks including waits; unassigned is subset; reviewer/date/task-status do not alter those two cards; Request Type does; completed excluded.

**Data Integrity Check:** Fixture task state/owners unchanged; reconcile total minus unassigned with owned unfinished count.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### TASK-08 — View, history and assignment table

**Test ID:** TASK-08  
**Module and Feature:** HR Performance — View, history and assignment table  
**Priority:** High  
**Test Type:** Functional  
**Required Role:** ADMIN  
**Execution Scope:** Live observation / QA variants
**Preconditions:** Transferred incident task; form task and historical completed work.

**Test Steps:**

1. Open View for form and case; open History and close it.
2. Inspect Incident Task Assignments under selected dates.
3. Navigate away/back and change filters while background revision arrives.

**Expected Result:** View opens correct saved form or authorized Track case; history shows actor/owner/reason/time; assignment table one HR/report with latest in-period assignment and current ownership; unsaved focused filters not reset by background refresh.

**Data Integrity Check:** No duplicate ownership rows attributed as separate incident reviews; closed historical work retained.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### TASK-09 — Invalid filters and role boundary

**Test ID:** TASK-09  
**Module and Feature:** HR Performance — Invalid filters and role boundary  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** HR/STAFF plus ADMIN  
**Execution Scope:** QA only
**Preconditions:** Captured performance/history/task requests.

**Test Steps:**

1. Replay ADMIN dashboard/history as HR or STAFF.
2. As ADMIN send invalid date, reversed or over-one-year range, unknown reviewer/type/state/interval.
3. Attempt ADMIN Take Task/HR-stage form review and HR duration-target endpoint.

**Expected Result:** Unauthorized analytics denied; invalid filters reject; ADMIN cannot take/process HR tasks; retired duration-target feature/endpoint unavailable.

**Data Integrity Check:** No permission grants, task changes or manufactured target statistics.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### TASK-10 — Restricted incident metadata

**Test ID:** TASK-10  
**Module and Feature:** HR Performance — Restricted incident metadata  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** ADMIN-U and case-authorized ADMIN HEAD  
**Execution Scope:** QA only
**Preconditions:** Incident task and assignment exist but ADMIN-U has no case assignment/involvement.

**Test Steps:**

1. Open HR Performance as ADMIN-U and inspect task/assignment rows and JSON.
2. Attempt View and task history for that restricted incident.
3. Compare same item as case-authorized ADMIN HEAD.

**Expected Result:** Global oversight does not expose restricted employee/title/case content; restricted task shows Restricted Incident and no employee name; view/reassign controls follow case rights. Record any history detail leak or direct reader bypass.

**Data Integrity Check:** No restricted case payload or mutation; permitted aggregate/reference information is distinguished from confidential content.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

## SEC cases

### SEC-01 — Replay role access matrix

**Test ID:** SEC-01  
**Module and Feature:** API authorization — Replay role access matrix  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Every role in separate profiles  
**Execution Scope:** QA only
**Preconditions:** Captured allowed reads and disposable mutations; QA API recipe in main plan.

**Test Steps:**

1. Capture successful requests as authorized user.
2. Replay same methods as each disallowed role, including emp.read/write/export/archive, account config, announcements, audit, performance and matrix save.
3. Compare denied payloads and originals.

**Expected Result:** Server rejects unauthorized capabilities independently of menu hiding or forged role fields; only documented grants/case scope succeed.

**Data Integrity Check:** No unauthorized rows/files or committed changes; ACCESS_DENIED audit where permission middleware records it.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### SEC-02 — Private files and directory aliases

**Test ID:** SEC-02  
**Module and Feature:** Apache protection — Private files and directory aliases  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Signed out  
**Execution Scope:** QA only
**Preconditions:** Deployed QA Apache URL; DevTools network headers visible.

**Test Steps:**

1. Request /.env, /package.json, /server/server.js, /scripts/Setup.js and /tests/Test.js under project root.
2. Request /.git/config plus case/trailing-dot/trailing-space encoded path variants.
3. Request public assets and allowed shared/FormTemplates.js.

**Expected Result:** Private requests return denial/404 without contents; no directory listing/Git object disclosure; needed public/shared assets load.

**Data Integrity Check:** Do not save secret-bearing response bodies if a failure occurs; redact and stop using real data.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### SEC-03 — Malformed input and allowlisted structure

**Test ID:** SEC-03  
**Module and Feature:** API boundary — Malformed input and allowlisted structure  
**Priority:** High  
**Test Type:** Security  
**Required Role:** Unprivileged and authorized QA users  
**Execution Scope:** QA only
**Preconditions:** Captured QA read/mutation requests; synthetic values only.

**Test Steps:**

1. Replay unknown method/__proto__/constructor, invalid IDs, malformed args and wrong input shapes.
2. Send search containing percent, underscore, apostrophe and SQL-like plain text.
3. Try invalid sort/filter identifiers.

**Expected Result:** No executable dynamic SQL/property dispatch; unknown methods 404; malformed input rejects or uses documented safe defaults; no unrelated employee records appear.

**Data Integrity Check:** No mutation from rejected malformed requests; record unexpected 500s as error-handling defects.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### SEC-04 — IDOR, headers and download names

**Test ID:** SEC-04  
**Module and Feature:** Attachments — IDOR, headers and download names  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** Authorized recipient and unrelated account  
**Execution Scope:** QA only
**Preconditions:** Current and legacy evidence IDs; Unicode/quote/path-like filenames.

**Test Steps:**

1. Download authorized attachments and compare bytes/name.
2. Request same ID as unrelated role and signed out; try another recipient’s request file.
3. Inspect Content-Disposition, nosniff, private/no-store and MIME headers.

**Expected Result:** Only authorized case/section/request files served; attachment disposition and sanitized names; no path traversal/header injection or inline active HTML response.

**Data Integrity Check:** No file-body leakage on denial; read audit appropriate to service.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### SEC-05 — Stored text and export injection

**Test ID:** SEC-05  
**Module and Feature:** Browser safety — Stored text and export injection  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** HR, filer and recipient  
**Execution Scope:** QA only
**Preconditions:** Harmless script-like/formula-like text fixtures in profile, announcement, form and incident narrative.

**Test Steps:**

1. Save permitted test strings using normal UI.
2. Open every related preview, inbox message, print document and CSV.
3. Watch for script execution or formula evaluation without running harmful payloads.

**Expected Result:** Text is rendered/sanitized safely; no script or spreadsheet formula execution; no broken markup exposing hidden sections.

**Data Integrity Check:** Only intended synthetic text changes; no stored secret in screenshots/export evidence.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### SEC-06 — Cookies, remote access and restart

**Test ID:** SEC-06  
**Module and Feature:** Deployment session boundary — Cookies, remote access and restart  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** QA operator and two users  
**Execution Scope:** QA only
**Preconditions:** Actual deployment-like URL on a second computer; no production setting edits.

**Test Steps:**

1. Load sign-in/API from second computer over intended scheme.
2. Inspect session cookie and API requests; restart only disposable QA API.
3. Retry old session and sign in again.

**Expected Result:** Record actual behavior: API defaults to browser localhost:3001, server binds 127.0.0.1, cookie secure=false and default session store is memory. Deployment must meet approved transport/reachability/session requirements; do not assume remote or restart persistence.

**Data Integrity Check:** Restart must not lose employee/forms/ledger records; session loss is distinct from database loss.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### SEC-07 — Cross-origin and login abuse controls

**Test ID:** SEC-07  
**Module and Feature:** Deployment security — Cross-origin and login abuse controls  
**Priority:** Critical  
**Test Type:** Security  
**Required Role:** QA operator  
**Execution Scope:** QA only
**Preconditions:** Isolated QA origin and synthetic account; bounded test only.

**Test Steps:**

1. Attempt a small set of wrong-password logins and inspect response headers/cookies.
2. From an unapproved origin attempt an authenticated read/write with synthetic data.
3. Check intended reverse-proxy/origin protections with operator.

**Expected Result:** No credentialed CORS response to unapproved origins; no cross-origin state change succeeds against approved threat model. Explicit CSRF token, login throttling and lockout are not implemented in inspected Express code; missing required perimeter controls block release.

**Data Integrity Check:** No real account lockout or sensitive request bodies in evidence; check original test record for unintended write.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### SEC-08 — Account switching and cached downloads

**Test ID:** SEC-08  
**Module and Feature:** Privacy — Account switching and cached downloads  
**Priority:** Critical  
**Test Type:** Regression  
**Required Role:** HR then STAFF in same browser  
**Execution Scope:** QA only
**Preconditions:** HR sensitive profile/case visible; slow network and downloaded QA file.

**Test Steps:**

1. Sign out while a protected read is pending and log in as STAFF.
2. Use Back/Forward/reload and reopen old dialogs/popovers.
3. Open previously downloaded file and record local evidence-handling behavior.

**Expected Result:** Stale HR responses must not populate STAFF screens or authorize new reads; browser-visible cached sensitive content is a privacy issue. Downloaded files remain local and need controlled handling; logout cannot revoke copies.

**Data Integrity Check:** No new protected payload for STAFF; synthetic downloaded artifacts kept separate from real employee data.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

## OPS cases

### OPS-01 — Database restart and migration preservation

**Test ID:** OPS-01  
**Module and Feature:** Operations — Database restart and migration preservation  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** QA operator with browser tester  
**Execution Scope:** QA only
**Preconditions:** Disposable restored backup; before-counts, historical signatures, ownership, policy snapshots and schema inventory; approved restart window.

**Test Steps:**

1. Open representative historical/current records and record baselines.
2. Operator starts/restarts only the isolated QA API twice against restored copy.
3. Reload same browser records and compare baseline.

**Expected Result:** Rerun preserves employee identifiers, optional Primary/Secondary Emails, HMO Details, historical forms/cases and saved attendance links. attendance_employee_links creation is idempotent; obsolete landline_no remains absent. Legacy unfinished tasks archive and ADMIN-owned open HR tasks release as documented. Regularization/reminder effects match the operator manifest.

**Data Integrity Check:** Compare record counts/keys/snapshots/ledger and task earnings; planned obsolete-column/table removal reviewed separately before production restart.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### OPS-02 — Backup and restore rehearsal

**Test ID:** OPS-02  
**Module and Feature:** Operations — Backup and restore rehearsal  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** QA operator and HR  
**Execution Scope:** QA only
**Preconditions:** Authorized backup process external to app; disposable restore target; synthetic attachment and signatures.

**Test Steps:**

1. Operator backs up QA database without altering source.
2. Restore to a separate isolated target.
3. Point a separate QA runtime to restore and open employee, form, evidence and case documents.

**Expected Result:** Restore includes employee records, account roles/both reviewer slots, attendance_employee_links, attachments, signatures, audits, policies, leave and task history. Saved links resolve against the appropriate QA scanner namespace/name. Record restored session behavior; no backup button is assumed.

**Data Integrity Check:** Source unchanged; compare restored counts, references and file hashes/readable documents.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### OPS-03 — Failure rollback with real MySQL

**Test ID:** OPS-03  
**Module and Feature:** Operations — Failure rollback with real MySQL  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** QA operator, owning HR and ADMIN  
**Execution Scope:** QA only
**Preconditions:** Disposable DB with controlled audit/notification failure harness; no shared database schema changes.

**Test Steps:**

1. In isolated QA, the operator injects write/audit failure. Attempt employee/account save, configuration/matrix save, leave approval, incident recommendation and attendance-link confirmation.
2. Inspect errors and reload affected records, queues, balances and saved links.
3. Remove injection, inspect for committed changes and retry once.

**Expected Result:** Sensitive paths roll back related employee/request, assignments/matrix, approval/ledger/task, incident/snapshot/notifications and attendance-link/audit together. Retry commits once after inspection; audit failure leaves no partial confirmed link.

**Data Integrity Check:** Read-only compare all related tables/audit/revision against before snapshot; announcement insert/audit atomicity is not guaranteed and must be recorded separately.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### OPS-04 — Email identity lock timeout and recovery

**Test ID:** OPS-04  
**Module and Feature:** Operations — Email identity lock timeout and recovery  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** QA operator and HR  
**Execution Scope:** QA only
**Preconditions:** Isolated connection holds documented employee-identity named lock; no production lock.

**Test Steps:**

1. Operator holds lock using documented QA procedure.
2. Tester saves one synthetic employee and records response time.
3. Operator releases lock; tester retries once.

**Expected Result:** Writer returns retryable contention failure after roughly five-second lock acquisition limit; retry succeeds; total request duration may exceed five seconds.

**Data Integrity Check:** No writes before failed lock; subsequent pooled connection not left holding lock; one successful employee/request.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### OPS-05 — Dependency outage and service recovery

**Test ID:** OPS-05  
**Module and Feature:** Operations — Dependency outage and service recovery  
**Priority:** High  
**Test Type:** Negative  
**Required Role:** QA operator and HR  
**Execution Scope:** QA only
**Preconditions:** Disposable environment; service restart permitted and saved-record baseline.

**Test Steps:**

1. Stop QA API while browser is open, then restore it and reload.
2. Test Apache unavailable separately and recover.
3. Block Chart.js/fonts/SheetJS individually and inspect startup/chart/import behavior.

**Expected Result:** Clear recoverable feedback; no false saved-success; app reload recovers; imported/chart functionality accurately reports dependency failures. Fonts alone should not prevent core use.

**Data Integrity Check:** Already committed records unchanged; no generator/setup command run against real records.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

## E2E cases

### E2E-01 — Employee to approved self-service form

**Test ID:** E2E-01  
**Module and Feature:** End-to-end — Employee to approved self-service form  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** HR, ADMIN, STAFF, SUPERVISOR and HR reviewer  
**Execution Scope:** QA only
**Preconditions:** Unused employee identity and approved SUP-A chain.

**Test Steps:**

1. HR registers STAFF with account access; ADMIN approves.
2. STAFF signs in, checks profile, submits a correction form.
3. SUP-A signs/forwards; HR takes/approves; STAFF views/prints from My Submissions.

**Expected Result:** Central profile, account role, reviewer chain, serial, signatures, final status and print agree end to end; Inbox/badges reflect each stage.

**Data Integrity Check:** One employee, one approved account, one form and one final review; imports/credentials/historical identity not overwritten.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### E2E-02 — Paid leave through transfer and approval

**Test ID:** E2E-02  
**Module and Feature:** End-to-end — Paid leave through transfer and approval  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** ADMIN, applicant, Head HR and HR reviewer  
**Execution Scope:** QA only
**Preconditions:** Eligible HR applicant; pending paid leave owned by old Head HR.

**Test Steps:**

1. Submit paid leave and have old Head HR take task.
2. ADMIN designates replacement Head HR, then new eligible reviewer takes transferred task.
3. Approve and compare applicant balance, document and ADMIN history.

**Expected Result:** Transfer preserves identity/history/earned time, prevents self-review and releases stale owner; final approval deducts once in correct year/type.

**Data Integrity Check:** One form/task identity, one deduction; prior owner credit retained; no balance change from transfer itself.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### E2E-03 — Full incident with established violation

**Test ID:** E2E-03  
**Module and Feature:** End-to-end — Full incident with established violation  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** Filer, HEAD, reported employee, HR, Management ADMIN  
**Execution Scope:** QA only
**Preconditions:** Configured map/matrix and safe evidence; uninvolved reviewers.

**Test Steps:**

1. File grouped reports and review one: evidence request→response→signed NTE.
2. Employee drafts immediately and submits the signed explanation with receipt recorded together; HR takes task, requests information and completes hearing if needed.
3. HR recommends→manager approves→HR issues and closes; employee checks Inbox/document/history.

**Expected Result:** Every stage/notification/permission/time wait follows implementation; issued substantiated history appears only at final issuance; related report stays independent until separately closed.

**Data Integrity Check:** Reconcile group/report/subjects/files/signatures/snapshots/approval/history/tasks/audit; no unauthorized sections.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### E2E-04 — No violation and early documentation closure

**Test ID:** E2E-04  
**Module and Feature:** End-to-end — No violation and early documentation closure  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** HEAD, employee, HR and manager  
**Execution Scope:** QA only
**Preconditions:** Two separate synthetic reports.

**Test Steps:**

1. Close first at HEAD for documentation with reason.
2. Run second through NTE/explanation/HR no-violation recommendation/Management approval/final issuance/closure.
3. Compare History, COC records and active badges.

**Expected Result:** Both closed with distinct explanations; neither creates confirmed violation; historical documents stay available within role scope.

**Data Integrity Check:** No disciplinary rows for either; task completion only on the explained HR-workflow report.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### E2E-05 — Organizational change and historical consistency

**Test ID:** E2E-05  
**Module and Feature:** End-to-end — Organizational change and historical consistency  
**Priority:** Critical  
**Test Type:** Integration  
**Required Role:** HR and ADMIN with old/new reviewers  
**Execution Scope:** QA only
**Preconditions:** Employee has historical approved form/final incident and pending ordinary form.

**Test Steps:**

1. Change employee department/rank/Reports To and save account reviewer separately.
2. Compare existing pending routes against stored assignment, then submit new form/incident.
3. Compare reports, personal dashboard and historical documents.

**Expected Result:** Current profiles/reports/new requests use saved configuration; existing form primary/secondary reviewers and incident assignments are not assumed retroactively reassigned. Search selection binds account identity; display text alone grants no rights. HR reporting selections do not change designated Head HR routing. Completed applicant identity/signatures/history remain preserved.

**Data Integrity Check:** No rewrite of completed history; rank/status changes affect current leave eligibility; text Reports To is distinct from account reviewer.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### E2E-06 — Readiness smoke across browsers and sizes

**Test ID:** E2E-06  
**Module and Feature:** End-to-end — Readiness smoke across browsers and sizes  
**Priority:** High  
**Test Type:** Regression  
**Required Role:** Every role  
**Execution Scope:** QA only
**Preconditions:** All Critical cases already executed; Chrome/Edge plus another supported target browser; 375/768/1440 widths.

**Test Steps:**

1. Sign in per role, open dashboard/profile, Inbox and every allowed module.
2. Perform one remaining synthetic submit/review/document print at small and desktop widths.
3. Sign out, reload and check critical records with authorized reviewer.

**Expected Result:** Core workflows work in each supported browser/size with accessible controls, legible prints, no overlapping frozen tables/dialogs and no uncaught error blocking operation.

**Data Integrity Check:** Compare final saved references and counts; mark unsupported/browser failures explicitly rather than extrapolating desktop results.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.  
**Notes / Evidence:** ____________________  
**Variant / tester / execution date / defect reference:** ____________________

### E2E-07 — Imported employee to account and personal attendance

**Test ID:** E2E-07
**Module and Feature:** End-to-end — Imported employee to account and personal attendance
**Priority:** Critical
**Test Type:** Integration
**Required Role:** HR, ADMIN and STAFF/SUPERVISOR/HEAD
**Execution Scope:** QA only
**Preconditions:** One QA imported employee without account and unique scanner-name match; separate ambiguous variant. Do not reimport the real workbook.

**Test Steps:**

1. Find the imported employee and verify one record, optional identifier handling and Inactive account status.
2. Use Edit to request access as HR, approve as ADMIN; repeat on another QA record with immediate ADMIN save.
3. Verify edit returns to list and account status becomes Active after refresh.
4. Sign in to the existing personal dashboard; compare actual QA scanner data and resolve ambiguous variant using Link employee.
5. Compare master-list/report headers and CSV, then sign out/in and verify the saved attendance link.

**Expected Result:** Existing employee receives access without duplicate registration. Primary Email is login; activation follows saving actor. Data fills the existing dashboard; ambiguity waits for HR. Account Status stays screen-only; master-list/HR master default to No. ascending.

**Data Integrity Check:** One employee/intended account/link per variant; real imported records, credentials, roles and links remain unchanged.

**Result:** Not Tested — choose Pass / Fail / Blocked / Not Tested.
**Notes / Evidence:** ____________________
**Variant / tester / execution date / defect reference:** ____________________

