# ADR-0085: CARE Admin sees only the alias when a Private reporter hides their name

- Status: Accepted (implemented on `feat/admin-private-anonymous`, not released)
- Date: 17 November 2026
- Related: ADR-0018 (Union Private surface), ADR-0038 (Private contact consent), ADR-0064 (Komite and directorate observers), PRD §6.5, §50

## Context

A Private reporter chooses whether the Komite sees their name (`Voice.showReporterIdentity`). CARE Admin ignored that choice: the Voice Explorer detail returned `ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY` with No. Reg, name, directorate, division, department, section, position and line. Chat messages, the participant list and the Riwayat actor names also used the real name. The product owner decided that a hidden name stays hidden in the Admin app as well.

## Decision

1. **One rule.** `VoicesService.hidesReporter` is true for a Private Voice with `showReporterIdentity` not true, for every viewer except the reporter. CARE Admin is no longer an exception.
2. **Detail.** CARE Admin on such a Voice gets the new audience `ADMIN_PRIVATE_ANONYMOUS_READ_ONLY`: the base Voice, the contact consent snapshot and `anonymousReporter.alias`, with no reporter fields. An identified Private Voice still returns `ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY`.
3. **Chat, participants, Riwayat.** Messages and participants use the same alias the Komite sees. Admin timeline `actorName` shows the alias for events the reporter performed.
4. **Admin UI.** The Pelapor card shows "Alias" and "Pelapor menyembunyikan nama."
5. **Tracing.** No reveal button. The identity snapshot stays in PostgreSQL; the server owner reads it on the VPS when an investigation needs it.

## Consequences

- The Admin app no longer reveals anonymous reporters. Investigations need database access on the VPS, outside the app and outside its audit log.
- Read-only access and `PRIVATE_*_READ` auditing are unchanged. The Admin export already wrote "Private" without identity.
- The OpenAPI detail union gains `AdminPrivateAnonymousVoiceDetail`; clients that switch on `audience` must handle it.
