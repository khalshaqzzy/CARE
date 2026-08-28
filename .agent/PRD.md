# Product Requirements Document (PRD): CARE Enterprise Member Voice

| Atribut             | Nilai                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Status dokumen      | **Active product contract v1.1**                                                                                           |
| Status implementasi | **Phase 0–12 complete; Phase 13 staging implementation locally complete, hosted acceptance in progress; Phase 14 pending** |
| Versi dokumen       | 1.1                                                                                                                        |
| Tanggal             | 28 Agustus 2026                                                                                                            |
| Product owner       | TMMIN                                                                                                                      |
| Pengguna utama      | Member/karyawan, Manager/Department Head, Section Head, leadership, Union, dan CARE Admin                                  |
| Platform            | Workforce mobile-first PWA dan aplikasi Admin React terpisah, dengan satu backend/OpenAPI contract bersama                 |
| Source of truth     | Dokumen ini                                                                                                                |

Dokumen ini adalah kontrak produk dan implementasi CARE v1. Kata **MUST/wajib**, **MUST NOT/dilarang**, **SHOULD/sebaiknya**, dan **MAY/dapat** bersifat normatif. Bila source code, prototype, fixture, atau asumsi implementasi berbeda dengan dokumen ini, perbedaan wajib diekskalasi dan source of truth terkait wajib diperbarui; implementer tidak boleh memilih perilaku secara diam-diam.

---

## 1. Ringkasan Eksekutif

CARE adalah aplikasi pelaporan suara member (_member voice_) untuk lingkungan enterprise manufacturing. CARE menyediakan jalur mobile yang aman dan dapat ditelusuri untuk menyampaikan temuan, keluhan, ide, informasi, atau apresiasi; mengklasifikasikan kategori dan severity melalui OpenAI-compatible Responses API; memberi peringatan kelengkapan lokasi; meneruskan General Voice kepada Manager/Department Head atau Section Head dan Private Voice kepada Union; menyediakan chat verifikasi; serta mencatat penyelesaian, bukti, rating, feedback, dan reopen.

CARE memakai workforce PWA dan aplikasi Admin React yang terpisah, tetapi keduanya menggunakan satu backend dan generated OpenAPI client yang sama. Backend menjadi satu-satunya akses ke PostgreSQL dan media. Seluruh perubahan lifecycle disimpan sebagai timeline append-only dengan actor dan timestamp. General Voice memakai deterministic server routing dari organization master. Private Voice selalu masuk kepada Union Head dan dapat didelegasikan kepada Union 1 atau Union 2; identitas reporter kepada Union mengikuti consent immutable pada Voice, sedangkan CARE Admin memiliki read-only access ke content dan identitas lengkap.

V1 memakai arsitektur monolitik single-VM per environment. Staging menyediakan workforce di `https://care.qd-tmmin.site` dan Admin di `https://admin-ped.qd-tmmin.site`; kedua production domain akan ditentukan kemudian. Keputusan v1 tidak menyediakan backup, point-in-time recovery, high availability, atau disaster recovery. Hal tersebut merupakan **Critical Accepted Risk**, bukan kemampuan yang boleh diklaim tersedia.

---

## 2. Latar Belakang dan Sumber Requirement

### 2.1 Masalah yang Diselesaikan

CARE menyelesaikan kebutuhan berikut:

- member memerlukan kanal pelaporan yang sederhana, mobile, dan dapat dipercaya;
- pelaporan harus memiliki status dan penanggung jawab yang jelas;
- voice perlu dirutekan secara konsisten tanpa bergantung pada pengetahuan struktur organisasi reporter;
- isu berisiko tinggi harus terlihat lebih awal dan diprioritaskan;
- proses tanya jawab, assignment, tindakan, penutupan, dan reopen harus dapat diaudit;
- Private Voice memerlukan jalur Union Head, conditional identity terhadap Union, dan Admin oversight yang diaudit;
- manajemen membutuhkan dashboard status dan severity sesuai scope kewenangannya.

### 2.2 Referensi yang Dianalisis

- Requirement CARE yang diberikan pada 24 Agustus 2026.
- Revisi product requirement dan workbook organisasi `CARE_ORG DATA_AUG.xlsx` yang dianalisis pada 25 Agustus 2026.
- `.agent/rules.md` pada repository CARE.
- `.agent/PRD.md`, workflow GitHub Actions, Compose, Caddy, dan deployment scripts pada repository `supplier-henkaten` sebagai referensi pola kontrak dan operasional.
- Dokumentasi resmi OpenAI untuk Responses API dan Structured Outputs.

Referensi `supplier-henkaten` hanya menjadi pola. CARE wajib memakai nama service/path sendiri dan domain bisnis CARE. Workforce dan Admin merupakan dua frontend deployment terpisah yang berbagi backend dan contract package.

### 2.3 Referensi OpenAI Responses API

