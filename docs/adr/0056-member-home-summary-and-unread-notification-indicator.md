# ADR-0056: Member home summary and unread notification indicator

- Status: Accepted
- Date: 28 September 2026
- Related: PRD §18.1, §18.8.3, §18.8.5; ADR-0043, ADR-0053, ADR-0055

## Context

The Member home (`MemberHomePage`) presented the reporter's own Voices in a white "Status Voice Anda" progress card (total, active fraction, segmented bar, and four status counts). Responder, leadership, and Union dashboards had meanwhile adopted a compact **Ringkasan Voice** card with a **Total N** chip beside the heading and four status counts (ADR-0043). The two homes therefore summarized the same four statuses in different visual languages.

The Member home also offered four separate ways to start a Voice in addition to the highlighted **Buat** button in the mobile dock (ADR-0053): a plus orb in the hero, a **Buat Voice** button beside "Voice Anda", a **Buat Voice** tile in "Aksi cepat", and a button inside the empty state. The repetition crowded the page without adding reachability, because the dock (mobile) and sidebar (desktop) are always visible.

Web Push notifications appeared as system pop-ups, but the in-app bell on the home hero carried no indication of unread notifications, so a user returning to the app had no signal that new notifications were waiting. `GET /notifications/unread-count` already existed and was used only by the notification center.

## Decision

1. A shared `VoiceSummaryCard` component renders **Ringkasan Voice** with the **Total N** chip and the Terbuka/Direspons/Diproses/Selesai counts. Both `DashboardHome` and the Member home use it; the Member home feeds it from `GET /dashboard/member` (`total`, `counts`).
2. The Member home removes every in-page create affordance (hero plus orb, "Voice Anda" header button, quick-action tile, empty-state button). Creating a Voice is reachable only from the navigation: the highlighted **Buat** dock button on mobile and the **Buat** sidebar item on desktop. The empty state points to the navigation menu instead.
3. The hero bell (`NotificationBellButton`) on every workforce home — Member, responder/leadership, and Union — shows a red count badge when unread notifications exist (capped at "99+") and no badge at zero. Its accessible name becomes "Lihat notifikasi, N belum dibaca"; the badge itself is `aria-hidden`.
4. The navigation dock and desktop sidebar carry no indicator. In the mobile **Lainnya** sheet, the **Notifikasi** entry shows a small "N belum dibaca" note beside its title when unread notifications exist.
5. The unread count is read through `useUnreadNotificationCount`, which uses the same query key as the notification center and polls every five seconds. Marking notifications read in the center invalidates that key, so the badge updates immediately.

## Rationale

One summary component keeps every role's home consistent and removes a second, divergent presentation of the same counts. A single create entry point in persistent navigation is sufficient and reduces visual noise on the page that reporters open most. Placing the unread indicator on the bell matches common mobile conventions; limiting it to the bell and the **Lainnya** sheet follows product-owner review, which found badges on the dock itself unnecessary. Rendering the sheet note as its own component means the count is only polled while the sheet is open.

## Alternatives considered

- **Keep the progress card for Members.** Rejected: it diverges from the responder summary the product owner asked to mirror.
- **Keep one in-page create button (e.g. the hero orb).** Rejected in favor of the navigation-only entry point.
- **Badge on the dock "Lainnya"/Union "Notifikasi" tab and sidebar item.** Prototyped so the indicator was visible on every page; rejected in review as unnecessary.
- **Push-driven invalidation from the service worker.** Would make the badge update without polling, but adds client messaging surface; five-second polling matches existing dashboard cadence.

## Implementation

- `apps/web-voice/src/components/VoiceSummaryCard.tsx` (new); `DashboardHome.tsx` uses it in place of its inline summary and `Metric` helper.
- `apps/web-voice/src/features/home/HomePage.tsx`: Member hero uses `VoiceSummaryCard` and `NotificationBellButton`; create buttons and the create quick action are removed.
- `apps/web-voice/src/features/notifications/NotificationBell.tsx` (new): `useUnreadNotificationCount`, `UnreadCountNote`, `NotificationBellButton`.
- `apps/web-voice/src/App.tsx`: the **Lainnya** sheet renders `UnreadCountNote` beside **Notifikasi**.
- `apps/web-voice/src/styles.css`: `.member-hero__bell`, `.unread-badge`, `.more-menu__title`, `.unread-note`.
- No API, schema, permission, or OpenAPI change. `StatusSummary` remains in use for the personal section of responder dashboards.

## Consequences

- Members see the same summary layout as responders; the active-percentage bar is no longer shown on the Member home.
- On pages other than home, unread notifications are visible only through the **Lainnya** sheet (and Union's notification tab destination). Union has no **Lainnya** sheet, so its indicator is the home bell.
- Each open home page adds one unread-count request every five seconds.

## Validation

- Workforce typecheck, ESLint and Prettier on changed files, and the web-voice production build passed.
- Chromium browser runs of the member, workforce journey, and dashboard specs passed 70/70, including new coverage: Member summary total/status counts and no in-page create buttons; bell badge for Member, Manager, and Union Head with no dock badge and no 360 px overflow; the "4 belum dibaca" note in the **Lainnya** sheet; no badge or note when the count is zero. The browser inventory assertion moved from 402 to 407.
- Workforce and dashboard visual specs passed 91/91. Screenshots of the Member, Manager, and Union Head homes at 360 and 1440 px and the **Lainnya** sheet were reviewed; generated images were not committed.
- Full-stack, database-backed, legacy WebKit, and Gitleaks jobs were not run locally (no Docker on the host); hosted CI is authoritative.

## Risks and follow-up

- If users miss notifications while away from home, a subtle dock indicator can be reconsidered.
- Push-message-driven cache invalidation could replace polling if request volume becomes a concern.
