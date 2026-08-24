# Product Requirements Document (PRD): CARE Enterprise Member Voice

| Atribut | Nilai |
|---|---|
| Status dokumen | **Draft product contract for v1 planning** |
| Status implementasi | **Not started** |
| Versi dokumen | 1.0 |
| Tanggal | 24 Agustus 2026 |
| Product owner | TMMIN |
| Pengguna utama | Member/karyawan, Manager, Section Head, Union, dan CARE Admin |
| Platform | Mobile-first Progressive Web App (PWA), satu frontend surface |
| Source of truth | Dokumen ini |

Dokumen ini adalah kontrak produk dan implementasi CARE v1. Kata **MUST/wajib**, **MUST NOT/dilarang**, **SHOULD/sebaiknya**, dan **MAY/dapat** bersifat normatif. Bila source code, prototype, fixture, atau asumsi implementasi berbeda dengan dokumen ini, perbedaan wajib diekskalasi dan source of truth terkait wajib diperbarui; implementer tidak boleh memilih perilaku secara diam-diam.

---

## 1. Ringkasan Eksekutif

CARE adalah aplikasi pelaporan suara member (*member voice*) untuk lingkungan enterprise manufacturing. CARE menyediakan jalur mobile yang aman dan dapat ditelusuri untuk menyampaikan temuan, keluhan, ide, informasi, atau apresiasi; mengklasifikasikan severity dan rute penanganan dengan Gemini melalui Vertex AI; meneruskan voice kepada Manager, Section Head, atau Union; menyediakan chat verifikasi; serta mencatat penyelesaian, bukti, rating, feedback, dan reopen.

CARE menggunakan satu frontend PWA yang menyesuaikan navigasi dan kemampuan berdasarkan role. Backend menjadi satu-satunya akses ke PostgreSQL dan media. Seluruh perubahan lifecycle disimpan sebagai timeline append-only dengan actor dan timestamp. Private Voice tidak dikaitkan kepada Manager, dirutekan ke akun Union bersama, dan menyembunyikan identitas reporter dari Union maupun CARE Admin.

V1 memakai arsitektur monolitik single-VM per environment. Staging tersedia pada `https://care.qd-tmmin.site`; production domain akan ditentukan kemudian. Keputusan v1 tidak menyediakan backup, point-in-time recovery, high availability, atau disaster recovery. Hal tersebut merupakan **Critical Accepted Risk**, bukan kemampuan yang boleh diklaim tersedia.

---

## 2. Latar Belakang dan Sumber Requirement

### 2.1 Masalah yang Diselesaikan

CARE menyelesaikan kebutuhan berikut:

- member memerlukan kanal pelaporan yang sederhana, mobile, dan dapat dipercaya;
- pelaporan harus memiliki status dan penanggung jawab yang jelas;
- voice perlu dirutekan secara konsisten tanpa bergantung pada pengetahuan struktur organisasi reporter;
- isu berisiko tinggi harus terlihat lebih awal dan diprioritaskan;
- proses tanya jawab, assignment, tindakan, penutupan, dan reopen harus dapat diaudit;
- Private Voice memerlukan jalur Union dan anonimitas terhadap responder;
- manajemen membutuhkan dashboard status dan severity sesuai scope kewenangannya.

### 2.2 Referensi yang Dianalisis

- Requirement CARE yang diberikan pada 24 Agustus 2026.
- `.agent/rules.md` pada repository CARE.
- `.agent/PRD.md`, workflow GitHub Actions, Compose, Caddy, dan deployment scripts pada repository `supplier-henkaten` sebagai referensi pola kontrak dan operasional.
- Dokumentasi resmi Google Cloud untuk Gemini pada Vertex AI, structured output, model lifecycle, dan data retention.

Referensi `supplier-henkaten` hanya menjadi pola. CARE wajib memakai satu frontend, satu domain per environment, nama service/path sendiri, dan domain bisnis CARE.

### 2.3 Referensi Vertex AI

- Model awal: [`gemini-3.7-flash`](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-7-flash), GA sejak 13 Agustus 2026, structured output didukung.
- SDK TypeScript: [`@google/genai`](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart).
- Structured JSON response: [controlled generation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-controlled-generation-response-schema-2).
- Data retention: [Vertex AI and zero data retention](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention).

Ketersediaan model, lifecycle, pricing, dan kebijakan data dapat berubah. Model ID dan location wajib configurable, dan perubahan model wajib melalui evaluation serta audit konfigurasi.

---

## 3. Visi, Tujuan, dan Non-Tujuan

### 3.1 Visi

Menyediakan kanal member voice yang aman, responsif, transparan, dan dapat dipertanggungjawabkan sehingga setiap laporan memperoleh rute, PIC, progres, dan penyelesaian yang jelas tanpa mengorbankan kebutuhan privasi.

### 3.2 Tujuan Produk v1

- Memungkinkan karyawan membuat dan memantau Voice dari perangkat mobile.
- Menyediakan Private Voice anonim yang hanya ditangani Union.
- Merutekan General Voice kepada Manager yang tepat secara deterministik.
- Menggunakan AI untuk rekomendasi kategori dan severity dengan fallback manual yang aman.
- Menyediakan lifecycle Open, In Verification, In Progress, Closed, serta reopen yang traceable.
- Menyediakan room chat dengan lampiran gambar untuk verifikasi.
- Memungkinkan Manager mengangkat/memberhentikan Section Head dan mendelegasikan Voice.
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

| Istilah | Definisi |
|---|---|
| Voice | Laporan, ide, informasi, apresiasi, keluhan, atau temuan yang dibuat reporter. |
| Reporter | User yang membuat Voice. |
| General Voice | Voice non-publik yang identitas reporternya terlihat oleh responder berizin dan dirutekan ke Manager. |
| Private Voice | Voice yang dirutekan hanya ke Union dan identitas reporternya disamarkan dari responder/Admin. |
| Route Manager | Manager yang dipilih secara deterministik berdasarkan kategori/department/area. |
| Handler/PIC | Manager atau Section Head yang sedang menangani Voice; Union menjadi handler untuk Private Voice. |
| Union | Akun responder bersama untuk Private Voice. |
| Closure Cycle | Satu siklus penutupan Voice; reopen memulai siklus berikutnya. |
| AI Classification | Snapshot hasil Gemini yang memuat kategori, severity, confidence, dan metadata model/prompt. |
| Manual Fallback | Klasifikasi yang dikonfirmasi reporter saat AI gagal atau confidence rendah. |
| Timeline | Urutan event bisnis Voice yang append-only. |
| Notification Center | Sumber notifikasi persisten dan authoritative di dalam aplikasi. |

---

## 5. Scope, Kapasitas, dan Batas Sistem

### 5.1 Baseline Kapasitas v1

Acceptance baseline:

