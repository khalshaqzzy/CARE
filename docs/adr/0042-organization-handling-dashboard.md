# ADR-0042: Organization Handling Dashboard

Date: 7 September 2026
Status: Accepted

## Context

The workforce homepage mixed personal reporting status with operational metrics.
General aggregates grouped reporter departments only; section filters and a
handling perspective were absent. Category routing and Manager handover allow
reports to originate outside the responsible department or division, so reporter
organization alone cannot describe incoming workload. Union needs an operational
Private overview without disclosing anonymous reporters' organization.

## Decision

The operational dashboard is placed first, below the existing identity hero.
Personal status, drafts, pending reviews and recent reporting history follow the
operational content. The workforce shell and ordinary Member homepage are retained.
Union Private and General are separate tabs with independent URL filter state.

General defaults to handling organization, with an explicit reporter switch.
A separate Voice projection records responsible department and assigned section.
Submission snapshots the resolved department route; handover replaces the
responsible department and clears section; assignment snapshots the validated
Section Head membership. Closing preserves the projection; reopening with a
fallback Manager clears the previous section. Master changes alone do not rewrite
historical records. The additive migration backfills known routes and handover
snapshots and resolves section from memberships effective at assignment time.
Unknown history remains distinguishable from an unassigned section.

Aggregate and detail policies remain separate. Organizational aggregate scope
follows the chosen basis, whereas preview and detail access retain existing object
policy. Multiple capabilities cannot be narrowed by a Section Head branch taking
precedence over Manager or leadership. Exact extra PIC mappings do not grant their
entire foreign divisions. Department Heads start at their own department; Default PICs start at their own mapped department or the stable first mapping, with level expansion limited to that primary mapping division. Legacy route mappings do not grant organizational scope.

## API and data flow

Existing general/private endpoints accept additive basis, organization, level and
Private handler filters. Metadata and preview endpoints expose independently
scoped configuration and detail items. Organization identifiers encode a structured
path; labels containing slashes and duplicate department names remain unambiguous.
Legacy requests retain the prior aggregate response. OpenAPI distinguishes the
new response, and frontend adapters narrow the response before using it.

Server validation resolves parent/child paths and permissions before applying one
predicate to metrics, time series and comparison totals. Aggregation stays in SQL;
no full-history browser fetch is introduced. Trend dates use Asia/Jakarta and
missing periods are filled on the server. Long periods use weeks or months.

Cross-detail cohorts smaller than five withhold numeric metrics. If a dimension
contains a small protected bucket, the dimension is withheld in full rather than
exposing exact suppressed totals or permitting subtraction of visible siblings.
Private Union never offers reporter organization dimensions. UI states distinguish
protected data from empty results and network errors.

## Presentation

White rounded surfaces, cobalt charts, a status donut, a neutral trend comparison,
severity/category bars and organization levels share the existing workforce
visual vocabulary. Filters use URL state, cascading resets and accessible existing
Select/Dialog primitives. Critical KPI reads severity independently of active
status counts. A separate preview returns up to three authorized active Voices;
aggregate counts can exceed the preview's scope.

## Alternatives and tradeoffs

Joining current employee memberships during every read would silently rewrite
history after an organization import and was rejected. Inferring handling from
reporter organization would misclassify cross-department routes. Client aggregation
would violate pagination and privacy constraints. A new chart dependency was
unnecessary; existing SVG components are retained with time-axis corrections.
Withholding an entire small-bucket dimension sacrifices detail to avoid simple
complement reconstruction. It is not a claim of differential privacy.

## Consequences and compatibility

A database migration precedes the new application version. Rolling back application
code can leave additive columns in place; destructive rollback is unnecessary.
Backfill completeness is reported, and unresolved history is not fabricated.
Existing Member, Admin, navigation and detail/action contracts remain compatible.

## Validation and follow-up

Coverage includes role/basis/level matrices, incoming cross-division reports,
selection privacy, Union isolation, lifecycle projection, migration/backfill,
50k-Voice load, browser navigation, keyboard/Axe and full-stack data. New platform
baselines cover 360/768/1440 and loading/error/empty/protected states. Actual command
results and remaining delivery checks are recorded in the session handoff.
Hosted checks are not monitored as part of this delivery.

## Aggregate execution refinement — 7 September 2026

The first hosted performance run measured 4,518 ms at p95 against the 3,000 ms budget. A Linux x64 reproduction with two CPU limits on both the application runner and PostgreSQL measured 4,464 ms. The multi-consumer CTE materialized all Voice columns and scanned that intermediate result five times; EXPLAIN ANALYZE recorded 9,864 temporary blocks read and 2,466 written on 50,000 Voices.

Dimension aggregation now uses PostgreSQL GROUPING SETS so status, severity, category, organization and area share one scan. Total, date bounds and unresolved-handling counts share a separate summary aggregate. Privacy predicates and decisions are unchanged, including withheld cohorts and nullable organization/category buckets. No cache, index, schema change or relaxed performance threshold is introduced.

The dimension query fell from 84.8 ms to 27.2 ms with a single 72 kB hash aggregate and no temporary I/O. The complete endpoint workload measured p95 2,460 ms over 150 requests at 50 concurrency on the same constrained Linux fixture. This is a local reproduction, not a claim that a subsequent hosted run has passed.

## Small-cohort suppression removal — 7 September 2026

Product acceptance showed that the cross-detail-cohort threshold made one-level-up views (a Department Head's division-wide bar, a Division Head's global division bar) unusable: whenever any bucket outside the actor's detail scope contained one to four Voices, status, trend, severity and category dimensions were withheld in full. On realistic small datasets this locked nearly every visual exactly on the authorized management views, and even at production volume a single quiet day or low-severity cohort would suppress a whole dimension.

