# ADR-0075: Panduan — PDF and video guides managed in CARE Admin and shown by role

- Status: Accepted (implemented on a branch, not released)
- Date: 29 October 2026 (video links added 31 October 2026)
- Related: PRD §11.6 and §23.1, ADR-0069 (tiered closure approval), ADR-0047 (shared validation)

## Context

CARE is being rolled out to members coming from other member-voice platforms, and to Group Leaders, Section Heads, Managers, Division leadership and the Komite, who respond within fixed targets. Training material existed only outside the app as slides and posters. Members asked how to submit a Voice. Responders asked how to respond, set targets and close or approve Voices. The app had no place to look this up.

The guides are written and revised by the CARE team, who already produce them as PDFs for printing and sharing. Two audiences need different material:

- every member needs material on creating, sending and following a Voice;
- anyone who handles or approves Voices also needs responder material.

The CARE team must be able to publish, replace and retire guides without a code change or deploy. A first iteration that shipped PDFs as static files inside the web-voice image was replaced by the design below before release.

Short videos showing the same flows were also wanted. Hosting video on the CARE VPS was weighed against linking to an external player; see Rationale.

The workforce app is a mobile-first PWA. Its mobile dock already holds five items for responders (Home, Voice Member, Buat Voice, Voice Saya, Pengaturan), so a sixth item does not fit.

## Decision

### Management in CARE Admin

- A **Panduan** page (`/guides`) sits in the CARE Admin sidebar between Admin Divisi and Accounts. It is available to the `CARE_ADMIN` capability only; Division Admins do not see it.
- Two kinds of guide exist: **PDF** (an uploaded file) and **Video** (an external https link, for example YouTube, Google Drive or SharePoint).
- The page lists every guide in display order: title, then either the file name and size (a link that opens the PDF) or "Video · <link>", audience badges, last update and uploader.
- **Upload PDF** opens a dialog with:
  - a title (1–120 characters);
  - two checkboxes under "Tampil untuk": **Member** and **Responder**, at least one of which is required;
  - one PDF file of at most 20 MB.
- **Tambah video** opens a dialog with the title, **Link video** (must start with `https://`; the dialog shows "Link harus diawali https://" otherwise) and the same two checkboxes.
- **Ubah** edits the title and audience. For a PDF it can optionally replace the file; for a video it edits the link. The guide keeps its id and position, so every account sees the change at once. A guide cannot change kind; delete and re-create it instead.
- Up and down arrows reorder the guides. **Hapus** asks for confirmation, then removes the guide and its file.
- The number of guides per audience is not limited.

### Display in the workforce app

- The route `/panduan` (title **Panduan**) lists the guides for the signed-in account in two groups, **Dokumen** (PDF) and then **Video**, each in admin order. A group with no guides is hidden.
  - A PDF row shows a blue document icon, the title and "PDF · size", and opens the PDF in a new tab so the device's own viewer handles zoom, search, saving and sharing.
  - A video row shows a red play icon, the title and "Video · <source>". The source is derived from the link: YouTube, Google Drive, SharePoint, or the host name. It opens the link in a new tab (`rel="noopener noreferrer"`), so the video plays on its host.
  - Every row ends with an external-link icon.
- When no guide applies, the page shows an empty state, "Belum ada panduan".
- Audience rules, applied by the API:

  | Account capabilities                                                                                        | Sees guides marked                           |
  | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
  | `MEMBER`                                                                                                    | Member                                       |
  | `GROUP_LEADER`, `SECTION_HEAD`, `MANAGER`, `DIVISION_LEADERSHIP`, `DIRECTOR`, `UNION_HEAD`, `UNION_OFFICER` | Responder                                    |
  | both                                                                                                        | Member or Responder (each guide listed once) |

  Division leadership and Directors count as responders because tiered closure approval (ADR-0069) makes them approvers. The Komite counts as a responder because it handles and closes Private Voices. Komite accounts have no `MEMBER` capability, so they see responder guides only.

- Entry points, all using the lucide `BookOpen` icon:
  1. **Home hero**: a round icon button, "Buka panduan", to the left of the notification bell. It appears in the member, leadership/union and operational (OpsDashboard) heroes. This is the main entry point on mobile.
  2. **Pengaturan**: a **Panduan** row between "Notifikasi push" and "Ganti password".
  3. **Desktop sidebar**: a **Panduan** item between Notifikasi and Pengaturan, for workforce and Union navigation.

  The mobile dock is unchanged.

