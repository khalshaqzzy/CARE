# CARE Backend Guide

## Local runtime

Node.js runs on the host, while PostgreSQL and `psql` remain inside Docker. A host PostgreSQL installation is neither required nor supported.

```text
pnpm install --frozen-lockfile
pnpm setup:local
# OPENAI_BASE_URL, OPENAI_MODEL, and OPENAI_API_KEY are optional for local/test runtime.
pnpm db:up
pnpm db:wait
pnpm db:verify
pnpm db:migrate
pnpm dev:api
```

Stop the database with `pnpm db:down`. Tests use the disposable `care_test` database through `pnpm db:test:reset` and `pnpm db:test:migrate`.

## Security configuration

Run `pnpm setup:local` once to create an ignored root `.env` with generated secrets, an AES-256-GCM AI configuration key, and environment-specific VAPID keys. Provider base URL, model, and API key remain represented by the existing `OPENAI_*` names and are intentionally empty. The command refuses to overwrite existing setup files. It also creates an ignored synthetic `organization.xlsx`, Admin remediation data, and a mode-0600 `LOCAL_CREDENTIALS.txt`. Never commit API keys, encryption keys, VAPID private keys, session secrets, bootstrap passwords, or actual workforce imports.

| Variable                       | Purpose                                                         | Secret |
| ------------------------------ | --------------------------------------------------------------- | ------ |
| `NODE_ENV`                     | Runtime policy: development, test, staging, or production.      | No     |
| `PORT`                         | Host API listen port.                                           | No     |
| `DATABASE_URL`                 | Connection to Docker PostgreSQL for local/test runtime.         | Yes    |
| `MEDIA_ROOT`                   | Private media/import storage root.                              | No     |
| `RELEASE_SHA`                  | Immutable release identity.                                     | No     |
| `SESSION_COOKIE_NAME`          | Opaque session cookie name.                                     | No     |
| `SESSION_HASH_SECRET`          | HMAC key for opaque session tokens.                             | Yes    |
| `SESSION_CSRF_SECRET`          | HMAC key for session-bound CSRF tokens.                         | Yes    |
| `AUTH_THROTTLE_SECRET`         | HMAC key for account/IP throttle identifiers.                   | Yes    |
| `CURSOR_SIGNING_SECRET`        | HMAC key for opaque pagination cursors.                         | Yes    |
| `SESSION_IDLE_HOURS`           | Sliding idle expiry.                                            | No     |
| `SESSION_ABSOLUTE_DAYS`        | Absolute session expiry.                                        | No     |
| `OPENAI_API_KEY`               | Server-only DeepSeek API key.                                   | Yes    |
| `OPENAI_CONFIG_ENCRYPTION_KEY` | 32-byte base64url key for Admin AI override encryption.         | Yes    |
| `OPENAI_MODEL`                 | DeepSeek model; target is `deepseek-v4-flash`.                  | No     |
| `OPENAI_BASE_URL`              | DeepSeek API root; target is `https://api.deepseek.com`.        | No     |
| `OPENAI_REASONING_EFFORT`      | Blank = provider default; use `none` for DeepSeek non-thinking. | No     |
| `OPENAI_CONFIDENCE_THRESHOLD`  | AI-to-manual-fallback boundary.                                 | No     |
| `OPENAI_TIMEOUT_MS`            | Timeout for each provider attempt.                              | No     |
| `VAPID_SUBJECT`                | Web Push operator contact subject.                              | No     |
| `VAPID_PUBLIC_KEY`             | Environment-specific public Web Push key.                       | No     |
| `VAPID_PRIVATE_KEY`            | Environment-specific private Web Push key.                      | Yes    |
| `PUSH_ENDPOINT_HOSTS`          | Exact allowlist of accepted push service hosts.                 | No     |
| `METRICS_TOKEN`                | Bearer secret protecting `/metrics`.                            | Yes    |
| `OUTBOX_ENABLED`               | Enables in-process outbox delivery.                             | No     |
| `CARE_ADMIN_USERNAME`          | Bootstrap CLI Admin username.                                   | Yes    |
| `CARE_ADMIN_PASSWORD`          | Bootstrap CLI initial password.                                 | Yes    |

