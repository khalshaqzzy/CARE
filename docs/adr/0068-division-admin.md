# ADR-0068: Division Admin accounts in CARE Admin

- Status: Accepted (implemented on a branch, not released)
- Date: 16 October 2026
- Related: ADR-0064 (Private → Komite), ADR-0065 (login tracking), PRD §14.1, Admin › Voice Explorer and Accounts

## Context

The product owner is appointing one admin per division (the Manufacturing divisions and the Quality Division) to watch their division's Voices, follow up late or critical ones in person, and download them. They act like a Division Head who reads, but they must never become a responder. The only Admin-app account today is the CARE Admin, which reads everything (including Private with identity) and manages accounts, imports, routes and settings. A workforce account cannot carry this role either: its capabilities come from the structural position in the organization snapshot, so a Section or Department Head would still be routed Voices.

## Decision

- **A separate account kind, `DIVISION_ADMIN`.** It signs in to CARE Admin with a username and password (no No. Reg flow, no self-service reset) and is not admitted to the workforce app. Its scope is `adminDirectorate` + `adminDivision` on the account. A check constraint ties the scope to the kind, and a partial unique index allows one active Division Admin per division. The new enum value is added in its own migration, because PostgreSQL cannot use a new enum value in the transaction that adds it.
- **Reads, never acts.** The capability `DIVISION_ADMIN` browses every General Voice whose reporter belongs to its directorate and division (the Division Head rule), with reporter identity, timeline and chat (`LEADERSHIP_GENERAL_READ_ONLY`). Every action is refused, including chat messages. Follow-up happens on the floor, not in CARE.
- **Private is a count only.** The overview reports the division's Private total and active count. Private Voices stay with the Komite and their observers.
- **Export.** `GET /division-admin/export` returns an Excel file with a Voice sheet and a Chat sheet for the current filters, capped at 5,000 Voices, and writes a `DIVISION_VOICE_EXPORT` audit event.
- **Overview.** `GET /division-admin/overview` returns status counts, overdue and due-within-24-hours counts, active critical count, Private counts, an 8-week WIB trend, severity counts, the top handling departments ("Tujuan"), top reporters and top current PICs with how many of theirs are closed.
- **Division accounts.** `GET /division-admin/accounts` and `/accounts/login-summary` reuse the Admin accounts list and the login summary (ADR-0065), forced to the account's own division and to workforce accounts, read-only.
- **CARE Admin manages them.** Admin › Admin Divisi lists every division from the organization data with its admin. **Buat akun / Ganti** creates the account (temporary password = username, change required at first login) and deactivates the previous one. A username equal to an employee No. Reg is refused so the organization import cannot overwrite it. Reset password and deactivate use the existing Accounts actions; reactivation is refused while the division already has an active admin.
- **UI (variant B, chosen from rendered options).** A Division Admin lands on **Voice divisi**: status tiles (Terbuka, Direspon, Diproses, Selesai) that filter the list, chips for late and due-within-24-hours Voices, the Private count, and a collapsible one-row summary (trend, severity, Tujuan, top kontributor, top responder) above the existing Voice Explorer list, plus **Unduh Excel**. **Akun divisi** is the Accounts page in division mode. Every other Admin route redirects to Voice divisi.

## Alternatives considered

- Give each division admin a CARE Admin account: rejected, it would read and change everything, including Private identities.
- A flag on the person's workforce account: rejected, positions still make them responders and one account would mix two roles.
- A separate home page with short lists (variant A): rejected in favour of a single Voice page with the summary on top.
- A server-side Private list without content: rejected; counts were enough.
