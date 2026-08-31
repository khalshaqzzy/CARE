# ADR-0026: iOS Legacy PWA Capability Tiers

Date: 31 August 2026
Status: Accepted

## Context

The workforce PWA previously shipped Vite's default modern target and mounted
React directly from the module entry. Safari on early iOS 11.3 can load ES
modules, but it cannot parse or execute several constructs and APIs present in
that output. A syntax error, failed chunk, or startup exception occurred before
React owned the root, leaving users with a white screen. Web Push was already
limited to newer iOS and was not the root cause.

CARE must keep all online workforce workflows usable from iOS 11.3 while
preserving current PWA/offline/push behavior on capable Safari, Android, and
desktop browsers. Backend, Admin, database, OpenAPI, cookie, and privacy
contracts must remain unchanged.

## Decision

The workforce uses one lowered ES-module bundle for `safari11.3`, including the
custom service worker. `@vitejs/plugin-legacy` is not used: iOS 11.3 supports ES
modules, and the plugin's inline bootstrap scripts would require weakening the
current `script-src 'self'` CSP.

A same-origin classic ES5 bootstrap executes before the module entry. It
provides `globalThis`, `Object.fromEntries`, `String.prototype.replaceAll`,
`Array.prototype.at`, and `queueMicrotask`, preserves a static loading shell,
and replaces that shell with retry/compatibility guidance if the application
does not mark itself mounted within the timeout.

One internal resolver emits `unsupported`, `core-online`, `pwa`, or `push`:

- iOS below 11.3 or a runtime missing core APIs is unsupported;
- iOS 11.3 and any other core-capable runtime can use every online workforce
  workflow and the in-app Notification Center;
- service-worker behavior is enabled only after Service Worker, Cache Storage,
  Request/Response, `Promise.allSettled`, and Workbox initialization succeed;
- Web Push on iOS additionally requires iOS 16.4+, Home Screen mode, Push API,
  Notification API, and VAPID configuration. Android/non-iOS remains
  capability-driven and has no iOS Home Screen rule.

Workbox is dynamically imported after the PWA probe. Failure never blocks React
and degrades to Core Online. Core Online performs one-time best-effort cleanup
of an old `/sw.js` registration and CARE/Workbox caches. Shared Select renders a
native control when PointerEvent or ResizeObserver is missing; modern Radix UI
remains a progressive enhancement. Production CSS declares legacy colors,
viewport units, physical offsets, and spacing before modern declarations.

## Consequences

- Legacy iOS receives simpler controls and styling but retains readable,
  touch-operable online login, read, create/upload, chat, and lifecycle actions.
- Notification Center remains authoritative on platforms without Web Push.
- The single lowered bundle avoids dual-build routing and CSP exceptions, at
  the cost of modestly less optimized output for modern browsers.
- Service-worker and push failures become explicit degraded states instead of
  application startup failures.
- `/design` remains current-browser-only and is not imported on legacy iOS.

## Alternatives Considered

- `@vitejs/plugin-legacy` and differential bundles: rejected because iOS 11.3
  already has module support, the added inline scripts conflict with CSP, and a
  second delivery path increases cache/update complexity.
- Large DOM/API polyfill packages: rejected in favor of native-control and
  feature-gated fallbacks that keep the main bundle bounded.
- Version-gating Service Worker: rejected because WebKit capability and runtime
  quality do not map cleanly to a single version. Version checks are restricted
  to the iOS minimum and user guidance.

## Validation

Unit tests cover iPhone and desktop-style iPad version parsing, tier
transitions, Android behavior, bootstrap polyfills, and mount-timeout fallback.
The production artifact gate checks target configuration, script ordering, CSP
compatibility, prohibited syntax in entry/worker output, and a +15% gzip budget.
A current Playwright WebKit project emulates the iOS 11.3 UA and missing modern
APIs while exercising representative member and responder online journeys.

Real-device iOS 11.3 is not a release acceptance requirement. Legacy support is
therefore an evidence-backed compatibility target, not a claim of exhaustive
device certification. Current-device Safari PWA/push/offline UAT remains part
of hosted acceptance.

## Follow-up Work

- Revisit the minimum iOS tier only through a PRD/ADR change with usage and
  security evidence.
- If the lowered bundle grows more than 15% gzip from its recorded baseline,
  require an explicit performance review or superseding ADR.
