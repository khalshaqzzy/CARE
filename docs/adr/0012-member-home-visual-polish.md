# ADR-0012: Workforce Member Home Visual Polish Aligned to the Mobile Dashboard Reference

- Status: Accepted
- Date: 28 August 2026

## Context

The workforce home renders the Member Voice dashboard: greeting, status counts, resume-draft affordance, recent Voice list, and role-specific operational surfaces. Its first implementation used a brand-gradient hero with a separate white summary card, a full-width bordered bottom navigation, severity-striped Voice cards, and blue eyebrow section headers. A mobile dashboard reference (`design.jpg`) was introduced as the visual target for the member surface: a saturated cobalt hero with a white progress card embedded inside it, tinted cards with white key-value panels, a gradient call-to-action pill, quick-action tiles, and a floating white dock with the active destination in dark ink.

Two behavioral defects were discovered while auditing the member surface against this target. First, the mobile bottom navigation never navigated: the application supplied per-item click handlers, while the shared `BottomNav` component invokes only an `onNavigate(id)` callback that was never wired. Second, viewports between 768 px and 1279 px rendered no primary navigation at all, because the dock was hidden at 768 px while the desktop sidebar appears only at 1280 px. The member home also carried contrast liabilities: secondary hero text relied on translucent white over a gradient whose lightest stop does not meet WCAG AA for small text, and the global focus color is nearly invisible on the brand background.

## Decision

The member home adopts the reference visual system while preserving every product, privacy, and authorization contract. The hero uses a same-hue cobalt gradient with a cyan radial glow, large radii, circular tinted action buttons, and solid white text at every size. The status summary becomes a white progress card embedded in the hero, reporting the four lifecycle counts, the active-to-total ratio, a percentage, a decorative segmented bar exposed to assistive technology through `role="progressbar"`, and the offline staleness marker. Voice cards become tinted shells containing a white panel of icon-labeled rows whose values carry semantic color; the accessible name of the detail affordance is unchanged. Section headers use dark semibold titles with a gradient primary pill and a centered "view all" control; a capability-aware quick-action row mirrors existing navigation destinations only. The bottom navigation is restyled, within the workforce application styles, as a floating white panel with icon-only controls and an ink-active state, and its visibility extends to the 1279 px boundary so every mobile-width viewport keeps primary navigation.

The application now wires `onNavigate` to a route map covering every dock identifier, and the chrome topbar yields on the mobile home route, where the hero carries the identity; all other routes retain the topbar with its logout affordance.

## Rationale

Embedding the summary card in the hero mirrors the reference information hierarchy and removes one full-width block from the scroll, which matters on 360 px devices. Solid white hero text on a deeper gradient base satisfies AA contrast at both gradient stops without inventing new tokens. Semantic color in card values follows the established severity badge mapping, and the value text itself carries the information so color is never the sole carrier. Dock inactive icons use the secondary text color rather than the reference's light gray because the lighter value fails the 3:1 non-text contrast requirement. The gradient call-to-action pill starts at `brand-600` rather than the accent hue because white text over the accent tone does not meet AA; the cyan accent is preserved in the glow shadow. Scoping the dock restyle to the workforce shell keeps the Admin application, which renders no dock, and the `/design` showcase, which is excluded from product baselines, visually unchanged.

## Alternatives Considered

- Restyling the shared `BottomNav` component directly: rejected because the only consumer is the workforce shell, and application-scoped CSS avoids a shared-component contract change.
- Adding a period selector to mirror the reference "Weekly" control: rejected because no period-scoped member dashboard exists in the product contract; a static total pill provides the same visual rhythm without a false affordance.
- Hiding the topbar on all mobile routes: rejected because sub-pages would lose the logout affordance; only the home route yields, where identity lives in the hero and logout remains on the account surface.
- Keeping the summary card outside the hero with a restyled shell: rejected as it retains the two-block rhythm the reference removes.

## Consequences

Member-facing home, history, and operational inbox surfaces share one card language. The mobile dock becomes the functional primary navigator at every width below 1280 px, and tablet viewports regain navigation. Two committed visual baselines were regenerated; all other baselines, including the design showcase, remain byte-identical. The shared UI stylesheet's breakpoint for dock visibility and mobile content padding moved from 768 px to 1279 px, which affects only surfaces that render a dock.

## Validation

The change is covered by the mocked browser suite, including accessibility scans on the home route at mobile width, the 44 px dock target assertion, overflow checks at 360/768/1440, reduced-motion rendering, a new journey asserting dock navigation to history and the create wizard, and a source-level unit assertion locking the `onNavigate` wiring. The gated full-stack journey exercises the polished home and detail navigation against the live API. Regenerated baselines cover the member home shell; history and notification baselines pass unchanged. Format, lint, monorepo typecheck, unit suites, production builds, OpenAPI drift, destructive-migration policy, PostgreSQL integration and security suites, the seeded 10,000-account/50,000-Voice performance profile, storage reconciliation, the directory secret scan, and whitespace checks all pass.

## Risks and Follow-up

The dock's blurred translucency depends on backdrop-filter support; unsupported renderers fall back to a near-opaque white, which remains legible. Future detail-page work should introduce an explicit back affordance now that the home route leads with the hero. Any future member-dashboard period filtering should reuse the panel-head pill slot rather than introducing a second control pattern.
