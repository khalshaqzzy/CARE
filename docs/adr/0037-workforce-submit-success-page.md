# ADR-0037: Workforce Submit Success Page

## Status

Accepted — 4 September 2026

## Context

Successful Voice submission previously navigated directly from the draft preview to the newly
created Voice detail. A distinct acknowledgment moment was required so reporters receive an
unambiguous confirmation before choosing whether to review their history or return to the
capability-aware dashboard. The supplied mobile reference established an immersive CARE-branded
screen with no application chrome and a supplied transparent character asset.

## Decision

Successful General and Private submissions navigate with `replace` to the protected static route
`/voices/submitted` and carry an in-memory `{ submitted: true }` location receipt. The page captures
that receipt once and immediately clears it from the browser history entry. Direct navigation,
refresh, or revisiting the entry later therefore redirects to `/history`.

The success route bypasses the normal Workforce `AppShell`; its own semantic `main` contains the
CARE lockup, success icon, transparent supplied artwork, code-native blueprint grid and SVG waves,
confirmation copy, and two actions. “Lihat riwayat Voice” opens `/history`; “Ke dashboard” opens
`/`. No Voice identifier is exposed and the page performs no API request.

The original 1122×1402 RGBA artwork is retained as a fingerprinted Vite asset. It is decorative to
assistive technology because the textual heading communicates the result.

## Rationale

A consumable location receipt makes the screen available only at the moment it is meaningful,
while avoiding storage, query parameters, or a new server contract. Rendering outside `AppShell`
matches the immersive reference and ensures hidden navigation is absent from both the visual and
accessibility trees. Code-native background and wave treatment remains sharp and responsive while
the provided character remains visually unchanged.

## Alternatives Considered

- A persistent per-Voice route was rejected because an old success state could be replayed and
  would expose an identifier without providing a detail action.
- A generic persistent route was rejected because direct access would imply a submission that had
  not occurred.
- Keeping the normal bottom navigation/sidebar was rejected because it conflicted with the supplied
  full-screen composition.

## Consequences

- Browser refresh intentionally lands on Voice Saya rather than replaying the receipt.
- The draft preview is removed from history after success, preventing navigation back to a consumed
  draft.
- Responsive and visual regression coverage is required for the dedicated surface.
- Backend, database, OpenAPI, authorization, and submission idempotency contracts are unchanged.

## Validation

Validation covers submit success/failure routing, one-time receipt behavior, both CTA destinations,
absence of app chrome, keyboard and Axe accessibility, no horizontal overflow, transparent asset
preservation, deterministic screenshots at 360/768/1440, the production build, and the PWA artifact
gate.

## Risks and Follow-up

The large lossless artwork increases the precache payload even though it does not affect the main
JavaScript gzip budget. Future lossless optimization may be considered only if alpha edges and
visual output remain byte-for-byte or pixel-equivalent.
