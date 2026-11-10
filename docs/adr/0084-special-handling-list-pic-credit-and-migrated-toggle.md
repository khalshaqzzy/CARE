# ADR-0084: Penanganan Khusus on the dashboard, closures credited to the PIC, and migrated Voices behind a switch

- Status: Accepted (implemented on `feat/special-handling-and-migrated-toggle`, not released)
- Date: 10 November 2026
- Related: ADR-0061 (legacy Voice migration), ADR-0062 (Penanganan Khusus), ADR-0069 (tiered closure approval), ADR-0071 (stored dashboard timings), ADR-0026 / ADR-0051 (workforce bundle budget), PRD §15.5, §18.8.6, §48

## Context

Three problems were reported on the responder dashboard (Home) and Voice Member.

1. **Penanganan Khusus could not be found as a list.** A Voice in Penanganan Khusus (a Diproses Voice without a deadline, ADR-0062) carried a badge on its card and was counted as a small text "Penanganan Khusus: N" inside the Tepat waktu tile and on Performa Responder rows. No control opened those Voices, so a leader could not review them without scrolling every Diproses Voice.
2. **"Selesai oleh saya" did not match what responders expected.** The tile counted General Voices whose latest unreopened closure cycle had the viewer as `actorId`, plus reports done they had made. The intended meaning is "Voices I handled as PIC that are now finished". Two cases broke it:
   - A substitute acting for an away PIC (`actingFor`) could press Selesai or Laporkan selesai. The closure and the report were credited to the substitute, not to the PIC who handled the Voice. Approved reports were already credited to the PIC (ADR-0069); direct closures and reports by substitutes were not.
   - The count ignored the migrated/CARE distinction. Migrated Voices (ADR-0061) are imported closed, with the old platform's handler recorded as the closure actor, so they inflated "Selesai oleh saya" while the Status Voice card of the same viewer showed a smaller Selesai figure. A Section Head saw 6 in "Selesai oleh saya" and 4 Voices in total on Voice Untuk Saya.
3. **Migrated Voices mixed into every dashboard figure.** Total, status tiles, category, severity, the organization bars ("Migrasi Voice …" buckets) and participation counted migrated Voices, while timeliness and averages left them out. The same dashboard therefore mixed two populations, which made the figures hard to read.

## Decision

### 1. Penanganan Khusus chip and list

- The Status Voice card (Voice Untuk Saya and Voice Tim Saya) shows one amber chip **"N Penanganan Khusus ›"** under the Perlu perhatian row when the cohort in view has at least one Voice in Penanganan Khusus. It is hidden at zero and for the Director's read-only board.
- The count is the existing `specialHandling` figure of `GET /dashboard/general`, so it follows every dashboard filter (organization, area, range, category, severity, migrated switch).
- Tapping the chip opens Voice Member on the matching list (`tab=unit` or `tab=team`) with `due=SPECIAL`, keeping the dashboard filters.
- `due` on `GET /work-items` and `GET /voices` accepts `SPECIAL`: Diproses Voices whose current handling cycle has a `SPECIAL` target. Voice Member's Tenggat filter gains the option **Penanganan Khusus**.
- The variant was chosen from rendered mocks over a separate list card, to keep the dashboard short.

### 2. Closures and reports credited to the PIC

- `POST /voices/:id/close` and `POST /voices/:id/report-done` credit a General Voice's closure cycle (`ClosureCycle.actorId`), closure report (`ClosureReport.actorId`) and `Voice.closureReportedById` to the Voice's handler (`currentHandlerId`), even when a substitute pressed the button. Without a recorded handler (older route-owner closures) the actor is credited as before. Private closures remain credited to the Komite who closed them.
- Events (`CLOSED`, `CLOSURE_REPORTED`) keep the real actor, so the audit trail still shows who pressed the button.
- "Selesai oleh saya" (`PolicyService.closedByScope`) is: Closed General Voices whose open closure cycle is credited to the viewer, plus Diproses General Voices with a pending report where the viewer is the handler.
- Migration `20261110090000_credit_closure_to_pic` moves existing credits to the recorded handler for: the open closure cycle of closed General CARE Voices, pending closure reports, and `closureReportedById` of Diproses General Voices. Migrated, Private and handler-less Voices are untouched.

### 3. Migrated Voices behind a switch, CARE only by default

- The dashboard query gains `migrated=true|false` (default false). When it is not `true`, `OrganizationDashboard.context` adds `legacySource IS NULL` to the cohort, so every figure built on it excludes migrated Voices: aggregate, preview (status, Butuh Tindakan Saya), Performa Responder, "Diri Saya", participation, and the other-basis total. "Selesai oleh saya" applies the same rule.
- The hero filter row gets a small switch pill **Migrasi** (`role="switch"`, accessible name "Termasuk Voice migrasi"), after the range and filter controls. Off by default; on, it sets `migrated=1` in the dashboard URL and migrated Voices rejoin the volume figures. Timeliness and averages still leave them out, as ADR-0061 requires.
- Voice Member follows the same rule: `GET /work-items` accepts `origin=CARE|MIGRATED`. The page sends `origin=CARE` unless the URL carries `migrated=1` (set by the dashboard links when the switch is on) or the user is searching, so a migrated Voice can still be found by its old ID. Its tab counts use the same `migrated` choice.
- The switch was chosen from rendered mocks over a full-width "Termasuk Voice migrasi" line under the filters.

