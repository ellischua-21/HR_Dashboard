# Final Pre-Deployment Manual Testing Plan

**Start with the imported-data checks below; run data-changing and failure/security variants on a separate QA copy.**

Prepared 11/13/2026; revised 11/23/2026 against application commit `5056004`. This revision compares post-plan implementations and the current UI/API/service rules, updates outdated procedures, and preserves existing execution evidence. Imported real employee data is now in place. This documentation review made no application, database, account, scanner-link or configuration changes and executed no manual case. Dependency internals, credentials and live employee records were not inspected.

| Deliverable | Use |
| --- | --- |
| [Detailed test cases](FinalPreDeploymentManualTestCases.md) | 190 cases with roles, execution scope, numbered steps, expected behavior and integrity checks. |
| [Execution results CSV](FinalPreDeploymentManualTestResults.csv) | One row per case, with Execution scope for filtering. Existing results/evidence are preserved; new cases start Not Tested. |
| This document | Fixture roster, feature inventory, evidence, execution order, implementation limits and release criteria. |

**Readiness is undetermined.** Passing source checks and mock tests does not establish browser usability, deployed access control, real MySQL locking, recoverability or actual scanner behavior. This is a plan, not a completed manual test report. An implemented path below means its UI/API/service path exists in source, not that it passed real-world testing.

## 1. Start after the real-data import

The imported employee list is the baseline, not a fixture generator. Do not rerun
setup, sample-data generation or the completed workbook import to prepare tests.
Read-only here means no change to employee/account/link/form/case business data;
login, viewed/seen markers and export audits may still be recorded.

1. Record the deployed application commit and take an operator-managed backup of the imported baseline. Keep the original workbook and baseline counts in protected local evidence; do not paste employee data into this plan or a public defect.
2. On the existing HRIS, observe BOOT-01, AUTH-01, EMP-04, SELF-01/02, ATT-01 and REPORT-03/04. Compare actual imported headers, No. order, account strip, unique-name attendance and report populations. Allow 30–45 minutes for this first inspection; this is a planning estimate, not a complete sign-off.
3. For write, archive, role, leave, incident, link-confirmation, concurrency, security-replay and failure cases, use a separate QA runtime/database or restored copy under the operator's control. Add only clearly identified QA fixtures there; never manufacture disciplinary history or change a real person's role/link just to test.
4. Filter the results CSV by **Execution scope**. **QA only** prohibits executing the case on the real imported records. **Live observation / QA variants** permits only its non-mutating observations on existing data; complete exceptional/writing variants in QA. Record a live subset in Variants and observations; leave the overall case Not Tested or Blocked until every required variant is covered.
5. Follow the fixture roster and release gates below. No existing result is reset by this revision; recheck changed expectations before treating older evidence as current.

### Prepare the QA environment

**Local test environment prepared 11/23/2026:** the current API at
`http://127.0.0.1:3001` now uses `hr_dashboard_test`; the original `hr_dashboard`
is retained for launch. All 54 table schemas/checksums matched immediately after
copying, including 127 employee records and 127 accounts. Existing account password
hashes were preserved. The normal app URL remains the same; sign in again after
the API restart. This is environment preparation, not a Pass for any manual case.

The baseline SQL backup and switch metadata are private local files under
`server/.local-backups/`, excluded from Git and blocked by Apache. Do not upload
these files or include their contents in test evidence. `.env` currently selects
`DB_NAME=hr_dashboard_test`; all other settings were preserved. Scanner integration
continues to read the real connected providers; this is not permission to change
live scanner enrollment, punches or credentials for failure tests.

When testing finishes, stop the test API, change only `DB_NAME` back to
`hr_dashboard`, restart and verify the original before deleting the test database.
Do not restore the test database over the original. Test forms, NTEs, leave effects,
password/profile changes and settings remain in the copy; deliberately reapply
only approved employee/account/configuration corrections needed for launch. Keep
the baseline backup until the launch is verified. No test database has been deleted.

1. Have the operator provide a deployment-like QA URL and isolated database, optionally restored from the protected imported baseline. Use synthetic records for write, rejection, archive, concurrency, security and failure cases. Never disable, archive or corrupt a real employee to execute this plan. Record the exact application commit and browser versions.
2. Have the operator verify an existing backup and demonstrate restore into a separate target. Normal API startup calls schema initialization and background writers; merely starting it against a database is not read-only. Obtain separate authorization for operator migrations, fixture injection, service restarts and controlled clock tests.
3. Prepare the account roster below, approving HEAD accounts before SUPERVISOR accounts and SUPERVISOR accounts before STAFF accounts. Use separate browser profiles/private sessions for concurrent actors; two tabs in one profile share a login. Keep passwords out of this plan and all evidence.
4. Save an expected-results manifest: synthetic employee numbers, role/rank/status, departments, FTE, dates, reviewer assignments, expected SL/VL and known finalized violations. Add case/form IDs as they are created. Use a permitted read-only database viewer for integrity checks; do not run setup or sample generation against existing organizational data.
5. Open the case document and results CSV side by side. Run a single case, record its result, then move on. For parameterized cases, execute every listed variant; mark Pass only if all pass, otherwise list the failed/blocked variants.

### Account and employee roster

Names below are aliases, not real employees. Use unique `.invalid` emails, such as `qa-staff-a@example.invalid`, only where the QA system permits them. Scanner/HRIS numbers may differ: automatic personal attendance uses unique normalized first and last names. Prepare duplicate employee names and same-name scanner identities across accounts for explicit HR confirmation, plus blank-number and unmatched-name controls. Use a provider stub/authorized QA scanner account; do not enroll invented people or repurpose live scanner namespaces.

| Alias | Stored role / employee setup | Purpose |
| --- | --- | --- |
| SETUP-ADMIN | Sole specifically flagged first setup ADMIN, no employee initially | First-install exception, separate disposable database only. |
| ADMIN-A / ADMIN-B | ADMIN, active, each genuinely linked | Two Heads reviewers; department assignments; case oversight. |
| ADMIN-M | ADMIN, active, linked, uninvolved in main case | Management approver; test separate from department HEAD assignment. |
| ADMIN-U | ADMIN, active, linked, no incident assignment | Negative case access and reassignment tests. |
| HEAD-A / HEAD-B | HEAD, active, linked | Form reviewers and incident department reviewers; use different departments where needed. |
| SUP-A / SUP-B | SUPERVISOR, active, linked, assigned to HEAD-A / HEAD-B | STAFF form routing, incident filing and cross-team negatives. |
| STAFF-A / STAFF-B | STAFF, active, linked, assigned to SUP-A / SUP-B | Own profiles, forms, reported employee and unrelated-access tests. |
| STAFF-C / STAFF-W | STAFF, active, linked | Employee concerned/involved and witness; enough different people to test confidentiality. |
| HR-A / HR-B / HR-C | HR, active, linked; HR-A initially Head HR | Independent review, ownership races, Head HR replacement and uninvolved evaluator. |
| Pending chain | HR-created pending HEAD, SUPERVISOR and STAFF requests | Out-of-order approval, rejection and stale actions; ADMIN-created accounts instead activate immediately. |
| Exception profiles | Unlinked imported, archived, inactive-account and ambiguous historical identities | Negative identity tests; operator prepares exceptional states only in QA. |

Employee **rank is independent of account role**. Prepare Regular Supervisor (paid leave eligible), Regular Rank and File, Probationary Supervisor, Contractual, and historical blank-rank controls. A STAFF login may have Supervisor rank. Employment statuses are `Regular`, `Probationary`, `Contractual`, `Resigned`, `Terminated`, `Retired`, `Inactive`. Archive state is separately `Active`/`Archived`; neither table uses a generic employee `Approved` state.

### Data packs

| Pack | Required data | Supports |
| --- | --- | --- |
| Small known population | 30+ synthetic employees across two companies/locations/departments and all relevant ranks/statuses; birthdays/tenure boundaries; FTE 0, 0.5, 1; Unicode and missing optional values | Lists, filters, reports, completeness and personal dashboard. Use allowed lookup values fetched by current API. |
| Import | Header-only/corrupt files, CSV and XLSX, text leading-zero IDs, duplicate/archived emails, 301+ rows crossing a 300-row chunk boundary | Mapping, partial import, normalization, contention. First worksheet only; structured JSON profile tables/docs are not importable through current mapping. |
| Forms / leave | Each of seven templates, each real state/stage, signed historical requests; SL/VL grants/deductions and Dec–Jan allocations | Routing, printing, balances, edits and duplicate approval. |
| Incidents | Independent valid reports plus multi-report group; HEAD pool case, NTE receipt/draft/submitted explanation, extension, requests to two recipients, hearing, Management return/approval, no violation and substantiated outcomes | Full incident and privacy coverage. Valid employee-concerned selection is required by current UI/service, even though older guide steps omit it. |
| Operator-only | Read-only legacy version-1 records and documents; safe file-limit samples; known provider scan sequences; clock/failure fixtures; disposable restore | Cannot be synthesized through ordinary current browser workflow. Mark Blocked if unavailable; do not fabricate a Pass. |

