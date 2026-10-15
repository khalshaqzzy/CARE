# ADR-0065: Account login tracking for CARE Admin

- Status: Accepted (implemented on a branch, not released)
- Date: 15 October 2026
- Related: ADR-0047 (validation), PRD §19 (audit), Admin › Accounts and Audit

## Context

The CARE Admin wants to know whether everyone in a division has started using CARE. Nothing answered this. The Audit page offered a `USER_LOGIN` filter, but the API never wrote that event. Accounts had no login timestamp. Sessions are pruned and revoked, so they are not a login history. `passwordChangeRequired = false` is not a proxy either, because a member can defer the password change and keep using the default password.

## Decision

- **Two timestamps on the account.** `UserAccount.firstLoginAt` and `lastLoginAt` are nullable and set in the same transaction that creates the login session. The update is raw SQL so a login does not bump the optimistic `version` or `updatedAt` that Admin mutations rely on.
- **Tracking starts at deploy.** Existing accounts stay `NULL`. History before the release cannot be recovered, so the UI shows "Sejak <tanggal>" from the migration's `finished_at`, and "Belum pernah" means "not since tracking began".
- **What counts as a login.** Any session creation: password login (`PASSWORD`) and the No. Reg first-login flow that opens a restricted session (`DEFAULT_PASSWORD`). A No. Reg lookup that only answers `PASSWORD_REQUIRED` is not a login.
- **Audit event `USER_LOGIN`.** `SUCCESS` carries the account as actor and resource, `{ method, firstLogin }`, IP hash, user agent and session reference. `FAILED` is written outside the rolled-back transaction with `{ method }` and the account id only when the account exists. The submitted identifier and password are never stored. Throttled requests are not audited because the throttle already bounds them.
- **Admin read model.** `GET /admin/accounts` gains `division`, `department`, `section` (active snapshot membership) and `loggedIn=true|false`. `GET /admin/accounts/login-summary` counts active workforce accounts in the active snapshot, total and logged in, grouped one level below the chosen unit (divisions, then departments, then sections).
- **Admin UI (variant B of three rendered options).** Accounts gets a "Login terakhir" column, Divisi/Departemen/Seksi and Login filters, and, once a division is chosen, a summary card with three KPI tiles (Akun aktif, Sudah login, Belum login) and one bar per department or section. The two login tiles filter the list to active workforce accounts. "Ekspor belum login" pages through the filtered list and downloads a CSV of No. Reg, name, division, department, section and position.

## Alternatives considered

- Derive logins from `Session`: rejected, sessions are revoked and cleaned up, and a long-lived session hides repeat use.
- Audit events only, counted on demand: rejected for the summary, because a column on the account keeps the per-division count to one grouped query on the 50k seed. The audit trail still records every attempt.
- A login counter or full login history table: not needed for the question asked. The audit trail already holds the history.
- A server-side CSV endpoint: deferred. Client paging at 100 rows is enough for a division and reuses the list contract.