- maksimum 2.000 akun aktif;
- maksimum 50 authenticated concurrent users;
- maksimum 50.000 Voice tersimpan;
- lima area tetap;
- satu perusahaan/tenant pada v1;
- satu frontend, satu API, dan satu PostgreSQL per environment.

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

## 6. Persona dan Role

### 6.1 CARE Admin

Tujuan:

- memprovision master data dan akun;
- menjaga konfigurasi routing valid;
- melakukan reset/deaktivasi akun;
- melakukan support dan audit.

Kemampuan:

- import dan preview Employee CSV, Manager CSV, dan Union JSON;
- melihat/mengelola employee, account, manager mapping, dan import history;
- reset password ke credential sementara dan mencabut session;
- melihat seluruh General Voice;
- melihat isi Private Voice seperti Union, tetapi tidak melihat identitas reporter;
- melihat audit dan metadata operasional;
- menonaktifkan akun bila tidak memiliki constraint bisnis yang belum diselesaikan.

Larangan:

- tidak dapat membuka identitas reporter Private Voice melalui UI/API;
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

### 6.3 Manager

Manager selalu memiliki kemampuan Member. Scope responder ditentukan oleh `ManagerProfile`:

- Safety Manager menerima kategori Safety pada area yang sama;
- Facility Manager menerima kategori Facility pada area yang sama;
- Manager reguler menerima Kesulitan Kerja dari reporter dengan department yang sama, tanpa memperhitungkan area;
- satu Manager dapat memiliki flag Safety dan Facility bila constraint uniqueness tetap terpenuhi.

Manager dapat:

- melihat dashboard dan inbox sesuai route scope;
- bertanya kepada reporter, proceed, assign/reassign Section Head, atau close;
- melihat room chat untuk Voice yang menjadi scope-nya;
- mengangkat dan memberhentikan Section Head;
- membuat Voice sebagai reporter.

### 6.4 Section Head

Section Head selalu memiliki kemampuan Member. Section Head:

- memiliki tepat satu relasi Manager aktif;
- hanya melihat/memproses Voice yang ditugaskan kepadanya;
- dapat bertanya kepada reporter, proceed, chat, dan close;
- tidak dapat assign Voice ke orang lain;
- dapat membuat Voice sebagai reporter.

### 6.5 Union

Union adalah satu akun bersama yang dapat dipakai banyak petugas dan menerima seluruh Private Voice. Union:

- melihat isi Private Voice, severity, timeline, dan alias reporter anonim;
- tidak melihat nama, no.reg, division, department, atau identifier reporter;
- dapat bertanya/chat, proceed, dan close;
- tidak memiliki fitur assign Section Head;
- tidak melihat General Voice;
- tidak memperoleh kemampuan membuat Voice pada v1.

Audit hanya dapat mengatribusikan aksi kepada akun Union, session, IP, user agent, dan waktu; audit tidak dapat membuktikan individu manusia yang bertindak.

---

## 7. Matriks Permission

Legenda: `M` manage/mutate, `V` view, `O` operate workflow, `-` tidak memiliki akses.

| Capability | CARE Admin | Member | Manager | Section Head | Union |
|---|---:|---:|---:|---:|---:|
| Import/master account | M | - | - | - | - |
| Reset/deactivate account | M | - | - | - | - |
| Buat Voice | - | M | M | M | - |
| Voice milik sendiri | V | M | M | M | - |
| General Voice route scope | V | - | O | Assigned only | - |
| Private Voice content | V, anonymous | Own only | Own only | Own only | O, anonymous |
| Identitas Private reporter | - | Own | Own | Own | - |
| Tanya/proceed General | - | - | O | Assigned only | - |
| Assign Section Head | - | - | M | - | - |
| Close General | - | - | M | Assigned only | - |
| Tanya/proceed/close Private | - | - | - | - | O |
| Manage Section Head | - | - | M | - | - |
| Chat | Support read only | Own | Route scope | Assigned only | Private only |
| Rating/reopen | - | Own only | Own only | Own only | - |
| System audit | V | - | Scoped timeline | Scoped timeline | Scoped timeline |

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

- Username berasal dari Union JSON dan harus unik.
- Password awal sama dengan username dan wajib diganti saat login pertama.
- Akun Union boleh mempunyai beberapa session aktif karena digunakan bersama.
- Penggantian password mencabut seluruh session Union lain agar credential konsisten.

### 8.3 CARE Admin Bootstrap

- Akun CARE Admin pertama dibuat melalui CLI/runtime secret, bukan fixture Git.
- Bootstrap bersifat idempotent dan tidak mencetak password.
- Password bootstrap wajib minimal 12 karakter dan berbeda dari username; aturan enam karakter hanya berlaku bagi akun workforce/Union sesuai kontrak produk.

### 8.4 Reset dan Deaktivasi

- Hanya CARE Admin yang dapat reset password.
- Reset karyawan/Manager/Section Head menetapkan password sementara ke `no_reg`; reset Union menetapkan ke username.
- Reset mencabut seluruh session dan mewajibkan change password berikutnya.
- Deaktivasi mencabut session dan memblokir login baru.
- Manager/Section Head/Union tidak dapat dinonaktifkan bila masih menjadi handler aktif sampai Voice direassign/diselesaikan.

### 8.5 Session Security

- Authentication memakai opaque server-side session dalam cookie `HttpOnly`, `Secure`, dan `SameSite=Lax`.
- Mutation dilindungi CSRF token yang terikat session.
- Session memiliki idle dan absolute expiry yang configurable; default idle 8 jam dan absolute 7 hari.
- Login dan mutation sensitif memiliki IP/account throttling.
- Logout dan password reset menghapus push subscription association yang tidak lagi valid.

---

## 9. Master Data dan Import

### 9.1 Employee CSV

Header wajib dan urutan-independent:

```csv
no_reg,name,division,department
```

Aturan:

- UTF-8, comma-delimited, satu header row;
- `no_reg` 1–64 karakter dan unik setelah trim;
- `name`, `division`, dan `department` wajib, masing-masing maksimum 200 karakter;
- nilai kosong, duplicate, header asing, atau row malformed menjadi validation error;
- import membuat/memperbarui `Employee` dan akun Member;
- password existing tidak pernah berubah akibat import;
- record yang tidak ada pada file tidak dinonaktifkan otomatis.

### 9.2 Manager CSV

Header wajib:

```csv
name,no_reg,division,department,area,is_safety,is_facility
```

Aturan:

- `no_reg` wajib sudah ada pada Employee master;
- name/division/department harus cocok dengan master atau import ditolak;
- `area` harus salah satu dari lima area;
- `is_safety` dan `is_facility` hanya `0` atau `1`;
- tepat satu Safety Manager aktif per area;
- tepat satu Facility Manager aktif per area;
- tepat satu Manager aktif per department untuk route Kesulitan Kerja;
- konflik route membuat seluruh import batch gagal; tidak ada partial write.

