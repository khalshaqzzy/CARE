# CARE Session Handoff

| Atribut                 | Nilai                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Date                    | 4 September 2026                                                                                              |
| Current objective       | Reopen-after-low-rating deadline consistency fix implemented locally                                          |
| Current phase           | Phase 12.5 `done`; Phase 13 `in_progress`; Phase 14 `pending`; Delivery Complete Gate remains open            |
| Backend Complete Gate   | Unchanged (no API/contract/schema change in this pass)                                                        |
| Implementation status   | API read models, closure worker guards, and Workforce rating state now agree on the two-day reopen boundary   |
| Latest ADR              | ADR-0037 remains latest; ADR-0032 extended with the reopen consistency correction                             |
| Recommended next action | Commit/push `fix/reopen-voice`, verify hosted CI, then recheck timely and expired low-rating paths on staging |

## Session Outcome

### Reopen-after-low-rating deadline consistency — 4 September 2026

Branch `fix/reopen-voice` (from current `staging`). The low-rating reopen path
was audited end to end. The primary reported failure was an interaction mismatch:
`Buka kembali` looked like an action but only selected a boolean; users still had
to discover and press `Kirim penilaian` afterward before the atomic API mutation
ran. A second deadline-boundary defect let an expired cycle remain visibly
`PENDING` until the 30-second worker ran, so UI and mutation eligibility could
also disagree temporarily.

- **API/read model.** Expired stored-`PENDING` cycles are projected as effective
  `ACCEPTED` immediately on detail and list responses, with the deadline used as
  the effective resolution time. `closedPendingReview` now counts only cycles
  whose deadline has not passed. This makes scheduling latency affect only the
  durable auto-accept event/notifications, never the visible eligibility.
- **Worker defense.** Auto-accept selection and guarded update now require an
  unrated, unreopened cycle on a currently Closed Voice, preventing stale or
  inconsistent rows from producing an auto-accept event.
- **Workforce defense.** The rating card independently observes the deadline,
  removes reopen when the window expires while the page is open, and replaces
  the misleading reopen toggle with two explicit low-rating submit actions.
  `Buka kembali` now directly sends the atomic rating + reopen mutation; the
  `Kirim tanpa buka kembali` action records the low rating as final acceptance.
- **Regression coverage.** PostgreSQL integration asserts effective acceptance,
  the late-rating-only action, and dashboard count before the worker tick. Browser
  journeys cover the one-click timely reopen, the explicit accepting decision,
  and an expired pending payload.

Validation completed: frozen install and Prisma generation; format, ESLint,
typecheck, 202 unit tests, OpenAI smoke, destructive-migration and OpenAPI drift
checks; all 56 PostgreSQL integration, 14 security, and the 50k-Voice performance
suite; reconciliation, production build, PWA compatibility, and all 188 mocked
browser/a11y/visual/PWA/legacy journeys. Focused closure review passed 6/6 and
the Member journey passed 9/9. The real full-stack project passed 3/3 in an
isolated Playwright container on the repository-required Node 22.23 runtime;
this avoided stopping an unrelated local project already bound to host port 3000. Migration upgrade paths (legacy and previous handover), deployment
validation/harness, security exception/audit checks, Actionlint, ShellCheck,
inference Compose/Python checks, deployment shell syntax/bootstrap, and the
pre-commit Gitleaks directory scan also passed. Audit retains three existing
moderate findings and no high/critical finding. Hosted CI is checked after push.

### Workforce submit success page — 4 September 2026

Branch `feat/submit-voice-asset` (from current `staging`). Successful General
and Private submission now opens an immersive one-time `/voices/submitted`
receipt instead of navigating directly to Voice detail, following ADR-0037.

- **Lifecycle/navigation.** `DraftPreviewPage` keeps the established query
  invalidations and replaces the preview history entry with a transient
  `{ submitted: true }` receipt. `SubmittedVoicePage` consumes and clears that
  state immediately; refresh/direct access/later browser-back redirects to
  `/history`. The static route is resolved before `/voices/:id`. Its shell path
  renders the outlet directly, so topbar/sidebar/bottom navigation are absent
  from both the visual and accessibility tree. Actions go to Voice Saya
  (`/history`) and the capability-aware dashboard (`/`). No fetch, storage,
  query parameter, Voice ID, API, schema, or OpenAPI change was introduced.
- **Visual.** The supplied 1122×1402 RGBA artwork is used unchanged as a
  fingerprinted decorative asset; FFmpeg verified alpha `0..255`. The screen
  reconstructs the supplied reference with CARE cobalt, a subtle blueprint
  grid, white CARE lockup, outlined success check, centered character, and four
  layered code-native SVG waves. The final white crest overlaps the content by
  2 px to remove the responsive SVG raster seam while retaining a fully curved
  lower boundary. Mobile is full-bleed; ≥513 px uses a centered 32rem vertical
  canvas without changing to a split layout. Buttons remain clear of the safe
  area and reduced motion is respected.
- **PWA.** Fingerprinted PNG assets are now included in the inject-manifest
  precache. Production output contains `submit-voice-asset-*.png`; precache is
  16 entries / approximately 3.02 MiB. The JavaScript compatibility budget
  remains green at 132,562 bytes gzip.
- **Tests.** Added mocked journeys for success/history/dashboard,
  refresh/direct-access consumption, submit failure/no false receipt, absence
  of app chrome, Axe/keyboard/no-overflow, PWA asset presence, and visual
  baselines at 360×800, 768×900, and 1440×1000. Baselines were regenerated
  delete-first and passed a consecutive deterministic run. Format, lint,
  typecheck, unit (API 79, UI 26, frontend-core 14, Admin 2, workforce 81),
  production build, PWA compatibility, and the complete mocked Playwright
  suite (185/185), Gitleaks v8.24.3 directory scan, and `git diff --check`
  passed. Database-backed suites were not rerun because the change set is
  frontend-only.

### Login hero real-device fixes (post-merge) — 3 September 2026

After PR #29 merged, the product owner reported two real-device issues;
both fixed in `apps/web-voice/src/styles.css` only and pushed directly to
`staging` on request.

- **WebKit artwork stretch (real iPhone report).** The original full-bleed
  (`justify-self: stretch` + negative inline margins) made WebKit size the
  auto grid row from the image's natural height and stretch the item on
  both axes — Chromium resolved the same markup correctly, so the mocked
  suite never caught it. Replaced with the canonical replaced-element
  pattern: hero `padding-inline: 0` (lockup/h1 carry the inline padding
  instead) and `img { width: 100%; height: auto; align-self: start }`,
  overlap `calc(-1 * var(--space-5) - 10%)` (10% of the full-width track =
  15% of the 2:3 asset height). A raw Playwright script verified in BOTH
  engines: image 390×260 (ratio 0.667), hero bottom = image bottom, no
  distortion.
- **White strip above the hero on mobile.** The base `.auth-layout` centers
  items (`align-items: center`) while the mobile rows stretch
  (`align-content: stretch`), so the hero sat centered in its taller row —
  an 8 px canvas strip above the blue. Mobile breakpoint now pins
  `align-items: start`; measured hero top = 0 in both engines.
- **Validation.** format:check, lint (zero warnings), typecheck, production
  build (precache 14 entries, 820.97 KiB), PWA artifact gate (131,673 B),
  login visual baseline regenerated delete-first and verified across two
  consecutive deterministic runs (47/47 visual specs green). ADR-0036
  updated to the shipped cross-engine pattern. Unit suites unaffected (no
  TS/JSX change since their last green run); full mocked e2e re-run skipped
  on the product owner's direct-push instruction.

### Workforce login hero artwork and copy refresh — 3 September 2026

Branch `feat/auth-submit-page-polish` (from latest `main`). Frontend-only
change implementing ADR-0036 while leaving Phase 13 `in_progress`: the login
hero becomes a media variant with the supplied member-voice artwork
(full-bleed, edges on the blue background's edges, wave forming the hero
bottom edge) and the approved copy refresh. `packages/ui` untouched;
ChangePasswordPage hero byte-identical; no API/schema/contract change.

- **Hero.** New `auth-brand--media` modifier (login only): lockup, headline
  "Selamat datang di CARE." (accent line + rounded underline, no "Halo!" per
  product-owner update), artwork `src/assets/auth-hero-asset.png` (1152×768
  899 KB PNG; source alpha verified genuinely transparent before use;
  resampled from 1536×1024; Vite-fingerprinted import, decorative `alt=""`,
  width/height set). Full bleed via the hero's removed inline padding (text
  items carry it instead) and the canonical replaced-element pattern
  `width: 100%; height: auto; align-self: start` (percentage width calc
  proved unreliable in the grid track; see the post-merge fixes above for
  the WebKit iteration). Artwork sits flush under the headline
  (grid gap cancelled, ~15% overlap via `calc(-1 * var(--space-5) - 10%)`);
  lockup gap
  tightened. The wave is the hero's bottom edge (mobile `padding-bottom: 0`
  re-declared after the equal-specificity mobile shorthand — a single-class
  modifier is (0,1,0); cascade lesson recorded in ADR-0036 and a CSS
  comment).
- **Copy.** Subtitle "Login untuk melanjutkan ke CARE"; username placeholder
  "Contoh: 00111111"; helper "Gunakan 8 digit NoReg Anda."; password
  placeholder stays "Password".
