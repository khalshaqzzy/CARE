# CARE Staging Deployment Guide

This is the operator runbook for CARE staging. It adapts the single-VM release pattern in `supplier-henkaten/deploy` to CARE's two origins, five runtime images, forward-only Prisma migrations, and full-SHA release identity. It contains no IP address, credential, private key, push endpoint/hash, or workforce PII.

## 1. Scope and Risk Boundary

Staging serves:

- workforce PWA: `https://care.qd-tmmin.site`;
- Admin SPA: `https://admin-ped.qd-tmmin.site`;
- one shared CARE API and PostgreSQL database behind those origins.

One Ubuntu 22.04 VM runs Caddy, workforce web, Admin web, API, and PostgreSQL. Caddy alone publishes TCP 80/443 and UDP 443. PostgreSQL is on an internal Compose network and has no host port. The Responses API and normal browser push providers are the only operational application integrations; no external deployment/callback service is required.

Critical accepted limitation: this topology has no database/media backup, WAL archive/PITR, restore procedure, DR, replica, failover, or HA. The VM, database, and media are single points of failure. Code rollback never restores data/schema. Do not describe this deployment as backed up, recoverable, or highly available.

Production is outside this guide. Push/PR to `main` runs CI only; no production deployment caller exists.

## 2. Runtime Layout

The hosted root is fixed:

```text
/opt/care/staging/
  current -> releases/<full-sha>
  current_release
  previous_release
  deploy.lock
  incoming/
  releases/<full-sha>/
  shared/
    postgres-data/
    media/
    caddy-data/
    caddy-config/
    deployment-state/highest_seen_run
```

Never delete or prune any `shared` subpath. Runtime env lives as mode `0600` at `releases/<sha>/.runtime.env`; never print it, copy it into evidence, or execute it as shell code.

## 3. DNS, Network, and SSH

Before bootstrap:

1. Point both staging A/AAAA records at the same VM.
2. Allow inbound TCP 80/443, UDP 443, and the chosen SSH TCP port. Do not expose PostgreSQL/API/web container ports.
3. Create a dedicated deployment SSH keypair. Store only its public key during VM bootstrap.
4. Obtain the VM's real SSH host-key line through a trusted channel. Do not trust an unauthenticated first connection.
5. Confirm GitHub-hosted runners can reach SSH and both names resolve to the VM.

Caddy obtains certificates automatically after DNS and ports are correct. Its persistent data/config preserve certificate state across releases.

## 4. Bootstrap Ubuntu 22.04

From a trusted checkout, validate and then run as root on the VM:

```bash
bash deploy/scripts/bootstrap-vm.sh --check staging <deploy-user> "<ssh-public-key>" <ssh-port>
bash deploy/scripts/bootstrap-vm.sh staging <deploy-user> "<ssh-public-key>" <ssh-port>
```

The idempotent script installs Docker Engine from Docker's official repository plus Compose/Buildx, creates the deployment user and `care-data` GID 2000, prepares `/opt/care/staging`, applies required UID/GID ownership, enrolls the public key, and configures UFW. Reconnect so Docker group membership is active.

Verify:

```bash
docker version
docker compose version
docker buildx version
id <deploy-user>
sudo -u <deploy-user> test -w /opt/care/staging/incoming
sudo -u <deploy-user> test -w /opt/care/staging/shared/deployment-state
test "$(stat -c '%u' /opt/care/staging/shared/postgres-data)" = 70
```

Bootstrap is staging-only and rejects any OS other than Ubuntu 22.04.

## 5. GitHub Environment

Create/protect the GitHub environment `staging`. Required environment secrets:

