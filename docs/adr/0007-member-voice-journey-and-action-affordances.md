# ADR-0007 — Workforce Member Voice Journey, Server-Computed Action Affordances, and Capability-Aware Navigation

Status: Accepted
Date: 27 Agustus 2026
Deciders: CARE implementation team

## Context

The workforce PWA (`apps/web-voice`) became a real product surface during the
Phase 9–10 batch. Until then it only carried the Phase 7 foundation (session,
capability gating, PWA shell, and design system) with no business routes. The
Member voice journey — create/private-vs-general, AI classification and location
review, manual fallback, idempotent submit, history, detail with conversation,
closure/rating/reopen, and notification center — needed to be built on top of
the existing generated OpenAPI contract without introducing handwritten wire
types, a new visual identity, or a second design token family.

The backend already exposed most draft/voice/lifecycle endpoints, but several
contract gaps blocked a clean Member journey and would also block the responder
journey: drafts were full-object replace only, there was no own-draft listing,
no Member dashboard endpoint, no server-computed action set on the detail
response, and the work-items endpoint was not paginated despite the OpenAPI
promising it.

## Decision

1. **The workforce app is built entirely from generated operations.** All
   request/response/query types are derived from `@care/contracts`, accessed
   through a thin typed `workforce-api` module and session-scoped React Query
   keys (`careQueryKey(sessionId, ...)`). No handwritten wire types were added.

2. **The backend remains authoritative and is extended minimally for the Member
   journey, without a schema migration.** Drafts now accept partial PATCH with
   an `expectedVersion` optimistic token and a stable `DRAFT_VERSION_CONFLICT`;
   own-drafts are cursor-paginated; a new `GET /dashboard/member` returns four
   status counts, recent own Voices, and the active draft summary; draft expiry
   follows the PRD 30-day retention; the detail response is enriched with
   `submittedAt`, `updatedAt`, `classificationSource`, closure cycles (evidence,
   rating, actor), and a server-computed `availableActions`; the draft preview
   carries a typed route readiness (target label and remediation code) plus a
   `routeTarget`; and `GET /work-items` is aligned with `/voices` on signed
   cursor pagination, severity-first ordering, filters, search, and a typed
   `nextCursor`.

3. **Lifecycle affordances are server-computed.** The decision logic is a pure
   function (`computeAvailableActions` in `apps/api/src/voices/actions.ts`) that
   maps capability/ownership/status to an action set. The frontend `ActionPanel`
   renders only these affordances. This is not an authorization boundary: every
   mutation still faces the backend capability/version checks (ask, proceed,
   close, rate, reopen, message, assign each keep their own validation), so
   hiding or reordering a button never grants access.

4. **Navigation is capability-aware and composed per role.** The shell computes
   a bottom-dock (mobile) or sidebar/topbar (≥1280 px) from session
   capabilities: Member (Beranda, Buat, Riwayat, Notifikasi, Akun);
   Manager/Section Head (Beranda, Voice Member, Buat, Notifikasi, Akun);
   Union (Beranda, General, Notifikasi, Akun); Leadership (Beranda, General,
   Buat, Notifikasi, Akun). The `Member Home` opens with a cobalt hero, status
   summary, recent Voice cards, and resume-draft affordance; responder, Union,
   and leadership capabilities render their own aggregate/inbox sections.

5. **Design follows the existing CARE system, not a new identity.** The review
   reference (`/.design`) guides hierarchy and depth only. The implementation
   reuses `AppShell`, `BottomNav`, `Sidebar`, `Card`, `Button`, `Badge`,
   `SeverityBadge`, `StatusBadge`, `Progress`, form controls, `Dialog`,
   `BottomSheet`-style overlays, `Timeline`, `Alert`, `Skeleton`, and the
   empty/error/offline/conflict states; only composed product components
   (`VoiceCard`, `StatusSummary`, `DashboardChartCard`, `MediaGallery`,
   `ActionPanel`, `ConversationPanel`, `Pager`) were added. Palette stays
   cobalt `#0866FF`, cyan accent `#18BDE3`, gray canvas, white layered cards,
   generous radius, soft shadow, Inter Variable, and 44×44 touch targets.

