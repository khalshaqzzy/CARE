# Capture and Concept Manifest

Current captures berada di `.agent/design-images/member-voice-redesign/current/`; target terpilih berada di child folder `.design/member-voice-redesign/`.

| No. | Page / state                  | Role                   | Current                               | Final                                              | Primary gap resolved                                      |
| --: | ----------------------------- | ---------------------- | ------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
|  01 | Login                         | All                    | `01-login.png`                        | `auth/01-login.png`                                | Hierarchy, trust, and clearer authentication CTA          |
|  02 | Temporary password            | All                    | `02-temporary-password.png`           | `auth/02-temporary-password.png`                   | Password rules and progressive security feedback          |
|  03 | Member Home                   | Member                 | `03-member-home.png`                  | `member-home/03-member-home.png`                   | Core design retained; spacing and polish improved         |
|  04 | More sheet                    | Member                 | `04-more-sheet.png`                   | `member-home/04-more-sheet.png`                    | Mobile navigation discoverability and safe-area handling  |
|  05 | Voice type                    | Member                 | `05-voice-type.png`                   | `create-voice/05-voice-type.png`                   | Distinct route choice with taller solid-cobalt selection  |
|  06 | General form                  | Member                 | `06-general-form.png`                 | `create-voice/06-general-form.png`                 | Calm composer, attachment shelf, and clearer hierarchy    |
|  07 | Private form + consent        | Member                 | `07-private-form.png`                 | `create-voice/07-private-form.png`                 | Consent prominence and privacy comprehension              |
|  08 | AI analysis                   | Member                 | `08-ai-processing.png`                | `create-voice/08-ai-processing.png`                | Focused processing state without visual noise             |
|  09 | Manual fallback               | Member                 | `09-manual-fallback.png`              | `create-voice/09-manual-fallback.png`              | Recoverable AI failure with clear manual controls         |
|  10 | General preview               | Member                 | `10-general-preview.png`              | `create-voice/10-general-preview.png`              | Scannable classification and submit confidence            |
|  11 | Private preview               | Member                 | `11-private-preview.png`              | `create-voice/11-private-preview.png`              | Final privacy review and consent visibility               |
|  12 | Voice Saya                    | Member                 | `12-history.png`                      | `history/12-history.png`                           | Status-first history scanning and filtering               |
|  13 | Reporter conversation         | Member                 | `13-reporter-conversation-detail.png` | `voice-detail/13-reporter-conversation-detail.png` | Tasteful summary, timeline, conversation, attachment      |
|  14 | Closed, rating, reopen        | Member                 | `14-closed-rating-reopen.png`         | `voice-detail/14-closed-rating-reopen.png`         | Clear closure state, feedback, and reopen affordance      |
|  15 | Notifications                 | Workforce              | `15-notifications.png`                | `notifications/15-notifications.png`               | Priority/read-state hierarchy and compact grouping        |
|  16 | Account                       | Workforce              | `16-account.png`                      | `account/16-account.png`                           | Cleaner identity, settings, and security structure        |
|  17 | Manager dashboard             | Manager / Section Head | `17-manager-dashboard.png`            | `manager/17-manager-dashboard.png`                 | Member-core continuity plus operational overview          |
|  18 | Voice Member inbox            | Responder              | `18-operational-inbox.png`            | `manager/18-operational-inbox.png`                 | Severity-first queue, search, filters, and PIC visibility |
|  19 | Responder action sheet        | Responder              | `19-responder-action-sheet.png`       | `manager/19-responder-action-sheet.png`            | Evidence-backed close flow in a focused bottom sheet      |
|  20 | Leadership overview           | Leadership             | `20-leadership-read-only.png`         | `leadership/20-leadership-read-only.png`           | Executive aggregate with explicit read-only affordance    |
|  21 | Union Home                    | Union Head             | `21-union-home.png`                   | `union/21-union-home.png`                          | Private workload, assignment queue, and General summary   |
|  22 | Union Private inbox           | Union Head / Officer   | `22-union-private-inbox.png`          | `union/22-union-private-inbox.png`                 | Privacy-safe aliases and assignment-first scanning        |
|  23 | Anonymous detail + assignment | Union Head             | `23-union-anonymous-assignment.png`   | `union/23-union-anonymous-assignment.png`          | Strong anonymity invariant and focused officer selection  |
|  24 | Identified detail             | Authorized Union       | `24-union-identified-detail.png`      | `union/24-union-identified-detail.png`             | Explicit consent and minimal authorized identity snapshot |
|  25 | Union General overview        | Union                  | `25-union-general-overview.png`       | `union/25-union-general-overview.png`              | Read-only aggregate without operational actions or PII    |

## Acceptance audit

- 25 current captures and 25 selected standalone concepts are paired.
- Device framing, cobalt palette, typography, radius, and navigation are consistent across flows.
- Create Voice has a minimalist five-step timeline, large cards, dominant chosen-route cobalt, and no brutalist decoration.
- Core Member Home composition is preserved rather than replaced.
- Reporter detail retains status, PIC, classification, timeline, conversation, attachment, closure, rating, and reopen states.
- Anonymous Private screens use synthetic aliases only; identified mode shows only the consented snapshot.
- Manager/Responder actions are present only where operational permission exists; Leadership and Union General remain read-only.
- CTAs and sheets clear the home indicator; implied touch targets are at least 44 px.
