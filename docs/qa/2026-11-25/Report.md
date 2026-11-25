# Manual QA execution — 11/25/2026

**Overall verdict: REQUEST REVISION. Testing paused at the user's request (10% daily usage remaining). Application fixes require separate approval.**

The [results CSV](../../FinalPreDeploymentManualTestResults.csv) is the case-level record. At the latest saved checkpoint: **108 Pass, 6 Fail, 1 Blocked, 75 Not Tested** across 190 cases. Not Tested includes partially executed cases; it does not mean every variant was untouched. Partial executions remain Not Tested or Blocked. A demonstrated defect makes its case Fail even if other variants remain unfinished. [Observations](observations.json) contain sanitized per-variant observations, distinguishing real browser actions, live API requests and SQL checks. Counts are checkpoints, not completion percentages.

## Paused checkpoint ? resume after the next reset

**Finished: 114/190 cases (108 passed, 6 failed).** Remaining partial/deferred cases are excluded. Six previously confirmed defects remain open; one additional attachment failure is untriaged. No application fixes were made. Netlify work remains cancelled.

The consolidated priority batch finished real seven-template HR browser approvals, invalid routing/configuration/conflict checks, a two-ADMIN Heads-pool race, Head HR conflict routing, actual NTE draft/issuance, extension outcomes, HR assessment with known prior offenses, hearing/Management pause checks, private notification links, incident closure, dual-profile paid approval and claim races, five-role reviewer searches/staged saves, current employee headers/schema, permission replays, Unicode/formula-safe UI/export checks, imported-account provisioning and an actual employee-to-final-correction approval journey. Exact case statuses and limits are in the CSV; partial cases were not promoted merely to increase the count.

**Resume first:** investigate **QA-20261125-07 (untriaged)**. On the existing synthetic attachment-boundary case, ten valid PDF/PNG/text/XLSX/WAV files saved and downloaded byte-exact; the following allowed-size 8 MiB text-file `SAVE_NTE` returned HTTP 500. Stop occurred before diagnosing the cause, checking resulting storage state or reproducing. The 18 MiB grouped upload checks were **not reached**. This may be an application or environment limit; do not treat the cause or rollback as established.

The private checkpoint identifies the case as `finalBatchIncidents.ten[1]` and the stopped script as `all-priority-attachment-boundaries.cjs`. Start with read-only inspection; do not rerun the whole script or recreate its successful ten files. All currently launched batch scripts have ended. Temporary credential/session state and test fixtures remain local; no credentials are published here.

Resume using the results CSV plus private `testingCheckpoint`/`caseResults`, not the older batch scripts. Those scripts often contain completed mutations and some corrected harness assumptions; repeat only the missing operation. Keep scanner/clock/remote-browser prerequisites explicit. Only Critical/High cases are in scope; no fixes until user approval. No further tests or database checks were run while saving this pause checkpoint.

## Independent assessment

Execution uses installed Chrome through its DevTools protocol, the running Apache/Express application and real MariaDB `hr_dashboard_test`. No mocked application responses or database were used for these observations. Original `hr_dashboard` checksums were captured before execution; all 54 table checksums matched again after the session-security batch. A fresh private backup preserves the test database's starting state, including the user's existing incident. Only synthetic QA identities were created or edited. Existing copied employee credentials were not reset. Subscription usage is not exposed to the agent; the user initially paused at 20%, then explicitly removed that stop rule and requested continuation.

## Verified claims

- Five-role login/landing pages and four navigation rounds per role work; role denial, ambiguous/archived identity rejection and immediate account-state revalidation were exercised live.
- Real Chrome registration distinguishes HR pending requests from immediate ADMIN access; new forms reset, edits return to the master list and both reviewer identities survive role-selector changes.
- Eight permitted first-stage form reviewer combinations, including ADMIN, forward to HR. ADMIN cannot finalize at HR stage. Actual competing HR claims/final reviews produce one winner and one committed outcome.
- The synthetic incident progressed through filing, NTE, explanation, HR ownership, information requests, hearing, Management return/reapproval, final decision and closure. HR gets no evaluation task before explanation submission; outside-card Take Task works in Chrome.
- Private/Git path variants are denied by Apache. Invalid employee/account combined requests roll back employee/request/success-audit writes.

Further live checks verified the 300-row import boundary (300 retained, one duplicate rejected), stale prior-offense rejection and reevaluation, and a no-violation decision without disciplinary history. Paid-leave deductions and cross-year allocation were checked against real ledger writes. The competing paid-approval server race passed, while its prescribed two-browser variant remains incomplete. Synthetic incident-reviewer role changes retained compatible assignments and cleared incompatible assignments without manual unassignment. A later real Chrome XLSX import verified blank identities, optional/required hyphens, duplicate rejection, text-number preservation and preview-only repeat-import reconciliation. A competing edit/import email claim produced exactly one owner through live API sessions; its two-browser variant remains incomplete.

