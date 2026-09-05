# CARE v1.1 Implementation Phases

| Atribut                | Nilai                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status roadmap         | Phase 0–12.5 done; Admin web premium redesign implemented locally (ADR-0034); Phase 13 staging delivery and hosted acceptance in progress; Phase 14 pending                                                                                                                  |
| Last updated           | 4 September 2026 (deadline-consistent low-rating reopen/read-model correction; ADR-0032 extension)                                                                                                                                                                           |
| Product contract       | `.agent/PRD.md` v1.1                                                                                                                                                                                                                                                         |
| Current implementation | Admin premium redesign plus dynamic General categories and audited Manager-to-Manager `OPEN` Voice handover are implemented locally; mockups treated as layout/style only with CARE domain and contracts preserved. Existing Phase 13 hosted acceptance status is unchanged. |
| Current phase          | Phase 13 `in_progress`: local ADR-0029 parity is complete; hosted PR checks, exact-SHA acceptance, and rollback rehearsal remain                                                                                                                                             |
| Delivery strategy      | Backend remediation/re-freeze → two-app frontend → production containerization and deployment                                                                                                                                                                                |

Dokumen ini mengatur urutan implementasi CARE v1.1. Hanya satu phase/subphase boleh berstatus `in_progress`. Sebuah phase tidak boleh dimulai sebelum dependency dan acceptance check phase sebelumnya selesai.

Status yang digunakan: `pending`, `in_progress`, `blocked`, `deferred`, `done`.

## Voice consent and confirmation refinement — 5 September 2026

Implemented locally on `feat/voice-consent-ui-polish`: audience-aware reporter labels, Private contact consent with additive immutable snapshots and atomic draft updates/submission, ATSG form helper, password back navigation, compact confirmation without classification-source metadata, and optional closure photos. ADR-0038 records the contract and migration. Phase 13 remains `in_progress`; hosted delivery is not claimed by this local refinement. Validation evidence is recorded in the latest session handoff.

## Assignment scrolling refinement — 5 September 2026

Implemented locally: a bounded assignment body with persistent actions, candidate search, selection summary, and loading/error recovery (ADR-0039). Responsive, keyboard, Axe and legacy WebKit regressions plus new visual baselines cover long candidate lists. Union General viewing investigation is explicitly deferred at user request; no browse changes were made. Phase 13 remains `in_progress` with hosted acceptance unchanged.

PR #32 visual CI remediation: platform/architecture-specific Darwin/Linux ARM64/Linux x64 baselines replace cross-OS comparison for the new consent/assignment tests and identified detail. Thresholds and application behavior are unchanged; Phase 13 hosted acceptance remains open.

Staging follow-up (5 September): PR #32 merged and hosted quality passed; container gate requires patched libuuid 2.42.3-r0 in both web runtimes and PostgreSQL. Phase 13 remains in progress until staging delivery succeeds.

## Sequencing Gates

Tiga gate berikut bersifat wajib:

1. **Backend Complete Gate** — seluruh remediation schema, organization master, routing, authorization, Union, AI classification/location review, dashboard, migration, OpenAPI, dan backend regression selesai sebelum frontend dimulai.
2. **Frontend Complete Gate** — workforce PWA dan Admin app, generated-client integration, accessibility, responsive behavior, dan two-origin Playwright journeys selesai sebelum production containerization/deployment dimulai.
3. **Delivery Complete Gate** — production Dockerfiles, Caddy/Compose, CI/CD release automation, staging rehearsal pada dua domain, dan production readiness selesai terakhir.

Pengecualian selama pekerjaan backend hanya untuk Docker-managed PostgreSQL/pgvector, disposable test database, dan CI service container. Production Dockerfiles, Caddy/remote Compose, release-by-SHA, serta deployment automation tetap ditunda sampai Frontend Complete Gate.

## Historical Baseline and Supersession Rule

Phase 0–5 tetap `done` sebagai catatan implementasi historis dan scope-nya tidak ditulis ulang seolah-olah telah memenuhi PRD v1.1. Implementasi tersebut masih mengandung asumsi v1.0 yang kini **superseded**: exclusive single-role accounts, Employee/Manager CSV dan Union JSON, Manager per area/category, shared Union account, Manager-managed Section Heads, Vertex/Gemini, Admin-anonymous Private, baseline 2.000 account, serta satu frontend.

Phase 6 wajib memperbaiki dan memigrasikan implementasi tersebut. Status `done` pada Phase 0–5 tidak berarti kontrak lama tetap berlaku dan tidak boleh dipakai untuk melewati acceptance Phase 6.

---

## Phase 0 — Product and Architecture Baseline

Status: `done` — historical v1.0 baseline; superseded where Phase 6/PRD v1.1 differs.

Deliverables historis:

- PRD CARE v1.0, initial architecture/sequencing ADRs, roadmap, dan session handoff;
- keputusan awal role, privacy, AI, lifecycle, storage, deployment, testing, dan accepted risk;
- urutan backend → frontend → containerization/deployment.

Acceptance historis:

- requirement dan edge case v1.0 tercatat;
- external dependency dan launch blocker terlihat;
- application implementation belum dimulai pada akhir phase ini.

---

# Backend Track

Frontend implementation dilarang dimulai sampai seluruh Phase 6.1–6.6 lulus dan Backend Complete Gate tercatat `passed` pada handoff.

## Phase 1 — Backend Repository and Toolchain Foundation

Status: `done` — historical delivered baseline.

Dependencies: Phase 0.

Scope historis:

- pnpm monorepo, API/shared contracts/backend tests, Node/pnpm pinning, TypeScript, lint/format, Vitest, Prisma, OpenAPI generation, dan root backend scripts;
- Docker PostgreSQL/pgvector untuk development/integration test dan baseline GitHub Actions;
- release identity, `/health`, dan initial `/ready` endpoints.

Acceptance historis:

- install, format, lint, typecheck, unit smoke, API build, OpenAPI generation, Compose validation, fresh migration, dan integration smoke lulus;
- tidak ada frontend workflow atau production application containerization.

---

## Phase 2 — Backend Identity, Sessions, Provisioning, and Authorization

Status: `done` — historical v1.0 implementation; identity/import/role/route assumptions superseded by Phase 6.

Dependencies: Phase 1.

Scope historis:

- Employee/UserAccount/ManagerProfile/SectionHeadRelation/session/import/audit schema;
- CARE Admin bootstrap, authentication, reset/deactivation, CSRF, throttling;
- Employee/Manager/Union import, manager route uniqueness, Section Head mutation, role/object policies, dan Private serializers.

Acceptance historis:

- first-login/reset/session, import atomicity, old route uniqueness, old Private serialization, authorization, dan OpenAPI contract lulus terhadap v1.0.

---

## Phase 3 — Backend Voice Draft, Media, AI, and Submission

Status: `done` — historical v1.0 implementation; AI/routing/privacy assumptions superseded by Phase 6.

Dependencies: Phase 2.

Scope historis:

- VoiceDraft/Voice/Attachment/AIClassification, media pipeline, preview/draft/submit;
- Vertex adapter, old fixed category priority, confidence fallback, dan old Private/General routing;
- atomic submit, route validation, event/notification intent, fixtures, dan prompt/model versioning.

Acceptance historis:

- draft/media/submit/routing/AI/logging tests lulus terhadap v1.0 contract.

---

## Phase 4 — Backend Lifecycle, Assignment, Timeline, and Conversation

Status: `done` — historical v1.0 implementation; Union/assignment/privacy assumptions superseded by Phase 6.

Dependencies: Phase 3.

Scope historis:

- VoiceAssignment/Event/Conversation/Message/outbox/notification persistence;
- lifecycle transition, ask/proceed/assign/reassign/close, immutable chat, timeline/pagination;
- old Manager/Section Head/shared-Union ownership dan Private serialization.

