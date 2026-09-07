# ADR-0040: Session-scoped Workforce Password Deferral

- Status: Accepted
- Date: 6 September 2026

## Context

Temporary workforce credentials previously created a restricted session that could access only authentication endpoints until the password was changed. Product workflow now requires employees to continue into CARE without changing the temporary password immediately, while presenting the change-password screen again on every later login. Union and CARE Admin credentials retain mandatory password change because those account types have broader privacy or administrative access.

The account-level `passwordChangeRequired` flag and session-level `passwordRestricted` flag already represent the persistent requirement and the authorization state of one login session separately.

## Decision

An authenticated, CSRF-protected `POST /api/v1/auth/defer-password-change` operation is added for `WORKFORCE` accounts. It idempotently changes only the current session's `passwordRestricted` value to `false` and returns the updated session contract. It never changes the password, `UserAccount.passwordChangeRequired`, another session, or a push subscription.

The restricted-session guard permits this operation alongside session, CSRF, logout, and password change. All other application endpoints remain unavailable until the employee either changes or defers the password. Union and CARE Admin calls are rejected by the backend and their frontends do not expose the action.

A successful restricted-to-unrestricted transition creates one sanitized `PASSWORD_CHANGE_DEFERRED` audit event. Replays against an already-unrestricted session return the current session without another event.

The workforce password page presents `Simpan password` as the primary action and `Lain kali` as a secondary action without a repeat-login helper below it. Logging out and authenticating again derives a restricted session from the unchanged account flag. Its password-policy helper uses the approved minimum/reuse copy, and failed changes stay on the form with state-specific safe messages. An incorrect current password returns `CURRENT_PASSWORD_INVALID` as a validation failure rather than invalidating an otherwise valid session.

## Rationale

Keeping the persistent requirement on the account provides the requested reminder semantics without introducing browser storage, a new database field, or a bypass shared by every session. Performing the transition on the server preserves authorization enforcement when clients call the API directly. Restricting eligibility by account kind keeps the higher-risk Union and Admin policies unchanged.

## Alternatives Considered

- A frontend-only bypass was rejected because the API guard would still deny application requests and client state could be forged.
- Clearing `UserAccount.passwordChangeRequired` was rejected because later logins would no longer show the prompt.
- Unlocking every active session was rejected because deferral is explicitly scoped to the current login session.
- Allowing Union or CARE Admin deferral was rejected because the approved scope is workforce employees only.

## Implementation Details

- OpenAPI and the generated TypeScript client expose the no-body mutation and `SessionResponse` result.
- The shared auth provider updates its session query immediately after a successful response and broadcasts the session change to tabs sharing the same browser session.
- The create-Voice copy, location placeholder, and composer label are updated together with the affected responsive visual baselines.

## Consequences

- Employees can use CARE with the unchanged temporary credential for one session, increasing the period in which that credential remains usable.
- Every new login remains restricted until an actual password change clears the account flag.
- Audit records distinguish explicit deferral from password change without recording credentials.
- No schema migration is required because both required persistence fields already exist.

## Validation Plan

- Integration tests cover CSRF, pre-defer restriction, current-session unlock, sibling-session isolation, persistent account flag, repeat idempotency/audit behavior, next-login restriction, permanent password change, and Union/Admin denial.
- Browser tests cover successful and failed deferral, password-change error states, account-kind visibility, keyboard/accessibility, responsive overflow, updated copy, and the real API login sequence.
- Updated and targeted new visual baselines cover login, password deferral, Voice type selection, the empty location field, and the Voice composer.

## Risks

- Temporary workforce passwords remain valid longer when users repeatedly defer. Existing Argon2id hashing, TLS, throttling, session expiry, explicit reminders, and Admin reset/session revocation remain the compensating controls.
- A stale frontend could omit the action, but it cannot broaden eligibility because the backend remains authoritative.

## Follow-up Work

- Review deferral frequency from sanitized audit events after rollout and reconsider policy if repeated deferral becomes operationally unacceptable.
