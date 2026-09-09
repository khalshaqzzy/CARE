# ADR-0044: Explicit monitoring and PIC-led processing

- Status: Accepted
- Date: 9 September 2026
- Supersedes lifecycle portions of ADR-0008, ADR-0031 and ADR-0032; preserves ADR-0033 handover boundary.

## Context

Verification previously combined acknowledgement, assignment and conversation access.
Proceed could bypass verification without an opening explanation or persisted handler.
A visible acknowledgement is needed before active handling, independently of assignment.

## Decision

The four states are OPEN, MONITORED, IN_PROGRESS and CLOSED. Reading detail has no
lifecycle side effect. Explicit monitoring acknowledges receipt through a reporter
notification and an immutable event. Assignment from OPEN performs the same acknowledgement
atomically; subsequent assignments do not repeat it. No chat is exposed before processing.

Only the assigned PIC may start processing; without assignment the route owner or Union
Head may start and becomes the effective handler. Trimmed text of 1–4,000 characters is
required and stored as the opening PIC message. One transaction contains conversation,
message, status, ownership, events and a single processing notification. Historical
ASKED_REPORTER events remain; the old ask endpoint returns CLIENT_UPDATE_REQUIRED.

Close retains existing authority and review semantics. Reopen returns directly to
IN_PROGRESS, resumes the existing conversation and displays a separate Dibuka kembali
badge. A deactivated handler falls back to an active route owner, recorded in the reopen
event. If neither is active the rating/reopen transaction is rolled back.

## Implementation

State/action policies drive availableActions and locked mutations. Assignment and
reassignment remain separate endpoints. A transaction-scoped advisory lock serializes
identical idempotency keys before replay/version checks. Voice row locks serialize
processing, assignment, message insertion, close and reopen.

The enum is renamed in a forward migration. Legacy verification records with messages
(including attachment-only messages) or reopen history become IN_PROGRESS; empty
verification records become MONITORED. Existing processing records receive missing
conversations and effective route-owner handlers. Affected versions increment once;
historical timestamps, events, messages and closure data are preserved. Transient
idempotency response envelopes normalize the retired verification status to
MONITORED so legacy retries cannot return an invalid API status. No synthetic
PIC statement or mass notification is produced. Upgrade reconciliation tests preserve
historical JSON and validate resulting state, version, room and handler.

The responsive detail has a four-column progress indicator, a status explanation,
explicit primary action and a required processing sheet. Reopened records retain the
primary Diproses label. Private destination labels remain Komite. Status filters,
aggregates, unassigned queues, Admin contracts and generated clients change together.
The non-sensitive PWA dashboard cache is versioned to exclude stale verification keys.

## Rationale and alternatives

Renaming only the display label would leave chat and ownership rules inconsistent.
Opening chat at monitor would defeat the distinction between acknowledgement and
active handling. Requiring another processing action on reopen would delay continuation
and is unnecessary because the conversation and ownership already exist.

Mapping every historical verification record to monitored would interrupt ongoing
conversations. Mapping every record to processing would misrepresent assignment-only
records. Message/reopen-based migration preserves the meaningful distinction.

## Consequences and risks

This is a coordinated API, workforce and Admin contract release. A maintenance window
and database backup are required; an old backend cannot run after enum migration.
Rollback is coordinated recovery, not simply deploying an old image. Historical
processing records may have empty conversations; new processing always requires text.

## Validation and follow-up

Validation covers fresh and upgrade migrations, replay/concurrency, role and Private
privacy matrices, mandatory note and first-message behavior, assignment notification
counts, inactive-handler fallback and closure races. Browser tests cover responsive
progress, required form, navigation and accessibility. Darwin and Linux x64 screenshot
baselines are verified separately. Actual command results are recorded in the session
handoff. Hosted release acceptance is separate from local implementation validation.
