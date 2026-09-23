# ADR-0053: Admin mediated General Voice handover and bounded chat viewport

- Status: Accepted
- Date: 23 September 2026
- Related: PRD §41–42; ADR-0031, ADR-0033, ADR-0052

## Context

Manager handover previously required the destination to be an active category route. Some General Voices need an Admin decision across departments. The product owner also requires Admin access to handover reasons. In the workforce chat, scrolling the page displaced the compact Voice card and composer while long names in the participant summary looked cramped.

## Decision

1. Only the current route owning Manager may request Admin handover for an unassigned, OPEN General Voice. Request requires a reason, expected version, and idempotency key. The Voice remains OPEN and its temporary route owner is the active CARE Admin with `handlerType=ADMIN_TRIAGE`; no processing or conversation action is granted to Admin by this ownership.
2. `AdminHandover` records the request, source route, Manager reason, decision, destination, category snapshot, Admin reason, and timestamps. One pending request per Voice is enforced in the database. All decisions lock and recheck the Voice row, version, actor, state, live destination, and category configuration.
3. Admin can route to any active department with exactly one active department PIC. A matching active operational category can be chosen. The current category is retained automatically when it still matches. If no active category matches, Admin must enter a Voice-only category label; this does not create or change a global category. The original submission classification remains immutable. Admin can return the Voice to its source Manager with a mandatory reason while the Voice stays OPEN.
4. Admin can read Manager-to-Manager notes and all Admin handover reasons in General Voice detail. Other roles retain the previous per-record note boundary. Timeline, notifications, audit summaries, and ordinary Voice DTOs never include these reasons. The destination PIC or returned Manager receives a generic notification.
5. The Admin desktop gains a queue, a focused decision workspace, live department/PIC/category options, and handover history in Voice Explorer. The workforce Manager flow gains a separate “Serahkan ke CARE Admin” option with explicit reason and confirmation.
6. Numeric No. Reg input of one through seven digits is normalized to eight characters with leading zeroes at login. Other identifiers are unchanged. The bottom plus affordance has a restrained halo pulse for workforce Members without responder, management, or Union capability; the reduced-motion variant uses a static ring. The highlight explicitly escapes the shared dock span clipping rule, while route selection semantics remain accurate.
7. Chat layout changes are scoped to the conversation route. Its compact Voice card, participant summary, and composer stay in a bounded viewport; only the message log scrolls. On desktop, the shell's single grid row fills the viewport so its main content does not collapse. The composer and image/send controls remain reachable. New messages scroll to the bottom only when the reader is already near it; loading older pages preserves the reading position. The three participant summaries use avatar, full accessible name, and role, with a sheet for complete details. Other Voice pages retain their existing layout.

## Consequences

- The interim Admin owner is a routing state, not a fifth lifecycle status or ordinary Voice handler.
- Custom operational category keys are stable Voice data and are aggregated by snapshot name; they cannot be edited through the category catalog.
- Admin reason access supersedes the Admin note exclusion in ADR-0033 and PRD §41. Other privacy boundaries remain.
- New API routes, enums, migration, generated contracts, and native visual references must ship together.
