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

Records from all configured accounts share the existing list, sorting, pagination,
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
scans, except that time out stays blank when the latest scan completes lunch or
only one distinct scan exists. Break inference uses a separate chronological
sequence that collapses
rescans within two minutes of the first scan in each cluster, even across devices.
The arrival cluster is excluded from break and lunch pairs. Lunch can use the
latest scan as its return so lunch remains visible during an ongoing workday.
Short AM/PM breaks still require a later scan to distinguish them from departure.

Lunch is selected before morning and afternoon breaks. A lunch beginning between
11:30 AM and 2:30 PM can last 10 to 120 minutes; an earlier lunch beginning between
10:30 AM and 11:30 AM must last at least 30 minutes. Candidates are ranked by
their distance from noon, then their distance from a 60-minute duration. AM and
PM breaks last 5 to 40 minutes, occur before or after lunch, and cannot reuse a
lunch scan. When no lunch is identified, midday gaps are left unclassified;
morning breaks must finish before 11:30 AM and afternoon breaks must start after
2:30 PM. These are timing estimates because the scanned events do not reliably
label a break's purpose. Work hours and attendance status still use the provider's
daily summary when available.
