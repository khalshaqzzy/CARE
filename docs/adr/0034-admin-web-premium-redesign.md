# ADR-0034: Admin Web Premium Redesign

Status: Accepted

Date: 2026-09-03

## Context

The Admin web app (`apps/web-admin`) had a functional but dated interface: a
generic `PageHeader` per page, bespoke cards, and a single `admin-shell-1440`
visual baseline. Seven design targets in
`.agent/design-images/admin-web-redesign/` (overview, import, remediation,
union, accounts, voice explorer, audit) defined a premium direction: white
260px sidebar with a solid cobalt active pill, blurred white topbar with a
pale-green session pill, cool-gray canvas, white 12px cards, pastel status
pills, uppercase table headers, and Bahasa Indonesia copy.

The mockups were produced against an instrument-management domain (instrument
codes, `PENDING_VALIDATION` statuses, future-API metadata columns) that does
not match the CARE product contract. PRD §11.5 locks nine Admin destinations
and read-only Voice Explorer semantics; the CARE Admin capability, audit, and
auth rules (§6.1, §8.3, §18.6) must not change.

## Decision

Rebuild all nine Admin pages plus every sub-surface (drawers, dialogs,
category configuration, import preview/confirm, voice detail with
timeline/messages, union replace, account reset/status, AI configuration,
login/change-password, desktop gate fallback) in the premium visual language,
while keeping CARE domain data, real wire enums, Bahasa Indonesia copy, and
existing API contracts.

Key points:

- Mockups are treated as layout and style references only. Instrument columns,
  foreign statuses, and invented future-API values are not implemented; the
  metadata column on Accounts shows real structural position or an explicit
  em-dash rather than fabricated data.
- All new CSS ships in the Admin bundle (`apps/web-admin/src/styles.css`,
  `admin-*` classes) and new shared components live in
  `apps/web-admin/src/components/` (`AdminPageHeader`, `AdminKpi`,
  `AdminFilterBar`, `AdminStepper`, `AdminSegmentBar`). The shared
  `packages/ui` package is untouched, so the workforce app is byte-identical.
- One small additive backend extension supports the Overview: `GET
/api/v1/admin/overview` gains optional `voices` (counts by status plus open
  critical), `latestImport.summary` counts, and `failedAudits`. No migration,
  no breaking change; OpenAPI and `@care/contracts` are regenerated
  deterministically.
- CSV exports on Import preview, Audit, and Voice Explorer are client-side
  downloads of already-loaded pages; no raw-file or bulk-export endpoint is
  added.
- Established e2e anchors are preserved (`Unggah file organisasi`, `Antrian
remediation`, `Tangani issue`, `Scope terdampak`, `Tidak ada kontrol aksi`,
  `Budi Santoso (000128)`). Where the redesign renamed an affordance
  (`Preview` becomes `Validasi data`, text `Filter action` becomes the `Action`
  select, exact `Union Head` title becomes `Head (Akun Utama)`), the
  full-stack spec is updated to the new affordance or a substring match.
- Visual coverage grows from one shell baseline to per-page baselines at
  1440px (`admin-overview/imports/remediation/union/accounts/voices/audit/
system/account-1440.png` plus regenerated `admin-shell-1440.png`),
  regenerated delete-first and verified across two consecutive deterministic
  runs.

## Rationale

A premium, consistent Admin workspace reduces operator error on sensitive
flows (import confirm, union rotation, account deactivation) and brings the
Admin app to the same design bar as the recently redesigned workforce app.
Keeping the change frontend-led with a single additive endpoint avoids
migration risk and keeps Phase 13/14 sequencing unchanged.

## Alternatives Considered

- Pixel-close replication of the mockups, including instrument tables and
  foreign statuses: rejected because it would violate the PRD product contract
  and break backend authorization semantics.
- Full backend extension (route inventory, bulk actions, audit export
  endpoints): rejected as out of scope; client-side CSV and existing
  cursor-paginated endpoints cover operator needs without new attack surface.
- New shared components in `packages/ui`: rejected per ADR-0014 to keep the
  workforce bundle byte-identical.

## Implementation Details

- Shell: hexagon-style cobalt brand tile, footer icons for Akun Saya/Keluar,
  pale-green session pill, pale-blue CA avatar plate, `#F6F8FB` canvas.
- Overview: five-KPI operational strip with segment bar, health strip, data-
  derived priority actions (remediation, union gaps, import state, readiness,
  critical voices, failed audits), latest-import table with percentages, and
  readiness-check route nodes.
- Import: four-step stepper, upload dropzone plus batch-summary card, tabbed
  change preview with client-side summary download, sticky Batal/Validasi
  footer, confirm dialog, history with failure codes, snapshot card.
- Remediation: route-mode card plus 2×2 route statistics, category table with
  icon Ubah/Arsipkan actions and full create/edit/history drawer, queue with
  status/type filters, blocked-submission alert, and the No-Reg default-PIC
  drawer.
- Union: tree cards for Head/Officer slots with replace dialog (username,
  display name, reason, optimistic term), kebab affordance, and the
  irreversible-replacement notice.
- Accounts: read-only badge, search/kind/status filter bar with result count,
  username/kind/org-context/status/route-dependency table, detail drawer with
  reset and activate/deactivate dialogs.
- Voice Explorer: eight-control filter bar with result count and active-filter
  pill, ID/visibility/severity/status/handler/updated table, read-only detail
  drawer with attachments, timeline, and messages.
- Audit: two-row filter card with active pills, result count plus client-side
  CSV export, mono action links, pastel result pills, truncated correlation
  IDs, humanized sanitized summaries, detail drawer.
- System/Account/auth: premium cards and headers; AI configuration flows
  (test/save/reset, optimistic versioning, write-only key) unchanged in
  behavior.

## Consequences

- Admin gains nine per-page visual baselines; future Admin UI changes must
  regenerate them delete-first.
- The overview response carries three additive fields; older Admin builds
  ignore unknown fields, and the e2e mock fixture is extended accordingly.
- No product-scope change: PRD text is untouched; IA, authorization, audit,
  and gate behavior are preserved.

## Validation Plan

- Frozen install, Prisma generation, dependency audit (moderate only),
  format, lint, typecheck, unit suites (API 79, UI 26, frontend-core 14,
  Admin 2, workforce 81), deterministic OpenAPI regeneration, migration
  safety, production build, PWA compatibility.
- Docker PostgreSQL integration (56 passed) and security (14 passed),
  50,000-Voice performance profile plus storage reconciliation.
- Mocked Playwright suite (177 passed: chromium, visual, PWA, push,
  legacy-iOS), full visual project across two consecutive runs (47 passed),
  a11y WCAG 2.1 AA plus no-overflow at 1280/1440 on all nine pages, and the
  gated full-stack suite (3 passed).
- Deployment validation, deployment harness, security-exception audit,
  Gitleaks directory scan, and `git diff --check`.

## Risks

- Mockup fidelity risk: instrument-domain details were intentionally not
  replicated; reviewers comparing pixels to mockups must evaluate layout and
  style rather than domain content.
- Baseline churn: the ten Admin snapshots will flag any future Admin UI
  change; regeneration must stay delete-first to avoid tolerance masking.

## Follow-up Work

- Phase 13 hosted staging acceptance and rollback rehearsal remain open and
  unchanged by this work.
- A hosted CI run for the `feat/admin-web-redesign` branch must go green
  before merge to `staging`.
