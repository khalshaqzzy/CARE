# ADR-0028: Local Granite Inference and Encrypted Admin Runtime Configuration

- Status: Accepted
- Date: 1 September 2026
- Related: ADR-0015 (advisory provider smoke), ADR-0017 (DeepSeek Chat Completions), PRD §13 (AI), §28 (operability), §31 (deployment)

## Context

CARE classification and location review use an OpenAI-compatible Chat Completions contract with exactly one named function and fail-closed output validation; named `tool_choice` is forced whenever the provider supports it. The deployment previously depended on a single environment-configured DeepSeek provider and an experimental local LFM2.5 service. Provider changes required a process restart, an empty reasoning effort was collapsed to `none`, and no supported operator surface existed for switching provider settings. The local experiment also published SGLang directly and was not connected to the intended Cloudflare hostname.

The dedicated `dx-2` host has an RTX 4080 SUPER with 16 GB VRAM and an existing named Cloudflare Tunnel. A compact local model is useful for low-latency operation and controlled fallback, but it must remain operationally separate from immutable CARE releases. Provider credentials must remain server-only even when CARE Admin can change configuration.

## Decision

An independent `inference/` Docker Compose stack serves `ibm-granite/granite-4.2-3b` through SGLang 0.5.18 or newer. SGLang is internal to the Compose network. A Caddy gateway alone publishes `127.0.0.1:30000`, requires one exact Bearer credential for `/v1/*`, and forwards authorized requests without application rate limiting or request-body/access-header logging. The existing Cloudflare Tunnel routes `inference.qd-tmmin.site` to this loopback service. Image/model updates remain manual over SSH, while a host-level systemd unit runs the installed Compose stack after every reboot; Docker container restart policies and a `Restart=always` cloudflared drop-in provide crash recovery. The stack remains excluded from CARE deployment Compose and release workflows.

Granite runs BF16, tensor parallelism one, static memory fraction 0.8, a 32,768-token context window, automatic reasoning/tool parsers, default CUDA graph and Radix cache behavior, and no quantization. CARE requests cap generation at 4,096 new tokens and use `temperature=1.0` with `top_p=0.95`. Provider-default Granite requests explicitly apply `enable_thinking=true` and `low_effort=false` as defense in depth. Classification/routing and location review are independent provider calls and run concurrently in the member flow and live-provider smoke.

A singleton `AiProviderConfiguration` record stores Admin overrides for base URL, model, reasoning effort, confidence threshold, optimistic version, actor, timestamp, and AES-256-GCM API-key ciphertext/IV/tag. The encryption key is supplied only through `OPENAI_CONFIG_ENCRYPTION_KEY`, is distinct from other runtime secrets, and is never stored in the database. Environment `OPENAI_*` values remain bootstrap/fallback only when no override exists. `OPENAI_TIMEOUT_MS` remains environment-only, with a 60,000 ms default and ceiling per provider attempt. The effective record is loaded for every provider invocation, so changes apply without restart.

The Admin API exposes GET, PUT, DELETE, and a live test under `/api/v1/admin/ai-configuration`. Mutations require CARE Admin authorization, session CSRF, idempotency, and optimistic concurrency. Audit events record only changed field names and source transitions. API keys, ciphertext, IV, tags, reasoning content, and provider response bodies are excluded from responses, audit summaries, readiness, metrics, OpenAPI examples, and browser bundles. An omitted or empty key preserves the current effective key; the first override requires one. Decryption or authentication-tag failure is fail-closed and never falls back silently to another credential.

Reasoning is provider-aware:

- blank sends no DeepSeek reasoning fields and means provider-native default;
- DeepSeek `none` sends `thinking.disabled`; enabled levels map to low, high, or max effort. Because DeepSeek thinking currently rejects a named `tool_choice`, CARE omits that field only for enabled DeepSeek thinking, exposes one tool, and still rejects every response that is not exactly one call to that tool;
- Granite `none` disables thinking; minimal/low enables low effort; all higher levels enable full thinking;
- Granite-only sampling and chat-template fields are never sent to DeepSeek.

The existing exact function name/count, JSON parsing, strict Zod validation, bounded transient retry, deterministic server routing, Manual Fallback, and degraded location behavior remain unchanged. Draft content hashes use the effective model so provider changes invalidate stale AI snapshots deterministically.

## Rationale