Lookups come from `lookup_values`, with defaults in EmployeeSchema. ADMIN can add Company Name, Work Location and Department in Manage Accounts → Accounts → Organization Settings; each Add persists immediately. Incident Reviewers and Management Approver changes use Save Changes. Department choices combine active lookups, nonarchived employees and saved mappings; IT/Finance/Operations are not deliberately hidden. Do not assume a valid or newly added department already has a reviewer. Bootstrap ADMIN without an employee cannot be selected as a linked incident reviewer/manager until an actual employee exists.

## 2. Execution order and release decision

| Pass | Bounded batch | Estimated hands-on time |
| --- | --- | --- |
| 1 | Fixtures, service/URL check, BOOT and AUTH; essential EMP/ACC provisioning | 3–5 hours including preparation. |
| 2 | EMP/IMP/SELF; current role/search/save changes; seven forms and LEAVE; reports and announcements | 8–12 hours. |
| 3 | Incident filing through closure, confidentiality, COC, ownership/performance, and attendance-link confirmation | 9–14 hours. |
| 4 | SEC, OPS and concurrency/failure/restore checks with operator | 4–7 hours; coordination additional. |
| 5 | E2E and browser/responsive reruns; fix verification and sign-off | 3–5 hours before defect retests. |

Budget **27–43 hours** total hands-on work across several days. Session expiry needs more than eight elapsed hours; reminders/year rollover/regularization require scheduled observation or isolated operator-controlled clock fixtures. Estimates are planning allowances, not measured performance or a claim every case takes the same time.

Priorities: **Critical** = identity/privacy, authorization, financial/disciplinary integrity, workflow gates, recoverability or deployment feasibility; **High** = normal operation, validation and important integration; **Medium** = secondary usability/presentation. No Low cases are needed to pad coverage. Full counts are recorded in the results sheet.

1. Do not deploy with any failed Critical case, unauthorized sensitive payload, lost/duplicate financial or disciplinary write, unproven recoverable backup, or unresolved deployment connectivity/transport requirement.
2. Pass every applicable Critical and High variant. Blocked Critical/High cases require completion or an explicit accountable release decision identifying the unresolved risk; a missing scanner/legacy/clock fixture is not a Pass.
3. Fix and rerun failed cases plus their connected E2E/permission paths. Preserve the failing evidence and prior result; do not change expected results to accept a defect.
4. Agree and record dispositions for Medium defects, implementation limits and organization-specific requirements. A source-confirmed limitation can still block organizational use.
5. Sign off with tester, HR workflow owner, system operator and release decision-maker, including commit, environment, results totals, unresolved defects, backup evidence and launch decision/date.

## 3. How to execute and record a case

Each detailed case includes the requested Test ID, Module and Feature, Priority, Test Type, Required Role, Execution Scope, Preconditions, numbered Test Steps, Expected Result, Data Integrity Check, Result and Notes / Evidence. Alias references resolve to the roster above. An integrity check is performed through the browser first, then read-only database inspection where stated. Without access to required database evidence, mark the integrity portion Blocked and do not silently count the complete case as passed.

| Result | Meaning |
| --- | --- |
| Not Tested | No execution evidence yet; the initial value for every case. |
| Pass | All listed variants and required integrity checks matched expected results. |
| Fail | At least one expected behavior was violated; include defect reference and failed variant. |
| Blocked | Cannot execute/verify because fixture, role, dependency or operator access is missing; name it. |

Use a defect note with **location → cause if established → observed result → expected result → reproduction → evidence → next fix/retest**. Record date/time in MM/DD/YYYY and AM/PM with Manila/UTC+08:00 context. Capture synthetic references, role and redacted request/response; never passwords, `.env`, scanner tokens, real government identifiers or full confidential employee statements.

### Direct API testing recipe (QA only)

1. Open browser DevTools → Network; perform an authorized action once using synthetic data. Select its request and inspect method/payload. Record `API_BASE` from the observed URL; do not assume a deployed browser can reach its own localhost.
2. Log in as the test’s alternate actor in a separate browser profile. Replay the same method using that profile’s credentials. Do not copy the privileged user’s cookie. On browsers without Edit and Resend, use the browser console with the template below and exact method/arguments from the captured request.
3. Inspect status and JSON/file content, then reload the original object as the authorized reviewer. Denial means no successful protected content and no committed mutation; UI hiding alone does not satisfy the test.

```javascript
// Replace placeholders with the OBSERVED QA API root and synthetic request only.
fetch('QA_API_ROOT/METHOD', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ args: [/* exact captured method arguments */] })
}).then(async (response) => ({ status: response.status, body: await response.json() }))
  .then(console.log);
```

Login uses `POST /api/login` with `{email,password}`, logout `POST /api/logout`; RPC methods use `POST /api/<method>` and `{args:[...]}`. Evidence uses `GET /api/incidents/<evidence-kind>/<id>`. Ordinary permission failures use 401/403; incident workflow assertions commonly use 409 and unavailable records 404. Assert denial/content/integrity, not one universal denial code. No API replay against real employee records is authorized by this plan.

## 4. Actual roles and workflow rules

| Capability | STAFF | SUPERVISOR | HEAD | HR | ADMIN |
| --- | --- | --- | --- | --- | --- |
| Own employee dashboard/profile/attendance | Yes | Yes | Yes | No personal dashboard grant | No personal dashboard grant |
| Own seven form templates / submissions | Yes | Yes | Yes | Yes | No |
| Assigned ordinary form review | No | Assigned STAFF/SUPERVISOR | Assigned STAFF/SUPERVISOR/HEAD | Designated Head HR reviews other HR | Explicitly assigned STAFF/SUPERVISOR/HEAD HEAD-stage review; no final HR-stage processing |
| HR-stage form review / Take Task | No | No | No | Eligible uninvolved HR owner | View/authorized assignment only |
| Employees / import / export / attendance / HR Reports | No | No | No | Yes | Yes |
| Workforce analytics | No | No | No | Yes | No; its Dashboard is HR Performance |
| Executive Summary / Audit / account configuration / HR Performance | No | No | No | No | Yes |
| Announcement creation | No | No | No | Yes | Yes |
| Inbox / own password / COC matrix reading | Yes | Yes | Yes | Yes | Yes |
| Incident filing | No | Yes | Yes | Only designated Head HR | Only ADMIN with department HEAD assignment |
| Incident Review page | No | No | Assigned cases | Uninvolved after NTE; saved assigned HR department HEAD-stage case also visible before NTE | Assigned HEAD/Management/shared Heads-pool scope |
| Incident History page | Own accessible cases | Own accessible cases | Use Review Closed | Use Review Closed | Use Review Closed within scope |
| COC matrix editing | No | No | No | Yes | No |
| Other employees’ finalized violation history | No | No | No | Yes | Yes, through authorized employee history reader |

Head HR is a designation on HR, not a sixth role. Reporting eligibility: STAFF/SUPERVISOR → SUPERVISOR/HEAD/ADMIN; HEAD → HEAD/ADMIN; HR → HR/ADMIN; ADMIN → ADMIN. Self-assignment is forbidden. Primary is required for STAFF/SUPERVISOR/HEAD and optional for HR/ADMIN; the optional second must be distinct and requires a primary. Either stored reviewer can complete the one first-review stage; both approvals are not required. HR reporting assignments do not replace designated Head HR form routing. ADMIN role alone grants neither blanket incident access nor HR processing. Residual `extra_perms` cannot restore role-only privileged permissions. Current active identity is re-read server-side on protected requests.

### Forms and saved states

| Template key / title | Prefix | Assigned reviewer stage | Final signature requirement |
| --- | --- | --- | --- |
| `leave-2026` / Leave Application | LEAVE | Standard role route | Assigned reviewer and HR signatures required. |
| `authority-to-deduct` / Authority To Deduct | ATD | Standard role route | Assigned reviewer signature; HR signature not required. |
| `nexus-no-in-out` / Time-In/Out Correction Request | NIO | Standard role route | Assigned reviewer and HR signatures required. |
| `official-business-trip` / Official Business / Travel Request | TRV | Standard role route | Assigned reviewer signature; HR signature not required. |
| `ot-slip` / Overtime Request | OT | Standard role route | Assigned reviewer and HR signatures required. |
| `time-in-out` / Time In/Out Record | TIO | Standard role route | Assigned reviewer signature; HR signature not required. |
| `nexus-accountability` / Company Property Accountability | NAC | Bypasses assigned reviewer; direct HR | No reviewer signature; employee signature/acknowledgment still required. |

