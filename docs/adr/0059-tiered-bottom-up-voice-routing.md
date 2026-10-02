# ADR-0059: Tiered bottom-up routing for Kesulitan Kerja and Kesejahteraan

- Status: Accepted (stage 1 implemented; stages 2 and 3 planned)
- Date: 2 October 2026
- Related: PRD §9.1, §9.3, §14, §15.4, §43; ADR-0029, ADR-0033, ADR-0053, ADR-0055, ADR-0058

## Context

General Voices in Fasilitas Kerja / Kesulitan Kerja and Kesejahteraan were routed to the Department Head of the reporter (or of the incident shop, ADR-0058). Most of these Voices are best resolved by the reporter's immediate supervisors — the Group Leader of the production line or the Section Head — before a Manager is involved. CARE had no concept of Group Leader or Line, no working calendar, and no automatic escalation (PRD §15.4 explicitly excluded it).

The organization file carried only `Noreg, Nama, Posisi (struktural), Directorat, Division, Department, Section` (optionally `Birth Date`). There was no link between a member and a Group Leader.

## Decision

Routing for the two categories becomes bottom-up: Group Leader (line leader) → Section Head → Manager → Deputy Division Head(s) and Division Head. The full design is recorded in PRD §43:

- The chain follows the reporter's organization. Kesejahteraan always does. Fasilitas Kerja does unless the incident is in another department's shop, in which case the Voice goes straight to that shop's Manager with an "outside reporter" badge.
- Respond and process windows apply at every tier, vary by severity, and are configured by Admin. Defaults: Low 2/3 working days, Medium 1/2, High 1/1, Critical 4/24 calendar hours.
- An unanswered Voice escalates with full ownership. A responded-but-unprocessed Voice brings the upper tier into the chat with Remind, Reassign, or Process. Anyone in the chat can Process. Escalation stops once the Voice is processed.
- Group Leaders and Section Heads cannot hand over sideways. They can escalate early with a reason. Only Managers hand over, while the Voice is not yet processed.
- Upper tiers see team Voices read-only under "Voice Tim Saya", with the current stage shown. Voices that need action are under "Voice Untuk Saya".
- Away delegation, severity changes until processed, Critical notifications to all upper tiers, and AI guidance toward Private Voice for complaints about superiors complete the model.

Delivery is split into three stages so that real Line and Group Leader data can be validated before Voices are routed to Group Leaders:

1. **Data and configuration (this change):**
   - Area and Line import columns;
   - the `GROUP_LEADER` capability with a Section Head–like dashboard;
   - reporter Line/Area snapshots on new Voices;
   - Admin working calendar and per-severity deadlines.
2. **Routing and actions:** chain start, read-only visibility, chat actions, outside-reporter badge, relaxed Manager handover, away delegation, severity changes, and Private Voice guidance.
3. **Automatic escalation:** a working-calendar-aware worker and its notifications.

## Rationale

- **Organization data.** Line and Group Leader come from the authoritative monthly file. Admin-maintained mappings were rejected: they would drift from HR data.
- **Column format.** The existing `Posisi (struktural)` column gains the value `Group Leader`, and `Area` and `Line` are appended after `Section`. Older 7- and 8-column files keep working.
- **Leader gaps are advisory.** Duplicate or missing leaders are reported in the import preview but do not block the import, because the routing rule (skip a level that is not exactly one person) degrades safely.
- **Group Leader capability.** Group Leaders share the Section Head dashboard scope. A Line-level dashboard dimension is deferred until Group Leaders handle Voices.
- **Calendar arithmetic.**
  - Working days are counted in WIB.
  - The time of day is kept, so a Voice submitted Friday 10.00 with one working day is due Monday 10.00.
  - A Voice submitted on a non-working day counts from 00.00 of the next working day.
  - Critical uses calendar hours, so emergencies are not delayed by weekends.
- **Settings changes.** Deadlines and calendar edits use optimistic versions and audit events, and apply only to deadlines computed afterwards. Limits are 30 working days and 720 hours, which prevents a misconfiguration from parking Voices for months.

