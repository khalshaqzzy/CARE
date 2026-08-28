# CARE — QA Report 1 Remediation Retest

**Tanggal:** 28 Agustus 2026

**Branch:** `staging`

**Scope:** Retest QA-001–006 setelah remediasi
**Data policy:** Tidak memuat nama, nomor registrasi, isi workbook, hash password, token, query SQL produksi, atau secret

## Executive Summary

Status remediasi kode: **PASS** untuk QA-001–004 dan **RESOLVED** untuk penanganan environment QA-006. QA-005 tetap **DEFERRED** sebagai risiko Moderate yang terdokumentasi. Phase 13 tetap `in_progress` karena hosted exact-SHA acceptance dan rollback rehearsal belum menjadi bagian retest lokal ini.

Reproduksi membuktikan penyebab QA-001 adalah Prisma `P2028`: proses lama menjalankan upsert organization unit per row sehingga 7.018 row menghasilkan 21.201 query event dan transaksi 120 detik kedaluwarsa. Argon2id bukan penyebab transaksi gagal dan tidak diubah.

| Finding | Retest status | Ringkasan bukti                                                                                           |
| ------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| QA-001  | Resolved      | Workbook aktual `CONFIRMED`; 7.018 membership, 1 snapshot aktif, 217 query event, raw upload terhapus     |
| QA-002  | Resolved      | Seluruh sidebar Admin dan desktop Workforce menggunakan `Sidebar.onNavigate`; journey UI hijau            |
| QA-003  | Resolved      | Logout/401/cross-tab/in-flight race langsung menghasilkan state unauthenticated pada unit test            |
| QA-004  | Resolved      | Polling terminal menyegarkan history dan cache turunan tanpa reload; FAILED memakai error tone            |
| QA-005  | Deferred      | Satu Moderate `exceljs -> uuid`; tidak ada High/Critical, tanpa override/fork                             |
| QA-006  | Resolved      | Secret lokal keluar dari workspace, permission diperketat, directory Gitleaks bersih tanpa allowlist baru |

## QA-001 — Organization Import

### Implementasi

- 58 composite organization unit diturunkan satu kali sebelum transaksi, lalu diselesaikan melalui satu `createMany(skipDuplicates)` dan satu `findMany`.
- Department Head routes, remediation issues, legacy access, status account/employee, dan session revocation menggunakan operasi bulk.
- Advisory lock, transaksi atomik, insert chunked, timeout 120 detik, parameter/concurrency Argon2id, dan forced-password-change dipertahankan.
- Prisma `P2028` dipetakan ke safe failure code `PROCESSING_TIMEOUT`.
- Log kegagalan hanya memuat batch ID, safe failure code, Prisma code, elapsed time, dan retry outcome.

### Workbook aktual yang di-ignore

| Pemeriksaan                            | Hasil                 |
| -------------------------------------- | --------------------- |
| Preview rows                           | 7.018                 |
| Composite units                        | 58                    |
| Department 14 rows                     | 188                   |
| Missing Department Head units          | 12                    |
| Terminal status                        | `CONFIRMED`           |
| Processing duration                    | 31.412 ms             |
| Prisma query events                    | 217                   |
| Active workforce/employees/memberships | 7.018 / 7.018 / 7.018 |
| Active snapshots                       | 1                     |
| Raw upload after terminal state        | Tidak ada             |
| `P2028`                                | Tidak ditemukan       |

### Regression sintetis

Integration test mengimpor profil 7.018 row/58 unit/188 Department-14/12 missing-head lalu profil bulanan 10.000 akun. Test memverifikasi jumlah account/membership, satu snapshot aktif, remediation, legacy handler untuk Voice aktif, deactivation, dan session revocation. Batas query event dikunci di bawah 500 agar derivasi unit tidak kembali tumbuh per member.

Statement-level PostgreSQL trigger sementara menyuntikkan failure saat membership dibuat. Batch menjadi `FAILED`, sementara snapshot 10.000 sebelumnya tetap aktif, tidak ada account fixture gagal yang tersisa, dan tidak ada partial membership. Trigger dan function test dihapus pada akhir test.

## QA-002 — Navigation

Admin dan desktop Workforce sekarang mengirim satu callback `Sidebar.onNavigate(id)` ke shared component dan memetakan ID ke route di tingkat aplikasi. Item-level `onClick` dan cast `as never` dihapus.

Playwright menavigasi seluruh delapan destination sidebar Admin dari UI dan minimal satu destination desktop Workforce tanpa `page.goto`. Semua journey lulus dalam suite browser lengkap.

## QA-003 — Authentication Invalidation