Acceptance historis:

- transition/concurrency/object authorization/append-only/idempotency/OpenAPI checks lulus terhadap v1.0.

---

## Phase 5 — Backend Closure, Rating, Reopen, Dashboard, and Push

Status: `done` — historical v1.0 implementation; dashboard/access-scope assumptions superseded by Phase 6.

Dependencies: Phase 4.

Scope historis:

- ClosureCycle/evidence/Rating/reopen history;
- role-scoped dashboard, history/filter/search/pagination;
- Notification Center/Web Push, structured logging, metrics, outbox/storage/readiness diagnostics.

Acceptance historis:

- closure/rating/reopen history, old dashboard scopes, notification/push privacy, dan 50.000-Voice query profile lulus terhadap v1.0.

---

## Phase 6 — Backend Contract Remediation and Re-freeze

Aggregate state: `done`; seluruh subphase 6.1–6.6 selesai dan API v1.1 telah dire-freeze.

Dependencies: historical Phase 1–5 implementation and PRD v1.1.

Tujuan: memigrasikan implementasi v1.0 ke kontrak v1.1 tanpa menghapus ID, event, closure, rating, notification, route owner, assignment, actor, atau PIC historis. Gunakan expand/contract migration; perubahan source code dimulai pada subphase implementasi ini, bukan pada sesi revisi dokumentasi.

### Phase 6.1 — Schema, Capability, Effective Master, and Historical Backfill

Status: `done`

Scope:

- desain expand/contract dari current schema untuk account kind, structural position mentah, capability, overview/detail/action scope, dan effective-dated organization snapshot;
- composite organization unit `Directorat + Division + Department`;
- effective route/default PIC/global PIC, Union level, Private identity-consent snapshot, location-review snapshot, dan legacy-handler access;
- backfill Voice, assignment, event, closure, rating, notification, reporter organization, route owner, handler, dan actor snapshots tanpa mengganti ID/historis;
- compatibility window untuk old columns/API selama backfill dan contract cutover;
- current-schema upgrade fixture dan rollback-by-compatible-code analysis.

Acceptance:

- fresh migration dan upgrade dari migration baseline saat ini lulus pada PostgreSQL nyata;
- backfill deterministik, rerunnable/idempotent, dan mempunyai reconciliation counts;
- satu account dapat tetap Member sekaligus structural reader/default/global route PIC;
- perubahan organization/position tidak mengubah historical ownership/actor/PIC;
- legacy active handler hanya mempertahankan akses Voice lama sampai selesai dan tidak eligible untuk route baru;
- tidak ada destructive drop sebelum seluruh reader/writer memakai schema baru dan verification query green.

### Phase 6.2 — Authoritative XLSX/CSV Import and Administration

Status: `done`

Dependencies: Phase 6.1.

Scope:

- ganti import terpisah Employee/Manager/Union dengan satu file `.xlsx` atau UTF-8 `.csv`; XLSX memakai sheet `MFG + QD`, dan kedua format memakai tujuh header persis;
- preserve leading-zero no.reg, raw structural position, composite unit, preview/confirm/history, dan 10.000-account baseline;
- monthly full snapshot: create/update/deactivate, session revocation, effective history, mapping invalidation, dan legacy handler preservation;
- preview diff untuk posisi/unit/route gap/global PIC invalid/Union gap;
- atomic confirm dan remediation queue dengan locked actions: default PIC, PIC global, dan tiga akun Union;
- Department Head aktif otomatis menjadi Manager; Admin dapat memilih active employee sebagai default PIC untuk named department tanpa Head;
- satu global PIC dipilih dari active Department Head;
- tepat satu Union Head dan dua Union Officer dikelola terpisah dari workbook;
- read-only Section Head candidates dari active snapshot; hapus promote/transfer/remove APIs.

Acceptance:

- fixture XLSX/CSV menguji exact sheet/header/column count, quoting/BOM CSV, 7.018 rows, leading-zero no.reg, duplicate validation, duplicate department names lintas divisi, 12 named departments tanpa Head, dan 188 rows `Department=14`;
- preview/confirm atomik, field-addressable, audited, dan tidak partial write;
- 10.000-account import memenuhi target performa;
- deactivated account tidak dapat login/bertindak, sementara legacy handler dapat menyelesaikan Voice lama dalam scope terbatas;
- invalidated default/global mapping menghasilkan remediation issue dan tidak menerima Voice baru;
- API import lama dan Section Head mutation tidak lagi tersedia setelah contract cutover.

### Phase 6.3 — General/Private Routing, Union, and Identity Consent

Status: `done`

Dependencies: Phase 6.2.

Scope:

- tambah `ENVIRONMENT`/Lingkungan;
- Safety, Environment, dan Facility seluruh area menuju satu global PIC; delegasi hanya ke Section Head dari department asal PIC;
- Work Difficulty menuju Department Head/default PIC pada composite unit reporter;
- `Department=14` tidak mempunyai General route, tetapi tetap boleh membuat Private;
- form/draft contract memulai pilihan Private/General dan mewajibkan `showReporterIdentity` hanya untuk Private;
- Private langsung menuju Union Head tanpa category routing; Head dapat assign/reassign Union 1/2 sebelum `IN_PROGRESS`;
- Union Officer hanya membaca/menangani assigned Private;
- Union `HIDE` serializer tanpa identity field, Union `SHOW` dengan nama/no.reg/division/department, dan Admin full-identity read-only serializer;
- immutable consent/profile/route/handler snapshots dan notification/audit redaction.

Acceptance:

- routing tests membuktikan tiga special categories menuju satu global PIC lintas area dan Work Difficulty memakai composite unit/default PIC;
- missing route dan `Department=14` menolak General submit dengan remediation serta mempertahankan draft;
- exactly-three Union setup, Head-first route, Officer assignment/reassignment boundary, dan operator attribution lulus;
- anonymous Union DTO tidak memiliki identity field; `SHOW` dan Admin DTO hanya memuat contract yang diizinkan;
- monthly master update tidak mengubah historical PIC/assignment/consent.

### Phase 6.4 — DeepSeek Chat Completions, Classification, and Location Review

Status: `done`

Dependencies: Phase 6.3.

Scope:

- hapus Gemini/Vertex, `@google/genai`, location provider, dan seluruh `VERTEX_*` runtime contract;
- official JavaScript SDK, `chat.completions.create`, `/chat/completions`, forced named function calls, dan local Zod validation;
- config `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY`, `OPENAI_REASONING_EFFORT`, `OPENAI_TIMEOUT_MS`, `OPENAI_CONFIDENCE_THRESHOLD`, tanpa production default untuk base URL/model/key dan dengan reasoning effort kosong default `none`;
- minimized payload, bounded timeout/retry, schema validation, sanitized errors, versioned prompts/contracts;
- classification: nullable category untuk Private, severity, confidence, rationale code; tidak ada fixed category priority;
- location review: `COMPLETE | INCOMPLETE | UNKNOWN`, warning, maksimal tiga suggestion questions;
- debounce/on-blur review, content-hash cache, invalidation, snapshot-bound acknowledgment, advisory warning, dan non-blocking provider failure;
- Manual Fallback: General memilih category+severity, Private memilih severity saja.

Acceptance:

- tests mencakup valid schema, refusal/incomplete, invalid schema, timeout, bounded retry, low confidence, missing config, Private severity-only, dan sanitized logs;
- location cache hit/invalidation, stale acknowledgment rejection, `INCOMPLETE` confirmation, dan provider failure path lulus;
- deterministic local mock `/chat/completions` smoke lulus untuk classification dan location function schemas tanpa external API key; live provider validation dipindahkan ke staging rehearsal setelah config tersedia;
- tidak ada Gemini/Vertex dependency, env, metadata, atau normative contract tersisa.

