# ADR 0005: Phase 7 Frontend Foundation and CARE Design System

- Status: Accepted
- Date: 2026-08-26
- Decision owners: CARE/TMMIN product and engineering

## Context

CARE requires a mobile-first workforce experience and a privileged administration surface with different offline, viewport, cache, and deployment boundaries. Phase 7 must establish those boundaries before domain pages are added in Phases 8–10. The product reference uses a cobalt mobile header, spacious white layered cards, and bottom navigation; Admin workflows need denser desktop geometry. The frontend must consume the re-frozen OpenAPI contract without handwritten wire types.

## Decision

The old placeholder frontend is replaced by `apps/web-voice` and `apps/web-admin`. Shared presentation lives in `packages/ui`; transport, auth/session, CSRF, error normalization, cache isolation, and route guards live in `packages/frontend-core`.

`/design` is preserved in the workforce application and production build. It is public but unlisted, `noindex`, lazy-loaded, mock-only, and branched before Query/Auth initialization so it performs no API/session request. Admin does not duplicate this page and reuses `packages/ui`.

CARE v1 is light-only. The palette uses cobalt as the accessible primary, cyan as a dark-ink accent, a cool-gray canvas, white raised surfaces, and explicit semantic status colors. Inter Variable, a 4 px spacing scale, 44 px minimum touch targets, tokenized density/elevation/focus/layering/chart roles, and reduced-motion fallbacks are shared across both apps.

Relevant BeUI motion ideas are adapted for press feedback, shared-layout tabs/segmented controls, panel transitions, sidebar, bottom sheet/drawer, toast, accordion, loader, upload, animated numbers, and table virtualization. Native/Radix semantics remain authoritative for focus and keyboard behavior. Magnetic, metallic, tilt, shader, dock, marquee, and carousel effects are excluded. Provenance and the upstream MIT notice are retained in `packages/ui`.

The workforce app uses an injectManifest TypeScript service worker. Only hashed shell assets and the explicit offline fallback are precached; the design chunk is excluded. API, auth, mutations, media, chat, and protected content are network-only, with no background sync. Update UI is deferred while a form or mutation is active.

Admin is non-PWA and hard-gated at 1280 px before protected providers mount. Below the gate it displays desktop guidance, does not poll/fetch, and has no manifest, service worker, or offline cache artifact.

## Consequences

- Phase 8–10 pages must compose shared components and generated contract types instead of creating parallel UI or wire contracts.
- Workforce and Admin remain separate origins/build artifacts, even though they share packages.
- PWA cache changes require privacy regression tests; Admin must continue producing no PWA artifact.
- `/design` is an implementation contract and coverage proof, not a business route or data client.
- Dark mode and decorative motion are outside v1 scope.

## Validation

- Unit/component: auth bootstrap, forced password, wrong-app admission, CSRF, offline mutation rejection, 401 invalidation, session-key namespace, controlled state, keyboard navigation, dialog focus return, accessible descriptions, and token-contract scan.
- Browser: `/design` at 360/768/1440, Axe, keyboard focus, Admin gate at 1279 and app at 1280/1440, workforce shell, PWA offline fallback, two-host cookie/IndexedDB/CacheStorage isolation, reduced motion, and visual regression.
- Artifacts: workforce manifest/service worker/icons present, design chunks absent from precache, and Admin manifest/service worker absent.
