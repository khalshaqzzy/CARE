# ADR-0079: CARE Admin hands a General Voice to another PIC

- Status: Accepted (implemented on `feat/admin-pic-handover`, not released)
- Date: 5 November 2026
- Related: ADR-0059 (tiered routing), ADR-0069 (closure approval), ADR-0070 (Admin Voice detail page), PRD §41–§42 (Manager and Admin mediated handover), PRD §44

## Context

CARE Admin could read every Voice in the Voice Explorer but could not change who handles one. A General Voice could only move when its route Manager handed it to another category (§41) or asked CARE Admin to pick a department (§42). When a PIC was on long leave, had left the department, or the route was simply wrong for that Voice, operations had to ask the Manager to act or run an operator script. CARE Admin needed a direct way to move an active General Voice to a named responder.

Two parts of the existing model shape the solution:

- `Voice.routeOwnerId` is the PIC that owns the route, and `Voice.currentHandlerId` is the assigned handler. A responder's work list (`PolicyService.workItemScope`) reaches a route owner only when they hold the `MANAGER` capability. A Section Head or Group Leader reaches a General Voice only as its handler (or as a tier holder).
- Timeline event payloads are returned unfiltered to every audience, including the reporter. Handover reasons must therefore live outside the payload, as the Manager handover already does with `VoiceHandover.detail`.

## Decision

From the Admin Voice detail page (**Penanganan** card), CARE Admin can choose **Pindahkan PIC**, type a name or No. Reg, pick a responder from the matches, optionally write a reason, and confirm. The Voice then belongs to the new PIC.

Scope:

- General Voices in `OPEN`, `RESPONDED` or `IN_PROGRESS`. Private Voices stay with the Komite. Closed Voices and Voices waiting in the Admin handover queue (`handlerType = ADMIN_TRIAGE`) are rejected with `ADMIN_PIC_HANDOVER_INVALID_STATE`.
- Candidates are active workforce accounts that are responders: an active membership as Department Head, Section Head or Group Leader, or an active non-legacy route mapping (the same rules that grant `MANAGER`, `SECTION_HEAD` and `GROUP_LEADER` in a session). Division leadership, Directors and Members are not offered. Search needs at least two characters and returns at most ten matches.
- CARE Admin only (`@Capabilities('CARE_ADMIN')` and `policy.require`). Division Admin stays read-only.

Effect on the Voice, under the Voice row lock with `expectedVersion` and an idempotency key:

- `routeOwnerId` becomes the new PIC. A Manager target leaves `currentHandlerId` empty, so the Voice is theirs as route owner. A Section Head or Group Leader target also becomes `currentHandlerId`, because that is the only way their work list reaches the Voice. `handlerType` follows the target (`MANAGER`, `SECTION_HEAD`, `GROUP_LEADER`).
- The handling organisation snapshot moves to the target's unit (`handlingOrganizationSource = 'ADMIN_PIC_HANDOVER'`). `routeMappingId` points to the target's single department route when there is exactly one, otherwise it is cleared.
- The tier chain is cleared (`tierLevel` null, holders, observers, participants and closure approvers emptied) and a fresh due window is set (`RESPOND` for an `OPEN` Voice, `FULL` otherwise), as a non-tiered Manager handover does.
- `IN_PROGRESS` starts over as `RESPONDED`: the current cycle's handling target is removed and a pending closure report is returned with a fixed note, following the operator reroute rule. `OPEN` and `RESPONDED` keep their status.
- Open `VoiceAssignment` rows end; a new one is opened when the target becomes the handler.

Records and notices:

- New table `AdminPicHandover` (from/to PIC, previous handler, admin, previous status, optional reason). The reason is visible only through the CARE Admin handover history (`GET /admin/voices/:id/handover-history` now returns `picItems`).
- A `ADMIN_HANDOVER_ROUTED` Voice event with `source: 'ADMIN_PIC_HANDOVER'` and names only; the reason is never put in the payload. The workforce timeline already labels this event.
- An `ADMIN_PIC_HANDOVER` audit event with ids and a redacted reason marker.
- If the Voice has a conversation, a system message "Voice dialihkan ke {nama}" is posted with the new PIC as carrier, as the reroute script does.
- `HANDOVER_RECEIVED` notification to the new PIC; `STATUS_CHANGED` to the previous route owner and handler.

API:

- `GET /api/v1/admin/voices/{id}/pic-candidates?search=` → `AdminPicCandidates`.
- `POST /api/v1/admin/voices/{id}/pic-handover` with `AdminPicHandoverRequest { toAccountId, detail?, expectedVersion }` and `Idempotency-Key` → `VoiceMutationResponse`.

## Rationale

- Replacing the route owner moves the Voice away from the old PIC entirely, which is what an Admin reassignment is for. Making a Section Head or Group Leader the handler as well is required by the existing visibility model; without it the Voice would disappear from every work list.
- Restricting targets to responder positions keeps the lifecycle actions meaningful: a Member cannot respond, process or close.
- Restarting `IN_PROGRESS` avoids leaving a target date and a pending closure report that belong to a person who no longer handles the Voice, and matches the established reroute behaviour.
- A dedicated table keeps the Admin's reason out of reporter-visible payloads and leaves `VoiceHandover`, whose columns are category- and route-specific, unchanged.
- Reusing `ADMIN_HANDOVER_ROUTED` needs no enum migration and is already rendered for reporters as "Tujuan ditentukan Admin".

## Alternatives considered

| Alternative                                         | Reason not chosen                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Replace only the handler and keep the route Manager | The old Manager would keep the Voice; the product owner chose to replace the route owner.    |
| Allow any active workforce account                  | Members and leadership without responder actions could not move the Voice forward.           |
| Store the reason in the event payload               | Payloads reach the reporter's timeline unfiltered.                                           |
| Reuse `VoiceHandover`                               | Its required category, department and route columns do not apply to a person-to-person move. |
| Keep `IN_PROGRESS` and the old target               | The target and any pending report belong to the previous PIC.                                |
| Make the reason required                            | Not required by the product owner; it stays optional and is stored when given.               |

## Consequences

- The Voice Explorer is no longer purely read-only for CARE Admin. The page header and alert no longer say that Admin mutations are rejected. Private detail stays read-only and audited.
- Severity, category and the reporter's submission are unchanged.
- A tiered Voice handed to a new PIC leaves the tier chain; escalation continues only through the normal non-tiered due window.
- Migration `20261105090000_admin_pic_handover` adds one table with foreign keys and an index; it is additive and safe to deploy before the code.

## Validation

- Integration (`voice-handover.integration.test.ts`): candidate search by name returns responders only; non-admin, Member target, stale version, same PIC and closed Voice are rejected; `IN_PROGRESS` → `RESPONDED` with a Manager target (route owner set, handler cleared, old handler loses the work item, new Manager gets it and a notification); a Section Head target becomes route owner and handler and sees the Voice; history lists both moves with the reason; the reporter timeline never contains the reason.
- Browser (`admin-improvements.spec.ts`): the Penanganan card opens the form, searches the typed name, enables the button after a choice, and posts `toAccountId`, `expectedVersion` and the optional reason.
- OpenAPI and generated contracts regenerated; Playwright inventory 494.

## Risks and follow-up

- The candidate list resolves each match's role with a small query per match (at most ten); acceptable for an Admin-only form.
- If departments later need Admin moves for Private Voices, a Komite-specific variant is required; it is out of scope here.
