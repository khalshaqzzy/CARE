# ADR-0020: Workforce Secondary Surface Polish Through Shared Padded-Surface and Section Components

| Atribut    | Nilai                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------- |
| Status     | Accepted                                                                                      |
| Tanggal    | 29 Agustus 2026                                                                               |
| Supersedes | —                                                                                             |
| Terkait    | ADR-0012 (Member home visual polish), ADR-0018 (Union surface), ADR-0019 (Unified monitoring) |

## Context

The workforce pages outside the home/dashboard surface — Account, the Create Voice wizard, and
Notifications — rendered with text pressed against card borders. Investigation traced the defect to
the shared design system rather than the pages: `care-surface` (the `Card` primitive) ships only a
border, radius, and background with no inner padding. Pages that compose their own padded
components (home hero, status summary, voice cards, dashboard KPI tiles) looked correct; every page
that placed raw content inside `Card` — account sections, the wizard form, the push-settings card,
notification items — rendered flush against the card edge and, where cards used `overflow: hidden`,
had content clipped by the corner radius.

Additional defects compounded the impression: the account identity hero placed 74%-alpha white
labels over tinted tiles on the brand gradient (≈2.7:1 contrast, below WCAG 2.1 AA), the shared
textarea style imposed a 7.5rem minimum height that overrode the `rows` attribute, the media
attachment remove control measured 20px against the 44px touch-target contract, and several CSS
rules targeted a non-existent `.care-card` class, leaving Voice Member KPI cards, chart cards, and
home resume cards unpadded despite intended styling.

## Decision

1. **Opt-in surface padding.** `Surface`/`Card` gains a `padding` prop (`'none' | 'sm' | 'md' |
'lg'`) mapping to `care-surface--pad-{sm,md,lg}`. The default remains `'none'`, so every
   existing surface — including the entire Admin application — renders byte-identically until a
   page opts in. Padding is opt-in rather than a new default because tables, state panels, and
   composite components control their own spacing.
2. **Composed section primitives in `packages/ui`.** New components cover the recurring patterns
   the secondary pages need: `SectionCard` (padded card with icon/title/description/action header
   and optional divider), `ChoiceCardGroup` (radio-semantics selection cards with a compact `chip`
   variant, built on Radix radio primitives), `SettingsGroup`/`SettingsRow` (icon-led rows with
   trailing controls, ≥44px rows, hairline dividers, danger tone), and `KeyValueGrid` (label/value
   tiles with `subtle` and on-brand `brand` surfaces). All register in the public component
   coverage and the `/design` showcase, keeping the implementation contract honest.
3. **Field refinements.** `Field`/`Input`/`Textarea` accept an optional `counter` rendered
   right-aligned in the label row, replacing per-page helper-text counters. Workforce-scoped CSS
   switches inputs, textareas, and select triggers to tinted inset fields that lift to the raised
   surface with the brand focus ring, and lets `rows` drive textarea height. These overrides live
   in the workforce bundle only; Admin keeps bordered fields.
4. **Account page.** The gradient hero is retained but repaired: real padding (no clipped avatar),
   identity block with registration number subline, status/kind chips, and AA-safe on-brand text
   (pure white values, `--on-brand-muted` labels at 92% white). Organization profile, capabilities,
   and security render as section cards; security actions use settings rows; logout becomes a
   confirmed terminal action through the shared dialog with focus trap/return.
5. **Create Voice wizard.** The visibility choice, area selection, category fallback, and severity
   fallback use choice cards/chips; the form is one raised card divided into labeled sections
   (lokasi, detail, foto); counters move inline; the media picker gains a programmatic label row,
   count, larger dropzone, and a 24px remove control with a halo expanding the hit area to 44px;
   and every step ends in a sticky action bar that clears the bottom dock and safe area, keeping
   the primary action visible per the responsive contract.
6. **Notifications.** The header stacks on mobile with an unread badge and inline mark-all action;
   push settings render as a section card whose switch row remains a single labeled control (the
   text stays the click target); notification items gain type-tinted icon tiles, an unread dot
   plus tinted background (never color alone), and preserved "Buka" action semantics.
7. **Sibling consistency.** Chart cards, home resume cards, Voice Member KPI cards, voice detail
   sections, reporter cards, and the action panel opt into the same padding; the dead
   `.monitor-kpis .care-card` selectors are removed.

## Alternatives Considered

- **Default padding on `care-surface`.** Rejected: it would silently change every Admin table
  wrapper and state panel and invalidate the Admin baseline for no functional gain.
- **App-local CSS only.** Rejected: the patterns (section headers, choice cards, settings rows,
  key-value tiles) recur across workforce pages and are the documented purpose of the shared
  package; app-only styles would leave the `/design` coverage diverging from the real system.
- **White account identity card.** Rejected in favor of the repaired gradient hero to keep the
  account surface consistent with the home hero and the reference design language.

## Consequences

- Shared bundle adds ~150 lines of CSS and one new module; both applications ship it, but only
  opted-in classes change rendering.
- The workforce Account page now performs a controlled logout confirmation, a small deliberate
  behavior change aligned with the destructive-action confirmation contract.
- The Area selector changes from a select to radio chips; the corresponding mocked journey asserts
  the new role while headings, button labels, and copy anchors stay unchanged.
- Visual baselines: `workforce-account-360.png` regenerated for the redesign; all other baselines
  (including Admin and `/design`) pass unchanged within the documented rasterization tolerance.

## Validation

Monorepo typecheck, lint, Prettier, unit suites (API 60, UI 12, frontend-core 14, workforce 33,
Admin 2), deterministic OpenAPI (no drift), destructive-migration check, Compose config, and
dependency audit (zero High/Critical; the documented ExcelJS transitive Moderate remains) pass.
PostgreSQL integration (42) and security (5) suites, the 10k-account/50k-Voice performance fixture,
and maintenance reconciliation (zero counters) pass on the disposable database. The mocked
Playwright suite passes 120 tests including Axe AA, no-overflow at 360/768/1440, preserved
push-switch anchors, and a new assertion that the media remove halo keeps a 44px hit area; the
gated full-stack suite passes 3 tests. Gitleaks directory scan reports no leaks after the allowlist
was extended to cover the ignored mode-0600 `.env.local` runtime secret store, matching the
existing `.env` exception, with the rules reconciled in the same change.

## Follow-up Work

- The History and Work Items filter cards still carry their own padding class; migrating them to
  the explicit `padding` prop would make one idiom, but is deferred to avoid baseline churn.
- `/design` specimens for the new primitives live in the forms section; a dedicated composed
  section could be split out if the registry keeps growing.
