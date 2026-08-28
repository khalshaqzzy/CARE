# ADR 0006: Phase 8 Admin Operations — Contract Completion and Admin Application

| Field    | Value                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| Status   | Accepted                                                                                                      |
| Date     | 27 Agustus 2026                                                                                               |
| Authors  | CARE Engineering                                                                                              |
| Deciders | TMMIN Product, CARE Admin Owner                                                                               |
| Related  | PRD v1.1 §§6.1, 8.3, 9–10, 14, 20–21; ADR 0004 (v1.1 organization/routing/AI), ADR 0005 (frontend foundation) |

## Context

Phase 7 delivered the two-app frontend foundation: `apps/web-voice` (PWA) and `apps/web-admin` (desktop-only ≥1280 px, non-PWA) sharing `packages/ui`, `packages/frontend-core`, and a generated OpenAPI client. Backend Phase 6 had frozen the v1.1 contract for organization imports, routing, Union, AI Responses, and dashboard authorization.

Phase 8 is the first domain-complete Admin slice. The PRD and plan require closing remaining contract gaps before any workforce business journeys, then building every Admin journey inside the Phase 7 shell without introducing a new visual identity. Specific gaps were:

- Import preview/changes/list/history were not cursor-paginated, preview did not expose `checksum`/`version`/`expiry`/typed summary, and `POST .../confirm` did not accept `Idempotency-Key` + optimistic `checksum`/`expectedVersion`.
- No `current effective snapshot` or `organization-unit list/detail` with composite unit, head/member counts, route owner, and route health.
- Remediation, account, and Union mutations lacked `expectedCurrentRouteId`/`expectedCurrentTerm`/`reason` and eligibility-filtered account search.
- Account list/detail, reset-password, and activation/deactivation were missing pagination, sanitized audit, and legacy-ownership constraints, while `CARE_ADMIN` must remain immutable via Admin UI.
- Audit had no Admin-only list/detail, and Voice Explorer was not cursor-paginated with `search`/`status`/`visibility`/`severity`/`area`/`category`/`handler`/`date range`/stable sort, nor did every Admin Private read audit.
- `AdminPrivateVoiceDetail.reporter` was not type-exact, and `additionalProperties` was still used for rendered data.
- System Status was not typed through ` /health`/`/ready`/`/release.json`, and Admin still needed to stay network-only with polling only when visible.

Product also locks **exactly one** `CARE_ADMIN` credential for v1, created via `CLI/runtime secret`. The UI must not create, reset, or deactivate an Admin account; Admin can only change its own password. Section Head remains read-only derived from the active snapshot.

## Decision

Implement Phase 8 on a dedicated branch `feat/phase-8-admin-operations` in three sequential layers:

**1. Contract & Backend Completion (Phase 8.0).** Regenerate OpenAPI and `@care/contracts` so every response rendered by the UI is explicit (`additionalProperties: false` where applicable). All large lists use a signed opaque cursor (`encodeCursor`/`decodeCursor` over `id`), `limit`, server-side filter, and stable sort. Sensitive mutations use `Idempotency-Key` with `canonicalHash` of the payload, optimistic expectations (`checksum`, `expectedVersion`, `expectedCurrentRouteId`, `expectedCurrentTerm`), CSRF, `reason`, and return the fresh version. Add indexes for `ImportBatch(createdAt)`, `UserAccount(username,displayName,createdAt)`, `Voice(severity/title)`, `OrganizationUnit`, and `AuditEvent(action/result/correlation)` via `20260827000000_phase8_admin_ops`.

