# CARE Session Handoff

## Inbox card PIC alignment and hero audience polish — 9 September 2026

Implemented on `feat/pic-voice-polish` (fresh from `staging` at `f861e0dd`) three
product-owner display corrections with no API/schema change (`openapi:check`
byte-stable); ADR-0046 records the decisions:

1. `InboxVoiceCard`: the PIC/"Belum ditugaskan" chip moved from the footer to
   the severity row, right-aligned with severity on plain cards; Union identity
   cards keep the footer chip. PIC names clip to the first two words plus `…`
   (`shortenPersonName` in `lib/formatters.ts`, CSS `max-width` + ellipsis on
   `.inbox-card__pic-name`; footer `margin-left: auto` scoped to
   `.inbox-card__foot .inbox-card__pic`).
2. `VoiceHero` for `GENERAL_RESPONDER` and `LEADERSHIP_GENERAL_READ_ONLY`:
   full-variant chips gain `Area: <area>` after the category chip and the grid
   becomes `PIC: <pic>` | `Pelapor: <reporter>`. Reporter, compact
   conversation, closed pills, and Union branches are untouched.
   `HandoverPage` inherits the new layout; its visual fixture was updated to
   `audience: 'GENERAL_RESPONDER'` for truthful coverage.
3. `VoiceDetailPage`: the "Klasifikasi" and "Klasifikasi awal" rows are hidden
   for `REPORTER_SELF`; other audiences keep them.

Changed files: workforce `components/InboxVoiceCard.tsx`, `components/VoiceHero.tsx`,
`features/voice/VoiceDetailPage.tsx`, `lib/formatters.ts`,
`lib/formatters.test.ts`, `styles.css`; specs `voice-consent.spec.ts`,
`voice-consent.visual.spec.ts`, `workforce-journeys.spec.ts` (asserts the
clipped `PIC: Union Officer…` chip), `workforce.visual.spec.ts`.

### Local validation commands and results

Node 22.23.2 / pnpm 11.8.0. Docker PostgreSQL `care_test` at 54329 with the
CI-safe environment (NODE_ENV=test, RELEASE_SHA=ci, OUTBOX_ENABLED=false,
CI session/CSRF/throttle secrets, 32-character `d` cursor secret). Passed:
frozen install, `db:generate`, `format:check` (two files needed Prettier), lint
(one `restrict-template-expressions` error in `VoiceHero.tsx` fixed with a
typed reporter-name extraction), typecheck, `test:unit` (API 83, UI 26,
frontend-core 15, Admin 2, workforce 86 — three new `shortenPersonName` cases),
`openapi:check` byte-stable, `NODE_ENV=production pnpm build`,
`pnpm pwa:compat-check` (main gzip 140186 bytes),
`pnpm migrations:destructive-check origin/staging`, integration 88/88, security
14/14, `FULLSTACK_E2E=1` fullstack 4/4, Gitleaks 8.24.3 directory scan (no
leaks), and `git diff --check`.

Visual baselines: affected families only were deleted and regenerated with
`--update-snapshots`, inspected, then verified twice without updates —
dashboard inbox previews (16 scenarios × 360/768/1440),
`detail-identity-{GENERAL-RESPONDER,REPORTER-SELF}-360` (darwin, linux-x64,
linux-arm64 — arm64 via a native ARM64 container after a clean install),
`workforce-voice-member-{1440,360}`, `workforce-manager-home-360`,
`workforce-detail-{active,closed,closed-auto-accepted}-360`, and
`workforce-handover-{360,768,1440}`. Linux x64 regeneration ran in
`care-visual-check:x64` with `--platform linux/amd64` (clean reinstall needed
after the arm64 run swapped native binaries), verified three times without
updates. `workforce-leadership-home-360`, `workforce-union-home-360`, the
lifecycle family, and `dashboard-loading` were verified byte-identical and
left untouched. Caveat: several legacy workforce visual assertions allow
`maxDiffPixelRatio: 0.06`, so the moved chip passed under stale baselines;
those families were regenerated deliberately rather than trusting the
allowance. Docker PostgreSQL was stopped with `pnpm db:down`, the temporary
worktree under `/tmp/care-pic-polish-linux` was removed, and no task-started
servers or containers remain.

Delivery status: local parity complete; no commit, push, or PR has been made —
commit/PR to `staging` requires explicit user authorization. No deploy,
workflow, or Dockerfile input changed, so deployment/container parity was not
triggered.

## Dependency audit correction — 9 September 2026

PR #39 hosted run `34299072437` failed only the `quality` job at
`pnpm security:audit`: five High advisories published 8–9 September 2026 —
`sharp` 0.35.3 (direct, patched 0.35.4), `js-yaml` 4.3.1 via
`eslint>@eslint/eslintrc` (patched 4.3.2), and `multer` 2.2.0 via
`@nestjs/platform-express` exact pin (all three advisories patched in 2.3.0).
Fixed by advancing the API `sharp` pin and adding scoped workspace overrides
`js-yaml@^4.1.0: 4.3.2` and `multer@^2.0.0: 2.3.0` in `pnpm-workspace.yaml`;
no scanner exceptions. ADR-0045 records the decision.

Re-validation on the corrected tree (Node 22.23.2 / pnpm 11.8.0, clean
artifacts, frozen install): Prisma generation, format, lint, typecheck, unit
(API 83 / UI 26 / frontend-core 15 / workforce 83 / Admin 2), destructive
migration check, `openapi:check` byte-stable, production build, PWA
compatibility (main gzip 139998 bytes), Compose config, integration 88/88,
security 14/14, performance 2/2, fullstack 5/5, browser suite 310/310
(including fullstack media paths exercising sharp 0.35.4), Gitleaks directory
scan clean, `git diff --check` clean. `pnpm security:audit` now reports 0 High
(4 moderate remain, below the gate).