### API and storage

- Enum `GuideKind` (`PDF`, `VIDEO`) and table `Guide` (migration `20261029090000_guides`) with columns `id`, `kind`, `title`, `forMember`, `forResponder`, `sortOrder`, `videoUrl`, `storageKey` (unique), `fileName`, `size`, `checksum` (SHA-256), `uploadedById` → `UserAccount`, `createdAt` and `updatedAt`.
- The check constraint `Guide_kind_content_check` allows two shapes only. A PDF row has a `storageKey` and no `videoUrl`; a video row has a `videoUrl` and no `storageKey`.
- Files are written to `MEDIA_ROOT/guides/<random>.pdf` with mode 0600. This directory is separate from `objects/` and `imports/`, so `reconcile-storage` never touches it.
- Endpoints:

  | Method and path                      | Who                   | Purpose                                                                                           |
  | ------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------- |
  | `GET /api/v1/guides`                 | any signed-in account | guides for the actor's capabilities: `id`, `kind`, `title`, `videoUrl`, `size`, `updatedAt`       |
  | `GET /api/v1/guides/{id}/file`       | public                | the PDF, `application/pdf`, `Content-Disposition: inline`, `no-store`, `nosniff`; 404 for a video |
  | `GET /api/v1/admin/guides`           | CARE Admin            | all guides with audience, file and uploader                                                       |
  | `POST /api/v1/admin/guides`          | CARE Admin            | multipart `file`, `title`, `forMember`, `forResponder`                                            |
  | `POST /api/v1/admin/guides/videos`   | CARE Admin            | JSON `title`, `videoUrl`, `forMember`, `forResponder`                                             |
  | `PATCH /api/v1/admin/guides/{id}`    | CARE Admin            | JSON `title`, `forMember`, `forResponder`, optional `videoUrl` (videos only)                      |
  | `PUT /api/v1/admin/guides/{id}/file` | CARE Admin            | multipart `file`; replaces the PDF (PDF guides only)                                              |
  | `PUT /api/v1/admin/guides/order`     | CARE Admin            | `ids` must name every guide exactly once                                                          |
  | `DELETE /api/v1/admin/guides/{id}`   | CARE Admin            | removes the row and then the file, if any                                                         |

- Validation:
  - an empty file returns `GUIDE_FILE_REQUIRED`;
  - a file over 20 MB returns `GUIDE_FILE_TOO_LARGE`;
  - content that does not start with `%PDF-` returns `GUIDE_FILE_INVALID`, whatever the declared MIME type;
  - a guide with no audience, or a video link that is not `https://` or is longer than 500 characters, returns a validation error;
  - a file replacement on a video, or a `videoUrl` on a PDF, returns `GUIDE_KIND_MISMATCH`;
  - an incomplete or duplicated order returns `GUIDE_ORDER_INVALID`.
- Every change writes an audit event with `resourceType: 'GUIDE'`: `GUIDE_CREATED`, `GUIDE_UPDATED`, `GUIDE_FILE_REPLACED`, `GUIDE_REORDERED` or `GUIDE_DELETED`.
- Admin endpoints are protected by session, CSRF and the mutation throttle like other Admin mutations. They are not idempotency-keyed: a retried upload can at worst create a visible duplicate, which the admin deletes.
- When a write fails after a file was stored, the new file is removed. A replaced file is deleted only after the database update commits.

## Rationale

- Admin-managed content lets the CARE team publish and revise guides without a developer or deploy. This matches how they already maintain training material.
- PDF stays the document format because the CARE team already produces it and the native viewer provides reading tools for free.
- Videos are links, not uploads, so the CARE server carries none of their load. Uploading video to CARE was rejected for these reasons:
  - the current upload path buffers files in API memory;
  - many members watching at once (for example at a shift briefing) would compete with Voice traffic for the VPS uplink;
  - the media volume and its backups would grow;
  - iOS playback requires HTTP range support.
    An external player also adapts quality to the connection.
