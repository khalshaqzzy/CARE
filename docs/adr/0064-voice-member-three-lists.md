# ADR-0064: Voice Member as three lists — Butuh Tindakan Saya, Voice Untuk Unit, Voice Tim Saya

- Status: Accepted
- Date: 14 October 2026
- Related: PRD §18.8.6 (update of 14 October 2026), §18.8.7; ADR-0055, ADR-0059, ADR-0060, ADR-0063

## Context

After ADR-0060 and its 13 October follow-ups, the responder Voice Member page showed one list under two summaries:

- the **Butuh Tindakan Saya** card, whose counts open the Voices waiting for the viewer (`action=me`), and
- a status strip whose counts open the unit's Voices (`scope=unit`).

Both summaries rewrote the same list, so a reader could not tell which population was on screen. A **Tindakan → Semua / Tindakan saya / Selesai oleh saya** filter hid the difference further.

Home already separates two populations with the basis switch (ADR-0055): **Voice Untuk Saya** (handling basis) and **Voice Tim Saya** (reporter basis, the Voices the unit's members sent). Voice Member had no list for the second one. The **Pantau** link on the "N Voice tim lewat batas waktu" strip therefore opened the handling list, which does not contain the Voices it counts.

The read access already existed. `PolicyService.browseScope` lets a Manager read the General Voices their department's members sent, a Section Head their Section's, a Group Leader their Line's, and a Division Head their division's, wherever those Voices are handled. Only a list query was missing.

## Decision

1. **Three tabs.** Responders (Group Leader, Section Head, Manager/Default PIC, Deputy/Division Head) get a segmented control under the Voice Member title. Each tab shows its active total beside the label:
   - **Butuh Tindakan Saya** (default): `GET /work-items?action=me`, with the Butuh Tindakan Saya card above it. A **Tindakan** filter switches between **Menunggu saya** and **Selesai oleh saya** (`action=closed`).
   - **Voice Untuk Unit**: `GET /work-items?scope=unit`, with the status strip and the PIC filter.
   - **Voice Tim Saya**: `GET /work-items?scope=team`, with a status strip over the team cohort and no PIC filter.

   A Group Leader gets only the first and third tabs, because their unit list is effectively their own queue. Director keeps the single list with the **Jenis** (General/Private) filter from ADR-0063. Union is unchanged.

2. **`scope=team`.** It reuses the reporter-basis dashboard context (`OrganizationDashboard.context` with `basis: 'REPORTER'`) intersected with `PolicyService.detailScope`. The list is therefore exactly the cohort Home counts as Voice Tim Saya, and only Voices the viewer may open. Visibility is General only. Any `scope` other than `unit` or `team` is rejected with `SCOPE_FILTER_INVALID`.
3. **Actions are not list-specific.** Available actions continue to be computed per Voice and actor (`computeAvailableActions`). A team Voice that is also at the viewer's tier offers its actions in the detail, whichever tab it was opened from. No extra marker is drawn on list cards; such Voices also appear under Butuh Tindakan Saya.
4. **Tab totals.**
   - Butuh Tindakan Saya: `summary.total` of `GET /dashboard/preview`.
   - Voice Untuk Unit: the active statuses of that preview's `summary.status`.
   - Voice Tim Saya: the active statuses of `GET /dashboard/preview?basis=REPORTER`.

   The preview is used instead of the full aggregate to keep polling cheap.

5. **Pressed summaries.** The Butuh Tindakan Saya tile or urgency chip that matches the current filter is rendered pressed (`aria-pressed`): tiles get an accent outline, chips fill with their own colour. A second tap returns the tab to its unfiltered list. Tiles, chips, tabs and the status strip scale down while pressed and lift on hover (hover-capable devices only), and the list fades in when its filter changes. All motion is disabled under `prefers-reduced-motion`.
6. **Phone layout (≤ 479 px)**, shared with Home:
   - The four Butuh Tindakan Saya tiles form a 2×2 grid with the count beside a 12 px label. This replaces four columns with 10 px labels.
   - The three urgency chips share one row of equal columns. "Batas" in "Batas < 24 jam" is hidden visually on phones; the accessible name stays complete.
7. **Links from Home.**
   - Butuh Tindakan Saya counts and **Lihat selengkapnya** carry `tab=me`.
   - Every other Voice Member link carries `tab=unit` or `tab=team` according to the basis in view.
   - **Pantau** opens `tab=team&due=OVERDUE`. The list's overdue rule (`dueFilter('OVERDUE')`) matches the dashboard's `teamOverdue`.
   - Links without `tab` resolve as follows: `action` → Butuh Tindakan Saya; any other filter → Voice Untuk Unit; nothing → Butuh Tindakan Saya.

## Rationale

- One population per tab removes the ambiguity of two summaries filtering one list. The tab names reuse the vocabulary of the Home basis switch and the Butuh Tindakan Saya card.
- Reusing the dashboard contexts keeps Voice Member counts and lists identical to Home without a second definition of "unit" or "team".
- Leaving action availability to the existing per-Voice computation avoids a list-dependent permission path.
- Labels below 12 px and wrapped tile labels were reported as hard to read. The 2×2 phone grid trades about 40 px of height for legibility.

## Alternatives considered

- **Two tabs (Butuh Tindakan Saya / Semua Voice).** This was simpler, but it left the team population unreachable and kept **Pantau** pointing at the wrong list.
- **Underline tabs.** On a 360 px phone the third tab scrolled out of view, so it was rejected.
- **Card-style tabs with the total in the corner.** These were legible but taller, and differed from the Home basis switch.
- **A "Perlu tindakan Anda" chip, or a "Giliran Anda" dot, on team cards at the viewer's tier.** These were rejected as visual noise. The same Voices are already listed under Butuh Tindakan Saya, and the detail shows the actions.
- **11 px tile labels in four columns.** "Diselesaikan" touched the tile border at 360 px.
- **The full `GET /dashboard/general?basis=REPORTER` aggregate for the team total.** It costs more than the preview, and the tab needs only status counts.

## Implementation

- **API:**
  - `VoicesService.workItems` validates `scope` and maps `team` to the reporter-basis context.
  - `enrich-openapi.ts` documents `scope: unit | team`.
  - The generated OpenAPI and contracts were regenerated.
- **web-voice:**
  - `WorkItemsPage` resolves the tab (`resolveTab`), queries the matching list and totals, renders the segmented `.vm-tabs`, and limits filters per tab. Switching tabs keeps the organization selection from Home.
  - `ActionSummaryCard` accepts `active` for the pressed state, and renders the short phone label through `UrgencyText`.
  - `DashboardHome` adds `tab` to `listUrl`.
  - `OpsDashboard` gains `onOpenTeamOverdue` for **Pantau**.
  - `ACTION_LIST` and the closed filter carry `tab=me`.
- **Styles:** `.vm-tabs`, the pressed and motion rules, the one-row urgency chips, and the 2×2 phone tiles.

## Consequences

- Voice Member opens on the viewer's own work, where earlier it opened on the unit list. Bookmarks with organization or filter parameters still open the unit list.
- The **Tindakan → Semua** option no longer exists. The unit list is its own tab.
- Voice Member polls one more preview request (reporter basis, every 30 seconds) for responders.
- The 2×2 tile layout also applies to the Home card on phones.

## Validation

- **Local (Windows, Node 22.23.2, pnpm 11.8.0, Docker PostgreSQL):**
  - Typecheck passed for API and web-voice. OpenAPI and contracts were regenerated.
  - Unit tests passed (API 160, web-voice 127). Integration suites that call `workItems` passed 70/70.
  - Integration `dashboard-people` passed 12/12, including a new case. It covers: a team Voice handled in another department is listed and an incoming Voice from another department is not; Private is excluded; the preview total equals the list; `teamOverdue` equals `due=OVERDUE`; a Group Leader sees only their Line; an invalid scope is rejected.
  - Browser (Chromium, against the Vite dev server):
    - `dashboard`, `workforce-handover`, `workforce-journeys` and `member-voice`: new tests for the three tabs, the pressed toggle, **Pantau**, and the Group Leader's two tabs.
    - `workforce-a11y`, `workforce-security`, `voice-lifecycle`, `assignment-scroll` and `foundation` passed 66/66.
    - Legacy WebKit passed 6/6.
    - The only remaining failure, the Web Push notice in `workforce-journeys`, fails identically on unmodified `staging` with the dev server.
  - Axe found no violations on the Voice Member page.
- Screenshots at 360 and 1440 px were reviewed for all three tabs, the pressed states and the Home card.
- Hosted CI remains authoritative for capture, full-stack and performance gates.

## Risks and follow-up

- **Large teams.** The team list relies on the reporter-basis organization filter plus `detailScope`. Hosted performance gates measure the aggregate only; a team list for a large division should be watched after release.
- **Team overdue counts.** The `teamOverdue` strip on Home follows the dashboard date range, and the **Pantau** link carries the same range. A count without a range can differ from a list opened with one.
