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
