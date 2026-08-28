# ADR-0010 — Workforce Web Push Opt-in, Offline Summary Cache, Accessibility Polish, and Two-App Playwright Gate

Status: Accepted
Date: 27 Agustus 2026
Deciders: CARE implementation team

## Context

The workforce application reached feature parity with the product contract on
the Member/responder/leadership journeys and on the Admin organization-operations
app, but the **Frontend Complete Gate** remained open. Several surface-level and
lifecycle gaps were still present on the workforce side:

- Web Push had a complete backend contract (`/push/public-key`, `/push/status`,
  `/push/subscriptions`, `/push/subscriptions/:installationId`), a VAPID config,
  an outbox delivery worker, and a service-worker `push`/`notificationclick`
  handler, but there was **no opt-in/opt-out flow** in the React app and no
  frontend wiring for the browser `PushManager`.
- The PWA precached only the app shell + `offline.html`; it offered no
  non-sensitive offline read of the member summary, and the privacy boundary for
  what could be cached was not enforced in code.
- Accessibility/responsive rigor existed for the Admin app (per-page Axe,
  no-overflow, focus, reduced motion) but not for the workforce routes.
- Playwright mocked-contract coverage for the workforce journeys was thin, and
  the gated full-stack project covered only the Admin origin.
- The create-voice wizard's "Lanjutkan" action from the visibility step updated
  the form state but never advanced to the detail step, so the wizard could not
  be driven past step one.
- The mobile login hero placed light `--text-inverse` text on the cobalt
  `--action-primary-bg` at 78 % opacity, which fell below the WCAG 2.1 AA
  4.5:1 contrast for body text.

## Decision

1. **Workforce Web Push opt-in.** A `useWebPush()` hook and a `PushSettingsCard`
   are added to the notifications surface (with a pointer from the account page).
   The card reads `GET /push/public-key` and `GET /push/status`, exposes an
   explicit-gesture subscribe/unsubscribe that registers the device with
   `PushManager`, POSTs the immutable endpoint + keys to `/push/subscriptions`,
   and removes it again (server `updateMany` deactivation plus best-effort
   browser unsubscribe). Every degraded path is surfaced as guidance rather than
   a silent failure: no VAPID **not configured**; browser unsupported; permission
   **denied**; and the iOS install caveat, which is gated to iOS user agents only
   so desktop browsers still get the switch. The in-app Notification Center
   remains authoritative.

2. **Privacy-safe offline summary cache.** The service worker registers a
   dedicated summary route for `GET /api/v1/dashboard/member` **before** the
   generic `/api/` network-only catch-all. On a successful online fetch it stores
   a stripped aggregate (`total`, `counts`, `generatedAt`) with `recent` and
   `draft` removed, so Private Voice titles and draft content never land in
   offline storage. On fetch failure it returns the cached aggregate. The member
   home reacts to the browser online/offline state with a stale banner and, while
   offline, suppresses the recent list and draft so a cached summary is read
   without leaking Private content or showing a misleading empty state.

3. **Workforce accessibility/responsive polish.** A per-route Playwright spec
   asserts WCAG 2.1 AA (Axe `wcag2a`/`wcag2aa`/`wcag21aa`), no document overflow
   at 360/768/1440, keyboard focus, reduced-motion rendering, and a 44 px mobile
   bottom-navigation touch target for the member, responder, union, login, and
   account surfaces. The mobile auth-brand body copy is raised to full
   `--text-inverse` to meet contrast AA.

4. **Create-wizard step transition fix.** The "Lanjutkan" action now also sets the
   wizard step to the detail step so a first-time voice can be completed.

5. **Two-app Playwright + security probes.** The workforce mock is expanded to an
   options-based `mockWorkforceApi` covering dashboards, drafts, classification,
   location review, lifecycle mutations, notifications, push, media, and csrf.
   New mocked-contract specs exercise every workforce route plus happy/error/
   empty states; a spec drives the Web Push state machine with stubbed browser
   APIs; and a security-probe spec verifies conditional Private identity hiding,
   aggregate non-leakage, CSRF on mutations, capability-gated action rendering,
   and media served only through the authorized endpoint. A gated workforce
   full-stack smoke reuses the seeded member `000128` and runs serially before
   the Admin full-stack journey so the member is still active.

6. **Visual baselines.** Two additional workforce screenshots (history and
   notifications at 360 px) are added, both with the clock pinned and the same
   elevated rasterization tolerance used by the dense design-system overview.

## Alternatives Considered

- **Skipping the Web Push opt-in UI and relying only on the backend + service
  worker.** Rejected: permission and installability must be an explicit,
  degradable user flow, and the contract endpoints were unused.
- **Caching the full member dashboard response.** Rejected: it includes `recent`
  voice titles and the draft, which can be Private content; the cached aggregate
  is stripped instead.
