# ADR-0009 — Workforce Voice Pagination, Dashboard Filtering & Suppression Metadata, and Responder/Leadership Matrix Completion

Status: Accepted
Date: 27 Agustus 2026
Deciders: CARE implementation team

## Context

The Member voice journey and the responder/leadership slice were shipped with a
generated OpenAPI contract and a server-computed action set, but a block of
remaining lifecycle work stayed open for full Phase 9/10 acceptance: the
conversation timeline and message feed were returned as unbounded arrays; the
dashboard aggregate took no filters and returned no suppression metadata; the
responder/leadership permission matrix had not been verified end-to-end; the
Admin Voice Explorer rendered the unpaginated timeline/messages; and no
Playwright journeys covered the mocked workflows or the built frontend against a
real backend.

Two latent authorization/scope defects were also present and are corrected here:

- `workItemScope` returned a literal `{ id: '__none__' }` sentinel for actors
  with no work-item scope. Prisma coerces that string as a UUID, so a Member
  (or any non-responder) opening their **own** voice detail/timeline/messages
  failed with a UUID validation error. It also broke the CARE Admin detail path
  (`browseScope` returns `{}` for an Admin).
- `assign`/`reassign` only checked `actionVoice` and candidate eligibility, so a
  Section Head acting as the current handler could assign another handler,
  contradicting the product rule that only a route-owning Manager (General) or
  the Union Head (Private) may assign.

## Decision

1. **Timeline and messages are cursor-paginated.** `GET /voices/:id/timeline` and
   `GET /voices/:id/messages` accept `limit`/`cursor` (and an optional `order`)
   and return `{ items, nextCursor }`. Messages/timeline default to ascending,
   and callers may request `order=desc` so a live feed shows the newest page
   first and pages forward into older records. The response schemas
   (`TimelinePage`, `MessagePage`) are added to the OpenAPI contract and the
   generated client. The workforce detail/chat consume the pages via a shared
   `useCursorFeed` hook; the Admin Voice Explorer drawer uses `useInfiniteQuery`.

2. **Dashboard filters and suppression metadata.** `GET /dashboard/general` and
   `GET /dashboard/private` accept `area`, `category`, `severity`, `status`, and
   a `from`/`to` date range, applied to both the count/group-by aggregations and
   the daily-trend SQL. The aggregate now returns a `suppression` object
   (`enabled`, `threshold`, and per-dimension `suppressedBuckets`/`suppressedValue`
   for the division and department breakdown), echo filters, and `generatedAt`.
   The suppression threshold remains implementation-defined at 5 and is exposed
   so the UI can state that small groups are combined for privacy.

3. **Responder/leadership matrix completion.** The Section Head aggregate
   overview is scoped to currently assigned voices (`currentHandlerId`) rather
   than voices they reported. `assign`/`reassign` now require the actor to be a
   route-owning Manager (General) or the Union Head (Private). The empty
   work-item scope sentinel is a valid Prisma "match nothing" filter
   (`{ id: { in: [] } }`), and `detailScope` drops it when OR-ing with a browse
   scope so an actor with no work items (including an unrestricted Admin) still
   resolves their own/all detail correctly.

4. **Close-evidence UI.** The close dialog uploads and stages closure-evidence
   images (1–5, ≤10 MB each) before submitting the closure, reuses the media
   pipeline, and requires at least one staged evidence plus a note. It surfaces
   the backend `EVIDENCE_LIMIT` policy via the existing error channel.

5. **Playwright journeys.** Mocked-contract specs cover the Member home/detail
   (including the paginated chat/timeline) and the Admin Voice Explorer read-only
   drawer; a gated full-stack smoke validates the preview→API proxy; and the
   workforce shell visual baseline is regenerated against the Member Home.
   `preview.proxy` is added to both Vite configs so `vite preview` proxies to the
   API, enabling full-stack runs.

## Alternatives Considered

- **Returning the full, unpaginated arrays.** Rejected: for long-lived threads
  and event logs this grows unbounded and violates the server-side pagination
  requirement.
- **Client-side pagination of a full fetch.** Rejected for the same reason; the
  browser must not download an entire history.
- **Keeping an `order=asc`-only contract and paging from the oldest.** Rejected
  for the live chat, where the newest messages must be the first page.
