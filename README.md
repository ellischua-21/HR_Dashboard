# HR Management System — XAMPP and MySQL

This version keeps the existing dashboard screens and browser behavior, serves the HTML/CSS/JavaScript through XAMPP Apache, and replaces Apps Script RPC and Google Sheets storage with a local Node.js API and MySQL.

## Using the dashboard

See the [HR Dashboard User Guide](docs/UserGuide.md) for plain-language instructions
for STAFF, SUPERVISOR, HEAD, HR, and ADMIN, including forms, attendance, incidents, reports,
notifications, and account management.

## Requirements

- XAMPP with Apache and MySQL
- Node.js 18 or newer
- The project folder located at `C:\xampp\htdocs\HR_Dashboard`

## Project layout

- `public/index.html` is the application shell. `public/js/ui-loader.js` loads view fragments and controllers in dependency order, using one asset version.
- `public/views/` contains page markup; `public/js/` contains page controllers; `public/css/Styles.css` contains the shared design system.
- `public/css/Theme.css` applies the shared visual theme across roles. It owns surface colors, accents, borders, shadows, and interaction states. Keep table dimensions, frozen-column offsets, cell alignment, scroll heights, form field order, and popup geometry in `Styles.css` and the existing views. Table color variables keep frozen and unfrozen cells consistent without changing their layout. Printable documents retain their existing formatting; incident progress retains its circular markers and state labels.
- `EmployeeDashboard.js` is the STAFF/SUPERVISOR/HEAD landing page. It uses the shared employee details renderer from `Employees.js` and `AttendanceUI.js` for time fields and scan popovers. Self-service endpoints derive the employee from the authenticated session; they accept no employee selector. Daily attendance reuses the HR attendance calculation and cache, matching the employee number and registered name across scanner accounts.
- `public/js/UI.js`, `AppConfirm.js`, `EmployeeSearch.js`, and `SignaturePad.js` provide reusable browser behavior. `Main.js` owns navigation, route setup, session initialization, and page action guards.
- `public/js/incident-management/Workflow.js` renders current filing and section-based actions using shared controls. `IncidentManagement.js` connects pages and supplies legacy document rendering; `Notice.js`, `Evaluation.js`, and `Investigation.js` retain read-only historical content. Track, Review, History, and Code of Conduct have separate controllers.
- Review supplies analytics, filters, and the case list. View buttons and inbox links select the case in Track for every role. Shared renderers provide the authorized actions and documents; History opens completed cases as read-only archives.
- `CodeOfConduct.js` owns the matrix, its configuration editor, and violation history. HR/ADMIN can search employee records; other roles see their own history. Authorized HR accounts edit the matrix and save changes directly. Captured historical policy references remain available.
- `shared/` contains browser/API form templates, status/edit rules, and Manila date/working-day calculations. New shared browser files must be added to the Apache allowlist and the asset loader.
- `server/server.js` wires API methods and evidence routes. `server/config/` defines employee fields and permissions, `server/middleware/Auth.js` enforces authentication and permissions, and `server/services/` owns domain workflows.
- `server/services/incident-management/` contains workflow services, section permissions, role-specific queues, case tracking, legacy timeline visibility, notification writers, matrix rules, and input validation. `IncidentWorkflowService.js` is the public facade; `IncidentService.js` is read-only legacy support.
- `server/utils/` contains shared sanitization, employee data conversion, pagination/filter validation, attachment responses, password hashing, and HTTP errors.
- `server/db/database.js` initializes the schema and compatibility migrations. Historical policy, signature, and case-subject records are retained.
- `scripts/` contains setup, account/sample-data tools, and structural checks. `tests/` contains unit and controller regression tests, with mocked database/network access.
- [Codebase audit](docs/CodebaseAudit.md) records cleanup changes, verification coverage, and remaining engineering limits.
- `node_modules/` contains installed dependencies and can be recreated with `npm.cmd install`.

Apache uses the root `.htaccess` file to redirect `http://localhost/HR_Dashboard/` to `public/` and block access to server-side code and dependencies.

## Code organization