## Alternatives considered

- **One release with all three stages.** Rejected: Group Leader data quality would be untested when routing changes.
- **Separate `Posisi` column for role level.** Rejected by the data owner; the existing column carries the new value.
- **Blocking the import on duplicate or missing leaders.** Rejected: one inconsistent Line would stop the whole monthly snapshot.
- **Fixed deadlines in code.** Rejected: operations want to tune them without a release.
- **Group Leader as part of the Section Head capability.** Rejected: the roles differ in later stages (scope, eligible assignees).

## Implementation (stage 1)

- **Prisma and migrations.** Migration `20261002090000_tiered_routing_foundation` adds:
  - `OrganizationMembership.lineName` and `area`;
  - `Voice.reporterLineSnapshot` and `reporterAreaSnapshot`;
  - `WorkingCalendarSetting`, `WorkingCalendarException`, and `EscalationDeadline`, seeded with the standard calendar and the default deadlines.
- **Import.** `ImportsService` accepts the optional `Area, Line` trailer (`parseArea`), detects Area/Line changes as updates, persists them, and adds `summary.tiers` (`tierSummary`) to the preview.
- **Capabilities.** `GROUP_LEADER` is added to the capability list, the session contract, the dashboard access check, the work-item and overview scopes, and the workforce navigation, home, account, and work-item views.
- **Working time.** `apps/api/src/escalation/working-time.ts` provides `addWorkingTime`, `isWorkingDay`, and `jakartaDateKey`.
- **Admin settings.** `EscalationSettingsService` and `AdminEscalationSettingsController` serve `/api/v1/admin/escalation-settings`. The Admin page is **Kalender & Eskalasi**, and the import preview shows an Area & Line readiness panel.
- **Contracts.** OpenAPI and contracts are regenerated. The browser inventory grows from 415 to 419 tests, and capture scenarios from 181 to 184.

## Implementation (stage 2, increment 1 — not released)

- **Schema.** Migration `20261003090000_conversation_read_state` adds `ConversationReadState` (conversation × account → `lastReadAt`).
- **API.**
  - Voice detail returns `unreadMessages`: messages from other senders after the viewer's `lastReadAt`.
  - `POST /voices/:id/conversation/read` upserts the read state.
  - `computeAvailableActions` grants `CLOSE` only to the current handler, or to the route destination for older Voices that never recorded a handler.
  - `TAKE_OVER` is available to an assigning superior when the handler account is no longer `ACTIVE`. `POST /voices/:id/take-over` is idempotent and version-checked; it ends the active assignment, makes the actor PIC, writes `REASSIGNED` with `takeOver: true`, and notifies the reporter.
- **Web.** The detail page is reordered (detail card, conversation with unread badge, handling section, timeline), the hero is simplified, the metadata rows are removed, and an **Ambil alih** alert with a confirmation dialog is added. The chat page marks the conversation read when the newest message changes.
- **Validation.** Unit tests for the close and take-over rules; integration tests for unread counts, take-over, and PIC-only close; a browser test for the badge and take-over flow. The browser inventory grows from 419 to 420.

## Implementation (stage 2, increment 2 — not released)

- **Schema.** Migration `20261003100000_system_message_kind` adds `MessageKind` (`USER`, `SYSTEM`) and `Message.kind` (default `USER`). Messages expose `kind`.
- **Respond.** `POST /voices/:id/respond` accepts an optional `days`. With it, the response message, the `RESPONDED` event, the handling target, `PROCEEDED`, and the actor as PIC are written in one transaction. The shared `applyHandlingTarget` also backs Proceed and Set target.
- **Handover.**
  - Handover is allowed from `OPEN` or `RESPONDED` while no PIC is assigned (`HANDOVER` action and `handoverAllowed`).
  - It sets `RESPONDED`, posts a `SYSTEM` message "Diteruskan ke [Department]", records `RESPONDED` on the first answer, and notifies the reporter generically.
  - `PolicyService.detailScope` lets a Manager keep reading a General Voice they handed over. It is not added to work lists, and they get no actions, so the conversation is read-only.
  - Admin handover requests remain `OPEN`-only, and the workforce handover page hides that option after a response.
