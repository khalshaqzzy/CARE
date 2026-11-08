# ADR-0082: CARE Admin navigation sections and report dashboards

- Status: Accepted (implemented on `feat/admin-dashboards`, not released)
- Date: 8 November 2026
- Related: ADR-0042 / ADR-0063 (organization and Director dashboards), ADR-0061 (legacy Voice migration), ADR-0065 (account login tracking), ADR-0068 (Division Admin), ADR-0071 (stored response timings), ADR-0075 (Panduan), ADR-0081 (Jawaban Cepat), PRD §11.5, §46

## Context

CARE Admin had grown to fifteen menu items in one flat list whose order followed the order in which features had been delivered (Overview, Import & Master Data, Remediation & Route, Kalender & Eskalasi, Jawaban Cepat, Union Accounts, Admin Divisi, Panduan, Accounts, Voice Explorer, Handover Admin, Koreksi Kategori, Audit, System Status). Labels mixed English and Indonesian, and nothing showed which items belonged together.

The Admin app was also not usable for reporting:

- **Voice Explorer** was a filtered table only. Totals by status, category, severity, area and the response / completion times were available on the workforce organization dashboards, but not in the Admin app, and not for an arbitrary filter combination.
- Voices imported from earlier member-voice platforms (ADR-0061, 883 in the first batch) appeared in the same table as Voices sent in CARE. They are closed history without response data, so they distorted every reading of the explorer.
- The category filter offered six hard-coded keys that no longer matched the configured General Voice categories; the date filter took only one day.
- **Accounts** showed a responder login card only, and a login card per unit only after a division was chosen. There was no view of all accounts by status, kind or role.
- Several pages held separate jobs on one long screen: Remediation & Route (route status, remediation queue, category configuration, shop locations side by side), Kalender & Eskalasi (calendar and per-level deadlines), Import & Master Data (new import flow and import history), System Status (health and AI configuration).
- "Union" was still used in the Admin app although the workforce app and the organization call the role **Komite**.

## Decision

### 1. Menu in five labelled sections

The shared `Sidebar` (`packages/ui`) accepts an optional `group` per item; consecutive items with the same group render under one uppercase heading (a hairline divider when the sidebar is collapsed). It also accepts an optional `badge` per item. The CARE Admin menu becomes:

| Section      | Items                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ringkasan    | Overview (`/`)                                                                                                                                                            |
| Voice        | **Voice Explorer** (`/voices`, tabs Semua Voice · Handover Admin · Koreksi Kategori; badge with the pending handover count), **Voice Migrasi** (new, `/voice-migrations`) |
| Akun & Akses | Akun (`/accounts`), **Akun Komite** (`/union`), Admin Divisi (`/division-admins`)                                                                                         |
| Konfigurasi  | Data Organisasi (`/imports`), Route & Kategori (`/remediation`), **Pengaturan Sistem** (new, `/settings`, tabs Kalender & Eskalasi · Jawaban Cepat · Panduan)             |
| Sistem       | Audit (`/audit`), Status Sistem (`/system`)                                                                                                                               |

Handover Admin and Koreksi Kategori act on Voices, so they became tabs of Voice Explorer; Kalender & Eskalasi, Jawaban Cepat and Panduan are all system-wide settings, so they became tabs of one Pengaturan Sistem page. The former routes redirect to the matching tab (`/handovers` → `/voices?tab=handovers`, `/category-corrections` → `/voices?tab=corrections`, `/escalation` → `/settings`, `/quick-replies` → `/settings?tab=quick-replies`, `/guides` → `/settings?tab=guides`); a handover decision keeps its own route `/handovers/:id`, returns to the Handover Admin tab, and keeps Voice Explorer highlighted in the menu. Other routes are unchanged. Page titles and eyebrows follow the new names. The Division Admin menu (Voice divisi, Akun divisi) and its `/voices` page are unchanged (no tabs). The handover badge reads the first page of the pending queue (`N`, or `N+` when there is a next page) and appears on the Voice Explorer menu item and the Handover Admin tab.

### 2. Voice Explorer summary that follows the filters

- New endpoint `GET /api/v1/admin/voices/summary` (CARE Admin only; others receive 404). It accepts the explorer filters `search, status, statusGroup, visibility, severity, area, category, handler, from, to, origin` and returns:
  - `total`, `overdue`, `migrated`;
  - `status[]`, `severity[]` (fixed order) and `area[]` buckets;
  - `category[]` (General Voices only, label from the current category revision, the custom-category snapshot, or "Tanpa kategori");
  - `averageResponseSeconds`, `averageCompletionSeconds`, `averageFeedbackScore` with their sample counts.
