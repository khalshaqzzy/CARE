# ADR-0013: QA Report 1 Remediation Without Contract or Password-Hash Changes

- Status: Accepted
- Date: 28 August 2026

## Context

QA Report 1 identified a failed 7,018-row authoritative organization import, broken Admin sidebar navigation, stale authenticated UI after logout, stale import history after asynchronous completion, one transitive Moderate `uuid` advisory through ExcelJS, and ignored local secrets inside the workspace. A direct reproduction of the workbook showed that the import failure was Prisma `P2028`, not password hashing: 7,018 rows generated 21,201 query events because organization units were upserted once per member inside a transaction capped at 120 seconds.

The existing API shape, organization lifecycle, database schema, transaction atomicity, Argon2id configuration, and forced-password-change behavior are established compatibility contracts. The remediation therefore needed to remove query amplification without increasing the timeout or weakening those contracts.

## Decision

Organization import derives the unique composite unit set before entering the transaction. The transaction creates missing units with `createMany(skipDuplicates)`, resolves all unit IDs with one `findMany`, and then retains chunked bulk creation for employees, accounts, and memberships. Department Head routes and derived remediation issues are created in bulk. Monthly omission handling locks the affected accounts, retrieves active Voice relationships once, deduplicates legacy-access pairs, and uses bulk account, employee, legacy-access, and session-revocation mutations. The advisory lock, single atomic transaction, raw-file terminal cleanup, Argon2id parameters and concurrency, and 120-second timeout remain unchanged.

Import failures emit only operational metadata: batch ID, safe failure code, Prisma code when present, elapsed time, and retry outcome. Prisma `P2028` maps to nullable API value `PROCESSING_TIMEOUT`; no workbook content, name, registration number, query, password hash, or stack is logged.

Both desktop applications use the shared `Sidebar.onNavigate(id)` contract with an application-owned ID-to-route map. Authentication invalidation cancels an in-flight session query, sets the active session cache to `null`, removes session-bound query and persistent state, resets CSRF state, and then broadcasts the transition. A cross-tab logout performs local invalidation without refetching the session that was just revoked. Import polling invalidates history once per terminal batch version; a confirmed import also invalidates snapshot, overview, account, and remediation data. Failed history rows use the error tone and may show only their safe failure code.

Argon2id is not changed. The Moderate `exceljs -> uuid` risk is deferred without an override or fork: ExcelJS 4.4.0 invokes UUID v4 without an output buffer, while GHSA-w5hq-g745-h8pq concerns v3/v5/v6 calls using an output buffer. The dependency must be reviewed again before Phase 14 or when upstream ExcelJS publishes a compatible patched dependency.

Ignored secrets are relocated outside the repository to `$HOME/.config/care/secrets/`, with directories mode `0700` and secret files mode `0600`. Copy equality is verified before the workspace copies are moved to Trash. Gitleaks remains strict; no repository allowlist is added for these files.

## Rationale

The query count, rather than Argon2id hashing, was the observed transaction-expiry mechanism. Resolving 58 units once changes unit derivation from row-proportional database work to a bounded pair of bulk operations and leaves password security intact. Bulk omission handling also prevents future monthly imports from reintroducing row-proportional query growth. Keeping the database mutation atomic ensures injected failures cannot publish a partial snapshot or partially deactivate accounts.

Immediate cache nulling is the boundary that guarantees protected shells unmount even when logout transport fails or a stale session request completes later. Using the shared navigation callback aligns consumers with the existing component contract and avoids expanding the UI API.

The UUID advisory is not exploitable through ExcelJS's current invocation path, but it remains an upstream supply-chain risk and is therefore deferred rather than represented as resolved. Moving local secrets, rather than teaching Gitleaks to ignore them, preserves directory-scan coverage.

## Alternatives Considered

- Increase the transaction timeout: rejected because it hides row-proportional queries and produces a less predictable failure boundary.
- Reduce Argon2id cost or replace the algorithm: rejected because reproduction identified database query amplification and password hashing is a deliberate security contract.
- Upsert organization units per row with higher concurrency: rejected because it increases lock/query pressure and does not bound transaction work.
- Add a new Sidebar item callback API: rejected because `onNavigate` is already the supported contract.
- Refetch session after every auth broadcast: rejected for logout because it can race with revocation and revive stale protected UI.
- Add a pnpm override/fork for UUID or a Gitleaks allowlist: rejected because neither is necessary to remediate the observed runtime path or local secret placement.

## Consequences

No migration, OpenAPI regeneration, request/response contract, generated client, or import lifecycle change is required. `failureCode` remains a nullable string and may contain the additional safe value `PROCESSING_TIMEOUT`. Newly imported accounts keep the existing Argon2id hash and forced-password-change behavior.

Import code is more set-oriented and depends on the existing unique organization-unit constraint and `createMany(skipDuplicates)` semantics. Terminal cache invalidation is explicitly coordinated by batch ID, version, and status so polling cannot trigger repeated dependent refreshes. The original QA report remains immutable evidence; the retest is recorded separately in QA Report 2.

## Validation

Regression coverage includes synthetic 7,018-row/58-unit/188-Department-14/12-missing-head input, a 10,000-account monthly profile, legacy-handler preservation, session revocation, and injected database failure proving rollback. The ignored authoritative workbook completes with 7,018 memberships, one active snapshot, the expected remediation counts, 217 query events, no `P2028`, and no retained raw upload.

Frontend unit coverage exercises normal and failed logout, `401`, cross-tab logout, and an in-flight session race. Playwright clicks every Admin sidebar destination, a desktop Workforce destination, and polls both `PROCESSING -> FAILED` and `PROCESSING -> CONFIRMED`. Repository quality, browser, PostgreSQL integration/security/performance/full-stack, deployment, audit, and secret-scanning gates are recorded in the session handoff and QA Report 2.

## Risks and Follow-up

The UUID advisory remains a documented Moderate deferred risk and must be revisited before Phase 14 or an upstream ExcelJS dependency release. Phase 13 remains `in_progress`; hosted exact-SHA acceptance and rollback rehearsal are still required. The local Safari database contains a previously rotated Admin password that is not present in the retained bootstrap secret, so authenticated Safari retest requires the operator's current credential or an explicitly authorized local credential reset; this does not weaken the automated and service-level remediation evidence.
