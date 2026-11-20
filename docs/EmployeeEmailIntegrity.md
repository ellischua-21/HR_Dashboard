# Employee Email Integrity

## Rules

Nonblank Primary Emails (`personal_email`) must be unique across current and archived employee
records. Comparisons normalize surrounding whitespace and case; stored email
values are not automatically rewritten. Blank/null values remain allowed in
registration and import. A new registration with Primary Email requires account
access details: ADMIN saves create the account immediately, while HR saves need
ADMIN approval. Without Primary Email, registration saves only the
employee record; Secondary Email and Corporate Email never create accounts.

Employee edits cannot change or clear an email referenced by any account, active
or inactive, or by a pending account request. Equivalent edits preserve the
original spelling. Unlinked employees can change to an unused email. Unrelated
edits remain possible when an existing duplicate is present; those duplicates
still prevent ordinary authentication until separately resolved. The first-setup
ADMIN exception remains unchanged. Historical ownership, signatures, decisions,
notifications and audit records are not rewritten.
Account approval and CLI provisioning also reject employee-email collisions with
archived records instead of attaching an account to an unresolved identity.

Secondary Email (`secondary_email`) is optional and email-validated when supplied.
It has no identity uniqueness requirement and never links an account or replaces
Primary Email. Corporate Email remains an independent contact address.

## Transactions and limits

Employee save/archive, imports, account approval, CLI account creation and sample
archiving acquire the same database-scoped MySQL/MariaDB named lock before their
transaction. Employee registration creates its account request inside the locked
save transaction. Sample generation reuses the locked import service. The lock
uses `GET_LOCK` with a five-second acquisition timeout and is released after
commit or rollback. Uncertain acquisition/release errors destroy the connection
instead of returning potentially held locks to the pool. Contention returns a
retryable error; the five-second limit applies to lock acquisition, not total
transaction duration.

This coordinates participating writers on the same database server and database.
It is not a database uniqueness constraint. Direct SQL, old application versions,
external tools, or writers that omit the lock can bypass it. Deploy the updated
API and CLI files together. Existing conflicting records are neither scanned
against production nor repaired automatically. No schema migration is included.

## Imports

Valid rows continue to import while invalid rows receive individual errors.
Nonblank duplicate emails are checked against all stored employees and valid
rows in the request. Each committed 300-row chunk is visible to checks in later
chunks. A preview is not a reservation: separate preview chunks do not persist
their candidate emails, and every committed chunk revalidates against current
data. Earlier committed chunks are not undone if a later chunk has errors.

## Verification

`tests/EmployeeEmailIntegrity.test.js` exercises the real services with synthetic
database responses and a simulated connection lock. It covers duplicate/archived
emails, blanks, account-link protection, existing duplicates, 300-row chunks,
competing writes, approval conflicts, rollback and lock failures. The simulation
does not establish actual MySQL locking, collation, or HTTP-session behavior.

## Independent QA in an isolated database

1. Create/edit/import case and whitespace variants of one email, including an
   archived owner and a duplicate in a later 300-row chunk. Verify errors and
   valid partial imports. Confirm multiple blank emails remain permitted.
2. Try changing or clearing emails linked to active/inactive accounts and pending
   requests. Confirm rejection. Change an unlinked email and perform an equivalent
   linked-email edit; verify stored spelling, login and existing sessions.
3. Submit competing registrations, edits and imports from separate connections
   or API processes. Verify only one record claims the email. Race account
   approval against editing and verify the pending/account link survives.
4. Hold the named lock from another connection using
   `SELECT GET_LOCK(CONCAT('hris:employee-email:', MD5(DATABASE())), 0)`.
   Verify a write times out without changes. Release it with `RELEASE_LOCK` using
   the same name, then verify retry, rollback and connection reuse.
5. Verify first-time ADMIN creation, normal account approval, archive behavior,
   form/incident access, task ownership and notifications. Compare historical
   attribution before/after. Test the deployed database's actual email collation
   and confirm all participating application instances use the updated files.
