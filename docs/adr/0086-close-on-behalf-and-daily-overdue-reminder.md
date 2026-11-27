# ADR-0086: Finishing for an overdue PIC, and a daily overdue reminder

- Status: Accepted (implemented on `feat/close-on-behalf`, not released)
- Date: 27 November 2026
- Related: ADR-0062 (Penanganan Khusus), ADR-0069 (tiered closure approval), ADR-0084 (closures credited to the PIC)

## Context

A PIC processes a Voice, sets a target, finishes the work and says so in the chat, but never presses Selesai or Lapor Sudah Selesai. The Voice then stays Diproses for good. Only the PIC could finish it. The target produced two notices: one reminder at 08:00 WIB on the target day, and one overdue notice to the PIC, the route Manager and the reporter. Nothing repeated after that.

## Decision

### 1. Tutup atas nama PIC for the leaders above the PIC

- Once the live day target has passed, `GET /voices/:id` adds `CLOSE_ON_BEHALF` for the leaders above the PIC.
- Those leaders are:
  - every level above the PIC's own tier in the Voice's chain (the same chain as closure approval);
  - the Manager who owns the route.
- The PIC, the reporter and Private Voices never get the action. Neither does a Voice in Penanganan Khusus or one already reported done.
- `POST /voices/:id/close-on-behalf` takes the same body as `close` (`note`, `version`), and the leader may attach evidence photos.
- The closure or report is the PIC's:
  - it is credited to the PIC (ADR-0084);
  - approval levels are computed from the PIC's tier (ADR-0069), so a Medium or higher Voice still goes through approval, and a Low one closes.
- The `CLOSED` or `CLOSURE_REPORTED` event records the leader as actor, with `onBehalf: true` and the PIC's `picId`.
- The PIC gets a notification: "Voice ditutup atas nama Anda" or "Voice dilaporkan selesai atas nama Anda".
- In the app, the blue button **Tutup atas nama PIC** sits where the PIC's own button would. This was chosen from rendered variants over a smaller button inside the target card. The dialog reuses the closure form, with "PIC: … · atasan tetap menyetujui" for Medium and higher.

### 2. CARE Admin as the last resort

- Two working days after the target (on the Admin working calendar), `GET /voices/:id` returns `CLOSE_ON_BEHALF` for CARE Admin.
- `POST /admin/voices/:id/close-on-behalf` takes a note and no evidence, and follows the same rules as the leader action.
- The Admin Voice detail shows the action under Pindahkan PIC. The Riwayat entry reads "… atas nama PIC".

### 3. Daily overdue reminder

- While the target is overdue, the Voice is still Diproses and nothing waits on approval, the PIC gets **"Voice belum diselesaikan · Target terlewati N hari."**
- It is sent every working day at 08:00 WIB, starting the working day after the overdue notice.
- `VoiceHandlingTarget.overdueRemindedAt` records the last reminder, so the reminder goes out once per day across workers.

## Consequences

- A Voice whose PIC forgets to finish it can be closed without moving the PIC or reopening anything, and the PIC keeps the credit, marked late against the target.
- The detail read for a leader resolves the PIC's tier and the chain only when the live target is overdue.
- One nullable column is added. No data change.