Keep page structure in its matching `public/views/` fragment and page-specific behavior in the matching `public/js/` controller. Put reusable browser behavior in a shared controller or module rather than duplicating it across pages. Keep form definitions shared when they are consumed by both the browser and API; forms with distinct workflows may keep dedicated markup and behavior. Put business rules and data validation on the server, with reusable logic in `server/services/` and authoritative field/permission definitions in `server/config/`. Incident Report tables are added by the existing database initialization, and the shared signature pad is in `public/js/SignaturePad.js`. Use `npm.cmd run format` to format first-party JavaScript, HTML, and CSS consistently.

Wrap data tables in `.tablewrap` and use a `<thead>` for the shared scrolling and sticky headers. Label required controls and use the native `required` attribute when it reflects the existing validation; `RequiredFields.js` adds their visible indicators. For requirements enforced by workflow logic without native validation, use `data-required-indicator="true"` on the associated control, updating it when the requirement changes. Use `data-required-label` for required signature headings.

Dialogs support outside-click dismissal through `OutsideDismiss.js`. Use `data-outside-dismiss="never"` when explicit acknowledgment or confirmation is required, and `data-outside-dismiss-target` when dismissal must invoke an existing cancel or close button. Dialogs with unsaved input or signatures stay open until the user saves or cancels them.

Keep page components inside the isolated `#main` stacking context and use the shared `--layer-*` values for floating menus, the sidebar, and feedback. Scrollable tables isolate their frozen headers locally. Keep native modal dialogs and popovers in the browser's top layer, and avoid raising individual table headers above navigation.

## First-time setup

Login requires exactly one non-archived record in the central `employees` table whose Email matches the account email. The sole exception is the first setup ADMIN created by `create-user` when the accounts table is empty. That account can sign in without an employee record to import the master list and set up the system. The exception is stored on that specific account and applies only while its role is ADMIN; creating other accounts never grants it. Login and existing sessions both enforce these rules.

Credentials and permissions stay in `user_roles`; Master List, HR Reports, form autofill and leave eligibility use the central employee records. Setup does not create a placeholder employee. If a matching employee record is imported later, the setup ADMIN uses that employee's details automatically. All subsequent accounts, including additional ADMIN and HR accounts, need a genuine employee record first. Importing a profile does not replace its account password or role.

Nonblank login Emails are reserved across current and archived employees,
ignoring case and surrounding whitespace. Linked account emails (including inactive
accounts) and pending-request emails cannot be changed through employee editing.
Equivalent edits retain the stored spelling. Imports still permit blank emails;
unrelated edits do not repair or reject pre-existing duplicate emails.
See [Employee Email Integrity](docs/EmployeeEmailIntegrity.md) for locking limits
and isolated QA scenarios.

1. Start **Apache** and **MySQL** in the XAMPP Control Panel.
2. The current workspace already has an empty `hr_dashboard` database and its tables. On a different XAMPP installation, create a database named `hr_dashboard` using `utf8mb4`; the Node setup command creates the tables and default lookup values.
3. If Node.js is installed in the default location but PowerShell cannot find `node`, add it to this terminal's PATH:

   ```powershell
   $env:Path = 'C:\Program Files\nodejs;' + $env:Path
   ```

4. From PowerShell in this project folder, install the Node dependencies:

   ```powershell
   npm.cmd install
   ```

   Use `npm.cmd` in PowerShell if `npm install` reports that `npm.ps1` cannot be loaded because script execution is disabled. This avoids changing your machine's PowerShell execution policy. Use the same `.cmd` launcher for the remaining npm commands below.

5. Review the existing `.env` file and update the MySQL credentials if needed. If `.env` is missing, copy `.env.example` to `.env` and set `SESSION_SECRET` to a random value:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

6. Initialize the MySQL schema:

   ```powershell
   npm.cmd run setup
   ```

7. Create the first local administrator account. The generated password is printed once; save it securely:

   ```powershell
   npm.cmd run create-user -- hr-admin@example.com ADMIN
   ```

   On an empty accounts table, this creates the first setup ADMIN without requiring an employee record. Sign in with it to import employees. Other supported roles are `STAFF`, `SUPERVISOR`, `HEAD`, and `HR`; subsequent accounts require a matching employee record. Run this command again to reset a user's password or role. The original setup ADMIN can also have its password reset without an employee record while keeping its ADMIN role.

