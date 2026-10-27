# HR Management System — XAMPP and MySQL

This version keeps the existing dashboard screens and browser behavior, serves the HTML/CSS/JavaScript through XAMPP Apache, and replaces Apps Script RPC and Google Sheets storage with a local Node.js API and MySQL.

## Requirements

- XAMPP with Apache and MySQL
- Node.js 18 or newer
- The project folder located at `C:\xampp\htdocs\HR_Dashboard`

## Project layout

- `public/` contains the browser application: `index.html`, CSS, JavaScript, and HTML view fragments.
- `public/views/` contains page markup; `public/js/` contains page controllers and shared navigation behavior; `public/css/` contains application styles.
- `public/views/incident-management/` and `public/js/incident-management/` contain the Incident Management interface and its role-based navigation/controller code.
- `public/js/incident-management/Track.js` owns the inline case selector, progress tracker, and stage panels. It reuses the case document/signature renderers and checks a small version response before reloading case documents. Viewing Track does not start HR evaluation; management actions open Review.
- `server/services/incident-management/Tracking.js` builds stage dates and closure paths and defines the involvement scope shared by Track, History, and badge queries. STAFF/HEAD badges count active involved cases until closure; HR/ADMIN badges belong to Review.
- `public/js/incident-management/Review.js` owns the HR/ADMIN dashboard, searchable paginated case list, and inline workspace. Waiting contains active cases without an HR signature; Ongoing contains active cases with one. Summary counts cover the full authorized scope. Closed cases are read-only, and Review badges count all unresolved cases.
- `server/services/incident-management/Review.js` validates dashboard filters and defines shared case groups. `public/js/incident-management/Progress.js` renders the progression shared by Track and Review. The dashboard reuses existing case actions, permissions, notifications, and database tables.
- `tests/IncidentReview.test.js` covers dashboard filters, counts, pagination, role restrictions, workflow gates, and notification routing.
- `public/js/incident-management/History.js` provides paginated, filtered archives for involved STAFF/HEAD accounts. `server/services/incident-management/Archive.js` enforces case scope and serves finalized personal disciplinary records; HR/ADMIN can select employee records with their employee-read permission.
- `CodeOfConduct.js` owns the employee guide and violation-history panels; `CodeConfiguration.js` owns the existing configuration editor. `server/services/incident-management/Conduct.js` publishes immutable COC versions, serves optional approved PDFs, and captures policy configurations used by new NTEs/evaluations. Only HR/ADMIN with `incidents.coc.manage` can edit or publish policies. The supplied progressive matrix starts as a database draft and does not impose sanctions. Approved versions carry an effective date; rule-specific actions continue to govern existing recommendations.
- Part 8 adds policy-version, matrix-draft, and document-policy tables through the existing additive database initialization. Restart the Node server after updating. Existing case documents retain their previously saved policy text; no historical version is guessed or backfilled.
- Part 9 reuses the inbox and announcement dialog for incident updates. Ordinary events stay in the inbox; unresolved signature requests and daily NTE reminders use popups. Notification links select the case in Track for STAFF/HEAD and Review for HR/ADMIN, including closed cases. Badges continue to count unresolved cases independently of read status.
- `server/services/incident-management/Notifications.js` supplies event titles. `Activity.js` defines the safe employee timeline, displayed by `public/js/incident-management/Timeline.js`. Internal remarks and document references remain restricted to reviewers, with the full audit log kept separately. New activity records include server timestamps and previous/new statuses; older signature entries use their original recorded dates.
- Daily NTE popup claims are unique per notice, employee, and Manila calendar date. Approaching-deadline inbox notices are unique per deadline; overdue notifications also support approved extensions. `system_settings.INCIDENT_NTE_REMINDER_DAYS` controls the approaching-deadline threshold (default 2 working days). Reminder processing runs during authenticated refreshes; visible sessions check popups every minute. Restart the server to apply the additive activity-column and reminder-index migrations.
- `tests/IncidentTracking.test.js` covers case access, stage progression, early closure, persistent badges, and unauthorized actions. Run it with the existing suite using `npm.cmd test`.
- Part 10 adds an additive case-subject relationship and subject-scoped NTE, evaluation, decision, and disciplinary-history records. Existing cases are backfilled with their current reported employee; the filing form remains unchanged. New report signatures store a SHA-256 version of the submitted report and original evidence; older signatures are explicitly marked `LEGACY-UNVERIFIED` because their signed content cannot be reconstructed safely. Case and document reads are audited, and evidence uploaded for an information request is visible only to HR/ADMIN, its recipient, or its requester. Incident Reports can be opened in a print-ready page and saved as PDF through the browser.
- `tests/IncidentSecurity.test.js` covers request-evidence privacy and audit logging. The focused suite runs with `npm.cmd test`; database migrations should still be verified against the configured MySQL instance before deployment.
- `shared/` contains form templates and status rules used by both the browser and the API.
- `server/` contains the Node.js API, grouped into `config/`, `db/`, `middleware/`, `services/`, and `utils/`. `config/` separates application settings, employee schema, and role permissions; domain workflows belong in `services/`.
- `scripts/` contains setup and administrator command-line tools.
- `tests/` contains the Node.js test suite.
- `node_modules/` contains installed dependencies and can be recreated with `npm.cmd install`.

