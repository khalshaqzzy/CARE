# ADR-0063: Director operations dashboard, Director Private read access, and Division Head as responder

- Status: Accepted
- Date: 13 October 2026
- Related: PRD §6.6, §7, §18.5, §18.8.6, §18.8.7; ADR-0006, ADR-0060, ADR-0062

## Context

ADR-0060 moved unit heads and Division Heads to the operations dashboard and left Director and Union on the blue-hero organization dashboard. The product owner asked for the Director dashboard to carry the same style and information as Manager, Section Head, and Group Leader, with three differences:

- A Director only acknowledges Voices and never responds. The basis switch and Butuh Tindakan Saya do not apply.
- The organization filter must allow the whole organization or one division.
- The Director must read every Private Voice, read-only, with full detail including the reporter identity the reporter consented to show.

The product owner also confirmed that Division Heads now respond like Managers, so the "Leadership · Read-only" chip on their dashboard is wrong.

Before this decision, Private Voices were readable only by Union (by role) and CARE Admin (audited, full identity).

## Decision

1. **Director operations dashboard.** Director renders `OpsDashboard` in an observer mode:
   - One handling view. There is no basis switch, and `basis` in the URL is ignored.
   - No Butuh Tindakan Saya and no "Diri Saya" toggle.
   - Cards: Status Voice, Sebaran Voice Masuk, Kecepatan Respons & Penanganan, Performa Responder, Partisipasi Anggota, and Aktivitas Anggota.
   - The organization chip opens the existing Direktorat → Division → Department → Section selectors, starting at the whole organization.
   - The "Leadership · Read-only" chip stays.
2. **Operations figures for Director.** The General aggregate computes `statusToday`, `onTime`, `specialHandling`, and `reporterOrigins` for Director on the handling basis. It does not compute `otherBasisTotal`, because Director has no switch.
3. **People endpoints for Director.** `/dashboard/handlers` and `/dashboard/participation` accept Director and treat them like a Division Head over the whole organization, with every member in the selected organization.
   - Performa Responder for Director lists Division Heads (role `DIVISION`, unit label = division) before Managers, Section Heads, and Group Leaders. Division Heads respond like Managers, so the Director compares them too.
   - Viewers below the Director never see Division Heads as rows.
   - On phones, the four role tabs wrap two by two.
   - `/dashboard/me` still refuses Director.
4. **Director Private read access.**
   - `browseScope` gives Director every General and Private Voice. The session detail scopes become `GENERAL_ALL` and `PRIVATE_ALL_READ_ONLY`.
   - The detail uses the Union audiences: `UNION_IDENTIFIED` when the reporter consented, otherwise `UNION_ANONYMOUS` with the alias. Conversation participants and messages hide an anonymous reporter as they do for Union.
   - Director receives no Private actions. `mayAct` and `computeAvailableActions` already restrict Private actions to the Union Head and the assigned officer.
   - Every Private read by Director is audited exactly like CARE Admin: `PRIVATE_LIST_READ`, `PRIVATE_DETAIL_READ`, `PRIVATE_TIMELINE_READ`, `PRIVATE_MESSAGE_READ`, and `PRIVATE_MEDIA_READ`.
   - The Private dashboard (`visibility=PRIVATE`) accepts Director with the Union Head scope (every Private Voice, Union handler buckets) and without `pendingAssignment`.
   - `GET /work-items` accepts `visibility=PRIVATE` for Director and returns every Private Voice with the reporter alias.
5. **Director Home and Voice Member.**
   - Home has a **General Voice / Private Voice** switch. The Private tab reuses the Union Head Private dashboard with a "Private · Read-only" chip and the Union PIC filter.
   - Voice Member has a **Jenis** filter (General / Private). Butuh Tindakan Saya is not shown.
6. **Division Head.** The "Leadership · Read-only" chip is removed from the Division Head dashboard.
7. **Per-person measure.** The per-person measure behind Performa Responder and `/dashboard/me` is rewritten to group every figure per person in one pass instead of correlated subqueries per person. The figures and attribution rules of ADR-0060 are unchanged.

### Follow-up decisions (13 October 2026)

- **Director Private board.** The Private tab uses the operations board instead of the Union hero layout: Status Voice with trend, Sebaran Private Voice (severity and handling per Union PIC), Kecepatan Respons & Penanganan, and Private terbaru with reporter aliases. The PIC Union filter sits in Filter lainnya. The aggregate computes today counts and timeliness for Director on Private; reporter origins stay General-only, so Private never groups by reporter organization. Union keeps its layout.
- **Department 14.** The master placeholder Department 14 is left out of the organization filter options, unless it is the viewer's own selected unit.
- **Area filter on people cards.** With an area selected, Performa Responder and Partisipasi Anggota list only people whose Pers Area (`OrganizationMembership.area`) is that area, and count only Voices in it. People without a Pers Area are not listed while an area filter is active.
- **Back from the chat.** The chat opened from a Voice detail steps back to that detail instead of pushing it again, so the detail's back returns to the Voice Member list with its filters.

## Rationale

Reusing the operations board keeps one dashboard vocabulary across leadership. Hiding the controls that only make sense for responders avoids implying that the Director must act.

Reusing the Union audiences gives Director the consented view of Private reporters, which the product owner chose over an aggregate-only or anonymous view. Auditing every read mirrors the existing CARE Admin control for privileged Private access.

## Alternatives considered

- **Aggregate-only Private for Director.** Offered as the least-privilege option and declined by the product owner.
- **Private list and detail without identity.** Offered and declined.
- **Keeping the basis switch for Director.** Prototyped. Both bases cover every Voice for a Director, so the totals are the same and the switch only changes the grouping.

## Consequences

- Private Voice is no longer Union-only. Reporters choosing Private are now also visible to the Director, within their identity consent. Any reporter-facing explanation of who reads Private Voices must mention the Director.
- The audit trail grows with each Director Private read.
- The rewritten per-person measure speeds up Performa Responder for every viewer. On the 50k-Voice, 10,000-account profile (local, sequential medians):
  - Director: 116 s before the rewrite, 2.7 s after.
  - Division Head: 2.5 s before, 0.43 s after.
- The Director General aggregate costs about the same as the Division Head organization-wide aggregate already in the performance gate (local median 249 ms vs 271 ms). The gate's Director requests use the reporter basis and are unchanged.

## Implementation

- **API:**
  - `auth/policy.service.ts` (Director browse scope)
  - `auth/auth.service.ts` (detail scopes)
  - `voices/dashboard.ts` (Director operations figures and Private scope)
  - `voices/dashboard-people.ts` (Director viewer, grouped measure)
  - `voices/voices.service.ts` (Director Private list, audits, `dashboardPrivate`)
  - `media/media.service.ts` (media audit)
  - OpenAPI enrichment and the regenerated `openapi.json` and `generated.ts` (`visibility` on `/work-items`)
- **Workforce:** `features/home/DashboardHome.tsx`, `features/home/OpsDashboard.tsx`, `features/home/DashboardPeople.tsx`, `features/work/WorkItemsPage.tsx`, `styles.css`.
- **Tests:**
  - `policy.test.ts`
  - `dashboard-people.integration.test.ts`
  - `union-inbox.integration.test.ts` (Director Private read, audits, refused assignment, Private aggregate)
  - `e2e/dashboard.spec.ts`
  - `e2e/workforce-journeys.spec.ts`
  - `e2e/workforce.visual.spec.ts`
