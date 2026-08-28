# CARE — Full QA Verification Report

**Tanggal:** 28 Agustus 2026  
**Branch:** `staging`  
**Scope:** Full QA verification, local runtime testing melalui Safari, validasi seluruh button, workbook validation, automated regression  
**Out of scope:** Implementasi fix atau perubahan source code/repository

## Executive Summary

Status keseluruhan: **NOT PASS**

QA menemukan tiga defect utama dan satu blocker pada proses import master data:

1. Import workbook 7.018 rows gagal diproses.
2. Tombol navigasi sidebar Admin tidak berfungsi.
3. Tombol Logout tidak langsung membersihkan session state pada UI.
4. History import menampilkan status stale setelah proses asynchronous selesai.

Tidak ada fix yang diterapkan.

## Test Environment

### Local Applications

- Workforce: `http://care.localhost:8080`
- Admin: `http://admin.care.localhost:8080`
- Browser: Safari melalui Computer Use
- Database: PostgreSQL lokal melalui Docker
- Release: `6f934e4b4da029cc9c5dbbd4c2f41444ee8ac17b`

### Workbook

[CARE_ORG DATA_AUG.xlsx](../../.local/CARE_ORG%20DATA_AUG.xlsx)

## Workbook Validation

Workbook berhasil dibaca secara read-only.

| Validasi                     | Hasil           |
| ---------------------------- | --------------- |
| Sheet                        | `MFG + QD`      |
| Total data rows              | 7.018           |
| Total rows termasuk header   | 7.019           |
| Total columns                | 7               |
| Header sesuai PRD            | Ya              |
| Duplicate `Noreg`            | Tidak ditemukan |
| Blank rows                   | Tidak ditemukan |
| Composite organization units | 58              |
| Rows Department `14`         | 188             |
| Unit tanpa Department Head   | 12              |
| Union Head                   | Belum tersedia  |
| Union Officer 1              | Belum tersedia  |
| Union Officer 2              | Belum tersedia  |
| Global PIC                   | Invalid         |

Header yang ditemukan:

```text
Noreg
Nama
Posisi (struktural)
Directorat
Division
Department
Section
```

## Functional QA melalui Safari

### Admin — Tombol dan Controls

| Fitur                             | Hasil                         |
| --------------------------------- | ----------------------------- |
| Sidebar collapse                  | Pass                          |
| Sidebar expand                    | Pass                          |
| Sidebar Overview                  | Fail                          |
| Sidebar Import & Master Data      | Fail                          |
| Sidebar Remediation & Route       | Fail                          |
| Sidebar Union Accounts            | Fail                          |
| Sidebar Accounts                  | Fail                          |
| Sidebar Voice Explorer            | Fail                          |
| Sidebar Audit                     | Fail                          |
| Sidebar System Status             | Fail                          |
| Account navigation                | Pass                          |
| Logout                            | Partial fail                  |
| Import file picker                | Pass                          |
| Preview import                    | Pass                          |
| Confirm import                    | Pass, tetapi processing gagal |
| Import change filter              | Pass                          |
| Import pagination                 | Pass                          |
| Snapshot aktif tab                | Pass                          |
| Remediation status filter         | Pass                          |
| Remediation type filter           | Pass                          |
| Union create-account dialog       | Pass                          |
| Union dialog close/cancel         | Pass                          |
| Account kind filter               | Pass                          |
| Account detail drawer             | Pass                          |
| Audit detail drawer               | Pass                          |
| Audit redaction                   | Pass                          |
| System Status refresh             | Pass                          |
| Password form required validation | Pass                          |

### Workforce — Tombol dan Controls

| Fitur                     | Hasil                |
| ------------------------- | -------------------- |
| Login required validation | Pass                 |
| Invalid login handling    | Pass                 |
| Mobile bottom navigation  | Pass setelah rebuild |
| Riwayat navigation        | Pass                 |
| Buat Voice navigation     | Pass                 |
| Create Voice wizard       | Pass                 |
| Account route             | Pass                 |
| Notifications route       | Pass                 |

## Defect Details

### QA-001 — Import workbook gagal diproses

**Severity:** Critical  
**Status:** Confirmed

#### Reproduction