8. Start the API in a PowerShell window and leave it running:

   ```powershell
   npm.cmd start
   ```

9. Open **http://localhost/HR_Dashboard/** and sign in with the email and temporary password printed by the account command.

## Account registration and management

There is no public account-request option on the sign-in screen. HR and ADMIN create account requests through **Employee Registration** using the employee's Email, role and initial password. STAFF requires an assigned SUPERVISOR, and SUPERVISOR requires an assigned HEAD. New accounts remain unable to sign in until an ADMIN approves them.

All users can change their own password by entering the current password and a new password (12–128 characters) in **Change Password**. ADMIN manages registration requests and accounts in **Manage Accounts**.

Privileged capabilities follow the role grants in `server/config/Permissions.js`.
Residual `extra_perms` cannot grant account management, audit, executive, analytics,
employee management, reports, announcement management, form review/view, or COC
management outside those role grants. Other extras retain their existing behavior;
form assignments and incident case permissions are still enforced separately.

Only an account with the `ADMIN` role sees **Manage Accounts** and can approve or reject requests. The role and assigned Head appear in each request and are fixed when approved:

- **STAFF**: a personal dashboard for submitted-form history and status, plus form templates. STAFF cannot access employee records or the HR dashboard.
- **SUPERVISOR** and **HEAD**: the STAFF dashboard and form templates, plus **Review Requests** for assigned forms. Supervisors review assigned STAFF forms, while Heads review assigned SUPERVISOR forms. Both can sign and forward a request or reject it with a reason.
- **HR**: dashboard, full employee registration and record read/write, and reports, plus **Manage Forms** for requests forwarded to HR. The designated Head HR can also review forms submitted by other HR accounts. HR and ADMIN have the same complete employee fields; no separate sensitive-data permission is required.
- **ADMIN**: account management, full employee-record access, View Forms, and HR performance monitoring. Department-assigned ADMIN HEADs can file/review incidents; designated Management approvers approve recommendations. Other incident access is view-only and limited to available cases.

The searchable Reports To field offers active or pending SUPERVISOR accounts for STAFF, and HEAD accounts for SUPERVISOR. Approve the assigned reviewer before approving their subordinate's account. ADMIN can change saved assignments in Manage Accounts. STAFF forms go to their Supervisor then HR; SUPERVISOR forms go to their Head then HR; HEAD forms go directly to HR. At API startup, legacy USER, MANAGER, and EXECUTIVE accounts are migrated to STAFF; HR_STAFF migrates to HR; HR_ADMIN and SYSTEM_ADMIN migrate to ADMIN. Bootstrap the initial administrator with the `create-user` command above. Grant **ADMIN** only to trusted administrators.

## User forms and leave requests

Paid SL/VL eligibility is centralized in `LeaveService.js`: employment status must
be Regular, and employee rank must be present and above Rank and File. The same
rule gates annual grants, visible balances, paid submissions, and final approval.
Existing ledger records are retained; an ineligible employee's available balance
is zero. Six-month automatic regularization changes employment status but grants
allowances only when the employee also meets the rank requirement.

STAFF, SUPERVISOR and HEAD sign in to a personal dashboard, review submission status, filter by status or form type, and open the **Forms** tab. A STAFF, SUPERVISOR or HEAD account can edit a submitted form only while it is pending with its assigned reviewer; saving changes requires a new electronic signature. Forms rejected by the assigned reviewer or already forwarded to HR/Admin cannot be edited. Available templates use generic names: **Leave Application**, **Authority to Deduct**, **Time-In/Out Correction Request**, **Official Business / Travel Request**, **Overtime Request**, and **Time In/Out Record**. Forms collect the applicant's required details, their electronic signature, and their approved account name automatically. New submissions receive a serial number in `PREFIX-YEAR-SEQUENCE` format, with a separate sequence per form type and Manila calendar year. Each form type starts at `000001` in a new year. Prefixes and sequence widths are configured on each template in `shared/FormTemplates.js`. Previously assigned serial numbers are retained. Submitting a form does not open the print dialog; users can print or save a PDF later from their dashboard.