Standard route: STAFF → assigned SUPERVISOR/HEAD/ADMIN → HR; SUPERVISOR → assigned SUPERVISOR/HEAD/ADMIN → HR; HEAD → assigned HEAD/ADMIN → HR; ordinary HR → designated Head HR, whose approval is final; Head HR’s own form → another HR. Form states are only **PENDING / APPROVED / REJECTED**, with review stage **HEAD / HR**. Forwarding leaves status PENDING. No general cancellation/resubmission/withdraw state exists. Applicant edits require own PENDING HEAD-stage form with assigned reviewer and no taken task; a new signature is required. HR must own its task before final review or Head HR review.

SL/VL: Regular + nonblank employee rank above Rank and File + nonarchived identity; five days of each per eligible calendar year, no carryover. Submission and intermediate approval do not deduct. Final approval locks/rechecks eligibility and balances; annual ledger and historical sync are idempotent. Leave uses half-day increments within inclusive calendar dates; ambiguous Dec–Jan requests need explicit allocation. SIL balance is HR-entered form text, not the SL/VL allowance ledger.

### Current incident states and access

Public status stays **IR FILED → NTE ISSUED → CLOSED**. Internal phase is **HEAD → EMPLOYEE → HR → MANAGEMENT → FINAL_ACTION → FINALIZED → CLOSED**. Management return and Revise Evaluation return to HR; HEAD can close for documentation directly. Explanation submission unlocks HR evaluation/task creation. Five **calendar** days start immediately at HEAD issuance. Explanation text and signature are available together without a prior receipt step; drafts do not acknowledge receipt, and signed submission records any missing receipt in the same transaction. Receipt never resets the deadline. Missing deadlines on open issued notices are backfilled from issuance; previously granted deadlines/extensions are preserved. Overdue notification never establishes a violation. Extension statuses: PENDING/APPROVED/REJECTED/RESOLVED; information requests PENDING/RESPONDED; hearings NONE/SCHEDULED/COMPLETED. Management approve/return is recorded without a signature pad.

| Viewer | Permitted current case material |
| --- | --- |
| Reported employee | Sections I–VII, own explanation draft, issued final decision; own extension records. |
| Filer / witness / other participant | Sections I–IV; own targeted information request/response; no internal assessment or another recipient’s private response. |
| Assigned HEAD | Sections I–VII, own NTE draft, authorized requests and issued final decision. |
| Uninvolved HR after NTE issue | Sections I–VIII; eligible HR ownership required for processing. Extension review before explanation is a separate permitted action. |
| Assigned ADMIN reviewer / designated Management approver | Authorized internal material under case assignment; assigned ADMIN HEAD and Management actions remain separate from HR ownership. |

Assigned ADMIN max-section access, shared-pool eligibility and targeted requests require exact role/involvement checks. Test raw JSON and downloaded/printed content, not only visible section headings. Legacy version-1 rules are separate: only HR has legacy internal review visibility; ADMIN participants/assigned HEADs retain their narrower historical permissions. New current writes to legacy records are unavailable.

Task states are READY/WAITING/COMPLETED (historical legacy tasks may be ARCHIVED). Unassigned means no owner, not a separate stored state. Current incident tasks start only after submitted explanation; broad older prose about pre-explanation waiting tasks is not a reason to expect them. HR timing counts Monday–Friday 08:00–18:30 Manila, including lunch and public holidays unless another approved mechanism exists; it measures turnaround, not active effort.

## 5. Complete feature inventory

Rows group controls that share the same implemented workflow; each named small control is covered by its linked cases. **Data** = needs employees before meaningful execution; scanner/legacy/operator prerequisites are called out. Status is based on source only. Source keys resolve to exact files in section 8. Test ranges include every numbered case in that range.

