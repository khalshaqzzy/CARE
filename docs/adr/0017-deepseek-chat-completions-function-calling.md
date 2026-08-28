# ADR-0017: DeepSeek Chat Completions with Function-Call Results

- Status: Accepted
- Date: 28 August 2026
- Related: ADR-0004 (organization, routing, AI, privacy, and frontend architecture), ADR-0015 (advisory live-provider smoke)
- Supersedes: the Responses API transport and structured-output portions of ADR-0004; all deterministic routing, privacy, fallback, and snapshot decisions remain in force

## Context

CARE classification and location review were implemented through the OpenAI-compatible Responses API using `responses.create`, `/responses`, `store:false`, and `text.format` JSON Schema Structured Outputs. The production target is now the official DeepSeek API and `deepseek-v4-flash`. DeepSeek supports the OpenAI Chat Completions interface, function calling, and explicit thinking-mode control. The existing CARE response domains, confidence fallback, prompt-bound content hashes, and server-only `OPENAI_*` environment contract must remain compatible.

DeepSeek standard function calling can use schemas containing CARE's nullable category and warning fields. DeepSeek strict function mode would provide stronger provider-side conformance, but it remains a Beta surface at `/beta` and supports a narrower JSON Schema subset. CARE already treats every provider result as untrusted and performs strict Zod validation before persistence or routing decisions.

## Decision

The backend uses the official `openai` JavaScript SDK with `client.chat.completions.create` against the configured `/chat/completions` surface. The target runtime values are `OPENAI_MODEL=deepseek-v4-flash`, `OPENAI_BASE_URL=https://api.deepseek.com`, and `OPENAI_REASONING_EFFORT=none`. Environment variable names, secret-store boundaries, health response naming, timeout, confidence threshold, and the OpenAI SDK dependency remain unchanged.

Each operation sends two messages: a versioned system instruction and a user message containing serialized JSON explicitly labeled as untrusted report data. Classification forces `submit_care_classification`; location review forces `submit_care_location_review`. Each request supplies exactly one standard function tool and a named `tool_choice`. `strict:true` and the DeepSeek `/beta` endpoint are not used.

The adapter accepts only `finish_reason=tool_calls` with exactly one function call whose name matches the requested operation. Function arguments must parse as JSON and then pass the existing strict Zod domain validation. Missing, duplicate, unexpected, malformed, truncated, filtered, or resource-interrupted output enters a sanitized Manual Fallback/degraded path and is not retried. A single retry remains limited to timeout, connection, rate-limit, and server failures.

Reasoning configuration remains compatible but defaults to `none`:

- `none` sends `thinking: { type: "disabled" }` and omits `reasoning_effort`;
- `minimal` and `low` enable thinking with `low` effort;
- `medium`, `high`, and `xhigh` enable thinking with `high` effort;
- `max` enables thinking with `max` effort.

Prompt versions advance to `care-classification-v1.2` and `care-location-v1.2`. Existing content hashes therefore invalidate stale draft AI snapshots automatically. Prompts define category and severity boundaries, confidence calibration, location actionability, identity/routing exclusions, and prompt-injection resistance. AI still never chooses an account, Manager, handler, route owner, or PIC.

## Rationale

Chat Completions is the requested DeepSeek integration surface and is supported by the installed OpenAI SDK without a dependency upgrade. Forced named tools make the intended output channel explicit, while local JSON, tool-name/count, and Zod checks preserve the trust boundary independently of provider behavior. Keeping standard function mode avoids coupling the production contract to a Beta endpoint and avoids translating CARE's nullable domain solely to satisfy the strict-mode schema subset.

Retaining `OPENAI_*` avoids a secret migration and deployment compatibility break. Defaulting to `none` ensures the target operates without reasoning, while the explicit mapping preserves previously supported configuration values for controlled evaluation.

## Alternatives Considered

### Retain Responses API

Rejected because the required integration is Chat Completions and function calling.

### Use strict function mode at `/beta`

Rejected for the active contract because it is Beta and its schema subset does not directly represent every existing CARE constraint. It may be reconsidered after the endpoint and schema support are approved.

### Use JSON Output instead of function calling

Rejected because function calling is the required output mechanism and provides an explicit operation name in addition to JSON arguments.

### Rename all variables to `DEEPSEEK_*`

Rejected because it would require a coordinated secret migration without changing the security boundary or runtime behavior.

## Consequences

- Provider request and mock contracts move from `/responses` to `/chat/completions`.
- `store:false`, `text.format`, Responses conversation fields, and Responses output accessors are removed; one forced function tool is now expected.
- Standard function calling does not guarantee valid arguments, so local validation and Manual Fallback remain mandatory.
- Prompt-version changes invalidate earlier draft AI snapshots but do not rewrite submitted Voice history.
- The live provider smoke remains advisory during deployment under ADR-0015, while a passing live smoke is still required before release-readiness claims.
- No HTTP API, OpenAPI schema, database migration, routing, authorization, or frontend contract changes are introduced.

## Validation

- Unit tests cover all reasoning mappings, prompt-version/content contracts, secret redaction, missing configuration, low confidence, and Private `category=null`.
- The local mock verifies `/chat/completions`, two messages, non-thinking mode, one standard function, named `tool_choice`, classification/location schemas, 429 retry, and rejection of incomplete, prose-only, missing, duplicate, wrong-name, malformed, or domain-invalid tool output.
- A live smoke calls classification and location with non-sensitive Indonesian fixtures and logs only redacted configuration/outcomes.
- Full repository CI, database, browser, deployment, container, and security parity is required before commit.

## Follow-up Work

- Rotate the temporary validation API key after the live smoke.
- Complete provider privacy, residency, retention, quota, and commercial approval before production readiness.
- Re-evaluate strict function mode only after its Beta status and schema compatibility meet CARE governance requirements.
