# ADR-0079: Category Examples from handover corrections

- Status: Accepted (implemented on `feat/voice-category-boundaries`, not released)
- Date: 5 November 2026
- Related: ADR-0030 (classification prompt enrichment), ADR-0059 (tiered routing and handover), ADR-0078 (location-based category boundaries), PRD §13.7

## Context

General Voice classification uses a hosted language model. The model is not fine-tuned. Each request carries the active category catalog: a Definition and a list of Examples per category, maintained by CARE Admin. Edits to the catalog therefore take effect on the next classification.

When a Voice lands in the wrong category, a Manager hands it over to another category, or CARE Admin routes it through Handover Admin. The Voice keeps its submit-time category (`categoryKey`) and records the new one (`currentCategoryKey`). These differences are the clearest available signal of classification mistakes, but nothing fed them back into the catalog.

Not every handover is a category mistake. A Voice can move to another department within the same category, a Manager can hand over work that was correctly classified, and Admin can route to a custom category that is not part of the catalog.

## Decision

1. A **correction** is a General Voice whose current category differs from its submit-time category. Migrated Voices are excluded. Same-category moves are not corrections.
2. CARE Admin reviews corrections on a dedicated **Koreksi Kategori** page. Each card shows the title, detail, location, the original and current category, and the latest handover reason. Reporter identity is not shown.
3. **Jadikan contoh** adds an Admin-edited Example (prefilled with the Voice title) to the current category as a new catalog revision, audited as `GENERAL_VOICE_CATEGORY_UPDATED` with `source: CATEGORY_CORRECTION`. **Abaikan** records the decision without changing the catalog.
4. A decision is stored per Voice and target category in `CategoryCorrectionReview`. A Voice that moves to yet another category becomes a new correction.

## Rationale

- Human review keeps wrong handovers from teaching the model and lets Admin remove names or other personal details before text enters the prompt.
- Examples are the existing, versioned lever for classification behaviour; reusing them needs no new prompt mechanics, model or embedding service.
- Keeping Voice text out of the prompt unless an Admin has turned it into an Example preserves the input-minimisation rule in PRD §13.2.

## Alternatives considered

| Alternative                                                            | Reason not chosen                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Automatically add similar corrected Voices to each request (retrieval) | Needs an embedding service, sends other reporters' text to the provider, and lets incorrect handovers influence classification without review. Can be added later on top of reviewed data. |
| Automatically append every handover title as an Example                | Same-department moves, workload transfers and wrong handovers would pollute the catalog; the 50-Example limit would fill quickly.                                                          |
| Fine-tune a model on handover data                                     | Not supported by the current provider setup, costly to repeat, and harder to audit than catalog revisions.                                                                                 |
| Section on the Remediation & Route page                                | Previewed; the dedicated page was chosen because corrections are processed regularly and in batches.                                                                                       |

## Implementation details

- Schema: enum `CategoryCorrectionDecision` (`ACCEPTED`, `DISMISSED`) and model `CategoryCorrectionReview` (`voiceId`, `fromCategoryKey`, `toCategoryKey`, `decision`, `example`, `categoryRevisionId`, `reviewedById`, `reviewedAt`), unique on `(voiceId, toCategoryKey)`; migration `20261105090100_category_correction_reviews`.
- `CategoriesService.corrections()` selects pending corrections with one SQL query (latest `VoiceHandover` note, else the routed `AdminHandover` note), newest change first, limited to 50 plus a total count. `canAccept` is true only when the target is an active catalog category.
- `acceptCorrection` locks the category row, refuses a full catalog (`CATEGORY_EXAMPLES_FULL`, 50 Examples), skips duplicates (case- and whitespace-insensitive) and otherwise creates the next revision with the same name and Definition. `dismissCorrection` records the decision and an audit event on the Voice. Both require an Idempotency-Key and reject a Voice whose category changed (`CATEGORY_CORRECTION_CHANGED`) or that was already decided (`CATEGORY_CORRECTION_REVIEWED`).
- API (`CARE_ADMIN` only): `GET /api/v1/admin/category-corrections`, `POST /api/v1/admin/category-corrections/:voiceId/accept`, `POST /api/v1/admin/category-corrections/:voiceId/dismiss`.
- Admin app: `CategoryCorrectionsPage` at `/category-corrections`, sidebar entry **Koreksi Kategori**.

## Consequences

- The model improves only as fast as Admin reviews corrections.
- Every accepted correction creates a catalog revision; revision history grows with review activity.
- Examples are capped at 50 per category; Admin curates older Examples in Konfigurasi kategori when the cap is reached.
- Drafts already classified are not reclassified when an Example is added; the next analysis uses the new Example.

## Validation

- Integration (`voice-handover.integration.test.ts`): a Manager handover and an Admin custom-category handover both appear; reporter identity is absent; stale and custom targets are rejected; acceptance trims and stores the Example in the next revision, replays idempotently, refuses a second decision and is audited; dismissal removes the item and the total drops.
- Playwright (`admin-journeys.spec.ts`): the sidebar opens the page, the Example is edited and sent with the expected category, and a custom target offers only **Abaikan**. Browser inventory 493 → 494.

## Risks

- Admin may accept a correction that was not a category mistake; the revision history allows rollback through Konfigurasi kategori.
- Example text is free text; reviewers must remove personal details.

## Follow-up

- Consider retrieval of reviewed corrections once enough accepted Examples exist.
- Re-run the live evaluation set after the first batch of accepted corrections.
