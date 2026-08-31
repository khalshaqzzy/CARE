# ADR-0021: Mobile Member Voice Image Redesign Artifacts

Date: 30 August 2026  
Status: Accepted as visual exploration; implementation not authorized

## Context

CARE Member Voice needs a complete mobile visual audit and a coherent concept set across Member, operational responder, Leadership, and Union capabilities. The work must not change React, APIs, schemas, or the implemented design system. Existing behavior and the PRD remain the functional source of truth, while `.agent/design-images/design.jpg` supplies art direction.

## Decision

Maintain one canonical image handoff at `.design/member-voice-redesign/`, grouped by page/flow. Each selected concept is a standalone mobile screen generated with built-in `image_gen` using the `ui-mockup` taxonomy.

The visual lock is solid CARE cobalt, white/cool-gray surfaces, charcoal text, refined grotesk typography, generous card height, soft radii, restrained severity color, realistic safe areas, and consistent floating navigation. Member Home preserves its current core dashboard composition. Create Voice uses a minimalist five-node timeline and a dominant solid-cobalt selected route. Detail screens prioritize one cobalt summary, a slim lifecycle timeline, and spacious conversation/action surfaces.

Role and privacy behavior remains controlled by the PRD. Anonymous Private Voice never displays identity or inferential identity hints. Identified Private Voice displays only the consented snapshot. Leadership and Union General surfaces are read-only and exclude lifecycle controls.

## Consequences

- The concept set can guide later implementation without implying that pixel output overrides product behavior or accessibility requirements.
- Current captures remain audit evidence under `.agent/design-images/member-voice-redesign/current/`.
- Final images, prompt set, and mapping manifest live together in `.design/member-voice-redesign/`.
- Any React/design-system implementation requires a separate approved scope, responsive/token translation, and code-level accessibility/testing.
