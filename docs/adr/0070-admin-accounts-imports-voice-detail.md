# ADR-0070: Admin password reset, responder logins, import completeness and full Voice detail

- Status: Accepted (implemented on a branch, not released)
- Date: 22 October 2026
- Related: ADR-0065 (login tracking), ADR-0066 (mandatory first password change), ADR-0068 (Division Admin), PRD §19

## Context

The CARE Admin reported four gaps in CARE Admin:

- Password reset looked gone. It still existed, but only behind a small arrow at the end of each row, on a page labelled read-only. A successful reset also closed its dialog without any confirmation.
- Responders (Group Leader up to Division Head) must be in CARE before their members report, but the Accounts page gave no view of their login state.
- The organization import accepted leaders whose unit columns were empty. A Group Leader without a Line or a Department Head without a Department breaks routing, and the only fix was editing the file and uploading again.
- The Voice Explorer showed a short drawer. Admins work only in CARE Admin, so they could not see what responders see: stages, deadlines, the completion comment and the reporter's rating.

## Decision

- **Reset password.**
  - Each non-CARE Admin account row has a visible **Reset** action, and the detail drawer keeps its own.
  - The API behaviour is unchanged: the password goes back to the default (No. Reg for workforce, username otherwise), every session ends, and a change is required at the next sign-in.
  - The dialog shows no temporary password. It says the old password was removed and that a workforce user signs in with the No. Reg only and then creates a password (ADR-0066).
  - The misleading read-only label is removed for the CARE Admin.
- **Responder logins.**
  - `GET /admin/accounts/responder-summary?division&department&section` counts active workforce accounts in the active snapshot by level: Group Leader, Section Head, Department Head, and Deputy/Division Head (the Division Leadership positions). It reports how many have logged in since tracking began (ADR-0065).
  - The summary follows the account list's unit filters. Clicking a level opens that level's accounts that have not logged in.
  - The list gains `responderLevel=GROUP_LEADER|SECTION_HEAD|MANAGER|DIVISION|ANY` and a Responder filter.
- **Import completeness.**
  - The preview lists leaders whose unit columns are empty: a Group Leader needs Line, Section, Department and Division; a Section Head needs Section, Department and Division; a Department Head needs Department and Division; a Deputy/Division Head needs Division. Members are not checked.
  - A blank Department counts as missing even though parsing still maps it to Department 14.
  - The list is stored in `summary.abnormalities`. Confirmation is refused with `IMPORT_INCOMPLETE_ORGANIZATION` until it is empty.
  - The admin completes the missing cells in place with `PUT /admin/organization-imports/:id/rows/:noReg`. The edits are stored in `ImportBatch.corrections` (migration `20261022090000_import_row_corrections`) and applied to the stored file's rows when the batch is processed.
  - Each edit bumps the preview version and writes `ORGANIZATION_IMPORT_ROW_CORRECTED`.
  - The preview's change counts are computed from the uploaded file and are not recomputed after edits.
- **Voice list and detail.**
  - The list shows the reporter under the title, the category, the PIC, time left in the current step (the handling target while Diproses, otherwise the level's response window) and the reporter's rating.
  - The title opens a full read-only page at `/voices/:id`, which replaces the drawer. The page shows status progress, severity, category, time left, PIC, detail and attachments, handling (route owner, target, tier stages, closure approval steps), the chat, the responder's completion comment with the reporter's rating at the end, the reporter card, a timeline with who did each step, and, for the CARE Admin, handover history.
  - The API adds `ratingScore` to list items, `tierDueAt` to the detail for non-reporters, and `actorName` to timeline events for CARE Admin and Division Admin.

## Alternatives considered

- Showing the temporary password after a reset: rejected by the product owner. The user sets their own password at sign-in.
- Warning about incomplete leaders but allowing confirmation: rejected. The admin chose to block until every row is complete.
- Asking for a corrected file: rejected. Edits in place avoid a second upload, and the original file stays the audit source.
- Keeping the drawer and adding fields: rejected. The detail is too long for a drawer.