### Phase 6.5 — Dashboard, Detail/Action Authorization, and Cross-Cutting Services

Status: `done`

Dependencies: Phase 6.4.

Scope:

- pisahkan aggregate overview authorization dari scoped Voice list/detail/action;
- Manager: aggregate satu divisi, browse detail department sendiri, plus operational inbox untuk explicit global/default route;
- Division Head/Deputy/Pjt.: aggregate seluruh General, detail divisi sendiri, read-only;
- Director: aggregate/detail seluruh General, read-only;
- Union: aggregate/detail seluruh General read-only; Private Head semua, Officer assigned only;
- CARE Admin: operational overview dan read-only detail seluruh General/Private dengan full Private identity;
- Section Head hanya assigned Voice/action aktif; Member hanya Voice sendiri;
- grafik status, severity, category termasuk Environment, trend, division/department breakdown sesuai scope;
- consent/route-aware notifications, Web Push, media, timeline, audit, and closure/reopen regression.

Acceptance:

- authorization matrix seluruh account/capability/scope lulus pada aggregate, list, detail, media, timeline, dan mutation;
- aggregate-only response tidak membocorkan title, reporter, Voice ID, atau detail;
- Manager browse vs operational inbox boundaries terbukti;
- leadership/Director/Union General action ditolak walaupun detail dapat dibaca;
- Union Officer unassigned Private dan all non-Union leadership Private access ditolak;
- notification/media/privacy/lifecycle regressions green.

### Phase 6.6 — Contract Regeneration and Backend Complete Gate

Status: `done`

Dependencies: Phase 6.1–6.5.

Scope:

- regenerate/version OpenAPI dan shared TypeScript client untuk workforce/Admin apps;
- remove superseded endpoints/fields after compatibility checks;
- run unit, real-PostgreSQL integration, migration upgrade, security, AI, media, notification, concurrency, idempotency, audit, dan performance suites;
- seed 10.000 accounts/50.000 Voice, 50 concurrent users, organization edge cases, and privacy fixtures;
- document backend run commands, env contract, error catalog, migration/backfill procedure, dan two-app integration guide.

Backend Complete Gate acceptance:

- seluruh Phase 6 acceptance green dan tidak ada placeholder/mock business behavior;
- fresh migration serta current-schema upgrade/backfill green dengan historical reconciliation;
- workbook-shape/monthly-update/remediation/routing/Union/privacy/dashboard tests green;
- 10.000-account/50.000-Voice/50-concurrent profile memenuhi PRD target;
- no unresolved Critical/High backend security finding;
- OpenAPI drift check dan generated client green;
- mock DeepSeek `/chat/completions` classification/location smoke green tanpa external API key, sesuai keputusan pengujian; live provider smoke menjadi staging validation dan bukan Phase 6 test dependency;
- handoff mencatat **Backend Complete Gate: passed** sebelum Phase 7 dimulai.

Gate saat ini: **passed** pada 26 Agustus 2026. Phase 7 boleh dimulai. Base URL/model/API key riil tetap external dependency untuk staging dan production, bukan dependency unit/integration/smoke test.

---

# Frontend Track

Phase 7–11 hanya boleh dimulai setelah Backend Complete Gate. Backend contract change setelah freeze memerlukan compatibility review, client regeneration, dan rerun affected tests.

## Phase 7 — Shared Frontend Foundations for Workforce and Admin

Status: `done` — completed 26 Agustus 2026; visual contract refined against the mobile dashboard reference on the same date.

Dependencies: Phase 6 Backend Complete Gate.

Scope:

- React/Vite foundations untuk workforce PWA dan separate Admin React app;
- shared design tokens/components/generated OpenAPI client/error/session/CSRF utilities;
- host-scoped authentication, forced-password-change, capability-aware router, loading/error/permission/conflict states;
- same-origin `/api/v1` proxy contract pada kedua origin dan strict cache/credential isolation;
- workforce manifest/service-worker/offline shell foundation; Admin app selalu network-only dan bukan PWA.
- `apps/web-voice` dan `apps/web-admin` menggantikan placeholder frontend lama; shared boundaries berada di `packages/ui` dan `packages/frontend-core`;
- `/design` tetap public, unlisted, `noindex`, lazy-loaded, mock-only, dan tidak melakukan session/API bootstrap;
- Admin memakai hard desktop gate ≥1280 px; di bawah gate protected tree tidak di-mount dan tidak melakukan fetch;
- CARE light design system memakai token contract, Inter Variable, cobalt/cyan palette, Radix semantics, dan motion patterns yang diadaptasi secara selektif dari BeUI dengan attribution MIT.

Acceptance:

- kedua app build tanpa handwritten duplicate API wire types;
- origin/cookie/CSRF/cache isolation tests lulus;
- shared UI accessible/responsive dan account switch membersihkan scoped cache;
- seluruh mutation network-only.
- unit/component tests, token-contract scan, Axe, keyboard/focus, reduced-motion, 360/768/1440 visual regression, PWA offline fallback, production artifact split, dan two-host storage isolation lulus;
- workforce production build menghasilkan manifest/custom service worker dan mengecualikan `/design` chunk dari precache; Admin build tidak menghasilkan manifest/service worker.

## Phase 8 — Admin Application and Organization Operations

Status: `done` — subphases 8.0–8.5 complete; Phase 8.5 accessibility/security/performance/full-stack acceptance passed.

Dependencies: Phase 7.

Scope summary:

- menutup gap backend/OpenAPI terlebih dahulu, lalu membangun seluruh journey Admin di shell desktop Phase 7 memakai CARE light design system tanpa identitas visual baru;
- single CARE Admin credential v1 yang CLI-managed; UI tidak membuat/reset/menonaktifkan akun Admin; Accounts hanya mengelola workforce dan Union;
- cursor pagination, signed opaque cursor, Idempotency-Key, optimistic expectation, CSRF, audit reason, dan typed health/ready/release.

### Phase 8.0 — Contract and Backend Completion

Status: `done` — implemented 27 Agustus 2026

Scope:

- regenerasi OpenAPI dan `@care/contracts`; semua response eksplisit tanpa `additionalProperties` untuk data yang di-render UI;
- semua list besar memakai signed opaque cursor, `limit`, filter, dan stable sort server-side;
- mutation sensitif memakai `Idempotency-Key`, optimistic expectation, CSRF, audit reason, dan response versi terbaru;
- indeks PostgreSQL untuk account, organization unit, import history/change, Voice Explorer, dan audit cursor queries;
- perluas import preview response (checksum, version, expiry, typed summary, blocking errors, route gaps, Department=14 count, invalid global PIC, Union gaps); `GET .../{id}/changes` cursor-paginated dengan filter `CREATE | UPDATE | DEACTIVATE | UNCHANGED`;
- confirm `{ checksum, expectedVersion }` plus `Idempotency-Key`; stale preview, checksum mismatch, duplicate payload beda, dan expired batch menghasilkan conflict stabil;
- current effective snapshot dan organization-unit list/detail (composite unit, member/head counts, route health, source snapshot);
- import list/history cursor-paginated dengan status `PREVIEWED → QUEUED → PROCESSING → CONFIRMED | FAILED | EXPIRED`;
- remediation list/history typed, paginated, filter status/type/unit/batch; default PIC mutation dengan `expectedCurrentRouteId` dan reason; Global PIC hanya active Department Head dengan `expectedCurrentRouteId`;
- account search dengan eligibility filter; Union slot mutation dengan username/displayName/expected term/reason dan legacy preservation;
- account list/detail paginated dengan search/filter kind/status/unit/position; reset-password workforce/Union dengan session/push revocation dan `passwordChangeRequired`; activation/deactivation dengan reason/version dan constraint legacy ownership;
- audit list/detail Admin-only dengan cursor, date range, action/result/actor/resource/correlation; Voice list dengan cursor/search/status/visibility/severity/area/category/handler/date dan stable sort;
- detail DTO sesuai runtime (route owner, current handler, attachment metadata, classification, location review, version, reporter snapshot); `AdminPrivateVoiceDetail.reporter` exact 7 fields;
- semua Admin read terhadap Private (list/detail/timeline/message/media) mencatat audit event teredaksi; mutation Voice oleh Admin ditolak;
- system status memakai typed `/health`, `/ready`, `/release.json` dengan diagnostic tereduksi.
- PR review hardening: account/read attachment storage redaction, transactional idempotency replay tanpa plaintext temporary password, account `version` CAS, resource advisory locks plus partial unique active-route/Union indexes, database-backed `ImportChange`, terminal raw-import deletion, dan actual XLSX inflate limits;
- post-review concurrency hardening: expiry raw-file deletion memakai locked state reread + `PREVIEWED→EXPIRED` CAS; route assignment, status deactivation, Union replacement, dan monthly-import deactivation memakai deterministic account row locks; migration menghapus legacy reset/Union replay records yang berpotensi berisi plaintext;
- shared Admin API boundary mengambil request/query/response type langsung dari generated operations; test filenames dan suite names phase-neutral agar reusable lintas roadmap.