### 9.3 Union JSON

Schema minimum:

```json
{
  "username": "union-shared",
  "display_name": "Union"
}
```

- Hanya satu akun Union aktif boleh ada.
- File tidak memuat password; server membuat password awal sama dengan username.
- Replacement Union account memerlukan explicit confirmation dan memastikan tidak ada handler Private aktif yang kehilangan akses.

### 9.4 Import Workflow

1. Admin memilih jenis file dan upload.
2. Server parsing ke temporary storage tanpa mengubah master data.
3. UI menampilkan jumlah create/update/unchanged/error dan error per row/field.
4. Admin melakukan confirm dengan idempotency key.
5. Seluruh batch diterapkan dalam satu transaction atau seluruhnya rollback.
6. `ImportBatch`, checksum file, actor, summary, dan sanitized error disimpan untuk audit.
7. Raw file aktual dihapus setelah import selesai/gagal; raw PII file tidak menjadi fixture repository.

Import upsert tidak boleh menimpa role atau relationship historis secara tidak terkontrol. Perubahan yang melanggar active handler/route constraint ditolak dengan remediation yang jelas.

---

## 10. Section Head Management

- Manager membuka Settings → Section Heads.
- Search bersifat server-side berdasarkan exact/prefix no.reg dan case-insensitive nama.
- Seluruh employee aktif dapat dipilih tanpa batas department/area.
- Promotion membuat role `SECTION_HEAD` dan `SectionHeadRelation` aktif kepada Manager tersebut.
- Satu employee hanya memiliki satu relasi Section Head aktif.
- Jika employee sudah menjadi Section Head Manager lain, promotion ditolak; transfer harus melalui operasi eksplisit dan hanya bila tidak ada active assigned Voice.
- Manager hanya dapat assign Voice kepada Section Head aktif yang berelasi langsung dengannya.
- Removal ditolak bila Section Head menjadi handler pada Voice `IN_VERIFICATION` atau `IN_PROGRESS`.
- Promotion, transfer, dan removal selalu diaudit dan mencabut/re-evaluate permission pada request berikutnya.

---

## 11. Information Architecture dan Navigation

Satu frontend surface menampilkan menu berdasarkan capability.

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
- Settings Section Heads;
- Akun.

### 11.3 Section Head

- Beranda responder;
- Buat Voice;
- Voice Member yang ditugaskan;
- Riwayat saya;
- Notifikasi;
- Akun.

### 11.4 Union

- Beranda Union;
- Private Voice;
- Notifikasi;
- Akun.

### 11.5 CARE Admin

- Overview operasional;
- Import dan Master Data;
- Accounts;
- Voice Explorer;
- Audit;
- System Status;
- Akun.

Bottom navigation digunakan untuk primary mobile journeys. Desktop menggunakan sidebar/topbar yang tetap memakai route dan permission yang sama.

---

## 12. Create Voice dan Preview

### 12.1 Form Input Voice

Field wajib:

- Area Temuan: satu dari lima `Area`;
- Detail Lokasi: text 1–200 karakter;
- Judul Voice: text 1–150 karakter;
- Detail Voice: text 1–5.000 karakter;
- Visibility: `PRIVATE` atau `GENERAL`.

Lampiran foto bersifat opsional:

- maksimum lima file;
- maksimum 10 MB per file;
- JPEG, PNG, atau WebP;
- dapat memilih file atau memakai camera capture yang didukung browser.

Button **Selesai** menyimpan/update `VoiceDraft`, memvalidasi media, lalu meminta AI classification. Button tidak mengirim Voice kepada responder.

### 12.2 Preview Voice

Preview menampilkan:

- Area;
- Department tujuan (`Union`, `Safety`, `Facility`, atau department reporter);
- Detail Lokasi;
- Judul;
- Detail Voice;
- thumbnails lampiran;
- Severity Low/Medium/High/Critical;
- Private/General;
- kategori routing untuk General;
- indikator apakah hasil berasal dari AI atau Manual Fallback.

Hasil AI confidence tinggi bersifat read-only. Reporter dapat memilih **Kembali** untuk mengubah input; perubahan area, judul, detail, visibility, atau department master reporter membatalkan snapshot classification dan mewajibkan klasifikasi ulang.

### 12.3 Submit

Button **Kirim Voice**:

1. memvalidasi draft ownership dan version;
2. memvalidasi classification masih cocok dengan content hash;
3. memvalidasi route Manager/Union masih aktif dan unik;
4. membuat Voice, classification snapshot, attachment link, assignment owner, event `SUBMITTED`, dan notification dalam satu transaction;
5. mengubah status menjadi `OPEN`;
6. menampilkan detail Riwayat Voice yang baru.

Jika PIC/Union tidak tersedia atau route menjadi ambigu, submission ditolak dengan error yang dapat diperbaiki, draft dan media tetap tersimpan, dan tidak ada Voice parsial.

### 12.4 Voice Identifier

- Internal ID memakai UUID.
- UI menampilkan ID immutable `CARE-YYYYMM-######` yang dibuat server dengan sequence concurrency-safe.
- ID tidak boleh membawa department, area, atau penanda Private.

---

## 13. AI Classification dan Severity

### 13.1 Model Contract

- Provider: Gemini melalui Google Cloud Vertex AI.
- SDK: `@google/genai`.
- Default model: `gemini-3.7-flash`.
- Default location: `global`.
- Supported model locations yang terverifikasi pada tanggal dokumen: `global`, `us`, dan `eu`; CARE tidak boleh mengasumsikan region Indonesia tersedia.
- Default `thinking_level`: `LOW`.
- Model, location, prompt version, timeout, dan confidence threshold berasal dari runtime env/config.
- Authentication menggunakan Google service identity/ADC; API key/credential tidak boleh masuk repository atau log.

Structured response minimum:

```ts
interface VoiceClassificationResult {
  category: 'SAFETY' | 'FACILITY' | 'WORK_DIFFICULTY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number; // 0..1
  rationaleCode: string;
}
```

Untuk Private Voice, backend mengabaikan `category` dan menentukan route `UNION`; AI hanya menentukan severity.

### 13.2 Input Minimization

Payload AI hanya boleh memuat:

- area;
- department reporter;
- judul;
- detail teks;
- prompt/rubric versi aktif.

Payload dilarang memuat nama, no.reg, division, account ID, Voice ID, IP, foto, filename, metadata perangkat, chat, atau identifier lain. Logging tidak boleh menyimpan prompt lengkap; log hanya metadata request yang disanitasi.

### 13.3 Routing Classification

Kategori:

- `SAFETY`: keselamatan kerja, hazard, near miss, unsafe condition, risiko cedera;
- `FACILITY`: gedung, utilitas, penerangan, ventilasi, toilet, akses, fasilitas umum;
- `WORK_DIFFICULTY`: proses kerja, alat/prosedur, manpower, konflik kerja, dukungan department, atau isu lain yang bukan Safety/Facility.

