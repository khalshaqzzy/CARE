# ADR-0030: Classification Prompt Enrichment to v1.4

- Status: Accepted
- Date: 1 September 2026
- Related: PRD §1.1, §13.1, §13.4, §13.5; ADR-0017, ADR-0029

## Context

The code-owned classification system prompt (`care-classification-v1.3`) carried the required injection defense, category-selection rules, a terse severity rubric, and confidence calibration, but it underspecified several behaviors that the product contract and the approved Voice Category master table define in detail. The severity rubric listed one terse sentence per level without the worked examples from the PRD rubric table. No boundary guidance helped the model distinguish commonly confused category pairs such as shared-facility sufficiency versus physical facility damage. The rationale-code allowlist was presented without definitions. Confidence calibration did not explain its relationship to the server fallback threshold. Separately, the `DEFAULT_CATEGORY_CONTEXT` fallback used only by standalone provider smoke tests carried one example per category, while the seeded database catalog carries the full approved Indonesian definitions and four to eight ordered examples per category, so smoke-path context was not representative of production.

## Decision

The classification system prompt is enriched and the version advances to `care-classification-v1.4`. The prompt remains code-owned and immutable per the dynamic-category amendment; Definition and Examples stay dynamic structured context supplied from the catalog. The enriched prompt keeps every previously locked anchor phrase verbatim and adds:

- an explicit statement that a Voice may be a report, complaint, idea, information, or appreciation;
- an expanded injection-defense paragraph that also treats `categoryContext` as untrusted data and forbids quoting or revealing the system instructions;
- general-category boundary guidance (shared-facility sufficiency/service/rules versus technical repair; environmental exposure versus personal-safety risk; work-process obstruction versus welfare topics), explicitly scoped as illustrative with the catalog Definition remaining authoritative, including for Admin-added categories;
- a dominant-primary selection rule with a tie-break that lowers confidence instead of blending categories, and a prohibition on selecting keys outside the tool enum;
- the full PRD severity rubric with per-level Indonesian examples and the rule to choose the highest level supported by reported facts;
- one-line definitions for all eight rationale codes;
- confidence calibration tied to the server fallback threshold (default approximately 0.75), keeping the existing instruction not to inflate confidence to avoid fallback.

The location review prompt and its version remain unchanged.

`DEFAULT_CATEGORY_CONTEXT` is synchronized with the seeded catalog: full Indonesian definitions and the complete ordered example sets (4, 4, 8, 4, 6, and 5 examples) for Safety, Environment, Fasilitas Umum, Facility Repair, Fasilitas Kerja / Kesulitan Kerja, and Kesejahteraan. The shape and `seed-*` revision identifiers are unchanged. Production classification continues to load the active revisioned catalog from PostgreSQL; the fallback exists only for standalone smoke runs and now mirrors production context.

## Rationale

- Worked severity examples anchor consistent severity assignment across providers and reduce drift between the PRD rubric and model behavior.
- Boundary guidance addresses the most frequent confusion pairs observed between facility sufficiency, facility repair, work difficulty, and welfare without hard-coding a priority order, which the product contract forbids.
- Naming the fallback threshold inside the calibration guidance gives the model the operational meaning of low confidence instead of leaving it abstract.
- Synchronizing the smoke-test fallback with the seeded catalog makes provider smoke evidence representative of production classification context.

## Alternatives Considered

- Leave the terse rubric and rely on the catalog context alone — rejected because the rubric is code-owned severity guidance, not category content, and must not depend on Admin-editable text.
- Embed full category definitions in the system prompt — rejected because Definition and Examples are dynamic catalog context under the dynamic-category amendment, and duplicating them would create a second source of truth.
- Extend the enrichment to the location prompt — deferred; the location prompt already satisfies its contract, and changing it would invalidate cached location snapshots without a corresponding quality need.
- Add hard tie-break priority rules between categories — rejected because the contract forbids a fixed category priority order.

## Consequences

- Classification snapshots created after deployment record `care-classification-v1.4`; earlier snapshots retain their recorded version and content hash, so history stays interpretable.
- Classification cache invalidation continues to rely on the content hash; the version stamp is the audit trail, so no additional cache behavior changes.
- Unit tests lock the new version string, the retained anchor phrases, new boundary/rubric anchors, and representative enriched example strings; future prompt edits must update them deliberately.
- The larger system prompt and richer fallback context increase per-request token usage modestly; output caps and timeout behavior are unchanged.

## Validation

- Unit tests assert the v1.4 version, retained anchor phrases, new dominant-primary and severity-rubric anchors, the fallback-threshold calibration sentence, and representative example strings from the synchronized fallback context.
- The prompt-lock suite continues to verify that the tool enum is generated from active stable keys and that Private Voice forces `category=null`.
- Static gates (format, lint, typecheck, unit, production build, OpenAPI check, destructive-migration check) and the Gitleaks directory scan remain required before commit.
- Database-backed integration and security suites re-run because the shared prompt module is API runtime code, even though no schema, contract, or frontend surface changes.

## Follow-up Work

- Observe AI-source classification quality (category distribution, severity distribution, confidence, fallback rate) on staging after deployment and compare against the previous prompt's baseline before promoting further.
- Revisit the location prompt in a separate change if location-review fallback rates or question quality warrant it, with the same version-bump discipline.
