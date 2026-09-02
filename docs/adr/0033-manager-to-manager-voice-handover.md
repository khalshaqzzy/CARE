# ADR-0033: Manager-to-Manager General Voice Handover

- Status: Accepted
- Date: 2 September 2026
- Related: PRD §7, §15, §17, §19, §22, §26–27, §33–34, §41; ADR-0029; ADR-0031

## Context

General Voice routing previously became fixed at submission. A Manager who
received a valid Voice through an unsuitable category could ask, assign, or
start processing it, but could not transfer operational ownership to the
Manager responsible for the better category. Editing the original AI/manual
classification would erase provenance; exposing transfer notes in the shared
timeline would disclose operational context to the reporter, leadership, and
administrators who are not participants in the transfer.

The product owner requires repeated Manager handover (A → B → C), only before
verification or processing begins. The Voice must remain `OPEN`, the selected
category must become its current operational category, each transfer note must
be visible only to its adjacent PIC pair, and only the destination PIC is
notified.

## Decision

1. **Classification and routing are separate facts.** Existing `categoryId`,
   `categoryKey`, and `categoryNameSnapshot` remain the immutable submission
   classification. Additive `currentCategory*` fields represent the current
   operational category and are backfilled from the submission category.
   Lists, filters, dashboard aggregation, the hero, and current detail use the
   operational fields with a legacy fallback; detail also exposes the original
   classification when it differs.
2. **Append-only transfer ledger.** `VoiceHandover` stores a monotonically
   increasing per-Voice sequence, source/destination category and composite
   organization snapshots, route mapping and PIC IDs, route mode,
   reporter-department flag, actor, timestamp, and a required 1–4,000 character
   note. Records are never rewritten by later handovers.
3. **Pairwise note authorization.** The note is returned only when the caller
   is that record's `fromPicId` or `toPicId`. Thus A sees A→B, B sees A→B and
   B→C, and C sees B→C. A former PIC without current Voice access receives only
   records involving them plus `{id, displayId}`; no Voice title, reporter,
   description, attachment, or chat data is returned. CARE Admin has no
   application-level note access.
4. **Sanitized shared signals.** `HANDOVER_COMPLETED` timeline payloads contain
   transfer metadata but never the note. Audit summaries use `detail:
"redacted"`; notification and outbox data contain no note. Only the new PIC
   receives `HANDOVER_RECEIVED`; handover creates no conversation, assignment,
   status-change notification, or reporter notification.
5. **Server-authoritative eligibility.** `HANDOVER` is computed only for the
   active current route-owning Manager of an unassigned `OPEN` General Voice.
   Private Voice, reporter, Section Head, Union, leadership, CARE Admin, former
   PIC, and every non-`OPEN` state cannot initiate it.
6. **Live destination resolution.** Options preserve one card per active
   category. Archived categories are omitted; categories resolving to the
   current PIC are omitted; active route gaps and ambiguous routes stay visible
   but disabled. `RELATED_REPORTER_DEPARTMENT` resolves through the immutable
   reporter organization-unit snapshot and is explicitly labelled. Submission
   re-resolves the category, route, organization unit, active singular PIC, and
   self-destination against current configuration.
7. **Atomic and idempotent mutation.** The endpoint requires
   `Idempotency-Key` and `expectedVersion`. Within one transaction it locks the
   Voice row, rechecks owner/status/assignment/version, resolves the destination,
   increments the version, updates operational category/route owner/mapping,
   appends handover/event/audit rows, and queues the destination notification.
   Ask, Proceed, and Assign use the same row-lock/recheck boundary so concurrent
   actions have one winner.
8. **Dedicated workforce surfaces.** `/voices/:id/handover` reuses the exact
   parent `VoiceHero`, provides searchable semantic radio cards, explicit route
   health and reporter badges, required private note, sticky safe-area actions,
   and a confirmation dialog. `Handover Saya` is an opt-in Work Items filter;
   its cards open a restricted history route rather than Voice detail. The
   default queue and workload aggregates remain unchanged.

## Consequences

- Current category analytics intentionally move with operational ownership,
  while classification accuracy remains auditable from immutable fields.
- Former PICs retain the minimum context needed to recall their own transfer
  without retaining Voice-content access.
- Category/organization changes between option load and submit produce stable
  recoverable conflicts; the client preserves the note and refreshes options.
- The migration is additive and supports fresh and previous-schema upgrades.
- UI coverage includes default, hover, focus, selected, disabled-gap, loading,
  empty, and error specimens plus 360/768/1440 responsive and reduced-motion
  behavior.

## Alternatives Considered

- Mutate the original category — rejected because it destroys classification
  provenance and makes AI/manual accuracy impossible to audit.
- Model handover as assignment or status transition — rejected because the
  destination remains a Manager route owner and the Voice must stay `OPEN`.
- Put the note in the timeline payload — rejected because timeline readership
  is broader than the adjacent PIC pair and payloads feed unrestricted DTOs.
- Let CARE Admin read every note — rejected; administrative authority does not
  imply a product need for confidential Manager-to-Manager context.
- Hide unhealthy active categories — rejected because visible disabled gaps
  explain why a plausible route cannot be selected and support remediation.