- `POST /admin/organization-imports/preview` returns `{id,checksum,version,expiresAt,status,summary,errors}` with bounded typed `OrganizationImportSummary` (`rowCount,unitCount,create,update,deactivate,unchanged,routeGaps,department14Rows,globalPicInvalid,unionGaps`). Individual changes are persisted as `ImportChange` rows and served only through cursor-paginated `GET .../{id}/changes` with `filter=CREATE|UPDATE|DEACTIVATE|UNCHANGED`; the 10 000 rows are never embedded in `summary`.
- `POST .../{id}/confirm` accepts `{checksum,expectedVersion}` and `Idempotency-Key`; stale preview, checksum mismatch, duplicate key with different payload, and expired `expiresAt` produce stable `409` codes (`CHECKSUM_MISMATCH`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `IMPORT_EXPIRED`, `IMPORT_NOT_CONFIRMABLE`). Success is `202`/`QUEUED` and is stored in `IdempotencyRecord` via `accountId_scope_key`.
- `GET /admin/organization-imports` and `GET /admin/organization-imports/{id}` are cursor-paginated and expose `PREVIEWED→QUEUED→PROCESSING→CONFIRMED|FAILED|EXPIRED`. Raw uploads are never downloadable.
- `GET /admin/organization-snapshots/current` and `GET /admin/organization-units` + `GET /admin/organization-units/{id}` expose the active snapshot, composite `directorate/division/department`, `memberCount`/`headCount`, `currentRouteOwner`, `routeHealth`, and `sourceSnapshot`.
- `GET /admin/remediation-issues` and `GET /admin/remediation-issues/history` are typed, paginated, and filterable by `status,type,organizationUnitId,batchId`. `PUT .../default-pic` and `PUT /admin/routes/global-special-pic` require an active workforce/Department Head, `expectedCurrentRouteId`, and `reason`; `Department = 14` and units with an active Department Head are rejected.
- `GET /admin/accounts` supports `search,kind,status,unitId,position,eligibility=default-pic|global-pic,cursor,limit` and never filters candidates in the browser. `PUT` Union slots require `username,displayName,expectedCurrentTerm,reason`, preserve `LegacyVoiceAccess` for active Voices, and revoke old sessions. Section Head candidates stay read-only.
- `GET /admin/accounts`/`GET /admin/accounts/{id}` are paginated with `search/kind/status/unitId/position` and `cursor`. `POST /admin/accounts/{id}/reset-password` sets the temporary password to `noReg` (workforce) or `username` (Union), revokes all sessions and push subscriptions, sets `passwordChangeRequired=true`, and is audited. `POST /admin/accounts/{id}/status` with `{status,reason,expectedVersion}` handles `ACTIVE|INACTIVE` with `Idempotency-Key`; workforce activation requires the employee still in the active snapshot, an active Union slot cannot be deactivated before replacement, and active/legacy ownership is enforced. `CARE_ADMIN` is excluded from all account mutations by type and policy.
- `GET /admin/audit-events`/`GET /admin/audit-events/{id}` are Admin-only, cursor-paginated, and filterable by `from,to,action,result,actorKind,resourceType,resourceId,correlationId`; the DTO is sanitized (no password/token/cookie/raw file/Voice body/Private identity).
- `GET /api/v1/voices` (Admin Explorer) is extended with `cursor,search(displayId/title),status,visibility,severity,area,category,handler,dateFrom,dateTo,sort` and stable sorting. Detail uses `AdminPrivateVoiceDetail.reporter` exact: `{noReg,name,directorate,division,department,section,position}` with `additionalProperties: false`. Every Admin read of Private — `list`,`detail`,`timeline`,`messages`,`media` — writes a redacted `AuditEvent` (`PRIVATE_*_READ`); any Admin Voice mutation is rejected.
- `GET /health`,`/ready`,`/release.json` are typed; only reduced/redacted diagnostics are shown and raw Prometheus metrics are not exposed.

**2. Admin Data Layer & Routing (Phase 8.1).** Split the monolithic `App.tsx` shell into feature routes: `Overview`, `Imports/Master Data`, `Remediation/Routes`, `Union Accounts`, `Accounts`, `Voice Explorer`, `Audit`, `System Status`, `Account`. Use the Phase 7 transport (`credentials: include`, lazy CSRF, `offlineError`), session-scoped `careQueryKey(sessionId, ...)`, targeted invalidation, typed error mapping, and network-only mutations. List/filter state lives in URL search params so pages are refreshable/shareable without persisting protected data. The desktop gate (`≥1280 px` in `main.tsx`) still prevents mounting the protected tree or fetching below the gate, and Admin never writes to `CacheStorage`/`IndexedDB` nor registers a service worker.

