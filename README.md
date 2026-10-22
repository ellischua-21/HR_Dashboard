# HR Management System — XAMPP and MySQL

This version keeps the existing dashboard screens and browser behavior, serves the HTML/CSS/JavaScript through XAMPP Apache, and replaces Apps Script RPC and Google Sheets storage with a local Node.js API and MySQL.

## Requirements

- XAMPP with Apache and MySQL
- Node.js 18 or newer
- The project folder located at `C:\xampp\htdocs\HR_Dashboard`

## Project layout

- `public/` contains the browser application: `index.html`, CSS, JavaScript, and HTML view fragments.
- `shared/` contains form templates used by both the browser and the API.
- `server/` contains the Node.js API, grouped into `config/`, `db/`, `middleware/`, `services/`, and `utils/`.
- `scripts/` contains setup and administrator command-line tools.
- `tests/` contains the Node.js test suite.
- `node_modules/` contains installed dependencies and can be recreated with `npm.cmd install`.

Apache uses the root `.htaccess` file to redirect `http://localhost/HR_Dashboard/` to `public/` and block access to server-side code and dependencies.

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

Visitors can choose **Request an account** on the sign-in screen. They submit their name, email, and a password (minimum 12 characters); the password is stored as a hash and the new account remains unable to sign in until approved. This local workflow does not verify email ownership, so confirm a requester's identity before approving it.

Users and HR can use **Account Management** to change their own password by entering the current password and a new password (12–128 characters). System Administrators can change their password in **Manage Accounts**, alongside registration requests, role assignment, and account lists.

Only an account with the `ADMIN` role sees **Manage Accounts** and can approve or reject requests. On approval, the administrator assigns one of these access levels:

- **STAFF**: a personal dashboard for submitted-form history and status, plus form templates. STAFF cannot access employee records or the HR dashboard.
- **HEAD**: the STAFF dashboard and form templates, plus a queue for forms assigned to the account. HEAD can sign and forward forms or reject them with a reason.
- **HR**: dashboard, employee read/write, and reports, plus the HR form-review queue.
- **ADMIN**: full system access, including account management and sensitive employee records.

The account-management screen lists approved accounts by role and lets Admin assign a direct Head to each STAFF account and optionally assign any active HEAD to another HEAD account. STAFF must have an active assigned Head before submitting forms; HEAD accounts may have no assigned Head, and no top-level Head role is required. Each form is routed only to its directly assigned Head before HR/Admin, so Head-to-Head assignments do not recursively route forms. STAFF and HEAD can see their assigned Head on their submitted-forms page. At API startup, legacy USER, MANAGER, and EXECUTIVE accounts are migrated to STAFF; HR_STAFF and HR_ADMIN migrate to HR; SYSTEM_ADMIN migrates to ADMIN. Bootstrap the initial administrator with the `create-user` command above. Grant **ADMIN** only to trusted administrators.

## User forms and leave requests

STAFF and HEAD sign in to a personal dashboard, review submission status, filter by status or form type, and open the **Forms** tab. A STAFF or HEAD account can edit a submitted form only while it is pending with its assigned Head; saving changes requires a new electronic signature. Forms rejected by a Head or already forwarded to HR/Admin cannot be edited. Available templates use generic names: **Leave Application**, **Authority to Deduct**, **Time-In/Out Correction Request**, **Official Business / Travel Request**, **Overtime Request**, and **Time In/Out Record**. Forms collect the applicant's required details, their electronic signature, and their approved account name automatically. New submissions receive a serial number in `PREFIX-YEAR-SEQUENCE` format, with a separate sequence per form type and Manila calendar year. Each form type starts at `000001` in a new year. Prefixes and sequence widths are configured on each template in `shared/FormTemplates.js`. Previously assigned serial numbers are retained. Submitting a form does not open the print dialog; users can print or save a PDF later from their dashboard.

When submitted by STAFF or an assigned HEAD, a form first enters the submitter's direct Head queue. The Head can sign and forward it to HR/Admin, or reject it with a reason. A HEAD without an assigned Head sends its own submissions directly to HR/Admin. HR, Admin, and the assigned Head can open completed forms in **Manage Forms**, including signatures available from each approval stage; HR/Admin can also view forms rejected by a Head. HR/Admin approval requires a signature, while rejection requires a reason. Form lists are ordered by submission date/time, newest first, and can be filtered by status and form type. STAFF and HEAD can view their submitted forms, including final approval signatures and approver names. The form store and review actions are permission-gated by the API.

## Moving employee records from Google Sheets

Export the current employee rows from the source spreadsheet to CSV or Excel, then use **Employee master list → Import** in the local dashboard. Map the spreadsheet headers to the matching employee fields, validate, and import. The normal validation, duplicate employee-number check, permissions, and audit logging apply. Lookup values start with the defaults in the original Apps Script configuration; add any organization-specific values to the `lookup_values` table before importing those values.

Create local accounts separately with `npm.cmd run create-user`; Google account roles are not copied automatically. The existing import/export feature does not carry supporting-document files, matching the original report behavior.

## Configuration and data

- `.env` contains local MySQL connection settings, the API port, allowed Apache origins, and the session secret. Do not commit it.
- The API listens on `127.0.0.1:3001` by default. If Apache uses a nonstandard host/port, add its origin (for example `http://localhost:8080`) to `CORS_ORIGINS`.
- The Node API runs separately from Apache. XAMPP's MySQL stores employees, user roles, lookup values, audit events, and system settings.
- ADMIN Audit Logs can be filtered by a start/end time and exact user email. Filter validation and SQL parameterization are enforced by the API.
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