Acceptance:

- OpenAPI generation deterministic dan drift check hijau;
- cursor pagination, idempotency conflict, stale version, dan type-exact Private DTO lulus;
- PostgreSQL integration untuk XLSX/CSV valid/invalid, leading-zero, 10k preview, atomic confirm, polling state, deactivation, route invalidation, PIC remediation, Union replacement, reset/session revocation, audit persistence hijau;
- concurrency duplicate confirm, simultaneous route/Union replacement, stale version, idempotency mismatch hijau;
- security CARE_ADMIN-only, CSRF, IDOR, forbidden Admin Voice mutation, audited Private access, sanitized audit hijau;
- performance 10k accounts/50k Voices untuk account search, import changes, Voice Explorer, audit hijau;
- fresh/upgrade migration, lint/typecheck, unit/integration/security/performance/build, Gitleaks hijau.
- remediation evidence: API unit `25`, integration `13`, security `5`, seeded performance `10k/50k/50`, deterministic OpenAPI hashes, build, dan Playwright functional/visual/PWA hijau; PWA CI dijalankan lima kali (`10/10`) tanpa flaky; satu Moderate dependency advisory tetap tercatat, tanpa High/Critical.

### Phase 8.1 — Admin Data Layer and Routing

Status: `done` — implemented 27 Agustus 2026

Scope:

- pecah shell monolitik menjadi feature routes: Overview, Imports/Master Data, Remediation/Routes, Union Accounts, Accounts, Voice Explorer, Audit, System Status, Account;
- generated client via Phase 7 transport, session-scoped React Query keys, targeted invalidation, typed error mapping, network-only mutation;
- filter/list state di URL search params; hard gate 1280 px tetap sebelum Query/Auth/Router; tidak ada CacheStorage/IndexedDB/service worker.

Acceptance:

- routing, query-key isolation, URL filter persistence, gate non-fetch, dan typed error mapping lulus.

### Phase 8.2 — Import/Master/Remediation/Union

Status: `done` — implemented 27 Agustus 2026

Scope:

- upload `.xlsx`/`.csv` 10 MB, preview summary, error sheet/row/field, paginated change table, typed confirmation dialog, polling queued/processing, terminal state, history, current effective snapshot;
- remediation queue per issue type/unit, drawer pilih PIC dan reason, current mapping, resolution history, Section Head candidates read-only;
- Union tiga fixed slot cards dengan provision/replace dialog, forced-password notice, consequence, audit link.

Acceptance:

- import preview/history, remediation, dan Union journeys mocked-contract lulus; Section Head tetap read-only.

### Phase 8.3 — Accounts and Audit

Status: `done` — implemented 27 Agustus 2026

Scope:

- server-side search/filter accounts; detail drawer organization/capability/status; reset/activate/deactivate dengan confirm dan reason; CARE Admin read-only;
- Voice Explorer paginated filter table tidak; Accounts/Audit focus.
- audit sanitized event table dan drawer dengan actor snapshot, action/result, resource, timestamp, correlation, release SHA, reason, safe summary.

Acceptance:

- component tests untuk account constraints, audit filtering, dan read-only boundaries lulus.

### Phase 8.4 — Voice Explorer and System Status

Status: `done` — implemented 27 Agustus 2026

Scope:

- Voice Explorer paginated filter table, detail drawer read-only dengan “akses Private diaudit” notice, full immutable reporter identity untuk Private, attachment/classification/location/conversation/timeline tanpa action;
- System Status API/database/migration/storage/outbox, OpenAI/push config state, release SHA, last-refreshed, manual refresh, polling 30s hanya saat visible.

Acceptance:

- Voice read-only dan system status degradation paths lulus; Private access audited.

### Phase 8.5 — Accessibility, Security, Performance, and Full-Stack Acceptance

Status: `done`

Scope:

- Axe, keyboard/focus-return, reduced-motion, loading/empty/error/permission/conflict, long-content, 1280/1440 no-overflow;
- Playwright mocked-contract setiap halaman dan error state;
- full-stack Playwright terhadap disposable PostgreSQL/API/Admin proxy: bootstrap → login → forced password; invalid→valid import → confirm → remediation; default/global PIC dan Union setup; deactivation/invalidation; reset/session revocation; Private full-identity read-only dengan audit; audit filtering dan system-status;
- Admin build assertion tanpa manifest/sw/offline cache/fetch di bawah gate.

Acceptance:

- seluruh Phase 8.0–8.5 acceptance hijau; tidak ada Admin provisioning/reset/deactivation UI untuk CARE Admin; tidak ada Section Head mutation/raw download/export/bulk/offline;
- ADR Phase 8, session handoff, dan implementationPhases diperbarui; PRD mengunci single CLI-managed Admin;
- production containerization tetap out of scope.

Completed evidence:

- `e2e/admin-a11y.spec.ts` — Axe WCAG 2.1 AA + no document overflow for all nine Admin pages at 1280/1440, long-content clamp, focus trap/return, reduced-motion; the shared `Dialog`/`Drawer` focus-return defect (focus fell to `<body>` for controlled dialogs) was fixed in `packages/ui/src/overlays.tsx`;
- `e2e/admin-journeys.spec.ts` — mocked-contract happy/error/empty state per Admin page; error states never leak stack frames or machine codes (`OverviewPage` gained a retryable error `Alert`);
- `e2e/admin-fullstack.spec.ts` — real API/Admin proxy/PostgreSQL wiring: bootstrap → login → forced password → Overview → Imports (invalid rejected) → Remediation → Union → Accounts reset → Private full-identity read-only → Audit filter → System Status → valid-import preview/confirm to `CONFIRMED` (gated `FULLSTACK_E2E=1`, serial);
- `apps/api/scripts/seed-admin-e2e.ts` + `e2e/global-setup.ts` — deterministic test-only seed invoked by the Playwright globalSetup only when `FULLSTACK_E2E=1`;
- `e2e/foundation.spec.ts` — Admin origin stays network-only at runtime (no service worker / CacheStorage / IndexedDB), no protected fetch below the 1280 px gate, and the Admin build carries no manifest/sw.

## Phase 9 — Member Voice Journey

Status: `done` — Member journey implemented, wired to the real backend, and acceptance-covered.

Dependencies: Phase 8 (sequencing exception granted; Phase 9–10 may receive scoped acceptance without opening the Frontend Complete Gate).