## Rationale

- Penanganan Khusus is a minority state; a chip next to the other attention chips makes it reachable without adding a card that would be empty most of the time. Reusing `due` for the list keeps one filter family for deadline-related views and needs no new query parameter.
- Crediting the handler matches how timeliness, response time and ratings are already attributed (the PIC who held the Voice) and how approved reports were already credited. The substitute is a stand-in for the PIC, not the owner of the work.
- Migrated Voices describe a different system with different rules (no tiers, no deadlines). Showing CARE-only figures by default makes each number explainable; the switch keeps historical volume available on demand without a separate page.

## Alternatives considered

| Alternative                                                                             | Reason not chosen                                                                                                             |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A separate "Penanganan Khusus" card listing up to three Voices with reason, PIC and age | Rendered as variant A; the chip (variant B) was preferred as simpler.                                                         |
| Keep "Selesai oleh saya" as "who pressed the button"                                    | Credits substitutes for work the PIC did and diverges from every other per-person figure.                                     |
| Count "Selesai oleh saya" from Voices the viewer's unit handled                         | Would no longer be personal; Status Voice already shows the unit's Selesai.                                                   |
| Exclude migrated Voices permanently from the dashboard                                  | Leaders still want historical volume on occasion; a switch costs one control.                                                 |
| A full-width "Termasuk Voice migrasi" line in the hero                                  | Rendered as variant T2; the compact pill (T1) was preferred. On phones the pill sits at the end of the scrollable filter row. |
| Default Voice Member to all Voices                                                      | Its counts come from the same preview endpoint, so the list and the counts would disagree.                                    |

## Implementation details

- API: `apps/api/src/voices/dashboard.ts` (`migrated` in `dashboardQuerySchema`, cohort clause), `dashboard-people.ts` (participation honours `migrated`), `voices.service.ts` (`creditedPic`, `close`/`reportDone` credit, `dueFilter('SPECIAL')`, `workItems` `origin`, preview `closedByMe` honours `migrated`), `apps/api/src/auth/policy.service.ts` (`closedByScope`).
- OpenAPI: `scripts/dashboard-openapi.ts` adds `migrated` to every dashboard operation; `scripts/enrich-openapi.ts` documents `due` `SPECIAL`, `migrated` `true|false`, and `origin` on `work-items`. `openapi.json` and `packages/contracts/src/generated.ts` regenerated.
- Migration: `apps/api/prisma/migrations/20261110090000_credit_closure_to_pic/migration.sql` (data only, no schema change).
- Web: `features/home/DashboardHome.tsx` (URL state `migrated`, links carry it, `onOpenSpecial`), `features/home/OpsDashboard.tsx` (Migrasi switch pill, Penanganan Khusus chip), `features/work/WorkItemsPage.tsx` (`due=SPECIAL`, `migrated`, `origin=CARE`), `styles.css` (`.ops-migrated`, `.ops-switch`, `.ops-special-chip`).
- The workforce main chunk is 148,123 bytes gzip (budget 166,640).

## Consequences

- Dashboard totals drop for units with migrated history until the switch is turned on. The "Migrasi Voice …" organization buckets and origins appear only with the switch on.
- Per-person figures move from substitutes to PICs for closures pressed by substitutes, including historical ones after the migration runs. Ratings follow their closure cycle and move with it.
- A substitute's own "Selesai oleh saya" no longer counts Voices they closed for someone else.
- The legacy Voice import integration test now asserts that imported Voices are excluded by default and counted with `migrated=true`.

## Validation

- Integration: `dashboard-people` (new case: CARE-only default for preview, aggregate and `action=closed`; `migrated=true` restores them; a substitute's report counts for the handler; `due=SPECIAL` lists exactly the special Voice; invalid `origin` rejected), `tiered-routing-foundation` (a substitute's direct close is credited to the away Group Leader and moves only the PIC's "Selesai oleh saya"), `legacy-voice-import` (updated). Full API integration and security suites pass locally.
- Browser: `e2e/dashboard.spec.ts` new case "Penanganan Khusus and the Migrasi switch carry into Voice Member" (switch state, `migrated` request parameter, axe on the dashboard, chip → `due=SPECIAL` list, `origin=CARE` default). Browser inventory count raised to 506.
- Rendered screenshots at 360 px and 1440 px were reviewed before and after implementation.

## Risks and follow-up

- The credit migration trusts `currentHandlerId` as the PIC of the latest closure. A Voice whose handler changed after it was closed (no such flow exists today) would be re-credited to the new handler.
- On phones the Migrasi pill is at the end of a horizontally scrolling filter row and may need a swipe to be seen. If users miss it, it can move before the area filter.
- Voice Member has no visible Migrasi control of its own; the state arrives from the dashboard link. A pill there can be added if needed.
