# ADR-0027: In-Page Attachment Viewer (Lightbox)

Date: 31 August 2026
Status: Accepted

## Context

Every image attachment surface in the workforce app — Voice detail
attachments, closure evidence (featured and historical cycles), chat message
images, the responder closure-evidence shelf, and the draft preview — renders
its thumbnails through one shared component, `MediaGallery`. Each thumbnail
was an anchor element pointing directly at the authorized media endpoint
(`/api/v1/media/{id}`) with `target="_blank"`. Opening an image therefore
performed a full top-level navigation to a raw API URL: the reader lost the
Voice context, received no image chrome (title, position in a set, adjacent
images), and on an authorization failure the tab displayed the raw JSON error
envelope instead of a human-readable state.

The media endpoint itself was already correct for in-page rendering — commit
`913f4c9` extended readable states to finalized (`REFERENCED`) attachments, so
thumbnail `<img>` elements load reliably through the same-origin session
cookie. The interaction gap was purely presentational: no viewer component
existed anywhere in the design system (`packages/ui` exposes Dialog, Drawer,
and BottomSheet on Radix primitives, but no image viewer), and the repository
had no lightbox implementation to reuse.

The design system targets a legacy WebKit floor (iOS 11.3, ADR-0026), the
workforce main bundle is budget-gated by `pwa:compat-check`, and attachments
are capped at five images per message or Voice, so any viewer must be small,
dependency-free, and operable without modern pointer or zoom APIs.

## Decision

Attachment viewing stays on the page. A full-screen `Lightbox` primitive was
added to `packages/ui` and `MediaGallery` (plus the Create Voice media
picker) now opens it instead of navigating to the media URL. The media
endpoint, its authorization, the OpenAPI contract, and the attachment DTOs
are unchanged; the browser continues to load image bytes through the same
authenticated `<img>` request path. Only the presentation changed.

The `Lightbox` primitive is built on the same Radix dialog primitives the
regular `Dialog` uses, inheriting focus trap, Escape handling, body scroll
lock, and portal rendering; the focus save/restore pattern matches the
existing Dialog implementation. Its controlled API is
`{ open, onOpenChange, images, index, onIndexChange }`, so the host gallery
owns the navigation state and clicks, keyboard, swipes, and thumbnail jumps
all funnel through one `onIndexChange` callback. The viewer provides:

- a top bar with a labelled back affordance ("Kembali") that closes the
  viewer and an `aria-live` position counter ("2 / 3");
- prev/next circular buttons (disabled at the ends, 44 px targets) with
  ArrowLeft/ArrowRight keyboard navigation;
- horizontal touch swipe with edge resistance and a snap-back transition;
  swipe recognition is axis-locked after a 10 px threshold and requires a
  48 px travel;
- a thumbnail strip (rendered only for more than one image) that jumps to an
  image and marks the active one with `aria-current`;
- loading and error states for the stage image, the latter with a retry
  control that cache-busts the request; and
- an sr-only dialog title ("Gambar n dari total") and description so the
  dialog role carries an accessible name.

MediaGallery thumbnails became `<button>` elements (the shared CSS classes
are element-agnostic; button resets and a hover zoom were added), and draft
composer thumbnails in the Create Voice form open the same viewer, with the
remove control left untouched so the two gestures never overlap.

The viewer chrome deliberately sits on an opaque, slightly gradient dark
surface rather than a translucent scrim. axe's color-contrast rule composites
translucent overlay layers with the arbitrary page content beneath them, so a
frosted-glass stage produces unpredictable computed contrast; an opaque stage
makes the contrast deterministic while the glass buttons and hairline borders
keep the premium treatment. Legacy WebKit compatibility is preserved: no
PointerEvent, ResizeObserver, or zoom APIs are used, the swipe path uses
basic touch events, and backdrop-filter was removed from the final chrome so
no visual feature depends on prefixed support.

## Alternatives Considered

- Reusing the existing `Dialog` component with a fullscreen size variant. Its
  header/body/footer structure, constrained width, and mobile bottom-sheet
  behavior would need as many overrides as a dedicated primitive, while the
  required `title` prop does not map to an image viewer's chrome. Building on
  the same Radix primitives directly reuses the accessible foundation without
  fighting the composed component's layout.
- Fetching media through the JSON client and rendering from blob object
  URLs. This would add manual fetch lifecycle, revoke handling, and a second
  code path for authorized media; the plain same-origin `<img>` request
  already carries the session cookie and benefits from the existing endpoint
  headers.
- Double-tap zoom with pan. Deferred: it adds gesture-state complexity and
  legacy-WebKit risk for a capability the five-image attachment sizes rarely
  need; the view-only viewer is the accepted v1 scope and the component API
  does not preclude adding zoom later.
- Extending the viewer to the Admin Voice Explorer media links. Deferred to
  keep the change set workforce-scoped; the Admin surface presents attachments
  as text links gated on attachment state and has no thumbnail gallery yet.

## Consequences

- Attachment viewing no longer leaves the page on any workforce surface; raw
  API navigation for media is structurally prevented, and a source-assertion
  unit test in `apps/web-voice` locks `MediaGallery` against reintroducing
  `target="_blank"` or media anchors.
- `Lightbox` is a registered public component of `@care/ui` (coverage list,
  `/design` specimen, jsdom unit tests with axe, keyboard, focus, and
  navigation contracts) and is available to the Admin app without further
  extraction work.
- The workforce main bundle grew by roughly 150 bytes gzipped against the
  143,500-byte PWA artifact budget; the new visual baseline
  `workforce-lightbox-360` captures the viewer with a deterministic
  two-tone media sample, while all pre-existing baselines remained
  byte-identical because the thumbnail DOM and CSS boxes are unchanged.
- The mock API helper gained an optional `mediaBody` override (default stays
  the 1×1 transparent PNG) so tests can opt into visible media without
  touching the shared stub.

## Validation

`@care/ui` unit tests cover open/close with focus return, arrow-key and
thumbnail navigation with end-disabled states, the accessible name, an
axe-clean render, and the empty/closed renders; web-voice unit suites pass
including the new in-page contract. Playwright journeys cover the full
interaction loop (open from a thumbnail, counter updates, prev/next buttons
and arrow keys, back-button close with focus restore, Escape close, absence
of raw media anchors); a dedicated accessibility spec asserts axe cleanliness
with the viewer open, no document overflow at 360 px, and ≥44 px controls.
The full mocked Playwright suite (chromium, visual, PWA, push, and
legacy-ios WebKit projects — 149 tests) passed on two consecutive runs with
only the new baseline added. Monorepo format, lint, typecheck, build,
PWA artifact gate, OpenAPI drift check, destructive migration check,
dependency audit (no High/Critical; the documented Moderate transitive
remains), Compose config validation, Gitleaks directory scan, and whitespace
check all pass. No database-backed suites were rerun because the change set
contains no API, schema, contract, or migration change.

## Follow-up Work

- Zoom and pan remain deferred; the controlled `index` API accepts them
  without structural change.
- The Admin Voice Explorer can adopt the same `Lightbox` primitive once its
  attachment surfaces render thumbnails instead of text links.
- Chat galleries currently scope navigation to the images of one message;
  a future pass could unify concurrent galleries (Voice attachments plus
  chat history) into a single viewer session if product direction asks for
  cross-surface browsing.
