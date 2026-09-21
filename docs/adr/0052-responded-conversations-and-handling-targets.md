# ADR-0052: Responded conversations and cycle-based handling targets

- Status: Accepted; implemented and locally verified
- Date: 21 September 2026
- Supersedes: lifecycle and conversation-opening portions of ADR-0044 and ADR-0031
- Related: ADR-0032, ADR-0039, ADR-0042, ADR-0047

## Context

Acknowledgement previously required no explanation and did not permit conversation.
An opening explanation was only captured when active processing began. Assignment
therefore separated the Department Head from the eventual PIC's opening message,
while chat labels inferred sender identity from a single current handler. No
explicit completion commitment was stored for a handling cycle.

## Decision

The lifecycle is OPEN, RESPONDED, IN_PROGRESS and CLOSED. A trimmed 1–4,000-character
handling note is required for response and becomes the first message. Initial
assignment uses a two-step dialog but one server transaction: selection is not
persisted until the opening note is confirmed. Later assignment/reassignment
retains its optional reason and existing conversation. Processing is reserved for
the active PIC, or the route owner/Union Head when no PIC is assigned.

Processing requires an integer target of 0–365 calendar days without an automatic
selection. The server determines the Jakarta date at transaction time and stores
the final instant of the target calendar day in UTC. Zero means today. The UI
previews and displays the date and 23.59 WIB; it explains that the saved target is
server-authoritative. Targets are immutable within a cycle and are preserved when
reopening begins a new cycle. Chat is available while the new target is pending.

General conversation participants are reporter, route owner and active assigned
handler, deduplicated by account. Sender names are resolved server-side and new
messages store a name snapshot, preserving attribution after reassignment. Private
responses remain Komite and anonymous reporter identity is filtered before response
serialization. Participant names are clipped to eleven characters plus ellipsis
when longer than twelve; an accessible participant sheet exposes permitted full
names. Historical names without snapshots use the existing account/reporter
record, without pretending that a historical name was captured earlier.

## Implementation

A forward migration renames the status enum, preserves MONITORED event history,
adds RESPONDED/TARGET_SET events, target notification types, a nullable message
name snapshot, the handling cycle counter and VoiceHandlingTarget records. Existing
RESPONDED voices receive missing rooms without invented messages; versions increase
while original timestamps are preserved. Targets and name snapshots are not
fabricated for historical rows. Transient idempotency response status values are
normalized. The prior migration files are immutable.

POST /voices/:id/respond accepts text/version. Assignment accepts opening text
conditionally while OPEN. POST /voices/:id/proceed accepts days/version; POST
/voices/:id/target fills a missing target in an already-processing cycle. Monitor
and Ask endpoints return CLIENT_UPDATE_REQUIRED. Detail includes participants,
handlingCycleNumber and handlingTargets; message sender metadata includes safe
displayName or alias. The Admin aggregate key becomes responded. Filters, cache
version, generated clients and dashboard response-time aggregation change together;
response-time history includes the first MONITORED or RESPONDED event.

Response/assignment/target/close/reopen/message mutations share the Voice row lock
and existing idempotency envelope. A target has a unique voice/cycle constraint.
Reopen increments the cycle counter and keeps previous targets. Read serialization
computes overdue and completed-on-time/late from deadlines and closure timestamps,
independently of worker progress.

The overdue worker runs at the existing 30-second lifecycle cadence under
OUTBOX_ENABLED. It selects only current-cycle processing targets, locks the Voice,
rechecks status/cycle/deadline, and atomically records the notification marker,
notifications and outbox entries. Recipient IDs are deduplicated. Reporter and
route owner receive one notification each, including when the setter is the owner.
A stopped worker catches up when resumed; there is no daily reminder or escalation.
Close and reopen cannot race a notification into an obsolete cycle after winning
the same lock. Private push retains its generic body; in-app target text is
available only through existing notification recipient authorization.

The chat composer retains draft text/files until successful send and preserves
retry keys for unchanged payloads. New messages offer a jump-to-latest control
when the reader is away from the bottom. Existing dock, safe-area, attachment and
legacy WebKit behavior are retained.

## Rationale and alternatives

Opening chat at response supports coordination before a completion commitment.
Saving initial assignment and response separately was rejected because cancellation
would leave an unexplained acknowledgement. Calendar-day end targets match the
explicit operational choice and avoid timezone-dependent browser deadlines. Working
days would require an authoritative holiday calendar that is not part of this
contract. Immutable cycle targets preserve accountability; editable deadlines and
recurring escalation were excluded from this change.

## Consequences and risks

The enum and processing request contract require coordinated API, workforce and
Admin rollout. Existing release backup/maintenance procedures apply; an old backend
cannot simply be restarted against the renamed enum. Rollback requires coordinated
database recovery. Old PWA mutations fail closed rather than silently ignoring a
missing note or deadline. Historical response-time samples remain acknowledgement
samples, whereas new ones represent an explanatory response.

Targets do not guarantee completion and overdue does not automatically close or
escalate a Voice. A worker delay delays notification only. Exactly-once creation
of notification records does not imply exactly-once external Web Push delivery.
Existing read-only scopes, route ownership, Private identity and closure review
constraints remain authoritative.

## Validation plan and follow-up

Authoring included Prisma/client and OpenAPI generation, regression scenario updates
and formatting. Independent local verification followed completed implementation.
The delegated verifier must follow ADR-0047 and the current handoff using the pinned
toolchain and isolated Docker database. Coverage includes mandatory note/atomic
assignment, cancellation, three-party access and sender identity, Private aliases,
retry/version races, old/fresh schema migrations, calendar boundary/leap-day inputs,
0/365 bounds, immutable targets, reopen history, multi-worker deduplication and
close-versus-overdue races. Browser coverage includes four widths, accessibility,
failed draft retention, participant clipping/full-name access, target sheets and
native screenshots; legacy WebKit and fullstack remain required. Results and any
corrections are recorded in the handoff. No release delivery is performed here.

## Local validation results — 21 September 2026

Shared static and build validation passed, including 111 API and 126 workforce unit
tests, generated-contract stability, typecheck and the PWA gate (146,663-byte main
gzip). Integration 105, security 14, organization 5, performance 2 (448 ms p95), all
migration upgrades and fullstack 6 passed. The final affected frontend run passed
204 browser tests, six legacy WebKit cases and 170 native capture scenarios.
Response-note, overdue-target and three-party chat captures were inspected.

The verification corrections included canonical ISO target mutation responses for
idempotency replay and privacy-first own-message labels on Private chats. The
anonymous Private Union identity browser regression passes. Test fixtures and
cleanup were aligned with the new lifecycle/target relation. Runtime cleanup was
completed. These results establish local evidence only; hosted release and physical
push-device acceptance remain separate obligations.
