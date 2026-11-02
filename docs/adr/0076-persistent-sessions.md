# ADR-0076: Persistent sessions, push on at every login, and logout confirmation

- Status: Accepted (implemented locally, not released)
- Date: 2 November 2026
- Related: PRD §8.5 (Session Security) and §19 (PWA and Web Push), ADR-0073 (Web Push on by default), ADR-0066 (mandatory first password change), ADR-0068 (Division Admin)
- Amends: PRD §8.5 session lifetime ("default idle 8 jam dan absolute 7 hari"); ADR-0073 opt-out persistence (an explicit switch-off is now remembered only until the next login)

## Context

CARE authenticates with an opaque server-side session in an `HttpOnly` cookie. Until now every account kind shared one lifetime policy:

- a **sliding idle expiry** of `SESSION_IDLE_HOURS` (default 8 hours), extended on each authenticated request; and
- a **fixed absolute expiry** of `SESSION_ABSOLUTE_DAYS` (default 7 days) from login, which the idle extension never passed. The cookie's `Expires` was set once, at login, to the absolute expiry.

This produced sign-outs that users had not asked for:

1. Anyone who did not open CARE for more than 8 hours (overnight, a weekend, a shift break) found the login page on the next launch.
2. Everyone was signed out 7 days after login, however active they were.
3. Separately, the web clients treated **any** failure of the bootstrap session request (`GET /api/v1/auth/session`) as "signed out". A dropped mobile connection, a cold start before the network was ready, or the few seconds of a deployment restart sent a user with a perfectly valid session to the login page. The session query also had `retry: false`, so one failed request was enough.

Workforce members use CARE as an installed PWA mainly to receive Web Push about their Voices and work items. Unwanted sign-outs undermine that: a member who taps a notification lands on the login screen and loses the deep link. Push delivery itself never depended on session validity (the outbox delivers to every active subscription of the recipient account), but **logout** deliberately deactivates the device's subscription, and users had no warning of that consequence. Logout from the workforce top bar and desktop sidebar also happened on a single tap with no confirmation; only the Akun page asked first.

Finally, ADR-0073 made push on by default but remembered an explicit switch-off on the device indefinitely (`care-push-opt-out:<accountId>` in `localStorage`). A member who had once switched push off stayed off across every later login on that device.

The expected behavior, for every account kind, is the one common to mobile apps: once signed in, the user stays signed in until they choose to log out; each login starts with notifications on; and logging out is a deliberate, confirmed action whose effect on notifications is stated.

## Decision

### One persistent session policy for every account kind

The policy lives in `apps/api/src/auth/session-policy.ts` and is applied by session creation (`AuthService.createSession`) and by the authentication guard (`AuthGuard`). It applies equally to workforce, CARE Admin and Division Admin accounts.

- At login, `expiresAt` and `absoluteExpiresAt` are both set to now + `SESSION_INACTIVE_DAYS` (default **90 days**, maximum 365).
- Each authenticated request rolls the expiry forward. To avoid rewriting the expiry and re-sending the cookie on every request, it advances in **whole-day steps**: when now + the window is at least one day beyond the stored expiry, both columns are moved forward and the cookie is re-issued with the new `Expires`. Otherwise only `lastSeenAt` is written, as before.
- The logout request is excluded from cookie renewal, so its response carries only the clearing `Set-Cookie`.
- A session therefore ends only through **logout**, an existing **security revocation** (password reset or change revokes other sessions; deactivation; organization-import omission; Union slot replacement; Division Admin replacement), or **about 90 days without any use**.
- Cookie attributes (`HttpOnly`, `Secure` outside development/test, `SameSite=Lax`, `Path=/`) are unchanged and set by one helper, `setSessionCookie`, used by login and renewal.
- `SESSION_IDLE_HOURS` and `SESSION_ABSOLUTE_DAYS` are retired from the API configuration, `.env.example` and `setup-local.ts`.

### Existing sessions

No migration is needed. A session created under the old policy that is still valid is converted on its next authenticated request: its stored absolute expiry is more than a day short of now + 90 days, so it is renewed and the cookie re-issued. Sessions that had already expired under the old policy cannot be revived; those users sign in once more. The storage reconciliation job, which deletes sessions whose `absoluteExpiresAt` has passed, keeps working because active sessions keep moving that value forward.

### Session check failures are not sign-outs

In `@care/frontend-core`:

- The bootstrap session query retries up to three times with the default backoff unless the failure is a `401` (`FrontendError.kind === 'unauthenticated'`).
- `AuthProvider` exposes `unavailable`: no session is known, the last check failed, and the failure was not a `401`.
- `SessionGate` accepts an optional `unavailable` element and renders it (or the loading element when none is given) instead of the unauthenticated redirect in that state.
- Both web apps pass a small retry state built from the existing `ErrorState` component: "CARE belum terhubung" / "CARE Admin belum terhubung", "Periksa koneksi Anda, lalu coba lagi.", with **Coba lagi** refetching the session. React Query's refetch-on-reconnect also recovers automatically when the connection returns.

