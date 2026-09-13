# ADR-0050: Workforce Category and Preview Presentation

- Status: Accepted
- Date: 13 September 2026
- Related: PRD §12.1, §12.2, §13.5, §22; ADR-0029 and ADR-0043

## Context

Product review of the workforce create flow identified copy that was unclear to
members, a stay-on-page instruction placed outside the active processing card,
English category names in reporter-facing surfaces, and a preview destination
that exposed the route implementation role rather than the intended neutral
recipient wording. The category catalog is revisioned and Admin-managed, while
historical Voice records preserve category-name snapshots. Changing catalog data
would therefore have consequences beyond the requested workforce presentation.

## Decision

The first create step uses “Pilih kategori yang tepat untuk suara Anda.” and fixes
“dirahasikan” to “dirahasiakan”. The AI processing instruction “Mohon tetap di
halaman ini” is rendered as a high-contrast callout inside the processing card and
its existing live region. Manual Fallback changes only the displayed Low and High
descriptions to the approved production and KPI wording; the AI severity rubric is
unchanged.

The workforce application resolves category display names through one stable-key
formatter. `ENVIRONMENT` is displayed as “Lingkungan” and `FACILITY_REPAIR` as
“Perbaikan Fasilitas”, even when current catalog content or a historical snapshot
contains the earlier English name. Other categories continue to use the catalog
name, including custom categories. Workforce handover search matches the localized
alias, catalog name, and stable key.

A ready General draft preview displays “PIC Terkait” instead of Department Head or
Default PIC. An unresolved General route remains “Akan ditentukan”, and Private
continues to display “Komite”. The backend route target remains available and
unchanged for compatibility and server-side validation.

## Rationale and Alternatives

Stable-key presentation aliases give members consistent terminology without
creating category revisions, rewriting historical snapshots, changing Admin
configuration, or altering AI context. A catalog-wide rename was rejected because
the request is limited to workforce presentation. Applying aliases only to Manual
Fallback was rejected because the same category would then appear under different
names elsewhere in the workforce application.

The generic preview recipient avoids unnecessary concern about a Manager receiving
the submission while preserving truthful unresolved-route feedback. Replacing PIC
terminology across operational detail and handover surfaces was not selected; those
surfaces require the actual handler context.

## Consequences

Admin may display the catalog name “Environment” while workforce users see
“Lingkungan”; this is intentional. Historical storage and API payloads remain
unchanged. Any future workforce rename should extend the centralized formatter
rather than add component-specific substitutions. Custom category names continue
to pass through unchanged.

## Validation

Unit coverage verifies alias precedence and dynamic-name fallback. Browser coverage
verifies create copy, Manual Fallback labels and severity descriptions, processing
callout containment, ready and unresolved General preview labels, Private `Komite`,
dashboard display, and localized/raw/stable-key handover search. Native captures
cover the affected create, processing, fallback, preview, dashboard, detail, and
handover surfaces. Existing accessibility, responsive, reduced-motion, legacy
WebKit, full-stack, OpenAPI byte-stability, and production build gates remain.
