# ADR-0059: Tiered bottom-up routing for Kesulitan Kerja and Kesejahteraan

- Status: Accepted (stage 1 released to staging; stages 2 and 3 implemented on a branch, not released)
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
- **Leader gaps are advisory.** Duplicate or missing leaders are reported in the import preview but do not block the import, because routing handles both: several leaders hold a level together, and an empty level is skipped. (Amended 3 October 2026: duplicates were skipped before; the product owner decided they share the level.)
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

## Implementation (stage 2, increment 4 — not released)

- **Schema.** Migration `20261003120000_draft_tm_position` adds `VoiceDraft.positionSection` and `positionLine` (null means "Tidak di Line").
- **Module.** `src/voices/tm-position.ts` holds the TM rules:
  - `isTmNoReg` detects TM members by the `TM` noReg prefix (case-insensitive).
  - `positionOptions` lists the department's Sections and Lines from non-TM memberships in the active snapshot, plus the last valid choice from the reporter's most recent Voice.
  - `isValidPosition` checks a choice against those options.
  - `positionArea` takes the area from the chosen Line's members, falling back to the Section's.
- **API.**
  - `GET /drafts/position-options` returns `required` (false for non-TM members), `sections`, and `last`.
  - Draft create and patch accept the position only from TM members and only when it is valid (`POSITION_INVALID`).
  - Submit rejects a TM draft without a valid position (`POSITION_REQUIRED`, 422). It snapshots the chosen Section and Line, with the area from that placement, instead of the file values. The department snapshot is unchanged.
- **Web.**
  - `TmPositionCard` (variant B) sits under the location card. Its Section and Line selects are prefilled from `last`. A Section without Lines settles on "Tidak di Line".
  - "Simpan & Analisis" stays disabled until the position is complete. The fields stack below 480 px.
- **Validation.**
  - Unit: the TM prefix and position validity.
  - Integration (foundation suite): options for TM and non-TM members, rejected invalid positions, `POSITION_REQUIRED` on submit, the snapshot, and the last choice.
  - Browser: prefill, the "Tidak di Line" request, and the gating.
  - The browser inventory grows from 422 to 423.

## Implementation (stage 2, increment 5a — not released)

- **Schema.** Migration `20261003130000_tiered_routing_core` adds:
  - `TierLevel` (`GROUP_LEADER`, `SECTION_HEAD`, `MANAGER`, `DIVISION`) and `HandlerType.GROUP_LEADER`;
  - `GeneralVoiceCategory.tiered`, seeded true for `WORK_DIFFICULTY` and `WELFARE`;
  - on `Voice`: `tierLevel`, `tierPath`, `tierHolderIds` (GIN index), and `outsideReporter`.

  Existing Voices keep `tierLevel = null` and the classic route.

- **Chain.** `src/voices/tier-chain.ts` `resolveTierChain` builds the chain from the active snapshot:
  - the Group Leader of the reporter's Line and the Section Head of their Section (every active leader of that Line or Section holds the level together, and whoever presses Proses becomes the PIC; an empty level and outside reporters skip it);
  - the route-owning Manager;
  - every active Deputy/Division Head of the handling division.

  Levels at or below the reporter's own position are dropped. TM reporters use their chosen Section/Line.

- **Submit.** It stores the first level as the holder and the levels found as `tierPath`, and notifies the holders instead of the Manager. `outsideReporter` is set when a tiered Voice's handling department differs from the reporter's department.
- **Authorization.**
  - `computeAvailableActions` treats the holders as the owner of a tiered Voice. Handover is allowed only at the Manager tier.
  - `mayAct` admits holders.
  - `workItemScope` lists Voices the actor holds and drops tiered Voices from the route Manager's list until they hold them.
  - Processing records the PIC type of the processing tier.
  - Handover to a tiered category restarts at the destination Manager (`tierPath` Manager → Division). Handover to a classic category clears the tier.
