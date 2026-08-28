# ADR 0004: CARE v1.1 Organization, Routing, AI, Privacy, and Frontend Architecture

- Status: Accepted
- Date: 2026-08-25
- Decision owners: CARE/TMMIN product and engineering
- Supersedes: identity, provisioning, routing, Union, AI, Private visibility, capacity, and single-frontend decisions in ADR 0001 and ADR 0003 where they conflict with this record
- AI transport note: the Responses API portions of this record are superseded by ADR-0017; routing, privacy, fallback, and snapshot decisions remain active

## Context

The original CARE architecture assumed separate Employee and Manager CSV imports, one Union JSON account, exclusive role-oriented authorization, Safety and Facility Managers per area, Manager-maintained Section Heads, Gemini on Vertex AI, Private anonymity toward both Union and CARE Admin, a 2,000-account baseline, and one role-aware frontend.

The authoritative organization source is instead a monthly Excel workbook. The August workbook contains 7,018 employees, including 38 Department Heads, 250 Section Heads, 4 Division Heads, 8 Deputy or Acting Division Heads, and 1 Director. Twelve named departments have no Department Head, 188 rows use `Department = 14`, and department names such as Maintenance and Quality Control recur across divisions. Department name alone is therefore not a safe routing identity.

The product also requires one organization-wide owner for Safety, Environment, and Facility; individual Union operators; optional Private reporter identification; leadership dashboards with aggregate and detail scopes that differ; advisory AI review of location completeness; and an independently deployable administration surface.

The delivered backend stores historical Voice ownership, assignments, actors, events, closures, ratings, and notifications under the earlier model. The new model must not reinterpret or overwrite that history.

## Decision

### Authoritative organization and capabilities

One authoritative `.xlsx` or UTF-8 `.csv` upload replaces separate Employee/Manager CSV and Union JSON workforce imports. Both formats require the seven exact source headers; XLSX additionally requires sheet `MFG + QD`. CSV uses standard quoted-field parsing and preserves every value as text. Both formats preserve no.reg values including leading zeroes and each confirmed monthly upload is the full active workforce snapshot.

Organization units are identified by the composite `Directorat + Division + Department`. Raw structural position is retained. Account kind, structural position, capability, and route assignment are modeled separately so a workforce account always retains Member capability while also acting as a structural reader, default PIC, global PIC, or assigned handler.

Department Head and Manager are interchangeable product terms. An active Department Head automatically manages its department. For a named department without a Department Head, CARE Admin may designate any active employee as default PIC for that organization unit. The designation grants Manager capability only within that unit; delegation candidates remain active Section Heads of the target department.

Section Heads are derived exclusively from the current workbook snapshot. Manual promote, transfer, and remove operations are removed.

Confirmed snapshots are effective-dated. Missing employees are deactivated and their sessions revoked. A former PIC with an active Voice receives bounded legacy-handler access until that Voice is completed but receives no new routing. Changes to workforce data or mappings never rewrite historical reporter organization, route owner, assignment, handler, actor, closure, rating, notification, or PIC snapshots.

### Routing and Union accounts

`ENVIRONMENT` is added as a General category. Safety, Environment, and Facility across all areas route to exactly one global PIC selected by CARE Admin from active Department Heads. That PIC may delegate only to active Section Heads in the PIC's own department.

Work Difficulty routes to the active Department Head or default PIC for the reporter's composite organization unit. `Department = 14` has no valid General route; affected accounts may still create Private Voice and receive an explicit remediation message when attempting General Voice.

Private Voice bypasses category routing and always routes first to Union Head. Exactly one Union Head and two Union Officer accounts are administered separately from the workforce workbook. Union Head may assign or reassign a Private Voice to either Officer before `IN_PROGRESS`; an Officer sees and handles only assigned Private Voices. All three Union accounts have individual credentials and audit attribution.

### Private reporter identity

Private Voice requires an immutable `showReporterIdentity` consent snapshot. When consent is false, Union contracts omit identity fields entirely. When true, Union may receive the reporter's name, no.reg, division, and department snapshot. CARE Admin always has read-only access to Private content and the reporter's full profile, with access auditing. Reporter ownership remains internal so the reporter can view, converse, receive notifications, rate, and reopen.

### AI and location completeness

Gemini, Vertex AI, `@google/genai`, location-specific provider configuration, and `VERTEX_*` runtime contracts are removed. The backend uses the official JavaScript SDK with `responses.create` against `/responses`, Structured Outputs through JSON Schema, `store: false`, no tools, and no conversation state.

Runtime configuration uses `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY`, `OPENAI_REASONING_EFFORT`, `OPENAI_TIMEOUT_MS`, and `OPENAI_CONFIDENCE_THRESHOLD`. Base URL, model, and API key have no production defaults. Reasoning effort accepts only the SDK-supported `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`; an unset or empty value resolves to `medium` before every classification and location request.

Classification returns category, severity, confidence, and an allowlisted rationale code. Category is nullable for Private Voice, which uses AI only for severity. No fixed category priority is imposed; ambiguous, low-confidence, refused, incomplete, invalid, timed-out, or unavailable results use a type-specific Manual Fallback.

