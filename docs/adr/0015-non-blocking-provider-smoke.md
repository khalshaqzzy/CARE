# ADR-0015: Live Provider Smoke Is Advisory, Not a Deploy Gate

- Status: Accepted
- Date: 28 August 2026
- Related: ADR-0007 (local SGLang inference provider), ADR-0011 (single VM / immutable releases), PRD §13.5 (Manual Fallback), §28.3 (readiness with degraded dependency), §31.1 (staging auto-deploy), §39 (release readiness)

## Context

Staging auto-deploy runs a live OpenAI-compatible Responses contract check
(`live-provider-smoke`, a one-shot container that calls the configured provider
with the exact `responses.create` JSON-Schema shape) once the API is healthy.
Before this decision, any smoke failure failed the candidate and triggered an
automatic rollback to the previous release. The product contract explicitly
wants a live classification/location schema check during staging deployment
(PRD §28.3, §31.1, §33.4), and the check remains valuable because formatting,
provider incompatibility, or a broken tunnel can otherwise pass all unit,
integration, and container tests.

However, the provider is an external, environment-specific dependency. The
configured staging provider (the local SGLang tunnel behind
`pad-llm-api.qd-tmmin.site`, ADR-0007) was not yet verifiable from the
deployment environment at the time this decision was made, which blocked every
otherwise-green staging release. The product already treats an unavailable AI
provider as a degraded, non-fatal condition (PRD §13.5 Manual Fallback and
§28.3 readiness: "Responses provider transient outage tidak mematikan core
readiness karena Manual Fallback tersedia"). A deployment that fails only
because the AI provider is unreachable carries no product-behavior regression:
classification and location review degrade to reporter-facing Manual Fallback
and the location degraded state exactly as designed.

## Decision

The OpenAI-compatible provider smoke during automated deployment becomes
**advisory** instead of a gate:

1. `remote-deploy.sh` still runs `live-provider-smoke` in the same position
   (after the API is healthy, before the web containers start).
2. A smoke failure no longer fails the candidate and no longer triggers
   automatic rollback. The deploy continues; the operator-facing log prints an
   explicit `Live OpenAI-compatible provider smoke FAILED; release continues
with Manual Fallback active.` warning.
3. The outcome is recorded in the environment deployment state at
   `shared/deployment-state/live-provider-smoke.result` as
   `status=passed|failed timestamp=... releaseSha=...` so the audit trail and
   runbook retain evidence per environment, alongside the deployment log.
4. Every other candidate gate remains blocking: image build, PostgreSQL start,
   migration, bootstrap, API health, web health, Caddy start, and the two-origin
   release smoke and release-identity checks. Automatic rollback still applies
   when any of those fail.
5. `live-provider-smoke` continues to emit full diagnostics (provider config,
   per-call `source`/`fallbackCode`/`latencyMs`, and a sanitized underlying
   error detail) so a degraded provider is immediately traceable from the
   deploy log.

## Rationale

- **Provider reachability is environmental, not code quality.** Blocking a
  healthy release on a tunnel/DNS/provider outage couples application
  availability to an external dependency that the product explicitly designed
  to tolerate via Manual Fallback.
- **Rollback on provider failure is destructive without being corrective.**
  Rolling back to a previous release does not repair the provider; it only
  delays delivery and can roll back unrelated improvements for a transient
  provider problem.
- **The check remains visible.** Running the smoke in every deploy keeps a
  live, evidence-producing contract check; failure is loud in the log and the
  state file instead of silently skipped.
- **Release-readiness still gates on the smoke.** A failing provider smoke
  does not pass PRD §39 (release readiness) or §34.7/§33.4 acceptance; the
  advisory deploy behavior only means the staging environment keeps a healthy
  application tree running while the provider is remediated.

## Alternatives considered

- **Skip the smoke entirely when provider is unconfigured** — rejected: the
  check is the only place the real provider contract is exercised; skipping
  hides regressions.
- **Gate only in production, advisory in staging** — rejected for now:
  production deployment is not yet active (PRD §30.3/§31.3), and gating
  production on a provider that is advisory in staging would be inconsistent.
  If production readiness later requires a hard provider check, a separate
  production gate can be reintroduced via ADR.
- **Retry/backoff instead of non-blocking** — rejected: the smoke already
  retries transient errors once with bounded timeouts; a provider that fails
  both attempts is unreachable or incompatible and repeating it would not
  change the outcome.

## Implementation details

- `deploy/scripts/remote-deploy.sh`: the `live-provider-smoke || return 1` gate
  was replaced by an `if ! … run --rm live-provider-smoke` block that records
  the result via the new `record_provider_smoke_state` helper and logs the
  failure warning; a `passed` marker is recorded on success. Markers are
  written mode `0600` under `shared/deployment-state`.
- `deploy/tests/deployment-scripts.sh`: the fake `docker` binary gained a
  `TEST_PROVIDER_SMOKE_FAIL` switch and a new harness case proves a provider
  smoke failure still activates the release and records the failed marker,
  while the existing two-origin smoke failure (`smoke-check.sh`) test still
  proves rollback.

## Consequences

- Staging deploy is no longer blocked by an unreachable or incompatible AI
  provider; the environment runs the current release with Manual Fallback and
  the location degraded state.
- Every deploy log and `live-provider-smoke.result` contains the smoke outcome,
  giving operators and audit a per-environment record of AI contract health.
- The product must not claim "live AI contract check passed" for a release
  whose marker says `failed`; the formal release-readiness gate (§39) still
  requires the live smoke to pass.
- The provider itself still needs remediation: the `OPENAI_*` secrets must
  resolve to a reachable, schema-compatible `/responses` endpoint before the
  staging acceptance evidence is complete (ADR-0007 follow-up).

## Validation

- `pnpm deployment:validate` and `pnpm test:deployment` pass on macOS (Linux
  `flock` contention remains mandatory in CI).
- The harness provider-smoke case fails the provider step and still activates
  the release and writes `status=failed`; the pre-existing rollback case still
  fails `smoke-check.sh` and calls `remote-rollback.sh`.
- `bash -n`, ShellCheck, and Actionlint are clean for the changed scripts.

## Follow-up work

- Restore/verify the provider public hostname (`pad-llm-api.qd-tmmin.site`
  DNS record in the Cloudflare `qd-tmmin.site` zone) or point `OPENAI_*`
  staging secrets at a reachable, schema-compatible endpoint.
- Re-run a live provider smoke to green before claiming hosted Phase 13
  acceptance evidence.
