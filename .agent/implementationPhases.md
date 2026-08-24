# CARE v1 Implementation Phases

| Atribut | Nilai |
|---|---|
| Status roadmap | Active planning baseline |
| Last updated | 24 Agustus 2026 |
| Product contract | .agent/PRD.md v1.0 |
| Current implementation | Not started |
| Current phase | None; Phase 0 completed, Phase 1 is next |
| Delivery strategy | Backend complete → Frontend complete → Production containerization and deployment |

Dokumen ini mengatur urutan implementasi CARE v1. Hanya satu phase/subphase boleh berstatus in_progress. Sebuah phase tidak boleh dimulai sebelum dependency dan acceptance check phase sebelumnya selesai.

Status yang digunakan: pending, in_progress, blocked, deferred, done.

## Sequencing Gates

Tiga gate berikut bersifat wajib:

1. **Backend Complete Gate** — seluruh schema, API, business workflow, authorization, AI, media, notification, integration/security/performance tests backend, dan OpenAPI contract selesai sebelum frontend dimulai.
2. **Frontend Complete Gate** — seluruh UI role, responsive/PWA behavior, generated-client integration, dan Playwright journeys selesai sebelum production containerization/deployment dimulai.
3. **Delivery Complete Gate** — production Dockerfiles, Caddy/Compose, CI/CD release automation, staging rehearsal, dan production readiness selesai terakhir.

Pengecualian yang wajib ada selama pekerjaan backend:

- Docker-managed PostgreSQL/pgvector untuk local development dan integration tests;
- disposable test database/Compose commands;
- CI service container yang diperlukan untuk membuktikan backend.

Pengecualian tersebut adalah test/development infrastructure, bukan production application containerization. Dockerfile production untuk API/web, Caddy image, remote Compose, release-by-SHA, dan deployment scripts tetap ditunda sampai Frontend Complete Gate.

---

## Phase 0 — Product and Architecture Baseline

Status: done

Deliverables:

- PRD normatif CARE v1;
- initial architecture and sequencing ADRs;
- implementation roadmap dan session handoff;
- keputusan role, privacy, AI, lifecycle, storage, deployment, testing, dan accepted risk.

Acceptance:

- requirement utama dan edge case produk tercatat;
- keputusan yang masih menjadi external dependency terlihat sebagai launch blocker;
- urutan backend → frontend → containerization/deployment terkunci;
- application implementation belum dimulai.

---

# Backend Track

Frontend application implementation dilarang dimulai selama Phase 1–6. Backend boleh menyediakan OpenAPI artifacts, contract fixtures, dan minimal non-user-facing test harness yang diperlukan untuk verifikasi API.

## Phase 1 — Backend Repository and Toolchain Foundation

Status: pending

Dependencies: Phase 0.

Scope:

- scaffold pnpm monorepo untuk apps/api, shared contracts, backend tests, dan placeholder workspace frontend tanpa UI implementation;
- pin Node.js/pnpm dan commit lockfile;
- TypeScript, formatting, lint, Vitest, Prisma, OpenAPI generation/check, dan root backend scripts;
- local Docker Compose PostgreSQL/pgvector sesuai repository rules;
- database lifecycle commands: up, wait, verify, test reset/migrate, dan down;
- baseline GitHub Actions untuk backend quality, PostgreSQL integration, migration checks, dan secret scanning;
- release identity, /health, dan initial /ready API endpoints.

Acceptance:

- clean pnpm install, format, lint, typecheck, backend unit smoke, API build, OpenAPI generation, dan local Compose validation lulus;
- local/test PostgreSQL hanya memerlukan Docker;
- fresh Prisma migration dan integration smoke lulus;
- tidak ada React screen, frontend workflow, production application Dockerfile, Caddy/remote Compose, atau deployment automation.

---

## Phase 2 — Backend Identity, Sessions, Provisioning, and Authorization

Status: pending

Dependencies: Phase 1.

Scope:

- Employee, UserAccount, ManagerProfile, SectionHeadRelation, Session, ImportBatch, dan AuditEvent schema;
- CARE Admin bootstrap CLI/runtime contract;
- login, logout, forced password change, reset, deactivation, CSRF, and throttling;
- Employee/Manager/Union import parsing, preview, atomic confirm, dan audit;
- manager-route uniqueness and active-reference constraints;
- employee search dan Section Head promote/transfer/remove;
- centralized role/object authorization policies;
- dedicated General, Private Union, dan Private Admin DTO/serializer contracts.

Acceptance:

- first-login/reset/session revocation behavior lulus;
- import error field-addressable dan tidak pernah partial write;
- one Safety/area, Facility/area, regular Manager/department constraints terbukti pada PostgreSQL;
- Private DTO tidak memiliki reporter identity field;
- authorization/IDOR/over-posting negative tests lulus;
- OpenAPI contract dan examples lengkap untuk seluruh capability phase ini.

---

## Phase 3 — Backend Voice Draft, Media, AI, and Submission

Status: pending

Dependencies: Phase 2; GCP staging dependency tersedia untuk live validation.

Scope:

- VoiceDraft, Voice, Attachment, AIClassification, human-readable ID sequence, dan versioning;
- form/draft API, upload/remove, preview data contract, expiry, dan orphan cleanup;
- secure image pipeline: stream limit, signature validation, decode, re-encode, EXIF removal, checksum, and authenticated serving;
- Vertex adapter dengan default gemini-3.7-flash, global, LOW, structured schema, timeout/retry;
- input minimization, classification snapshot, category priority, confidence threshold, dan Manual Fallback;
- deterministic Private/General routing;
- atomic submit with route validation, Voice event, notification intent, and preserved draft on failure;
- AI labeled evaluation harness and prompt/model versioning.

Acceptance:

- draft/version/content-hash invalidation behavior lulus;
- malicious/invalid/oversized media ditolak dan processed image bebas EXIF;
- zero/ambiguous PIC menolak submit tanpa kehilangan draft;
- Private selalu ke Union dan General tepat satu Manager;
- deterministic AI adapter tests serta live non-sensitive staging contract smoke lulus;
- AI evaluation memenuhi PRD routing accuracy/Critical recall target;
- logs tidak memuat prompt, PII, media, atau credential.

---

## Phase 4 — Backend Lifecycle, Assignment, Timeline, and Conversation

Status: pending

Dependencies: Phase 3.

Scope:

- VoiceAssignment, VoiceEvent, Conversation, Message, outbox, dan notification persistence;
- Open/In Verification/In Progress/Closed transition service;
- ask reporter, proceed, assign, reassign, and close authorization;
- reassign-before-progress rule dan close-only-from-progress rule;
- Manager/Section Head/Union ownership semantics;
- immutable chat dengan processed image attachments;
- anonymous per-Voice reporter alias and Private serialization;
- cursor pagination, severity-first inbox, timeline, and bounded polling contracts;
- optimistic versioning and idempotency across all mutations.

Acceptance:

- every valid/invalid transition dan concurrency race tested;
- Manager can close an In Progress General Voice with active Section Head;
- Section Head cannot operate outside active assignment;
- Union cannot access General or Private identity;
- message/timeline append-only invariants hold;
- Voice + assignment + event + notification/outbox transaction consistency terbukti;
- OpenAPI contracts and examples complete.

---

## Phase 5 — Backend Closure, Rating, Reopen, Dashboard, and Push

Status: pending

Dependencies: Phase 4.

Scope:

- ClosureCycle, closure evidence, Rating, repeated reopen cycles;
- close note/evidence validation and immutable closure;
- rating 1–2 feedback/reopen and rating 3–5 optional comment;
- reopen to In Verification with previous PIC;
- role-scoped dashboard aggregates, history, filters, search, and pagination;
- Notification Center query/read APIs;
- VAPID Web Push subscription, endpoint allowlist, delivery retry, redacted Private payload, and cleanup;
- structured logging, metrics, outbox diagnostics, storage usage, and dependency-degraded readiness.

Acceptance:

- closure impossible before In Progress or without note/evidence;
- repeated closure/rating/reopen never overwrites history;
- dashboard counts and inbox visibility match every role;
- Notification Center persists when push fails;
- Private push never contains content/identity;
- push subscription isolation/revocation/SSRF tests lulus;
- 50,000-Voice representative queries meet backend performance targets.