A STAFF form goes to its assigned Supervisor; a SUPERVISOR form goes to its assigned Head. The assigned reviewer can sign and forward it to HR or reject it with a reason. HEAD requests go directly to HR. Forms submitted by HR go to the designated Head HR; the Head HR's own forms go to the HR review queue so another HR account can review them. HR reviews forms forwarded to the HR stage. All reviewers use one **Manage Forms** tab; the API limits each account to the forms and review actions allowed by its role, Head HR designation, and the form's assigned reviewer and stage. Approval signatures are required only for form templates configured to require them; all rejections require a reason. Form lists are ordered by submission date/time, newest first, and can be filtered by status and form type. STAFF, SUPERVISOR and HEAD can view their submitted forms, including signatures and approver names.

## Moving employee records from Google Sheets

Employee fields reflect the 63 headers in the supplied Employee Master List
workbook. Registration keeps its existing section layout and field order, with
generated record information available in the master list and HR reports instead.
The Employee Master List, HR Reports master list and master CSV use those
63 headers plus HMO Details immediately after HMO Provider, for 64 columns.
Tenure follows Date of Employment, Age follows Birthday, and the internal
Record ID is excluded from the report columns. Employee details remain accessible
through the row action.
**Email** is the former **Personal Email** label and continues using `personal_email`
for login/account linking. **Corporate Email** is an independent optional validated
address stored in `corp_email`; it does not replace a login or change an account.
The existing initializer adds this column when missing and preserves stored
addresses. Its older `corp_email`-to-login compatibility migration is retained
for installations predating `personal_email`, then a separate corporate field is
added. This code change does not itself run the initializer or import workbook rows.

Age and Tenure remain calculated from Birthday and Date of Employment. Only Age
appears in registration. Name of Employee, Tenure, No., Record Status, Date Created,
Created By, Modified By and Last Modified do not appear in registration or editing;
they remain available in the master list and HR reports and controlled by the
server. Internal record IDs,
legacy supporting-document storage and existing audit/history columns are retained,
not deleted to match a spreadsheet. Import mapping now recognizes Email and
Corporate Email separately; calculated and audit columns are not writable imports.
HMO Details is an optional text field immediately after HMO Provider in the form,
master list, HR master report, HMO enrollment report, import template, and exports.
It has no allowed-value list or field-specific validation; standard text sanitizing
and the existing 500-character limit apply. HMO Provider keeps its configured list.
Existing databases receive the nullable `hmo_details` column on startup.
Import destination choices and the downloaded template use the same 64 master-list
headers, in the same order. Automatic fields are labeled as automatic instead of
appearing as unexplained skipped columns; structured family/membership fields are
labeled for editing in the employee form. Neither can overwrite generated data
through import. Selecting a file or downloading the template fetches fresh field
metadata from the API.

Export the current employee rows from the source spreadsheet to CSV or Excel, then use **Employee master list → Import** in the local dashboard. Map the spreadsheet headers to the matching employee fields, validate, and import. The normal validation, duplicate employee-number check, permissions, and audit logging apply. Company, work location, department, and employee rank dropdowns use the approved lists in `server/config/EmployeeSchema.js`. Startup replaces only these four lookup groups transactionally, removing obsolete choices without modifying existing employee records. Other lookup groups, including HMO Provider, retain their existing configuration. Imports normalize capitalization and repeated spaces to the configured spelling.

For manual account provisioning, bootstrap or recovery administrators can use `npm.cmd run create-user`; routine STAFF/SUPERVISOR/HEAD/HR account creation should use Employee Registration so an ADMIN can approve it. Google account roles are not copied automatically. The existing import/export feature does not carry supporting-document files, matching the original report behavior.

## Configuration and data