Logout dan callback `401` membatalkan session query aktif, menetapkan cache session ke `null`, menghapus cache/persistent state yang terikat session, dan mereset CSRF context. Logout broadcast lintas tab tidak melakukan refetch. Protected shell bergantung pada session cache tersebut sehingga unmount tidak menunggu request logout berhasil.

Frontend-core unit test mencakup:

- logout normal ketika request masih pending;
- request logout gagal;
- respons `401`;
- cross-tab logout tanpa session refetch;
- respons session bootstrap lama setelah cancellation.

Seluruh 14 frontend-core unit test lulus.

## QA-004 — Terminal Import Cache

Perubahan detail dari `QUEUED/PROCESSING` ke `FAILED` atau `CONFIRMED` menginvalidasi history sekali untuk kombinasi batch/version/status. `CONFIRMED` juga menginvalidasi snapshot, overview, accounts, dan remediation. History menampilkan `FAILED` dengan tone error dan safe failure code bila tersedia.

Mocked polling test `PROCESSING -> FAILED` dan `PROCESSING -> CONFIRMED` lulus tanpa reload halaman.

## QA-005 — Deferred UUID Advisory

Status: **Deferred**, bukan resolved.

`pnpm audit --audit-level high` lulus dengan 0 High/Critical dan tetap melaporkan satu Moderate pada `exceljs -> uuid`. ExcelJS 4.4.0 menggunakan UUID v4 tanpa output buffer, sedangkan advisory GHSA-w5hq-g745-h8pq membahas v3/v5/v6 ketika output buffer diberikan. Tidak ada pnpm override atau fork. Risiko harus ditinjau ulang sebelum Phase 14 atau ketika ExcelJS merilis dependency kompatibel yang sudah patched.

## QA-006 — Local Secret Relocation

Workspace copies `.secret` dan `.local/.ssh/` disalin ke `$HOME/.config/care/secrets/`, dibandingkan byte-for-byte, lalu salinan workspace dipindahkan secara recoverable ke Trash. Directory tujuan menggunakan mode `0700`; secret dan key material menggunakan mode `0600`. Tidak ada pengecualian Gitleaks baru.

Gitleaks v8.24.3 directory scan terhadap workspace, termasuk uncommitted files, selesai tanpa leak.

## Automated Retest Results

| Gate                          | Hasil                                                        |
| ----------------------------- | ------------------------------------------------------------ |
| Unit                          | Pass — API 36, UI 8, frontend-core 14, Workforce 20, Admin 2 |
| Integration                   | Pass — 8 files, 32 tests                                     |
| Security                      | Pass — 2 files, 5 tests                                      |
| Frontend Playwright           | Pass — 102 tests                                             |
| Full-stack Playwright         | Pass — 3 tests                                               |
| Performance                   | Pass — 10.000 account / 50.000 Voice fixture                 |
| Storage reconciliation        | Pass — seluruh orphan/stale count 0                          |
| Lint/typecheck/build          | Pass                                                         |
| OpenAPI/destructive migration | Pass; tidak ada drift atau migration baru                    |
| Deployment/runtime validation | Pass                                                         |
| Dependency audit              | Pass pada level High; 1 Moderate deferred                    |
| Directory Gitleaks            | Pass                                                         |

Warning non-blocking yang tetap ada: Vite native config compatibility warning, Admin bundle lebih dari 500 kB, PWA `inlineDynamicImports` deprecation, dan expected proxy `ECONNREFUSED` pada mocked browser paths.

## Safari Retest

Kedua origin lokal dapat dibuka di Safari, tetapi authenticated retest tidak dapat diselesaikan pada database persisten saat ini: password Admin pernah dirotasi pada QA sebelumnya dan credential aktif tidak tersedia di runtime/bootstrap secret yang direlokasi. Percobaan credential bootstrap ditolak dengan aman sebagai `Invalid credentials`. Tidak dilakukan reset password, perubahan credential, atau destructive database reset hanya untuk melewati kondisi ini.

Karena itu, sidebar/logout/history dibuktikan melalui Playwright yang berinteraksi dengan UI dan unit race coverage, sedangkan workbook aktual dibuktikan melalui service/API path terhadap disposable database. Retest Safari authenticated tetap merupakan follow-up operator setelah credential aktif diberikan atau reset lokal diotorisasi; ini tidak mengubah status remediasi kode, tetapi tidak boleh direpresentasikan sebagai bukti Safari authenticated.

## Final Verdict

QA-001–004 telah diremediasi dan memiliki regression coverage. QA-006 selesai secara operasional tanpa melemahkan scanner. QA-005 diterima sementara sebagai deferred Moderate risk dengan trigger review eksplisit.

Local remediation gate: **PASS WITH DOCUMENTED DEFERRED RISK**. Hosted staging acceptance, rollback rehearsal, dan authenticated Safari operator retest tetap terbuka sebelum Phase 13 dapat ditandai `done`.