- **Enforcing assign only through the frontend-visible `availableActions`.**
  Rejected: hiding a button is not authorization; the service must enforce it.
- **Leaving `{ id: '__none__' }` in place.** Rejected because Prisma coerces it
  as a UUID and the Member/A ADMIN detail paths break.
- **Hard-coding the section-head aggregate to `own`.** Rejected: a Section Head's
  operational overview is their assigned workload, not their own submissions.

## Implementation Details

- `apps/api/src/voices/voices.service.ts`: `timeline`/`messages` cursor
  pagination with optional `order`; `dashboard`/`aggregate` filter + suppression
  metadata; `dashboard` Section Head branch; `assign`/`reassign` assigner guard.
- `apps/api/src/auth/policy.service.ts`: `workItemScope` empty sentinel uses a
  valid match-nothing filter; `detailScope` drops the empty work-item clause.
- `apps/api/src/voices/voices.controller.ts`: query params for timeline,
  messages, and both dashboards.
- `apps/api/scripts/enrich-openapi.ts`, `apps/api/openapi.json`,
  `packages/contracts/src/generated.ts`: `TimelinePage`, `MessagePage`,
  dashboard query params, extended `DashboardAggregate`.
- `apps/web-voice/src/lib/useCursorFeed.ts`: shared paginated feed hook.
  `worker`force-api.ts, `ActionPanel.tsx`, `ConversationPanel.tsx`,
  `VoiceDetailPage.tsx`, `GeneralBrowsePage.tsx`, `styles.css`.
- `apps/web-admin/src/admin-api.ts`, `VoiceExplorerPage.tsx`.
- `apps/web-voice/vite.config.ts`, `apps/web-admin/vite.config.ts`:
  `preview.proxy`.
- Tests: `voice-pagination.integration.test.ts`,
  `dashboard-filter.integration.test.ts`, `responder-matrix.integration.test.ts`;
  `policy.test.ts` updated for the empty sentinel. e2e:
  `member-voice.spec.ts`, `admin-explorer.spec.ts`, `fullstack.spec.ts`,
  `helpers/mock-api.ts`; `foundation.spec.ts` and `design.visual.spec.ts` updated
  for the Member Home; `workforce-shell-360.png` regenerated.

## Consequences

- Conversation history and event logs are server-paginated with stable cursors;
  the workforce chat shows the newest page first and pages into older records.
- Dashboard filters and suppression metadata are part of the contract, so the UI
  can filter aggregates and disclose the privacy threshold.
- Section Heads see their assigned workload; only authorized Managers/Union Head
  can assign; Members and non-responders can open their own detail/timeline/
  messages without a UUID coercion failure.
- Close requires at least one staged closure-evidence image, matching the policy.
- Admin Voice Explorer consumes the paginated timeline/messages.
- The mocked e2e + visual baselines run against the built frontend without a
  running backend; the gated full-stack run validates the proxy target.

## Validation

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` green.
- `pnpm test:integration` — 31 passed (incl. 3 pagination, 3 dashboard filter/
  suppression, 6 responder-matrix) against disposable PostgreSQL.
- `pnpm test:security` — 5 passed.
- `pnpm test:unit` — API 34, `packages/ui` 8, `packages/frontend-core` 9,
  `apps/web-voice` 12, `apps/web-admin` 2.
- Playwright (chromium + visual + pwa) — 20 passed, 1 gated-skip (full-stack).

## Risks and Follow-up

- The full-stack Playwright suite is gated behind `FULLSTACK_E2E=1` and a running
  API on :3000 attached to the disposable test DB; it is exercised alongside the
  disposable-PostgreSQL `test:integration` suite rather than in the default CI
  `quality` job.
- `ConversationList` inline message previews remain unpaginated (single latest
  message); if that surface ever paginates it should be its own change.
- The workforce shell visual baseline was regenerated for the Member Home and
  pins the clock so the time-of-day greeting is deterministic; a future Home
  change should regenerate the baseline.
- The Admin shell visual continues to render with the overview fetch failing
  under the preview proxy when the API is not running; that is unchanged prior
  behavior (the baseline reflects the header-driven render) and is not a
  regression.
