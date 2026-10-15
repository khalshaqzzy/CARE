# ADR-0064: Private Voice handled by the Komite, read by the reporter's directorate

- Status: Accepted
- Date: 14 October 2026
- Related: PRD §6.5, §6.6, §14.1, §26.3, §43.8; ADR-0063 (amends its Director Private access)

## Context

Private Voices went to the Union Head. The Union Head could assign Union Officer 1 or 2, and the Director read every Private Voice company-wide. The product owner changed the routing:

- **Komite handles everything.** Only the existing Union Head account responds, processes and closes Private Voices. The app presents it as **Komite**, the name reporters already see. Union Officers are no longer used.
- **Directorate observers.** The Director and every Deputy/Division Head of the **reporter's directorate** join the Private Voice and its chat, read-only. Identity follows the reporter's choice. The reporter sees every one of them only as "Komite".
- **Notifications.** The observers are told when a Private Voice arrives and when it runs late.
- **Deadlines.** The per-severity respond and process deadlines apply. A miss notifies and leaves a note in the chat. It never escalates, because the Director already receives the Voice.
- **Division Head dashboard.** Private appears as a "Private" category in Sebaran Voice Masuk and in Voice Member, read-only. It never enters Butuh Tindakan Saya.
- **Director scope.** The Director reads only their own directorate's Private Voices and has no Butuh Tindakan Saya.
- **Reporter without a directorate.** A Private Voice from a reporter without a clear directorate goes to the Komite only.
- **Retiring Officers.** CARE Admin can deactivate Union Officers without replacing them.
- **Existing Voices.** Voices already submitted stay as they are; the trial data will be deleted.

## Decision

1. **Observers are derived, not stored.** `PolicyService.privateObserverScope` lets a Director or Deputy/Division Head read Private Voices whose `reporterDirectorateSnapshot` equals their own directorate. `private-observers.ts` lists the active observer accounts from the active snapshot for notifications. Organization changes apply without a migration, as the tier chain does.
2. **Actions.** `computeAvailableActions` drops `ASSIGN`/`REASSIGN` for Private. The Komite keeps `TAKE_OVER` for a Private Voice held by a deactivated Union Officer. Observers get no actions, so the chat is `READ_ONLY` for them.
3. **Reads are audited.** Director and Deputy/Division Head reads of Private Voices are audited like CARE Admin reads (`PRIVATE_*_READ`).
4. **Notifications.**
   - **Arrival:** `VOICE_SUBMITTED` reaches the Komite and the observers.
   - **Missed deadline:** a missed respond or process window (`TierEscalationService.missedAtRouteOwner`) notifies the Komite to act and tells the observers. It writes `DEADLINE_MISSED`, adds a system message when the chat is open, and never moves the Voice.
   - **Missed handling target:** this also notifies the observers.
5. **Deadlines.** Private Voices get the same respond window at submit and process window on the first response as fixed General categories. The existing Private backlog is not backfilled.
6. **Dashboards and lists.**
   - **Deputy/Division Head:**
     - The General aggregate (handling basis) appends a `PRIVATE` category bucket that counts their directorate's Private Voices under the dashboard's date, area, status and severity filters.
     - Voice Member gets the Director's **Jenis** filter (`GET /work-items?visibility=PRIVATE`).
   - **Director:** the Private aggregate and list are limited to their directorate. The scope label is "Private Voice direktorat".
7. **Komite in the Voice app.**
   - **Labels:** "Union" labels become "Komite" (role, eyebrow, chips, account kind), and the reporter's identity step says "Identitas kepada Komite".
   - **Assignment UI removed:** the "PIC Union" filter, the "Penugasan" filter, the pending-assignment queue and the "Belum ditugaskan" figure are gone.
8. **Admin.**
   - **Deactivating an Officer** ends its slot term and skips the open-Voice check, because the Komite takes those Voices over.
   - **The Union Head** still has to be replaced before deactivation.
   - **Imports and Overview:** imports no longer raise `UNION_OFFICER_MISSING`, and Overview counts only the Komite slot (`n / 1`).

## Consequences

- The Komite is a single shared account that carries every Private Voice. The workload is visible on its dashboard, not split per Officer.
- Observers depend on the active snapshot's structural positions. A directorate without a Director or Deputy/Division Head simply has no observers.
- The `PRIVATE` category bucket is not part of the General totals on the same card.
- The Union Officer accounts and the assignment endpoints remain for old Voices, and assignment is refused for Private.