| ID | Feature / purpose | Roles | Access | Dependencies | Status | Data | Priority | Cases | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | **Startup / recovery**: Root redirect, fragment/script loading, failed-resource message and reload | All | Project root / sign in | Apache, loader, feedback/loading | Implemented | No | Critical | BOOT-01–02 | S01 |
| F02 | **Role navigation**: Role landing pages, groups, keyboard activation and repeated initialization | All; Head HR designation | Sidebar | Session permissions, controller lifecycle | Implemented | Yes | High | BOOT-03; AUTH-01 | S02 |
| F03 | **Shared controls**: Mobile menu, frozen tables, focus/zoom, required markers, signatures, confirmation, outside dismissal, date/time entry and back-to-top | All as page allowed | Across pages / dialogs | UI, EmployeeSearch, SignaturePad, AppConfirm, Loading, DateUtils, CSS | Implemented | Mixed | High | BOOT-04–08; SEC-08 | S03 |
| F04 | **Login / current session**: Password verification, email normalization, role/current employee identity, eight-hour cookie, logout | All approved active accounts | Sign in / Sign out | user_roles, employees, Auth, password hashing, express-session | Implemented | Yes; setup exception | Critical | AUTH-01–07 | S04 |
| F05 | **First setup ADMIN**: Specifically flagged first account can bootstrap without fabricated employee | Flagged ADMIN only | Sign in; operator provisioning | EmployeeIdentity, create-user | Implemented | No initially | Critical | AUTH-04 | S04 |
| F06 | **Change Password**: Current password, length validation, confirmation and audit | All | Change Password | AccountService, Password, user_roles | Implemented; session limits below | Yes | High | AUTH-08–10 | S05 |
| F07 | **Employee master list**: Name/number search; visible company/department/status filters; No. ascending; frozen Account Status/No./Name/Employee Number; centered cells and light status colors | HR / ADMIN | Employees → Employee Master List | employees, account-active metadata, shared row sizing/CSS | Implemented; status excluded from CSV/print/HR Reports | Yes | High | EMP-04; REPORT-04–05 | S06 |
| F08 | **Employee registration**: Required/optional/sensitive fields, preview, atomic employee plus HR pending request or immediate ADMIN account | HR / ADMIN | Employees → Employee Registration | EmployeeSchema, validation, identity lock, AccountService | Implemented | Reviewer data first | Critical | EMP-01–02,12 | S06 |
| F09 | **Structured profile fields**: Sibling/child/organization add/remove tables; church conditional requirement; family/emergency/social data | HR / ADMIN | Registration / Edit / profile | JSON schemas, field metadata, shared renderer | Implemented | Yes | Medium | EMP-03,10 | S06 |
| F10 | **Profile / edit / print**: Full employee reader, preview/back/cancel/save, immutable IDs and audit metadata | HR / ADMIN | Master List profile; HR Reports master reader | EmployeeService, Employees renderer, reports | Implemented | Yes | High | EMP-05,11; REPORT-04–05 | S06 |
| F11 | **Employee number / email integrity**: Current/archived uniqueness, case/space comparison, linked-email protection, serialized participating writes | HR / ADMIN writes | Registration / Edit / Import | EmployeeEmailService, named lock, accounts/requests | Implemented; no email DB uniqueness constraint | Yes | Critical | EMP-06–08; IMP-03–04,08; OPS-04 | S07 |
| F12 | **Archive and employment status**: Archive confirmation; exclude archived records; retain history; employment status distinct from login active flag | HR / ADMIN | Profile → Archive / Edit status | record_status, user_roles.active, identity checks | Implemented; no restore UI | Yes | Critical | EMP-09,13 | S06 |
| F13 | **Import template / reader / mapping**: CSV/XLSX first sheet, current master headers, mapping/skip, dates/leading zeros; generated/JSON destinations disabled | HR / ADMIN | Master List → Import | SheetJS external CDN, metadata, browser parser | Implemented; JSON contents not imported | No existing employee needed | High | IMP-01,05–07,09 | S08 |
| F14 | **Import validation / commit**: Preview, row errors, valid-row partial import, confirmation, 300-row client chunks / 500-row API cap | HR / ADMIN | Import → Validate / Import | ImportService, counter, validation, named lock, bulk audit | Implemented; not whole-file atomic | Mixed | Critical | IMP-02–04,08 | S08 |
| F15 | **Account requests**: Request new access or role/reviewer/password edits; approve in chain or reject with confirmation/refresh | HR requests; ADMIN saves immediately or decides HR requests | Registration / Employee Edit; Manage Accounts → Account Requests | employees, account_requests, user_roles | Implemented; HR edits require approval, ADMIN edits apply immediately | Yes | Critical | ACC-01–02,11; AUTH-02 | S05 |
| F16 | **Account reviewer assignments**: STAFF/SUPERVISOR/HEAD/HR/ADMINS tabs, primary/second search, names selected and emails in suggestions; role matrix above | ADMIN | Manage Accounts → Accounts | AccountService transaction/audit; shared EmployeeSearch | Implemented; either reviewer acts | Yes | Critical | ACC-03–04,13; FORM-22; E2E-05 | S05 |
| F17 | **Head HR designation**: Single saved designation; pending HR form/task transfer and self-review prevention | ADMIN config; HR reviews | Accounts → Head HR switch / Save Changes | AccountService, FormReviewScope, TaskService | Implemented | Yes | Critical | ACC-05–06; E2E-02 | S05 |
| F18 | **Incident Reviewers**: Dynamic departments; department HEAD/ADMIN; HR also allows designated Head HR; two Heads ADMIN slots and separate Management default | ADMIN | Manage Accounts → Accounts → Organization Settings → Incident Reviewers | WorkflowConfiguration, linked active accounts, saved mappings | Implemented; assignments use Save Changes | Yes | Critical | ACC-07–09,12 | S09 |
| F19 | **Account management scope**: List/refresh, account edit requests and decisions; no general disable/delete | ADMIN | Manage Accounts | Current registered APIs / account view | Partial administration surface | Yes | High | ACC-10; AUTH-07; EMP-13 | S05 |
| F20 | **Personal dashboard**: Own greeting/profile/job details, direct manager, Full Profile expansion, read-only sensitive own fields | STAFF / SUPERVISOR / HEAD | Dashboard | Central employee identity, profile renderer, employee.self | Implemented | Yes | Critical | SELF-01; EMP-11 | S10 |
| F21 | **Own daily attendance**: Today/date arrows/refresh, eight time fields, scan/device/serial popover, unique first/last-name matching and HR-confirmed duplicate links | STAFF / SUPERVISOR / HEAD | Dashboard → Daily Attendance | Provider accounts, cache and shared inference | Implemented; provider dependent | Yes + scanner | Critical | SELF-02–04; ATT-11–14; E2E-07 | S10 |
| F22 | **Form catalog / common authoring**: Seven templates, autofill/locked applicant, signature, acknowledgments, submit feedback and serial | STAFF / SUPERVISOR / HEAD / HR | Forms → Fill Out | FormTemplates, FormValidation, FormService, employee identity | Implemented | Yes | Critical | FORM-01,09,19,21 | S11 |
| F23 | **Leave Application**: Six leave choices, dates/days/reason/pay, Others description, SL/VL display, cross-year allocation and HR SIL text | Form submitters; HR review | Fill Out → Leave Application | LeaveService, ledger, employee rank/status | Implemented | Yes | Critical | LEAVE-01–09 | S12 |
| F24 | **Authority To Deduct**: Particulars, amount 0.01–10000000, authorization and signed request | Form submitters; reviewers | Fill Out → Authority To Deduct | Template + standard form route | Implemented as request only | Yes | High | FORM-02 | S11 |
| F25 | **Time-In/Out Correction Request**: Reason, reviewer autofill, dated daily rows and corrected times | Form submitters; reviewers | Fill Out → Time-In/Out Correction Request | Template + standard form route; no scanner writer | Implemented as request only | Yes | High | FORM-03 | S11 |
| F26 | **Official Business / Travel Request**: Destination/purpose, departure/return order and signed request | Form submitters; reviewers | Fill Out → Official Business / Travel Request | Template + standard form route | Implemented as request only | Yes | High | FORM-04 | S11 |
| F27 | **Overtime Request**: Shift/date/from/to, quarter-hour requested hours and reason | Form submitters; reviewers | Fill Out → Overtime Request | Template validation + standard route | Implemented as request only | Yes | High | FORM-05 | S11 |
| F28 | **Time In/Out Record**: Add/remove dated time/break rows, applicant signature, view/print | Form submitters; reviewers | Fill Out → Time In/Out Record | Shared row editor; maximum 100 rows | Implemented as request only | Yes | High | FORM-06 | S11 |
| F29 | **Company Property Accountability**: Description/quantity/tag/dates/remarks rows, acknowledgment; direct HR route, signature-free reviewer approval | Form submitters; HR | Fill Out → Company Property Accountability | nexus-accountability template, HR task | Implemented; omitted in overview docs | Yes | Critical | FORM-07–08 | S11 |
| F30 | **My Submissions / editing**: Summary, status/type/search, newest-first view/print, eligible edit with fresh signature | Form submitters | Forms → My Submissions | FormStatus, own user_forms query, document renderer | Implemented | Yes | High | FORM-12–13,17,20 | S11 |
| F31 | **Assigned form review**: View, sign/forward or reasoned reject; date/type/status/search/refresh | Assigned SUPERVISOR/HEAD/ADMIN; designated Head HR for HR | Forms → Review Requests | Stored assigned reviewer, scope, signature requirements | Implemented | Yes | Critical | FORM-10–11,14,16–18,22 | S11 |
| F32 | **HR final review / ADMIN view**: Take Task, template-specific signature/approve, reasoned reject, HR leave fields; ADMIN view/assignment only at the HR stage; explicitly assigned ADMIN can review the first stage | HR owner; ADMIN viewer | Review Requests / View Forms; Inbox links | TaskService, FormService transaction/audit, leave approval | Implemented | Yes | Critical | FORM-15–18; TASK-01–03 | S11 |
| F33 | **Leave ledger / regularization**: Annual five SL/five VL, idempotent historical sync, locked final deduction, rank/status recheck, six-month job | Eligible employees; HR; operator observes job | Leave form / review; startup and hourly job | leave_accounts, leave_transactions, RegularizationService | Implemented; no holiday/carryover engine | Yes | Critical | LEAVE-03–10 | S12 |
| F34 | **HR attendance list**: Date/day arrows/refresh, employee/department/main-status filters, chronological logs, department grouping, all rows | HR / ADMIN | Employees → Attendance | AttendanceService/Rules/UI; Hik client/accounts | Implemented; no UI paging/sort headers | Scanner data | High | ATT-01–06,09–10 | S13 |
| F35 | **Scanner integration**: HTTPS allowed regional hosts, queued token calls, per-account matching, cache/refresh, summary fallback and combined failure | HR/ADMIN reader; operator config | Attendance / personal attendance | External provider, env names only, server-memory tokens | Implemented; external operation unconfirmed | Scanner data | Critical | ATT-07–10; SELF-03 | S13 |
| F36 | **HR workforce Dashboard**: Ten KPIs, eleven charts, date/company/department/location/status/rank/function filters, Reset, observations/completeness | HR | Dashboard | DashboardService, employees, Chart.js | Implemented; current-status historical limits | Yes | High | REPORT-01–02 | S14 |
| F37 | **HR Reports**: 14 report choices, population filters, header sorting, all-row output, empty state, master employee reader | HR / ADMIN | Reports → HR Reports | ReportService, employee schema, report renderer | Implemented | Yes | High | REPORT-03–04,08 | S14 |
| F38 | **CSV and print**: Master/report CSV with filter population, quoted/formula-neutralized output; report/profile/form/case print | HR/ADMIN export; permitted document viewers print | Export / Print / browser PDF | ReportService, UI download, document styles | Implemented; no employee docs export | Yes | High | REPORT-05; FORM-17; INC-34 | S14 |
| F39 | **Executive Summary**: ADMIN current/prior-year comparison, filters, print; future analytics placeholders | ADMIN | Reports → Executive Summary | Dashboard compute and employment dates | Partial; future panels inactive | Yes | High | REPORT-06 | S14 |
| F40 | **Audit Logs**: Exact user/time filters, clear, newest-first all matching rows; business/security audit inspection | ADMIN | Reports → Audit Logs | AuditService, audit_logs and transactional writers | Implemented | Mixed | Critical | REPORT-07–08; OPS-03 | S15 |
| F41 | **Announcements**: Validated publish, management history, mandatory recipient modal and acknowledgment | HR/ADMIN publish; STAFF/SUPERVISOR/HEAD modal | Reports → Create Announcement; login modal | hr_announcements, announcement_views, popup controller | Implemented; insert/audit not atomic | Accounts needed | High | NOTIFY-01–02 | S16 |
| F42 | **Inbox**: All-role announcements, assigned/reviewed forms, scoped incident events, type/status filters, refresh, seen marking and links | All within scope | Inbox | InboxService, scopes, recipient/owner filters | Implemented; per-query 500 item caps | Yes | High | NOTIFY-03–04,07 | S16 |
| F43 | **Badges / popups / polling**: Unseen vs unresolved counts, 99+ cap, group dots, recipient decision/request popups, daily NTE reminder | All within scope | Sidebar / login or periodic modal / Track | InboxService, workflow queries, TaskUI, timers | Implemented | Yes | High | NOTIFY-05–07; INC-17,33 | S16 |
| F44 | **Incident filing / grouping**: Reported and concerned selectors, five involved/five witnesses, facts, files, File Another/Remove, one group/separate IRs | SUPERVISOR/HEAD; Head HR; assigned ADMIN | Incident Management → File | WorkflowReports, employee/account lookup, sequences | Implemented | Yes + active accounts | Critical | INC-01–04 | S17 |
| F45 | **Incident routing / conflict rules**: Filer department route; Heads shared queue for HEAD/ADMIN subjects and own-department HEAD filings; no involved reviewer | Eligible filer / configured reviewers | File / Review / Take HEAD Review Task | WorkflowAccess/Reports, department mapping | Implemented | Yes | Critical | INC-05–07 | S17 |
| F46 | **HEAD review / NTE**: Request filer evidence/wait, NTE draft/issuance with issuer signature, close-for-documentation reason | Assigned HEAD or assigned ADMIN HEAD | Review → View → Track | WorkflowActions, signed document snapshots/evidence | Implemented | Yes | Critical | INC-08–11 | S18 |
| F47 | **Employee NTE response**: Issue-started deadline, immediate draft/explanation signature/files and combined receipt/submission, hearing request, extension request/review/reminders/overdue | Reported employee; uninvolved HR reviews extension | Track / Inbox / popup | WorkflowActions/Queries, versioned documents, reminders job | Implemented | Yes | Critical | INC-12–17 | S18 |
| F48 | **HR evaluation and investigation**: Take Task, involved-recipient requests/waits, hearing schedule/complete, findings/indicators/severity/matrix recommendation and drafts | Uninvolved owning HR | Review → Track | TaskService, WorkflowActions, Conduct, private requests | Implemented | Yes | Critical | INC-18–22 | S18 |
| F49 | **Management and final action**: Eligible approver, send/pause, approve/return, revise/new approval, final issue/version/count gate, close with reason | Designated ADMIN; HR owner | Track / Management Inbox | Versioned assessment, snapshots, discipline history, task locks | Implemented | Yes | Critical | INC-23–28 | S18 |
| F50 | **Track / Review / History**: Keyboard case selector, role categories/counters/search, sibling switch, shared circles, polling/dirty protection, archived filters and read-only view | Case-authorized roles; History STAFF/SUPERVISOR | Incident Management pages | WorkflowQueries/Reports, Tracking, browser controllers | Implemented | Yes | High | INC-29–30,33–34 | S19 |
| F51 | **Incident confidentiality / evidence**: Section-redacted JSON/documents, recipient files, attachment validation/private download, direct-ID protection | Case/section/request-authorized accounts | Track / View Document / file links | WorkflowAccess/Reports, Validation, AttachmentResponse | Implemented; real deployment must verify | Yes | Critical | INC-10,31–32,35; SEC-04 | S20 |
| F52 | **Legacy incident reading**: Original documents/signatures/outcomes/policy retained; no replacement workflow processing | Authorized legacy participants/assigned HEAD; internal HR | Track / History / Review Closed | IncidentService, legacy renderers/tables and facade dispatch | Read-only compatibility | Existing QA legacy fixture | Critical | INC-30–31,35; OPS-01 | S20 |
| F53 | **COC matrix / history**: All-role matrix read; HR row add/remove/save; finalized own history; HR/ADMIN employee history search | All read own; HR edit; HR/ADMIN search | Incident Management → Code of Conduct | Conduct, Archive, issued substantiated decisions | Implemented | Yes for history | Critical | COC-01–05 | S21 |
| F54 | **Task ownership / transfer**: HR-only claim; ADMIN eligible assignment/reason/history; owner check; visible-tab revision refresh | HR processing; ADMIN scoped oversight | Form row / Track / ADMIN Dashboard | TaskService, TaskUI, unique task key/events/revision | Implemented | Yes | Critical | TASK-01–03,05 | S22 |
| F55 | **HR timer / performance**: Server working-time earnings, waits/transfers/completion, cards/six charts/reviewer table/tasks/history/assignment records and filters | ADMIN analytics; HR own timer | ADMIN Dashboard / form row / Track | PerformanceService, WorkTime, persisted task events | Implemented; no duration targets | Yes | High | TASK-04–10 | S22 |
| F56 | **Server/API security**: Current-role permissions, input allowlists, malformed/unknown methods, session/cookie/CORS boundaries | All; operator verifies hosting | RPC / login / downloads / private URLs | Auth, Permissions, Express, Apache | Implemented controls with gaps below | Mixed | Critical | SEC-01–08; AUTH-03–10 | S23 |
| F57 | **Background / startup compatibility**: Initializer/migrations, defaults, regularization hourly, overdue every 15 minutes, task seeding/archive/Admin release | Operator; HR observes browser effects | API startup / jobs | database.js, IncidentWorkflowSchema, TaskSchema, services | Implemented; not read-only startup | QA restored data | Critical | LEAVE-10; INC-17; OPS-01,03–05 | S24 |
| F58 | **Operational readiness**: Backup/restore, failure recovery, remote/HTTPS feasibility, dependency outages and real-MySQL contention | Operator with QA tester | External operations plus browser verification | Deployment environment, provider and database | Environment unconfirmed; no backup UI | QA fixtures | Critical | OPS-01–05; SEC-06–07 | S24 |
| F59 | **Cross-module lifecycle**: Registration→access→form; paid leave transfer; full/no-violation incident; organization changes; browser smoke | All actors as specified | Connected pages | All implemented modules above | Implemented paths; unexecuted manually | Yes | Critical | E2E-01–07 | S25 |