Per product-owner decision, the organization dashboard aggregates no longer apply a small-cohort privacy threshold. Every dimension returns actual counts whenever the validated filters resolve; the per-dimension protected cards, `protected`, `suppressedDimensions` and `suppression` response fields are removed, `total` is always numeric, and the previous-period comparison is computed directly. Detail-scope separation, the permission matrix, and the legacy monitoring contracts (including their `suppressedValue`/`suppressedBuckets` behavior) are unchanged; the removal is scoped to the organization dashboard contract introduced by this ADR.

Unknown organization buckets now merge into single rows per meaning with stable identifiers — "Belum ditugaskan ke section", "Section belum teridentifikasi", "Organisasi belum teridentifikasi", and "Union sebelumnya" — because the prior per-department unknown rows shared one label and collided as list keys, visually accumulating rows across scope switches. Severity rows with zero counts are not rendered. The trend and inbox helper captions were removed from the UI.

Consequences: management roles see exact small cross-department cohort counts on authorized aggregates; this trades the conservative withholding posture for usability and is accepted as product policy. Validation re-ran integration, performance (dashboard p95 improved to 327 ms with the removed detail-scope count), browser and visual coverage on darwin and Linux x64, replacing the protected-baseline scenario with an unknown-section scenario.

## Scope restoration and selectable hierarchy — 7 September 2026

### Context and decision

Returning from department grouping to section grouping retained the division URL parameter but dropped department. Default resolution only ran for requests with no organization parameters, leaving the returned view at division breadth. A synthetic reproduction and the reported 12/17/17 screenshots identified this as a cohort change. Browser fixtures had concealed the behavior by unconditionally restoring default departments.

Scope is now represented explicitly by optional `scopeMode` (`OWN`, `PARENT`, `GLOBAL`) and is resolved separately from grouping level and selectable organization options. Mode and allowed modes are included in metadata/view contracts. Existing requests infer the mode from role and level. Ancestor-only OWN requests remain anchored at the default own unit. Mode changes clear organization parameters in one URL update and preserve non-organization filters.

Section Heads start at their section and may view their department's section overview. Department Heads start at their department and may view the division's department overview. Default PICs use their primary mapped department/division, with exact additional mappings selectable. Division leadership starts at its division and retains global division aggregates across directorates. Selecting a peer unit or its descendants is forbidden; permitted overview buckets remain visible. Department/section selections within one's own higher-level unit remain permitted. Highest capabilities take precedence. Director, Union and Admin scope and all object/detail policies are retained. Missing required organization context fails closed.

### Implementation and alternatives

The organization resolver supplies metadata, aggregate and preview predicates. Selectable units are derived independently of overview breadth, including validation of encoded ancestor paths. Client-only restrictions were rejected because URL and API callers could bypass them. Retaining previous organization selections on a mode transition was rejected in favor of deterministic role defaults. Restricting Division Head aggregates to one directorate was rejected; global visibility remains intentional.

Aggregate context, summary, GROUPING SETS dimensions, date series and previous-period totals execute inside one REPEATABLE READ transaction. This prevents concurrent submissions or lifecycle mutations from making one response internally inconsistent. The existing SQL aggregation is retained rather than adding browser aggregation or a result cache. Separate preview requests continue to use detail policy and are not represented as part of the same database snapshot as the aggregate.

The browser uses a stable semantic query key and one refresh coordinator, sharing Jakarta date bounds between aggregate and preview while keeping their success/error states separate. Polling advances relative date bounds. Query abort signals cancel abandoned requests; retry clicks do not overlap an in-flight refresh. Legacy WebKit is supported without requiring Promise.allSettled. Category stable keys and organization identifiers provide stable row identity; deterministic ordering and existing unknown-bucket merging are retained.

### Consequences and validation

Section Head organization aggregates now include authorized organization totals beyond personal assignments, while preview/detail remain restricted. Selection privacy is enforced by preventing explicit peer filters; this is not a claim of differential privacy or prevention of inference from authorized overview counts. No schema migration or historical data rewrite is required. Existing legacy response shapes remain available.

Validation covers two-basis 12 → 17 → 12 PostgreSQL/browser roundtrips, sibling/descendant rejection on all readers, global Division Head visibility, exact extra PIC mappings, Section Head overview/detail separation, missing organization, and a real concurrent database insertion between summary and dimension reads. Date tests cover Jakarta boundaries, year rollover, leap days and invalid calendar dates. Browser checks include navigation, shared refresh timestamps, late responses, partial failure and responsive accessibility. The performance gate remains p95 below three seconds at 50,000 Voices and 50 concurrent requests. Exact execution results, visual baseline status and remaining delivery checks are recorded in the session handoff.

## Transaction acquisition stabilization — 9 September 2026

The `staging` run at `95ca2b50` failed the unchanged organization-dashboard load
test with Prisma `P2028`: one interactive transaction could not acquire a
connection within Prisma's default 2,000 ms. The preceding six hosted runs passed
at 1,763–2,055 ms p95, placing the framework cutoff inside the endpoint's existing
3,000 ms p95 budget. The merge contained no dashboard backend change, and all
other hosted jobs passed.

The repeatable-read transaction now declares a 5,000 ms acquisition limit and
the existing 5,000 ms execution limit explicitly. This allows requests near the
performance budget to queue for a connection instead of failing before latency
can be measured. The 3,000 ms p95 assertion remains authoritative: no retry,
connection-pool expansion, concurrency reduction, SQL/API/schema change, or
threshold relaxation is introduced. The concurrent-insert integration test locks
the transaction options and continues to prove that all dimensions share one
snapshot. Constrained Linux x64 validation with Node and PostgreSQL limited to two
CPUs completed three consecutive 150-request/50-concurrent runs without `P2028`
at 1,787–1,841 ms p95.