Jika isi mencakup beberapa kategori, primary category wajib mengikuti prioritas:

1. Safety;
2. Facility;
3. Work Difficulty.

AI tidak memilih user/PIC ID. Backend memetakan category kepada master data secara deterministik.

### 13.4 Severity Rubric

| Severity | Meaning | Contoh |
|---|---|---|
| Low | Tidak mendesak dan tidak berdampak langsung pada operasi | Apresiasi, ide 5R minor, label, informasi lebih jelas, kenyamanan kecil |
| Medium | Perlu follow-up, tanpa bahaya langsung atau dampak produksi besar | Tool kecil rusak dengan backup, pencahayaan minor, SOP kurang jelas, delay kecil berulang |
| High | Dampak signifikan atau potensi risiko terhadap safety, quality, productivity, atau people | Ergonomi menyebabkan sakit, abnormalitas mesin, manpower shortage berulang, blocked walkway, konflik berulang |
| Critical | Bahaya segera, serious people/compliance issue, atau potensi dampak bisnis besar | Near miss berpotensi cedera berat, api/asap/listrik, unsafe machine, harassment/violence/discrimination, chemical spill, major line stop/customer quality risk |

Severity adalah prioritas penanganan, bukan diagnosis hukum atau pengganti emergency response. UI Critical wajib menyarankan reporter menghubungi jalur darurat lokal bila terdapat bahaya langsung; CARE tetap menerima Voice jika reporter melanjutkan.

### 13.5 Confidence dan Fallback

- Default confidence threshold adalah `0.75` dan configurable per environment.
- Satu retry diperbolehkan untuk transient error dengan timeout maksimum 10 detik per attempt.
- Timeout, exhausted retry, invalid JSON/schema, blocked response, empty response, atau confidence di bawah threshold mengaktifkan Manual Fallback.
- Manual Fallback mewajibkan reporter memilih category dan severity; department tujuan tetap dihitung backend.
- Pilihan manual, alasan fallback, model, dan error class yang aman disimpan dalam classification audit.
- AI success tidak dapat diedit reporter; reporter harus kembali mengubah isi dan menjalankan klasifikasi ulang.

### 13.6 Classification Snapshot dan Monitoring

Setiap submission menyimpan:

- model ID dan location;
- prompt/rubric version;
- category/severity/confidence;
- source `AI` atau `MANUAL_FALLBACK`;
- response ID bila tersedia;
- content hash;
- latency, token usage bila tersedia, dan timestamp;
- sanitized fallback/error code.

Raw chain-of-thought tidak diminta atau disimpan. Model upgrade memerlukan labeled evaluation, staging smoke test, dan audit perubahan config.

---

## 14. Routing dan Ownership

### 14.1 Private Voice

- Selalu route ke satu akun Union aktif.
- Tidak pernah dikirim kepada Manager/Section Head berdasarkan category.
- `routeManagerId` kosong; `handlerType=UNION`.
- Tidak ada assignment Section Head.

### 14.2 Safety

- Route kepada tepat satu active Manager dengan `is_safety=1` dan area sama dengan Area Temuan.
- Department reporter tidak memengaruhi route.

### 14.3 Facility

- Route kepada tepat satu active Manager dengan `is_facility=1` dan area sama dengan Area Temuan.
- Department reporter tidak memengaruhi route.

### 14.4 Work Difficulty

- Route kepada tepat satu active Manager dengan department sama dengan department reporter.
- Area Temuan dan area Manager tidak memengaruhi route.

### 14.5 Route Invariant

- Exactly one active route owner wajib tersedia ketika submit.
- Zero atau more-than-one match menghasilkan `ROUTE_UNAVAILABLE`/`ROUTE_AMBIGUOUS`; submission tidak terjadi.
- Route owner disnapshot pada Voice agar perubahan master tidak mengubah history.
- Deaktivasi/reconfiguration route dilarang bila meninggalkan active Voice tanpa owner.

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

| Dari | Action | Actor | Ke | Efek |
|---|---|---|---|---|
| Draft | Submit | Reporter | Open | Route owner dan timeline dibuat |
| Open | Ask Reporter | Manager/Union | In Verification | Conversation aktif; actor menjadi handler |
| Open | Assign Section Head | Route Manager | In Verification | Section Head menjadi handler |
| Open | Proceed | Manager/Union | In Progress | Actor menjadi handler |
| In Verification | Ask/continue chat | Current handler/Manager owner | In Verification | Status tetap; message/event ditambah |
| In Verification | Proceed | Current handler/Manager/Union | In Progress | Handler dikonfirmasi |
| In Verification | Reassign | Route Manager | In Verification | Handler Section Head diganti |
| In Progress | Close | Route Manager/current handler/Union | Closed | Closure cycle selesai |
| Closed | Rate 1–2 + Reopen | Reporter | In Verification | PIC terakhir dipertahankan; cycle baru dimulai |

### 15.3 Transition Rules

- Assign/reassign hanya boleh pada General Voice sebelum `IN_PROGRESS`.
- Section Head hanya dapat proceed/close Voice yang sedang ditugaskan kepadanya.
- Route Manager dapat close General Voice meski handler aktif adalah Section Head.
- Union hanya dapat bertindak pada Private Voice.
- Close hanya valid dari `IN_PROGRESS`; Voice harus melalui action Proceed terlebih dahulu.
- Reporter reply tidak mengubah status.
- Tidak ada cancel, withdraw, reject, delete, atau skip langsung Open → Closed tanpa catatan+bukti.
- Double/stale action menghasilkan conflict dan tidak menggandakan event.
- Setiap mutation memakai expected version atau idempotency key.

### 15.4 PIC Display

- Open menampilkan route tujuan, bukan PIC personal, kecuali Union label untuk Private Voice.
- In Verification dan In Progress menampilkan current handler/PIC.
- Reporter Private Voice melihat label `Union`, bukan session/operator.
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
- Reporter, route Manager, current handler, dan CARE Admin hanya memperoleh akses sesuai visibility. Union hanya memperoleh akses pada Private Voice.
- Untuk Private Voice, reporter ditampilkan sebagai alias stabil per Voice, misalnya `Anonymous Reporter`; alias tidak dapat dikorelasikan antar-Voice oleh Union.
- Setiap message menyimpan sender account, role snapshot, timestamp UTC, dan attachment; API Private melakukan redaction identitas reporter sebelum response.
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

- total Voice pada route scope;
- jumlah per status;
- jumlah per severity;
- recent/high-priority inbox;
- assignment Section Head summary;
- button Buat Voice.

Safety/Facility scope memakai area/flag; Manager reguler memakai department. Voice yang tidak berada dalam route scope tidak boleh terhitung.

