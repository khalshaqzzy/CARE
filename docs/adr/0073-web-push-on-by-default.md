# ADR-0073: Web Push on by default

- Status: Accepted (implemented locally, not released)
- Date: 28 October 2026
- Related: PRD §19.1 and §19.4, ADR-0047 (shared validation)
- Supersedes: the explicit opt-in rule for Web Push (PRD §19.1 "setelah user memberi izin melalui explicit gesture")

## Context

Web Push was strictly opt-in: a member had to open Notifikasi, find the push card and switch it on. Many members never did, so they did not see new Voices, assignments, chat messages or closures until they opened the app. Every logout and password reset also revokes the device subscription, so members who had switched it on once silently lost push after signing in again.

Browsers do not allow a site to turn push on by itself. A subscription needs the notification permission, and when the permission has not been decided yet, the prompt is shown only inside a user tap (transient user activation). iOS/iPadOS additionally requires the app to run from the Home Screen (16.4 or later).

## Decision

- **Push is on by default.** The signed-in workforce shell mounts `PushAutoEnable` (`use-web-push.ts`, `useWebPush({ autoEnable: true })`). When push is supported and configured on the server, the status is loaded, and this installation is not registered, the app enrolls the device itself:
  - permission already **granted**: the subscription is registered silently on load;
  - permission **not decided** (`default`): the browser prompt is raised from the member's next tap anywhere in the app, so it keeps the tap's user activation; taps on the push settings card are left to the card's own switch;
  - permission **denied** or push **unsupported** (including iOS outside the Home Screen): nothing is attempted, and the card keeps its existing guidance.
- **One automatic attempt per session.** The attempt is tracked per session id for the page lifetime. A dismissed prompt or a failed enrollment is not repeated on every tap; the next login (which revoked the server subscription) or the next app launch tries again. Chrome's own prompt embargo applies after repeated dismissals.
- **Only an explicit switch-off is remembered.** Turning the switch off in the push card stores `care-push-opt-out:<accountId>` in the device's `localStorage`; turning it on clears it. While the flag is set the app does not enroll that account on that device. Storage failures read as "not opted out", so the default stays on.
- **Rotated endpoint repair is shared.** The set of endpoints already re-registered is module-level, so the shell and the settings card do not both re-register the same rotated endpoint.
- Server, API contract, payload privacy and subscription lifecycle are unchanged. The in-app Notification Center remains authoritative and push remains best-effort.

## Alternatives considered

- **A full-screen or banner prompt after login asking to enable notifications.** Rejected: adds screens and copy to a deliberately minimal app, and still depends on the member tapping it.
- **Calling `Notification.requestPermission()` on load without a tap.** Rejected: Chrome Android and Safari suppress or ignore prompts without user activation, and Chrome then marks the site for the quiet permission UI.
- **Storing the opt-out on the server.** Rejected for now: subscriptions are already per installation, a device-local flag needs no migration or API change, and the switch is a per-device choice. A server-side preference can be added later if members want one setting across devices.
- **Re-prompting on every tap after a dismissal.** Rejected: intrusive, and repeated dismissals lead Chrome to block the prompt automatically.

## Consequences

- Members on supported devices receive push without visiting the settings card; members who already granted permission are re-enrolled automatically after logout, reset or a new login.
- The first tap after login on an undecided device shows the browser's notification prompt. That tap still performs its normal action.
- The opt-out is per device and per account; clearing site data or using another device returns to the default (on).
- No database, API, OpenAPI or service worker change.

## Validation

- `e2e/workforce-push.spec.ts` (push project, built app with the production service worker): silent enrollment with granted permission and no tap; prompt only after the first tap when undecided; no enrollment and no prompt for an opted-out device; switching off writes the opt-out flag. The existing manual opt-in, failure-guidance, subscription-reuse and VAPID-rotation tests run with the opt-out flag so they still exercise the explicit switch. All 15 push tests pass locally.
- `web-voice` typecheck, ESLint and the notification/push Vitest suites pass.

## Risks and follow-up

- A member who taps something during the prompt may dismiss it unintentionally; the next app launch asks again, and the card's **Coba lagi** remains available.
- Real-device confirmation on Chrome Android and iOS Home Screen is still needed after deploy.
- If members ask for one notification setting across devices, move the opt-out to a server-side preference.
