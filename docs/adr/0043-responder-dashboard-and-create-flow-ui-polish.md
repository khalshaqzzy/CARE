# ADR-0043: Responder Dashboard and Create-Flow UI Polish

## Status

Accepted — 8 September 2026

## Context

Product-owner review of the workforce PWA surfaced seven presentation-level
corrections. They do not alter authorization, lifecycle, routing, or any API
contract, but several touch contract-adjacent presentation rules recorded in
the PRD: the Private Voice destination label, the point at which Private
privacy consent becomes mandatory, the Create Voice photo guidance layout, and
responder dashboard hero content and labels.

The affected surfaces are the organization dashboard hero
(`DashboardHome`), the Create Voice wizard (`CreateVoicePage`,
`useDraftWizard`), the draft preview and voice detail headers, the Union
work-items copy, and the forced-change password screen. No serializer, schema,
or OpenAPI change is involved; every change is a display-layer concern in the
workforce app.

## Decision

1. **Private Voice destination label.** All Private Voice destinations in the
   workforce UI present as **"Komite"** through a shared
   `PRIVATE_ROUTE_LABEL` constant: the Create and preview "Rute tujuan" rows,
   the detail/conversation hero PIC line, and the Union Head work-items
   description. Union account display names never render as a Private
   destination. The logged-in Union account's own role label on its dashboard
   hero is unchanged.
2. **Private privacy checklist gates analysis.** For Private drafts, the
   "Simpan & Analisis" control is disabled until both the identity choice
   (`showReporterIdentity`) and the personal-contact consent
   (`privateContactConsent`) are set. An `aria-live` helper names the missing
   consent, and the wizard retains click-time validation as defense in depth.
   Analysis therefore requires full consent; submit-time server enforcement
   is unchanged. Manual draft persistence without consent is no longer
   reachable from the wizard because the only forward action is gated.
3. **Photo guidance layout.** The attachment guidance renders as one block
   below the picker — never beside the thumbnails — with two identically
   styled `(i)` rows: file format/size first, the ATSG rule second. The
   `atsg-photo-guidance` element id is preserved for `aria-describedby`.
4. **Forced-password back control.** When `passwordChangeRequired` is set, the
   "Kembali ke login" button renders with a tinted cobalt background, cobalt
   text, and bold weight (`auth-back--login`); ordinary password change keeps
   the ghost "Kembali".
5. **Responder dashboard labels.** The reporter basis tab reads
   **"Pelaporan"**, and the summary heading and accessible name are
   **"Ringkasan Voice"** for both General and Private tabs.
6. **Responder dashboard hero simplification.** The hero no longer renders the
   avatar initial, the "Buat Voice" orb, or the "Operasional Responder"
   persona badge, and the `dashboard-context` line (scope label, basis
   description, and last-updated timestamp) is removed entirely. The
   read-only indicator chip for Union/leadership scopes is retained. Voice
   creation remains available through the bottom navigation, quick actions,
   and the personal section CTA.
7. **Compliance notes.** The removed context line carried the offline
   staleness suffix; the offline state remains communicated by the existing
   body Alert, satisfying the stale-indicator requirement. Read-only surfaces
   keep server-enforced permission and expose no mutation affordance.

## Implementation

- `apps/web-voice/src/features/home/DashboardHome.tsx`: hero restructure,
  title literal "Ringkasan Voice", "Pelaporan" tab, context-line removal.
- `apps/web-voice/src/features/create/CreateVoicePage.tsx`: unified
  `media-input__guidance` block, `privacyComplete` gating, Private route
  label.
- `apps/web-voice/src/features/create/useDraftWizard.ts`: consent validation
  in `saveAndProcess`.
- `apps/web-voice/src/components/VoiceHero.tsx`: Private PIC renders
  `PRIVATE_ROUTE_LABEL`.
- `apps/web-voice/src/features/create/DraftPreviewPage.tsx`,
  `features/work/WorkItemsPage.tsx`: committee label adoption.
- `apps/web-voice/src/lib/formatters.ts`: `PRIVATE_ROUTE_LABEL` constant.
- `apps/web-voice/src/App.tsx` + `styles.css`: `auth-back--login` styling and
  guidance/hero CSS cleanup (`dashboard-context`, `media-input__note`,
  `atsg-photo-guidance` rules removed).

## Consequences

- Reporter-facing Private surfaces can no longer disclose Union account names
  through route or handler metadata, independent of what the API returns.
- Consent now precedes AI classification for Private drafts, aligning the
  analysis gate with the submit gate; the PRD analysis-consent wording is
  amended accordingly.
- Dashboard scope verification in tests moved from the removed context line
  to the organization selector summary (`dashboard-org-summary`, the same
  `scopeLabel` source) and the basis tab `aria-pressed` state.
- The dashboard "last updated" timestamp is no longer displayed; freshness
  signaling relies on polling refresh and the offline Alert.

## Validation

- Unit suites pass (API 82, frontend-core 15, Admin 2, workforce 83).
- Full mocked browser suite passes 292/292 across Chromium, PWA, push, and
  legacy iOS projects; fullstack project passes 4/4 against the real API and
  Docker PostgreSQL.
- Visual baselines regenerated for all 17 dashboard scenarios, the affected
  create/consent/password/union surfaces at 360/768/1440 on darwin and
  canonical Linux x64 (Docker `--platform linux/amd64`, Node 22.23.2,
  pnpm 11.8.0, Playwright 1.62.1), each verified twice without updates;
  representative images inspected.
- Frozen install, audit, format, lint, typecheck, migration destructive
  check against `origin/staging`, OpenAPI determinism check, integration 84,
  security 14, performance (organization dashboard p95 317 ms), storage
  reconciliation dry-run, production build, PWA compatibility gate, Compose
  config validation, Gitleaks directory scan, and `git diff --check` all
  pass.

## Follow-up Work

- If a persistent "last updated" affordance is wanted again, design it as a
  deliberate element rather than restoring the removed metadata line.
- The legacy `MemberHomePage` responder blocks in `HomePage.tsx` are
  unreachable dead code and were left untouched; a future cleanup may remove
  them.
