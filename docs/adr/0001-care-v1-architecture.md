# ADR 0001: CARE v1 Product and Technical Architecture

- Status: Accepted
- Date: 24 August 2026
- Decision owners: CARE/TMMIN product and engineering

## Context

CARE is an enterprise manufacturing member-voice application intended primarily for mobile use. It must support employee reporting, anonymous Private Voice routing to Union, AI-assisted categorization and severity, deterministic Manager routing, Section Head delegation, chat, traceable status transitions, evidence-based closure, rating, and reopen.

The initial repository contains product-agent rules but no application implementation. A consistent architecture is required before scaffolding so that identity, privacy, AI, file handling, deployment, and lifecycle behavior are not re-decided independently by different implementation sessions.

## Decision

### Application shape

CARE will be implemented as a TypeScript pnpm monorepo with one role-aware React/Vite/Tailwind/shadcn PWA, one NestJS API, shared generated TypeScript contracts, Prisma, and PostgreSQL. The frontend will never connect directly to the database.

One frontend origin will serve both SPA and `/api/v1`. Staging will use `https://care.qd-tmmin.site`. Each environment will run a separate monolithic Docker Compose stack on one VM with Caddy, web, API, and PostgreSQL.

### Identity and authorization

The application roles are CARE Admin, Member, Manager, Section Head, and Union. Manager and Section Head retain Member reporting capability. Authorization will be enforced in the API using role plus object relationship; UI capability hiding is not sufficient.

Private Voice will retain a reporter foreign key internally so the reporter can view, chat, receive notifications, rate, and reopen. Union and CARE Admin will receive a dedicated anonymous response type that omits reporter identity fields. General Voice will not be public and will be restricted to its reporter, route Manager, assigned Section Head, and CARE Admin.

Union will use one shared credential with multiple sessions. The loss of individual human attribution is an accepted risk and will be made explicit in audit and release readiness.

### Provisioning and routing

Actual employee, manager, and Union data will be uploaded through an Admin import workflow rather than committed to the repository. Import will provide preview, field-addressable errors, checksum/audit metadata, and atomic upsert semantics.

General routing will be deterministic: one Safety Manager per area, one Facility Manager per area, and one regular Manager per department. AI will classify a business category but will never select an account identifier. The backend will map the classification to current validated master data. Submission will fail while preserving the draft if no unique route exists.

### AI

Gemini will be accessed through Vertex AI using `@google/genai`. Runtime defaults will be model `gemini-3.7-flash`, location `global`, and `thinking_level=LOW`. Output will use a predefined JSON schema and a configurable confidence threshold defaulting to `0.75`.

Only area, reporter department, title, and detail text will be sent to Vertex. Names, registration numbers, account/Voice identifiers, images, chat, filenames, and device metadata will not be sent. Private Voice will use AI for severity only. Invalid, unavailable, timed-out, blocked, or low-confidence results will require reporter-confirmed manual category and severity.

### Workflow and persistence

Voice status is limited to Open, In Verification, In Progress, and Closed. Closure is only valid from In Progress. Reopen is an append-only event that transitions a Closed Voice to In Verification with the previous PIC. Assignment, proceed, closure, rating, and reopen will use optimistic versioning/idempotency and transactional event/notification writes.

Submission snapshots, classifications, timeline events, messages, closure cycles, evidence, and ratings will be immutable. Reopen will create another closure cycle instead of overwriting prior resolution history.

### Media and PWA

Only JPEG, PNG, and WebP will be accepted. Uploads will be decoded, resource-limited, re-encoded, stripped of metadata, and stored on an authenticated persistent VM volume. Media will never be exposed as a public static URL.

The PWA will support installability, offline shell, and limited non-sensitive last-read summaries. Auth, Private/General detail, chat, media, and all mutations will be network-only. Notification Center will be authoritative; Web Push will be an optional best-effort channel with redacted Private payloads.

### Delivery and durability

Deployment will adapt the supplier-henkaten release-by-SHA pattern: remote lock, secure runtime environment, migration before application readiness, Caddy last, atomic release pointer, five-release retention, smoke checks, and backward-compatible code rollback. Pushes to `staging` and `main` will target staging and production respectively after required CI and environment prerequisites.

No database or media backup, WAL archive, point-in-time recovery, RPO/RTO, replica, failover, or high availability will be provided in v1. Logical data retention is indefinite. This is accepted as a critical product risk and must be approved before production.

## Rationale