- **Detail.** Detail exposes `tierLevel` and `outsideReporter`. Chat participants list the holders with roles from their position (`GROUP_LEADER`, `SECTION_HEAD`, `DEPARTMENT_HEAD`, `DIVISION_LEADER`). Message notifications go to the holders.
- **Web.** The hero shows **Pelapor dari luar department** to responders. Chat role labels cover Group Leader and Division. The Respons sheet for a Group Leader or Section Head offers Balas pesan and Proses sendiri.
- **Validation.**
  - Unit: tier ownership in actions, policy scopes, `nextTierLevel`.
  - Integration: Group Leader start, Section Head when the Line has no leader, a Group Leader's own Voice starting at the Section Head, the Manager being read-only and excluded from work items, the Group Leader processing as PIC, and the outsider shop Voice starting at the shop Manager with the badge.
  - Browser: the holder's sheet and the badge.
  - Inventory 423 → 424.
  - The local organization dashboard p95 (3.4–3.6 s) is the same on the previous commit, so it is host load rather than this change.

## Implementation (stage 2, increment 5b — not released)

- **Schema.** Migration `20261003140000_tiered_actions` adds:
  - `Voice.tierLowerHolderIds`;
  - `Voice.tierObserverIds` (GIN index);
  - `Voice.sectionHasGroupLeader`;
  - the `ESCALATED`/`REMINDED` events and `ESCALATED`/`REMINDER` notifications;
  - `VoiceReminder`, unique per Voice, actor, target, and WIB day.
- **Actions.**
  - `ESCALATE` goes to the newest holder while `tierPath` has a later level, no PIC is assigned, and no lower holder is waiting.
  - `REMIND` goes to the newest holder when a PIC is assigned or lower holders exist.
  - Tiered `ASSIGN` is available at the Manager and division levels, and at the Section Head level only when `sectionHasGroupLeader`.
- **Escalate.** `POST /voices/:id/escalate` (reason 1–500 characters, version-checked, idempotent) re-resolves the chain on the active snapshot and takes the next present level. It is the manual Naikkan, and it counts as a response:
  - the status becomes `RESPONDED` (with a `RESPONDED` event when the Voice was open);
  - the chat opens with a SYSTEM note "Diteruskan ke [Level]";
  - the new level becomes the only holder;
  - the former holders join `tierParticipantIds` (migration `20261003150000_tier_chat_participants`): they may read and message but have no lifecycle actions.

  It notifies the new holders with the reason and the reporter with the destination level only.

- **Lower holders and observers.** `tierLowerHolderIds` (Ingatkan) and `tierObserverIds` (read-only) are reserved for the stage 3 automatic escalations:
  - **answered but unprocessed:** the upper tier joins beside the responder;
  - **unanswered:** the Voice stays open and the former holder becomes an observer.

  A manually raised Voice that times out moves up again with a chat note and keeps its `RESPONDED` status.

- **Remind.** `POST /voices/:id/remind` targets the assigned PIC or the lower holders and inserts `VoiceReminder` rows (duplicates skipped). It rejects with `REMINDER_LIMIT` when everyone was already reminded that day. It sends notifications only and records a `REMINDED` event.
- **Assignees.** `tierAssignees` lists the people a holder may assign (the same rules as `ASSIGN` above). Assignment validates against that list and records the PIC type from the assignee's position. `workItemScope` also lists Voices assigned to a Manager.
- **Read access.** `detailScope` lets former holders (`tierObserverIds`) read, and returns the match-all scope unchanged for CARE Admin.
- **Web.**
  - The Respons sheet gains **Naikkan ke atasan** (reason). It is ordered before Proses for Group Leaders and Section Heads and last for upper tiers.
  - After Direspons the panel shows **Naikkan** (reason dialog) and **Ingatkan**.
  - The timeline labels "Dinaikkan ke atasan" and "Diingatkan".
  - The panel keeps its confirmation when an action leaves no further actions.
