# Attendance

HR and ADMIN accounts can open **Employees → Attendance**. The page reads Hik-Connect for Teams / HikCentral Connect transaction records on demand. It does not store attendance, enroll employees, or modify the scanner.

Add the Hik-Connect settings to the project's existing `.env` file:

```dotenv
HIKCONNECT_API_BASE_URL=https://YOUR-REGIONAL-API-HOST
HIKCONNECT_APP_KEY=YOUR_API_KEY
HIKCONNECT_SECRET_KEY=YOUR_API_SECRET
```

To combine another Hik-Connect account in the same Attendance page, keep the
existing settings and add the following to `.env`:

```dotenv
HIKCONNECT_2_API_BASE_URL=https://YOUR-REGIONAL-API-HOST
HIKCONNECT_2_APP_KEY=SECOND_ACCOUNT_API_KEY
HIKCONNECT_2_SECRET_KEY=SECOND_ACCOUNT_API_SECRET
```

Restart the Node.js server after changing these settings, then open Attendance or
click Refresh. Additional accounts use `HIKCONNECT_3_`, `HIKCONNECT_4_`, and so on.
Each account needs all three settings. Blank optional accounts are ignored;
partially configured accounts must be completed before attendance can load.

Records from all configured accounts share the existing list, sorting,
and filters. Departments found in their records for the selected date are added
automatically to the department filter. Matching department names share one filter
option. No employee or department records are imported into the HRIS database.

Each account has its own cached token and request queue. Daily summaries and
punches are matched within their own account before records are combined, so
identical employee IDs in different accounts do not mix attendance details.
Records are not deduplicated across accounts because identical IDs may represent
different people. If any account's transaction retrieval fails, the combined list
is not returned or cached as a successful result; the error identifies the account
number. Daily summary retrieval retains the existing fallback to transaction data
when the provider cannot supply the summary.

Use the regional API host supplied for the account, not a portal login URL, and omit any `/api/...` path. The API key and secret do not identify the region or API product. Credentials for consumer Hik-Connect or another Hikvision platform may require a different integration. Hikvision's [integration guide](https://tpp.hikvision.com/products/HC-Integration) describes Teams credentials and account setup.

Attendance opens on today's transactions. Select one date or use Previous day and Next day to load another day automatically. Employee, department, and status filters narrow the list. Transactions are grouped by department and sorted newest first within each department. Employee numbers and names are displayed as supplied by Hik-Connect. Refresh fetches fresh records for the selected day and filters.

Requests use HTTPS with timeouts and no redirects. Tokens stay in server memory; the browser receives no secrets or tokens. No database changes or new packages are required.

The table shows one row per employee and day within each connected account, with
device names combined. Time in and time out use the original first and last
scans, except that time out stays blank when the latest scan completes a break or lunch, or
only one distinct scan exists. Break inference uses a separate chronological
sequence that collapses
rescans within two minutes of the first scan in each cluster, even across devices.
The arrival cluster is excluded from break and lunch pairs. Completed AM/PM breaks
and lunch appear as soon as their return scan is fetched, without requiring a
later scan. Their return scans cannot also become Time Out.

Lunch is selected before morning and afternoon breaks. A lunch beginning between
11:30 AM and 2:30 PM can last more than 2 and up to 120 minutes; an earlier lunch beginning between
10:30 AM and 11:30 AM must last at least 30 minutes. Candidates are ranked by
their distance from noon, then their distance from a 60-minute duration. AM and
PM break recognition allows gaps longer than two minutes and up to 120 minutes,
so an overlong break can still be displayed and flagged. These recognition limits
are separate from the permitted 15-minute duration. Breaks occur before or after
lunch and cannot reuse a lunch scan. A PM pair must finish before 6:30 PM to avoid
classifying the regular departure as a break return.
When no lunch is identified, midday gaps are left unclassified;
morning breaks must finish before 11:30 AM and afternoon breaks must start after
2:30 PM. These are timing estimates because the scanned events do not reliably
label a break's purpose. Work Hours is calculated as Time Out minus Time In,
including lunch and breaks. It remains blank when Time Out is unavailable.

