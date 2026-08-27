# ADR-0008 — Voice Lifecycle Idempotency, Evidence Linkage, Reopen Resilience, and Assignment Contract Completion

Status: Accepted
Date: 27 Agustus 2026
Deciders: CARE implementation team

## Context

ADR-0007 delivered the Member voice journey on the generated contract but
deliberately deferred a block of remaining voice lifecycle backend work so the
Member vertical slice could ship first. That deferred work is the subject of
this decision and closes real correctness and contract gaps that also block
the full Phase 10 responder journey:

- The frontend already sends `Idempotency-Key` on ask/proceed/close/rate and on
  message send, but the backend ignored it (`_key` was discarded), so a
  transport retry could double-apply a mutation. `rate` was the worst case: it
  creates a `Rating` uniquely tied to a closure cycle, so a lost-response retry
  would hit a unique-constraint 500.
- Staged closure evidence was uploaded but never linked to the closure cycle on
  close, so it could not be attributed to a cycle and the 1–5 evidence policy
  was unenforced.
- Reopening a closed voice kept the previous handler even if that account had
  since been deactivated, stranding the reopened voice on an ineligible PIC.
- Assignment had no optimistic-version guard, so concurrent assignment and
  reassignment could race.
- There was no endpoint to enumerate the eligible handlers that a Manager or
  Union Head may assign to, which the Phase 10 assign UI needs.

## Decision

1. **Mutation idempotency is enforced server-side and is atomic with the
   business write.** A shared `idempotentMutation` helper (plus a
   `checkIdempotency` pre-read for the multipart path) validates the key, reuses
   the stored response on an identical replay, returns `IDEMPOTENCY_CONFLICT`
   when a key is reused with a different request hash, and writes the replay
   record inside the same PostgreSQL transaction as the mutation. A unique
   `(accountId, scope, key)` constraint plus a `P2002`-safe re-read makes
   concurrent same-key submissions converge on the winner. It is wired into
   `ask`, `proceed`, `close`, `rate`, `addMessage`, and `assign`. `ask` now runs
   its message write and status transition in a single transaction (previously
   two separate transactions).

2. **Close links staged closure evidence to the closure cycle.** On `close`, the
   service reads staged `READY`/unlinked `CLOSURE_EVIDENCE` attachments for the
   voice, rejects a cycle that would exceed the 1–5 cap with `EVIDENCE_LIMIT`,
   and moves them onto the new cycle (`voiceId: null, closureId, state:
REFERENCED`) to satisfy the `Attachment_exactly_one_parent` constraint. The
   evidence stays discoverable under `closureCycles.evidence`.

3. **Reopen is resilient to a deactivated last PIC.** When a rating reopens a
   closed voice, the reopened voice returns to the current handler only if that
   account is still `ACTIVE`; otherwise it falls back to the route owner with the
   matching `handlerType` (`MANAGER` for General, `UNION_HEAD` for Private), so a
   reopened voice cannot be stranded on an ineligible handler.

4. **Assignment is version-guarded.** `assignmentSchema` accepts an optional
   `expectedVersion`; `assign`/`reassign` reject a stale version with
   `VERSION_CONFLICT` (an adversarial-value invariant matching the `version`
   optimistic token used by lifecycle transitions).

5. **A candidate listing endpoint is added for the assign UI.**
   `GET /voices/:id/assignment-candidates` returns eligible section heads in the
   assignment unit for General Voices and active union officers for Private
   Voices (excluding the current handler), so the frontend never lists handlers
   the backend would reject.

6. **The frontend reuses a stable idempotency key per logical mutation.** The
   `useMutationKey(namespace)` hook holds a key in a ref for the duration of one
   logical operation and resets it on settle, so a React Query transport retry
   reuses the same key instead of minting a fresh one each `mutationFn` call.
   It is applied to the action-panel lifecycle mutations (ask/proceed/close/
   rate/assign), message send, and draft submit.

7. **Phase 10 assignment is surfaced in the UI.** `workforce-api` exposes
   `assignmentCandidates`/`assign`/`reassign` typed to generated operations; the
   capability-aware `ActionPanel` renders `ASSIGN`/`REASSIGN` when present in the
   server-computed `availableActions` and opens an `AssignDialog` that lists the
   eligible candidates and submits the assignment with `expectedVersion`.

## Alternatives Considered

- **Letting the backend read the key but not enforce it.** Rejected: the key is
  already transmitted by the client, and ignoring it leaves the exact duplicate
  case (`rate`, `message`, and a double-submitted close) unprotected.
- **Refreshing the key on every `mutationFn` call.** This is what the frontend
  did before; it defeats server idempotency because React Query retries re-mint
  the key, so a retry is treated as a brand-new request.
