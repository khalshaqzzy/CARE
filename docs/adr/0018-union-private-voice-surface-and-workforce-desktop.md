# ADR-0018: Union Private Voice Surface and Workforce Desktop Presentation

| Atribut    | Nilai                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| Status     | Accepted                                                                                   |
| Tanggal    | 28 Agustus 2026                                                                            |
| Konteks    | PRD v1.1 §6.5, §11.4, §18.4; aplikasi workforce `apps/web-voice`; API `apps/api`           |
| Supersedes | Tidak ada; melengkapi ADR-0009 (lifecycle/authorization) dan ADR-0012 (member home polish) |

## 1. Konteks

Backend sudah memenuhi kontrak Union sejak re-freeze v1.1: `GET /work-items` menscope
Union Head ke seluruh Private Voice dan Union Officer ke Private yang ditugaskan
(`PolicyService.workItemScope`), serializer memisahkan `UNION_IDENTIFIED` dan
`UNION_ANONYMOUS` berdasarkan consent immutable, dan action matrix
(`computeAvailableActions`) membatasi Head/Officer sesuai PRD §6.5. Namun
presentasi frontend belum mengekspos kemampuan tersebut:

1. Navigasi Union tidak memuat item "Private Voice", sehingga halaman inbox
   operasional tidak dapat dijangkau dari dock maupun sidebar (PRD §11.4).
2. Halaman inbox memakai copy responder ("Voice Member") untuk semua role.
3. Beranda Union hanya menampilkan dua kartu aggregate tanpa daftar Private
   Voice, operational inbox, atau assignment summary (PRD §18.4).
4. Halaman detail tidak merender blok Pelapor; snapshot identitas consent
   `SHOW` dan alias consent `HIDE` ada di kontrak tetapi tidak pernah ditampilkan
   kepada Union (PRD §6.5, §15.4, §16).
5. Beberapa permukaan menampilkan enum mentah (`IN_VERIFICATION`, bucket label
   dashboard) alih-alih label Bahasa Indonesia (PRD §22.1).
6. Shell desktop menghitung breakpoint sekali tanpa subscription, konten
   melebar penuh tanpa container keterbacaan, dan tidak ada baseline visual
   desktop (PRD §22.2, §34.6).

Selain itu, penulisan journey pertama yang membuka Radix Select di dalam Dialog
mengungkap defect presentasi lintas-aplikasi pada shared UI: popover Select
(`--layer-popover`) tertutup overlay Dialog (`--layer-modal`), sehingga opsi
tidak dapat diklik pointer ketika Select dibuka di dalam dialog mana pun.

## 2. Keputusan

### 2.1 Surface Private Voice untuk Union (frontend-only routing, additive backend)

- Navigasi Union (dock dan sidebar, keduanya dari satu sumber `createNav()`)
  menjadi lima item: Beranda, Private, General, Notifikasi, Akun. Item Private
  menunjuk route operasional yang sama (`/work-items`) sehingga tidak ada
  endpoint atau layout baru; identifikasi role memakai session capabilities.
- `resolveCurrent` menjadi role-aware: route `/work-items` me-resolve ke id nav
  `private` untuk Union dan `work-items` untuk responder, agar state aktif
  dock/sidebar selalu benar dengan satu route.
- Halaman inbox menampilkan header, deskripsi, empty state, dan filter
  "Penugasan" yang berbeda per role; copy responder tidak berubah.
- Beranda Union menambahkan operational list Private Voice (enam item teratas,
  severity-first dari `work-items`), kartu assignment khusus Union Head, dan
  tile quick action "Private Voice". Union tetap tidak melihat affordance
  Buat Voice, Voice milik sendiri, atau draft resume.
- Halaman detail merender blok Pelapor hanya untuk audience yang berhak:
  `UNION_IDENTIFIED` menampilkan nama/no.reg/divisi/department dari snapshot
  consent `SHOW` dengan badge "Identitas ditampilkan"; `UNION_ANONYMOUS`
  menampilkan alias per-Voice dengan badge "Identitas disembunyikan" dan
  catatan bahwa alias tidak dapat dikorelasikan lintas Voice. Audience lain
  tidak berubah. Nilai status dan event timeline dirender melalui label
  Bahasa Indonesia yang sudah menjadi kontrak frontend.
- `DashboardChartCard` memetakan label bucket enum ke label Bahasa Indonesia
  melalui lookup gabungan (status/severity/kategori) dengan fallback raw;
  pemilihan warna semantik tetap membaca label mentah sebelum pemetaan.

### 2.2 Kontrak API additive

Dua tambahan additive pada kontrak v1.1, keduanya tanpa perubahan perilaku
untuk permintaan yang sudah ada:

- `GET /work-items` menerima parameter query `unassigned` (string, `true`).
  Parameter hanya dihormati untuk Union Head dan menambahkan kondisi
  `currentHandlerId IS NULL` pada scope inbox, sehingga menjadi antrian
  "Perlu ditugaskan". Untuk actor lain parameter diabaikan agar semantik inbox
  Manager/Section Head tidak berubah.
- `GET /dashboard/private` menyertakan field opsional `pendingAssignment`
  (integer ≥ 0) yang hanya diisi untuk Union Head: jumlah Private Voice tanpa
  handler aktif. Nilai dihitung terpisah dari aggregate SQL yang ada dan
  sengaja tidak terpengaruh filter dashboard agar konsisten dengan kartu
  penugasan pada Beranda yang bebas filter. Field dideklarasikan opsional pada
  schema `DashboardAggregate` sehingga response konsumen lain tidak berubah
  bentuk; JSON `undefined` tidak diserialisasi.