- Separating the GPU service prevents model builds, downloads, and tunnel availability from changing CARE release determinism.
- A loopback-only authenticated gateway keeps SGLang off the host network while allowing the existing tunnel daemon to reach it.
- AES-GCM provides confidentiality and tamper detection for a credential that must persist across restarts.
- A keyed HMAC, rather than an unkeyed fast hash, fingerprints a submitted key only for idempotency comparison; ciphertext remains the sole persisted provider credential.
- Per-invocation resolution avoids process restarts and makes the configured source explicit.
- Preserving a blank reasoning value is necessary because Granite defaults to thinking while DeepSeek non-thinking requires an explicit disable signal.
- Provider-specific request construction avoids undocumented sampling interactions on DeepSeek and follows its documented thinking/tool-call restriction without weakening local response validation.

## Alternatives considered

- Add inference to CARE deployment Compose — rejected because GPU lifecycle and model downloads are host-specific and must not gate application releases.
- Publish SGLang directly with its API-key option — rejected because the gateway provides an explicit single authentication boundary and loopback exposure without changing the model process.
- Store the provider key in plaintext or return a masked value — rejected because both increase disclosure risk; the browser only needs a configured boolean.
- Cache Admin configuration in process memory — rejected because it would delay activation and create multi-instance inconsistency.
- Treat blank reasoning as `none` — rejected because it suppresses Granite's model-native thinking behavior.
- Fall back to the environment key after a decryption failure — rejected because it hides corruption or key rotation mistakes and could send data to an unintended provider.

## Consequences

- Operators must provision and retain a stable `OPENAI_CONFIG_ENCRYPTION_KEY`; losing it makes an existing override unreadable until the override is reset or the key is restored.
- Database migrations add one singleton configuration table and a relation to the updating Admin account.
- `dx-2` requires manual lifecycle management, GPU capacity monitoring, and tunnel route rollback independent of CARE deploy.
- Full 32K context and 8K output increase worst-case latency and KV-cache pressure; the bounded CARE prompts normally remain much smaller.
- A transient failure can consume two 60-second attempt budgets because the existing single retry is retained; request latency and fallback rates must therefore remain observable.
- The NVIDIA/SGLang image runs as its image-defined root user because CUDA tooling and the persisted Hugging Face cache use `/root`; host exposure remains limited to the dedicated cache and no SGLang port is published.
- The gateway compiles Caddy with an explicitly patched Go dependency set and runs only that static binary in the pinned non-root distroless runtime; this avoids inheriting stale Alpine packages or an unpatched upstream Caddy binary.

## Validation

- Unit coverage verifies blank/none/high reasoning mappings, Granite-only request fields, AES-GCM round-trip, tamper detection, and missing-key failure.
- PostgreSQL integration verifies encrypted persistence, key preservation on keyless updates, optimistic conflicts, reset to environment, actor audit, and absence of secrets from safe responses/audit.
- OpenAPI generation proves the API key is write-only and absent from response schemas.
- Operator validation covers Compose/Caddy syntax, loopback-only publication, unauthorized 401, authenticated model listing, forced classification/location calls, parsed reasoning presence without content logging, latency, GPU memory, and public TLS.
- Three clean environment scenarios cover Granite with blank effort, DeepSeek with `none`, and DeepSeek with `high`; the original local environment is restored after validation.
- Runtime configuration unit coverage locks the 60,000 ms default and rejects values above the ceiling; deployment and local environment templates use the same default.
- The staging GitHub environment uses the tunnel base URL, Granite model, matching write-only Bearer credential, blank provider-default reasoning, and an independent 32-byte Base64URL encryption key; secret values remain outside Git and workflow logs.
- Trivy 0.70.0 image scans report zero High/Critical findings for the patched production Caddy and inference gateway binaries/runtimes, including remediation of `CVE-2026-56854` through `golang.org/x/crypto v0.55.0`; no ignore entry is used.

## Risks

- Cloudflare account or tunnel changes can make the hostname unreachable while the local service remains healthy.
- A 32K request can exceed the practical latency target or exhaust memory under concurrency; operational metrics and bounded request sizes remain necessary.
- Provider chat-template behavior may change with a future SGLang/model release; pinned versions and live forced-tool smoke must be rerun on update.

## Follow-up work

- Keep the independent image/model out of CARE CI builds while retaining syntax, Hadolint, and security scanning for `inference/` source.
- Record cold start, warm classification/location latency, GPU memory, and tunnel validation in the session handoff and release evidence.
- Rotate the inference Bearer key and AI configuration encryption key only through an approved secret migration procedure; do not rotate the encryption key before re-encrypting or clearing the stored override.
