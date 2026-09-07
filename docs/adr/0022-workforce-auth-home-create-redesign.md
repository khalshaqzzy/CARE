# ADR-0022: Workforce Auth, Member Home, and Create Voice Redesign Implementation

Date: 30 August 2026  
Status: Accepted

## Context

ADR-0021 produced an approved 25-screen mobile concept set under
`.design/member-voice-redesign/` with implementation explicitly deferred. This
ADR authorizes and records the first implementation slice: the authentication
surfaces (login, temporary-password change), the Member Home core, and the
Create Voice flow (voice type, detail form, AI processing, manual fallback,
General/Private preview), matching the concept screens `01`–`11`. Remaining
concept surfaces (history, detail, notifications, account, manager, leadership,
union) stay on the current implementation until a later slice.

Constraints carried into this slice: the PRD remains the behavioral source of
truth; the Admin application must not change; the workforce desktop (≥1280px)
layer and the mobile bottom dock keep their existing composition per product
decision; accessibility (WCAG 2.1 AA), 44px touch targets, and the existing
test contracts (foundation source assertions, journey/a11y anchors, visual
baselines) must keep passing or be updated deliberately.

## Decision

**Shared additions (`packages/ui`, additive only).** `PasswordInput` joins the
forms module: a password field with an operable visibility toggle (real button,
`aria-label`/`aria-pressed`) because the shared `Input` renders leading/trailing
content as `aria-hidden` spans and cannot host a labeled control. `ChoiceCardGroup`
gains two optional props, `indicator: 'check' | 'radio'` (default `check`,
byte-identical DOM) and `appearance: 'default' | 'brand'` (default unchanged);
`brand` renders the checked card as a solid `--action-primary-bg` surface with
inverse text, a tinted icon plate, and a white marker — the concept set's
dominant selected-route treatment. Both components are registered in the public
coverage contract, specimenized on `/design`, and unit-tested.

**Auth.** Both auth pages share one cobalt brand-hero layout: a full-bleed
gradient panel (lockup, headline, blueprint grid, security badge and shield
watermark on the change-password variant) and an overlapping white sheet
holding the form. Fields use labeled inputs with leading icons; the login card
uses `PasswordInput` for password visibility; primary actions carry a trailing
arrow. Mobile stacks hero-over-sheet with negative-margin overlap; desktop
keeps the two-column split with the hero as a rounded panel. Admin keeps its
own `.auth-form` copy, so workforce restyle is bundle-scoped. Per product
owner, the login hero omits the concept's "Member Voice" chip and the sheet's
welcome heading has no icon tile.

**Member Home.** The core composition is retained per ADR-0021; polish is
limited to switching the hero to the shared `--gradient-brand-hero` token,
quick-action tiles gaining tinted brand icon chips, and More-sheet rows gaining
icon chips and chevrons. Quick-action destinations remain the PRD-sanctioned
set (Buat Voice, Voice Saya, Notifikasi, Akun); the bottom dock is unchanged by
explicit product decision.

**Create Voice.** The wizard adopts the concept's hairline five-node stepper
(Jenis, Detail, Analisis, Tinjau, Selesai) with a right-aligned `n/5` counter;
manual fallback shares the analysis node (3/5) as in the concept. The voice-type
step renders two dominant cards with radio indicators and the brand selected
state; per product owner its `Lanjutkan` action is pinned directly above the
mobile dock via a `pinned` variant of the shared sticky action bar, and the two
cards flex-grow to fill the space down to that pinned CTA, so the short page
reads as a full-screen route decision instead of leaving the CTA floating
mid-screen.
The form step splits into a location card — a collapsed "Lokasi temuan" summary
row with an Ubah bottom-sheet picker (superseding the ADR-0020 inline chip grid
on this form only) — and a "Voice composer" card with counters, a dashed media
divider, an inline dropzone with beside-note, a Private-only bookmark ribbon,
and a General-only AI notice; Private identity consent moves to a dedicated
section of tall brand choice cards with no default selection so consent stays
explicit. Processing renders as a cobalt focus card with a reduced-motion-safe
orbit spinner and a three-stage checklist driven by real mutation states
(detail accepted, classification, location review). Manual fallback uses an
amber advisory banner with the sanitized fallback code, a two-column icon-card
category grid (General only), and a severity rail: a vertical radio list with
a connecting line. The review step renders a cobalt classification summary
(with route target fetched from the existing draft-preview endpoint, closing a
PRD §12.2 gap in the wizard), a content card, a classification/location meta
strip, a Private consent confirmation, and the unchanged INCOMPLETE
acknowledgment gate. `DraftPreviewPage` reuses the same extracted review
components.

**Accessibility corrections.** Subtext on solid cobalt surfaces uses full white;
92% white (`--on-brand-muted`) measures 4.31:1 on the brand-600 stop, below AA
for small text. The processing orbit and stage spinner rely on CSS animation
only and freeze under `prefers-reduced-motion`.

**Latent defect fixed.** `saveAndProcess` overwrote `locationReview` from the
stale captured mutation object after `Promise.all`, clobbering the state just
set by the mutation's own success handler. On an `INCOMPLETE` review this
silently dropped the acknowledgment gate from the wizard path. The awaited
result is now used directly.

## Alternatives Considered

- Keeping the ADR-0020 inline area chip grid — rejected for this form; the
  concept's summary row plus sheet picker reduces visual load and the product
  owner approved the change.
- Brand-selected styling scoped to workforce CSS only — rejected; an opt-in
  shared prop keeps one implementation of the solid-selected contract, stays
  testable, and leaves Admin and existing usages byte-identical by default.
- Mockup literal destinations for quick actions (Draft saya, Perlu tindak
  lanjut) — rejected; they require new navigation targets that do not exist in
  the PRD IA.

## Consequences

- Visual baselines: the pre-existing workforce and `/design` baselines pass
  without regeneration because the redesigned home deltas sit below their
  capture windows. The auth and Create Voice surfaces gained their own 360px
  baselines in `workforce.visual.spec.ts` (login, password change, voice type,
  area sheet, General form, processing, manual fallback, General/Private
  review), framed from the top of each step after interaction auto-scroll;
  processing is captured mid-analysis by holding the classification and
  location-review routes in flight.
- The `/design` specimen page grows PasswordInput and brand/radio choice-card
  specimens; its axe contract covers them.
- Journey and a11y specs now anchor on "Mulai Voice baru" and drive area
  selection through the Ubah sheet.
- Remaining concept screens require a follow-up slice with its own ADR.

## Validation

Frozen-lockfile install unchanged; `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm test:unit` (API 60, UI 14, frontend-core 14, workforce
33, Admin 2), `pnpm build`, `pnpm openapi:check` (no drift), Playwright mocked
chromium 106 passed, visual 22 passed (12 pre-existing baselines unchanged plus
10 new auth/Create Voice baselines verified deterministic across repeat runs),
PWA 2 passed. Rendered states were additionally screenshot-reviewed against
concept images `01`–`11` at 360px. No API, schema, or contract change; Phase 13
status is unchanged.
