# ADR-0046: Inbox Card PIC Alignment, Responder Hero Grid, and Reporter Classification Metadata

## Status

Accepted — 9 September 2026

## Context

Product-owner review of the workforce PWA surfaced three presentation-level
corrections on the operational inbox cards and the voice detail hero. They do
not alter authorization, lifecycle, routing, snapshots, or any API contract;
every change is a display-layer concern inside the workforce app. The
surfaces involved are the shared inbox voice card, the shared voice hero, and
the voice detail metadata list.

Two constraints shaped the decisions. First, the inbox card is one shared
component used by the work-items workspace, the member/responder home
previews, the dashboard inbox preview, the Union private list, and the
General browse list, so any layout change propagates to all of them. Second,
the voice hero renders one component for every detail audience
(reporter, general responder, leadership, Union anonymous/identified), with
audience branches chosen inside the component from the server-authoritative
`audience` discriminator, so audience scoping must stay explicit and cannot
accidentally widen identity exposure.

## Decision

1. **Inbox card PIC chip alignment.** On plain (non-identity) cards the
   PIC/unassigned chip moves from the footer row to the severity row and
   aligns to the right of the severity label, so severity and the PIC state
   form one top line. The footer keeps the status chip and relative time.
   The chip never wraps to a second line: person names are clipped to the
   first two whitespace-separated words followed by an ellipsis through a
   shared `shortenPersonName` helper, and a CSS `max-width` with
   `text-overflow: ellipsis` guards against single very long name segments.
   On identity (Union private) cards the top row is already occupied by the
   consented alias tile and the severity chip, so the PIC chip remains in
   the footer right-aligned as before. The General browse list keeps
   `showPic={false}` and is unaffected.
2. **Responder and leadership hero presentation.** For the
   `GENERAL_RESPONDER` and `LEADERSHIP_GENERAL_READ_ONLY` audiences the full
   detail hero gains an `Area: <area>` chip in the context chip strip after
   the category chip, and the two-cell grid changes from
   `Area | Pelapor` to `PIC: <pic> | Pelapor: <reporter>`, so the handler
   responsible for the voice is always visible on the responder-side detail
   and handover surfaces. The reporter's own view keeps the existing
   `Area | PIC` split without an area chip, the conversation compact hero is
   unchanged, the closed-voice pill row is unchanged, and the Union
   consent-first presentation is unchanged.
3. **Classification metadata is responder-facing.** The "Klasifikasi"
   (AI / Manual Fallback) and "Klasifikasi awal" rows of the detail metadata
   list are hidden from the `REPORTER_SELF` audience and remain visible to
   responders, leadership, Union, and Admin audiences. Reporter detail keeps
   the submission facts (submitted/updated timestamps, category, location
   completeness). The draft preview fallback row in the create flow is a
   separate surface and is unchanged.

## Rationale

- Severity is the primary sorting and scanning key of the operational
  inbox; pairing the PIC state with severity on one line keeps the handler
  question — who is responsible — answerable in a single fixation instead
  of requiring a scan to the card footer. Clipping the person name keeps
  the row single-line at 360 px for the long Indonesian employee names in
  the master data while preserving the first two segments, which carry
  most given-name identity.
- Responder and leadership readers act on or review the voice through its
  handler; placing `PIC:` in the hero grid (and moving area into the chip
  strip) matches the mental model of the assignment flow, including the
  Manager handover page that reuses the same hero. The reporter keeps the
  area-centric presentation because area and location are the reporter's
  primary reference frame.
- Classification source is processing bookkeeping produced by the AI
  pipeline. It informs responders and reviewers but carries no actionable
  meaning for the reporter, whose detail now shows only submission facts,
  consistent with the confirmation card already omitting classification
  source metadata.

## Alternatives Considered

- Keeping the PIC chip in the footer with forced single-line layout: the
  chip would stay visually detached from severity and still crowd the
  footer on long names at 360 px.
- Moving the area chip into the hero for every non-Union audience
  including the reporter: rejected for this iteration because the
  reporter's grid already shows the area prominently and the product owner
  scoped the change to the responder and leadership points of view.
- Hiding only the classification source row from the reporter while
  keeping "Klasifikasi awal": both rows are the same AI bookkeeping
  concern, so they are hidden together.

## Implementation Details

- `apps/web-voice/src/components/InboxVoiceCard.tsx` renders the PIC or
  unassigned chip inside the severity row for non-identity cards, wraps the
  clipped name in a dedicated span, and keeps the footer variant for
  identity cards. `apps/web-voice/src/lib/formatters.ts` provides
  `shortenPersonName` with unit coverage for short names, long names,
  whitespace collapsing, and empty input.
- `apps/web-voice/src/styles.css` removes the unconditional
  `margin-left: auto` from the chip base rule, scopes it to the footer
  variant, and adds the ellipsis rule for the name span.
- `apps/web-voice/src/components/VoiceHero.tsx` derives a
  responder/leadership flag from the `audience` discriminator and branches
  only the full-variant chip strip and grid; `personLabel` semantics for
  compact, closed, and Union surfaces are untouched.
- `apps/web-voice/src/features/voice/VoiceDetailPage.tsx` guards the two
  classification rows with the audience check.

## Consequences

- All inbox card consumers change together; the Union private list is the
  only surface retaining a footer PIC chip, and "Union Officer 1/2" labels
  clip to "Union Officer…" under the two-word rule, which is accepted
  because the distinguishing digit remains available in the detail and
  assignment surfaces.
- The handover visual fixture was updated to a `GENERAL_RESPONDER`
  audience so the canonical handover baselines represent the department
  head point of view they depict.
- Visual baselines were regenerated for the affected families only
  (dashboard inbox previews, detail identity, voice member workspace,
  manager home/dashboard, detail active/closed, handover selection) on
  darwin and canonical Linux x64, with Linux arm64 maintained for the
  detail identity family; leadership/union home and lifecycle baselines
  were verified unchanged.

## Validation Plan

- Workforce unit suite covers `shortenPersonName`.
- Functional Playwright coverage asserts the responder hero PIC/Pelapor
  cells and the `Area:` chip, the reporter hero labels, and the Union
  private PIC chip clipping.
- The full mocked browser suite (Chromium, visual, PWA, push, legacy
  WebKit) and the full-stack project pass without threshold changes, with
  regenerated baselines verified twice without updates on darwin and in
  the canonical Linux x64 container.

## Risks and Follow-up Work

- The `maxDiffPixelRatio` allowances on some legacy visual assertions can
  mask small layout drift; the affected baselines were regenerated rather
  than relying on the allowances.
- The conversation compact hero still shows `Pelapor:`/`Alias:` without
  the area prefix; if the product owner wants the same responder
  presentation on the chat surface, it is a small follow-up with its own
  baseline refresh.