- **Validation.**
  - Unit: escalate and remind rules, and Section Head assignment gating.
  - Integration: unanswered and answered escalation, observer read-only, Section Head assigning the Group Leader, remind limit, Manager assigning skipped levels, top of chain.
  - Browser: Naikkan from the sheet with a reason, and Ingatkan.
  - Inventory 424 → 426.

## Implementation (stage 2, increment 5c — not released)

- **Principal.** The principal carries `line` from the active membership.
- **Browse scope.** `browseScope` adds team reads:
  - Section Head: General Voices with the same reporter department and Section;
  - Group Leader with a Line: the same department, Section, and Line.
- **Dashboard.** The Group Leader's REPORTER-basis dashboard in OWN scope adds `reporterLineSnapshot`.
- **Stages.** Detail adds `tierStages` for non-reporters on tiered Voices: one entry per `tierPath` level, with `DONE`/`CURRENT`/`NEXT` and the names resolved on the active snapshot (`chainForVoice`).
- **Web.**
  - `TierStages` (variant A vertical list) sits in Penanganan.
  - Chats with more than three participants collapse to up to five avatars, "+N", and **Detail**. Smaller chats keep the named participant row.
- **Validation.**
  - Unit: team browse scopes.
  - Integration: the Section Head reads a team Voice without actions, with stages; the reporter gets no stages; a Group Leader cannot read another Line's Voice.
  - Browser: stages and the collapsed chat.
  - Inventory 426 → 427.

## Implementation (stage 2, increment 6 — not released)

- **Schema.** Migration `20261003160000_away_periods` adds `AwayPeriod` (account, substitute, `startsOn`/`endsOn` as WIB DATEs, `endedAt`) and `NotificationType.AWAY_SUBSTITUTE`.
- **API.** `src/away` serves `GET/POST /me/away` and `POST /me/away/end` for Group Leaders and above.
  - `substituteCandidates` lists the same level or one level up in the leader's unit.
  - One open period at a time; a new one replaces it.
  - The start date may not be in the past; the period is at most 60 days.
  - Setting and ending a period are audited (`AWAY_PERIOD_SET`/`ENDED`), and the substitute is notified.
- **Virtual delegation.** Nothing is reassigned.
  - The principal carries `actingFor`: today's active periods naming the account as substitute.
  - `computeAvailableActions`, `mayAct`, and `workItemScope` treat those accounts as the actor's own for route ownership, holding, chat participation, and PIC rights.
  - The delegation ends by itself when the period ends or on "Aktif kembali".
- **Notifications and routing.**
  - `VoicesService.notify` and the handling-target worker also notify an away recipient's active substitute.
  - `resolveTierChain` drops accounts that are away with an away substitute (`unreachableAccounts`), so their level is skipped.
- **Web.** Account shows **Sedang tidak masuk** to leaders. `/account/away` has dates plus substitute cards, and the active or scheduled card offers **Aktif kembali** / **Batalkan**.
- **Validation.**
  - Unit: a substitute's actions, including closing as PIC.
  - Integration: candidates and validation, substitute notice, the held Voice in the substitute's work items with actions and notifications, level skipped when both are away, Aktif kembali.
  - Browser: set and end a period.
  - Inventory 427 → 428.

## Implementation (stage 2, increment 7 — not released)

- **Schema.** Migration `20261003170000_severity_change_private_hint` adds `VoiceEventType.SEVERITY_CHANGED` and `AIClassification.privateSuggested`.
- **Severity.**
  - `CHANGE_SEVERITY` is available to anyone who can operate an open or responded Voice.
  - `POST /voices/:id/severity` (severity plus a reason of 1–500 characters, version-checked, idempotent) updates `Voice.severity` and records `{ from, to, reason }`. It rejects an unchanged value (`SEVERITY_UNCHANGED`) and any change after processing.
  - The submission classification stays immutable.
  - Stage 3 windows count from the latest change.
