# ADR-0083: Reporter profile for responders and a location-first Voice detail header

- Status: Accepted (implemented on `feat/responder-reporter-profile`, not released)
- Date: 9 November 2026
- Related: ADR-0059 (bottom-up tiered routing and the reporter line snapshot), ADR-0026 / ADR-0051 (workforce bundle budget), PRD §11, §43.5, §47

## Context

On the Voice detail page, a General responder (and a leader with read-only access) saw only the reporter's name in the hero card. The responder could not tell where the reporter sits in the organization, although that context determines who should follow up and whether the Voice came from the responder's own line or section. The Voice row already stores a submit-time snapshot of the reporter's division, department, section, position and line (`reporterDivisionSnapshot` … `reporterLineSnapshot`), and the API already returned division, department, section and position to General audiences. The line was never exposed, and the OpenAPI schema for `GeneralResponderVoiceDetail` documented only four fields.

The hero card itself had grown into a loose arrangement: a strip of severity and category chips, a single grey line for the area and location detail, and a PIC | Pelapor row. The location of an issue is one of the most important facts for a responder, yet it was the least prominent element. The **Detail Voice** card (the report text) also looked identical to every other card on the page.

Adding the full organization path directly into the hero would have made the top of the page noticeably taller on phones (four extra lines for long division and department names), pushing the report text below the fold.

## Decision

### 1. Reporter profile behind the name

- In the responder and leadership detail, the reporter name in the hero becomes a link-styled button (`Lihat profil pelapor <name>`). Activating it opens a `BottomSheet` (a dialog on desktop) titled **Profil pelapor** with the name, No. Reg, and the rows Divisi, Departemen, Section and Line.
- Rows without a value (no section, no line, which is common for staff positions) are omitted rather than shown as "—".
- All values are the submit-time snapshot. A later organization import does not change what the profile shows for an existing Voice, consistent with routing and dashboards.
- The component lives in `apps/web-voice/src/components/ReporterProfileSheet.tsx` and is used only by `VoiceHero`.

### 2. API contract

- `reporter.line: string | null` is added to `GeneralResponderVoiceDetail` (and therefore to `LeadershipGeneralVoiceDetail`) and to `AdminPrivateVoiceDetail`, sourced from `Voice.reporterLineSnapshot`.
- The OpenAPI schema for `GeneralResponderVoiceDetail.reporter` now documents `directorate`, `section`, `position` (already sent) and `line`; `section` and `line` are listed as required-nullable. `LeadershipGeneralVoiceDetail` and `AdminPrivateVoiceDetail` gain `line`. `UnionIdentifiedVoiceDetail` keeps its four consented fields and `REPORTER_SELF` keeps `{ self: true }`, so no Private identity scope widens.
- The contract change is additive; existing clients ignore the new field.

### 3. Location-first hero for open Voices

For the full hero of a Voice that is not Closed, outside the Komite (Union) presentation:

1. Title.
2. A **Lokasi** block: light brand background, a filled brand pin badge, an uppercase `LOKASI` label, the area in bold and the location detail beneath it.
3. A two-column fact grid (`dl.voice-hero__people.voice-hero__facts`): **Severity | Kategori**, then **PIC | Pelapor**. Kategori is omitted for Voices without a category; Pelapor appears only for responder and leadership audiences. A last cell alone on its row spans both columns so long names are not cut at half width.

The closed hero, the compact conversation hero and both Komite presentations are unchanged. The old `.voice-hero__place` line and the unused `.voice-hero__location` rule were removed.

### 4. Highlighted Detail Voice card

The Detail Voice card gets a light brand header band with a document icon, a 1.5 px brand outline and a soft brand glow (a 4 px translucent ring plus a diffuse brand shadow). Body, media gallery and the submitted time keep their content and order.

## Rationale

- A sheet keeps the hero to the same height as before while still giving the full path in one tap, which suited the requirement that the detail page must not feel crowded.
- Snapshots are used instead of a live organization lookup because the Voice is routed, measured and audited against the organization at submit time; a live lookup would also need a new read path into organization data.
- Grouping severity, category, PIC and reporter into one labelled grid replaces three different visual treatments (chips, a grey line and a two-column row) with one pattern, which reads faster and lines up on both phone and desktop.
- Giving the location and the report text their own coloured treatments matches what responders act on first: where the problem is and what the reporter wrote.

## Alternatives considered

| Alternative                                                                  | Reason not chosen                                                                                                            |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Show the full organization path inline under the reporter name in the hero   | Added about 120 px to the hero on a 360 px phone and wrapped badly with long division and department names.                  |
| A separate collapsible "Pelapor" row below the hero                          | Duplicated the name or removed it from the hero, and added another card between the hero and the report.                     |
| Look up the reporter's current organization at read time                     | Would drift from routing and dashboards after an import, and would need a new organization read path in the detail endpoint. |
| Keep severity/category as chips above or below the title                     | Evaluated as two mock variants; the labelled grid was chosen as the tidiest and most consistent option.                      |
| Detail Voice highlighted only by a stronger grey shadow or a left accent bar | Evaluated; the tinted header with a brand outline and glow was chosen as the clearest highlight.                             |

## Implementation details

- API: `apps/api/src/voices/voice.contracts.ts` (`line` on the General reporter type), `apps/api/src/voices/voices.service.ts` (`line: voice.reporterLineSnapshot` for General and Admin private detail), `apps/api/scripts/enrich-openapi.ts`; regenerated `apps/api/openapi.json` and `packages/contracts/src/generated.ts`.
- Web: `apps/web-voice/src/components/VoiceHero.tsx` (new full non-closed branch, compact branch split out), new `ReporterProfileSheet.tsx`, `features/voice/VoiceDetailPage.tsx` (heading icon), `styles.css` (location block, fact grid, profile sheet, Detail Voice card; text on the light brand background uses `--raw-brand-700` to meet the 4.5:1 contrast requirement, since `--raw-brand-600` on `--raw-brand-50` measures 4.43:1).
- The workforce main chunk stays well under the gzip budget (147,759 bytes after the change; budget 166,640).

## Consequences

- Responders and leaders can see the reporter's division, department, section and line for General Voices. This is information they were already entitled to by route permission; only the line is newly exposed, and only to the same audiences.
- CARE Admin's private full-identity detail also carries `line`; the Admin UI does not display it yet.
- Every non-closed Voice detail, including the reporter's own view, uses the new hero layout; reporters see Severity, Kategori and PIC in the grid and no Pelapor cell.

## Validation

- Integration: `responder-matrix` asserts that a General responder receives division, department, section and line, and that leadership detail carries the line; `division-admin` unchanged and passing.
- Browser: `e2e/voice-consent.visual.spec.ts` (detail identity, GENERAL_RESPONDER) opens the profile sheet and checks No. Reg, department and section, and that an absent line is not rendered; the axe-checked detail and handover specs pass with the new colours; the legacy iOS WebKit and visual projects pass.
- Captures `detail-identity-*` and the new `detail-reporter-profile-360` were reviewed by eye.

## Risks and follow-up

- Organization snapshots for Voices submitted before the line snapshot existed may have `line = null`; the profile simply omits the row.
- If CARE Admin later needs the reporter profile on its own Voice detail, it can reuse the same fields from `AdminPrivateVoiceDetail` and the General detail without further API changes.
- The closed-Voice hero still shows location only in its summary context; aligning it with the location-first layout can be considered separately.