1. Login ke CARE Admin.
2. Buka halaman Import & Master Data.
3. Upload workbook `CARE_ORG DATA_AUG.xlsx`.
4. Klik `Preview`.
5. Klik `Konfirmasi import`.
6. Tunggu proses asynchronous selesai.

#### Actual Result

Import berubah menjadi:

```text
FAILED
PROCESSING_FAILED
```

Tidak ada partial write ke database:

```text
Employees: 0
Memberships: 0
Organization snapshots: 0
Admin accounts: 1
```

#### Expected Result

Workbook berhasil diproses menjadi organization snapshot aktif dan membuat workforce accounts sesuai data authoritative.

#### Evidence

- [imports.service.ts:670](../../apps/api/src/imports/imports.service.ts:670)
- [imports.service.ts:943](../../apps/api/src/imports/imports.service.ts:943)
- [imports.service.ts:1227](../../apps/api/src/imports/imports.service.ts:1227)

#### Cause Analysis

Cause paling mungkin adalah bottleneck pemrosesan:

- 7.018 password hash Argon2id dibuat sebelum transaksi database.
- Hash diproses dalam batch concurrency 4.
- Setiap hash menggunakan `memoryCost: 19_456`.
- Transaksi berikutnya memiliki timeout 120 detik.
- CPU API terpantau mencapai sekitar 100% selama proses.
- Error asli tidak dipertahankan; sebagian besar exception dipetakan menjadi `PROCESSING_FAILED`.

Exact underlying exception tidak dapat dipastikan karena tidak ada error detail/log diagnostik yang tersedia pada response maupun container log.

---

### QA-002 — Tombol sidebar Admin tidak melakukan navigasi

**Severity:** High  
**Status:** Confirmed

#### Reproduction

1. Login ke CARE Admin.
2. Klik salah satu tombol navigasi sidebar.
3. Amati URL dan konten halaman.

#### Actual Result

Tombol terlihat aktif tetapi halaman tidak berubah.

#### Expected Result

Setiap tombol berpindah ke route yang sesuai.

#### Cause Analysis

Admin shell mendefinisikan `onClick` pada item navigasi, tetapi prop tersebut tidak digunakan oleh komponen `Sidebar`.

`Sidebar` hanya menjalankan callback `onNavigate`, sedangkan `AdminShell` tidak mengirimkan prop tersebut.

#### Evidence

- [App.tsx:274](../../apps/web-admin/src/App.tsx:274)
- [App.tsx:328](../../apps/web-admin/src/App.tsx:328)
- [navigation.tsx:168](../../packages/ui/src/navigation.tsx:168)

---

### QA-003 — Logout tidak langsung membersihkan UI session

**Severity:** High  
**Status:** Confirmed

#### Reproduction

1. Login ke Admin.
2. Klik tombol `Keluar`.
3. Amati tampilan UI sebelum reload atau navigasi berikutnya.

#### Actual Result

Session berhasil dicabut di server, tetapi UI masih menampilkan:

```text
Session active CARE Admin
```

Shell Admin juga masih terlihat sampai terjadi navigasi atau reload berikutnya.

#### Expected Result

Setelah logout:

- Session state langsung menjadi unauthenticated.
- User diarahkan ke halaman login.
- Protected shell tidak lagi ditampilkan.

#### Cause Analysis

`AuthProvider` memanggil `queryClient.removeQueries()` terhadap session query yang sedang aktif. State observer aktif tidak segera diset menjadi `null`, sehingga komponen masih membaca session lama.

#### Evidence

- [auth.tsx:83](../../packages/frontend-core/src/auth.tsx:83)
- [transport.ts:73](../../packages/frontend-core/src/transport.ts:73)
- [auth.service.ts:73](../../apps/api/src/auth/auth.service.ts:73)
- [App.tsx:348](../../apps/web-admin/src/App.tsx:348)

---

### QA-004 — Import History menampilkan status stale

**Severity:** Medium  
**Status:** Confirmed

#### Actual Result

Setelah proses import asynchronous gagal:

- Detail import menampilkan `FAILED`.
- Tabel History masih menampilkan `PROCESSING`.

Setelah reload halaman, status History menjadi `FAILED`.

#### Cause Analysis

