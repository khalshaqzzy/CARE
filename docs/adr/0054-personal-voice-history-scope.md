# ADR-0054: Personal Voice history scope

- Status: Accepted
- Date: 24 September 2026
- Related: PRD §11, §18.7–18.8; ADR-0031

## Context

`/history` is labeled “Voice Saya” and “Voice milik Anda”, but its list uses `GET /api/v1/voices`. That endpoint calls `PolicyService.browseScope`, which deliberately returns the reporter's own Voices plus other General Voices in Manager, division leadership, or Director browse scope. A Section Head with only that capability already receives the own-only scope. CARE Admin receives the unrestricted scope but is rejected from the workforce app host. The personal dashboard uses `reporterId = actor.accountId`, so its counts and recent list can disagree with `/history`. The current member-only history browser test does not exercise elevated accounts, and the backend scope unit tests confirm the expanded browse behavior without asserting personal history behavior.

The immutable `Voice.reporterId` is set to the authenticated account ID on submission. Reporter name, No. Reg, organization, route owner, and current handler are distinct data and must not be used to infer ownership. The existing `[reporterId, status, updatedAt]` index supports a personal query; severity ordering may merit measurement with realistic data before adding an index.

## Decision

The personal history will use a dedicated authenticated `GET /api/v1/voices/mine` endpoint with the same filters, ordering, cursor, and response shape as the current list. It will require a workforce Member principal and always add `reporterId = actor.accountId` server-side. The client will not supply an account ID. `GET /api/v1/voices` will retain its existing browse semantics for General read surfaces, and `GET /api/v1/work-items` will retain operational scope. The `/history` route and filters will remain stable, while its API method and query key will identify the personal resource. Own General and Private Voices, including Closed and historical Voices after organization/role changes, remain visible.

Shared pagination/filter code should be factored so the two endpoints cannot drift; the policy scope must remain the first, mandatory `AND` predicate before optional user filters. A malformed or foreign cursor must not change that ownership predicate. The personal endpoint must not broaden access through role, route owner, handler, visibility, or organization. Non-workforce/Union/Admin actors must be rejected as a defense in depth even if their UI omits the route. If this endpoint is added, its static route must be registered before `voices/:id`.

## Implementation sequence

1. Add a focused integration regression with two workforce users in one organization and General plus Private Voices. Assert Manager, Section Head, division leadership, and Director personal results contain exactly their own IDs across filters and cursor pages; assert no other user's Private Voice appears. Assert the existing browse and work-item scopes still expose their intended General/assigned records.
2. Add `VoicesService.listMine` and `GET /voices/mine`; share the existing query parsing, filter, sort, pagination, and DTO projection with `list` while supplying a distinct server-owned scope. Reject accounts without workforce Member capability. Retain existing response format and status codes. Verify cursor paging and empty results, including when the account has no own Voices.
3. Regenerate OpenAPI and the typed workforce client; expose `listMyVoices`. Change `HistoryPage` to use it and a dedicated `mine` query key. Both submit entrypoints currently invalidate the singular `voice` key while history uses the plural `voices` key; explicitly invalidate the new personal-list key on successful submission so an already cached `/history` refreshes.
4. Extend browser coverage with a responder/management session where the mock distinguishes the broad list from `voices/mine`. Assert the `/history` request, ownership-only cards, navigation to own detail, and pagination/filter behavior. Keep the Member journey and General/Voice Member journeys green.
5. Run focused API security/integration and browser checks, OpenAPI byte check, typecheck/build, then the repository's selected `pnpm verify:local` gates. Assess the existing reporter index before deciding whether an additional index is necessary.

## Alternatives considered

- Changing `GET /voices` globally to own-only would break the authorized General browse surfaces and leadership Voice Member monitoring.
- Adding a client-only filter would still fetch other users' rows and would give incorrect pagination/counts.
- Adding `scope=mine` to the shared endpoint would be smaller, but a dedicated route makes personal ownership explicit in API contracts and less prone to accidental omission in future callers.

## Consequences and follow-up

This is a list-context correction. Existing role-authorized access to another General Voice through browse, work items, or direct detail remains governed by current policy; the fix does not claim that all access to those Voices is unauthorized. No Voice data migration or ownership rewrite is planned. If production reports show records whose stored `reporterId` is wrong, investigate that separate data-integrity issue before changing ownership data.

## Implementation and validation

The personal endpoint, shared list implementation, generated contracts, workforce client and page, submit cache invalidation, integration coverage, and browser regression are implemented. The existing `Voice` index beginning with `reporterId` is retained; no schema migration is needed for this scoped correction. A separate 50,000-Voice benchmark of the new endpoint has not been run, so a future measured regression would justify revisiting its index.

The selected local static/build/integration/security jobs passed, including 107 integration and 14 security tests. The focused workforce browser file passed 27/27 with two workers, including the new responder history test. An initial five-worker run had one unrelated receipt redirect timeout while the page was still checking its session. The full local runner stopped at the 10,000-account organization-import profile: its first attempt remained `PROCESSING` after 240 seconds, and an isolated repeat hit the test's 300-second timeout. That import fixture does not call the personal Voice list. Later performance, migration, full-stack, legacy, and capture jobs were not executed by the interrupted local runner. Hosted gates are not claimed.
