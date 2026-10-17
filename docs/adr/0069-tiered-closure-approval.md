# ADR-0069: Tiered closure approval by severity

- Status: Accepted (implemented on a branch, not released)
- Date: 17 October 2026
- Related: ADR-0059 (tiered routing), ADR-0064 (Private → Komite), PRD §17, Butuh Tindakan Saya (ADR-0060 follow-up)

## Context

Until now the PIC who processed a Voice closed it on their own (or the route Manager when no PIC was recorded). The product owner wants the leaders above the PIC to confirm the work before a Voice is closed, as a guarantee that the Manager actually checked it. How far up depends on the severity, and each level must answer quickly.

## Decision

- **Who closes, by severity (General Voices).** Low: the PIC. Medium and High: the Manager (route owner of the handling department). Critical: the Deputy/Division Heads of the handling division. A PIC at or above that level closes directly. Private Voices are closed by the Komite alone (a Union Officer no longer closes).
- **Lapor Sudah Selesai.** Below the closing level the PIC action is **Lapor Sudah Selesai** instead of **Selesaikan Voice**. The PIC writes the closure note and adds up to 5 evidence photos, as before. A `ClosureReport` stores them; the evidence stays referenced by the Voice until the closure takes it.
- **Approval chain.** Each level above the PIC up to the closing level approves in turn (`ClosureApprovalStep`), taken from the tiered-routing chain: Group Leader → Section Head of the reporter's Section → Manager → Deputy/Division Heads. Fixed categories are handled in the handling department, so only its Manager and Deputy/Division Heads approve. Empty levels are skipped; if no level is left, the report closes the Voice at once. Every leader of a level may approve (whoever presses first). The Voice keeps `closureApproverIds` (the level waiting now) and `closureReportedById` for fast scopes.
- **Setujui / Kembalikan / Tutup Voice.** Approvers only confirm; a note is required only to return. The last level's button reads **Tutup Voice** and closes it. **Kembalikan** sends the work back to the PIC with the reason (notification `CLOSURE_RETURNED`); the next report starts again from the first level.
- **Two working days per level.** Each level is due two working days (Admin working calendar) after it starts. Approvers get a notification when their level starts and a reminder every 24 hours. When the window passes the level stays waiting, is marked **Terlambat**, and gets one late notice.
- **Credit and timing go to the PIC.** The report counts as the PIC's completion at once: it shows in their **Selesai oleh saya**, leaves their **Perlu Diselesaikan**, and their completion time and target timeliness are measured at the report time (`ClosureCycle.completedAt`). The closure cycle is credited to the PIC (`actorId`); the closing approver is recorded on the `CLOSED` event. Handling-target reminders and overdue notices stop once the PIC reported. A Low Voice completes when it is closed.
- **Dashboard.** Butuh Tindakan Saya adds **Perlu Disetujui** (`summary.toApprove`, list `action=approve`) for leaders someone can report to (`summary.approves`): Section Heads whose Section has a Group Leader, Managers, Deputy/Division Heads. Group Leaders and Section Heads without Group Leaders keep four tiles.
- **Reporter.** The reporter sees status Diproses with "Menunggu persetujuan atasan" and no names or steps. They rate only once the Voice is actually closed, and the 2-day review window starts at that close, not at the PIC's report.
- **In-flight Voices.** Voices already in Diproses follow the new rules immediately.

## Alternatives considered

- Let the approval move up when a level misses its window: rejected, the level stays responsible and keeps waiting (Terlambat).
- Ask every approver for a note: rejected, a note is needed only when returning.
- Restart from the level that returned it: rejected, the whole chain sees the revised report.
- Count completion when the last approver closes: rejected, the PIC would be penalised for the leaders' approval time.

## Consequences

- New tables `ClosureReport` and `ClosureApprovalStep`, new Voice columns `closureApproverIds` and `closureReportedById`, `ClosureCycle.completedAt` (null on older closures, read as `closedAt`), new event and notification types.
- New endpoints `POST /voices/{id}/report-done`, `/approve-closure`, `/return-closure`; new actions `REPORT_DONE`, `APPROVE_CLOSURE`, `RETURN_CLOSURE`.
- Approvers are added to the work-item scope so they can open the Voice.
