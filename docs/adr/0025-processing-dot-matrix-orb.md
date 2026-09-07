# ADR-0025: Processing Card Dot-Matrix Orb

Date: 31 August 2026
Status: Accepted

## Context

The Create Voice wizard's processing step shows a cobalt focus card while the
draft is persisted, classified, and location-reviewed. Its visual centerpiece
was a rotating dashed circle with a static sparkle icon. The circle carried no
information about the analysis it decorated: it spun identically regardless of
how far the three backend operations had progressed, while the three-row
checklist below it (Detail diterima, Kategori & severity, Verifikasi lokasi)
was already bound to the live mutation states exposed by `useDraftWizard`.

The analysis pipeline itself is client-orchestrated and already observable per
stage: the draft persist resolves first, then classification and location
review run concurrently, and each react-query mutation flag flips
independently as its call resolves. No backend infrastructure exists for
progress streaming (no SSE, WebSocket, or job-status endpoints on the draft
path), and the AI calls complete within the provider timeout budget, so a
server-driven progress channel would add contract surface without adding
information the client does not already have.

## Decision

The dashed circle and its center icon are replaced by a dot-matrix orb: a
9×9 grid of dots masked to an inscribed circle (69 visible dots), animated
with a five-petal bloom wave blended with a radial ring wave and a diagonal
chord wave. The orb reacts to the same live stage flags as the checklist
through a single `progress` value (completed stages / 3): completed stages
lock their dots bright from the center outward while the outer frontier keeps
blooming, so the card shows one coherent progress visual instead of a
decorative spinner plus a separate checklist.

The implementation is frontend-only. Three pieces were added to
`apps/web-voice`:

- `lib/orb-math.ts` — pure geometry and opacity math (circular mask, wave
  blend, settle lift) with exported constants, unit-tested without a DOM.
- `components/DotMatrixOrb.tsx` — a presentational component that renders the
  dot grid and drives per-dot opacity through a single requestAnimationFrame
  loop writing styles directly via refs. React state is not updated per frame.
  The loop starts only when the orb is animating and reduced motion is not
  requested; otherwise a single deterministic frame is painted at the current
  progress and phase. Progress is read through a ref so stage transitions do
  not restart the loop or jump the animation phase.
- Processing-card styles replace the orbit ring rules; the checklist spinner
  keyframes are unchanged.

Reduced motion renders a static frame rather than pausing mid-animation,
which also makes the visual baseline deterministic: Playwright's
`animations: 'disabled'` freezes CSS animations but not requestAnimationFrame
loops, and the workforce visual specs run under
`prefers-reduced-motion: reduce`. The static frame is painted from the same
pure function with phase 0, so the captured mid-analysis state (persist
complete, classification and location review in flight, progress 1/3) is
stable across runs.

## Alternatives Considered

- A server-driven processing-status endpoint (poll or stream) that reports
  per-stage completion. This would make progress survive a page reload
  mid-analysis and be server-authoritative, but requires new endpoints,
  OpenAPI and contract regeneration, integration tests, and a polling loop,
  while the client already observes each call's completion directly. The
  concurrent pipeline would also need server-side orchestration to preserve
  its latency profile.
- Keeping the grid at the 5×5 resolution of the original dot-matrix concept.
  At the card's 8.5 rem scale this produces 21 large dots and a diamond-like
  silhouette; the 9×9 inscribed circle reads as a finer, rounder orb.
- Overriding reduced motion with a CSS-only substitute animation. Rejected:
  the reduced-motion contract requires a meaningful static representation,
  and the settled progress frame is exactly that.

## Consequences

- The processing surface now visualizes pipeline progress; the checklist
  remains the accessible, text-based representation and the orb is
  `aria-hidden` decoration, so no accessibility contract changes.
- All motion is centralized in one component with one animation loop; the
  global reduced-motion handling in `@care/ui` no longer needs to neutralize
  processing-specific keyframes for the orb (the checklist spinner keyframes
  remain globally neutralized as before).
- The visual baseline `workforce-create-processing-360` was regenerated; any
  future change to the orb constants or mask radius requires a deliberate
  baseline regeneration.
- If the analysis pipeline ever moves server-side (for example to survive
  reloads), the `progress` input of the orb is the only integration point
  that needs re-sourcing.

## Validation

Web-voice unit tests cover the mask count, opacity bounds, determinism,
monotonic brightening per stage, and earlier settling of the center versus
the rim. The full mocked Playwright suite (chromium, visual, and PWA
projects) passes with only the processing baseline regenerated, and the
regenerated baseline was verified identical across two consecutive runs.
Monorepo format, lint, typecheck, build, OpenAPI drift check, destructive
migration check, dependency audit (no High/Critical), Compose config
validation, Gitleaks directory scan, and whitespace check all pass. No
database-backed suites were rerun because the change set is frontend, test,
and documentation only.

## Follow-up Work

- If the product later wants the orb to reflect finer-grained progress
  (for example provider latency or retry state), the settle function accepts
  any 0..1 progress value and needs no structural change.
- The fallback path briefly leaves the card while location review may still
  be in flight; the orb unmounts cleanly, but a future pass could surface the
  outstanding location stage on the manual-classification step as well.