| F60 | **Organization choices**: Add company/location/department immediately; fresh employee selectors/import validation use saved choices | ADMIN | Manage Accounts → Accounts → Organization Settings | lookup_values, addEmployeeLookupValue, audit | Implemented; separate from Save Changes | Yes | High | ACC-12; IMP-05 | S05/S06 |
| F61 | **Attendance links**: HR search/confirm/correct scanner-to-employee mapping; duplicate-name blocking, changed-name/stale-save guards | HR/ADMIN with employee-write confirmation; personal employee reads | Attendance → Link employee; existing personal Daily Attendance | AttendanceIdentityService, link table, shared search/confirmation/audit | Implemented; daily-identity and historical-scope limits below | Yes + scanner | Critical | ATT-11–14; E2E-07 | S10/S13 |

## 6. Implementation limits and deployment questions

These are source observations to carry into testing, not runtime findings or authorization to change code/configuration.

| Area | Source-confirmed behavior / uncertainty | Manual consequence |
| --- | --- | --- |
| Remote API and transport | Browser defaults to `http://localhost:3001/api`; API binds `127.0.0.1`; session cookie has `secure:false`; default Express session store is memory. Actual proxy/TLS/base override setup was not inspected. | SEC-06 is a deployment gate. A second computer's localhost is that computer, not the server. Verify intended URL, transport, cookies and restart session loss in deployment-like QA. |
| Authentication hardening | No application login rate limiter/lockout, explicit CSRF-token mechanism, forgotten-password flow or general session-revocation control is registered in the inspected server. Password change does not invalidate other sessions; same-password prevention is browser-only. | AUTH-10 / SEC-07 require a documented organizational/perimeter decision. Do not claim these controls passed because valid login works. |
| Offboarding and provisioning | Employment status does not revoke login. Existing employee Edit supports role/reviewer/password access changes and first access for imported employees: HR creates pending requests, ADMIN applies immediately. Only ADMIN can grant ADMIN. No general disable/delete-account UI exists. | EMP-13 / ACC-10–11 / E2E-07 verify the authorized account path without duplicate employee registration. Record a usable offboarding procedure; status change alone does not revoke access. |
| Email integrity | Cooperating writers use a five-second acquisition MySQL named lock. There is no DB unique constraint for normalized Primary Email; direct SQL/old writers bypass it. | Verify actual lock behavior, deployed collation and all writer versions; do not create conflicting records in production. Existing ambiguity blocks ordinary login rather than auto-repairing it. |
| Assignment changes | Ordinary STAFF/SUPERVISOR reviewer and incident assignments are stored on existing requests/cases. Head HR transfer is explicitly implemented; general department/account changes do not promise retroactive pending reassignment. Configuration defaults seed at startup only under their stored condition. | ACC-09 / E2E-05: compare old/new items and identify stranded pending work; test seeded defaults on disposable first install, not by resetting live settings. |
| Incident departments | Active lookup, nonarchived employee and saved-mapping departments appear dynamically; missing/involved reviewers block filing. HR allows designated Head HR; Heads slots and Management need ADMIN. | ACC-07–09/12 verify the actual department list and eligible assignments. Do not add an unapproved fallback or confuse HR department incident assignment with HR form routing. |
| Attachments | Allowlist is MIME/type and size based, with no inspected malware scanning/content authenticity service. Per action ten files, 8 MiB each, 18 MiB decoded total; filing-session combined cap 18 MiB. Express JSON cap is 25 MB, including base64 overhead. | INC-32 verifies practical wire-size limit and rejected-file rollback; near-18 MiB payload can exceed JSON limit. Do not promise virus-free files or exact decoded limit acceptance without real HTTP verification. |
| Import | First worksheet; generated fields unwritable, no JSON/docs-file import. Number/FTE/Primary Email are optional; sole hyphen becomes empty. Nonblank number/Primary Email deduplicate; both-blank rows lack a repeat-import identity key. Preview is not a reservation; independent 300-row chunks, first 50 row errors plus total. | IMP-01–09 run on QA files. Preserve source-to-generated-ID reconciliation; never rerun the completed real workbook as a test or assume whole-file rollback. |
| Attendance | One-minute provider cache; existing inference/card. Unique normalized names auto-match despite different HRIS numbers; HR/Admin with employee-write can confirm ambiguous/unmatched links. Current provider-namespace/scanner-ID/name mapping is persisted and audited, not effective-dated. Name/archived-target changes withhold a link. | ATT-11–14 cover actual times, confirmation/correction/races and privacy. Ambiguity is evaluated over returned daily identities, not a complete scanner enrollment directory. Reassignment can change historical matching-name reads; verify before operational correction. No scan means no fabricated attendance or absence. |
| Lists and caps | Master list, HR Reports, Audit, incident History and COC history UIs request all rows. Attendance renders all returned rows with fixed ordering. Inbox/management queries cap at 500; Track selector offers first 50 matching options; provider row retrieval has 10,000-row safety limits. | Measure realistic browser load; do not test nonexistent UI pagination. API pagination helpers are tested separately by automation; UI paging claims in older Attendance guide are stale. |
| Financial/business scope | ATD, travel, overtime, daily time and property templates record/approve documents. No inspected payroll posting, scanner correction, booking or inventory engine is connected. No general form cancellation, withdrawal or approved-record editing workflow. | Expected outcomes stop at saved requests/approvals; do not count missing downstream external writes as a regression in an unimplemented feature. |
| Leave/timing | SL/VL yearly allowance only; SIL is form text. No carryover, leave public-holiday calendar or automatic working-day duration calculation. Task working clock counts full weekdays including lunch/holidays. | Distinguish leave calendar days, NTE calendar deadline and HR work-time clock. Operator supplies cross-year/regularization fixtures. |
| Analytics accuracy | Current employment status is used for historical population; prior-year headcount derives from hire dates, not separation dates. Executive movement/absence/manpower/disciplinary panels are explicit placeholders. | Do not certify historical separation or future-module analytics. Dashboard observation wording is not evidence those data exist. |
| Announcement auditing | Announcement insert and audit write are separate pool operations, unlike the transactional configuration/matrix/leave/incident paths. | An audit failure may leave a published announcement despite error; inspect before retrying to avoid duplicate announcements. |
| Startup writes | Initializer includes compatibility role/status changes, obsolete employee-column removal, obsolete performance-settings removal, workflow/task initialization and default seeding; startup also releases ADMIN-owned open HR tasks and processes regularization/overdue notices. | No server startup was performed for this investigation. A production restart/migration needs backup, compatibility review and separate operator approval; OPS checks run on restored QA copy. |
| Legacy/inactive code | Historical incident renderers and tables remain for read access. Retired facade mutation methods return 409; they are not current features. Old COC publish/version edit workflow is not exposed; direct matrix save is current. | Retain/read history and test denial; do not execute legacy signature-first/investigation/evaluation write instructions from old audit notes. |
| Docs drift | Older overview text may omit Company Property Accountability, mention attendance paging, or describe HR waiting tasks before explanation. Original plan text also predates the current import/account/search/name-link behavior. | Follow current named controls and cases: seven templates, no attendance paging, HR incident tasks only after explanation, current actor-specific account saves and attendance links. Treat the old 221-test baseline as historical, not a current manual result. |
| Not confirmed / absent | Live deployment topology, actual MySQL schema/collation/record state, real scanner product/permissions, backup operations and supported browser policy are unconfirmed. No connected email/SMS sender, recruitment, payroll run, shift scheduler or restore-employee UI found in registered product paths. | Mark relevant checks Blocked pending evidence; do not infer common HRIS capabilities. Notifications here mean in-app Inbox/popups. |