- `.env` contains local MySQL connection settings, the API port, allowed Apache origins, and the session secret. Do not commit it.
- The API listens on `127.0.0.1:3001` by default. If Apache uses a nonstandard host/port, add its origin (for example `http://localhost:8080`) to `CORS_ORIGINS`.
- The Node API runs separately from Apache. XAMPP's MySQL stores employees, user roles, lookup values, audit events, and system settings.
- ADMIN Audit Logs can be filtered by a start/end time and exact user email. Filter validation and SQL parameterization are enforced by the API.
- Incident reviewer/Management configuration saves and HR corrective-action matrix
  saves record audit events in the same transaction as their changes. An audit
  failure rolls back the save. Event details contain assignment/row counts and
  approver-selection status, without copying employee details or policy text.
- Only HR and ADMIN can create accounts, using Employee Registration. Email is the login email; HR/ADMIN select STAFF, SUPERVISOR, HEAD, or HR and set an initial password. New accounts remain pending until an ADMIN approves them. STAFF needs a Supervisor and SUPERVISOR needs a Head selected in Reports To; pending reviewers must be approved first.
- HR and ADMIN can publish announcements from the Announcements tab. STAFF, SUPERVISOR and HEAD see unacknowledged announcements in a blurred modal after login; acknowledging records that announcement as seen for that account.
- All roles have an Inbox. STAFF, SUPERVISOR and HEAD see new and previously acknowledged HR announcements. Supervisors and Heads see forms assigned to them; HR and ADMIN see forms at the HR review stage; the Head HR also sees forms submitted by other HR accounts. Reviewed form notifications remain in the Inbox. Inbox filters support item type and status, and form items open the shared Manage Forms tab.
- Existing report, import, export, employee privacy, audit, and role-permission rules are enforced by the API, not by the browser.

## Incident Management workflow

- `IncidentWorkflowService.js` is the API facade. `incident-management/WorkflowReports.js`
  handles grouped filing and document reads; `WorkflowActions.js` enforces transitions;
  `WorkflowAccess.js` centralizes case authorization, evidence, activity, and transaction
  handling. `WorkflowQueries.js` owns role-specific lists, badges, and daily reminders.
- `IncidentWorkflowSchema.js` adds versioned section records and case groups through
  the existing startup initializer. Existing incidents remain version 1 and read-only;
  `IncidentService.js` retains their document readers, without retired write logic.
  For legacy records, only HR has internal review visibility. ADMIN participants
  receive participant access, and assigned ADMIN HEADs receive assigned-HEAD access;
  neither assignment nor ADMIN status grants draft NTEs, internal evaluations,
  disciplinary context, or other recipients' confidential request attachments.
  Reported employees retain issued documents and their own explanation attachments.
  Current-workflow HEAD and Management assignments keep their existing rules.
- Configure department HEAD/ADMIN reviewers and a Management approver in Manage
  Accounts using its existing Save Changes button. Startup seeds the supplied
  department defaults only when matching active accounts exist; missing HEAD accounts
  stay unassigned. HR and Human Resources employee department labels route to ADMIN 2.
  The Heads department supports two ADMIN reviewers, who alone can
  claim cases involving a HEAD or a HEAD's filing against STAFF in their own department.
  Reporters, reported employees, and witnesses cannot take those reviews. Any active
  ADMIN can be selected as Management approver.
- Only the designated Head HR can file as HR. Their reports route to the ADMIN assigned
  to the HR department; an uninvolved HR account handles the later evaluation.
- New cases share IR Filed, NTE Issued, and Closed circles across roles. Multiple IRs
  from one filing session share case progress but retain separate notices and outcomes.
- The sample NTE's sections I–VIII define the forms. The issuer signs VI; the reported
  employee signs receipt in VI and their explanation in VII. Five calendar days start
  from receipt. Read models and attachment endpoints enforce section-level access.
- HR tasks begin only after explanation submission. Hearings, employee information
  requests, and Management approval pause HR working-time clocks. Final action requires
  recorded Management approval. Finalized outcomes reuse the existing disciplinary
  history and configurable matrix; document snapshots preserve prior recommendations.
- `shared/IncidentWorkflow.js` supplies the same classifications, evidence choices,
  review indicators, and directive to browser and server. The existing signature pad,
  employee search, Inbox, popup, feedback, and task timing components are reused.

## Checks and sample records