A `401` from any request still clears local state and leads to the login page, exactly as before.

### Push is on at every workforce login

The workforce login page clears the device's push opt-out flag for the account (`setPushOptedOut(accountId, false)`) as soon as a login succeeds, both for password login and for the first-login default-password path. The existing default-on enrollment from ADR-0073 then runs for the new session: silently when the browser permission is already granted, otherwise from the member's first tap in the app. A switch-off in the push card still takes effect immediately and lasts until that member logs out and signs in again. Browser-level limits are unchanged: a permission the member blocked in the browser, an unsupported browser, or iOS outside the Home Screen cannot be overridden by the app.

### Logout asks for confirmation

Every **Keluar** control in the workforce app (top bar, desktop sidebar, Akun page) opens one shared dialog, `LogoutDialog` (`apps/web-voice/src/features/account/LogoutDialog.tsx`):

- title "Yakin keluar dari CARE?";
- body "Notifikasi update Voice tidak akan masuk ke perangkat ini, jadi update bisa terlewat.";
- **Batal** closes the dialog without any request; **Keluar** (danger) logs out and navigates to `/login`.

The Akun page's previous dialog ("Keluar dari CARE?", with a note about saving work) is replaced by the shared one. The Admin app is unchanged: it has no Web Push, so the notification warning does not apply there.

## Rationale

- **Matches user expectations and the purpose of the PWA.** People install CARE to be notified; staying signed in until logout is what installed apps do.
- **The server stays the authority.** The session is still opaque, server-side, revocable and bound to a CSRF secret. Only its self-expiry changed; every explicit revocation path is untouched.
- **A long inactivity limit instead of "never".** A device that is lost, handed over or abandoned stops being signed in after about 90 days of no use, while anyone using CARE even occasionally never reaches it. 90 days stays far below the roughly 400-day ceiling browsers place on cookie lifetimes, and renewal on use keeps the cookie ahead of it.
- **Daily renewal steps** bound the cost: at most one extra `Set-Cookie` and one expiry update per session per day, with no extra query (the guard already reads and writes the session row on every request).
- **One policy for all account kinds.** Admin and Division Admin users experienced the same unwanted sign-outs; a single policy is simpler to reason about and to operate.
- **Separating "signed out" from "could not check"** fixes sign-outs that were not caused by expiry at all, which no server-side lifetime change could fix.
- **Resetting the opt-out at login** makes "push on by default" hold per session, which is what the product asks for, while still honoring a switch-off for the rest of that session.
- **Confirming logout** turns the one remaining way to lose notifications into a deliberate choice, and states the consequence in one sentence, in keeping with the minimal-copy rule for CARE screens.

## Alternatives considered

- **Only raise `SESSION_IDLE_HOURS` and `SESSION_ABSOLUTE_DAYS` through the environment.** Rejected: the absolute limit would still sign active users out on a fixed date, the cookie would still carry the login-time expiry, and the network-failure sign-outs would remain.
- **Keep short sessions for Admin-app accounts.** Considered and initially implemented. Rejected because Admin and Division Admin users must not be signed out without logging out either; their protection remains revocation on password change, deactivation and replacement.
- **No expiry at all.** Rejected: an abandoned device would stay signed in indefinitely, and browsers cap cookie lifetimes anyway, so a renewal mechanism is needed regardless.
- **Refresh tokens or a separate "remember me" token.** Rejected: adds a second credential type, rotation and reuse detection for no benefit over a revocable server-side session that already slides.
- **Renewing the cookie on every request.** Rejected: an unnecessary `Set-Cookie` on every API response and a wider window for a concurrent request to re-set a cookie around logout.
- **Storing the push opt-out on the server.** Rejected for now (as in ADR-0073): the flag is per device, and clearing it at login achieves the requested behavior with no API or schema change.
- **Requesting notification permission inside the login button tap.** Rejected: the prompt would appear before the credentials are verified, and the login request's await can consume the tap's user activation. The first tap after login (ADR-0073) remains the trigger.
- **A logout confirmation in the Admin app too.** Not done: the warning is about push, which the Admin app does not use.

## Implementation details