### 18.3 Section Head Dashboard

- hanya Voice yang sedang atau pernah ditugaskan kepada Section Head tersebut sesuai permission history;
- active counts per status/severity;
- button Buat Voice.

### 18.4 Union Dashboard

- hanya Private Voice;
- total/per-status/per-severity;
- tidak menampilkan identitas atau department reporter.

### 18.5 Voice Member Inbox

- default hanya active Voice; Closed dapat dipilih melalui filter;
- urutan utama severity `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, kemudian `submittedAt DESC`;
- server-side cursor pagination;
- filter minimum: status, severity, area, category, handler, dan date range;
- search minimum: Voice ID dan judul;
- Private dan General tidak pernah tercampur pada unauthorized role.

### 18.6 Riwayat dan Detail

Detail menampilkan field submission, attachment, classification source, severity, visibility, current status, PIC sesuai privacy, chat, closure cycles, rating, dan vertical timeline dengan timestamp.

---

## 19. Notifications dan Web Push

### 19.1 Channel

- Notification Center in-app adalah authoritative dan selalu tersedia.
- Web Push adalah best-effort setelah user memberi izin melalui explicit gesture.
- Kegagalan push tidak menghilangkan notification record.

### 19.2 Event Minimum

- Voice baru kepada route Manager/Union;
- assignment/reassignment kepada Section Head;
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

| Entity | Tanggung jawab utama |
|---|---|
| Employee | no.reg, nama, division, department, active state |
| UserAccount | username, password hash, role/capability, password-change state |
| ManagerProfile | area, Safety/Facility flags, department route identity |
| SectionHeadRelation | Manager–Section Head active relationship dan history |
| ImportBatch | type, checksum, preview/result counts, actor, error summary |
| VoiceDraft | reporter-owned input, version, classification state, expiry |
| Voice | immutable submission snapshot, visibility, route, status, version |
| AIClassification | model/prompt/source/category/severity/confidence/content hash |
| VoiceAssignment | route owner/current handler dan assignment history |
| VoiceEvent | append-only business timeline |
| Attachment | storage key, purpose, MIME, size, checksum, processed state |
| Conversation | satu room per Voice |
| Message | immutable text/sender/role/timestamp |
| ClosureCycle | close/reopen sequence, actor, note, evidence, timestamps |
| Rating | score/comment/feedback per Closure Cycle |
| Notification | persistent recipient/event/read state |
| PushSubscription | user/device endpoint dan delivery lifecycle |
| Session | opaque authentication session dan security metadata |
| AuditEvent | append-only administrative/security mutation record |

### 20.2 Required Enums

```ts
type Role = 'CARE_ADMIN' | 'MEMBER' | 'MANAGER' | 'SECTION_HEAD' | 'UNION';
type VoiceVisibility = 'PRIVATE' | 'GENERAL';
type RoutingCategory = 'SAFETY' | 'FACILITY' | 'WORK_DIFFICULTY';
type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type VoiceStatus = 'OPEN' | 'IN_VERIFICATION' | 'IN_PROGRESS' | 'CLOSED';
type HandlerType = 'MANAGER' | 'SECTION_HEAD' | 'UNION';
type ClassificationSource = 'AI' | 'MANUAL_FALLBACK';
type AttachmentPurpose = 'VOICE' | 'CHAT' | 'CLOSURE_EVIDENCE';
```

`VoiceEventType` minimum: `SUBMITTED`, `ASKED_REPORTER`, `MESSAGE_SENT`, `ASSIGNED`, `REASSIGNED`, `PROCEEDED`, `CLOSED`, `RATED`, dan `REOPENED`.

### 20.3 Common Fields dan Invariants

- UUID primary key, `createdAt`, `updatedAt`, dan `version` pada mutable aggregate.
- Timestamp disimpan UTC dan ditampilkan Asia/Jakarta.
- Foreign key dan unique constraint menjadi defense-in-depth.
- Voice submission fields, classification snapshot, event, closure, rating, dan message bersifat immutable.
- No hard delete terhadap referenced business data.
- Private reporter relationship tersimpan untuk authorization/chat tetapi tidak pernah diserialisasi kepada Union/Admin.
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
- mandatory password change;
- CARE Admin password reset dan account activation/deactivation;
- CSRF token lifecycle.

#### Provisioning

- upload/preview/confirm import;
- import batch detail/error;
- employee search;
- account/manager route read;
- Section Head promote/transfer/remove.

#### Voice

- create/update/read/delete expired own draft;
- upload/remove draft attachment;
- classify/reclassify draft;
- confirm Manual Fallback;
- submit;
- list/detail/timeline;
- ask reporter, proceed, assign, reassign, close;
- rate dan reopen.

#### Chat dan Media

- get conversation/messages;
- send message dengan image attachments;
- authorized media response dengan safe content headers.

#### Dashboard dan Notification

- role-scoped dashboard aggregates;
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
- `PrivateResponderVoiceDetail` tidak memiliki field reporter identity secara type-level;
- `AdminPrivateVoiceDetail` memakai bentuk anonim yang sama dengan Union;
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
- Frontend: React, Vite, Tailwind CSS, shadcn/ui.
- Backend: NestJS.
- ORM/migration: Prisma.
- Database: PostgreSQL.
- Container: Docker dan Docker Compose.
- Reverse proxy/TLS: Caddy.
- Unit/integration test runner: Vitest.
- Browser E2E: Playwright.
- AI: `@google/genai` ke Gemini melalui Vertex AI.

### 24.2 Monorepo Logical Layout

Minimum workspace:

- `apps/web` — satu role-aware frontend surface;
- `apps/api` — NestJS API dan Prisma;
- `packages/contracts` — generated/shared OpenAPI types/client;
- `packages/ui` — shared design tokens/primitives bila diperlukan;
- `e2e` — Playwright journeys;
- `deploy` — Caddy, Compose, runtime env templates, scripts, dan tests.

Nama final dapat berubah melalui ADR sebelum scaffold, tetapi tidak boleh menambah frontend terpisah tanpa mengubah PRD.

### 24.3 Backend Modules

- Auth/Sessions;
- Employees/Accounts;
- Imports/Provisioning;
- Role and Section Head Management;
- Voice Drafts/Uploads;
- AI Classification;
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

- Backend domain, database, API, authorization, AI, media, notification, OpenAPI contract, dan backend acceptance tests wajib complete sebelum frontend implementation dimulai.
- Frontend role journeys, responsive/PWA behavior, accessibility, generated-client integration, dan browser E2E wajib complete sebelum production application containerization/deployment dimulai.
- Docker-managed PostgreSQL tetap wajib sejak backend development untuk local/integration tests; hal ini adalah development/test infrastructure, bukan production application containerization.
- Production API/web Dockerfiles, Caddy/remote Compose, release-by-SHA scripts, dan hosted CI/CD dikerjakan setelah Frontend Complete Gate.

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
- Private media hanya reporter, Union, dan CARE Admin anonim-content scope yang dapat mengakses.

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
- Same-origin `/api/v1` menjadi default; CORS cross-origin tidak diperlukan kecuali explicitly configured.
- Semua input divalidasi allowlist di server.
- Output encoding mencegah stored/reflected XSS.
- Raw SQL hanya parameterized dan direview.
- Login, classification, upload, search, message, dan mutation sensitif memiliki rate/size limit.
- Secret, cookie, auth header, password, prompt text, dan Private identity tidak boleh masuk log.

### 26.2 Authorization

- Default deny.
- Role check selalu dikombinasikan object relationship check.
- Private response memakai dedicated serializer/type yang tidak memiliki identity field.
- Route scope dihitung server dari snapshot/master; client-supplied manager/handler ID tidak dipercaya.
- File authorization sama ketat dengan parent Voice.
- Admin support action dicatat.

### 26.3 Private Voice Anonymity

- Database menyimpan reporter ID untuk ownership, notification, chat, dan rating.
- Union/CARE Admin API tidak pernah mengembalikan reporter ID, no.reg, nama, division, department, account ID, atau stable cross-Voice alias.
- Timeline/message reporter ditampilkan dengan alias per-Voice yang tidak dapat dikorelasikan.
- Search, export, log, metrics, push, filename, storage key, dan error dilarang membocorkan identity.
- Database/VM administrator secara teknis dapat mengakses raw storage/database; v1 tidak menyediakan cryptographic anonymity dari infrastructure operator.

### 26.4 Password dan Shared Union Risk

- Enam karakter tanpa complexity adalah product decision, bukan security recommendation.
- Argon2id, rate limiting, session revocation, TLS, dan forced change menjadi compensating control.
- Akun Union bersama menghilangkan non-repudiation individual; audit hanya session-level.
- MFA dan SSO deferred.

### 26.5 Vertex AI Privacy

- Hanya minimized text payload yang dikirim.
- Grounding, URL context, code execution, chat session resumption, explicit context caching, dan prompt logging aplikasi tidak digunakan.
- `global` endpoint memerlukan persetujuan governance karena tidak menjamin in-country Indonesia data residency.
- Zero-data-retention tidak boleh diklaim sebelum seluruh persyaratan Google Cloud dan konfigurasi project diverifikasi.
- Vertex terms/CDPA, project ownership, IAM, location, dan retention posture adalah launch dependency.

### 26.6 Secret Management

- Runtime secret hanya melalui GitHub environment secrets/secure VM runtime file.
- Secret minimum: database, session/CSRF, auth throttle, bootstrap Admin, Vertex identity/config, VAPID private key, SSH deploy material, dan Caddy email.
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
- actor account ID/role atau system actor;
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
- import preview/confirm/failure;
- manager route change;
- Section Head promotion/transfer/removal;
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
- safe actor/account reference dan role;
- Voice ID hanya bila tidak menambah Private identity exposure;
- error code/class tanpa secret/PII.

### 28.2 Metrics

Minimum:

- HTTP count/error/latency;
- active session/login failure/rate limit;
- DB pool/latency/error;
- Voice created/status transition/aging per severity/category/visibility aggregate;
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
- Vertex transient outage tidak mematikan core readiness karena Manual Fallback tersedia; readiness memaparkan degraded dependency secara aman.
- Staging deployment smoke test wajib melakukan live Vertex classification contract check dengan non-sensitive fixture.
- `release.json`/ready memuat release SHA untuk deployment verification tanpa secret.

### 28.4 Operational Diagnostics

Deployment log wajib menunjukkan release SHA, build, migration, service health, smoke result, dan rollback result. External log/metrics platform belum ditentukan; absence of sink tidak menghapus kewajiban structured logs dan metrics.

---

## 29. Performance dan Reliability

Target diuji pada 2.000 active accounts, 50 concurrent users, 50.000 Voice, representative messages/attachments/closure cycles, dan staging-like VM.

| Operation | Target |
|---|---|
| Common authenticated read | p95 ≤ 2 detik |
| Standard mutation di luar AI/upload | p95 ≤ 3 detik |
| Dashboard initial query/filter | p95 ≤ 3 detik |
| Active page status propagation | p95 ≤ 5 detik |
| Notification Center creation setelah commit | p95 ≤ 5 detik |
| AI classification | p95 ≤ 12 detik per successful attempt |
| Server error rate | <1% di luar expected 4xx |

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
- CARE web;
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

- Origin: `https://care.qd-tmmin.site`.
- SPA: `/`.
- API: `/api/v1` pada origin yang sama.
- Staging memiliki database/media/GCP/VAPID credential sendiri.