The arrow in Time Logs shows the original events in chronological order, with
the time (including seconds), device name and device serial number for each event. Scans are
not classified by alternating IN/OUT positions; extra scans do not shift the
classification of every later event.

## Attendance status

Status is calculated in the HRIS using Manila local time. Device status codes and
device work-duration calculations are ignored.

| Status | Rule |
| --- | --- |
| On-time | Time In before 8:11 AM, with no early departure. |
| Late | Time In at or after 8:11 AM. |
| Early departure | Time Out before 6:30 PM. |
| Late and early departure | Both Late and Early departure apply. |
| Absent | No valid Time In is available. |
| Overtime | Time Out at or after 7:01 PM, with a valid Time In. |

On-time or Late is shown when Time Out is missing. Overtime appears as a separate
badge alongside On-time or Late and is available in the status filter. Since scanner
events do not reliably identify direction, Time Out and Overtime are estimates.
No Leave status
is inferred or copied from the device. Daily-report employees with no scans are
included so missing attendance can appear. When only a daily-report row exists,
its clock-in/clock-out values supply the times and HRIS calculates the status.
If the provider returns neither a scan nor a daily-report row for an employee,
there is no roster entry from which to identify that employee's absence.

## Break status

Completed AM, lunch, and PM breaks contribute to one Normal Break or Abnormal
Break badge in Status. Any identified abnormal break makes the badge Abnormal;
when all identified breaks are normal, it is Normal. Its tooltip identifies each
break and explains the result. Missing break pairs do not contribute a status;
missing scans do not prove a break was taken incorrectly.

- AM break may start from 9:57 AM to 10:03 AM.
- PM break may start from 2:57 PM to 3:03 PM.
- AM and PM breaks must last no more than 15 minutes from the actual break-out time.
  There is no additional duration grace period.
- A start outside its window or a duration over 15 minutes is Abnormal.
- Examples: 9:57 to 10:12 is Normal; 9:57 to 10:15 is Abnormal;
  10:03 to 10:18 is Normal. Durations use scan seconds when supplied.
- Lunch may start from 11:55 AM to 12:10 PM and may last up to one hour
  from lunch out. A start outside that window or a duration longer than one hour,
  including by one second, is Abnormal. Returning early is Normal.

Hover over a break badge to see its reason. Break badges do not replace the main
attendance status. The status filter applies to the main attendance status.

## Personal-dashboard identity links

The existing Daily Attendance card reads the same calculated times and raw logs
as HR Attendance. The server derives the employee from the authenticated account;
caller-supplied employee selectors cannot change that identity.

Automatic matching requires a unique normalized first-and-last-name match in the
employee roster and one unconfirmed scanner identity for that employee in the
selected day's returned records. Matching ignores case, accents, punctuation, and
extra whitespace; it does not use partial or fuzzy name matching. Scanner IDs do
not need to equal employee numbers. Duplicate employee names or multiple matching
scanner identities need HR/Admin confirmation, including identities in different
connected accounts. Archived records are not eligible targets.

In HR Attendance, **Link employee** under ID opens a search of employee records.
Suggestions show No., employee number, and department to distinguish duplicate
names. After confirmation, `attendance_employee_links` stores the provider-account
namespace, scanner ID, normalized scanner name, employee record ID, confirming HR
account, and confirmation time. The table is created idempotently at startup.
Only HR/Admin with employee-write permission can save a link; writes and audit
events share a transaction. Concurrent changes require reopening the dialog.

Confirmed links override automatic matching and can be corrected through the same
action. If the scanner's name changes or its linked employee is archived, the link
is withheld pending a new confirmation. Configure a replacement scanner account
under a new account namespace rather than reusing an old namespace with different
people. A day with no scanner data stays blank; a link cannot invent missing scans.
