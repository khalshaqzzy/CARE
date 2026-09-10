# ADR-0048: Registration-first Login and Birth-date Recovery

- Status: Accepted
- Date: 10 September 2026

## Context

The organization source now contains an optional Birth Date column and additional alphanumeric registration numbers. The supplied workbook contains 7,418 unique members: 7,018 numeric registrations with birth dates and 400 TM registrations without birth dates or sections. TM rows have the existing Team Member position and do not require a new role or workforce classification.

Authentication previously required both credentials immediately. Password recovery was limited to CARE Admin. Session-scoped workforce password deferral remains governed by ADR-0040.

## Decision

One workforce login page accepts both registration numbers and Union usernames under the visible No. Reg label. A server-side start operation determines the next step. Active workforce accounts whose account flag and hash confirm the default credential receive a restricted session immediately. All Union accounts and workforce accounts with personal passwords receive a password-entry step without a session. CARE Admin continues to use the Admin application.

A restricted workforce default-password session can set a new password without re-entering the current credential, or defer for that session. Union and ordinary password changes continue to require the current password. Credential changes revoke sibling sessions and their push associations. Reset, change and session creation lock the account row before inspecting credential state; Admin reset participates in the same locking boundary. Change and defer revalidate session revocation after acquiring the lock.

Recovery verifies a registration number and its stored calendar birth date. It is limited to active non-TM workforce accounts with a date available. TM and Union accounts receive the unavailable response, including direct API attempts. TM eligibility does not change merely because a later file supplies a date. Eligibility responses disclose neither names nor dates and do not authorize the reset operation.

Successful recovery restores the normalized default credential, requires a password change, revokes every session and active push association, and records a sanitized audit event with no claimed authenticated actor. It does not issue a login session. The client clears session-bound state and returns to login with the approved success message; another explicit login action opens the default-password screen.

## Data and Interface Changes

Employee gains a nullable PostgreSQL DATE column. Both XLSX and CSV accept the existing seven headers, or eight headers with Birth Date after Posisi (struktural). Excel date cells and strict ISO date strings are accepted; formulas, ambiguous dates and unexpected columns remain invalid. Calendar conversion uses UTC date components, including Excel's 1900/1904 epoch handling through ExcelJS.

Seven-column imports preserve existing dates. Eight-column imports update dates authoritatively, including explicit blanks. Preview counts date changes and reports available, missing and anomalous-age counts without returning date values. Source dates are not silently corrected; syntactically valid ages outside 15–80 are informational anomalies. The complete organization snapshot and existing password-preservation rules remain authoritative.

New public endpoints are login/start, password-reset/eligibility and password-reset under /api/v1/auth. The existing change-password request permits omission of currentPassword only under the server-enforced restricted-default rule. OpenAPI and shared generated-client transport expose these contracts. Public authentication operations reject mismatched Origin or cross-site browser requests, return no-store, and apply database-backed IP/account throttles. Clients without Origin remain supported for non-browser access; protected mutations retain CSRF.

## Rationale and Alternatives

Reusing existing account kinds, organization snapshots and session restrictions avoids a parallel membership system. Retaining seven-column support allows existing import tools to continue without clearing recovery data. A calendar-only date prevents timezone-dependent mismatches. A single login page preserves Union access without a separate role selector.

Mandatory temporary-password entry was considered but not selected for workforce default accounts. OTP/email recovery was not selected. Replacing the entire organization import with a separate TM import was rejected because the supplied workbook already includes the complete member population.

## Consequences and Risks

Knowing a workforce registration number is sufficient to obtain a default-password restricted session, and choosing Lain kali grants its permitted application access. This behavior is intentional; throttling does not make a registration number secret. Birth dates are low-entropy personal information, so recovery is weaker than possession-based verification. A successful reset again makes the default-credential path available. Login stages and recovery eligibility also disclose limited account state. These tradeoffs are part of the accepted workflow, not guarantees of strong identity verification.

Union always requires its password and cannot defer. Existing Admin reset remains available. Dates are kept out of session DTOs, public recovery responses, logs, audit payloads, screenshots and committed fixtures. Real organization source files are not committed.

## UI and Accessibility

Existing CARE hero artwork and tokens are retained. Password entry expands downward in approximately 240 ms without recentering the card. Reduced-motion settings, keyboard focus and hidden-control unmounting are supported. Recovery uses labeled native day/month/year controls. Loading, invalid data, unavailability and rate-limit states remain within the auth card.

## Validation

Validation includes both Excel epochs, invalid and omitted dates, legacy import preservation, date-only preview changes, credential preservation, direct reset denial, reset/session revocation, CSRF/origin/throttle boundaries and concurrent password changes. Browser coverage includes shared Union login, real-API recovery, reduced motion, keyboard, Axe, legacy WebKit and responsive overflow. Native captures cover the auth states at 360, 768 and 1440 pixels; 390 pixels receives behavioral coverage.

## Follow-up and Rollout

Deploy the additive migration with the API and client together, then review the authoritative import preview in the destination environment before applying the operational workbook. No operational data import or deployment is implied by local implementation. Monitor sanitized recovery and deferral audit events. Hosted release acceptance remains tied to the exact candidate SHA; local captures follow ADR-0047.