Announcement publishing and mandatory acknowledgment passed in Chrome for STAFF, SUPERVISOR and HEAD. Attendance range/role checks and own-employee selector isolation passed on real reads; controlled scanner fixtures remain unavailable. Linked Primary Email protection covered active/inactive accounts and pending requests. Chrome archive cancellation/confirmation preserved historical forms/incidents and denied the archived employee session. Audit filters/order matched SQL. Password changes intentionally leave another browser session authorized, and the API accepts a same-value password; these documented behaviors require an organizational policy decision if stronger controls are expected.

## Disputed claims and findings

| Defect | Severity / confidence | Expected and observed | Reproduction / location |
| --- | --- | --- | --- |
| QA-20261125-01 | Medium / High | At 375 CSS px, frozen identity columns leave no visible area for later employee columns. Header/body alignment itself is correct at 1440, 768 and 375 px. | EMP-04: filter synthetic employees, set viewport 375, horizontally scroll 700 px. Frozen right edge 367; container right edge 365. [Synthetic-only screenshot](EMP-04-table-375.png). `public/css/Styles.css` employee frozen-column rules. |
| QA-20261125-02 | Medium / High | Invalid/missing employee IDs should produce validation/not-found responses; `getEmployee(-1)` and `getEmployee({})` return HTTP 500. | SEC-03: authenticated HR POST `/api/getEmployee`, args `[-1]` or `[{}]`. `EmployeeService.getEmployee` / generic error path. No record changes. |
| QA-20261125-03 | High / High | A text employee number must retain its leading zeros; actual CSV upload parses `00090225` as `90225`. XLSX string cells preserve the value. | IMP-05: upload quoted synthetic CSV through Employee Master List Import and inspect preview payload. `Employees.js` SheetJS reader options. CSV variant was not committed. |
| QA-20261125-04 | High / High | An impossible date must be rejected; `02/29/2025` becomes `2025-03-01` and validation accepts the row. | IMP-05: synthetic CSV with impossible past employment date. Actual preview reports both valid and invalid-date rows valid. Reader/date normalization in `Employees.js`. Invalid-date row was not committed. |
| QA-20261125-05 | High / High | Selecting an invalid new file must invalidate prior import state; header-only upload errors but retains prior rows and enabled Import. Confirming imports the old file. | IMP-06: valid synthetic file → Validate → select header-only file → Import → confirm. One `QA25-STALE-IMPORT` row proves the stale write. `Employees.js` file-change handler does not clear prior state before a read failure. |
| QA-20261125-06 | High / High | Restricted incident identity must remain hidden from an unrelated ADMIN. The overview redacts it and direct case access returns 403, but task history returns the reported employee's name/email as the REGISTERED event actor. | TASK-10: ADMIN-U obtains the redacted task ID from HR Performance, then POSTs `/api/getReviewTaskHistory`. HTTP 200 exposes actor identity associated with that restricted incident. Reproduced on synthetic case 2 only. `PerformanceService.history` checks ADMIN permission without checking case scope or redacting actor identities. |

No application fix or established-test modification has been made. These six findings require correction and focused retest before accepting the affected functionality.

## Current testing scope and remaining checks

The user cancelled Netlify deployment, paused the broad run, then authorized a narrower priority-first continuation. Do not work through all 190 cases mechanically. Defer cosmetic repetition, exhaustive filter combinations and repeated browser variants where existing evidence already covers the same rule. Deferred cases remain Not Tested; obvious behavior is not a passing result.

Finish bounded batches covering unauthorized access/confidentiality, irreversible data or balance changes, and the essential employee-to-reviewer-to-HR and incident-to-decision paths. Reuse existing fixtures and observations. Do not repeat passed cases unless a change or conflicting result justifies it. Application fixes, including the six confirmed defects, require the user's approval after the priority testing checkpoint.

The latest bounded batch completed ACC-04: eight invalid reviewer variants and unauthorized HR replay, followed by an actual Chrome reload comparing both reviewer slots for 25 synthetic accounts with SQL. No assignments or success-audit counts changed. SEC-07 remains partial: three invalid logins returned 401 without session cookies, and unapproved-origin preflight/direct HTTP requests returned no credentialed CORS headers. A direct authenticated HTTP read still executes server-side; this does not prove browser cross-origin mutation protection or a launch perimeter. No deployment target is currently selected.

Earlier isolated fault-copy checks restored all 54 source table checksums and exercised real transactional failures for registration, paid approval and incident recommendation. Those observations do not prove every restore/provider path. The temporary fault API was stopped; its separate database and private backup were retained. Full scanner-provider fixtures, second physical computer/browser engine, eight-hour idle expiry, clock/year rollover and remaining literal browser variants are unverified. See the CSV for exact case-level limits.

## Latest leave priority batch

**Finished cases: 77 / 190 (72 Pass + 5 Fail).** Partial and deferred cases are excluded from the finished count. Report this cumulative count after each completed case.

