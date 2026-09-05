# ADR-0038: Private contact consent and compact Voice confirmation

- Status: Accepted; implemented locally
- Date: 5 September 2026

## Context

Private reporting requires explicit willingness to communicate privately with Team CARE while preserving the existing identity visibility choice. Drafts can be saved before this consent is given. The shared General Voice header previously displayed the handler to responders, and long confirmation values competed with labels for horizontal space. Closure photos were optional on the server but still required by the workforce UI and product documentation.

## Decision

An independent nullable `privateContactConsent` is persisted on drafts. The checkbox statement is styled with regular-weight secondary text so it remains legible without competing with the form content. Private submission requires true; the Voice stores an immutable boolean, server submission timestamp, and statement version `v1`. Existing Voices remain null. Consent is available only to the reporter and authorized Admin detail responses, without changing anonymous Union serialization or routing. No private-contact workflow or new identity access is introduced.

Draft updates send current normalized form values with expectedVersion. Atomic conditional updates serialize changes and submission, preventing a concurrent revocation from being overwritten or an outdated consent from being submitted. Idempotent retries preserve the original successful result. Consent is excluded from AI provider inputs and AI content hashes because it does not affect classification or location completeness.

General responders see the reporter snapshot; reporter self views retain PIC. Private identified/anonymous views retain authorized name/alias respectively. The same audience decision is used for conversation and Closed headers.

Confirmation uses compact 14px values, bounded columns, smaller icon plates, and stacked mobile labels. Full values wrap without truncation. Classification-source metadata is removed from confirmation; location completeness and its acknowledgment remain. Category display uses the stored classification revision name when available.

Only create/edit photo upload receives the ATSG helper. Closing accepts zero to five photos, while note, authorization, version and idempotency requirements remain. Password back navigation returns normal sessions to Account and logs restricted sessions out to Login.

## Alternatives and tradeoffs

A visual-only checkbox would not provide durable consent evidence. Combining contact consent with identity visibility would incorrectly alter confidentiality. Historical consent is not inferred. Compact wrapping retains complete routing information at the cost of variable card height. Existing UI primitives and tokens are reused rather than introducing a new design system.

## Migration and compatibility

Migration `20260905100000_private_contact_consent` adds nullable columns only. Old drafts load without consent and require completion before new Private submissions. An old client receives `PRIVATE_CONTACT_CONSENT_REQUIRED` and must refresh to the new form. Rollout applies the additive migration before the new API/workforce artifacts. Backend rollback remains schema compatible but would remove new-submit enforcement; do not roll back independently without considering that behavioral change.

The update-draft OpenAPI contract now explicitly describes optional fields and expectedVersion. Generated clients are regenerated. The statement version remains a fixed server value; any future wording change requires a new version and a reviewed migration/consent policy.

## Validation

Regression coverage includes draft persistence, stale versions and concurrent submit/revocation, immutable consent snapshots, missing-consent rejection, visibility reset, audience-safe identities, zero/one/five-photo closure, password navigation, and no-overflow/axe checks at 360/390/768/1440. An upgrade fixture verifies historical data and null consent preservation. Affected visual baselines are regenerated from a fresh production build and inspected; exact final command outcomes are maintained in the session handoff.

## Consequences and follow-up

New Private submissions have durable consent evidence without expanding Union identity permissions. Deployment requires the migration and refreshed workforce assets. Hosted acceptance and production release remain separate delivery work. Contact scheduling and communication mechanisms are outside this change.

### Cross-platform visual verification

Strict screenshot baselines are stored separately for Darwin and Linux because CoreText and FreeType rasterization differ. Linux baselines are generated and checked in Ubuntu 22.04 with the pinned Node and Playwright versions; Darwin images are verified separately. Screenshot thresholds remain unchanged. Both environments must be verified when these UI baselines change; a local macOS pass alone does not establish CI visual parity.
