# ADR-0014: Admin Workspace Visual Polish Aligned to the Product Design Language

- Status: Accepted
- Date: 28 August 2026

## Context

The Admin application (`apps/web-admin`) implements the operational workspace for CARE: overview, organization import and master data, remediation, Union slots, accounts, read-only Voice exploration, audit, and system status. Its first implementation prioritized contract correctness and accessibility, and the visual layer remained close to unstyled shared primitives: filters sat in bare flex rows, tables used a gray header band, several pages relied on inline font-size and color fragments, the admin overview rendered the readiness payload as a raw JSON `<pre>`, and row actions were ad-hoc styled `<button>` elements. The result was functional and compliant but visually flat next to the polished workforce member surface established in ADR-0012, which adopted the product design reference: soft rounded surfaces, white elevated panels, a segmented progress card, quick-action tiles, and a quiet navigation surface.

The design reference is a mobile dashboard; the Admin application is a desktop-only workspace behind the 1280 px gate. A direct layout translation was therefore not applicable. The objective was to translate the reference's design language — surface elevation, radii, typographic hierarchy, semantic value color, and quiet chrome — into a professional enterprise-admin form without changing any product, authorization, API, or PWA contract.

## Decision

The Admin application received a coherent visual system, implemented entirely inside the Admin bundle's stylesheet so the shared UI package, the workforce application, and the `/design` showcase baselines remain untouched. The system consists of: a white sidebar with a cobalt brand chip and a solid brand-600 pill marking the active destination; a quieter translucent topbar; uppercase letter-spaced table headers on white with softer row dividers and card-level elevation on the table wrapper; a reusable filter toolbar card; mini-stat cells for import preview counters; icon-labeled key-value rows with semantically toned values for drawers, Union slot cards, and status surfaces; an overview "operations pulse" card presenting the active-account ratio through a decorative segmented progress bar exposed to assistive technology via `progressbar` semantics, with a four-cell count legend; structured readiness rows with status badges replacing the raw JSON block; and a quick-action tile grid that navigates only to existing destinations. The login surface gained a cobalt brand mark, a tighter display type scale, and subtle radial brand tints while keeping the light split layout.

Three translations from the reference were consciously declined. The cobalt hero band was not applied to the overview, because an enterprise operations workspace benefits from consistent light page headers across all sections. Primary buttons remain flat brand-600 rather than gradient pills, matching the quieter enterprise register. The active sidebar item uses a solid cobalt pill with white text rather than the reference's dark-ink treatment, keeping the brand cue consistent with the workforce desktop sidebar; white text on brand-600 preserves WCAG AA contrast, and inactive icons use the secondary text color because the reference's light gray fails the 3:1 non-text requirement.

Inline-styled fragments were replaced with named classes (`admin-meta`, `admin-kv`, `admin-dl`, `admin-feed`, `admin-pre`, `admin-clamp-2`, `admin-toolbar`, `admin-mini-stat`), and raw table action buttons became shared ghost buttons with unchanged accessible names. The overview visual baseline test now installs the shared Admin API mock and pins the clock, because the overview became data-driven and contains a formatted timestamp; its screenshot tolerance was aligned to the documented 0.06 font-rasterization allowance used by the other baselines.

## Rationale

Scoping every rule to the Admin bundle achieves the restyle without a shared-component contract change: the bundle imports the shared stylesheet and then overrides presentation classes, so no other application's pixels change and no shared visual baseline requires regeneration. Restyling existing primitives rather than introducing new components keeps the DOM close to its tested shape, which preserved every accessible name, heading, label association, and empty-state string that the accessibility, journey, explorer, foundation, and gated full-stack suites assert. Replacing the readiness JSON dump with structured rows removes the only place where a machine payload was rendered directly to operators, without altering which values are displayed. Keeping the segmented bar's information in text and `aria-valuenow` while marking segments decorative follows the member-home precedent and passes the accessibility scans.

## Alternatives Considered

- Applying a cobalt hero band to the overview: rejected as inconsistent with the light page headers on the remaining sections and heavier than an operations workspace requires.
- Gradient primary buttons: rejected to keep the admin register quiet and to avoid implying a promotional surface.
- Dark-ink sidebar active state mirroring the reference dock: rejected because the labeled sidebar benefits from a clear brand cue, and the cobalt pill preserves AA contrast.
- Extending the shared stylesheet instead of the Admin bundle: rejected because it would have forced regeneration of the workforce and design baselines and widened the blast radius of presentation-only work.
- Adding new endpoints or overview aggregates for the pulse card: rejected; the card derives entirely from the existing overview payload.

## Consequences

All nine Admin pages, the login surface, and the shell share one visual language, and the overview communicates account composition at a glance. Presentation rules for Admin now live in one stylesheet section, simplifying future restyling. The Admin shell baseline was regenerated once; all other baselines remain byte-identical. Future Admin surfaces should prefer the named `admin-*` classes over inline styles, and any new primary navigation destination should be added to the quick-action grid only if it is an existing route.

## Validation

The mocked browser suite passes in full, including WCAG 2.1 AA accessibility scans with no document overflow for every Admin page at 1280 px and 1440 px, per-page journey assertions, drawer focus behavior, reduced-motion rendering, and all visual baselines. The gated full-stack journey passes against the live API and database, covering login, forced password change, per-page wiring, valid-import confirmation, and the read-only Voice Explorer drawer with audited Private identity. Repository format, lint, typecheck, unit suites, production builds, OpenAPI drift, destructive-migration policy, PostgreSQL integration and security suites, the seeded performance profile, storage reconciliation dry-run, directory secret scan, and whitespace checks pass. No shared baseline, contract, schema, or workflow file changed.

## Risks and Follow-up

The workspace rhythm now assumes the `admin-*` class inventory; new pages that bypass it will drift visually. The overview pulse card derives its denominator from the three account counters in the overview payload, so a future payload change that alters that contract must update the card. The visual baseline depends on the clock pin in its test; future overview copy that renders wall-clock values must keep that pin. Deeper information-density work on the Voice Explorer filters, if requested, should reuse the toolbar card rather than reintroducing bare rows.
