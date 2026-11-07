# ADR-0081: Voice read state, chat read receipts and admin-managed quick replies

- Status: Accepted (implemented on `feat/voice-read-quick-answers`, not released)
- Date: 7 November 2026
- Related: ADR-0070 / ADR-0073 (Web Push on by default), ADR-0074 (app icon badge), ADR-0075 (Panduan admin pattern), PRD §16, §19, §45

## Context

Three gaps in the responder and member workflow were addressed together because they share the Voice detail, chat and action surfaces.

1. **Notification read state.** A notification became read only through the **Buka** button in the Notification Center or **Tandai semua dibaca**. A user who opened the same Voice from Home, Voice Member, Voice Saya, Daftar Kerja or a push banner still saw the bell count, the Notification Center and the Home Screen icon badge (ADR-0074) unchanged. Counts therefore drifted from what users had actually seen, and the badge lost its meaning.
2. **Chat read state.** `ConversationReadState` stored the last time each participant opened a chat and drove only the recipient's unread badge. Senders had no way to know whether the reporter, the PIC or the route owner had seen a message, which led to repeated follow-ups. PRD §16 had explicitly excluded read receipts.
3. **Response speed.** Responders typed the same opening, handover and closing sentences repeatedly in the Respons sheet, the Handover page and the Lapor Sudah Selesai / Tutup Voice dialogs. The wording also differed between departments. The sentences had to be maintainable by CARE Admin without a release.

## Decision

### 1. Notifications follow the Voice that was opened

- New endpoint `POST /api/v1/voices/{id}/seen` (CSRF, Idempotency-Key header like `conversation/read`). Within the detail scope it sets `readAt` on all of the actor's unread notifications for that Voice **except** `MESSAGE`, and returns `{ updated }`. A Voice outside the scope answers 404.
- `POST /api/v1/voices/{id}/conversation/read` also sets `readAt` on the actor's unread `MESSAGE` notifications for that Voice, in the same transaction as the read-state update.
- Chat notifications are therefore read only when the chat itself is opened; opening the detail page alone leaves them unread. This keeps "Pesan Voice baru" meaningful until the message can actually have been seen.
- The workforce app calls `seen` from both the detail page and the chat page (hook `useMarkVoiceSeen`), and `conversation/read` from the chat page. Each runs when the page is visible, again when the Voice changes (`updatedAt`), when the unread notification count changes while the page is open, and on `visibilitychange` back to the foreground. A non-zero `updated` invalidates the notification queries, so the bell, the Notification Center and the icon badge drop immediately.

### 2. Chat read receipts

- New table `MessageRead (messageId, accountId, readAt)` with a cascade foreign key to `Message`. `markConversationRead` inserts a row for every `USER` message from someone else in the conversation that is not yet recorded (`INSERT … SELECT … ON CONFLICT DO NOTHING`). `readAt` is therefore the **first** time the member opened the chat after the message arrived; later visits do not move it.
- `GET /voices/{id}/messages` adds `receipt { readBy[], unread[] }` only to the requester's own `USER` messages. Members counted are the current chat members from the existing participant logic: reporter, route owner or tier participants/holders, and the current handler, excluding the sender. CARE Admin, Division Admin, leadership and tier observers can read the chat but never appear in receipts.
- Identities follow the same masking as `participants` (`conversationMembers` now returns the real account id alongside the masked id, name and role): Private Voices show `Komite` to the reporter, and an anonymous reporter appears to the Komite only as the alias with the `anonymous-reporter` id.
- The UI shows WhatsApp-style ticks next to the time of each own message: one grey tick = sent and not yet read, two grey ticks = read by some members, two blue ticks = read by every member. Tapping the time/ticks opens **Info pesan** with **Dibaca oleh** (name, role, first read time) and **Belum dibaca**. System messages and other people's messages have no ticks. The chat also records a read when the app returns to the foreground, not only when a new message arrives.
- Migration backfill: for messages created at or before a member's existing `ConversationReadState.lastReadAt`, a `MessageRead` row is inserted with `readAt = lastReadAt`. Historical read times are therefore approximations (the last visit, not the first).

### 3. Jawaban Cepat (quick replies)

- New enum `QuickReplyPlacement` (`REPLY`, `PROCESS`, `ASSIGN`, `ESCALATE`, `HANDOVER`, `CLOSE`) and table `QuickReply` (placement, label ≤ 30, text ≤ 500, sortOrder, active, version, updatedById, timestamps), unique on `(placement, label)`.
- CARE Admin manages them on the new Admin page **Jawaban Cepat** (`/quick-replies`): places on the left with counts, an "as shown in the app" chip preview, and per entry reorder (up/down), an **Aktif** switch, edit and delete (with confirmation). The add/edit dialog has **Tempat**, **Nama**, **Isi** and **Aktif**.
- Admin API (`@Capabilities('CARE_ADMIN')`; Division Admin and workforce get 404): `GET /admin/quick-replies`, `POST /admin/quick-replies`, `PATCH /admin/quick-replies/{id}` with `expectedVersion`, `PUT /admin/quick-replies/order` with `{ placement, ids }`, `DELETE /admin/quick-replies/{id}`. Writes to one placement are serialised with a transaction-scoped advisory lock; at most 10 entries per placement (`QUICK_REPLY_LIMIT`), duplicate names return `QUICK_REPLY_LABEL_TAKEN`, stale versions `QUICK_REPLY_VERSION_CONFLICT`, and an order list that does not match the placement exactly `QUICK_REPLY_ORDER_STALE`. Every change writes an audit event with `resourceType = QUICK_REPLY` (placement, label and active state, never the full text diff).
- Workforce API: `GET /quick-replies` returns the active entries grouped by placement in display order.
- The migration seeds the starting set approved during design (Diterima, Cek lokasi, Minta detail, Koordinasi; Saya tangani; Diteruskan ke PIC; Perlu keputusan atasan, Di luar kewenangan, Butuh anggaran; Bukan area kami, Kategori lebih sesuai, Sudah dicek awal; Sudah diperbaiki, Kondisi normal, Sudah ditindaklanjuti, Sudah disosialisasikan).
- The responder app shows a horizontally scrollable **Jawaban cepat** chip row above the note in: the Respons sheet (per option: Balas pesan → `REPLY`, Proses sendiri → `PROCESS`, Tugaskan PIC → `ASSIGN`, Naikkan ke atasan → `ESCALATE`), the standalone Naikkan dialog (`ESCALATE`), the Handover page (`HANDOVER`), and the Lapor Sudah Selesai and Tutup Voice dialogs (`CLOSE`). A tap fills an empty note, replaces an untouched template, or appends on a new line when the responder has typed their own text. The text stays editable. Places without active entries show no chip row. The list is cached for five minutes per session.

