# CARE v1.1 Implementation Phases

| Atribut                | Nilai                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Status roadmap         | Backend v1.1 re-freeze and Phase 7 frontend foundation complete                               |
| Last updated           | 26 Agustus 2026                                                                               |
| Product contract       | `.agent/PRD.md` v1.1                                                                          |
| Current implementation | Phase 0–6 backend complete; Phase 7 two-app frontend foundation complete                      |
| Current phase          | Phase 7 `done`; Phase 8 `pending`                                                             |
| Delivery strategy      | Backend remediation/re-freeze → two-app frontend → production containerization and deployment |

Dokumen ini mengatur urutan implementasi CARE v1.1. Hanya satu phase/subphase boleh berstatus `in_progress`. Sebuah phase tidak boleh dimulai sebelum dependency dan acceptance check phase sebelumnya selesai.

Status yang digunakan: `pending`, `in_progress`, `blocked`, `deferred`, `done`.

## Sequencing Gates

Tiga gate berikut bersifat wajib:

1. **Backend Complete Gate** — seluruh remediation schema, organization master, routing, authorization, Union, AI Responses, location review, dashboard, migration, OpenAPI, dan backend regression selesai sebelum frontend dimulai.
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

### Phase 6.4 — OpenAI Responses, Classification, and Location Review

Status: `done`

Dependencies: Phase 6.3.

Scope:

- hapus Gemini/Vertex, `@google/genai`, location provider, dan seluruh `VERTEX_*` runtime contract;
- official JavaScript SDK, `responses.create`, `/responses`, Structured Outputs JSON Schema, `store:false`, tanpa tools/conversation state;
- config `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY`, `OPENAI_TIMEOUT_MS`, `OPENAI_CONFIDENCE_THRESHOLD`, tanpa production default untuk base URL/model/key;
- minimized payload, bounded timeout/retry, schema validation, sanitized errors, versioned prompts/contracts;
- classification: nullable category untuk Private, severity, confidence, rationale code; tidak ada fixed category priority;
- location review: `COMPLETE | INCOMPLETE | UNKNOWN`, warning, maksimal tiga suggestion questions;
- debounce/on-blur review, content-hash cache, invalidation, snapshot-bound acknowledgment, advisory warning, dan non-blocking provider failure;
- Manual Fallback: General memilih category+severity, Private memilih severity saja.

Acceptance:

- tests mencakup valid schema, refusal/incomplete, invalid schema, timeout, bounded retry, low confidence, missing config, Private severity-only, dan sanitized logs;
- location cache hit/invalidation, stale acknowledgment rejection, `INCOMPLETE` confirmation, dan provider failure path lulus;
- deterministic local mock `/responses` smoke lulus untuk classification dan location schemas tanpa external API key; live provider validation dipindahkan ke staging rehearsal setelah config tersedia;
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
- mock OpenAI-compatible `/responses` classification/location smoke green tanpa external API key, sesuai keputusan pengujian; live provider smoke menjadi staging validation dan bukan Phase 6 test dependency;
- handoff mencatat **Backend Complete Gate: passed** sebelum Phase 7 dimulai.

Gate saat ini: **passed** pada 26 Agustus 2026. Phase 7 boleh dimulai. Base URL/model/API key riil tetap external dependency untuk staging dan production, bukan dependency unit/integration/smoke test.

---

# Frontend Track

Phase 7–11 hanya boleh dimulai setelah Backend Complete Gate. Backend contract change setelah freeze memerlukan compatibility review, client regeneration, dan rerun affected tests.

## Phase 7 — Shared Frontend Foundations for Workforce and Admin

Status: `done` — completed 26 Agustus 2026.

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

Status: `pending`

Dependencies: Phase 7.

Scope:

- Admin bootstrap/account/reset pages pada `admin-ped.qd-tmmin.site` staging;
- XLSX/CSV initial/monthly upload, preview/diff/confirm/history;
- remediation queue, default PIC, global PIC, three-Union-account, route, account, import issue, dan resolution audit pages;
- read-only Section Head candidates, Voice Explorer, Private full-identity detail, audit, dan system status.

Acceptance:

- invalid/valid workbook, 10.000-account preview, atomic confirm, deactivation, mapping invalidation, dan remediation journeys lulus;
- tidak ada UI Section Head promote/transfer/remove;
- Admin Private access read-only, full identity, dan audited;
- app tidak menyediakan offline/PWA behavior.

## Phase 9 — Member Voice Journey

Status: `pending`

Dependencies: Phase 8.

Scope:

- Member Home dan pilihan awal Private Voice/General Voice;
- Private identity consent `Ya/Tidak` dan contract-aware preview;
- form/media validation, automatic location review, warning/suggestions, confirmation acknowledgment, cache invalidation;
- General category/severity dan Private severity AI/fallback previews;
- submit result, history/detail, status/PIC/timeline/chat, closure/rating/reopen, notification deep links.

Acceptance:

- Private/General paths, conditional consent, no-category Private, and route failure preserve draft;
- warning lokasi tampil di bawah field tanpa field tambahan wajib; stale review/ack ditolak;
- provider failure tidak memblokir form dan fallback sesuai jenis Voice;
- `Department=14` General remediation dan Private continuation lulus;
- responsive Member Playwright journeys green.

## Phase 10 — Responder and Leadership Journeys

Status: `pending`

Dependencies: Phase 9.

Scope:

- Section Head assigned inbox/action journey;
- Manager department detail/action, division overview, dan separate global/default operational inbox;
- Union Head Private all/assign/reassign, Union Officer assigned-only, conditional identity, dan General read-only journey;
- Division/Deputy/Pjt. Head, Director, dan Union General aggregate/detail read-only dashboards;
- minimum charts, scoped filters, timeline/chat/notifications, proceed/assign/reassign/close conflict states.

Acceptance:

- full dashboard/detail/action matrix dan aggregate leakage checks lulus;
- Environment tampil pada form/filter/chart;
- action controls mengikuti capability/object scope tetapi server tetap authoritative;
- conditional Private identity dan Officer assignment isolation lulus;
- all responder/leadership Playwright journeys green.

## Phase 11 — Frontend Completion, Workforce PWA, Accessibility, and Two-App E2E Gate

Status: `pending`

Dependencies: Phase 7–10.

Scope:

- workforce Web Push opt-in, install/update/offline/stale behavior, and cache exclusions;
- Admin network-only validation;
- responsive polish, WCAG 2.1 AA, keyboard/focus/touch/reduced-motion;
- two-origin full Playwright, host isolation, visual regression, UI security probes, performance/bundle/build validation.

Frontend Complete Gate acceptance:

- seluruh PRD UI journey tersedia tanpa placeholder;
- workforce PWA and Admin responsive supported-browser matrix green;
- Playwright pada kedua origin, Axe, no-overflow, production builds, dan privacy probes green;
- no unresolved Critical/High frontend finding;
- handoff mencatat **Frontend Complete Gate: passed** sebelum Phase 12.

---

# Containerization and Deployment Track

## Phase 12 — Production Containerization for API, Workforce, Admin, and Caddy

Status: `pending`

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

## Phase 13 — Staging Deployment and Rehearsal

Status: `pending`

Dependencies: Phase 12.

Scope:

- release-by-SHA, checksum/safe path/deploy lock/high-water run, preflight/deploy/rollback/smoke;
- staging CI/CD with security/migration/container gates and stale-candidate rejection;
- deploy workforce ke `care.qd-tmmin.site` dan Admin ke `admin-ped.qd-tmmin.site`;
- live Responses, auth, import/remediation, routing/Union/privacy, push/media, host isolation, migration, dan rollback rehearsal.

Acceptance:

- exact staging SHA tersedia pada kedua origin setelah green CI;
- Linux deployment lock, fresh/current-schema upgrade, persistent volumes, compatible code rollback, and release evidence lulus;
- end-to-end bootstrap/import/remediation serta critical workforce/Admin journeys green.

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

Mulai Phase 8 Admin organization operations pada shell desktop yang sudah tersedia. Pertahankan generated OpenAPI contract, same-origin transport, desktop gate, dan cache split Phase 7; validasi provider AI riil tetap dilakukan saat Phase 13 staging.