Scope (implemented — Member journey in `apps/web-voice`):

- architecture: typed `workforce-api` derived from generated operations, session-scoped `careQueryKey`, shared formatters, capability-aware `AppShell`/`BottomNav`/`Sidebar` and feature routes (`/`, `/voices/new`, `/drafts/:id/edit`, `/drafts/:id/preview`, `/history`, `/work-items`, `/general`, `/voices/:id`, `/notifications`, `/account`);
- Member Home with cobalt hero, greeting/profile, notification entry, `StatusSummary` status cards, recent Voice cards, resume-draft card, and Buat Voice CTA;
- Create Voice wizard: Private/General choice → details (area, location, title, detail, Private identity consent, photos) → save draft + AI classification + location review → manual fallback → review (route readiness, severity/category, attachments, location warning, consent) → idempotent submit; dirty-form guard, char counters, media preview/remove, upload progress, focus-to-error;
- preview page and closed-chat read-only rules; History with search/filter/cursor; Voice detail with metadata, PIC privacy label, media, classification source, location review, timeline, conversation, closure cycles/evidence/rating/reopen; Notifications center with unread count/pagination/mark-read/deep-link; Account session/capability/profile;
- timeline/messages cursor pagination (`useCursorFeed`) with an optional `order=desc` for the live chat; dashboard aggregate filters + suppression metadata (`GeneralBrowsePage`).
- capability-derived mobile/desktop navigation labels `/history` as Voice Saya for
  every workforce account; mobile Lainnya sheet contains Notifikasi and Akun;
  account/push/detail/create/history surfaces use the reference-led workforce
  presentation without changing Admin product styling.

Acceptance status: Member journey implemented on the real backend and verified via integration (31), security (5), unit, build, and Playwright (chromium/visual/pwa 20 passed). Full Phase 9/10 acceptance and the complete Phase 10 responder/leadership matrix now covered by `responder-matrix.integration.test.ts`.

## Phase 10 — Responder and Leadership Journeys

Status: `done` — responder/leadership matrix implemented and acceptance-covered.

Dependencies: Phase 9 (batch sequencing exception applies as above).

Scope (implemented):

- capability-aware responder Home split (division aggregate vs operational inbox);
- `WorkItems` severity-first operational inbox with search/filter/cursor pagination and typed `nextCursor`;
- `General` read-only browse aggregate/detail for Union and Leadership;
- server-computed `availableActions` plus `ActionPanel` (ask/proceed/close) wired to lifecycle mutation endpoints;
- backend `work-items` aligned to `/voices` cursor/filter/search contract;
- assign/reassign `expectedVersion` CAS; `GET /voices/:id/assignment-candidates` (section heads for General, union officers for Private); `ActionPanel` Assign/Alihkan dialogs listing eligible candidates; assign only allowed for a route-owning Manager (General) or Union Head (Private);
- close links staged closure evidence (1–5 cap, `EVIDENCE_LIMIT`) to the closure cycle; reopen falls back to the route owner when the last PIC is deactivated; close dialog stages and requires evidence (close-evidence UI);
- ask/proceed/close/rate/addMessage honor `Idempotency-Key` (atomic replay record + conflict handling) and the frontend reuses a stable key per logical mutation;
- Section Head aggregate overview scoped to `currentHandlerId`; `detailScope`/`workItemScope` empty sentinel fixed; Admin Voice Explorer consumes paginated timeline/messages.
- Manager and leadership Home use a comprehensive 30-day-default aggregate
  dashboard with URL presets/custom range, KPI, accessible status/severity/
  category/trend/organization charts, suppression explanation, and explicit
  loading/offline/error states.
- `/work-items` is the unified role-aware Voice Member workspace for workforce
  monitoring roles; it uses active/closed/all views, scoped handler options,
  search/filter/date state in the URL, severity-first cursor pagination, and
  server-authoritative action availability. Leadership remains read-only and
  Private Voice is excluded.
- Voice detail consumes `conversationState`: chat is absent for Open/direct
  Proceed without a room, active from In Verification and continuing In
  Progress when created, and read-only after Closed. Ask/Assign focuses an
  active/empty room and backend message endpoints enforce the same state.

Acceptance status: the dashboard/detail/action matrix, aggregate/design leakage checks, conditional Private identity/Officer assignment isolation, timeline/messages cursor pagination, dashboard filter/suppression metadata, and responder/leadership mocked Playwright journeys are now covered by `responder-matrix.integration.test.ts` and the `member-voice`/`admin-explorer` e2e specs. Phase 8.5 remains `in_progress`; Frontend Complete Gate stays blocked until Phase 8.5 and Phase 11 pass.

## Phase 11 — Frontend Completion, Workforce PWA, Accessibility, and Two-App E2E Gate

Status: `done` — Frontend Complete Gate passed on 27 Agustus 2026.

Dependencies: Phase 7–10.

Scope (implemented):

- workforce capability resolver menetapkan `unsupported | core-online | pwa |
push`: iOS 11.3 adalah minimum Core Online, Web Push iOS membutuhkan 16.4+
  dan Home Screen, sedangkan Android/non-iOS tetap capability-driven tanpa
  standalone requirement khusus iOS;
- app dan custom service worker diturunkan ke target `safari11.3`; external ES5
  bootstrap/polyfill mempertahankan static loading shell dan mengubahnya menjadi
  retry/compatibility guidance ketika module gagal mount, tanpa inline script
  atau legacy-plugin CSP exception;
- Service Worker/Workbox diload secara lazy setelah probe PWA lulus. Failure
  turun non-blocking ke Core Online dan legacy tier melakukan best-effort cleanup
  registration/cache CARE lama; shared Select memakai native control ketika
  PointerEvent/ResizeObserver tidak tersedia;
- compatibility unit/artifact gate dan current-WebKit iOS 11.3 capability
  emulation mencakup workforce online journeys. Real-device iOS 11.3 bukan
  acceptance requirement dan limitation tersebut dicatat eksplisit;
- workforce Web Push opt-in: `useWebPush` + `PushSettingsCard` (subscribe/
  unsubscribe/status, unconfigured/unsupported/denied/iOS-install degraded
  states, explicit gesture, session-keyed invalidation) wired to the existing
  backend push contract and service-worker push/notificationclick handlers;
- PWA install/update/offline/stale behavior verified; cache exclusions preserved;
  service worker registers a privacy-stripped offline summary cache for
  `/dashboard/member` only (no Private titles/draft content cached); offline
  stale banner + recent/draft suppression on the member home;
- Admin network-only validation re-verified (no service worker/manifest/offline
  cache, no protected fetch below the 1280 px gate);
- responsive polish, WCAG 2.1 AA, keyboard/focus/reduced-motion, no-overflow,
  44 px mobile bottom-nav touch target; mobile auth-brand contrast fix;
- create-wizard step advance fix (visibility → detail);
- two-origin full Playwright: expanded options-based `mockWorkforceApi`,
  `workforce-a11y/journeys/push/security` specs, two new visual baselines, and a
  gated workforce full-stack smoke that reuses the seeded member and runs serially
  before the Admin full-stack journey; UI security probes (conditional Private
  identity hiding, aggregate non-leakage, CSRF on mutations, capability-gated
  actions, authorized media) pass;
- performance/bundle/build validation: workforce PWA precache 12 entries, Admin
  bundle sized, no regression.

Frontend Complete Gate acceptance:

- seluruh PRD UI journey tersedia tanpa placeholder;
- workforce PWA and Admin responsive supported-browser matrix green (Axe WCAG
  2.1 AA on all workforce routes, no-overflow at 360/768/1440, keyboard/focus/
  reduced-motion, 44 px mobile touch);
- Playwright pada kedua origin, Axe, no-overflow, production builds, dan privacy
  probes green (95 passed: chromium + visual + pwa);
