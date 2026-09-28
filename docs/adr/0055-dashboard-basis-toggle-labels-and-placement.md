# ADR-0055: Dashboard basis toggle labels and placement

- Status: Accepted
- Date: 28 September 2026
- Related: PRD §18.8, §18.8.3, §18.8.4; ADR-0043

## Context

The organization dashboard (`DashboardHome`) computes every figure on one of two bases. `HANDLING` groups Voices by the organization that received and handles them; `REPORTER` groups them by the reporter's organization snapshot at submission. The basis choice was a pair of tabs labelled **Penanganan** and **Pelaporan** inside the filter card below the blue hero. Switching it silently replaced every figure on the page, including the **Ringkasan Voice** status counts in the hero above it. Because the control sat below the numbers it changed and the labels described an organizational mechanism rather than the reader's relationship to the Voices, unit heads found the two modes hard to distinguish.

Director and Union dashboards already cover all General Voices. At global scope both bases return the same total and differ only in organization grouping, so a basis choice there offers little value and adds another control.

The filter card header also carried a **Reset** action that cleared every dashboard filter. The dashboard polls every three seconds, but organization metadata is cached for 30 seconds and there was no explicit way to reload the view.

## Decision

1. The basis toggle is offered only to accounts without `DIRECTOR`, `UNION_HEAD`, or `UNION_OFFICER`: Section Head, Department Head/Default PIC (`MANAGER`), and Division/Deputy/Pjt. Head. Its labels are **Voice Untuk Saya** (`HANDLING`, default) and **Voice Tim Saya** (`REPORTER`). The group's accessible name is **Basis dashboard**, and each segment exposes `aria-pressed`.
2. The toggle is rendered inside the blue hero, directly above **Ringkasan Voice**. On mobile it is centered, spans the hero width with two equal segments, and is kept slim (36 px) and close to the summary. From 768 px it becomes a compact left-aligned pill. The toggle uses translucent white on the brand gradient, with the active segment in solid white and brand text.
3. Director and Union have one dashboard without a basis choice. Their requests always use `HANDLING`; a `basis` URL parameter is ignored for them.
4. The filter card header shows **Filter dashboard** on General dashboards and the scope label on Union Private. **Reset** is replaced by **Refresh**, which refetches organization metadata and the dashboard snapshot without changing URL filters. Clearing filters remains available through **Bersihkan filter** in the **Filter lainnya** sheet and **Reset filter** in empty and error states.

## Rationale

Placing the control above the summary it changes makes the dependency visible before the numbers are read. Labels framed from the reader's perspective ("for me" versus "from my team") describe the question each mode answers without requiring knowledge of handling projections or reporter snapshots. Limiting the control to unit heads matches where the two bases produce materially different populations.

Refresh addresses the only manual action the header needs once filter clearing is available elsewhere; a destructive reset beside the filters was easy to trigger by mistake.

## Alternatives considered

- **Single handling dashboard with a separate reporter section** below organization scope (total, four status counts, organization bars). This removed the mode entirely but reduced reporter-basis detail to a summary and added a second aggregate request per polling cycle. It was prototyped and not selected.
- **Rename only, keep the toggle in the filter card.** Lowest effort, but the control would still sit below the summary it changes.
- **Sticky toggle at the top of the page or floating above the mobile dock.** Both keep the control reachable while scrolling, but they cover content, compete with the dock and topbar, and separate the control from the summary. Both were prototyped and not selected.
- **Keep the toggle for Director and Union.** Rejected because their global scope makes both bases total the same.

## Implementation

- `apps/web-voice/src/features/home/DashboardHome.tsx`: `basisChoice` gates the toggle and forces `HANDLING` otherwise; the toggle renders inside the hero before the summary; the header shows **Filter dashboard** and a **Refresh** button (`RefreshCw`) that refetches metadata and the snapshot and is disabled offline.
- `apps/web-voice/src/styles.css`: `.dashboard-basis-bar`, `.dashboard-basis`, and `.dashboard-filters__title`, including a narrow-width rule below 360 px and reduced-motion handling.
- No API, aggregate, permission, schema, or OpenAPI change.

## Consequences

- Links shared by unit heads with `basis=REPORTER` continue to open **Voice Tim Saya**. The same link opened by Director or Union shows the handling dashboard.
- The toggle is not sticky; readers deep in the page scroll back to the hero to change mode.
- Union's hero keeps only its Private/General tabs, so no second toggle row appears on the Union General tab.
- Browser tests and the full-stack journey now locate the basis by the **Basis dashboard** group and new labels, and clear filters through the **Filter lainnya** sheet.

## Validation

- Workforce typecheck, ESLint and Prettier on changed files, and the web-voice production build passed.
- Browser projects (Chromium, PWA, push) passed 217/217, including new coverage showing that Director and Union Head render no basis group and request only `HANDLING` even with `basis=REPORTER` in the URL, and that Refresh issues a new metadata request while preserving area and basis filters.
- Legacy WebKit passed 6/6 and the native visual project passed 173/173. Captures for Department Head (Voice Untuk Saya and Voice Tim Saya), Director, and Union General at 360 and 1440 px were inspected; generated images were not committed.
- The browser inventory assertion was updated from 399 to 402 tests.

## Risks and follow-up

- "Voice Tim Saya" counts Voices reported by the unit's members, not Voices handled by the team. If readers misinterpret it, a short caption under the toggle can clarify the definition.
- If reporter-basis data becomes needed for Director or Union, it should be introduced as an organization-grouping choice on the scope chart rather than a page-wide mode.
