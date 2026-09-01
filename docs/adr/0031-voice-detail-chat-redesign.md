# ADR-0031: Voice Detail and Dedicated Chat Page Redesign

- Status: Accepted
- Date: 1 September 2026
- Related: PRD §13, §16, §17; ADR-0023, ADR-0027

## Context

The Voice detail page and its inline conversation room predate the reference-led
visual pass that reshaped the manager, leadership, and union surfaces (ADR-0024).
Two approved mockups define the target: a full-bleed cobalt hero band with a
circular back control, the CARE lockup with the Voice display id, a status pill,
and an overlapping white context card; and a dedicated chat page with the compact
variant of that hero, day-grouped bubbles, and a pinned composer. Separately,
the shared `RatingInput` rendered the selected count as a row of uniformly
accented stars, which does not communicate "how many of five" at a glance.
Product owner decisions recorded for this change: the chatroom becomes a
dedicated page; the shared topbar is suppressed on exactly these two surfaces
(a scoped supersession of ADR-0023's topbar rule); all audiences are restyled
while Union consent/privacy elements are preserved verbatim; and the bottom
dock is preserved unchanged.

## Decision

1. **Dedicated conversation route.** `ConversationPanel` (inline room inside the
   detail page) is replaced by a `ConversationPage` at `/voices/:id/chat`. The
   detail page keeps a summary row ("Percakapan · n pesan · aktif · Buka Chat")
   implemented as a shared `LinkCard`. `conversationState: UNAVAILABLE` redirects
   to the detail page; `READ_ONLY` renders the log with a read-only alert and no
   composer. Asking the reporter a question (PRD §16) navigates to the chat page.
   A shared `useConversation` hook (message cursor feed + send mutation, one
   query key) serves both the summary card and the page so cache and polling
   stay unified.
2. **Scoped topbar supersession.** `WorkforceShell` suppresses the shared topbar
   only for the detail and chat routes; every other surface keeps the ADR-0023
   topbar. The hero's circular back control replaces the topbar back affordance
   on these two pages.
3. **Shared `VoiceHero`.** One component renders the band and the white card in
   four variants: `full` (detail: visibility/severity/status/category chips,
   Area+PIC split with hairline grid, location row), `compact` (chat: severity,
   PIC, area chips), the Union variants (consent-first chips, identity columns,
   and the "Identitas disembunyikan" / "Identitas ditampilkan atas persetujuan
   pelapor" plates carried over verbatim), and the closed variant (check plate
   and "Ditutup {date}" pill). Display ids, severity/status/category names come
   from the existing contract fields (`displayId`, `categoryNameSnapshot`,
   localized label maps) — no contract change.
4. **Detail restructure.** The action panel becomes a flat action row under the
   hero card (outline actions read in the brand blue accent; Proses/Tutup stay
   filled primary; dialogs unchanged). A plain "Detail Voice" section carries
   the body text and icon meta rows (Diajukan, Diperbarui, Klasifikasi, Kategori,
   Kelengkapan lokasi). Attachments, Percakapan, and Timeline render as link
   cards; Timeline expands inline. Rating, closure, and Union reporter cards
   keep their anchors and are restyled into the same language.
5. **Chat page anatomy.** Messages group by Jakarta calendar day with a
   hairline divider ("Hari ini" / "Kemarin" / "1 Sep 2026"). Outgoing bubbles
   are solid brand blue, right-aligned, labeled "Anda"; incoming bubbles are
   light neutral with a brand-tinted circular avatar and the sender label.
   Sender labels resolve privacy-first: `sender.alias` (anonymous Union),
   then the current handler's display name, then audience-specific reporter
   labels. Timestamps render under each bubble. The composer is pinned above
   the bottom dock with a circular attach control, a pill input, and a circular
   send control; it auto-focuses on open per PRD §16.
6. **Cumulative rating stars.** `RatingInput` (packages/ui) fills stars
   cumulatively from the left in the brand blue for the selected count, with
   hover/keyboard preview of the prospective fill; unfilled stars are neutral
   gray. Radio semantics and the accessible label are unchanged, and the shared
   package stays byte-identical for Admin (CSS and component behavior are
   additive and render-neutral for its existing read-only usages).
7. **Compatibility.** No `:has()`, no new backdrop-filter dependency; the
   hero band uses negative margins against the existing content padding tiers;
   the composer offset matches the dock clearance plus safe area. iOS 11.3
   e2e coverage moves to the chat route.

## Rationale

- A dedicated route gives the conversation first-class navigation, shareable
  deep links, and room to grow (attachments, typing states) without inflating
  the already long detail page.
- One hero component keeps the two surfaces visually identical and confines
  the audience branching (union consent, closed state) to a single place.
- The chat summary card and page sharing one query key means a message sent on
  the page is reflected in the detail summary on return without extra fetches.
- Cumulative fill communicates quantity ("4 of 5") directly, which the uniform
  accent row did not; keeping Radix radio semantics preserves keyboard and
  screen-reader behavior.

## Alternatives Considered

- Keep the inline conversation panel and restyle it — rejected: the mockup's
  chat anatomy (day dividers, pinned composer, bubbles) does not fit inside the
  detail column, and deep-linkable chat state was already requested by PRD §16.
- Route the chat under a modal/sheet — rejected: sheets lose scroll position
  and cannot host a pinned composer above the dock reliably on legacy engines.
- Replace the topbar globally with the hero — rejected: the topbar carries
  unread notifications and account affordances on every other page; the
  supersession is scoped to the two redesigned surfaces.
- Implement cumulative fill with sibling-state CSS (`:has()`) — rejected:
  iOS 11.3 Safari lacks `:has()`; the `data-filled` attribute approach works
  on the legacy engine.

## Consequences

- `/voices/:id/chat` is a new deep link; notifications pointing at a Voice
  still land on the detail page, which links onward.
- Visual baselines for the detail, chat, lightbox, close sheet, assign sheet,
  and union identified surfaces were regenerated delete-first and verified in
  two consecutive runs.
- The bottom dock remains unchanged on both surfaces, including its role-varied
  icon-only composition, per the product owner's locked decision.
