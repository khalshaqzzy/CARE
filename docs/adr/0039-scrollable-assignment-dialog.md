# ADR-0039: Scrollable assignment dialog with persistent actions

- Status: Accepted
- Date: 2026-09-05

## Context

The assignment dialog could clip long Section Head lists because its constrained grid did not reliably allocate a scrollable body. The final candidate and submission controls could become unreachable on short screens. The same dialog serves Private assignment to Union Officers.

## Decision and rationale

A scoped flex layout is applied to assignment through an optional shared `Dialog.className`. The header and footer retain their height; the body shrinks with `min-height: 0` and scrolls independently. A viewport-relative maximum height includes a `vh` fallback for legacy WebKit. Existing dialog focus management is retained.

The footer contains the selected name and action buttons. Search and a result count are provided for lists larger than five candidates. Loading, empty, no-match and retry states are explicit. Mutation errors are rendered inside the dialog. Selection, search and reason reset on dismissal; candidate queries are enabled only while open. The API authorization, version and idempotency contracts are preserved.

## Alternatives considered

A global dialog layout change would affect unrelated overlays. Scrolling the entire dialog would move the primary action offscreen. A native select would obscure candidate workload information. The scoped body-scroll approach preserves the existing card choices while making long lists usable.

## Consequences and risks

The shared Dialog gains an optional styling hook without changing its default layout. The assignment footer consumes some available height, especially with a long selected name; text wraps and the body receives the remaining space. Search hides unmatched choices without clearing the current selection, which remains visible in the footer.

## Validation and follow-up

Regression coverage exercises thirty candidates at 360, 390, 768 and 1440 pixels, payload preservation, search, empty results, retry, keyboard focus and Axe. Legacy WebKit covers scrolling and last-candidate selection. Six new visual baselines cover initial and selected states at 360/768/1440; the existing assignment sheet baseline is refreshed and screenshots are inspected after a production build. Full suite results are recorded in the session handoff. Hosted acceptance remains a separate release check.