### Actual report choices and Review filters

| Report ID | Browser label |
| --- | --- |
| `master` | Employee Master List |
| `active` | Active Employee Listing |
| `inactive` | Inactive Employee Listing |
| `hc_company` | Headcount By Company |
| `hc_department` | Headcount By Department |
| `hc_location` | Headcount By Work Location |
| `demographics` | Employee Demographics |
| `tenure` | Employee Tenure Report |
| `rank` | Employee Rank Report |
| `education` | Employee Education Level Report |
| `hmo` | Employee HMO Enrollment Report |
| `gov_complete` | Government Information Completeness |
| `quality` | Employee Data Quality Report |
| `directory` | Employee Directory |

| Incident Review role | Actual filter choices |
| --- | --- |
| HEAD | All, For Review, NTE Issued, Closed |
| HR | All, NTE Issued, For Review, Closed |
| ADMIN | All, IR Filed, NTE Issued, Closed |

## 7. Data relationships and integrity evidence

Database structures were inspected in source only. Most business relationships are application-managed; do not assume undeclared foreign keys prevent orphaning. Read-only inspection must use synthetic IDs from the run manifest and the exact deployed schema.

| Relationship | Keys / constraints seen in source | What the tester/operator reconciles |
| --- | --- | --- |
| Central employee → account | employees.record_id PK; unique emp_no and seq_no; user_roles.email PK; normalized Primary Email lookup must find exactly one nonarchived employee, except flagged setup ADMIN | Identity and role stay distinct; archive blocks ordinary linked authentication without deleting history. |
| Employee save → account access | HR uses account_requests; ADMIN applies immediately. user_roles has assigned_head_email / secondary_head_email / is_hr_head; transactional save/approval and identity lock | Same employee record, correct actor-specific approval, either stored reviewer, imported-record provisioning, no plaintext credentials. |
| Form → owner / reviewer / serial | user_forms.user_email / head_reviewer_email / secondary_head_reviewer_email; unique control_no; form_serial_sequences key template/year | One saved row/reference; stored applicant/signature preserved; stage and terminal status consistent. |
| Leave → employee/year/type/form | leave_accounts composite employee/year/type PK; leave_transactions unique form/year/type/transaction_type | One grant, one applicable deduction; correct separate years/types; no overdraw or partial failed approval. |
| Current incident → group / sections | incident_reports workflow_version/group_id; incident_workflows incident key, JSON sections, phase/revision; incident_groups | One IR number per submitted report card, shared by its concerned/reported/involved/witness accounts. Only File Another adds another card/number within the group; participant selection does not. A later new filing gets a new IR number. Group writes remain atomic. |
| Incident → subject / participants / files | incident_case_subjects unique incident/email; participants employee IDs; evidence incident/request/section pointers | No identity substitution; only intended participants; request files attached to correct section/recipient. |
| Incident → approval / history | versioned workflow documents; management reviewVersion; evaluations/decisions/history subject-scoped uniqueness; legacy rows retained | Issued approval matches assessment version and finalized offense count; no duplicate discipline, no-violation excluded, old policy snapshot preserved. |
| Notification → recipient / state | incident_notifications unique incident/recipient/type; announcement_views account/announcement; inbox_views recipient/type/item; daily workflow reminder incident/employee/date | Actor excluded; seen state scoped; no duplicate reminders; reading never changes business resolution. |
| Review ownership → events | hr_tasks unique resource_type/resource_id/phase; hr_task_events references task by foreign key; revision singleton | Single claim, real MySQL race protection, retained earned time, pause/resume/transfer history and stale-owner denial. |
| Sensitive actions → audit | audit_logs actor/action/record/detail; transactional writer supplied on related sensitive saves | Correct actor and timestamps; success audit commits/rolls back with relevant business write; no copied secrets/policy/file bodies. |
| Attendance → provider / employee link | Punches read/inferred/cached, not persisted. attendance_employee_links PK provider_account/scanner_no, employee FK, normalized scanner name and confirming actor/time | No scanner writes; provider namespaces separate, auto-name uniqueness and stored confirmation take precedence correctly. Link + ATTENDANCE_EMPLOYEE_LINK audit commit/roll back together; personal selection stays session-bound. |

## 8. Source evidence and automated coverage

Evidence keys below point to repository files used to trace implementation. Companion views/controllers/services and the loader were inspected together; older CodebaseAudit notes were treated as history, not current workflow specification. The structural checker enumerated all first-party JavaScript, browser assets, relative module paths and static HTML IDs; this is not a claim that every CSS declaration or dependency line received a security audit.