Apache uses the root `.htaccess` file to redirect `http://localhost/HR_Dashboard/` to `public/` and block access to server-side code and dependencies.

## Code organization

Keep page structure in its matching `public/views/` fragment and page-specific behavior in the matching `public/js/` controller. Put reusable browser behavior in a shared controller or module rather than duplicating it across pages. Keep form definitions shared when they are consumed by both the browser and API; forms with distinct workflows may keep dedicated markup and behavior. Put business rules and data validation on the server, with reusable logic in `server/services/` and authoritative field/permission definitions in `server/config/`. Incident Report tables are added by the existing database initialization, and the shared signature pad is in `public/js/SignaturePad.js`. Use `npm.cmd run format` to format first-party JavaScript, HTML, and CSS consistently.

## First-time setup

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

   Other supported roles are `STAFF`, `HEAD`, and `HR`. Run this command again to reset a user's password or role.

8. Start the API in a PowerShell window and leave it running:

   ```powershell
   npm.cmd start
   ```

9. Open **http://localhost/HR_Dashboard/** and sign in with the email and temporary password printed by the account command.

## Account registration and management

There is no public account-request option on the sign-in screen. HR and ADMIN create account requests through **Employee Registration** using the employee's Personal Email, a role (STAFF, HEAD, or HR), an initial password, and an optional assigned Head. STAFF requests require an assigned Head. New accounts remain unable to sign in until an ADMIN approves them.

All users can change their own password by entering the current password and a new password (12–128 characters) in **Change Password**. ADMIN manages registration requests and accounts in **Manage Accounts**.

Only an account with the `ADMIN` role sees **Manage Accounts** and can approve or reject requests. The role and assigned Head appear in each request and are fixed when approved:

- **STAFF**: a personal dashboard for submitted-form history and status, plus form templates. STAFF cannot access employee records or the HR dashboard.
- **HEAD**: the STAFF dashboard and form templates, plus **Manage Forms** for requests assigned to the account. A Head can sign and forward a request or reject it with a reason.
- **HR**: dashboard, employee read/write, and reports, plus **Manage Forms** for requests forwarded to HR. The designated Head HR can also review forms submitted by other HR accounts.
- **ADMIN**: full system access, including account management and sensitive employee records.

The account-registration form uses a searchable Reports To field to select active or pending HEAD accounts. Approve a pending Head before approving requests assigned to them. The account-management screen lists approved accounts by role and lets only ADMIN change Head assignments after approval. STAFF must have an active assigned Head before submitting forms; HEAD accounts may have no assigned Head, and no top-level Head role is required. Each form is routed only to its directly assigned Head before HR/Admin, so Head-to-Head assignments do not recursively route forms. STAFF and HEAD can see their assigned Head on their submitted-forms page. At API startup, legacy USER, MANAGER, and EXECUTIVE accounts are migrated to STAFF; HR_STAFF and HR_ADMIN migrate to HR; SYSTEM_ADMIN migrates to ADMIN. Bootstrap the initial administrator with the `create-user` command above. Grant **ADMIN** only to trusted administrators.

## User forms and leave requests

