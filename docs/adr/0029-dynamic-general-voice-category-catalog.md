# ADR-0029: Dynamic, Revisioned General Voice Category Catalog

- Status: Accepted
- Date: 1 September 2026
- Related: PRD §1.1, §9.3, §13, §14, §20, §34; ADR-0015 and ADR-0028

## Context

CARE previously encoded four General Voice categories in Prisma, backend validation, AI tool schemas, routing, dashboards, and both frontends. Three categories shared one `GLOBAL_SPECIAL` owner. This made taxonomy and routing changes require a release, mixed editable classification context with immutable model instructions, and could not represent the six categories defined by the approved Voice Category document. Product requires Admin-managed Definition, ordered Examples, department routing, effective PIC visibility, archive/reactivate, and historical fidelity.

## Decision

General Voice categories are a database catalog. `GeneralVoiceCategory.key` is immutable; status is `ACTIVE` or `ARCHIVED`. Content is stored in effective-dated `GeneralVoiceCategoryRevision` rows and routing in independent effective-dated `GeneralVoiceCategoryRoute` rows. Routes use either `FIXED_DEPARTMENT` with an exact organization-unit ID or `RELATED_REPORTER_DEPARTMENT`. A fixed or related unit resolves exactly one active `DEPARTMENT_HEAD` or `DEFAULT_DEPARTMENT` route at submission time. Category configuration never selects a dedicated person.

The migration seeds `SAFETY`, `ENVIRONMENT`, `FACILITY`, `FACILITY_REPAIR`, `WORK_DIFFICULTY`, and `WELFARE` with the approved Indonesian definitions and ordered examples. `FACILITY` retains its stable key and is named **Fasilitas Umum**, including historical backfill. Fixed seeds target exact August master composite units; absent units remain unconfigured and create remediation issues rather than using fuzzy matching. Legacy `GLOBAL_SPECIAL` mappings are ended and open global-PIC issues are superseded. Legacy enum columns remain for one compatibility release, while all new writes use category IDs and stable keys.

AI core instruction, injection defense, severity rubric, function wrapper, and output contract remain code-owned and versioned. For General Voice the server appends the active catalog as structured `categoryContext` and constructs the tool enum from active keys. Definition and Examples are untrusted classification context and cannot change the core instruction. Private Voice receives no catalog and must return `category=null`. Classification stores the revision used; Voice stores category ID, key, and name snapshot.

Admin mutations require CARE Admin capability, CSRF, an idempotency key, optimistic version, transactions, and audit events. Audit stores changed fields, revision/content hash, route mode/target, actor, and owner identifiers, not full prompt text. Categories can be archived but not deleted, and at least one remains active. Re-activation validates an effective revision and route; fixed routes also require one active PIC. Archived categories are excluded from AI/fallback and stale drafts fail with `CATEGORY_CONFIGURATION_CHANGED` while preserving draft and media.

The Admin remediation workspace exposes catalog status, route unit, current derived PIC and No. Reg, health, revision history, editable Definition and ordered Examples, archive/reactivate, and a server-side organization picker with search, exact division filter, and pagination. Workforce category choices and analytics use the API; reporters see names only. Filters continue to use `category=<stable-key>` and historical display uses the Voice name snapshot.

## Rationale

- Stable keys preserve URLs and aggregation while names evolve.
- Separating content revision from route history lets classification record its context while submission resolves current ownership.
- Deriving PIC from organization routing keeps monthly import and default-PIC remediation authoritative.
- Snapshots prevent configuration changes from rewriting Voice ownership or labels.
- Structured context maintains a clear trust boundary between Admin-managed text and immutable model instructions.

## Alternatives Considered

- Extend the Prisma enum to six values — rejected because future taxonomy changes would still require releases and migrations.
- Store one mutable category row — rejected because historical classification context could not be reconstructed.
- Assign a PIC directly per category — rejected because it duplicates organization routing and becomes stale after master imports.
- Reclassify historical `FACILITY` content — rejected because it changes accepted business history without reporter review.
- Delete archived categories — rejected because classifications, Voice snapshots, audits, and bookmarked filters must remain readable.

## Consequences

- Category reads require current revision/route joins and reconciliation after imports/configuration changes.
- Custom keys are generated once from names and never renamed; custom icons use a generic fallback.
- Old global routes remain readable for historical Voice but are not candidates for new submissions.
- Environments without the exact seeded departments start with visible route gaps until the organization master is imported or Admin configures the target.

## Validation

- Unit tests cover dynamic tool enums, Private null behavior, and the immutable-instruction boundary.
- Migration tests must cover fresh and previous-schema deploys, `FACILITY` backfill, unchanged Voice/classification counts and relations, and readable legacy routes.
- Integration tests cover all six default routes, related-department behavior, effective-time changes, archive rejection, reconciliation, and server-side organization filtering.
- Playwright covers category CRUD/revision, ordered examples, fixed department search/filter, health/PIC display, archive/reactivate/conflict, dynamic fallback, historical labels, keyboard/focus, and Admin desktop gating.
- OpenAPI generation, full parity, security, deployment validation, and `git diff --check` remain release gates.

## Follow-up Work

- Remove legacy `RoutingCategory` columns and the deprecated global-PIC endpoint only after one successful compatibility release and rollback window.
- Complete hosted exact-SHA acceptance after local database, full-stack, and migration-upgrade gates pass.
