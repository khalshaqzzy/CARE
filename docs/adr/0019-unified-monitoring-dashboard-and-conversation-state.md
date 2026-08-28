# ADR-0019: Unified Monitoring, Leadership Dashboard, and Conversation State

| Atribut    | Nilai                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Status     | Accepted                                                                                        |
| Tanggal    | 28 Agustus 2026                                                                                 |
| Konteks    | PRD v1.1 §6, §11, §15–16, §18, §21; workforce PWA dan Voice API                                 |
| Supersedes | Melengkapi ADR-0009, ADR-0012, dan ADR-0018; tidak mengubah privacy boundary yang sudah dikunci |

## 1. Konteks

Permukaan workforce sebelumnya memisahkan General browse dari responder inbox,
tidak memberi leadership satu workspace monitoring yang konsisten, dan hanya
menyajikan dashboard aggregate dasar. Label Riwayat juga tidak menjelaskan bahwa
daftar tersebut hanya memuat Voice milik reporter. Pada detail Voice, frontend
selalu mencoba merender percakapan setelah Open, sedangkan backend belum memiliki
kontrak eksplisit untuk membedakan room yang belum tersedia, room aktif, dan
history read-only. Akibatnya direct Proceed dari Open dapat terlihat seolah-olah
memiliki chat meskipun conversation belum pernah dibuat.

Reference `.agent/design-images/design.jpg` dan temuan pada Account/Push Settings
menunjukkan kebutuhan bahasa visual workforce yang lebih konsisten: cobalt hero,
surface bertingkat, typography terkendali, kartu rapat, filter modern, dan dock
mobile yang aman terhadap safe area.

## 2. Keputusan

### 2.1 Navigasi dan workspace monitoring

- Semua akun workforce mempertahankan capability Member dan memperoleh Voice
  Saya pada `/history`. Private Voice milik actor lain tidak pernah masuk
  monitoring. Union tidak memperoleh Voice Saya.
- Mobile Member memakai Beranda, Buat, Voice Saya, Lainnya. Role monitoring
  menambahkan Voice Member sebelum Buat. Lainnya membuka sheet Notifikasi/Akun.
  Desktop menampilkan seluruh destination secara langsung. Union mempertahankan
  lima destination yang sudah dikunci ADR-0018.
- `/work-items` menjadi workspace Voice Member tunggal. Manager melihat route
  scope yang dimiliki dan Section Head assigned-only; keduanya hanya melihat
  action dari `availableActions`. Division/Deputy melihat detail divisinya dan
  Director seluruh General secara read-only. `/general` workforce mengarah ke
  workspace ini; Union tetap memakai General read-only.
- Default workspace adalah active Voice, dengan Closed/All, search, status,
  severity, category, area, handler, date range, cursor pagination, dan state URL.
  `GET /voices/monitoring-options` hanya mengembalikan handler dari scope actor.

### 2.2 Dashboard

- Manager dan leadership memakai aggregate backend yang sudah memisahkan overview
  dari detail scope. Default rentang adalah 30 hari; tersedia 90 hari, tahun
  berjalan, semua waktu, custom date, area, category, severity, dan status.
- Presentasi memuat KPI total/active/verification/progress/closed/critical,
  segmented status, severity/category bars, SVG line/area trend, ranked
  organization bars, nilai tekstual, last-updated, dan suppression explanation.
- Chart diimplementasikan internal dan accessible tanpa dependency chart baru.
  Aggregate tidak membawa ID, judul, reporter, attachment, media, atau chat.

### 2.3 Conversation state

Detail Voice menambahkan enum server-authoritative:

- `UNAVAILABLE`: Open, atau In Progress yang belum pernah memiliki conversation;
- `ACTIVE`: In Verification untuk actor yang boleh mengirim, atau In Progress
  dengan conversation dan izin message;
- `READ_ONLY`: actor hanya boleh membaca, termasuk Closed yang memiliki history.

`MESSAGE` tidak tersedia pada Open. Assign membuka empty room secara logis tanpa
insert database; message pertama membuat Conversation melalui upsert. Ask membuat
message dan conversation lalu masuk In Verification. Direct Proceed dari Open
tidak membuat room. Endpoint baca dan kirim message menegakkan enum yang sama,
sehingga UI bukan security boundary. Closed mempertahankan history tanpa composer.

### 2.4 Workforce visual language

Polish diterapkan di scope stylesheet workforce dan `/design`: compact page
headers, cobalt identity surfaces, tinted cards, consistent spacing, filter/action
bars responsif, focus/motion refinement, serta state loading/error/empty/offline.
Account menampilkan no.reg dan organisasi yang manusiawi tanpa menjadikan UUID
snapshot sebagai informasi utama; session card tidak mengarang timestamp expiry.
Push degraded state dibuat ringkas dan proporsional. Shared `@care/ui` tidak
diubah, sehingga Admin tidak menerima regresi visual dari pekerjaan ini.

## 3. Kontrak API

- `GET /voices` dan `GET /work-items`: additive `statusGroup=ACTIVE|CLOSED|ALL`;
  kombinasi dengan `status` ditolak. Request lama tanpa field tetap kompatibel.
- `GET /work-items`: additive filter `handler`.
- `GET /voices/monitoring-options`: daftar `{id, displayName}` ter-scope.
- Detail audience Voice: additive required `conversationState`.
- OpenAPI dan `@care/contracts` diregenerasi; tidak ada migration database.

## 4. Konsekuensi

- Aggregate dan list dapat berbeda jumlah karena policy scope dan suppression;
  UI wajib menjelaskan perbedaan itu dan tidak mencoba merekonstruksi aggregate
  dari daftar detail.
- Leadership mendapat route monitoring tetapi tidak mutation affordance.
- ConversationPanel hanya menerima `ACTIVE` atau `READ_ONLY`; parent tidak
  merender atau meminta messages ketika state `UNAVAILABLE`.
- URL `/history` dan request lama tetap kompatibel, tetapi label produk berubah.
- Baseline visual workforce bertambah untuk Manager dashboard, Voice Member,
  Account, Push Settings, dan active conversation.

## 5. Validasi

Kontrak dilindungi unit test action/conversation state, range dan navigation
mapping; PostgreSQL integration lifecycle membuktikan Open/direct Proceed tanpa
room, Assign empty active room, first-message upsert, continuation In Progress,
dan Closed read-only. Playwright mencakup navigation, workspace/detail/actions,
axe, keyboard, reduced-motion, 360/768/1440 overflow, serta baseline visual baru.
Hasil parity final dicatat pada `.agent/sessionHandoff.md`.