- `apps/api/src/config.ts`: `SESSION_INACTIVE_DAYS` (positive, max 365, default 90) replaces `SESSION_IDLE_HOURS` and `SESSION_ABSOLUTE_DAYS`.
- `apps/api/src/auth/session-policy.ts`: `initialSessionExpiry`, `refreshedSessionExpiry`, `setSessionCookie`.
- `apps/api/src/auth/auth.service.ts`: session creation uses `initialSessionExpiry`; login uses `setSessionCookie`.
- `apps/api/src/auth/auth.guard.ts`: refresh writes both expiry columns and re-issues the cookie when renewed (except on logout).
- `apps/api/scripts/setup-local.ts`, `.env.example`: retired keys removed; `.env.example` shows `SESSION_INACTIVE_DAYS=90`.
- Deployment: `deploy/scripts/render-runtime-env.sh`, `deploy/compose/docker-compose.remote.yml`, `deploy/env/runtime.staging.env.example` and `.env.local.example` still write or pass `SESSION_IDLE_HOURS` and `SESSION_ABSOLUTE_DAYS`. The API no longer reads them, so they are inert; they are left in place to keep this change out of the deployment pipeline. `SESSION_INACTIVE_DAYS` is not in the hosted runtime allowlist, so the code default applies on hosted environments.
- `packages/frontend-core/src/auth.tsx`: session query retry rule, `unavailable` in the auth context, `SessionGate` `unavailable` prop.
- `apps/web-voice/src/App.tsx`: `SessionUnavailable` state; login clears the push opt-out; top bar and sidebar **Keluar** open `LogoutDialog`.
- `apps/web-voice/src/features/account/LogoutDialog.tsx` (new), `AccountPage.tsx`: shared confirmation dialog.
- `apps/web-voice/src/lib/push.ts`, `use-web-push.ts`: comments updated for the opt-out lifetime.
- `apps/web-admin/src/App.tsx`: `SessionUnavailable` state.
- No database migration, API contract, OpenAPI or service worker change.

## Consequences

- Users of both apps stay signed in across days, weeks and app restarts. Tapping a push notification opens the target screen instead of the login page.
- A session on a device that is not used for about 90 days ends; the next launch shows the login page.
- Opening CARE without a connection, or during a deployment restart, shows a short retry state instead of the login page. While the session check is being retried (about 7 seconds in total), the existing "Memeriksa sesi" loader is shown.
- Every workforce login re-enables push on that device. A member who wants it off switches it off again after each login.
- Logging out of the workforce app always takes two taps and states that Voice updates may be missed.
- Session rows of active users live longer; the session table grows with the number of signed-in devices rather than with logins per week. At the current scale (about 9,000 members) this is negligible.
- Security posture: a stolen session cookie, including an Admin one, stays usable for longer if the device itself is not used. Mitigations remain: `HttpOnly`/`Secure`/`SameSite` cookie, server-side revocation on logout, password reset/change, deactivation and replacement, and the inactivity limit.

## Validation

- `apps/api/test/integration/session-persistence.integration.test.ts` (new):
  - a workforce login gets a ~90-day expiry and matching cookie; a session signed in 60 days ago and unused for 30 days is accepted, renewed to ~90 days, and the response re-issues the cookie with the new expiry; a second request the same day neither rewrites the expiry nor sends a cookie;
  - a session created under the old 7-day limit is upgraded on its next request;
  - an expired session returns `401`; logout of a session due for renewal returns only the clearing cookie and the session is then rejected;
  - an Admin login gets the same ~90-day expiry, and an Admin session signed in 10 days ago and idle overnight is accepted and renewed.
- `packages/frontend-core/src/test/auth.test.tsx`: a session check that fails with `502` shows the unavailable state (never login) and recovers on retry; a `401` shows login after a single request.
- Locally on Windows (portable Node 22.23.4, pnpm 11.8.0, throwaway pgvector Postgres): the new suite plus `login-tracking`, `auth-recovery`, `push-subscription` and `division-admin` integration suites (24 tests) pass; API unit tests 170/170; frontend-core 16/16; web-voice 159/159 and web-admin 2/2 Vitest; the PWA compatibility bundle gate (workforce main chunk 164,734 bytes gzip, budget 166,640); `tsc --noEmit` for api, frontend-core, web-voice and web-admin; ESLint and Prettier on changed files.
- A one-off Playwright check against the built workforce app with the mocked API (not kept in the suite) confirmed on a 390 px mobile viewport (Akun page) and a 1280 px desktop viewport (sidebar) that **Keluar** opens the dialog with the notification warning, **Batal** sends no logout request, and **Keluar** logs out and lands on `/login`.

## Risks and follow-up

- Confirm after deployment, on a real Android Chrome and an iOS Home Screen install, that a user signed in before the release stays signed in after a day without use (their session must still be valid at release time to be converted), and that a new login re-enables push.
- Remove `SESSION_IDLE_HOURS` and `SESSION_ABSOLUTE_DAYS` from the deployment renderer, Compose file and env examples in a deployment-scoped change; add `SESSION_INACTIVE_DAYS` to the runtime allowlist there if a hosted override is wanted.
- The login-time opt-out reset and the logout dialog have no permanent browser test yet; add them to the push/workforce Playwright suites (bumping the inventory count in `scripts/validation/validation.test.mjs`).
- A CSRF mismatch on a mutation still returns `401` and therefore clears the local session. This is not known to occur in practice, but a distinct status for CSRF failures would make that path recoverable without a sign-out.
- Consider a "sign out other devices" action in Akun if users ask to end persistent sessions on devices they no longer have.
