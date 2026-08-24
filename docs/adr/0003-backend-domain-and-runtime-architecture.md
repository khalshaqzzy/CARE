# ADR 0003: Backend Domain and Runtime Architecture

- Status: Accepted
- Date: 2026-08-24

## Context

CARE requires a privacy-sensitive reporting backend for a manufacturing workforce. The backend must provision accounts from authoritative workforce files, route reports without probabilistic account selection, preserve every lifecycle action, support anonymous Private conversations, process images safely, and remain usable when AI or push delivery is unavailable. Development must be reproducible without installing PostgreSQL tooling on developer machines.

The implementation also needs a stable frontend contract while keeping Private reporter identity structurally absent from responder and Admin payloads. Concurrent submit, assignment, transition, close, and rating operations must not create duplicate or contradictory business history.

## Decision

The backend is implemented as a strict TypeScript pnpm monorepo containing a NestJS API and generated OpenAPI contracts. PostgreSQL 16 with pgvector is the authoritative store and Prisma is used for application access and reviewed SQL migrations.

Local and test PostgreSQL run exclusively in Docker. Database verification and reset commands invoke `pg_isready` or `psql` inside the PostgreSQL container; a host PostgreSQL service and host `psql` are neither installed nor supported.

Authentication uses random opaque cookies whose HMAC hashes are stored in PostgreSQL. CSRF tokens are bound to the server-side session. Passwords use Argon2id, sessions have idle and absolute expiry, and login plus authenticated mutations consume database-backed HMAC-keyed throttle buckets. Authorization is default-deny and combines account state, role, reporter ownership, route ownership, active assignment, visibility, and resource relationship. Unauthorized object access is returned as a non-enumerating not-found response.

Manager provisioning treats each CSV as the full desired active snapshot. Partial unique PostgreSQL indexes enforce one active Safety Manager per area, one active Facility Manager per area, one active regular Manager per department, one active Union account, one active Section Head relation per employee, and one active Voice assignment. Regular department Managers explicitly exclude profiles marked Safety or Facility. Snapshot replacement is rejected if an omitted Manager still owns active Voices or Section Head relations.

Gemini is used only to classify a minimized Indonesian payload into category, severity, confidence, and an allowlisted rationale code. The versioned prompt embeds the locked severity rubric and category priority. Vertex AI express mode is selected explicitly and authenticated with a server-only API key from runtime configuration. AI never chooses an account identifier. Private category output is discarded, while General category output is mapped deterministically to current routing master data. Provider failure, invalid output, timeout, blocked output, or confidence below the configured threshold requires manual reporter selection.

Voice aggregates use immutable snapshots, append-only events/messages, expected versions, row locking or serializable transactions, and request-hash-bound idempotency keys. Notifications and delivery intent are committed transactionally. Outbox workers claim rows with `FOR UPDATE SKIP LOCKED`; persistent notifications remain authoritative when Web Push fails.

Images are bounded in request size and decoded pixel count, checked for MIME/signature agreement, rotated and re-encoded to WebP, stripped of metadata, checksummed, assigned random private storage keys, and served only after object-level authorization. Attachment states make interrupted file/database finalization detectable. A dry-run-first reconciliation CLI reports and optionally removes stale imports, expired drafts, orphan attachments, and unreferenced files.

OpenAPI v1 is committed and transformed into generated TypeScript operations. Member, General responder, Private responder, and Admin Private details are separate discriminated schemas. Private schemas do not define reporter identity fields. List cursors are HMAC-signed opaque values, and error responses use stable envelopes with correlation IDs.

Web Push subscriptions are normalized, restricted to exact configured provider hosts, bound to account/session/environment/installation, and uniquely keyed by normalized endpoint hash per environment. Private payloads contain generic text and opaque deep links. Environment-specific VAPID pairs are generated only when an operator selects stdout or an exclusive mode-0600 output file. The explicit local setup command may place a generated pair in the Git-ignored, mode-0600 local `.env`; tracked repository files are never a generator destination.

## Rationale

PostgreSQL constraints and transactions keep routing and lifecycle correctness independent of application races. Deterministic route lookup prevents model output from becoming an authorization decision. Separate Private schemas make accidental reporter leakage harder than conditional field omission. Persistent notifications plus an outbox preserve business intent without making optional provider health part of the core write transaction.

Docker-only database tooling gives every developer and CI job the same PostgreSQL/pgvector behavior while satisfying the requirement not to install `psql` locally. A monolithic NestJS runtime keeps operations simple while maintaining clear service and contract boundaries.

## Alternatives Considered

### Host PostgreSQL and host `psql`

Rejected because it creates machine-specific setup, version drift, and an explicit local installation dependency.