Location review is a separate structured contract returning `COMPLETE`, `INCOMPLETE`, or `UNKNOWN`, a warning, and up to three suggested questions. It runs automatically after debounce or blur and is cached by content hash. Location changes invalidate the review. An incomplete result is advisory but requires confirmation tied to the current review snapshot before submit. Provider failure never blocks the form.

Requests minimize content, validate output schemas, pass the configured `reasoning.effort`, use bounded timeout/retry, sanitize errors, and never ask AI to choose a Manager or other account identifier.

### Authorization and dashboards

Aggregate overview authorization is separated from Voice list/detail and action authorization. Aggregate-only responses must not expose title, reporter, Voice ID, or other record-level information.

- Member sees and acts on owned Voices.
- Section Head sees and acts only on active assignments.
- Manager sees one-division General aggregates, department detail, and a separate operational inbox for explicitly routed global/default work.
- Division Head, Deputy Division Head, and Deputy Division Head Pjt. see all-General aggregates and own-division detail, read-only.
- Director sees all-General aggregates and details, read-only.
- Union sees all-General aggregates and details, read-only; Private access follows Head/all and Officer/assigned scopes.
- CARE Admin sees operational aggregates and all General and Private details, read-only for Voice handling, with full Private reporter identity.

Minimum graphs cover status, severity, category including Environment, time trend, and division/department breakdown within the actor's aggregate scope.

### Application topology

CARE uses two frontend applications with one backend and one generated OpenAPI client:

- a workforce PWA at `care.qd-tmmin.site`;
- a separate React Admin application at `admin-ped.qd-tmmin.site` for staging.

Each origin exposes a same-origin `/api/v1` proxy with host-scoped cookies and CSRF protection. The Admin application is not an offline or PWA surface. Production workforce and Admin domains remain externally provisioned dependencies.

## Rationale

An authoritative monthly snapshot prevents manually maintained roles and routes from drifting away from the workforce master. Composite organization identity prevents collisions caused by repeated department names. Capability-based authorization represents employees who simultaneously report Voices, read organizational dashboards, own routes, or handle assignments without inventing mutually exclusive roles.

A single global PIC matches operational ownership of cross-area Safety, Environment, and Facility issues. Default PIC remediation avoids silently routing departments that have no structural Head, while explicit rejection for `Department = 14` prevents an arbitrary fallback.

Individual Union accounts provide operator attribution and least-privilege assignment. Immutable identity consent makes the reporter's choice enforceable over time, while CARE Admin visibility supports investigation and support under explicit audit.

The Responses API provides a provider-configurable, schema-validated contract for both classification and location review. Keeping account routing deterministic preserves authorization and audit boundaries. Separate workforce and Admin applications isolate operational administration from the mobile/offline workforce experience and allow independent deployment controls.

## Alternatives Considered

### Retain separate CSV/JSON imports

Rejected because multiple authoritative files can disagree, cannot reliably derive structural changes, and increase monthly reconciliation work.

### Require XLSX as the only authoritative format

Rejected because the organization owner may publish the same tabular snapshot as CSV. Accepting one XLSX or one CSV through the same endpoint preserves a single authoritative snapshot and remediation flow without reintroducing separate Employee, Manager, or Union import contracts. The CSV parser is deliberately constrained to UTF-8, seven exact columns, bounded record size, standard quoting, and the same row validation used by XLSX.

### Use department name as the organization key

Rejected because names recur across divisions and would route some reports ambiguously.

### Require a Department Head for every named department

Rejected because the source workbook has valid named departments without one. An audited default PIC mapping provides explicit remediation without fabricating structural data.

### Fall back `Department = 14` to division leadership or the global PIC

Rejected because the workbook does not provide a valid department route and an implicit fallback would create unreviewed ownership.

### Keep one Manager per area and category

Rejected because Safety, Environment, and Facility have one organization-wide operational owner.

### Keep Manager-managed Section Heads

Rejected because Section Head is authoritative workforce data and must change with the monthly snapshot, not ad hoc UI actions.

### Keep one shared Union credential

Rejected because it prevents reliable operator attribution and cannot enforce assigned-only Officer access.

### Always hide or always reveal Private reporter identity to Union

Rejected because the product requires reporter choice. A nullable identity payload was also rejected because field omission provides a safer anonymous contract.

### Retain Vertex/Gemini

Rejected because model, base URL, and credentials must be supplied later through an OpenAI-compatible Responses contract and location review needs a second structured output.

### Use one frontend for workforce and administration

Rejected because Admin import/remediation and full-identity access have different deployment, cache, offline, and operational boundaries from the workforce PWA.

### Rewrite historical PIC and organization after each snapshot

Rejected because it would corrupt auditability and make past handling appear to have occurred under current organization data.

## Implementation Details