Run `npm.cmd run check` for structural checks and `npm.cmd test` for regression
tests. Incident tests exercise the current workflow facade and browser controller;
legacy tracking and confidential-document tests remain covered. Leave approval
tests cover balance deductions, duplicate approvals and transaction rollback.
Service tests use synthetic SQL responses, and browser tests use a minimal DOM.
See [Regression coverage](docs/RegressionCoverage.md) for the baseline, changed
expectations and checks still requiring an isolated MySQL database or real browser.

### HR review ownership and performance

- ADMIN opens **Dashboard** for HR performance: completed reviews, current queues,
  trends, task reassignment, and ownership history. `PerformanceService.js` owns
  the analytics; `TaskService.js` owns claiming, authorization, and timing.
- Total Backlog counts all unfinished HR tasks; Unassigned Backlog is its subset
  without an owner. Both include employee-response waits, exclude completed work,
  and respect Request Type independently of Reviewer, date range, and Task List
  Status filters.
- Current Workload and Reviewer Performance count each HR's unfinished owned tasks
  as Tasks Assigned, including the Tasks Waiting for Employee Response subset.
- ADMIN's Dashboard reuses HR Performance; HR Reports stays inside Reports.
  Its old dashboard analytics endpoint is
  unavailable to ADMIN. Executive Summary is ADMIN-only. HR retains its existing
  analytics Dashboard and HR Reports navigation.
- Incidents Reviewed counts distinct case IDs per HR with recorded review work
  in the selected period. Repeated actions or multiple stages on one case do not
  increase this count. The summary and review trends deduplicate reports across
  HR accounts; reviewer comparisons count each report once for each HR involved.
  Incident Task Assignments lists recorded HR claims and assignments, one row per
  HR/report in the selected period, with its latest assignment time and current
  ownership state. Internal case activity stays in the existing audit history.
- `server/db/TaskSchema.js` runs through the existing database initializer on the
  next API restart. It creates task/event/revision tables and reporting
  indexes, and registers existing unresolved work as unassigned. It does not
  invent historical ownership or timing and does not delete existing records.
- Only HR can take a task and process form reviews or HR incident
  actions. Claims lock the underlying request row and enforce a unique task
  identity in the same transaction. Employee and assigned Supervisor/Head
  signature permissions remain separate. Head HR form reviews also use claims.
- Timer timestamps come from the server. `shared/WorkTime.js` supplies the same
  Monday–Friday, Manila 08:00–18:30 calculation to server and display clocks.
  Employee-response waits, hearings, and Management approval pause incident timing;
  completion and reassignment checkpoint
  earned time transactionally. Browser presence is not required. Public holidays
  are not excluded automatically. Durations measure turnaround, not effort.
- ADMIN retains form viewing access using `forms.view`. Incident access follows
  assigned cases; ADMINs acting as department HEADs may file/review and designated
  Management approvers may approve recommendations. Unassigned ADMINs are view-only.
  Performance statistics exclude ADMIN; old task activity remains in the audit
  history. Open tasks previously taken by ADMIN are released at API startup.
- Task ownership and earnings are retained per reviewer across transfers. ADMIN
  reassignment requires a reason. A changed Head HR releases previously taken
  Head HR tasks to the newly authorized reviewer, who must take them again.
  The replacement's own pending Head HR forms move to the HR queue for another
  HR reviewer, retaining the original task identity, history, and earned time.
- `TaskUI.js` checks a lightweight revision every 10 seconds while an HR/ADMIN
  tab is visible. It refreshes ownership and actionable badge counts without
  deleting inbox history. Backend ownership checks also reject stale actions.
- Duration targets, target statistics, their endpoint, and their configuration
  are removed. The startup migration preserves the revision counter and drops
  the obsolete configuration table. Historical completion counts reuse existing
  form and incident records; timing
  statistics include only tracked tasks. Current workload is independent of the
  completion date filter.

### Existing maintenance commands

Run the structural checks and JavaScript regression tests with:

```powershell
npm.cmd run check
npm.cmd test
```

Optional synthetic data commands (use an active account with the indicated permission):

```powershell
npm.cmd run sample-data -- generate hr-admin@example.com 60
npm.cmd run sample-data -- archive hr-admin@example.com
```