- Documents and videos are shown in separate groups, a layout chosen from rendered previews over one mixed list.
- Audience selection by two checkboxes (Member, Responder) maps to how the guides are written. Per-capability targeting was considered unnecessary complexity for the admin.
- The file endpoint is public by design. On iOS, a Home Screen PWA opens links to other documents in a viewer that does not share the PWA's cookies, so an authenticated download would fail there. The guides contain no personal or Voice data. Ids are random UUIDs that are listed only to signed-in accounts, and deleted guides return 404 at once.
- The hero icon is the only position visible on mobile for every role without removing a dock item. The Pengaturan row and desktop sidebar item give a second, predictable place.

## Alternatives considered

- **Static PDFs bundled in web-voice** (the first iteration): no backend change, but every new or revised guide needed a release, and the CARE team could not manage guides themselves.
- **Per-capability audience** (Member, Group Leader, Section Head, Manager, Division, Director, Komite): more precise, but a heavier form for a distinction the guides do not make.
- **One slot per audience**: simpler, but would not allow separate FAQ or topic guides.
- **Authenticated file download, or a blob URL in the app**: protects nothing of value, and breaks opening the PDF from an iOS Home Screen install.
- **Storing PDFs in the database**: avoids the media volume, but bloats backups and query memory; existing uploads already live under `MEDIA_ROOT`.
- **Uploading video to CARE** (MP4 under `MEDIA_ROOT`, streamed with range requests, size cap): keeps videos inside the company, but adds memory, bandwidth and backup load on the same VPS that serves Voices. It can be revisited if videos must not leave company systems, ideally served by Caddy/nginx rather than Node.
- **Embedding the video player in CARE**: needs `frame-src` exceptions in the CSP for each host and adds third-party scripts to the PWA; opening the host in a new tab avoids both.
- **One mixed list of PDFs and videos**: previewed and not chosen.
- **A dock item for Panduan**: rejected, because the responder dock is full.

## Implementation details

- API:
  - `apps/api/src/guides/` holds `guides.service.ts` (rules, storage, audit), `guides.controller.ts` (`GuidesController`, `AdminGuidesController`) and `guides.module.ts`, registered in `app.module.ts`;
  - `prisma/schema.prisma` gains the `Guide` model and `UserAccount.guidesUploaded`.
- OpenAPI:
  - `scripts/enrich-openapi.ts` adds the schemas `GuideList`, `AdminGuide`, `AdminGuideList`, `GuideUploadRequest`, `GuideVideoRequest`, `GuideFileRequest`, `GuideUpdateRequest`, `GuideOrderRequest` and `IdResponse`;
  - `openapi.json` and `packages/contracts/src/generated.ts` are regenerated.
- CARE Admin:
  - `features/guides/GuidesPage.tsx`;
  - `admin-api.ts` methods `guides`, `createGuide`, `createVideoGuide`, `updateGuide`, `replaceGuideFile`, `reorderGuides` and `deleteGuide`;
  - the route and sidebar item in `App.tsx`;
  - `.admin-guide-*` styles.
- Workforce:
  - `features/guide/GuidePage.tsx` (query `voiceQuery(session, 'guides')`, groups Dokumen and Video, `videoSource()`) and `GuideButton.tsx`;
  - `.guide-group__title` and `.guide-row__icon--video` styles;
  - `workforce-api.ts` `guides()`;
  - the route and `guide` navigation id in `App.tsx` and `lib/navigation.ts`;
  - the hero buttons in `HomePage.tsx`, `DashboardHome.tsx` and `OpsDashboard.tsx` (`.ops-profile__bell` becomes a flex row);
  - `GuidePage` and the existing public `InstallPage` are loaded with `React.lazy` behind a `RouteLoader` fallback (see Consequences);
  - `videoSource()` matches a host only as the domain itself or a subdomain (`isDomain`), so a look-alike such as `evilyoutube.com` is shown under its own name.
  - the Panduan row in `AccountPage.tsx`.

## Consequences

