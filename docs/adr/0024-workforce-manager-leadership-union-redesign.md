# ADR-0024: Workforce Manager, Leadership, and Union Redesign Implementation

Date: 31 August 2026
Status: Accepted

## Context

ADR-0022 implemented the first redesign slice (auth, Member Home, Create
Voice) and ADR-0023 the second (history, reporter detail, notifications,
account). This ADR records the third and final slice: the operational
surfaces — manager dashboard and inbox (`manager/17-manager-dashboard.png`,
`18-operational-inbox.png`, `19-responder-action-sheet.png`), leadership
read-only overview (`leadership/20-leadership-read-only.png`), and the Union
surfaces (`union/21-union-home.png` … `25-union-general-overview.png`). As in
the previous slices the PRD remains the behavioral source of truth, the Admin
application does not change, the mobile bottom dock keeps its existing
composition, and the shared mobile topbar is kept on every page (hero bands
render below it; the mockups' floating bell/avatar orbs are intentionally
omitted). Severity and status labels stay Indonesian
(Rendah/Sedang/Tinggi/Kritis · Terbuka/Verifikasi/Diproses/Selesai) and all
filters remain URL-param driven with the existing param names.

Unlike the earlier slices this one **does** touch the API: the concept screens
show data the contract did not carry (per-area buckets, previous-period
totals, per-candidate workload, PIC display names on list rows, manager
assignment backlog). All additions are optional, additive response fields —
no schema change and no migration.

## Decision

**Additive backend fields (`apps/api`, no migration).** `DashboardAggregate`
gains `area`/`areaCritical` buckets (groupBys through the existing
`suppress()` privacy gate) and an optional `previousTotal` computed by
shifting the `from/to` window back by its own duration (omitted when no
window is given). `GET /dashboard/general` also reports `pendingAssignment`
for scoped managers (OPEN + unassigned inside the actor's
directorate/division snapshot), matching the field Union Private already had.
`VoiceListItem` gains `currentHandlerName` (joined display name, powering
"PIC: {nama}" / "Belum ditugaskan" chips) and, for Union actors on PRIVATE
rows, `reporterAlias`. `AssignmentCandidate` gains `activeCount` (active
voices per candidate from one groupBy). OpenAPI is regenerated
(`enrich-openapi.ts` updated) and integration tests cover each field,
including actor-scoping and suppression interactions.

**App-level shared components (`apps/web-voice/src/components`).** `HeroBand`
(full-bleed cobalt band: eyebrow/title/description, read-only chip, stats
strip of tinted icon plates, `HeroInset` white summary card slot),
`KpiTrio` (Total/Aktif/Kritis with `generalKpiItems`/`unionKpiItems`
helpers), `DonutChart` + legend, `StatusDistribution` (stacked bar +
count/percent legend), `TrendCard` (y-ticks, date axis, gradient area,
end-value flag, "+n% vs periode sebelumnya" delta badge fed by
`previousTotal`), `InboxVoiceCard` (severity-edge card, whole-card button
`Buka {displayId}`, optional identity variant with alias tile, PIC chips),
`FilterPills` (icon-leading pill `Select`s + funnel `IconButton` with active
count badge opening a `Dialog mobileSheet` for secondary filters), and
`AttentionCard` (icon rows with optional navigation). Pure math lives in
`dashboard-math.ts` (bucket reads, active sums, distribution percents, donut
fractions, trend geometry) with unit tests. All styling is scoped to the
workforce bundle in `styles.css`; `packages/ui` is untouched except for the
mobile-sheet grab handle, which this bundle draws via
`.care-dialog--mobile-sheet::before`.

**Manager/Section Head (17).** The member hero and `StatusSummary` stay;
dashboard filters become pills (Area, period) plus the funnel sheet
(Kategori/Severity/Status/custom dates), and the old `dashboard-overview`
card grid is replaced by: KPI trio, "Distribusi Status" donut, trend card
with delta, severity/category chart cards, the org breakdown (PRD chart
minimums kept), and an "Inbox Voice Member" preview of three
`InboxVoiceCard`s (the member `VoiceCard` grid is untouched elsewhere).

**Operational inbox (18 + 22).** The page intro and KPI cards fold into a
`HeroBand` whose stats are role-aware (responder: Aktif / Menunggu
penugasan / Kritis with the manager backlog from the new aggregate field;
Union: Aktif / Belum ditugaskan (head) / Kritis). A quiet search field
("Cari judul atau ID" — server search covers title/displayId, not aliases)
sits above the pill row (Prioritas/Status plus Area/PIC or the Union
assignment filter), with category/dates in the funnel sheet. The list renders
`InboxVoiceCard`s + the existing `Pager`; `filter-summary` is gone, folded
into the funnel badge. All existing URL params and copy anchors survive.

**Leadership (20).** Hero gains the structural-position line and a
"Leadership · Read-only" lock chip; the hero inset is a KPI trio over the
General aggregate. Pills + funnel, trend with delta, `StatusDistribution`,
"Area yang perlu perhatian" `AttentionCard` driven by the new
area/areaCritical buckets (rows show "n Kritis" when critical > 0, else
"n Voice", and set the Area filter on tap), remaining PRD charts in the new
card language, and the privacy note that aggregates never show reporter
identities.

