# ADR-0036: Workforce Login Hero Artwork and Copy Refresh

| Atribut     | Nilai                         |
| ----------- | ----------------------------- |
| Status      | Accepted                      |
| Tanggal     | 3 September 2026              |
| Area        | `apps/web-voice` (login only) |
| ADR terkait | ADR-0022 (auth redesign)      |

## Context

The workforce login page (ADR-0022) opens with a text-only cobalt hero:
lockup, two-line headline, and a descriptive paragraph beside the sign-in
card. A designed member-voice artwork now exists for the authentication
surface — two brand characters flanking a speech bubble ("Sampaikan voice
kamu untuk menciptakan lingkungan kerja Zero Worry, Zero Wrong, Zero
Waste!") above an opaque wave — supplied as a 1536×1024 RGBA PNG with a
transparent background. The login copy also needed product-owner-approved
refresh: a shorter welcome headline, a shorter subtitle, a NoReg-specific
username hint, and a NoReg example as the username placeholder.

## Decision

- The login hero becomes a media variant scoped by a new modifier class
  `auth-brand--media`: CARE lockup, the headline "Selamat datang di CARE."
  (two block lines, the second in a light-blue accent with a short rounded
  underline), and the artwork. The old two-span headline and the descriptive
  paragraph are removed. The `ChangePasswordPage` hero keeps the unmodified
  base `.auth-brand` styles.
- The artwork is committed at `apps/web-voice/src/assets/auth-hero-asset.png`
  (1152×768, 899 KB) and imported through Vite so it is emitted as a
  fingerprinted immutable asset. It is decorative (`alt=""`), carries
  explicit `width`/`height` to prevent layout shift, and spans the hero's
  full width with its edges on the blue background's edges on every
  breakpoint, its bottom wave forming the hero's bottom edge.
- The artwork sits flush under the headline: the hero grid gap is cancelled
  and the image is pulled up by roughly 15% of its own height (implemented
  as `-11.5%` of the track width given the 2:3 aspect) so its transparent
  top tucks into the headline block. The lockup-to-headline gap is tightened
  by a small negative margin.
- Login copy: subtitle "Login untuk melanjutkan ke CARE", username
  placeholder "Contoh: 00111111", username helper "Gunakan 8 digit NoReg
  Anda.". The password placeholder remains the plain "Password".
- An animated, drifting password placeholder ("Password awal adalah NoReg
  Anda.") was considered and intentionally deferred: no overlay, animation,
  measurement helper, or unit test ships in this change.

## Rationale

- The artwork communicates the member-voice campaign at the entry point more
  directly than descriptive copy, matching the approved mobile mockup.
- A modifier class keeps the shared auth CSS intact for the change-password
  page, which still uses the badge/watermark hero. Because the modifier is a
  single class, its specificity is equal to `.auth-brand` (0,1,0); its
  `padding-bottom: 0` therefore has to be re-declared after the mobile
  `.auth-brand` shorthand inside the media query, not only in the base rules.
- Percentage widths on the image (`calc(100% + 2 * padding)`) proved
  unreliable inside the single-column grid track, so the full-bleed is built
  from `justify-self: stretch`, `width: auto`, `max-width: none` (countering
  the preflight `img { max-width: 100% }` cap), and negative inline margins
  equal to the hero padding. This keeps the geometry exact on both
  breakpoints without percentage resolution ambiguity.
- PNG stays the delivery format: WebP is unsupported on the legacy iOS 11.3
  tier (ADR-0026). The source's alpha channel was verified before use — the
  background is genuinely transparent (roughly a third of pixels at alpha 0,
  content near-opaque), so no background-removal processing was needed.

## Alternatives Considered

- Extracting a shared `AuthLayout` component for login and change-password:
  cleaner long-term, but a larger refactor than this surface change required;
  deferred.
- Rendering the artwork as a CSS `background-image`: loses intrinsic
  dimensions (CLS) and semantic sizing; rejected.
- `mix-blend-mode` to knock out a black background: unnecessary once the
  supplied PNG's real alpha channel was verified.
- Shipping the artwork at 1536×1024: ~1.6 MB for a mobile-first PWA;
  resized to 1152 px width, which still covers the largest render size
  (the 544 px desktop panel at 2× DPR) with margin.

## Implementation Details

- `apps/web-voice/src/App.tsx`: login hero markup (lockup, accent headline,
  imported image), subtitle/placeholder/helper copy. No shared component or
  `packages/ui` changes; the form logic is untouched.
- `apps/web-voice/src/styles.css`: `.auth-brand--media` base rules (single
  `minmax(0, 1fr)` grid track, `padding-bottom: 0`), accent headline styles,
  `.auth-brand__asset` full-bleed/overlap rules, and the corresponding
  mobile overrides declared after the `.auth-brand` mobile shorthand.
- `apps/web-voice/src/assets/auth-hero-asset.png`: artwork, resampled from
  the 1536×1024 source to 1152×768 (899 KB), alpha verified.
- The service-worker precache manifest is intentionally unchanged: the image
  is served with a hashed, immutable URL and the login surface is
  pre-authentication, so offline precaching of ~0.9 MB was not justified.

## Consequences

- The login page renders the approved composition on mobile (full-bleed
  artwork between headline and overlapping card) and desktop (artwork inside
  the rounded cobalt panel, wave clipped by the panel radius).
- The change-password page and all other surfaces are visually unchanged.
- The deferred animated password placeholder remains an open follow-up; when
  revisited it will need an overlay element (native placeholders cannot
  animate), a measured drift amount, reduced-motion and iOS 11.3 handling,
  and its own unit coverage.

## Validation Plan

- Automated: format, lint, typecheck, unit suites, production build, PWA
  artifact budget, the full mocked Playwright suite including the login
  visual baseline (regenerated delete-first and verified across two
  consecutive deterministic runs), accessibility, and legacy iOS WebKit
  projects.
- Manual: rendered inspection at 360 px and 1440 px confirming the artwork
  edges meet the blue background edges, the wave forms the hero bottom edge
  with no dead blue band, and the updated copy.

## Risks

- First-load weight: ~0.9 MB PNG on the entry screen. Mitigated by hashed
  immutable caching and exclusion from the precache budget; acceptable for
  v1.
- Cascade fragility: future edits that reorder the mobile `.auth-brand`
  shorthand could reintroduce bottom padding on the media hero. The
  ordering requirement is documented in a CSS comment at the override site.

## Follow-up Work

- Implement the deferred animated password placeholder with measurement and
  accessibility handling.
- Consider extracting a shared auth layout if the hero diverges further.
