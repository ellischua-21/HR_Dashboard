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
- `public/js/UI.js`, `AppConfirm.js`, `EmployeeSearch.js`, and `SignaturePad.js` provide reusable browser behavior. `Main.js` owns navigation, route setup, session initialization, and page action guards.
- `public/js/incident-management/` separates filing/case composition (`IncidentManagement.js`), document layouts (`Documents.js`), NTEs and explanations (`Notice.js`), evaluation and decisions (`Evaluation.js`), investigations (`Investigation.js`), and the Track, Review, History, and Code of Conduct page controllers.
- Review supplies analytics, filters, and the case list. View buttons and inbox links select the case in Track for every role. Shared renderers provide the authorized actions and documents; History opens completed cases as read-only archives.
- `CodeOfConduct.js` owns the matrix, its configuration editor, and violation history. HR can search another employee's finalized records; other accounts see their own records. Authorized HR/ADMIN accounts edit rows and save changes directly; the saved matrix is immediately used by the guide. Historical case policy references are retained on the server.
- `shared/` contains browser/API form templates, status/edit rules, and Manila date/working-day calculations. New shared browser files must be added to the Apache allowlist and the asset loader.
- `server/server.js` wires API methods and evidence routes. `server/config/` defines employee fields and permissions, `server/middleware/Auth.js` enforces authentication and permissions, and `server/services/` owns domain workflows.
- `server/services/incident-management/` contains case visibility/tracking, Review filters, archives, COC policy storage, notification writers, safe activity timelines, and incident input validation. `IncidentService.js` coordinates lifecycle transactions.
- `server/utils/` contains shared sanitization, employee data conversion, pagination/filter validation, attachment responses, password hashing, and HTTP errors.
- `server/db/database.js` initializes the schema and compatibility migrations. Historical policy, signature, and case-subject records are retained.
- `scripts/` contains setup, account/sample-data tools, and structural checks. `tests/` contains unit and controller regression tests, with mocked database/network access.
- [Codebase audit](docs/CodebaseAudit.md) records cleanup changes, verification coverage, and remaining engineering limits.
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

   Other supported roles are `STAFF`, `SUPERVISOR`, `HEAD`, and `HR`. Run this command again to reset a user's password or role.

8. Start the API in a PowerShell window and leave it running:

   ```powershell
   npm.cmd start
   ```

9. Open **http://localhost/HR_Dashboard/** and sign in with the email and temporary password printed by the account command.

## Account registration and management

There is no public account-request option on the sign-in screen. HR and ADMIN create account requests through **Employee Registration** using the employee's Personal Email, role and initial password. STAFF requires an assigned SUPERVISOR, and SUPERVISOR requires an assigned HEAD. New accounts remain unable to sign in until an ADMIN approves them.

All users can change their own password by entering the current password and a new password (12–128 characters) in **Change Password**. ADMIN manages registration requests and accounts in **Manage Accounts**.

Only an account with the `ADMIN` role sees **Manage Accounts** and can approve or reject requests. The role and assigned Head appear in each request and are fixed when approved:

- **STAFF**: a personal dashboard for submitted-form history and status, plus form templates. STAFF cannot access employee records or the HR dashboard.
- **SUPERVISOR** and **HEAD**: the STAFF dashboard and form templates, plus **Review Requests** for assigned forms. Supervisors review assigned STAFF forms, while Heads review assigned SUPERVISOR forms. Both can sign and forward a request or reject it with a reason.
- **HR**: dashboard, full employee registration and record read/write, and reports, plus **Manage Forms** for requests forwarded to HR. The designated Head HR can also review forms submitted by other HR accounts. HR and ADMIN have the same complete employee fields; no separate sensitive-data permission is required.
- **ADMIN**: full system access, including account management and sensitive employee records.

The searchable Reports To field offers active or pending SUPERVISOR accounts for STAFF, and HEAD accounts for SUPERVISOR. Approve the assigned reviewer before approving their subordinate's account. ADMIN can change saved assignments in Manage Accounts. STAFF forms go to their Supervisor then HR; SUPERVISOR forms go to their Head then HR; HEAD forms go directly to HR. At API startup, legacy USER, MANAGER, and EXECUTIVE accounts are migrated to STAFF; HR_STAFF and HR_ADMIN migrate to HR; SYSTEM_ADMIN migrates to ADMIN. Bootstrap the initial administrator with the `create-user` command above. Grant **ADMIN** only to trusted administrators.