### Bundle budget

The added UI pushed the workforce main chunk 11 bytes over the ADR-0026/ADR-0051 gzip budget. Following the established remedy, the Handover and Handover history routes are lazy-loaded (responder-only, occasional), which brought the main chunk from 166,651 to 147,036 bytes.

## Rationale

- A dedicated `seen` call instead of a side effect in `GET /voices/{id}` keeps reads free of writes; the detail is polled every three seconds and may be prefetched.
- Separating `MESSAGE` from other notification types matches what each screen actually shows: the detail page shows status and handling, the chat shows messages.
- Per-message rows give an exact first-read time for **Info pesan**. Deriving receipts from `lastReadAt` alone would show the latest visit as the read time for every older message. The row count is bounded by messages × members of one Voice.
- Counting only current chat members keeps the ticks meaningful ("everyone who should answer has seen it") and avoids exposing who among Admin or leadership monitored a chat.
- Database-backed quick replies with an Admin page follow the Panduan pattern (ADR-0075) and let wording change without a release; the limit keeps the chip row usable on a phone.

## Alternatives considered

| Alternative                                                    | Reason not chosen                                                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Mark notifications read inside `GET /voices/{id}`              | A polled, cache-friendly read would write on every poll and on prefetch.                      |
| Opening the detail also reads chat notifications               | Rejected by the product owner: a chat notification counts as read only once the chat is read. |
| Receipts computed from `ConversationReadState.lastReadAt` only | No per-message first-read time; every older message would show the latest visit.              |
| Include Admin/leadership readers in receipts                   | They are not chat members; listing them would expose monitoring and confuse "read by all".    |
| "Delivered" (two grey ticks after push delivery)               | Push is best-effort and per device; delivery does not mean a member opened CARE.              |
| Hard-coded quick replies in the app                            | The product owner asked for CARE Admin to add and edit names, text and places.                |
| Free-text placement or per-department sets                     | Not requested; fixed placements keep validation and the UI simple.                            |

## Consequences

- PRD §16 no longer excludes read receipts; presence (online/typing) remains out of scope.
- Two additive migrations in one file `20261107090000_message_reads_quick_replies` (tables, enum, indexes, backfill and seed). Safe to deploy before the code; the backfill runs once over existing messages and read states.
- `GET /voices/{id}/messages` performs up to three extra small queries when the page contains the requester's own messages (route owner, handler, tier holders and the `MessageRead` lookup).
- New OpenAPI schemas: `MessageReceipt`, `QuickReplyItem`, `QuickReplyGroups`, `AdminQuickReply`, `AdminQuickReplyList`, `QuickReplyCreateRequest`, `QuickReplyUpdateRequest`, `QuickReplyOrderRequest`; `MessageResponse.receipt` is optional.
- Push payloads, the service worker and Private push privacy are unchanged.

## Validation

- Integration `voice-lifecycle.integration.test.ts`: receipts list unread members, then partial and full reads in first-read order; a later visit keeps the first read time; other members see no receipt on someone else's message. `seen` reads a Voice's non-chat notifications only, leaves other Voices alone, and `conversation/read` reads the chat notification; an unknown Voice is rejected.
- Integration `quick-replies.integration.test.ts`: CARE Admin creates, rejects a duplicate name, reorders, edits (inactive entries hidden from responders), rejects a stale version, deletes and audits; the 10-entry limit; workforce accounts get 404 on the Admin endpoints.
- Browser `voice-read-quick-replies.spec.ts` (5 tests): detail calls `seen` and not `conversation/read`, chat calls `conversation/read`; ticks, "Info pesan" content and axe on the sheet; Respons chips fill, swap and append, per-option sets, request body; Lapor Sudah Selesai and Handover chips; Admin page add, deactivate and delete requests. Playwright inventory 500.
- Existing handover, lifecycle and closure-approval specs pass with the lazy-loaded handover routes; PWA compatibility gate passes.

## Risks and follow-up

- Backfilled read times are approximate for messages read before the release.
- Receipts reflect current members; after a reassignment the former handler disappears from receipts of older messages.
- If departments later need their own wording, a per-department scope can be added to `QuickReply` without changing the responder UI contract.
