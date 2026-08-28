# CARE Session Handoff

| Atribut                 | Nilai                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Date                    | 28 Agustus 2026                                                                                                                                                                |
| Current objective       | QA Report 1 remediation complete locally; Phase 13 remains open for hosted exact-SHA acceptance, rollback rehearsal, and operator Safari retest                                |
| Current phase           | Phase 12 `done`; Phase 13 `in_progress`; Phase 14 `pending`; Delivery Complete Gate remains open                                                                               |
| Backend Complete Gate   | Passed (PRD v1.1); Phase 8.0 backend extended without breaking gate                                                                                                            |
| Implementation status   | Phase 0–12 done; QA-001–004 resolved, QA-005 deferred, QA-006 resolved; local parity green; hosted evidence not yet claimed                                                    |
| Latest ADR              | ADR-0013 (QA Report 1 bulk import, auth/cache invalidation, dependency deferral, and local secret handling)                                                                    |
| Recommended next action | Review QA Report 2, complete authenticated Safari operator retest with the current rotated credential, then resume hosted Phase 13 exact-SHA acceptance and rollback rehearsal |

## Session Outcome

### QA Report 1 remediation — 28 Agustus 2026

QA-001–004 telah diremediasi tanpa migration, OpenAPI drift, schema database,
endpoint, generated client, Argon2id, forced-password-change, atau perubahan
timeout transaksi:

- **Import set-oriented.** Reproduksi workbook aktual mengisolasi Prisma
  `P2028`: 7.018 row sebelumnya menghasilkan 21.201 query event karena unit
  di-upsert per member. Import kini menurunkan 58 unit sebelum transaksi,
  menggunakan bulk `createMany` + satu `findMany`, membulk-kan route/issues dan
  monthly deactivation/legacy/session revocation, serta mempertahankan advisory
  lock dan atomic transaction 120 detik. `P2028` menjadi safe
  `PROCESSING_TIMEOUT`; log hanya memuat batch ID, safe/Prisma code, elapsed,
  dan retry outcome.
- **Navigasi.** Admin dan desktop Workforce menggunakan kontrak resmi
  `Sidebar.onNavigate` dengan satu route map per aplikasi; item `onClick` dan
  cast `as never` dihapus.
- **Auth/cache.** Logout dan `401` membatalkan request session, menetapkan cache
  session `null`, membersihkan state terikat session, mereset CSRF, lalu
  broadcast. Cross-tab logout tidak refetch. Polling import terminal
  menginvalidasi history sekali; confirmed juga menyegarkan snapshot, overview,
  accounts, dan remediation; failed history memakai error tone dan safe reason.
- **Dependency/secret.** Moderate `exceljs -> uuid` tetap deferred tanpa
  override/fork karena ExcelJS 4.4.0 hanya memanggil v4 tanpa output buffer;
  review ulang sebelum Phase 14 atau upgrade upstream. `.secret` dan
  `.local/.ssh/` diverifikasi byte-for-byte lalu dipindahkan recoverably ke
  `$HOME/.config/care/secrets/` (directory `0700`, secret `0600`); tidak ada
  Gitleaks allowlist baru.

Workbook aktual yang di-ignore selesai `CONFIRMED` dalam 31.412 ms dengan 217
query event, 7.018 employee/account membership, satu active snapshot, 58 unit,
188 row Department 14, 12 missing-head issue, dan raw upload terhapus. Regression
sintetis meliputi 7.018 row, monthly 10.000 akun, active legacy handler, session
revocation, serta injected database failure yang membuktikan rollback tanpa
partial account/membership/snapshot.

Validation hijau: install frozen + Prisma generation; format/lint/typecheck;
unit API 36, UI 8, frontend-core 14, Workforce 20, Admin 2; build; Playwright
102; integration 32; security 5; performance 10.000 account/50.000 Voice;
reconciliation 0; full-stack 3; destructive migration/OpenAPI; Compose/database;
deployment validation/harness; dependency audit 0 High/Critical (1 Moderate
deferred); actionlint/ShellCheck/Hadolint/bash syntax/bootstrap input; Gitleaks
directory; whitespace. Detail lengkap berada di
`docs/reports/qa-report-2.md` dan keputusan di ADR-0013.

Safari membuka kedua origin lokal, tetapi authenticated retest dibatasi oleh
password Admin database persisten yang sudah dirotasi pada QA sebelumnya dan
tidak tersedia pada bootstrap/runtime secret. Credential bootstrap ditolak
normal; tidak dilakukan reset credential atau destructive database reset.
Operator Safari retest tetap follow-up eksplisit dan tidak diklaim selesai.
Phase 13 tetap `in_progress` sampai bukti tersebut serta hosted exact-SHA dan
rollback rehearsal tersedia.

### PR #7 hosted CI remediation — 28 Agustus 2026