- **Web.**
  - While `RESPOND` is available, the action panel shows one **Respons** button. The sheet offers Balas pesan / Tugaskan PIC / Handover / Proses sendiri, filtered by the available actions.
  - `CandidatePicker` and `TargetPresets` are shared with the assignment and target dialogs.
  - Chat renders `SYSTEM` messages as a centered note.
- **Validation.**
  - Unit: the handover action rules.
  - Integration: handover as a response (status, system messages, events, notifications, former-PIC read-only, pairwise note redaction) and the atomic Proses sendiri.
  - Browser: Respons sheet choices, handover routing, Proses sendiri request, Private sheet without Handover.
  - The browser inventory grows from 420 to 421.

## Implementation (stage 2, increment 3 — not released)

- **Schema.** Migration `20261003110000_handling_target_reminder` adds `NotificationType.TARGET_REMINDER`, `VoiceHandlingTarget.reminderSentAt`, and an index on `(reminderSentAt, dueAt)`.
- **Worker.** `HandlingTargetService.tick` now runs two guarded passes under the Voice row lock.
  - **Reminder:** at `handlingReminderAt(dueAt)` (08:00 WIB on the target day), it sends one `TARGET_REMINDER` to the PIC, or to the route owner when no PIC is recorded. Targets with `days = 0` are skipped, as are targets that are already overdue.
  - **Overdue:**
    - It sends one `TARGET_OVERDUE` to the PIC, `levelsAbove` (currently the route-owning Manager; stage 2 chain routing will add the GL/SH levels), and the reporter.
    - It writes a `TARGET_OVERDUE` Voice event and a `SYSTEM` chat message, both carried by the account that set the target and marked `system: true` in the event payload.
- **Lists.** `VoiceListItem.targetOverdue` is true when the latest target belongs to the live cycle, the Voice is `IN_PROGRESS`, and `dueAt` has passed. The list select reads only the latest target. The local performance suite stays within budget (dashboard p95 2.84 s).
- **Web.** `OverdueBadge` ("Terlambat") appears on the inbox, member, and history cards and in the detail hero.
- **Validation.**
  - Unit: the 08:00 WIB reminder time.
  - Integration: reminder once to the PIC across concurrent workers; same-day targets skipped; overdue fan-out to PIC, Manager, and reporter; the system chat note, the event, and the list flag.
  - Browser: the badge on the card and detail and the system note in chat.
  - The browser inventory grows from 421 to 422.

## Consequences

- Monthly organization files should add `Area` and `Line`. Uploading the old format clears both fields, and the preview warns about it.
- Group Leaders see the responder dashboard and Voice Member immediately. Their "Voice Untuk Saya" remains empty until stage 2.
- PRD §15.4 still holds until stage 3 ships for the tiered categories.

## Validation

- **Unit:** working-time arithmetic (WIB boundaries, weekends, custom holidays and extra working days, non-working-day start); Area/Line parsing (all four header layouts, area spellings, invalid area, incomplete trailer); tier summary duplicates and gaps; Group Leader navigation.
- **Integration:**
  - The new `tiered-routing-foundation` suite runs against Docker PostgreSQL. It covers import with Area/Line, readiness summary, persisted membership values, the `GROUP_LEADER` capability and dashboard, Voice Line/Area snapshot, seeded defaults, calendar versions and exceptions, and deadline validation, versions, and audit.
  - The existing suites pass, except for known timing flakes on the development laptop.
- **Browser:** the Admin escalation page at 1280 and 1440 px, the edit flow with request assertions, and the Group Leader dashboard.

## Risks and follow-up

- Line names repeat across Sections. Leaders are therefore matched by department, Section, and Line together.
- Stage 2 must define the Line-level "Voice Tim Saya" scope for Group Leaders and the read-only visibility queries without regressing dashboard performance.
- Stage 3 must use row locks shared with human actions, be idempotent across API instances, and recover missed deadlines after downtime.