The initial Admin is created idempotently with `CARE_ADMIN_USERNAME`, `CARE_ADMIN_PASSWORD`, and `pnpm bootstrap:admin`. Generate each environment's Web Push credentials with either `pnpm vapid:generate -- --stdout` for a controlled operator terminal or `pnpm vapid:generate -- --output /secure/operator/path`; the CLI refuses to overwrite a file. Place the values directly in the environment secret store.

AI tests never require a real API key. `pnpm test:openai:smoke` starts a local mock `/chat/completions` server. Runtime values come from a single encrypted Admin override when present, otherwise environment; timeout remains env-only. Blank reasoning sends no DeepSeek thinking fields and enables full Granite thinking. `none` sends DeepSeek `thinking.disabled`, while `high` sends `thinking.enabled` plus high effort. DeepSeek thinking rejects named `tool_choice`, so CARE omits that field only in enabled DeepSeek thinking mode while retaining the single-tool request and exact name/count/schema fail-closed validation. The independent Granite operator stack is documented in `inference/README.md` and is not part of CARE deployment Compose.

## API behavior

- Base path: `/api/v1`.
- Authentication: opaque `HttpOnly`, `SameSite=Lax` cookie.
- Mutations: session-bound `X-CSRF-Token` and `Idempotency-Key`; Voice mutations also accept `expectedVersion`.
- Lists: server pagination with signed opaque cursor values.
- Errors: `{ code, message, errors, correlationId, meta? }`.
- Anonymous Private DTOs omit identity for Union; CARE Admin receives full immutable reporter snapshots read-only and every access is audited.
- Media is available only from the authenticated `/api/v1/media/:id` endpoint.

The canonical contract is [OpenAPI](../apps/api/openapi.json), and the generated frontend client lives in `packages/contracts`.

## Import semantics

The organization upload is a full authoritative monthly snapshot and accepts `.xlsx` or UTF-8 `.csv`, up to 10 MB and 10,000 data rows. Both formats require the same seven exact headers. XLSX additionally requires sheet `MFG + QD` and plain-string cells; CSV supports standard quoted fields and UTF-8 BOM while preserving every value, including leading-zero `Noreg`, as text. Confirm returns `202`, the worker re-parses the checksum-bound file in its original format, and the final organization/account/session/route/issue mutation commits atomically. Missing employees are deactivated or retained as legacy handlers only for active Voice objects. Department Heads create automatic department routes; Admin remediates named units without a head, the one global special PIC, and three independent Union slots.

For local development, preview and confirm `local-data/organization.xlsx`, then apply the synthetic global PIC and three Union slots described by `local-data/admin-remediation.json`. Workforce and Union temporary passwords equal their username and require change on first login.

Run `pnpm maintenance:reconcile` for a non-mutating storage/database reconciliation report. Use `pnpm maintenance:reconcile -- --execute` only from an approved maintenance window to expire stale imports/drafts and remove detectable orphan files.

## Error catalog

| Code                               | Meaning                                                   |
| ---------------------------------- | --------------------------------------------------------- |
| `VALIDATION_ERROR`                 | One or more request fields failed validation.             |
| `UNAUTHENTICATED`                  | Session or CSRF validation failed.                        |
| `NOT_FOUND`                        | Resource does not exist or is outside caller scope.       |
| `VERSION_CONFLICT`                 | `expectedVersion` is stale.                               |
| `IDEMPOTENCY_CONFLICT`             | A key was reused with a different payload.                |
| `INVALID_TRANSITION`               | Lifecycle action is not allowed from the current state.   |
| `GENERAL_ROUTE_UNAVAILABLE`        | No valid department/default/global route exists.          |
| `DRAFT_ORGANIZATION_STALE`         | The organization snapshot changed after draft creation.   |
| `LOCATION_ACKNOWLEDGMENT_REQUIRED` | Current incomplete-location warning needs acknowledgment. |
| `CLASSIFICATION_REQUIRED`          | Draft needs current AI/manual classification.             |
| `MEDIA_INVALID`                    | File type, size, signature, or decoded image is invalid.  |

## Operational endpoints

`/health` proves liveness. `/ready` checks PostgreSQL, migrations/configuration, and media storage while reporting optional AI/push degradation safely. `/release.json` exposes only release identity. `/metrics` requires the dedicated metrics bearer token.
