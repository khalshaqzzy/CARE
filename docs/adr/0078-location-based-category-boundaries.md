# ADR-0078: Location-based category boundaries and mandatory Private Voice for harassment

- Status: Accepted (implemented on `feat/voice-category-boundaries`, not released)
- Date: 5 November 2026
- Related: ADR-0030 (classification prompt enrichment), ADR-0056 (incident shop routing), ADR-0059 (tiered routing), ADR-0064 (Private Voice Komite), PRD §13.2, §13.3, §14.2 and §43.5

## Context

General Voice categories route to different owners. Safety, Environment and Fasilitas Umum go to Plant GA & SHE (PGA-SHE), Facility Repair goes to Smart Plant Facility Mfg (SPFM), and Fasilitas Kerja / Kesulitan Kerja and Kesejahteraan follow the organisation structure (the shop owner or the reporter's department).

The earlier Definitions separated categories by subject only. A slippery floor, a noisy machine or a strong chemical smell was Safety or Environment wherever it happened. In practice PGA-SHE handles safety and cleanliness only in shared facilities and offices; the same conditions inside a production shop are handled by the shop's own structure. Electrical problems were also split unclearly between Safety, Facility Repair and Kesulitan Kerja.

The classifier could not apply a location rule even if it had one: the request carried the plant area, title and detail, but not the reporter's location detail.

Separately, harassment, bullying and discrimination were listed under Kesejahteraan, so a General Voice about them reached the reporter's structural leaders. The Private Voice hint only appeared for complaints about the reporter's own superior and could be ignored.

## Decision

1. **Location is part of the boundary.**
   - Safety and Fasilitas Umum (PGA-SHE) cover shared facilities, offices and common areas outside the shops. Fasilitas Umum also covers cleanliness.
   - Inside a shop, line, workstation or production area, safety, fire or smoke, working-environment conditions and shop cleanliness are Fasilitas Kerja / Kesulitan Kerja.
   - Facility Repair (SPFM) covers physical damage to buildings, offices and utilities, including AC, lighting and the electrical installation of buildings, offices and shared facilities, and building damage inside shop buildings.
   - Electrical faults of machines and production equipment are Kesulitan Kerja.
   - Fire or smoke follows the location: Safety in shared areas and offices, Kesulitan Kerja in shops.
2. **Environment is archived.** Its cleanliness scope moves to Fasilitas Umum; its other conditions move to Kesulitan Kerja when they occur in shops. Historical Voices keep their Environment snapshot, and Admin can reactivate the category.
3. **The classifier receives the location detail** for General Voices. The classification content hash includes the normalised location detail, so editing the location requires a new classification.
4. **Harassment-type reports must be Private.** The classifier sets `privateSuggested` for harassment (including sexual harassment), bullying, intimidation, discrimination, retaliation or threats related to reporting against a person, whoever the actor is. Kesejahteraan and Kesulitan Kerja no longer include these topics. The server rejects submitting a flagged General draft with `PRIVATE_VOICE_REQUIRED` (422), and the review screen replaces **Kirim Voice** with **Lanjut ke Private Voice**.
5. **Consent stays with the reporter.** The draft is not converted automatically. **Lanjut ke Private Voice** reopens the form as Private with area, location detail, title, detail and photos kept, and scrolls to **Identitas kepada Komite**; the reporter still chooses identity visibility and contact consent.

The classification prompt version moves to `care-classification-v1.9`.

## Rationale

- Ownership in the plant follows place as well as subject; encoding that in the Definitions sends Voices to the team that actually acts on them.
- Archiving Environment removes a category whose remaining scope overlapped two others, instead of keeping a near-empty category that the model could still pick.
- Location detail is already sent to the location-review call and is listed as permitted input in PRD §13.2; using it for classification adds no new personal data.
- Identity visibility and contact consent decide who sees the reporter's identity, so they cannot be chosen by the system. Moving the reporter to a prefilled Private form keeps the effort to two choices.
- Keeping the flag when a manual classification is saved closes the path of overriding the AI result to send the Voice as General.

## Alternatives considered

| Alternative                                                      | Reason not chosen                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep subject-only Definitions and fix ownership by routing rules | Category would no longer describe the handling team, and routing rules would duplicate classification decisions outside the model.         |
| Keep Environment for cleanliness only                            | Cleanliness of shared areas is already a service question of Fasilitas Umum; two PGA-SHE categories for the same handling added ambiguity. |
| Convert a flagged General draft to Private on the server         | Would choose identity visibility and contact consent on the reporter's behalf.                                                             |
| Keep the Private hint optional                                   | Harassment reports would continue to reach structural leaders who may be involved.                                                         |
| Keep harassment in Kesejahteraan as a fallback category          | Not needed once submission as General is blocked; leaving it would invite the model to classify such reports as General.                   |

## Implementation details

- `apps/api/src/ai/prompt.ts`: new Definitions and Examples for Safety, Fasilitas Umum, Facility Repair, Fasilitas Kerja / Kesulitan Kerja and Kesejahteraan; Environment removed from the smoke-test default catalog and default schema; system prompt boundary rules for location and electrical ownership, `locationDetail` treated as untrusted input, and the mandatory Private rule. Version `care-classification-v1.9`.
- `apps/api/prisma/migrations/20261105100000_category_location_boundaries`: closes the active revision of the five built-in categories and inserts a new revision with the new Definition and Examples (name kept, history preserved, category version incremented), then archives Environment if it is active. Routes are unchanged. The SQL text is generated from `prompt.ts`, and a unit test asserts that both carry the same Definitions and Examples.
- `apps/api/src/ai/ai.service.ts` and `voices.service.ts`: `locationDetail` is sent for General classification and included in the classification content hash; `submit` rejects a flagged General draft with `PRIVATE_VOICE_REQUIRED`.
- `apps/web-voice`: `useDraftWizard.switchToPrivate` keeps the form, switches visibility, and requests focus on the identity section; `CreateVoicePage` shows **Kirim sebagai Private Voice** and **Lanjut ke Private Voice** in place of the submit action and hides the incomplete-location acknowledgement for flagged drafts.

## Consequences

- Category dashboards show Environment only for historical Voices; new Voices that would have been Environment appear as Fasilitas Umum or Kesulitan Kerja.
- Kesulitan Kerja outside a shop still routes to the reporter's department (ADR-0056); only safety and cleanliness outside shops move to PGA-SHE.
- Drafts prepared before the release need a new classification because the prompt version and hash inputs changed (existing `DRAFT_AI_SNAPSHOT_STALE` behaviour).
- A false positive by the model forces a Voice into Private. The prompt excludes policy, workload, approvals and ordinary decisions by a superior to reduce this risk.
- A Private verdict is enforced even below the confidence threshold (amendment below).
- Any Admin edits to the five built-in Definitions are superseded by a new revision; the edited text stays in revision history.

## Validation

- Unit (`domain.test.ts`): prompt version, location and Private rules, Environment absent from the default catalog, and equality of migration SQL with `DEFAULT_CATEGORY_CONTEXT`.
- Unit (`integration-contracts.test.ts`): the classification request carries the location detail.
- Integration (`organization-routing.integration.test.ts`): a flagged General draft is rejected with `PRIVATE_VOICE_REQUIRED`, also after a later manual classification.
- Playwright (`workforce-journeys.spec.ts`): the review screen has no **Kirim Voice**, **Lanjut ke Private Voice** opens the Private form with location, title and detail kept, the identity section is in view, and analysis waits for the consent choices.

## Risks

- Model accuracy for the location rule depends on reporters naming the place; vague locations lower confidence and lead to Manual Fallback.
- Over-flagging harassment would push ordinary complaints into Private; monitor flagged drafts after release.

## Amendment: low-confidence Private verdicts (5 November 2026)

After release, a General Voice about a member who mocked colleagues was classified below the confidence threshold because no remaining General category fitted. The AI's Private verdict was discarded with the rest of the low-confidence result, the reporter reached Manual Fallback, chose Kesejahteraan and sent the report as General.

- When a General classification is below the threshold but `privateSuggested` is true, the result is stored as an AI classification with its low confidence, so the review screen requires Private Voice and submit keeps rejecting General. Other low-confidence results still go to Manual Fallback.
- Prompt `care-classification-v1.10` lists mocking, insulting, humiliating, belittling, shouting at and excluding a person as bullying or intimidation, also when the reporter calls it unfriendly, and states that confidence must not drop only because no General category fits.
- The saved-draft preview page (`/drafts/:id/preview`) shows the same lock; **Lanjut ke Private Voice** opens the edit form as Private with the content kept.
- Validation: integration case with a stubbed low-confidence Private verdict (`organization-routing`), Playwright case for the draft preview path (inventory 496).

## Follow-up

- Re-run the live 30-Voice evaluation set with the new Definitions, adding shop/office/shared-area pairs and harassment by peers.
- Confirm on staging that the category catalog shows five active categories and Environment as archived.