- **Deferred.** Animated drifting password placeholder ("Password awal adalah
  NoReg Anda.") intentionally deferred per product owner mid-implementation;
  overlay/keyframes/measurement helper removed before final validation.
  Recorded in ADR-0036 follow-up work.
- **Validation.** format:check, lint (zero warnings), typecheck, unit suites
  (API 79, UI 26, frontend-core 14, Admin 2, workforce 81), production
  build, PWA artifact gate (main gzip 131,673 B vs 143,500 B budget), full
  mocked `test:frontend:e2e` **177/177** (chromium + visual + pwa + push +
  legacy-ios WebKit); login visual baseline `workforce-login-360.png`
  regenerated delete-first and verified across two consecutive deterministic
  runs (other 46 baselines byte-stable); Gitleaks v8.24.3 directory scan
  clean; `git diff --check` clean. Database-backed suites not rerun
  (frontend-only change set; documented precedent). Temporary verification
  spec removed before commit; no containers started beyond the Gitleaks
  scan image.

Next action: review/commit the branch and run hosted CI; animated password
placeholder and possible shared auth-layout extraction are follow-ups;
Phase 13 staging deployment remains intentionally `in_progress`.

### Admin web premium polish — 3 September 2026

Branch `feat/admin-web-polish`. Implemented ADR-0035 while leaving Phase 13
`in_progress`: frontend-only polish over the ADR-0034 redesign, judged PASS
after one FAIL→fix iteration. CARE domain, wire enums, Bahasa Indonesia,
PRD §11.5 IA, and all contracts preserved; `packages/ui` untouched.

- **Tokens/components/CSS (`apps/web-admin/src/styles.css`, +~450 lines).**
  `admin-*` tokens (ink/line/canvas/brand/ring, elev-1/2/3), global
  focus-visible ring, thin scrollbars, card hierarchy (hero/subtle/lift),
  tabular numerals, skeleton shimmer + illustrated empty, gradient sidebar
  pill + topbar live-dot/CA plate, sticky thead, blurred sticky action bar,
  count pill, feed/timeline, dialog scoping, split-panel login, compact
  filter variant, stacked remediation split, reduced-motion fallbacks. New
  local `AdminSkeleton` + `AdminEmpty` primitives.
- **Table-bleed elimination.** Grid-blowout guard, reduced table minimums
  (34rem cards / 30rem half-width + wrapping headers + compact density),
  explicit inner scroll containers, stretched-badge fix, remediation queue
  full-width stacked, `overflow-x: clip` safety net. No page h-scroll at
  1280/1440; all tables fit fully (verified on fresh 1440px captures).
- **Per-page.** Hero/lift/subtle assignment, skeleton/empty coverage,
  status pills, audit truncation tooltips, union connectors, archive Dialog
  replacing `window.confirm`, muted sidebar footer, 26px page titles.
- **Judge.** Round 1 FAIL (15 items incl. table bleed) → fixed; Round 2
  PASS with 4 applied nits; 4 declined as contract-mandated (no fabricated
  metadata/operational checks, responsive filter wrap kept, fold crop is
  normal page scroll).
- **Validation.** typecheck, ESLint zero-warning, Prettier, production
  build, Admin unit 2/2, `pnpm test:frontend:e2e` 177/177 (incl. 9/9 visual
  baselines over two deterministic runs, WCAG 2.1 AA + no-overflow
  1280/1440). Not rerun (frontend-only, no API/schema/contract touch):
  integration/security/performance/fullstack/deployment gates — covered by
  the ADR-0034 baseline on the parent branch. No containers started.
- **Docs.** New `docs/adr/0035-admin-web-premium-polish.md`; PRD unchanged.

Next action: review/commit the branch and run hosted CI; Phase 13 staging
deployment remains intentionally `in_progress`.

### Admin web premium redesign — 3 September 2026

Branch `feat/admin-web-redesign`. Implemented ADR-0034 while leaving Phase 13
`in_progress`: all nine Admin pages plus every sub-surface now follow the
premium language of the seven design targets (layout and style only; CARE
domain, wire enums, Bahasa Indonesia, and PRD §11.5 IA preserved).

- **Frontend (`apps/web-admin`).** New shared components (`AdminPageHeader`,
  `AdminKpi`, `AdminFilterBar`, `AdminStepper`, `AdminSegmentBar`) and a
  premium `admin-*` CSS system (sidebar/topbar/canvas, cards, KPI strips,
  filter bars, tables, pills, stepper, priority rows, route nodes, union
  tree); `packages/ui` untouched so the workforce app is byte-identical.
  Overview (KPI strip + health + data-derived priorities + import table +
  route nodes), Import (stepper + dropzone/summary + tabbed preview +
  sticky footer + history + snapshot), Remediation (route-mode card + 2×2
  stats + category table/drawer + queue + No-Reg drawer), Union (tree +
  replace dialog), Accounts (filter bar + table + drawer + reset/status
  dialogs), Voice Explorer (8-filter bar + table + read-only drawer),
  Audit (filter card + CSV + table + drawer), System/Account/auth polish.
- **Backend (additive, no migration).** `GET /api/v1/admin/overview` gains
  `voices` counts, `latestImport.summary`, and `failedAudits`; OpenAPI and
  `@care/contracts` regenerated deterministically (verified byte-identical
  across two runs).
- **Tests.** Mock overview fixture extended; `design.visual.spec.ts` shell
  anchor updated; full-stack spec updated for renamed affordances
  (`Preview`→`Validasi data`, Action select URL filter, union substring
  titles). New `admin-pages.visual.spec.ts` with nine 1440px per-page
  baselines (delete-first regen, two consecutive deterministic runs).
- **Validation.** Frozen install, Prisma generate, audit (3 Moderate, zero
  High/Critical), format, lint, typecheck, unit (API 79, UI 26,
  frontend-core 14, Admin 2, workforce 81), `openapi:check` drift-free,
  `migrations:destructive-check`, production build, PWA compat, integration
  56/56, security 14/14, 50k/10k performance + reconciliation, mocked e2e
  177/177, visual project 47/47 over two runs, a11y 21/21 at 1280/1440,
  fullstack 3/3, deployment validation + harness, security-exceptions audit,
  Gitleaks clean, `git diff --check` clean. Docker stack stopped after
  validation (`db:down`).
- **Docs.** New `docs/adr/0034-admin-web-premium-redesign.md`; PRD unchanged
  (no product-scope change).

Next action: review/commit the branch and run hosted CI; Phase 13 staging
deployment remains intentionally `in_progress`.

### Manager-to-Manager General Voice handover — 2 September 2026

Branch `feat/manager-handoff`. Implemented ADR-0033/PRD §41 end to end while
leaving Phase 13 `in_progress`: current route-owning Managers can transfer an
unassigned General Voice only while `OPEN`; status remains `OPEN`; repeat
A→B→C transfers update operational category/route owner while immutable
submission classification remains traceable.

- **Persistence/API.** Additive `currentCategory*` Voice fields with migration
  backfill; append-only `VoiceHandover` sequence ledger with category,
  organization, route, PIC, route-mode, actor, reporter-route flag, timestamp,
  and required private detail snapshots. Added `HANDOVER_COMPLETED`,
  `HANDOVER_RECEIVED`, server-computed `HANDOVER`, options/create/history/mine
  endpoints, generated OpenAPI/contracts, workforce wrapper/cache keys, and
  stable recovery errors. Options omit self-PIC categories, omit archives, and
  keep active route gaps visible disabled.
- **Authorization/privacy.** Every note is redacted independently unless the
  caller is that transfer's source/destination PIC. Former PICs without Voice
  access receive only their transfer rows plus minimal Voice identifier;
  CARE Admin and normal readers receive sanitized metadata. Notes are absent
  from timeline payloads, audit summaries (redaction marker only),
  notifications/outbox, work-item/detail DTOs, and logs. Only the new PIC is
  notified.
- **Correctness.** Handover locks and rechecks the Voice, lifecycle, owner,
  assignment, expected version, current category configuration, organization
  route, singular active PIC, archive state, and self-destination in one
  transaction. Ask/Proceed/Assign now share row-lock/version revalidation, and
  Assign uses the established idempotency record mechanism, preventing paired
  lifecycle mutations from both succeeding.
- **Workforce UX.** Parent action layout now has stable secondary and decision
  rows with outline Handover next to filled Proses. The dedicated handover page
  reuses exact `VoiceHero`, shows current route, searchable semantic-radio
  category cards, explicit Department Reporter badge, disabled route gaps,
  selected/focus states, required 4,000-character note with privacy lock,
  sticky safe-area actions, confirmation dialog, and stale recovery that
  preserves the note. `Handover Saya` defaults off, does not alter workload
  counts, and opens a restricted history surface. Normal current PIC detail
  shows only transfer records involving that PIC. Design showcase includes
  default/hover/focus/selected/disabled/loading/empty/error specimens.
- **Responsive/accessibility.** 360px full-width single column, 768px bounded
  reading column, desktop two-column options/note layout, keyboard-native radio
  selection, focus restoration, text+icon status communication, reduced-motion
  fallback, safe-area clearance, and no nested main landmark.
- **Validation.** Frozen install, Prisma generation, fresh migration and both
  previous-schema upgrade paths, migration safety, deterministic OpenAPI and
  generated contracts, Prettier, ESLint, TypeScript, production build, and PWA
  compatibility passed. Unit suites passed: API 79, UI 26, frontend-core 14,
  Admin 2, workforce 81. PostgreSQL integration passed 56/56 and security
  passed 14/14. The 10,000-account/50,000-Voice performance profile and storage
  reconciliation passed. The complete mocked/a11y/visual/PWA/push/legacy
  Playwright suite passed 168/168, including handover baselines at 360/768/1440.
  Deployment/runtime validation, deployment harness, security-exception audit,
  dependency audit (zero High/Critical; one Moderate), Gitleaks, Trivy
  filesystem plus five runtime-image scans, Actionlint, ShellCheck, Hadolint,
  inference Compose/Python, Bash syntax, and
  `git diff --check` passed. After explicit approval to stop the unrelated
  OrbStack container that owned CARE's fixed port, the fresh-database
  DB-backed Playwright suite also passed 3/3 (Workforce, Admin, and API
  readiness/proxy). Phase 13 hosted staging status remains unchanged.

### Inference provider timeout increased to 60 seconds — 2 September 2026

The env-only `OPENAI_TIMEOUT_MS` contract now defaults to and is capped at
60,000 ms per provider attempt. API runtime validation, generated local setup,
deployment environment rendering, remote Compose fallback, and all committed
environment examples use the same value. The existing single retry remains
limited to transient failures, so two exhausted attempts can take approximately
120 seconds before Manual Fallback; this tradeoff is explicit in PRD §13.5 and
ADR-0028. A config unit test locks the new default and rejects values above the
ceiling. Phase 13 remains `in_progress`; a future hosted deployment is required
before the running staging release inherits the new default. Validation passed:
frozen install, Prisma generation, dependency audit (one existing Moderate;
zero High/Critical), format, ESLint, TypeScript, all 188 unit tests, deterministic
mock Chat Completions classification/location smoke, OpenAPI drift, production
build/PWA compatibility, migration safety and previous-to-current upgrade, 52
PostgreSQL integration tests, 8 security tests, the 10,000-account/50,000-Voice
performance profile, reconciliation, 162 mocked/accessibility/visual/PWA/push/
legacy browser tests, and 3 full-stack tests. Runtime/Compose validation,
deployment harness (including an explicit rendered-timeout assertion),
Actionlint, ShellCheck, all Dockerfiles through Hadolint, inference/Python/Bash/
bootstrap validation, production-stack routing/non-root/persistence checks,
Gitleaks, Trivy filesystem plus all five runtime images, and `git diff --check`
also passed. The deployment harness retained its expected macOS note that real
`flock` contention remains a Linux gate. The ignored local `.env.local` timeout
was updated from 10,000 to 60,000 ms without reading or changing its secrets.

### Closure review window & auto-acceptance — 2 September 2026

Branch `feat/close-voice-2-days` (from `staging`). Full-stack change set
implementing ADR-0032 with the product owner's locked decisions: the four
`VoiceStatus` values stay; the review outcome lives as
`ClosureReviewState` (PENDING/ACCEPTED/REJECTED) on `ClosureCycle` and is
displayed as a derived label ("Menunggu Penilaian" / "Diterima" / "Dibuka
Kembali"); a 2-day window (`CLOSURE_REVIEW_DAYS`, default 2) opens on close;
expiry auto-accepts via a state-guarded, idempotent worker that notifies the
reporter and the closing PIC; a late rating after auto-acceptance stays
possible once, feedback-only, without reopen; a low rating without reopen is
final; reopen rides atomically on a rating inside the window only.

- **`apps/api`.** Additive migration (backfill deterministic: REJECTED for
  reopened cycles, ACCEPTED for rated/expired ones, deadline = closedAt + 2
  days); `close()` stamps the window and mentions it in the closure
  notification; `rate()` enforces one-rating-per-cycle (kills the legacy
  double-rate affordance), evaluates reopen eligibility from the deadline at
  rating time (worker-lag-proof), records late ratings without touching
  `reviewResolvedAt`, and rejects late reopen with `REOPEN_NOT_ALLOWED`;
  `ClosureReviewService` (30s interval, `OUTBOX_ENABLED` gate) flips expired
  pending cycles, appends the system `AUTO_ACCEPTED` event (attributed to the
  closing PIC's snapshot with `payload.system: true`; UI shows no actor), and
  sends both notifications through the transactional outbox; serializers
  expose cycle review fields, list items gain `closureReviewState`/`Deadline`,
  and `MemberDashboard` gains `closedPendingReview`; OpenAPI + generated
  client regenerated drift-free.
- **`apps/web-voice`.** Review-aware status labels/dots across hero and cards
  (`voiceStatusDisplay`, `statusFlagTone`), `formatRemaining` countdown,
  two-variant rating card (deadline notice vs auto-accept notice; reopen
  toggle hidden on the auto-accepted variant and never rendered as a
  standalone action), closure-section review badges, and the Member Home
  "Menunggu penilaian Anda" attention card from `closedPendingReview`.
- **Tests.** API unit (actions/domain/config), web unit (formatters), and a
  new 6-case PostgreSQL integration suite (`closure-review.integration.test.ts`)
  cover the window, accept, reject+reopen, window-closed reopen refusal,
  worker auto-accept (idempotent, event + 2 notifications), late rating, and
  the fresh cycle after re-close. e2e: stateful rate mock + four new member
  journeys + closed-detail axe/no-overflow; visual baselines
  `workforce-detail-closed-360.png` (regenerated delete-first) and
  `workforce-detail-closed-auto-accepted-360.png` (new) verified in two
  consecutive deterministic runs and passed the visual judge.

Validation (all green): frozen install, `format:check`, `lint`, `typecheck`,
unit suites UI 26 / workforce 74 / Admin 2 / frontend-core 14 / API 71,
integration 52, `openapi:check` (drift-free), `migrations:destructive-check`,
full default Playwright suite (162 passed) plus visual project (35 passed),
and `git diff --check`.

Next action: open the PR to `staging`, watch hosted CI, then continue
Phase 13.

### Voice detail + dedicated chat page redesign — 1 September 2026

Branch `feat/voice-detail-chat-redesign` (from `staging`). Frontend-only change
set implementing ADR-0031 with the product owner's locked decisions: the
chatroom is a dedicated page at `/voices/:id/chat`; the shared topbar is
suppressed only on the detail and chat routes (scoped supersession of ADR-0023);
all audiences are restyled while the Union consent plates and their anchor
phrases stay verbatim; the bottom dock is untouched.

- **`packages/ui`.** `RatingInput` fills stars cumulatively left→right in the
  brand blue for the selected count with hover/keyboard preview (`data-filled`
  attributes; no `:has()`); radio semantics and the accessible label are
  unchanged. The read-only variant follows the same cumulative tone. Component
  unit test asserts the cumulative fill count and the preview behavior.
- **`apps/web-voice`.** New `VoiceHero` (full/compact/union/closed variants —
  band with circular back control, CARE + display id lockup, waveform status
  pill, overlapping white card with chips, Area/PIC split, location row, union
  consent plates, closed check plate), `LinkCard`, and the shared
  `useConversation` hook (one query key for the detail summary card and the
  page). `ConversationPanel` is deleted; `ConversationPage` renders the compact
  hero, day-grouped log with Jakarta day dividers, privacy-first sender labels
  (`sender.alias` first), solid-blue outgoing / neutral incoming bubbles with
  avatar and timestamps, a composer pinned above the dock (attach, pill input,
  circular send, autofocus per PRD §16), and a READ_ONLY notice. UNAVAILABLE
  redirects to the detail page. `VoiceDetailPage` is restructured: action row
  under the hero card (outline actions in the brand-blue accent, ASK success
  navigates to the chat page), "Detail Voice" body with icon meta rows, link
  cards for Percakapan/Timeline, attachments, rating/closure/union cards
  restyled with all anchors intact.
- **CSS.** Hero band full-bleed via the existing content padding tiers, legacy
  iOS 11.3-safe (no `:has()`; fallback declarations), composer offset matches
  the dock clearance plus safe area, doubled-scope selector beats the late
  tinted-field layer, workforce-only `resize: none` for textareas.
- **e2e.** Mock API gains a stateful `POST /voices/{id}/messages` handler and
  `categoryNameSnapshot` on the detail fixture. Journeys gain a dedicated chat
  journey; member-voice, legacy (iOS 11.3), a11y (chat page axe + overflow at
  360/768/1440), and security (anonymous chat never leaks identity; alias
  required in body) specs updated. Seven visual baselines regenerated
  delete-first and verified in two consecutive deterministic runs.

Validation (all green): frozen install, `format:check`, `lint`, `typecheck`,
unit suites UI 26 / workforce 68 / Admin 2 / frontend-core 14 / API 70,
`NODE_ENV=production pnpm build`, `pwa:compat-check`, `openapi:check` without
drift, `migrations:destructive-check`, `docker compose config --quiet`,
`pnpm audit --audit-level high` (one Moderate, below threshold), the full
default Playwright suite (chromium + visual + pwa + push + legacy-ios,
156 passed), Gitleaks v8.24.3 directory scan clean, `git diff --check` clean.
Database-backed suites were skipped per the documented frontend-only precedent
(no API/schema/contract surface touched). A two-round judge review against the
two reference mockups (360px renders, including an interaction capture of the
cumulative star fill) passed after fixing hero id truncation, composer
clearance, the incoming avatar plate, the composer focus ring, chip separators,
and the outline-action accent; the round-2 verdict was pass on all four pages.

Next action: open the PR to `staging`, watch hosted CI, then continue Phase 13.

### Classification prompt v1.4 enrichment — 1 September 2026

Branch `feat/classification-prompt-enrichment`. The code-owned classification
system prompt advances from `care-classification-v1.3` to
`care-classification-v1.4` (ADR-0030); the location prompt remains
`care-location-v1.2` and is untouched:

- **`apps/api/src/ai/prompt.ts`.** `CLASSIFICATION_SYSTEM_PROMPT` now states the
  Voice kinds (laporan, keluhan, ide, informasi, apresiasi), expands injection
  defense (categoryContext treated as untrusted data; system instructions must
  not be quoted or revealed), adds dominant-primary category selection with a
  lower-confidence tie-break and a tool-enum membership rule, and gives
  illustrative boundary guidance between shared-facility sufficiency/service/
  rules, physical technical repair, environmental exposure, personal-safety
  risk, work-process obstruction, and welfare topics — with the catalog
  Definition remaining authoritative, including for Admin-added categories. The
  severity rubric embeds the full PRD §13.4 meanings and per-level Indonesian
  examples plus the highest-supported-fact rule; all eight rationale codes
  gained one-line definitions; confidence calibration now names the server
  fallback threshold (default ~0.75). All previously locked anchor phrases
  remain verbatim. `DEFAULT_CATEGORY_CONTEXT` (smoke-test fallback only) is
  synchronized with the seeded catalog: full Indonesian definitions and the
  complete ordered example sets (4/4/8/4/6/5) per category, shape and
  `seed-*` revision ids unchanged. `classificationSchema` and the location
  prompt/schema are unchanged.
- **`apps/api/test/unit/domain.test.ts`.** Version assertion bumped to v1.4;
  new anchors lock the dominant-primary rule, the severity rubric rule, the
  fallback-threshold calibration sentence, and representative enriched example
  strings from the synchronized fallback context.
- **Docs.** PRD §13.1 gains a bullet describing the code-owned prompt scope and
  the version-bump rule, and §13.4 notes the rubric-with-examples is embedded
  in the prompt. New `docs/adr/0030-classification-prompt-v14-enrichment.md`.
  `.zcode/` (ZCode client local state) is now git- and prettier-ignored.

Validation (all green): frozen install, `db:generate`, `format:check`, `lint`,
`typecheck`, unit suites API 70 / UI 25 / frontend-core 14 / workforce 68 /
Admin 2, `NODE_ENV=production pnpm build`, `openapi:check` without drift,
`migrations:destructive-check`; Docker test database `db:up/wait/verify/
test:reset/test:migrate`, PostgreSQL integration **46 passed**, security
**8 passed**, `db:down`; `docker compose config --quiet`; Gitleaks v8.24.3
directory scan clean; `git diff --check` clean. Performance, e2e, and
deployment suites were not rerun because the change set contains no frontend,
schema, contract, or deployment surface; the shared prompt module is API
runtime code, so the database-backed integration/security suites were run.
All containers were stopped after validation.

Next action: open the PR to `staging`, watch hosted CI, and continue the
outstanding Phase 13 exact-SHA hosted acceptance and rollback rehearsal.

### PR #22 dynamic-category CI remediation — 1 September 2026

The first PR #22 CI run failed for two implementation-specific reasons. The previous-SHA gate treated `ALTER COLUMN ... DROP NOT NULL` as a forbidden one-step migration, and integration fixtures still wrote the removed Prisma `category` property or expected the retired global-PIC workflow. The migration is now fully additive: `ImportIssue.batchId` remains required, and category reconciliation associates new category issues with the latest authoritative import batch. Voice lifecycle and performance fixtures write `categoryKey`; organization routing seeds explicit category configuration and validates related-department routing; dashboard fixtures seed the revision name used by `{key,name,label,value}` category buckets.

OrbStack was started and the exact missing evidence was reproduced locally. Fresh migration applied all six migrations; the exact PR base SHA `69d5a36549d2c074b385a7d98377e18995512b1e` migrated through its five migrations and then current successfully, with `prisma migrate status` reporting up to date. Integration passed 46/46, security 8/8, the 50,000-Voice/10,000-account performance seed and test passed, full-stack Playwright passed 3/3, and maintenance reconciliation reported no storage inconsistency. Format, lint, typecheck, unit, destructive migration check against `staging`, and whitespace also passed.

### Dynamic General Voice category catalog — 1 September 2026

General Voice no longer depends on the four-value application enum for new writes. A revisioned database catalog now seeds Safety, Environment, Fasilitas Umum, Facility Repair, Fasilitas Kerja / Kesulitan Kerja, and Kesejahteraan with the approved Indonesian Definition and ordered Examples. Legacy `FACILITY` data is backfilled to the Fasilitas Umum stable key/name snapshot. Category content and routes have independent effective history; Voice and classification snapshot the category/revision used, while submission resolves the currently effective department route and PIC without moving older Voice.

The three GA/SHE categories and Facility Repair use exact fixed composite organization targets; Work Difficulty and Welfare follow the reporter department. Missing exact targets or PICs create category remediation issues. Global-special mappings are ended for new Voice and old global-PIC issues are superseded, while legacy rows remain readable for rollback. Department 14 remains Private-only.

The AI prompt is version 1.3. Core instructions, injection defense, severity rubric, function wrapper, and output contract remain code-owned. Active Definition/Examples are appended as structured category context and the tool enum is generated from active stable keys; Private always uses `category=null`. Workforce fallback, labels, filters, charts, cards, and detail consume dynamic keys/names. Admin Remediation & Route now includes category create/edit/archive/reactivate, ordered Examples, route mode, server-side organization search and exact division filtering, derived PIC/No. Reg and health, optimistic concurrency, idempotency, audit, and revision history.

OpenAPI and generated contracts, integration fixtures, performance/Admin seeds, PRD, implementation phases, and ADR-0029 were updated. Local Docker-dependent validation could not start because the configured OrbStack Docker socket was unavailable; no container was started and there is nothing to clean up. Phase 13 is therefore reset to pending until migration, integration, security, performance, and full-stack parity is completed.

Static/local evidence for this candidate: `pnpm db:generate`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` (API 70, UI 25, frontend-core 14, Admin 2, workforce 68), `pnpm migrations:destructive-check`, deterministic OpenAPI regeneration checksums, `pnpm build`, `pnpm pwa:compat-check`, `pnpm test:frontend:e2e` (151 passed), `pnpm deployment:validate`, `pnpm test:deployment`, `pnpm security:exceptions:check`, `pnpm security:audit`, and `git diff --check` passed. `pnpm audit --audit-level high` reported one Moderate and no High/Critical failure. The deployment harness retained its expected macOS note that real `flock` contention remains a Linux gate and its advisory live-provider smoke used Manual Fallback.

The earlier Docker blocker below is superseded by the PR #22 remediation evidence above; OrbStack became available and the database-dependent suites were completed.

### Hosted Granite provider diagnosis — 1 September 2026

Authenticated workforce General Voice and Admin connection probes reproduced
`PROVIDER_ERROR`/`MANUAL_FALLBACK` on release `5d742f3`. Tunnel counters showed
the requests reaching the inference origin without tunnel errors, while SGLang
received no corresponding Chat Completions request. The staging
`OPENAI_API_KEY` was therefore resynchronized from the mode-`0600` inference
environment without printing it. A direct public invocation through the exact
CARE adapter and the host credential returned valid AI classification and
location results. Provider latency varied beyond ten seconds, so the env-only
`OPENAI_TIMEOUT_MS` default and all committed environment examples are now
30,000 ms, matching the Granite validation contract.

### Caddy Critical vulnerability remediation — 1 September 2026

PR #21 initially failed only its production-container Trivy gate: the custom
Caddy binary embedded `golang.org/x/crypto v0.53.0`, which the refreshed Trivy
database identifies as fixed-version `CVE-2026-56854` Critical. Both CARE Caddy
and the standalone inference gateway now build Caddy 2.11.4 with
`x/crypto v0.55.0`, its compatible `x/net v0.57.0` and `x/text v0.41.0`, and
gRPC 1.82.1. The inference gateway also moved from the stale Alpine runtime to
the pinned non-root distroless runtime. Trivy 0.70.0 reports zero High/Critical
OS and Go-binary findings for both rebuilt images; no scanner exception was
added. GitHub Advanced Security also identified the Admin API-key value flowing
through an unkeyed SHA-256 idempotency fingerprint. That fingerprint now uses
scrypt with the independent AI configuration encryption key as its private salt, retaining
same-request replay and different-key conflict semantics without persisting the
credential.

The patched gateway was rebuilt in place on `dx-2` without restarting the
SGLang model. The resulting container runs as `65532:65532`, its authenticated
binary healthcheck is healthy, the model container remains healthy, local and
public authenticated model-list requests return `200`, and public
unauthenticated access remains `401`.

### Local Granite inference and Admin AI configuration — 1 September 2026

Branch `feat/local-inference`. A standalone `/inference` Compose stack now
serves `ibm-granite/granite-4.2-3b` through SGLang 0.5.18 on `dx-2`. The model
uses BF16, TP=1, a 32,768-token context, 0.8 static memory fraction, automatic
reasoning/tool parsers, default CUDA graphs/Radix cache, and no quantization.
CARE Granite requests cap output at 4,096 new tokens and explicitly keep full
thinking enabled with `low_effort=false` when reasoning effort is blank.

- SGLang has no published host port. A rootless, read-only Caddy gateway with
  all capabilities dropped publishes only `127.0.0.1:30000`, validates one
  Bearer key, and has no rate limiter or request/access logging. The NVIDIA
  model image remains root as a documented CUDA/cache compatibility exception.
- The old LFM2.5 experiment is backed up recoverably at
  `/home/pcsistem/GitHub/CARE/backups/inference-20260901T012318Z`;
  `care-llm-gate.service` is stopped/disabled, and the Hugging Face cache was
  retained. The new stack is healthy; Compose updates remain manual, while
  enabled `care-inference.service` runs `docker compose up -d` at every boot.
- Docker and `cloudflared.service` are enabled at boot. Both inference
  containers use `restart: unless-stopped`, and the installed cloudflared
  systemd drop-in uses `Restart=always` with `RestartSec=5s` and no repeated-
  failure start limit. This was verified without reboot: all three units were
  enabled/active, both containers healthy,
  local/public authenticated model checks returned `200`, and public
  unauthenticated access returned `401`.
- Existing Cloudflare tunnel `pad-local-inference-provider`
  (`9c0cee75-da3c-44d6-ba10-d9d8f20331af`) now has exactly one published
  application route, `inference.qd-tmmin.site` to
  `http://localhost:30000`; Cloudflare created the proxied CNAME. Public TLS
  and unauthenticated `401` are verified.
- The GitHub `staging` environment now carries the matching Granite base URL,
  model, and inference Bearer credential. Its provider-default reasoning
  variable is intentionally absent, and a distinct 32-byte Base64URL
  `OPENAI_CONFIG_ENCRYPTION_KEY` is provisioned. Secret values were piped
  directly to GitHub CLI and were not printed or stored in tracked files.
- First model initialization took 1,245.69 seconds including download and CUDA
  graph preparation. Warm direct smoke returned one valid classification tool
  call in 41,846 ms and location call in 20,751 ms with parsed reasoning
  present but never printed; subsequent CARE-through-tunnel validation was
  17,960 ms and 5,406 ms under the 30-second timeout. GPU usage was 14,628 MiB.
- A singleton Admin override stores base URL, model, confidence, reasoning,
  optimistic version, actor/time, and AES-256-GCM API-key ciphertext/IV/tag.
  The key is write-only, blank updates preserve it, tampering/missing
  encryption configuration fails closed, changes apply on the next request,
  and DELETE restores environment fallback. GET/readiness/audit remain
  redacted. System Status exposes typed test/save/reset flows with accessible
  dialogs and conflict/error states.
- The Chat Completions adapter resolves effective config per invocation.
  DeepSeek `none` sends `thinking.disabled`; enabled levels map to low/high/max.
  DeepSeek thinking supports tools but rejects named `tool_choice`, so CARE
  omits that field only for enabled DeepSeek thinking while retaining one-tool
  input and exact name/count/JSON/Zod fail-closed validation. Granite keeps
  named forcing and Granite-only sampling/template fields.
- Secure `.env.local` matrix passed and restored to DeepSeek `none`: Granite
  blank/full-thinking classification+location; DeepSeek v4 Flash `none`; and
  DeepSeek v4 Flash `high`. API keys and reasoning content were never emitted.

Decision record: ADR-0028. Phase 13 remains `in_progress`; this work does not
claim the outstanding hosted CARE exact-SHA, acceptance-data, or rollback
evidence.

Validation: frozen install/generate, format, ESLint, TypeScript, 176 recursive
unit tests (API 67, UI 25, frontend-core 14, workforce 68, Admin 2), production
build/PWA compatibility, deterministic OpenAPI regeneration, PostgreSQL
integration 46, security 8, 50,000-Voice performance, reconciliation,
migration upgrade, full-stack 3, mocked/accessibility/visual/browser 151,
deployment harness/runtime validation, migration safety, Actionlint,
ShellCheck, all Dockerfiles through Hadolint, Compose/Python syntax, Gitleaks,
Trivy filesystem vulnerability/secret/misconfiguration scan, and
`git diff --check` passed. `pnpm audit --audit-level high` passed with the one
existing Moderate advisory. Linux-only real `flock` contention and runtime
CARE image Trivy gates remain hosted CI evidence, not local macOS claims.

### Workforce in-page attachment viewer (lightbox) — 31 Agustus 2026

Branch `fix/image-view-load`. Setiap thumbnail lampiran gambar pada aplikasi
workforce sebelumnya berupa anchor `target="_blank"` menuju URL API mentah
`/api/v1/media/{id}`: membuka gambar menavigasi tab baru tanpa konteks Voice,
dan kegagalan otorisasi menampilkan envelope JSON mentah. Kini viewing tetap
di halaman; endpoint media, authorization, OpenAPI, dan DTO tidak berubah —
`<img>` tetap memuat bytes lewat session cookie same-origin yang sama
(ADR-0027):

- **Primitif `Lightbox` baru di `packages/ui`.** Dibangun di atas Radix
  dialog primitives yang sama dengan `Dialog` (focus trap, Escape, scroll
  lock, portal) dengan pola save/restore focus yang identik. API terkontrol
  `{ open, onOpenChange, images, index, onIndexChange }` — host gallery
  memiliki state, sehingga klik, keyboard (ArrowLeft/ArrowRight), swipe
  horizontal (axis-lock 10 px, threshold 48 px, edge resistance), dan
  lompatan thumbnail semua melalui satu callback. Chrome: pill "Kembali"
  berlabel + counter `aria-live` ("2 / 3"), tombol prev/next 44 px yang
  disabled di ujung, strip thumbnail (`aria-current`) untuk lebih dari satu
  gambar, loading spinner, dan error state dengan "Coba lagi" (cache-bust
  query). Title deskripsi sr-only "Gambar n dari total" membawa nama
  aksesibel dialog. Terdaftar di coverage, di-specimen-kan di `/design`
  (gambar SVG data-URI), dan diuji unit jsdom + axe (UI 24).
- **Keputusan kontras yang dikunci.** Stage chrome sengaja opaque
  (gradien radial gelap halus), bukan scrim translusen: axe `color-contrast`
  mengomposit layer transparan dengan konten halaman di belakangnya sehingga
  hasilnya tak terdeterminksi; opaque membuat kontras deterministik.
  backdrop-filter dihapus dari chrome final sehingga tidak ada fitur visual
  yang bergantung dukungan prefixed di legacy WebKit; swipe memakai touch
  events dasar tanpa PointerEvent/ResizeObserver.
- **`MediaGallery` (semua permukaan: lampiran Voice, bukti penutupan
  featured + siklus lama, gambar chat, shelf bukti responder, preview
  draft).** Anchor menjadi `<button>` (kelas CSS element-agnostic + reset
  button + hover zoom halus), state viewer lokal per gallery, label thumb
  "Lihat gambar n dari total". Thumb composer Create Voice (`MediaInput`)
  ikut membuka viewer; tombol hapus (halo 44 px) tidak tersentuh.
- **Test.** Kontrak in-page dikunci source-assertion di
  `foundation.test.ts` (tanpa `target="_blank"`/anchor media).
  `mockWorkforceApi` menerima opsi `mediaBody` (default tetap PNG_1x1)
  dengan sampel PNG dua-tone deterministik `PNG_MEDIA_SAMPLE` untuk
  baseline. Journey baru: buka dari thumb → counter → prev/next button +
  arrow key → back menutup dengan focus restore → Escape; spec a11y baru:
  axe bersih dengan viewer terbuka, tanpa overflow 360 px, kontrol ≥44 px.
  Baseline baru `workforce-lightbox-360`; seluruh baseline lama
  byte-identical (DOM/CSS box thumbnail tidak berubah).
- **Perbaikan reveal gambar di iOS Safari (perangkat nyata: "loading lalu
  blank").** Laporan perangkat menunjukkan loader hilang (state `ready`) tetapi
  stage kosong. Tiga pengerasan: (1) gambar tidak lagi di-reveal lewat
  transisi `opacity` — mentransisi foto besar yang baru didekode di dalam
  overlay fixed yang sedang beranimasi bisa meninggalkan layer terkomposit
  pada opacity awal (blank permanen di iOS) — reveal kini cukup unmount
  loader; (2) `load` tidak lagi satu-satunya sinyal: siap dibatalkan lewat
  `img.decode()`, dan ref callback menyelesaikan gambar yang `complete`
  sinkron tanpa event (WebKit bisa menyelesaikan memory-cache tanpa
  dispatch `load`/`error` karena src dipasang sebelum elemen disisipkan);
  (3) frame stage kini absolute dengan inset definitif sehingga persentase
  `max-width`/`max-height` gambar selalu terukur terhadap kotak definitif.
  Regresi dikunci: unit jsdom mensimulasikan cache-hit tanpa event, dan spec
  legacy-ios (engine WebKit, viewport ponsel) memastikan gambar `ready`,
  opacity 1, dan terkandung dalam stage. Baseline visual tetap
  byte-identical.

Validasi (semua hijau): `pnpm format:check`; `pnpm lint`; `pnpm typecheck`;
unit API 60, UI 25, frontend-core 14, workforce 68, Admin 2; `pnpm build`
(NODE_ENV=production); `pnpm pwa:compat-check` (main gzip 125649 bytes
terhadap budget 143500); `pnpm openapi:check` tanpa drift;
`migrations:destructive-check`; `docker compose config --quiet`;
`pnpm audit --audit-level high` (nol High/Critical; Moderate transitive
terdokumentasi); Playwright mocked `test:frontend:e2e` **150 passed**
(chromium + visual + pwa + push + legacy-ios WebKit);
Gitleaks v8.24.3 directory scan bersih; `git diff --check` bersih. Suite
berbasis database tidak dijalankan ulang karena change set berisi frontend,
e2e, dan dokumen tanpa sentuhan API, schema, atau kontrak. OrbStack
dihidupkan hanya untuk scan Gitleaks lalu dihentikan; tidak ada
container/proses yang tersisa.

### Workforce iOS legacy capability tiers — 31 Agustus 2026

- Workforce now resolves `unsupported | core-online | pwa | push`. iOS 11.3 is
  the minimum online tier; iOS Web Push requires 16.4+, Home Screen mode, and
  runtime APIs. Android/non-iOS remains capability-driven and has no iOS
  version or Home Screen restriction.
- Vite lowers the app and custom worker to `safari11.3`. A same-origin ES5
  bootstrap runs before the module entry, supplies the five required runtime
  fallbacks, and converts the static loading shell into retry/compatibility
  guidance when mounting fails, preventing an empty-root white screen.
- Workbox is lazy-loaded only after the PWA probe passes. Registration/update
  failure degrades to non-blocking Core Online; legacy mode performs one-time
  best-effort cleanup of CARE/Workbox caches and `/sw.js`. Notification Center
  remains authoritative when Web Push is unavailable.
- Shared Select falls back to native `<select>` without PointerEvent or
  ResizeObserver; media-query listeners and production CSS have legacy
  fallbacks. `/design` is not loaded on legacy iOS.
- Unit tests cover iOS/iPad version parsing, all capability transitions,
  explicit Android support, bootstrap polyfills/failure shell, and existing
  workforce behavior. Artifact inspection and current-WebKit iOS 11.3
  capability emulation are included in CI. Real-device iOS 11.3 is explicitly
  not acceptance evidence. No API, OpenAPI, schema, cookie, payload, or Admin
  behavior changed. See ADR-0026.
- Push opt-in e2e journeys now run with the production service worker active.
  The `push` Playwright project pre-activates `/sw.js` from `/offline.html` so
  the first-registration `controlling` reload cannot abort the opt-in gesture
  mid-flight, and `mockWorkforceApi` routes on the browser context because
  requests re-issued by the worker's NetworkOnly handler bypass page routes.
  Page-level route overrides in other specs keep precedence (page routes are
  consulted first), and SW-blocked projects are unaffected.
- PR #19 hosted CI initially failed two jobs; both root causes were fixed on
  the same branch. `quality`: the job-level `NODE_ENV=test` (required by the
  database suites) leaked into `pnpm build`, so Vite kept the development
  React branches and the artifact gate measured a 184,625-byte chunk against
  the 143,500-byte budget; the build step now runs `NODE_ENV=production pnpm
build`, and both directions were reproduced locally (test build fails the
  gate, production passes at 125,500 bytes). `Production containers and
routing`: the deep-link shell assertion still grepped the bare
  `<div id="root"></div>`; it now asserts the boot-state root in both ci.yml
  and the blocking `deploy/scripts/smoke-check.sh`, which would otherwise
  have failed the staging deploy smoke. Validation for the fix: actionlint,
  ShellCheck, `bash -n`, `pnpm deployment:validate`, and `pnpm
test:deployment` green.
- Final validation (all green): `pnpm format:check`; `pnpm lint`; `pnpm
typecheck`; unit API 60, UI 19, frontend-core 14, workforce 67, Admin 2;
  `pnpm build`; `pnpm pwa:compat-check` (main gzip 125500 bytes against the
  143500-byte budget); Playwright mocked `test:frontend:e2e` **146 passed**
  (chromium + visual + pwa + push + legacy-ios WebKit) verified on two
  consecutive runs; `pnpm audit --audit-level high` (zero High/Critical; the
  documented Moderate transitive remains); `pnpm openapi:check`;
  `pnpm migrations:destructive-check`; `docker compose config --quiet`;
  Gitleaks v8.24.3 directory scan clean; `git diff --check` clean.
  Database-based suites (integration/security/performance/fullstack) were not
  rerun because the change set contains no API, schema, or migration change.
  OrbStack was started only for the Gitleaks scan and stopped afterward.

### Finalized media authorization correction — 31 Agustus 2026

- Root cause: `MediaService.readAuthorized()` admitted only `READY`, while Voice
  submit and Voice close intentionally finalize attachments as `REFERENCED`.
  The parent relation and object remained valid, but the state guard returned
  privacy-preserving `404 NOT_FOUND` before parent authorization was evaluated.
- The readable state set now includes `READY` and `REFERENCED`. `STAGED`,
  `PROCESSED`, `ORPHANED`, missing objects, and actors outside the parent Voice
  scope remain denied. Private Admin media audit behavior is unchanged.
- PostgreSQL regression coverage now closes a Voice, verifies evidence linkage
  as `REFERENCED`, reads the stored object as both reporter and authorized
  Manager, and confirms an unassigned Section Head receives `NOT_FOUND`.
  Security coverage locks rejection of every non-readable processing state.
- No frontend, endpoint, OpenAPI, Prisma schema, or migration change.
- Validation: focused lifecycle regression **9 passed**; full PostgreSQL
  integration **45 passed**; security **8 passed**; unit suites API **60**, UI
  **18**, frontend-core **14**, workforce **48**, Admin **2**; `format:check`,
  `lint`, `typecheck`, `openapi:check`, and `build` green. The OpenAPI output and
  Prisma schema remained unchanged.
- Pre-commit clean-worktree parity: frozen install/Prisma generation, dependency
  audit (one documented Moderate; zero High/Critical), mock DeepSeek smoke,
  destructive-migration and legacy-upgrade checks, performance seed/query,
  maintenance dry-run, Playwright mocked **143** and full-stack **3**, Compose
  validation, Linux deployment harness, Actionlint/ShellCheck/Hadolint, runtime
  container routing/non-root/persistence, Gitleaks, and Trivy filesystem plus
  five runtime images all passed. Live-provider failure injection in the
  deployment harness correctly retained Manual Fallback and did not invoke the
  external provider.

### Create Voice processing dot-matrix orb — 31 Agustus 2026

Branch `feat/ai-orb`. Spinner cincin putus-putus pada kartu processing wizard
Create Voice diganti orb matriks titik yang merespons live ketiga tahap
analisis (Detail diterima, Kategori & severity, Verifikasi lokasi).
Frontend-only; tanpa perubahan API, schema, atau kontrak (ADR-0025):

- **`lib/orb-math.ts` (murni).** Mask lingkaran inscribed atas grid 9×9 (69
  titik), matematika bloom Circle7 (petal lima kelopak `cos(5θ−1.7t)`, ring
  `cos(3.3r−1.2t)`, chord `cos(1.6(x+y)+1.35t)`, petalGate^2.2, blend
  0.68/0.22/0.10) plus settle lift center-out dari `progress`
  (tahap selesai/3) menuju gate opacity. Konstanta terekspos (ukuran grid,
  base/gate opacity, siklus 1600 ms, settle band 1.25) dan diuji unit
  (5 test: jumlah mask, batas opacity, determinisme, monotonik per tahap,
  center lebih cepat terang daripada rim).
- **`components/DotMatrixOrb.tsx`.** Grid span titik + satu loop
  requestAnimationFrame yang menulis `style.opacity` langsung via refs —
  tanpa re-render React per frame; `progress` dibaca lewat ref agar flip
  tahap tidak me-restart loop atau melompatkan fase; `useReducedMotion`
  (motion/react) me-render satu frame statis deterministik (fase saat ini,
  fase 0 saat never-animated) — penting karena `animations: 'disabled'`
  Playwright tidak membekukan rAF; loop dibatalkan saat unmount (jalur
  fallback/error).
- **`ProcessingStep`.** `done/3` dihitung dari flag mutasi yang sama dengan
  checklist (`stages` pada `useDraftWizard`): persist → `Detail diterima`,
  classify dan location review berjalan paralel (`Promise.all`) dan masing-
  masing menaikkan progres saat call-nya selesai. Checklist, `aria-live`,
  heading, hint, dan Alert error tidak berubah; orb `aria-hidden`. Cincin
  putus-putus, keyframes `processing-orbit`, dan ikon tengah dihapus; gaya
  `.processing-card__orb` baru (titik putih 0.5625rem, gap 0.4375rem, glow
  halus); spinner tahap (`processing-spin`) tetap.
- **Test.** Baseline `workforce-create-processing-360.png` dihapus-dahulu-
  lalu-regen; keadaan tertangkap tetap mid-analysis (progress 1/3, rute
  classify/location-review ditahan 1500 ms, reduced motion); determinisme
  diverifikasi dua run visual berturut-turut; tidak ada baseline lain yang
  berubah. Keputusan desain terkunci bersama product owner: grid 9×9 dengan
  mask inscribed 69 titik (lebih bulat daripada 49 titik radius ketat),
  tanpa ikon tengah, tanpa backend baru — progres sudah live dari
  penyelesaian tiap call, sehingga status endpoint polling tidak diperlukan.

Validasi (semua hijau): lockfile tidak berubah; `pnpm format:check`; `pnpm
lint`; `pnpm typecheck`; unit API 60, UI 18, frontend-core 14, workforce 48
(43+5 orb), Admin 2; `pnpm build`; `pnpm openapi:check` tanpa drift;
`migrations:destructive-check`; `pnpm security:audit` (nol High/Critical;
Moderate transitive ExcelJS tetap terdokumentasi); `docker compose config
--quiet`; Playwright mocked `test:frontend:e2e` **143 passed** (chromium +
visual + pwa); Gitleaks v8.24.3 directory scan bersih; `git diff --check`
bersih. Suite berbasis database tidak dijalankan ulang karena change set
murni frontend + baseline e2e + dokumen. OrbStack dihidupkan hanya untuk
scan Gitleaks lalu dihentikan; tidak ada container/proses yang tersisa.

### Workforce manager, leadership, and union redesign — 31 Agustus 2026

Branch `feat/member-page-redesign-imagen` (slice ketiga, melengkapi 25 layar
konsep). Implementasi layar 17–25 dari `.design/member-voice-redesign/`
(ADR-0024). Kali ini API ikut berubah secara aditif — enam field respons
opsional tanpa migrasi:

- **Backend (aditif; tanpa schema/migration).** `DashboardAggregate`:
  `area` + `areaCritical` (groupBy melalui `suppress()`), `previousTotal`
  (window `from/to` digeser mundur selebar durasinya; absent tanpa window);
  `pendingAssignment` untuk scoped MANAGER di `/dashboard/general` (OPEN +
  unassigned dalam snapshot direktorat/divisi); `VoiceListItem`:
  `currentHandlerName` (join display name) dan `reporterAlias` (hanya Union
  pada baris PRIVATE); `AssignmentCandidate.activeCount` (satu groupBy
  workload). OpenAPI + `@care/contracts` diregenerasi; `enrich-openapi.ts`
  diperbarui; integrasi test untuk tiap field (scoping + suppression).
- **Komponen app-level baru (`apps/web-voice`).** `HeroBand` (+`HeroInset`,
  `HeroChip`), `KpiTrio` (`generalKpiItems`/`unionKpiItems`), `DonutChart`
  - legend, `StatusDistribution`, `TrendCard` (y-ticks, sumbu tanggal,
    area gradient, flag nilai ujung, badge delta "+n% vs periode
    sebelumnya"), `InboxVoiceCard` (edge severity, tombol penuh
    `Buka {displayId}`, varian identity alias, chip PIC), `FilterPills`
    (pill Select berikon + funnel IconButton badge → `Dialog mobileSheet`),
    `AttentionCard`. Math murni di `dashboard-math.ts` + unit test. CSS
    seluruhnya di bundle workforce; `packages/ui` tidak berubah (handle
    bottom-sheet digambar via `.care-dialog--mobile-sheet::before`).
- **Halaman.** Manager (17): hero + StatusSummary tetap; filter jadi pill +
  funnel; KPI trio, donut status, trend+delta, kartu severity/kategori,
  breakdown organisasi, preview "Inbox Voice Member" 3 `InboxVoiceCard`;
  `DashboardOverview` dihapus. Inbox operasional (18+22): `HeroBand` statistik
  per peran (termasuk backlog manager dari `pendingAssignment`), search
  "Cari judul atau ID", pill Prioritas/Status (+Area/PIC / Penugasan Union),
  funnel sheet, list `InboxVoiceCard` + Pager. Leadership (20): chip
  "Leadership · Read-only", inset KPI, trend+delta, distribusi status,
  "Area yang perlu perhatian" (dari bucket area baru), catatan privasi.
  Union home (21): inset "Private Voice" (officer: sel ketiga Kritis — tanpa
  affordance penugasan), antrean penugasan head, "Private terbaru" alias-aware,
  baris "General Voice · Read-only" → `/general`. Union general (25): param
  `range` baru (default 30d) untuk dashboard + list, distribusi, "Kategori
  utama", trend, "Perlu perhatian" dari list query (menjaga semantik probe
  keamanan). Union detail (23+24): "ID: {displayId}", meta 3 kolom, plate
  consent di hero (anonim gelap / identified terang + kartu reporter inset);
  sheets Tutup/Tugaskan (19): "Catatan penyelesaian", shelf bukti, lock note,
  kandidat radio card dengan "n Voice aktif". Kontrak mutasi/idempotensi
  tidak berubah.
- **Keputusan product owner (slice ini).** (1) Topbar bersama tetap (band
  render di bawahnya, tanpa orb mockup); (2) keenam field backend aditif
  diambil (termasuk `reporterAlias`); (3) filter pill + funnel sheet; (4)
  branch sama. Deviasi mockup lain tercatat di ADR-0024 (label Indonesia,
  quick-action tiles tetap, rumusan hitung "n Kritis/n Voice", placeholder
  search sesuai kemampuan server, StatusSummary member tidak disentuh).
- **Test.** Baseline dihapus-dahulu-lalu-regen: `workforce-manager-dashboard-1440`,
  `workforce-voice-member-1440`, `workforce-union-private-1440` diganti; 9
  baseline 360 baru (manager home, Voice Member inbox, leadership home, union
  home, union private inbox, union general, union identified detail, close
  sheet, assign sheet). Semua permukaan baru direview 360px terhadap mockup
  (12/12 lolos gate visual) setelah tiga perbaikan: warna teks `.hero-inset`
  di-reset (angka KPI putih-di-putih), sel statistik sempit di-stack agar
  label panjang tidak terpotong, override `.voice-hero__column span` dipindah
  setelah rule dasarnya (urutan cascade). Fixture mock diperkaya (area
  buckets, previousTotal, pendingAssignment, currentHandlerName,
  reporterAlias, activeCount); journey assign Union kini radio card.

Validasi (semua hijau): lockfile tidak berubah; `pnpm format:check`; `pnpm
lint`; `pnpm typecheck`; unit API 60, UI 18, frontend-core 14, workforce 43,
Admin 2; `pnpm build`; `pnpm openapi:generate` dijalankan dua kali hasilnya
byte-identical (CI `openapi:check` lolos pada hasil commit); `pnpm
migrations:destructive-check`; `pnpm audit --audit-level high` (hanya
Moderate transitive terdokumentasi). Berbasis database: `db:up/wait/verify/
test:reset/test:migrate`; `pnpm test:integration` **45 passed**; `pnpm
test:security` **5 passed**; `seed:performance` (50k Voice/10k akun,
`NODE_ENV=test DATABASE_URL=...care_test`) + `pnpm test:performance` lolos;
`maintenance:reconcile` dry-run bersih; `db:down`. Playwright mocked
`test:frontend:e2e` **143 passed** (chromium + visual + pwa) dua run
berturut-turut. Gitleaks v8.24.3 directory scan bersih; `git diff --check`
bersih; `docker compose config --quiet`. OrbStack dihidupkan untuk compose;
tidak ada container/proses yang tersisa.

### Workforce history, voice detail, notifications, and account redesign — 30 Agustus 2026

Branch `feat/member-page-redesign-imagen` (lanjutan slice ADR-0022).
Implementasi layar 12–16 dari `.design/member-voice-redesign/` tanpa
perubahan API, schema, atau kontrak (ADR-0023):

- **Shared UI (aditif; Admin byte-identical).** `DotLabel` (feedback) — titik
  semantik + teks; teks adalah nilai aksesibel. `RatingInput` (forms) — bintang
  1–5 dengan semantik radio "n/5" plus mode read-only untuk rating terkirim.
  `DisclosureRow` (sections) — baris collapsible tanpa dependensi baru
  (`aria-expanded`/`aria-controls` + region berlabel). `Field`/`Input`/
  `Textarea`/`Select` memperoleh prop `hideLabel`; `Select` juga menerima
  `leading` ikon dan `placeholder`. Semua terdaftar di coverage,
  di-specimen-kan di `/design`, dan diuji unit (UI 18).
- **History (12).** Search rounded "Cari ID atau judul" + tiga pill filter
  berikon (Status/Severity/Area) + "Bersihkan" ghost saat filter aktif; kartu
  baru `HistoryVoiceCard` (button penuh `Buka {displayId}`): ID + chip
  visibility, judul, severity|status DotLabel, "Diperbarui {relative}", aksen
  cobalt untuk Voice aktif. `VoiceCard` (home/inbox) tidak berubah.
- **Voice detail (13–14, semua audiens).** Back row in-content ("Kembali",
  fallback root) + displayId; hero cobalt `--gradient-brand-hero` (title
  putih, meta baris visibility/severity/status + area/PIC; varian closed:
  check plate + pill status/severity + "Ditutup {tanggal}"); strip meta
  Diajukan/Diperbarui/Klasifikasi/Kategori/Kelengkapan di kartu Detail;
  `MediaGallery` `variant="row"` untuk lampiran Voice; bubble chat baru
  (avatar incoming, bubble tinted outgoing, waktu `formatNotificationTime` di
  dalam bubble, alias tetap tersedia untuk AT); Timeline collapse default
  ("Timeline · n pembaruan", fetch tetap berjalan); closure: siklus terakhir
  ditampilkan di kartu "Penyelesaian" (note, bukti 2-up, rating read-only,
  badge reopen), siklus lama menjadi baris "Siklus penutupan #n"; rating
  pindah dari ActionPanel ke kartu inline ("Bagaimana hasil tindak lanjutnya?",
  RatingInput, counter 0/2000 sesuai kontrak, toggle "Buka kembali" hanya
  muncul untuk skor 1–2 dan "Kirim penilaian" mengirim rating+reopen atomik);
  `RateDialog` dihapus. Anchor responder/Union ("Tindakan", "Tanya Reporter",
  "Tutup", "Identitas ditampilkan/disembunyikan", alias) tetap.
- **Notifications (15).** Grouping per hari Jakarta: "Hari ini"/"Sebelumnya"
  sebagai kartu putih berisi baris ber-hairline; baris = tile ikon per tipe +
  judul + body + waktu ringkas + dot & "Buka" untuk unread; badge tipe per
  baris dihapus; push settings menjadi DisclosureRow (pill Aktif/Nonaktif)
  dengan body default terbuka sehingga switch/alert/perangkat tetap tanpa tap
  ekstra; "Tandai semua dibaca" tetap ghost berwarna brand.
- **Account (16).** Hero gradient dengan avatar lebih besar + chip berikon
  (status check, briefcase jenis akun, slot Union); Profil organisasi menjadi
  baris label kiri / nilai kanan (tanpa chevron palsu); satu SettingsGroup:
  "Kemampuan akses" DisclosureRow default terbuka berisi badge capability,
  Notifikasi push (→ /notifications), Ganti password (→ /change-password),
  baris ID sesi, dan Keluar (danger) lewat Dialog konfirmasi yang sama.
- **Formatters.** `formatRelative` menambah bucket minggu ("n minggu lalu");
  `formatNotificationTime` baru (07.00 / Kemarin, 15.45 / 3 Agu 2026, 09.10).
- **Keputusan product owner (slice ini).** (1) Topbar mobile bersama tetap
  dipakai di semua halaman (bukan header per halaman mockup); (2) Timeline
  default collapsed; (3) restyle detail berlaku untuk semua audiens;
  (4) label severity tetap Indonesia. Deviasi terhadap mockup tercatat di
  ADR-0023 (tanpa centang read-receipt chat, counter feedback 2000 karakter,
  ringkasan siklus terakhir tidak diduping sebagai baris "Siklus penutupan #1",
  baris ID sesi dipertahankan).
- **Test.** Baseline diregenerasi terkendali: `workforce-history-360`,
  `workforce-notifications-360`, `workforce-account-360`,
  `workforce-conversation-active-360` dihapus dulu lalu dibuat ulang (toleransi
  6% terbukti bisa menerima render lama), plus baseline baru
  `workforce-detail-active-360` dan `workforce-detail-closed-360` (framing
  pada region closure/rating). Fixture mock diperkaya (4 notifikasi lintas
  hari dengan status baca campuran, detail dengan lampiran + closure cycle,
  balasan reporter di chat, stub media abu-abu netral). Gated fullstack
  `member-voice.spec.ts` kini membuka Timeline sebelum asersi listitem.
  Catatan operasional: hapus baseline lama sebelum regen — mode `changed`
  tidak menimpa render yang masih lolos toleransi.

Validasi (semua hijau): lockfile tidak berubah; `pnpm format:check`; `pnpm
lint`; `pnpm typecheck`; unit API 60, UI 18, frontend-core 14, workforce 35,
Admin 2; `pnpm build` (precache 12); `pnpm openapi:check` tanpa drift;
`migrations:destructive-check`; `pnpm audit --audit-level high` (hanya
Moderate transitive ExcelJS terdokumentasi); Playwright mocked
`test:frontend:e2e` **132 passed** (chromium + visual + pwa; sebelumnya 120)
diverifikasi dua run berturut-turut; Gitleaks v8.24.3 directory scan bersih;
`git diff --check` bersih; `docker compose config --quiet`. Suite
berbasis database (integration/security/performance/fullstack) tidak
dijalankan ulang karena change set murni frontend + e2e + dokumen; spec
fullstack yang diperbarui berjalan di CI hosted. OrbStack dihidupkan hanya
untuk scan Gitleaks; tidak ada container/proses yang tersisa.

### Workforce auth, Member Home, and Create Voice redesign — 30 Agustus 2026

Branch `feat/member-page-redesign-imagen`. Implementasi slice pertama dari
konsep `.design/member-voice-redesign/` (layar 01–11) tanpa perubahan API,
schema, atau kontrak (ADR-0022):

- **Shared UI (aditif; Admin byte-identical).** `PasswordInput` baru di
  `packages/ui` (toggle visibilitas sebagai tombol berlabel `aria-pressed`;
  `Input` lama tidak bisa menampung kontrol berlabel karena trailing
  di-render `aria-hidden`). `ChoiceCardGroup` memperoleh prop opsional
  `indicator: 'check' | 'radio'` (default `check`, DOM tak berubah) dan
  `appearance: 'default' | 'brand'` (kartu terpilih solid cobalt, teks
  inverse, ikon plate tinted). Keduanya terdaftar di coverage, di-specimen-kan
  di `/design`, dan diuji unit (UI 14).
- **Auth.** Login dan ganti password memakai layout hero cobalt + sheet putih
  yang menumpuk (mobile) dan panel dua kolom (desktop): lockup + headline +
  grid blueprint, badge shield + watermark untuk halaman keamanan, field
  berlabel dengan ikon leading + toggle password, tombol utama berpanah.
  Chip "Member Voice" pada hero dan tile ikon pada heading "Selamat datang
  kembali" dihapus atas arahan product owner. Kontras diperbaiki ke putih
  penuh di atas cobalt (92% putih = 4.31:1 di stop brand-600, di bawah AA).
- **Member Home.** Komposisi inti dipertahankan; hero kini memakai token
  `--gradient-brand-hero`, tile aksi cepat bericon-chip brand, baris sheet
  Lainnya bericon-chip + chevron. Destinasi aksi cepat dan dock mobile tidak
  diubah (keputusan product owner).
- **Create Voice.** Stepper hairline lima node dengan counter `n/5`
  (fallback = 3/5 sesuai konsep); kartu jalur ber-radio dan state terpilih
  brand — atas arahan product owner kartu jenis Voice menyerap sisa tinggi
  halaman hingga tepat di atas CTA (halaman langkah jenis memenuhi viewport
  di bawah topbar dan di atas CTA terpin), dan CTA "Lanjutkan" dipin persis
  di atas dock mobile (varian `pinned` pada actions bar, desktop tetap
  floating card). Catatan operasional: regen baseline setelah rebuild wajib
  memastikan tidak ada server `vite preview` basi yang masih hidup — server
  lama menyajikan dist lama sehingga snapshot terkunci pada render tua. form terbagi kartu Lokasi temuan (baris ringkas "Karawang 1
  - Ubah" membuka bottom-sheet picker — supersesi chip grid ADR-0020 khusus
    form ini) dan kartu Voice composer (counter, divider dashed, dropzone +
    catatan berdampingan, ribbon bookmark Private, notice AI General); consent
    identitas Private menjadi seksi kartu brand tanpa default; processing
    menjadi kartu cobalt dengan orbit spinner (reduced-motion-safe) dan ceklis
    tiga tahap berbasis status mutasi nyata (`stages` diekspos `useDraftWizard`);
    fallback memakai banner amber + kode fallback, grid kategori 2 kolom
    (General), dan severity rail vertikal; review memakai kartu ringkasan cobalt
    dengan Rute tujuan dari endpoint preview (`previewDraft`) — menutup gap PRD
    §12.2 di wizard — kartu konten, strip meta klasifikasi/lokasi, konfirmasi
    consent Private, dan gate acknowledgment INCOMPLETE yang tak berubah.
    `DraftPreviewPage` memakai komponen review yang sama (`ReviewParts.tsx`).
- **Defect laten diperbaiki.** `saveAndProcess` menimpa `locationReview`
  dengan `.data` dari objek mutasi stale pasca-`Promise.all`, menghapus gate
  acknowledgment INCOMPLETE pada jalur wizard; kini memakai hasil awaited.
- **Test yang diperbarui.** Anchor journey/a11y "Pilih jenis Voice" → "Mulai
  Voice baru"; pemilihan area kini melalui sheet Ubah; halo 44px
  `.media-input__remove` dipertahankan. Baseline lama tidak berubah (satu pun
  tidak diregenerasi — delta home berada di bawah jendela capture). Sepuluh
  baseline 360px baru ditambahkan di `workforce.visual.spec.ts` untuk permukaan
  yang dirancang ulang: login, ganti password, jenis Voice, area sheet, form
  General, processing, fallback manual, review General, form Private, dan
  review Private; tiap step diframe dari atas (scroll-to-top) karena
  interaksi auto-scroll, processing ditangkap di tengah analisis dengan rute
  classify/location-review yang sengaja ditahan, dan determinisme diverifikasi
  dengan dua run visual berturut-turut.

Validasi (semua hijau): lockfile tidak berubah; `pnpm format:check`; `pnpm
lint`; `pnpm typecheck`; unit API 60, UI 14, frontend-core 14, workforce 33,
Admin 2; `pnpm build` (precache 12); `pnpm openapi:check` tanpa drift;
Playwright mocked chromium **106 passed**; visual **22 passed** (12 baseline
lama tetap identik + 10 baseline baru); PWA 2 passed. Seluruh 12 state render
(login, ganti password, home, sheet Lainnya, 5 langkah wizard, area sheet,
preview General/Private) di-screenshot dan ditinjau terhadap mockup pada 360px
melalui spec capture sementara yang telah dihapus. Tidak ada container/proses
yang tersisa. Pre-commit sebelum push: scan direktori Gitleaks bersih, audit
dependensi nol High/Critical, `git diff --check` bersih, dan `docker compose
config --quiet`; suite berbasis database (integration/security/performance/
fullstack) tidak dijalankan ulang karena change set murni frontend + e2e +
dokumen tanpa sentuhan API, schema, atau migration. Commit dibuat pada branch
`feat/member-page-redesign-imagen` untuk ditinjau via PR.

Keputusan yang dikunci bersama product owner: (1) Area Temuan menjadi baris
ringkas + sheet Ubah (supersesi keputusan chip grid ADR-0020 pada form ini);
(2) tile aksi cepat dan dock mobile tidak berubah; (3) komponen baru masuk
`packages/ui` + `/design` + unit test. Lihat ADR-0022.

### Workforce secondary-surface polish: Account, Create Voice, Notifications — 29 Agustus 2026

Branch `feat/polish-member-pages`. Akar masalah "teks menempel di tepi" bersifat sistemik:
`care-surface` (Card) tidak memiliki padding sehingga setiap halaman yang meletakkan konten mentah
di dalam Card merender flush ke border (Account, wizard, push card, notification items), sementara
halaman yang terlihat rapi hanya aman karena komponennya membawa padding sendiri. Selector mati
`.monitor-kpis .care-card` membuktikan padding KPI Voice Member memang dimaksudkan namun tidak
pernah terpasang. Implementasi (ADR-0020):

- **Foundations (`packages/ui`, aditif):** `Surface/Card` memperoleh prop `padding`
  (`none|sm|md|lg`, default `none` sehingga Admin byte-identical); token baru
  `--gradient-brand-hero`, `--on-brand-muted`, `--shadow-cta`; komponen baru `SectionCard`,
  `ChoiceCardGroup` (varian `card`/`chip`, semantik radio Radix), `SettingsGroup`/`SettingsRow`,
  `KeyValueGrid` (surface `subtle`/`brand`); `Field/Input/Textarea` menerima `counter`. Semua
  terdaftar di coverage publik + spesimen `/design` + 4 test unit baru (UI 12 total).
- **Account:** hero gradient diperbaiki (padding, avatar tidak terpotong, chips status/jenis,
  teks on-brand AA — label 92% white, value putih penuh); Profil organisasi/Kemampuan akses/
  Keamanan & sesi menjadi SectionCard (KV tiles tinted); aksi keamanan memakai SettingsRow
  berikon; **Keluar kini lewat Dialog konfirmasi** (focus trap/return, destructive tone).
- **Create Voice:** ChoiceCard untuk pilihan Private/General dan severity fallback; Area menjadi
  chip grid 2 kolom di 360px; form satu kartu terbagi tiga seksi berikon (Lokasi/Detail/Foto);
  counter inline di baris label; textarea mengikuti `rows` (override scoped workforce); media
  picker diperbaiki (label programmatic, hitungan 0/5, dropzone 7.5rem, tombol hapus 24px dengan
  halo ≥44px); **sticky action bar** di semua step yang membersihkan dock + safe area; langkah
  stepper diperbarui (track + halo, label sr-only di ≤640px); DraftPreviewPage diselaraskan.
- **Notifications:** header menumpuk di mobile dengan badge belum-dibaca + tombol Tandai semua
  dibaca inline; push settings menjadi SectionCard (switch tetap satu kontrol berlabel — anchor
  test `Aktifkan notifikasi push` dipertahankan); item notifikasi memakai tile ikon ber-tone per
  tipe, dot + latar tint untuk unread (bukan warna saja), tombol `Buka` tetap.
- **Sibling fixes:** chart cards, home resume/assignment cards, KPI Voice Member, seksi Voice
  Detail (meta/detail/timeline/closure/reporter), ActionPanel memperoleh `padding="md"`;
  selector `.care-card` mati dihapus; `.dashboard-filters` kini berpadding; field workforce
  (input/textarea/select) menjadi tinted inset dengan fokus brand — scoped ke bundle workforce
  sehingga Admin tidak berubah (`admin-shell-1440` baseline lolos tanpa regenerasi).

Validasi (semua hijau): lockfile tidak berubah; `pnpm format:check`; `pnpm lint`; `pnpm typecheck`;
unit API 60, UI 12, frontend-core 14, workforce 33, Admin 2; `pnpm openapi:check` tanpa drift;
`pnpm build` (PWA precache 12); `migrations:destructive-check`; `docker compose config --quiet`;
`db:up/wait/verify/test:reset/test:migrate`; integration 42; security 5; seed+test performance
10k/50k; maintenance:reconcile nol; `pnpm test:frontend:e2e` **120 passed** (Axe AA, no-overflow,
44px dock, halo media remove baru, journey wizard diperbarui ke radio chip `Karawang 1`);
fullstack gated **3 passed**; `workforce-account-360.png` diregenerasi (satu-satunya baseline
berubah; 12/12 visual lulus); Gitleaks directory scan bersih setelah allowlist diperluas ke
`.env.local` (ignored mode-0600, rekonsiliasi rules §4.2 di change yang sama);
`security:exceptions:check` valid; `git diff --check`. Compose database dihentikan; tidak ada
container/proses tersisa. Catatan operasional: container `supplier-henkaten-local-api-1` yang
mengunci 127.0.0.1:3000 dihentikan atas keputusan operator agar gate fullstack CARE dapat
berjalan; dibiarkan mati.

Keputusan yang dikunci bersama product owner: (1) sibling fixes ikut diperbaiki dengan baseline
diregenerasi terkendali; (2) hero Account tetap gradient (diperbaiki) bukan kartu putih;
(3) redesign form mencakup choice cards, chip area, sticky action bar; (4) komponen baru masuk
`packages/ui` + `/design` + unit test. Lihat ADR-0020.

### Workforce dashboard, monitoring, conversation lifecycle, and polish — 28 Agustus 2026

Branch `feat/workforce-polish`. Implementasi lokal:

- capability-to-navigation dipusatkan pada pure helper: Member mobile empat
  item; Manager/Section Head/Division-Leadership/Director lima item dengan Voice
  Member; desktop mengekspos Notifikasi/Akun; Union contract tetap. `/history`
  dilabel Voice Saya dan `/general` workforce diarahkan ke `/work-items`;
- Manager dan leadership Home memperoleh filter URL 30/90 hari, tahun berjalan,
  semua/custom range, area/category/severity/status; KPI, segmented status,
  accessible severity/category bars, SVG trend, ranked organization breakdown,
  last-updated, suppression, loading/error/offline/empty;
- `/work-items` menjadi workspace Voice Member role-aware dengan active default,
  Closed/All, search, handler/status/severity/category/area/date filter, scoped
  monitoring options, severity-first cursor pagination, filter summary, dan
  preserved URL state. Manager/Section Head tetap server-authoritative melalui
  `availableActions`; leadership read-only; Private milik orang lain tidak masuk;
- API menambah `statusGroup`, handler work-items, monitoring-options, dan
  `conversationState`; Open tidak punya MESSAGE/chat, Assign membuka empty active
  room logis, Ask membuat room, direct Proceed tidak membuat room, In Progress
  hanya melanjutkan conversation yang ada, dan Closed history read-only. Read dan
  send endpoint menegakkan state yang sama;
- workforce styling dipoles berdasarkan `.agent/design-images/design.jpg` tanpa
  mengubah shared Admin presentation: compact headers, cobalt/tinted surfaces,
  filter/action bars, cards, focus/motion/responsive states. Account kini memakai
  label manusiawi, no.reg dan organisasi aktual; UUID snapshot bukan informasi
  utama; session tidak mengarang expiry. Push degraded state dibuat ringkas;
- OpenAPI dan contracts diregenerasi tanpa migration. Baseline visual ditambah
  untuk Manager dashboard, Voice Member, Account, dan active conversation; Push
  Settings baseline diregenerasi.

Final parity lokal — 29 Agustus 2026:

- frozen install, Prisma generation, format, lint, typecheck, deterministic
  OpenAPI/contracts, production build, destructive migration check, dan Compose
  config hijau;
- unit suites hijau: API 60, UI 8, frontend-core 14, workforce web 33, dan Admin
  web 2. PostgreSQL integration 42, security 5, full-stack 3, serta Playwright
  mocked/visual/PWA 119 seluruhnya lulus;
- seeded performance 10k account/50k Voice lulus; maintenance reconciliation
  tidak menemukan orphan; upgrade migration, deployment validation/harness,
  security-exception policy, actionlint, ShellCheck, Hadolint, Bash syntax, dan
  Ubuntu bootstrap contract hijau;
- production-like stack lima image lulus exact-SHA release/readiness, routing,
  deep-link, auth boundary, CSP, non-root policy, database tidak terpublikasi,
  restart, media persistence, dan database identity persistence;
- Trivy filesystem serta kelima image produksi menemukan nol High/Critical dan
  nol applicable secret/misconfiguration. Gitleaks directory scan tidak
  menemukan leak. Dependency audit tetap nol High/Critical dengan satu Moderate
  transitive yang sudah terdokumentasi;
- provider smoke live tetap advisory/manual-fallback pada environment lokal dan
  `flock` tidak tersedia di macOS; Linux container harness yang menjadi kontrak
  deployment tetap hijau. Seluruh Compose stack yang dimulai untuk verifikasi
  sudah dihentikan.

### Union Private Voice surface and workforce desktop presentation — 28 Agustus 2026

Branch `fix/union-page`. Backend kontrak Union sebenarnya sudah benar sejak
re-freeze (`workItemScope`, serializer consent, action matrix); gap ada di
presentasi. Perubahan yang diimplementasikan:

- **Navigasi Union** (`apps/web-voice/src/App.tsx`): item "Private" (ikon Lock)
  ditambahkan ke dock dan sidebar, menunjuk `/work-items`; `NAV_ROUTES.private`
  ditambahkan; `resolveCurrent` menjadi role-aware (`private` untuk Union,
  `work-items` untuk responder) dengan satu route untuk dua label nav.
- **Reactive desktop breakpoint**: `lib/use-media-query.ts` baru
  (`createMediaQueryStore` + `useSyncExternalStore`, store per query di-cache)
  menggantikan pembacaan `matchMedia` sekali pakai, sehingga shell berpindah
  dock ↔ sidebar saat resize. Unit test `use-media-query.test.ts`.
- **Halaman Private Voice union-aware** (`features/work/WorkItemsPage.tsx`):
  header/copy/empty state per role (Head: seluruh Private; Officer: assigned);
  filter "Penugasan" (Semua / Perlu ditugaskan) khusus Head yang mengirim
  `unassigned=true`; offline banner; copy responder "Voice Member" tidak berubah.
- **Beranda Union** (`features/home/HomePage.tsx`): section "Private Voice"
  (enam item pertama dari work-items + Lihat semua), kartu assignment Union
  Head dari `pendingAssignment` (CTA ke `/work-items?unassigned=true`, tone
  accent saat > 0), tile quick action "Private Voice", copy kartu akses per
  role. Query key inbox dipisah (`private-home` / `responder-home`).
- **Blok Pelapor consent-driven** (`features/voice/VoiceDetailPage.tsx`):
  `UNION_IDENTIFIED` menampilkan nama/no.reg/divisi/department + badge
  "Identitas ditampilkan"; `UNION_ANONYMOUS` menampilkan alias per-Voice +
  badge "Identitas disembunyikan"; audience lain tidak berubah. Status meta dan
  timeline kini memakai `STATUS_LABELS`/`VOICE_ACTION_LABELS`.
- **Label chart terlokalisasi** (`components/DashboardChartCard.tsx`): bucket
  enum dipetakan via lookup status/severity/kategori (fallback raw, `NONE` →
  "Tanpa kategori"); `barColor` tetap membaca label mentah.
- **Copy dialog assign** (`components/ActionPanel.tsx`): description menjadi
  union-aware ("Pilih Union Officer…" untuk PRIVATE).
- **Kontrak additive**: `GET /work-items` menerima `unassigned=true`
  (dihormati hanya untuk Union Head → `currentHandlerId IS NULL`; diabaikan
  untuk actor lain); `GET /dashboard/private` menyertakan `pendingAssignment`
  opsional yang hanya diisi untuk Union Head. `enrich-openapi.ts` diperbarui
  (param work-items + properti opsional `DashboardAggregate`); OpenAPI dan
  `@care/contracts` diregenerasi.
- **Desktop CSS** (`apps/web-voice/src/styles.css`): lapisan
  `@media (min-width: 1280px)` — container keterbacaan 72 rem (konten dan
  topbar), padding konten `--space-8`, hero 56 rem, quick-action tile 7 rem,
  percakapan 28 rem, sidebar aktif tinta gelap di atas `surface-subtle`
  (konsisten pola dock ADR-0012). Style `.voice-reporter` baru. Baseline 360 px
  tidak berubah byte-identik.
- **Perbaikan defect shared UI** (`packages/ui/src/styles.css`):
  `.care-select-content`/`.care-combobox__panel` naik ke
  `calc(var(--layer-modal) + 2)`; sebelumnya popover Select di dalam Dialog
  tertutup overlay (`--layer-popover` 40 vs `--layer-modal` 60) sehingga opsi
  tidak bisa diklik pointer — defect lintas workforce dan Admin.
- **E2E**: fixture `unionSession({slot})` dan `unionPrivateVoiceDetail`
  akurat di `e2e/helpers/mock-api.ts` (accountKind UNION, tanpa capability
  MEMBER; mock menghormati `unassigned=true` dan override kandidat assignment
  ber-slot Officer); journey Union Head (list → filter antrian → assign dialog
  → sukses menutup dialog), Union Officer, anonimitas/identified, axe +
  no-overflow 1440 px (union home/inbox/head+officer), baseline visual desktop
  baru `workforce-union-private-1440.png` (pin jam, 0.06).
- **Integration**: `union-inbox.integration.test.ts` baru (5 test) — scope
  inbox Head/Officer, filter antrian, pengabaian flag untuk non-Head,
  `pendingAssignment` sebelum/sesudah assign, tanpa field untuk
  Officer/reporter.

Validasi (semua hijau): `pnpm db:generate`; typecheck dan lint monorepo;
`pnpm format` + `format:check`; unit API 60, ui 8, frontend-core 14,
web-voice 25, web-admin 2; integration 38 (termasuk 5 baru) dan security 5 di
PostgreSQL disposable; `openapi:check` hijau pada state ter-commit (drift
pra-commit adalah perubahan kontrak yang disengaja); build monorepo (workforce
precache 12 entries); Playwright mocked `test:frontend:e2e` **115 passed**;
`FULLSTACK_E2E=1 --project=fullstack` 3 passed (DATABASE_URL lokal
`postgresql://care:care_local@localhost:54329/care_test`, secret test ≥32
karakter); `seed:performance` + `test:performance` (10k/50k);
`maintenance:reconcile` (orphanedImportFiles 0, terminalImports 2 adalah batch
CONFIRMED dari fullstack e2e); `migrations:destructive-check`;
`docker compose config --quiet`; audit 0 High/Critical (Moderate ExcelJS
transitive tetap terdokumentasi); Gitleaks v8.24.3 directory scan tanpa
temuan; `git diff --check`. Compose dimatikan setelah validasi
(`pnpm db:down`), tidak ada container/proses yang tersisa.

Keputusan yang dikunci bersama product owner: (1) nav Union lima item dengan
antrian penugasan sebagai filter di halaman Private; (2) additive backend untuk
`unassigned` + `pendingAssignment`; (3) lapisan desktop konservatif (container
72 rem, tanpa layout dua kolom); (4) blok Pelapor hanya untuk audience Union.
Lihat ADR-0018.

### DeepSeek Chat Completions and function calling — 28 Agustus 2026

The CARE AI transport now uses the official OpenAI JavaScript SDK's
`chat.completions.create` method against `/chat/completions`, targeting
`deepseek-v4-flash`. Existing `OPENAI_*` environment names, secret boundaries,
timeout/confidence controls, health response shape, deterministic routing, and
Manual Fallback semantics remain unchanged. Empty reasoning effort now defaults
to `none`; it maps to `thinking.disabled` without `reasoning_effort`, while the
remaining accepted values map to DeepSeek `low`, `high`, or `max` thinking.

Classification and location review each send a versioned system prompt plus an
explicitly untrusted JSON user message, expose one standard function, and force
that named function through `tool_choice`. The adapter accepts exactly one
matching function call, parses its arguments, and then applies strict Zod domain
validation. Missing, duplicate, unexpected, malformed, truncated, filtered, or
resource-interrupted output falls back safely without schema retries; timeout,
429, connection, and 5xx behavior retain one bounded retry. Strict Beta `/beta`
is intentionally not used. Prompt versions advanced to
`care-classification-v1.2` and `care-location-v1.2`, invalidating stale draft AI
snapshots through the existing prompt-bound hashes.

The live non-sensitive smoke passed against `https://api.deepseek.com` with
`deepseek-v4-flash` and reasoning `none`: classification returned AI source,
`SAFETY`, `HIGH`, confidence `0.9` in 1773 ms; location returned `COMPLETE` in
1738 ms. The key was supplied to the process through non-echoing stdin, was
never written to disk or logged, and must still be rotated. The compatibility
command `pnpm test:openai:smoke` passed against a local mock that asserts the
DeepSeek Chat Completions/function-calling request contract.

Mandatory local parity completed green: frozen install, Prisma generation,
format, lint, typecheck, deterministic OpenAPI, production build, destructive
migration check, Compose config, and dependency audit (zero High/Critical; the
documented ExcelJS transitive Moderate remains). Unit suites passed with API 60,
UI 8, frontend-core 14, workforce web 20, and Admin web 2 tests. Playwright
passed 106 mocked/visual/PWA tests and 3 full-stack tests. PostgreSQL passed 33
integration and 5 security tests, upgrade reconciliation, the 10k-account/
50k-Voice seeded performance test, and maintenance reconciliation with all
counts at zero. Deployment validation and harness, security-exception checks,
actionlint, ShellCheck, Hadolint, Bash syntax, and Ubuntu bootstrap contracts
all passed. The production-like five-image stack passed exact-SHA routing,
health/readiness, deep-link, authentication, CSP, non-root, unexposed-database,
restart, media, and database-persistence checks. Trivy found zero High/Critical
vulnerabilities or applicable filesystem secret/misconfiguration findings, and
Gitleaks found no repository leaks. Started Compose stacks were stopped after
validation.

ADR-0017 supersedes only the Responses transport portions of ADR-0004. PRD,
roadmap, backend guide, deployment guide/checklist, runtime examples, advisory
provider-smoke documentation, and deployment messages now describe DeepSeek
Chat Completions. No HTTP/OpenAPI/database/frontend contract changed and Phase
13 remains `in_progress`.

### Route remediation and workforce dashboard corrections — 28 Agustus 2026

- Default PIC and global PIC remediation now accept only `{ noReg }`. The API
  resolves the active workforce account server-side, preserves leading zeroes,
  validates default/global eligibility, serializes route replacement, and writes
  a system audit reason. Account UUID, route UUID, and free-text reason are no
  longer part of either remediation form or request contract.
- Remediation issue responses expose a bounded organization-unit summary. The
  Admin page is now an operational workspace with open-issue/affected-department/
  route/Union KPI cards, submission-blocking guidance, complete issue filters,
  human-readable issue impact, organization hierarchy, detected timestamps, and
  status-aware actions. The table shows the affected department name, while
  global PIC issues show `Seluruh department`; the drawer repeats the affected
  scope before any action.
- Union accounts no longer request `/dashboard/member`; this request was invalid
  because Union accounts intentionally do not have `MEMBER`. Union Home renders
  only Private and read-only General aggregates and does not expose create/own
  Voice actions.
- The blue dashboard hero and its white status card are explicitly centered.
  Zero-minimum grid tracks, bounded widths, responsive padding, and shrink-safe
  status cells prevent mobile overflow with long display names and 360 px
  viewports.
- OpenAPI and the generated TypeScript client were regenerated. PostgreSQL
  integration coverage proves No. Reg route lookup and route/deactivation
  serialization; Playwright covers both PIC forms, the comprehensive remediation
  workspace, Union Home, and mobile containment/centering.

Validation completed: frozen install and Prisma generation; format, lint,
typecheck, unit (86), mock OpenAI smoke, deterministic OpenAPI, clean production
build, Compose config, and migration destructive check; PostgreSQL integration
(33), security (5), upgrade reconciliation, 10k-account/50k-Voice performance,
and maintenance reconciliation; Playwright mocked/visual/PWA (106) plus
full-stack (3), including Admin WCAG 2.1 AA/no-overflow; deployment validation,
deployment script tests, security-exception validation, actionlint, ShellCheck,
Hadolint, Bash syntax, and Ubuntu bootstrap contract. The dependency threshold
has zero High/Critical advisories and retains the documented ExcelJS transitive
Moderate. See ADR-0016.

### Live provider smoke diagnostics and non-blocking deploy behavior — 28 Agustus 2026

The failed `staging` auto-deploy (run 33148573976) was traced to the
`live-provider-smoke` step of `Deploy under remote lock`, which threw only the
generic message `Live classification contract validation failed`. Investigation
showed the configured OpenAI-compatible provider host (`pad-llm-api.qd-tmmin.site`)
has **no DNS record** in the authoritative Cloudflare `qd-tmmin.site` zone
(verified against `dax.ns.cloudflare.com`), so the deployed API container could
not reach it; the CLI smoke gave no diagnostic whatsoever.

Two changes were made together:

- **Traceable provider diagnostics.** New `apps/api/src/ai/error-detail.ts`
  exposes `sanitizedErrorDetail(error)` — a bounded (≤300 chars) redacted reason
  built from the OpenAI SDK error class, HTTP status, and wrapped network cause
  (e.g. `APIConnectionError: getaddrinfo ENOTFOUND pad-llm-api.qd-tmmin.site`),
  scrubbed for `sk-…`, `Bearer …`, and `api_key=`/`authorization=` patterns.
  `apps/api/src/ai/ai.service.ts` now logs every provider failure path
  (`care_ai_request …` with name/fallbackCode/attempt/latency/detail) plus
  schema-invalid outcomes, and classification fallback results carry a sanitized
  `errorDetail`. `apps/api/src/cli/live-provider-smoke.ts` prints provider config
  (never the API key), per-call outcome (source/fallbackCode/latency/candidate),
  and throws errors whose message includes the fallbackCode.
- **Provider smoke is advisory, not a deploy gate (ADR-0015).**
  `deploy/scripts/remote-deploy.sh` still runs `live-provider-smoke` at the same
  position, but failure no longer fails the candidate or triggers rollback; it
  logs `Live OpenAI-compatible provider smoke FAILED; release continues with
Manual Fallback active.` and records `status=passed|failed … releaseSha=…` to
  `shared/deployment-state/live-provider-smoke.result` (mode 0600). All other
  gates (build, migrate, health/readiness, web, Caddy, two-origin smoke,
  rollback) remain blocking. PRD §31.1 gained an explicit advisory note; the
  formal release-readiness check (§39) still requires the live smoke to pass.
  `deploy/tests/deployment-scripts.sh` gained a fake-docker
  `TEST_PROVIDER_SMOKE_FAIL` switch and a harness case proving a provider smoke
  failure still activates the release and records the `failed` marker, while the
  existing smoke-check rollback case is unchanged.

Validation (all green): API unit 42 (incl. 6 new `ai-error-detail` tests), API
typecheck, monorepo lint/typecheck, Prettier check, `pnpm test:openai:smoke`
(mock), monorepo build, `pnpm deployment:validate`, `pnpm test:deployment`
(provider-smoke non-blocking case + rollback case both pass; `flock` contention
remains a Linux CI requirement), ShellCheck, Actionlint, `bash -n`, Gitleaks
v8.24.3 (no leaks; fake key fixtures are assembled at runtime so no secret-shaped
source literals remain), `git diff --check`.

Branch `fix/deploy-live-provider` was fast-forwarded to `origin/staging`
(5b3a41e, PR #9 admin polish) under an uncommitted stash; the change set is
**not yet committed**. The rename from ADR-0014 to ADR-0015 was required because
staging consumed ADR-0014 for the admin polish decision.

### Admin workspace visual polish — 28 Agustus 2026

Admin frontend dipoles mengikuti bahasa desain referensi produk (target yang sama
dengan ADR-0012) yang diterjemahkan ke register enterprise desktop, tanpa
perubahan kontrak produk, API, routing, PWA, atau shared UI package. Keputusan
desain dikunci bersama product owner: sidebar aktif memakai pill cobalt solid,
overview tetap light header (tanpa hero cobalt), tombol primary tetap flat
brand-600, dan cakupan satu pass penuh (shell + 9 halaman + login).

- **CSS ter-scope ke bundle Admin** (`apps/web-admin/src/styles.css`): sidebar
  putih dengan brand chip cobalt dan pill aktif brand-600 (teks putih, AA),
  topbar translusen, header tabel uppercase letterspaced di atas permukaan
  putih dengan divider lebih halus dan elevasi kartu, toolbar filter,
  mini-stat, baris key-value `admin-kv` dengan nilai ber-ton semantik, section
  head, quick-action tiles, dan polish login (brand chip, display type, radial
  tint). Tidak ada perubahan `packages/ui`; seluruh baseline workforce/`/design`
  tetap byte-identical.
- **Overview flagship**: kartu "Ringkasan akun" (pulse) dengan segmented bar
  dekoratif (`role="progressbar"` + `aria-valuenow`), legend empat sel
  (Aktif/Legacy/Nonaktif/Remediation ber-ton warning), pill Union slot, dan
  catatan remediation. JSON readiness `<pre>` diganti baris terstruktur Health/
  Ready/Release + badge per-check. Quick actions hanya menunjuk route existing.
- **Halaman lain**: filter dipindah ke `admin-toolbar`; sel aksi tabel memakai
  `Button` ghost (nama aksesibel `Detail`/`Tangani` tetap); drawer Accounts
  memakai blok identitas Avatar + KV; drawer Voice Explorer/Audit memakai
  `admin-dl`/`admin-feed`/`admin-pre`; Union cards memakai KV rows; System
  Status memakai badge status (`ready`/`ok` dipetakan success); Account page
  memakai blok identitas. Seluruh teks anchor test dipertahankan.
- **Test visual**: `admin-shell-1440.png` diregenerasi; test kini memasang
  `mockAdminApi` + pin clock agar pulse card dan timestamp "Validasi terakhir"
  deterministik, dengan toleransi 0.06 berikut rationale font-rasterization
  yang sama dengan baseline lain. Salinan fraksi pulse disesuaikan ("/8 aktif")
  agar anchor `getByText('Akun aktif')` tetap unik.

Files changed: `apps/web-admin/src/styles.css`, `apps/web-admin/src/App.tsx`,
seluruh `apps/web-admin/src/features/**` (9 halaman),
`e2e/design.visual.spec.ts`, baseline
`e2e/design.visual.spec.ts-snapshots/admin-shell-1440.png` (regenerated),
`docs/adr/0014-admin-frontend-visual-polish.md`.

Validasi (semua hijau): `pnpm install` (node_modules segar) + `pnpm db:generate`;
`pnpm format:check`; `pnpm lint`; `pnpm typecheck`; `pnpm test:unit` (API 36,
UI 8, frontend-core 14, web-voice 20, web-admin 2); `pnpm build`;
`pnpm openapi:check` (tanpa drift); `pnpm migrations:destructive-check`;
`docker compose config --quiet` + `db:up/wait/verify/test:reset/test:migrate`;
`pnpm test:integration` 32; `pnpm test:security` 5; `seed:performance` +
`test:performance` (10.000 akun/50.000 Voice); `maintenance:reconcile` dry-run
(nol counter); `pnpm test:frontend:e2e` **102 passed** (Axe AA + no-overflow 9
halaman Admin pada 1280/1440, journeys, explorer, foundation, visual, PWA);
`FULLSTACK_E2E=1 --project=fullstack` 3 passed terhadap API + disposable DB;
Gitleaks v8.24.3 directory scan (no leaks); `git diff --check`; `pnpm db:down`
dan tidak ada container/proses yang tersisa. Tidak ada perubahan phase status;
pekerjaan ini polish frontend pada feature branch di luar roadmap bernomor.

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

Automated AI test tidak memakai API key nyata. Perintah compatibility
`pnpm test:openai:smoke` menyalakan mock HTTP `/chat/completions` lokal,
menyuntikkan credential dummy hanya agar SDK dapat membangun request, lalu
memvalidasi DeepSeek non-thinking mode, forced classification/location
functions, dan local schema boundary. Tidak ada external network call.

`OPENAI_BASE_URL`, `OPENAI_MODEL`, dan `OPENAI_API_KEY` tetap kosong secara
default dan baru diperlukan pada runtime staging/production. Target yang
disetujui adalah `https://api.deepseek.com`, `deepseek-v4-flash`, dan effort
`none`. Live provider validation tetap menjadi Phase 13 staging evidence dan
bukan dependency Backend Complete Gate.

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

## Mobile Member Voice Image Redesign — 30 Agustus 2026

**Objective:** audit seluruh core workforce mobile surface dan menghasilkan standalone image concepts tanpa mengubah application code, API, schema, atau design-system implementation.

**Completed:**

- 25 deterministic current-state captures pada viewport mobile disimpan di `.agent/design-images/member-voice-redesign/current/`;
- 25 selected `image_gen` concepts disimpan secara canonical di `.design/member-voice-redesign/` dengan child folder per page/flow;
- Member Home mempertahankan core dashboard saat ini; Create Voice dipoles menjadi lebih unique, sleek, minimalist, dengan solid-cobalt chosen route, taller cards, dan five-node hairline timeline;
- Voice detail, Manager/Responder, Leadership read-only, serta Union anonymous/identified/read-only flows mendapatkan konsep terpisah;
- anonymous Private invariant menghapus nama, nomor registrasi, unit organisasi, initials, portrait, dan identity hint; consented identified mode hanya menampilkan snapshot yang diizinkan;
- manifest current-to-concept, acceptance audit, design lock, dan composable final prompt set tersedia di `.design/member-voice-redesign/`;
- duplicate selected concepts pada lokasi kerja lama dan temporary Playwright capture spec telah dihapus setelah canonical copy diverifikasi.

**Files changed:** `.agent/design-images/member-voice-redesign/current/`, `.design/member-voice-redesign/`, `.agent/sessionHandoff.md`, `.agent/implementationPhases.md`, dan `docs/adr/0021-mobile-member-voice-image-redesign.md`.

**Checks:** 25 current captures; 25 final PNG; all expected child folders present; `git diff --check` passed. Tidak ada runtime/container yang dipertahankan dan tidak ada source-code test yang diperlukan untuk image-only handoff.

**Decision:** output ini adalah visual-direction artifact, bukan authorization untuk mengubah React atau contract. Implementasi UI berikutnya harus dipilih/diotorisasi terpisah dan mengacu pada ADR-0021.

**Open question / next action:** stakeholder review terhadap 25 concepts; bila diterima untuk implementation, turunkan design locks ke components/tokens dan buat scoped implementation plan tanpa mengubah privacy/permission invariants.

## Phase 7 Final Gate — 26 Agustus 2026

- formatting, ESLint, TypeScript, serta production build dua aplikasi: passed;
- recursive unit/component suites: 44 passed, mencakup auth bootstrap, forced password, wrong-app admission, CSRF/offline/error mapping, account-switch cache isolation, interactive states, keyboard/focus, accessibility, token contract, dan showcase coverage;
- Playwright functional, Axe, keyboard, visual regression, PWA, dan two-origin isolation: 16 passed pada `/design` 360/768/1440, workforce, serta Admin 1279/1280/1440;
- workforce precache: 12 shell/offline entries dan tidak memuat chunk `design-system`; API/auth/mutation/media/chat/private tetap network-only;
- Admin artifact assertion: tidak ada manifest atau service worker;
- PostgreSQL 16/pgvector, fresh migrations, migration upgrade reconciliation, integration 8, security 5, serta performance 1 dengan fixture 10.000 accounts/50.000 Voices: passed;
- generated OpenAPI/client tetap deterministic; Gitleaks v8.24.3 menemukan nol leak dan final `git diff --check` lulus.