---

## Phase 6 — Backend Completion and Contract Freeze

Status: pending

Dependencies: Phase 1–5.

Scope:

- reconcile every PRD backend capability and acceptance criterion;
- freeze/version OpenAPI v1 and generate TypeScript client/contracts for frontend;
- complete backend unit/integration/security/AI/performance test suites;
- migration fresh and previous-SHA upgrade validation;
- concurrency, idempotency, privacy, media, and audit review;
- seed only non-sensitive deterministic E2E/UAT fixtures;
- document backend run commands, environment variables, error catalog, and frontend integration guide.

Backend Complete Gate acceptance:

- every v1 backend endpoint and domain workflow is implemented;
- no placeholder, mock business service, or frontend-dependent unfinished backend decision remains;
- unit and real-PostgreSQL integration suites green;
- AI evaluation and live staging Vertex contract smoke green;
- security negative tests green with no unresolved Critical/High backend finding;
- backend load targets green on representative data;
- OpenAPI drift check and generated client green;
- fresh/upgrade migrations green;
- backend application can be started locally without production Dockerfile, using Docker PostgreSQL only;
- handoff explicitly records **Backend Complete Gate: passed** before Phase 7 may start.

---

# Frontend Track

Phase 7–10 may start only after the Backend Complete Gate passes. Backend contract changes after freeze require explicit compatibility review, regenerated client, and rerun of all affected backend/frontend tests.

## Phase 7 — Frontend Foundation, Design System, and PWA Shell

Status: pending

Dependencies: Phase 6 Backend Complete Gate.

Scope:

- React/Vite/Tailwind/shadcn application;
- CARE design tokens, typography, layout, forms, status/severity primitives;
- generated OpenAPI client integration with typed error handling;
- authentication/forced-password-change/account flows;
- role-aware router, navigation, session/CSRF integration;
- responsive mobile/tablet/desktop shell;
- manifest, service worker foundation, offline fallback, cache isolation;
- common loading, empty, error, permission, stale, and conflict states.

Acceptance:

- no handwritten duplicate API wire types;
- one frontend surface adapts correctly to every role;
- shell accessible by keyboard and responsive without document overflow;
- logout/account switch clears user-scoped cache;
- all mutations remain network-only;
- component/unit tests for shared shell/forms pass.

---

## Phase 8 — Frontend Member Voice Journeys

Status: pending

Dependencies: Phase 7.

Scope:

- Member Home/dashboard;
- Input Voice, image selection/camera, validation, upload progress;
- AI/manual-fallback Preview and draft recovery;
- submit result and Riwayat list/detail;
- status/severity/PIC/timeline presentation;
- reporter chat and attachments;
- closure result/evidence display;
- rating, required feedback, reopen, and repeated cycle history;
- notification center and deep-link behavior.

Acceptance:

- Private and General reporter journeys match API/privacy contract;
- draft survives correctable submission errors;
- high-confidence AI is read-only and fallback is mandatory when required;
- rating/feedback/reopen UI enforces server rules;
- mobile primary actions remain visible with safe-area handling;
- Member Playwright journeys pass against completed backend.

---

## Phase 9 — Frontend Responder and Admin Journeys

Status: pending

Dependencies: Phase 8.

Scope:

- Manager, Section Head, and Union dashboards;
- severity-first Voice Member inbox, filters, search, pagination;
- General/Private detail variants and vertical timeline;
- ask, proceed, assign, reassign, close, and evidence flows;
- room chat and notifications;
- Manager Section Head settings/search/promote/remove;
- CARE Admin import preview/confirm, accounts/reset, route/master views;
- Admin Voice Explorer, audit, and system status.

Acceptance:

- UI only exposes actions permitted by current capability while backend remains authoritative;
- Union/Admin Private screens never render reporter identity;
- reassign after In Progress and close before In Progress are unavailable and safely handle server conflicts;
- import preview/errors and reset/session revocation UX complete;
- all responder/Admin Playwright journeys pass.

---

## Phase 10 — Frontend Completion, PWA, Accessibility, and E2E Gate

Status: pending

Dependencies: Phase 7–9.

Scope:

- Notification Web Push opt-in, install guidance, multi-device state, and redacted notification UX;
- service worker update/recovery, offline/stale behavior, and cache exclusion validation;
- responsive polishing at required viewports;
- WCAG 2.1 AA, keyboard/focus, touch target, reduced motion;
- full cross-role Playwright suite, visual regression, security UI probes;
- frontend performance, bundle, and production Vite build validation.

Frontend Complete Gate acceptance:

- every PRD UI journey is implemented without placeholder screen/action;
- mobile/tablet/desktop and supported-browser matrix green;
- PWA install/update/offline/push foreground/background/app-closed scenarios green;
- full Playwright suite against the completed backend green;
- Axe/accessibility and no-overflow checks green;
- production frontend build green;
- no unresolved Critical/High frontend finding;
- handoff explicitly records **Frontend Complete Gate: passed** before Phase 11 may start.

---

# Containerization and Deployment Track

Production application containerization, Caddy/remote Compose, dan hosted release automation begin only after the Frontend Complete Gate. Docker PostgreSQL used earlier remains development/test infrastructure.

## Phase 11 — Production Containerization

Status: pending

Dependencies: Phase 10 Frontend Complete Gate.

Scope:

- production multi-stage Dockerfiles for API and web;
- non-root/minimal runtime images;
- PostgreSQL image/configuration aligned with development migration requirements;
- Caddy image/config and same-origin /api/v1 routing;
- remote Docker Compose with health checks, persistent PostgreSQL/media/Caddy/deployment volumes;
- migrate/bootstrap operational profiles;
- runtime env template/validator and secret-safe rendering;
- image/Compose/Caddy tests, Hadolint, Trivy, and non-root assertions.

Acceptance:

- all images build from clean checkout;
- services run non-root where applicable;
- production-like Compose starts in required dependency order;
- health/readiness/release identity and persistent media/database behavior pass;
- security headers and SPA/API routing pass;
- no secret is baked into image or repository.

---

## Phase 12 — Staging CI/CD and Release Automation

Status: pending

Dependencies: Phase 11.

Scope:

- release-by-SHA archive, checksum, safe path, deploy lock, high-water run, and secure runtime env;
- remote preflight/deploy/rollback/smoke scripts adapted for CARE;
- five-release retention and safe image cleanup;
- staging GitHub Actions quality/security/migration/container jobs;
- stale-candidate rejection and automatic deployment from staging;
- service order PostgreSQL → migration/bootstrap → API → web → Caddy;
- code rollback without database rollback;
- staging live Vertex, push, media, auth, and critical journey smoke.

Acceptance:

- actionlint, ShellCheck, Hadolint, bash syntax, Gitleaks, CodeQL/dependency, and Trivy checks green;
- Linux deployment harness validates real flock contention;
- fresh and previous-SHA migration paths green;
- push to staging deploys exact SHA to https://care.qd-tmmin.site;
- failed candidate restores compatible previous code release;
- remote volumes persist across release;
- deployment produces complete release evidence.

---

## Phase 13 — Production Readiness and Launch

Status: pending

Dependencies: Phase 12 and all external blockers resolved.

Scope:

- production VM/domain/DNS/GitHub environment/runtime secrets;
- production-specific Vertex/VAPID/database/Caddy/deploy credentials;
- main workflow using the proven reusable deployment contract;
- production preflight and release rehearsal;
- actual master-data import UAT;
- written critical-risk approvals and operational ownership;
- final production deployment and smoke.

Delivery Complete Gate acceptance:

- all PRD Section 39 readiness items complete;
- production environment cannot deploy with placeholder domain/secret;
- exact main SHA deploys after green CI and stale-candidate checks;
- production health/readiness/release identity and critical smoke green;
- no unresolved Critical/High security finding;
- critical accepted risks approved in writing;
- no backup/DR/HA capability is claimed;
- implementation and release handoff documents are current.

---

## Next Recommended Action

Begin Phase 1 with backend-only repository/toolchain scaffolding and Docker-managed PostgreSQL development/test infrastructure. Do not start React screen implementation or production application containerization. Before any commit, create the target backend workflows, reconcile the exact local parity commands in .agent/rules.md, and run them from a clean-artifact state.