Docker PostgreSQL was stopped with `pnpm db:down` after validation; no other
task-started processes remain. No deploy script, workflow, or Dockerfile input
changed, so deployment/container parity was not triggered (PR #38 precedent);
the hosted container job rebuilds with the corrected lockfile.

## Delivery status — 9 September 2026

PR #39 (`feat/new-voice-timeline` → `staging`, commit `5e4c58cc`) was opened at
explicit user authorization, without re-running local checks and without hosted
monitoring. The clean tree matched the validation recorded below; no
`.github/`, `deploy/`, or `inference/` input changed, so deployment/container
parity was not triggered. Hosted CI results are intentionally not monitored.

## Monitored Voice lifecycle — 9 September 2026

Implemented Terbuka → Dimonitor → Diproses → Selesai under ADR-0044. Explicit
monitoring acknowledges the reporter without chat or assignment. Assignment from
Terbuka performs the acknowledgement once; later assignment/reassign remains
Dimonitor. Only the assigned PIC starts processing; unassigned route owner/Union
Head can start with a required opening message and becomes the effective handler.
Reopen returns to Diproses with a separate Dibuka kembali badge and audited active
route-owner fallback. If both handlers are inactive, rating/reopen rolls back.

Changed areas: Prisma enum/forward migration; action/transition policies and locked,
idempotent lifecycle/message operations; controller/OpenAPI/generated client;
workforce progress/action sheet/status cards/dashboard/cache; Admin status contract;
fixtures, migration harness, unit/integration/browser/fullstack/visual tests;
PRD, implementation phases, release checklist and ADR-0044.

Local validation completed (Node 22.23.2 / pnpm 11.8.0):

- Frozen install, Prisma/client generation, typecheck, lint and production build passed.
- Unit suites: API 83, UI 26, frontend-core 15, workforce 83, Admin 2 passed.
- Fresh Docker PostgreSQL migration chain (11 migrations) passed. All upgrade
  harnesses passed, including seven lifecycle cases with preserved messages,
  attachments, events, closure/rating data and timestamps; no fabricated notices.
- Integration: 88/88 passed. Security: 14/14. Performance: 2/2, dashboard p95
  963 ms for 150 requests / 50 concurrent after aligning seeded conversations/handlers; reconciliation dry-run all zero.
- Full browser suite: 310/310 passed (182 functional/PWA/push/legacy WebKit and
  128 visual), including retry with
  identical key and audited reassign endpoint. Fullstack: 5/5 passed, including
  real monitor → opening PIC message → close → reporter reopen.
- PWA compatibility passed (main gzip 139998 bytes). Directory Gitleaks v8.24.3:
  no leaks. Destructive migration check and format check passed.
- Darwin and Linux x64 visual verification: 128/128 each, twice without snapshot
  updates. Canonical Linux baselines copied back and hash-verified. Representative
  mobile progress, reopen and form PNGs inspected; processing footer uses the
  bounded Dialog footer layout.

Docker PostgreSQL has been stopped with `pnpm db:down`. The isolated Linux visual
container exited successfully and its temporary checkout was removed after copying
canonical baselines. No task-started application servers remain.

### Reproducible commands

Local checks used `pnpm install --frozen-lockfile`, `pnpm db:generate`,
`pnpm openapi:generate` (SHA-256 comparison against the intentional working-tree
contracts), `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `NODE_ENV=production
pnpm build`, `pnpm format:check`, `pnpm pwa:compat-check`,
`pnpm migrations:destructive-check`, `pnpm test:migration:upgrade`, and
`node scripts/test-lifecycle-migration-upgrade.mjs`.

Database setup: `pnpm db:up && pnpm db:wait && pnpm db:test:reset && pnpm
db:test:migrate`. Integration/security/performance/reconciliation used
`NODE_ENV=test`, `DATABASE_URL=postgresql://care:care_local@localhost:54329/care_test`,
`RELEASE_SHA=ci`, `OUTBOX_ENABLED=false`, the repository CI session/CSRF/auth-throttle
secrets and a 32-character `d` cursor secret. Commands: `pnpm test:integration`,
`pnpm test:security`, `pnpm seed:performance`, `pnpm test:performance`,
`pnpm maintenance:reconcile`. Fullstack adds `FULLSTACK_E2E=1` and runs
`pnpm exec playwright test --project=fullstack`.

Browser verification: `pnpm exec playwright test --workers=3` and
`pnpm exec playwright test --project=visual --workers=3`. Linux uses the existing
`care-visual-check:x64` image with explicit `--platform linux/amd64`, Node 22.23.2,
pnpm 11.8.0 and Playwright 1.62.1, isolated `/tmp/care-lifecycle-linux`, frozen
install/Prisma/production build, then `pnpm exec playwright test --project=visual
--workers=3 --timeout=60000` twice without updates after baseline generation.
Only affected baseline families were regenerated; no thresholds were loosened.

Directory scanner: `docker run --rm -v "$PWD:/repo" -w /repo
zricethezav/gitleaks:v8.24.3 dir /repo --config=/repo/.gitleaks.toml --redact`.
`pnpm security:audit` failed as documented above; `git diff --check` passed.
Local logs are under `/tmp/care-lifecycle-*.log`. No deployment/container-image
parity or hosted gate is claimed; complete pre-commit parity is still required
before a future authorized commit.

## Previous session reference

| Attribute | Current status                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------- |
| Date      | 8 September 2026                                                                               |
| Objective | Responder dashboard and create-flow UI polish (seven product-owner corrections)                |
| Branch    | `feat/ui-tuning-8-sep` (fresh from `staging`)                                                  |
| Phase     | Phase 13 `in_progress`; hosted acceptance remains open                                         |
| Decision  | ADR-0043; PRD §18.8.3 and §12.1/§12.2/§15.4 amendments                                         |
| Delivery  | Local parity complete; commit/push/PR not yet performed — awaiting explicit user authorization |

## UI polish batch — 8 September 2026

Implemented seven display-layer corrections with no API/schema change (`openapi:check` byte-stable):

1. Photo guidance unified into one `(i)` block below the picker: `JPG, PNG, atau WebP · maksimum 10 MB per file.` above `Foto harap mengikuti aturan ATSG ya teman-teman.`, identical styling (`media-input__guidance`/`media-input__hint`; `media-input__note` and `atsg-photo-guidance` CSS removed, element id preserved for `aria-describedby`).
2. Private "Simpan & Analisis" is disabled until identity choice AND contact consent are set (`privacyComplete` in `CreateVoicePage`), with an `aria-live` hint; `useDraftWizard.saveAndProcess` keeps click-time consent validation.
3. Private destinations render as `Komite` via `PRIVATE_ROUTE_LABEL` (formatters.ts): create route row, preview route row, `VoiceHero` PIC line, and the Union Head work-items description.
4. Forced-password "Kembali ke login" uses bold cobalt `auth-back--login`; ordinary "Kembali" stays ghost.
5. Dashboard basis tab `Pelaporan`; summary heading/name `Ringkasan Voice` for both tabs.
6. Dashboard hero: avatar, Buat Voice orb, `Operasional Responder` badge, and the `dashboard-context` metadata line removed; read-only chip retained; `dashboard-context` CSS removed. Offline staleness remains covered by the body Alert.
7. Scope verification in e2e moved to `.dashboard-org-summary` (same `scopeLabel` source) and basis-tab `aria-pressed`; `MemberHomePage` legacy blocks in `HomePage.tsx` are unreachable and untouched.

Key files: `apps/web-voice/src/features/home/DashboardHome.tsx`, `features/create/CreateVoicePage.tsx`, `features/create/useDraftWizard.ts`, `features/create/DraftPreviewPage.tsx`, `components/VoiceHero.tsx`, `features/work/WorkItemsPage.tsx`, `lib/formatters.ts`, `App.tsx`, `styles.css`; specs `dashboard.spec.ts`, `dashboard.visual.spec.ts`, `voice-consent.spec.ts`, `voice-consent.visual.spec.ts`, `workforce.visual.spec.ts`, `workforce-journeys.spec.ts`, `a-workforce-fullstack.spec.ts`.

### Local validation commands and results

Node 22.23.2 / pnpm 11.8.0; Docker PostgreSQL `care_test` at 54329; CI-safe test env as documented below. Passed: clean-artifact frozen install (six `dist` removed), `db:generate`, `security:audit` (3 moderate, 0 High/Critical), `format:check`, `lint`, `typecheck`, `test:unit` (API 82, frontend-core 15, Admin 2, workforce 83), `migrations:destructive-check origin/staging`, `openapi:check` (byte-stable), `test:integration` (84), `test:security` (14), `seed:performance` + `test:performance` (organization dashboard p95 **317 ms**, 150 requests / 50 concurrent, 50,000 Voices), `maintenance:reconcile` dry-run (all zero), `NODE_ENV=production pnpm build`, `pnpm pwa:compat-check` (main gzip 139392 bytes), mocked Playwright suite **292 passed** (Chromium, PWA, push, legacy iOS; +1 new privacy-gating test), `FULLSTACK_E2E=1 … --project=fullstack` **4 passed**, `docker compose config --quiet`, Gitleaks 8.24.3 directory scan (no leaks), `git diff --check`.

Visual baselines: deleted affected PNGs only, regenerated with `--update-snapshots`, inspected representative images (manager/union home 360, dashboard default-pic 1440, union-head 360, password change 360, private-consent-false 360), then verified twice without updates on **darwin** (116/116) and canonical **Linux x64** (Docker `--platform linux/amd64`, image `care-visual-check:x64`, Node 22.23.2, pnpm 11.8.0, Playwright 1.62.1, one worker, 60-second deadline; 116/116 twice). Regenerated sets: all 17 dashboard scenarios × 3 widths × 2 platforms, `workforce-manager-home-360`, `workforce-leadership-home-360`, `workforce-union-home-360`, `workforce-manager-dashboard-1440`, `workforce-union-private-1440`, `workforce-union-private-inbox-360`, `workforce-password-change-360`, `workforce-password-defer-360`, `workforce-create-private-form-360`, `workforce-create-composer-360`, `workforce-create-general-form-360`, `workforce-create-empty-location-360`, `workforce-create-review-private-360`, `private-consent-{false,true}-360`, `private-legacy-preview-360` (per platform where suffixed). Deployment/container parity was not rerun: no deploy script, workflow, or Dockerfile input changed in this diff.

Runtime cleanup completed: `pnpm db:down` stopped the Docker PostgreSQL stack; the x64 visual container and the temporary repo copy under `/private/var/folders/.../T/opencode/care-visual-x64` were removed; no preview/test servers remain. Commit/push and PR to `staging` require explicit user authorization per the standing delivery process; hosted CI monitoring preference remains no-monitoring unless stated otherwise.

## Previous session reference

## Dashboard scope consistency — current session

Implemented explicit OWN/PARENT/GLOBAL scope resolution, permitted selection options separate from overview buckets, Section Head own/department aggregation, Department Head own/division, Default PIC exact mappings, and Division Head own/global. Switching scope clears organization URL state; non-organization filters remain. API validation rejects peer units and their descendants. Aggregate reads share a REPEATABLE READ transaction. Browser refresh shares Jakarta date bounds for view/preview, advances relative ranges, cancels abandoned requests and separates failures. Stable category ids and deterministic bucket ordering preserve rendering integrity.

Key changes: organization dashboard resolver/controller/OpenAPI/generated client; workforce DashboardHome, date utilities and API abort signals; integration/performance/browser/full-stack fixtures and tests. Source screenshots in untracked `tmp/` are preserved and are not delivery artifacts.

Validation (Node 22.23.2, pnpm 11.8.0; Docker PostgreSQL care_test at port 54329):

- `pnpm db:up`, `pnpm db:wait`, `pnpm db:test:reset`, `pnpm db:test:migrate`: passed, all ten existing migrations; no new migration.
- `pnpm test:unit`: API 82, UI 26, frontend-core 15, Admin 2, workforce 83 passed (208 total).
- `pnpm test:integration`: final rerun 84 passed; focused organization suite 22 passed, including both-basis 12 → 17 → 12, sibling/descendant denial, mapped-PIC ancestor navigation, own/parent/global policies and concurrent insert snapshot consistency.
- `pnpm test:security`: final rerun 14 passed.
- `NODE_ENV=test DATABASE_URL=<Docker care_test> pnpm seed:performance`, `pnpm test:performance`: two passed; mixed Manager/Director/Division Head global workload p95 333 ms, 150 requests / 50 concurrent, 50,000 Voices.
- `pnpm openapi:generate`: passed; SHA-256 before/after a second generation matched for OpenAPI and generated client. `pnpm typecheck`, `pnpm lint`, full build and subsequent affected-app builds passed.
- `pnpm pwa:compat-check`: latest passed (main gzip 139322 bytes). Relative calendar validation also protects the legacy General browse from issuing broad requests for invalid dates.
- `pnpm test:frontend:e2e --workers=2`: 289 passed, including existing Chromium, WebKit legacy, PWA, push and visual suites. After final date guard and fixture adjustments, dashboard browser/visual rerun passed 62 tests; after adding metadata freshness coverage, current focused Chromium dashboard suite passed 12 tests.
- `FULLSTACK_E2E=1 NODE_ENV=test DATABASE_URL=<Docker care_test> RELEASE_SHA=ci SESSION_HASH_SECRET=ci-session-hash-secret-32-characters SESSION_CSRF_SECRET=ci-session-csrf-secret-32-characters AUTH_THROTTLE_SECRET=ci-auth-throttle-secret-32-characters CURSOR_SIGNING_SECRET=dddddddddddddddddddddddddddddddd OUTBOX_ENABLED=false pnpm exec playwright test --project=fullstack`: final rerun 4 passed. The manager journey creates and cleans 16 extra Voices and verifies 12 → 17 → 12 for both bases, reload and history against the actual API/database.
- Darwin dashboard visual baselines regenerated for 17 scenarios at 360/768/1440 and verified without updates. Representative Section Head mobile, Department Head overview desktop and Division Head global tablet images were inspected. Section Head fixture now represents an actual named section rather than an impossible unassigned bucket in OWN scope.
- Linux x64: pinned Node/pnpm and frozen install, Prisma generation and build passed in Ubuntu-based `care-visual-check:x64`. Focused browser suite 11 passed and final Section Head visuals 3 passed without updates. Full canonical visual baselines regenerated 51/51, then verified 51/51 without updates (one worker, 60-second test deadline for x64 emulation).

Initial test corrections: the Section Head assignment-only expectation was updated for the accepted organization cohort; browser comparison now uses innerText consistently. The CommonJS full-stack runner required an absolute package resolver instead of import.meta. Two Linux visual captures timed out while an emulated container was paused for a local dependency-cache snapshot; the canonical rerun uses one worker and a 60-second test deadline, retaining the original 1% pixel tolerance and screenshot assertion timeout. No API permission or performance threshold was relaxed.

The selectors also detect a changed server-selected organization during live polling, refresh metadata, and disable stale choices until the metadata matches. A browser regression simulates a master update while the page remains open.

Current dashboard suite also passed 12/12 on WebKit using a temporary config with the Desktop Safari device and the same test file. Representative final Linux baseline images were inspected. Runtime cleanup completed: `pnpm db:down` stopped the session-started PostgreSQL stack, all task visual containers exited, and the temporary `care-dashboard-visual-runtime:scope-fix` image was removed. No task-started app/test servers remain on ports 3000/4173/4174. Implementation validation was followed by the complete pre-commit parity below. Logs for this session are in `/tmp/care-dashboard-*.log` and are not repository deliverables.

## Delivery validation — 7 September 2026

User authorized commit/push on `fix/pic-dashboard-data` and a PR to `staging`, explicitly without hosted CI monitoring. Inspected all three workflows; rehearsal is manual and reusable deployment is not invoked by this PR. No merge or hosted deployment is authorized or claimed.

Fresh pre-commit parity used Node 22.23.2 / pnpm 11.8.0, removed the six workspace `dist` directories before frozen installation, and used Docker PostgreSQL `care_test` at port 54329. Safe CI environment: `NODE_ENV=test`, `RELEASE_SHA=ci`, `OUTBOX_ENABLED=false`, CI session/CSRF/throttle secrets and the 32-character `d` cursor secret documented above. Candidate tracked changes were staged before `openapi:check`; original untracked `tmp/` screenshots remain excluded.

Passed in workflow order: `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm security:audit` (3 moderate, zero High/Critical), `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` (208), `pnpm test:openai:smoke`, `pnpm migrations:destructive-check origin/staging`, `pnpm --filter @care/api prisma:migrate:deploy`, `env -u DATABASE_URL pnpm test:migration:upgrade` (four harnesses, Docker psql), `pnpm test:integration` (84), `pnpm test:security` (14), `pnpm seed:performance`, `pnpm test:performance` (2; p95 **324 ms**, 150 requests / 50 concurrent), `pnpm maintenance:reconcile`, `pnpm openapi:check`, `NODE_ENV=production pnpm build`, `pnpm pwa:compat-check` (139322 bytes main gzip), `pnpm exec playwright install --with-deps chromium webkit`, `pnpm exec playwright test --workers=2` (**291 passed**, no snapshot updates), `FULLSTACK_E2E=1 pnpm exec playwright test --project=fullstack` (**4 passed**), `docker compose config --quiet`, and `git diff --check`.

Also passed: previous `origin/staging` Prisma schema deploy followed by candidate deploy/status on separate Docker `care_release_upgrade`; `pnpm deployment:validate`; `pnpm security:exceptions:check`; pinned Actionlint 1.7.7, ShellCheck 0.11.0 and Hadolint 2.14.0 over the exact workflow paths; inference Compose config and Python syntax; Ubuntu bootstrap `--check`; `bash deploy/tests/deployment-scripts.sh` in Linux Docker with real `flock` (including the intentional provider-failure scenario). Production Compose `build --pull`, migrate/bootstrap, startup/readiness, release/routing/CSP/auth boundaries, non-root/private database port and persistence checks passed for all five services. Trivy 0.70.0 filesystem and all five freshly built runtime images passed at HIGH/CRITICAL using the committed exact exception file. Gitleaks 8.24.3 directory scan passed with zero leaks.

Commands and output are preserved locally in `/tmp/care-delivery-{quality,deployment,harness,migration,containers,trivy,gitleaks}.log`; runner scripts are `/tmp/care-ci-{quality,quality-rest,deployment-checks,containers,scans}.sh`. No scanner exceptions or test thresholds were changed. `pnpm db:down` and production Compose shutdown completed; no task containers or listeners on 3000/4173/4174 remain. Hosted CI/CodeQL/dependency-review results are not claimed and will not be monitored per user instruction.

## Previous session reference

## Organization dashboard corrections — 7 September 2026

Product decisions (confirmed with the product owner): organization dashboard aggregates return real numbers with **no small-cohort privacy threshold**, and unassigned/unidentified organization rows render as **one** row per meaning. Implementation:

- `apps/api/src/voices/dashboard.ts`: removed the `inaccessible` detail-scope count, `protectedCohort`, per-dimension `safe()` withholding, `suppressedDimensions`/`suppression` response fields and the `previousOutside` gate; `previousTotal` is computed directly; unknown organization buckets merge by stable ids (`section-unassigned`, `section-unknown`, `organization-unknown`, Private `unassigned`/`previous-union`) with summed values. `OrganizationDashboard` no longer depends on `PolicyService`.
- `apps/api/scripts/dashboard-openapi.ts`: `DashboardView` drops `protected`/`suppressedDimensions`/`suppression`, `total` is a non-nullable integer; generated OpenAPI/client regenerated and byte-stable (deterministic regeneration verified by SHA-256 before/after).
- `apps/web-voice`: `DashboardHome.tsx` removes all protected/suppressed branches and the `Protected` component, filters zero-value severity rows, removes the `dashboard-trend-note` and `dashboard-inbox__note` paragraphs; `TrendCard.tsx` renders no caption for `previousTotal === 0` (the "Belum ada Voice pada periode sebelumnya" text is gone; the "+n% vs periode sebelumnya" badge remains); `styles.css` drops `dashboard-protected`, `dashboard-trend-note`, `dashboard-inbox__note` rules. The legacy monitoring homepage and General browse suppression (separate contracts) are untouched.

The reported "Belum ditugaskan ke section" pile-up was duplicate-labeled per-department unknown buckets colliding as React list keys; the backend merge plus stable ids removes it. Regression coverage: integration tests `returns small cross-detail cohorts as real numbers without suppression` and `merges unknown organization rows into one bucket across departments and switches`; e2e `repeated level switches keep one unassigned row, filter zero severity, and drop helper texts`.

### Local validation commands and results

Pinned Node 22.23.2 / pnpm 11.8.0. CI-equivalent secrets used `ci-*-32-characters` values; Docker test DB `care_test` on port 54329. Passed: frozen install, `db:generate`, `security:audit` (3 moderate, 0 High/Critical), `format:check`, `lint`, `typecheck`, `test:unit` (API 82, workforce 82, Admin 2, UI 26, frontend-core 15), `test:openai:smoke`, `migrations:destructive-check` (current + `origin/staging`), all four migration-upgrade harnesses, `test:integration` 75/75, `test:security` 14/14, `seed:performance`, `test:performance` (organization dashboard p95 **327 ms** / 150 requests / 50 concurrency — improved by removing the detail-scope count), `maintenance:reconcile` dry-run (all zero), deterministic OpenAPI regeneration, `NODE_ENV=production pnpm build`, `pwa:compat-check` (main gzip 138489 bytes), Playwright Chromium/WebKit install.

Playwright: full mocked suite **283 passed** (282 existing + 1 new) with 2 workers; visual baselines regenerated for all 17 dashboard scenarios at 360/768/1440 on **darwin** and canonical **Linux x64** (Docker `--platform linux/amd64`, Ubuntu 22.04.5, Node 22.23.2, Playwright 1.62.1 — installed inside `mcr.microsoft.com/playwright:v1.62.1-jammy`), verified twice without updates; representative PNGs inspected (single unassigned row, no helper texts, severity/category/trend visible). The `protected` scenario and its six PNGs were replaced by `unknown-section`. `FULLSTACK_E2E=1` fullstack 4/4.

Deployment parity: Compose config, Actionlint 1.7.7, ShellCheck 0.11.0 (digest-pinned), Hadolint 2.14.0, inference Compose/Python syntax, Ubuntu bootstrap `--check` contract, `deployment:validate`, `security:exceptions:check`, Gitleaks 8.24.3 directory scan (no leaks), `git diff --check`. Linux x64 deployment harness (Docker ubuntu 22.04 + docker CLI/compose plugin + host socket) passed with real `flock`. x64 production Compose build (`--pull`), migrate/bootstrap, release/routing/CSP/auth-boundary/non-root/private-port/persistence checks passed; Trivy 0.70.0 filesystem (with committed `.trivyignore`) and all five runtime images at HIGH/CRITICAL: zero findings. Production-like stack was shut down with `compose down -v` and `/tmp/care-staging` removed; the development Docker database was stopped with `pnpm db:down`. No application, preview or test servers remain. Hosted checks are not monitored per instruction.

### Previous session reference

## CI performance correction — 7 September 2026

PR #34 run `34071476255` failed only the organization dashboard performance test (4,518 ms p95); migration, container, deployment, secrets, dependency review and CodeQL jobs passed. The failure was reproduced on Linux x64 with application and PostgreSQL each limited to two CPUs (4,464 ms p95).

Replaced full-row materialized CTE / five scans with GROUPING SETS and combined total/date-bounds/unresolved counts. EXPLAIN ANALYZE improved from 84.8 ms with 9,864 temporary reads / 2,466 writes to 27.2 ms with no temporary I/O. Full workload improved to 2,460 ms p95 for 150 requests / 50 concurrency. Threshold remains 3,000 ms; schema, API, permissions and baselines are unchanged. Added real PostgreSQL bucket-consistency regression for nullable category and section.

Correction parity passed: clean-artifact frozen install/Prisma generation/audit/format/lint/typecheck/unit/OpenAI smoke, staging-relative destructive check and four upgrade harnesses; integration 75/75, security 14/14, performance 2/2, reconciliation, generated OpenAPI check, production build/PWA compatibility, browser 282/282 without snapshot updates and full-stack 4/4. The full quality run measured 1,636 ms p95 with PostgreSQL limited to two CPUs; the dedicated two-CPU Linux reproduction remains the comparable 2,460 ms result. Previous-staging-to-current migration/status, deployment validators, Actionlint/ShellCheck/Hadolint, inference syntax, Ubuntu bootstrap, real-flock Linux harness, x64 production Compose build/routing/non-root/persistence, Gitleaks directory scan and Trivy filesystem/all five images passed. No HIGH/CRITICAL findings or scanner exceptions were added. Task-started stacks are shut down before delivery. Original no-monitoring preference remains in force after pushing the correction; this inspection was explicitly requested to diagnose the failed run.

## Organization dashboard — 7 September 2026

Operational dashboards replace the monitoring homepage content while preserving the shell, identity hero and ordinary Member homepage. General defaults to handling organization with a reporter switch; Union has isolated Private/General URL state. KPI, filters, dense time series, privacy states, scoped preview and personal reporting sections use the generated API contract. Mobile filters are three compact rows: basis/reset, an organization summary opening an accessible sheet, and area/period/advanced filters. Desktop retains inline cascading hierarchy.

Key implementation paths: `apps/api/src/voices/dashboard.ts`, `voices.service.ts`, `voices.controller.ts`, `apps/web-voice/src/features/home/DashboardHome.tsx`, `PersonalVoiceSection.tsx`, `apps/api/scripts/dashboard-openapi.ts`, and the new dashboard integration/performance/browser suites. ADR-0042 and PRD §18.8 explain scope, default PIC primary mapping, privacy and lifecycle decisions.

Migration `20260907090000_dashboard_handling_projection` is additive. Deploy it before the application. Backfill uses handover/route evidence and memberships effective at assignment; unresolved historical organization remains explicitly unknown. Master updates do not rewrite Voice history. Backfill is idempotent and reports mapped/unresolved counts. Existing handover/contact migration harnesses now apply only migrations preceding their target, so later migrations cannot run before their dependencies.

Application and container validation are complete locally; commit/PR delivery is authorized. No hosted CodeQL, dependency review, deployment or acceptance result is implied. Follow the user's explicit no-monitoring instruction for this delivery.

### Local validation commands and results

Pinned Node 22.23.2 and pnpm 11.8.0 were used. Ignored application/package `dist` directories were removed before the ordered quality run. Safe CI environment values were used with `NODE_ENV=test`, `RELEASE_SHA=ci`, `OUTBOX_ENABLED=false`, and the Docker-managed `care_test` database; no host PostgreSQL service is required.

- `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm security:audit`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`: passed. Format/lint/typecheck passed again after the compact-filter and test refinements.
- `pnpm test:unit`: API 82, workforce 82, Admin 2, UI 26, frontend-core 15 passed. `pnpm test:openai:smoke` passed with the mock provider.
- `pnpm migrations:destructive-check` and `pnpm migrations:destructive-check origin/staging`: passed. Fresh migrate deploy, previous-staging schema deploy → current deploy → migrate status passed on a separate disposable database.
- `env -u DATABASE_URL pnpm test:migration:upgrade`: all four upgrade harnesses passed using Docker psql. Historical handling section and idempotent backfill assertions passed.
- `pnpm test:integration`: 74/74 passed. An initial 73/74 run exposed the existing import cleanup race: confirmation commits before raw-file deletion; the test now polls the actual eventual deletion instead of assuming synchronous cleanup.
- `pnpm test:security`: 14/14 passed. `pnpm seed:performance` and `pnpm test:performance`: 2/2 passed on 50,000 Voices / 10,000 accounts. Dashboard mixed Manager/global Director and handling/reporter p95 was 1,151 ms over 150 requests at 50 concurrency (target ≤3,000 ms). `pnpm maintenance:reconcile` dry-run passed with no orphan counts.
- `pnpm openapi:check`: generated contract byte-stable against staged generated output. `NODE_ENV=production pnpm build`, `pnpm pwa:compat-check`, and `pnpm exec playwright install --with-deps chromium webkit`: passed.
- `pnpm exec playwright test --workers=2`: 282/282 passed without snapshot updates. `FULLSTACK_E2E=1 pnpm exec playwright test --project=fullstack`: 4/4 passed against the API and Docker database.
- New dashboard PNGs cover 17 scenarios at 360/768/1440 on darwin and canonical Linux x64 (102 new images). Four existing monitoring homepage baselines were updated. Representative mobile/desktop/Union/protected images were inspected, compact mobile filters reviewed, and `pnpm exec playwright test e2e/dashboard.visual.spec.ts e2e/dashboard.spec.ts --workers=2` passed 54/54 on Linux without updates. The compact-sheet Axe test uses reduced motion to avoid testing an intermediate animation opacity.
- `pnpm deployment:validate`, `pnpm security:exceptions:check`, Compose config, Actionlint 1.7.7, ShellCheck 0.11.0, Hadolint 2.14.0, inference Compose/Python syntax and Ubuntu bootstrap contract passed. `pnpm test:deployment` ran inside Linux with real `flock` and passed.
- Gitleaks 8.24.3 directory scan passed with no leaks. Trivy 0.70.0 filesystem/secret/misconfiguration and the five native runtime images passed at HIGH/CRITICAL using the committed exact ignore policy. Canonical Linux x64 production Compose build with `--pull`, migration/bootstrap, release/routing/header/non-root checks and persistent database/media restart checks also passed. All five x64 images returned zero HIGH/CRITICAL findings. An initial npm network failure required a retry; no dependency or scanner policy was relaxed.

Runtime cleanup: production Compose stacks were shut down by their test harness, and `pnpm db:down` stops the task-started development database before delivery. No application/test servers are retained. Hosted checks are intentionally not monitored.

## Previous session reference

## Archived quick resume guide — verified 6 September 2026

Read this guide and the latest Session Outcome first. Earlier work is condensed into the reference index below; consult the linked ADRs and Git history only when needed. The top status table and `.agent/implementationPhases.md` describe current progress; `.agent/rules.md` and `.agent/PRD.md` remain authoritative for process and product behavior.

### Workspace and scope to preserve

- Start with `git status --short` and `git branch --show-current`. The current password-defer/copy/baseline/container changes are on `feat/visual-improvements-1`; the user explicitly authorized commit, push, and a PR to `staging`, but requested that hosted checks not be monitored after the PR is opened. Local validation is not hosted acceptance.
- `.design/dashboard-home-v2/` is preexisting unrelated untracked work. Do not stage, delete, or regenerate it as part of these fixes.
- Union General viewing is deferred. Local seeded-account success did not explain the reported issue. Resume investigation only when requested; first distinguish a failed request from an empty filtered result. `features/general/GeneralBrowsePage.tsx` is the entry point. No fix for that flow is included here.
- Phase 13 hosted acceptance remains open. Local test success is not deployment completion or full pre-commit parity. Consult the actual target-branch workflows and `.agent/rules.md` before committing.

### Code map for the current work

Paths in this table are repository-relative.

| Area                                   | Start here                                                                                                  | Important relationship                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workforce routing/auth gates/password  | `apps/web-voice/src/App.tsx`                                                                                | Auth bootstrap must resolve before redirects; normal password back returns to Account, forced-password back logs out.                                                               |
| Shared auth/transport/cache            | `packages/frontend-core/src/auth.tsx`, `transport.ts`, `cache.ts`                                           | Preserve session-scoped queries, credentials/CSRF, cache clearing and capability gates.                                                                                             |
| Workforce API adapter                  | `apps/web-voice/src/workforce-api.ts`                                                                       | Connects page operations to the generated contract client.                                                                                                                          |
| Create/save/analyze/review             | `apps/web-voice/src/features/create/useDraftWizard.ts`, `CreateVoicePage.tsx`                               | Persist normalized actual form values and expectedVersion; use server-returned draft data/version. First photo upload can create the draft.                                         |
| Shared confirmation and direct preview | `apps/web-voice/src/features/create/ReviewParts.tsx`, `DraftPreviewPage.tsx`                                | Both review entrypoints must retain matching consent checks and compact wrapping. Success receipt is a separate `SubmittedVoicePage.tsx`.                                           |
| Detail identity/conversation           | `apps/web-voice/src/components/VoiceHero.tsx`, `features/voice/VoiceDetailPage.tsx`, `ConversationPage.tsx` | Identity depends on DTO audience, not the logged-in role; check Closed layout as well.                                                                                              |
| Assignment and closure                 | `apps/web-voice/src/components/ActionPanel.tsx`                                                             | Assignment owns its Dialog, fixed footer and scroll body; closure allows zero photos but requires a note.                                                                           |
| Dialog primitives and styling          | `packages/ui/src/overlays.tsx`, `apps/web-voice/src/styles.css`                                             | Assignment uses optional `className` and scoped `.assignment-dialog` CSS; avoid changing every overlay to fix one screen. Check later CSS overrides before editing an earlier rule. |
| Voice API and schemas                  | `apps/api/src/voices/voices.service.ts`, `voice.contracts.ts`                                               | Draft validation, atomic submission, consent snapshots and audience-specific serialization live here.                                                                               |
| Database and generated contracts       | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`, `apps/api/scripts/enrich-openapi.ts`        | Change source schemas/enrichment, then generate `apps/api/openapi.json` and `packages/contracts/src/generated.ts`; do not hand-patch generated output.                              |

Private contact consent is separate from identity permission. Drafts may omit consent, but Private submission requires true from the saved draft. Server snapshots are immutable, nullable for historical/General Voices, and restricted to reporter/Admin detail; never add identity hints to anonymous Union responses or consent fields to AI inputs/hashes. See ADR-0038 for the full contract and ADR-0039 for assignment layout decisions.

### Session-scoped workforce password defer and copy polish — 6 September 2026

Added `POST /api/v1/auth/defer-password-change` through controller/service, restricted-session allowlist, OpenAPI enrichment, generated client, shared transport and auth cache. It accepts only an authenticated `WORKFORCE` session with CSRF, updates only that current session from restricted to unrestricted, and emits `PASSWORD_CHANGE_DEFERRED` once on the actual transition. The persistent account flag, sibling sessions, password, and push subscriptions are untouched; therefore logout/new login restores the gate until a real password change. Union and CARE Admin receive default-deny and never see `Lain kali`.

The forced-password screen now has primary `Simpan password` and secondary `Lain kali`; per the final user direction there is no “Permintaan ini akan muncul…” helper. Its policy helper says `Password minimal 6 karakter dan tidak boleh sama dengan username dan password sebelumnya`. Failed edits remain on the page with safe, state-specific alerts for confirmation mismatch, incorrect current password, reuse, rate limiting/offline, and unknown failure; an incorrect current password no longer invalidates the valid login session. Login says `Silahkan login sesuai petunjuk.` Create Voice uses the approved General/Private descriptions, `Isi Voice` as visible and accessible composer label, and `Contoh: Welding 2, Toilet Selatan` as the location placeholder. Existing CARE tokens were retained; long choice text, mobile spacing, touch targets, keyboard/loading/error behavior and no-overflow coverage were refined without changing Voice authorization.

Tests cover pre-defer denial, CSRF, workforce-only access, current/sibling session isolation, persistent account flag, idempotent audit, relogin restriction and permanent password change. Mocked browser coverage includes success/error/cache behavior, Union absence, Axe, focus/touch targets and 360/768/1440 overflow. The real full-stack journey proves defer → dashboard → logout → relogin gate → password change. Affected login/password/type/private-form baselines and new defer/empty-location/composer baselines were regenerated; Linux x64 canonical images used Ubuntu 22.04, Node 22.23.2 and Playwright 1.62.1, then passed without update. Representative PNGs were inspected visually.

Validation completed: OpenAPI generation byte-stable; lint, typecheck, production build, unit suites (API 79, UI 26, frontend-core 15, workforce 81, Admin 2), integration 62, security 14, PWA compatibility, migration upgrade/destructive checks and Compose config passed. Default Playwright produced 223/226 initially: two intentionally stale Private Voice baselines and one service-worker timing flake. Both baselines were delete-first regenerated and the PWA test passed immediately in isolation. After the final password-copy/error additions, a four-worker rerun was interrupted by host resource starvation across unrelated Chromium and WebKit fixtures; every failed file then passed in isolation (63/63 Chromium and 5/5 WebKit), and the stable final complete run passed 228/228 without updates using two workers. Full-stack passed 3/3 on the final rerun; an immediately preceding run had an unrelated Admin import polling timeout while the new workforce journey passed. `pnpm audit --audit-level high` passed with three Moderate and zero High/Critical; Gitleaks 8.24.3 found no leaks. No schema change or migration was required.

PR preparation was explicitly authorized after implementation. Target `origin/staging` remained at `6c1cb51f`. Frozen install, Prisma generation, OpenAI smoke, staging-relative destructive migration check, deployment/runtime validation, security exception validation, Compose config, Actionlint, ShellCheck, Hadolint, inference syntax, Ubuntu bootstrap contract, Linux deployment harness (including real `flock`), performance fixture/test, and reconciliation all passed. The required production Compose build with `--pull` then failed in the unchanged `deploy/postgres/Dockerfile`: Alpine resolution offered `libuuid-2.42.1-r0`, conflicting with the inherited exact `libuuid@care-security=2.42.3-r0` pin. This is the existing Phase 13 container blocker, not a regression from this feature. Because `.agent/rules.md` forbids committing while a mandatory CI-equivalent gate fails, no commit, push, or PR was created; container-pin remediation requires separate scope or an explicit process decision. Trivy image scans could not run because the required images were not produced.

The user subsequently authorized the narrow container remediation. Stable Alpine v3.24 package probes expose patched `libuuid 2.42.3-r1` on both Linux x64 and ARM64. ADR-0041 advances the exact pin in PostgreSQL and both nginx runtimes and removes the temporary tagged edge repository; base-image digests and other patched-library pins remain unchanged. A pulled Linux x64 production Compose build succeeded for all five images. Migration/bootstrap, readiness, release metadata, SPA fallback, auth boundary, manifest/CSP, non-root execution, private PostgreSQL port, and database/media persistence checks passed. Trivy 0.70.0 filesystem/secret/misconfiguration scanning and all five image scans reported zero HIGH/CRITICAL findings; the three Alpine runtime images were directly verified at `libuuid-2.42.3-r1`. Task-started containers and temporary staging/Trivy directories were removed afterward.

### Fast, reliable verification

- Runtime: root `package.json` pins pnpm 11.8.0 and Node `>=22.23.0 <23`; this session used Node 22.23.2. Use root scripts rather than inventing package commands.
- Playwright runs **production preview builds**, not source/dev servers. Run `NODE_ENV=production pnpm build` after application changes before browser checks. Workforce preview is 4173 and Admin is 4174; stale reused preview servers/builds can test old code.
- `pnpm exec playwright test --workers=4` runs the default mocked Chromium, visual, PWA, push and legacy WebKit projects. It does **not** run the real API fullstack project. Latest result: 219 passed; the subsequent visual-only run passed 62 tests.
- Focused entrypoints: `e2e/assignment-scroll.spec.ts`, `e2e/assignment-scroll.visual.spec.ts`, `e2e/voice-consent.spec.ts`, `e2e/voice-consent.visual.spec.ts`, `e2e/workforce-legacy.spec.ts`. Shared fixtures/routes are in `e2e/helpers/mock-api.ts`; preserve stateful draft versions and consent when extending mocks.
- CI visual parity requires **Linux x64**, not native ARM64 Docker on Apple Silicon. Use `docker run --platform linux/amd64 …`, verify `node -p process.arch` prints `x64`, and match Node 22.23.2 / Playwright 1.62.1 / Ubuntu 22.04. The affected specs use `visual-platform.ts` to select `linux-x64`, `linux-arm64`, or `darwin` images.
- Baselines live beside specs in `*-snapshots/` directories. Build first, delete only affected PNGs, generate with `--update-snapshots`, inspect images, then run twice without updating. Do not loosen thresholds. Use reduced motion for deterministic overlay accessibility checks; wait for the intended state rather than measuring an animation frame.
- Candidate queries can reuse cached data. For a fetch-failure test, install the error route before the first fetch or start with a fresh page/session; otherwise cached successful results can hide the failure fixture.
- Real API E2E requires `FULLSTACK_E2E=1`, the CI test environment, a built API, and migrated disposable Docker DB. `playwright.config.ts` forces one fullstack worker; global setup seeds the Admin baseline. Read the workflow for the complete environment rather than reusing stale shell values.
- Port 3000 belonged to an unrelated supplier-henkaten service during this session. Verify port ownership before fullstack runs; never stop an unrelated service. A prior successful temporary port-4300 workaround required consistent API, test and proxy substitutions, all restored afterward; there is no committed alternate-port feature.
- `pnpm db:up`, `db:wait`, `db:verify`, `db:test:reset`, `db:test:migrate` operate the Docker test setup (host port 54329). Reset only the disposable test database. The production-like local stack is a different workflow: `pnpm local:up/status/logs/down`; never source or print its `.env.local` secret store.
- `pnpm openapi:check` regenerates and compares against Git HEAD. Intentional uncommitted generated changes therefore make it fail even if generation is deterministic. Compare before/after hashes to investigate determinism, but still require the ordinary workflow gate before delivery.
- `pnpm pwa:compat-check` inspects built artifacts. Legacy WebKit coverage matters: Chromium success alone has missed layout defects here. Keep API/private data network-only and Admin free of workforce PWA behavior.
- Stop only task-started servers and run `pnpm db:down` after DB verification. At this handoff the CARE database/network, production-like stack, and preview/test processes are stopped. Temporary staging and Trivy directories were removed.

## Session Outcome

### Staging x86-64 package-source correction — 5 September 2026

Run `33960410199` passed quality but could not build the web runtime: stable Alpine v3.24 offers patched libuuid on aarch64 while its x86_64 index still exposes 2.42.1-r0. The prior ARM-only install/scan did not establish CI package availability. The runtime Dockerfiles now add a tagged `@care-security` edge/main source and request exactly `libuuid@care-security=2.42.3-r0`; all other packages retain stable resolution. The x86_64 install probe upgraded only the four explicitly pinned libraries, with no additional dependency upgrades. Validate production package changes with `DOCKER_DEFAULT_PLATFORM=linux/amd64`, not the native Apple Silicon default. Remove the tagged source when the pinned stable base/repository supplies the patched version on both architectures. No scanner exceptions were added. Verification passed: three explicit amd64 image builds and Trivy High/Critical scans (zero findings), production Compose routing/health/non-root/persistence checks, Hadolint, format, Gitleaks and diff checks. Runtime containers were shut down afterward.

### Staging libuuid security correction — 5 September 2026

PR #32 is merged (`a29c3622`). Run `33956898087` passed quality, including visual/fullstack tests; the architecture correction is confirmed in hosted CI. The container job failed on seven newly reported High util-linux advisories in `libuuid 2.42.1-r0` inherited from the pinned Alpine image. Both web runtimes and PostgreSQL contain this package, so their existing explicit APK patch layers now pin `libuuid=2.42.3-r0`. No base digest, application code or scanner exception changes. Verify all affected images because CI stops scanning at the first failed image. Validation passed: all three rebuilt images scan clean at High/Critical with Trivy 0.70.0; production Compose migration/bootstrap, routing/headers, health, non-root users, private DB port and persistent DB/media restart checks; Hadolint, deployment config validation, format, Gitleaks and diff checks. Task-started runtime containers were removed after verification.

### PR #32 Linux architecture correction — 5 September 2026

Run `33955215596` exposed a missing part of visual parity: Docker on Apple Silicon defaults to Linux ARM64, while GitHub Ubuntu uses x64. An explicit `--platform linux/amd64` reproduction with Node 22.23.2 / Playwright 1.62.1 reproduced all thirteen failures, including the exact 1,848-pixel assignment and 24,950-pixel identified-detail differences from CI. The earlier OS-only correction was insufficient.

Affected tests now use `e2e/helpers/visual-platform.ts`: `linux-x64` for CI, `linux-arm64` for native Apple Silicon Docker, and the existing `darwin` snapshots for macOS. Existing PNGs are renamed without modification; sixteen x64 PNGs are generated and visually reviewed. Thresholds and production UI are unchanged. Future Linux baseline generation must explicitly match CPU architecture, not just distribution/browser version. Validation: explicit amd64 full frontend suite 219 passed, followed by 62 visual tests without updates; macOS visual suite 62 passed. Format, lint, typecheck, directory Gitleaks and diff checks passed. No production source changed; all other hosted jobs passed on the preceding commit. Test containers exit automatically (`--rm`).

### PR #32 visual CI correction — 5 September 2026

CI run `33936946016` passed all jobs except quality (13 visual failures) and its dependent release gate. Ubuntu reproduction confirmed the twelve new strict screenshot cases differed in text rasterization from macOS; the identified detail also failed in hosted CI. These snapshots now use explicit `darwin`/`linux` filenames. Existing macOS PNGs are retained except four text-only fixtures refreshed after runtime restoration; Linux PNGs are generated with Ubuntu 22.04 / Node 22.23.2 / Playwright 1.62.1, and thresholds are unchanged. Production application code is untouched. Generate and verify each affected baseline on its corresponding OS; a macOS pass is not Linux visual parity. Union General work remains deferred. Linux full frontend suite passed 219 tests and a second visual run passed 62 without snapshot updates. macOS visual verification passed 62 tests twice after the production rebuild. Format, lint, typecheck, PWA compatibility, directory Gitleaks and diff checks passed. Representative PNGs were inspected. No API/schema/runtime source changed; the prior complete pre-commit and hosted non-visual gates remain applicable to those unchanged files.

### Pre-commit verification and PR delivery — 5 September 2026

The target-branch CI workflow and reusable/manual deployment workflows were inspected. Build directories and TypeScript build caches were moved aside before verification. Changes were staged excluding `.design/dashboard-home-v2/`; OpenAPI generation was checked against the staged candidate. The user authorized commit/push and a PR to `staging`, explicitly without monitoring hosted checks. No merge or hosted deployment is authorized by this delivery.

Passed commands, in CI quality order: `pnpm install --frozen-lockfile`, `db:generate`, `security:audit` (three Moderate, zero High/Critical), `format:check`, `lint`, `typecheck`, `test:unit` (202), `test:openai:smoke`, `migrations:destructive-check`, API `prisma:migrate:deploy`, `test:migration:upgrade`, `test:integration` (59), `test:security` (14), `seed:performance`, `test:performance`, `maintenance:reconcile`, `openapi:check`, production `pnpm build`, `pwa:compat-check`, Playwright Chromium/WebKit install, `pnpm exec playwright test --workers=4` (219), fullstack project (3), Compose config and `git diff --check`. Docker DB used port 54329; migration fixtures used the Docker psql fallback. Fullstack used temporary port-4300 substitutions to avoid an unrelated service; all files were restored.

Additional passes: destructive check against `origin/staging`; previous-SHA Prisma deploy → current deploy/status on a separate disposable database; Actionlint 1.7.7, ShellCheck 0.11.0, Hadolint 2.14.0; inference Compose/Python syntax; `deployment:validate`; deployment harness on Linux (including real flock); `security:exceptions:check`; Ubuntu bootstrap contract. The production Compose workflow was executed through build/start/migrate/bootstrap/routing/headers/non-root/persistence checks. Directory Gitleaks 8.24.3 found no leaks. Trivy 0.70.0 filesystem and API/workforce/Admin/PostgreSQL/Caddy image scans found zero High/Critical using the committed exception policy. Task-started Compose stacks are shut down before delivery. Hosted CodeQL/dependency review and release acceptance are not claimed by these local results.

### Scrollable PIC assignment — 5 September 2026

The assignment sheet now has a bounded flex layout: its candidate list and optional reason scroll inside the body, while the title and action footer remain reachable. Search appears above five candidates, with a result count, selected-name summary, empty-search feedback, and retry on candidate loading failures. Assignment errors are displayed inside the dialog. Candidate queries run only while open; selection/search/reason reset after dismissal. Authorization, expectedVersion and idempotency are unchanged.

Changed files: workforce `ActionPanel.tsx` and scoped CSS; optional `Dialog.className` in shared UI; assignment functional/visual tests; existing assignment journey copy; legacy WebKit regression. Six new assignment PNGs cover list/selected states at 360/768/1440, and the existing assignment-sheet baseline was regenerated after a production build. PNGs were visually inspected. The functional suite also covers 390px, keyboard/focus, Axe, searching, retry and submitting the thirtieth candidate.

Union General investigation is **deferred at user request**. A temporary local real-API probe could open General Voices with all three seeded Union accounts, but this does not establish the cause of the reported environment issue. No Union General browse behavior was changed; the temporary probe is excluded from the repository. Private Union assignment remains covered because it shares the fixed dialog.

Validation: production build, typecheck, lint and unit suites passed. `pnpm exec playwright test --workers=4`: 219 passed. A subsequent `pnpm exec playwright test --project=visual --workers=3`: 62 passed without snapshot updates, following the full-suite visual pass. `pnpm format:check`, `pnpm pwa:compat-check`, and `git diff --check` passed. Directory Gitleaks v8.24.3 reported no leaks. `pnpm db:down` removed the CARE disposable database container/network; no Playwright or preview processes remained. Full clean-artifact/container pre-commit parity remains required before commit; no commit, push or deployment was performed. Phase 13 hosted acceptance remains open.

### Private contact consent and compact Voice confirmation — 5 September 2026

Implemented the audience-aware reporter label on responder detail/conversation and Closed headers; reporter self retains PIC, and Private identity remains consent-safe. The create/edit photo helper uses the exact ATSG wording. Private contact willingness is an initially unchecked, persisted checkbox below identity choices; its copy uses secondary gray and regular weight. Drafts can be saved without it, but both submit entrypoints and the server require consent. Atomic draft version updates prevent concurrent revocation/submission from consuming an outdated consent.

Confirmation cards now use compact 14px values, smaller icon plates and tighter rows with complete text wrapping. The AI/classification-source metadata is removed from both confirmation entrypoints; location completeness stays visible. Category names resolve from the immutable revision. Closure accepts zero to five photos, retaining the required note. Ordinary password changes return to Account; restricted sessions can return to Login through logout. Auth bootstrap now waits for session loading before deciding whether to redirect.

Migration `20260905100000_private_contact_consent` adds nullable columns to Draft/Voice without fabricating historical consent. Voice snapshots record boolean, server timestamp and wording version `v1`; only reporter/Admin detail serializers expose them. Consent does not enter provider inputs or classification/location hashes. The wizard now persists actual edited fields and expectedVersion, hydrates existing attachments, and targets the saved draft ID during the first upload.

Changed areas: API service/contracts/OpenAPI/generated client/Prisma migration; workforce auth, VoiceHero, create/review wizard, CloseDialog, scoped styles; stateful API mocks and regression/visual suites; PRD/roadmap/ADR. Existing untracked `.design/dashboard-home-v2/` was not touched or staged.

Validation performed:

- `pnpm install --frozen-lockfile`; `pnpm db:generate`; production `pnpm build`; format, lint, typecheck: passed, using Node 22.23.2 and pnpm 11.8.0.
- `pnpm test:unit`: API 79, UI 26, frontend-core 14, workforce 81, Admin 2 passed.
- `pnpm db:up`, `db:wait`, `db:verify`, `db:test:reset`, `db:test:migrate`: passed against disposable Docker PostgreSQL; fresh nine-migration chain applied.
- CI-environment `pnpm test:integration`: 59 passed. After adding concurrent consent coverage, the routing suite was rerun: 5 passed. Closure suite rerun: 12 passed, including zero/one/five evidence cases.
- `pnpm test:security`: 14 passed; existing anonymous response identity constraints preserved.
- `pnpm test:migration:upgrade` existing fixtures passed; new `node scripts/test-contact-consent-migration-upgrade.mjs` passed and is included in the root migration-upgrade command. Historical Voice fields/events preserved and all consent snapshot fields remained null.
- `pnpm seed:performance`, `pnpm test:performance`: passed for the repository performance fixture; reconciliation dry-run counters all zero.
- `pnpm exec playwright test --workers=4`: **209 passed**, including new consent, closure, password and Axe/no-overflow scenarios at 360/390/768/1440; PWA, push and legacy WebKit passed.
- Subsequent `pnpm exec playwright test --project=visual --workers=3`: **59 passed** without updating snapshots. Affected baseline PNGs were deleted before generation, inspected visually, and verified by both consecutive final runs. Nine new baseline images cover long review values, consent states, legacy preview, normal password, and responder/self identity; fourteen existing affected baseline PNGs updated.
- `FULLSTACK_E2E=1 ... pnpm exec playwright test --project=fullstack`: **3 passed**. Initial default-port run hit an unrelated supplier-henkaten API already on port 3000. The successful run used port 4300 through temporary test/proxy substitutions; every substituted file was restored byte-for-byte afterward. No runtime config changes are shipped and the unrelated application's containers were left alone.
- OpenAPI/client regeneration SHA-256 comparison: byte-identical to the already generated working-tree files. The ordinary `openapi:check` compares against Git HEAD, so this equivalent deterministic check was used while intentional generated changes remain uncommitted.
- `pnpm pwa:compat-check`: passed, main gzip 133418 bytes.
- `pnpm migrations:destructive-check`, `pnpm deployment:validate`, `docker compose config --quiet`: passed.
- `pnpm security:audit`: passed high-severity threshold; three Moderate advisories remain, zero High/Critical.
- Gitleaks v8.24.3 directory scan: no leaks. `git diff --check`: passed.

No commit, push or deployment was performed. Complete pre-commit container-image/security/deployment workflow parity remains required if preparing a commit; these frontend/API checks are not a claim that the hosted delivery gate is complete. Temporary fullstack proxy changes were restored; Playwright stopped its servers. CARE database shutdown completed after assignment verification, as recorded above.

## Earlier work — reference index

Earlier implementation narratives, superseded next steps and repeated test logs have been condensed. Historical passes do not replace verification of the current change. Architecture details remain in `docs/adr/`; release procedures and current gates remain in `.agent/rules.md`, `.agent/deploymentGuide.md` and `.agent/implementationPhases.md`.

| Topic                      | Essential behavior to preserve                                                                                                                                                                                                                                                                                                    | Reference                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closure review and reopen  | Deadline-effective acceptance is computed on reads before the worker catches up. Timely low-rating reopen submits atomically; late ratings cannot reopen.                                                                                                                                                                         | [ADR-0032](../docs/adr/0032-closure-review-window-auto-acceptance.md)                                                                                                                                                                                |
| Submission success         | `/voices/submitted` is a one-time receipt with consumed navigation state; direct access/refresh returns to history. It has no normal app chrome.                                                                                                                                                                                  | [ADR-0037](../docs/adr/0037-workforce-submit-success-page.md)                                                                                                                                                                                        |
| Login artwork              | Preserve natural image ratio and mobile top alignment; verify WebKit as well as Chromium. Animated password placeholder remains deferred.                                                                                                                                                                                         | [ADR-0036](../docs/adr/0036-workforce-login-hero-artwork.md)                                                                                                                                                                                         |
| Manager handover           | Only the current route-owning Manager can hand over an unassigned `OPEN` General Voice. Operational category may change; original submission classification remains immutable. Notes are visible only to the transfer's source/destination PIC, not ordinary readers/Admin.                                                       | [ADR-0033](../docs/adr/0033-manager-to-manager-voice-handover.md)                                                                                                                                                                                    |
| Detail/chat                | Detail and dedicated conversation share audience-aware identity and lifecycle behavior; read-only and Closed surfaces must remain consistent.                                                                                                                                                                                     | [ADR-0031](../docs/adr/0031-voice-detail-chat-redesign.md)                                                                                                                                                                                           |
| Dynamic General categories | Use category keys and revision snapshots rather than hard-coded enum labels; preserve historical classification when configuration changes.                                                                                                                                                                                       | [ADR-0029](../docs/adr/0029-dynamic-general-voice-category-catalog.md), [ADR-0030](../docs/adr/0030-classification-prompt-v14-enrichment.md)                                                                                                         |
| AI provider/runtime        | OpenAI-compatible Chat Completions/function calling and Admin runtime configuration supersede earlier Responses-only assumptions. Automated smoke uses a local mock, not live credentials. Read current configuration before diagnosing a provider; historical provider/model/timeout values are not current deployment evidence. | [ADR-0017](../docs/adr/0017-deepseek-chat-completions-function-calling.md), [ADR-0028](../docs/adr/0028-local-granite-inference-and-admin-runtime-configuration.md)                                                                                  |
| Media and legacy iOS       | Preserve authorized in-page attachment viewing and capability-tier fallbacks; finalized media remains authorization-controlled. Legacy WebKit emulation is a regression aid, not proof of every physical-device behavior.                                                                                                         | [ADR-0026](../docs/adr/0026-ios-legacy-pwa-capability-tiers.md), [ADR-0027](../docs/adr/0027-in-page-attachment-viewer.md)                                                                                                                           |
| Workforce visual system    | CARE uses Inter, cobalt/cyan, white surfaces and responsive layouts. Redesign references do not override domain/privacy contracts.                                                                                                                                                                                                | [ADR-0022](../docs/adr/0022-workforce-auth-home-create-redesign.md), [ADR-0023](../docs/adr/0023-workforce-history-detail-notifications-account-redesign.md), [ADR-0024](../docs/adr/0024-workforce-manager-leadership-union-redesign.md)            |
| Admin UI                   | Separate desktop-only Admin surface; the 1280px admission gate precedes protected fetching. Private access is audited; no workforce PWA behavior.                                                                                                                                                                                 | [ADR-0034](../docs/adr/0034-admin-web-premium-redesign.md), [ADR-0035](../docs/adr/0035-admin-web-premium-polish.md)                                                                                                                                 |
| Foundation/lifecycle       | Capability/object policy, immutable snapshots, optimistic concurrency, idempotent mutations, and server-enforced privacy are shared constraints across the two apps.                                                                                                                                                              | [ADR-0004](../docs/adr/0004-care-v1-1-organization-routing-ai-and-frontend.md), [ADR-0008](../docs/adr/0008-voice-lifecycle-idempotency-evidence-and-assignment-contract.md), [ADR-0010](../docs/adr/0010-frontend-complete-gate-and-two-app-e2e.md) |
| Deployment                 | Docker-managed PostgreSQL, immutable releases and separate hosted acceptance remain required. Security scan results and exceptions must be checked against current workflows, not copied from old handoffs.                                                                                                                       | [ADR-0011](../docs/adr/0011-single-vm-container-runtime-and-immutable-releases.md), `.agent/deploymentGuide.md`                                                                                                                                      |

Other focused decisions are indexed by filename in `docs/adr/` (Admin operations, monitoring, route remediation, processing animation and design exploration). Preserve design assets in their existing locations; do not regenerate them merely to reconstruct historical context.

## Maintaining this handoff

Keep the current objective, open/deferred work, practical code map and latest validation evidence near the top. When work is superseded, retain only its lasting constraints and an ADR reference; remove obsolete phase instructions and duplicate command logs. Record actual validation scope and remaining release checks without treating old passes as new evidence. Documentation-only compression does not change implementation or validation status.