Detail query melakukan polling setiap 2 detik saat status `QUEUED` atau `PROCESSING`. Namun, list History tidak melakukan refresh ketika detail mencapai status terminal.

#### Evidence

[ImportsPage.tsx:47](../../apps/web-admin/src/features/imports/ImportsPage.tsx:47)

---

### QA-005 — Dependency vulnerability

**Severity:** Medium  
**Status:** Reported

`pnpm audit` menemukan satu vulnerability moderate:

```text
uuid < 11.1.1
Dependency path: exceljs > uuid
Advisory: GHSA-w5hq-g745-h8pq
```

Tidak ada high atau critical vulnerability yang ditemukan.

Tidak diperbaiki karena implementasi fix berada di luar scope.

---

### QA-006 — Gitleaks mendeteksi ignored local files

**Severity:** Informational / Environment

Scan git history:

```text
57 commits scanned
No leaks found
```

Scan seluruh working directory mendeteksi file lokal yang di-ignore:

```text
.local/.ssh/care-staging-ci
.secret
```

File tersebut tidak tracked oleh Git. Tidak ada source repository secret yang terdeteksi.

## Automated QA Results

| Test Area                   |    Result |
| --------------------------- | --------: |
| Unit tests                  | 75 passed |
| Security tests              |  5 passed |
| Integration tests           | 31 passed |
| Frontend E2E                | 98 passed |
| Full-stack E2E              |  3 passed |
| Performance tests           |  1 passed |
| Typecheck                   |    Passed |
| ESLint                      |    Passed |
| Prettier check              |    Passed |
| Build                       |    Passed |
| OpenAPI check               |    Passed |
| Migration destructive check |    Passed |
| Migration upgrade test      |    Passed |
| Deployment tests            |    Passed |
| Docker Compose validation   |    Passed |
| Security exception check    |    Passed |
| OpenAI smoke test           |    Passed |
| Git history secret scan     |    Passed |

## Non-blocking Warnings

Build dan test menampilkan beberapa warning non-blocking:

- Vite `configLoader: native` compatibility warning.
- Bundle Admin lebih besar dari 500 kB.
- `inlineDynamicImports` deprecated pada PWA build.
- Mocked frontend tests menampilkan proxy `ECONNREFUSED` ke API `127.0.0.1:3000`; test tetap lulus karena menggunakan API mocking.

## Test Setup Issues

### Integration database

Percobaan pertama gagal karena local stack menggunakan database internal Docker dan tidak mempublikasikan port test `54329`.

Setelah PostgreSQL test container terpisah diaktifkan dan migration dijalankan:

```text
8 test files passed
31 tests passed
```

### Frontend visual test

Percobaan awal menghasilkan visual mismatch dan satu kegagalan mobile dock karena preview artifact stale.

Setelah rebuild:

```text
98 frontend tests passed
9 workforce journey tests passed
```

### Full-stack secret configuration

Percobaan pertama gagal karena dummy secret hanya 29 karakter, sementara konfigurasi membutuhkan minimal 32 karakter.

Setelah menggunakan secret dummy dengan panjang valid:

```text
3 full-stack tests passed
```

## Data Integrity

Import failure tidak menghasilkan partial data.

Database setelah failure:

```text
UserAccount: 1
Employee: 0
OrganizationMembership: 0
OrganizationSnapshot: 0
```

Tidak ada indikasi data workbook masuk sebagian ke database.

## Repository Safety

Tidak ada perubahan source code atau fix yang diterapkan.

Status akhir repository menunjukkan:

```text
M .gitignore
```

Perubahan `.gitignore` terkait `.local/` dipertahankan dan tidak diubah atau di-revert selama QA.

## Cleanup

Runtime lokal telah dihentikan melalui:

```text
pnpm local:down
pnpm db:down
```

Container CARE lokal dan PostgreSQL test telah dihentikan. Volume database tidak dihapus.

## Final Verdict

**Release readiness: NOT READY**

Blocker utama:

1. Import authoritative workbook gagal.
2. Navigasi utama Admin tidak berfungsi.
3. Logout tidak langsung membersihkan protected UI state.

Automated test suite secara umum lulus, tetapi coverage mocked/full-stack fixture tidak menangkap defect sidebar dan stale logout state pada local Safari runtime.
