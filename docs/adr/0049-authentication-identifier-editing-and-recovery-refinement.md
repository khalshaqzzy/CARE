# ADR-0049: Authentication Identifier Editing and Recovery Control Refinement

## Status

Accepted — 10 September 2026

## Context

The login and password-recovery surfaces of the workforce app share the
No. Reg-first two-stage flow introduced in ADR-0048. After the password stage
expands, the identifier field is rendered `readOnly` and a secondary
**Ubah No. Reg** control is expected to collapse the stage and return the
identifier to an editable, focused state.

On iOS/Safari, tapping **Ubah No. Reg** focused the field but never raised the
software keyboard. The control's handler called `focus()` synchronously while
React had not yet committed `readOnly={false}`, so the DOM node was still
read-only when focus landed. Safari refuses the keyboard for a read-only field
and does not re-evaluate the decision when the attribute is later removed. The
same pattern existed on the recovery page's identifier step.

Product review of the same surfaces also asked for a denser presentation: the
step-heading helper text beside the control, the vertical rhythm of the
expanded stage, the reveal animation speed, and the day/month column widths of
the birth-date row.

## Decision

1. **Commit before focusing.** Both **Ubah No. Reg** handlers update their
   React state through `flushSync` so the identifier is already editable when
   `focus()` runs inside the same user gesture. The field remains `readOnly`
   while the other stage is active, preserving the original lock.
2. **Remove the step-heading labels.** The "Password akun" caption on login
   and both "Verifikasi akun" / "Ketersediaan reset" captions on recovery are
   removed. The **Ubah No. Reg** control remains as the only heading item and
   is right-aligned.
3. **Compact secondary controls.** **Ubah No. Reg** and **Lupa Password?**
   render at a smaller type size and a 36 px control height, and the expanded
   stage uses a tighter gap (both internal and against the surrounding form
   fields).
4. **Slower reveal.** The shared measure/reveal animation doubles its
   duration: height 480 ms, opacity 360 ms, with a 520 ms settle before the
   height reverts to `auto` and the first control is focused. Reduced-motion
   keeps an instant transition.
5. **Balanced birth-date columns.** The day, month, and year controls share
   equal fractions on the three-column layout, and the day/month pair is
   equal on the sub-480 px two-column layout, so the **Tanggal** label no
   longer clips and the month control is shorter than before.

## Rationale

- `flushSync` is the smallest change that makes the focus call observe an
  editable node without abandoning React's declarative `readOnly` lock. The
  alternatives — mutating the DOM node directly or dropping `readOnly` —
  either bypass reconciliation or weaken the stage lock.
- The heading captions were redundant: the password field carries its own
  accessible label and the birth-date group carries a fieldset legend, so the
  remaining right-aligned action reads as a single, unambiguous affordance.
- The reveal animation is a first-impression transition on every login and
  recovery visit; halving its speed reduces the perceived jump without adding
  layout work or a second animation library.
- The date-row imbalance was caused by the month column reserving space for
  long names such as "September" while the day column clipped "Tanggal". Equal
  fractions keep both labels legible and reduce the month control width as the
  product owner requested.

## Alternatives Considered

- Focusing in a `useEffect`/`requestAnimationFrame` after the state commit:
  rejected because the focus leaves the user-gesture window and iOS still
  suppresses the keyboard.
- Removing `readOnly` entirely and collapsing the stage whenever the user
  types: rejected because it changes the intended stage lock and the recovery
  eligibility contract.
- Keeping the 44 px minimum touch target on the two secondary text controls:
  rejected by explicit product decision in favour of the denser heading; the
  deviation is recorded in the product requirements instead of being silent.

## Implementation Details

- `apps/web-voice/src/App.tsx` and
  `apps/web-voice/src/features/auth/ForgotPasswordPage.tsx` import `flushSync`
  from `react-dom` and wrap the state reset that precedes the identifier
  focus.
- `apps/web-voice/src/features/auth/AuthReveal.tsx` raises the settle timeout
  to 520 ms; reduced motion remains 0 ms.
- `apps/web-voice/src/styles.css` updates `.auth-form`, `.auth-reveal`,
  `.auth-reveal__content`, `.auth-step-heading`, `.auth-forgot`, and
  `.auth-date-fields` (including the sub-480 px breakpoint).
- `e2e/auth-recovery.spec.ts` adds a regression that asserts the identifier is
  editable after both **Ubah No. Reg** controls, that the removed captions are
  absent, and that the day column is at least as wide as the month column.
- `scripts/validation/validation.test.mjs` advances the CI browser inventory
  count to 362.

## Consequences

- The two secondary authentication text controls are intentionally smaller
  than the 44 px product minimum; this is an accepted, documented product
  decision scoped to those controls. All primary controls and every other
  surface keep the 44 px target.
- The slower reveal slightly delays the automatic focus of the first expanded
  control. This is a presentation trade-off and does not change any workflow
  outcome.
- The `.auth-form` gap change affects every authentication state, so all 33
  auth capture references were regenerated even where the visible intent was
  unchanged.

## Validation Plan

- Functional Playwright coverage for the shared login/recovery journey at
  360, 390, 768, and 1440 px, plus the new identifier-edit regression.
- Full mocked browser suite (Chromium, PWA, push) and the legacy WebKit
  project, the isolated full-stack project including the real recovery
  journey, and the static quality job all pass.
- The tracked native capture gallery was regenerated for the auth family and
  representative mobile, tablet, and desktop images were inspected; no pixel
  comparison or Linux x64 local generation is required by ADR-0047.

## Risks and Follow-up Work

- iOS keyboard behaviour cannot be fully reproduced by the Chromium/WebKit
  test projects; the `flushSync` ordering is verified indirectly through the
  editable-state assertion.
- The reveal's automatic focus remains a programmatic focus after an animated
  delay. If the product owner wants the keyboard to accompany the password
  stage as well, focusing from within the initiating gesture would be a
  separate change.
