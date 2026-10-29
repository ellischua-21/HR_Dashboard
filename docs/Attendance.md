# Attendance

HR and ADMIN accounts can open **Employees → Attendance**. The page reads Hik-Connect for Teams / HikCentral Connect transaction records on demand. It does not store attendance, enroll employees, or modify the scanner.

Add the Hik-Connect settings to the project's existing `.env` file:

```dotenv
HIKCONNECT_API_BASE_URL=https://YOUR-REGIONAL-API-HOST
HIKCONNECT_APP_KEY=YOUR_API_KEY
HIKCONNECT_SECRET_KEY=YOUR_API_SECRET
```

Use the regional API host supplied for the account, not a portal login URL, and omit any `/api/...` path. The API key and secret do not identify the region or API product. Credentials for consumer Hik-Connect or another Hikvision platform may require a different integration. Hikvision's [integration guide](https://tpp.hikvision.com/products/HC-Integration) describes Teams credentials and account setup.

Attendance opens on today's transactions. Select one date or use Previous day and Next day to load another day automatically. Employee, department, and status filters narrow the list. Transactions are grouped by department and sorted newest first within each department. Employee numbers and names are displayed as supplied by Hik-Connect. Refresh fetches fresh records for the selected day and filters.

Requests use HTTPS with timeouts and no redirects. Tokens stay in server memory; the browser receives no secrets or tokens. No database changes or new packages are required.