- `VM_HOST`
- `VM_USER`
- `VM_SSH_PRIVATE_KEY`
- `VM_SSH_KNOWN_HOSTS`
- `CADDY_EMAIL`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`
- `SESSION_HASH_SECRET`
- `SESSION_CSRF_SECRET`
- `AUTH_THROTTLE_SECRET`
- `CURSOR_SIGNING_SECRET`
- `METRICS_TOKEN`
- `CARE_ADMIN_USERNAME`
- `CARE_ADMIN_PASSWORD`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `VAPID_SUBJECT`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

Optional environment secret:

- `PUSH_CANARY_ENDPOINT_HASH` — exact lowercase SHA-256 of one enrolled staging subscription endpoint. Leave empty until enrollment. It is used only by the manual canary.

Optional environment variable:

- `VM_SSH_PORT` — defaults to `22`.

Rendering enforces distinct protection secrets, minimum lengths, dotenv-safe scalar values, HTTPS provider URL, valid VAPID subject, no placeholders/newlines, and mode `0600`. Domains, ports, project, root, and SHA are workflow-generated.

## 6. First Deployment and Trigger

Before the first push, confirm bootstrap, GitHub environment, DNS, provider quota/config, and all required secrets. The first release has no previous code to restore; failure stops its application surface while PostgreSQL/media remain.

A push to `staging` runs quality/database/browser/migration/deployment/container/security jobs and a release gate. The reusable deploy runs only when all gates succeed and the candidate remains branch HEAD. It checks freshness twice, archives the exact SHA, verifies SHA-256 and safe archive members, uses strict known-host SSH, and uploads to a unique SHA/run/attempt path.

Remote order is PostgreSQL → migration → Admin bootstrap → API → live Responses classification/location → both web apps → Caddy → two-origin smoke. The active pointer changes only afterward.

Monitor:

```bash
gh run list --branch staging --limit 10
gh run view <run-id> --json status,conclusion,jobs,url
gh run view <run-id> --log-failed
```

Do not call a release successful until `release-gate`, `Deploy staging`, and hosted verification are green.

## 7. Post-deploy Verification

Let `<sha>` be the full current staging SHA:

```bash
curl -fsS https://care.qd-tmmin.site/release.json | jq -e --arg sha "<sha>" '.application=="care-web-voice" and .releaseSha==$sha'
curl -fsS https://admin-ped.qd-tmmin.site/release.json | jq -e --arg sha "<sha>" '.application=="care-web-admin" and .releaseSha==$sha'
curl -fsS https://admin-ped.qd-tmmin.site/ready | jq -e --arg sha "<sha>" '.status=="ready" and .releaseSha==$sha'
bash deploy/scripts/smoke-check.sh "<sha>" https://care.qd-tmmin.site https://admin-ped.qd-tmmin.site
```

Complete `.agent/releaseExecutionChecklist.md`: TLS/security/cache headers, deep links, Admin PWA files absent, host-scoped cookies, same-origin API, no public database exposure, and acceptance-data business journeys. Record redacted evidence, never business response bodies.

## 8. Race Control and Retention

Ordering is protected by:

- GitHub `deploy-staging` concurrency with `cancel-in-progress: false`;
- branch-head checks at job start and immediately before SSH;
- one VM `flock` shared by deploy, rollback, and rehearsal;
- persistent highest run number bound to its SHA;
- unique incoming path per SHA/run/attempt;
- atomic `current` and `current_release` replacement.

A lower run is rejected. An equal run is accepted only for the same SHA. Never edit the high-water file to force an older candidate. Retention keeps active, previous, and at most five exact releases. Cleanup removes only validated SHA directories/tags and never shared state.

## 9. Migration and Rollback

Only `prisma migrate deploy` is allowed. Never run `prisma migrate reset`, down migration, or database reset on staging. Schema changes must be forward-only and compatible with retained previous code.

Candidate failure before smoke never activates it. If previous exists, its code/images restart against the already migrated schema and shared volumes. If none exists, the application surface stops while PostgreSQL/media remain. Rollback failure never triggers database rollback.

Manual code rollback:

```bash
bash /opt/care/staging/releases/<target-sha>/deploy/scripts/remote-rollback.sh \
  staging <target-sha> /opt/care/staging
```

Confirm the target is a retained full SHA with known migration compatibility, then rerun external smoke.

## 10. Guarded Rehearsal

After two known-good releases are retained, run the GitHub Actions workflow
`CARE staging rollback rehearsal` with the previous/current full SHAs and the
confirmation phrase `I_ACCEPT_STAGING_INTERRUPTION`. The workflow uses the same
`deploy-staging` concurrency group as auto-deploy and the script then acquires the
same VM lock.

The equivalent VM command below is for diagnosis only; routine evidence must use
the guarded GitHub workflow so both coordination layers apply:

```bash
bash /opt/care/staging/current/deploy/scripts/rehearse-staging.sh \
  <previous-sha> <current-sha> /opt/care/staging <vm-hostname> \
  I_ACCEPT_STAGING_INTERRUPTION
```

Rehearsal holds the same lock, records PostgreSQL identity, creates a media sentinel, activates previous code, attempts current with forced smoke failure, verifies automatic rollback, restores current, and proves persistence. It never reverses migrations. Record redacted results.

## 11. Manual Web Push Canary

Web Push canary is optional operational evidence. It is implemented but explicitly outside automated tests, deployment smoke, and the auto-deploy gate.

Enrollment:

1. Sign in to the staging workforce PWA on the designated browser/device and enable notifications through CARE.
2. Confirm exactly one active staging subscription is designated. Obtain its endpoint hash via an authorized database/operational lookup; never copy the raw endpoint into Git/docs.
3. Store the 64-character lowercase hash as `PUSH_CANARY_ENDPOINT_HASH` in the staging GitHub environment.
4. Deploy a later candidate so its mode-`0600` runtime env contains the hash.

Run manually on the VM:

```bash
cd /opt/care/staging/current
docker compose --env-file .runtime.env \
  -f deploy/compose/docker-compose.remote.yml \
  --profile operations run --rm push-canary