- **LEAVE-03 passed:** all five eligibility fixtures checked through real balances and Chrome pay defaults. Ineligible rank/status combinations reject paid SL/VL; eligible Supervisor employee rank under a STAFF login submits a paid half-day through Chrome without premature deduction. Existing ledger retained; temporary employee rank/status restored. Count after completion: 76 / 190.
- **E2E-02 passed:** a separate existing synthetic HR applicant submitted paid leave, old Head HR claimed, ADMIN replaced Head HR, old owner was released/denied, replacement claimed/approved. Same task identity, prior owner earned time and ADMIN history retained. Transfer leaves balance unchanged; final approval deducts 0.5 SL once in 2026; duplicate approval denied. Actual Chrome applicant history/document agrees. Original test Head HR designation restored. Count after completion: 77 / 190.

Two harness assumptions were corrected without application changes: the ledger column is `employee_id`; task release events use `RELEASED`, with earnings attributed through `credit_owner`. The completed approval was not repeated after the event-name assertion failed; a read-only follow-up verified history and the saved browser document. One STAFF leave request remains pending for reuse, and the HR leave request is approved. No new defect was confirmed.

## Latest bounded priority batch

- **INC-13 passed:** actual employee browser explanation submission after notification acknowledgment; one shared acknowledgment signature, one receipt/explanation, unchanged deadline and immutable submission. Earlier saved-receipt/draft-attachment API evidence supplies the complementary variant.
- **INC-31 passed:** raw payload checks for reported employee, filer, other participant, assigned HEAD, two HR reviewers and Management, plus the stored assigned ADMIN. Actual Chrome document tabs preserve filer/reported/HR boundaries. Other-recipient private request text, response and attachment filenames/bytes remain inaccessible. An unsubmitted draft was visible only to its author.
- **SEC-04 and INC-35 remain partial:** current evidence bytes, safe download headers, signed-out/unrelated denials, private recipient-file isolation, adversarial Unicode/quote/path/control-character names and direct case/version denials passed. Legacy attachment/mutation variants were deferred rather than claimed complete.
- Existing QA case 8 progressed to HR-owned review with two answered information requests and two private synthetic attachments. No new incident or production code change was needed. All 54 original launch-database table checksums still match. No new defect was confirmed; the six recorded defects remain open.

## Adversarial checks

Executed negative role replays; prototype/unknown API names; malformed input and SQL-like searches; archived/duplicate email identities; invalid registration/account combinations; password boundaries; unassigned/self reviews; real concurrent claims/decisions; unissued NTE evidence access; wrong employee response; duplicate requests/extension reviews; hearing ownership; premature/stale Management and final actions. Outcomes are recorded individually rather than inferred from source.

## Regression assessment

Production code, tests, dependencies and configuration files are unchanged. The existing three uncommitted documentation files were preserved. This run adds QA evidence and updates only execution results/documentation. No automated suite pass is substituted for manual-case evidence.

## Verification limitations and harness corrections

The original browser response signature attempt was stopped after three automation failures caused by an intervening notification dialog. A later priority batch used existing QA case 8, explicitly acknowledged pending notifications, then submitted through actual Chrome controls and real mouse signature input. SQL confirmed one receipt and explanation with the same acknowledgment signature, unchanged deadline and cleared draft; overwrite was denied. INC-13 now passes. INC-12 is partial rather than blocked because its controlled year-boundary clock variant remains deferred.

Harness mistakes were corrected without changing the application: the audit event for first-stage signing is `FORM_HEAD_SIGNED`; denied unissued evidence may return 409; the initial NAC boundary fixture omitted its required Date; initial leap/future birthday fixtures violated the independent no-future-birthday rule. The CSV-date defect was repeated with past dates and independently reproduced. Report filters cached before fixture creation were reloaded and the filtered browser row counts were then asserted against API results. MySQL aggregate numeric strings and absent-email NULL values were normalized for comparison; the 300-row import was not repeated. The authenticated shell removes login markup, so the browser helper was corrected to handle its absence. Logout replay was corrected to capture the actual browser cookie rather than a separate API session. The browser import harness initially expected the Excel reader before file selection; fixture preparation was corrected to load the existing reader, then the actual upload/validation/commit was executed. No import occurred during that setup failure. The initial one-row audit minute could not demonstrate allRows behavior; a later 161-row actor filter did. These setup errors are not application findings.

Published observation checks found no current synthetic account passwords/cookies and no non-synthetic email addresses. Raw browser artifacts, database backups and account credentials remain private. The synthetic-only mobile screenshot is the sole published browser capture. The test database now includes QA rows, announcements, archived fixtures, forms and incidents; it is not a clean launch dataset.

An assigned non-HR reviewer can forward a leave request while an extra `hrFields` object is ignored. The attempted HR-only values are not stored. This is recorded as an API-contract observation, not a balance-edit privilege escalation; strict request rejection was an unproven harness assumption. The owning-HR tests did reject calculated SL/VL, identity and oversized SIL fields.

## Recommended decision

Keep testing limited to the outstanding high-risk cases and preserve the isolated test environment. Lower-risk checks are deferred rather than marked passed. At the priority checkpoint, present the confirmed defects for the user's approval before changing application code. No Netlify work is planned. Keep private backups, credentials and raw artifacts local; never copy QA records over the launch database.