- Schema changes use expand/contract migrations from the current database, with deterministic backfills and reconciliation counts before legacy columns or constraints are removed.
- Effective-dated organization snapshots and mappings distinguish current routing eligibility from immutable Voice/event/assignment history.
- Import preview reports create/update/deactivate, structural and unit changes, route gaps, invalid global/default mappings, and Union-account gaps. Confirm is atomic; remediation resolutions are separately audited.
- Session responses expose account kind, raw structural position, capabilities, and safe overview/detail/action scopes.
- Import APIs provide XLSX/CSV preview, confirm, history, issues, and resolution audit. Legacy separate Employee/Manager/Union imports and Section Head mutation endpoints are removed after compatibility cutover.
- Drafts add Voice type and conditionally required `showReporterIdentity`. Submission carries the latest location-review snapshot acknowledgment.
- Separate aggregate endpoints return only aggregate dimensions. Scoped list/detail endpoints apply record-level policy independently.
- Tests and performance fixtures scale to 10,000 active accounts, 50 concurrent users, and 50,000 Voices.
- Both frontends consume the same generated client, but maintain independent entry points, build artifacts, service-worker policies, cookies, CSRF configuration, and host routing.

## Consequences

- The current backend requires a material schema, data, API, authorization, AI, and routing migration before frontend implementation can safely depend on it.
- Organization imports become operationally critical and require a named monthly data owner and remediation operator.
- Supporting two file encodings adds parser and validation surface. Format-specific parsing is therefore completed before a shared normalization path, and the asynchronous worker re-detects the persisted extension before checksum-bound parsing.
- Historical and current authorization must coexist while legacy handlers finish active Voices.
- Union credentials and actions become individually attributable; three-account completeness becomes a routing prerequisite.
- CARE Admin access to identified Private content becomes a high-sensitivity audited capability.
- Two frontend images and host configurations add deployment complexity but reduce privilege and offline-cache coupling.
- Automated AI validation uses a local mock `/responses` server and never depends on a real API key. Live staging/production validation still depends on externally supplied endpoint, model, credentials, governance approval, and quota.
- The previous absence of backup/DR/HA remains unchanged and must still be accepted before production.

## Validation Plan

- Validate exact XLSX sheet/header and CSV header/column shape, CSV quoting/BOM, leading-zero no.reg, duplicate records, composite department collisions, missing-head departments, `Department=14`, 10,000-account load, and monthly create/update/deactivate behavior.
- Upgrade a database at the current migration baseline and reconcile every historical Voice, assignment, actor, event, closure, rating, notification, route owner, and PIC identifier.
- Test global category routing across areas, composite Work Difficulty routing, missing-route draft preservation, default/global mapping invalidation, and legacy-handler bounds.
- Test exactly one Union Head/two Officers, Head-first routing, assignment/reassignment cutoff, assigned-only Officer access, anonymous/full-consent Union serializers, and Admin full-identity read-only access.
- Test every aggregate/detail/action matrix cell, including aggregate leakage and media/timeline authorization.
- Contract-test Responses request/output shapes, missing config, refusal/incomplete/invalid output, timeout/retry, low confidence, Private severity-only fallback, location cache invalidation, and snapshot acknowledgment.
- Run deterministic classification/location smoke tests against a local mock `/responses` server without an external API key; run a separate live non-sensitive validation during staging rehearsal after configuration is supplied.
- Run two-origin Playwright coverage for Admin bootstrap/import/remediation, reporter/responder/leadership workflows, host isolation, privacy, workforce PWA behavior, responsiveness, and accessibility.

## Risks

- Incorrect workbook data can deactivate accounts or invalidate routes at scale; preview, atomic confirm, remediation, audit, and session revocation reduce but do not eliminate this risk.
- Legacy-access policy can become over-broad if active-Voice linkage is not object-specific.
- Aggregate queries can leak record information if detail fields or sparse groupings are returned.
- Full Private identity access by CARE Admin increases impact of account compromise and requires least privilege plus access monitoring.
- Configurable AI endpoints may have unacceptable residency, retention, or contractual terms; production use requires explicit governance approval.
- Two origins can create cookie, CSRF, CORS, or cache isolation mistakes if host boundaries are not tested end to end.
- The lack of backup and disaster recovery can permanently lose organization, Voice, and audit data.

## Follow-up Work

- Produce and review the expand/contract schema and current-schema backfill specification.
- Maintain the authoritative XLSX/CSV importer, remediation queue, effective organization master, and route administration.
- Replace legacy role/routing/Union/Private serializers and add compatibility migration tests.
- Validate the completed Responses adapter/location-review contract with mock tests; complete governance review and live validation during staging.
- Regenerate OpenAPI/client contracts and complete authorization, privacy, security, migration, and performance regression.
- Build and validate the separate workforce and Admin applications only after the backend contract is re-frozen.
- Provision and approve production workforce/Admin domains, AI configuration, Union account owners, monthly data owner, and accepted operational risks.

## Implementation Status

The backend contract was re-frozen as API v1.1 on 26 August 2026. The generated TypeScript client, expand/contract migration, XLSX/CSV import paths, mock Responses smoke, authorization/security suites, and the 10,000-account/50,000-Voice/50-concurrent profile are green. Live provider validation remains a staging concern and does not require an API key in automated tests.
