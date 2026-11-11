# Regression coverage — Phases 3–4

Verified November 11, 2026. Phase 3 changes tests, fixtures, the test command
and documentation. It does not change application behavior or database records.
Current requirements come from `README.md` and `docs/UserGuide.md`; older audit
notes describe earlier implementations.

## Baseline and result

Before Phase 3: **200 tests, 159 passed, 41 failed**. Failures came from retired
incident mutation APIs, obsolete browser editors and role expectations, and
fixtures missing linked employee identity or the current locking/task queries.

After Phase 3: **212 tests passed, zero failed, zero skipped**. `npm.cmd test`
ran with a temporary Node preload that blocked unmocked MySQL pool access and
`fetch`. The preload was removed afterward. `npm.cmd run check` also passed:
112 JavaScript files, browser assets, module paths and static HTML IDs.
The initializer was not run against a database; the Phase 2 role-migration test
uses intercepted queries and stops before subsequent schema initialization.

## Behavior exercised

| Tests | Coverage |
| --- | --- |
| `IncidentSecurity`, `IncidentReview` | Current facade: grouped filing, signed NTE issuance, receipt-based five-calendar-day deadline, immutable signed explanation, configured corrective action, Management approval/version checks, final issuance and closure. Unauthorized/closed/legacy mutations fail; notification failure rolls back state. Legacy evidence confidentiality remains covered. |
| `IncidentTracking`, `IncidentReview` | Case-scoped queries and bindings, unresolved badges, confidential popup messages, recipient-scoped Inbox marking, HR ownership suppression, legacy notices, actor exclusion, pending information waits, recipient-only immutable responses, hearing pause/resume and ownership. SQL assertions do not execute MySQL predicates. |
| `BrowserWorkflow` | Declared controller order, role navigation, current editor required fields, ownership/wait/closed controls, lazy initialization and draft retention on reopening, server-calculated actions, Track reload callback, and existing account-switch staging/search/date/confirmation behavior. |
| `CleanupRegression`, `Test` | Existing scrolling/report permissions, profile fields and edits, COC matrix rules, form date filters, import validation and Head assignment, with current employee identity and lock fixtures. |
| `LeaveAccounting`, `SharedUtilities` | Separate annual SL/VL allowances, eligibility, regularization, half-day cross-year allocation, idempotent grants and historical deductions, preflight without deduction, actual final form approval and task completion, duplicate/overdraw rejection, audit and cross-year rollback. WorkTime boundaries/weekends plus 200 deterministic comparisons with daily interval intersection. |

Existing attendance, authorization, employee email integrity, legacy confidentiality
and Head HR transfer suites remain registered and passed. The new incident fixture
exercises the real facade, authorization, workflow actions and task service. The
leave fixture exercises the real leave service, form reviewer and task service.
Neither fixture substitutes business decisions; both supply synthetic SQL results
and snapshot/restore state for rollback assertions.

## Established expectations changed for review

These changes are intentional requirement corrections, separate from fixture repairs:

| Previous expectation | Current expectation and requirement |
| --- | --- |
| STAFF/HEAD permission arrays omit `employee.self`. | Include personal employee access, matching the personal dashboard/profile documented in README and current role grants. |
| Unrelated ADMIN has blanket legacy incident access; HR scope is unrestricted across versions. | Only HR has legacy internal review access. Current HR access starts after NTE issuance and excludes involved HR. ADMIN requires case involvement/assignment. README's incident confidentiality rules specify these distinctions. |
| SUPERVISOR and HEAD have identical incident navigation. | SUPERVISOR has History; HEAD has Review with Closed. User Guide's role/page table specifies this split; ordinary HR has no File page. |
| ADMIN can manage the COC matrix. | Only HR can edit it. ADMIN remains a viewer; User Guide's performance/role rules state this restriction. |
| Retired signature-first mutation APIs, investigation/evaluation editors and old Review categories are active. | Current facade/actions and section-based browser editor are exercised instead. Legacy writes are rejected and historical tracking/document read checks are retained. README's incident workflow and User Guide sections I–VIII specify the active sequence. |

Fixture-only repairs add linked employee records, named-lock results, current task
reads, current aliases/bindings and the valid employment status `Regular`.
The Head HR browser test distinguishes account reads from the additional workflow
configuration request, preserving the assertion that switch clicks make no request.
No tests are skipped and no production authorization is relaxed.

## Phase 4: configuration audit integrity and sample validation

The Phase 4 baseline was the passing 212-test suite above. New tests reproduced
missing success audit events, saves that could not roll back on audit failure,
and sample rows rejected with `Employment Status has an invalid value`.

| File | Change |
| --- | --- |
| `server/services/incident-management/Conduct.js` | Validates first, then saves the COC matrix and `INCIDENT_MATRIX_UPDATED` audit event using one transaction connection. Audit failure rolls back the matrix. HR-only permission and `{ ok: true }` response remain unchanged. |
| `server/services/incident-management/WorkflowConfiguration.js` | Adds `INCIDENT_WORKFLOW_CONFIG_UPDATED` through the existing `AuditService.logAudit` writer and supplied connection. Direct calls own their transaction; Manage Accounts retains ownership of its enclosing transaction, including earlier account assignments and their audit records. |
| `scripts/SampleData.js` | Generates `Regular` instead of the unsupported `Active` employment status. Archive record status remains `Active`/`Archived`. |
| `tests/ConfigurationIntegrity.test.js`, `package.json` | Adds and registers nine tests covering successful audit, audit-failure rollback, rejected roles/invalid input, configuration clearing, the enclosing account transaction, and sample validation. Successful business/audit writes through the pool instead of the transaction connection fail the fixture. |
| `tests/CleanupRegression.test.js`, `README.md` | Updates two matrix fixtures for transaction connections and audit inserts; existing assertions remain unchanged. Documents atomic configuration auditing. |

Audit details contain counts and Management approver selected/cleared status,
without policy contents, employee details or selected reviewers' addresses.
The existing actor email identifies who saved the change.

Phase 4 verification: **221 passed, zero failed, zero skipped** using the same
blocked-database/`fetch` preload; structural checks passed for 113 JavaScript files.
Sample generation was evaluated in a VM with database initialization and import
substituted; all 60 generated rows passed real employee cleaning and validation.
No live generator/import, schema changes or application-server startup were run.
No files were deleted and no established test expectations changed in Phase 4.

## Verification limits

No live database, schema initializer, sample-data generator, attendance endpoint,
email service or application server was used. Mock rollback tests verify the
transaction path and restored synthetic state, not database isolation. The DOM
fixture does not establish visual layout, native browser validation or signature
drawing on a real device.

Before deployment, use an isolated MySQL database to check competing task claims,
parallel approvals/deductions and rollback constraints. In a real browser, check
repeated navigation between accounts/cases, NTE signatures, hearing/response waits,
form approval, printing and responsive layout. These remain manual/integration
checks; the structural check alone does not verify business behavior or security.
