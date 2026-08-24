# ADR 0002: Backend-First Delivery Order

- Status: Accepted
- Date: 24 August 2026
- Decision owners: CARE/TMMIN product and engineering

## Context

CARE contains a broad workflow spanning identity, provisioning, privacy, deterministic routing, AI classification, media processing, lifecycle transitions, chat, closure, rating, notification, dashboards, and deployment. The frontend depends on stable authorization semantics and API contracts for all of these capabilities. Starting frontend behavior while backend decisions remain incomplete would encourage duplicated client-side rules, temporary mocks, contract churn, and privacy inconsistencies.

Production application containerization and hosted deployment automation similarly depend on both API and frontend runtime shapes being final enough to define health checks, build outputs, routing, persistent volumes, environment validation, and smoke tests.

The repository rules independently require local development and database tests to use Docker-managed PostgreSQL. That database dependency must remain available even when production application containers are deliberately deferred.

## Decision

CARE will be delivered in the following strict order:

1. The backend will be completed first, including PostgreSQL schema/migrations, authentication, provisioning, authorization, AI, routing, media, all Voice workflows, chat, closure/rating/reopen, dashboards, notifications, OpenAPI contracts, observability, and backend test/security/performance acceptance.
2. Frontend implementation will begin only after the backend contract is frozen and the Backend Complete Gate has passed. The frontend will consume generated OpenAPI contracts and complete all role journeys, responsive/PWA behavior, accessibility, and browser E2E acceptance.
3. Production application containerization and deployment automation will begin only after the Frontend Complete Gate has passed. Dockerfiles, Caddy, remote Compose, release-by-SHA scripts, staging deployment, and production activation will be completed last.

Docker-managed PostgreSQL and disposable database infrastructure are allowed and required during backend work. This is classified as development/test infrastructure, not production application containerization. Production API/web images, Caddy/remote Compose, and hosted deployment scripts remain deferred until the frontend is complete.

## Rationale

- Backend-first delivery establishes database invariants, privacy boundaries, state transitions, and object authorization before any UI can accidentally encode conflicting rules.
- A frozen OpenAPI contract allows the frontend to use generated clients and eliminates handwritten duplicate wire types.
- Backend integration, concurrency, and security failures can be corrected before their assumptions spread across screens.
- Frontend completion before containerization makes runtime image, health, routing, CSP, service-worker, media, and smoke-test requirements concrete.
- Keeping Docker PostgreSQL early complies with repository rules and enables realistic Prisma/integration validation without prematurely building production containers.

## Alternatives Considered

### Vertical feature slices

Implementing each feature end-to-end across database, API, UI, and deployment was rejected for the initial build because it would repeatedly change shared identity, authorization, Voice lifecycle, and generated contracts before those foundations stabilize.

### Frontend shell before backend completion

Rejected beyond a non-functional workspace placeholder. A visual shell could create pressure to invent mock contracts or authorize behavior in the browser. Design and UI implementation are intentionally held until the backend contract is complete.

### Containerize the API early

Rejected for production application delivery. Local execution plus Docker PostgreSQL is sufficient to validate the backend. Production Dockerfiles and remote Compose are more reliable when both API and web build/runtime contracts are known.

### Defer all Docker usage

Rejected because `.agent/rules.md` requires Docker-managed PostgreSQL for local development and database tests. A host PostgreSQL dependency is not allowed.

## Implementation Details

- The backend workspace may include a placeholder frontend package only when tooling requires it; no React screens or user workflow implementation may begin before backend acceptance.
- Backend completion requires all PRD API capabilities, generated OpenAPI v1 contracts, real-PostgreSQL integration tests, AI evaluation, security negative tests, representative load tests, and migration validation.
- Any backend contract change after freeze requires compatibility review, regenerated client artifacts, and rerun of affected backend/frontend tests.
- Frontend completion requires all role journeys, responsive/accessibility checks, PWA/offline/push behavior, production Vite build, and Playwright acceptance against the real completed backend.
- Production containerization then adds API/web Dockerfiles, Caddy, remote Compose, runtime environment validation, migrations/bootstrap operations, image/security checks, and persistent volumes.
- Staging release automation and production activation follow only after production-like container acceptance succeeds.

## Consequences

Positive:

- Backend privacy and lifecycle contracts stabilize before UI implementation.
- Frontend work can use real endpoints and generated types rather than mocks.
- Container and deployment smoke tests can exercise complete user journeys.
- Handoffs have explicit, auditable gates that prevent work from silently moving ahead while foundational acceptance is incomplete.

Negative:

- Visible UI progress starts later.
- Usability feedback that would normally influence API shape arrives after backend contract freeze; compatibility review may be required.
- Backend completion is a larger initial batch of work and requires disciplined contract examples and non-UI test harnesses.
- Production runtime behavior is validated later than in a vertical-slice approach.

## Validation Plan

- Roadmap checks must confirm that no frontend implementation item precedes the Backend Complete Gate.
- Backend handoff must explicitly record the gate as passed and list exact test/migration/security/evaluation results.
- Frontend handoff must explicitly record its gate as passed and list Playwright, accessibility, PWA, browser, and build results.
- Repository inspection before containerization must confirm the application capabilities are complete and no placeholder screens/actions remain.
- Delivery validation must run production-like Compose, health/readiness, persistence, routing, security headers, migration, smoke, and rollback checks.

## Risks

- Backend APIs may require change after real UX implementation reveals a usability gap.
- Deferring production containers can conceal runtime-only issues until later.
- Teams may interpret Docker PostgreSQL as violating the ordering unless the development/test exception remains explicit.
- A long backend track may reduce early stakeholder visibility.

The risks are mitigated through complete OpenAPI examples, backend contract fixtures, periodic non-UI demonstrations, a strict compatibility process, and an explicit Docker PostgreSQL exception.

## Follow-up Work

- Start backend repository/toolchain work with Docker-managed PostgreSQL and no React UI implementation.
- Record gate evidence in the session handoff and keep the implementation roadmap current whenever work status changes.
- Review API usability through contract examples before freeze to reduce frontend-driven breaking changes.
- Begin production containerization only after the frontend gate is explicitly complete.