- **Robustness via a `CLOSED`-state-only guard instead of idempotency.** The
  version CAS already guards state transitions, so a retried close/proceed/ask
  failed closed (`invalidTransition`) rather than duplicating. But that produces
  a 409 to a client whose previous call actually succeeded, which is worse than
  a replayed success, and it provided no protection for `rate`/`message`, which
  create unbounded rows without a version token.
- **Keeping the handler on a reopen unconditionally.** Rejected: a reopened voice
  lands on an inactive handler that can still see the thread but can no longer
  be assigned new work, blocking the cycle.
- **Hard-coding the handler pick list in the client.** Rejected: it must derive
  from the same route/unit rules the backend uses to authorize assignment.

## Implementation Details

- `apps/api/src/voices/voices.service.ts`: `assignmentSchema` gains
  `expectedVersion`; `assign`/`reassign` version guard; `close` evidence
  linkage + cap; `rate` reopen fallback; `ask`/`proceed`/`close`/`rate`/
  `addMessage`/`assign` idempotency via the new `checkIdempotency` +
  `idempotentMutation` helpers; `createMessageWithin` and `transitionStatus`
  extracted so both lifecycle and idempotency share one transaction; the
  obsolete `updateStatus`/`transitionWithMessage` helpers removed.
- `apps/api/src/voices/voices.controller.ts`: new
  `GET /voices/:id/assignment-candidates`.
- `apps/api/scripts/enrich-openapi.ts`: request/response schemas
  (`AssignmentRequest.expectedVersion`, `AssignmentCandidateList`) and the
  operation mapping for `VoicesController_assignmentCandidates`.
- `apps/api/openapi.json` + `packages/contracts/src/generated.ts`: regenerated.
- `apps/api/test/integration/voice-lifecycle.integration.test.ts`: six tests
  covering assignment version conflict, General/Private candidate listing,
  evidence linkage + cap, idempotent close/rate replay + conflict, and reopen
  route-owner fallback.
- `apps/web-voice/src/lib/query.ts`: `useMutationKey` stable-key hook.
- `apps/web-voice/src/workforce-api.ts`: `AssignmentCandidate` type plus
  `assignmentCandidates`/`assign`/`reassign` operations.
- `apps/web-voice/src/components/ActionPanel.tsx`: `ASSIGN`/`REASSIGN`
  affordances and `AssignDialog`.
- `apps/web-voice/src/components/ConversationPanel.tsx` and
  `src/features/create/DraftPreviewPage.tsx`: stable message/submit keys.

## Consequences

- The backend honors every idempotency key the client sends, and the client now
  reuses a key across transport retries, so lost-response retries converge on
  the original result instead of duplicating rows or erroring.
- Closure evidence is attributable to a closure cycle, count-limited, and no
  longer orphaned on the voice row.
- Reopened voices always land on an eligible handler, and assignment is safe
  against concurrent stale writes.
- Assignment candidates come from backend scope rules, so the assign UI cannot
  present a handler the backend would reject.
- The voice lifecycle path is now exercised by a disposable-PostgreSQL
  integration suite in addition to the existing unit/security suites.

## Validation

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: green across the monorepo.
- `pnpm test:integration`: 19 passed (the prior 13 plus 6 new lifecycle tests).
- `pnpm test:security`: 5 passed.
- `pnpm test:unit`: API 34, `packages/ui` 8, `packages/frontend-core` 9,
  `apps/web-voice` 12, `apps/web-admin` 2.
- `pnpm build`: green (workforce PWA 12 precache entries, design chunk excluded).
- `pnpm openapi:generate` + `pnpm openapi:check`: contract drift limited to the
  intended new/changed operations and schemas (pre-commit state).

## Risks and Follow-up

- Timeline/messages cursor pagination and dashboard filter (date, area,
  category, severity, status) plus suppression metadata are still outstanding,
  as are the full responder/leadership matrix acceptance (Manager department
  detail/action, Section Head assigned-only, Union Officer isolation,
  leadership read-only detail, close-evidence UI), Admin Voice Explorer
  compatibility once the detail/timeline/messages contracts are paginated, and
  Playwright mocked-contract/full-stack + visual regression. These are recorded
  in `sessionHandoff.md`.
- Idempotency for the multipart message path pre-processes media files before the
  idempotency short-circuit; a replay within the same key after a partial file
  upload is short-circuited before processing, so orphaned rows only occur on a
  failed transaction, which matches prior behavior.
- The Frontend Complete Gate remains blocked until Phase 8.5 and Phase 11 pass;
  Phase 8.5 stays `in_progress`.
