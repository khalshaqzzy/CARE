# CARE Session Handoff

## Deploy SSH moved to port 2222 — 28 October 2026

**Problem:** from 27 Oct ~23:00 UTC every staging deploy failed at the first SSH step (`ssh: connect to host *** port 22: Connection timed out`, three attempts on run 40600421713 for #105's merge `da02237`). The VPS sshd log shows none of those attempts, UFW allows 22/tcp from anywhere, the hPanel firewall has no rules and fail2ban is not installed, while SSH on 22 from other networks works. Port 22 traffic from GitHub runners is dropped upstream, in Hostinger's network. Hostinger support could not be reached.

**Change:**

- VPS (done by the user in the web console): sshd also listens on 2222 (`/etc/ssh/sshd_config.d/10-extra-port.conf` with `Port 22` and `Port 2222`), and UFW allows 2222/tcp. Port 22 stays open.
- GitHub: repository variable `VM_DEPLOY_SSH_PORT=2222`. A repository `VM_SSH_PORT=2222` was ignored (the deploy for #106's merge `b083d73` still logged `REMOTE_PORT: 22`) because the `staging` environment defines its own `VM_SSH_PORT`, which takes precedence and which only the repo owner can see. PR #107 then read `VM_DEPLOY_SSH_PORT` first, but its deploy (`3a74679`) also logged `REMOTE_PORT: 22`: neither repository variable reached the reusable deploy job, for reasons not visible to a collaborator. The workflows now default the port to 2222 (`vars.VM_DEPLOY_SSH_PORT || '2222'`) and no longer read `VM_SSH_PORT`. The deploy for #108 (`adc3d76`) then uploaded over 2222 successfully, but the remote step failed with `bash: --: invalid option`: #106's edit had dropped the space in `bash -s -- '<env>'`. The space is restored; the line again matches the version before #106.
- Workflows: `-o HostKeyAlias="$REMOTE_HOST"` on every deploy and rehearsal `ssh`/`scp`, so the pinned `VM_SSH_KNOWN_HOSTS` entry for the plain host also verifies port 2222. Checked against the server: without the alias, port 2222 fails host key verification; with it, the connection reaches authentication. The `staging` environment secrets can only be edited by the repo owner, so the secret itself was not changed.

**Open:**

- The #108 deploy (`adc3d76`) uploaded over 2222, then the #109 deploy (`d398f27`, run 40625076651) timed out on 2222 twice (03:35 and 03:43 UTC). Hostinger's agent found no firewall group, both ports reachable from their tests, and successful key logins from Azure/GitHub addresses on 28 Oct, so it does not see a provider block. The deploy now logs the runner's public IPv4, the destination and a 20 s TCP check before uploading; with `iptables -I INPUT -p tcp --dport 2222 --syn -j LOG --log-prefix "SSH2222-SYN "` on the VPS (remove it after with `-D`), `journalctl -k | grep SSH2222-SYN` shows whether that runner's SYNs arrive.
- If GitHub cannot reach 2222 either, the block covers the whole IP; the next route is a private network (Tailscale) for deploys.
- The server still offers password authentication (`Permission denied (publickey,password)`); turn it off once key login is confirmed.

## Dashboard timings stored by triggers — 27 October 2026

**Branch:** `feat/stored-dashboard-timings`, stacked on `fix/org-dashboard-headroom` (PR #104); merge #104 first.

**Change (ADR-0071):** migration `20261027090000_dashboard_stored_timings` adds `VoiceResponseTiming` (first/latest MONITORED/RESPONDED per Voice, cascades with its Voice) and `ClosureCycle.startedAt`, backfills both, and installs the schema's first triggers to keep them exact. `performanceFor` reads them instead of joining events and the previous cycle.

**Numbers (50k fixture):** serial Director 186 ms (staging 228), division leadership 246 ms (285), member unchanged; concurrent CI-style p95 1.5–1.8 s against 2.0–2.05 s.

**Tests:** new `dashboard-stored-timings.integration.test.ts`; full local `test/integration` + `test/security` run: 26 files, 193 tests passed.

**Next:** `dashboard-people.ts` can switch to the stored values too.

## Organization dashboard performance headroom — 27 October 2026

**Problem:** after PR #103 merged, the staging run failed `API (performance)` three times (p95 3023/3080/3078 ms against 3000 ms), so satucare.com kept the previous release. Staging before #103 already ran at 2875–2947 ms.

**Findings (50k fixture, interleaved psql timing; single runs are too noisy on Windows Docker):**

- The per-row migrated flag cost the organization-wide query about 9%: any extra column in the materialized `base` slows the joins that rescan it.
- Rewrites that did not help: pre-grouping events, `lag()` or a correlated subselect for the previous cycle, more `work_mem`, a covering index (the warm heap scan is only ~7 ms), grouping wide views from `base`, splitting member scopes, deduplicating scope predicates.
- The response and closure-cycle joins are about two-thirds of the wide summary query; storing those timings is the remaining large lever (follow-up PR).

**Change (`fix/org-dashboard-headroom`):** `performanceFor` excludes migrated Voices by id from a small `migrated` set (read via the `(legacySource, legacyId)` index) and carries only the columns a view reads (`mine`/`theirs` only with a second basis; `status`, `tierDueAt`, `handlingCycleNumber` only for ops/overdue/metrics). Director 217 vs 227–231 ms, division leadership 275 vs 281–284 ms serial; member unchanged.

## Legacy Voice migration from earlier member-voice platforms — 5 to 27 October 2026

**Objective:** Management is replacing the existing member-voice platforms with CARE. Every Voice already sent there must appear in CARE, mainly so the dashboard is complete. The user (CARE side) sends one Excel template to each old platform's PIC, who fills it in. The user then imports it.

**Agreed decisions:**

- **Closed Voices only.** In-progress Voices are finished on the old platform and come over in a later batch once closed. There will be several batches, only during the early period.
- **Old platforms have no chat.** No conversation sheet.
- **Severity is set by the user per Voice,** judged from the Voice text, because the old platforms' priorities cannot be mapped one to one. It is never defaulted.
- **Ratings are optional.** An empty rating stays empty and is excluded from the dashboard average; it is never recorded as 0. The same applies to the first-response date.
- **A developer runs the import as a CLI.** No upload page in Admin.
- **Migrated Voices cannot be rated in CARE,** and the reporter sees no rating card.

**Done (merged in PR #72, live on satucare.com):**

- CLI `apps/api/src/cli/import-legacy-voices.ts` → `dist/cli/import-legacy-voices.js`, with the logic in `apps/api/src/operations/legacy-voice-import.ts`.
  - `--file <xlsx>` runs a dry run and writes `<file>-hasil.csv`. Each row is SIAP, DILEWATI (already in CARE) or ERROR, with the reasons.
  - `--commit` writes every row in one serializable transaction, or none if any row has an error.
- Migration `20261005090000_legacy_voice_import` adds `Voice.legacySource` and `Voice.legacyId`, unique together. A later batch skips Voices that are already in CARE.
- Migrated Voices are created with:
  - a display ID `MIG-<YYYYMM of submit>-<seq>`;
  - status CLOSED, with one accepted closure cycle;
  - SUBMITTED, RESPONDED, CLOSED and RATED events at the historical WIB times;
  - `handlingOrganizationSource = 'LEGACY_IMPORT'`.

  Nothing is notified, classified or escalated. Private Voices get `showReporterIdentity = false`.

- NoRegs missing from CARE become INACTIVE workforce accounts. They get the org-import initial password, so a later HR file activates them.
- Voice search also matches `legacyId` (`voices.service.ts`). `actions.ts` hides RATE for migrated Voices, and `rate()` rejects them.
- Docs:
  - ADR-0061 `docs/adr/0061-legacy-voice-migration.md` (renumbered from 0060 on staging, commit e53f952);
  - runbook `docs/migration/README.md`, with the VPS `docker compose ... run --rm ... migrate` command, `--project-name` from `.runtime.env`, and `chown 65532` on the mount folder;
  - the template `docs/migration/Template_Migrasi_Voice_CARE.xlsx`, generated by `docs/migration/build_template.py`.
- `.gitignore` blocks filled workbooks and report CSVs in `docs/migration/`.
- Test: `apps/api/test/integration/legacy-voice-import.integration.test.ts`.

**Done on 27 October (`feat/migrated-voice-volume-only`, from `origin/staging` 1ad9d57):**

- The product owner chose "volume only": migrated Voices count in the totals, status, severity, category, area, organization and trend charts. They are left out of Tepat Waktu, the response/completion/rating averages, Performa Responder and Kinerja Saya, because their PIC is today's route owner, not the historical handler (`dashboard.ts` `performanceFor`, `dashboard-people.ts` `measure()`). ADR-0061 is amended.
- The importer sets `updatedAt` to the close time, so migrated history sorts below live Voices on the member home.
- Voice list items and detail return `legacySource`. The workforce cards show it as a small outlined tag beside the Voice ID or area, and the detail header shows the same tag (`LegacySourceBadge.tsx`, `.voice-legacy`). The tag text is exactly the "Platform Asal" value, so PICs must spell each platform the same way. Not shown in CARE Admin.
- Tests: `legacy-voice-import.integration.test.ts` (dashboard exclusions, sort, `legacySource`), and an e2e history case in `workforce-journeys.spec.ts`.

**Template columns (sheet `Voice`; header `*` = required):**

- Platform Asal*, ID Voice Lama*, Tanggal Submit*, Jenis Voice*
- NoReg/Nama Pelapor*; Directorat, Division*, Department*, Section Pelapor
- Lokasi (platform lama)_, Area CARE, Detail Lokasi_, Judul*, Isi Voice*
- Kategori (platform lama)*, Kategori CARE
- Prioritas (platform lama), Severity (orange: filled by the CARE team)
- Directorat, Division*, Department*, Section Penanganan
- NoReg/Nama PIC Terakhir*
- Tanggal Respon Pertama, Tanggal Ditutup*, Catatan Penyelesaian, Rating (1-5), Feedback, Catatan PIC

Format rules:

- Times are WIB, written `YYYY-MM-DD HH:MM`.
- Column rules are data-validation input messages, never cell comments: ExcelJS cannot load openpyxl comments.

**Open question (latest, not built):** the old platforms have **no "who handled it" data**: no PIC and no handling department. CARE requires a PIC (`Voice.routeOwnerId`, not null). The default dashboard (basis Penanganan) groups by the handling department snapshot; when it is missing, the Voice lands in "Organisasi belum teridentifikasi". The PIC also grants Department Heads detail access through `workItemScope`.

Proposed, awaiting the user's OK:

- Make the Penanganan and PIC columns optional. A filled value wins. When empty, derive them in the importer with CARE's routing (`resolveRoute` in `voices.service.ts`):
  - **General:** the category route gives the department. FIXED_DEPARTMENT uses that unit. RELATED_REPORTER_DEPARTMENT uses the reporter's unit. Fasilitas Kerja / Kesulitan Kerja is Related Dept since the ADR-0058 amendment (commit d3bd474), so no shop matching is needed. The PIC is that unit's active route owner (RouteMapping DEPARTMENT_HEAD/DEFAULT_DEPARTMENT, `effectiveTo` null, owner ACTIVE).
  - **Private:** the PIC is the current active Union Head (UnionAccountTerm HEAD).
- Trade-offs:
  - The PIC recorded is the current office-holder, not the historical handler.
  - A row whose reporter department no longer exists in CARE stays an error until Department Penanganan is filled by hand.
- The dry-run report says when a value was derived.
- Alternative rejected: a neutral "Platform Lama" PIC account. Department Heads of other units could not open those Voices.
- The work would touch:
  - `planLegacyImport` (derivation; load category routes, route mappings and the union head);
  - `REQUIRED_HEADERS`;
  - `build_template.py` (drop `*` on the Penanganan/PIC columns, with input messages saying they may be empty);
  - the test;
  - ADR-0061 and the runbook.

  It needs a new `feat/` branch from `origin/staging` and a PR (never push to staging directly).

**Caveats:**

- **Local test DB:** port 54329 may be taken by the `CARE-proto` Postgres; use a throwaway `pgvector/pgvector:pg16` on 54339 with `scripts/postgres-init.sql`.
- **Local test failures:** `admin-safety` (reset replay) and `api.integration` `/ready` fail locally even on clean staging.
- **CI:** `API (performance)` can fail marginally (p95 about 3.03 s against 3 s); rerun, never change the threshold.
- **Merging:** clicking Merge in the in-app browser was denied by the auto-mode classifier; the user merges PRs themselves.
- **Tiered closure (PR #97):** not yet checked against the importer, which writes one accepted closure cycle directly.

**Next:**

1. Get the user's answer on the handler derivation, then build it as above.
2. When the first filled workbook arrives:
   1. Import the latest HR file first.
   2. Fill Severity, Area and Kategori CARE.
   3. Dry run locally on a copy of the data.
   4. Run on the VPS following the runbook (Hostinger web console): dry run first, then `--commit`.
   5. Spot-check by searching the old ID.
   6. Delete the workbook and report from the server.

## Voice detail shows the current tier holder as PIC — 22 October 2026

**Problem:** until someone pressed Proses, the PIC line on a tiered Voice fell back to the route Manager. A Voice held by a Group Leader or Section Head showed the Manager.

**Change (PR #102, `fix/detail-pic-current-holder`, merged 1ad9d57):**

- `voices.service.ts`: the detail gains `holderNames` for an unprocessed General tiered Voice: the current level's holders (`tierHolderIds`) without the levels it went past (`tierLowerHolderIds`).
- The workforce `VoiceHero` and the Admin `VoiceDetailPage` show them before falling back to the route owner. OpenAPI and contracts were regenerated.

**Tests:** a `holderNames` case in `tiered-routing-foundation.integration.test.ts`.

**Release:** merged on 22 October. `satucare.com/ready` still reported `bc40796` (PR #101) when this entry was written; check `releaseSha` after the deploy finishes.

## Node 22.23.4 security release — 22 October 2026

**Problem:** Node 22.23.2 is affected by the 21 October 2026 security release, including the Brotli decoder out-of-bounds write (CVE-2026-111497). The API reaches that decoder without authentication, because Express 5 body-parser decompresses `Content-Encoding: br` bodies.

**Change (PR #100, `feat/bump-node-22.23.4`):** the three Dockerfiles pin `node:22.23.4-bookworm-slim` by digest; `.node-version`, the root `engines` floor, `.agent/rules.md` and ADR-0003 say 22.23.4.

**Local note:** the scratchpad portable Node used in earlier checks is 22.23.2; use 22.23.4 for new local runs.

## Fasilitas Kerja back to the reporter's department — 22 October 2026

**Objective:** Fasilitas Kerja / Kesulitan Kerja goes up the reporter's own chain, not to the incident shop's Manager. The product owner changed the category route in Admin › Kategori to Related Dept. They asked that every active Voice already sent to a shop move too, including Diproses (ADR-0058 amendment).

**Branch:** `fix/facility-route-reporter-dept` (worktree `../CARE-action`) from `origin/staging` 811c785.

**Changes:**

- `operations/reroute-reporter-department.ts` and CLI `dist/cli/reroute-reporter-department.js` (`--category`, default `WORK_DIFFICULTY`, dry run unless `--commit`).
- It refuses while the category still routes to the shop. Each Voice restarts at the first level of the reporter chain with a new window. Diproses becomes Direspon without the PIC and current target, and a pending closure report is returned. The move adds a timeline event, a chat note and a notification to the new holders.
- Runbook: `docs/migration/reroute-reporter-department.md`.

**Tests:** integration "moves active location-owner Voices back to the reporter department chain" in `tiered-routing-foundation.integration.test.ts`.

**Next:** after the deploy, the product owner runs the dry run and then `--commit` on the VPS (Hostinger web console).

## Admin password reset, responder logins, import completeness, full Voice detail — 22 October 2026

**Objective:** four CARE Admin requests from the product owner. Prototypes were rendered and approved before execution; ADR-0070 holds the rules.

1. Reset password is visible again and shows no temporary password.
2. Accounts summarizes responder logins, following the unit filters.
3. The import blocks incomplete leader rows and lets the admin complete them in place.
4. The Voice Explorer opens a full read-only detail page.

**Branch:** `feat/admin-improvements` (worktree `../CARE-login`) from `origin/staging` 03ceed8. Uncommitted at the time of writing.

**Changes:**

- **API:**
  - `GET /admin/accounts/responder-summary?division&department&section` and the accounts list `responderLevel` filter (`GROUP_LEADER|SECTION_HEAD|MANAGER|DIVISION|ANY`) match the normalized structural position.
  - The import preview stores `summary.abnormalities` for leaders with empty unit columns (Group Leader: Line, Section, Department, Division; Section Head: Section up; Department Head: Department up; Deputy/Division Head: Division). A blank Department counts as missing.
  - `PUT /admin/organization-imports/:id/rows/:noReg` fills missing cells, bumps the preview version and audits `ORGANIZATION_IMPORT_ROW_CORRECTED`. The edits go to `ImportBatch.corrections` (migration `20261022090000_import_row_corrections`), and processing applies them to the stored file's rows.
  - Confirm returns `IMPORT_INCOMPLETE_ORGANIZATION` while any row is incomplete.
  - Voice list items gain `ratingScore`, the detail gains `tierDueAt` for non-reporters, and timeline events gain `actorName` for CARE Admin and Division Admin.
  - OpenAPI and contracts were regenerated.
- **Admin UI:**
  - Accounts: a Reset action per row and a dialog without a temporary password; the read-only label is gone for the CARE Admin.
  - Accounts: a responder login card by level, following Divisi/Departemen/Seksi; a click lists that level's accounts that have not logged in. There is also a Responder filter, and the duplicate Nama column is merged into Username / Nama so actions fit at 1280 px.
  - Imports: a "data belum lengkap" table with inline inputs; Konfirmasi stays disabled until every row is complete.
  - Voice Explorer: the list shows reporter, category, PIC, time left and rating, and the title links to `/voices/:id`. That full page shows progress, severity, category, time left, PIC, detail, handling, tier stages, closure approval, chat, the completion comment with rating, reporter, timeline with actors and handover history. The old drawer is removed. Private Voices are marked on the reporter line.
- **Tests:**
  - `admin-improvements.integration.test.ts`: import abnormalities, edits, confirm block, applied corrections and audit; responder summary and level filter; list rating, detail `tierDueAt`, timeline `actorName`.
  - `e2e/admin-improvements.spec.ts`: reset dialog, responder summary following the Divisi filter, import inline edit, and list to detail.
  - Updated: `admin-explorer`, `admin-a11y` (clamp assertion on the title link) and `admin-fullstack` (reset from the row, reporter card on the detail page).
  - Mock: `responder-summary` and `login-summary` fixtures in `mock-api.ts`.
  - The browser test inventory goes from 460 to 463.
- **Docs:** ADR-0070 and the implementationPhases entry.

**Checks (Windows, portable Node 22.23.2, throwaway `pgvector/pgvector:pg16` on port 54349):**

- Passed:
  - ESLint, typecheck, `openapi:check`.
  - Unit tests: API 169, ui 26, frontend-core 14, web-admin 2, web-voice 137.
  - Admin browser specs (improvements, explorer, journeys, a11y, division, login tracking, pages visual): 71/71 on private ports with a scratch config.
- `verify:ci integration`: 170 integration and 14 security tests passed.
- `verify:ci organization`: 5 tests passed.
- `test:migration:upgrade`: all scripts passed, through the scratchpad `psql` shim.
- `verify:ci performance`: the first run measured an organization dashboard p95 of 3.7 s. It ran straight after the integration job on a busy laptop; this branch changes no dashboard code. Run alone, it passed at 1.5 s.
- Gitleaks `v8.24.3` directory scan, including uncommitted files: no leaks found.
- Windows-only failures, the same on clean staging: `validation.test.mjs` tests 6 and 8.
- **CodeQL on PR #99:** it reported "Remote property injection" (High) because the URL No. Reg became a JSON key in the stored corrections. `correctRow` now refuses `__proto__`, `constructor` and `prototype` and rebuilds the corrections through a Map with `Object.fromEntries`. The integration test covers `__proto__`.
- Not run locally: the fullstack job (`admin-fullstack.spec.ts` was updated for the new reset dialog and detail page), workforce browser, legacy and capture. CI covers them.

## Admin Voice Explorer shows the reporter of General Voices — 21 October 2026

**Problem:** the CARE Admin and Division Admins could not see who sent a General Voice. The API returns the reporter for their `LEADERSHIP_GENERAL_READ_ONLY` audience, but the Voice Explorer drawer only rendered the reporter for `ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY` (Private) and `GENERAL_RESPONDER`.

**Branch:** `fix/admin-voice-reporter` (worktree `../CARE-login`) from `origin/staging` 9a5593d.

**Changes:**

- `VoiceExplorerPage` renders the Reporter row for `LEADERSHIP_GENERAL_READ_ONLY` too.
- The OpenAPI `LeadershipGeneralVoiceDetail.reporter` now declares the fields the API already sends: `noReg`, `name`, `division` and `department` (required), plus nullable `directorate`, `section` and `position`. It used to be an untyped object. Contracts were regenerated.
- `e2e/admin-explorer.spec.ts` gains a General Voice test. The browser test inventory goes from 459 to 460.

**Checks (Windows, portable Node 22.23.2):**

- Typecheck and ESLint on changed files.
- Admin browser specs (journeys, a11y, explorer, division, login tracking): 57/57 on private ports.
- `verify:ci integration`: 167 integration and 14 security tests passed.
- Gitleaks `v8.24.3` directory scan, including uncommitted files: no leaks found.
- Not run locally: workforce browser, legacy, capture and fullstack jobs (CI covers them).

**CI repairs on the same PR (#98), unrelated to the fix:**

- `Dependency security`: `pnpm audit` reported a new high advisory for `vite` 8.2.0–8.2.3 (launch-editor `fs.existsSync()` bypass on Windows). The root `vite` dev dependency goes from 8.2.2 to 8.2.4 (released 6 October). The local `pnpm audit --audit-level high` then reported 10 moderate findings and no high ones.
- `Production containers and routing`: Alpine v3.24 main retired `libexpat=2.8.5-r0`. Both web Dockerfiles pin `2.9.0-r0`. The next run's Trivy scan then found CVE-2026-88806 (High) in `libx11` 1.8.13-r0 of the web-voice image, so both web images also pin `libx11=1.8.14-r0`. The pinned `apk add` succeeds on the pinned nginx base. ADR-0041 has the addendum.
- `Production containers and routing` (third run): Trivy found two High findings in the Caddy binary. They were `klauspost/compress` 1.18.6 (CVE-2026-63209) and Go stdlib 1.26.9 (CVE-2026-111943). `deploy/caddy/Dockerfile` now builds on `golang:1.26.10-alpine` (digest-pinned) and adds `klauspost/compress@v1.18.7`. A local build and a Trivy 0.70.0 scan of the image report 0 High/Critical.

## Tiered closure approval — 17 October 2026

**Objective:** the leaders above the PIC confirm the work before a Voice closes, depending on severity. ADR-0069 and PRD §17.1a hold the rules.

**Product owner decisions:**

- Low: the PIC closes. Medium/High: the Manager closes. Critical: the DDH/DH close. Private: the Komite closes.
- Below that level the PIC presses **Lapor Sudah Selesai**; every level above approves in turn, 2 working days each, a reminder every day.
- A missed window keeps waiting at that level (Terlambat).
- **Kembalikan** returns to the PIC; the next report restarts from the first level.
- The report counts as done for the PIC (Selesai oleh saya, completion time, timeliness). The closure is credited to the PIC.
- The reporter sees "Menunggu persetujuan atasan".
- In-flight Voices follow the new rules at once.
- The **Perlu Disetujui** tile shows only for leaders who can approve (not Group Leaders, not Section Heads without Group Leaders).
- UI chosen from rendered previews (`docs/preview-closure-approval/` in the main checkout, not committed).

**Branch:** `feat/tiered-closure-approval` (worktree `../CARE-action`) from `origin/staging` f2194de.

**Changes:**

- **Data:** migration `20261016120000_closure_approval` adds `ClosureReport`, `ClosureApprovalStep`, `Voice.closureApproverIds`/`closureReportedById`, `ClosureCycle.completedAt`, event types `CLOSURE_REPORTED`/`CLOSURE_APPROVED`/`CLOSURE_RETURNED`, notification types `CLOSURE_APPROVAL`/`CLOSURE_RETURNED`.
- **Rules:** `actions.ts` (`closerLevel`, `needsClosureApproval`, `REPORT_DONE`, `APPROVE_CLOSURE`, `RETURN_CLOSURE`); `closure-approval.ts` (approval steps from the tier chain, 2-working-day due).
- **API:** `POST /voices/{id}/report-done`, `/approve-closure`, `/return-closure`; detail `closureApproval`; dashboard `summary.toApprove` and `summary.approves`; work items `action=approve`.
- **Scopes:** approvers join the work-item scope; Butuh Tindakan Saya drops a reported Voice for the PIC and adds it for the approvers; Selesai oleh saya counts pending reports.
- **Metrics:** completion uses `COALESCE(completedAt, closedAt)` and counts pending reports per person; reported Voices are never overdue; `HandlingTargetService` skips them and sends the approval reminders and late notice.
- **UI:** `ActionPanel` (Lapor Sudah Selesai, Setujui, Kembalikan, Tutup Voice), `ClosureApproval` card, Perlu Disetujui tile and Voice Member filter.

**Tests:** unit (`actions.test.ts`, `policy.test.ts`), integration ("closes Medium and above through each level above the PIC" in `tiered-routing-foundation.integration.test.ts`).

## Division Admin (Admin Divisi) — 16 October 2026

**Objective:** one admin per division (the Manufacturing divisions and the Quality Division) watches that division's Voices in CARE Admin, follows up late or critical ones on the floor, and downloads them. They read like a Division Head but never act. ADR-0068 holds the rules.

**Product owner decisions:**

- Private Voices: counts only.
- General Voices: the admin sees the reporter's identity.
- No follow-up action inside CARE.
- One division per admin.
- The Excel export includes the chat.
- The admin also sees the division's accounts and who has logged in.
- UI: variant B. The admin lands on Voice divisi, which shows status tiles (Terbuka, Direspon, Diproses, Selesai), "terlambat" and "< 24 jam" chips, and a short collapsible summary.

**Branch:** `feat/division-admin` (worktree `../CARE-login`) from `origin/staging` 690728b. Uncommitted at the time of writing.

**Changes:**

- **Data:**
  - `AccountKind.DIVISION_ADMIN` is added in its own migration, `20261016090000_division_admin_kind`.
  - `UserAccount.adminDirectorate`/`adminDivision`, a check constraint and a partial unique index (one active admin per division) are in `20261016090100_division_admin_scope`.
- **Access:**
  - The `DIVISION_ADMIN` capability browses General Voices whose reporter directorate and division match its own.
  - Its read-only audience is `LEADERSHIP_GENERAL_READ_ONLY`.
  - `actions.ts`, `actionVoice` and `lockedActionVoice` refuse it.
  - No. Reg login and self-service reset reject it, and the workforce app does not admit it.
- **API:**
  - `GET /division-admin/overview` returns status counts, overdue and due-soon counts, the active critical count, Private counts, an 8-week trend, severity counts, top handling departments, top reporters and top PICs.
  - `GET /division-admin/export` returns an xlsx with Voice and Chat sheets (at most 5,000 Voices) and is audited as `DIVISION_VOICE_EXPORT`.
  - `GET /division-admin/accounts` and `/accounts/login-summary` return the division's workforce accounts and login counts.
  - `GET/PUT /admin/division-admins` let the CARE Admin list and create or replace a division's admin. The temporary password is the username, and a No. Reg username is refused.
  - Reactivating an old Division Admin while another is active returns `DIVISION_ADMIN_ACTIVE`.
  - OpenAPI and contracts were regenerated.
- **Admin UI:**
  - A Division Admin shell has Voice divisi and Akun divisi only. Every other route redirects to Voice divisi.
  - The Voice Explorer in division mode hides Visibility and handover history. It adds Batas waktu, status tiles with due chips, the collapsible summary and **Unduh Excel**.
  - The Accounts page in division mode shows the division's workforce accounts with login state and has no actions.
  - The CARE Admin gets a new **Admin Divisi** page.
- **Tests:**
  - `division-admin.integration.test.ts` covers provisioning, scope, refused actions, overview, Excel content, audit, division accounts and replacement.
  - `e2e/admin-division.spec.ts` covers the shell, tile filters, export, collapse, division accounts and the CARE Admin create flow.
  - The browser test inventory goes from 452 to 455.
- **Docs:** ADR-0068 and the implementationPhases entry.

**After release:** the CARE Admin creates the division accounts in Admin › Admin Divisi and hands each admin the username. The temporary password equals the username and must be changed at first login.

**Checks (Windows, portable Node 22.23.2, throwaway `pgvector/pgvector:pg16` on port 54349):**

- Passed:
  - Prettier on changed files, ESLint, typecheck, `openapi:check`.
  - Unit tests: API 165, ui 26, frontend-core 14, web-admin 2, web-voice 137.
  - `verify:ci integration`: 166 integration and 14 security tests.
  - `verify:ci performance`: 2 tests.
  - `test:migration:upgrade`: all scripts, through the scratchpad `psql` shim.
  - Admin browser specs (journeys, a11y, explorer, pages visual, login tracking, division): 67/67 on private ports with a scratch config.
- `verify:ci organization` timed out once on the 10,000-account import (145 s, while the machine was busy). A rerun alone passed 5/5.
- Windows-only failures, the same on clean staging: `validation.test.mjs` tests 6 and 8.
- Not run locally: workforce browser, legacy WebKit, capture and fullstack jobs. The workforce app only changed in `admitsAccount`; CI covers them.
- Gitleaks `v8.24.3` directory scan, including uncommitted files: no leaks found.

## iPhone Safari install guide — 16 October 2026

**Problem:** on current Safari for iPhone, Share sits inside the ⋯ menu (bottom right) and Add to Home Screen only appears after View More, so the old two-step text ("Tap Bagikan") did not match what people see. A page cannot open Safari's menu or add itself to the home screen; the Web Share sheet omits that action.

**Change on `feat/ios-install-guide` (from `origin/staging` 4327371):** the product owner picked the illustrated variant from rendered previews and supplied real iPhone screenshots.

- `InstallPage.tsx` `IosSafariGuide`: 3 steps with mini Safari mockups, target ringed in blue:
  - Tap ⋯ di kanan bawah.
  - Tap Bagikan / Share.
  - Pilih Tambahkan ke Layar Utama / Add to Home Screen, with Lihat Lainnya / View More shown in the mockup.
- `SafariArrow`: fixed bottom-right "Tap ⋯" label and a nudging arrow, `aria-hidden`. Static under reduced motion.
- `.install-page--ios`, `.install-shot*`, `.install-mock*`, `.install-arrow*` styles. Header hides the product name on this view.
- ADR-0067 amendment, implementationPhases.

**Tests:** the iPhone Safari journey asserts the three bilingual steps and that the arrow sits at the bottom right. Browser total unchanged (452).

**Checks (Windows, portable Node 22.23.2):** typecheck, ESLint, Prettier, production build, and the 5 install Chromium tests on port 4197 passed. The arrow position against Safari's floating bar on a real iPhone is not verified.

**Next:** PR to `staging`; after deploy, open `satucare.com/install` on an iPhone to confirm the arrow lines up with ⋯.

## Public install link — 16 October 2026

**Goal:** one link (`https://satucare.com/install`) that employees open to put CARE on their phone's home screen. A page cannot install itself, so the link offers the shortest path each browser allows. The product owner picked the centred-icon design (B) from three rendered variants (`docs/preview-install-link/`, untracked).

**Change on `feat/install-link` (from `origin/staging` aa44718):**

- `lib/install-prompt.ts`: captures `beforeinstallprompt` and `appinstalled` (called first in `main.tsx`), `promptInstall`, `detectInstallPlatform`, `chromeIntentUrl`.
- `features/install/InstallPage.tsx`: public `/install` route outside `SessionGate`, with these states:
  - Chromium prompt → **Instal CARE**.
  - iPhone Safari → Bagikan, Tambah ke Layar Utama.
  - Other iOS or in-app browser → **Salin link**.
  - Android in-app browser → **Buka di Chrome** (intent URL).
  - Fallback → menu, Instal aplikasi.
  - After `appinstalled` → **Buka CARE**.
  - Opened from the installed app (standalone) → redirect to `/`.
- `.install-*` styles appended to `apps/web-voice/src/styles.css`. ADR-0067, implementationPhases.

**Tests:** `install-prompt.test.ts` (5 unit tests); 4 journeys in `e2e/workforce-journeys.spec.ts`; `/install` added to the a11y route list. Browser total in `scripts/validation/validation.test.mjs` 447 → 452.

**Checks (Windows, portable Node 22.23.2):** web-voice typecheck, ESLint, Prettier, the new unit tests, the 5 new Chromium tests against this checkout's production build on port 4197, and the CI partition inventory (452) all passed. Not run locally: full `verify:local`, legacy WebKit, fullstack, captures. Real-device install on Android/iPhone not yet tried.

**Next:** PR to `staging`, merge when CI is green, check `/ready`, then try the link on a real Android phone and iPhone.

## Read notifications stay openable — 15 October 2026

**Problem:** on every workforce account a notification could be opened only once. `NotificationsPage` rendered "Buka" only while `readAt` was null, so after the first open the row lost its button and its deep link.

**Change on `fix/reopen-read-notifications` (from `origin/staging` a897c7f):**

- `NotificationsPage.tsx`: "Buka" shows when the row has a deep link or is unread. Clicking it marks read only if the row is unread, then navigates to the deep link. Read rows without a deep link still have no button.
- No API, contract or styling change.
- ADR-0023 amendment; implementationPhases entry.

**Tests:** new mocked journey in `e2e/workforce-journeys.spec.ts` (read row with deep link → Buka → `/voices/voice-1`, no mark-read PATCH). Browser total in `scripts/validation/validation.test.mjs` raised to 447 (446 after PR #92's birth-date test, plus this one); the first PR run failed `quality` on the stale 446 until staging was merged in.

**Checks (Windows, portable Node 22.23.2):**

- Passed: web-voice typecheck, ESLint and Prettier on changed files; the 7 notification-related Chromium tests (journeys, security, a11y) against this checkout's production build on port 4197; the CI partition inventory test (446) with a pnpm shell preload.
- Against the other session's Vite dev server on 4173, 5 existing notification tests failed on Web Push detection; this is a dev-server difference, and they pass on the preview build.
- Not run locally: full `verify:local`, legacy WebKit, fullstack and captures (no visual change for the default fixture). Hosted CI not run yet.

**Next:** commit, push, open a PR to `staging`, then check `/ready` after merge.

## Friendlier auth pages in Poppins — 15 October 2026

**Change (PR #92, `feat/login-poppins-font`):**

- Login, first-login password and Lupa Password pages use self-hosted Poppins (`@fontsource/poppins`) with bolder headings.
- Login card: one heading "Masuk ke akun Anda"; the subtitle, the No. Reg helper and the period after "Selamat datang di CARE" are gone. Visible "login" wording becomes "masuk".
- First-login page asks to "Buat password baru" (no more "password sementara"); the rule is a short field helper. Back to "halaman masuk" is a quiet link.
- **Fix:** on Lupa Password, picking Bulan or Tahun no longer clears Tanggal; the day is cleared only when the new month cannot hold it (`birth-date.ts`).
- ADR-0036 note.

**Tests:** `birth-date.test.ts`, a new birth-date journey in `auth-recovery.spec.ts`, updated auth expectations. Browser inventory +1 (446).

## Mandatory first password change — 15 October 2026

**Problem:** imported workforce accounts start with the No. Reg as password, and login/start opens a restricted session from the No. Reg alone. **Lain kali** then unlocked that session, so anyone who knew an unchanged No. Reg could use CARE as that employee.

**Change on `fix/require-password-change` (worktree `../CARE-pwforce`, from `origin/staging` 5b42f35):** ADR-0066 supersedes ADR-0040.

- **API:**
  - `deferPasswordChange` and `POST /api/v1/auth/defer-password-change` are removed.
  - `AuthGuard` uses `session.passwordRestricted || account.passwordChangeRequired`. Earlier deferred sessions are restricted again on their next request: only session, CSRF, change-password and logout respond, and `GET /auth/session` reports `passwordChangeRequired: true`.
  - `changePassword` lets a `WORKFORCE` account with the flag set and the default hash omit the current password, whatever the session's stored flag.
- **Contracts and client:** OpenAPI and `generated.ts` were regenerated. Defer is removed from the transport and `useAuth`.
- **web-voice:** the Lain kali button, its handler, error copy and `.auth-defer__button` CSS are gone. The screen now has Kembali ke login, the two password fields and Simpan password. web-admin had no defer action.
- **Tests:**
  - API integration covers the 404 endpoint, a DB-unrestricted session staying restricted, change from that session and access afterwards.
  - Mock browser specs cover no Lain kali, protected routes redirecting to `/change-password` and Union needing the current password.
  - Fullstack specs set real passwords: member `care-member-e2e-123`, manager 000003 `care-manager-e2e-123`.
  - The deferral visual scenario was removed. Captures go 184 → 183 and the browser total 447 → 445 (confirmed with `playwright test --list`, FULLSTACK on). The local gallery entry and PNG for `workforce-password-defer-360` were deleted.
  - `workforce-password-change-360.png` (darwin) still shows the old button until the next macOS capture.
- **Docs:** PRD auth rules, ADR-0066, ADR-0040 marked superseded, ADR-0048 status note, implementationPhases.

**Checks (Windows, portable Node 22.23.2, throwaway `pgvector/pgvector:pg16` on 54349):**

- Passed:
  - Prettier on changed files, ESLint and typecheck.
  - Unit tests: API 165, ui 26, frontend-core 14, web-admin 2, web-voice 127.
  - API integration 163/163 (organization-routing excluded, as in CI) and security 14/14.
  - Affected mocked Playwright specs (voice-consent, workforce-a11y, auth-recovery, workforce.visual): 96/96 against this worktree's build on port 4193.
  - Fullstack `a-workforce` 3/3 and `z-auth-recovery` 1/1 against the real API.
- Not run locally: the admin fullstack, legacy and performance jobs, and `test:validation` (cannot spawn pnpm on Windows). Hosted CI not run yet.

**Accepted risk:** the default-credential path still identifies an account by No. Reg alone, so whoever finishes the change-password screen first owns the account. A birth-date step on first login was prototyped. The product owner declined it and keeps No. Reg followed by a new password.

## Closed Voice chat keeps its full message height — 15 October 2026

**Problem:** in a closed (read-only) chat the info banner "Percakapan telah selesai" sat in the fixed area above the log. At 360 × 800 only ~156 px was left for messages, so the chat looked cut off.

**Change on `fix/closed-chat-full-height` (from `origin/staging`):** `ConversationPage` no longer renders the read-only `Alert` in the fixed head. A small `chat-system` note ("Percakapan telah selesai", or "Akses hanya baca" for non-closed read-only access) now ends the message log. The "Hanya baca" pill stays beside the heading. At 360 × 800 the log grows to ~294 px. The product owner picked this variant over whole-page scrolling for read-only rooms. ADR-0019 amendment.

**Tests:** new Playwright test in `e2e/voice-lifecycle.spec.ts`; browser total in `scripts/validation/validation.test.mjs` raised to 447. Local: lifecycle spec passed (two `calendar target` widths flaked under parallel load against the Vite dev server and passed on rerun), plus web-voice typecheck, eslint and Prettier on changed files. The partition count test could not spawn `pnpm` on Windows, so the +1 was confirmed with `playwright test --list` (440 → 441, fullstack excluded). Hosted CI not run yet.

## Missed tier levels keep acting — 15 October 2026

**Product owner decision:** when a tier window passes, the level that missed it stays responsible. It keeps its normal actions at its own level (a Section Head still assigns a Group Leader of its Section), except Naikkan. The miss still counts against it, and Tahap penanganan shows it as **Terlambat**. Whoever raises a Voice by hand still keeps the chat only. ADR-0059 amendment; PRD §43.2.

**Changes on `feat/missed-tier-keeps-actions`:**

- **`TierEscalationService`:** unanswered and handed-up escalations keep the previous holders in `tierHolderIds` and `tierLowerHolderIds`, as the answered case already did.
- **Manual escalate:** moves only the raisers to `tierParticipantIds`.
- **`actions.ts`:**
  - `ownTierLevel` and `actingTierLevel` let a missed holder assign within its own level.
  - Naikkan is refused once a level below has answered.
  - Ingatkan is also offered while the Voice is Terbuka.
- **Assignment:** validation and candidates use the acting level.
- **Tahap penanganan:** a `LATE` stage state.
- **web-voice:**
  - `TierStages` shows Terlambat.
  - `ActionPanel` shows Ingatkan beside Respons while Terbuka.

**Local browser testing:** another session's Vite servers held ports 4173/4174. The Voice-app specs ran against this worktree's build on port 4183 with a temporary uncommitted config.

## Account login tracking — 15 October 2026

**Objective:** let the CARE Admin see, per division (and department/section), which workforce accounts have logged in. Before this, the Audit `USER_LOGIN` filter matched nothing and accounts had no login date. ADR-0065 holds the rules.

**Branch:** `feat/login-tracking` (worktree `../CARE-login`) from `origin/staging` 52a7b6b. Uncommitted at the time of writing.

**Changes:**

- **API:**
  - `AuthService.login` and `startLogin` write `USER_LOGIN` audit events. `SUCCESS` records `{ method, firstLogin }`, the IP hash, user agent and session reference. `FAILED` is written after the rolled-back transaction with `{ method }` and the account id only when the account exists. Identifiers and passwords are never stored.
  - Migration `20261015090000_account_login_tracking` adds `UserAccount.firstLoginAt`/`lastLoginAt` (nullable, existing accounts stay `NULL`). A login sets them with raw SQL, so `version` and `updatedAt` do not change.
  - `GET /admin/accounts` gains `division`, `department`, `section` and `loggedIn=true|false`, and returns the login dates.
  - New `GET /admin/accounts/login-summary?division=&department=` returns total, logged-in and not-logged-in counts of active workforce accounts in the active snapshot, grouped one level down, plus `trackingSince` (the migration's `finished_at`).
  - OpenAPI and contracts were regenerated.
- **Admin › Accounts (variant B of three rendered options):**
  - New "Login terakhir" column ("Belum pernah" when empty).
  - Divisi, Departemen and Seksi filters, plus a Login filter (Sudah/Belum). Choosing a login state also sets Workforce and Aktif, matching the summary counts.
  - With a division chosen, a summary card shows Akun aktif, Sudah login and Belum login tiles (the last two filter the list) and one bar per department or section (a click drills down).
  - "Ekspor belum login" pages through the filtered list and downloads a CSV.
- **Tests:** `login-tracking.integration.test.ts` (audit sanitization, timestamps, filters, summary, non-admin denied) and `e2e/admin-login-tracking.spec.ts` (filters, request parameters, CSV). The browser test inventory in `validation.test.mjs` goes from 445 to 446.
- **Docs:** ADR-0065 and the implementationPhases entry.

**Release note:** counts start at deploy. Everyone shows "Belum pernah" until their first login after the release.

**Checks (Windows, portable Node 22.23.2, throwaway `pgvector/pgvector:pg16` container on port 54349):**

- Passed:
  - Prettier on changed files, ESLint, `git diff --check`, typecheck.
  - `openapi:check`.
  - Unit tests: API 164, ui 26, frontend-core 15, web-admin 2, web-voice 127.
  - `verify:ci integration`: 163 integration and 14 security tests.
  - `verify:ci organization`: 5 tests.
  - `verify:ci performance`: 2 tests on the 50k seed.
  - `test:migration:upgrade`: all seven scripts, run through a scratchpad `psql` shim into the container.
  - Admin browser specs (journeys, a11y, explorer, pages visual, login tracking): 64/64 on private ports 4373/4374 with a scratch config (not committed), because other sessions held 4173/4174.
- Failed locally on clean staging as well (Windows only), not caused by this change:
  - `validation.test.mjs` tests 6 (build seal) and 8 (Compose fixtures).
  - `verify:ci build` stopped at the manifest seal because of Windows path separators. Every build step before the seal passed.
- Not run locally: workforce browser, legacy WebKit, capture and fullstack jobs. The change does not touch web-voice; CI covers them.
- Gitleaks `v8.24.3` directory scan, including uncommitted files: no leaks found.

## Workforce a11y runs axe on the settled page — 15 October 2026

**Problem:** the staging run for PR #86 failed because axe measured the Komite Private inbox mid-fade (the Voice Member list fades in since PR #85) and reported 4.25:1 contrast.

**Change (PR #87, `fix/a11y-settled-animations`):** `e2e/workforce-a11y.spec.ts` waits for finite animations to finish before axe runs; endless spinners are not waited on. Test-only.

## Private Voice → Komite with directorate observers — 14 October 2026

**Product owner decision:** Private Voices are handled by the Komite (the existing Union Head account) alone. The Director and all Deputy/Division Heads of the reporter's directorate read the Voice and its chat. ADR-0064 and PRD §14.1 hold the full rules.

**Changes on `feat/private-komite-routing`** (worktree `../CARE-action` from `origin/staging` 349d775):

- **API:**
  - `PolicyService.privateObserverScope` sets the read scope. Director browse is limited to their own directorate's Private.
  - `private-observers.ts` lists the notification recipients.
  - The submit notice goes to the Komite and the observers.
  - Private gets respond and process windows. A miss calls `missedAtRouteOwner`, which notifies the observers and adds a chat note without escalating. A missed handling target also notifies the observers.
  - The `PRIVATE` category bucket appears in the Deputy/Division Head aggregate.
  - `GET /work-items?visibility=PRIVATE` works for Deputy/Division Heads.
  - No `ASSIGN` for Private. The Komite can `TAKE_OVER` from a deactivated Officer.
  - Deputy/Division Head Private reads are audited.
  - The route label is "Komite".
- **Admin:**
  - Deactivating a Union Officer ends its slot.
  - Imports no longer raise `UNION_OFFICER_MISSING`.
  - Overview counts only the Komite slot.
- **web-voice:**
  - Union labels become Komite.
  - The assignment queue, Penugasan filter, PIC Union filter and pending KPI are removed.
  - The reporter wizard says "Identitas kepada Komite".
  - Deputy/Division Heads get the Jenis filter.
  - The hero hides a role equal to the account name.

**Open after release:** CARE Admin deactivates Union Officer 1 and 2 in Admin › Accounts, and the trial Voices are deleted.

**Merged with PR #85 (Voice Member tabs):** a Deputy/Division Head switching Jenis to Private leaves the tabs. The Private list is read-only and shows no tab bar.

## Voice Member three lists — 14 October 2026

**Objective:** stop Voice Member from mixing two populations in one list. The product owner chose three tabs (**Butuh Tindakan Saya · Voice Untuk Unit · Voice Tim Saya**) in the segmented style (variant A), pressed/toggling summaries with tap feedback, 2×2 phone tiles with 12 px labels, and no marker on team cards.

**Branch:** `feat/voice-member-tabs` from `origin/staging` 349d775 (includes PR #83/#84). Uncommitted at the time of writing.

**Changes:**

- **API:**
  - `GET /work-items?scope=team` uses the reporter-basis dashboard context ∩ `detailScope`, General only.
  - Any other `scope` value returns `SCOPE_FILTER_INVALID`.
  - OpenAPI and contracts were regenerated.
- **web-voice:**
  - `WorkItemsPage`: the tabs (Group Leader gets two), per-tab header copy, totals from the preview (handling and reporter), and filters per tab. Tab switches keep the organization selection. Legacy links resolve through `resolveTab`.
  - `ActionSummaryCard`: an `active` pressed state, the short "< 24 jam" phone label, and one chip row.
  - Home links carry `tab`. **Pantau** now opens `tab=team&due=OVERDUE` (it used to open the handling list).
  - CSS: `.vm-tabs`, the press/hover/pressed motion (off under reduced motion), and the 2×2 phone tiles (also on Home).
- **Docs:** PRD §18.8.6 update of 14 October, ADR-0064, and the implementationPhases entry.

**Checks:**

- Typecheck passed (API, web-voice).
- Unit tests passed: API 160, web-voice 127.
- Integration suites that call `workItems` passed 70/70 (dashboard-people, responder-matrix, tiered-routing-foundation, union-inbox, voice-lifecycle) on a throwaway `pgvector/pgvector:pg16` container on port 54339.
- Browser runs used the Vite dev server with a scratch config (not committed):
  - `dashboard`, `workforce-handover`, `workforce-journeys` and `member-voice`: everything passed except the Web Push notice test. It fails identically on unmodified staging with the dev server.
  - `workforce-a11y`, `workforce-security`, `voice-lifecycle`, `assignment-scroll` and `foundation` passed 66/66.
  - Legacy WebKit passed 6/6.
- Screenshots were reviewed at 360 and 1440 px.

**Not run locally:** visual capture against a verified build, the full integration and performance suites, and full-stack. Hosted CI is authoritative.

**Next:** commit, open the PR to `staging`, and watch CI (performance in particular, since the team list adds a reporter-basis query path).

## Butuh Tindakan Saya and Status Voice layout — 13 October 2026

**Follow-up after PR #83:** a Deputy Division Head saw "4 Voice" with all four tiles at 0. Those tiles (lewat batas, < 24 jam, belum direspons, kritis) overlap and do not split the total. The four Voices were Direspon with more than a day left.

**Product owner decisions:**

- **Butuh Tindakan Saya (personal):**
  - Perlu Direspon / Perlu Diproses / Perlu Diselesaikan add up to the total.
  - A green **Selesai oleh saya** tile beside them.
  - Personal urgency chips only when non-zero.
  - Smaller tile labels, matching Status Voice.
- **Status Voice (unit):** a **Perlu perhatian** row right under the tiles (unit urgency, including Voices still held below). The red/blue/green status bar is removed from this card.

**Changes on `feat/action-card-breakdown`** (worktree `../CARE-action` from `origin/staging` 196353b):

- **API:**
  - `PolicyService.closedByScope`.
  - The preview summary gains `responded`, `inProgress`, `closedByMe` and `attention`.
  - `GET /work-items?action=closed`.
- **web-voice:**
  - `ActionSummaryCard` rewritten, with `AttentionRow` in `StatusCard` (handling view only).
  - The Voice Member **Tindakan** filter gains "Selesai oleh saya".
  - The status bar stays on the Voice Saya history page.

**Validation:** dashboard people, tiered routing and organization dashboard integration 54/55 (the calendar test fails on clean staging with this local DB too), plus the updated dashboard browser tests.

## Butuh Tindakan Saya is the viewer's own — 13 October 2026

**Reported on staging:** a Division Head got the escalation notification and saw Proses / Ingatkan when opening the Voice from it. The same Voice was missing from Butuh Tindakan Saya, and the Voice Member list showed it next to many Voices without actions.

**Cause:** Butuh Tindakan Saya counted every active Voice in the handling unit, not the ones waiting for the viewer. For a Division Head that is the whole division, so the raised Voice rarely won "Paling mendesak" (at the top of the chain its deadline is cleared and sorts last). Section Heads and Group Leaders never saw tiered Voices at all, because the unit scope matches `handlingSectionSnapshot`, which a tiered Voice only gets on assignment.

**Changes on `feat/action-needed-summary`** (worktree `../CARE-action`, from `origin/staging` 4d420bf):

- **`PolicyService.actionNeededScope`** defines "waiting for me" (PRD §18.8.6 update of 13 October; ADR-0060 follow-up).
- **`GET /dashboard/preview`:** the summary counts and the new `actionItems` use that scope for General. `items` (inbox) and `summary.status` keep the unit cohort.
- **`GET /work-items?action=me`:** lists the same Voices; anything other than `me` returns `ACTION_FILTER_INVALID`.
- **web-voice:**
  - The summary card picks "Paling mendesak" from `actionItems`.
  - The tiles and "Lihat selengkapnya" open `/work-items?action=me` without the dashboard filters.
  - Voice Member has the **Tindakan → Tindakan saya** pill (label A, chosen by the product owner).
  - The leadership hero no longer says read-only.

**Validation:** tiered routing integration (new case: Section Head, Manager and Division Head steps and the PIC after Proses), dashboard integration 37/37, the two dashboard browser tests, typecheck and lint. The calendar test in the tiered suite fails locally on clean staging too (reused DB).

## Director dashboard revisions — 13 October 2026

**Change (PR #82, `feat/director-dashboard-revisions`):** ADR-0063 amendment, PRD note.

- The Director's Private tab uses the operations board: Status Voice with trend, Sebaran Private Voice (severity, handling per Union PIC), Kecepatan, and Private terbaru with reporter aliases. Reporter origins stay General-only.
- The Department 14 placeholder is left out of the organization filter unless it is the viewer's own unit.
- An area filter narrows Performa Responder and Partisipasi Anggota to people with that Pers Area and counts only Voices in it.
- Back from the chat returns to the Voice detail, then to the Voice Member list, instead of looping between detail and chat.

**Tests:** `dashboard-people`, `organization-dashboard` and `union-inbox` integration cases; `dashboard.spec.ts` and a back-navigation journey in `workforce-journeys.spec.ts`.

## Director operations dashboard with read-only Private — 13 October 2026

**Decision (ADR-0063, PRD §18.8.7):** the Director uses the operations board without the basis switch, Butuh Tindakan Saya or Diri Saya, and sees Performa Responder, Partisipasi and Aktivitas Anggota across the whole organization. The Director reads every Private Voice read-only.

**Change (PR #81, `feat/director-dashboard`):**

- **Private read:** a General/Private tab on Home, a Jenis filter in Voice Member, consent-based identity like Union, no actions, and every Private read audited like CARE Admin.
- **Performa Responder:** the Director compares Division Heads first (role `DIVISION`, labelled by division); viewers below the Director never see Division Heads as rows. On phones the four role tabs wrap two by two.
- Division Heads respond like Managers, so their Read-only chip is gone.
- **Performance:** the per-person responder measure groups each figure in one pass instead of correlated subqueries per person. On the 50k-Voice profile: Director 116 s → 2.7 s, Division Head 2.5 s → 0.43 s.

**Tests:** `dashboard-people` and `union-inbox` integration, `policy.test.ts`, Director and Division Head tests in `dashboard.spec.ts`, the Director Private list in `workforce-journeys.spec.ts`. Browser inventory 441 → 443.

## Penanganan Khusus CI follow-up — 12 October 2026

The first CI run of the branch failed three jobs, none from the feature logic:

- **Migration guard.** `scripts/check-migrations.mjs` rejected every `DROP`, including the `DROP NOT NULL` the new migration needs. It now accepts `DROP NOT NULL` and still rejects dropping tables, columns, types or data.
- **Trivy.** CVE-2026-4775 (HIGH) in Alpine `tiff` 4.7.1-r0 inside the nginx runtime of both web images; fixed in 4.7.2-r0. Both Dockerfiles now pin `tiff=4.7.2-r0` with the other patched packages, the same approach as the OpenSSL and expat pins.
- **API (performance).** The first run hit `P2028`; the rerun measured a real p95 of 4,882 ms against 2,300 ms on staging. The benchmark's Manager actor takes the operations path, where the new special-handling test ran as a correlated `EXISTS` per Voice. It is now a single materialized `special_targets` lookup matched as a row-value `IN`. Locally on the 50,000-Voice fixture the benchmark measured 1,519–1,674 ms.
- **Trivy, second finding.** With `tiff` fixed, the Caddy image reported four HIGH findings: Go stdlib 1.25.13 and `golang.org/x/net` v0.58.0 (CVE-2026-78667, -78669, -97031). `deploy/caddy/Dockerfile` now builds on `golang:1.26.9-alpine` with `x/net` v0.60.0, which pulls `x/crypto` v0.57.0 and `x/text` v0.42.0. A local build of the image scans clean with Trivy 0.70 (HIGH/CRITICAL, 0 findings; the Go binary and the Debian base).

## Penanganan Khusus — 12 October 2026

**Objective:** let a PIC process a Voice that needs long discussion (for example a budget decision) without inventing a duration. Implemented on `feat/legacy-voice-import`, uncommitted and not released. The product owner chose the two-tab sheet (variant B) and the Simpan label.

**Decisions (PRD §15.5, ADR-0062):**

- **Penanganan Khusus is a target kind, not a fifth status.** The Voice stays Diproses with a small badge. Statuses remain Open, Direspon, Diproses, Selesai.
- Target sheet uses two tabs (variant B, chosen by the product owner): **Target hari** (free number input, always editable; Hari ini/1/3/7/14 only fill it) and **Penanganan Khusus** (reason 1–500 characters, no duration). The special tab button reads **Simpan**, not "Mulai diproses".
- No reminder, overdue notification, Terlambat badge, or remaining-time label. The reporter sees the badge and the reason; the reporter and Department Head are notified.
- **Close is refused** under special handling (`SPECIAL_HANDLING_REQUIRES_TARGET`); Close becomes Tetapkan target. The PIC may convert it to a day target once, one way. Time counts from the conversion.
- Reopen cycles and legacy no-target cycles stay closable as before.
- Dashboard: excluded from on-time and late, shown as a separate "Penanganan Khusus: N".
- No review date for now; it can be added later.

**Files changed:**

- Docs: `.agent/PRD.md` (§15.2, §15.5, §18.8.6, acceptance checklist, locked rules), `docs/adr/0062-special-handling-target.md`, this handoff, `.agent/implementationPhases.md`.
- Schema: `schema.prisma` and migration `20261012090000_special_handling_target` (kind enum, reason columns, nullable days/deadline, shape CHECK).
- API: `voices.service.ts` (schemas, `applyHandlingTarget` create/convert, close guard, list/detail serialization), `actions.ts`, `handling-target.ts`, `handling-target.service.ts` (null-safe worker), `dashboard.ts`, `dashboard-people.ts`, `voice.contracts.ts`; OpenAPI scripts, `openapi.json`, `packages/contracts/src/generated.ts`.
- Workforce UI: `ActionPanel.tsx` (`TargetPicker` tabs shared by the target dialog and the Respons sheet), `HandlingTargetCard.tsx`, new `SpecialHandlingBadge.tsx`, `VoiceHero`, `VoiceCard`, `InboxVoiceCard`, `HistoryVoiceCard`, `OpsDashboard`, `DashboardPeople`, `styles.css`.
- Tests: `actions.test.ts`, `handling-target.test.ts`, integration `voice-lifecycle` and `dashboard-people`, e2e `voice-lifecycle.spec.ts` plus mock API, browser inventory 437 → 438 in `validation.test.mjs`.

**Next recommended action:** review the diff, commit, and let hosted CI run the gates that were not run locally. Open question carried over: a review date for Voices that stay in Penanganan Khusus is deferred (ADR-0062).

**Checks run (Windows, scratchpad Node 22.23.2 / pnpm 11.8.0, throwaway pgvector container on 54339, since removed):**

- API and web-voice typecheck, ESLint on changed files, Prettier on changed files (with `--end-of-line auto`).
- Unit: API 164, web-voice 127, UI 26, frontend-core 15, Admin 2, all passing.
- Integration: `voice-lifecycle` and `dashboard-people` 34/34 against the migrated database, including the new Penanganan Khusus cases (process, close refusal, silent worker, one-time conversion, dashboard exclusion).
- Chromium e2e: `voice-lifecycle` and `dashboard` 43/43, including the new sheet test and axe on the dialog.
- Rendered the sheet and detail at 390 px and checked them against the mock.
- Gitleaks directory scan: no leaks.
- Not run locally: visual captures, legacy WebKit, full-stack, performance gate and the migration upgrade harness are left to hosted CI.

## Fixed-category deadlines — 8 October 2026

- **Product rule:** every General Voice has a deadline.
  - Fixed categories get the per-severity respond window at submit, and the process window once the Manager answers.
  - A miss while the Voice is still with the route owner notifies the Manager ("segera respons/proses") and the handling division's DDH/DH, once per deadline. It does not escalate.
  - A PIC's miss keeps the existing Manager-tier behaviour.
  - Old active Voices are backfilled.
- **Schema:**
  - Migration `20261008090000_fixed_category_deadlines`: `VoiceEventType.DEADLINE_MISSED` and `Voice.tierMissedDueAt`.
  - Notifications reuse `TARGET_OVERDUE`.
- **Worker:** `missedAtRouteOwner`, `backfillFixed`. The due query is now raw SQL so it can compare `tierMissedDueAt` with `tierDueAt`.
- **Timeliness:** `DEADLINE_MISSED` counts as late in `dashboard.ts` flags and the people measure. It is counted in held but not as "Naik otomatis".
- **Cards:** `targetDueAt` on list items; Diproses cards count down to the target.
- **Docs:** PRD §43.8, ADR-0059 follow-up.

## Security gates on 8 October 2026

The PR for the Kecepatan toggle passed every application job but failed three gates. None of them came from that PR.

- **New advisory: `sharp` < 0.35.5.** GHSA-wq5f-xc86-pv6w, a librsvg CVE, rated high. It failed both the Dependency security job and the Trivy filesystem and image scans. Fix: the API now pins `sharp` 0.35.5 directly. The image smoke test works.
- **OpenSSL exception expired (ADR-0057).** It expired on 7 October as designed. Trivy 0.75.0 no longer flags patched Debian 13 OpenSSL, so the policy, the `ignore-policy` setting, the validator branch, and the registry entry were removed. The registry is now `[]`. The patched package overlay stays in place.

## Personal figures on Kecepatan — 7 October 2026

- **Decisions (previewed with screenshots):**
  - Leaders with responders below switch Kecepatan between Department, Section, or Division and **Diri Saya**.
  - On phones the toggle is full width under the title.
  - The smallest responder (a Group Leader, or a Section Head without one) sees only "Kecepatan Respons & Penanganan Saya" with personal figures.
- **API:** `GET /dashboard/me` (DashboardPeople.mine). It shares a per-person `measure()` with `/dashboard/handlers` and adds completion over the person's own closures. Group Leaders may call it; Director and Union may not.
- **Leaf detection:** `peopleInsights` is false (Group Leader), or `/dashboard/handlers` returns no people.
- **Tests:**
  - A new integration test covers GL, Section Head, and denied viewers, and checks the SH figures against the Manager's row.
  - Two e2e tests cover the toggle and the leaf title.
  - Browser inventory is 440.

## Voice Member counts match Home — 6 October 2026

After PR #73 went live (rilis `624a9ce`, deployed via PR #74):

- **Reported bug:** the Voice Member status row differed from Status Voice on Home. Home showed 4/8/4/7; the row showed 10/4/2/4. The row read the legacy aggregate, which has a different scope.
  - Fix: the row now reads `/dashboard/preview` `summary.status`, the same cohort as Home.
- **Product owner chose option A:** for unit heads and leadership, the Voice Member list uses the same cohort (`GET /work-items?scope=unit` plus the organization params carried from Home). Voices held by the Section Heads and Group Leaders below are listed. Union is unchanged.
- **Staging deploy on 6 October:**
  - Blocked first by a flaky fullstack auth-recovery test.
  - A failed-only rerun leaves no `capture-*-<attempt>` artifacts, so the reports job fails; use "Re-run all jobs".
  - Then blocked by new advisories for `proxy-addr` and `source-map-js`, pinned in PR #74.
- **ADR numbering:** the legacy Voice migration ADR moved from 0060 to 0061 (PR #75).

## Butuh Tindakan Saya, Voice Member ordering, and dashboard layout — 6 October 2026

Product owner decisions after PR #71, each previewed with screenshots first:

- **Filter row:** the select pills lost their hidden-label field gap, so every chip sits on one line.
- **Spread cards:** level tabs and "Lihat satu level lebih luas" are removed from both. The organization filter sets scope and level.
- **Butuh Tindakan Saya (version B):** a summary under the profile.
  - Counts come from `/dashboard/preview` `summary`; each count opens Voice Member with a matching filter.
  - New list filter `due=OVERDUE|SOON` shares one predicate (`dueFilter`) with the summary.
- **Trend:** clickable buckets with counts. The peak is picked by default, and on handling the bucket links to Voice Member for that period. The total was removed.
- **Voice Member:**
  - **Header:** title and one line only.
  - **Summaries:** the summary card plus a compact status row.
  - **Filters and ordering:** a Tenggat filter and Urutkan (`sort=action|newest|severity`; default `action` for General responders, `severity` for Union).
  - **Cards:** show Sisa/Terlambat.
- **"Direspons" → "Direspon"** everywhere active (apps, tests, PRD, PRODUCT.md, DESIGN.md). Historical ADRs and handoff entries are unchanged.

**Validation:**

- **API:** typecheck, unit tests 160/160, security 14/14. Integration passes except the known local `admin-safety` timeout. A new test covers the summary, the `due` filters, and the action and newest orders.
- **Browser:** Chromium/PWA/push 239/242.
  - The two failures that remained after reruns (dashboard date filter, auth recovery) pass 6/6 alone; they flake only under parallel local load.
  - The push-support message failure is the known local-build issue.
- **Visual:** 184/184. Browser inventory is 438.

## Operations dashboard refinements — 5 October 2026

After PR #70 reached staging, the product owner confirmed it works and decided:

- **Performa Responder in non-shop departments.** No Group Leaders; Section Heads only. `DashboardPeople.handlers` drops Group Leaders whose organization unit has no active `ShopLocation`. The role tabs come from the data, so the Group Leader tab disappears.
- **Profile card.** Cobalt (`--gradient-brand-hero`) with white text, chosen as version A over a full-bleed band (version B).
- **"Lihat semua" sheet.** One bordered tile per person, matching mockup image 6. The tiles already existed, but the portal sheet lacked the `--ops-*` tokens, so borders and avatars vanished. `.ops-sheet` now defines them. This also fixes the Aktivitas Anggota sheet.

**Validation:**

- API typecheck. Integration `dashboard-people` and `organization-dashboard`: 33/33, including a new non-shop case.
- Chromium e2e: dashboard, a11y, journeys, and member: 98/100.
  - New test: the sheet has bordered rows with token colours.
  - Axe found that the scrolling sheet list was not keyboard-focusable. Fixed with `tabIndex=0` and a label.
  - The remaining failure is the notifications push-support message, which depends on the local build's push key and does not involve this change.
- Visual: dashboard and workforce, 91/91.

## Unit-head operations dashboard and labelled navigation — 4 October 2026

**Objective:** give unit heads an operations dashboard with handling performance and member participation, label the mobile dock, and add a Voice Saya summary. The product owner chose the design through several rendered prototypes: a separate section, sticky toggles, two HTML mockups, Voice Saya B vs C, three font candidates, and four icon sets. PRD §18.8.6, ADR-0060, and the roadmap record the decisions. `apps/web-voice/PRODUCT.md` holds the confirmed product context, including that performance figures may inform evaluation. Phase 13 remains `in_progress`.

**Delivered on `feat/ops-dashboard`:**

- **API:**
  - `DashboardView` gains `statusToday`, `previousPerformance`, `onTime`, `reporterOrigins`, `teamOverdue`, and `otherBasisTotal`.
  - New `GET /dashboard/handlers` and `GET /dashboard/participation` (in `dashboard-people.ts`), for Section Head, Manager, and Division leadership only.
  - The General preview is ordered by `tierDueAt` and adds `tierDueAt`, `reporterName`, and `reporterDepartment`.
  - Automatic escalations record `previousHolders`, mapped to the substitute when the holder is away.
  - OpenAPI and contracts are regenerated.
- **Workforce:**
  - `OpsDashboard` for GL/SH/Manager/Division; Director and Union are unchanged.
  - People cards with role tabs, the Top and Top Contributor labels, and search sheets.
  - Butuh Tindakan tickets with remaining time; the Voice saya line; the Voice Saya summary card.
  - Labelled dock (Home · [Voice Member] · Buat Voice · Voice Saya · Pengaturan). The "Lainnya" sheet and its unread note are removed, and the sidebar "Akun Saya" duplicate is gone.
  - Self-hosted Plus Jakarta Sans.
  - Contrast fixes found by axe.

**Validation (Windows, scratchpad Node 22.23.2 / pnpm 11.8.0, Docker PostgreSQL):**

- Lint passed. Unit tests passed (API 160, web 127, UI 26, frontend-core 15, Admin 2).
- Integration: new `dashboard-people` suite and the extended escalation test pass; full run 142/143. The failure is `admin-safety`, a known local Prisma transaction-start timeout.
- Security 14/14. Browser (chromium/pwa/push) all passing. Visual 184/184; Admin scenarios needed a rerun at lower parallelism. Fullstack 6/6.
- Legacy WebKit 5/6: the forced-password gate test also fails on unmodified `staging` on this machine.
- Inventory 436; the validation partition test passes with the Windows shim. Gitleaks found no leaks.
- Not run locally: organization 10k import profile, performance gate, migration upgrade harness. Hosted CI is authoritative.

**Design review:**

- The Impeccable finish reviewer ran two rounds.
- Applied:
  - wrapping names at 390 px;
  - a fade on the scrollable chip row;
  - no nested card surfaces;
  - per-column stacking on desktop (with an explicit phone order);
  - the empty tickets state inside a card;
  - neutral "+N hari ini" except Selesai;
  - themed focus rings;
  - aligned ticket buttons;
  - removal of the duplicate sidebar Pengaturan.
- Declined with the product owner's wording recorded: Tim Saya categories stay bars.
- `apps/web-voice/DESIGN.md` and `.impeccable/design.json` record the operations world. Review captures stay local (gitignored).

**Environment incident:**

- Cause: removing a junction-linked comparison worktree with `rmdir /s` followed junctions and emptied part of the main checkout's `node_modules/.pnpm`.
- Recovery: no source files were affected (tracked tree clean). The broken folders were moved aside, junctions were removed as links only, and `pnpm install --frozen-lockfile` restored the main checkout.
- Root cause of the earlier pnpm "Worker exited with code 1" crashes: the corepack pnpm 11.8.0 download was missing `dist/worker.js`. Re-downloading fixed installs.
- Rule going forward: never `rmdir /s` a tree containing junctions.

**First hosted run (PR #70):** two checks failed.

- **Typecheck:** a union-typed preview item in `dashboard-people.integration.test.ts`. Fixed.
- **Organization dashboard performance gate:** p95 3.7 s against a 3 s limit. The new figures ran as six extra sequential queries.
- **Second run:** p95 3.46 s; staging's own run measures 2.91 s on the hosted runner. A 10-way concurrent local check had understated the gap. The sequential per-request cost ratio matches the hosted ratio, so measure with that.
- **Final structure** (see ADR-0060 Consequences):
  - One Voice scan carries both bases.
  - Summary, today, timeliness, and grouping sets run over the shared cohort; organization-wide scopes group from Voice.
  - The trend rolls up from days.
  - Custom category names are looked up lazily.
- **Local sequential medians** (gate actor mix, 50k fixture): staging 172–181 ms, this branch 156–161 ms.

**Next action:** confirm the hosted performance gate on the PR.

## Impeccable UI audit fixes — 4 October 2026

**Change (PR #69, `fix/impeccable-audit`):**

- Severity chart bars use a contrast-safe ramp (Sedang was 1.73:1); chart labels wrap between words.
- Admin styles use the shared tokens instead of a parallel hex palette. Admin overview shows Indonesian labels and import status words and drops the active-account segment bar (`AdminSegmentBar` removed).
- The sidebar and progress bar no longer animate layout properties. Reduced motion keeps colour and opacity feedback while movement snaps.

## Several leaders share a tier level — 3 October 2026

After the September organization import on staging, the product owner decided:

- A Section with two Section Heads, or a Line with two Group Leaders: all of them receive the Voice. Whoever presses Proses becomes the PIC, and the Voice counts for them.
- A Line without a Group Leader goes straight to the Section Head (unchanged).

**Changes on `feat/tier-multiple-holders`:**

- **Chain:** `resolveTierChain` puts every active leader of the Line or Section in `tierHolderIds`. Before, a level with more than one leader was skipped. The rest of the flow already handled several holders, as on the division level: Proses sets `currentHandlerId`, only the PIC closes, and the other holders keep the chat.
- **Admin import panel:** the duplicate-leader and missing-Group-Leader warnings are gone; the panel shows only the counts. The API summary still returns those lists.
- **Docs:** PRD §43.2 and ADR-0059 amended.

**Validation:** tiered routing integration 14/14, including a new two-Group-Leader case; API unit 160/160; API and web-admin typecheck pass.

## Monthly organization file format — 3 October 2026

The product owner's monthly HR file is:

- **Sheet:** `CARE_ORG DATA_[Bulan]` (for example `CARE_ORG DATA_SEP`).
- **Columns:** `Noreg, Nama, Posisi (Struktural), Pers Area, Directorat, Division, Department, Section, Line, Tgl Lahir`.
- **Values:** `Pers Area` is Head Office, Karawang 1–3, or Sunter 1–2. `Tgl Lahir` is `dd/mm/yyyy`.

**Changes on `feat/voice-tiered-routing-stage2`, to release with stages 2 and 3:**

- **Import parser:** `ImportsService` resolves columns by name (case and spacing ignored), with aliases `Pers Area`/`Area` and `Tgl Lahir`/`Birth Date`.
  - Unknown or duplicate columns are rejected, the seven core columns are required, and Area and Line must appear together.
  - It accepts the `CARE_ORG DATA_*` sheet or the older `MFG + QD` (exactly one).
  - It parses `dd/mm/yyyy` (`organizationBirthDate`) and Excel date cells in the Tgl Lahir column, wherever it sits.
  - It maps Head Office to no plant area.
  - Older layouts keep working.
- **Admin:** the import card states the new format.
- **PRD:** §9.1 updated.

**Validation:**

- **Unit:** API 160/160, including the monthly CSV, reordered headers, the `CARE_ORG DATA_SEP` XLSX with a date cell, and the sheet-name rejection.
- **Integration:** organization, birth-date, and tiered import suites pass 19/19.
- **Browser:** the Admin specs pass 63/63.

**After the release:** import the September file on staging and review the Area & Line readiness panel before enabling tiered routing for real users.

## Tiered routing stage 3b — Critical notices and fixed-category escalation — 3 October 2026

**Branch:** `feat/voice-tiered-routing-stage2`, committed locally. Not pushed and not released. **Stages 2 and 3 are complete.**

**Delivered:**

- **`CRITICAL_VOICE` notices** (migration `20261003190000_critical_voice_notice`):
  - **Tiered:** the whole chain except the holder, at submit or when raised to Kritis.
  - **Fixed categories:** only the reporter's Department Head, read-only.
- **Missed assignment:** Tugaskan on any General Voice starts a window. A missed classic assignment moves the Voice onto the Manager tier (Manager holds, PIC below with Ingatkan). A further miss brings in DDH/DH.

**Validation:**

- **Unit:** API 158/158.
- **Integration and security:** 154/156; the two failures are the known admin-safety and push-subscription flakes. No schema drift.
- **Browser:** unchanged (no frontend change in stage 3).

**Before release, the product owner should decide:**

1. When to merge to `staging` (stages 2 and 3 together).
2. Whether to enable tiered routing only after a real organization file with Area/Line is imported.
3. Admin deadline values per severity.

**Release notes:** PRD §43.5–§43.6 and ADR-0059 describe all behaviour.

## Tiered routing stage 3a — escalation worker — 3 October 2026

**Branch:** `feat/voice-tiered-routing-stage2`, committed locally. Not pushed and not released.

**Delivered:**

- **Windows:** `Voice.tierDueAt`, `tierDueKind` and `tierHolderResponded` (migration `20261003180000_tier_windows`) come from the Admin deadline table and working calendar (`src/escalation/tier-window.ts`). They are set on submit (respond), respond (process), Naikkan, handover and Tugaskan (respond + process), restarted on a severity change, and cleared on Proses.
- **Worker:** `TierEscalationService` runs every 60 s when the outbox is enabled, under the Voice row lock.
  - **Unanswered:** the next level takes over, the Voice stays Terbuka, and the former holders become observers.
  - **Received answered and not processed:** the next level takes over, the Voice stays Direspons with the chat note "Diteruskan ke …", and the former holders stay in the chat.
  - **Answered or assigned but not processed:** the next level joins with Ingatkan (chat note "… bergabung ke percakapan").
  - **Top of the chain:** the clock stops.
  - **Notifications:** the new holders, the former holders and the reporter (generic) are notified.

**Validation:**

- **Unit:** API 158/158.
- **Integration and security:** 151/153; the two failures are the known admin-safety and push-subscription flakes. The tiered suite passes 12/12, including racing workers.
- **Other:** no schema drift.

**Next:** stage 3b (Critical notices; fixed-category missed assignment SH → Manager → DDH/DH).

## Tiered routing stage 2, increment 7 — 3 October 2026

**Branch:** `feat/voice-tiered-routing-stage2`, committed locally. Not pushed and not released. **Stage 2 is complete.**

**Delivered (PRD §43.5, ADR-0059):**

- **Ubah severity:** `POST /voices/:id/severity` (reason required, allowed until Proses, `SEVERITY_CHANGED` event).
- **AI hint:** `AIClassification.privateSuggested` (prompt care-classification-v1.8), with a review-step hint **Keluhan tentang atasan?** → **Ubah ke Private Voice**.
- **Migration:** `20261003170000_severity_change_private_hint`.

**Files:**

- **API:** `src/ai/{prompt,ai.service}.ts`, `src/voices/{actions,voices.service,voices.controller}.ts`, schema and migration, `scripts/enrich-openapi.ts` plus regenerated OpenAPI and contracts.
- **Web:** `components/ActionPanel.tsx`, `features/create/CreateVoicePage.tsx`, `lib/formatters.ts`, `workforce-api.ts`.
- **Tests:**
  - `test/unit/{actions,domain,integration-contracts}.test.ts`;
  - `test/integration/{voice-lifecycle,tiered-routing-foundation}.integration.test.ts`;
  - `e2e/{voice-lifecycle,workforce-journeys}.spec.ts` and `e2e/helpers/mock-api.ts`;
  - inventory 428 → 430.

**Validation:**

- **Unit:** API 158/158; web-voice 127/127.
- **Integration and security:** 151/152 on a fresh DB; the one failure is the known admin-safety flake. No schema drift.
- **Browser:** a single-worker full mocked run passed 424/424.
- **Visual check:** the severity dialog and the Private hint were inspected at 390 px.

**Prompt note:** the classification prompt version changed. Drafts classified with v1.7 show a stale-AI notice and are re-analysed on the next preview (existing behaviour).

**Next:** stage 3. It covers:

- a working-calendar escalation worker:
  - unanswered Voices go up and stay Terbuka;
  - manually raised or assigned Voices that time out go up and stay Direspons with a chat note;
  - answered-but-unprocessed Voices bring the upper tier in with Ingatkan;
- per-holder windows that restart on handover, assignment, and severity change;
- Critical notifications to all upper levels;
- read-only Critical notices to the reporter's Manager for fixed categories.

## Tiered routing stage 2, increment 6 — 2 October 2026

**Branch:** `feat/voice-tiered-routing-stage2`, committed locally. Not pushed and not released.

**Delivered (PRD §43.5, ADR-0059):**

- **Sedang tidak masuk:** `AwayPeriod` (migration `20261003160000_away_periods`), `GET/POST /me/away`, `POST /me/away/end`.
- **Virtual delegation:** through `Principal.actingFor`, the substitute acts for the away leader (actions, work items, close as PIC) and receives their notifications.
- **Routing:** a level is skipped when both the leader and the substitute are away.
- **Web:** Account → `/account/away`.

**Files:**

- **API:** `src/away/{away,away.service,away.controller,away.module}.ts` (new); `src/app.module.ts`; `src/auth/policy.service.ts`; `src/voices/{actions,voices.service,handling-target.service,tier-chain}.ts`; schema and migration; `scripts/enrich-openapi.ts` plus regenerated OpenAPI and contracts.
- **Web:** `features/account/{AwayPage (new),AccountPage}.tsx`, `App.tsx`, `workforce-api.ts`, `styles.css`.
- **Tests:**
  - `test/unit/actions.test.ts`;
  - `test/integration/tiered-routing-foundation.integration.test.ts`;
  - `e2e/workforce-journeys.spec.ts` and `e2e/helpers/mock-api.ts`;
  - inventory 427 → 428.

**Validation:**

- **Unit:** API 157/157; web-voice 127/127.
- **Integration and security:** 150/151; the one failure is the known admin-safety flake. No schema drift.
- **Browser:** a single-worker full mocked run passed 421/422. The Union Head assignment test hit a 5 s navigation timeout under load and passed alone.
- **Visual check:** the away page form and the active state were inspected at 390 px.
- **Host note:** the Postgres container had stopped after the app restart; start it with `docker compose up -d postgres`.

**Next:** increment 7 (severity change with a mandatory reason until Proses, recomputing the deadline; AI suggests Private Voice for complaints about superiors), then stage 3.

## Manual Naikkan counts as a response — 2 October 2026

**Product-owner decision:** a manual Naikkan is a response, like Handover.

- **Status and chat:** the Voice becomes Direspons and the chat opens with "Diteruskan ke [Level]".
- **New holder:** the upper level holds the Voice, with Naikkan lagi / Tugaskan PIC / Proses sendiri.
- **The one who raised it:** stays in the chat (`tierParticipantIds`, migration `20261003150000_tier_chat_participants`) with messages only.
- **Reporter:** notified with the destination level; the reason stays internal.

**Stage 3 rules recorded in PRD §43.5:**

- **Manual escalation, then a missed deadline:** the Voice goes up again automatically with a chat note and stays Direspons.
- **Automatic escalation of a Voice nobody answered:** it stays Terbuka and the former holder becomes read-only.
- **Answered but unprocessed:** the upper tier joins beside the responder with Ingatkan / Tugaskan / Proses.

**Validation:**

- **Unit:** API 156/156.
- **Integration and security:** 148/150; the two failures are the known admin-safety and push-subscription flakes. The tiered suite passes 10/10.
- **Browser:** the lifecycle and handover specs pass 20/20 (frontend unchanged).
- **Other:** no schema drift; Gitleaks clean.

## Tiered routing stage 2, increment 5c — 2 October 2026

**Branch:** `feat/voice-tiered-routing-stage2`, committed locally. Not pushed and not released.

**Delivered (PRD §43.5, ADR-0059):**

- **Team read access:** Section Heads read their Section's General Voices and Group Leaders their Line's (read-only browse). A GL's Tim Saya dashboard is limited to their Line.
- **Stages:** `tierStages` on detail renders as **Tahap penanganan**.
- **Chat:** collapses to five avatars plus "+N" and **Detail** when more than three people take part.

**Files:**

- **API:** `src/auth/policy.service.ts`, `src/voices/{dashboard,voices.service}.ts`, `scripts/enrich-openapi.ts` plus regenerated OpenAPI and contracts.
- **Web:** `components/TierStages.tsx` (new), `features/voice/{VoiceDetailPage,ConversationPage}.tsx`, `styles.css`.
- **Tests:**
  - `test/unit/policy.test.ts`;
  - `test/integration/tiered-routing-foundation.integration.test.ts`;
  - `e2e/voice-lifecycle.spec.ts` and `e2e/helpers/mock-api.ts`;
  - inventory 426 → 427.

**Validation:**

- **Unit:** API 155/155.
- **Integration and security:** 149/150; the one failure is the known admin-safety flake.
- **Browser:** a single-worker full mocked run (two workers crashed from memory pressure on this host) passed 420/421. Auth recovery at 360 is a known flake and passed alone.
- **Visual check:** stages and the collapsed chat were inspected at 390 px.

**Next:** increment 6 (away delegation "Sedang tidak masuk"), then 7 (severity change with reason, AI Private guidance), then stage 3.

**Branch:** `feat/voice-tiered-routing-stage2`, committed locally. Not pushed and not released.

**Delivered (PRD §43.5, ADR-0059):**

- **Naikkan:** `POST /voices/:id/escalate` (reason required).
- **Ingatkan:** `POST /voices/:id/remind` (once per WIB day per target).
- **Tugaskan for tier holders:** via `tierAssignees`.
- **Read access:** observer read-only for former holders.
- **Migration:** `20261003140000_tiered_actions`.
- **Web:** a Naikkan choice in the Respons sheet, and Naikkan/Ingatkan buttons after Direspons.

**Files:**

- **API:** `src/voices/{tier-chain,actions,voices.service,voices.controller}.ts`; `src/auth/policy.service.ts`; schema and migration; `scripts/enrich-openapi.ts` plus regenerated OpenAPI and contracts.
- **Web:** `components/ActionPanel.tsx`, `lib/formatters.ts`, `workforce-api.ts`.
- **Tests:**
  - `test/unit/{actions,policy}.test.ts`;
  - `test/integration/tiered-routing-foundation.integration.test.ts`;
  - `e2e/voice-lifecycle.spec.ts` and `e2e/helpers/mock-api.ts`;
  - inventory 424 → 426.

**Validation:**

- **Unit:** API 154/154; web-voice 127/127.
- **Integration and security:** 147/149; the two failures are the known admin-safety and push-subscription flakes.
- **Found and fixed during validation:** a CARE Admin detail regression (an OR-wrapped match-all scope).
- **Browser:** the full mocked run passed 420/420.

**Next:** 5c (Tim Saya read-only visibility for upper levels with a GL limited to their Line, stage timeline, chat avatars + Detail).

**Branch:** `feat/voice-tiered-routing-stage2`, committed locally. Not pushed and not released.

**Delivered (PRD §43.5, ADR-0059):**

- **Tiered categories:** `GeneralVoiceCategory.tiered` is true for `WORK_DIFFICULTY` and `WELFARE`. These Voices start at the nearest leader above the reporter (`resolveTierChain`).
- **New Voice fields:** `tierLevel`, `tierPath`, `tierHolderIds`, and `outsideReporter` (migration `20261003130000_tiered_routing_core`).
- **Behavior:**
  - Holders act and are notified.
  - The route Manager is read-only and kept out of their work items until they hold the Voice.
  - Handover is allowed only at the Manager tier.
  - Outsider shop Voices start at the shop Manager with the **Pelapor dari luar department** badge.
  - Chat lists holders with their roles.

**Files:**

- **API:** `src/voices/tier-chain.ts` (new); `src/voices/{actions,voices.service}.ts`; `src/auth/policy.service.ts`; schema and migration; `scripts/enrich-openapi.ts` plus regenerated OpenAPI and contracts.
- **Web:** `components/VoiceHero.tsx`, `features/voice/ConversationPage.tsx`, `styles.css`.
- **Tests:**
  - `test/unit/{actions,policy,tier-chain}.test.ts`;
  - `test/integration/{tiered-routing-foundation,shop-location-routing}.integration.test.ts`;
  - `e2e/voice-lifecycle.spec.ts` and `e2e/helpers/mock-api.ts`;
  - inventory 423 → 424.

**Validation:**

- **Unit:** API 152/152.
- **Integration and security:** 144/146; the two failures are the known admin-safety and push-subscription flakes.
- **Performance:** the organization dashboard p95 was 3.4–3.6 s against the 3 s budget. The previous commit measured 3.42/3.48 s on the same host and database, so this is host load, not a regression. The inbox performance test passes.
- **Browser:** the full mocked run passed 417/418. Auth recovery at 390 is a known load flake and passed alone.

**Next:** 5b (Naikkan ke atasan with a reason, Tugaskan by upper levels including skipped people, Ingatkan once per working day per person).

**Branch:** `feat/voice-tiered-routing-stage2`, committed locally. Not pushed and not released.

**Delivered (PRD §43.5, ADR-0059):**

- **Detection:** TM reporters are identified by the noReg prefix `TM`. They see the **Lengkapi posisi kamu** card (variant B) on the create form.
- **Choices:** Section and Line selects list the department's permanent placements, plus "Tidak di Line". They are prefilled from the last Voice.
- **Gating and API:**
  - The position is required for "Simpan & Analisis" and for submit.
  - New endpoint `GET /drafts/position-options`.
  - Drafts gain `positionSection`/`positionLine` (migration `20261003120000_draft_tm_position`).
- **Snapshot:** the Voice stores the chosen Section, Line, and Area in place of the organization file's values.

**Files:**

- **API:** `src/voices/tm-position.ts` (new); `src/voices/{voices.service,voices.controller}.ts`; `prisma/schema.prisma` and the migration; `scripts/enrich-openapi.ts` plus regenerated OpenAPI and contracts.
- **Web:** `features/create/{TmPositionCard (new),CreateVoicePage,useDraftWizard}.tsx/ts`, `workforce-api.ts`, `styles.css`.
- **Tests:**
  - `test/unit/tm-position.test.ts` (new);
  - `test/integration/tiered-routing-foundation.integration.test.ts`;
  - `e2e/workforce-journeys.spec.ts` and `e2e/helpers/mock-api.ts`;
  - inventory 422 → 423.

**Validation:**

- **Unit:** API 150/150; web-voice 127/127.
- **Integration and security:** 142/144. The failures are the known admin-safety flake and the organization 7,018-row timing budget, which ran while the browser suite loaded the CPU; it passed 5/5 alone.
- **Browser:** the full mocked run passed 416/417. Auth recovery at 768 is a known load flake and passed alone.
- **Visual check:** the TM card was inspected at 360 px.

**Next:** increment 5, the tiered routing core (chain resolution GL → SH → Manager → DDH/DH, outsider badge, multi-participant chat, read-only Tim Saya visibility, tier timeline, Naikkan/Tugaskan/Ingatkan).

**Branch:** `feat/voice-tiered-routing-stage2`, committed locally. Not pushed and not released.

**Delivered (PRD §15.4, §43.5, ADR-0059):**

- **Target-day reminder:** sent at 08:00 WIB to the PIC (`TARGET_REMINDER`, `reminderSentAt`); skipped for "Hari ini".
- **Overdue fan-out:** goes to the PIC, the Manager, and the reporter. Upper GL/SH levels join with chain routing in increment 5 through `HandlingTargetService.levelsAbove`.
- **When the target passes:** a SYSTEM chat note "Target penyelesaian terlewati" and a `TARGET_OVERDUE` timeline event are written.
- **Badge:** `targetOverdue` on list items, and the **Terlambat** badge on the cards and the detail hero.

**Files:**

- **API:** `prisma/schema.prisma` and migration `20261003110000_handling_target_reminder`; `src/voices/{handling-target.service,handling-target,voices.service}.ts`; `scripts/enrich-openapi.ts` plus regenerated OpenAPI and contracts.
- **Web:** `components/{OverdueBadge (new),InboxVoiceCard,VoiceCard,HistoryVoiceCard,VoiceHero}.tsx` and `styles.css`.
- **Tests:**
  - `test/unit/handling-target.test.ts`;
  - `test/integration/voice-lifecycle.integration.test.ts`;
  - `e2e/voice-lifecycle.spec.ts` and `e2e/helpers/mock-api.ts`;
  - inventory 421 → 422.

**Validation:**

- **Unit:** API 148/148; web-voice 127/127.
- **Integration and security:** all pass except the known admin-safety and push-subscription flakes.
- **Performance:** passed 2/2 after `pnpm seed:performance` (dashboard p95 2840 ms). Seed first, or the suite fails on fixture size.
- **Browser:** the full mocked run passed 416/416. Card and detail badges were inspected at 390 px.

**Next:** increment 4, the TM position card (variant B, Section + Line, prefilled from the last choice).

**Branch:** `feat/voice-tiered-routing-stage2`, committed locally. Not pushed and not released (stage 2 and 3 ship together after product-owner approval).

**Delivered (PRD §43.5, ADR-0059):**

- **One Respons button** for an open Voice. The sheet offers Balas pesan / Tugaskan PIC / Handover / Proses sendiri.
- **Proses sendiri** is `respond` with `days`, written atomically.
- **Handover as a response:**
  - allowed from Terbuka or Direspons while no PIC is assigned;
  - sets Direspons and posts the SYSTEM chat note "Diteruskan ke [Department]";
  - notifies the reporter;
  - leaves the source Manager with read-only access through `detailScope`.
- **Admin handover** stays Terbuka-only.
- **Schema:** `MessageKind` (migration `20261003100000_system_message_kind`).

**Files:**

- **API:** `prisma/schema.prisma` and the migration; `src/voices/{actions,voices.service}.ts`; `src/auth/policy.service.ts`; `scripts/enrich-openapi.ts` plus regenerated OpenAPI and contracts.
- **Web:** `components/ActionPanel.tsx` (RespondSheet, CandidatePicker, TargetPresets); `features/voice/{ConversationPage,HandoverPage}.tsx`; `workforce-api.ts`; `styles.css`.
- **Tests:**
  - `test/unit/actions.test.ts`;
  - `test/integration/{voice-handover,voice-lifecycle}.integration.test.ts`;
  - `e2e/{voice-lifecycle,assignment-scroll,workforce-handover,workforce-journeys,voice-lifecycle.visual,a-workforce-fullstack}.spec.ts` and `e2e/helpers/mock-api.ts`;
  - inventory 420 → 421.

**Validation:**

- **Unit:** API 147/147 and web-voice 127/127.
- **Integration and security:** 139/141. The two failures are the known admin-safety and push-subscription flakes.
- **Browser:** the full mocked run (Chromium + visual + PWA + push + legacy) passed 415/415. Respons sheet screens and the chat system note were inspected at 390 px.

**Next:** increment 3 (target-day 08:00 reminder, overdue fan-out to PIC, upper levels and reporter, chat system note, overdue badge).

**Branch:** `feat/voice-tiered-routing-stage2`, committed locally. Do not merge or release: the product owner wants stage 2 and 3 released together after further discussion.

**Delivered (PRD §43.5, ADR-0059):**

- **Detail redesign:** Header → Detail Voice card → Percakapan with an unread badge → Penanganan → Timeline.
- **Unread counts:** `ConversationReadState`, `unreadMessages` on detail, and `POST /voices/:id/conversation/read`.
- **PIC-only close:** older Voices that never recorded a PIC stay closable by the route owner.
- **Ambil alih** (`POST /voices/:id/take-over`) when the PIC account is inactive.

**Files:**

- **API:**
  - `prisma/schema.prisma` and migration `20261003090000_conversation_read_state`;
  - `src/voices/{actions,voices.service,voices.controller}.ts`;
  - `scripts/enrich-openapi.ts`, plus regenerated OpenAPI and contracts.
- **Web:** `components/{VoiceHero,ActionPanel}.tsx`, `features/voice/{VoiceDetailPage,ConversationPage}.tsx`, `workforce-api.ts`, `styles.css`.
- **Tests:**
  - `test/unit/actions.test.ts`;
  - `test/integration/{voice-lifecycle,responder-matrix}.integration.test.ts`;
  - `e2e/voice-lifecycle.spec.ts`, `e2e/voice-consent.visual.spec.ts`, `e2e/helpers/mock-api.ts`;
  - inventory 419 → 420.

**Validation (Windows host, Docker PostgreSQL):**

- **Static and unit:** typecheck passed; API unit 146/146; web-voice unit 127/127.
- **Integration and security:** 137/140. The failures:
  - the known `admin-safety` transaction timeout;
  - the `push-subscription` race;
  - `tiered-routing-foundation`, which passes on a fresh DB but not when re-run on the same DB (a stage-1 test that does not reset its settings; CI always uses a fresh DB).
- **Browser:** Chromium + visual + PWA + push + legacy passed 413/414. The single `auth reset-union 360` visual failure passed in isolation.
- **Build caveat:** build `web-voice` without `dbenv.sh` sourced. Its `NODE_ENV` changes the PWA build and breaks the push-notice e2e. Also rebuild before e2e, because `vite preview` serves `dist`.
- **Validation scripts:** the inventory contract passes. Two validation contracts (`real build verification` and `Compose fixtures` / `missing job quality`) fail only on this Windows host because they parse CI/Compose files, which this change does not touch.

**Next:** increment 2, the unified **Respons** sheet (Balas pesan / Tugaskan PIC / Handover / Proses sendiri; handover counts as a response; Proses from Open is an atomic respond and proceed).

Latest staging run `36852300089` at `f3901573` passed all 20 validation jobs,
including container cleanup, security and the release candidate gate, but failed
deployment before building the candidate. `remote-entrypoint.sh` executes from
`incoming`; promotion moves that directory into `releases`, leaving `SCRIPT_DIR`
pointing at a missing `build-cache.sh`. The deployment harness previously executed
from the repository checkout and therefore missed this production path.

Pulled `origin/staging` at `f3901573` and created
`fix/staging-release-helper-path`. Rebind the helper directory to the candidate's
retained release immediately after promotion or same-SHA retry removal. Keep
current-generation helpers for rebuilding older rollback source. The harness now
executes the actual copied incoming script for fresh deploys, repeat deploys and
automatic rollback; it reproduced the missing-helper failure before the repair.
The repaired native and Linux/real-flock harnesses pass, as do Actionlint,
ShellCheck and directory Gitleaks. Full local validation passed static, build,
integration/security, organization, performance (p95 481 ms), migrations,
fullstack (6), Chromium/PWA/push (222) and legacy WebKit (6). Capture passed
180/181; the unchanged shop-not-in-area test twice checked its request array
before the asynchronous mock handler received the request. Make that assertion
poll for the same exact payload without changing application behavior or test
thresholds. Final capture validation passes all 181 scenarios with two workers. Generated
native references were restored because no UI changed. Hosted delivery remains
pending; no VM deployment or Actions rerun was triggered by this inspection.

Read-only VM verification after the failed run confirms all five app services
healthy at `a35ad0c9`. Automatic rollback succeeded and its cleanup reports
7.157 GB dedicated cache plus 63.69 GB attributable legacy cache removed. The
filesystem now reports 19 GB used (19%), 79 GB available; residual default build
cache is approximately 13.5 GB. Persisted media and database were not targeted.
The earlier staging run `36842629034` failed the unchanged dashboard performance
check at 3006 ms against 3000 ms; that check passes in the latest run.

## Per-deploy CARE build-cache cleanup — 1 October 2026

**Objective:** reduce deployment disk growth while preserving other applications
and all persistent data. Pulled `origin/staging` at a35ad0c9 and created
`fix/care-deployment-build-cache-cleanup`. Read-only VM diagnosis found 77.2 GB
BuildKit cache, including 57.7 GB across CARE dependency-install records, versus
approximately 102 MB database, 8.7 MB media and 149 MB logs. The default builder
allows about 72.6 GiB cache; image cleanup alone cannot address this accumulation.

**Implementation:** dedicated digest-pinned docker-container builders per environment,
Compose default-load exports, 5 GB failure-cache GC budget, ownership marker and
fail-closed adoption/driver checks. Successful deploys and successful rollback
clear unused dedicated cache. Legacy default-builder migration selects explicit
CARE package execution records and their descendants, then only private/reclaimable
IDs; unknown ancestors, shared records and active builds remain protected. No
global prune, volume removal, application-source/schema change or VM deployment.
Current-generation rollback uses the same builder even for retained older source.

**Validation:** pinned/frozen install and `verify:local --plan` completed. Full
`verify:local` passed all ten jobs, including performance p95 512 ms, Chromium/PWA/
push 222, legacy 6 and capture 181. Native references were restored because no UI
changed. Statefully mocked tests cover ownership,
environment separation, legacy descendants, foreign/shared/active protection,
repeat preparation and visible cleanup failure after healthy activation. An opt-in
empty-daemon integration harness verifies real Compose image export, cache record
deletion and image/container/media preservation. Hosted container CI exercises the
same builder wrapper and cleanup, followed by service restart/readiness/release/media
checks. The empty Docker 29.4.0 integration run passed with dedicated cache 0 B,
legacy seed/descendant IDs absent, unrelated cache and image/container/media intact,
and a repeat clean pass. Linux deployment harness with real flock passed in a
temporary VM directory; all five VM services stayed healthy and test files were
removed. The VM inventory dry run identifies 375 private CARE records totaling
63.69 GB; no live VM cache prune or rollout occurred. The disposable Docker daemon/cache volumes and local validation processes were removed. Actionlint, ShellCheck,
runtime/Compose validators, exception check, directory Gitleaks and pnpm audit (zero High/Critical, ten Moderate) pass. Trivy filesystem secret/misconfiguration scan passes. Local full Trivy
filesystem scanning could not finish its fresh vulnerability DB download because
of registry throughput; no finding/threshold is ignored, and hosted scanning
remains required. Phase 13 remains the only `in_progress` phase.

## Tiered bottom-up routing, stage 1 — 2 October 2026

**Objective:** route Kesulitan Kerja and Kesejahteraan Voices from the bottom up: Group Leader (line leader) → Section Head → Manager → Deputy/Division Head, with escalation windows per severity. The complete product decisions agreed with the product owner are in PRD §43 and ADR-0059:

- the chain follows the reporter's organization, except Fasilitas Kerja incidents in another department's shop, which go to that shop's Manager with an outside-reporter badge;
- per-severity windows are configurable by Admin, on working days or calendar hours;
- responded-but-unprocessed escalation adds the upper tier to the chat with Remind, Reassign, or Process;
- Group Leaders and Section Heads escalate early instead of handing over; only Managers hand over sideways;
- upper tiers see team Voices read-only under "Voice Tim Saya";
- also covered: away delegation, severity edits until processed, Critical notifications, and AI guidance toward Private Voice.

The UI preview (variant A timeline for read-only detail) was approved and is kept as `proto-tiered-routing.patch` in the session scratchpad for stage 2.

**Stage 1 delivered (this branch `feat/voice-tiered-routing`):**

- **Import:**
  - optional trailing `Area, Line` columns in all formats;
  - `Posisi (struktural)` value `Group Leader`;
  - Area/Line change detection;
  - an advisory `summary.tiers` readiness check (duplicate Section Heads, duplicate or missing Line leaders), shown in the Admin import preview.
- **`GROUP_LEADER` capability:** a Section Head–like dashboard, work-item and overview scopes, Voice Member navigation, and the account label.
- **Voice snapshots:** new General Voices store `reporterLineSnapshot` and `reporterAreaSnapshot`.
- **Admin "Kalender & Eskalasi":**
  - standard Monday–Friday calendar or a custom calendar with holidays and extra working days;
  - per-severity respond/process deadlines, seeded Low 2/3, Medium 1/2, High 1/1 working days and Critical 4/24 calendar hours;
  - optimistic versions and audit events.
- **Working-time library:** `addWorkingTime` in WIB.

Voice routing is unchanged until stage 2.

**Files:**

- **API:**
  - `prisma/schema.prisma` and migration `20261002090000_tiered_routing_foundation`;
  - `src/imports/imports.service.ts`;
  - `src/escalation/*` (new);
  - `src/auth/{capabilities,policy.service,auth.service}.ts`;
  - `src/voices/{dashboard,voices.service,voice.contracts}.ts`;
  - `src/app.module.ts`;
  - `scripts/enrich-openapi.ts`, plus regenerated `openapi.json` and contracts.
- **Web:**
  - `web-admin`: `features/escalation/EscalationSettingsPage.tsx` (new), `features/imports/ImportTierSummary.tsx` (new), `ImportsPage.tsx`, `App.tsx`, `admin-api.ts`, `styles.css`;
  - `web-voice`: `App.tsx`, `lib/navigation(.test).ts`, `features/home/HomePage.tsx`, `features/account/AccountPage.tsx`, `features/work/WorkItemsPage.tsx`.
- **Tests:**
  - `test/unit/working-time.test.ts` (new) and `test/unit/integration-contracts.test.ts`;
  - `test/integration/tiered-routing-foundation.integration.test.ts` (new);
  - `e2e/escalation-settings.visual.spec.ts` (new), `e2e/dashboard.spec.ts`, `e2e/helpers/dashboard-fixture.ts`;
  - validation inventory 415 → 419, captures 181 → 184.
- **Docs:** PRD §9.1, §9.3, and §43 (new); ADR-0059; `implementationPhases.md`.

**Validation (Windows host, Docker Desktop):**

- **Static:** Prisma validate/generate, typecheck, and all unit suites passed (API 143, web-voice 127, UI 26, frontend-core 15, Admin 2).
- **Integration:**
  - The new foundation suite passed 4/4 against Docker PostgreSQL.
  - The full integration run passed 117/119. The two failures are the known `admin-safety` transaction-start timeout and a `push-subscription` concurrency race; the latter fails and passes alternately in isolation. Neither area changed.
  - Security 14/14, organization 5/5, `test:migration:upgrade` all harnesses, and fullstack 6/6.
- **Browser:** the full Chromium + visual + legacy run passed 398/400. The two load-related failures (admin `/accounts` error state, auth recovery at 768) passed serially. The new Admin escalation spec (3) and the Group Leader dashboard test passed, and the Admin page captures were inspected.
- **Cleanup:** the Docker stack was stopped.

**Next action:** commit, Gitleaks, push, and a PR to `staging`. Then import a real organization file with Area and Line on staging and review the readiness summary before starting stage 2.

## Incident shop routing for location-owned categories — 30 September 2026

**Objective:** route Voices by the owner of the incident location instead of the reporter's department where that is the right owner. Before this change, Fasilitas Kerja / Kesulitan Kerja and Kesejahteraan went to the reporter's Department Head, and Safety, Environment, Fasilitas Umum, and Facility Repair went to fixed PIC departments. So an office member reporting a machine problem in a production shop reached their own office Manager. Decisions confirmed with the product owner:

- Option A: only Fasilitas Kerja moves to the new `LOCATION_OWNER_DEPARTMENT` mode. Kesejahteraan stays with the reporter's department, and fixed categories stay fixed even inside a shop.
- The receiver is the single Department Head of the shop department, including multi-area departments.
- No new form fields. The selected Area filters candidate shops, and the shop is inferred from Detail Lokasi.
- When the shop is uncertain, the reporter answers a one-tap card on the review screen (variant A, copy "Pilih Shop agar Voice diterima oleh PIC yang tepat").
- The assignment sheet shows the incident location plus each candidate's Section name ("tingkat 1"). A per-Section area filter waits for an Area column the product owner will add to the organization data.

Phase 13 remains `in_progress`. PRD §12.2/§12.3/§13.1/§13.2/§14.2/§14.5 (new)/§41.2 and ADR-0058 record the design.

**Files changed:**

- API: `apps/api/prisma/schema.prisma` and two migrations (`20260930090000_shop_location_routing`, `20260930090100_work_difficulty_location_owner_route`); `apps/api/src/shops/*` (new: matching, service, Admin controller, module); `voices.service.ts` / `voices.controller.ts` / `voices.module.ts`; `ai/ai.service.ts` and `ai/prompt.ts` (`care-location-v1.3`); `categories.service.ts`; `app.module.ts`; `scripts/enrich-openapi.ts`; regenerated `openapi.json` and `packages/contracts/src/generated.ts`.
- Web: `web-voice` `ShopClarification.tsx` (new), `DraftPreviewPage.tsx`, `ActionPanel.tsx`, `workforce-api.ts`, `styles.css`; `web-admin` `ShopLocationConfiguration.tsx` (new), `RemediationPage.tsx`, `CategoryConfiguration.tsx`, `admin-api.ts`, `styles.css`.
- Tests: `apps/api/test/unit/shop-matching.test.ts` (new), `apps/api/test/unit/integration-contracts.test.ts`, `apps/api/test/integration/shop-location-routing.integration.test.ts` (new), `e2e/shop-routing.visual.spec.ts` (new), `e2e/helpers/mock-api.ts`, and `scripts/validation/*` (browser inventory 407 → 415, capture scenarios 173 → 181), `scripts/test-shop-routing-migration-upgrade.mjs` (new) and `package.json` (`test:migration:upgrade`).
- Docs: `.agent/PRD.md`, `.agent/implementationPhases.md`, `docs/adr/0058-…`.

**Validation (Windows host, scratchpad Node 22.23.2 / pnpm 11.8.0; Docker Desktop enabled midway, see the database jobs below):**

- Passed: Prisma validate/generate, API/workforce/Admin typecheck, `test:unit` (includes new shop-matching and AI location contract tests), ESLint on changed files, Prettier on changed files (`--end-of-line auto`), `git diff --check`, and web-voice/web-admin production builds.
- Browser: the full Chromium + visual suite passed 389/390. The one failure was an unrelated admin error-state journey that passed 16/16 serially. Legacy WebKit passed 5/6; the forced-password test passed serially.
- `shop-routing.visual.spec.ts` passed 8/8. The inventory partition test passes with 415.
- Screenshots were inspected: confirmation card and confirmed row at 360/1440 px, assignment sheet at 360/1440 px, Admin table and drawer.
- Repository-wide `format:check`, full `eslint .` (out of memory from the stray `.claude/worktrees` copy), and `test:validation` sealed-build/CRLF cases fail only for the known Windows environment reasons.
- Database jobs (Docker Desktop with WSL 2 enabled on 1 October 2026; the runner's steps were run manually because `verify:local` stops at the Windows CRLF `format:check` and `db:test:reset` quoting fails in the Windows shell):
  - Fresh `prisma migrate deploy` applied both new migrations.
  - Integration 114/115. `shop-location-routing` passed 8/8. The single failure is `admin-safety` password-reset replay with a Prisma "Unable to start a transaction in the given time"; it reproduced in isolation, and that code is untouched.
  - Security 14/14, organization 5/5, fullstack 6/6.
  - `test:migration:upgrade` passed, including the new `scripts/test-shop-routing-migration-upgrade.mjs`. It covers seeded `WORK_DIFFICULTY` → `LOCATION_OWNER_DEPARTMENT` with a version bump and closed history, Kesejahteraan unchanged, historical Voice untouched, and an Admin-customized route preserved.
  - Performance: organization dashboard p95 3,373 ms against the 3,000 ms hosted threshold on this laptop. Dashboard code is unchanged and the threshold is authoritative only on the hosted runner.
  - The Docker stack was stopped (`db:down`).
- Gitleaks v8.24.3 found no leaks in the directory scan or in the scans of the feature and merge commits. The native capture refresh was not run.

**Correction:** an earlier draft of this entry said the staging VPS was down and "Deploy staging" would fail. That was wrong. The VPS had been renewed on 30 September 2026 (until 2027-09-30) and was healthy. Since PR #60 staging is served at `satucare.com` (workforce) and `admin-pad.satucare.com` (Admin); `care.qd-tmmin.site` no longer answers. Before assuming an outage, check `https://satucare.com/ready`.

**Open items:**

- Admin must enter the shop list and aliases on Remediation & Route → Lokasi shop; none are seeded. Until then, Fasilitas Kerja keeps routing to the reporter's department.
- Once the organization import carries an Area column, rank or label assignment candidates by incident area (ADR-0058 follow-up).

**Delivery (completed):**

- Commit `2d1caa8` on `feat/voice-shop-manager-routing`. PR #62 targeted `staging`; PR #61, opened by mistake against `main`, was closed.
- `staging` had gained PR #60, so PR #62 had conflicts. Commit `5f4f911` merged `origin/staging`, kept both new roadmap/handoff entries, and renumbered this ADR from 0057 to 0058 because ADR-0057 is the OpenSSL runtime record.
- PR #62 was merged into `staging` as `a35ad0c`.
- The PR #62 run (`36824268444`) failed only API (performance), with organization dashboard p95 at 3,009.85 ms against the 3,000 ms threshold, plus the dependent Release candidate gate. Dashboard code is unchanged, and the same code passed performance on the staging push run.
- The staging push run (`36824457091`) passed all 22 jobs, including Release candidate gate and Deploy staging. `https://satucare.com/ready` and `https://admin-pad.satucare.com/release.json` report `releaseSha` `a35ad0c`, with database, migrations, outbox, and storage `ok`, so both shop-routing migrations are applied on staging.

## PR #60 runtime OpenSSL repair — 30 September 2026

**Status:** after b7c64a12, run 36684901612 passed dependency security and every
application/quality/CodeQL job. Production containers passed startup, routing,
persistence and filesystem scan, then failed the API OpenSSL CVE-2026-84782 image
scan; the release gate failed consequently and PR deployment remained skipped.

**Correction:** ADR-0057 moves API to pinned Debian 13 distroless plus actual signed
security packages 3.5.7-1~deb13u3, with honest package metadata. Both web images and
PostgreSQL pin Alpine OpenSSL 3.5.9-r0. Trivy's current feed still reports the fixed
Debian backport, so an API-only package/version-scoped Rego policy expires after
7 October UTC, with a matching validated registry entry. Global CVE ignores,
scan thresholds and application source remain unchanged. A patched runtime probe
passes; an unpatched base still fails with the identical policy. Production Compose
build, Prisma migration/bootstrap, routing/readiness/headers/non-root/database
isolation, persistence across restart and all five runtime image scans pass on ARM64.
The patched Debian package stage also builds on AMD64. Hadolint, Actionlint,
ShellCheck, deployment/runtime validators, deployment harness, exception validation,
missing/extended registry rejection and orchestration 9/9 pass. `verify:local` passes
all application jobs (performance p95 554 ms) but capture's report copy fails after
173 passing scenarios because a concurrently started orchestration test clears the
shared test-results directory. Standalone `verify:ci capture` then passes all 173
and its reporter. Trivy filesystem vulnerability/secret/misconfiguration scan passes. Native references were restored because no UI changed. Runtime
and validation stacks were stopped. Final-SHA hosted acceptance is pending.
Phase 13 remains `in_progress`; no merge/deployment authorization is inferred.

## PR #60 dependency audit repair — 30 September 2026

**Objective/status:** repair failed hosted CI on PR #60 in the existing
`fix/staging-domains-image-cleanup` branch and push the correction. Initial run
36683974942 failed `Dependency security`: repository-wide pnpm audit reported
11 High advisories across fast-uri, undici and brace-expansion. The failure was
reproduced locally; dependency review itself passed on the original deployment diff.

**Second failed job:** `Production containers and routing` failed at the Trivy filesystem
scan on the same fast-uri/brace-expansion advisory families; its build, routing and
persistence steps had passed. The release gate failed as a consequence.

**Correction:** same-major, range-scoped overrides select fast-uri 3.1.7,
undici 8.10.2 and brace-expansion 1.1.20/2.1.6/5.0.11. Updated pnpm lockfile.
No audit suppression, threshold change, application source or schema change.
ADR-0045 records rationale and dependency consumer paths; Phase 13 remains
`in_progress`. Fresh/frozen installs and initial audit pass (zero High/Critical,
ten Moderate). `pnpm verify:local` passed all ten selected jobs in one run: static,
build, integration/security, organization, performance (p95 590 ms), migrations,
fullstack, browser, legacy and capture (173). PWA passed in the full browser run.
Trivy 0.70.0 filesystem vulnerability scan passed with zero High/Critical.
Capture outputs were restored because no UI source changed. The runner removed
its disposable PostgreSQL and preview processes exited. Directory/commit Gitleaks
and final format/diff checks passed. Hosted acceptance for the corrected SHA is
still pending; all other jobs in the original run passed (Deploy staging was
correctly skipped for a PR). Merge/deploy are outside this CI repair.

## Staging domains and unused CARE image cleanup — 30 September 2026

**Objective/status:** implementation complete locally on new branch
`fix/staging-domains-image-cleanup`. Staging workforce moves to `https://satucare.com`
and Admin to `https://admin-pad.satucare.com`. Production remains pending. Phase 13
remains the only `in_progress` phase. Commit/push and a PR to `staging` are authorized;
merge and deployment are outside this delivery. Hosted checks must still be verified.

**Implementation:** CI staging caller/routing assertions, runtime renderer and example env
use the new domains. Compose builds label image ownership. `cleanup-images.sh` inventories
legacy CARE repository IDs before build (including the mutable PostgreSQL tag), retains
that inventory across candidate failures and deletes unused CARE images after successful
smoke/activation, regardless of retained release source. Cleanup removes stopped containers
only in the active environment's Compose project; any image referenced by another container
or carrying a foreign tag is preserved. Labeled dangling images are pruned. No forced image
removal, global image/system/cache/volume prune or business-data deletion is performed.
Cleanup errors fail the command visibly while leaving the healthy release active.

Retained source/runtime environments remain capped at five. Retry now reads the persistent
`previous_release` pointer rather than counting current twice, preserving rollback source
when the same SHA/run is retried. Rollback rebuilds target images before startup. Automatic
recovery invokes the candidate's updated script; manual rollback and rehearsal restoration
use the current-generation script, including when the target predates this policy.

**Files:** deployment cleanup/deploy/rollback/rehearsal scripts; Compose build labels;
staging example env and renderer; CI workflow; deployment harness and new ownership/image
cleanup regression harness; PRD, implementation phases, deployment guide, release checklist
and ADR-0011 amendment. Historical domain references in old handoffs/ADRs are retained as
historical evidence. Application source, schema, migrations and assets are unchanged.

**Validation:** pinned Node 22.23.2/pnpm 11.8.0. `verify:local --plan` conservatively selected
all application jobs. `verify:local` passed static, build, integration, organization,
performance (dashboard p95 441 ms), migrations and fullstack. Browser finished 221 passed
and one offline-PWA failure (loading shell instead of offline heading); both PWA tests
passed in a focused `verify:ci browser e2e/pwa.spec.ts` rerun without code changes. Remaining
`verify:ci legacy` passed 6 and `verify:ci capture` passed 173. The initial aggregate command
therefore exited nonzero; a single uninterrupted all-green run is not claimed. Native
capture generated references were restored because this task makes no UI changes.

Deployment harness passed natively and on Linux, including real flock contention; a separate
isolated Docker 29.4.0 daemon test confirmed legacy and overwritten-tag images are removed,
container-referenced/shared/foreign images are preserved, media/database/Caddy sentinels
remain unchanged and repeat cleanup is safe. The isolated daemon was removed afterward.
Runtime/Compose validators, Actionlint 1.7.7, ShellCheck 0.11.0, validation orchestration 9/9,
format and diff checks passed. Directory Gitleaks 8.24.3 found no leaks. Unchanged production
image rebuild/scans, hosted CI and hosted DNS/TLS/rollback acceptance are not claimed.
The local runner shut down its disposable PostgreSQL; browser preview processes exited.

**DNS verification:** both new domains resolve to the same VM address as both historical
staging domains using system DNS, Cloudflare (1.1.1.1) and Google (8.8.8.8). HTTP reaches
Caddy and redirects to HTTPS; new-domain TLS handshakes still fail before deploying this
configuration. Both old-domain release endpoints return HTTP 200. No DNS records were changed.

**Next deployment prerequisites:** DNS records are ready; verify new-domain TLS after merge/deploy. Existing preflight still requires 5 GiB available before the build; image
cleanup runs after success and cannot rescue a disk already below that threshold. Confirm
HTTPS, both release identities, host isolation, new-origin login/PWA/push and reclaimed disk
usage after deployment. Old DNS should remain available for historical runtime rollback.
Rollback rebuild adds time and registry/package availability requirements. Legacy dangling
images without tag/label/inventory and shared BuildKit cache cannot safely be attributed to
CARE and are intentionally left for operator audit. Foto/attachments in `shared/media`,
Voices in PostgreSQL, Caddy state and current frontend assets are preserved.

## Member home summary, single create entry, unread bell badge — 28 September 2026

**Objective:** align the Member home with the responder dashboard and surface unread notifications. The Member hero now uses the shared **Ringkasan Voice** card (`VoiceSummaryCard`: Total chip + Terbuka/Direspons/Diproses/Selesai), also used by `DashboardHome`. All in-page Buat Voice buttons on the Member home were removed (hero plus orb, "Voice Anda" header button, Aksi cepat tile, empty-state button); creating a Voice is only via the dock **Buat** button / sidebar item. The hero bell on every workforce home shows a red unread-count badge (`GET /notifications/unread-count`, 5 s polling, shared cache key with the notification center, "99+" cap, hidden at zero). After review, badges on the dock/sidebar were rejected; instead the mobile **Lainnya** sheet shows a small "N belum dibaca" note beside **Notifikasi**. No API, schema, permission, or OpenAPI change. PRD §18.1/§18.8.5, ADR-0056, and `implementationPhases.md` record the decision. Phase 13 remains `in_progress`.

**Files changed:** `apps/web-voice/src/components/VoiceSummaryCard.tsx` (new), `apps/web-voice/src/features/notifications/NotificationBell.tsx` (new), `apps/web-voice/src/features/home/HomePage.tsx`, `apps/web-voice/src/features/home/DashboardHome.tsx`, `apps/web-voice/src/App.tsx`, `apps/web-voice/src/styles.css`, `e2e/member-voice.spec.ts`, `e2e/workforce-journeys.spec.ts` (summary/create test, three persona bell tests, zero-unread test; mobile status card test now targets `.dashboard-summary`), `scripts/validation/validation.test.mjs` (browser inventory 402 → 407), `.agent/PRD.md`, `.agent/implementationPhases.md`, `docs/adr/0056-…`.

**Validation (Windows host, scratchpad Node 22.23.2 / pnpm 11.8.0, no Docker):** Prettier (`--end-of-line auto`), ESLint on changed files, workforce typecheck and web-voice build passed. Chromium member/workforce-journeys/dashboard specs 70/70 (one earlier run had 4 transient "element not found" failures under load that did not reproduce in two reruns). Visual workforce + dashboard specs 91/91. Validation orchestration: inventory test passes; tests 6 and 8 fail only for the known CRLF/sealed-build Windows reasons. Screenshots at 360/1440 (Member, Manager, Union Head, Lainnya sheet) were reviewed and approved by the product owner. Not run locally: fullstack, DB jobs, legacy WebKit, native capture refresh, Gitleaks.

**Delivery:** branch `feat/member-home-notification-badge` from `staging`; commit, push, PR targeting `staging`; merge authorized to deploy to staging. Next action: confirm hosted checks and the staging deployment.

## Dashboard basis toggle relabel and placement — 28 September 2026

**Objective:** make the dashboard basis choice easier to understand for unit heads. After comparing three prototypes (a single handling dashboard with a separate reporter section; a sticky toggle at the top or above the mobile dock; a toggle inside the hero), the in-hero toggle was selected. Labels are **Voice Untuk Saya** (`HANDLING`) and **Voice Tim Saya** (`REPORTER`) in a **Basis dashboard** group directly above **Ringkasan Voice**: centered and full hero width on mobile, compact left-aligned pill from 768 px, not sticky. Only accounts without `DIRECTOR`/`UNION_*` capabilities get the toggle; Director and Union have one `HANDLING` dashboard and ignore a `basis` URL parameter. The filter card header shows **Filter dashboard**, and **Reset** became **Refresh** (refetches metadata and the snapshot, keeps filters; disabled offline). Filter clearing remains in the **Filter lainnya** sheet and empty/error states. No API, permission, schema, or OpenAPI change. PRD §18.8.4 (new), §18.8.3 cross-reference, ADR-0055 (new), an ADR-0043 supersession note, and `implementationPhases.md` record the decision. Phase 13 remains `in_progress`.

**Files changed:** `apps/web-voice/src/features/home/DashboardHome.tsx`, `apps/web-voice/src/styles.css`, `e2e/dashboard.spec.ts` (new labels, `clearFilters` helper via the Filter lainnya sheet, Director/Union no-toggle + HANDLING-only request tests, Refresh test counting metadata requests), `e2e/a-workforce-fullstack.spec.ts` (new basis selector), `scripts/validation/validation.test.mjs` (browser inventory 399 → 402), `.agent/PRD.md`, `.agent/implementationPhases.md`, `docs/adr/0055-…`, `docs/adr/0043-…`.

**Validation (Windows host, scratchpad Node 22.23.2 / pnpm 11.8.0, no Docker):** Prettier (changed files, `--end-of-line auto`), ESLint on changed TS files, workforce typecheck, and web-voice/web-admin production builds passed. Browser projects chromium/pwa/push 217/217, legacy WebKit 6/6, visual 173/173. Inspected captures: Department Head Voice Untuk Saya/Voice Tim Saya, Director, Union General at 360/1440. The capture run rewrote `e2e/captures/local/` with `-win32` images and removed `-darwin` references; the folder was restored to the committed references. Not run locally: fullstack, database jobs, and Gitleaks (Docker unavailable); hosted CI is authoritative. Prototype patches for the rejected variants are kept only in the session scratchpad.

**Release note:** production deployment is not configured (`.agent/deploymentGuide.md`: no `main` caller, no production domain; Phase 14 pending). Merging to `staging` deploys to `care.qd-tmmin.site`; merging to `main` only runs CI. `main` was 34 commits behind `staging` at this time.

**Delivery:** branch `feat/dashboard-basis-toggle` from `staging`; commit, push, and PR targeting `staging`. Next action: confirm hosted checks and the staging deployment; decide separately whether to promote `staging` to `main`.

## Ringkasan Voice total chip — 25 September 2026

**Objective:** show the overall Voice count on the responder/leadership/Union dashboard summary without displacing the four status counts. A small **“Total N”** chip now sits beside the **Ringkasan Voice** heading; N is the dashboard aggregate `total` for the current filters and scope (equal to Terbuka + Direspons + Diproses + Selesai). The chip renders only once data has loaded and sits outside the `<h2>`, so the heading's accessible name is unchanged. No API, aggregate, permission, or schema change. PRD §18.8.3, ADR-0043 (summary total amendment), and `implementationPhases.md` record the decision. Phase 13 remains `in_progress`.

**Files changed:** `apps/web-voice/src/features/home/DashboardHome.tsx` (`.dashboard-summary__head` row + `.dashboard-summary__total` chip), `apps/web-voice/src/styles.css`, `e2e/dashboard.spec.ts` (Manager/Director/Union Head test now asserts chip text `Total 14`, vertical alignment with the heading, exact heading name, counts, card height bound, and no 360 px overflow), `.agent/PRD.md`, `.agent/implementationPhases.md`, `docs/adr/0043-…`.

**Validation (Windows host, no Docker):** Node 22.23.2 portable + pnpm 11.8.0 via corepack were installed into the session scratchpad; `pnpm install --frozen-lockfile` succeeded. The shared runner spawns `pnpm` without a shell and fails on Windows (`spawnSync pnpm ENOENT`); it was run through a scratchpad-only preload shim, with no repository change. Static: lint and all unit suites passed (API 111, workforce 126, UI 26, frontend-core 15, Admin 2); the changed files pass Prettier (`--end-of-line auto`) and `git diff --check`. Repository-wide `format:check` (406 files), `openapi:check` drift, and validation tests 6 (needs the sealed build) and 8 (CRLF parsing of workflow YAML) failed only due to `core.autocrlf=true` line endings / environment; the regenerated OpenAPI files differed only in line endings and were restored. Workforce typecheck and web-voice/web-admin production builds passed. Chromium browser: `e2e/dashboard.spec.ts` plus a temporary screenshot spec passed 20/20; the temporary spec was deleted. Screenshots at 360 px and 1440 px (Manager, Union Head Private) were inspected: chip aligned beside the heading, four counts intact, no overflow. Not run locally: fullstack, integration/DB jobs, legacy WebKit, native capture, and directory/commit Gitleaks (Docker unavailable); hosted CI is the first secret scan and full gate for this branch.

**Delivery:** branch `feat/voice-summary-total` from `staging`; commit, push, and PR targeting `staging`. No merge or deployment is claimed. Next action: confirm hosted checks on the PR.

## Create Voice dock and responder status summary — 24 September 2026

**Objective:** keep the highlighted mobile Buat Voice button for every workforce role whose navigation includes Create, and replace the responder/management hero's Total/Aktif/Kritis trio with compact Terbuka/Direspons/Diproses/Selesai counts. The separate status pie chart below the filters is removed. Union's existing navigation has no Create destination under the v1 contract; its dashboard still uses the shared four-status summary. No API, permission, schema, or Member home behavior changed. PRD §18.8.3 and §42, ADR-0043, and ADR-0053 record the presentation decisions.

**Implementation:** the dock highlight follows the `create` navigation item rather than a Member-only capability exclusion. `DashboardHome` reads the four filtered status buckets and renders zero for absent buckets. A compact four-column card uses small status markers; the remaining General chart layout gives the trend full width above severity and category, while Private keeps two charts. Browser coverage includes Manager, Section Head, Division Leadership, and Director create navigation; Manager, Director, and Union Head status counts; full-stack dashboard scope checks; and the browser inventory is now 399.

**Validation:** pinned Node 22.23.2/pnpm 11.8.0. Final static and build jobs passed (format, lint, unit, validation inventory, mock provider, diff, OpenAPI, typecheck, all production builds, PWA). Browser 214/214, legacy WebKit 6/6, and native capture 173/173 passed. The Manager 360 px and department 768 px captures were inspected: four labels and counts fit, the create icon stays prominent, and the duplicate chart is absent. Full-stack 6/6 passed against a disposable database with temporary port-4300 substitutions because another local service occupies port 3000; all four temporary files were restored and the Docker stack was stopped. The first full-stack attempt on port 3000 failed against that unrelated service. The earlier validation attempt also caught and corrected browser inventory/test declaration mistakes before the final pass. Full `verify:local` did not advance to integration, organization, performance, or migration jobs after the port conflict; these jobs do not exercise the frontend presentation change. Hosted checks are intentionally not monitored per user instruction. Generated capture files were restored after visual inspection under the repository's no-screenshot-commit rule. Phase 13 remains `in_progress`.

**Delivery:** branch `fix/highlight-create-voice-all-roles` targets `staging`. Commit/push and PR creation remain to complete this request; no merge or deployment is claimed.

## Personal Voice history scope implementation — 24 September 2026

**Objective:** make responder/management “Voice Saya” list only Voices submitted by the signed-in workforce account. Implemented `GET /voices/mine` with server-owned `reporterId`, shared list filters/pagination, Member capability and workforce-kind checks; `/history` uses the generated typed client and a distinct cache key. Both submit paths invalidate that key. Existing `/voices` browse and `/work-items` scopes remain intact. Added five-role integration coverage and a responder browser regression; updated the browser inventory to 392. ADR-0054 is Accepted. Phase 13 remains `in_progress`; no schema migration or Voice ownership rewrite was needed.

Validation: formatting, lint, unit tests, OpenAPI check, typecheck, API and both web builds, PWA gate, integration 107/107, security 14/14, and focused workforce browser 27/27 with two workers passed. One five-worker browser run had an unrelated pre-session receipt redirect timeout; the complete focused file passed on rerun. The conservative `verify:local` selection stopped at the existing 10,000-account organization-import profile (`PROCESSING` after 240 seconds); a fresh isolated repeat hit its 300-second test timeout. That fixture does not exercise the new list. Performance, migration, full-stack, legacy, and capture jobs after organization were not run; hosted checks are intentionally not monitored per user instruction. Docker test containers and browser preview servers were stopped. Next action: commit/push this branch, then address the separate organization profile timeout before any release acceptance claim.

## Personal Voice history scope analysis — 24 September 2026

**Objective:** explain why responder/management accounts see other reporters' Voices in “Voice Saya” and prepare a complete fix plan. No application code or data was changed. `HistoryPage` calls `GET /voices`; `VoicesService.list` applies `PolicyService.browseScope`, which intentionally includes other General Voices for Manager, division leadership, and Director. A Section Head without another management capability gets own-only browse scope. The Member dashboard instead uses `reporterId = actor.accountId`. PRD §18.8 requires “Voice Saya” to contain only the account's own Voices. Existing Member-only history browser coverage does not detect the elevated-account mismatch. The analysis and proposed implementation/test sequence are in ADR-0054 (Proposed). Phase 13 remains `in_progress`. Checks run: read-only code and documentation inspection, plus `git status`; no runtime, database, or tests were started. Next action: implement and verify ADR-0054, then update its status and record evidence. Open question for any reported anomalies after the scope fix: whether affected records have the expected stored `reporterId`.

## Staging container CI repair — 24 September 2026

**Objective:** restore the failed `Production containers and routing` gate on
the `staging` push of merged PR #53. `gh run view 35934370859 --log-failed`
showed `apk add` could not satisfy the exact `libexpat=2.8.4-r0` pin in the
nginx runtime because the runner's Alpine v3.24 CDN index offered only
`2.8.3-r0`. The release gate failed consequently; all other required jobs
reported success.

Both workforce and Admin nginx Dockerfiles now require the newer stable
`libexpat=2.8.5-r0` and include the signed `dl-4` v3.24 main mirror alongside
the base repository. Exact package pins and the Trivy gate remain intact.
The package command succeeded on the pinned nginx base for `linux/amd64` and
`linux/arm64`; both production web Compose images built successfully. Hadolint
passed both changed Dockerfiles, and runtime environment/Compose validation
passed. Trivy 0.70.0 reported zero High/Critical findings for both built web
images with the committed exception policy. Phase 13 remains
`in_progress`; ADR-0041 contains the rationale and future rollover rule.
Unrelated `.zcodeignore`, PDF, and `output/` files remain untouched.

## Admin mediated handover and scoped chat polish — 23–24 September 2026

**Current objective:** deliver Manager → Admin → department/Manager General Voice routing, numeric No. Reg padding, Member plus emphasis, and a bounded conversation viewport. Product decisions and privacy rules are recorded in PRD §42 and ADR-0053. Phase 13 remains `in_progress`. The completed feature is authorized for commit and push to `feat/tuning-23-sep`; hosted checks are intentionally not monitored at the user's direction.

Implementation includes an additive `AdminHandover` migration, server revalidation and idempotent mutations, Admin queue/decision/history pages, workforce handover choice, generated OpenAPI clients, login normalization, role scoped plus styling, and chat participant/scroll/composer refinements. The original submission category remains immutable. Admin can read all handover reasons; ordinary actors cannot. A custom operational category is a Voice-only label when no active category matches the selected department. The current category is retained when its live route matches.

Two Admin and two conversation design concepts were generated first under ignored `.agent/design-images/admin-handover-chatroom-2026-09-23/`. They are direction references, not runtime assets. Only chat route layout and components were changed.

**Validation complete locally:** OpenAPI regeneration/check, formatting, lint, typecheck, API/workforce/Admin builds and PWA gate passed. The shared local runner passed static, build, integration (106), security (14), organization (5), performance (2), fresh 15-migration chain, and upgrade harnesses. Full-stack passed 6/6 against the disposable database. Its first default-port attempt reached an unrelated process on port 3000; the successful run used temporary port-4300 substitutions in the Playwright/Vite configs and one health test. All four files were restored byte-for-byte, followed by a production build from the original configuration. Browser Chromium/PWA/Push passed 206/206 and legacy WebKit 6/6. Native capture passed 173/173, with two scoped chat recaptures after fixing three-profile overflow. The Admin queue, Admin decision, two-person chat, and three-person chat PNGs were visually inspected.

The final scoped chat CSS adjustment constrains participant text width. A follow-up strengthened the Member-only plus highlight with a restrained halo pulse and reduced-motion static ring. It also removed clipping inherited from the shared dock span rule. Visual inspection then caught a collapsed desktop chat grid row that was absent at mobile widths; a chat-only desktop grid rule and browser geometry assertion now keep the Voice card, log, and composer in view. Static and build jobs passed again, followed by browser 206/206 and legacy WebKit 6/6. Native baselines passed 173/173 after the final correction; the 360 px Member dock and 1440 px three-person chat captures were visually inspected. The test database and agent-started preview/API servers were stopped. No hosted release gate, PR, or deployment is claimed. Unrelated `.zcodeignore`, PDF and `output/` files are preserved.

## Responded conversations and handling targets — 21 September 2026

**Current objective:** implement the approved Direspons/chat/target plan, then
verify through one delegated `gpt-5.6-luna` agent with `high` reasoning.
**Status:** implementation and delegated local verification complete. Prisma generation,
OpenAPI/client generation and formatting preceded verification; no checks were run
until the implementation handoff to Luna high.
Phase 13 remains the single `in_progress` phase. Commit/push on
`feat/response-status` and a PR targeting `staging` are authorized. Merge and
deployment are not part of this delivery.

### Final delegated verification evidence

Luna high completed verification using Node 22.23.2 / pnpm 11.8.0 and the shared
validation jobs. Static passed: formatting/lint, API 111, workforce 126, UI 26,
frontend-core 15, Admin 2 and validation orchestration 9 unit tests, mock provider
smoke and diff checks. Build passed OpenAPI byte stability, typecheck, API/workforce/
Admin production builds and PWA compatibility (main gzip 146,663 bytes).
Integration 105/105, security 14/14, organization 5/5, performance 2/2 (p95 448 ms),
fresh 14-migration chain and all upgrade harnesses passed. Fullstack passed 6/6.
Final browser passed 204/204, legacy WebKit 6/6 and native capture 170/170. Luna
inspected response, response-note, overdue-target and three-party chat PNGs at 360px.
The anonymous Private Union privacy browser test passes after the final correction.

Verification found and corrected unused retired-endpoint arguments, one status-sort
expectation, a nullable current-handler guard and its formatting, a misdirected
obsolete-endpoint test, target Date-versus-ISO replay inconsistency, fullstack target
cleanup, and the Private own-message label bypassing Komite. The final affected
build/browser/legacy/capture rerun passed; unchanged backend jobs were not repeated.
The General chat screenshot correctly displays its General reporter fixture name;
it is not evidence of a Private identity leak.

Docker test containers were stopped by the runner/verifier; final frontend reruns
started no Docker stack and their managed servers exited. No runtime is intentionally
left running. Hosted delivery gates and real-device push acceptance are not claimed.
Delivery preparation: final formatting and diff checks passed; directory Gitleaks
v8.24.3 found no leaks. Existing application verification remains applicable to
unchanged source. The current branch starts at the latest fetched staging HEAD.
Unrelated local PDF/output artifacts are excluded. Next action: inspect hosted PR
checks for the pushed candidate; merge/deployment require separate authorization.

### Implemented behavior

- OPEN → RESPONDED requires a handling note, creates room/first actor message,
  and notifies reporter atomically. Initial assignment collects the note after
  Tugaskan and saves nothing until confirmation. Subsequent assignments retain
  the existing room and optional reason. Only active assigned PIC starts processing;
  without assignment the route owner/Union Head does so.
- RESPONDED/IN_PROGRESS chat is active for reporter, route owner and current
  handler. General names are server-resolved, new messages snapshot names, and
  Private retains anonymous reporter/Komite labels. Compact names cap at twelve
  characters including ellipsis; the participant sheet exposes permitted full names.
  Failed sends retain draft/files and retry keys. New-message scrolling respects
  readers viewing history.
- Processing requests integer 0–365 days, no preselection. Date calculation is
  server-side Jakarta calendar day plus N, ending 23.59.59.999 WIB. Detail shows
  target date/time, overdue/completion state and cycle history. Target is immutable
  per cycle; reopen needs a new target but preserves chat. Old records have no
  fabricated target. Setter and overdue notifications go to reporter/route owner,
  deduplicated even if setter is owner; Private Web Push remains generic.
- The overdue worker follows OUTBOX_ENABLED/30-second cadence, locks Voice like
  close/reopen, checks current cycle, and persists notification marker plus outbox
  atomically. It catches up once and never issues daily reminders.

### Code and contract map

- API: voices service/actions/policies/controller/contracts, new handling-target
  calculation and worker service, dashboard response event aggregation, Admin counts.
- Database: `20260921090000_responded_targets` forward migration renames only status
  MONITORED → RESPONDED, retains historical MONITORED events, creates missing rooms,
  bumps affected versions without rewriting original timestamps, normalizes replay
  status envelopes, adds cycle targets and nullable sender-name snapshots.
- UI: ActionPanel two-step assignment/response and target sheets; HandlingTargetCard;
  ConversationPage participants/composer; status displays, filters, dashboards,
  Admin aggregate key and PWA dashboard cache v3.
- Contract: `/respond` text/version; `/proceed` and `/target` days/version;
  assignment text required for OPEN; `/monitor` retired. Detail adds participants,
  handlingCycleNumber and handlingTargets; message sender adds safe displayName.
  OpenAPI and generated TypeScript are regenerated.
- Tests: updated lifecycle/integration/assignment/fullstack fixtures; new target
  unit and integration scenarios; migration upgrade harness added to root script;
  response/target/chat UI tests and visual states. Capture inventory becomes 170,
  total browser inventory 386 (existing 373 + four functional + nine capture).
- Documentation: PRD §15–16, roadmap, ADR-0052, supersession/amendment in ADR-0044
  and ADR-0031, backend contract notes.

### Verification scope (completed)

Read rules/PRD and ADR-0052, plus ADR-0047 validation policy. Use pinned Node 22.23.2
and pnpm 11.8.0. Inspect `pnpm verify:local --plan`, then execute the shared selected
validation against isolated Docker test DB. New root script changes require the
normal dependency setup rule. Capture only after a current build and inspect relevant
native PNGs. Do not start a hosted delivery or mutate unrelated local artifacts.

Required scenarios: response/assignment required note and atomic rollback, note
cancellation, three-party authorization, sender attribution after assignment,
Private identity and alias protections, version/idempotency/concurrency, old/fresh
migration preservation, 0/365/invalid days, midnight WIB/year/leap transitions,
one target per cycle and reopened cycle with no target, notifier deduplication
across workers and retry, closure/target races, no stale-cycle reminders, clipped
names with full-name accessibility, failed-send retention, responsive/no overflow,
Axe/keyboard, legacy WebKit, fullstack and native capture review. Preserve broad
functional assertions; update obsolete lifecycle expectations instead of skipping.

The completed command outcomes and failure corrections are recorded above. The parent
must not poll progress; inspect findings only when the verifier returns. Stop
agent-started servers/containers per rules. If failures require corrections,
record them and rerun affected checks after the parent fixes the implementation.

### Local files to preserve

Pre-existing untracked `docs/reports/ling3-live-30-voice-evaluation-2026-09-16.pdf`
and `output/` are unrelated and must remain untouched. No development stack was
started during implementation. Generated-contract tooling has exited.

## Classification Definition clarity and severity calibration — 16 September 2026

Branch `feat/classification-definitions-v2` starts from `origin/staging`. The
initial change is restricted to the six built-in category Definition values. Safety/Environment,
Facility/Facility Repair and Work Difficulty/Welfare now state their primary
remediation domains and explicit exclusions; Welfare explicitly covers bullying,
harassment, discrimination and retaliation. Classification version advances to
`care-classification-v1.6` to invalidate v1.5 draft results after the structured
context changes.

A follow-up changes only the code-owned severity rubric and advances the version
to `care-classification-v1.7`. It evaluates concrete impact, urgency, scale,
recurrence and ongoing exposure; distinguishes contained issues, significant
prompt action and active emergencies; preserves credible serious near misses even
without realized injury; and lowers confidence instead of defaulting incomplete
facts to LOW. Category instructions, Definitions/Examples, confidence guidance,
schema, routes, sampling, output cap and provider settings are unchanged by v1.7.

Migration `20260916090000_category_definition_clarity` preserves revision 1 and
creates revision 2 for the six original categories, copying names/Examples and
leaving routes and custom categories untouched. It fails closed when an active
built-in category is not the expected revision 1, preventing silent overwrite of
Admin history. Focused API unit tests pass (106 tests across ten files), formatting,
the destructive-migration check and `git diff --check` pass. After OrbStack was
started, the complete 13-migration chain applied successfully to a fresh disposable
`care_test` database. SQL verification confirmed six revision-2 definitions, one
active revision per built-in category, preserved revision-1 history, byte-equal
names/Examples, category version 2, and six unchanged active routes.

The complete shared validator then passed all ten selected jobs: static, build,
integration (103), security (14), organization routing (5), performance (2;
dashboard p95 444 ms), migrations, fullstack (6), browser/PWA/push (200), legacy
WebKit (6), and native visual capture (161). Its cleanup stopped and removed the
disposable PostgreSQL stack. The Markdown report for the 80 synthetic Indonesian
Voice evaluation is included as supporting evidence; the generated PDF remains a
local untracked artifact and is excluded from the branch.

For the v1.7 severity-only follow-up, the focused API suite and shared static job
passed with API 106, UI 26, frontend-core 15, workforce 124, Admin 2, validation
orchestration 9, formatting/lint, provider smoke and diff checks. The shared build
job passed OpenAPI byte stability, typecheck, production builds and the PWA gate.
Database-backed integration passed 103/103 and security 14/14 against the full
13-migration schema. Organization, performance, migration-upgrade, fullstack,
browser, legacy and capture jobs were not repeated because the prompt-only delta
does not affect them and they passed immediately before this follow-up. The
disposable PostgreSQL stack was removed afterward. Hosted PR checks remain
intentionally unmonitored per user instruction.

## Ling 3.0 Tiny FP8 inference migration — 15 September 2026

Current objective: replace the active local Granite provider with
`inclusionAI/Ling-3.0-tiny-fp8` on `dx-2` and coordinate the matching CARE
provider profile through a feature PR and staging deployment. The inference
stack now builds SGLang 0.5.19 locally from the digest-pinned CUDA 13.0.3 base,
reusing the `dx-2` Docker cache. It runs the native FP8 checkpoint with a
32,768-token context, TP one, explicit `deepseek-r1`/`glm45` parsers and LPM
scheduling. CARE keeps thinking enabled by default, sends the model-recommended
sampling values, caps output at 8,192 tokens and raises the per-attempt timeout
default/ceiling to 90 seconds. DeepSeek and strict fail-closed validation remain.

Deployment completed through PRs #47–#49. Staging SHA `1464cd5b` passed every
hosted gate and deployed successfully; public readiness reports Ling as the
effective model with blank/default reasoning effort. On `dx-2`, the NVIDIA
kernel/userspace mismatch was resolved by rebooting into driver `595.91.07`.
Granite remains stopped and is no longer advertised. The custom image reports
SGLang 0.5.19, detects the checkpoint as FP8 E4M3, loads 7.96 GB of weights, and
keeps the inference and authenticated gateway containers healthy. Public TLS
returns 401 without a Bearer token and `/v1/models` advertises only Ling.

The pre-cutover Trivy scan initially reported 424 High/Critical findings. OS
security upgrades, removal of unused Nsight Compute, and upgrades to Diffusers
0.40.0/Pillow 12.3.0 removed every Python and executable finding. The remaining
171 findings (166 High, five Critical) are all unfixed `linux-libc-dev` header
metadata; none were suppressed or allowlisted. A classification/location smoke
returned separate reasoning and exactly one schema-valid tool call for each. A
20-Voice Indonesian evaluation using the exact app prompt, dynamic category
context, schema, named tool choice, thinking settings, sampling, 8,192-token cap,
90-second timeout and concurrency four produced 20/20 HTTP successes, 20/20
valid tool calls, no free-text output, no incomplete responses and zero
threshold-0.75 fallbacks. Category matched the review labels 18/20 and severity
12/20. Median latency was 7.71 seconds and p95 37.07 seconds; median generated
tokens were 1,189.5 and p95 3,579. Reasoning appeared in all responses and was
often disproportionately long (median 4,810 characters, maximum 14,764), while
confidence stayed 0.85–1.0 even on label disagreements. This removes the prior
format-driven Manual Fallback pattern but exposes overthinking, overconfidence,
and a systematic tendency to understate severity by one level. No database or
public OpenAPI shape changed. The temporary live-evaluation files were removed;
the Ling stack and gateway remain running.

## Classification output simplification — 15 September 2026

The user requested removal of `rationaleCode` from the LLM prompt and schema so
classification does not spend reasoning/output effort on an unused reason label.
The code-owned classification prompt and generated function schema now request
only category, severity and confidence; strict local Zod validation matches that
shape, provider mocks and the independent Granite smoke schema were updated, and
the prompt version advances from `care-classification-v1.4` to
`care-classification-v1.5`. The existing non-null persistence/API field remains for
backward compatibility: new AI snapshots store `NOT_REQUESTED`, manual snapshots
remain `MANUAL`, and historical values are untouched. No database migration,
OpenAPI/client change, routing change, or location-review change is included.

Follow-up: the CARE Granite request cap is reduced from 4,096 to 2,500 generated
tokens in the application-side provider configuration. No file, configuration,
container, or service on `dx-2` was changed or restarted; direct non-CARE clients
of the inference endpoint are not globally capped by this decision.
The cap follow-up passed its focused domain suite (25/25), API typecheck,
formatting, and `git diff --check`; the broader unchanged evidence below remains
applicable.

Changed files: AI prompt/schema/service, Voice snapshot persistence, mocked and
independent Granite smoke schemas, AI contract tests, PRD, roadmap, and ADR-0030.
Validation used Node 22.23.2 and pnpm 11.8.0. Focused AI contracts passed 46/46,
including assertions that the function schema omits `rationaleCode` and strict
validation rejects an obsolete extra field. Mock provider smoke, Python syntax,
formatting, lint, typecheck, OpenAPI byte stability, production builds, PWA gate,
and `git diff --check` passed. Shared static passed with API 100, UI 26,
frontend-core 15, workforce 124, Admin 2, and validation orchestration 9. Shared
integration passed 103/103 and security 14/14; fullstack passed 6/6. The first
broad local run stopped after 102/103 integration tests when the unrelated DOB
import worker remained `QUEUED` for 20 seconds; its isolated rerun passed 1/1,
then the complete integration/security jobs passed. Unaffected organization,
performance, migration-upgrade, browser, legacy, and capture jobs were not rerun
after that unrelated stop. The Docker PostgreSQL stack was stopped at closeout.
Phase 13 remains the only `in_progress` phase; no commit, push, deployment, or
live-provider call was part of the implementation request. The user subsequently
authorized committing and pushing the complete change directly to `staging`;
merge is not applicable and deployment remains controlled by the existing hosted
release workflow.

## Android Web Push enrollment and delivery fix — 14 September 2026

The user reported that Android push notifications still fail and cannot be set up, while iOS Home-Screen push already works. Branch `fix/android-notifs` is based on `staging` at `e0d8b1a5` and has no commits; all work is uncommitted. Reading the enrollment path found four Android-specific defects: (1) `use-web-push.ts` awaited `navigator.serviceWorker.ready` before `Notification.requestPermission()`, which on Chrome/Android runs past the tap's transient user activation, so the prompt is silently suppressed, `requestPermission()` resolves `default`, and the user sees a misleading "Izin notifikasi ditolak"; (2) `subscribe()` never reused `pushManager.getSubscription()`, so a repeat tap or a VAPID rotation rejected with `InvalidStateError`/`AbortError`; (3) `POST /push/subscriptions` could return 500 because `PushSubscription` is unique on `(endpointHash, environment)` while the service upserted only on `(accountId, installationId, environment)` — Android/FCM shares one endpoint per browser profile, unlike iOS; (4) notification taps could not deep-link because the service worker read `payload.url` while the server sends `deepLink`, and the `NOTIFICATION_NAVIGATE` message had no listener in the application.

Enrollment now requests permission first inside the gesture, distinguishes denied from dismissed, reuses or replaces an existing subscription with one `InvalidStateError` retry, and maps failures to platform-aware Indonesian guidance through the new pure `lib/push-errors.ts`. The settings card gained a retryable `permission-blocked` view and a collapsible "Detail teknis" panel (permission, service worker, provider host, installation registration, endpoint hash prefix, last failure) with no sensitive data. The service worker parses `deepLink` with a `url` fallback through the new pure `lib/push-payload.ts`, never throws on malformed payloads, and adds a per-deep-link `tag` with `renotify` so repeated updates collapse; the app shell routes `NOTIFICATION_NAVIGATE` through React Router. The API reconciles endpoint ownership in one transaction with a single P2002 retry, classifies transient failures (no status/429/5xx) separately from non-transient ones, retires a device after ten non-transient failures, isolates delivery per device, and `PUSH_ENDPOINT_HOSTS` now accepts suffix entries (`*.notify.windows.com`) with suffix-confined matching so Edge/Windows endpoints are no longer rejected. A drift-repair effect re-registers a rotated FCM endpoint when the stored hash prefix differs, and push status exposes `endpointHashPrefix`. OpenAPI aligns `installationId` bounds (1–100).

Changed: `apps/web-voice/src/lib/{push,push-errors,push-payload}.ts` and tests, `features/notifications/{use-web-push.ts,PushSettingsCard.tsx,push-settings-state.ts}` and test, `src/sw.ts`, `src/App.tsx`, `src/styles.css`; `apps/api/src/notifications/{notifications.service.ts,push-endpoint.ts}`, `src/config.ts`, `scripts/enrich-openapi.ts`, `scripts/setup-local.ts`, regenerated `openapi.json` and `packages/contracts/src/generated.ts`; env/deploy samples and `deploy/scripts/validate-runtime-env.sh`; `e2e/workforce-push.spec.ts` (11 tests, stub extended for keys, rotation, errors), `e2e/helpers/mock-api.ts`, `scripts/validation/validation.test.mjs` (browser inventory now 373), `scripts/check-pwa-compatibility.mjs`; `docs/adr/0051-web-push-android-enrollment-and-delivery.md`, ADR-0026 amendment, PRD §19.4/§21.2/§23.4/§38, `docs/backend.md`, `.agent/implementationPhases.md`, `.agent/deploymentGuide.md` §12.1.

Validation used the pinned Node 22.23.2 / pnpm 11.8.0. `pnpm verify:local --plan` selected static, build, integration, organization, performance, migrations, fullstack, browser, legacy and capture, and the full invocation passed all ten jobs. Static: format/lint, `git diff --check`, API 99, UI 26, frontend-core 15, web-voice 124 (16 files), Admin 2, nine validation-orchestration tests, provider smoke. Build: OpenAPI byte-stability, typecheck, production builds, PWA compatibility gate passed at main gzip 144,904 bytes. Integration 103/103 over 14 files, including six new push-subscription cases (FCM and WNS enrollment, ownership transfer for a reinstalled installation and for a second account on one browser profile, concurrent duplicate subscribe, look-alike-suffix rejection, environment-scoped unsubscribe); security 14/14; organization routing 5/5; performance 2/2 with organization dashboard p95 684 ms; migration upgrade harnesses passed; fullstack 6/6; browser 200/200 (187 Chromium, 11 push, 2 PWA); legacy WebKit 6/6; native capture 161/161.

The regenerated `workforce-notifications-360-darwin.png` was inspected: the only visual delta is the shortened unsupported-browser guidance, since the title already states the browser is unsupported. Unrelated auth-reset and submit-success captures regenerated by the broad capture run differed only by antialiasing (max channel delta 1–2, under 0.1% of channels on the submit captures) and were restored. ADR-0026 required re-recording the PWA budget because the enrollment code grew the bootstrap chunk past the previous 143,500-byte limit: the baseline is now 144,904 bytes with the budget derived at +15% (166,640 bytes), recorded in ADR-0026's amendment and ADR-0051's consequences.

A physical Android device on staging remains the acceptance step; the card's "Detail teknis" section is the evidence source if enrollment still fails there, and it is what will confirm which of the four causes was the real one on that device. The optional in-app test-notification endpoint was deferred because it would add API surface, and `PUSH_ENDPOINT_NOT_ALLOWED` is documented in `docs/backend.md` rather than OpenAPI. PR #46 passed hosted CI 22/22 (run 34915799121) and was merged into `staging` as `dcf67bf1`; the staging delivery run 34916369141 completed successfully, including `Deploy staging`, so `https://care.qd-tmmin.site` serves this fix. Hosted CI, container and deploy results are the deployed acceptance evidence; physical Android device acceptance remains outstanding. After the run no container was running, `pnpm db:down` left the local stack down, and nothing listens on 3000/4173/4174; stopped `care-ci-*`/`care-qa-*` containers and networks from earlier sessions were left untouched.

## Fresh-database KPI benchmark and aggregation — 14 September 2026

Run 34796799314 still failed performance at 3,996 ms p95 after the first SQL refinement; every other required job passed. The earlier 607 ms native result did not reproduce a newly loaded x64 CI database and was insufficient acceptance evidence.

An isolated Linux x64 reproduction used Node 22.23.2, pnpm 11.8.0 and the exact PostgreSQL 16 image digest from CI, with application and database restricted to the same two CPUs. On a freshly created database, the previously pushed code failed at 3,602 ms p95. EXPLAIN estimated 14 global Voice rows versus 50,000 actual rows, and one scoped row versus 12,500, because bulk seed had not collected statistics. The response plan sorted 37,500 samples and the closure path made 25,000 predecessor and rating probes. Autoanalyze timing differed between runs/tables. Explicit ANALYZE on the same data and code reduced p95 to 2,965 ms. This isolates missing statistics as a remaining cause, not merely hardware speed.

The performance seed now explicitly analyzes Voice, VoiceEvent, ClosureCycle and Rating after bulk insertion, before timing. The benchmark asserts that these tables have statistics and logs estimated row counts, architecture and CPU availability. The 50,000-Voice fixture, 150 requests, 50 concurrency, threshold and all measured requests are unchanged. No dashboard warm-up query, retry, query cache, test skip, production planner setting or pool-size change is introduced. PostgreSQL recommends collecting statistics after bulk load: https://www.postgresql.org/docs/16/populate.html#POPULATE-ANALYZE.

Application queries also do less work: total/date bounds/unresolved count reuse the narrow KPI cohort instead of scanning Voice again; organization dimensions group native columns before serializing bucket labels; duration sums use PostgreSQL intervals with a single seconds conversion and division after aggregation. This preserves sub-microsecond means rather than truncating with AVG(interval). Empty denominators remain null, unrated completions and invalid-history feedback remain independent, and the existing repeatable-read snapshot is retained. A new integration test verifies 1 ms / 3 sample precision and the exact six-field KPI contract.

The final x64 SQL measured 2,464 ms p95 with the default Prisma pool; the original fresh-database failure was 3,602 ms. These are an emulated x64 reproduction, not a claim of hosted parity. An additional five-connection diagnostic was exploratory only and is not used as acceptance evidence or shipped configuration. Final shared static/build checks passed (unit suites, lint/format, orchestration/provider smoke, OpenAPI stability, typecheck and PWA compatibility). Integration passed 97/97, security 14/14, fullstack 6/6, and native performance/reconciliation passed at 446 ms p95. Directory Gitleaks found no leaks. The x64 reproduction containers were removed; Docker/Playwright session runtimes are stopped before delivery. Hosted validation will be checked on the pushed candidate. No UI, API contract, schema migration, authorization, merge or deployment change is included.

## Fix PR #45 hosted dashboard performance — 14 September 2026

The user requested inspection and repair of failing CI, superseding the earlier no-monitor instruction for this repair. Run 34795987639 failed only API performance (4,734 ms p95 > 3,000 ms); Release candidate gate failed as a consequence. Other application/security/container/browser jobs passed.

Root cause: enum-to-text predicates hid planner statistics (global cohort estimated 250 vs actual 50,000), compounded by repeated sample materialization/scans and 25,000 rating index lookups. The fix keeps enum columns typed with parameterized enum values, aggregates response average/count together, and uses existing unique constraints to join exact predecessor cycles and optional ratings without multiplying samples. Completion and feedback use independent aggregate predicates, preserving unrated closures and rated cycles with incomplete timestamps. No API/schema/UI/permission or performance-test threshold changes.

Changed: dashboard SQL, SQL contract tests, organization-dashboard integration regression, ADR-0042, roadmap and this handoff. Local EXPLAIN global KPI: 69.95 → 41.16 ms and 79,187 → 4,472 shared-buffer hits; scoped KPI: 21.18 → 12.54 ms and 90,278 → 3,790 hits. Initial full endpoint performance rerun: 515 ms p95 on the same 50k-Voice / 50-concurrent fixture. Shared final static/build checks passed, including OpenAPI stability, typecheck, unit tests, validation orchestration and PWA compatibility. Integration passed 96/96 plus security 14/14. Shared performance and reconciliation passed with the full fixture. Hosted acceptance will be checked after pushing the fix; no merge/deployment is authorized.

## Dashboard PR delivery — 14 September 2026

Delivery is authorized on `feat/dashboard-improvements`, with a pull request to `staging` and explicitly no hosted CI monitoring. The branch starts at the fetched staging HEAD `d544f6fe`; no unrelated commits are included. Existing task validation evidence below remains applicable; no application changes were made during delivery preparation. Directory Gitleaks v8.24.3 found no leaks. The committed candidate must pass the same image’s last-commit scan before push. Native reviewed references are included under ADR-0047; CI-generated screenshots are not committed. No merge or deployment is authorized or claimed.

## Dashboard performance, organization controls and all-time default — 14 September 2026

Implemented the accepted dashboard changes for General HANDLING/REPORTER and Union Private. Response is submit to first MONITORED event per Voice; completion averages each closed cycle (submit or previous reopen to closed); performance averages all ratings including reopen feedback. All samples follow the selected Voice cohort, current status and submit-date range. Missing/negative durations are excluded, zero remains valid, and no samples produce nullable averages with zero counts. Three compact responsive cards provide independent hours/days toggles, sample counts, proportional stars and keyboard/tap-accessible definitions. Manual unit choices survive filter refreshes.

Organization metadata/view now include server-authored controls and atomic query targets. Fixed ancestors are hidden, Department Head “Semua department” enters PARENT, returning to the department enters OWN, and existing sibling-unit restrictions/exact Default PIC mappings are preserved. Private responses contain no organization control options. One selector renderer serves desktop and mobile, with explicit “Semua” placeholders and descriptor freshness checks. Default/reset range is **Semua waktu**; relative options read **30 hari** and **90 hari**. The all-time visual fixture now correctly has no previous-period comparison.

Changed areas: API dashboard SQL and metadata resolver; OpenAPI/generated contracts; workforce DashboardHome, new DashboardPerformance and scoped CSS; lifecycle performance seed; integration/unit/browser fixtures and tests; native gallery; PRD/roadmap/ADR-0042. No database migration or lifecycle mutation change. No commit, push or deployment performed. Existing release phase remains unchanged.

Validation evidence (Node 22.23.2 / pnpm 11.8.0; disposable Docker PostgreSQL):

- `pnpm verify:local --plan` selected static, build, integration, organization, performance, migrations, fullstack, browser, legacy and capture.
- The broad local invocation passed static/build, 94 integration cases, 14 security cases, five organization-routing cases, performance and every migration-upgrade harness. A new browser test required updating the explicit inventory from 365 to 366. The broad run stopped at fullstack while an intermediate rebuild had removed dist; the rebuild also caught an exactOptionalPropertyTypes prop issue, which was corrected. Subsequent affected shared jobs passed; the broad invocation is not claimed as a single uninterrupted pass.
- Final shared static job passed formatting/lint, unit suites (API 88, UI 26, frontend-core 15, workforce 88, Admin 2), all nine validation-orchestration tests, provider mock smoke and diff checks. Subsequent small changes received scoped checks.
- Shared build jobs passed OpenAPI stability, typecheck, production builds and PWA compatibility after final relevant changes.
- Performance passed p95 **1,036 ms**, 150 requests / 50 concurrent, on at least 50,000 Voices with MONITORED events, repeated closure cycles and ratings. Existing 3,000 ms threshold and transaction settings were retained; reconciliation passed.
- After adding zero/negative/missing-history and Private-cohort coverage, focused organization-dashboard integration passed **25/25**. After excluding all Private control options, focused integration and security **14/14** passed again. Real fullstack passed **6/6** after the final functional changes.
- Shared browser job passed **193/193** (Chromium/PWA/push). Focused dashboard passed **13/13** after refinements, including all-time/reset labels, unit persistence, scope targets, metadata changes, and Axe/overflow at 360/390/768/1440. Legacy WebKit passed **6/6**.
- Native capture passed **161/161**; final affected dashboard/workforce captures were regenerated after presentation refinements. Desktop department, mobile department/Union and tablet empty-state images were inspected. Unrelated auth-reset and submit-success PNG changes from the broad capture were restored. Gallery: `e2e/captures/local/index.html`.

Hosted CI, Linux runner performance and physical-device acceptance were not run or claimed. Docker test stacks were shut down by cleanup traps; Playwright preview/API servers were stopped after each completed invocation. Next action: review the implementation and native gallery; delivery requires separate authorization.

## Workforce create-flow and category presentation — 13 September 2026

Current branch: `feat/ui-revisions`, based on `origin/staging` at `588bac2b`. The six annotated requirements in `/Users/khalfanishaquille/Downloads/CARE Tracking.xlsx` were implemented as workforce frontend presentation changes only. The source workbook was inspected read-only and was not modified.

The create flow now says **Pilih kategori yang tepat untuk suara Anda.**, uses the corrected **dirahasiakan** spelling, and keeps **Mohon tetap di halaman ini** inside the blue AI-processing live region as a responsive contrast callout. Manual Fallback uses the approved Low and High descriptions. A centralized stable-key formatter presents `ENVIRONMENT` as **Lingkungan** and `FACILITY_REPAIR` as **Perbaikan Fasilitas** throughout workforce create, preview, cards/inbox, detail/hero, dashboard/filter/chart, General browse, and handover current/destination/history surfaces. Other standard and custom categories retain their API/catalog names, and handover search accepts the Indonesian alias, original catalog name, or stable key. Ready General draft previews now show **PIC Terkait**; unresolved General routes remain **Akan ditentukan**, and Private routes remain **Komite**.

ADR-0050 and the PRD record the workforce-only alias and generic-preview contract. Category catalog data, Admin presentation, stored historical snapshots, category revisions, routing, route targets, API/OpenAPI, generated client, AI prompt, and severity semantics are unchanged. Phase 13 remains the only `in_progress` phase.

Validation completed locally with the pinned Node 22.23.2 / pnpm 11.8.0:

- `pnpm verify:local --plan` selected static, build, browser, legacy, capture, fullstack, integration, organization, performance, and migrations.
- `pnpm verify:local` passed every selected job: format/lint, all unit suites (API 88, UI 26, frontend-core 15, Admin 2, workforce 87), nine validation-orchestration tests, provider smoke, OpenAPI byte-stability, typecheck, production builds, PWA compatibility (main gzip 141226 bytes), 192 Chromium/PWA/push tests, six legacy WebKit tests, 161 native visual scenarios, six fullstack tests, 92 integration tests, 14 security tests, five organization-routing tests, two performance tests (organization dashboard p95 330 ms), reconciliation, and all migration-upgrade checks.
- Browser inventory was intentionally updated from 362 to 365 for the three added General preview cases. No behavioral assertion or threshold was removed.
- The final native gallery was generated once after the UI stabilized. Create type, processing, Manual Fallback, General review, representative dashboard, and handover images were inspected: approved copy and aliases are readable, the processing callout remains inside the card, and mobile CTA/safe-area layout is intact.

The validation runner stopped and removed its PostgreSQL container/network; no application, preview, database, or test process remains. Commit, push, and a PR to `staging` are explicitly authorized, followed by CI checks at 900-second intervals until all required checks are green. Merge and deployment are not authorized.

## Authentication identifier editing and recovery refinement — 10 September 2026

Current branch: `staging`. Resolved the reported defect where tapping **Ubah No. Reg** on the workforce login (and the recovery page) focused the No. Reg field but the software keyboard never appeared on iOS/Safari. The handler focused the input synchronously while React had not yet committed `readOnly={false}`, so Safari saw a read-only field and suppressed the keyboard and did not re-evaluate after the attribute was removed. Both handlers (`apps/web-voice/src/App.tsx`, `apps/web-voice/src/features/auth/ForgotPasswordPage.tsx`) now import `flushSync` from `react-dom` and commit the stage collapse before focusing, keeping the field's `readOnly` lock otherwise intact. ADR-0049 records the decision.

The same task applied the product-owner presentation decisions:

- Removed the step-heading captions beside **Ubah No. Reg** ("Password akun" on login; "Verifikasi akun" and "Ketersediaan reset" on recovery); the control is now right-aligned.
- Made **Ubah No. Reg** and **Lupa Password?** compact (36 px, smaller type) and tightened the expanded stage's internal and surrounding gaps. This is an explicitly approved lower-than-44 px exception, now recorded in PRD §22.2; §8.1 documents the editable-and-focused identifier behaviour.
- Doubled the shared reveal animation for a smoother feel: height 480 ms, opacity 360 ms, settle 520 ms (`AuthReveal.tsx`); reduced motion stays instant.
- Balanced the birth-date columns so the "Tanggal" label no longer clips and the month control is shorter: equal day/month/year fractions on the 3-column layout and equal day/month on the sub-480 px layout.

Changed files: `apps/web-voice/src/App.tsx`, `apps/web-voice/src/features/auth/ForgotPasswordPage.tsx`, `apps/web-voice/src/features/auth/AuthReveal.tsx`, `apps/web-voice/src/styles.css`, `e2e/auth-recovery.spec.ts`, `scripts/validation/validation.test.mjs` (inventory 361→362), all 33 tracked auth captures plus `e2e/captures/local/index.html` and `manifest.json`, `docs/adr/0049-authentication-identifier-editing-and-recovery-refinement.md`, `.agent/PRD.md`, `.agent/implementationPhases.md`, and this handoff.

Validation completed locally with the pinned Node 22.23.2 / pnpm 11.8.0:

- `pnpm verify:ci build`: OpenAPI check, typecheck, production bundles and the PWA compatibility artifact gate passed (main gzip 142443 bytes).
- Focused `e2e/auth-recovery.spec.ts` (chromium): 12/12, including the new regression that asserts the identifier is editable after both **Ubah No. Reg** controls, that the removed captions are absent, and that the day column is at least as wide as the month column.
- `pnpm verify:ci browser`: 189/189 (Chromium, PWA, push). `pnpm verify:ci legacy`: 6/6 (legacy WebKit, including recovery controls).
- `pnpm verify:ci fullstack`: 6/6 on a fresh Docker `care_test` database, including the real reset → login → password-change journey.
- `pnpm verify:ci static`: format, lint, unit suites, validation orchestration (9 tests, inventory now 362), mocked provider smoke and `git diff --check` passed.
- `pnpm visual:capture e2e/auth-recovery.visual.spec.ts`: 33/33 auth references regenerated (all auth states shifted because the `.auth-form` gap changed). Representative 360/768/1440 login-password, reset-date, and reset-tm images were inspected: no captions, right-aligned control, "Tanggal" no longer clipped, equal date columns.

The Docker test PostgreSQL stack was stopped with `pnpm db:down`; no application server, preview server, or test process remains. No hosted run, deployment, or operational data import was performed. Delivery (commit/push/PR) requires explicit authorization.

## Hosted capture merge correction — 10 September 2026

PR #42 run 34442936372 at 61134fd8 passed all application, API, browser/capture shards, fullstack, migration, production container and security jobs. Browser report merging alone failed because merge-captures.mjs retained the old expected count 128 while 161 scenarios were produced; the release gate correctly rejected that report failure.

The expected count now lives in scripts/validation/capture-contract.mjs and is consumed by the hosted merger, native reporter and actual Playwright inventory test. A new regression invokes the real merge CLI with complete and incomplete synthetic inventories, preserving strict missing/duplicate/stale evidence rejection. Nine validation tests and focused lint/diff checks pass. The two real hosted capture artifacts from run 34442936372 were downloaded and merged successfully with the corrected CLI: 161 scenarios/164 images. No application behavior or images changed, so successful hosted application evidence is retained without an unrelated local rerun.

Commit/push to the existing feature branch and PR are authorized. The replacement hosted run must pass before reporting CI fixed. No application server or database was started for this correction. ADR-0047 records the shared count contract.

## Registration-first authentication and DOB recovery — 10 September 2026

Current branch: `feat/vokasi-and-login-forget`. Implementation includes shared No. Reg-first workforce/Union login, restricted default-workforce entry, optional current password only for verified default sessions, DOB reset, nullable Employee birthDate migration, seven/eight-column imports, Admin preview summaries, OpenAPI/client/auth cache, and new functional/fullstack/native-capture scenarios. ADR-0048 records decisions and accepted identity-verification tradeoffs. Phase 13 remains the only in-progress phase.

The source workbook was parsed read-only with the production parser: 7,418 unique rows, 7,018 birth dates, 400 TM members. Commit, push and a pull request from this feature branch to staging are authorized by the delivery follow-up. Operational import and deployment remain outside this task. Real PII remains outside Git.

Validation completed locally using the pinned Node 22.23.2 and pnpm 11.8.0. `pnpm verify:local --plan` selected static, build, integration, organization, performance, migrations, fullstack, browser, legacy and capture. The broad invocation passed static/build, 90 integration tests, 14 security tests, 5 organization tests, 2 performance tests, migration checks and 6 fullstack tests. Its browser run passed 183 tests but found mobile grid recentering and an Axe check during reveal opacity; both were corrected without weakening assertions. Relevant checks were then rerun through shared jobs rather than repeating unrelated successful database suites.

Final evidence:

- `pnpm verify:ci static`: formatting/lint, unit suites, eight validation-orchestration tests, mocked provider contract and diff check passed. Final CSS/doc-only polish also passed focused formatting/diff checks.
- `pnpm verify:ci build`: current OpenAPI, typecheck, production bundles and legacy PWA artifact gate passed after final UI edits.
- Focused real PostgreSQL auth/import tests: 9/9, including reset racing with login/change, sibling-session revocation, DOB preservation/clearing and default/Union/TM boundaries.
- Fullstack rerun: 6/6, including the new real-API reset → login → password-change journey. Final subsequent CSS-only DOB control sizing was covered by browser/legacy/capture checks.
- Auth browser suite: 11/11 at 360/390/768/1440; Axe, keyboard, reduced motion, stable card position, unavailable/reset-error states, pending and offline handling passed. Other unchanged browser scenarios retain the 183-pass broad-run evidence.
- Legacy WebKit: 6/6 after final CSS, including DOB recovery.
- Native capture: 161/161 scenarios, 164 PNGs in the gallery, including 33 new auth references. Final recovery sizing/back-link polish regenerated the 18 affected recovery scenarios successfully. Representative mobile, tablet and desktop login/reset/default-password images were inspected; mobile date values now display completely.
- Production parser read-only source check: 7,418 rows, all unique, 7,018 dates and 400 TM identifiers. Tests/captures use synthetic data only.

Initial static failures were unused/test helper typing and the outdated browser inventory count; the CI completeness check now expects 361 tests/161 visual scenarios, and the capture reporter recognizes the expanded full set. An old initial-login capture assertion was updated from Masuk to Lanjutkan. No thresholds or behavioral checks were removed. Logs are `/tmp/care-vokasi-validation-3.log` and `/tmp/care-auth-*.log`.

No hosted release gates, deployment or operational data import ran. The additive migration and workbook import still need application in the destination environment through normal deployment and preview/confirm. Agent-started Docker test stacks and browser/API servers were stopped; no process needs to remain running. Delivery follow-up authorizes commit/push and a PR to staging. Directory Gitleaks passed before commit; the commit scan and hosted PR checks follow during delivery.

## CI environment isolation correction — 10 September 2026

Run 34436499848 at 50d4f56c passed every application/API/browser/capture/report,
migration, static and security job that ran. Production containers failed the first
release.json identity assertion: workflow-global RELEASE_SHA=ci overrode the
zero-SHA fixture in the Compose env file. The first jq comparison returned false.
This was environment leakage introduced by the validation split, not an app or
screenshot failure. Later container checks/scans did not run after that failure.

Test environment variables now exist only on quality, build, API matrix, browser
matrix and fullstack jobs. Production containers retain their fixture environment;
other security/deployment jobs no longer inherit test credentials or NODE_ENV.
A regression contract verifies that test variables cannot become workflow-global
or override container fixtures. Compose resolution confirms all three app images
use the expected zero-SHA tag. Eight orchestration tests, lint, formatting,
Actionlint and diff checks pass. Existing hosted application evidence is reused;
no unrelated application or visual suites are repeated locally.

Corrective commit/push follows the existing delivery authorization. Do not monitor
the replacement hosted run after pushing, per the delivery instruction. No runtime
stack was started for this correction; Compose config and ephemeral scanner/linter
containers only. ADR-0047 records the environment-boundary requirement.

## Shared validation and native capture implementation — 10 September 2026

Implemented locally on `staging`, starting at `fb55191c6e3358d2a8fc60c1499069bf1560b8d6`.
Commit and push to `staging` are now explicitly authorized. Hosted runs must not
be monitored for this delivery, per instruction. Earlier hosted run 34323788233 passed
staging delivery; it does not validate this uncommitted workflow refactor. Phase 13
remains the only `in_progress` phase. ADR-0047 is accepted for the scope below.

Implemented:

- Shared `verify:local`, `verify:full`, `verify:ci`, `verify:repro` and `visual:capture`
  commands. Conservative local scope includes working changes and optional
  `--base=<ref>`; task prerequisites are deduplicated within the invocation.
- Full local CI replay before every commit is replaced in rules §4.2 by relevant
  native checks and exact-SHA hosted release authority. No persistent test-result
  cache, Linux container generation or automatic install is hidden in the runner.
- CI separates static quality, contract/typecheck/build, isolated API matrix
  (integration, organization import, performance, migrations), two functional
  browser shards, two capture shards, legacy WebKit and isolated fullstack.
  All results plus merged reports are required by the stable release gate.
- Application build artifact records SHA/source content/output checksums and is
  verified before browser/fullstack use. Frontend typechecking occurs once before
  Vite bundling; API scripts/tests typechecking remains separate from runtime emit.
- OpenAPI drift compares generated bytes with the current checked-in/working inputs,
  so an intentional uncommitted regenerated contract can pass locally while stale
  committed contracts still fail CI. Exact duplicate dependency audit is removed.
- Capture replaces pixel comparison while retaining all original non-pixel
  assertions. Native references ARE tracked in `e2e/captures/local/`, with readable
  scenario/viewport filenames and offline `index.html`. Current macOS capture:
  128 scenarios / 131 PNGs. Partial updates preserve unaffected scenarios.
  Intermediate `visual-output/` is ignored. CI writes only Actions artifacts and
  stores merged HTML/gallery/manifest evidence for 30 days; no screenshot bot commits.
- Old multi-platform baseline directories were removed. Existing PNG renders were
  reused when fixing metadata/names; no redundant rerender was needed.
- Obsolete PR validation is cancellable; staging deployment cannot be auto-cancelled.
  Existing container/Trivy, deployment, migration-release and security obligations
  remain. Cache layers, browser-ready images, scan parallelism and deployment/image
  promotion optimizations are deferred.

Changed files: ci.yml and setup composite action; package scripts; validation
orchestrator/checks/tests; capture helper/reporter and seven visual specs; native
reference gallery; rules, PRD §31.2, release checklist, phases and ADRs.

Validation evidence (logs `/tmp/care-validation-*.log`):

- Frozen installation and repository-pinned Node 22.23.2/pnpm 11.8.0 verified.
- Build/typecheck/OpenAPI/PWA passed; main gzip 140188 bytes. Static unit suites
  passed (212 application unit tests), mocked provider contract passed. Initial
  static invocation correctly failed on one unformatted new script; it was fixed
  and the final shared static job passed.
- Functional shards: 89 + 88 passed; legacy WebKit 5 passed. Capture shards:
  64 + 64 passed; merged 128 scenarios / 131 images, representative assignment
  and process-form PNGs inspected. No pixel baseline checks were run.
- Isolated-suite invocations: ordinary integration 83 + organization import 5;
  security 14; performance 2 (native p95 348 ms at 150 requests/50 concurrent);
  reconciliation all zero. Fresh migrations and all five data-upgrade harnesses
  passed. Fullstack 5 passed using CI reporter mode; blob-to-HTML merge passed.
- Orchestrator contracts cover real browser matrix union/no duplicates, failure and
  skip rejection, missing capture rejection by the real reporter, artifact SHA/output
  tampering, gallery duplicate/stale/path errors, partial native updates and generated
  contract drift (7/7 tooling tests). Actionlint passed for the final job graph.
- Final Gitleaks directory scan passed without scanner exceptions. An initial scan
  mistook API-path/checksum pairs in the ignored build manifest for API keys;
  serializing path and SHA-256 as separate fields resolved the false positives.
  Build manifest seal/verification and tamper tests were rerun successfully.
- Final format/lint/static/build checks and `git diff --check` passed.
- Hosted execution/upload/download and wall-time improvement remain unverified
  until an authorized push. No new production-container build or deployment was
  needed for this scope; their existing CI gates are retained unchanged.

Docker test PostgreSQL was stopped with `pnpm db:down`. No task-started application
server or container remains running; ports 3000, 4173 and 4174 were checked.
Native repository references and the ignored intermediate gallery are retained for
inspection. Delivery: commit/push is authorized after clean directory and commit Gitleaks
scans. Do not monitor hosted runs for this delivery. Hosted timing remains unverified;
do not claim the projected 4–6-minute CI target as a measured result.

## Caddy gRPC Trivy remediation — 9 September 2026

Current branch is `staging` at merge `442e998a`. Hosted run `34322429686`
passed `quality`, migrations, deployment scripts, secrets, dependency review and
CodeQL; only the production-container job failed. Trivy 0.70.0 reported
`CVE-2026-84445` High in the Caddy binary's embedded
`google.golang.org/grpc v1.83.1`, with `v1.83.2` listed as the patched release.
The release gate therefore failed and staging deployment was not started.

`deploy/caddy/Dockerfile` now pins `google.golang.org/grpc v1.83.2` and its
required `golang.org/x/net v0.58.0`. The scanner policy and `.trivyignore` are
unchanged. The production Caddy image rebuilt from pinned bases, the binary
reports Caddy `v2.11.4`, gRPC `v1.83.2`, and x/net `v0.58.0`, and its Caddyfile
validates. Trivy 0.70.0 reports zero High/Critical findings for both the
distroless Debian runtime and embedded Go binary.

Additional affected validation passed: frozen pnpm install, format, lint,
typecheck, runtime/deployment validation, security-exception validation, remote
Compose config, Hadolint, and `git diff --check`. The macOS deployment harness
again reported its documented lack of real `flock`, while all other harness
checks passed; Linux hosted CI remains authoritative for contention. The live
provider smoke used its documented manual fallback. User authorized a direct
commit and push to `staging`; the replacement hosted run must be monitored.

## Organization dashboard CI transaction stabilization — 9 September 2026

Current branch: `fix/dashboard-transaction-acquisition`, created from `staging`
at failed push `95ca2b50`. Run `34315592488` passed migration, deployment,
container/Trivy, secrets, dependency-security and CodeQL jobs; only `quality`
failed at `pnpm test:performance`, and the release gate/deploy consequently did
not run. The failing organization request raised Prisma `P2028` after 2,074 ms:
the default interactive-transaction `maxWait` is 2,000 ms, below the unchanged
3,000 ms p95 budget. Six immediately preceding hosted runs passed at 1,763–2,055
ms p95, so this was an acquisition-boundary failure rather than a SQL or feature
regression.

`OrganizationDashboard.aggregate` now keeps REPEATABLE READ and explicitly sets
`maxWait: 5_000` and `timeout: 5_000`. No retry, query, pool, concurrency,
threshold, schema, or API/OpenAPI behavior changed. The concurrent-insert
snapshot integration test also asserts the exact transaction policy.

Focused validation passed on Docker PostgreSQL: organization integration 22/22;
three local seeded performance runs at 319, 337 and 330 ms p95; and three clean
Linux x64 runs with both Node and PostgreSQL limited to two CPUs at 1,787, 1,814
and 1,841 ms p95. Every performance run completed 150 requests at 50 concurrent
without `P2028`.

Clean parity used Node 22.23.2/pnpm 11.8.0 and fresh generated artifacts. Passed:
frozen install, Prisma generation, audit (four Moderate, zero High/Critical),
format, lint, typecheck, unit (API 83, workforce 86, UI 26, frontend-core 15,
Admin 2), OpenAI mock smoke, current and `origin/staging` destructive migration
checks, all five upgrade harnesses, previous-staging-to-current migration/status,
integration 88/88, security 14/14, performance 2/2 (final p95 2,207 ms), storage
reconciliation, deterministic OpenAPI check, production build, PWA compatibility
(140188-byte main gzip), mocked Playwright 310/310, full-stack 5/5, Compose config,
Actionlint, ShellCheck, Hadolint, inference syntax/topology, bootstrap validation,
deployment validators, Linux real-`flock` deployment harness, Gitleaks 8.24.3,
and `git diff --check`.

The production Compose images built with `--pull`; migrate/bootstrap, readiness,
routing/CSP/auth boundaries, non-root/private-database-port and database/media
persistence checks passed. A local Trivy 0.70.0 scan was stopped at the user's
direction when its vulnerability database download stalled in Docker Desktop;
the unchanged scanner policy remains mandatory in hosted CI. An initial full-stack
run after the focused integration generated enough audit events to push an older
event onto the next unfiltered page; a clean database reset passed 5/5.

Hosted PR run `34320722503` passed the dashboard performance gate at 1,574 ms p95
(150 requests/50 concurrent) without `P2028`, plus every migration, container,
Trivy, secret, dependency, CodeQL and deployment-script gate. `quality` later
failed only because the full-stack Admin journey expected
`VOICE_PRIVATE_DETAIL_READ` on the first unfiltered audit page after earlier
journeys had legitimately generated more than its ten-row page size. The test now
asserts that event through its existing `action` filter, retaining real API/UI
wiring coverage without depending on total audit volume; focused full-stack
validation passes 5/5. A new hosted run is required.

Runtime cleanup completed: both Compose stacks, test servers and temporary Linux,
migration, artifact and production directories were removed or moved to Trash;
no task-started CARE container or listener remained before the focused hosted-fix
validation. PR #41 targets `staging`; hosted checks are being monitored. Merge and
staging deployment are not authorized.

## Previous session reference

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
| Manager handover           | Only the current route-owning Manager can hand over an unassigned `OPEN` General Voice. Operational category may change; original submission classification remains immutable. Notes are visible to the source/destination PIC and CARE Admin under ADR-0053.                                                                     | [ADR-0033](../docs/adr/0033-manager-to-manager-voice-handover.md), [ADR-0053](../docs/adr/0053-admin-mediated-handover-and-chat-viewport.md)                                                                                                         |
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
