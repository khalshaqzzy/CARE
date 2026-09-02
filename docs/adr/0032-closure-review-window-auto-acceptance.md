# ADR-0032: Closure Review Window and Auto-Acceptance

- Status: Accepted
- Date: 2 September 2026
- Related: PRD §15.2, §17, §19.2, §20.2, §34.5, §40; ADR-0031

## Context

Today a closed Voice stays "Selesai" indefinitely, and the reporter can send a
rating at any later time — including reopening the closure weeks afterwards on
a low rating. That leaves the PIC without closure certainty, lets stale
reopens restart work nobody is watching, and leaves the existing `RATE` action
offered even after a rating was already submitted (a double-rate hazard in
`computeAvailableActions`). The product owner commissioned a **2-day closure
review window**: the reporter reviews and rates within two days of the close;
silence means acceptance.

Product owner decisions recorded for this change:

1. The four `VoiceStatus` values are locked (PRD §40). The review outcome is a
   **`ClosureReviewState` (`PENDING`/`ACCEPTED`/`REJECTED`) on `ClosureCycle`**,
   surfaced as a derived status label, not a fifth status.
2. After a rejected (reopened) closure, the Voice displays **"Dibuka Kembali"**
   while it re-verifies; the rejected cycle keeps its "Ditolak" mark.
3. Expiry without a rating **auto-accepts** and notifies **both the reporter
   and the closing PIC**.
4. A **late rating after auto-acceptance is still possible** — once, as
   feedback only, with no reopen affordance; the Voice stays accepted.
5. A low rating submitted **without** reopen is final; reopen only ever rides
   atomically on a rating (PRD §17.3), never as a standalone later action.

## Decision

1. **Schema (additive).** `ClosureCycle` gains `reviewState
ClosureReviewState @default(PENDING)`, `reviewDeadline DateTime?`,
   `reviewResolvedAt DateTime?`, and `@@index([reviewState, reviewDeadline])`;
   enums gain `AUTO_ACCEPTED` (`VoiceEventType`) and `CLOSURE_AUTO_ACCEPTED`
   (`NotificationType`). One purely additive migration backfills historical
   rows deterministically: deadline = `closedAt + 2 days` everywhere; cycles
   with `reopenedAt` → `REJECTED` (resolved at reopen); rated cycles →
   `ACCEPTED` (resolved at rating time); unrated expired cycles → `ACCEPTED`
   (resolved at deadline); the rest stay `PENDING`.
2. **Window semantics.** `close()` stamps `reviewDeadline = closedAt +
CLOSURE_REVIEW_DAYS` (env, default 2, validated 1–30). Reopen eligibility
   is evaluated as `reviewDeadline >= now` **at rating time**, not derived
   from the stored review state, so a lagging worker (≤30s tick) can never
   mis-window a rating. A rating on an already-rated or already-reopened
   cycle is rejected (`INVALID_TRANSITION` / not found), which also removes
   the legacy double-rate affordance: `computeAvailableActions` offers `RATE`
   only on an unrated latest cycle and never offers standalone `REOPEN`.
3. **Auto-accept worker.** A new `ClosureReviewService` (VoicesModule,
   `setInterval(30s).unref()`, gated on `OUTBOX_ENABLED` like the existing
   notification/import workers) resolves expired pending cycles in one
   state-guarded, idempotent transaction each: flip to `ACCEPTED` with
   `reviewResolvedAt = reviewDeadline`, append an `AUTO_ACCEPTED` timeline
   event, and create reporter + closer notifications through the existing
   transactional outbox helper. `VoiceEvent.actorId` is NOT NULL and the
   destructive-migration check forbids dropping that, so the system event is
   attributed to the closing PIC's snapshot (copied from the cycle's CLOSED
   event) and carries `payload.system: true`; the timeline renders
   "Diterima otomatis" with no actor name (labels are actor-less already).
4. **Late rating.** `rate()` keeps accepting a rating on a window-expired but
   rating-less cycle: it records the score/feedback, leaves an already
   `ACCEPTED` cycle's `reviewResolvedAt` untouched, and rejects `reopen` with
   `REOPEN_NOT_ALLOWED` (enforced server-side in addition to hiding the
   client toggle).
5. **Derived status labels.** `voiceStatusDisplay(status, reviewState)` folds
   the review state into the display label — CLOSED+PENDING → "Menunggu
   Penilaian" (amber dot), CLOSED+ACCEPTED → "Diterima", IN_VERIFICATION with
   a rejected latest cycle → "Dibuka Kembali" (danger dot) — applied
   consistently across the detail hero, history/inbox/member cards. The list
   item contract gains optional `closureReviewState`/`closureReviewDeadline`
   and `MemberDashboard` gains `closedPendingReview` (count of the reporter's
   pending cycles; at most one cycle can be pending per Voice). OpenAPI and
   the generated shared client are regenerated.
6. **Reporter UX.** The rating card gains a deadline countdown notice ("Beri
   penilaian dalam N — setelah itu Voice diterima otomatis."); the
   auto-accepted variant swaps it for an auto-accept notice and never shows
   the reopen toggle (which otherwise remains low-score-only, atomic with
   submit). The closure section shows review badges ("Menunggu Penilaian" /
   "Diterima" / "Diterima otomatis" / "Ditolak · dibuka kembali"). Member
   Home renders an "Menunggu penilaian Anda" attention card (existing
   `AttentionCard` pattern) driven by `closedPendingReview` with rows from
   the recent list, linking into the detail page. No `:has()` and no new
   backdrop-filter dependency; the legacy-iOS bundle keeps the same markup.

## Rationale

- Review state on the cycle keeps the locked four-status invariant and mirrors
  the real semantics: acceptance/rejection is a property of one closure, and a
  new cycle starts clean after a reopen.
- Evaluating reopen eligibility against the deadline (not stored state) makes
  the system correct even when the worker is delayed; the worker then only
  affects the timeline event and notifications, never the reporter-facing
  state.
- A late feedback-only rating respects the owner's call that silence is
  acceptance while still letting the reporter be heard once; hiding (and
  server-rejecting) reopen after the window keeps the decision final.
- Attributing the system event to the closing PIC with a `system` payload flag
  avoids a schema-breaking nullable actor while keeping the timeline honest
  (the UI never displays the name for system events).

## Alternatives Considered

- Fifth voice status `REOPENED`/`ACCEPTED` — rejected: violates the locked
  four-status decision (PRD §40) and multiplies transition-matrix cases.
- Accepting late reopen after auto-acceptance — rejected by the product
  owner: silence after notice is acceptance; only a timely low rating reopens.
- Standalone reopen action after a low rating — rejected: reopen must be
  atomic with the rating (PRD §17.3); keeping it separate re-introduces
  ambiguous intermediate states and stale reopen windows.
- Nullable `VoiceEvent.actorId` for system events — rejected: requires a
  destructive migration (`DROP NOT NULL` is forbidden by the repo's migration
  policy) and leaks an implementation change into a stable table for no
  product gain.
- Cron/cron-expression scheduler for the worker — rejected: the two existing
  interval workers already established the in-process pattern; a scheduler
  dependency adds deployment surface for a 30-second latency budget.

## Consequences

- Historical cycles get deterministic review state without data loss; the
  migration is additive and passes the destructive check.
- `openapi.json` and `packages/contracts/src/generated.ts` carry the new
  optional fields; consumers that ignore them are unaffected.
- The countdown label is display-only; correctness never depends on the worker
  firing on time.
- Two-day default is environment-tunable (`CLOSURE_REVIEW_DAYS`) but fixed per
  deployment, not per Voice.