- Guides are effectively public documents. They must never contain personal data, real Voice content or internal contact details.
- Guide files live in the API media volume, so they follow its backup and restore. Restoring the database without the volume leaves rows whose file returns an error, and the admin re-uploads them.
- PDFs are not precached by the service worker and need a connection. Responses are `no-store`, so a replaced PDF is visible immediately.
- Opening a PDF depends on the platform. Desktop browsers and iOS show a viewer; Android Chrome usually downloads the file or hands it to a PDF app. In an installed PWA the link leaves the standalone window.
- The member hero has two icon buttons, so on a 360 px screen a long display name is truncated one button-width earlier.
- The hero icon is shown even when no guide applies; the page then shows its empty state.
- **Workforce bundle budget (ADR-0026):**
  - before this change, staging's main chunk was 166,513 bytes gzip against a budget of 166,640, leaving 127 bytes;
  - the Panduan entry points alone exceeded that, and the hosted build failed `pwa:compat-check`;
  - the budget was kept unchanged;
  - instead, `GuidePage` and the rarely opened public `/install` page (bilingual copy and the iPhone mock) now load on demand;
  - the main chunk is 164,507 bytes, about 2.1 KB under the budget and smaller than before this feature;
  - `/install` and `/panduan` show the route loader briefly on first open;
  - other routes stay in the main chunk.
- Video links point to third-party hosts. Who can watch follows the host's sharing settings, not the CARE login. A YouTube video should be _unlisted_, and a Drive or SharePoint file must be shared with the intended readers. Members need internet access to the host.
- CARE does not check that a link still works; a removed video shows the host's own error.

## Validation

- API integration, `apps/api/test/integration/guides.integration.test.ts` (6 tests):
  - audience filtering and order for a member and a Department Head;
  - the public PDF response, and 404 for an unknown id;
  - rejection of a non-PDF file and of a guide with no audience;
  - 404 for non-admin callers;
  - audience edit, reorder (including an invalid order), file replacement with removal of the old file, and delete with removal of the file;
  - the audit count;
  - video links: an `http://` link is rejected, a created link is listed with its kind and URL, there is no file (404), file replacement is refused, the link is edited, `videoUrl` on a PDF is refused, and the video is deleted.
- Browser, `e2e/workforce-guide.spec.ts` (5 tests): the hero entry, the PDF link and size, the Dokumen and Video groups with order, the video link and "Video · YouTube", a hidden Video group, the empty state, and the Pengaturan and sidebar entries.
- Browser, `e2e/admin-guides.spec.ts` (3 tests): the sidebar entry, the upload dialog (required fields and the multipart fields sent), reorder, delete with confirmation, and the video dialog (https check and the JSON sent).
- `apps/web-voice/src/lib/navigation.test.ts`: the desktop Panduan item for workforce and Union accounts.
- `apps/web-voice/src/features/guide/GuidePage.test.ts`: the source label for YouTube, Google Drive, SharePoint, look-alike hosts and malformed links.
- `pnpm pwa:compat-check`: passes at 164,507 bytes gzip. The `/install`, PWA, foundation and legacy-iOS specs still pass with the lazy routes.
- CodeQL: the two incomplete-host-check alerts in `GuidePage.tsx` are fixed.
  - The remaining medium alert concerns writing uploaded bytes to disk in `guides.service.ts`.
  - That write is intended. The path is a server-generated random key under `MEDIA_ROOT/guides`, checked with the same safe-path guard as other uploads, and the organization import already stores uploads the same way.
- The CI inventory total in `scripts/validation/validation.test.mjs` is 481.
- Rendered previews at 360 and 1440 px: the workforce entry points, the Panduan page as a mixed list and in groups, and the Admin list with the upload and video dialogs.
- Still required after deploy:
  - upload a real PDF and add a real video link in Admin;
  - open it from the installed app on a real Android Chrome device and an iPhone Home Screen install.

## Amendment — 2 November 2026: dialog footer on short screens

After release, the **Upload PDF** dialog was taller than a 1080p laptop screen with Windows scaling. The shared dialog used a grid without a row template, so its body could not shrink or scroll, and `overflow: hidden` clipped the footer with **Simpan**. The guide could therefore not be saved.

The shared `.care-dialog` was changed to a flex column:

- the header and footer keep their size;
- the body takes the remaining height and scrolls (`min-height: 0`);
- `max-height` uses `100dvh`, falling back to `100vh`.

This applies to every dialog in CARE Admin and the workforce app.

The e2e test "keeps Simpan reachable on a short laptop screen" checks this at 1366×600. It picks the file through the real file chooser and asserts the button is fully in the viewport.

## Amendment — 2 November 2026: in-app PDF reader

After the first release, workforce users reported two problems with opening a PDF in a new tab:

- it was slow, because the whole file downloaded before anything showed, and Android handed it to another app;
- in the installed app the tab had no way back to CARE.

They also wanted the text to stay searchable, so turning pages into images was rejected.

