# ADR-0060: Unit-head operations dashboard, people insights, and labelled navigation

- Status: Accepted
- Date: 4 October 2026
- Related: PRD §3.3, §18.8–§18.8.6, §43; ADR-0043, ADR-0055, ADR-0056, ADR-0059

## Context

Unit heads (Group Leader, Section Head, Department Head/Default PIC, Deputy/Division Head) used the blue-hero organization dashboard with status counts, compact KPI cards, trend/severity/category charts, organization buckets, and an inbox. Tiered routing (ADR-0059) made these leaders the first handlers of most General Voices, which raised two needs the dashboard did not cover:

1. How the leaders below a unit head handle Voices: who held them, who answered late, whose deadline passed and moved the Voice up.
2. Which members of a unit report through CARE and which never have.

The product owner also supplied two visual references for a white operations board and decided that handling performance and participation figures may feed formal performance evaluation. PRD §3.3 previously listed performance management as a non-goal.

The workforce bottom navigation showed icons without labels on mobile and grouped Notifikasi and Akun under a "Lainnya" sheet.

## Decision

1. **Operations dashboard for unit heads.** Accounts without `DIRECTOR`, `UNION_HEAD`, or `UNION_OFFICER` render a new `OpsDashboard`. Director and Union keep the existing hero dashboard. It contains:
   - A profile card with the basis switcher (with both totals), a "Voice saya" line, and filter chips.
   - Status Voice with "+N hari ini", a proportion bar, and an embedded trend.
   - A speed card with the previous-period comparison, "Tepat waktu", and rating.
   - On Voice Untuk Saya: Sebaran Voice Masuk (category tiles including zeros, severity, reporter origins, handling per unit), Performa Responder, and Butuh Tindakan Saya.
   - On Voice Tim Saya: an overdue-team strip, Partisipasi Anggota, Sebaran Voice Tim, and Aktivitas Anggota.
2. **No SLA targets.** Timeliness is measured against the per-severity, per-tier deadlines configured by Admin (§43.4). The comparison is shown only when a date range defines a previous window of equal length.
3. **People endpoints.** `GET /api/v1/dashboard/handlers` and `GET /api/v1/dashboard/participation` accept the dashboard parameters, reuse the dashboard scope resolution, and read people from the active organization snapshot. They are available to Section Head, Manager, and Deputy/Division Head only. A Section Head is limited to their own Section.
4. **Attribution.**
   - A Voice counts as held by everyone it reached: tier holders, observers and participants, the PIC, response/process/close actors, and escalation recipients.
   - Automatic `ESCALATED` events now record `previousHolders`. A holder on leave is replaced by the active substitute. Older events fall back to their carrier actor.
   - Shared holders all carry a missed window. Fixed categories count toward the assigned PIC.
   - Response time runs from when the Voice reached the person.
   - Timeliness is (held − missed − overdue) / held.
5. **Participation** counts every Voice a member submitted in the range, General and Private, without exposing content, route, or Private identity. Unactivated accounts (`passwordChangeRequired`) and employees without accounts are distinguished from active non-reporters.
6. **Dashboard view additions.** `DashboardView` gains `statusToday`, `previousPerformance`, `onTime`, `reporterOrigins`, `teamOverdue`, and `otherBasisTotal`. The General preview is ordered by the nearest `tierDueAt`, then severity, and carries `tierDueAt`, `reporterName`, and `reporterDepartment`.
7. **Voice Saya.** The profile line links to `/history`, which now opens with a summary card. Its status tiles act as filters, and it shows a pending-rating strip, using the existing member dashboard aggregate.
8. **Labelled navigation.** The mobile dock shows labels for every role:
   - Member: Home, Buat Voice, Voice Saya, Pengaturan.
   - Responder: Home, Voice Member, Buat Voice, Voice Saya, Pengaturan.
   - The "Lainnya" sheet is removed; notifications open from the Home bell.
   - Icons: house, two people, plus, file with clock, gear.
9. **Type.** Headings and figures use Plus Jakarta Sans, self-hosted because the production CSP allows `font-src 'self'` only. Body text keeps Inter.
10. **Evaluation.** PRD §3.3 states that the figures may inform performance evaluation while CARE does not become an evaluation system. Every figure must remain traceable to recorded events.

### Follow-up decisions (5 October 2026)

- **Performa Responder.** Group Leaders appear only for departments with an active shop (`ShopLocation` status `ACTIVE`). Elsewhere the Section Head is the first responder, so the card shows Section Heads only and the Group Leader tab disappears.
- **Profile card.** It uses the cobalt page-band gradient so Home matches the blue headers of the other workforce pages (version A: it stays a card).
- **"Lihat semua" sheets.** They show one bordered tile per person. The sheet list takes keyboard focus because it scrolls.

### Follow-up decisions (6 October 2026)

- **Butuh Tindakan Saya.** It becomes a summary under the profile card on Voice Untuk Saya: total, Lewat batas, Batas < 24 jam, Belum direspons, Kritis, and the most urgent Voice.
  - The ticket grid is removed.
  - Counts come with `GET /dashboard/preview` (`summary`), outside the aggregate, so the 50k-Voice gate is unaffected.
  - Each count opens Voice Member with a matching filter. The new list filter `due=OVERDUE|SOON` shares one predicate with the summary (tier window passed, or the live handling target of the current cycle passed), so the count and the list agree.