- A single frontend avoids duplicate navigation, components, authentication, and contract drift while roles still receive tailored experiences.
- NestJS/Prisma/PostgreSQL provides typed boundaries and transactional integrity for a workflow with concurrency, privacy, and append-only history requirements.
- Backend-owned deterministic routing prevents a probabilistic model from choosing privileged identities or producing unresolvable ownership.
- Dedicated anonymous DTOs make Private identity omission a compile-time/API-contract property instead of a fragile optional-field convention.
- Immutable cycles and events preserve traceability through repeated closure and reopen.
- Local persistent media is consistent with the requested single-VM scope and carries a clearly disclosed durability limitation.
- Release-by-SHA and expand/contract migrations reduce risk when code rollback cannot roll back database state.

## Alternatives Considered

### Separate frontend applications per role

Rejected because the product explicitly requires one surface and the workflows share authentication, reporting, detail, chat, notification, and account components.

### AI-selected Manager IDs

Rejected because model output is probabilistic and could route to an unauthorized or nonexistent account. AI classifies business meaning; the backend owns authorization and identity mapping.

### Public General Voice feed

Rejected because General was defined as non-anonymous routing, not public visibility.

### Individual Union accounts

Not selected. Individual accounts would provide stronger accountability, but the accepted requirement is one shared account used by multiple people.

### Object storage and managed PostgreSQL

Deferred to preserve the single-VM monolithic scope. Storage abstraction should avoid making later migration impossible.

### Offline mutation queue

Rejected for v1 because conflicts, stale authorization, attachment synchronization, and status races would materially expand risk.

### Backup and high availability

Not selected by product decision. This creates a critical accepted risk and prevents any durability/DR claim.

## Implementation Details

- All externally consumed API contracts will be documented in OpenAPI and shared through generated TypeScript code.
- PostgreSQL local development and integration tests will use Docker-managed databases.
- Voice aggregate writes will include expected version/idempotency protections.
- Transactional outbox will connect business commits to persistent notification/Web Push delivery.
- Structured logs will use correlation and release IDs while excluding prompt content, credentials, and Private identity.
- Vertex model/prompt changes will be configurable, versioned, validated with deterministic rubric fixtures, and smoke-tested with non-sensitive structured output in staging.
- Vertex authentication uses a server-only, environment-scoped API key read exclusively from runtime configuration.
- Caddy will use same-origin API routing and hardened headers compatible with PWA/service worker behavior.

## Consequences

Positive:

- One coherent authorization and UI model.
- Deterministic, auditable routing around probabilistic classification.
- Strong traceability across assignment, chat, closure, rating, and reopen.
- Clear deployment and test contracts from the beginning.

Negative:

- The Union shared credential cannot provide individual non-repudiation.
- CARE Admin can read sensitive Private content, though not reporter identity through the application.
- Infrastructure operators can technically correlate Private data in the raw database.
- `global` Vertex processing requires governance acceptance.
- Single-VM local storage and no backup expose all business data to permanent loss.
- Indefinite retention causes unbounded storage growth.

## Validation Plan

- Unit-test role/object policies, Private serializers, routing, classification fallback, and lifecycle transitions.
- Integration-test constraints, transactions, concurrent actions, idempotency, and append-only history on real PostgreSQL.
- E2E-test every role and privacy boundary, repeated closure/reopen cycles, PWA/offline, and push behavior.
- Validate Gemini behavior through deterministic rubric fixtures and a live non-sensitive authentication/schema smoke test; statistical dataset scoring is not a v1 gate.
- Load-test the 2,000-account/50-concurrent/50,000-Voice baseline.
- Rehearse fresh/upgrade migration, deployment, smoke, and backward-compatible code rollback on staging.

## Risks

- Permanent data loss without backup or recovery.
- Sensitive data exposure through shared credentials, Admin privileges, or infrastructure access.
- AI misclassification or confidence not reflecting real correctness.
- Web Push delivery variability.
- Storage exhaustion from indefinite media retention.
- Automatic production deployment magnifying an undetected defect.

These risks and their controls are tracked in `.agent/PRD.md`; critical accepted risks require written approval before production.

## Follow-up Work

- Scaffold the monorepo and quality toolchain.
- Create detailed schema/API ADRs when implementation proves a durable decision is needed.
- Obtain GCP, staging, VAPID, master-data, UAT-device, production, and risk-approval dependencies.
- Revisit backup/DR, individual Union identity, MFA/SSO, and managed storage before declaring an enterprise durability or identity posture beyond v1.