**Decision.** A PDF guide now opens in an in-app reader at `/panduan/:id` (`GuideViewerPage`, lazy-loaded).

- **Layout:**
  - a sticky CARE-blue bar with **Kembali ke Panduan**, the title, **Cari** and a link that opens the original PDF;
  - below it, the pages render one under another, each with its page number.
- **Speed:**
  - pdf.js reads the file with range requests (`disableAutoFetch`, 64 KB chunks), so the first page renders before the whole file arrives;
  - other pages render when they come within 600 px of the screen;
  - pages re-render sharply when the width changes;
  - the API file endpoint now uses `res.sendFile`, which answers `Range` with `206 Partial Content` and `Accept-Ranges: bytes`.
- **Search:**
  - the pdf.js text layer keeps the real text;
  - **Cari** searches every page's text, jumps to the first page with a hit, and centres the hit with a yellow highlight;
  - it shows "Hal N · i/n", and ▲▼ move between pages with hits.
- **pdf.js delivery:**
  - `pdfjs-dist` 4.10.38 (legacy build, MIT/Apache-2.0) is a build-time dependency of web-voice;
  - the `care-pdfjs-vendor` Vite plugin emits `pdf.min.js`, `pdf.worker.min.js` and `standard_fonts/` to `dist/pdfjs/4.10.38/`;
  - the files are outside `assets/`, so they are not part of the legacy bootstrap chunk, not checked by `pwa:compat-check`, and not precached by the service worker;
  - nginx serves `/pdfjs/` with `Cache-Control: public, max-age=31536000, immutable` (not on 404s), so a phone downloads the reader once per pdf.js version;
  - `isEvalSupported: false` keeps pdf.js inside the existing CSP.
- **Older browsers:**
  - pdf.js 4 needs a modern engine;
  - when `structuredClone`, `ReadableStream` or `Array.prototype.at` is missing (for example iOS before 15.4), the reader shows only the bar and a **Buka PDF** button, the earlier behaviour;
  - the same button appears if loading fails.
- **Other parts of the change:**
  - the list links PDF guides to the reader in the same tab; videos still open on their host;
  - the workforce shell hides its own top bar on the reader;
  - the sidebar keeps Panduan highlighted.

**Rationale.** This is the only option that keeps searchable text, gives a back button inside the installed app on every platform, and shows the first page early.

- Android Chrome cannot show a PDF inline, so an `<iframe>` was not enough.
- Rendering pages to images on upload loses the text.
- pdf.js inside the main bundle would break the Safari 11.3 compatibility gate, because its legacy build still contains optional chaining, nullish coalescing and private fields.

**Consequences.**

- The workforce main chunk grows by about 240 bytes, to 164,748 bytes gzip, within the budget.
- The first open of any guide downloads about 530 KB gzip of pdf.js, which is then cached for a year.
- Caddy still marks `/api/v1/*` responses `no-store`, so the PDF itself is fetched again on each open; range requests keep that to the parts needed.
- The search highlight covers the whole text run that contains the word, not only the word.
- Updating pdf.js means changing the dependency version. The path changes with it, so caches turn over automatically.
- Like the PDFs, the reader assets are public.

**Validation.**

- `guides.integration.test.ts` now also checks `Accept-Ranges` and a `206` partial response; all 6 tests pass.
- `workforce-guide.spec.ts` has 7 tests. They cover:
  - the list linking to `/panduan/:id`;
  - reading a Chromium-printed three-page PDF, with a rendered canvas;
  - search to "Hal 2 · 1/1", with the hit in view;
  - "Tidak ada" for a missing word;
  - **Kembali**;
  - the **Buka PDF** fallback when `structuredClone` is removed.
- The CI inventory is 484.
- `pwa:compat-check`, web-voice Vitest (159 tests), the guide, journey, a11y, PWA, foundation and legacy specs (109 tests) all pass.
- The nginx config was checked with the production `nginx-unprivileged` image: `nginx -t`, immutable caching on 200, and none on 404.

## Risks and follow-up

- The CARE team supplies the actual guides and videos. Until the first upload, the Panduan page is empty.
- A FAQ can be published as another PDF. An in-app FAQ section can be added later on the same page if searchable text is wanted.
- If a guide is ever needed before sign-in (for example a login guide), the login page can link to a guide's public file URL.