- **Level controls.** The level tabs and "Lihat satu level lebih luas" are removed from both spread cards. The organization filter already sets scope and level.
- **Trend.** Trend buckets are tap targets that read out their count. On Voice Untuk Saya they link to Voice Member for that period. The team trend does not link, because Voice Member lists handled Voices.
- **Voice Member.**
  - **Header:** title and one line only.
  - **Summaries:** the same summary card plus a compact status row.
  - **Filters and ordering:** a Tenggat filter and an Urutkan control.
  - **Default "Perlu tindakan" order:** status, then nearest tier deadline, then severity, then newest. A new low-severity Voice no longer sinks below older handled ones.
  - **Union** keeps severity order and its header counts.
- **"Direspons" → "Direspon"** across the product.

## Rationale

Placing people insights on the same filtered cohort as the dashboard keeps every number consistent with what the viewer can already see. Recording the holders who missed a window at escalation time avoids reconstructing history from mutable arrays and makes substitutes accountable for the period they covered.

Showing both basis totals on the switcher costs one count query instead of a second full aggregate request.

A labelled dock removes guesswork about icon meaning, a recurring issue for occasional users on the production floor. Removing "Lainnya" leaves notifications on the bell, which already carries the unread badge.

## Alternatives considered

- **People insights inside the existing hero layout.** Prototyped first. It was superseded by the operations-board direction the product owner selected.
- **A separate personal Voice card at the end of Home.** Prototyped as version C. The one-line entry (version B) was chosen, with the summary moved onto the Voice Saya page.
- **Atkinson Hyperlegible Next, Overpass, and Schibsted Grotesk + Public Sans.** Rendered for comparison. Plus Jakarta Sans was kept by product decision.
- **Fixed SLA targets ("< 2 jam").** Rejected: deadlines vary by severity and tier, and invented targets would contradict the configured calendar.
- **Hiding Private Voices from participation counts.** Considered for anonymity. Counting them was confirmed by product decision because managers still cannot open Private content.

- Category tiles on the Voice Tim Saya spread were considered during design review. The product owner's instruction "Kategori tetap semua tapi bukan dalam bentuk bar" was given under the Voice Untuk Saya feedback, and the approved Voice Tim Saya reference uses bars with Kategori / Severity / Unit pengirim sub-tabs, so bars remain there.

## Implementation

- **API:**
  - `apps/api/src/voices/dashboard.ts`: reusable `performanceFor`, `statusToday`, `onTime`, origins, team overdue, other-basis total, `decodeOrganization`.
  - `apps/api/src/voices/dashboard-people.ts`: new.
  - `voices.service.ts` and `voices.controller.ts`: new endpoints and preview ordering/fields.
  - `tier-escalation.service.ts`: `previousHolders`.
  - OpenAPI enrichment scripts and the regenerated `openapi.json` and `generated.ts`.
- **Workforce:**
  - `features/home/OpsDashboard.tsx`, `DashboardPeople.tsx`, `DashboardHome.tsx`, `workforce-api.ts`.
  - `features/history/HistoryPage.tsx`, `App.tsx`, `lib/navigation.ts`, `features/notifications/NotificationBell.tsx`.
  - `styles.css` and the self-hosted font in `assets/fonts` (with its OFL licence).
- **Removed:** the hero basis toggle styles and the "Lainnya" sheet.
- **Design record:** product context in `apps/web-voice/PRODUCT.md` and the surface brief under `apps/web-voice/.impeccable/surfaces/`.

## Consequences

- Unit-head Home no longer shows the KPI card row, the separate chart cards, the Inbox section, Aksi cepat, or the personal Voice section. Their content moved into the operations cards, the Voice saya line, and the dock.
- The aggregate costs less than before. The first version issued the new figures as separate queries and failed the hosted 50k-Voice gate (p95 3.7 s against 3 s). It was restructured:
  - **One Voice scan.** It reads the unit's scope and the other basis together; the other-basis total is counted from that same set.
  - **Shared summary pass.** Today counts, timeliness, and team overdue are computed in the existing performance summary pass.
  - **Grouping sets.** The breakdown buckets, origins, and the daily trend are grouping sets.
    - Unit scopes group the shared cohort.
    - Organization-wide views (Director, Union, Division leadership) group straight from Voice.
    - Weeks and months roll up from days in code, so the separate trend query is gone.
  - **Custom category names.** These are resolved only for the custom keys present in the cohort, instead of scanning every scoped Voice on each poll.
  - **Director and Union.** These views skip the operations figures.
  - **Previous-period performance.** This remains an extra query when a range is set.
- Shared Default PIC or Section Head constellations that do not appear as leaders in the active snapshot are not listed as people rows.
- Mobile notifications are reached from Home only.

## Validation

- **Local (Windows, Node 22.23.2, pnpm 11.8.0, Docker PostgreSQL):**
  - Lint passed. Unit tests passed (API 160, workforce 127, UI 26, frontend-core 15, Admin 2).
  - OpenAPI regeneration completed.
  - The new `dashboard-people` integration suite and the extended escalation test passed. The full integration run passed 142/143; the remaining `admin-safety` transaction-start timeout is a known local issue unrelated to this change. Security tests passed 14/14.
  - Browser (Chromium, PWA, push) 240/240 plus the new tests. Visual capture passed all scenarios. Fullstack 6/6.
  - Legacy WebKit 5/6; the forced-password gate also fails on unmodified `staging` on this machine.
  - Gitleaks found no leaks. The browser inventory is 436.
- Accessibility checks found three contrast defects (zero-category text, grey on accent tint, success green), which were fixed before delivery.

## Risks and follow-up

- Aggregate latency under the 10,000-account performance profile must be confirmed by the hosted gate.
- Person rows depend on structural positions in the active snapshot. Default PICs without a Department Head position are not listed.
- If performance figures are used formally, a documented review of attribution edge cases (manual raises, handovers, reopen cycles) with HR is recommended.
- Director and Union may adopt the operations layout later; their dashboards were intentionally left unchanged.
