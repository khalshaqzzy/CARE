# CARE Session Handoff

| Atribut                 | Nilai                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| Date                    | 24 Agustus 2026                                                                |
| Current objective       | Complete and verify the backend contract through the Backend Complete Gate     |
| Current phase           | Phase 6 in progress                                                            |
| Implementation status   | Backend capabilities through Phase 5 implemented; final external smoke remains |
| Recommended next action | Fill `VERTEX_API_KEY` in the ignored root `.env` and run the live smoke        |

## Completed Work

- Created the pinned Node.js/pnpm monorepo with NestJS API, generated OpenAPI client, Vitest, Prisma, and an intentionally empty frontend placeholder.
- Added Docker Compose PostgreSQL 16/pgvector development and disposable test databases. Every `psql` operation is executed inside the container; host PostgreSQL and host `psql` are not required or installed.
- Implemented health/readiness/release/metrics endpoints, environment validation/redaction, structured JSON logs, correlation IDs, migration checks, and backend-only CI.
- Implemented Employees, accounts, Managers, Section Heads, sessions, imports, throttles, idempotency, drafts, Voices, classifications, media, assignments, events, conversations, closure cycles, ratings, notifications, push subscriptions, outbox, and audit schema.
- Implemented opaque cookie sessions, session-bound CSRF, Argon2id, forced password changes, database-backed account/IP throttling, default-deny role/object authorization, Admin account operations, and bootstrap CLI.
- Implemented Employee/Manager/Union preview-confirm imports. Manager imports are authoritative snapshots and validate all area/department routes, active Voices, and Section Head relations transactionally.
- Implemented the Indonesian Gemini prompt and structured schema, Vertex AI express-mode API-key adapter, timeout/retry/manual fallback, Private category suppression, and deterministic server routing.
- Implemented drafts, preview, secure staged image processing, authenticated media, atomic submit, lifecycle actions, assignment/reassignment, immutable timeline/chat, closure evidence, rating/reopen, dashboards, conversations, notifications, outbox, and Web Push.
- Added signed opaque cursors, private audience-specific DTOs/OpenAPI schemas, stable errors, storage reconciliation, VAPID generation with explicit secure output, and non-sensitive performance fixtures.
- Upgraded dependencies and pinned patched transitive versions until `pnpm audit --audit-level high` reported no known vulnerabilities.
- Restored CodeQL, Gitleaks, package vulnerability auditing, and planned Trivy requirements after the repository visibility decision changed to public. Functional security tests remain required alongside them.
- Gitleaks excludes only the ignored mode-0600 root `.env`, which intentionally contains generated local runtime secrets. All tracked content and other uncommitted paths remain covered.
- Added a non-overwriting `pnpm setup:local` workflow. It generated the ignored mode-0600 `.env`, environment-specific VAPID pair, private local credentials note, 12 synthetic Employee rows, an 11-row full Manager snapshot covering every area route, and Union JSON. Only `VERTEX_API_KEY` remains blank.
- Bootstrapped the local CARE Admin idempotently against Docker PostgreSQL. Its generated credential is stored only in ignored `local-data/LOCAL_CREDENTIALS.txt`.

## Durable Decisions

- Each workforce account has Member capabilities plus at most one responder role: Manager or Section Head. Admin and Union remain non-workforce roles.
- General routing is deterministic: Safety by area, Facility by area, and Work Difficulty by reporter department. Regular department Managers explicitly exclude Safety/Facility profiles.
- Private Voices route to the active Union snapshot; Private serializers and generated contract types contain only a per-Voice anonymous alias and no reporter identity fields.
- Vertex AI receives minimized Indonesian text and returns category/severity metadata only. A server-only runtime API key is used with `vertexai: true`; secret values are never committed, logged, documented, or returned.
- There is no labeled AI dataset or statistical accuracy/recall gate. Deterministic rubric/schema/fallback checks plus one live non-sensitive provider smoke are required.
- VAPID key pairs are environment-specific. A local-only pair now exists solely in the ignored mode-0600 `.env`; no key value is captured in tracked artifacts or this handoff.
- Production Dockerfiles, Caddy, remote Compose, frontend code, and hosted deployment automation remain deferred.

## Verification Evidence

Green checks performed after implementation or relevant changes:

```text
pnpm install
pnpm db:generate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit                         # 2 files, 12 tests passed
pnpm setup:local                       # ignored local env/import fixtures created
pnpm bootstrap:admin                   # local Admin created idempotently in Docker PostgreSQL
pnpm migrations:destructive-check      # passed
pnpm openapi:generate                  # canonical document and client generated
pnpm build                             # API/contracts build; frontend remains placeholder
docker compose config --quiet
pnpm db:up
pnpm db:wait
pnpm db:verify                         # PostgreSQL 16 and vector extension confirmed in container
pnpm db:test:reset
pnpm db:test:migrate                   # fresh migration passed
pnpm test:integration                  # 2 files, 5 tests passed
pnpm test:security                     # 2 files, 5 tests passed
pnpm seed:performance                  # 2,000 accounts and 50,000 Voices
pnpm test:performance                  # 50 concurrent users, 250 samples, passed in 342 ms test time
pnpm maintenance:reconcile             # dry-run: no orphan/expired objects
pnpm audit --audit-level high           # no known vulnerabilities
docker gitleaks v8.24.3 directory scan  # no leaks found
git diff --check                        # passed
```

The repository-defined parity sequence was rerun after moving both generated `dist` directories out of the worktree. Install, generation, and build succeeded from that clean-artifact state. Integration tests were also rerun without a database reset after performance seeding to verify their isolation cleanup.

Immediately before the initial backend delivery commit on `staging`, the complete parity sequence was rerun from clean generated artifacts. Frozen install, dependency audit, formatting, lint, typecheck, 12 unit tests, migration safety, OpenAPI regeneration/drift, build, Compose validation, Docker PostgreSQL/pgvector verification, fresh test migration, 5 integration tests, 5 security tests, 2,000-account/50,000-Voice seeding, the 50-concurrent-user performance test, reconciliation, both Gitleaks modes, and diff checks passed. Docker Compose was stopped afterward.

The first `staging` GitHub Actions run revealed that a fresh Linux checkout had no generated Prisma Client before typed ESLint. CI and local parity now run `pnpm db:generate` immediately after frozen install so lint and typecheck consume the schema-derived types deterministically.

## Open Gate Item

`Backend Complete Gate: not yet passed`.

The live Vertex smoke was intentionally not run because no API key was supplied through the shell/runtime environment. A credential pasted in chat is not copied into commands or project artifacts. Fill the blank `VERTEX_API_KEY` in the ignored root `.env`, then run:

```text
pnpm test:vertex:smoke
```

The smoke sends one non-sensitive Indonesian fixture and prints only provider/model/location/schema status. Phase 7 must not begin until it is green and this handoff records `Backend Complete Gate: passed`.

## Cleanup

The Docker PostgreSQL service is stopped after local verification. No agent-started server, watcher, or container remains. No host PostgreSQL or `psql` installation was performed.