- API contract: [Create a model response](https://developers.openai.com/api/reference/cli/resources/responses/methods/create), endpoint `POST /responses`.
- SDK TypeScript/JavaScript: official `openai` package dengan `client.responses.create(...)`.
- Structured JSON memakai `text.format` dengan JSON Schema; JSON mode lama tidak menjadi contract CARE.
- Request CARE menetapkan `store: false`, tidak memakai conversation state atau tools, dan membaca text output melalui SDK-supported output accessor sebelum schema validation lokal.

Base URL, model, API key, lifecycle, pricing, dan kebijakan data dapat berubah. Base URL/model/key tidak mempunyai production default, wajib diberikan melalui runtime config, dan perubahan model/provider endpoint wajib melalui evaluation serta audit konfigurasi.

---

## 3. Visi, Tujuan, dan Non-Tujuan

### 3.1 Visi

Menyediakan kanal member voice yang aman, responsif, transparan, dan dapat dipertanggungjawabkan sehingga setiap laporan memperoleh rute, PIC, progres, dan penyelesaian yang jelas tanpa mengorbankan kebutuhan privasi.

### 3.2 Tujuan Produk v1

- Memungkinkan karyawan membuat dan memantau Voice dari perangkat mobile.
- Menyediakan Private Voice yang ditangani Union dengan consent tampil/sembunyikan identitas.
- Merutekan General Voice kepada Manager yang tepat secara deterministik.
- Menggunakan AI untuk rekomendasi kategori/severity dan advisory location review dengan fallback manual yang aman.
- Menyediakan lifecycle Open, In Verification, In Progress, Closed, serta reopen yang traceable.
- Menyediakan room chat dengan lampiran gambar untuk verifikasi.
- Menurunkan Manager/Department Head dan Section Head dari workbook authoritative serta memungkinkan Manager mendelegasikan Voice kepada kandidat Section Head yang sah.
- Mewajibkan bukti dan catatan ketika Voice ditutup.
- Mengumpulkan rating serta feedback per closure cycle.
- Menyediakan dashboard, notification center, dan best-effort Web Push.
- Menyediakan deployment staging dan production yang repeatable pada single VM per environment.

### 3.3 Non-Tujuan v1

CARE v1 bukan:

- feed sosial atau forum publik;
- sistem HRIS, payroll, attendance, atau performance management;
- pengganti incident response darurat atau emergency hotline;
- workflow multi-PIC paralel;
- aplikasi mobile native;
- platform dokumen umum;
- sistem offline-first;
- platform SSO/MFA;
- sistem backup, disaster recovery, atau high availability.

---

## 4. Terminologi

| Istilah             | Definisi                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Voice               | Laporan, ide, informasi, apresiasi, keluhan, atau temuan yang dibuat reporter.                                          |
| Reporter            | User yang membuat Voice.                                                                                                |
| General Voice       | Voice non-publik yang identitas reporternya terlihat oleh responder berizin dan dirutekan secara deterministik.         |
| Private Voice       | Voice yang selalu dirutekan ke Union Head; identitas reporter kepada Union mengikuti consent per Voice.                 |
| Manager/Dept Head   | Istilah interchangeable untuk Department Head structural atau default/global PIC dengan capability Manager yang scoped. |
| Route Owner         | Account yang dipilih deterministic server routing dan disnapshot pada Voice.                                            |
| Handler/PIC         | Manager, Section Head, Union Head, atau Union Officer yang sedang menangani Voice.                                      |
| Default PIC         | Karyawan aktif yang ditunjuk Admin untuk department tanpa Department Head dan memperoleh scoped Manager capability.     |
| PIC Global          | Satu Department Head aktif yang menangani Safety, Environment, dan Facility untuk seluruh area.                         |
| Union Head          | Route owner seluruh Private Voice dan actor yang dapat assign/reassign Union Officer.                                   |
| Union Officer       | Tepat dua akun, berlabel Union 1 dan Union 2, yang hanya menangani Private Voice yang ditugaskan.                       |
| Organization Unit   | Identitas komposit `Directorat + Division + Department`; nama department saja bukan identifier yang cukup.              |
| Closure Cycle       | Satu siklus penutupan Voice; reopen memulai siklus berikutnya.                                                          |
| AI Classification   | Snapshot Responses API yang memuat category nullable, severity, confidence, rationale, model, prompt, dan content hash. |
| Location Review     | Snapshot advisory AI mengenai kelengkapan lokasi, warning, dan maksimal tiga pertanyaan saran.                          |
| Manual Fallback     | Klasifikasi yang dikonfirmasi reporter saat AI gagal, invalid, atau confidence rendah.                                  |
| Legacy Handler      | PIC dari master sebelumnya dengan akses terbatas hanya untuk Voice aktif/historis yang memang dimilikinya.              |
| Timeline            | Urutan event bisnis Voice yang append-only.                                                                             |
| Notification Center | Sumber notifikasi persisten dan authoritative di dalam aplikasi.                                                        |

---

## 5. Scope, Kapasitas, dan Batas Sistem

### 5.1 Baseline Kapasitas v1

Acceptance baseline:

- maksimum 10.000 akun aktif;
- maksimum 50 authenticated concurrent users;
- maksimum 50.000 Voice tersimpan;
- lima area tetap;
- satu perusahaan/tenant pada v1;
- satu workforce PWA, satu Admin web, satu API, dan satu PostgreSQL per environment.

Limit tersebut adalah baseline pengujian, bukan license limit. Implementasi tidak boleh mengandalkan hard-coded array yang mencegah peningkatan kapasitas setelah review.

### 5.2 Area

`Area` memiliki tepat lima nilai:

- `KARAWANG_1` — Karawang 1;
- `KARAWANG_2` — Karawang 2;
- `KARAWANG_3` — Karawang 3;
- `SUNTER_1` — Sunter 1;
- `SUNTER_2` — Sunter 2.

Penambahan atau penggantian area setelah v1 memerlukan migration/configuration decision, bukan perubahan label bebas.

### 5.3 Retensi

- Voice, message, attachment, closure evidence, rating, notification record, dan audit disimpan tanpa batas waktu secara logis.
- Tidak ada purge otomatis untuk business record pada v1.
- Draft yang tidak pernah dikirim dapat dihapus otomatis setelah 30 hari tidak aktif, termasuk media draft yang tidak direferensikan.
- Deaktivasi akun/master data tidak menghapus history.
- Retensi tanpa batas tidak berarti durability terjamin karena v1 tidak memiliki backup.

---

## 6. Persona, Account Kind, Posisi, dan Capability

Authorization tidak memakai satu role workforce yang mutually exclusive. Session mengekspos `accountKind`, posisi struktural, capability list, serta safe overview/detail/action scope. Seluruh akun workforce memiliki capability Member. Posisi dan route assignment dapat menambahkan capability tanpa menghapus kemampuan Member.

### 6.1 CARE Admin

Tujuan:

- memprovision master data dan akun;
- menjaga konfigurasi routing valid;
- melakukan reset/deaktivasi akun workforce/Union;
- melakukan support dan audit.

> **v1 single Admin:** hanya satu kredensial CARE Admin yang dikelola via CLI/runtime secret. UI tidak membuat, mereset, atau menonaktifkan akun Admin; Admin hanya dapat mengganti password sendiri.

Kemampuan:

- upload/preview/confirm master organisasi `.xlsx` atau `.csv` dan melihat import history;
- menyelesaikan organization remediation, memilih default PIC/PIC global, dan mengelola tiga akun Union;
- melihat/mengelola employee, account, route mapping, dan effective organization snapshot;
- reset password ke credential sementara dan mencabut session;
- melihat seluruh General Voice;
- melihat seluruh General dan Private Voice secara read-only, termasuk profil reporter Private lengkap;
- melihat audit dan metadata operasional;
- menonaktifkan akun bila tidak memiliki constraint bisnis yang belum diselesaikan.

Larangan:

- akses Private Admin wajib diaudit dan tidak boleh diubah menjadi workflow action;
- tidak dapat mengubah hasil timeline historis;
- tidak dapat memberi rating atas nama reporter;
- tidak dapat menjadi PIC kecuali akun karyawan terpisah memiliki role responder yang sah.

### 6.2 Member

Kemampuan:

- membuat Private atau General Voice;
- melihat dashboard dan seluruh Voice miliknya;
- melihat detail, severity, status, timeline, PIC yang boleh ditampilkan, chat, dan hasil closure;
- membalas chat dan mengirim lampiran gambar;
- memberi rating/feedback dan memilih reopen sesuai aturan.

Member tidak dapat melihat Voice milik member lain.

### 6.3 Manager / Department Head

Department Head dan Manager merupakan istilah interchangeable. Department Head aktif otomatis memiliki Manager capability pada organization unit-nya. Karyawan aktif yang dipilih sebagai default PIC memperoleh Manager capability hanya untuk organization unit mapping tersebut. Satu PIC global wajib merupakan Department Head aktif dan memperoleh route scope Safety, Environment, dan Facility untuk seluruh area.

Manager dapat:

- melihat aggregate General Voice pada division-nya tanpa memperoleh identity/detail lintas department;
- melihat detail dan bertindak pada General Voice department sendiri atau route khusus yang dimilikinya;
- bertanya kepada reporter, proceed, assign/reassign Section Head, chat, atau close sesuai lifecycle;
- memilih Section Head department target untuk department/default route;
- untuk PIC global, memilih hanya Section Head department asal PIC global;
- membuat Voice sebagai reporter.

### 6.4 Section Head

Section Head selalu memiliki kemampuan Member dan statusnya diturunkan dari posisi `Section Head` pada organization snapshot aktif. Section Head:

- tidak dipromote/remove/transfer secara manual oleh Manager;
- hanya melihat/memproses Voice yang ditugaskan kepadanya;
- dapat bertanya kepada reporter, proceed, chat, dan close;
- tidak dapat assign Voice ke orang lain;
- dapat membuat Voice sebagai reporter.

### 6.5 Union Head dan Union Officer

Tiga akun Union non-workforce dikelola Admin terpisah dari workbook: tepat satu Union Head dan dua Union Officer (`Union 1`, `Union 2`). Ketiganya dapat melihat dashboard overview dan detail seluruh General Voice secara read-only.

- Union Head menjadi route owner seluruh Private Voice, dapat melihat dan bertindak pada seluruh Private, serta assign/reassign Union Officer sebelum `IN_PROGRESS`.
- Union Officer hanya melihat dan bertindak pada Private Voice yang ditugaskan kepadanya.
- Jika reporter memilih `Tampilkan nama = Ya`, Union melihat nama, no.reg, division, dan department; jika `Tidak`, dedicated Union response tidak memiliki identity field.
- Union dapat ask/chat, proceed, dan close pada Private sesuai ownership; Union tidak dapat melakukan action pada General.
- Union tidak memperoleh kemampuan membuat Voice pada v1.

### 6.6 Leadership Read-only

- Division Head, Deputy Division Head, dan Deputy Division Head Pjt. melihat aggregate seluruh General Voice tetapi hanya detail pada division sendiri.
- Director melihat aggregate dan detail seluruh General Voice.
- Leadership tidak dapat melakukan lifecycle action kecuali account tersebut juga memiliki explicit route capability yang berbeda dan action dilakukan dalam scope capability tersebut.

---

## 7. Matriks Permission

Legenda: `M` manage/mutate, `V` view, `O` operate workflow, `-` tidak memiliki akses.

| Capability                              | CARE Admin | Member | Manager/Dept Head | Section Head | Division/Deputy |   Director | Union Head | Union Officer |
| --------------------------------------- | ---------: | -----: | ----------------: | -----------: | --------------: | ---------: | ---------: | ------------: |
| XLSX/CSV import/remediation/Union admin |          M |      - |                 - |            - |               - |          - |          - |             - |
| Reset/deactivate account                |          M |      - |                 - |            - |               - |          - |          - |             - |
| Buat Voice                              |          - |      M |                 M |            M |               M |          M |          - |             - |
| Voice milik sendiri                     |          V |      M |                 M |            M |               M |          M |          - |             - |
| General overview                        |          V |    Own |          Division |     Assigned |             All |        All |        All |           All |
| General detail                          |          V |    Own |  Dept/route scope |     Assigned |    Own division |        All |        All |           All |
| General lifecycle action                |          - |      - |       Route scope |     Assigned |               - |          - |          - |             - |
| Private content                         |     V full |    Own |               Own |          Own |               - |          - |        All |      Assigned |
| Private reporter identity               |     V full |    Own |               Own |          Own |               - |          - | By consent |    By consent |
| Assign Section Head                     |          - |      - |                 M |            - |               - |          - |          - |             - |
| Assign Union Officer                    |          - |      - |                 - |            - |               - |          - |          M |             - |
| Private lifecycle action                |          - |      - |                 - |            - |               - |          - |        All |      Assigned |
| Rating/reopen                           |          - |    Own |               Own |          Own |             Own |        Own |          - |             - |
| System audit                            |          V |      - |   Scoped timeline |       Scoped |      Read scope | Read scope |     Scoped |        Scoped |

Authorization wajib ditegakkan di backend pada role, relationship, dan object level. Menyembunyikan tombol frontend bukan authorization.

---

## 8. Authentication dan Account Lifecycle

### 8.1 Employee Login

- Username karyawan adalah `no_reg` dan unik.
- Password awal sama dengan `no_reg`.
- Login pertama menghasilkan restricted session `PASSWORD_CHANGE_REQUIRED`; hanya endpoint session, logout, dan change password yang dapat diakses.
- Password baru memiliki panjang 6–128 karakter, tidak memiliki syarat simbol/huruf/angka, dan tidak boleh sama dengan username atau password sementara.
- Password disimpan dengan Argon2id; plaintext tidak pernah disimpan atau dicatat.

### 8.2 Union Login

- Username ditentukan CARE Admin dan harus unik.
- Password awal sama dengan username dan wajib diganti saat login pertama.
- Setiap Union account adalah account individual; credential dan session tidak dibagi.
- Penggantian password hanya mencabut session lain milik account tersebut.

### 8.3 CARE Admin Bootstrap

- v1 memiliki tepat satu akun CARE Admin yang dibuat melalui CLI/runtime secret; tidak ada Admin kedua dan tidak ada pembuatan akun Admin via UI.
- Bootstrap bersifat idempotent dan tidak mencetak password.
- Password bootstrap wajib minimal 12 karakter dan berbeda dari username; aturan enam karakter hanya berlaku bagi akun workforce/Union sesuai kontrak produk.
- UI Admin tidak menyediakan pembuatan, reset, atau penonaktifan akun Admin; halaman Accounts hanya mengelola workforce dan Union.
- Admin hanya dapat mengganti password sendiri via `/account` dan logout.

### 8.4 Reset dan Deaktivasi

- Hanya CARE Admin yang dapat reset password.
- Reset karyawan/Manager/Section Head menetapkan password sementara ke `no_reg`; reset Union menetapkan ke username.
- Reset mencabut seluruh session dan mewajibkan change password berikutnya.
- Deaktivasi mencabut session dan memblokir login baru.
- Workforce yang hilang dari snapshot dinonaktifkan untuk capability baru. Bila masih menjadi handler aktif, account masuk state legacy-handler terbatas hingga Voice selesai lalu dinonaktifkan penuh.
- Union Head/Officer tidak dapat dinonaktifkan bila masih menjadi route owner/current handler Private aktif sampai remediation selesai.

### 8.5 Session Security

- Authentication memakai opaque server-side session dalam cookie `HttpOnly`, `Secure`, dan `SameSite=Lax`.
- Mutation dilindungi CSRF token yang terikat session.
- Session memiliki idle dan absolute expiry yang configurable; default idle 8 jam dan absolute 7 hari.
- Login dan mutation sensitif memiliki IP/account throttling.
- Logout dan password reset menghapus push subscription association yang tidak lagi valid.

---

## 9. Master Data, XLSX/CSV Import, dan Remediation

### 9.1 Authoritative Organization File Contract

Admin mengunggah satu file authoritative berformat `.xlsx` atau UTF-8 `.csv`. XLSX wajib memakai sheet `MFG + QD`; CSV tidak mempunyai kontrak sheet. Kedua format memakai tujuh header persis dengan urutan berikut:

```text
Noreg, Nama, Posisi (struktural), Directorat, Division, Department, Section
```

Aturan:

- satu row merepresentasikan satu workforce account; `Noreg` diperlakukan sebagai text agar leading zero terjaga;
- seluruh field wajib ada; kolom kedelapan, header asing, row dengan jumlah kolom berbeda, XLSX malformed, atau CSV malformed ditolak;
- XLSX mewajibkan seluruh cell data berupa plain string atau blank; numeric/formula/date/rich-value ditolak. CSV mengikuti RFC-style quoting, menerima UTF-8 BOM, dan seluruh nilai diperlakukan sebagai text;
- `Noreg` unik setelah trim; password existing tidak berubah akibat import;
- organization unit memakai key komposit `Directorat + Division + Department`;
- posisi mentah disimpan, tetapi hanya `Section Head`, `Department Head`, `Division Head`, `Deputy Division Head`, `Deputy Division Head Pjt.`, dan `Director` memberi structural capability;
- nilai `Department = 14` tidak dianggap route General yang sah; user tersebut hanya dapat submit Private sampai source data berubah;
- workbook Agustus baseline berisi 7.018 row, 38 Department Head, 250 Section Head, 4 Division Head, 8 Deputy/acting Division Head, 1 Director, dan 188 row dengan `Department = 14`;
- terdapat 12 department bernama tanpa Department Head dan membutuhkan default PIC mapping sebelum General Voice department tersebut dapat disubmit.

### 9.2 Monthly Authoritative Snapshot

- Upload pertama dilakukan CARE Admin setelah Admin bootstrap; upload berikutnya dilakukan paling sedikit setiap bulan oleh designated data owner.
- Snapshot baru membuat/update workforce dan derived capability, serta menonaktifkan account yang tidak lagi ada.
- Active session account yang dinonaktifkan dicabut, kecuali restricted legacy-handler session yang diperlukan untuk Voice aktif yang memang dimilikinya.
- Voice baru selalu memakai snapshot/routing aktif terbaru.
- Voice, route owner, current/previous handler, event actor, closure actor, dan PIC historis tidak pernah ditulis ulang akibat import.
- Setelah active legacy ownership habis, account dinonaktifkan penuh secara otomatis.

### 9.3 Route dan Account Remediation

Preview wajib menampilkan create/update/deactivate/unchanged, perubahan posisi/unit, missing Department Head, invalid default/global PIC, `Department = 14`, dan status tiga akun Union. Confirm memakai checksum, expected version, idempotency key, dan satu transaction.

Setelah confirm, Admin remediation queue menyediakan minimum action berikut:

- menunjuk karyawan aktif mana pun sebagai default PIC untuk organization unit bernama tanpa Department Head;
- memilih tepat satu Department Head aktif sebagai PIC global Safety/Environment/Facility;
- membuat/memperbaiki tepat satu Union Head dan dua Union Officer;
- mengganti mapping yang invalid karena monthly snapshot dengan audit reason.

Setiap issue route wajib menampilkan nama department yang terdampak; issue PIC global
menampilkan scope seluruh department. Penyelesaian default PIC dan PIC global hanya
meminta satu input **No. Reg**. Backend mencari account workforce aktif dari No. Reg,
memvalidasi eligibility route, dan membuat audit reason sistem; Account ID, expected
route ID, dan alasan bebas tidak ditampilkan atau diterima dari form remediation.

Default PIC memperoleh Manager capability hanya pada unit target dan hanya dapat assign Section Head unit target. PIC global hanya dapat assign Section Head department asalnya. Mapping tidak memindahkan ownership Voice yang sudah disubmit.

### 9.4 Import Audit dan Raw File

- UI menampilkan error per sheet/row/field dan remediation per organization unit.
- `ImportBatch`, checksum, actor, summary, diff aman, issue, resolution, dan timestamp disimpan untuk audit.
- Raw upload disimpan sementara dengan akses terbatas dan dihapus setelah finalization/expiry; raw production PII tidak menjadi fixture Git.
- Import dapat selesai dengan remediation issue, tetapi General/Private submit yang route prerequisite-nya belum lengkap ditolak tanpa kehilangan draft.

---

## 10. Section Head Derivation dan Assignment

- Section Head capability hanya berasal dari posisi `Section Head` pada snapshot aktif; tidak ada promote/transfer/remove oleh Manager.
- Kandidat assignment bersifat server-side dan scoped: department route/default PIC memakai Section Head unit target, sedangkan PIC global memakai Section Head department asal PIC global.
- Perubahan posisi pada snapshot baru menghentikan kandidat baru, tetapi active assignment lama tetap mempunyai legacy-handler access sampai Voice selesai atau direassign secara sah.
- Assign/reassign tetap diaudit, memakai expected version/idempotency, dan tidak menulis ulang assignment history.

---

## 11. Information Architecture dan Navigation

Workforce PWA dan Admin web memakai navigation serta host authorization yang berbeda. Workforce PWA tetap capability-aware untuk seluruh workforce/leadership/Union account.

### 11.1 Member

- Beranda;
- Buat Voice;
- Riwayat;
- Notifikasi;
- Akun.

### 11.2 Manager

- Beranda responder;
- Buat Voice;
- Voice Member;
- Riwayat saya;
- Notifikasi;
- Akun.

### 11.3 Section Head

- Beranda responder;
- Buat Voice;
- Voice Member yang ditugaskan;
- Riwayat saya;
- Notifikasi;
- Akun.

### 11.4 Union

- Beranda/General overview read-only;
- Private Voice;
- Assignment untuk Union Head;
- Notifikasi;
- Akun.

### 11.5 CARE Admin

- Overview operasional;
- Import dan Master Data;
- Remediation dan Route Mapping;
- Union Accounts;
- Accounts;
- Voice Explorer;
- Audit;
- System Status;
- Akun.

Workforce mobile memakai bottom navigation untuk primary journeys dan sidebar/topbar pada desktop. Admin app memakai desktop-only sidebar dengan hard gate ≥1280 px, bukan PWA/offline surface. Di bawah gate, protected tree tidak di-mount dan tidak melakukan fetch. Kedua frontend tetap bergantung pada backend authorization.

---

## 12. Create Voice dan Preview

### 12.1 Form Input Voice

Langkah pertama wajib menampilkan dua pilihan eksplisit: **Private Voice** atau **General Voice**. Setelah pilihan dibuat, form menampilkan field berikut.

Field wajib:

- Area Temuan: satu dari lima `Area`;
- Detail Lokasi: text 1–200 karakter;
- Judul Voice: text 1–150 karakter;
- Detail Voice: text 1–5.000 karakter;
- Visibility: `PRIVATE` atau `GENERAL`, berasal dari pilihan langkah pertama;
- `Tampilkan nama`: `YA` atau `TIDAK`, wajib hanya untuk Private dan tidak boleh dikirim untuk General.

Lampiran foto bersifat opsional:

- maksimum lima file;
- maksimum 10 MB per file;
- JPEG, PNG, atau WebP;
- dapat memilih file atau memakai camera capture yang didukung browser.

Detail Lokasi menjalankan location review otomatis setelah debounce/on-blur ketika nilai memenuhi minimum length. Review di-cache berdasarkan content hash. Hasil `INCOMPLETE` menampilkan warning dan maksimal tiga pertanyaan saran di bawah field; pertanyaan tersebut adalah guidance, bukan field/action wajib. Kegagalan review menampilkan degraded state tetapi tidak memblokir form.

Button **Selesai** menyimpan/update `VoiceDraft`, memvalidasi media, lalu meminta AI classification. Private meminta severity saja; General meminta category dan severity. Button tidak mengirim Voice kepada responder.

### 12.2 Preview Voice

Preview menampilkan:

- Area;
- Department/route tujuan (`Union Head`, `PIC Global`, Department Head, atau default PIC);
- Detail Lokasi;
- Judul;
- Detail Voice;
- thumbnails lampiran;
- Severity Low/Medium/High/Critical;
- Private/General;
- kategori routing untuk General;
- pilihan tampil/sembunyikan identitas untuk Private;
- hasil location review dan warning terbaru;
- indikator apakah hasil berasal dari AI atau Manual Fallback.

Hasil AI confidence tinggi bersifat read-only. Reporter dapat memilih **Kembali** untuk mengubah input; perubahan area, detail lokasi, judul, detail, visibility, consent identity, atau organization master reporter membatalkan snapshot yang content hash-nya terpengaruh dan mewajibkan review/klasifikasi ulang.

Jika snapshot location review terbaru adalah `INCOMPLETE`, lanjut/submit wajib meminta konfirmasi eksplisit: **“Detail lokasi Anda belum lengkap, dan Voice berpotensi tidak ditangani dengan baik.”** Konfirmasi adalah acknowledgment advisory, bukan perubahan input wajib.

### 12.3 Submit

Button **Kirim Voice**:

1. memvalidasi draft ownership dan version;
2. memvalidasi classification masih cocok dengan content hash;
3. memvalidasi location-review acknowledgment bila snapshot terbaru `INCOMPLETE`;
4. memvalidasi route owner masih aktif/eligible dan unik;
5. membuat Voice, immutable organization/identity/classification/location snapshots, attachment link, route owner, event `SUBMITTED`, dan notification dalam satu transaction;
6. mengubah status menjadi `OPEN`;
7. menampilkan detail Riwayat Voice yang baru.

Jika route prerequisite tidak tersedia/valid—termasuk General reporter dengan `Department = 14`, missing Department Head/default PIC, missing PIC global, atau Union account set tidak lengkap—submission ditolak dengan error yang dapat diperbaiki, draft dan media tetap tersimpan, dan tidak ada Voice parsial.

### 12.4 Voice Identifier

- Internal ID memakai UUID.
- UI menampilkan ID immutable `CARE-YYYYMM-######` yang dibuat server dengan sequence concurrency-safe.
- ID tidak boleh membawa department, area, atau penanda Private.

---

## 13. AI Classification, Severity, dan Location Review

### 13.1 Model Contract

- Protocol: OpenAI-compatible Responses API, endpoint `/responses`.
- SDK: official `openai` JavaScript/TypeScript package dengan `responses.create`.
- Base URL, model, dan API key tidak memiliki non-test production default dan akan diberikan melalui runtime environment.
- Runtime config: `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY`, `OPENAI_REASONING_EFFORT`, `OPENAI_TIMEOUT_MS`, dan `OPENAI_CONFIDENCE_THRESHOLD`.
- Prompt version, reasoning effort, timeout, dan confidence threshold berasal dari runtime/config; reasoning effort kosong memakai default `medium`, default threshold tetap `0.75`, dan timeout maksimum per attempt tetap 10 detik sampai product config menggantinya.
- Authentication menggunakan server-only API key dari runtime environment. API key tidak boleh masuk repository, dokumentasi, log, response, metric, atau client bundle.
- Request menetapkan `reasoning.effort` dari runtime config, `store: false`, tidak mengirim tools, conversation, atau `previous_response_id`, dan memakai `text.format` JSON Schema Structured Outputs.

Structured response minimum:

```ts
interface VoiceClassificationResult {
  category: 'SAFETY' | 'ENVIRONMENT' | 'FACILITY' | 'WORK_DIFFICULTY' | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number; // 0..1
  rationaleCode: string;
}

interface LocationReviewResult {
  completeness: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
  warning: string | null;
  questions: string[]; // 0..3 advisory questions
}
```

Untuk Private Voice, schema mewajibkan `category=null`; AI menentukan severity dan location review tetapi tidak menentukan route. Backend selalu menentukan route Private ke Union Head.

### 13.2 Input Minimization

Payload AI hanya boleh memuat:

- area;
- detail lokasi;
- organization unit reporter yang telah diminimalkan bila diperlukan klasifikasi General;
- judul;
- detail teks;
- prompt/rubric versi aktif.

Dedicated location review hanya mengirim area dan detail lokasi. Payload dilarang memuat nama, no.reg, account ID, Voice ID, IP, foto, filename, metadata perangkat, chat, atau identifier lain. Logging tidak boleh menyimpan prompt lengkap; log hanya metadata request yang disanitasi.

### 13.3 Routing Classification

Kategori:

- `SAFETY`: keselamatan kerja, hazard, near miss, unsafe condition, risiko cedera;
- `ENVIRONMENT`: limbah, emisi, tumpahan, pencemaran, kebisingan lingkungan, penggunaan sumber daya, atau kepatuhan lingkungan;
- `FACILITY`: gedung, utilitas, penerangan, ventilasi, toilet, akses, fasilitas umum;
- `WORK_DIFFICULTY`: proses kerja, alat/prosedur, manpower, konflik kerja, dukungan department, atau isu lain yang bukan kategori khusus.

Tidak ada urutan priority category tetap. Jika isi mencakup beberapa kategori, AI memilih satu primary category yang paling dominan berdasarkan konteks. Confidence rendah atau ambiguity mengaktifkan Manual Fallback; server tidak membuat priority rule tersembunyi.

AI tidak memilih user/PIC ID. Backend memetakan category kepada master data secara deterministik.

### 13.4 Severity Rubric

| Severity | Meaning                                                                                   | Contoh                                                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low      | Tidak mendesak dan tidak berdampak langsung pada operasi                                  | Apresiasi, ide 5R minor, label, informasi lebih jelas, kenyamanan kecil                                                                                        |
| Medium   | Perlu follow-up, tanpa bahaya langsung atau dampak produksi besar                         | Tool kecil rusak dengan backup, pencahayaan minor, SOP kurang jelas, delay kecil berulang                                                                      |
| High     | Dampak signifikan atau potensi risiko terhadap safety, quality, productivity, atau people | Ergonomi menyebabkan sakit, abnormalitas mesin, manpower shortage berulang, blocked walkway, konflik berulang                                                  |
| Critical | Bahaya segera, serious people/compliance issue, atau potensi dampak bisnis besar          | Near miss berpotensi cedera berat, api/asap/listrik, unsafe machine, harassment/violence/discrimination, chemical spill, major line stop/customer quality risk |

Severity adalah prioritas penanganan, bukan diagnosis hukum atau pengganti emergency response. UI Critical wajib menyarankan reporter menghubungi jalur darurat lokal bila terdapat bahaya langsung; CARE tetap menerima Voice jika reporter melanjutkan.

### 13.5 Confidence dan Fallback

- Default confidence threshold adalah `0.75` dan configurable per environment.
- Satu retry diperbolehkan untuk transient error dengan timeout maksimum 10 detik per attempt.
- Timeout, exhausted retry, refusal/incomplete response, invalid JSON/schema, empty response, atau confidence di bawah threshold mengaktifkan Manual Fallback.
- Manual Fallback General mewajibkan reporter memilih category dan severity; Private hanya memilih severity.
- Location review failure menghasilkan `UNKNOWN`/degraded state dan tidak memblokir form atau submit.
- Pilihan manual, alasan fallback, model, dan error class yang aman disimpan dalam classification audit.
- AI success tidak dapat diedit reporter; reporter harus kembali mengubah isi dan menjalankan klasifikasi ulang.

### 13.6 Classification Snapshot dan Monitoring

Setiap submission menyimpan:

- base URL identifier yang disanitasi dan model ID;
- prompt/rubric version;
- category/severity/confidence;
- source `AI` atau `MANUAL_FALLBACK`;
- response ID bila tersedia tanpa menyimpan response body mentah;
- content hash;
- latency, token usage bila tersedia, dan timestamp;
- sanitized fallback/error code.

Location review menyimpan completeness, warning, pertanyaan, content hash, model/prompt version, latency, timestamp, dan sanitized fallback code. Raw chain-of-thought tidak diminta atau disimpan. Model/base URL upgrade memerlukan deterministic fixtures, live non-sensitive Responses structured-output smoke test, dan audit perubahan config.

---

## 14. Routing dan Ownership

### 14.1 Private Voice

- Selalu route ke tepat satu Union Head aktif setelah prerequisite satu Head/dua Officer terpenuhi.
- Tidak pernah dikirim kepada Manager/Section Head berdasarkan category.
- `routeOwnerId` adalah Union Head; current handler awal kosong/Head sesuai action pertama.
- Union Head dapat assign/reassign Union 1 atau Union 2 sebelum `IN_PROGRESS`; Officer hanya memperoleh assigned scope.
- Consent identity disnapshot saat submit dan menentukan Union DTO; Admin DTO selalu memuat profil reporter lengkap secara read-only.

### 14.2 Safety, Environment, dan Facility

- Ketiga category route kepada satu PIC global yang sama untuk seluruh area.
- PIC global wajib merupakan Department Head aktif yang dipilih Admin.
- Area Temuan dan department reporter tidak memengaruhi owner, tetapi tetap disnapshot untuk context, filter, dan analytics.
- PIC global hanya dapat assign Section Head pada department asal PIC global.

### 14.3 Work Difficulty

- Route kepada Department Head aktif pada organization unit komposit reporter.
- Bila unit bernama tidak mempunyai Department Head, route memakai default PIC aktif yang dipilih Admin.
- Default PIC dapat berasal dari department/division mana pun tetapi memperoleh scoped Manager capability hanya pada unit target dan assign kandidat Section Head unit target.
- Reporter dengan `Department = 14` tidak mempunyai General route; submission ditolak dan hanya Private yang dapat dibuat.

### 14.4 Route Invariant dan Effective History

- Exactly one active route owner wajib tersedia ketika submit.
- Zero atau more-than-one match menghasilkan `ROUTE_UNAVAILABLE`/`ROUTE_AMBIGUOUS`; submission tidak terjadi.
- Route owner, organization unit reporter, structural position actor, assignment, dan consent identity disnapshot pada Voice/event terkait agar monthly update tidak mengubah history.
- Route change berlaku hanya untuk Voice baru. PIC lama mempertahankan legacy access hanya kepada active/historical Voice miliknya sampai ownership aktif selesai; ia tidak masuk route candidate baru.
- Invalid route mapping setelah import menjadi remediation issue dan memblokir submission baru pada scope terkait tanpa mengubah Voice lama.

---

## 15. Voice Lifecycle

### 15.1 Status

`VoiceStatus` memiliki tepat empat nilai:

- `OPEN`;
- `IN_VERIFICATION`;
- `IN_PROGRESS`;
- `CLOSED`.

`REOPENED` adalah event, bukan status kelima.

### 15.2 Transition Matrix

| Dari            | Action            | Actor                                  | Ke              | Efek                                           |
| --------------- | ----------------- | -------------------------------------- | --------------- | ---------------------------------------------- |
| Draft           | Submit            | Reporter                               | Open            | Route owner dan timeline dibuat                |
| Open            | Ask Reporter      | Route owner/current authorized handler | In Verification | Conversation aktif; actor menjadi handler      |
| Open            | Assign handler    | Manager atau Union Head                | In Verification | Section Head/Union Officer menjadi handler     |
| Open            | Proceed           | Route owner/current authorized handler | In Progress     | Actor menjadi handler                          |
| In Verification | Ask/continue chat | Route owner/current handler            | In Verification | Status tetap; message/event ditambah           |
| In Verification | Proceed           | Route owner/current handler            | In Progress     | Handler dikonfirmasi                           |
| In Verification | Reassign          | Manager atau Union Head                | In Verification | Scoped handler diganti                         |
| In Progress     | Close             | Route owner/current handler            | Closed          | Closure cycle selesai                          |
| Closed          | Rate 1–2 + Reopen | Reporter                               | In Verification | PIC terakhir dipertahankan; cycle baru dimulai |

### 15.3 Transition Rules

- Assign/reassign Section Head atau Union Officer hanya boleh sebelum `IN_PROGRESS`.
- Section Head hanya dapat proceed/close Voice yang sedang ditugaskan kepadanya.
- Route Manager dapat close General Voice meski handler aktif adalah Section Head.
- Union Head dapat bertindak pada seluruh Private; Union Officer hanya pada assigned Private. Seluruh Union account read-only pada General.
- Close hanya valid dari `IN_PROGRESS`; Voice harus melalui action Proceed terlebih dahulu.
- Reporter reply tidak mengubah status.
- Tidak ada cancel, withdraw, reject, delete, atau skip langsung Open → Closed tanpa catatan+bukti.
- Double/stale action menghasilkan conflict dan tidak menggandakan event.
- Setiap mutation memakai expected version atau idempotency key.

### 15.4 PIC Display

- Open menampilkan route tujuan; Private menampilkan `Union Head` tanpa membocorkan operator/session.
- In Verification dan In Progress menampilkan current handler/PIC.
- Reporter Private Voice melihat label `Union` atau current Union handler display label yang aman, bukan session/operator metadata.
- Closed menampilkan closure actor dan PIC terakhir yang relevan.

---

## 16. Conversation dan Tanya Reporter

- Action **Tanya User** membuat conversation bila belum ada, mengubah status Open menjadi In Verification, dan membuka room chat.
- Satu Voice memiliki maksimum satu conversation berkelanjutan lintas closure cycle.
- Text message memiliki panjang 1–4.000 karakter.
- Satu message dapat memiliki maksimum lima gambar, masing-masing maksimum 10 MB.
- Empty message tanpa text dan attachment ditolak.
- Message tidak dapat diedit atau dihapus pada v1.
- Chat Closed bersifat read-only; reopen mengaktifkannya kembali.
- Reporter, route owner, current handler, leadership reader, Union reader, dan CARE Admin hanya memperoleh access sesuai overview/detail/action policy terpisah.
- Untuk Private `Tampilkan nama = Tidak`, reporter ditampilkan sebagai alias per-Voice yang tidak dapat dikorelasikan. Untuk `Ya`, Union response memuat nama, no.reg, division, dan department dari immutable submission snapshot.
- CARE Admin Private response memuat profil reporter lengkap untuk support/audit tetapi seluruh lifecycle action tetap ditolak.
- Setiap message menyimpan sender account, capability/position snapshot, timestamp UTC, dan attachment; serializer memakai audience-specific response tanpa optional identity leakage.
- Message baru membuat notification kepada pihak lawan yang relevan.

---

## 17. Closure, Rating, Feedback, dan Reopen

### 17.1 Closure

Close wajib memuat:

- closure note 1–4.000 karakter;
- minimal satu dan maksimal lima foto bukti;
- expected Voice version;
- idempotency key.

Dalam satu transaction, server:

1. memvalidasi actor dan status `IN_PROGRESS`;
2. memvalidasi seluruh evidence telah diproses;
3. membuat `ClosureCycle` dan attachment links;
4. mengubah status menjadi Closed;
5. menambahkan event;
6. membuat notification reporter.

Closure yang sudah tersimpan tidak dapat diedit. Kesalahan diperbaiki melalui reopen dan closure cycle baru, bukan overwrite.

### 17.2 Rating

- Rating berupa integer 1–5 dan hanya reporter yang dapat memberikan.
- Satu rating per Closure Cycle.
- Rating 1–2 mewajibkan feedback text 1–2.000 karakter.
- Rating 3–5 memiliki comment opsional maksimum 2.000 karakter.
- Rating tidak dapat diubah setelah submit.
- Reporter tetap dapat melihat seluruh rating/feedback dan closure cycle historis.

### 17.3 Reopen

- Opsi reopen hanya tersedia untuk rating 1–2.
- Rating dan pilihan reopen dikirim dalam satu mutation atomik; pilihan tidak reopen mempertahankan Closed.
- Reopen mengubah status menjadi In Verification dan mempertahankan route owner serta PIC terakhir.
- Jika PIC terakhir telah inactive, reopen ditolak dengan remediation Admin sampai ownership diperbaiki; record Closed/rating tetap aman.
- Reopen menambahkan event `REOPENED`, menyertakan feedback sebagai alasan, dan memulai Closure Cycle berikutnya.
- Reopen dapat berulang tanpa limit numerik; seluruh cycle tetap immutable.

---

## 18. Dashboard, Inbox, dan Riwayat

### 18.1 Member Home

- primary actions **Buat Voice** dan **Riwayat**;
- empat count Voice milik reporter: Open, In Verification, In Progress, Closed;
- recent Voice list dengan ID, judul, severity, status, dan waktu update.

### 18.2 Manager Dashboard

- aggregate-only General Voice pada division Manager: total, status, severity, category, trend, dan breakdown department;
- operational inbox terpisah untuk General Voice yang berada pada department route, default route, atau global route miliknya;
- recent/high-priority operational items;
- assignment Section Head summary sesuai candidate scope;
- button Buat Voice.

Overview lintas department tidak boleh membawa Voice ID, judul, reporter, attachment, chat, atau field detail. Manager hanya dapat membuka detail department sendiri dan route khusus yang benar-benar dimilikinya.

### 18.3 Section Head Dashboard

- hanya Voice yang sedang atau pernah ditugaskan kepada Section Head tersebut sesuai permission history;
- active counts per status/severity;
- button Buat Voice.

### 18.4 Union Dashboard

- aggregate/detail seluruh General Voice secara read-only;
- Union Head: seluruh Private Voice, total/status/severity, operational inbox, dan assignment summary;
- Union Officer: hanya assigned Private Voice;
- Private identity mengikuti consent; aggregate tidak pernah mengelompokkan reporter identity.

### 18.5 Leadership Dashboard

- Division Head, Deputy Division Head, dan Deputy Division Head Pjt. melihat aggregate seluruh General Voice dan detail hanya pada division sendiri;
- Director melihat aggregate dan detail seluruh General Voice;
- leadership view tidak menampilkan mutation action;
- grafik minimum untuk semua overview yang berizin: status, severity, category termasuk Environment, trend waktu, dan breakdown division/department sesuai scope.

### 18.6 Aggregate dan Detail Authorization Boundary

- Aggregate scope dan detail/list scope dihitung dengan policy terpisah di backend.
- Aggregate lintas detail scope hanya mengembalikan bucket/count/time series yang memenuhi minimum privacy threshold yang ditetapkan implementasi; tidak mengembalikan item identifiers atau identity.
- CARE Admin mempunyai operational overview dan read-only Voice Explorer seluruh General/Private; Private memuat identity lengkap dan setiap access diaudit.

### 18.7 Voice Member Inbox

- default hanya active Voice; Closed dapat dipilih melalui filter;
- urutan utama severity `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, kemudian `submittedAt DESC`;
- server-side cursor pagination;
- filter minimum: status, severity, area, category, handler, dan date range;
- search minimum: Voice ID dan judul;
- Private dan General tidak pernah tercampur pada unauthorized role.

### 18.8 Riwayat dan Detail

Detail menampilkan field submission, attachment, classification source, severity, visibility, current status, PIC sesuai privacy, chat, closure cycles, rating, dan vertical timeline dengan timestamp.

---

## 19. Notifications dan Web Push

### 19.1 Channel

- Notification Center in-app adalah authoritative dan selalu tersedia.
- Web Push adalah best-effort setelah user memberi izin melalui explicit gesture.
- Kegagalan push tidak menghilangkan notification record.

### 19.2 Event Minimum

- Voice baru kepada Manager/PIC global/Union Head;
- assignment/reassignment kepada Section Head atau Union Officer;
- ask reporter/message baru;
- status menjadi In Verification/In Progress;
- closure kepada reporter;
- rating/reopen kepada PIC;
- reset/deactivation/security event yang relevan.

### 19.3 Privacy Payload

- Push Private Voice hanya memuat teks generik, misalnya “Ada pembaruan Private Voice”, dan deep-link opaque.
- Push dilarang memuat judul, detail, severity rationale, identitas reporter, chat text, atau thumbnail Private.
- Notification detail selalu diambil ulang setelah authentication dan authorization.

### 19.4 Subscription Lifecycle

- Subscription terikat user, session/device identifier aman, environment, dan endpoint hash.
- Endpoint host memakai allowlist untuk mencegah SSRF.
- Logout, account deactivation, permission loss, atau permanent delivery failure mencabut subscription.
- Multi-device didukung dan duplicate delivery bersifat idempotent.

---

## 20. Data Model Konseptual

### 20.1 Core Entities

| Entity                  | Tanggung jawab utama                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| Employee                | no.reg, nama, structural position raw, active state                              |
| OrganizationSnapshot    | effective-dated Directorat/Division/Department/Section row per import            |
| OrganizationUnit        | composite Directorat+Division+Department identity                                |
| UserAccount             | username, password hash, account kind, password-change/legacy state              |
| AccountCapability       | derived/scoped Member, Manager, Section Head, leadership, atau legacy access     |
| DepartmentRoute         | structural Department Head atau Admin default PIC mapping dan effective history  |
| GlobalCategoryRoute     | satu active Department Head owner untuk Safety/Environment/Facility              |
| UnionProfile            | Union Head atau Union Officer slot dan active state                              |
| ImportBatch/ImportIssue | checksum, authoritative diff, issue/remediation, actor, dan resolution audit     |
| VoiceDraft              | reporter input, identity consent, version, location/classification state, expiry |
| Voice                   | immutable submission/org/identity/route snapshot, visibility, status, version    |
| AIClassification        | base/model/prompt/source/category nullable/severity/confidence/content hash      |
| LocationReview          | completeness/warning/questions/model/prompt/content hash/acknowledgment          |
| VoiceAssignment         | route owner/current handler dan Section Head/Union Officer assignment history    |
| VoiceEvent              | append-only business timeline dengan capability/position snapshot                |
| Attachment              | storage key, purpose, MIME, size, checksum, processed state                      |
| Conversation            | satu room per Voice                                                              |
| Message                 | immutable text/sender/capability/timestamp                                       |
| ClosureCycle            | close/reopen sequence, actor, note, evidence, timestamps                         |
| Rating                  | score/comment/feedback per Closure Cycle                                         |
| Notification            | persistent recipient/event/read state                                            |
| PushSubscription        | user/device endpoint dan delivery lifecycle                                      |
| Session                 | opaque authentication session dan security metadata                              |
| AuditEvent              | append-only administrative/security mutation record                              |

### 20.2 Required Enums

```ts
type AccountKind = 'CARE_ADMIN' | 'WORKFORCE' | 'UNION';
type StructuralCapability =
  | 'MEMBER'
  | 'SECTION_HEAD'
  | 'MANAGER'
  | 'DIVISION_HEAD'
  | 'DEPUTY_DIVISION_HEAD'
  | 'DEPUTY_DIVISION_HEAD_PJT'
  | 'DIRECTOR'
  | 'LEGACY_HANDLER';
type UnionLevel = 'HEAD' | 'OFFICER';
type VoiceVisibility = 'PRIVATE' | 'GENERAL';
type PrivateIdentityConsent = 'SHOW' | 'HIDE';
type RoutingCategory = 'SAFETY' | 'ENVIRONMENT' | 'FACILITY' | 'WORK_DIFFICULTY';
type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type VoiceStatus = 'OPEN' | 'IN_VERIFICATION' | 'IN_PROGRESS' | 'CLOSED';
type HandlerType = 'MANAGER' | 'SECTION_HEAD' | 'UNION_HEAD' | 'UNION_OFFICER';
type ClassificationSource = 'AI' | 'MANUAL_FALLBACK';
type LocationCompleteness = 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
type AttachmentPurpose = 'VOICE' | 'CHAT' | 'CLOSURE_EVIDENCE';
```

`VoiceEventType` minimum: `SUBMITTED`, `ASKED_REPORTER`, `MESSAGE_SENT`, `ASSIGNED`, `REASSIGNED`, `PROCEEDED`, `CLOSED`, `RATED`, dan `REOPENED`.

### 20.3 Common Fields dan Invariants

- UUID primary key, `createdAt`, `updatedAt`, dan `version` pada mutable aggregate.
- Timestamp disimpan UTC dan ditampilkan Asia/Jakarta.
- Foreign key dan unique constraint menjadi defense-in-depth.
- Voice submission fields, classification snapshot, event, closure, rating, dan message bersifat immutable.
- No hard delete terhadap referenced business data.
- Private reporter relationship tersimpan untuk authorization/chat. Union serializer mengikuti immutable consent; Admin serializer memuat identity lengkap dan read-only.
- Effective master change tidak pernah menulis ulang Voice, assignment, event, message, closure, rating, atau actor/PIC snapshots.
- Semua aggregate mutation yang mengubah Voice, assignment, event, notification, atau closure berada dalam transaction yang sama.

---

## 21. Internal API Contract

### 21.1 Standards

- Base path: `/api/v1`.
- JSON request/response, kecuali multipart upload dan authenticated media stream.
- OpenAPI menjadi source of truth wire contract dan menghasilkan shared TypeScript client/types.
- Validation error harus field-addressable dengan stable machine code.
- List endpoint memakai cursor pagination, server-side filter, dan server-side sort.
- Sensitive mutation memakai `Idempotency-Key` dan/atau `expectedVersion`.
- Server menerima valid `X-Correlation-ID` atau membuat ID baru dan mengembalikannya.
- Error response tidak mengekspos stack trace, raw SQL, filesystem path, prompt, atau secret.
- Timestamp wire format RFC 3339 UTC.
- Health endpoint tidak memerlukan authentication tetapi tidak mengekspos topology/credential.

### 21.2 Capability Endpoints Minimum

Path final dapat disesuaikan selama OpenAPI mempertahankan capability berikut:

#### Authentication

- login, logout, session introspection;
- session response dengan account kind, structural position, capability list, dan safe overview/detail/action scopes;
- mandatory password change;
- CARE Admin password reset dan account activation/deactivation;
- CSRF token lifecycle.

#### Provisioning

- upload/preview/confirm/history authoritative XLSX atau CSV;
- import batch detail, diff, issue, dan remediation resolution;
- employee/account search dan effective organization read;
- default PIC/global PIC read-write;
- exactly-three Union account management;
- read-only Section Head candidates yang diturunkan dari organization snapshot.

#### Voice

- create/update/read/delete expired own draft;
- upload/remove draft attachment;
- request/read location review dan acknowledge incomplete warning;
- classify/reclassify draft;
- confirm Manual Fallback;
- submit;
- list/detail/timeline;
- ask reporter, proceed, assign/reassign Section Head atau Union Officer, close;
- rate dan reopen.

#### Chat dan Media

- get conversation/messages;
- send message dengan image attachments;
- authorized media response dengan safe content headers.

#### Dashboard dan Notification

- aggregate-only overview dan separately scoped Voice list/detail;
- notification list/count/read/read-all;
- push public key, subscribe, unsubscribe, dan installation status.

#### Administration dan Operability

- audit list/detail dengan permission;
- `/health`, `/ready`, dan `/release.json`.

### 21.3 Mutation Semantics

- Duplicate idempotency key dengan payload identik mengembalikan hasil pertama.
- Duplicate key dengan payload berbeda menghasilkan `409 IDEMPOTENCY_CONFLICT`.
- Stale `expectedVersion` menghasilkan `409 VERSION_CONFLICT` dengan current safe summary.
- Invalid lifecycle action menghasilkan `422 INVALID_TRANSITION`.
- Unauthorized object access menggunakan response yang tidak membocorkan keberadaan object.
- Media upload belum dianggap usable sebelum server processing selesai.

### 21.4 Public Contract Types

Shared contract wajib memisahkan response berdasarkan audience:

- `MemberVoiceDetail` memuat reporter-self fields;
- `GeneralResponderVoiceDetail` memuat reporter identity sesuai route permission;
- `PrivateUnionAnonymousVoiceDetail` tidak memiliki field reporter identity secara type-level;
- `PrivateUnionIdentifiedVoiceDetail` memuat immutable nama/no.reg/division/department snapshot hanya ketika consent `SHOW`;
- `AdminPrivateVoiceDetail` selalu memuat reporter profile lengkap tetapi tidak memiliki lifecycle action capability;
- `LeadershipGeneralVoiceDetail` merupakan read-only contract tanpa mutation affordance;
- `DashboardAggregate` tidak memiliki Voice ID, title, reporter, atau free-text detail;
- `LocationReviewSnapshot` memuat completeness/warning/questions/content hash/acknowledgment state;
- `VoiceListItem` tidak membawa chat/closure text yang tidak diperlukan;
- `NotificationPayload` memisahkan persistent detail dari redacted push payload.

Penggunaan optional identity field tunggal untuk semua role tidak diterima karena mudah menyebabkan accidental data disclosure.

---

## 22. UX dan Visual Requirements

### 22.1 Design Direction

- modern, sleek, professional, dan layak enterprise manufacturing;
- mobile-first tanpa terlihat seperti desktop table yang diperkecil;
- konsisten memakai Tailwind tokens dan shadcn/ui primitives;
- hierarchy, spacing, typography, empty state, loading state, error state, skeleton, dan micro-interaction dirancang eksplisit;
- severity memiliki warna dan icon/text label; informasi tidak boleh bergantung pada warna saja;
- action destructive/terminal memiliki confirmation dan konsekuensi yang jelas.

### 22.2 Responsive Behavior

- mobile: 360–767 px;
- tablet: 768–1279 px;
- desktop: ≥1280 px;
- tidak ada document-level horizontal overflow;
- primary action tetap terlihat dan tidak terpotong oleh browser/PWA safe area;
- mobile dialog kompleks menggunakan full-screen sheet;
- table desktop memiliki mobile card representation;
- minimum touch target 44×44 px.

### 22.3 Accessibility

- WCAG 2.1 AA untuk text dan control utama;
- keyboard navigation pada desktop;
- visible focus, focus trap/restore pada dialog;
- programmatic label, description, dan field error association;
- live region untuk classification/loading/status update yang relevan;
- alt text/caption yang tepat untuk evidence thumbnails;
- reduced-motion preference dihormati.

### 22.4 Common UI States

Setiap screen/data surface wajib memiliki:

- loading/skeleton;
- empty state dengan next action;
- retryable error;
- permission denied/not found yang aman;
- offline/stale indicator;
- version conflict recovery;
- last updated untuk dashboard/inbox;
- unsaved-change protection untuk form/draft.

---

## 23. PWA dan Offline Policy

Seluruh kebijakan installability/cache/offline pada bagian ini berlaku untuk workforce PWA. Admin web tidak installable dan seluruh auth/master/audit/Private content bersifat network-only.

### 23.1 Installability

- Manifest memiliki stable app ID, root scope, standalone display, theme/background color, icon 192/512/maskable, dan Apple touch icon.
- Satu custom TypeScript service worker mengelola precache, update, offline fallback, push, dan notification click.
- Update service worker ditawarkan setelah ready dan tidak boleh memotong form/mutation aktif.

### 23.2 Cache Policy

- Hashed JS/CSS/font/icon diprecache dan immutable.
- HTML, manifest, dan service worker memakai non-stale cache policy.
- Auth/session, mutation, media, Private Voice content, chat, dan closure evidence selalu network-only.
- Ringkasan dashboard/riwayat non-sensitif terakhir boleh disimpan user-scoped untuk offline read dengan timestamp stale.
- Offline cache dilarang memuat Private content, General detail, nama/no.reg, chat, foto, atau push endpoint.
- Logout/account switch membersihkan seluruh user-scoped cache dan IndexedDB.

### 23.3 Offline Behavior

- Mutating action, submit, classification, upload, chat, proceed, close, rating, dan reopen wajib online.
- UI mendeteksi offline sebelum mutation dan tidak membuat false-success queue.
- Tidak ada background sync atau queued mutation.
- Offline fallback menjelaskan data apa yang stale dan menyediakan retry.

### 23.4 Browser Support

- Current dan previous major Chrome/Edge desktop dan Android;
- current Safari iOS/iPadOS;
- Web Push iOS hanya dianggap supported pada Home Screen PWA sesuai browser/platform capability;
- browser unsupported mendapat guidance, bukan silent malfunction.

---

## 24. Arsitektur Teknis

### 24.1 Stack yang Dikunci

- Language: TypeScript.
- Package manager: pnpm dengan pinned version dan frozen lockfile.
- Frontend: React, Vite, Tailwind CSS, Radix primitives, Motion, dan CARE shared UI; workforce dan Admin merupakan applications terpisah.
- Backend: NestJS.
- ORM/migration: Prisma.
- Database: PostgreSQL.
- Container: Docker dan Docker Compose.
- Reverse proxy/TLS: Caddy.
- Unit/integration test runner: Vitest.
- Browser E2E: Playwright.
- AI: official `openai` SDK ke configurable OpenAI-compatible Responses API.

### 24.2 Monorepo Logical Layout

Minimum workspace:

- `apps/web-voice` — workforce role/capability-aware PWA dan public `/design` showcase;
- `apps/web-admin` — CARE Admin web terpisah, desktop-only ≥1280 px dan non-PWA;
- `apps/api` — NestJS API dan Prisma;
- `packages/contracts` — generated/shared OpenAPI types/client;
- `packages/ui` — shared light-theme design tokens, accessible primitives, composed components, dan motion contract;
- `packages/frontend-core` — same-origin transport, auth/session/CSRF, cache isolation, typed errors, dan route guards;
- `e2e` — Playwright journeys;
- `deploy` — Caddy, Compose, runtime env templates, scripts, dan tests.

Kedua frontend wajib mengonsumsi generated contract yang sama dan tidak menduplikasi wire types atau authorization rules.

`/design` wajib tersedia pada production build workforce tetapi tidak muncul pada navigasi produk. Route ini public, `noindex`, lazy-loaded, hanya memakai mock data, tidak menginisialisasi auth/API, dan merender token/component/state coverage. Admin tidak memiliki design-system page terpisah dan selalu menggunakan `packages/ui`. V1 memakai light theme saja; BeUI hanya menjadi referensi motion untuk workflow-relevant interactions dengan source provenance dan notice MIT yang dipertahankan.

### 24.3 Backend Modules

- Auth/Sessions;
- Employees/Accounts;
- XLSX/CSV Imports/Effective Organization/Remediation;
- Account Capability/Department Route/Global Route/Union Provisioning;
- Voice Drafts/Uploads;
- AI Classification/Location Review;
- Routing;
- Voice Lifecycle/Assignments;
- Conversations;
- Closures/Ratings;
- Dashboards;
- Notifications/Push;
- Media;
- Audit;
- Health/Readiness.

Domain mutation lintas Voice, assignment, event, closure, notification, dan audit harus memiliki transaction boundary yang eksplisit.

### 24.4 PostgreSQL

- Frontend tidak pernah terhubung langsung ke database.
- Local development memakai Docker-managed PostgreSQL; host PostgreSQL bukan prerequisite.
- Test database memakai container/disposable database atau schema.
- Compose PostgreSQL dapat pgvector-enabled sesuai `.agent/rules.md`; extension tidak digunakan oleh CARE v1.
- Migration memakai expand/contract dan `prisma migrate deploy` untuk non-local environment.
- Destructive migration satu-step dilarang.

### 24.5 Near-real-time Behavior

- Active detail/inbox/dashboard melakukan bounded polling dengan default configurable 3 detik.
- Notification creation memakai transactional outbox agar perubahan bisnis dan delivery intent konsisten.
- Web Push worker memproses outbox secara idempotent.
- V1 tidak memerlukan WebSocket infrastructure.

### 24.6 Implementation Sequencing

- Backend Phase 6 remediation untuk schema/capability/effective master, XLSX/CSV, routing, Union, Responses AI, dashboard authorization, migration, dan OpenAPI wajib complete sebelum frontend implementation dimulai.
- Admin web, workforce role journeys, responsive/PWA behavior, accessibility, generated-client integration, dan two-app browser E2E wajib complete sebelum production application containerization/deployment dimulai.
- Docker-managed PostgreSQL tetap wajib sejak backend development untuk local/integration tests; hal ini adalah development/test infrastructure, bukan production application containerization.
- Production API/workforce/Admin Dockerfiles, dual-host Caddy/remote Compose, release-by-SHA scripts, dan hosted CI/CD dikerjakan setelah Frontend Complete Gate.

---

## 25. File dan Media Storage

### 25.1 Storage

- Media disimpan pada persistent bind-mounted volume di VM, bukan container layer atau PostgreSQL blob.
- Database menyimpan opaque storage key dan metadata, bukan public filesystem path.
- File staging/draft dan final dipisahkan secara logical.
- Serving selalu melalui API authorization; tidak ada public static URL.

### 25.2 Processing Pipeline

1. stream upload dengan total/request limit;
2. verify declared MIME dan magic bytes;
3. decode dengan library yang dibatasi resource;
4. reject malformed/decompression bomb/oversized dimensions;
5. re-encode ke format aman;
6. strip EXIF/metadata;
7. compute checksum dan dimensions;
8. pindahkan atomik ke final storage setelah transaction reference tersedia.

Accepted formats: JPEG, PNG, WebP. SVG, GIF, HEIC, PDF, Office, archive, executable, dan unknown binary ditolak.

### 25.3 Authorization dan Response

- `Content-Type` ditetapkan server dari processed metadata.
- `Content-Disposition`, `nosniff`, private cache control, dan CSP digunakan sesuai context.
- Range/thumbnail support tidak boleh melewati object authorization.
- Private media hanya reporter, authorized Union Head/assigned Officer, dan CARE Admin full read-only scope yang dapat mengakses.

### 25.4 Cleanup

- Orphan temporary upload dibersihkan otomatis.
- Draft media dibersihkan setelah draft expiry 30 hari.
- Business media final tidak dipurge pada v1.
- Cleanup job selalu dry-run capable dan tidak boleh mengikuti symlink keluar storage root.

---

## 26. Security dan Privacy

### 26.1 Application Security

- TLS wajib untuk seluruh non-local traffic.
- Caddy menambahkan HSTS, CSP, frame protection, `X-Content-Type-Options`, Referrer-Policy, dan Permissions-Policy yang sesuai PWA/camera capture.
- Setiap workforce/Admin origin menyediakan same-origin `/api/v1` proxy ke backend yang sama; cookie/CSRF host-scoped dan CORS browser cross-origin tidak diperlukan.
- Semua input divalidasi allowlist di server.
- Output encoding mencegah stored/reflected XSS.
- Raw SQL hanya parameterized dan direview.
- Login, classification, upload, search, message, dan mutation sensitif memiliki rate/size limit.
- Secret, cookie, auth header, password, prompt text, dan Private identity tidak boleh masuk log.

### 26.2 Authorization

- Default deny.
- Account kind/capability/structural position check selalu dikombinasikan object relationship dan overview/detail/action scope.
- Private response memakai separate anonymous, identified-Union, dan full-Admin serializers; optional identity field tunggal dilarang.
- Route scope dihitung server dari snapshot/master; client-supplied manager/handler ID tidak dipercaya.
- File authorization sama ketat dengan parent Voice.
- Admin support action dicatat.

### 26.3 Private Voice Conditional Identity

- Database menyimpan reporter ID untuk ownership, notification, chat, dan rating.
- Consent `SHOW`/`HIDE` disnapshot immutable saat submit.
- Union anonymous API tidak mengembalikan reporter ID, no.reg, nama, division, department, account ID, atau stable cross-Voice alias.
- Union identified API mengembalikan hanya immutable nama/no.reg/division/department submission snapshot.
- CARE Admin API selalu dapat mengembalikan profil reporter lengkap untuk read-only support/audit; setiap access sensitif diaudit.
- Timeline/message reporter pada consent `HIDE` ditampilkan dengan alias per-Voice yang tidak dapat dikorelasikan.
- Search, log, metrics, push, filename, storage key, dan error dilarang membocorkan identity di luar audience policy. Export Private tetap out of scope.
- Database/VM administrator secara teknis dapat mengakses raw storage/database; v1 tidak menyediakan cryptographic anonymity dari infrastructure operator.

### 26.4 Password dan Union Account Security

- Enam karakter tanpa complexity adalah product decision, bukan security recommendation.
- Argon2id, rate limiting, session revocation, TLS, dan forced change menjadi compensating control.
- Tepat tiga Union account individual memperbaiki actor attribution dibanding shared credential; credential/session sharing dilarang.
- MFA dan SSO deferred.

### 26.5 Responses API Privacy

- Hanya minimized text payload yang dikirim; dedicated location review hanya memuat area dan detail lokasi.
- Request menetapkan `store: false`; tools, grounding/web search, file/image input, conversation state, `previous_response_id`, dan prompt logging aplikasi tidak digunakan.
- `store: false` tidak boleh dipasarkan sebagai zero-data-retention. Retention, residency, terms/DPA, ownership, quota, dan endpoint provider wajib diverifikasi untuk actual base URL sebelum launch.
- Raw response text tidak disimpan; hanya validated structured result dan metadata aman yang diperlukan untuk audit.

### 26.6 Secret Management

- Runtime secret hanya melalui GitHub environment secrets/secure VM runtime file.
- Secret minimum: database, session/CSRF, auth throttle, bootstrap Admin, OpenAI-compatible API key/base/model config, VAPID private key, SSH deploy material, dan Caddy email.
- Example env hanya memakai placeholder aman.
- Runtime env mode `0600`; log/deployment summary tidak mencetak nilai.

### 26.7 Security Scanning

CI wajib mencakup:

- Gitleaks directory scan termasuk uncommitted pada local parity dan commit scan setelah commit;
- dependency review dan package audit;
- CodeQL JavaScript/TypeScript;
- Trivy filesystem dan seluruh runtime image untuk High/Critical;
- actionlint, ShellCheck, Hadolint;
- lockfile/frozen clean install;
- targeted security negative tests.

---

## 27. Audit Trail

`AuditEvent` append-only minimum menyimpan:

- event ID dan occurred-at UTC;
- actor account ID/account kind/capability/structural position snapshot atau system actor;
- action dan result;
- resource type/ID;
- sanitized change summary;
- reason bila wajib;
- correlation ID;
- source IP dan user agent yang dibatasi/aman;
- session ID hash/reference;
- release SHA.

Event minimum:

- login success/failure/lockout/logout;
- first-password change/reset/deactivation/session revocation;
- XLSX/CSV import preview/confirm/failure dan authoritative deactivation;
- default/global route change dan remediation resolution;
- derived Section Head capability change akibat snapshot;
- Union account create/reset/level/deactivation dan Union assignment;
- Voice submit/action/assignment/close/rating/reopen;
- classification result/fallback/model config change;
- push subscription lifecycle;
- authorization denial pada sensitive object;
- deployment/release identity tersedia melalui diagnostic, bukan sebagai business audit mutation.

Audit dilarang menyimpan password, cookie, token, full prompt, raw import file, message body, full Voice detail, atau reporter identity pada Private responder view. Timeline bisnis dan security/admin audit adalah konsep berbeda meski dapat berbagi event infrastructure.

---

## 28. Observability dan Operability

### 28.1 Structured Logging

Semua service log JSON ke stdout/stderr dengan:

- timestamp, level, service, environment, release SHA;
- correlation ID;
- method, route template, status, duration;
- safe actor/account reference, account kind, dan capability;
- Voice ID hanya bila tidak menambah Private identity exposure;
- error code/class tanpa secret/PII.

### 28.2 Metrics

Minimum:

- HTTP count/error/latency;
- active session/login failure/rate limit;
- DB pool/latency/error;
- Voice created/status transition/aging per severity/category termasuk Environment/visibility aggregate;
- route unavailable/ambiguous;
- AI success/fallback/invalid schema/latency/token usage/confidence distribution;
- chat and closure counts tanpa message content;
- Web Push attempt/success/permanent/transient failure;
- media upload/process/storage usage;
- outbox lag/retry/dead letter;
- container health/restart.

Metrics Private tidak boleh memakai label reporter atau freeform content.

### 28.3 Health dan Readiness

- `GET /health`: process alive.
- `GET /ready`: database reachable, migration compatible, required configuration valid, storage readable/writable, dan critical initialization selesai.
- Responses provider transient outage tidak mematikan core readiness karena Manual Fallback tersedia; readiness memaparkan degraded dependency secara aman.
- Staging deployment smoke test wajib melakukan live OpenAI-compatible Responses classification/location schema check dengan non-sensitive fixture.
- `release.json`/ready memuat release SHA untuk deployment verification tanpa secret.

### 28.4 Operational Diagnostics

Deployment log wajib menunjukkan release SHA, build, migration, service health, smoke result, dan rollback result. External log/metrics platform belum ditentukan; absence of sink tidak menghapus kewajiban structured logs dan metrics.

---

## 29. Performance dan Reliability

Target diuji pada 10.000 active accounts, 50 concurrent users, 50.000 Voice, representative organization snapshots/mappings/messages/attachments/closure cycles, dan staging-like VM.

| Operation                                   | Target                                |
| ------------------------------------------- | ------------------------------------- |
| Common authenticated read                   | p95 ≤ 2 detik                         |
| Standard mutation di luar AI/upload         | p95 ≤ 3 detik                         |
| Dashboard initial query/filter              | p95 ≤ 3 detik                         |
| Active page status propagation              | p95 ≤ 5 detik                         |
| Notification Center creation setelah commit | p95 ≤ 5 detik                         |
| AI classification                           | p95 ≤ 12 detik per successful attempt |
| Server error rate                           | <1% di luar expected 4xx              |

Pagination dan aggregation wajib dilakukan server-side. Browser tidak boleh mengambil seluruh history/media untuk membangun dashboard.

### 29.1 Availability Boundary

- Tidak ada formal uptime SLA.
- Single VM adalah single point of failure.
- Container restart policy dan health check meningkatkan recoverability proses, bukan HA.
- Tidak ada backup, RPO, RTO, replica, failover, atau disaster recovery.

---

## 30. Deployment Topology

### 30.1 Environment Isolation

Staging dan production masing-masing memakai VM terpisah. Setiap environment menjalankan satu Compose project:

- Caddy;
- CARE workforce web;
- CARE Admin web;
- CARE API;
- PostgreSQL;
- operational one-shot services untuk migration/bootstrap bila diperlukan.

Persistent path minimum:

- PostgreSQL data;
- CARE media;
- Caddy data/config;
- deployment state dan releases.

Tidak ada database, media volume, secret, certificate state, atau Compose project name yang dibagi antar-environment.

### 30.2 Staging

- Workforce origin: `https://care.qd-tmmin.site`.
- Admin origin: `https://admin-ped.qd-tmmin.site`.
- Setiap origin melayani frontend masing-masing dan same-origin `/api/v1` proxy ke CARE API yang sama.
- Cookie/session/CSRF host-scoped; browser tidak memakai cross-origin API calls.
- Staging memiliki database/media/OpenAI-compatible provider/VAPID credential sendiri.

### 30.3 Production

- Domain production workforce/Admin belum ditentukan dan menjadi placeholder `PRODUCTION_CARE_DOMAIN` serta `PRODUCTION_CARE_ADMIN_DOMAIN`.
- Production deploy tidak boleh aktif sampai VM, kedua DNS/TLS reachability, GitHub environment, runtime secrets, Responses provider, dan VAPID tervalidasi.
- Push/PR ke `main` menjalankan CI, tetapi tidak memiliki production deployment caller pada scope saat ini. Aktivasi production baru dapat ditambahkan pada pekerjaan production readiness setelah seluruh prerequisite tersedia.

### 30.4 Caddy

- Automatic HTTPS dan certificate state pada persistent volume.
- Kedua host mem-proxy `/api/*` ke API; route lain ke workforce SPA atau Admin SPA sesuai host.
- Security headers workforce membolehkan service worker/manifest/same-origin API dan image blob preview; Admin host tidak membolehkan service worker/offline cache.
- API/media tidak boleh di-cache public.
- Caddy dimulai/diupdate terakhir setelah API/web healthy.

---

## 31. CI/CD dan Release

### 31.1 Branch Behavior

Push/PR ke `staging`:

1. menjalankan seluruh CI/security checks;
2. push yang sukses dan masih menjadi HEAD terbaru auto-deploy ke staging;
3. menjalankan migration, health/readiness, two-origin smoke, dan live Responses contract check;
4. melakukan automatic code rollback bila candidate gagal dan previous release tersedia.

> **Live Responses contract check bersifat advisory pada auto-deploy (ADR-0015).**
> `live-provider-smoke` tetap dijalankan pada setiap auto-deploy dan hasilnya dicatat
> pada `shared/deployment-state/live-provider-smoke.result` serta deployment log,
> tetapi kegagalannya tidak menggagalkan candidate dan tidak memicu rollback:
> provider AI yang tidak dapat dijangkau hanya menurunkan klasifikasi ke Manual
> Fallback dan location review ke degraded state (PRD §13.5/§28.3). Seluruh gate
> lain (build, migration, health/readiness, web, Caddy, dan two-origin smoke) tetap
> blocking terhadap rollback. Live smoke yang `failed` tetap tidak memenuhi release
> readiness §39 dan acceptance §33.4/§34.7 sampai lulus.

Push ke `main`:

1. menjalankan checks yang sama;
2. tidak memanggil production deployment;
3. production auto-deploy, smoke, dan rollback tetap pending sampai production readiness selesai dan workflow caller terpisah disetujui.

Repository rule menetapkan commit default hanya ke `staging` kecuali branch lain diminta.

### 31.2 Required Checks

- `pnpm install --frozen-lockfile` dari clean artifact state;
- formatting, lint, typecheck;
- Vitest unit dan PostgreSQL integration;
- OpenAPI/generated-client drift;
- production build workforce/Admin/API;
- Compose config dan Docker image build;
- fresh migration dan previous-SHA upgrade;
- destructive migration detection;
- Playwright responsive/browser E2E;
- deployment script tests/rehearsal;
- Gitleaks, dependency review/audit, CodeQL, Trivy;
- actionlint, ShellCheck, Hadolint, `bash -n`;
- `git diff --check`.

Exact commands dan pinned versions wajib direkonsiliasi dengan `.github/workflows/*` ketika workflow dibuat/diubah. `.agent/rules.md` adalah minimum local parity contract.

### 31.3 Release Mechanics

Adaptasi pola `supplier-henkaten`:

- immutable release directory berdasarkan full Git SHA;
- remote deploy lock dan high-water run number;
- archive checksum dan safe-path validation;
- secure runtime env rendering;
- preflight Docker/Compose/disk/path/domain;
- build/pull dan startup PostgreSQL → migrate/bootstrap → API → workforce/Admin web → Caddy;
- per-service health wait;
- smoke check kedua origin, API, release identity, host-scoped auth boundary, storage, dan Responses staging fixtures;
- atomic `current` symlink/release pointer;
- retain candidate, previous, dan hingga total lima release;
- stale image/release cleanup dengan validated target path.

Web Push canary tersedia sebagai operational one-shot profile yang memilih satu subscription staging aktif berdasarkan exact endpoint hash, mengirim payload generik teredaksi melalui delivery helper CARE, dan memverifikasi penerimaan provider serta pembaruan `lastSuccessAt`. Canary dijalankan manual oleh operator dan bukan automated test, deployment smoke, atau syarat auto-deploy. Tidak ada callback/service tambahan.

### 31.4 Migration dan Rollback

- Migration forward-only dan expand/contract.
- `prisma migrate reset`, destructive down migration, atau production database reset dilarang.
- Code rollback tidak melakukan database rollback.
- Candidate code harus backward-compatible dengan schema yang sudah ter-migrate.
- Tanpa backup, destructive migration/operator error tidak dapat dipulihkan; CI prevention wajib tetapi bukan recovery.

---

## 32. Backup, Recovery, dan High Availability

Keputusan v1:

- tidak ada database backup;
- tidak ada media backup;
- tidak ada WAL archive/PITR;
- tidak ada restore procedure;
- tidak ada RPO/RTO;
- tidak ada replica/failover;
- tidak ada multi-node/HA.

Konsekuensi:

- disk/VM/volume failure, operator error, compromise, atau destructive migration dapat menghilangkan seluruh data secara permanen;
- retensi tanpa batas hanya berlaku selama storage bertahan;
- release rollback tidak memulihkan data;
- posture ini bertentangan dengan durability yang lazim diharapkan dari aplikasi enterprise.

Risiko diberi status **Critical / Accepted by product decision** dan wajib memperoleh persetujuan tertulis sebelum production go-live. CARE tidak boleh dipasarkan atau didokumentasikan memiliki disaster recovery.

---

## 33. Testing Strategy

### 33.1 Unit — Vitest

Minimum:

- password/first-login/reset/session rules;
- account-kind/capability/object permission matrix dan tiga Private serializer variants;
- XLSX sheet serta XLSX/CSV header/row/effective-diff/default/global route/remediation validation;
- AI Responses structured parsing, no-fixed-priority behavior, confidence/fallback, location hash invalidation/acknowledgment;
- severity rubric fixtures;
- seluruh lifecycle transition dan invalid transition;
- assignment/reassignment constraints;
- closure/rating/reopen cycle;
- notification audience/redacted push payload;
- cursor/filter/sort helpers;
- media validation policy dan safe storage path.

### 33.2 Integration — Real PostgreSQL Container

- Prisma fresh/upgrade migrations;
- Employee/OrganizationSnapshot/OrganizationUnit/account capability uniqueness dan foreign keys;
- XLSX/CSV import preview/atomic confirm/idempotency/rollback/deactivation/remediation;
- current-schema-to-v1.1 expand/contract backfill preserving every historical ID/PIC/event;
- concurrent submit dan human-readable ID sequence;
- route mutation vs active submission;
- concurrent proceed/assign/close/reopen races;
- optimistic version/idempotency behavior;
- append-only VoiceEvent/AuditEvent/Message/Closure/Rating;
- transaction consistency Voice + event + notification + outbox;
- account reset/session revocation;
- aggregate/detail/action scope isolation dan consent-aware Private/Admin identity contracts;
- media metadata/reference cleanup;
- dashboard aggregate/filter/pagination;
- readiness dependency behavior.

### 33.3 E2E — Playwright

Minimum journeys:

1. Admin bootstrap/login pada Admin origin dan forced account workflows.
2. XLSX/CSV invalid/valid preview, authoritative confirm, diff, remediation, dan preserved leading-zero no.reg.
3. Default PIC, PIC global, serta exactly-one-Head/two-Officer setup.
4. Monthly snapshot deactivation dan legacy handler menyelesaikan Voice aktif tanpa menerima Voice baru.
5. Member first login/change password dan pilihan awal Private/General.
6. General Safety/Environment/Facility → AI Preview → satu PIC global lintas area.
7. Work Difficulty → composite department Head/default PIC; `Department=14` dan missing route preserve draft.
8. AI timeout/low confidence → General category+severity atau Private severity Manual Fallback.
9. Automatic location warning, hash invalidation, confirmation acknowledgment, dan provider-degraded non-blocking path.
10. Private → Union Head → assign Union 1/2; reassign setelah progress ditolak.
11. Private consent `HIDE` anonymous to Union/full to Admin; consent `SHOW` full workforce profile to Union/Admin.
12. Manager/Section Head ask, chat, proceed, assign/reassign, dan close sesuai target/global route scope.
13. Manager division aggregate tanpa detail leakage; department/special route detail/action boundary.
14. Division/Deputy/Pjt. Head global aggregate + own-division detail read-only.
15. Director dan Union General global aggregate/detail read-only.
16. Rating 1–2 feedback/reopen dan rating 3–5 behavior.
17. Multiple closure/rating/reopen cycle mempertahankan history.
18. Notification center dan redacted Web Push.
19. Workforce offline shell/read cache; Admin dan seluruh mutation tetap network-only.
20. Two-origin host isolation, unauthorized/IDOR/media denial, responsive/no-overflow/accessibility.

### 33.4 AI Contract Validation

- Tidak ada labeled dataset atau statistical accuracy/recall launch gate untuk v1.
- Deterministic fixtures mencakup seluruh category termasuk Environment, severity, multi-topic tanpa fixed priority, ambiguous content, informal Indonesian, provider failure/refusal/incomplete, invalid schema, low confidence, Private nullable category, dan location review.
- Unit/contract tests memverifikasi Responses request shape, `store:false`, no tools/conversation, prompt version, structured schemas, allowlisted rationale code, timeout/retry, location cache/acknowledgment, dan Manual Fallback.
- Live Responses test memakai content Indonesia non-sensitive untuk memverifikasi configured base URL/key/model, `/responses`, classification/location schemas, timeout behavior, dan output compatibility; smoke ini tidak mengukur statistical accuracy.
- Backend tetap memilih actual route account secara deterministik dan tidak menerima user/Manager identifier dari AI.

### 33.5 Security Negative Tests

- Member A tidak membaca/mengubah Member B.
- Manager tidak membaca detail di luar department/explicit route meskipun aggregate division tersedia.
- Section Head tidak bertindak tanpa assignment.
- Union tidak melakukan General action dan Union Officer tidak membaca unassigned Private.
- Private `HIDE` tidak membocorkan identity kepada Union; `SHOW` hanya memuat contracted profile snapshot.
- CARE Admin Private response memuat full identity tetapi tetap read-only dan access diaudit.
- Client tidak dapat spoof reporter, route Manager, severity source, handler, status, closure actor, atau role.
- CSRF, CORS, over-posting, mass-assignment, XSS, SQL injection, path traversal, SSRF push endpoint, malicious image, decompression bomb, stale version, dan duplicate mutation ditolak.
- Disabled/reset account/session tidak dapat melanjutkan action.

### 33.6 Performance dan Deployment Tests

- Load baseline pada 10.000 accounts, 50 concurrent users, dan 50.000 Voice memenuhi target p95/error.
- Dashboard/inbox tetap memakai index/pagination representatif.
- Compose config, image build, non-root runtime, health/readiness, fresh/upgrade migration, routing, release identity, persistent volume, and code rollback rehearsal lulus.
- Linux deployment harness menguji real `flock`; macOS result bersifat supplemental.

---

## 34. Acceptance Criteria v1.1

### 34.1 Identity, Organization, dan Provisioning

- [ ] Satu upload `.xlsx` atau UTF-8 `.csv` authoritative memakai tujuh header persis; XLSX memakai sheet `MFG + QD`; preview/confirm/history/audit tidak menyimpan raw production PII di Git.
- [ ] Preview memperlihatkan create/update/deactivate, perubahan posisi/unit, route gap, mapping PIC invalid, dan Union account gap; confirm berlaku atomik.
- [ ] Leading-zero no.reg dipertahankan dan monthly snapshot menonaktifkan account yang hilang serta mencabut session-nya.
- [ ] Capability diturunkan dari posisi struktural dan route assignment tanpa menghilangkan capability Member.
- [ ] Department Head aktif otomatis menjadi Manager; department tanpa Department Head dapat memperoleh default PIC yang ditunjuk Admin.
- [ ] Tepat satu PIC global aktif melayani Safety, Environment, dan Facility untuk seluruh area.
- [ ] Tepat satu Union Head dan dua Union Officer dikelola Admin di luar workbook.
- [ ] Username/password awal dan forced change bekerja untuk setiap account kind; Admin reset mencabut session.
- [ ] Section Head candidates sepenuhnya read-only dan diturunkan dari snapshot organisasi aktif; tidak ada promote/transfer/remove manual.
- [ ] Perubahan snapshot atau route tidak menulis ulang reporter, route owner, assignment, actor, closure, atau PIC historis.

### 34.2 Create, AI, dan Routing

- [ ] Form dimulai dengan pilihan Private Voice atau General Voice dan photo limits tervalidasi frontend/backend.
- [ ] Private mewajibkan pilihan `Tampilkan nama = Ya/Tidak`; snapshot consent dan profil yang boleh ditampilkan immutable setelah submit.
- [ ] Preview menampilkan seluruh field, severity, category bila General, visibility, source classification, dan warning lokasi terbaru.
- [ ] Official OpenAI JavaScript SDK memakai `responses.create`, `/responses`, `store:false`, tanpa tools/conversation state, payload tereduksi, dan Structured Outputs tervalidasi.
- [ ] General menghasilkan category termasuk `ENVIRONMENT` dan severity; Private menghasilkan severity dengan category `null`.
- [ ] Tidak ada category priority tetap; low confidence, ambiguity, refusal, incomplete response, timeout, atau invalid schema masuk Manual Fallback yang sesuai jenis Voice.
- [ ] Location review otomatis menghasilkan `COMPLETE | INCOMPLETE | UNKNOWN`, warning, dan maksimal tiga pertanyaan saran tanpa memblokir form saat provider gagal.
- [ ] Review `INCOMPLETE` memerlukan acknowledgment pada snapshot terbaru sebelum submit; perubahan lokasi membatalkan review/acknowledgment lama.
- [ ] Private selalu menuju Union Head tanpa AI category routing.
- [ ] Safety, Environment, dan Facility selalu menuju satu PIC global lintas area; Work Difficulty menuju Department Head/default PIC pada composite organization unit reporter.
- [ ] `Department=14` atau route General yang tidak sah menolak submit tanpa menghilangkan draft dan memberi remediation yang jelas; Private tetap tersedia.

### 34.3 Privacy dan Authorization

- [ ] General list/detail/action mengikuti scope terpisah untuk Member, Section Head, Manager/Department Head, leadership, Director, Union, dan CARE Admin.
- [ ] Aggregate endpoint tidak membocorkan judul, reporter, Voice ID, atau detail lain di luar detail scope actor.
- [ ] Private hanya dapat dibaca reporter, Union Head, assigned Union Officer, dan CARE Admin sesuai scope masing-masing.
- [ ] Consent `Tidak` menghasilkan DTO anonim tanpa identity field bagi Union; consent `Ya` menampilkan nama, no.reg, division, dan department.
- [ ] CARE Admin selalu memperoleh content serta profil reporter lengkap secara read-only; akses tersebut diaudit.
- [ ] Push, log, audit summary, dan media metadata tidak membocorkan identitas Private di luar contract actor.
- [ ] Media selalu memeriksa parent authorization.
- [ ] Seluruh role/object negative tests lulus.

### 34.4 Lifecycle, Chat, dan Assignment

- [ ] Status hanya Open/In Verification/In Progress/Closed.
- [ ] Ask, proceed, assign, reassign, close, dan reopen mengikuti transition matrix.
- [ ] In Verification/In Progress menampilkan PIC/current handler sesuai privacy.
- [ ] Reassign hanya sebelum In Progress.
- [ ] Union Head menjadi route owner semua Private dan hanya Head dapat assign/reassign Union 1/2 sebelum In Progress.
- [ ] Union Officer hanya melihat/menangani Private yang ditugaskan; Manager atau active handler dapat close General dan Head/assigned Officer dapat close Private sesuai object scope.
- [ ] Close dari Open/In Verification ditolak; hanya In Progress yang dapat ditutup.
- [ ] Chat immutable dengan image attachment dan notification.
- [ ] Timeline actor/timestamp/event lengkap dan append-only.

### 34.5 Closure, Rating, dan Reopen

- [ ] Close ditolak tanpa note dan minimal satu processed evidence photo.
- [ ] Closure history immutable.
- [ ] Rating 1–2 wajib feedback dan dapat reopen.
- [ ] Rating 3–5 comment opsional dan tidak menawarkan reopen.
- [ ] Reopen kembali In Verification pada PIC terakhir dan membuat cycle baru.
- [ ] Multiple cycle tidak menimpa closure/rating sebelumnya.

### 34.6 Dashboard, Frontend, PWA, dan Notification

- [ ] Aggregate overview, scoped list/detail, dan action authorization dipisahkan dan sesuai matriks Section 17.
- [ ] Grafik minimum mencakup status, severity, category termasuk Environment, trend waktu, dan breakdown division/department sesuai aggregate scope.
- [ ] Manager mendapat aggregate satu divisi, detail department sendiri, serta operational inbox terpisah untuk global/default route yang menjadi tanggung jawabnya.
- [ ] Division/Deputy/Pjt. Head, Director, dan Union memperoleh General read-only sesuai scope; Private tetap mengikuti scope Union khusus.
- [ ] Inbox severity-first lalu newest dengan server pagination/filter.
- [ ] Notification Center authoritative dan push best-effort/redacted.
- [x] Workforce app dan Admin app memakai generated OpenAPI client bersama tetapi dipisahkan sebagai deployment/origin berbeda.
- [x] Workforce PWA foundation installable dan update-safe; Admin app bukan PWA/offline surface.
- [x] Offline state jelas dan tidak membuat queued mutation.
- [ ] Two-app responsive/accessibility matrix lulus.

### 34.7 Non-Functional dan Delivery

- [ ] Performance baseline memenuhi Section 29.
- [ ] Unit, integration, E2E, AI contract validation, security, migration, build, dan deployment checks lulus.
- [ ] Push `staging` auto-deploy ke `care.qd-tmmin.site` dan `admin-ped.qd-tmmin.site` setelah green CI.
- [x] Push/PR `main` menjalankan checks tanpa production deployment caller; production activation tetap diblokir sampai prerequisite lengkap.
- [ ] Release-by-SHA, health/readiness, smoke, dan code rollback rehearsal lulus.
- [ ] Critical Accepted Risks memperoleh approval sebelum production.

---

## 35. Success Metrics

- 100% Voice memiliki immutable reporter ownership, organization/route/PIC snapshot, Private identity consent, classification source, status, dan submitted timestamp sesuai jenis Voice.
- 100% transition memiliki actor, account kind/capability/structural-position snapshot yang relevan, timestamp, dan event.
- 100% Closed Voice memiliki note dan minimal satu evidence.
- 100% rating 1–2 memiliki feedback.
- 0 unauthorized cross-user/route/private identity exposure.
- 0 duplicate business mutation dari idempotent retry.
- 0 Voice baru tanpa valid route owner/handler relationship; legacy handler hanya mempertahankan akses terbatas pada Voice aktif yang telah ditangani.
- 0 unresolved route gap sebelum General submission; seluruh gap import tercatat pada remediation queue.
- Notification Center record tercipta untuk 100% required business events.
- Deterministic AI contract fixtures dan live structured-output smoke lulus sebelum model/prompt promotion.
- Performance target p95 dan error rate dipenuhi pada baseline.

Adoption, average verification time, average closure time, reopen rate, rating distribution, dan aging per severity dipantau setelah rollout; target numerik bisnis ditetapkan setelah baseline nyata tersedia.

---

## 36. Explicit Out-of-Scope v1

- public/social General Voice feed;
- multi-PIC parallel ownership atau multi-department approval;
- cancel, withdraw, reject, delete, atau edit immutable Voice;
- email, SMS, WhatsApp, Teams, Slack, atau webhook notification;
- native iOS/Android app;
- offline draft/mutation queue/background sync;
- PDF, Office, video, audio, GIF, HEIC, atau arbitrary document attachment;
- self-service password reset, email/OTP;
- SSO/SAML/OIDC, MFA, SCIM;
- AI analysis terhadap foto/chat/identity;
- AI auto-response atau automatic closure;
- export/report builder/BI integration;
- backup, PITR, restore, DR, HA, replica, multi-region;
- managed object storage/database;
- legal case management atau emergency dispatch integration.

---

## 37. Risiko dan Mitigasi

| Risiko                                                                           | Severity | Status          | Mitigasi/konsekuensi v1                                                                               |
| -------------------------------------------------------------------------------- | -------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| Tidak ada backup/recovery                                                        | Critical | Accepted        | Pencegahan destructive action, expand/contract, health checks; data tetap dapat hilang permanen       |
| Retensi tanpa batas pada local volume                                            | High     | Accepted        | Storage metrics/alerts dan capacity review; tidak ada purge otomatis                                  |
| Single VM menjadi single point of failure                                        | Critical | Accepted        | Restart/health/readiness; bukan HA                                                                    |
| Password minimum enam karakter tanpa complexity                                  | High     | Accepted        | Argon2id, TLS, rate limiting, forced change, session revocation                                       |
| Salah konfigurasi tiga akun Union/berbagi credential                             | High     | Mitigated       | Exactly-one-Head/two-Officer constraint, individual session/audit, forced change, access review       |
| Admin membaca isi dan identitas Private Voice                                    | High     | Accepted        | Read-only authorization, least privilege, access audit, dan negative tests                            |
| Infrastructure operator dapat mengakses raw Private mapping                      | High     | Accepted        | Restricted VM/DB access; cryptographic anonymity deferred                                             |
| AI salah category/severity/location review                                       | High     | Mitigated       | Structured schema, threshold/fallback, advisory warning, fixtures, dan deterministic account route    |
| Self-reported confidence tidak terkalibrasi sempurna                             | Medium   | Accepted        | Configurable threshold, mandatory fallback, and deterministic boundary tests                          |
| Endpoint/model OpenAI-compatible memiliki residency/retensi yang belum disetujui | High     | Open governance | Base URL/model/key tanpa production default, payload minimization, `store:false`, dan approval launch |
| OpenAI-compatible provider outage/429                                            | Medium   | Mitigated       | Timeout/retry terbatas dan Manual Fallback; location review non-blocking                              |
| Snapshot organisasi bulanan terlambat/salah                                      | High     | Mitigated       | Preview/diff, atomic confirm, remediation queue, audit, dan legacy-handler preservation               |
| Web Push tidak terkirim/terlambat                                                | Medium   | Accepted        | Notification Center authoritative dan delivery retry/metrics                                          |
| Media berbahaya/oversized                                                        | High     | Mitigated       | Decode/re-encode, EXIF strip, limits, authorized serving                                              |
| Production deployment diaktifkan sebelum prerequisite lengkap                    | High     | Mitigated       | `main` hanya CI; caller production tidak tersedia sampai readiness dan approval                       |
| Migration gagal tanpa backup                                                     | Critical | Accepted        | Forward-only expand/contract dan fresh/upgrade tests; recovery tidak tersedia                         |

---

## 38. External Dependencies dan Launch Blockers

Staging/production membutuhkan:

- authoritative workforce workbook sesuai contract `MFG + QD`, designated data owner, dan monthly publication process;
- designated CARE Admin, default/global PIC mapping owner, serta pemilik individual Union Head/Union 1/Union 2;
- `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY`, reasoning effort, timeout/threshold, quota, dan server-only secret per environment;
- approval terms/DPA, residency, retention, dan privacy posture untuk configured OpenAI-compatible endpoint/model;
- VAPID contact subject per environment; key pairs are generated by the project CLI and private keys remain runtime secrets;
- staging VM, deploy user, SSH known-hosts/key, DNS, ports, Caddy email, dan runtime secrets;
- production VM, workforce/admin domains, DNS, GitHub environments, dan runtime secrets;
- Android Chrome/Edge dan iOS/iPadOS Home Screen devices untuk UAT;
- written approval atas no-backup/no-DR, password policy, Admin full Private access, dan permanent logical retention;
- operational owner untuk incident, deployment, storage capacity, access review, monthly organization data, dan AI cost/quota.

Secret value, actual production PII, IP, dan private key dilarang ditulis pada repository documentation.

---

## 39. Release Readiness Checklist

V1 siap production bila:

1. seluruh acceptance criteria wajib lulus;
2. tidak ada unresolved Critical/High security finding;
3. deterministic Responses API fixtures dan live staging classification/location structured-output smoke lulus dengan external config;
4. capability/scope/privacy/conditional-Private-identity negative tests lulus;
5. PostgreSQL fresh dan previous-release upgrade lulus;
6. performance baseline lulus;
7. workforce real-device PWA/push/offline dan Admin responsive UAT lulus;
8. kedua staging origin lulus host-isolation, auto-deploy, release identity, smoke, dan rollback rehearsal;
9. production workforce/admin domains, VM, DNS, secrets, OpenAI config, dan VAPID tersedia;
10. authoritative XLSX/CSV UAT, monthly diff, Union setup, dan route remediation lengkap;
11. critical accepted risks disetujui secara tertulis;
12. incident/deployment/storage owner ditetapkan.

---

## 40. Keputusan Produk yang Dikunci

- Workforce PWA dan Admin React app adalah dua frontend/deployment terpisah dengan satu backend dan generated OpenAPI client bersama.
- Lima area tetap.
- Satu file `.xlsx` atau UTF-8 `.csv` authoritative memakai tujuh header persis; XLSX memakai sheet `MFG + QD`; Section Head dan posisi struktural diturunkan dari monthly snapshot, bukan dikelola Manager.
- Workforce master diimpor melalui Admin UI dan tidak disimpan di Git; tiga akun Union dikelola Admin di luar workbook.
- First login/reset memakai username/no.reg sebagai temporary password dan wajib change.
- Department Head dan Manager interchangeable; Department Head aktif otomatis menjadi Manager department-nya.
- Department tanpa Department Head dapat memakai default PIC yang dipilih Admin dari karyawan aktif; kandidat assignment tetap Section Head pada department target.
- Tepat satu PIC global dari Department Head aktif menangani Safety, Environment, dan Facility untuk seluruh area.
- Work Difficulty route berdasarkan composite `Directorat + Division + Department`; `Department=14` tidak memiliki route General yang sah.
- Private selalu menuju Union Head; Union Officer hanya menangani assignment-nya.
- Private menyimpan immutable identity-consent snapshot: Union melihat identity hanya bila consent `Ya`, sementara CARE Admin selalu melihat profil lengkap secara read-only.
- General bukan public feed.
- Union memakai tepat satu akun Head dan dua akun Officer dengan operator attribution individual.
- AI memakai official OpenAI JavaScript SDK melalui configurable `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY`, dan `OPENAI_REASONING_EFFORT`; base URL/model/key tidak memiliki production default, sedangkan reasoning effort kosong default ke `medium`.
- AI high-confidence read-only; failure/low-confidence wajib Manual Fallback reporter.
- Tidak ada category priority tetap; General memilih kategori utama berdasarkan konteks dan Private tidak menghasilkan kategori.
- Location review otomatis bersifat advisory; warning incomplete memerlukan acknowledgment snapshot terbaru tetapi provider failure tidak memblokir submit.
- Empat status saja; reopen adalah event menuju In Verification dengan PIC terakhir.
- Reassign hanya sebelum In Progress.
- Manager atau current handler dapat close dari In Progress; closure note dan foto wajib.
- Rating disimpan per closure cycle; rating 1–2 wajib feedback dan dapat reopen.
- Notification Center authoritative; Web Push best-effort.
- Gambar saja; media authorized dan sanitized.
- Offline mutation tidak didukung.
- Permanent logical retention tanpa backup/DR/HA.
- Single VM terpisah per environment.
- Backend v1.1 remediation/re-freeze wajib lulus sebelum frontend dimulai, lalu Frontend Complete → production containerization/deployment.
- Staging memakai `care.qd-tmmin.site` dan `admin-ped.qd-tmmin.site`; kedua production domain merupakan external dependency.
- Push `staging` menjadi trigger deployment staging setelah seluruh checks hijau dan candidate masih menjadi branch HEAD.
- Push/PR `main` hanya menjalankan CI pada scope saat ini; production deployment caller belum tersedia.
- Web Push canary adalah operasi staging manual, bukan automated test, deployment smoke, atau auto-deploy gate.
