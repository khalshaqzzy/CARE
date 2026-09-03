# ADR-0035: Admin Web Premium Polish Pass

Status: Accepted

Date: 2026-09-03

## Context

ADR-0034 rebuilt all nine Admin pages in the premium language of the seven
design targets in `.agent/design-images/admin-web-redesign/`. A follow-up
polish pass was requested: stay frontend-only, treat the targets as a style
reference, push creatively toward a premium sleek finish with subtle-only
motion, cover all nine pages equally, and include auth surfaces plus
regenerated visual baselines. A design judge reviews the result and the work
iterates until it passes.

## Decision

Polish `apps/web-admin` only. No API, schema, migration, OpenAPI/contract,
or `packages/ui` change; the workforce app is byte-identical. Bahasa
Indonesia copy, PRD §11.5 IA, wire enums, e2e anchors, the ≥1280px desktop
gate, and the no-page-horizontal-scroll a11y contract are preserved.

Key points:

- New `admin-*` token layer in `apps/web-admin/src/styles.css` (ink/line/
  canvas/brand/ring tokens, elev-1/2/3 shadows), global `:focus-visible`
  ring, selection tint, thin scrollbars, card hierarchy (`--hero`,
  `--subtle`, `--lift`), tabular-nums utility, skeleton shimmer and
  illustrated empty states (static under `prefers-reduced-motion`).
- Shell: gradient cobalt active pill with icon plates, topbar divider plus
  live-dot session pill, gradient CA avatar plate, `aria-current` on Akun
  Saya, muted footer actions, split-panel login with tick list.
- Shared components: two new local primitives (`AdminSkeleton`,
  `AdminEmpty`); KPI/segment/filter/table/pill/stepper/tree/timeline/dialog
  refinements, sticky table heads, blurred sticky action bar, count pill.
- Per-page: hero/lift/subtle card assignment, skeleton/empty coverage,
  pills for statuses, tabular numerals, union tree connectors, drawer
  section hierarchy, `window.confirm` replaced by an accessible Dialog on
  category archive, audit truncation tooltips, compact remediation filters.
- Table-bleed elimination: grid-blowout guard (`.care-grid > *`
  `min-width: 0`), admin table minimums reduced (DataTable 44→34rem,
  half-width scroll tables 36→30rem with wrapping headers and compact
  density), explicit inner scroll containers, stretched-badge fix, the
  remediation bottom section stacks single-column below ultra-wide
  (≥135rem) so the 7-column queue fits, and an `overflow-x: clip` safety
  net on the page stack.
- Nine `admin-*-1440.png` baselines regenerated delete-first and verified
  across two consecutive deterministic runs.

## Rationale

The redesign established the language; this pass removes the flat,
clipped, and inconsistent details that kept it from feeling premium —
hierarchy, density, focus visibility, loading/empty craft, and tables that
never push the page wider than the viewport. Keeping the change
frontend-only avoids migration and contract risk while Phase 13/14 proceed.

## Alternatives Considered

- Pixel-close replication of mockup tables/statuses: rejected (ADR-0034
  rationale stands — instrument domain and foreign statuses would violate
  the product contract; invented metadata stays out).
- Side-by-side remediation section at 1440px with internal table scroll:
  rejected for the queue — a clipped 7-column table reads as bleed in a
  static review; full-width stacking fits all columns.
- Page-enter fade animation: removed after it produced load-dependent axe
  color-contrast failures (mid-animation opacity); subtle hover/skeleton/
  live-dot motion remains.

## Implementation Details

- `apps/web-admin/src/styles.css`: ~400-line polish layer plus table-bleed
  system described above.
- `apps/web-admin/src/components/AdminSkeleton.tsx`,
  `apps/web-admin/src/components/AdminEmpty.tsx`: new.
- `App.tsx`: topbar, sidebar footer, login split panel.
- All nine feature pages plus `CategoryConfiguration`: classes, skeletons,
  empties, pills, tooltips, dialogs as listed in the session handoff.
- `e2e/admin-pages.visual.spec.ts-snapshots/`: nine baselines regenerated.

## Consequences

- Admin visual baselines changed; future Admin UI work must regen
  delete-first.
- No product-scope change; PRD text untouched.

## Validation Plan

- `typecheck`, ESLint zero-warning, Prettier, production build, Admin unit
  (2 passed).
- `pnpm test:frontend:e2e`: 177/177 green, including 9/9 visual baselines
  over two consecutive deterministic runs and WCAG 2.1 AA plus no-overflow
  at 1280/1440 on all nine pages.
- Two-round design-judge review: FAIL (15 items, incl. table bleed) then
  PASS after fixes, with 4 further nits applied and 4 declined as
  contract-mandated deviations (documented in handoff).

## Risks

- Baseline churn on any Admin UI change (delete-first regen required).
- Single-column remediation below ultra-wide diverges from the reference
  2-column composition; accepted to fit real CARE table widths.

## Follow-up Work

- Phase 13 hosted staging acceptance and rollback rehearsal remain open.
- Hosted CI for `feat/admin-web-polish` must go green before merge.
