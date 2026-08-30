# ADR-0023: Workforce History, Voice Detail, Notifications, and Account Redesign Implementation

Date: 30 August 2026
Status: Accepted

## Context

ADR-0021 produced the 25-screen mobile concept set and ADR-0022 implemented the
first slice (auth, Member Home, Create Voice). This ADR records the second
implementation slice: Voice Saya/history (`history/12-history.png`), the
reporter voice detail including closed/rating states
(`voice-detail/13-reporter-conversation-detail.png`,
`14-closed-rating-reopen.png`), the Notification Center
(`notifications/15-notifications.png`), and the Account page
(`account/16-account.png`). As in the previous slice, the PRD remains the
behavioral source of truth, the Admin application must not change, the mobile
bottom dock keeps its existing composition, and no API, schema, or OpenAPI
contract changes are introduced.

Product decisions locked for this slice: the shared mobile topbar (brand
lockup, avatar, Keluar) is kept on all pages instead of the per-page headers
shown in the concept images; the voice-detail Timeline collapses by default;
the redesigned detail presentation applies to every audience (reporter,
responder, Union, leadership) rather than the reporter only; and severity
wording stays Indonesian (Rendah/Sedang/Tinggi/Kritis), consistent with the
long-standing label maps, even though the concept images and the ADR-0022
wizard rail use English severity tokens.

## Decision

**Shared additions (`packages/ui`, additive only).** `DotLabel` (feedback) renders
a semantic dot with a text label; the text is always the accessible value and
the dot is decorative. `RatingInput` (forms) provides 1–5 star selection on
Radix radio semantics with "n/5" accessible labels, plus a read-only summary
rendering for submitted ratings. `DisclosureRow` (sections) is a
dependency-free collapsible row card — icon tile, title/subtitle trigger,
rotating chevron, explicit `aria-expanded`/`aria-controls` and a labelled
region — used where the concept set collapses secondary content. `Field` gains
an optional `hideLabel` (visually hidden label via the existing `care-sr-only`
utility), and `Input`/`Textarea`/`Select` forward it; `Select` additionally
gains optional `leading` icon and `placeholder` props so filter pills can show
their own name inside the trigger. All additions default to byte-identical DOM
for existing usages, are registered in the public coverage contract,
specimenized on `/design`, and unit-tested (UI suite now 18 tests).

**History (screen 12).** The page keeps its query, URL-param filters, cursor
pagination, and states. The toolbar becomes a rounded search field
("Cari ID atau judul") above a row of three icon-leading pill selects
(Status/Severity/Area) with a quiet "Bersihkan" ghost button when filters are
active. The list renders a new compact `HistoryVoiceCard` — the whole card is a
44px button labelled `Buka {displayId}` — showing ID + visibility chip
(neutral General, brand-tinted Private), title, severity and status as
`DotLabel`s split by a hairline, and a relative "Diperbarui" line; a cobalt
edge bar marks voices still inside the lifecycle. The shared `VoiceCard` used
by Home and responder inboxes is untouched.

**Voice detail (screens 13–14, all audiences).** A slim in-content back row
(aria-labelled "Kembali", history-aware with a root fallback) carries the
displayId; the shared topbar stays. The old badge/meta grid is replaced by a
cobalt hero on `--gradient-brand-hero`: for open voices, white title with
icon-led meta rows (visibility, severity dot, status dot; area and
`PIC: {handler}` on a second row) — hero text is full white for AA and only the
decorative dots carry tone; for closed voices the hero leads with a check
plate, outline status/severity pills, and a "Ditutup {date}" pill. The PRD
detail fields that left the hero (Diajukan, Diperbarui, classification source,
category, location completeness) survive as a dashed-top key-value strip inside
the Detail card. Voice attachments render through a new `MediaGallery`
`variant="row"` (paperclip count + thumbnail strip, per-image links preserved);
chat and closure evidence keep the grid variant, with closure evidence laid out
two-up. Message bubbles adopt the concept layout — avatar plate for incoming,
brand-tinted right-aligned bubbles for the reporter, compact time inside the
bubble via the new `formatNotificationTime` — while sender aliases remain
available to assistive technology inside the bubble, preserving the Union
consent/alias contract; no read-receipt marks are rendered because the contract
has no delivery state. The Timeline collapses by default behind a
`DisclosureRow` ("Timeline · n pembaruan", always fetching as before so the
count is accurate). Closure presentation follows screen 14: the latest cycle is
featured in a "Penyelesaian" card (note, two-up evidence, submitted rating as a
read-only `RatingInput` with its feedback, reopen badge), and older cycles
collapse behind "Siklus penutupan #n" rows. Rating moves out of `ActionPanel`
into a dedicated inline card (heading "Bagaimana hasil tindak lanjutnya?",
`RatingInput`, feedback textarea with the contract's 2000-character counter,
and a "Buka kembali" outline toggle that only appears for scores 1–2 because
PRD §17.3 binds reopen to low ratings and requires rating+reopen to be one
atomic mutation — the toggle flips the `reopen` flag that "Kirim penilaian"
submits). The now-dead `RateDialog` and its `RATE` grid entry were removed; all
other `ActionPanel` behavior and anchors ("Tindakan", "Tanya Reporter",
"Tutup") are unchanged. Union consent blocks keep their contract text and are
restyled to the new section language.