- no unresolved Critical/High frontend finding;
- handoff mencatat **Frontend Complete Gate: passed** sebelum Phase 12.

Validation evidence: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
`pnpm build` green; `pnpm test:unit` green (API 34, ui 8, frontend-core 9,
web-voice 19, web-admin 2); Playwright `test:frontend:e2e` 95 passed.
See ADR-0010. Real Web Push delivery + VAPID credentials remain a staging
rehearsal concern (Phase 13), not this gate.

---

# Containerization and Deployment Track

## Phase 12 — Production Containerization for API, Workforce, Admin, and Caddy

Status: `done`

Dependencies: Phase 11 Frontend Complete Gate.

Scope:

- multi-stage production Dockerfiles untuk API, workforce web, dan Admin web;
- non-root/minimal runtime, PostgreSQL, Caddy dual-host config dengan same-origin `/api/v1` proxy;
- remote Compose, health checks, persistent database/media/Caddy/deployment volumes;
- migrate/bootstrap operational profiles, env validator, Hadolint/Trivy/non-root/secret assertions.

Acceptance:

- seluruh image build clean dan run non-root where applicable;
- dependency order, persistence, health/readiness/release identity, dual SPA/API routing, dan security headers lulus;
- tidak ada secret baked into image/repository.

Evidence 28 Agustus 2026:

- clean production-like build/start passed for PostgreSQL 16 + pgvector 0.8.6,
  API, workforce, Admin, and Caddy;
- every long-running container ran non-root; only Caddy published ports and the
  PostgreSQL/API data network remained internal;
- fresh migration/bootstrap, exact SHA on API and both frontends, dual-host SPA
  deep links/API proxy, Admin no-PWA contract, security headers, and cache policy
  passed;
- PostgreSQL system identity and a media sentinel survived restart;
- Trivy filesystem and all five runtime images reported zero High/Critical
  findings. See ADR-0011.
- a production-like local overlay and `pnpm local:up|down|status|logs` now run
  the full PostgreSQL/migration/bootstrap/API/workforce/Admin/Caddy graph on
  `care.localhost:8080` and `admin.care.localhost:8080` without requiring
  OpenAI or Web Push; exact-SHA smoke and PostgreSQL down/up persistence passed;
- PostgreSQL Alpine's runtime UID/GID was verified as `70:70`; production VM
  ownership checks, CI bind setup, and local volume initialization use that
  image-defined identity.

## Phase 12.5 — Dynamic General Voice Category Catalog

Status: `done` — implementation and local static/database/full-stack parity complete; hosted delivery continues in Phase 13.

Dependencies: Phase 12 baseline and ADR-0029.

Scope:

- migrate four static category assumptions to a revisioned database catalog with six Indonesian defaults, stable keys, archive/reactivate, immutable historical snapshots, and category reconciliation issues;
- route each category to an exact fixed department or reporter department, derive PIC from active Department Head/default route, and retire global-special routing for new Voice;
- expose authenticated workforce catalog and CSRF/idempotent/versioned Admin CRUD/history/status APIs plus server-side organization search and exact division filters;
- inject only active Definition/Examples as structured AI context while retaining code-owned instruction/tool wrapper and Private `category=null`;
- make Admin remediation and workforce fallback/dashboard/detail/filter surfaces consume the dynamic catalog;
- update OpenAPI/contracts, fixtures, seeds, PRD, ADR, and handoff.

Acceptance:

- unit, lint, typecheck, OpenAPI, build, destructive-migration, and diff checks pass;
- fresh and previous-schema migrations preserve Voice/classification/assignment/timeline/owner history and map legacy `FACILITY` to Fasilitas Umum;
- database integration proves six default routes, related reporter department, effective-time PIC changes, archive semantics, and deterministic reconciliation;
- Playwright proves Admin category lifecycle/search/filter/reorder/conflict/accessibility and workforce dynamic fallback/historical display;
- mandatory security, deployment, performance, and full-stack parity passes before this phase becomes `done` and Phase 13 resumes.

---

## Phase 13 — Staging Deployment and Rehearsal

Status: `in_progress` — resumed after Phase 12.5 local parity completed.

Dependencies: Phase 12.

Scope:

- release-by-SHA, checksum/safe path/deploy lock/high-water run, preflight/deploy/rollback/smoke;
- staging CI/CD with security/migration/container gates and stale-candidate rejection;
- deploy workforce ke `care.qd-tmmin.site` dan Admin ke `admin-ped.qd-tmmin.site`;
- live DeepSeek Chat Completions, auth, import/remediation, routing/Union/privacy, push/media, host isolation, migration, dan rollback rehearsal.

Acceptance:

- exact staging SHA tersedia pada kedua origin setelah green CI;
- Linux deployment lock, fresh/current-schema upgrade, persistent volumes, compatible code rollback, and release evidence lulus;
- end-to-end bootstrap/import/remediation serta critical workforce/Admin journeys green.

Implementation state 28 Agustus 2026:

- 2 September 2026 inference timeout alignment raises the env-only
  `OPENAI_TIMEOUT_MS` default and ceiling from 30,000 to 60,000 ms per provider
  attempt across API validation, local setup, deployment rendering, Compose,
  and committed environment examples. The existing single transient retry is
  retained, so two failed attempts can consume approximately 120 seconds. PRD
  §13.5 and ADR-0028 now record the same boundary; Phase 13 status is unchanged;
- 1 September 2026 classification prompt enrichment is locally complete: the
  code-owned classification system prompt advances to `care-classification-v1.4`
  with expanded injection defense, dominant-primary category selection with
  boundary guidance, the full PRD severity rubric with per-level examples,
  rationale-code definitions, fallback-threshold-aware confidence calibration,
  and the smoke-test `DEFAULT_CATEGORY_CONTEXT` synchronized with the seeded
  catalog definitions and ordered examples. Location prompt remains
  `care-location-v1.2`. See ADR-0030;
- 1 September 2026 local-provider extension is complete without changing this
  phase status: independent `/inference` Compose runs Granite 4.2 3B through
  SGLang on `dx-2`; the existing Cloudflare tunnel publishes
  `inference.qd-tmmin.site`; CARE supports encrypted, hot-reloaded Admin AI
  configuration with environment fallback; and live Granite plus DeepSeek
  `none`/`high` classification/location scenarios passed. Context is 32,768
  tokens and generated output is capped at 4,096. See ADR-0028. Hosted CARE
  exact-SHA acceptance and rollback evidence below remain outstanding;

- route remediation follow-up is locally complete: affected departments are
  visible in a comprehensive KPI/filter/impact/hierarchy/timestamp workspace and
  its scope-aware drawer; default/global PIC resolution accepts only No. Reg,
  the backend resolves and validates the workforce account, and OpenAPI/client
  drift is regenerated. Union Home no longer calls the Member-only dashboard or
  exposes reporter actions. The blue hero and inner white status card are
  centered and constrained at 360 px. Targeted browser, Admin accessibility/
  no-overflow, and real-PostgreSQL regressions pass;
  hosted staging retest remains part of the open acceptance work. See ADR-0016;
- QA Report 1 remediation is complete locally before hosted acceptance resumes:
  the authoritative 7.018-row import is `CONFIRMED` with set-oriented unit,
  route, issue, omission, legacy-access, and session-revocation writes; Admin
  and desktop Workforce use `Sidebar.onNavigate`; auth invalidation is immediate
  for logout/401/cross-tab races; terminal import polling refreshes history and
  confirmed-dependent caches. QA-005 (`exceljs -> uuid`) remains `deferred`
  without an override and must be reviewed before Phase 14/upstream release;
  QA-006 is resolved by relocating ignored secrets outside the workspace without
  a Gitleaks exception. See ADR-0013 and `docs/reports/qa-report-2.md`;