**3. Admin Journeys (Phases 8.2–8.4).** Built with `packages/ui` primitives only (`AppShell`/`Sidebar`/`PageHeader`/`StatCard`/`DataTable`/`FileUpload`/`Tabs`/`Badge`/`Alert`/`Drawer`/`Dialog`/`Timeline`/skeleton/error/conflict + new `Pagination`/`DescriptionList` documented in `/design`). All tables are compact with internal horizontal overflow, sticky context where needed, `focus-visible`, keyboard navigation, and `prefers-reduced-motion` compliance. Copy is Bahasa Indonesia; backend enums are translated in the presentation layer without changing wire values.

- **Overview:** active/legacy/inactive counts, latest import, open remediation count, route readiness, `3/3` Union completeness, recent resolution, dependency/release health.
- **Imports:** single `.xlsx`/`.csv` ≤10 MB, preview summary, per-sheet/row/field errors, paginated change table, typed confirmation dialog highlighting deactivation, polling only while `QUEUED`/`PROCESSING`, terminal `CONFIRMED`/`FAILED`/`EXPIRED`, history and current snapshot via `Tabs`.
- **Remediation:** grouped by issue type/unit, `Drawer` to pick default/global PIC + `reason`, current mapping, resolution history, read-only Section Head candidates.
- **Union:** three fixed cards (`HEAD`/`OFFICER_1`/`OFFICER_2`) with provision/replace dialog, forced-password notice, legacy consequence, and audit link. Exactly one `HEAD` and two `OFFICER` are enforced.
- **Accounts:** server-side search/filter, detail `Drawer` with org/capability/status, reset/activate/deactivate via `ConfirmDialog` + `reason` with `Idempotency-Key`; `CARE_ADMIN` is read-only.
- **Voice Explorer:** paginated filter table, read-only detail `Drawer` with explicit “akses Private diaudit” `Alert`, immutable reporter identity, attachments/classification/location/conversation/timeline, no action controls.
- **Audit:** sanitized table and detail `Drawer` with actor snapshot, `action/result`, `resource`, `occurredAt`, `correlationId`, `releaseSha`, `reason`, and safe `summary`.
- **System Status:** `API/database/migration/storage/outbox`, `OpenAI`/`push` config state, `releaseSha`, `lastRefreshed`, manual refresh, and `30s` polling only when the tab is visible (`document.visibilityState`).
- **Account:** single Admin identity, change own password (≥12 chars), and logout.

No Section Head mutation, raw import download, Voice/Private export, bulk account action, raw metrics viewer, PWA, or offline support was added; historical ownership/assignments/actors/routes/snapshots are never rewritten, and staging domain rehearsal remains in the delivery track.

## Alternatives Considered

- **Keep the monolithic `App.tsx` and add pages inline.** Rejected: the shell already violated single-responsibility, prevented targeted `careQueryKey` invalidation, and would have duplicated wire types.
- **Persist Admin filters in `localStorage`/`IndexedDB`.** Rejected: PRD mandates network-only for all auth/master/audit/Private content; URL params satisfy refresh/share without persisting protected data.
- **Send the full 10 000 changes in `preview.summary`.** Rejected: violates the plan’s “do not send 10k in summary” and harms performance; cursor pagination on `GET .../changes` satisfies the 10k baseline with stable sort.
- **Allow multiple Admin accounts via UI.** Rejected: v1 is single-credential CLI-managed per product decision; the UI would need provisioning, reset, and deactivation flows that are intentionally out of scope and would weaken audit.
- **Add a service worker to Admin for offline import history.** Rejected: Admin is explicitly non-PWA; offline history would cache protected data and contradict the privacy posture.

## Consequences