Run hosted pertama untuk workflow CI/staging (PR #7, run 33137764783) gagal pada
tiga job dan mengungkap tiga penyebab berbeda:

1. **`quality` — format:check gagal pada dua file `.agent`.**
   `.agent/sessionHandoff.md` dan `.agent/implementationPhases.md` diedit
   setelah `pnpm format` terakhir dijalankan sehingga ter-commit tanpa
   Prettier. Pola kegagalan yang sama dengan PR #2 historis; pelajarannya
   format:check wajib diulang pada state commit final, bukan sebelum edit
   dokumen. Diperbaiki dengan `pnpm format` pada kedua file.
2. **`Previous-SHA to current migration` — bug path workflow (pre-existing).**
   `ci.yml` menjalankan `pnpm --filter @care/api exec prisma migrate status
--schema apps/api/prisma/schema.prisma`; `pnpm --filter … exec` mengeksekusi
   dengan CWD `apps/api`, sehingga path relatif tersebut resolve ke
   `apps/api/apps/api/prisma/schema.prisma` dan gagal "file or directory not
   found". Dua langkah sebelumnya pada job yang sama lolos karena memakai path
   absolut dan package script. Bug ini pre-existing pada workflow yang baru
   dibuat 28 Agustus dan baru terekspose pada run hosted pertama (evidence
   hosted memang belum pernah dijalankan sebelumnya). Diperbaiki menjadi
   `--schema prisma/schema.prisma` dan direplikasi lokal terhadap disposable
   PostgreSQL: base-SHA migrations → current `migrate deploy` → `migrate
status` dengan path corrected, semuanya hijau.
3. **`Dependency security` — Dependency graph repositori nonaktif.**
   `actions/dependency-review-action` menolak berjalan: "Dependency review is
   not supported on this repository. Please ensure that Dependency graph is
   enabled". Ini kondisi settings repositori, bukan kode. Owner mengaktifkan
   Dependency graph melalui API (`PATCH /repos/…` `security_and_analysis
[dependency_graph]=enabled`, accepted tanpa error) untuk mempertahankan
   gate tanpa melemahkan pemindaian.

`Release candidate gate` gagal hanya karena agregasi tiga job di atas;
`Deploy staging` ter-skip dengan benar karena gate merah. Perbaikan
di-commit sebagai `ci:` (path) dan `docs:` (format + catatan ini), lalu run
baru dipantau sampai seluruh required job hijau sebelum PR #7 dapat di-merge.

### Member home visual polish + dock navigation fix — 28 Agustus 2026

Branch `feat/frontend-polish`. Member Voice home direstyle mengikuti referensi
`.agent/design/design.jpg` (hero cobalt dengan kartu progres tersemat, kartu
Voice berpola panel nilai, CTA pill gradient, quick actions, dock putih
ikon-only dengan state aktif tinta) tanpa mengubah kontrak produk, kontrak
API, atau perilaku offline/privacy:

- **Bug fix navigasi dock.** `App.tsx` sebelumnya mengirim `onClick` per item,
  sedangkan `BottomNav` hanya memanggil `onNavigate(id)` yang tidak pernah
  di-wire — tap dock di mobile tidak melakukan apa pun. Kini `onNavigate`
  terhubung ke peta rute (`NAV_ROUTES`) untuk seluruh id dock, dikunci oleh
  asersi sumber di `foundation.test.ts` dan journey Playwright baru
  (dock → Riwayat → kembali → dock → Buat).
- **Gap navigasi tablet tertutup.** `packages/ui/src/styles.css`: dock
  terlihat hingga 1279 px (sebelumnya hilang pada 768–1279 px), label dock
  tetap tersembunyi secara visual namun tersedia bagi assistive technology,
  dan padding bawah konten mengikuti tinggi dock baru; Admin tidak terdampak
  karena tidak merender dock.
- **Hero member.** Gradient cobalt same-hue + glow cyan, radius 2.25rem,
  dua orb bulat (`Buat Voice`, notifikasi) dengan focus ring putih, teks
  hero putih solid (≥4.8:1 di kedua stop gradient, tanpa opacity),
  chip konteks role dipertahankan; topbar disembunyikan hanya pada route
  home mobile (logout tetap tersedia di Akun dan di topbar route lain).
- **StatusSummary tertanam di hero.** Kartu putih: header ikon + `{total}
Voice`, baris besar `aktif/total` + persen, segmented bar 24 segmen
  (`role="progressbar"` + `aria-valuenow`, segmen dekoratif), legend empat
  status (kontrak PRD tetap), catatan tindak lanjut, dan penanda
  `· usang` saat offline cache dipakai.
- **VoiceCard baru.** Shell tinted + panel putih berisi baris
  Status/Prioritas/Area/Kategori dengan nilai berwarna semantik (teks nilai
  adalah labelnya sendiri sehingga warna bukan satu-satunya pembawa info;
  palet mengikuti mapping badge yang ada; semua ≥4.5:1) dan tautan
  `Lihat detail →` yang mempertahankan `aria-label="Buka <displayId>"`.
  Styling dipakai bersama oleh Home, Riwayat, dan inbox responder.
- **Section header + quick actions.** Judul gelap semibold (eyebrow biru
  dihapus pada home saja), pil CTA gradient `brand-600→700` (accent-only
  gagal AA untuk teks putih; aksen tetap lewat glow), tautan "Lihat semua"
  terpusat ke Riwayat, dan baris quick action capability-aware yang hanya
  menunjuk destination navigasi PRD yang sudah ada.
- **Dock.** Override ter-scope di `apps/web-voice/src/styles.css`: panel
  putih blur, radius atas 1.75rem, ikon-only, aktif tinta gelap, tombol
  52 px (≥44 px), ikon nonaktif `neutral-500` (memenuhi non-text 3:1;
  abu terang referensi gagal), `sw-update-prompt` menyesuaikan offset.

Files changed: `apps/web-voice/src/App.tsx`,
`apps/web-voice/src/features/home/HomePage.tsx`,
`apps/web-voice/src/components/StatusSummary.tsx`,
`apps/web-voice/src/components/VoiceCard.tsx`,
`apps/web-voice/src/styles.css`,
`packages/ui/src/styles.css` (breakpoint dock 768→1280 + media query
label/padding), `apps/web-voice/src/foundation.test.ts`,
`e2e/workforce-journeys.spec.ts`, baseline
`e2e/design.visual.spec.ts-snapshots/workforce-shell-360.png`
(regenerated; baseline history/notifications dan seluruh baseline `/design`
tetap identik), `docs/adr/0012-member-home-visual-polish.md`.

Validation (semua hijau): `pnpm install --frozen-lockfile` (lockfile tidak
berubah), `pnpm db:generate` + build paket generated, `pnpm format:check`,
`pnpm lint`, `pnpm typecheck`, `pnpm test:unit` (API 36, ui 8, frontend-core
9, web-voice 20, web-admin 2), `pnpm build` (PWA precache tetap), visual
baseline regenerasi terkontrol, `pnpm test:frontend:e2e` **98 passed**
(termasuk Axe home, target 44 px dock, reduced-motion, overflow
360/768/1440, dock-navigation journey baru, security probes, PWA),
`pnpm migrations:destructive-check`, `pnpm openapi:check`, disposable
PostgreSQL: `db:up/wait/verify/test:reset/test:migrate`,
`pnpm test:integration` 31, `pnpm test:security` 5,
`seed:performance` + `test:performance` (10k/50k),
`maintenance:reconcile` (0), `FULLSTACK_E2E=1 --project=fullstack` 3
passed (smoke member login → home polish → detail via label `Buka
CARE-…` pada API nyata), Gitleaks v8.24.3 directory scan (no leaks),
`git diff --check`; `pnpm db:down` dijalankan dan tidak ada container/proses
yang tersisa. Tidak ada perubahan phase status; pekerjaan ini polish
frontend di feature branch di luar roadmap bernomor.

### Configurable OpenAI reasoning effort — 28 Agustus 2026

Added `OPENAI_REASONING_EFFORT` to direct `.env`, local full-stack, rendered hosted
runtime, Compose, and validation contracts. Empty or unset values normalize to
`medium`; explicit SDK-supported values are preserved, invalid values fail closed,
and both classification and location Responses requests now send
`reasoning: { effort }`. Mock provider and deployment harness assertions cover the
default, override, request payload, render, and rejection behavior without a live
provider call.

### Production containers and immutable staging delivery — 28 Agustus 2026

Implemented the production runtime and staging delivery system:

- digest-pinned multi-stage images for API, workforce, Admin, PostgreSQL 16 +
  pgvector 0.8.6, and Caddy; long-running containers are non-root and only Caddy
  publishes ports;
- dual-host Caddy plus nginx SPA/cache/security policies, exact frontend
  `/release.json`, additive API readiness SHA, and exact-one-hop proxy trust;
- internal PostgreSQL/API networking and separate persistent PostgreSQL, media,
  Caddy, and deployment-state bind mounts;
- compiled Admin bootstrap and live Responses/Web Push operational CLIs without
  a TypeScript runtime in the production image;
- allowlisted runtime env rendering/validation with mode/path/SHA/domain/secret
  constraints and no shell execution of environment contents;
- checksum-first safe archive ingestion, unique incoming paths, GitHub freshness
  checks, no-cancel concurrency, VM `flock`, persistent run/SHA high-water mark,
  atomic activation, five-release retention, forward-only migration, and code-only
  rollback;
- explicit CI jobs for quality/database/browser/migration/deployment/container and
  security gates, followed by staging deployment only on a current `staging` push;
  `main` runs CI but has no production deployment caller;
- ADR-0011, per-release evidence checklist, and CARE deployment runbook.

Scope decision: Web Push canary is implemented as a manually invoked one-shot
profile using an exact enrolled subscription hash. It is not an automated test,
deployment smoke, or automatic deployment gate. Live Responses classification and
location validation remains part of the automatic staging deployment.

Local evidence:

- install/generate/audit/format/lint/typecheck; unit API 35, UI 8,
  frontend-core 9, workforce 19, Admin 2; mocked Responses smoke;
- destructive migration policy, fresh migration, historical upgrade/reconciliation,
  integration 31, security 5, 10k-account/50k-Voice performance, OpenAPI drift,
  clean-artifact build;
- mocked Playwright 97 and serial full-stack Playwright 3;
- actionlint, ShellCheck, Hadolint, bash syntax, runtime/Compose validation,
  Ubuntu bootstrap check, deployment harness including Linux `flock`, and security
  exception registry validation;
- fresh production-like Compose start, migration/bootstrap, exact SHA, dual-host
  routing/deep links, Admin no-PWA, CSP, non-root/port isolation, pgvector 0.8.6,
  PostgreSQL identity and media persistence;
- Trivy filesystem and all five runtime images: zero High/Critical findings.

Hosted GitHub/deployment, live origin, acceptance-data, overlapping-candidate, and
forced-failure rollback evidence must be recorded before Phase 13 changes to
`done`. A read-only GitHub API check on 28 Agustus 2026 found no repository
environment named `staging` (environment secrets endpoint returned 404); create
that environment and populate the exact values listed in `deploymentGuide.md`
before a hosted deploy can pass. Phase 14 remains `pending`; Delivery Complete
Gate is not passed.

### Local full-stack container runner — 28 Agustus 2026

Added `.env.local.example`, ignored mode-0600 `.env.local`, the local Compose
overlay, and `pnpm local:up|down|status|logs`. The local runner builds and starts
PostgreSQL/migration/bootstrap/API/workforce/Admin/Caddy, verifies exact release
identity and readiness, persists PostgreSQL in `care-local-postgres-data`, and
persists media/Caddy state under ignored `local-data/fullstack`. OpenAI/VAPID are
optional and empty by default, so no external service is required.

The first Linux-like named-volume run exposed that `postgres:16-alpine` uses UID
70, while the production scripts had assumed UID 999. Dockerfile, VM bootstrap,
remote preflight, CI bind ownership, and local volume initialization were corrected
to UID 70; the full local stack then started healthy on both origins.

Validation after the final local-runner lock hardening: concurrent mutating local
operations were rejected; merged Compose exposed ports only from Caddy; full-stack
startup and exact-SHA routing passed; and a down/up cycle retained PostgreSQL system
identifier `7678851906417971221`. Format, ESLint, TypeScript, unit (73), OpenAPI,
build, mocked Playwright (97), fresh migrations, historical migration reconciliation,
integration (31), security (5), performance (10,000 accounts/50,000 Voices),
maintenance reconciliation, serial full-stack Playwright (3), actionlint, ShellCheck,
Hadolint, deployment validation/harness, security registry/audit, directory Gitleaks,
and PostgreSQL-image Trivy High/Critical all passed. The local Web Push canary remains
implemented but outside automated tests, matching the accepted scope.

### Phase 11 completion — workforce Web Push opt-in, offline summary cache, accessibility polish, and two-app Playwright gate (27 Agustus 2026)

Phase 11 (Frontend Complete Gate) was closed on branch `feat/phase-11-frontend-complete` (cut from `staging`). Work completed:

- **Workforce Web Push opt-in.** Added `apps/web-voice/src/lib/push.ts` (base64url key decode, support/install/iOS detection, stable installation id) + `push.test.ts`; `features/notifications/use-web-push.ts` (subscribe/unsubscribe/status state machine, session-keyed invalidation) + `PushSettingsCard.tsx`; wired `pushPublicKey`/`pushStatus`/`subscribePush`/`unsubscribePush` into `workforce-api.ts`; rendered the card on the Notifications page and an entry on the Account page. Every degraded path is surfaced as guidance (unconfigured / unsupported / permission-denied / iOS-install gated to iOS only). The service-worker `push`/`notificationclick` handlers were already present and remain generic (no Private identity in payload).
- **Privacy-safe offline summary cache.** `sw.ts` registers a `/api/v1/dashboard/member` summary route before the generic `/api/` network-only catch-all; on a successful fetch it stores only `total`/`counts`/`generatedAt` (strips `recent`/`draft`), and on fetch failure returns the cached aggregate. Added `lib/use-online-status.ts` and updated `HomePage`/`StatusSummary` to show a stale/offline banner and suppress the recent list + draft when offline. Extended `foundation.test.ts` to assert cache-route ordering, the stripped aggregate (no Private titles cached), and a generic push handler.
- **Accessibility/responsive polish.** New `e2e/workforce-a11y.spec.ts` asserts WCAG 2.1 AA (Axe), no document overflow at 360/768/1440, keyboard focus, reduced-motion, and a 44 px mobile bottom-nav touch target across member/responder/union/login/account surfaces. Fixed the mobile auth-brand body copy contrast (raised to full `--text-inverse`) and fixed the create-wizard "Lanjutkan" action to advance from the visibility step to the detail step.
- **Two-app Playwright + security probes.** Expanded `e2e/helpers/mock-api.ts` with an options-based `mockWorkforceApi` (dashboards, drafts, classification/location review, lifecycle mutations, notifications, push, media, csrf, error/empty modes; legacy `mockApi` delegates). Added `workforce-journeys.spec.ts`, `workforce-push.spec.ts` (stubbed `Notification`/`PushManager`), and `workforce-security.spec.ts` (conditional Private identity hiding, aggregate non-leakage, CSRF on mutations, capability-gated actions, authorized media). Large list/cursor/filter routes are driven through the mock.
- **Visual baselines.** Added `workforce.visual.spec.ts` for history + notifications at 360 px (clock pinned, `maxDiffPixelRatio` 0.06); snapshots `workforce-history-360.png` and `workforce-notifications-360.png`.
- **Gated workforce full-stack smoke.** Added `e2e/a-workforce-fullstack.spec.ts` (reuses the seeded member `000128` — login → forced-password → home → voice detail) and set the gated `fullstack` project to `workers: 1` in `playwright.config.ts` so it runs serially before the Admin full-stack journey (which later resets/deactivates the seeded workforce). No second seed (two seeds would each truncate the shared disposable DB).

Outstanding notes: `workforce-shell-360.png` remains valid (the Home change does not alter the online render; offline banner only appears offline). Real Web Push delivery + VAPID credentials remain a staging-rehearsal concern (Phase 13), not this gate.

Validation: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` green; `pnpm test:unit` green (API 34, ui 8, frontend-core 9, web-voice 19, web-admin 2); Playwright `test:frontend:e2e` **95 passed** (chromium + visual + pwa) including `test:openai:smoke` unchanged. The gated full-stack `a-workforce-fullstack`, `admin-fullstack`, and `fullstack` specs pass (3) against the disposable DB + API, and the full CI `quality` job (including `test:integration`, `test:security`, `seed/test:performance`, `migrations`, `openapi:check`, `build`, `test:frontend:e2e`, and `FULLSTACK_E2E=1 --project=fullstack`) plus `secrets` (Gitleaks) and `codeql` are green. The admin e2e seed now also inserts a `SUBMITTED`/`PROCEEDED` `VoiceEvent` per seeded voice so the member timeline renders (it previously hid an empty timeline), and the member smoke clicks the per-voice "Buka &lt;displayId&gt;" Detail button to open the detail.

### Phase 8.5 completion — Admin accessibility/security/performance/full-stack acceptance (27 Agustus 2026)

Phase 8.5 was closed on branch `feat/phase-8.5-admin-qa-fullstack` (cut from `staging`). Work completed:

- **Focus-return defect fixed** in `packages/ui/src/overlays.tsx`. Controlled `Dialog`/`Drawer` opened by an external trigger returned focus to `<body>` instead of the opening control. `onOpenAutoFocus` now records `document.activeElement` and `onCloseAutoFocus` restores it, so focus trap/return works for both apps.
- **`apps/web-admin/src/features/overview/OverviewPage.tsx`** — added a retryable error `Alert` (the status/ready/release queries previously rendered only a degraded dash, so the admin Overview had no error surface).
- **`e2e/helpers/mock-api.ts`** — broadened `mockAdminApi` (options object) to cover every endpoint the Admin pages call (session, overview, accounts, imports/preview/confirm/changes/snapshot, remediation, union, audit, voices/timeline/messages, health/ready/release) plus typed fixtures and an error/empty mode.
- **`e2e/admin-a11y.spec.ts`** — Axe WCAG 2.1 AA + no document overflow for all nine Admin pages at 1280/1440, long-content title clamp, keyboard focus trap/return, and `prefers-reduced-motion` overlay render.
- **`e2e/admin-journeys.spec.ts`** — mocked-contract happy/error/empty state per Admin page; error surfaces never leak stack frames or machine codes.
- **`e2e/admin-fullstack.spec.ts` + `apps/api/scripts/seed-admin-e2e.ts` + `e2e/global-setup.ts`** — gated (`FULLSTACK_E2E=1`, serial) real API/Admin-proxy/PostgreSQL wiring smoke: bootstrap → login → forced password → Overview → Imports (invalid upload rejected) → Remediation → Union → Accounts reset → Private full-identity read-only → Audit filter → System Status → valid-import preview/confirm to `CONFIRMED`. The test-only seed is invoked by the Playwright `globalSetup` only when full-stack is enabled; the mocked default suite never touches a database.
- **`e2e/foundation.spec.ts`** — Admin origin is network-only at runtime (no service worker / `CacheStorage` / `IndexedDB`) and the production Admin build carries no manifest/sw.
- **`playwright.config.ts`** — `globalSetup` for the full-stack seed; the `fullstack` project is serial with `retries: 0` (password replay would break retries); `apps/api/package.json` gained `seed:admin:e2e`.

Validation (against the disposable Docker PostgreSQL + running API):

- mocked Playwright `test:frontend:e2e` — `65` passed (chromium 57 + visual + pwa); gated `--project=fullstack` — `2` passed;
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (monorepo), `pnpm test:unit`, `pnpm build` — passed;
- `pnpm test:integration` — `31` passed; `pnpm test:security` — `5` passed.

Compat notes:

- `e2e/admin-explorer.spec.ts` was updated to the new `mockAdminApi(page, opts)` signature. The old `(page, voice)` signature was removed.
- `e2e/admin-a11y.spec.ts` and `e2e/admin-journeys.spec.ts` run under the default `chromium` project (mocked); they are part of `test:frontend:e2e`.
- Phase statuses reconciled: Phase 8 → `done`, Phase 8.5 → `done`, Phase 9 → `done`, Phase 10 → `done`; the single `in_progress` phase is now Phase 11. The Frontend Complete Gate remains blocked only by Phase 11; production containerization (Phase 12+) stays out of scope.

Backend `apps/api/src/voices/voices.service.ts` + `apps/api/src/auth/policy.service.ts` (see ADR-0009):

- `GET /voices/:id/timeline` dan `/messages` kini cursor-paginated (`limit`/`cursor`/optional `order`) dengan response `{ items, nextCursor }`; chat memakai `order=desc` agar halaman pertama = pesan terbaru;
- `GET /dashboard/general` dan `/dashboard/private` menerima filter `area`/`category`/`severity`/`status`/`from`/`to` dan mengembalikan `suppression` (`enabled`, `threshold`, `suppressedBuckets`/`suppressedValue` per division/department), echo `filters`, serta `generatedAt`;
- Section Head aggregate overview kini scope `currentHandlerId` (assigned) bukan `reporterId`; `assign`/`reassign` mewajibkan route-owning Manager (General) atau Union Head (Private);
- perbaikan latent bug: `workItemScope` empty sentinel diganti `{ id: { in: [] } }` (valid Prisma match-nothing) dan `detailScope` men-drop clause kosong; sebelumnya Member (dan Admin) tidak bisa membuka detail/timeline/messages Voice sendiri karena koersi UUID `__none__`;
- Section Head tidak lagi dapat assign (sebelumnya bisa via handler). Close dialog kini menyetage closure-evidence (1–5 foto) sebelum close.

OpenAPI + `@care/contracts` regenerated: `TimelinePage`, `MessagePage`, dashboard query params, `DashboardAggregate` diperluas.

Frontend `apps/web-voice`:

- `useCursorFeed` hook (page terbaru + muat lebih); `ConversationPanel` & `VoiceDetailPage` timeline memakai pagination; `GeneralBrowsePage` mem-filter aggregate + menampilkan suppression/`generatedAt`; `ActionPanel` CloseDialog men-upload & mewajibkan bukti;
- `workforce-api` menambah `stageEvidence`, dan `voiceTimeline`/`voiceMessages`/`dashboardGeneral`/`dashboardPrivate` menerima query.

Frontend `apps/web-admin`:

- `VoiceExplorerPage` drawer memakai `useInfiniteQuery` untuk timeline/messages yang kini paginated; `admin-api` type/method diperbarui.

Infrastruktur & E2E:

- `preview.proxy` ditambahkan pada `vite.config` workforce & Admin agar `vite preview` mem-proxy ke API untuk full-stack;
- `e2e/member-voice.spec.ts`, `e2e/admin-explorer.spec.ts`, `e2e/fullstack.spec.ts` (gated `FULLSTACK_E2E=1`), `e2e/helpers/mock-api.ts`;
- `foundation.spec.ts` & `design.visual.spec.ts` disesuaikan dengan Member Home (heading `Budi Santoso`); `e2e/design.visual.spec.ts-snapshots/workforce-shell-360.png` di-regenerate (Home baru; clock dipin agar greeting deterministik).

Tests baru: `apps/api/test/integration/voice-pagination.integration.test.ts`, `dashboard-filter.integration.test.ts`, `responder-matrix.integration.test.ts`; `policy.test.ts` disesuaikan untuk empty sentinel.

Validasi: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` green; `pnpm test:integration` 31 passed (3 pagination + 3 dashboard filter/suppression + 6 responder-matrix) pada disposable PostgreSQL; `pnpm test:security` 5; `pnpm test:unit` (API 34, UI 8, frontend-core 9, web-voice 12, web-admin 2); Playwright chromium+visual+pwa 20 passed + project `fullstack` 1 passed (API hidup + disposable DB); `pnpm audit --audit-level high` (1 moderate, 0 high/critical), `pnpm migrations:destructive-check`, `pnpm seed:performance` + `pnpm test:performance` (10k/50k), `pnpm maintenance:reconcile` (0) green; `pnpm openapi:check` green setelah commit.

### CI full-stack wiring + remaining parity checks (27 Agustus 2026)

- `playwright.config.ts`: API `webServer` (`pnpm --filter @care/api start`, `/health`, timeout 120s) dan project `fullstack` di-gate oleh `FULLSTACK_E2E=1`; project `chromium` meng-exclude spec `fullstack`; default `test:frontend:e2e` tidak berubah;
- `e2e/fullstack.spec.ts`: smoke diperluas — `/health` 200, `/ready` `checks.database === 'ok'`, dan `GET /api/v1/auth/session` via preview proxy mengembalikan `401 UNAUTHENTICATED` dari API nyata;
- `.github/workflows/ci.yml`: step `FULLSTACK_E2E=1 pnpm exec playwright test --project=fullstack` ditambahkan setelah `test:frontend:e2e` (backend sudah dibuild + DB test sudah migrate);
- `.agent/rules.md` §4.2 parity baseline di-reconcile (menambah step e2e mocked + fullstack);
- parity checks tersisa dijalankan hijau: `pnpm install --frozen-lockfile`, `pnpm audit --audit-level high`, `pnpm migrations:destructive-check`, `pnpm seed:performance`/`test:performance`, `pnpm maintenance:reconcile`.

Outstanding: bila Member Home berubah di masa depan wajib regenerate `workforce-shell-360.png`; full-stack smoke hanya memvalidasi wiring API/DB/proxy (business flow acceptance tetap di `test:integration`); Phase 8.5 tetap `in_progress`; Frontend Complete Gate tetap diblokir sampai Phase 8.5 & Phase 11.

### Phase 9–10 batch — Voice lifecycle backend completion + Phase 10 assign UI (27 Agustus 2026)

Backend `apps/api/src/voices/voices.service.ts` contract completion validated against disposable PostgreSQL (see ADR-0008):

- assign/reassign accept `expectedVersion` and reject stale version (`VERSION_CONFLICT`);
- `close` links staged closure evidence (1–5 cap, `EVIDENCE_LIMIT`) to the closure cycle and drops the voice parent (`Attachment_exactly_one_parent`); evidence stays discoverable under `closureCycles.evidence`;
- reopen falls back to the route owner (resp. `handlerType`) when the last PIC is deactivated, so a reopened voice is not stranded;
- `ask`/`proceed`/`close`/`rate`/`addMessage` now honor the `Idempotency-Key` (plus `assign`), with an atomic replay record + `IDEMPOTENCY_CONFLICT` on key reuse with a different body; `ask` message + transition run in a single transaction;
- new `GET /voices/:id/assignment-candidates` returning eligible section heads (General) or union officers (Private);
- OpenAPI + `@care/contracts` regenerated; `AssignmentCandidateList` schema added.

Frontend `apps/web-voice`:

- `workforce-api` added `assignmentCandidates` / `assign` / `reassign` typed to generated operations;
- `ActionPanel` gained `ASSIGN`/`REASSIGN` affordances bound to `availableActions` and an `AssignDialog` that lists eligible candidates and submits the assignment with `expectedVersion`;
- stable idempotency keys per logical mutation via `useMutationKey` (applied to ActionPanel ask/proceed/close/rate/assign, ConversationPanel send, and draft submit) so transport retries reuse the same key.

Files changed (this batch): `apps/api/src/voices/{voices.service.ts,voices.controller.ts}`, `apps/api/scripts/enrich-openapi.ts`, `apps/api/openapi.json`, `packages/contracts/src/generated.ts`, `apps/api/test/integration/voice-lifecycle.integration.test.ts`, `apps/web-voice/src/lib/{query.ts}`, `apps/web-voice/src/workforce-api.ts`, `apps/web-voice/src/components/{ActionPanel.tsx,ConversationPanel.tsx}`, `apps/web-voice/src/features/create/DraftPreviewPage.tsx`, and `docs/adr/0008-...md`.

Validation (this batch): API `typecheck`/`lint`/`format`, full integration (19 tests, +6 new lifecycle), security (5), unit (API 34, UI 8, frontend-core 9, web-voice 12, web-admin 2), `pnpm build`, and `pnpm openapi:check` (intended pre-commit contract drift) green.

Outstanding (Phase 9/10 full acceptance): timeline/messages cursor pagination, dashboard filter tanggal/area/kategori/severity/status + suppression metadata, full responder/leadership matrix (Manager dept detail/action, Section Head assigned-only, Union Head officer assignment isolation, leadership read-only detail, close-evidence UI), Admin Voice Explorer compatibility ketika kontrak dipaginasi, dan Playwright mocked/full-stack + visual regression.

### Phase 9–10 batch — Member Voice journey (27 Agustus 2026)

Member journey diimplementasikan pada `apps/web-voice` memakai `@care/contracts` yang diregenerasi, tanpa wire type handwritten. Backend diselesaikan minimum yang dibutuhkan Member journey:

- draft expiry 7 → 30 hari (PRD §5.3); `updateDraft` kini partial PATCH dengan `expectedVersion` + conflict stabil; `GET /drafts` list own-drafts cursor-paginated;
- `GET /dashboard/member` (empat status count, recent own Voices, active draft summary, `generatedAt`); `GET /work-items` disamakan dengan `/voices` (signed cursor, severity-first, filter/search, typed `nextCursor`);
- detail diperluas: `submittedAt`, `updatedAt`, `classificationSource`, `closureCycles` (evidence + rating + actor), dan server-computed `availableActions`; preview diperluas: routeReadiness (targetLabel/remediationCode) + `routeTarget`;
- action matrix diekstrak ke pure `computeAvailableActions` (`voices/actions.ts`) dan diuji unit (9 tests); OpenAPI + `@care/contracts` regenerated.

Frontend `apps/web-voice`:

- pecah placeholder `App.tsx`: typed `workforce-api` dari generated operations, session-scoped `careQueryKey`, shared formatters (Bahasa Indonesia, Asia/Jakarta), capability-aware `AppShell`/`BottomNav`/`Sidebar`; route feature: `/`, `/voices/new`, `/drafts/:id/edit`, `/drafts/:id/preview`, `/history`, `/work-items`, `/general`, `/voices/:id`, `/notifications`, `/account`;
- Member Home hero cobalt, `StatusSummary`, recent Voice cards, resume-draft, CTA Buat; wizard Private/General → detail → simpan + AI classification + location review → manual fallback → review → submit idempotent; dirty-guard, char counters, media preview/remove, focus-to-error, live-region alert;
- History search/filter/cursor, Voice detail (metadata, PIC privacy, media, classification source, location review, conversation read-only saat closed, timeline, closure cycles/rating/reopen), Notifications center (unread, pagination, mark read/all, deep-link), Account (session/capability/profile, change-password, logout);
- Phase 10 slice: capability-aware responder Home, `WorkItems` severity-first inbox + filter/search/cursor, `General` read-only browse, `ActionPanel` (ask/proceed/close) diikat ke `availableActions`;
- visual mengikuti referensi `.design/`: hero cobalt, cyan accent terbatas, white elevated cards, radius generous, quiet gray canvas, 44×44 touch, safe-area.

Files berubah: `apps/api/src/voices/{voices.service.ts,voices.controller.ts,voice.contracts.ts,actions.ts}`, `apps/api/scripts/enrich-openapi.ts`, `apps/api/test/unit/actions.test.ts`, `apps/api/openapi.json`, `packages/contracts/src/generated.ts`, dan seluruh `apps/web-voice/src` (App, workforce-api, lib, components, features) + `styles.css`.

Validasi: `pnpm openapi:generate` + `pnpm openapi:check` (drift hanya perubahan kontrak yang disengaja, pra-commit), `pnpm typecheck` green (full monorepo), `pnpm lint` green, `pnpm format:check` green, `pnpm build` green (workforce PWA 12 precache, design chunk excluded), `pnpm test:unit` green (API 34, UI 8, frontend-core 9, web-voice 12, web-admin 2). Integration/security/performance and Playwright mocked/full-stack journeys belum dijalankan (perlu disposable PostgreSQL dan tidak termasuk lingkup sesi ini).

Outstanding (Phase 9/10 full acceptance): timeline/messages cursor pagination, dashboard filter tanggal/area/kategori/severity/status + suppression metadata, full responder/leadership matrix (Manager dept detail/action, Section Head assigned-only, Union Head officer assignment isolation, leadership read-only detail, close-evidence UI), Admin Voice Explorer compatibility ketika kontrak dipaginasi, dan Playwright mocked/full-stack + visual regression.

### PR #2 CI remediation — 27 Agustus 2026

PR #2 `quality` job gagal pada `pnpm format:check` karena dua file yang di-commit tanpa Prettier: `.agent/sessionHandoff.md` dan `apps/api/test/integration/organization-routing.integration.test.ts`. Job berhenti pada step format sehingga seluruh step setelahnya (lint, typecheck, unit, integration, build, e2e) belum terverifikasi oleh run tersebut; kedua file diperbaiki dengan Prettier murni (pembungkusan argumen call multi-line, tidak ada perubahan semantik), lalu full parity §4.2 dijalankan ulang dari clean-artifact state (`apps/api/dist`, `packages/*/dist`, output web dist dipindahkan ke `/tmp/care-precommit-artifacts-20260827` sebelum generation/build).

Investigasi run historis mengonfirmasi penyebab CI gagal lebih dalam: sejak PR #1 (Phase 7), seluruh run pada branch ini dan `staging` gagal di `pnpm test:frontend:e2e` karena dua snapshot visual `/design` overview (`design-overview-360.png`, `design-overview-1440.png`) memiliki delta pixel deterministik ~0.04 pada runner Linux vs batas `maxDiffPixelRatio: 0.03`, akibat perbedaan rasterisasi font CoreText (macOS) vs FreeType (ubuntu) yang terakumulasi pada kanvas penuh ber-tipografi padat; delta stabil antar attempt/viewport di Linux dan mendekati nol secara lokal. Dua snapshot shell workforce/Admin tetap lolos dengan 0.03 sehingga tidak diubah. Remediasi: `e2e/design.visual.spec.ts` menaikkan `maxDiffPixelRatio` menjadi `0.06` khusus untuk design-overview screenshots dengan komentar rationale; toleransi snapshot lain dan seluruh assertion non-visual tidak berubah.

Failure kedua yang konsisten pada Linux CI adalah `[pwa] precache excludes design/API and provides an explicit offline fallback`: test timeout 30 detik pada `navigator.serviceWorker.ready`, dua-dua attempt. Reproduksi dalam container `mcr.microsoft.com/playwright:v1.62.1-jammy` (basis ubuntu-22.04 sama dengan runner CI) dengan Chromium 1.62.1 membuktikan registration mencapai state `activated` <500 ms dan `ready` resolve normal, sehingga hang bersifat race activation pada runner penuh beban, bukan incompatibility runtime. Karena `ready` bisa tetap pending tanpa mengekspos state, test dirobust menjadi polling eksplisit terhadap `getRegistration('/').active.state` (fail-fast menampilkan state terakhir + console errors bila ada) dan budget test dinaikkan menjadi 120 detik untuk journey SW cold-start saja; assertion precache dan offline fallback tidak berubah.

Commands dan hasil parity 27 Agustus 2026:

- `pnpm install --frozen-lockfile` — passed;
- `pnpm db:generate` — passed;
- `pnpm audit --audit-level high` — passed (satu Moderate transitive yang sudah diketahui, nol High/Critical);
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` — passed setelah fix;
- `pnpm test:unit` — 24+8+9+2+2 passed;
- `pnpm test:openai:smoke` — passed (mock `/responses`, classification + location schema);
- `pnpm migrations:destructive-check` — passed;
- `docker compose config --quiet`, `pnpm db:up`, `pnpm db:wait`, `pnpm db:verify` — passed (PostgreSQL 16/pgvector);
- `pnpm db:test:reset` + disposable `prisma migrate deploy` — passed;
- `pnpm test:migration:upgrade` — passed (voices 3, legacy access 3, semua snapshot utuh);
- CI-equivalent `pnpm test:integration` — 11 passed; `pnpm test:security` — 5 passed;
- `pnpm seed:performance` + `pnpm test:performance` — passed (10.000 accounts / 50.000 Voices); `pnpm maintenance:reconcile` dry-run — counter nol;
- `pnpm openapi:check` dan `pnpm build` — passed (workforce precache 12 entries);
- Playwright `pnpm test:frontend:e2e` — 16 passed;
- `zricethezav/gitleaks:v8.24.3 dir ... --redact --verbose` — no leaks found; `git diff --check` — passed;
- `pnpm db:down` — Compose stack dimatikan setelah checks.

Tidak ada perubahan product scope, contract, atau phase status dari sesi ini; Phase 8.5 tetap `in_progress`.

### PR #2 deep-review remediation — 27 Agustus 2026

Review penuh terhadap PR #2 ditindaklanjuti pada backend, contract, Admin UI, storage lifecycle, concurrency, dan test. Account DTO tidak lagi dapat mengembalikan `passwordHash`; temporary password tidak disimpan di idempotency/audit; status account memakai compare-and-swap `version`; deactivation ditolak selama account masih menjadi active route owner. Import confirm dan seluruh mutation Admin kini mewajibkan `Idempotency-Key`, lalu menjalankan advisory idempotency/resource lock, business mutation, audit, dan sanitized replay record dalam satu transaksi PostgreSQL. Partial unique indexes mengunci tepat satu active route per scope dan satu active Union term per slot.

Import preview tidak lagi menanam hingga 10.000 changes di JSON summary. Changes disimpan sebagai `ImportChange`, dipaginasi/filter dari database, dan raw upload dihapus setelah `CONFIRMED`, terminal `FAILED`, atau `EXPIRED`; maintenance reconciliation menangani leftover terminal/orphan. XLSX diperiksa terhadap entry count, actual inflate per-entry, dan total inflate sebelum ExcelJS. Attachment response Voice/chat hanya mengandung safe metadata, sedangkan storage key/checksum tetap internal; Admin Voice drawer sekarang menampilkan attachment, timeline, dan conversation secara terstruktur dengan audited Private media access.

Seluruh Admin feature page memakai shared generated OpenAPI transport; query parameter types berasal langsung dari generated operations. Overview memakai aggregate endpoint khusus, cursor history berada di URL untuk list utama, confirm import mem-poll state terminal, Union remediation diarahkan ke fixed-slot workflow, System Status memakai typed health/readiness/release dan proxy yang benar, dan Voice detail queries dipisah per selected Voice untuk mencegah stale/race.

Test file/suite dibuat phase-neutral: `integration-contracts.test.ts`, `organization-routing.integration.test.ts`, dan `admin-safety.integration.test.ts`. Evidence terakhir: TypeScript, ESLint, Prettier, unit `24+8+9+2+2`, integration `11`, security `5`, seeded performance `10k accounts/50k Voices/50 concurrent users`, build, migration deploy/upgrade, deterministic OpenAPI hashes, mock OpenAI smoke, Compose validation, and Playwright functional/visual/PWA `16` passed. Dependency audit tetap memiliki satu Moderate transitive advisory dan nol High/Critical. Phase 8.5 tetap `in_progress` karena mocked-contract/full-stack Admin journey per halaman belum ditambahkan; status tersebut tidak dinaikkan secara prematur.

Independent post-patch review menemukan dan kemudian menutup tiga gap lanjutan. Expiry import sekarang mengambil advisory resource lock, membaca ulang state, dan hanya menghapus raw file setelah CAS `PREVIEWED→EXPIRED` berhasil, sehingga concurrent confirm/queue tidak dapat kehilangan input. Route assignment, account deactivation, Union replacement, dan deactivation saat monthly import berbagi deterministic account row locks, sehingga active route tidak dapat memiliki owner `INACTIVE`/`LEGACY_HANDLER`. Migration review-fixes juga menghapus replay record reset/Union lama yang mungkin menyimpan temporary password plaintext; truncated XLSX sekarang menghasilkan `XLSX_INVALID`, bukan `RangeError`/500. Regression evidence setelah perubahan: fresh four-migration deploy passed, API unit `25`, integration `13` (termasuk dua concurrency regressions), security `5`, dan CI-mode PWA `10/10` pada lima pengulangan tanpa retry/flaky.

### Design system visual refinement — 26 Agustus 2026

`/design` dan shared CARE tokens dipoles ulang berdasarkan referensi mobile dashboard tanpa mengubah batas produk Phase 7 atau mengklaim business journey Phase 9 sudah tersedia. Palette kini memakai cobalt `#0866FF`, cyan `#18BDE3`, neutral yang lebih tenang, dan shadow yang lebih lembut. Showcase memperoleh section-aware navigation, responsive glass/pill navigation, hero berlapis, token specimens dengan depth terkontrol, serta mock Member Home yang lebih lengkap dengan status bar, segmented progress, quick actions, cards, dan bottom navigation. Undefined press variable `--motion-press-y` juga dikoreksi ke contract `--transform-press-y`.

Files utama: `packages/ui/src/tokens.ts`, `packages/ui/src/styles.css`, `apps/web-voice/src/design/DesignPage.tsx`, `apps/web-voice/src/design/design.css`, dan tiga visual baseline `e2e/design.visual.spec.ts-snapshots/design-overview-*.png`. Validasi sesi: Prettier, scoped ESLint, UI/workforce TypeScript, 10 unit tests, build workforce/Admin, dan 5 Playwright visual tests passed. `/design` tetap public, unlisted, lazy, `noindex`, mock-only, dan API-free; Phase 8 tetap next product phase.

Phase 7 CARE Frontend Foundation dan Design System telah diimplementasikan pada 26 Agustus 2026:

- placeholder frontend diganti oleh `apps/web-voice` (workforce PWA) dan `apps/web-admin` (Admin non-PWA), dengan `packages/ui` serta `packages/frontend-core` sebagai shared boundaries;
- OpenAPI membedakan `LoginResponse` (tanpa employee snapshot) dari `SessionResponse` (employee wajib tetapi nullable), serta mengekspor account/profile/capability/overview-detail-action scope secara eksplisit tanpa wire type duplikat;
- same-origin generated client memakai `credentials: include`, lazy CSRF pada mutation selain login, typed errors/correlation ID, offline preflight rejection tanpa queue/retry, session-keyed query helpers, cache purge/account-switch broadcast, forced-password/app-kind/capability gates;
- `/design` public, unlisted, `noindex`, lazy, mock-only, dan tidak menginisialisasi Query/Auth/API. Showcase merender token families, component/state registry, motion lab, workforce reference pattern, auth/create/offline/conflict/notification patterns, dan Admin desktop pattern;
- visual CARE dikunci light-only: Inter Variable, cobalt `#0866FF`, cyan `#18BDE3`, gray canvas, white layered surfaces, comfortable workforce density, dan compact Admin density. BeUI hanya menjadi sumber pola motion yang relevan; semantics/focus tetap Radix/native dan attribution MIT tersimpan di `packages/ui`;
- custom injectManifest service worker hanya mem-precache hashed shell assets plus offline fallback, mengecualikan design chunk, dan menjaga API/auth/mutation/media/chat/private routes network-only. Tidak ada background sync;
- Admin hard-gated pada 1280 px sebelum provider/protected tree sehingga viewport kecil tidak melakukan protected fetch. Build Admin tidak berisi manifest/service worker/CacheStorage behavior.

Phase 7 evidence: TypeScript/build kedua app, frontend/backend unit-component tests, token contract, Axe, keyboard/focus, no-overflow 360/768/1440, Admin 1279/1280/1440 gate, PWA offline fallback, origin isolation, production artifact assertions, dan visual baselines lulus. Full backend parity tetap dipertahankan oleh CI dan dijalankan ulang pada final gate sesi ini.

Phase 6 Backend Contract Remediation telah diimplementasikan penuh. Phase 0–5 tetap `done` sebagai histori v1.0, sedangkan semua assumption lama yang bertentangan sudah diganti oleh schema, service, policy, API, migration, dan test v1.1.

Contract import kemudian diperluas pada 26 Agustus 2026 agar endpoint authoritative yang sama menerima `.xlsx` maupun UTF-8 `.csv`. Kedua format memakai header, diff, checksum, queue, transaction, dan remediation semantics yang identik; XLSX tetap mewajibkan sheet `MFG + QD`.

Perubahan utama:

- expand/backfill/contract migration untuk account kind/status, capability-derived access, effective organization snapshot, composite unit, route mapping, Union slots, consent, location snapshot, actor snapshot, dan object-specific legacy access;
- authoritative XLSX/CSV preview/async confirm worker, monthly full-snapshot semantics, account/session deactivation, route invalidation, remediation issue/resolution, default/global PIC, dan tiga akun Union;
- General/Private routing baru, `ENVIRONMENT`, Department 14 rejection, Head-first Private routing, generic assignment, conditional identity serializers, dan audited Admin Private detail/media access;
- OpenAI-compatible Responses adapter dengan strict JSON Schema, Zod validation, bounded retry, sanitized fallback, model/prompt-bound hashes, location review, serta snapshot acknowledgment;
- centralized capability/object policy, separate `/voices` dan `/work-items`, scoped dashboards, sparse-bucket suppression, and leadership read-only rules;
- OpenAPI 1.1 dan generated TypeScript client dengan schema request/response eksplisit untuk setiap operation;
- local setup, CI, migration-upgrade fixture, security/privacy tests, dan performance fixture diperbarui.

Workbook aktual tetap hanya dibaca untuk UAT shape validation dan tidak dimasukkan ke Git. Hasil validasi: 7.018 rows, 58 composite units, 12 named units tanpa Department Head, dan 188 rows dengan normalized `Department = 14`.

## AI Test Decision

Automated AI test tidak memakai API key nyata. `pnpm test:openai:smoke` menyalakan mock HTTP `/responses` lokal, menyuntikkan credential dummy hanya agar SDK dapat membangun request, lalu memvalidasi classification dan location schemas, `store:false`, serta absence of tools/conversation. Tidak ada external network call.

`OPENAI_BASE_URL`, `OPENAI_MODEL`, dan `OPENAI_API_KEY` tetap kosong secara default dan baru diperlukan pada runtime staging/production. Live provider validation dipindahkan ke Phase 13 staging rehearsal dan bukan dependency Backend Complete Gate.

## Backend Complete Gate Evidence

- format, ESLint, TypeScript, unit (23), PostgreSQL integration (8), security (5), build, dan mock Responses smoke: passed;
- fresh migration chain dan current-schema upgrade reconciliation: passed, dengan ID/count/history Voice, assignment, event, message, closure, rating, notification, route, actor, consent, dan legacy access tetap utuh;
- destructive migration allowlist/hash checker: passed;
- OpenAPI generation deterministic dan shared client regenerated; superseded import/Section Head/assignment/Vertex surfaces tidak ada;
- performance profile: 10.000 accounts, 50.000 Voices, 50 concurrent users × 5 rounds: passed;
- workbook actual read-only validation: passed;
- Prisma schema validation, Compose validation, `git diff --check`, dan dependency audit threshold High: passed;
- dependency audit masih melaporkan satu Moderate advisory pada transitive `uuid@8.3.2` melalui pinned `exceljs@4.4.0`; tidak ada High/Critical finding dan importer tidak memberikan caller-controlled output buffer ke API uuid yang terdampak.

Gitleaks v8.24.3 dijalankan melalui container dan tidak menemukan leak; CI secrets scan juga tetap dikonfigurasi. Tidak ada credential aktual atau workbook aktual yang ditambahkan ke repository.

## Final Pre-commit Parity — 26 Agustus 2026

Parity dijalankan ulang setelah dukungan CSV dan perubahan dokumentasi final. Existing ignored `apps/api/dist` dan `packages/contracts/dist` dipindahkan ke `/tmp/care-precommit-artifacts-20260826` terlebih dahulu agar generation/build dimulai dari artifact state bersih.

Commands dan hasil:

- `pnpm install --frozen-lockfile` — passed;
- `pnpm db:generate` — passed;
- `pnpm audit --audit-level high` — passed dengan satu Moderate transitive advisory dan nol High/Critical;
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` — passed;
- `pnpm test:unit` — 23 passed;
- `pnpm test:openai:smoke` — passed terhadap local mock `/responses`, tanpa credential/provider eksternal;
- `pnpm migrations:destructive-check` — passed;
- `pnpm db:up`, `pnpm db:wait`, `pnpm db:verify`, `pnpm db:test:reset`, dan disposable `prisma migrate deploy` — passed pada PostgreSQL 16/pgvector;
- `pnpm test:migration:upgrade` — passed melalui Docker `psql` fallback karena host `psql` tidak disyaratkan;
- CI-equivalent `pnpm test:integration` — 8 passed;
- CI-equivalent `pnpm test:security` — 5 passed;
- CI-equivalent `pnpm seed:performance` dan `pnpm test:performance` — passed untuk 10.000 accounts, 50.000 Voices, dan 50 concurrent users;
- CI-equivalent `pnpm maintenance:reconcile` — passed dalam dry-run dengan seluruh counter nol;
- `pnpm openapi:check`, `pnpm build`, dan `docker compose config --quiet` — passed;
- `zricethezav/gitleaks:v8.24.3 dir /repo --config=/repo/.gitleaks.toml --redact --verbose` — no leaks found;
- `git diff --check` — passed;
- attached August XLSX read-only parse — 7.018 rows dan 188 normalized `Department=14`, passed.

### Bottom navigation refinement — follow-up

The Member Home preview now mirrors the reference dock more closely: a white floating bottom panel with large monochrome icons, only the active Home icon in dark ink, oversized rounded lower corners, safe-area padding, and visually hidden labels preserved for assistive technology. The `Buat Voice` action is width-constrained with ellipsis protection, and long Voice titles are clamped to two lines so cards cannot overflow. Shared mobile BottomNav labels are similarly visually icon-only while remaining accessible.

Validation after this refinement: Prettier, UI/workforce typecheck, scoped ESLint, UI/workforce unit tests (10 passed), workforce build, and 5 Playwright visual tests passed; visual baselines were regenerated.

## Phase 8 Execution — 27 Agustus 2026

**Branch:** `feat/phase-8-admin-operations` (from `staging`)

**Phase 8.0 — Contract & Backend Completion (done):**

- regenerasi OpenAPI & `@care/contracts`; semua response eksplisit tanpa `additionalProperties` untuk data yang dirender UI;
- cursor pagination (`limit`, `cursor` signed opaque, stable sort) untuk imports, changes, remediation, accounts, voices, audit;
- mutation sensitif memakai `Idempotency-Key`, optimistic `checksum`/`expectedVersion`/`expectedCurrentRouteId`/`expectedCurrentTerm`, CSRF, audit reason;
- indeks PostgreSQL untuk account (`username,displayName`, `createdAt`), `ImportBatch(createdAt)`, `Voice(severity/title)`, `OrganizationUnit`, `AuditEvent(action/result)`;
- import preview diperluas (checksum/version/expiry/typed summary/route gaps/Dept14/globalPic/Union gaps); `GET .../{id}/changes` cursor-paginated dengan filter; `POST .../{id}/confirm` menerima `{checksum,expectedVersion}` + `Idempotency-Key` dengan conflict stabil (checksum/ version/ expired/ idempotency);
- current effective snapshot (`/admin/organization-snapshots/current`) dan organization-unit list/detail (composite unit, member/head counts, routeHealth, source snapshot);
- import list/history cursor-paginated dengan status `PREVIEWED→QUEUED→PROCESSING→CONFIRMED|FAILED|EXPIRED`;
- remediation list/history typed & paginated dengan filter status/type/unit/batch; default PIC & global PIC menerima `expectedCurrentRouteId` + reason; account search dengan eligibility filter; Union slot menerima `expectedCurrentTerm` + reason dengan legacy preservation & session revocation;
- account list/detail paginated dengan search/filter kind/status/unit/position + eligibility; reset-password & activation/deactivation dengan reason/version, constraint legacy ownership, dan CARE_ADMIN immutable;
- audit list/detail Admin-only dengan cursor & filter (date range, action/result/actorKind/resource/correlation) & sanitized summary; Voice list diperluas (cursor/search/status/visibility/severity/area/category/handler/date range/stable sort); detail DTO `AdminPrivateVoiceDetail.reporter` exact 7 fields; semua Admin read Private (list/detail/timeline/message/media) diaudit teredaksi; system status typed `/health|/ready|/release.json`.

**Phase 8.1 — Admin Data Layer & Routing (done):**

- pecah shell monolitik menjadi feature routes: Overview, Imports, Remediation, Union, Accounts, Voice Explorer, Audit, System Status, Account;
- generated client via transport Phase 7 (fetch + CSRF + credentials), session-scoped React Query keys, targeted invalidation, URL search params untuk filter/list state;
- hard gate 1280 px tetap sebelum Query/Auth/Router; tidak ada CacheStorage/IndexedDB/service worker untuk Admin.

**Phase 8.2 — Import/Master/Remediation/Union (done):**

- Imports: upload 10 MB `.xlsx/.csv`, preview summary, error, paginated change table, typed confirmation dialog dengan deactivation highlight, polling queued/processing, terminal state, history & snapshot;
- Remediation: queue per issue type/unit, drawer pilih PIC + reason, current mapping, Section Head candidates read-only;
- Union: 3 cards Head/1/2 dengan provision/replace dialog, forced-password notice, consequence, audit link.

**Phase 8.3 — Accounts & Audit (done):**

- Accounts: server-side search/filter, detail drawer org/capability/status, reset/activate/deactivate dengan confirm + reason, CARE Admin read-only;
- Audit: sanitized event table & drawer dengan actor snapshot, action/result, resource, timestamp, correlation, release SHA, reason, safe summary.

**Phase 8.4 — Voice Explorer & System Status (done):**

- Voice Explorer: paginated filter table (search/status/visibility/severity), detail drawer read-only dengan notice “akses Private diaudit”, full immutable reporter identity, attachment/classification/location/timeline tanpa action;
- System Status: API/database/migration/storage/outbox, OpenAI/push config, release SHA, last-refreshed, manual refresh, polling 30s hanya saat tab visible.

**Phase 8.5 — Accessibility, Security, Performance & Full-Stack (in_progress):**

- Sisa: Axe/keyboard/focus-return/reduced-motion, loading/empty/error/permission/conflict, long-content, 1280/1440 no-overflow; Playwright mocked-contract & full-stack (bootstrap→import→remediation→Union→accounts→Private audit→system status); Admin build assertion tanpa manifest/sw/fetch di bawah gate.

**PRD Update:** mengunci tepat satu CARE Admin v1 CLI-managed; Accounts hanya mengelola workforce/Union; Admin hanya ganti password sendiri (`PRD.md:6.1,8.3`).

**Validasi Phase 8.0:**

- `pnpm typecheck` — passed (api, contracts, ui, frontend-core, web-admin, web-voice);
- `pnpm build` — passed (web-voice PWA 12 precache, web-admin non-PWA 610 kB);
- `pnpm test:unit` — 23+8+9+2+2 passed;
- `pnpm db:test:reset/migrate` + `test:integration` 8 passed + `test:security` 5 passed + `seed:performance` + `test:performance` 1 passed + `maintenance:reconcile` dry-run 0;
- `pnpm openapi:generate` deterministic & `packages/contracts` regenerated;
- `pnpm format:check` `pnpm lint` `pnpm migrations:destructive-check` `docker compose config --quiet` `gitleaks` `git diff --check` — passed;
- migration `20260827000000_phase8_admin_ops` applied.

## Next Recommended Action

Selesaikan Phase 8.5 pada branch `feat/phase-8-admin-operations`:

1. jalankan Axe/keyboard/focus/reduced-motion/no-overflow untuk setiap halaman Admin;
2. jalankan Playwright mocked-contract journeys & full-stack disposable DB (bootstrap→import→remediation→Union→accounts→Private audit→system status);
3. verifikasi Admin build tanpa manifest/sw/offline cache/fetch di bawah gate, lalu tandai Phase 8 `done` dan buat ADR Phase 8;
4. jangan mulai Phase 9 atau production containerization sebelum Phase 8 gate passed.

## Phase 7 Final Gate — 26 Agustus 2026

- formatting, ESLint, TypeScript, serta production build dua aplikasi: passed;
- recursive unit/component suites: 44 passed, mencakup auth bootstrap, forced password, wrong-app admission, CSRF/offline/error mapping, account-switch cache isolation, interactive states, keyboard/focus, accessibility, token contract, dan showcase coverage;
- Playwright functional, Axe, keyboard, visual regression, PWA, dan two-origin isolation: 16 passed pada `/design` 360/768/1440, workforce, serta Admin 1279/1280/1440;
- workforce precache: 12 shell/offline entries dan tidak memuat chunk `design-system`; API/auth/mutation/media/chat/private tetap network-only;
- Admin artifact assertion: tidak ada manifest atau service worker;
- PostgreSQL 16/pgvector, fresh migrations, migration upgrade reconciliation, integration 8, security 5, serta performance 1 dengan fixture 10.000 accounts/50.000 Voices: passed;
- generated OpenAPI/client tetap deterministic; Gitleaks v8.24.3 menemukan nol leak dan final `git diff --check` lulus.