## Alternatives Considered

- **Reusing the Admin pattern verbatim.** The Admin app is desktop-only and
  1280-px-gated; the workforce app is a mobile-first PWA with different
  information architecture and offline/network-only semantics, so it needed its
  own shell, feature routes, and composed components rather than a copy.
- **Building a full backend completion first.** The full Phase 9–10 backend
  completion (assignment candidates, close evidence linkage, transactional
  idempotency for ask/proceed/close/rate/message, reopen last-PIC resilience,
  timeline/messages cursor pagination, and dashboard filter expansion) is
  larger and was deferred rather than blocking the Member journey; the Member
  vertical slice was prioritized and the remaining contract work is recorded as
  outstanding.
- **Letting the client compute actions.** Rejected, because affordances must
  follow backend capability/object scope and the frontend must not be an
  authorization surface.

## Implementation Details

- `apps/api/src/voices/voices.service.ts`: partial `draftPatchSchema`, 30-day
  `expiresAt`, `listDrafts`, `dashboardMember`, richer `routeReadiness`,
  `routeTargetLabel`, enriched `detail`/`serialize`, `workItems` cursor query,
  and `actionSet` delegating to the pure action function.
- `apps/api/src/voices/actions.ts`: `computeAvailableActions(actor, voice)`
  returning e.g. `ASK`/`PROCEED`/`ASSIGN`/`REASSIGN`/`CLOSE`/`MESSAGE` for
  operators and `MESSAGE`/`RATE`/`REOPEN` for reporters, driven by ownership,
  handler, visibility, status, and closure/rating state.
- `apps/api/scripts/enrich-openapi.ts`: new `MemberDashboard`,
  `DraftListResponse`, `DraftListItem`, `ClosureCycleResponse` schemas,
  `attachments` on `VoiceDraftResponse`, notifications list query params, and
  enriched `VoiceDraftPreview`/detail base fields.
- `apps/web-voice`: typed `workforce-api`, `lib/formatters` (Indonesian labels,
  Asia/Jakarta timestamps), `lib/query` (session-scoped keys, idempotency key
  helper), `lib/useCursorPagination`, feature pages (Home, Create, Preview,
  History, Voice Detail, Notifications, Account) plus the responder slice
  (Work Items, General browse), and the `ActionPanel`/`ConversationPanel`/
  `MediaGallery`/`StatusSummary`/`DashboardChartCard`/`VoiceCard`/`Pager`
  components.

## Consequences

- The Member journey is fully wired end to end and the PWA precaches exactly
  the shell (the `/design` chunk stays excluded) and stays network-only for
  API/mutation/media/chat/private routes.
- Lifecycle actions appear only when the backend allows them, and every mutation
  is still rejected by the backend when it is stale or unauthorized.
- The action matrix is now unit-testable and locked at the backend; the
  frontend has no business rule about which actions exist.

## Validation

- `pnpm openapi:generate` + `pnpm openapi:check`: contract drift limited to the
  intended new/changed operations (pre-commit state).
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`: green across
  the monorepo (workforce PWA 12 precache entries, the design chunk excluded).
- `pnpm test:unit`: API 34 (including 9 new `actions.test.ts`), `packages/ui` 10,
  `packages/frontend-core` 9, `apps/web-voice` 12 (including 10 new formatter
  tests), `apps/web-admin` 2.

## Risks and Follow-up

- The full Phase 9–10 acceptance (assignment candidates endpoint, close evidence
  linkage, transactional idempotency for ask/proceed/close/rate/message, reopen
  last-PIC resilience, timeline/messages cursor pagination, assign/reassign
  `expectedVersion`, dashboard filters/suppression metadata, full responder and
  leadership matrix, and Playwright mocked/full-stack + visual regression) and
  the Phase 8.5 Admin journeys remain outstanding; the Frontend Complete Gate
  stays blocked until Phase 8.5 and Phase 11 pass.
- The Admin Voice Explorer still consumes the non-paginated detail contract; once
  detail/timeline/messages are paginated it must be updated as a compatibility
  consumer. This is out of scope until then.