### 30.3 Production

- Domain production belum ditentukan dan menjadi placeholder `PRODUCTION_CARE_DOMAIN`.
- Production deploy tidak boleh aktif sampai VM, DNS, TLS reachability, GitHub environment, runtime secrets, Vertex, dan VAPID tervalidasi.
- Push ke `main` menjadi trigger deployment production setelah seluruh prerequisite tersedia.

### 30.4 Caddy

- Automatic HTTPS dan certificate state pada persistent volume.
- `/api/*` reverse proxy ke API; route lain ke SPA.
- Security headers membolehkan service worker/manifest/same-origin API dan image blob preview yang dibutuhkan, tanpa wildcard tidak perlu.
- API/media tidak boleh di-cache public.
- Caddy dimulai/diupdate terakhir setelah API/web healthy.

---

## 31. CI/CD dan Release

### 31.1 Branch Behavior

Push/PR ke `staging`:

1. menjalankan seluruh CI/security checks;
2. push yang sukses dan masih menjadi HEAD terbaru auto-deploy ke staging;
3. menjalankan migration, health/readiness, smoke, dan live Vertex contract check;
4. melakukan automatic code rollback bila candidate gagal dan previous release tersedia.

Push ke `main`:

1. menjalankan checks yang sama;
2. auto-deploy ke production hanya setelah production environment lengkap;
3. stale candidate ditolak;
4. smoke/readiness dijalankan;
5. code rollback dilakukan jika aman dan previous release tersedia.

Repository rule menetapkan commit default hanya ke `staging` kecuali branch lain diminta.

### 31.2 Required Checks

- `pnpm install --frozen-lockfile` dari clean artifact state;
- formatting, lint, typecheck;
- Vitest unit dan PostgreSQL integration;
- OpenAPI/generated-client drift;
- production build web/API;
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
- build/pull dan startup PostgreSQL → migrate/bootstrap → API → web → Caddy;
- per-service health wait;
- smoke check origin, API, release identity, auth boundary, storage, dan Vertex staging fixture;
- atomic `current` symlink/release pointer;
- retain candidate, previous, dan hingga total lima release;
- stale image/release cleanup dengan validated target path.

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
- role/object permission matrix dan Private serializer redaction;
- import row/schema/route uniqueness validation;
- AI structured parsing, category priority, confidence/fallback, content hash invalidation;
- severity rubric fixtures;
- seluruh lifecycle transition dan invalid transition;
- assignment/reassignment constraints;
- closure/rating/reopen cycle;
- notification audience/redacted push payload;
- cursor/filter/sort helpers;
- media validation policy dan safe storage path.