```

Success means the provider accepted the generic redacted payload and CARE advanced `lastSuccessAt` after the operation start. Visible notification display is not the criterion. Missing/inactive/duplicate subscription, rejection, or timeout is a failed manual canary. A 404/410 deactivates it; re-enroll before retrying.

## 12. Secret Rotation

Rotate one concern at a time and preserve the old value until replacement deployment is verified.

- Session/CSRF/throttle/cursor rotation can invalidate sessions/tokens; schedule it.
- PostgreSQL rotation coordinates the database role password and GitHub secret.
- VAPID public/private keys rotate together; existing subscriptions must re-enroll.
- Admin bootstrap input is not a normal reset channel; use the application reset workflow.
- SSH rotation enrolls the new public key and verifies it before removing the old key.
- OpenAI key/model/base URL changes must pass live schema validation and provider/privacy approval.

Never print secret values in commands or evidence.

## 13. Diagnostics

- **Superseded candidate:** expected; a newer branch HEAD won.
- **Stale/equal-run rejection:** use the correct run; never lower the high-water mark.
- **Lock unavailable:** wait for active deploy/rollback/rehearsal; do not delete a held lock.
- **Checksum/archive failure:** treat upload as untrusted; do not extract manually.
- **Preflight DNS failure:** both names must resolve to the expected VM.
- **Runtime env rejection:** fix the named GitHub value; do not weaken validation.
- **PostgreSQL unhealthy:** inspect logs, disk, and ownership; never delete existing data.
- **Migration failure:** retain logs and fix with a new forward migration.
- **API/web/Caddy unhealthy:** inspect exact candidate logs, bind permissions, SHA, and ports.
- **Live Responses failure:** fix endpoint/model/key/quota/schema; auto-deploy remains failed.
- **TLS/smoke failure:** inspect Caddy, DNS, firewall, certificates, routing, and exact SHA.
- **Rollback failure:** keep database/media untouched; diagnose retained code/schema compatibility.
- **Push canary failure:** manual only; verify enrollment/hash/VAPID/provider and re-enroll after 404/410. It does not retroactively fail automatic deployment.

Useful read-only VM commands:

```bash
cd /opt/care/staging/current
docker compose --env-file .runtime.env -f deploy/compose/docker-compose.remote.yml ps
docker compose --env-file .runtime.env -f deploy/compose/docker-compose.remote.yml logs --tail=200 api caddy postgres
cat /opt/care/staging/current_release
readlink /opt/care/staging/current
```

Never paste `.runtime.env`, database rows, request bodies, push identifiers, or private logs into tickets/chat.

## 14. Acceptance Evidence

Use `.agent/releaseExecutionChecklist.md`. Retain exact SHA and successful run/deploy links; origin release/readiness and security/routing evidence; live Responses; acceptance-data journeys; persistence; overlapping/stale ordering; and two-release forced-failure rollback with unchanged database identity/media sentinel. Label optional canary evidence non-gating.

Phase 13 is not complete from local evidence alone. Mark it `done` only after hosted SHA and rehearsal evidence are green. Phase 14 remains pending and the Delivery Complete Gate stays open until production-readiness criteria and accepted-risk approvals pass.

## 15. Local Full-stack Containers

The repository includes a local overlay that runs the same PostgreSQL, migration,
bootstrap, API, workforce nginx, Admin nginx, and Caddy topology without external
services or public DNS/TLS.

```bash
cp .env.local.example .env.local # only when .env.local does not exist
pnpm local:up
pnpm local:status
pnpm local:logs
pnpm local:down
```

Local URLs are `http://care.localhost:8080` and
`http://admin.care.localhost:8080`. The command builds images from the current
checkout, applies forward migrations, idempotently bootstraps the local Admin,
waits for every health check, and verifies both frontend release identities plus
API readiness.

`.env.local` is mode `0600`, ignored by Git, and may hold developer-only values.
`.env.local.example` is the committed non-secret template. OpenAI and VAPID are
empty by default, so readiness reports those optional integrations as degraded
while the full local application remains ready; configure developer-owned values
only when explicitly testing those integrations. PostgreSQL uses the persistent
named volume `care-local-postgres-data`; media and Caddy state live under ignored
`local-data/fullstack`. `pnpm local:down` preserves both kinds of state.
