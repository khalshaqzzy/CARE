# ADR-0066: Mandatory First Password Change

- Status: Accepted
- Date: 15 October 2026
- Supersedes: ADR-0040; amends the deferral parts of ADR-0048

## Context

Workforce accounts are imported with an initial password equal to the registration number (No. Reg). Under ADR-0048, entering a registration number whose account still holds that default credential opens a restricted session immediately. ADR-0040 then allowed `WORKFORCE` accounts to choose **Lain kali**, which removed the restriction from the current session while `UserAccount.passwordChangeRequired` stayed `true`.

Together these rules meant that anyone who knew the registration number of an employee who had never changed the password could open CARE as that employee and read their data without setting any password. Registration numbers are not secret, so the deferral turned a forced-change screen into an open door.

## Decision

The deferral capability is removed. No account kind can use the application while a password change is required.

- `POST /api/v1/auth/defer-password-change` is removed from the API, OpenAPI document, generated client, shared transport and auth provider. Calls now return the generic 404.
- The authentication guard derives the restriction from either `Session.passwordRestricted` or the account's `passwordChangeRequired` flag. Sessions that were unrestricted by an earlier deferral are therefore restricted again on their next request, without a data migration. A restricted session may reach only session, CSRF, change-password and logout; every other endpoint returns 404.
- The session contract reports `passwordChangeRequired: true` for such sessions, so both web apps route every protected page to the change-password screen until the change succeeds.
- A restricted `WORKFORCE` session whose account still holds the default credential may set a new password without the current one, regardless of the session's stored flag. This lets a previously deferred session finish the change in place. Union and CARE Admin still supply the current password.
- The workforce change-password screen keeps **Simpan password** as its only primary action, plus **Kembali ke login**, which logs out. The **Lain kali** button and its error copy are removed.

## Rationale

Deriving the restriction from the account flag in the guard closes the gap for existing deferred sessions immediately and keeps the database schema unchanged. Removing the endpoint, rather than making it refuse, leaves no unused authorization path to maintain.

## Alternatives Considered

- Keeping the endpoint but rejecting every call was rejected because it keeps a dead contract in OpenAPI and the client.
- A migration that sets `passwordRestricted = true` on existing sessions was rejected because it fixes only sessions that exist at deploy time. Admin or self-service resets that set the flag later would depend on separate session handling.
- Revoking all sessions of accounts that still require a change was rejected as unnecessary. The guard restriction already blocks data access, and users keep their session to complete the change.

## Implementation Details

- `AuthGuard` passes the effective restriction to `PolicyService.resolvePrincipal`. The capability check and the restricted-path allowlist then use it.
- `AuthService.changePassword` allows omitting the current password when the account is `WORKFORCE`, `passwordChangeRequired` is set and the stored hash still matches the default credential.
- Existing `PASSWORD_CHANGE_DEFERRED` audit events remain as historical records. No new events of that type are written.

## Consequences

- A fresh imported account cannot reach any application page or API data until a new password is saved.
- Knowing a registration number whose default credential is unchanged still opens the change-password screen (ADR-0048). Whoever completes that screen first sets the password. This residual first-claim risk is outside this decision and is noted below.
- Employees who previously chose Lain kali are sent to the change-password screen on their next request.

## Validation

- API integration tests cover: the removed endpoint (404) for all account kinds; denial of protected endpoints for restricted default sessions; a session unrestricted in the database staying restricted while the account flag is set; changing the password from such a session without the current password; sibling-session revocation; and access after the change.
- Browser tests cover the absent Lain kali action, redirection of protected routes to the change-password screen, the current-password requirement for Union, accessibility and responsive containment at 360, 768 and 1440 px, and the real-API member, manager and recovery journeys.
- The visual scenario for the deferral action is removed, so the capture contract drops from 184 to 183 scenarios.

## Risks and Follow-up

- First-claim risk: the default-credential login still identifies an account by its registration number alone. A birth-date step before the first password change was prototyped and declined in favour of the simpler No. Reg then new password flow. The risk is accepted.
- Employees without a personal password must finish the change before their next CARE use. Support should expect questions after release.