### 33.2 Integration — Real PostgreSQL Container

- Prisma fresh/upgrade migrations;
- Employee/Manager uniqueness dan foreign keys;
- import preview/atomic confirm/idempotency/rollback;
- concurrent submit dan human-readable ID sequence;
- route mutation vs active submission;
- concurrent proceed/assign/close/reopen races;
- optimistic version/idempotency behavior;
- append-only VoiceEvent/AuditEvent/Message/Closure/Rating;
- transaction consistency Voice + event + notification + outbox;
- account reset/session revocation;
- object-level visibility dan Private identity redaction;
- media metadata/reference cleanup;
- dashboard aggregate/filter/pagination;
- readiness dependency behavior.

### 33.3 E2E — Playwright

Minimum journeys:

1. Admin bootstrap/login dan forced account workflows.
2. Employee/Manager/Union import preview error dan successful atomic import.
3. Member first login/change password.
4. General Safety Voice → AI Preview → correct area Manager → Open.
5. General Facility dan Work Difficulty route.
6. AI timeout/low confidence → mandatory manual selection.
7. Missing/ambiguous PIC → submit rejected, draft preserved.
8. Private Voice → Union only, reporter identity absent dari Union/Admin response/UI.
9. Manager ask → chat → In Verification.
10. Manager proceed → In Progress → close dengan evidence.
11. Manager promote Section Head → assign → Section Head ask/proceed/close.
12. Reassign sebelum progress berhasil; setelah progress ditolak.
13. Manager close saat Section Head menjadi handler.
14. Rating 1–2 feedback required; optional reopen ke PIC sama.
15. Rating 3–5 comment optional dan reopen unavailable.
16. Multiple closure/rating/reopen cycle mempertahankan history.
17. Notification center dan redacted Web Push.
18. Offline shell/read cache dan seluruh mutation blocked.
19. Unauthorized/IDOR/media access ditolak.
20. Responsive layouts dan no-overflow pada mobile/tablet/desktop.

### 33.4 AI Evaluation

- Dataset berlabel bahasa Indonesia dari konteks manufacturing, tanpa PII.
- Minimum 100 case dan mencakup tiap category/severity, multi-topic, ambiguous, spelling informal, harassment, electrical/fire, quality/customer, ergonomic, facility, dan appreciation.
- Metric minimum: routing accuracy, Critical recall, severity exact/adjacent accuracy, invalid-schema rate, fallback rate, latency, token usage.
- Launch target awal: routing accuracy ≥90%, Critical recall ≥95%, invalid-schema <1% pada model/prompt candidate.
- Critical miss ditinjau manual sebelum model/prompt dipromosikan.
- Deterministic CI memakai fake/recorded contract; live Vertex test hanya staging smoke/evaluation bercredential.

### 33.5 Security Negative Tests

- Member A tidak membaca/mengubah Member B.
- Manager tidak membaca route lain.
- Section Head tidak bertindak tanpa assignment.
- Union tidak melihat General atau Private reporter identity.
- CARE Admin Private response tetap anonim.
- Client tidak dapat spoof reporter, route Manager, severity source, handler, status, closure actor, atau role.
- CSRF, CORS, over-posting, mass-assignment, XSS, SQL injection, path traversal, SSRF push endpoint, malicious image, decompression bomb, stale version, dan duplicate mutation ditolak.
- Disabled/reset account/session tidak dapat melanjutkan action.

### 33.6 Performance dan Deployment Tests

- Load baseline pada 50 concurrent users dan 50.000 Voice memenuhi target p95/error.
- Dashboard/inbox tetap memakai index/pagination representatif.
- Compose config, image build, non-root runtime, health/readiness, fresh/upgrade migration, routing, release identity, persistent volume, and code rollback rehearsal lulus.
- Linux deployment harness menguji real `flock`; macOS result bersifat supplemental.

---

## 34. Acceptance Criteria v1

### 34.1 Identity dan Provisioning

- [ ] Employee, Manager, dan Union import memiliki preview, validation, atomic confirm, audit, dan tidak menyimpan raw production PII di Git.
- [ ] Username/password awal dan forced change bekerja untuk setiap account type.
- [ ] Admin reset mencabut session dan memaksa change password.
- [ ] Route uniqueness persis satu Safety/area, Facility/area, dan regular Manager/department terjaga.
- [ ] Section Head promotion/removal/transfer memenuhi relationship dan active assignment constraints.

### 34.2 Create, AI, dan Routing

- [ ] Form dan photo limits tervalidasi frontend/backend.
- [ ] Preview menampilkan seluruh field, department, severity, category, visibility, dan source classification.
- [ ] `gemini-3.7-flash` structured contract dan minimized payload digunakan.
- [ ] High-confidence result read-only; failure/low confidence mewajibkan Manual Fallback.
- [ ] Multi-topic priority Safety → Facility → Work Difficulty deterministik.
- [ ] Private selalu ke Union; General ke tepat satu Manager.
- [ ] Missing/ambiguous route menolak submit tanpa menghilangkan draft.

### 34.3 Privacy dan Authorization

- [ ] General hanya reporter, route Manager, assigned Section Head, dan Admin yang berizin.
- [ ] Private hanya reporter, Union, dan Admin untuk content.
- [ ] Union/Admin tidak memperoleh identitas reporter Private pada UI, API, push, audit detail, log, media metadata, atau alias lintas Voice.
- [ ] Media selalu memeriksa parent authorization.
- [ ] Seluruh role/object negative tests lulus.

### 34.4 Lifecycle, Chat, dan Assignment

- [ ] Status hanya Open/In Verification/In Progress/Closed.
- [ ] Ask, proceed, assign, reassign, close, dan reopen mengikuti transition matrix.
- [ ] In Verification/In Progress menampilkan PIC sesuai privacy.
- [ ] Reassign hanya sebelum In Progress.
- [ ] Manager atau active handler dapat close General; Union dapat close Private.
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

### 34.6 Dashboard, PWA, dan Notification

- [ ] Dashboard scope/count sesuai role.
- [ ] Inbox severity-first lalu newest dengan server pagination/filter.
- [ ] Notification Center authoritative dan push best-effort/redacted.
- [ ] PWA installable, update-safe, dan seluruh sensitive/mutation data network-only.
- [ ] Offline state jelas dan tidak membuat queued mutation.
- [ ] Responsive/accessibility matrix lulus.

### 34.7 Non-Functional dan Delivery

