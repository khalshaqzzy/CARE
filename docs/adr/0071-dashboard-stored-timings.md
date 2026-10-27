# ADR-0071: Dashboard timings stored at write time by database triggers

- Status: Accepted (implemented on a branch, not released)
- Date: 27 October 2026
- Related: ADR-0061 (legacy Voice migration), the organization dashboard performance gate (`organization-dashboard.performance.test.ts`, p95 < 3 s on 50k Voices)

## Context

The organization dashboard computes its averages on every request:

- the response time joins every Voice in scope to its MONITORED/RESPONDED events and groups them per Voice;
- the completion time joins each closure cycle to the previous cycle, to find when the cycle started.

On the 50k performance fixture these two joins are about two-thirds of the organization-wide summary query. Before PR #103 the CI gate already ran at 2875–2947 ms against 3000 ms, and after it the staging run failed three times (3023–3080 ms). Rewriting the SQL did not help: pre-grouping events, a `lag()` window, a correlated subselect, more `work_mem` and a covering index were all equal or slower in interleaved timing.

## Decision

- **`VoiceResponseTiming`** (one row per Voice that has a response): `firstResponseAt` and `lastResponseAt`, the earliest and latest MONITORED/RESPONDED event times.
  - It is a narrow side table, not columns on Voice: updating Voice on every response would add a second Voice row version per response and widen every Voice scan.
  - It cascades when its Voice is deleted.
- **`ClosureCycle.startedAt`**: the Voice's submit time for cycle 1, the previous cycle's `reopenedAt` for later cycles.
- **Database triggers keep both exact; application code never writes them.**
  - `VoiceEvent_response_timing` (AFTER INSERT, response types only) upserts the window with `LEAST`/`GREATEST`, so insert order does not matter.
  - `ClosureCycle_set_start` (BEFORE INSERT) sets `startedAt` on the new row.
  - `ClosureCycle_follow_reopen` (AFTER UPDATE OF `reopenedAt`) moves the next cycle's start if a reopen time changes after that cycle exists.
  - Triggers rather than application code because about ten call sites write response events (including the generic status transition and the legacy importer) and two create cycles; a trigger also covers raw SQL such as the performance seed.
- The migration backfills both from history.
- The dashboard reads them directly; the meaning of every figure is unchanged.

## Consequences

- Serial medians on the 50k fixture: Director 186 ms (was 228), division leadership 246 ms (was 285), member views unchanged. The concurrent CI-style benchmark ran at p95 1.5–1.8 s against 2.0–2.05 s for staging locally.
- Events are append-only and `submittedAt` never changes, so the stored values cannot drift. If either assumption changes, the triggers must change with it.
- These are the first triggers in the schema. Prisma does not model triggers or functions, so they live only in the migration; `prisma migrate diff` does not show them.
- The people dashboard (`dashboard-people.ts`) still computes its own timings and can move to these values later.
