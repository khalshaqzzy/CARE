# ADR-0051: Web Push enrollment and delivery hardening for Android browsers

| Attribute | Value                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| Status    | Accepted                                                                                                            |
| Date      | 14 September 2026                                                                                                   |
| Scope     | Workforce PWA Web Push opt-in, service worker notification handling, push subscription API, push endpoint allowlist |

## Context

The in-app Notification Center is authoritative and Web Push is a best-effort channel (ADR-0001, ADR-0003, ADR-0010). On iOS Home Screen devices the opt-in works, but on Android browsers the same flow reports failure: either the subscription cannot be created or the browser permission dialog never appears. Two areas of the implementation were responsible.

The opt-in requested notification permission only after awaiting `navigator.serviceWorker.ready`. Chrome-based browsers, including Chrome for Android, present the notification prompt only while the triggering tap still holds transient user activation; when the service worker registration resolves late, the prompt is suppressed, `Notification.requestPermission()` resolves to `default`, and the previous code reported the outcome as a denial while leaving the control in an unchanged state.

The subscription write path keyed rows by `(accountId, installationId, environment)` while the table also enforces uniqueness on `(endpointHash, environment)`. Android browsers reuse one push endpoint per browser profile, so a re-enrollment after storage eviction, a WebAPK install, or a sign-in by a different account on the same device collided with the existing row and surfaced as an unhandled unique-constraint failure (HTTP 500). iOS issues a distinct endpoint per installation, which is why the defect did not reproduce there.

Three further defects reduced delivery reliability without producing a visible error. The service worker read a `url` payload field while the server sends `deepLink`, so tapping a notification could not open the referenced Voice; the service worker posted a `NOTIFICATION_NAVIGATE` message that no application code listened for, so a tap only focused an already-open window; and a rotated browser subscription was never re-registered, leaving a device that still appeared active while every delivery failed. Delivery also failed one subscription at a time: the first non-permanent provider error aborted the loop for the remaining devices and scheduled an outbox retry for all of them, including those that had already accepted the payload.

## Decision

**Request permission first.** The opt-in calls `Notification.requestPermission()` before any awaited operation so the prompt stays inside the tap's transient user activation, and it distinguishes a blocked permission (`denied`) from a suppressed or dismissed prompt (`default`) with separate, actionable guidance instead of a single "denied" message.

**Reuse or deliberately replace the browser subscription.** `ensureBrowserSubscription` reuses the existing subscription when it is bound to the expected VAPID key (or when the platform does not expose the bound key), and otherwise unsubscribes and resubscribes so a subscription created under a rotated key is healed. An `InvalidStateError` caused by a concurrent subscribe is reconciled once. Notification option building and payload parsing are extracted into a pure, unit-tested module that reads `deepLink` (accepting `url` as a legacy alias) and never throws on malformed bytes.

**Route notification taps.** The application subscribes to service worker messages and routes `NOTIFICATION_NAVIGATE` within the existing router; external or malformed targets are ignored.

**Own the endpoint rather than reject it.** `POST /notifications/push/subscriptions` reconciles the `(endpointHash, environment)` row inside one transaction: when the endpoint is presented by another account or a stale installation id, ownership is transferred to the current account and installation instead of failing. A single retry covers a concurrent insert race, so the opt-in never receives a unique-constraint error.

**Isolate delivery per device.** Delivery iterates every active subscription of the recipient; 404/410 retire the subscription immediately, other non-transient provider rejections (400/401/403) increment the failure counter without failing the outbox event, and only transient provider or network failures schedule a retry. A device that keeps failing is retired at a bounded failure count. Duplicate banners from an at-least-once retry are collapsed client-side by a per-Voice notification `tag`.

**Re-register rotated subscriptions.** The push status response exposes a truncated endpoint hash prefix so the client can detect, without receiving the endpoint itself, that the browser replaced its subscription; the client silently re-posts the current subscription when a mismatch is found, which removes the failure mode where a device stays listed as active while delivery fails.