STAFF and HEAD sign in to a personal dashboard, review submission status, filter by status or form type, and open the **Forms** tab. A STAFF or HEAD account can edit a submitted form only while it is pending with its assigned Head; saving changes requires a new electronic signature. Forms rejected by a Head or already forwarded to HR/Admin cannot be edited. Available templates use generic names: **Leave Application**, **Authority to Deduct**, **Time-In/Out Correction Request**, **Official Business / Travel Request**, **Overtime Request**, and **Time In/Out Record**. Forms collect the applicant's required details, their electronic signature, and their approved account name automatically. New submissions receive a serial number in `PREFIX-YEAR-SEQUENCE` format, with a separate sequence per form type and Manila calendar year. Each form type starts at `000001` in a new year. Prefixes and sequence widths are configured on each template in `shared/FormTemplates.js`. Previously assigned serial numbers are retained. Submitting a form does not open the print dialog; users can print or save a PDF later from their dashboard.

When submitted by STAFF or an assigned HEAD, a form first enters the submitter's direct Head queue. The assigned Head can sign and forward it to HR or reject it with a reason. A HEAD without an assigned Head sends requests directly to HR. Forms submitted by HR go to the designated Head HR; the Head HR's own forms go to the HR review queue so another HR account can review them. HR reviews forms forwarded to the HR stage. All reviewers use one **Manage Forms** tab; the API limits each account to the forms and review actions allowed by its role, Head HR designation, and the form's assigned reviewer and stage. Approval signatures are required only for form templates configured to require them; all rejections require a reason. Form lists are ordered by submission date/time, newest first, and can be filtered by status and form type. STAFF and HEAD can view their submitted forms, including signatures and approver names.

## Moving employee records from Google Sheets

Export the current employee rows from the source spreadsheet to CSV or Excel, then use **Employee master list → Import** in the local dashboard. Map the spreadsheet headers to the matching employee fields, validate, and import. The normal validation, duplicate employee-number check, permissions, and audit logging apply. Lookup values start with the defaults in the original Apps Script configuration; add any organization-specific values to the `lookup_values` table before importing those values.

For manual account provisioning, bootstrap or recovery administrators can use `npm.cmd run create-user`; routine STAFF/HEAD/HR account creation should use Employee Registration so an ADMIN can approve it. Google account roles are not copied automatically. The existing import/export feature does not carry supporting-document files, matching the original report behavior.

## Configuration and data

- `.env` contains local MySQL connection settings, the API port, allowed Apache origins, and the session secret. Do not commit it.
- The API listens on `127.0.0.1:3001` by default. If Apache uses a nonstandard host/port, add its origin (for example `http://localhost:8080`) to `CORS_ORIGINS`.
- The Node API runs separately from Apache. XAMPP's MySQL stores employees, user roles, lookup values, audit events, and system settings.
- ADMIN Audit Logs can be filtered by a start/end time and exact user email. Filter validation and SQL parameterization are enforced by the API.
- Only HR and ADMIN can create accounts, using Employee Registration. Personal Email is the login email; HR/ADMIN select STAFF, HEAD, or HR and set an initial password. New accounts remain pending until an ADMIN approves them in Manage Accounts. STAFF and HEAD need a Head selected in the searchable Reports To field; pending Head requests can be selected but must be approved first.
- HR and ADMIN can publish announcements from the Announcements tab. STAFF and HEAD see unacknowledged announcements in a blurred modal after login; acknowledging records that announcement as seen for that account.
- All roles have an Inbox. STAFF and HEAD see new and previously acknowledged HR announcements. Heads see forms assigned to them; HR and ADMIN see forms at the HR review stage; the Head HR also sees forms submitted by other HR accounts. Reviewed form notifications remain in the Inbox. Inbox filters support item type and status, and form items open the shared Manage Forms tab.
- Existing report, import, export, employee privacy, audit, and role-permission rules are enforced by the API, not by the browser.

## Checks and sample records

Run the focused JavaScript unit tests with:

```powershell
npm.cmd test
```

Optional synthetic data commands (use an active account with the indicated permission):

```powershell
npm.cmd run sample-data -- generate hr-admin@example.com 60
npm.cmd run sample-data -- archive hr-admin@example.com
```