- release-by-full-SHA, checksum-before-extraction, archive member validation,
  atomic activation, retention, high-water run/SHA binding, Linux `flock`,
  explicit current/previous pointers, forward-only migration, automatic code
  rollback, and a guarded rehearsal using the same GitHub concurrency group and
  VM lock are implemented and locally tested;
- staging workflow gates quality, PostgreSQL integration/security/performance,
  fresh and previous-SHA migrations, mocked/serial full-stack browser journeys,
  workflow/shell/container acceptance, Gitleaks, dependency audit/review,
  CodeQL, and Trivy before calling the reusable deployment workflow;
- automatic staging deploy includes live configured-provider Chat Completions
  classification/location validation and two-origin smoke. Web Push canary is implemented as a manually
  invoked operational profile and is deliberately outside automated tests,
  deployment smoke, and the automatic deploy gate;
- the PR #21 Caddy container gate remediation upgrades the embedded Go crypto,
  network, and text modules to their fixed compatible set and moves the local
  inference gateway runtime to pinned distroless; local Trivy 0.70.0 reports
  zero High/Critical findings without an exception;
- hosted GitHub run, exact-SHA origin verification, acceptance-data journeys,
  overlapping-candidate evidence, and forced-failure rollback rehearsal remain
  required. Authenticated Safari operator retest also remains required because
  the persistent local Admin credential was previously rotated and is not
  available in the retained bootstrap secret; no credential reset was performed
  during remediation. The GitHub `staging` environment was absent at the final
  pre-push check, so environment/secrets provisioning is an external blocker to
  hosted deploy. Therefore this phase is not yet `done`.

## Phase 14 — Production Readiness and Launch

Status: `pending`

Dependencies: Phase 13 and all external blockers.

Scope:

- production workforce/admin domains, VM/DNS/GitHub environments/runtime secrets/OpenAI/VAPID/Caddy/deploy credentials;
- production preflight/rehearsal, authoritative master UAT, written risk approvals, operational ownership;
- exact-main-SHA deployment and critical smoke.

Delivery Complete Gate acceptance:

- seluruh PRD Section 39 readiness item complete;
- placeholder domain/secret ditolak;
- kedua production origin, health/readiness/release identity, host isolation, import/routing/privacy, dan critical smoke green;
- no unresolved Critical/High security finding;
- accepted risks approved in writing dan tidak ada backup/DR/HA claim;
- implementation/release handoff current.

---

## Next Recommended Action

Phase 13 adalah satu-satunya phase `in_progress`. Langkah berikutnya:

1. pantau seluruh required GitHub job dan reusable deploy untuk candidate di
   `staging`, lalu cocokkan `/ready` dan kedua `/release.json` dengan exact branch
   HEAD;
2. jalankan hosted acceptance-data journeys dan staging rehearsal guarded setelah
   dua release tersedia; rekam bukti pada `.agent/releaseExecutionChecklist.md`;
3. enroll dan jalankan Web Push canary secara manual bila operator membutuhkan
   bukti provider delivery. Canary bukan automated test atau deployment gate;
4. hanya setelah seluruh hosted evidence hijau, ubah Phase 13 menjadi `done`.
   Phase 14 dan seluruh production activation tetap `pending`.

## Visual Exploration Track — Mobile Member Voice (done, 30 Agustus 2026)

Status: `done` (non-code design artifact; tidak mengubah current Phase 13 status).

- 25 current mobile states captured untuk Member, Manager/Section Head, Leadership, Union Head, dan Union Officer;
- 25 standalone selected concepts tersusun per page/flow di `.design/member-voice-redesign/`;
- Member Home core dipertahankan; Create Voice dan Voice detail mendapat focused visual redesign;
- permission/read-only behavior dan anonymous/identified Private invariants tercatat dalam manifest dan prompt set;
- implementation aplikasi sengaja deferred sampai ada approval terpisah atas visual direction.

Acceptance evidence: `.design/member-voice-redesign/manifest.md` dan ADR-0021.

## Voice Detail & Dedicated Chat Page Redesign (done, 1 September 2026)

Status: `done` pada branch `feat/voice-detail-chat-redesign` (implementasi UI
scoped; tidak mengubah API, schema, kontrak, atau Phase 13 status). Mengikuti
ADR-0031 dan keputusan product owner: chatroom jadi halaman terpisah, hero biru
menggantikan topbar hanya pada dua halaman ini, bintang rating biru kumulatif
kiri→kanan, seluruh audiens distyle dengan elemen consent Union dipertahankan
verbatim, dan bottom dock tidak diubah.

- `packages/ui`: `RatingInput` mengisi bintang kumulatif (brand blue) untuk nilai
  terpilih plus preview hover/keyboard; radio semantics dan label aksesibel
  tetap; Admin tetap byte-identical.
- `apps/web-voice`: komponen baru `VoiceHero` (varian full/compact/union/closed),
  `LinkCard`, hook bersama `useConversation`; `ConversationPage` pada route baru
  `/voices/:id/chat` menggantikan `ConversationPanel` inline (UNAVAILABLE →
  redirect ke detail, READ_ONLY → log tanpa composer); `VoiceDetailPage`
  direstrukturisasi (action row, seksi "Detail Voice" dengan meta rows berikon,
  link cards Percakapan/Timeline, rating/closure/union cards restyle);
  `WorkforceShell` menyembunyikan topbar hanya untuk dua route ini.
- e2e: mock API mendapat `POST /voices/{id}/messages` stateful +
  `categoryNameSnapshot`; specs journeys/member/legacy/a11y/security/visual
  diperbarui; baseline visual detail/chat/lightbox/close-sheet/assign-sheet/
  union-identified diregenerasi delete-first dan diverifikasi dua run
  berturut-turut; axe/no-overflow chat page pada 360/768/1440.
- Validasi lokal hijau: format, lint, typecheck, unit (UI 26, workforce 68,
  Admin 2, frontend-core 14, API 70), build production, pwa compat, openapi
  tanpa drift, destructive-migration check, compose config, audit (1 moderate,
  di bawah ambang high), seluruh proyek Playwright non-fullstack 156 passed,
  Gitleaks, `git diff --check`. Suite berbasis database dilewati sesuai
  preseden change set frontend-only. Review visual: dua putaran judge terhadap
  kedua mockup referensi (truncation ID hero, clearance composer, avatar plate,
  focus ring, chip separators diperbaiki; putaran kedua pass semua).

## Closure Review Window & Auto-Acceptance (done, 2 September 2026)

Status: `done` pada branch `feat/close-voice-2-days` (skema + API + kontrak +
workforce UI; Phase 13 staging acceptance tidak berubah). Mengikuti ADR-0032
dan keputusan product owner terkunci: empat status Voice tetap; hasil review
penutupan adalah state `ClosureReviewState` (PENDING/ACCEPTED/REJECTED) pada
`ClosureCycle`; lewat 2 hari tanpa rating → auto-accept oleh worker dengan
notifikasi reporter + PIC penutup; rating terlambat setelah auto-accept masih
bisa (sekali, tanpa reopen); rating ≤2 tanpa reopen final; reopen hanya atomik
dengan rating dalam jendela.