- [ ] Performance baseline memenuhi Section 29.
- [ ] Unit, integration, E2E, AI evaluation, security, migration, build, dan deployment checks lulus.
- [ ] Push `staging` auto-deploy ke `care.qd-tmmin.site` setelah green CI.
- [ ] Push `main` contract tersedia tetapi production activation diblokir sampai prerequisite lengkap.
- [ ] Release-by-SHA, health/readiness, smoke, dan code rollback rehearsal lulus.
- [ ] Critical Accepted Risks memperoleh approval sebelum production.

---

## 35. Success Metrics

- 100% Voice memiliki immutable reporter ownership, route snapshot, classification source, status, dan submitted timestamp.
- 100% transition memiliki actor, role, timestamp, dan event.
- 100% Closed Voice memiliki note dan minimal satu evidence.
- 100% rating 1–2 memiliki feedback.
- 0 unauthorized cross-user/route/private identity exposure.
- 0 duplicate business mutation dari idempotent retry.
- 0 active Voice tanpa valid route owner/handler relationship.
- Notification Center record tercipta untuk 100% required business events.
- AI evaluation memenuhi routing/Critical recall target sebelum model/prompt promotion.
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

| Risiko | Severity | Status | Mitigasi/konsekuensi v1 |
|---|---|---|---|
| Tidak ada backup/recovery | Critical | Accepted | Pencegahan destructive action, expand/contract, health checks; data tetap dapat hilang permanen |
| Retensi tanpa batas pada local volume | High | Accepted | Storage metrics/alerts dan capacity review; tidak ada purge otomatis |
| Single VM menjadi single point of failure | Critical | Accepted | Restart/health/readiness; bukan HA |
| Password minimum enam karakter tanpa complexity | High | Accepted | Argon2id, TLS, rate limiting, forced change, session revocation |
| Akun Union bersama tanpa atribusi individu | High | Accepted | Session/IP/user-agent audit; non-repudiation individual tidak tersedia |
| Admin membaca isi Private Voice | High | Accepted | Identity tetap disamarkan, least privilege, audit access |
| Infrastructure operator dapat mengakses raw Private mapping | High | Accepted | Restricted VM/DB access; cryptographic anonymity deferred |
| AI salah route/severity | High | Mitigated | Structured schema, threshold/fallback, labeled evaluation, monitoring, deterministic route mapping |
| Self-reported confidence tidak terkalibrasi sempurna | Medium | Accepted | Configurable threshold dan empirical evaluation |
| Vertex `global` memproses data di luar in-country Indonesia | High | Open governance | Data minimization dan governance approval sebelum launch |
| Vertex outage/429 | Medium | Mitigated | Retry terbatas dan Manual Fallback; core readiness degraded, bukan down |
| Web Push tidak terkirim/terlambat | Medium | Accepted | Notification Center authoritative dan delivery retry/metrics |
| Media berbahaya/oversized | High | Mitigated | Decode/re-encode, EXIF strip, limits, authorized serving |
| Auto production deploy dari main | High | Accepted | Mandatory CI/security/smoke, stale rejection, code rollback |
| Migration gagal tanpa backup | Critical | Accepted | Forward-only expand/contract dan fresh/upgrade tests; recovery tidak tersedia |

---

## 38. External Dependencies dan Launch Blockers

Staging/production membutuhkan:

- actual Employee CSV, Manager CSV, dan Union JSON serta designated data owner;
- designated CARE Admin, Union credential owner, dan Manager mapping owner;
- GCP project, billing, Vertex/Agent Platform API access, service identity/ADC, IAM least privilege;
- approval model `gemini-3.7-flash`, default `global` location, terms/CDPA, dan retention posture;
- labeled Indonesian manufacturing AI evaluation dataset;
- VAPID key pair dan contact subject per environment;
- staging VM, deploy user, SSH known-hosts/key, DNS, ports, Caddy email, dan runtime secrets;
- production VM/domain/DNS/GitHub environment/runtime secrets;
- Android Chrome/Edge dan iOS/iPadOS Home Screen devices untuk UAT;
- written approval atas no-backup/no-DR, shared Union account, password policy, Admin Private access, dan permanent logical retention;
- operational owner untuk incident, deployment, storage capacity, access review, dan Vertex cost/quota.

Secret value, actual production PII, IP, dan private key dilarang ditulis pada repository documentation.

---

## 39. Release Readiness Checklist

V1 siap production bila:

1. seluruh acceptance criteria wajib lulus;
2. tidak ada unresolved Critical/High security finding;
3. AI evaluation dan live staging contract smoke lulus;
4. role/privacy/Private identity negative tests lulus;
5. PostgreSQL fresh dan previous-release upgrade lulus;
6. performance baseline lulus;
7. responsive real-device PWA/push/offline UAT lulus;
8. staging auto-deploy, release identity, smoke, dan rollback rehearsal lulus;
9. production domain/VM/DNS/secrets/Vertex/VAPID tersedia;
10. actual master import UAT lulus dan route uniqueness lengkap;
11. critical accepted risks disetujui secara tertulis;
12. incident/deployment/storage owner ditetapkan.

---

## 40. Keputusan Produk yang Dikunci

- Satu role-aware frontend surface.
- Lima area tetap.
- Employee/Manager/Union actual data diimpor melalui UI, bukan disimpan di Git.
- First login/reset memakai username/no.reg sebagai temporary password dan wajib change.
- Satu Safety Manager per area, satu Facility Manager per area, satu regular Manager per department.
- Work Difficulty route hanya berdasarkan department reporter.
- Private selalu ke Union dan anonymous terhadap Union/Admin.
- General bukan public feed.
- Union memakai satu shared account tanpa operator attribution.
- Gemini Vertex default `gemini-3.7-flash`, location `global`, `thinking_level=LOW`, threshold `0.75`.
- AI high-confidence read-only; failure/low-confidence wajib Manual Fallback reporter.
- Category priority Safety → Facility → Work Difficulty.
- Empat status saja; reopen adalah event menuju In Verification dengan PIC terakhir.
- Reassign hanya sebelum In Progress.
- Manager atau current handler dapat close dari In Progress; closure note dan foto wajib.
- Rating disimpan per closure cycle; rating 1–2 wajib feedback dan dapat reopen.
- Notification Center authoritative; Web Push best-effort.
- Gambar saja; media authorized dan sanitized.
- Offline mutation tidak didukung.
- Permanent logical retention tanpa backup/DR/HA.
- Single VM terpisah per environment.
- Implementation order wajib Backend Complete → Frontend Complete → production containerization/deployment; Docker PostgreSQL development/test adalah pengecualian yang dimulai bersama backend.
- Staging `care.qd-tmmin.site`; production domain external dependency.
- Push `staging` dan `main` menjadi trigger deployment environment masing-masing setelah checks/prerequisite.
