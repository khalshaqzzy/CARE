# CARE Backend Guide

## Local runtime

Node.js runs on the host, while PostgreSQL and `psql` remain inside Docker. A host PostgreSQL installation is neither required nor supported.

```text
pnpm install --frozen-lockfile
pnpm setup:local
# Fill only VERTEX_API_KEY in the generated root .env file.
pnpm db:up
pnpm db:wait
pnpm db:verify
pnpm db:migrate
pnpm dev:api
```

Stop the database with `pnpm db:down`. Tests use the disposable `care_test` database through `pnpm db:test:reset` and `pnpm db:test:migrate`.

## Security configuration

Run `pnpm setup:local` once to create an ignored root `.env` with generated secrets and environment-specific VAPID keys. Only `VERTEX_API_KEY` is left empty. The command refuses to overwrite any existing local setup file. It also creates ignored synthetic imports under `local-data/` and a mode-0600 `LOCAL_CREDENTIALS.txt`. Never commit the Vertex API key, VAPID private key, session secrets, bootstrap password, or actual workforce imports.

| Variable                      | Purpose                                                    | Secret |
| ----------------------------- | ---------------------------------------------------------- | ------ |
| `NODE_ENV`                    | Runtime policy: development, test, staging, or production. | No     |
| `PORT`                        | Host API listen port.                                      | No     |
| `DATABASE_URL`                | Connection to Docker PostgreSQL for local/test runtime.    | Yes    |
| `MEDIA_ROOT`                  | Private media/import storage root.                         | No     |
| `RELEASE_SHA`                 | Immutable release identity.                                | No     |
| `SESSION_COOKIE_NAME`         | Opaque session cookie name.                                | No     |
| `SESSION_HASH_SECRET`         | HMAC key for opaque session tokens.                        | Yes    |
| `SESSION_CSRF_SECRET`         | HMAC key for session-bound CSRF tokens.                    | Yes    |
| `AUTH_THROTTLE_SECRET`        | HMAC key for account/IP throttle identifiers.              | Yes    |
| `CURSOR_SIGNING_SECRET`       | HMAC key for opaque pagination cursors.                    | Yes    |
| `SESSION_IDLE_HOURS`          | Sliding idle expiry.                                       | No     |
| `SESSION_ABSOLUTE_DAYS`       | Absolute session expiry.                                   | No     |
| `VERTEX_API_KEY`              | Server-only Vertex AI express-mode API key.                | Yes    |
| `VERTEX_MODEL`                | Versioned Gemini model identifier.                         | No     |
| `VERTEX_LOCATION`             | Audited provider location metadata; default is `global`.   | No     |
| `VERTEX_CONFIDENCE_THRESHOLD` | AI-to-manual-fallback boundary.                            | No     |
| `VERTEX_TIMEOUT_MS`           | Timeout for each provider attempt.                         | No     |
| `VAPID_SUBJECT`               | Web Push operator contact subject.                         | No     |
| `VAPID_PUBLIC_KEY`            | Environment-specific public Web Push key.                  | No     |
| `VAPID_PRIVATE_KEY`           | Environment-specific private Web Push key.                 | Yes    |
| `PUSH_ENDPOINT_HOSTS`         | Exact allowlist of accepted push service hosts.            | No     |
| `METRICS_TOKEN`               | Bearer secret protecting `/metrics`.                       | Yes    |
| `OUTBOX_ENABLED`              | Enables in-process outbox delivery.                        | No     |
| `CARE_ADMIN_USERNAME`         | Bootstrap CLI Admin username.                              | Yes    |
| `CARE_ADMIN_PASSWORD`         | Bootstrap CLI initial password.                            | Yes    |

The initial Admin is created idempotently with `CARE_ADMIN_USERNAME`, `CARE_ADMIN_PASSWORD`, and `pnpm bootstrap:admin`. Generate each environment's Web Push credentials with either `pnpm vapid:generate -- --stdout` for a controlled operator terminal or `pnpm vapid:generate -- --output /secure/operator/path`; the CLI refuses to overwrite a file. Place the values directly in the environment secret store.

## API behavior

- Base path: `/api/v1`.
- Authentication: opaque `HttpOnly`, `SameSite=Lax` cookie.
- Mutations: session-bound `X-CSRF-Token` and `Idempotency-Key`; Voice mutations also accept `expectedVersion`.
- Lists: server pagination with signed opaque cursor values.
- Errors: `{ code, message, errors, correlationId, meta? }`.
- Private responder/Admin responses omit all reporter identity fields.
- Media is available only from the authenticated `/api/v1/media/:id` endpoint.

The canonical contract is [OpenAPI](../apps/api/openapi.json), and the generated frontend client lives in `packages/contracts`.

## Import semantics

Employee CSV is an upsert and never changes existing passwords or deactivates omitted employees. Manager CSV is the complete desired active snapshot; confirmation rejects omissions that would strand active Voices or active Section Head relations. It must define one Safety route per area, one Facility route per area, and one regular route per active employee department. Union JSON permits exactly one active shared Union account. Every import is previewed, checksum-bound, confirmed atomically, audited, and removed from temporary storage after finalization.

For local development, preview and confirm the generated files in this order: `local-data/employees.csv`, `local-data/managers.csv`, then `local-data/union.json`. Workforce usernames and initial passwords both use `no_reg`; the Union username and initial password are both `care-union`. These imported accounts must change their password on first login.

Run `pnpm maintenance:reconcile` for a non-mutating storage/database reconciliation report. Use `pnpm maintenance:reconcile -- --execute` only from an approved maintenance window to expire stale imports/drafts and remove detectable orphan files.

## Error catalog

| Code                      | Meaning                                                  |
| ------------------------- | -------------------------------------------------------- |
| `VALIDATION_ERROR`        | One or more request fields failed validation.            |
| `UNAUTHENTICATED`         | Session or CSRF validation failed.                       |
| `NOT_FOUND`               | Resource does not exist or is outside caller scope.      |
| `VERSION_CONFLICT`        | `expectedVersion` is stale.                              |
| `IDEMPOTENCY_CONFLICT`    | A key was reused with a different payload.               |
| `INVALID_TRANSITION`      | Lifecycle action is not allowed from the current state.  |
| `ROUTE_UNAVAILABLE`       | No active deterministic route exists.                    |
| `ROUTE_AMBIGUOUS`         | More than one route matched.                             |
| `CLASSIFICATION_REQUIRED` | Draft needs current AI/manual classification.            |
| `MEDIA_INVALID`           | File type, size, signature, or decoded image is invalid. |

## Operational endpoints

`/health` proves liveness. `/ready` checks PostgreSQL, migrations/configuration, and media storage while reporting optional AI/push degradation safely. `/release.json` exposes only release identity. `/metrics` requires the dedicated metrics bearer token.