- The OpenAPI contract is now fully explicit and generated. The drift check (`pnpm openapi:check`) is green, and `@care/contracts` is regenerated; no handwritten wire types remain.
- Every large list is cursor-paginated with `Idempotency-Key`/`expectedVersion` semantics, so duplicate confirms, simultaneous PIC replacements, and stale previews are handled with stable `409` codes and targeted invalidation.
- Sensitive Admin mutations and import confirmation require a bounded `Idempotency-Key`. Advisory idempotency/resource locks, the business mutation, audit event, and sanitized replay record execute in one PostgreSQL transaction; active route and Union-slot partial unique indexes provide a final database invariant.
- Temporary passwords are returned only on the immediate/replayed wire response and are deterministically reconstructed when needed; plaintext never enters `IdempotencyRecord`, audit, or account read DTOs. Account status uses a persisted `version` compare-and-swap and cannot deactivate an active route owner.
- Existing reset/Union idempotency records created before this invariant are removed by migration. Route assignment, account deactivation, Union replacement, and monthly-import deactivation serialize on deterministic `UserAccount` row locks, preventing an active route from retaining an `INACTIVE` or `LEGACY_HANDLER` owner.
- XLSX parsing validates actual deflate expansion before ExcelJS, with bounded entries/per-entry/total inflated bytes. Raw import files are removed on `CONFIRMED`, terminal `FAILED`, and `EXPIRED`, with reconciliation covering terminal/orphan leftovers.
- Expiry rereads the batch under the same advisory resource lock used by confirmation and deletes raw input only after a successful `PREVIEWED→EXPIRED` compare-and-swap; a concurrent `QUEUED` transition therefore retains its input. Truncated ZIP/XLSX input returns the stable `XLSX_INVALID` contract.
- Voice and message attachment DTOs expose only safe metadata; `storageKey` and checksum remain internal. Admin can inspect safe attachment links, structured timeline, and structured conversation data, while Private media reads remain authorized and redacted-audited.
- Account search eligibility (`default-pic`/`global-pic`) is server-side, so the browser never filters candidates.
- Private access is audited and redacted everywhere, and `AdminPrivateVoiceDetail` is type-exact, closing accidental disclosure via optional identity fields.
- The Admin build remains `~610 kB` (gz `~191 kB`), contains no `manifest`/`sw.js`/`CacheStorage` usage, and the `main.tsx` gate still prevents protected fetches below `1280 px` (verified by `foundation.test.ts`).
- PRD `§6.1` and `§8.3` now lock the single CLI-managed Admin, and `implementationPhases.md` tracks `8.0–8.4 done`, `8.5 in_progress`.
- Follow-up work is limited to Phase 8.5: Axe/keyboard/focus-return/reduced-motion/no-overflow, mocked-contract Playwright for every page/error state, and full-stack Playwright against a disposable `PostgreSQL`/`API`/`Admin` proxy (bootstrap→import→remediation→Union→accounts→Private audit→system status).

## Validation

- `pnpm format:check` `pnpm lint` `pnpm typecheck` (api, contracts, ui, frontend-core, web-admin, web-voice) — passed.
- `pnpm test:unit` — `25` (api) + `8` (ui) + `9` (frontend-core) + `2` (web-admin) + `2` (web-voice) passed, including adversarial XLSX expansion and truncated archive rejection.
- `pnpm db:generate` `pnpm migrations:destructive-check` `docker compose config --quiet` — passed.
- `prisma migrate deploy` on `care_test` — `20260824043057_init`, `20260825090000_v11_backend_remediation`, `20260827000000_phase8_admin_ops`, and `20260827090000_phase8_review_fixes` applied.
- `pnpm test:integration` — `13` passed, including parallel sanitized idempotency replay, account version conflicts, route-owner/deactivation serialization, expiry/queue raw-file retention, database-backed import-change pagination, raw-file terminal deletion, XLSX/CSV confirmation, `DEPARTMENT_14`, `ENVIRONMENT` routing, and Private head routing.
- `pnpm test:security` — `5` passed (media/push, privacy serializers, CARE_ADMIN-only, CSRF/IDOR, Private audit).
- `pnpm seed:performance` + `pnpm test:performance` — `10 000 accounts`/`50 000 Voices`/`50 concurrent users` — passed.
- `pnpm maintenance:reconcile` — dry-run `0` orphans.
- `pnpm openapi:generate` — deterministic; `apps/api/openapi.json` and `packages/contracts/src/generated.ts` in sync.
- `pnpm build` — `web-voice` PWA `12` precache entries and `web-admin` `616 kB` non-PWA; Playwright functional/visual/PWA suite `16` passed; `git diff --check` — passed.
- CI-mode PWA artifact tests register the worker from the static offline page, wait for an active controller, and passed five repeated runs (`10/10`) without relying on an API process.