| Key | UI / contract evidence | Server / rule / schema evidence |
| --- | --- | --- |
| S01 | [index.html](../public/index.html), [ui-loader.js](../public/js/ui-loader.js) | [.htaccess](../.htaccess), [Check.js](../scripts/Check.js) |
| S02 | [Main.js](../public/js/Main.js), [incident Navigation.js](../public/js/incident-management/Navigation.js) | [Permissions.js](../server/config/Permissions.js), [Auth.js](../server/middleware/Auth.js) |
| S03 | [UI.js](../public/js/UI.js), [EmployeeSearch.js](../public/js/EmployeeSearch.js), [SignaturePad.js](../public/js/SignaturePad.js), [AppConfirm.js](../public/js/AppConfirm.js), [OutsideDismiss.js](../public/js/OutsideDismiss.js), [DateTimeInputs.js](../public/js/DateTimeInputs.js), [Styles.css](../public/css/Styles.css), [Theme.css](../public/css/Theme.css) | [RequiredFields.js](../public/js/RequiredFields.js), [Feedback.js](../public/js/Feedback.js), [Loading.js](../public/js/Loading.js), [DateUtils.js](../shared/DateUtils.js), [SharedControls.md](SharedControls.md) |
| S04 | [Main.js login/session](../public/js/Main.js) | [server.js login/session](../server/server.js), [Auth.js](../server/middleware/Auth.js), [EmployeeIdentity.js](../server/utils/EmployeeIdentity.js), [Password.js](../server/utils/Password.js), [create-user.js](../scripts/create-user.js) |
| S05 | [Accounts.html](../public/views/Accounts.html), [Accounts.js](../public/js/Accounts.js), [AccountSettings.js](../public/js/AccountSettings.js) | [AccountService.js](../server/services/AccountService.js), [FormReviewScope.js](../server/services/FormReviewScope.js) |
| S06 | [Employees.html](../public/views/Employees.html), [Employees.js](../public/js/Employees.js) | [EmployeeService.js](../server/services/EmployeeService.js), [EmployeeSchema.js](../server/config/EmployeeSchema.js), [Validation.js](../server/utils/Validation.js), [EmployeeData.js](../server/utils/EmployeeData.js) |
| S07 | [EmployeeEmailIntegrity.md](EmployeeEmailIntegrity.md) | [EmployeeEmailService.js](../server/services/EmployeeEmailService.js), [EmployeeIdentityLock.js](../server/utils/EmployeeIdentityLock.js) |
| S08 | [Employees.js import mapping/chunks](../public/js/Employees.js) | [ImportService.js](../server/services/ImportService.js), [database.js counters](../server/db/database.js) |
| S09 | [Assignments.js](../public/js/incident-management/Assignments.js), [Accounts.js](../public/js/Accounts.js) | [WorkflowConfiguration.js](../server/services/incident-management/WorkflowConfiguration.js), [IncidentWorkflowSchema.js defaults](../server/db/IncidentWorkflowSchema.js) |
| S10 | [EmployeeDashboard.html](../public/views/EmployeeDashboard.html), [EmployeeDashboard.js](../public/js/EmployeeDashboard.js) | [EmployeeService.js self profile](../server/services/EmployeeService.js), [AttendanceService.js self attendance](../server/services/AttendanceService.js), [AttendanceIdentityService.js](../server/services/AttendanceIdentityService.js) |
| S11 | [UserDashboard.html](../public/views/UserDashboard.html), [UserDashboard.js](../public/js/UserDashboard.js) | [FormTemplates.js](../shared/FormTemplates.js), [FormStatus.js](../shared/FormStatus.js), [FormValidation.js](../shared/FormValidation.js), [FormService.js](../server/services/FormService.js) |
| S12 | [UserDashboard.js leave/HR fields](../public/js/UserDashboard.js) | [LeaveService.js](../server/services/LeaveService.js), [RegularizationService.js](../server/services/RegularizationService.js) |
| S13 | [Attendance.html](../public/views/Attendance.html), [Attendance.js](../public/js/Attendance.js), [AttendanceUI.js](../public/js/AttendanceUI.js), [Attendance.md](Attendance.md) | [AttendanceService.js](../server/services/AttendanceService.js), [AttendanceRules.js](../server/services/AttendanceRules.js), [HikConnectClient.js](../server/integrations/HikConnectClient.js), [HikConnectAccounts.js](../server/integrations/HikConnectAccounts.js), [AttendanceIdentityService.js](../server/services/AttendanceIdentityService.js), [database.js links](../server/db/database.js) |
| S14 | [Dashboard.html](../public/views/Dashboard.html), [Reports.html](../public/views/Reports.html), [Main.js charts](../public/js/Main.js), [Reports.js](../public/js/Reports.js) | [DashboardService.js](../server/services/DashboardService.js), [ReportService.js](../server/services/ReportService.js), [EmployeeFilters.js](../server/utils/EmployeeFilters.js), [Pagination.js](../server/utils/Pagination.js) |
| S15 | [Reports.js audit controls](../public/js/Reports.js) | [AuditService.js](../server/services/AuditService.js) |
| S16 | [Reports.js Inbox/announcement](../public/js/Reports.js), [UserDashboard.js popup](../public/js/UserDashboard.js), [Main.js badges](../public/js/Main.js) | [AnnouncementService.js](../server/services/AnnouncementService.js), [InboxService.js](../server/services/InboxService.js), [Notifications.js](../server/services/incident-management/Notifications.js), [WorkflowQueries.js](../server/services/incident-management/WorkflowQueries.js) |
| S17 | [Workflow.js filing](../public/js/incident-management/Workflow.js), [IncidentManagement.html](../public/views/incident-management/IncidentManagement.html) | [WorkflowReports.js](../server/services/incident-management/WorkflowReports.js), [WorkflowAccess.js](../server/services/incident-management/WorkflowAccess.js) |
| S18 | [Workflow.js section actions](../public/js/incident-management/Workflow.js), [IncidentWorkflow.js](../shared/IncidentWorkflow.js) | [IncidentWorkflowService.js facade/actions](../server/services/IncidentWorkflowService.js), [WorkflowActions.js](../server/services/incident-management/WorkflowActions.js), [WorkflowQueries.js jobs](../server/services/incident-management/WorkflowQueries.js) |
| S19 | [Track.js](../public/js/incident-management/Track.js), [Review.js](../public/js/incident-management/Review.js), [History.js](../public/js/incident-management/History.js), [Progress.js](../public/js/incident-management/Progress.js), [Timeline.js](../public/js/incident-management/Timeline.js) | [WorkflowQueries.js](../server/services/incident-management/WorkflowQueries.js), [Tracking.js](../server/services/incident-management/Tracking.js), [Review.js rules](../server/services/incident-management/Review.js) |
| S20 | [Documents.js](../public/js/incident-management/Documents.js), [IncidentManagement.js legacy dispatch](../public/js/incident-management/IncidentManagement.js), [Notice.js](../public/js/incident-management/Notice.js), [Evaluation.js](../public/js/incident-management/Evaluation.js), [Investigation.js](../public/js/incident-management/Investigation.js) | [IncidentService.js](../server/services/IncidentService.js), [WorkflowReports.js redaction/evidence](../server/services/incident-management/WorkflowReports.js), [Validation.js evidence](../server/services/incident-management/Validation.js), [AttachmentResponse.js](../server/utils/AttachmentResponse.js) |
| S21 | [CodeOfConduct.js](../public/js/incident-management/CodeOfConduct.js) | [Conduct.js](../server/services/incident-management/Conduct.js), [Archive.js](../server/services/incident-management/Archive.js), [PolicyDefaults.js](../server/services/incident-management/PolicyDefaults.js) |
| S22 | [TaskUI.js](../public/js/TaskUI.js), [HrPerformance.html](../public/views/HrPerformance.html), [HrPerformance.js](../public/js/HrPerformance.js) | [TaskService.js](../server/services/TaskService.js), [PerformanceService.js](../server/services/PerformanceService.js), [WorkTime.js](../shared/WorkTime.js), [TaskSchema.js](../server/db/TaskSchema.js) |
| S23 | [.htaccess](../.htaccess), [Main.js API base](../public/js/Main.js) | [server.js API registry/CORS/session](../server/server.js), [Auth.js](../server/middleware/Auth.js), [Permissions.js](../server/config/Permissions.js) |
| S24 | [README.md setup/maintenance](../README.md), [package.json commands](../package.json), [Setup.js](../scripts/Setup.js), [SampleData.js](../scripts/SampleData.js) | [database.js](../server/db/database.js), [IncidentWorkflowSchema.js](../server/db/IncidentWorkflowSchema.js), [TaskSchema.js](../server/db/TaskSchema.js), [server.js startup jobs](../server/server.js) |
| S25 | [UserGuide.md](UserGuide.md), [README.md](../README.md), all connected UI groups above | [RegressionCoverage.md](RegressionCoverage.md), connected services/schema above |

### Historical automated evidence; not a current full-suite certification

| Check | Historical result on 11/13/2026 | What it establishes / does not |
| --- | --- | --- |
| `npm.cmd run check` | Passed: 113 JavaScript files, browser assets, module paths and static HTML IDs. | Source structure only; no HTTP authorization, rendering, MySQL or hardware proof. |
| Registered regression test file set from `package.json`, run with Node test runner | **221 passed, 0 failed, 0 skipped**, approximately 6.23 seconds runner time. | All registered files were run. A temporary Node preload outside the repo replaced unmocked MySQL pool methods and global fetch with throwing guards. No actual DB/network access was required; tests used their own synthetic connections/fetch implementations. No production modules/tests were edited. |
| Documentation checks | Case IDs/counts, required fields, inventory/source references, local file links, result defaults and whitespace checked after writing. | Documentation consistency only; results CSV remains entirely Not Tested. |
| Live/browser/operator verification | Not run. | No app-server startup, schema initialization, setup/create-user/sample-data command, real provider request, employee entry, UI mutation or manual scenario was executed. |

