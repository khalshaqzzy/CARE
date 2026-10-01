# ADR-0058: Incident shop routing for location-owned categories

- Status: Accepted
- Date: 30 September 2026
- Related: PRD §12.2, §12.3, §13.1, §13.2, §14.2, §14.5, §41.2; ADR-0029, ADR-0033, ADR-0053

## Context

General Voice routing is deterministic server logic over the dynamic category catalog (ADR-0029). Each category route had one of two modes:

- `FIXED_DEPARTMENT`: the Department Head/default PIC of a configured department. Safety, Environment, and Fasilitas Umum route to Plant GA & SHE Dept; Facility Repair routes to Smart Plant Facility Mfg Dept.
- `RELATED_REPORTER_DEPARTMENT`: the Department Head of the reporter's own department. Fasilitas Kerja / Kesulitan Kerja and Kesejahteraan used this mode.

The reporter-department mode treated the reporter's department as a stand-in for the owner of the problem. This holds when a production member reports a problem in their own shop, but not when someone from an office department walks into a production shop and reports a machine, tool, or workstation problem there. That Voice reached the office Manager instead of the Manager of the shop where the problem is. Fixed categories were not affected, because a facility defect in a shop still belongs to the facility PIC.

The system had no notion of where a department operates. `Voice.area` records only the plant site (Karawang 1–3, Sunter 1–2), the organization import carries no area column, and `locationDetail` is free text that the AI only checked for completeness. Some production departments operate in several areas (for example Logistic Operation Unit Dept in Karawang 3, Sunter 1, and Sunter 2). Reporters write shop names informally and with typos ("asy", "Assy #1", "assy1" for Assembly & PIO Production #1 Dept). Adding required form fields was rejected to keep Voice submission short.

## Decision

1. A third route mode, `LOCATION_OWNER_DEPARTMENT`, routes to the Department Head/default PIC of the incident shop's department, or to the reporter's department when the incident is not in a shop. Fasilitas Kerja / Kesulitan Kerja uses it. Kesejahteraan stays `RELATED_REPORTER_DEPARTMENT` because it concerns the person, not the place. Fixed categories remain fixed even inside a shop.
2. Admin maintains **Lokasi shop**: a `ShopLocation` marks one organization unit as a shop, lists the Areas where it operates (many areas per department, many shops per area), and holds normalized aliases. Shops can be archived but not deleted. The receiver is always the single active Department Head/default PIC of that department.
3. The shop is inferred from what the reporter already entered, without new required fields. The selected Area filters the candidate shops. Resolution order:
   1. the reporter's explicit confirmation (a shop active in the area, or "not in a shop");
   2. whole-token alias matches on the normalized location text, where the most specific alias wins; if several shops still tie, the reporter's own department wins when it is one of them;
   3. the AI suggestion from the existing location review when its confidence meets the classification threshold;
   4. otherwise not in a shop.
4. An ambiguous alias match or a low-confidence AI suggestion yields `NEEDS_CONFIRMATION`. For location-owner categories the draft preview shows a one-tap **Konfirmasi lokasi kejadian** card and submit is rejected with `SHOP_CONFIRMATION_REQUIRED` until the reporter answers. A resolved shop is shown as a changeable **Lokasi kejadian** row. Other categories never ask.
5. The AI suggestion is added to the existing location review call instead of a new request. For General drafts the review receives `shopContext` (shop id, department name, aliases for the selected area) and returns `shopId` (enum of the supplied ids, or null) with `shopConfidence`. Ids outside the supplied catalog are discarded. The location prompt version moves to `care-location-v1.3`. The classification prompt and schema are unchanged.
6. Every General Voice snapshots `shopLocationId`, `shopOrganizationUnitId`, `shopDepartmentSnapshot`, and `shopResolutionSource`, whatever its category. Manager and Admin handovers to a location-owner category use the snapshot shop department, falling back to the reporter's department.
7. The Manager's assignment sheet shows the incident Area, shop department, and location text. Section Head candidates show the active-Voice count followed by their Section name under the highlighted person name, and search covers both. Candidates are not filtered by area because the organization data has no per-Section area yet.

## Rationale

The location owner is the organizational fact the reporter-department mode approximated, so an explicit mode keeps the category catalog as the single routing contract and leaves other categories untouched. Deterministic alias matching is predictable and auditable. The AI only fills gaps (typos, synonyms) within a closed, area-scoped catalog, and never selects a person, which preserves the PRD rule that routing is server logic. Asking the reporter only when the answer is uncertain keeps the common path at zero extra steps while avoiding silent misroutes. Confirming before submit (not after) preserves the invariant that every Voice has exactly one route owner at submit. Handover remains the safety net for anything still misrouted.

## Alternatives considered

- **Required "Shop/Office" choice and shop picker on the form.** Most explicit, but adds steps to every submission. Rejected in favor of inference plus confirmation only when uncertain.
- **Route all categories in a shop to the shop Manager first.** Considered; deferred. Facility, safety, and environment reports would have waited for a shop Manager before reaching the responsible PIC.
- **Derive the shop from the reporter's department.** Misroutes exactly the outsider case this change fixes.
- **Separate AI call for shop matching, or adding it to classification.** A new call adds latency. Classification does not receive the location text and has a stricter contract. The location review already receives area and location detail.
- **Fuzzy string distance for typos.** Tunable but opaque, and risks false positives between similar shop names. Deferred to the AI within an area-scoped catalog.
- **Area per Section to rank assignment candidates.** Needs a new organization import column. Deferred.

## Implementation

- Schema/migrations: `20260930090000_shop_location_routing` adds the route mode, `ShopLocation`, draft confirmation columns, Voice snapshot columns, and location-review suggestion columns. `20260930090100_work_difficulty_location_owner_route` closes the seeded `WORK_DIFFICULTY` route only if it is still `RELATED_REPORTER_DEPARTMENT`, bumps the category version, and inserts a `LOCATION_OWNER_DEPARTMENT` route. The enum value is added in a separate migration so it can be used safely.
- API: `apps/api/src/shops/` (`shop-matching.ts` pure resolution/normalization, `ShopLocationsService`, `AdminShopLocationsController` at `/api/v1/admin/shop-locations` with create/update/status/unmatched, idempotency keys, optimistic versions, and `SHOP_LOCATION_*` audit events). `VoicesService` resolves the shop in `resolveRoute`, exposes `shopResolution` on the draft preview, adds `PUT /drafts/:id/shop-confirmation`, snapshots the shop on submit, clears confirmations when the location changes, applies the mode in Manager/Admin handover, returns candidate `section`, and adds `shopLocation` to Voice detail. `CategoriesService` accepts the new mode.
- AI: `locationSchema(shopIds)`, a shop-matching paragraph in the location prompt, and `reviewLocation({ shops })`.
- Web: `ShopClarification` on the draft preview, assignment sheet location strip and section-aware candidates, Admin **Lokasi shop** section and the new mode in category configuration.
- OpenAPI/contracts regenerated. The browser inventory moves from 407 to 415 tests, and capture scenarios from 173 to 181.

## Consequences

- An office reporter's Fasilitas Kerja Voice about a shop now reaches that shop's Manager. A production reporter in their own shop sees no change.
- Routing quality depends on Admin-maintained aliases. Until shops are configured, behavior equals the previous reporter-department routing. The unmatched-text list shows gaps.
- A shop whose department lacks exactly one active Department Head/default PIC blocks location-owner submissions that resolve to it (`GENERAL_ROUTE_UNAVAILABLE`, draft preserved), the same as other route gaps. Admin sees it as GAP.
- AI suggestions are cached with the location review. A shop catalog change is reflected immediately for alias matches, and for AI suggestions on the next review of changed location text.

## Validation

- Unit: normalization, alias specificity, reporter tie-break, AI threshold/out-of-catalog handling, confirmation precedence; AI adapter contract for shop schema and catalog payload.
- Integration (`shop-location-routing.integration.test.ts`): outsider-in-shop routing, ambiguous confirmation and rejection, reporter tie-break, office and not-in-shop fallback, confirmation reset on location change, multi-area shops, fixed categories with shop snapshot and location-owner handover options, Admin create/update/conflict/unmatched. 8/8 passed against Docker PostgreSQL.
- Migration upgrade (`scripts/test-shop-routing-migration-upgrade.mjs`, part of `test:migration:upgrade`): the seeded route moves to `LOCATION_OWNER_DEPARTMENT` with closed history and a version bump, Kesejahteraan and historical Voices are unchanged, and an Admin-customized route is preserved.
- Browser/visual (`shop-routing.visual.spec.ts`): single and multiple candidate confirmation, change of a resolved shop, non-applicable categories, assignment sheet location and section descriptions at 360/1440 px, Admin shop editing.

## Risks and follow-up

- Add an Area column per employee/Section to the organization import, then rank or label assignment candidates matching the incident area.
- Reconsider routing fixed categories through the shop Manager first if operations request it.
- Revisit the AI confidence threshold for shop matching if confirmations are frequent.