## Risks and Mitigations

- **Single VM, no backup/DR** remains a Critical Accepted Risk. Mitigated only by `expand/contract` migrations, `IdempotencyRecord` deduplication, and strict `409` handling; data remains recoverable only via the 8.5 rehearsal, not via restore.
- **Admin Private read audit volume** could grow quickly. Mitigated by cursor pagination, sanitized `summary`, and indexed `AuditEvent(action/result/actorKind/occurredAt)` with `vector` still available but unused.
- **Large import table rendering** at `10k` rows. Mitigated by `DataTable` virtualization (overscan `8`, `row 52`) and server-side pagination; the UI never holds `10k` changes in `summary`.

## Follow-up Work

- Phase 8.5 is **complete** (see the added evidence below). Phase 8 is fully `done`, and the Frontend Complete Gate is now blocked only by Phase 11, not by Phase 8. No production containerization was started.

## Phase 8.5 Completion (Accessibility, Security, Performance, Full-Stack Acceptance)

Phase 8.5 was implemented to close the Admin application's accessibility, performance, and full-stack acceptance:

- **`e2e/admin-a11y.spec.ts`** — Axe WCAG 2.1 AA plus no document-overflow for all nine authenticated Admin pages at 1280 and 1440; long-content title clamp; keyboard focus trap/return; and `prefers-reduced-motion` overlay render.
- **Focus-return defect fixed in `packages/ui/src/overlays.tsx`.** Controlled `Dialog`/`Drawer` components opened by an external trigger returned focus to `<body>` instead of the opening control. `onOpenAutoFocus` now records the pre-open `document.activeElement` and `onCloseAutoFocus` restores it, so keyboard users keep their place. This is a strict improvement for both apps.
- **`e2e/admin-journeys.spec.ts`** — mocked-contract happy/error/empty state per Admin page. `OverviewPage` gained a retryable error `Alert` (status/ready/release queries previously rendered only a degraded dash). Error assertions confirm no stack frame or machine code leaks into the surface.
- **`e2e/admin-fullstack.spec.ts` + `apps/api/scripts/seed-admin-e2e.ts` + `e2e/global-setup.ts`** — a real API/Admin-proxy/PostgreSQL wiring smoke (gated `FULLSTACK_E2E=1`, serial): bootstrap → login → forced password → Overview → Imports (invalid upload rejected) → Remediation → Union → Accounts reset → Private full-identity read-only → Audit filter → System Status → valid-import preview/confirm to `CONFIRMED`. The seed is test-only (`NODE_ENV=test`), deterministic, and invoked by the Playwright `globalSetup` only when full-stack is enabled, so the mocked default suite never needs a database.
- **`e2e/foundation.spec.ts`** — Admin origin is network-only at runtime (no service worker, `CacheStorage`, or `IndexedDB`), no protected fetch below the 1280 px gate, and the production Admin build contains no manifest/service worker.

Validation:

- Mocked Playwright (chromium/visual/pwa) `test:frontend:e2e` — `65` passed; gated full-stack `--project=fullstack` — `2` passed.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (monorepo), `pnpm test:unit`, `pnpm build` (workforce PWA 12 precache / Admin non-PWA) — passed.
- `pnpm test:integration` — `31` passed; `pnpm test:security` — `5` passed (both against the disposable PostgreSQL).
- The single CLI-managed Admin (`PRD §6.1/§8.3`) remains locked; no Admin provisioning/reset/deactivation UI, no Section Head mutation, no raw download/export/bulk, and no PWA/offline surface were added.