- **AI hint.**
  - The classification tool gains a required boolean `privateSuggested` (prompt v1.8). The parser stays tolerant.
  - The flag is stored only for General drafts and exposed on the classification preview.
  - The review step offers **Ubah ke Private Voice**, which switches visibility and returns to the form.
- **Validation.**
  - Unit: the severity rule, and the tool schema and wire contract with `privateSuggested`.
  - Integration: severity change with reason, unchanged rejection, reporter forbidden, locked after processing.
  - Browser: the severity dialog and the Private hint.
  - Inventory 428 → 430.

## Implementation (stage 3 — not released)

- **Windows.** Migration `20261003180000_tier_windows` adds:
  - `Voice.tierDueAt`, `tierDueKind` (`RESPOND`/`PROCESS`), and `tierHolderResponded`;
  - an index on `(tierDueAt, status)`.

  `src/escalation/tier-window.ts` computes a window from the severity row of `EscalationDeadline` and the working calendar: `RESPOND`, `PROCESS`, or `FULL` (respond + process, stored as `PROCESS`).
  - **Set on:** submit (RESPOND), own response (PROCESS, holder answered), manual Naikkan / tiered handover / Tugaskan (FULL).
  - **Restarted on:** a severity change.
  - **Cleared on:** Proses.

- **Worker.** `TierEscalationService` ticks every 60 s when the outbox is enabled. It takes up to 50 overdue Voices and runs each under the shared row lock with a re-check.
  - **Open:** the next present level (re-resolved on the active snapshot) takes over with a RESPOND window; the former holders become observers.
  - **Answered by someone below, not processed:** the next level takes over with a FULL window; the former holders become chat participants; a SYSTEM chat note is posted; the status stays `RESPONDED`.
  - **Holder answered or assigned, not processed:** the next level joins (holders plus lower holders) with a PROCESS window and a SYSTEM note.
  - **Top of the chain:** the window is cleared.
  - **Records:** each step writes an `ESCALATED` event marked `automatic` and `system`, carried by the former holder, and notifies the new holders, the former holders, and the reporter.
- **Fixed categories.** Assigning a PIC on any General Voice starts a FULL window. When it passes on a classic Voice, the worker moves the Voice onto the Manager tier: route owner as holder, PIC as lower holder, `tierPath` Manager → Division. A further miss then brings in Deputy/Division Heads through the tiered rules.
- **Critical.** Migration `20261003190000_critical_voice_notice` adds `NotificationType.CRITICAL_VOICE`. `notifyCritical` runs at submit and when severity is raised to Critical:
  - for tiered Voices, every chain member except the holders;
  - for fixed categories, the reporter's own Department Head(s) other than the route owner (read-only).
- **Validation.**
  - Integration, tiered: windows at submit and response; each automatic case; racing workers escalate once; Proses and the chain top stop the clock; Critical alerts on submit and on severity change.
  - Integration, fixed categories: a missed assignment moves to the Manager tier; a Critical fixed-route Voice alerts only the reporter's Manager.

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

## Follow-up — fixed-category deadlines (8 October 2026)

The product owner ruled that every General Voice has a deadline, not only tiered categories.

- **Windows:** fixed categories now get the same per-severity windows. The respond window starts at submit; the process window starts when the route owner answers. A handover to a fixed category gives the receiving Manager respond and process together.
- **A miss at the route owner** does not move the Voice:
  - The worker records `DEADLINE_MISSED`, tells the Manager to act now, and informs the handling division's DDH/DH.
  - It does this once per deadline (`Voice.tierMissedDueAt`), so the queue is not starved by repeat candidates.
  - The miss counts against the Manager's timeliness, alongside automatic escalations and missed targets.
- **Assigned PIC misses** keep the existing behaviour: the Voice joins the Manager tier (Ingatkan / reassign), then DDH/DH.
- **Backfill:** active fixed Voices without a deadline are backfilled in small batches on each tick from when their window began. Only severities with a configured deadline are considered.
- **Card display:** list items carry `targetDueAt` so Diproses cards count down to the live handling target.