**Allow shared push providers.** `PUSH_ENDPOINT_HOSTS` accepts `*.suffix` entries in addition to exact hostnames, and the default configuration includes `*.notify.windows.com`. Edge on Android and desktop uses Windows Notification Service hostnames that vary per environment; the previous exact-match allowlist rejected those endpoints, which contradicted the Chrome/Edge Android UAT target recorded in the PRD.

The push settings card also exposes a collapsible technical detail section (permission, service worker state, provider host, registration state, last failure) so a device-specific failure can be diagnosed from the affected phone without developer tooling. It contains no endpoint, key, or identity data.

## Alternatives considered

- Requesting permission from a separate pre-step button was rejected: it adds a second gesture and does not address the underlying activation ordering.
- Dropping the `(endpointHash, environment)` uniqueness constraint was rejected: the constraint prevents two accounts from pushing to one browser profile with divergent keys, and a migration was avoidable.
- Treating every provider rejection as permanent was rejected: a service-wide VAPID misconfiguration would then retire every device at once.
- Sending the raw endpoint to the client for comparison was rejected as unnecessary exposure of a delivery capability; the truncated hash prefix is sufficient for drift detection.
- Making notification deep links absolute URLs was rejected; only same-origin paths are accepted.

## Consequences

- A device that legitimately hosts multiple accounts keeps a single push registration: the most recently enrolled account receives the push for that browser profile, and a later enrollment by the previous account takes it back.
- Push delivery remains at-least-once. Duplicate banners for one Voice collapse into one notification slot, but a device may still receive a second push after a transient failure on another device.
- A device whose VAPID-bound key cannot be read (platforms that do not expose `options.applicationServerKey`) still requires an explicit re-enrollment after a VAPID key rotation; the deployment guide states this.
- Devices that reject delivery for non-transient reasons remain listed as active until the bounded failure count retires them; the push status endpoint reflects only active registrations.
- The push status response gained a field, the OpenAPI request bounds for `installationId` were aligned with the runtime schema, and the runtime environment validation accepts wildcard allowlist entries.
- The workforce bootstrap chunk grew by 2,461 bytes gzip (+1.7%) to 144,904 bytes. ADR-0026's compatibility budget is therefore re-recorded from that baseline, and the artifact gate now derives the +15% budget from the recorded value instead of a hand-tuned constant. No dependency, polyfill, or prohibited syntax was added; the growth is user-facing guidance copy, the diagnostic detail panel, and the push request hardening.

## Validation plan

- Web-voice unit tests cover endpoint hash derivation, key comparison, subscription reuse and replacement, the race reconciliation, payload parsing, notification option building, the failure classifier, guidance selection, and the settings-view resolver.
- API unit tests cover the allowlist matching (including suffix confinement), the transient/non-transient classification, per-device isolation, retirement, and outbox retry decisions.
- PostgreSQL integration tests cover FCM and Windows Notification Service enrollment, endpoint ownership transfer for a reinstalled installation and for a second account on one browser profile, a concurrent duplicate subscribe, rejected hostnames including a look-alike suffix, and environment-scoped unsubscription.
- Browser tests cover the gesture-scoped permission request, suppressed-prompt and device-push-service and server-failure guidance, subscription reuse, VAPID-rotation replacement, silent re-registration after rotation, denial guidance, and in-app routing of a notification tap.
- Legacy WebKit coverage verifies the application still boots and stays online-only when the service worker container is absent or undefined.

## Follow-up work

- Provisioning the VAPID key pair remains an environment prerequisite for staging and production; the local full stack intentionally keeps push degraded.
- A real end-to-end delivery on a physical Android device remains an operator acceptance step; the settings card's technical detail section is the intended evidence source when it fails.
- An in-app "send test notification" action was considered and deferred: it would add API surface beyond the current notification contract.
