# ADR-0016: Registration-Number Route Remediation and Dashboard Containment

- Status: Accepted
- Date: 28 August 2026

## Context

The Admin remediation queue exposed internal account UUIDs and optimistic route
UUIDs, required a free-text reason, and displayed only a truncated organization
unit UUID. Operators identify employees by registration number and need the
affected department name to resolve missing or invalid routes. The same issue
affected global PIC selection.

Union Head Home also called the Member dashboard endpoint. Union accounts do not
have the `MEMBER` capability and cannot create Voice, so the expected backend
denial appeared as a misleading dashboard-summary failure. Separately, the
member dashboard's content-sized grid tracks allowed the white status card to
exceed the blue hero at mobile widths, especially with a long display name.

## Decision

Default PIC and global PIC route mutations accept a strict request containing
only `noReg`. The backend resolves the employee and account within the serialized
route transaction, locks the account row, and validates active workforce and
organization membership. Global PIC selection additionally requires an active
Department Head membership. Route history, idempotency, account locking, issue
resolution, and audit records remain server-owned; a deterministic system reason
is recorded instead of operator-entered text.

Remediation issue responses include a bounded organization-unit projection with
ID, directorate, division, and department. The Admin table displays the affected
department or an all-departments label for the global route. Internal account and
route identifiers are absent from the operator form.

The remediation page is presented as an operational workspace rather than a raw
issue table. It includes global open-issue context, page-level affected-department,
route, and Union counts, explicit submission-blocking guidance, filters for every
issue type, human-readable impact descriptions, organization hierarchy, detected
timestamps, and status-aware actions. The drawer repeats the affected scope and
routes Union/source-data issues to their authoritative management surfaces.

Union Home does not execute or render Member-dashboard behavior, own-Voice
content, or create actions. It retains the authorized Private aggregate and
read-only General aggregate.

The dashboard hero and inner status card use explicit centered widths and
zero-minimum grid tracks. Progress segments and the four status cells may shrink
within the card, with mobile padding and ellipsis protecting narrow layouts.

## Rationale

Registration number is the stable operator-facing employee identifier and
preserves leading zeroes. Resolving the account server-side prevents accidental
or malicious UUID selection while retaining the existing eligibility rules.
Account and route locks provide the concurrency boundary even though the form no
longer exposes a route version field.

Capability-gating the Member request matches the account model and removes a
false error without weakening backend authorization. Explicit grid constraints
address the actual content-sizing mechanism rather than hiding page overflow.

## Alternatives Considered

- Keep Account ID and add an employee lookup helper: rejected because the form
  would still expose an internal identifier and require multiple fields.
- Promote a selected default PIC structurally to Department Head: rejected
  because structural position remains authoritative workbook data; the mapping
  grants only scoped Manager capability.
- Allow the Union Member request and suppress its error: rejected because it
  would retain an unauthorized, unnecessary request and misleading own-Voice UI.
- Apply `overflow-x: hidden` to the page: rejected because it would conceal the
  clipped dashboard instead of constraining its layout.

## Consequences

The OpenAPI request schema and generated client change from account/route/reason
selection to `{ noReg: string }`. Existing clients using the old payload must be
updated with the same release. No database migration is required. Audit reasons
for these route changes are deterministic system text rather than operator text.

The remediation response gains a safe organization-unit projection. Union Home
is now strictly operational and cannot present reporter affordances. The hero is
bounded to 48rem and centered, while surrounding dashboard sections may continue
using the wider application content area.

The richer remediation workspace performs one existing Admin overview read for
the authoritative open-issue count; issue rows and page-level group counts remain
derived from the paginated remediation response. No new backend endpoint is
introduced.

## Validation

OpenAPI generation and API, Admin, and workforce typechecks pass. Production
frontend builds pass. Playwright verifies the affected department label,
No. Reg-only payloads for default and global PIC, absence of Member requests and
create actions for Union Head, and centered in-viewport blue/white dashboard
cards at 360px with a long display name.

Admin browser coverage also verifies the workspace headings, readable issue
labels, organization hierarchy, scope drawer, filter/error/empty states, WCAG
2.1 AA, focus containment, reduced motion, and no document overflow at 1280px
and 1440px.

Real PostgreSQL integration tests verify registration-number lookup, default and
global eligibility, route creation, idempotent serialization, and the concurrent
route-assignment/account-deactivation invariant.

## Risks and Follow-up

No. Reg comparisons remain exact after trimming so leading zeroes are significant.
Hosted staging must deploy backend, generated contract, and both frontends as one
compatible release. Staging acceptance should repeat default/global remediation,
Union Head Home, and a narrow mobile Safari dashboard check.