- `apps/api`: enum `ClosureReviewState`, `VoiceEventType.AUTO_ACCEPTED`,
  `NotificationType.CLOSURE_AUTO_ACCEPTED`; `ClosureCycle` +
  `reviewState/reviewDeadline/reviewResolvedAt` + index; migrasi aditif dengan
  backfill deterministik (REJECTED untuk cycle reopen, ACCEPTED untuk cycle
  ber-rating/expired, sisanya PENDING); env `CLOSURE_REVIEW_DAYS` (default 2);
  `close()` membuka jendela + body notifikasi menyebut jendela 2 hari;
  `rate()` menegakkan satu-rating-per-cycle, eligibilitas reopen dari deadline
  (kebal lag worker), rating terlambat tanpa mengubah `reviewResolvedAt`;
  worker `ClosureReviewService` (interval 30 detik, `OUTBOX_ENABLED`, state-
  guarded & idempoten) flip expired → ACCEPTED + event `AUTO_ACCEPTED`
  system-generated (actor snapshot PIC penutup, `payload.system: true`) + 2
  notifikasi via outbox; serializer cycle/list/dashboard
  (`closedPendingReview`); OpenAPI + generated client diregenerasi.
- `apps/web-voice`: `voiceStatusDisplay` + `formatRemaining` +
  `statusFlagTone` review-aware; hero pill/dot, VoiceCard/HistoryVoiceCard/
  InboxVoiceCard memakai label turunan ("Menunggu Penilaian"/"Diterima"/
  "Dibuka Kembali"); RatingCard dua varian (notice countdown untuk PENDING,
  notice auto-accept untuk ACCEPTED tanpa rating; toggle reopen hilang pada
  varian auto-accepted); ClosureSection badge review; HomePage attention card
  "Menunggu penilaian Anda" dari `closedPendingReview`.
- e2e: mock API stateful `POST /voices/{id}/rate` (menulis rating + review
  state + flip status pada reopen) dan dashboard `closedPendingReview`; empat
  journey baru (reopen, accept, auto-accept + rating terlambat, attention
  card home); axe/no-overflow detail closed 360px; baseline
  `workforce-detail-closed-360.png` diregenerasi delete-first + baseline baru
  `workforce-detail-closed-auto-accepted-360.png`, dua run berturut-turut
  hijau, judge visual pass.
- Unit: `actions.test.ts` (RATE hanya cycle tanpa rating, REOPEN tak pernah
  standalone), `domain.test.ts` (ratingError reopenAllowed), `config.test.ts`
  (env baru), `formatters.test.ts` (label turunan + countdown). Integration:
  suite baru `closure-review.integration.test.ts` (6 kasus: window, accept,
  reject+reopen, window-closed, worker auto-accept + idempoten + rating
  terlambat, re-close cycle baru) dan seluruh suite lain tetap hijau.
- Koreksi 4 September 2026: cycle `PENDING` yang deadline-nya sudah lewat kini
  diproyeksikan langsung sebagai `ACCEPTED` pada detail/list dan dikeluarkan
  dari `closedPendingReview`, tanpa menunggu tick worker. Worker hanya memilih
  cycle unrated/unreopened pada Voice `CLOSED`. RatingCard juga menutup dan
  menyembunyikan reopen saat deadline lewat. Toggle ambigu diganti dua aksi
  submit eksplisit: `Buka kembali` langsung mengirim rating+reopen atomik dan
  `Kirim tanpa buka kembali` menerima closure dengan rating rendah.
  Regression mencakup PostgreSQL read-model sebelum tick serta journey browser
  expired-pending dan kedua keputusan rating rendah; timely reopen tetap hijau.

## Manager-to-Manager Voice Handover (implementation complete, 2 September 2026)

Status: `done` untuk implementation scope lokal pada branch
`feat/manager-handoff`; **Phase 13 tetap `in_progress`** dan existing staging
status tidak berubah. Mengikuti ADR-0033 dan PRD §41.

- Additive operational-category fields dan append-only `VoiceHandover` ledger;
  immutable submission classification dipertahankan. Migration backfill
  menginisialisasi operational category tanpa mengubah owner/status/event/ID.
- Manager current route owner dapat handover hanya pada unassigned General
  Voice `OPEN`; status tetap `OPEN`, destination category/route/PIC di-resolve
  ulang, version naik, event/audit sanitasi dibuat, dan hanya PIC baru menerima
  notification. Row lock + version recheck juga diterapkan pada Ask/Proceed/
  Assign untuk one-winner concurrency.
- Note 1–4.000 karakter diotorisasi per transfer pair. Former PIC mendapat
  restricted history dan `Handover Saya` tanpa Voice content; CARE Admin,
  reporter, leadership, timeline, notification/outbox, dan work-item DTO tidak
  menerima note.
- Workforce menambah decision-row Handover, route `/voices/:id/handover` dengan
  exact shared `VoiceHero`, current route, searchable category cards,
  Department Reporter badge, disabled route gaps, required private note,
  confirmation, sticky responsive footer, stale recovery, dan restricted
  history. Design showcase mengunci seluruh component state.
- Acceptance lokal mencakup generated schema/OpenAPI, action/search unit tests,
  PostgreSQL A→B→C/idempotency/privacy tests, serta Playwright journey,
  conflict retention, keyboard selection, axe, dan restricted history.
  Final parity results dicatat di `sessionHandoff.md`; hosted deployment tetap
  pekerjaan Phase 13 terpisah.

## Workforce login hero artwork and copy refresh (implementation complete, 3 September 2026)

Status: `done` untuk implementation scope lokal pada branch
`feat/auth-submit-page-polish`; **Phase 13 tetap `in_progress`** dan staging
status tidak berubah. Mengikuti ADR-0036.

- Login page (hanya login; ChangePasswordPage tidak berubah) memakai hero
  varian media: lockup, headline "Selamat datang di CARE." dengan aksen,
  dan artwork member-voice full-bleed (`src/assets/auth-hero-asset.png`,
  1152×768 PNG dengan alpha terverifikasi) yang tepinya menyentuh tepi
  background biru dan wave-nya menjadi tepi bawah hero.
- Copy login diperbarui: subtitle "Login untuk melanjutkan ke CARE",
  placeholder username "Contoh: 00111111", helper "Gunakan 8 digit NoReg
  Anda.". Password placeholder tetap "Password".
- Animated drifting password placeholder ditunda secara eksplisit
  (follow-up ADR-0036); tidak ada kode overlay/animasi yang di-commit.
- Acceptance lokal: format/lint/typecheck/unit (API 79, UI 26,
  frontend-core 14, Admin 2, workforce 81), production build, PWA budget,
  mocked e2e 177/177 termasuk baseline login 360 regen delete-first dua
  run deterministik, Gitleaks, dan `git diff --check`. Suite berbasis
  database tidak dijalankan ulang (change set frontend-only).

## Workforce submit success receipt (implementation complete, 4 September 2026)

Status: `done` untuk implementation scope lokal pada branch
`feat/submit-voice-asset`; **Phase 13 tetap `in_progress`** dan staging status
tidak berubah. Mengikuti ADR-0037.

- Submit General/Private sukses menuju receipt sementara `/voices/submitted`;
  receipt dikonsumsi satu kali, refresh/direct access kembali ke `/history`,
  dan preview diganti dalam history agar draft yang sudah terkirim tidak dibuka
  kembali.
- Receipt melewati Workforce shell sepenuhnya dan menyediakan aksi ke Voice
  Saya serta dashboard capability-aware tanpa fetch atau Voice identifier.
- Supplied transparent character asset dipertahankan; blueprint grid, success
  mark, dan layered SVG waves direkonstruksi code-native. White crest terakhir
  membentuk batas bawah bergelombang tanpa seam lurus.
- PNG fingerprinted masuk PWA precache; tidak ada perubahan backend, database,
  OpenAPI, shared UI, atau authorization contract.
- Acceptance lokal: format/lint/typecheck/unit/build/PWA compatibility hijau;
  mocked functional/Axe/keyboard/no-overflow/PWA coverage ditambah; tiga
  baseline 360/768/1440 diregenerasi delete-first dan stabil; full Playwright
  suite 185/185 hijau. Suite database tidak dijalankan ulang karena perubahan
  frontend-only.
