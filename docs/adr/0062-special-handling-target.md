# ADR-0062: Special handling as a target kind for long-running Voices

- Status: Accepted (implemented on a branch, not released)
- Date: 12 October 2026
- Related: ADR-0029, ADR-0059, ADR-0060 (operations dashboard), PRD §15.4, §15.5, §18.8.6

## Context

Processing a Voice requires a completion target of 0–365 days (PRD §15.4). Some Voices, typically those that depend on a budget decision, need long discussion and cannot be given a meaningful duration. Forcing a number either produces an arbitrary target that is soon missed, or lets the PIC choose a very long target that hides the real situation. A missed target raises a late badge, notifications to the PIC, the level above, and the reporter, and lowers the on-time figure in the responder performance dashboard.

## Decision

- **Special handling is a target kind, not a status.** The four statuses (Open, Direspon, Diproses, Selesai) are unchanged. A Voice under special handling remains Diproses and carries a small **Penanganan Khusus** badge. A fifth status was rejected because it is not a lifecycle stage, it would reach filters, KPIs, reporter counts, `statusGroup`, and the transition matrix, and converting back to a day target would need an extra transition.
- **Target options.** The target sheet has two tabs, **Target hari** and **Penanganan Khusus**. The day tab keeps the free number input (0–365), always editable by the PIC, with the quick choices Hari ini, 1, 3, 7, 14 days only filling that input. The special tab takes no duration, only a reason of 1–500 characters. Its confirmation button reads **Simpan**; day targets keep **Mulai diproses** / **Simpan target**. A single chip row with Penanganan Khusus as one more chip was considered and rejected in favour of tabs for a clearer separation.
- **No deadline semantics.** No reminder, no overdue notification, no Terlambat badge, no remaining-time label. Chat stays active.
- **Visible reason.** The reporter sees the badge and the reason. Private Voices show the reason under the committee alias, never the reporter identity. The reporter and the route-owning Department Head (Union Head for Private) are notified when it is set; Private push stays generic.
- **Close is refused while a cycle is under special handling** (`SPECIAL_HANDLING_REQUIRES_TARGET`). The Close action is replaced by **Tetapkan target**. This guarantees that a Voice closed after special handling always has a measurable target, so performance metrics remain consistent, and it prevents using special handling to close a Voice without ever being measured.
- **One-way, one-time conversion.** The effective PIC may convert special handling to a day target once. The converted target is immutable like any other. A day target cannot be changed to special handling. The cycle history keeps both steps. Time is measured from the conversion.
- **Reopen and legacy.** Reopen opens a new cycle without a target and does not inherit special handling. Cycles without a target (legacy data and reopened cycles) remain closable as before; the refusal applies only to cycles explicitly in special handling.
- **Dashboard.** While under special handling, a Voice is excluded from the on-time and late figures and shown as a separate count, **Penanganan Khusus: N**, so it cannot be used to hide work. After conversion it is counted normally. Actual duration is recorded when the Voice is closed.

## Rationale

The badge approach keeps the lifecycle small and fits the existing rule that late and reopen are derived markers rather than statuses. Refusing close until a target exists keeps duration reporting honest at the cost of one extra step for a PIC who finished a special-handling Voice; the Hari ini shortcut keeps that step light. Showing the reason to the reporter explains why a Voice takes long and removes the need for a separate explanation message.

## Alternatives considered

- A fifth status "Lainnya": rejected, see above.
- No new construct, only a very long day target: rejected because it hides intent and distorts overdue metrics.
- Mandatory review date for special handling: deferred. It guards against Voices that never move, but adds a field and a worker cycle. It can be added later without changing this design.
- Department Head approval of special handling: rejected as an added workflow.
- Allowing close directly from special handling: rejected, see above.

## Implementation direction

- Data: the handling target of a cycle gains a kind (`DAYS` or `SPECIAL`) and a reason. Existing rows are `DAYS` or without target, so the migration is additive. The conversion records the actor and time, and the cycle history exposes both.
- API: the process and set-target mutations accept either `days` or `special: { reason }`; a convert mutation accepts `days` for a cycle in special handling. Close returns `SPECIAL_HANDLING_REQUIRES_TARGET`. Voice list, detail, timeline, and notifications expose the kind and reason with the existing privacy rules. OpenAPI and contracts are regenerated.
- Worker: reminder and overdue selection skip cycles under special handling.
- Dashboard: handler performance and team on-time calculations exclude these Voices and add the separate count.
- Workforce UI: target sheet with the Target hari / Penanganan Khusus tabs and the reason field, badge on card and detail, reason block on detail, and Close replaced by Tetapkan target.

As built:

- `VoiceHandlingTarget` gains `kind` (`HandlingTargetKind`), `specialReason`, `specialSetAt`, and `specialSetById`; `days` and `dueAt` become nullable. A CHECK constraint ties the shape to the kind (DAYS: days and deadline present; SPECIAL: reason present, no days or deadline). The migration is additive and existing rows stay DAYS.
- The conversion updates the same row (kind DAYS, new `setAt`, `setById`, deadline) and keeps the special reason, so the history still shows both steps. The target row is the only record of the special period; the timeline event `TARGET_SET` carries `convertedFromSpecial`.
- Request bodies: `respond`, `proceed` and `target` accept `days` or `specialReason`, never both. List items carry `specialHandling`; detail targets carry `kind`, `specialReason`, `specialSetAt`, and state `SPECIAL`.
- Available actions: `SET_TARGET` stays while the live cycle is special, and `CLOSE` is withheld. The close mutation also answers `SPECIAL_HANDLING_REQUIRES_TARGET`.
- Dashboard: the unit view returns `specialHandling` and removes these Voices from the on-time ratio; handler rows drop them from held and late and return their own `specialHandling` count.
- Notification text for the reason is cut to 200 characters; the full reason stays on the Voice.
- The migration relaxes two NOT NULL constraints. The changed-migration guard in `scripts/check-migrations.mjs` previously rejected every `DROP`; it now accepts `DROP NOT NULL`, which only widens a column, and still rejects dropping tables, columns, types, or data.

## Consequences

- A Voice under special handling can stay Diproses indefinitely; the dashboard count is the control.
- Performance figures remain comparable because converted Voices are measured from the conversion, not from the original start.
- The target sheet is shared by the Respons, Mulai penanganan, and Tetapkan target flows and must stay consistent across all three.

## Validation plan

- API integration: process with special handling, reason bounds, close refusal, conversion once, refusal of day-to-special, reopen without inheritance, legacy no-target close, Private privacy of the reason, notification recipients, and that the worker sends nothing for these cycles.
- Dashboard tests for exclusion and the separate count.
- Browser: sheet choices and button label, badge and reason on card and detail for reporter and PIC, replaced Close action, keyboard and axe checks, and visual captures at mobile and desktop widths.

## Risks

- Overuse of special handling to avoid lateness; mitigated by the visible separate count and the reporter-visible reason.
- Voices that never move; a review date is the prepared follow-up.

## Follow-up work

- Implement the schema, API, worker, dashboard, and UI changes above.
- Reconsider a review date if long-running Voices accumulate.