### AI-selected Manager identifiers

Rejected because probabilistic output must not determine authorization or ownership. AI classification and deterministic master-data routing remain separate operations.

### Bearer tokens stored by browser clients

Rejected in favor of opaque HttpOnly cookies and session-bound CSRF, which reduce client-side credential exposure and permit immediate server-side revocation.

### One polymorphic Voice DTO with optional reporter fields

Rejected because optional fields are easy to serialize accidentally. Concrete audience-specific schemas provide a stronger privacy boundary and a safer generated client.

### Direct notification delivery in business transactions

Rejected because provider latency and failure would extend locks or roll back otherwise valid CARE actions. The transactional outbox decouples durable intent from best-effort delivery.

### Statistical labeled AI dataset gate

Not selected for this release. The accepted validation consists of deterministic rubric/schema/fallback fixtures and a live non-sensitive authentication/structured-output smoke test.

## Implementation Details

- Node.js 22.23.2 and pnpm 11.8.0 are pinned with a frozen lockfile and explicit native build approvals.
- Development Compose uses `pgvector/pgvector:pg16` on loopback port 54329 with a persistent development volume and disposable `care_test` database.
- `pnpm setup:local` creates an ignored mode-0600 root `.env`, links it into the API workspace for Prisma CLI discovery, generates every local secret and VAPID value, and leaves only `VERTEX_API_KEY` empty. It refuses to overwrite existing setup files.
- Synthetic Employee and complete-snapshot Manager CSVs plus Union JSON are generated under ignored `local-data/`; the dataset covers all Safety/Facility area routes and the local workforce department without containing actual employee data.
- Stable Voice IDs use `CARE-YYYYMM-######` with an Asia/Jakarta monthly sequence protected by PostgreSQL upsert semantics.
- Private aliases are random per Voice and stable only inside that aggregate.
- Closure evidence is staged against a Voice and moved to an immutable numbered closure cycle during close.
- Ratings are immutable per closure cycle. A low rating may atomically reopen to the preserved route owner and previous active handler.
- CI pins third-party Actions by commit SHA and runs dependency audit, quality, migration, database, integration, security, performance, contract-drift, secret-scan, and CodeQL checks. The repository is public, so GitHub code-scanning integration is enabled.
- Production application Dockerfiles, reverse proxy, remote Compose, frontend implementation, and hosted deployment automation are intentionally outside this architecture increment.

## Consequences

Positive consequences:

- Route and lifecycle races are rejected by database and aggregate concurrency controls.
- Private identity is absent from responder/Admin types and serializers.
- AI, push, and media failures have explicit degraded or repairable paths.
- Local database behavior is reproducible without modifying the host PostgreSQL environment.
- The frontend can consume a committed, generated, audience-aware API contract.

Negative consequences:

- Database-backed sessions, throttles, and outbox work add write volume and cleanup responsibilities.
- Local private media requires reconciliation and does not provide managed-object-store durability.
- Vertex API-key express mode offers weaker identity governance than ADC even though the key remains server-only.
- Shared Union credentials still cannot provide individual non-repudiation.
- The initial migration has no previous application release from which an upgrade can be rehearsed; expand/contract upgrade proof begins with the next schema change.

## Validation

- Unit checks cover configuration redaction, prompt/rubric presence, provider fallback, cursor signing, lifecycle transitions, ratings, and canonical idempotency hashes.
- PostgreSQL integration checks apply the migration from an empty disposable Docker database and verify Union/Manager uniqueness, session/CSRF behavior, and database-backed throttling.
- Security checks cover Private serialization and route scope, MIME/signature mismatch, metadata-free re-encoding, and push endpoint allowlisting.
- Synthetic performance checks seed 2,000 accounts and 50,000 Voices, then execute 250 samples across 50 concurrent Member/Manager users against indexed PostgreSQL queries.
- OpenAPI and the TypeScript client are regenerated and checked for drift.
- Dependency audit reports no known vulnerabilities and Gitleaks scans the full uncommitted directory without broad allowlists.

## Risks

- The live provider contract can still change independently of deterministic tests.
- Local volume loss remains permanent because backup, PITR, and disaster recovery are out of scope.
- More exhaustive end-to-end authorization combinations should continue to be added as the frontend begins integration.
- Database throttle growth and storage reconciliation require an operational schedule.

## Follow-up Work

- Run the live non-sensitive Vertex structured-output smoke with an externally injected runtime API key before declaring the backend gate complete.
- Record an actual previous-release-to-current expand/contract migration rehearsal with the first post-baseline schema change.
- Schedule the reconciliation CLI and protected operational diagnostics in each deployed environment.
- Begin frontend integration only after the backend gate is explicitly recorded as passed.