## User forms and leave requests

STAFF, SUPERVISOR and HEAD sign in to a personal dashboard, review submission status, filter by status or form type, and open the **Forms** tab. A STAFF, SUPERVISOR or HEAD account can edit a submitted form only while it is pending with its assigned reviewer; saving changes requires a new electronic signature. Forms rejected by the assigned reviewer or already forwarded to HR/Admin cannot be edited. Available templates use generic names: **Leave Application**, **Authority to Deduct**, **Time-In/Out Correction Request**, **Official Business / Travel Request**, **Overtime Request**, and **Time In/Out Record**. Forms collect the applicant's required details, their electronic signature, and their approved account name automatically. New submissions receive a serial number in `PREFIX-YEAR-SEQUENCE` format, with a separate sequence per form type and Manila calendar year. Each form type starts at `000001` in a new year. Prefixes and sequence widths are configured on each template in `shared/FormTemplates.js`. Previously assigned serial numbers are retained. Submitting a form does not open the print dialog; users can print or save a PDF later from their dashboard.

A STAFF form goes to its assigned Supervisor; a SUPERVISOR form goes to its assigned Head. The assigned reviewer can sign and forward it to HR or reject it with a reason. HEAD requests go directly to HR. Forms submitted by HR go to the designated Head HR; the Head HR's own forms go to the HR review queue so another HR account can review them. HR reviews forms forwarded to the HR stage. All reviewers use one **Manage Forms** tab; the API limits each account to the forms and review actions allowed by its role, Head HR designation, and the form's assigned reviewer and stage. Approval signatures are required only for form templates configured to require them; all rejections require a reason. Form lists are ordered by submission date/time, newest first, and can be filtered by status and form type. STAFF, SUPERVISOR and HEAD can view their submitted forms, including signatures and approver names.

## Moving employee records from Google Sheets

Export the current employee rows from the source spreadsheet to CSV or Excel, then use **Employee master list → Import** in the local dashboard. Map the spreadsheet headers to the matching employee fields, validate, and import. The normal validation, duplicate employee-number check, permissions, and audit logging apply. Lookup values start with the defaults in the original Apps Script configuration; add any organization-specific values to the `lookup_values` table before importing those values.

For manual account provisioning, bootstrap or recovery administrators can use `npm.cmd run create-user`; routine STAFF/SUPERVISOR/HEAD/HR account creation should use Employee Registration so an ADMIN can approve it. Google account roles are not copied automatically. The existing import/export feature does not carry supporting-document files, matching the original report behavior.

## Configuration and data

- `.env` contains local MySQL connection settings, the API port, allowed Apache origins, and the session secret. Do not commit it.
- The API listens on `127.0.0.1:3001` by default. If Apache uses a nonstandard host/port, add its origin (for example `http://localhost:8080`) to `CORS_ORIGINS`.
- The Node API runs separately from Apache. XAMPP's MySQL stores employees, user roles, lookup values, audit events, and system settings.
- ADMIN Audit Logs can be filtered by a start/end time and exact user email. Filter validation and SQL parameterization are enforced by the API.
- Only HR and ADMIN can create accounts, using Employee Registration. Personal Email is the login email; HR/ADMIN select STAFF, SUPERVISOR, HEAD, or HR and set an initial password. New accounts remain pending until an ADMIN approves them. STAFF needs a Supervisor and SUPERVISOR needs a Head selected in Reports To; pending reviewers must be approved first.
- HR and ADMIN can publish announcements from the Announcements tab. STAFF, SUPERVISOR and HEAD see unacknowledged announcements in a blurred modal after login; acknowledging records that announcement as seen for that account.
- All roles have an Inbox. STAFF, SUPERVISOR and HEAD see new and previously acknowledged HR announcements. Supervisors and Heads see forms assigned to them; HR and ADMIN see forms at the HR review stage; the Head HR also sees forms submitted by other HR accounts. Reviewed form notifications remain in the Inbox. Inbox filters support item type and status, and form items open the shared Manage Forms tab.
- Existing report, import, export, employee privacy, audit, and role-permission rules are enforced by the API, not by the browser.

## Checks and sample records

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