- The Voice list and the summary build their `where` from one function, `VoicesService.listWhere(query, scope)`, so the numbers always describe the rows in the table. The counts use Prisma `groupBy` on that `where`.
- Overdue and the averages reuse the organization dashboard measurement (`OrganizationDashboard.cohortPerformance`, which calls the existing `performanceFor`): first response from the stored `VoiceResponseTiming`, completion per closure cycle to the PIC's report, rating per cycle, and migrated Voices excluded from the averages and timeliness (ADR-0061, ADR-0071). The explorer therefore never disagrees with the workforce dashboards about what "rata-rata respon" means.
- To run that SQL on the explorer filters, `dashboardSql` additionally serializes `{ field: { not: null } }` as `IS NOT NULL` and `{ field: { contains, mode: 'insensitive' } }` as a parameterized `ILIKE` with `\`, `%` and `_` escaped. Values stay bind parameters.
- Summary UI (`VoiceSummary`, shared `AdminSummary`): KPI tiles Total, Terbuka, Direspon, Diproses, Selesai (with %), Terlambat; a "Waktu penanganan" column (response, completion, rating when rated); bars for Kategori, Severity and Area. Status tiles and the category, severity and area bars are buttons that set or clear the corresponding filter, so the list and the summary narrow together. The filter bar sits above the summary.
- **Slide-up.** The summary header has **Sembunyikan / Tampilkan**. Hidden, the body collapses (CSS grid rows `1fr → 0fr`, disabled under reduced motion) into one header line of number chips, so the table gets the room. The choice is stored per page in `localStorage` (`care-admin-summary:<page>`, read and written inside `try/catch`; without storage the summary simply starts open).
- Filters: the category filter lists the configured General Voice categories (archived ones marked "arsip"); the single date became **Dikirim dari / Sampai**, sent as WIB day bounds (`00:00:00.000+07:00` to `23:59:59.999+07:00`). The long warning alert was replaced by a small "Akses Private diaudit" note.
- **Unduh Excel** calls `GET /api/v1/admin/voices/export` with the same filters (see §4).

### 3. Voice Migrasi as its own page

- `GET /voices` accepts `origin=CARE|MIGRATED` (`legacySource IS NULL` / `IS NOT NULL`); other values return 400 `ORIGIN_FILTER_INVALID`. Voice list items now also carry `legacyId`.
- Voice Explorer and its summary always send `origin=CARE`. A Division Admin's explorer is unchanged.
- The new **Voice Migrasi** page (`/voice-migrations`) lists `origin=MIGRATED` Voices newest first with platform, earlier ID, title, category, severity and PIC; filters search (CARE ID, earlier ID, title), category, severity and date range; and offers the export. It deliberately has no summary: the Voices are closed history without response data, and their volume is already counted by the organization dashboards.

### 4. Admin Voice export

`GET /api/v1/admin/voices/export` (CARE Admin) returns one `Voice` worksheet for the filtered Voices (limit 10 000; above it 400 `EXPORT_TOO_LARGE`): CARE ID, origin and earlier ID, visibility, sent, status, severity, category, title, detail, area, location, reporter No. Reg / name / division / department, handling department, PIC, closed time, rating, updated. For Private Voices the reporter columns and category are left empty (reporter "Private", handling department and PIC "Komite"): the full Private identity remains readable per Voice, where each read is audited, but never in a bulk file. Every export writes an `ADMIN_VOICE_EXPORT` audit event with the filters and the row count. The file name is `voice-<date>.xlsx` or `voice-migrasi-<date>.xlsx`.

### 5. Akun dashboard

- New endpoint `GET /api/v1/admin/accounts/summary` (CARE Admin; login counts as in ADR-0065) with the list filters `search, kind, status, responderLevel, division, department, section, loggedIn`. The account list and the summary share `AdminService.accountWhere`. It returns `total`, `loggedIn`, and `{ key, label, total, loggedIn }` buckets for `status` (Aktif, Legacy handler, Nonaktif), `kind` (Workforce, Komite, Admin Divisi, Admin; empty kinds omitted) and `role` (Member, then Group Leader, Section Head, Department Head, Deputy / Division Head by active-snapshot structural position; Member = workforce accounts at none of those positions).
- The Akun page shows one collapsible **Ringkasan Akun** (same `AdminSummary` component) instead of the responder card and the per-unit login card: KPI tiles Total, Aktif, Legacy handler, Nonaktif, Sudah login (% of the filtered accounts), Belum login; bars "Peran · sudah login" (logged in / total per role), "Jenis akun", and "Login per divisi / departemen / seksi" from the existing login summary one level below the chosen unit. Tiles and bars filter the list (a role sets `responderLevel`; Member is not filterable because it has no responder level). **Ekspor belum login** moved to the page header. The Division Admin view keeps its existing login card.
- The responder card component was removed; `GET /admin/accounts/responder-summary` stays for compatibility.

### 6. Overview as the reporting home

The Overview page now shows: **Voice bulan ini** (Voices sent in CARE since the first day of the WIB month: received, open/responded, in progress, closed with %, overdue, average response with completion) linking to the explorer with that date filter; **Perlu tindakan** (pending handovers, overdue this month, open Critical Voices, open remediation, Akun Komite state, failed audits when any), each row opening the page that resolves it; **Akun workforce aktif** (active, % logged in, not logged in, the six divisions with the lowest login rate, each opening Akun filtered to that division); and one status line (readiness, last organization import, release). The previous priority list, quick-action grid, import table and dependency card were removed as duplicates of their own pages.

### 7. Separate jobs on separate tabs

`AdminSections` wraps the shared `Tabs` and keeps the open tab in the URL: `?tab=` for a page's tabs and `?section=` for tabs inside a tab (Kalender & Eskalasi inside Pengaturan Sistem); the first tab has no parameter. Switching a tab keeps the other URL state, such as an import `previewId` or explorer filters, and drops only paging (`cursor`, `cursorHistory`) and, for an outer tab, the inner `section`. Content inside a tab is wrapped in a depth context: an `AdminPageHeader` rendered there becomes a section header (no eyebrow, `h2`, same actions such as **Tambah jawaban cepat** or **Upload PDF**), so a page reused as a tab does not repeat the page title. Applied to:

- **Voice Explorer:** **Semua Voice** (the explorer, its summary and export), **Handover Admin (N)**, **Koreksi Kategori**.
- **Pengaturan Sistem:** **Kalender & Eskalasi** (with its own inner tabs), **Jawaban Cepat**, **Panduan**.

- **Route & Kategori:** a one-line status strip (route mode, categories, route gaps, open issues, compliance, updated) above the tabs **Remediation (N)**, **Kategori**, **Lokasi shop**.
- **Kalender & Eskalasi:** **Kalender kerja**, **Batas waktu**.
- **Data Organisasi:** **Impor baru** (stepper, upload, preview, confirm), **Riwayat impor**.
- **Status Sistem:** **Kesehatan** (health, readiness, release), **Konfigurasi AI**.

Unsaved form state lives in the page components, so switching tabs does not lose it.

### 8. Komite naming

The Admin app shows **Akun Komite** for the former Union Accounts page, **Ketua Komite / Komite 1 / Komite 2** for the slots, and "Komite" for the `UNION` account kind. Enum values, routes and API names (`UNION_HEAD`, `/admin/union-accounts`) are unchanged.

## Rationale

- One filter definition for list, summary and export removes the most likely reporting error: numbers that silently describe different Voices than the table.
- Reusing the dashboard performance SQL keeps a single definition of response and completion time across the product and inherits its migrated-Voice exclusion and stored timings.
- A collapsible summary keeps reporting and detailed browsing on one page, which was preferred over a separate report page; remembering the state respects users who mostly browse.
- Tabs were preferred over stacked headed cards because each of these pages holds jobs that are rarely done together, and the long combined screens hid the remediation queue below configuration forms.

## Alternatives considered

- **A separate "Laporan" page.** Rejected: it would duplicate the explorer filters and force switching between pages to see the rows behind a number.
- **Reusing `GET /dashboard/general|private` from the Admin app.** Rejected: those endpoints split General and Private, take organization-scope parameters, and do not accept the explorer's text search, handler or origin filters.
- **Computing the summary in the browser from list pages.** Rejected: the list is paged (10 per page) and the averages need closure cycles and timings.
- **Keeping migrated Voices in the explorer behind a toggle.** Rejected: every summary would need the toggle explained; a separate list is clearer and matches how the data is used (lookup by earlier ID).
- **Including Private reporter identity in the export.** Rejected for privacy; per-Voice audited access remains the only path.

## Consequences

- Admin users find pages under different names; routes are unchanged.
- The Overview no longer lists quick actions for every page; the grouped menu replaces them.
- The Voice Explorer default view excludes migrated Voices. Searching a migrated Voice by earlier ID now happens on Voice Migrasi.
- The summary endpoint runs one dashboard-style aggregate per filter change. On the Admin's global scope this is the same query shape as the Director / Union organization dashboard; it is not part of the hosted performance gate.
- `dashboardSql` accepts two more predicate shapes; anything else still throws.
- E2E inventory rises from 500 to 503 (new `e2e/admin-dashboards.spec.ts`).

## Validation

- Integration `admin-reports.integration.test.ts` (5): summary counts, categories, averages and search on `origin=CARE`; migrated-only summary; `origin` list filter and 400 for unknown origins; export rows, Private reporter redaction and audit event; account summary by kind and role; 404 for non-admins. Existing voice-pagination, division-admin, login-tracking, admin-improvements, dashboard-filter, organization-dashboard, legacy-voice-import and responder-matrix suites pass (57).
- Unit: `dashboardSql` serializes `IS NOT NULL` and escaped `ILIKE` with bound values.
- E2E (mocked API): new spec for summary filtering, collapse persistence across reload, Voice Migrasi origin and absent summary, menu sections, and Route & Kategori tabs; updated admin journeys, accessibility (WCAG 2.1 AA, no overflow at 1280/1440), login tracking, visual and full-stack journeys.

## Risks and follow-up

- The handover badge counts only the first page of the queue (30); "30+" is shown beyond that.
- `averageFeedbackScore` is shown only when ratings exist; migrated Voices are never rated.
- If the export limit becomes too small for monthly reporting, a streamed export can replace the in-memory workbook.
- The Overview's "Voice bulan ini" uses the WIB calendar month; a period picker can be added if needed.