### 2.3 Desktop presentation (mobile-first tetap)

- Breakpoint desktop menjadi subscription reaktif (`useSyncExternalStore` di
  atas `matchMedia`) sehingga pergantian dock ↔ sidebar terjadi saat resize;
  tidak ada perubahan nilai breakpoint (tetap 1280 px, dock ≤ 1279 px).
- Lapisan desktop ditambahkan hanya dalam `@media (min-width: 1280px)` pada
  stylesheet workforce: container keterbacaan 72 rem untuk konten dan topbar,
  padding konten lebih lega, hero diperluas hingga 56 rem, tinggi percakapan
  naik ke 28 rem, dan state aktif sidebar memakai tinta gelap di atas permukaan
  senyap agar konsisten dengan pola dock yang dikunci pada ADR-0012. Baseline
  visual 360 px yang ada tidak berubah byte-identik.
- Baseline visual desktop baru (`workforce-union-private-1440.png`) dengan pin
  jam dan toleransi 0.06 yang sama dengan baseline lain (rasionalisasi
  rasterisasi font CoreText vs FreeType).

### 2.4 Perbaikan layer shared UI

`.care-select-content` dan `.care-combobox__panel` naik ke
`calc(var(--layer-modal) + 2)` karena popover Radix portal ke `<body>`; saat
dibuka di dalam Dialog, popover harus berada di atas overlay dan konten dialog.
Perbaikan ini berlaku untuk workforce dan Admin yang sama-sama memakai
komponen tersebut.

## 3. Alternatif yang Dipertimbangkan

- **Endpoint daftar Private baru (`GET /private-voices`)**: ditolak karena
  `workItemScope` sudah benar; endpoint baru menduplikasi filter/sort/pagination
  dan memperluas permukaan audit tanpa manfaat.
- **Item nav "Assignment" terpisah untuk Union Head sesuai redaksi harfiah
  §11.4**: ditolak karena menghabiskan slot dock untuk General yang dibutuhkan
  Officer dan Head sama-sama; antrian penugasan lebih tepat hidup di halaman
  tempat aksinya (Private Voice) plus kartu ringkasan di Beranda. Redaksi PRD
  tidak diubah karena "Assignment untuk Union Head" dipenuhi sebagai filter
  dan kartu ringkasan; interpretasi ini dicatat di ADR ini.
- **Skema response terpisah `PrivateDashboardAggregate`**: ditolak karena
  field opsional tunggal memberikan drift kontrak minimal; response audience
  lain tidak berubah.
- **Layout desktop dua kolom (main + rail)** untuk Home/detail: ditunda;
  container 72 rem plus penyesuaian grid memberikan keterbacaan yang cukup
  tanpa menaikkan permukaan regresi visual. Mobile-first tetap fokus.
- **Blok Pelapor untuk semua audience**: dibatasi Union saja agar perubahan
  halaman detail responder/leadership tidak melebar dari scope kebutuhan
  privacy Union; kontrak audience lain sudah tercakup serializer.

## 4. Konsekuensi

- Nav Union kini membawa dua item berbasis satu route; dokumentasi pengembang
  harus mengetahui pemetaan `private`/`work-items` yang role-aware.
- `pendingAssignment` dan `unassigned` menjadi bagian kontrak publik; penghapusan
  keduanya kelak memerlukan compatibility review dan regenerasi kontrak.
- Test otomatis bertambah: lima integration test untuk scope antrian dan field
  aggregate, sembilan journey/a11y mocked baru (termasuk axe 1440 px untuk
  permukaan Union), dan satu baseline visual desktop yang wajib diregenerasi
  bila halaman inbox Union berubah.
- Perbaikan layer Select/Combobox mengubah z-index global shared UI; perubahan
  visual tidak diharapkan pada permukaan yang sudah ada karena popover sebelumnya
  selalu berada di atas konten biasa (40 > base) dan kini hanya berpindah di atas
  modal (62).

## 5. Validasi

- Integration (PostgreSQL disposable): 38 test lulus, termasuk lima test baru
  yang membuktikan scope antrian, pengabaian flag untuk non-Head, dan
  perubahan `pendingAssignment` sebelum/sesudah assignment.
- Playwright mocked: 115 test lulus pada chromium/visual/pwa, mencakup journey
  Union Head (list, filter antrian, assign dialog dengan kandidat Officer,
  dialog tertutup setelah sukses), Union Officer (scope assigned, tanpa filter
  penugasan), anonimitas alias di detail dan chat, snapshot consent `SHOW`,
  guard tidak adanya affordance reporter, serta axe/no-overflow 360 dan
  1440 px untuk permukaan Union.
- Full-stack gated Playwright 3 test lulus terhadap API nyata + disposable DB.
- Unit (API 60, ui 8, frontend-core 14, web-voice 25, web-admin 2), typecheck,
  lint, format, OpenAPI deterministic, build (workforce precache 12 entries),
  `migrations:destructive-check`, Compose config, audit (0 High/Critical),
  seeded performance 10.000 akun/50.000 Voice, maintenance reconcile
  (orphanedImportFiles 0), dan Gitleaks directory scan lulus.

## 6. Tindak Lanjut

- Mengulang authenticated operator retest Union pada staging setelah hosted
  acceptance Phase 13 berlanjut (termasuk verifikasi visual desktop di
  Chrome/Edge/Safari sesuai matriks browser §23.4).
- Mempertimbangkan peningkatan `--layer-popover` untuk tooltip/popover apabila
  kelak komponen tersebut dipakai di dalam modal (saat ini tidak ada konsumen).