- **Adding a synthetic online indicator.** Rejected: the browser `navigator.onLine`
  plus a stripped cache is simpler and avoids inventing state.
- **Applying the iOS install caveat to every non-standalone context.** Rejected:
  desktop browsers would be blocked from enabling push; the caveat is gated to
  iOS user agents.
- **Asserting a hard 44 px minimum on every small ghost/text button.** Rejected for
  consistency with the Admin accessibility spec, which asserts Axe/overflow/
  focus/reduced-motion rather than every control height; the primary mobile
  navigation and controls are verified instead.
- **Adding a second full-stack seed.** Rejected: two seeds would each truncate the
  shared disposable database; the workforce smoke reuses the existing seeded
  member and runs first under a single worker.

## Implementation Details

- `apps/web-voice/src/lib/push.ts` + `push.test.ts`: base64url key decode, push
  support/install detection, iOS detection, stable installation id, subscription
  payload builder.
- `apps/web-voice/src/features/notifications/use-web-push.ts`,
  `PushSettingsCard.tsx`: opt-in state machine and UI.
- `apps/web-voice/src/workforce-api.ts`: `pushPublicKey`, `pushStatus`,
  `subscribePush`, `unsubscribePush`.
- `apps/web-voice/src/sw.ts`: stripped dashboard aggregate cache registered
  before the `/api/` network-only catch-all.
- `apps/web-voice/src/lib/use-online-status.ts`, `features/home/HomePage.tsx`,
  `components/StatusSummary.tsx`: offline stale banner + recent/draft suppression.
- `apps/web-voice/src/features/create/CreateVoicePage.tsx`: wizard step advance.
- `apps/web-voice/src/features/notifications/NotificationsPage.tsx`,
  `features/account/AccountPage.tsx`: push entries.
- `apps/web-voice/src/styles.css`: push-settings styles, auth-brand contrast fix.
- `apps/web-voice/src/foundation.test.ts`: SW cache/privacy/push-handler
  boundary assertions.
- `e2e/helpers/mock-api.ts`: `mockWorkforceApi` (options-based) plus media and
  push fixtures; legacy `mockApi` delegates.
- e2e: `workforce-a11y.spec.ts`, `workforce-journeys.spec.ts`,
  `workforce-push.spec.ts`, `workforce-security.spec.ts`,
  `workforce.visual.spec.ts`, `a-workforce-fullstack.spec.ts`.
- `playwright.config.ts`: the gated `fullstack` project runs a single worker for
  deterministic serial ordering of the shared database.
- Visual baselines: `workforce-history-360.png`, `workforce-notifications-360.png`.

## Consequences

- Web Push is now a real, degrade-gracefully workflow in the workforce app; the
  Notification Center stays authoritative and Private payloads remain generic.
- Offline storage can never contain Private Voice titles or draft content; a
  cached summary carries only aggregate counts and a generated-at timestamp.
- The workforce surface meets the same accessibility/responsive bar as the Admin
  app, and the mobile auth hero meets AA contrast.
- The create-voice wizard can be completed through the UI.
- The mocked e2e suite covers every workforce route and the security/privacy
  boundary; the gated full-stack run also exercises a real member login,
  forced-password change, and voice read against the API + disposable DB.
- The workforce full-stack run is ordered by a single worker and a filename that
  sorts before the Admin full-stack journey, which itself resets/deactivates the
  seeded workforce.

## Validation

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` green (full
  monorepo; workforce PWA precache 12 entries, Admin bundle reported).
- `pnpm test:unit` — API 34, `packages/ui` 8, `packages/frontend-core` 9,
  `apps/web-voice` 19 (4 foundation + 10 formatters + 5 push), `apps/web-admin` 2.
- Playwright (chromium + visual + pwa) — 95 passed (30 new workforce mocked/a11y/
  push/security + 2 new workforce visuals), including the existing Admin/design,
  and the gated `fullstack` project for the Admin journey.
- The service worker's offline fallback, cache-exclusion, origin-isolation, and
  PWA artifact assertions still pass.

## Risks and Follow-up

- Browser Web Push delivery cannot be exercised in headless CI; the subscribe
  flow is validated with stubbed `Notification`/`PushManager`, and real delivery
  plus VAPID credentials are reserved for the staging rehearsal (per the delivery
  track).
- The offline summary cache applies only to an already-running session since a
  hard reload while offline is served `offline.html`; this is an accepted
  best-effort read, not a queued mutation.
- The new visual baselines use the elevated `maxDiffPixelRatio` to absorb
  macOS/ubuntu font rasterization drift, matching the dense design-system
  overview; a future workforce layout change should regenerate them with the
  clock pinned.
- The gated workforce full-stack smoke depends on the Admin e2e seed and the
  single-worker ordering; if the seed or the full-stack project changes, the
  ordering and re-use contract should be revisited.
