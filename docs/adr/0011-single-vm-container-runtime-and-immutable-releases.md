# ADR-0011: Single-VM Container Runtime and Immutable Releases

- Status: Accepted
- Date: 28 August 2026

## Context

CARE requires two browser origins backed by one API and one PostgreSQL database. The first operational target is a single Ubuntu 22.04 VM. The release process must tolerate overlapping GitHub runs, preserve database and media state, reject untrusted release archives, expose exact release identity, and recover the application surface when a candidate fails. The product decision explicitly accepts the absence of backup, point-in-time recovery, disaster recovery, and high availability.

## Decision

CARE uses one Compose project per environment with these production services:

- PostgreSQL 16 with pgvector on an internal data network;
- a distroless, non-root API image;
- separate non-root nginx images for the workforce PWA and network-only Admin SPA;
- a non-root Caddy edge image as the only service publishing ports 80/443;
- one-shot migration, Admin bootstrap, live DeepSeek Chat Completions smoke, and Web Push canary profiles.

The workforce and Admin origins proxy `/api/v1`, `/health`, and `/ready` to the same API. Each frontend owns its `/release.json`. Caddy supplies host-specific security policy; nginx supplies SPA fallback and cache policy. The API trusts exactly one proxy hop.

Releases are immutable directories and image tags identified by the full lowercase Git SHA. GitHub builds an archive for the exact candidate commit and uploads it with a SHA-256 checksum. The VM validates the checksum and every archive member before extraction. Runtime environment files are parsed through an allowlist and passed directly to Compose; they are never executed with `source` or `eval`.

Deployment serialization has four layers: GitHub concurrency without cancellation, branch-head freshness checks before transfer, one VM-wide `flock` shared by deploy/rollback/rehearsal, and a persistent high-water run number bound to its SHA. Incoming paths include SHA, run number, and attempt. `current` and `current_release` are replaced atomically only after health, live provider, routing, and release-identity smoke checks pass.

Database migrations are forward-only. A failed candidate never runs a down migration or resets PostgreSQL. When a previous release exists, recovery means restarting its code/images against the already migrated schema and persistent data. Schema changes therefore must use expand/contract compatibility. If no previous release exists, the failed application surface is stopped while PostgreSQL and media remain intact.

The active release, its previous release, and up to five releases in total are retained. Cleanup validates the exact release path and SHA-tagged images and never prunes PostgreSQL, media, Caddy state, or deployment state.

The Web Push canary remains an explicitly invoked operational profile. It selects one enrolled active staging subscription by exact endpoint hash, sends a generic redacted payload through the CARE delivery path, and requires provider acceptance plus a new `lastSuccessAt`. It is intentionally outside automated tests, deployment smoke, and the automatic deployment gate. Live DeepSeek Chat Completions classification/location validation remains an automatic staging check whose failure is advisory under ADR-0015.

Local production-like testing composes the same release images and remote service graph through a thin local overlay. The overlay replaces host bind mounts with an isolated PostgreSQL named volume and repository-ignored local media/Caddy paths, exposes only Caddy on `care.localhost:8080` and `admin.care.localhost:8080`, and keeps OpenAI and Web Push optional. A single runner owns validation, image build, migration, idempotent Admin bootstrap, dependency-ordered startup, and exact-SHA smoke checks. Runtime environment contents are parsed rather than sourced. PostgreSQL Alpine runs as its image-defined UID/GID `70:70`; VM bind mounts and local named-volume initialization must use that identity.

## Consequences

- No external deployment, queue, callback, or observability service is required. Browser push providers and the configured DeepSeek Chat Completions API are the only application integrations exercised operationally.
- Two origins remain isolated at the browser boundary while sharing one API and database.
- A candidate can be rejected or rolled back without mutating the active pointer.
- Code rollback is not data recovery. An incompatible or destructive migration cannot be repaired by this mechanism.
- A single VM, single database, and bind-mounted state remain single points of failure. The system must not be represented as backed up, highly available, or disaster-recoverable.
- Production activation is a separate decision. Checks run on `main`, but no production deployment caller exists until its domains, VM, secrets, approvals, and operational ownership are ready.
- Developers can exercise the complete production topology without external services. Blank local OpenAI/VAPID configuration is reported as degraded while database, migration, storage, routing, and release identity remain testable.

## Alternatives Considered

- A mutable checkout on the VM was rejected because source identity and rollback targets are ambiguous.
- Cancelling an in-progress deployment was rejected because cancellation can interrupt migration or activation at an unsafe point.
- Database rollback was rejected because PostgreSQL schema/data rollback cannot be made generally safe without a tested restoration capability.
- Kubernetes and managed deployment services were rejected for the initial topology because they add an operational control plane without removing the accepted single-database and no-backup risks.
- Making real Web Push a steady-state CI gate was rejected by scope decision; subscription enrollment and provider lifecycle are operational concerns, and the canary remains manually verifiable.

## Verification

The repository enforces Dockerfile/Compose validation, Linux lock and archive-safety tests, fresh and upgrade migration checks, dual-host routing, exact SHA readiness, non-root users, private PostgreSQL networking, persistent PostgreSQL/media checks, and High/Critical filesystem/image scans. The local runner additionally verifies both frontend release documents and API readiness against the current full Git SHA; a down/up rehearsal preserves the PostgreSQL system identifier. Hosted release and rollback evidence is recorded separately for each candidate; local evidence alone does not prove a successful VM deployment.

## Alpine libuuid patch layer — 5 September 2026

The pinned Alpine runtime images include libuuid 2.42.1-r0, which the refreshed vulnerability database associates with seven High util-linux advisories. The existing explicit runtime APK patch layers for workforce, Admin and PostgreSQL are extended with libuuid 2.42.3-r0. This retains immutable base digests and non-root runtime identities while applying the available distribution fix. Scanner severity and exceptions are unchanged. Validation covers rebuilt image scans, routing, health, non-root execution and persistent database/media restart behavior; future base refreshes should reconcile these explicit package pins.

The stable v3.24 x86_64 package index lagged aarch64 for this patch. A tagged `@care-security` edge/main repository is therefore used only by the exact libuuid pin; other runtime packages remain on stable. The tag must be retired once the stable base supplies the patch on both architectures. Runtime patch verification must explicitly build linux/amd64 because native Apple Silicon builds can conceal package-availability differences.
