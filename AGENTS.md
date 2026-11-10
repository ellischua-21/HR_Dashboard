# HRIS Development Standards

Applies throughout this repository. Preserve working functionality and use small,
reviewable changes. Start with `README.md` and the documentation relevant to the
task; do not treat older audit notes as the current workflow specification.

## Inspect before implementing

- Check Git status and preserve existing uncommitted work. Avoid unrelated edits.
- Trace the affected UI, callers, API, permissions, service, and database paths.
  Search for equivalent implementations before adding functions or files.
- Verify behavior and edge cases before sharing similar code. Do not assume two
  implementations are equivalent because their names or appearance match.

## Architecture and reuse

- Keep the existing HTML, CSS, vanilla JavaScript, Express, MySQL, and Apache
  architecture. Do not introduce dependencies, frameworks, or broad rewrites
  without justification and approval. Split files by responsibility, not length.
- Place markup in `public/views/`, page behavior in `public/js/`, and business
  logic in `server/services/`. Register Express API methods in `server/server.js`;
  reuse `server/utils/`, `server/config/`, and pure rules in `shared/`.
- `public/index.html` is the shell. `public/js/ui-loader.js` inserts fragments
  before loading classic scripts in dependency order. Preserve global consumers,
  initialization lifecycles, and startup recovery. Register new browser assets in
  the loader; shared browser files also require the `.htaccess` allowlist. Update
  the existing asset version when changing loaded frontend assets.
- Reuse `UI.js`, `EmployeeSearch.js`, `SignaturePad.js`, `AppConfirm.js`,
  `Feedback.js`, and `Loading.js`. Reuse shared form definitions, validation,
  statuses, `DateUtils.js`, and `WorkTime.js` instead of copying their rules.
- Use `Styles.css` for shared controls and layout; use `Theme.css` for visual
  theme. Follow `docs/SharedControls.md`. Preserve table widths, frozen columns,
  scrolling, responsive behavior, and printable layouts. Display dates/times via
  shared helpers using MM/DD/YYYY and AM/PM; keep canonical input/storage values.
- Keep employee identity centralized in `employees`, with credentials and roles
  in `user_roles`. Preserve the explicit first-setup-ADMIN exception in
  `EmployeeIdentity.js`; do not broaden it to other accounts.
- Route incident operations through `IncidentWorkflowService.js`. Current
  section-based services live in `server/services/incident-management/`;
  `IncidentService.js` and historical renderers support read-only legacy records.
  Preserve historical documents, policy snapshots, and case-level visibility.
- Follow existing naming and `.prettierrc.json` conventions. Format touched files
  only; avoid repository-wide formatting during a scoped task.

## Security and data integrity

- Enforce authentication, role/case permissions, ownership, and validation on the
  server. Hidden UI controls are not authorization. Preserve API contracts,
  navigation/deep links, database relationships, and approved business rules.
- Keep credentials and employee data out of logs, reports, fixtures, and public
  assets. Never print `.env` values or weaken Apache private-file/Git protections.
- Use parameterized SQL and existing validation/allowlists for dynamic query
  structure. Use transactions and appropriate locks for related writes; record
  sensitive changes through the existing audit infrastructure and connection.
- Preserve notification recipients, actor exclusion, and confidential timeline
  filtering when reusing notification services.
- Inspect existing schema and migration consumers before database changes.
  Preserve compatibility and make approved migrations safe to rerun. Destructive
  changes require explicit approval. Do not run setup, sample-data generation, or
  schema initialization against production as a verification step.

## Cleanup, testing, and change control

- Delete code only after verifying static/dynamic consumers, loader entries,
  routes, HTML handlers, CLI tools, background jobs, configuration, and historical
  data dependencies. Retain uncertain candidates; report the missing evidence.
- Identify relevant tests before editing. Add or update focused tests for behavior
  changes and use characterization tests before restructuring sensitive workflows.
  Do not change assertions merely to make incorrect behavior pass.
- Run `npm.cmd run check` for applicable code/asset changes and relevant
  `node --test` files; use `npm.cmd test` when broader regression testing is
  warranted. Establish the current baseline: the suite has known stale tests and
  failures. Separate pre-existing failures from regressions. The structural check
  does not prove business behavior or security.
- Use mocks or an isolated database for mutation tests. Verify affected login,
  role, navigation, form, notification, and responsive behavior as appropriate.
  Test repeated navigation/initialization when changing shared browser code.
  Measure performance before claiming an improvement.
- Keep changes focused and reversible. Obtain approval for high-risk changes or
  broad restructuring outside the authorized task. Existing authorization covers
  necessary implementation; do not repeatedly request approval for the same work.
- Update relevant architecture/user documentation when behavior or interfaces
  change. Documentation-only work needs consistency and diff checks, not an
  unrelated application test run.
- Report files added/modified/deleted, purpose, existing code reused, verification
  passed/failed/not run, remaining risks, and manual checks still required. Never
  claim untested workflows are verified.