**Union home (21).** Hero role line ("Union Head"/"Union Officer") and the
inset "Private Voice" KPI card (Total/Aktif/Menunggu penugasan from
`dashboardPrivate`; for officers the third cell stays Kritis so no
assignment-queue affordance leaks to non-assigners). The head keeps the
"{n} Private Voice menunggu penugasan" queue row → `/work-items?unassigned=true`,
"Private terbaru" renders alias-aware `InboxVoiceCard`s, and a
"General Voice · Read-only" summary row navigates to `/general`. Quick-action
tiles remain (locked in ADR-0022).

**Union general overview (25).** `HeroBand` "Tinjauan General" with a
"Union · Read-only" chip and inset org summary; a new `range` URL param
(default 30d) feeds both `dashboardGeneral` and the list. Status
distribution, "Kategori utama" attention rows, trend + delta, "Perlu
perhatian" derived from the existing severity-sorted list query (preserving
the security probe's aggregate non-leakage semantics), read-only note, and
the suppression `DashboardNote`.

**Union detail (23 + 24) and action sheets (19).** The PRIVATE hero gains an
"ID: {displayId}" line and a three-column meta strip (anonymous:
Alias/Status/Severity; identified: Status/Severity/PIC) plus in-hero consent
plates: a dark "Identitas disembunyikan" plate for anonymous voices, a light
"Identitas ditampilkan atas persetujuan pelapor" plate with the reporter
inset card (name, No. Registrasi, division · department) for identified
voices; the separate anonymous ReporterCard is removed for Union audiences.
The close sheet keeps the required note + evidence contract but restyles as a
bottom sheet with "Catatan penyelesaian", an evidence shelf, and a lock note
("Catatan dan bukti akan terlihat oleh pelapor."). The assign sheet replaces
the Select with a `ChoiceCardGroup` radio list showing each candidate's
active-voice workload ("n Voice aktif"); mutation/idempotency logic is
untouched.

**Mockup deviations (product decisions).** Shared topbar kept everywhere;
Indonesian labels; quick-action tiles kept on home; filters as pills + funnel
sheet rather than every filter visible; area attention rows phrase counts
("n Kritis"/"n Voice") instead of the mockup's literal copy; search
placeholder announces its actual server behavior (aliases are not
server-searchable); member StatusSummary is unchanged on the manager hero
(the mockup's per-status counts would ripple into member surfaces whose
baselines must stay stable).

## Alternatives Considered

- Migrating the shared components into `packages/ui` — rejected; they encode
  workforce-only patterns, and keeping them app-level keeps the Admin bundle
  and its baselines untouched.
- A separate `previousTotal` endpoint or client-side refetch of the shifted
  window — rejected; computing it server-side from the same filter clauses is
  one query and cannot drift from the filtered aggregate.
- Deriving "Perlu perhatian" on `/general` from the aggregate buckets —
  rejected; the security probe asserts that no list-scope id/title leaks, so
  the section keeps deriving from the already-authorized list query.
- Renaming member StatusSummary to add counts on the manager hero — rejected;
  it is shared with Member Home and would invalidate member baselines for a
  mockup-only nicety.

## Consequences

- Visual baselines: `workforce-manager-dashboard-1440`,
  `workforce-voice-member-1440`, and `workforce-union-private-1440` were
  replaced and nine new 360px baselines added (manager home, Voice Member
  inbox, leadership home, union home, union private inbox, union general,
  union identified detail, close sheet, assign sheet). All were deleted
  before capture and verified across two consecutive runs; member/auth/
  wizard/design/admin baselines are byte-identical.
- `DashboardOverview` and its CSS are deleted; the funnel badge supersedes
  `filter-summary`.
- The officer home intentionally renders no assignment-queue affordance —
  e2e asserts zero "menunggu penugasan" text for officers, so any future
  officer stat must keep that guarantee.
- The API grew six optional response fields; consumers that do not read them
  are unaffected, and no migration/backfill is required.
- All 25 concept screens are now implemented; any further restyle work needs
  a new concept set.

## Validation

Frozen-lockfile install unchanged; `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm test:unit` (API 60, UI 18, frontend-core 14,
workforce 43, Admin 2), `pnpm build`, `pnpm audit --audit-level high` (only
the documented transitive Moderate), `pnpm openapi:generate` run twice with
byte-identical output (CI `openapi:check` passes on the committed result),
`pnpm migrations:destructive-check`, `docker compose config --quiet`.
Database-backed: `db:up/wait/verify/test:reset/test:migrate`,
`pnpm test:integration` **45 passed**, `pnpm test:security` **5 passed**,
`seed:performance` (50k voices/10k accounts) + `pnpm test:performance`
passed, `maintenance:reconcile` dry-run clean (0 orphans), `db:down`.
Playwright mocked `test:frontend:e2e` **143 passed** across chromium/visual/
pwa, verified across two consecutive runs. Gitleaks v8.24.3 directory scan
clean; `git diff --check` clean. Every new surface was reviewed at 360px
against its mockup (12/12 accepted), including the two bottom sheets.