The 221-pass result above belongs to the original 11/13 investigation and predates later employee/account/attendance changes. It is not today's reproduced baseline. Earlier implementation work reported 53 Attendance and two shared browser-control checks, plus focused synthetic identity/UI checks; those are not a full regression or manual sign-off. No application test suite or live workflow was rerun for this documentation-only update. Existing automated tests may still contain superseded expectations; log the requirement and failure separately rather than editing assertions to manufacture a Pass.

| Test file(s) | Existing automated evidence | Manual gap addressed |
| --- | --- | --- |
| [Test.js](../tests/Test.js) | Forms/status labels/routing/validation/signatures/serials; passwords; basic schema/announcement/audit rules | Real DOM/printing, native validation, full account/role/browser lifecycle. |
| [Authorization](../tests/Authorization.test.js), [EmployeeEmailIntegrity](../tests/EmployeeEmailIntegrity.test.js) | Role-only grants, identity, named-lock simulation, duplicates/chunks/rollback/CLI exception | Real MySQL locks/collation, actual cookies, archived sessions and concurrent HTTP writers. |
| [HeadHrTransfer](../tests/HeadHrTransfer.test.js), [LeaveAccounting](../tests/LeaveAccounting.test.js) | Transfer/task identity and ledger/approval/rollback paths | Real signature input, actual concurrent approval/overdraw, year rollover and job observation. |
| [ConfigurationIntegrity](../tests/ConfigurationIntegrity.test.js) | Matrix/configuration transaction auditing and synthetic sample validation | Actual atomic MySQL changes, usable reviewer maps and audit visibility. |
| [IncidentSecurity](../tests/IncidentSecurity.test.js), [IncidentReview](../tests/IncidentReview.test.js), [IncidentTracking](../tests/IncidentTracking.test.js), [LegacyIncidentConfidentiality](../tests/LegacyIncidentConfidentiality.test.js) | Current workflow facade, access/snapshots/version/count gates, requests/waits, notifications and legacy confidentiality | SQL predicate execution, raw payload/download/print leaks, real actors/races and complete browser lifecycle. |
| [Attendance](../tests/Attendance.test.js) | Inference/status boundaries, account separation, mocked provider behavior/host limits | Actual provider product, credentials/region, device name matching, real scans and time zones. |
| [BrowserWorkflow](../tests/BrowserWorkflow.test.js), [CleanupRegression](../tests/CleanupRegression.test.js), [SharedUtilities](../tests/SharedUtilities.test.js) | Minimal-DOM controllers/lifecycles, formatting, helpers/WorkTime and attachment headers | Real rendering/focus/touch/signature, scrolling/responsive stacking, cross-browser dialogs and deployed Apache headers. |

No dedicated end-to-end real-browser or live-MySQL suite is registered. PerformanceService/task behavior has partial indirect service/controller coverage, not a measured operational accuracy/performance certification. Record actual observed page timings and data sizes during large-list tests; no speed improvement is claimed.

## 9. Sign-off record

| Field | To complete after execution |
| --- | --- |
| Exact commit / QA URL / database alias | ____________________ |
| Tester / HR workflow owner / operator / decision-maker | ____________________ |
| Execution dates / browsers / screen sizes / provider accounts tested | ____________________ |
| Pass / Fail / Blocked / Not Tested; per-variant exceptions | ____________________ |
| Critical / High unresolved defects and disposition | ____________________ |
| Backup/restore and deployment gate evidence | ____________________ |
| Approved deployment decision and date | ____________________ |

## 10. API-to-test traceability

All **91 registered RPC method names** in `server/server.js` are accounted for below. This names the implemented surface and compatibility stubs; it does not claim 91 separately executed HTTP tests. Browser-first cases use the corresponding method through the UI; Security cases replay the same captured payload as another actor. `searchFormEmployees` and `assignAccountHead` are retained service/compatibility helpers, not proof of extra visible pages.

| Registered group | Exact RPC names | Planned case family |
| --- | --- | --- |
| Session / identity | `getSession` | AUTH-01–07 |
| Employee metadata / records | `getFilterOptions`, `getMyEmployeeProfile`, `listEmployees`, `getEmployee`, `getFormOptions`, `getFormMeta`, `saveEmployee`, `archiveEmployee`, `importEmployees` | EMP / IMP / SELF; SEC-01 |
| Attendance | `getAttendanceContext`, `listAttendance`, `getMyDailyAttendance`, `getAttendanceIdentity`, `confirmAttendanceIdentity` | ATT-01–14 / SELF; E2E-07 |
| Workforce reports / audit | `getDashboard`, `getExecutiveSummary`, `listReports`, `runReport`, `exportReportCsv`, `getAuditLogs` | REPORT; SEC-01 |
| Announcements / Inbox | `createAnnouncement`, `listAnnouncementsForManagement`, `listUnseenAnnouncements`, `markAnnouncementsSeen`, `getInbox`, `getInboxNotificationCount`, `markInboxSeen` | NOTIFY |
| Accounts | `listAssignableHeads`, `getAccountManagement`, `getAccountRequestCount`, `addEmployeeLookupValue`, `assignAccountHead`, `saveAccountChanges`, `approveAccountRequest`, `rejectAccountRequest`, `changeMyPassword` | ACC / AUTH-08–10 |
| Forms / leave | `listMyForms`, `getMyLeaveBalances`, `getReviewLeaveBalances`, `searchFormEmployees`, `submitLeaveForm`, `submitUserForm`, `updateMyForm`, `listFormsForReview`, `getFormReviewSummary`, `reviewUserForm` | FORM / LEAVE |
| Task ownership / performance | `takeReviewTask`, `reassignReviewTask`, `getReviewTaskRevision`, `getReviewTaskAssignees`, `getHrPerformance`, `getPerformanceForm`, `getReviewTaskHistory` | TASK |
| Current incident commands / configuration | `getIncidentFileContext`, `getIncidentWorkflowConfiguration`, `saveIncidentWorkflowConfiguration`, `submitIncidentGroup`, `incidentWorkflowAction`, `getIncidentCorrectiveAction`, `searchIncidentEmployees` | ACC-07–09; INC-01–28 |
| Incident reads / history / matrix | `listIncidentsForTrack`, `getIncidentTrackingVersion`, `listIncidentsForHistory`, `listIncidentViolations`, `getIncidentCodeGuide`, `saveIncidentMatrix`, `listIncidentsForReview`, `getIncidentReviewDashboard`, `getIncidentCase` | INC-29–35; COC |
| Incident notification reads / seen / reminders | `listDailyNteReminders`, `getIncidentBadgeCounts`, `listPendingIncidentNotifications`, `markIncidentNotificationSeen` | NOTIFY-05–07; INC-17 |
| Retired incident mutations and retired request context (all return 409) | `submitIncidentReport`, `signIncidentCase`, `transitionIncident`, `saveIncidentNteDraft`, `issueIncidentNte`, `saveIncidentExplanationDraft`, `submitIncidentExplanation`, `startIncidentEvaluation`, `saveIncidentEvaluation`, `issueIncidentDecision`, `closeIncidentDecision`, `submitIncidentExplanationAddendum`, `listIncidentRequestRecipients`, `requestIncidentInformation`, `requestIncidentInformationBatch`, `addIncidentInvestigationNote`, `respondToIncidentInformation` | INC-30,35; legacy read-only regression |

Current `incidentWorkflowAction` action keys are `TAKE_HEAD`, `SAVE_NTE`, `ISSUE_NTE`, `ACKNOWLEDGE`, `SAVE_EXPLANATION`, `SUBMIT_EXPLANATION`, `REQUEST_INFORMATION`, `RESPOND`, `REQUEST_EXTENSION`, `REVIEW_EXTENSION`, `HEARING`, `SAVE_REVIEW`, `SEND_APPROVAL`, `MANAGEMENT`, `ISSUE_DECISION`, `REVISE_REVIEW`, `CLOSE`. Use these current action keys via captured payloads; similarly named retired RPCs are not substitutes.

Non-RPC routes: `POST /api/login`, `POST /api/logout`, and five `GET /api/incidents/{evidence|nte-evidence|explanation-evidence|explanation-draft-evidence|explanation-addendum-evidence}/:evidenceId` routes. The generic evidence route serves current/authorized legacy IR files; specialized routes retain legacy document access checks. AUTH and SEC/INC attachment cases cover these routes.

**Immediate next action (under two minutes):** open the results CSV, enter your tester name beside BOOT-01, and filter Execution scope for Live observation / QA variants. Start the imported-data observations above; do not mark a whole mixed case Pass for only its live subset.


