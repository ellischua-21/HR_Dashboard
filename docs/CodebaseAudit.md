# Codebase cleanup — 28 October 2026

## Scope and approach

The audit covered first-party browser controllers and views, styles, API routing,
services, authentication and permissions, shared form definitions, database setup,
command-line scripts, tests, Apache rules, and project documentation. Dependencies
in `node_modules` were excluded. Reference searches and structural checks were
combined with review of the affected workflow paths.

Cleanup removes verified unused implementation paths and shares equivalent logic.
Changes to workflow permissions and stored historical data require separate
evidence; compatibility code is not treated as dead merely because the current
interface does not call it.

## Removed or consolidated

| Finding                                                                                            | Change                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unreachable COC provision/rule mutation functions exported without routes or callers               | Removed five obsolete mutators; retained legacy policy reads and historical records.                                                                                                            |
| Uncalled evaluation-context query duplicated the existing query                                    | Removed the unused transaction helper and a signature wrapper that only forwarded its argument.                                                                                                 |
| Review retained an inline workspace after its View buttons were moved to Track                     | Removed its unused markup, selection state, polling, handlers, and CSS. Review keeps its list, filters, analytics, and active-case polling.                                                     |
| Incident controller mixed filing, document templates, NTEs, evaluation, and investigation controls | Moved document layouts to `Documents.js`, NTE/explanation controls to `Notice.js`, evaluation/decision controls to `Evaluation.js`, and shared investigation controls to `Investigation.js`.    |
| Four employee-search implementations handled selection and stale responses differently             | Added `EmployeeSearch.js`; registration, form witnesses, incident participants, and violation-history selection use it. Each caller supplies its data source and selection rules.               |
| General browser helpers lived inside the employee page                                             | Moved element creation, table cells, empty rows, dates, and downloads to `UI.js`; route initialization and page action guards belong to `Main.js`. CSV downloads now release their object URLs. |
| Frontend and backend repeated deadline calculations and form edit rules                            | Shared `DateUtils.js` and `FormStatus.canEditForm` now supply those rules.                                                                                                                      |
| Evidence download routes repeated response/header code                                             | Added `AttachmentResponse.js`; each evidence service still enforces its own permissions and audit logging.                                                                                      |
| Employee imports repeated registration sanitization                                                | Both use `EmployeeData.js`; import-specific lookup matching and duplicate detection remain in `ImportService.js`.                                                                               |
| Pagination and report filters had separate incomplete validation                                   | Added common pagination and employee-filter validators. Invalid fractional/negative SQL limits and malformed dates return validation errors.                                                    |
| Single Head assignment duplicated bulk assignment logic                                            | Kept the API and delegated to the bulk transaction, validation, and audit path.                                                                                                                 |
| HR switch staging fetched every account again on every click                                       | Staged changes render locally; saving still uses the existing server endpoint.                                                                                                                  |
| Incident notification inserts repeated reviewer selection and actor exclusion                      | Centralized them in `Notifications.js`, including explanations, evidence, extensions, information responses, and deadline reminders.                                                            |
| Old palette, unused variables/imports, legacy browser USER branches, and unused settings           | Removed them. Stopped writing the unread employee cache-version setting. Existing database settings are not deleted.                                                                            |
| Documentation still referred to removed controllers and old Review routing                         | Updated the architecture notes and verification commands.                                                                                                                                       |

## Bugs addressed

- Track omitted its reload/feedback callbacks when rendering decision controls.
  Closing a case could send validation errors to a hidden dialog or open that
  dialog instead of refreshing Track. Track now supplies the callbacks, and
  completion-note errors appear beside the close button.
- Track and the old case dialog had different investigation actions. Both now use
  the same controls for notes, evidence, information requests, responses, and
  closure. Closed cases do not gain investigation controls.
- Late employee-search results could reappear after a selection or form reset.
  Selection, reset, and account changes invalidate outstanding searches. Keyboard
  selection uses the same path as clicking a suggestion.
- HR imports stripped sensitive fields and then incorrectly required them.
  Import validation now follows the same sensitivity permission as registration.
- The sample generator still used the removed `email` field; it now supplies
  `personal_email`.
- Evidence and explanation notification inserts could still include the actor.
  Shared writers exclude them. The legacy inbox evidence filter now matches the
  specific activity ID instead of hiding every evidence update from anyone who
  previously uploaded evidence to the same case.
- Browser/server date calculations used multiple locale-dependent formats.
  Shared date formatting uses explicit Manila calendar parts, and both deadline
  calculation paths use the same weekend rule.
- The new shared browser file needed explicit Apache access. The allowlist was
  updated, and `npm run check` now checks shared browser files against that rule.

## Verification

- `npm.cmd run check`: syntax for every first-party JavaScript file, local module
  paths, browser asset loading, duplicate static HTML IDs, Apache shared-file
  restrictions, and native confirmation-call detection.
- `npm.cmd test`: existing permission, form, signature, tracking, review, and
  evidence-security tests plus cleanup regressions.
- Browser controller tests use a small in-memory DOM and mock network responses.
  They cover asset order, search selection/races, confirmation resolution,
  closure feedback and Track callback wiring, investigation permissions, and
  local HR-switch staging. They do not verify visual layout in a real browser.
- Database service tests mock the connection. No sample cases were inserted,
  live records changed, database setup run, or browser profiles created during
  this cleanup.

## Remaining engineering limits

- `IncidentService.js` remains the transaction coordinator for the case lifecycle.
  Its pure validation has been extracted; further splitting its SQL and stage
  transitions should be backed by integration tests against an isolated MySQL
  database, especially for concurrent signing and decision issuance.
- Existing database migrations, legacy document fields, and old read APIs remain
  where historical cases or installations may depend on them. Removing these
  requires a data-retention and migration decision, not a reference-count search.
- Inbox counts currently reuse the inbox retrieval path, which has list limits.
  For larger datasets, exact count queries and paginated inbox retrieval need a
  coordinated change so their permission and actor-exclusion rules stay aligned.
- The regression suite does not establish that every production workflow is bug
  free. Real-browser smoke checks and MySQL integration testing remain necessary
  before deployment, particularly for historical cases and migrations.

Restart the Node.js API and refresh the browser after applying this cleanup.