**Notifications (screen 15).** The feed groups client-side by Jakarta calendar
day into "Hari ini" and "Sebelumnya" white cards with hairline-divided rows;
each row is an icon tile (existing type/tone map), bold title, muted body,
right-aligned compact time, and for unread rows a brand dot plus the existing
"Buka" action (mark-read + deep link). The per-row type badge is dropped — the
icon tile and the title text carry the type, so color is never the sole
carrier. The push settings card becomes a `DisclosureRow` header (tinted bell,
title, state pill "Aktif/Nonaktif") with its body open by default so the
switch, degraded-state guidance, and device list stay reachable without extra
taps; all existing anchors are preserved. "Tandai semua dibaca" stays a
brand-styled ghost action that still appears only while unread items exist.

**Account (screen 16).** The hero keeps the gradient card with a larger
initial avatar, name, `No. Reg` (or `@username` for Union), and icon-led chips
(status check, `Briefcase` kind, Union slot). Organization profile becomes
label-left/value-right rows (Posisi struktural, Directorat, Division,
Department, Section with "—" fallbacks; Union slot variant) without fake
chevrons on non-navigable rows. The separate capability/security cards merge
into one settings group: "Kemampuan akses" opens as a default-open
`DisclosureRow` containing the capability badges, followed by Notifikasi push
(→ `/notifications`), Ganti password (→ `/change-password`), a quiet ID sesi
row, and the unchanged danger Keluar row behind the existing confirmation
dialog.

**Formatters.** `formatRelative` gains a weeks bucket ("n minggu lalu") before
the absolute-date fallback, and `formatNotificationTime` renders Jakarta-clock
times ("07.00", "Kemarin, 15.45", "3 Agu 2026, 09.10") for notification rows
and chat bubbles. Severity labels stay Indonesian per product decision.

## Alternatives Considered

- Page-specific mobile topbars (brand+bell on history, Keluar-only on
  notifications, hidden topbar on account, back-arrow top header on detail) —
  rejected; the product owner chose to keep today's shared topbar, so the back
  affordance lives inside the detail content instead.
- Reporter-only detail restyle — rejected; one consistent presentation across
  audiences avoids maintaining two detail layouts, and the responder/Union
  anchors remain intact.
- English severity labels — rejected by the product owner for these pages,
  despite the concept images and the wizard rail using English tokens.
- A separate always-visible rating dialog trigger in `ActionPanel` — rejected;
  the inline card matches the concept and keeps rating+reopen atomic.
- Radix Collapsible for `DisclosureRow` — unnecessary dependency for a
  simple disclosure; a controlled button/region pair covers the semantics.

## Consequences

- Visual baselines: `workforce-history-360`, `workforce-notifications-360`,
  `workforce-account-360`, and `workforce-conversation-active-360` were
  regenerated, and `workforce-detail-active-360` plus
  `workforce-detail-closed-360` were added (the closed baseline is framed on
  the featured closure/rating region). Because the loose pixel tolerance could
  accept stale renders, the replaced baselines were deleted before capture so
  the new presentation is baked in, and the suite was verified across two
  consecutive runs. The `/design` overview baselines pass unchanged because
  their viewport-only captures stop above the new specimens; the Admin and
  shell baselines are untouched.
- Mock e2e fixtures grew richer: the default notification page now spans
  today/yesterday/older with mixed read states, member detail mocks support
  attachments and closure cycles, the message fixture includes a reporter
  reply, and the media stub renders neutral gray instead of near-black. The
  gated fullstack member journey now expands the collapsed Timeline before
  asserting its list items; `a-workforce-fullstack` needed no change because
  it only asserts the visible "Timeline" title.
- `RATE` capability now renders the inline rating card everywhere; any future
  lifecycle work must not reintroduce a second rating affordance.
- Remaining concept surfaces (manager/inbox/action sheet, leadership, union)
  require a follow-up slice with its own ADR.

## Validation

Frozen-lockfile install unchanged; `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm test:unit` (API 60, UI 18, frontend-core 14, workforce
35, Admin 2), `pnpm build` (precache 12), `pnpm openapi:check` (no drift),
`pnpm migrations:destructive-check`, `pnpm audit --audit-level high` (only the
documented ExcelJS transitive Moderate), Playwright mocked `test:frontend:e2e`
**132 passed** across chromium/visual/pwa, verified twice for determinism
(previously 120; the delta is the two new detail baselines plus fixture-driven
assertions), Gitleaks v8.24.3 directory scan clean, `git diff --check` clean,
and `docker compose config --quiet`. The database-backed suites
(integration/security/performance/fullstack) were not rerun because the change
set is frontend + e2e + docs only; the updated fullstack member journey runs in
hosted CI. No API, schema, or contract change; Phase 13 status is unchanged.
