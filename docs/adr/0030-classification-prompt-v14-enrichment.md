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

## Amendment — 15 September 2026

The classification prompt advances to `care-classification-v1.5` and no longer
defines or requests `rationaleCode`. The function schema and local strict Zod
validation now accept exactly `category`, `severity`, and `confidence`. This keeps
the model focused on fields that affect category selection, severity, routing, and
fallback, and avoids spending generation effort on an additional explanatory
label that is not used for those decisions.

The existing non-null database column and public snapshot shape are retained to
avoid a destructive migration and client-contract break. AI snapshots created by
v1.5 store the code-owned marker `NOT_REQUESTED`; manual snapshots continue to use
`MANUAL`, and all historical rationale values remain unchanged. The prompt-version
bump invalidates stale draft classification snapshots through the existing content
hash/version workflow. Location review behavior and version remain unchanged.
As a follow-up to the same simplification, CARE's Granite request cap is reduced
from 4,096 to 2,500 generated tokens in the application service; the inference
server's context window and runtime configuration remain unchanged.

## Amendment — 16 September 2026

Live Ling evaluation showed recurring category-boundary errors: environmental
exposure and spills moved to Safety when human consequences were mentioned,
physical facility failures moved to Safety, and harassment/retaliation lacked an
explicit category home. The six built-in category Definition values are therefore
clarified around the primary remediation domain and explicit exclusions. Safety
no longer wins merely because another root cause can harm a person; Environment
retains source exposure, Facility is limited to service/capacity/rules while the
asset still functions, Facility Repair retains physical failures, Work Difficulty
retains operational process/resource failures, and Welfare explicitly includes
people-rights misconduct including harassment, discrimination and retaliation.

This is deliberately a Definition-only quality change. The code-owned system
instruction, ordered Examples, severity rubric, confidence guidance, function
schema, routing and provider configuration are unchanged. Classification version
advances to `care-classification-v1.6` so v1.5 draft results are not reused with
the new structured context. A new data migration closes revision 1 and creates
revision 2 for the six original categories while copying names and Examples and
leaving routes/custom categories untouched. It fails closed instead of overwriting
an unexpected Admin-authored built-in revision. Historical classification links
remain attached to their immutable earlier revision.

## Amendment — Severity calibration to v1.7 — 16 September 2026

The 80-Voice synthetic Indonesian live evaluation showed systematic severity
under-classification even when Ling returned schema-valid tool calls. Recurring
errors included active electrical smoke, a severe near miss, a large chemical
spill reaching drainage, symptomatic exposure, essential-service loss, repeated
manpower strain, and harassment with threats or retaliation. The terse four-line
rubric did not explain how to treat an unrealized but credible consequence, scale,
recurrence, ongoing exposure, or missing facts.

The code-owned system prompt therefore advances to
`care-classification-v1.7`. Only its severity rubric changes. Severity is assessed
separately from category using the strongest concrete supported impact, urgency,
scale, recurrence, and whether exposure or danger remains active. The prompt now
states that absence of an injury does not downgrade a credible serious near miss,
while risk keywords alone do not justify escalation. Missing essential facts lower
confidence rather than automatically producing LOW. LOW, MEDIUM, HIGH, and
CRITICAL each receive operational boundaries and representative anchors, including
an explicit distinction between significant prompt action and an active or
developing emergency.

Category instructions and Definition/Examples, function schema, confidence
threshold, sampling, output cap, provider settings, routing, and location review
remain unchanged. No database or public API change is required. Unit tests lock
the new version and the anti-under-classification anchors; provider quality must be
measured separately because prompt regression assertions cannot establish model
accuracy.
