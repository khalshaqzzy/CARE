# CARE Session Handoff

| Atribut                 | Nilai                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Date                    | 25 Agustus 2026                                                                       |
| Current objective       | Remediate dan re-freeze backend CARE sesuai PRD v1.1 sebelum frontend dimulai         |
| Current phase           | Phase 6.1 `in_progress`                                                               |
| Backend Complete Gate   | Not passed                                                                            |
| Implementation status   | Phase 0–5 delivered under superseded v1.0 assumptions; source remediation belum mulai |
| Recommended next action | Design schema/capability/effective-master migration dan current-schema upgrade test   |

## Session Outcome

Sesi ini hanya mengubah dokumentasi kontrak dan roadmap; source code, database, runtime configuration, dan deployment tidak diubah.

Files changed:

- `.agent/PRD.md` — dinaikkan ke v1.1 dan diselaraskan dengan workbook organisasi, routing/capability, Union individual accounts, conditional Private identity, OpenAI Responses, location review, dashboard scopes, dan dual frontend.
- `.agent/implementationPhases.md` — Phase 0–5 dipertahankan `done` sebagai sejarah; Phase 6 dipecah menjadi remediation 6.1–6.6; frontend/deployment disusun ulang menjadi Phase 7–14.
- `.agent/sessionHandoff.md` — current state, gate, decisions, checks, dan next action disinkronkan.
- `docs/adr/0004-care-v1-1-organization-routing-ai-and-frontend.md` — keputusan v1.1 yang mensupersede bagian terkait ADR 0001/0003.

## Current Product and Technical Contract

- Workbook `.xlsx` authoritative memakai sheet `MFG + QD` dan tujuh header persis. Snapshot Agustus memiliki 7.018 karyawan, termasuk 38 Department Head, 250 Section Head, 4 Division Head, 8 Deputy/Acting Division Head, dan 1 Director; terdapat 12 named departments tanpa Department Head serta 188 rows dengan `Department=14`.
- Organization unit memakai composite `Directorat + Division + Department`. Department Head/Manager interchangeable; posisi dan workforce membership diturunkan dari monthly snapshot.
- Account kind, structural position, capability, dan route assignment dipisahkan. Setiap workforce account tetap Member; structural reader/default PIC/global PIC dapat menjadi capability tambahan.
- Named department tanpa Department Head dapat memperoleh default PIC dari active employee yang dipilih Admin. `Department=14` tidak mempunyai General route yang sah.
- Safety, Environment, dan Facility seluruh area memakai tepat satu global PIC dari active Department Head. Work Difficulty memakai Department Head/default PIC pada composite unit reporter.
- Section Head sepenuhnya diturunkan dari workbook; promote/transfer/remove manual dihapus.
- Union memakai tepat satu Head dan dua Officer yang dikelola Admin di luar workbook. Private selalu menuju Head, lalu dapat di-assign ke Officer sebelum `IN_PROGRESS`.
- Private identity consent immutable. Union mendapat anonymous DTO bila `Tidak`, atau nama/no.reg/division/department bila `Ya`; CARE Admin selalu dapat membaca profil lengkap secara read-only.
- AI beralih dari Gemini/Vertex ke official JavaScript SDK dan OpenAI-compatible Responses API (`responses.create`, `/responses`, Structured Outputs, `store:false`). Classification dan location review adalah contract terpisah.
- Aggregate, list/detail, dan action authorization dipisahkan. Leadership memperoleh General overview/detail read-only sesuai scope; Private tetap Union-only selain reporter dan CARE Admin.
- Workforce PWA berada di `care.qd-tmmin.site`; separate non-PWA Admin React app berada di `admin-ped.qd-tmmin.site` untuk staging. Keduanya memakai satu backend dan generated client bersama.

## Historical Delivery Evidence

Backend v1.0 implementation sebelumnya dikirim ke branch `staging` melalui commits `aecf72a`, `f2cb6a3`, `d65aa2d`, dan `a6ce5fb`. GitHub Actions run [32699084968](https://github.com/khalshaqzzy/CARE/actions/runs/32699084968) green untuk quality, secrets, dan CodeQL.

Implemented historical baseline mencakup monorepo/toolchain, Docker PostgreSQL/pgvector, NestJS/Prisma/OpenAPI, authentication/session/CSRF/throttle, imports, Voice/media/AI/routing, lifecycle/assignment/chat, closure/rating/reopen, dashboard, notification/outbox/Web Push, CI/security, dan 50.000-Voice performance fixtures.

Catatan penting: status delivered tersebut hanya membuktikan kontrak v1.0. Employee/Manager/Union imports, exclusive role model, per-area/category Manager routes, shared Union, Vertex adapter, old Private serializers, old dashboard scopes, 2.000-account seed, dan frontend placeholder adalah implementation debt yang wajib dimigrasikan dalam Phase 6. Status Phase 0–5 `done` tidak membuat behavior lama tetap normatif.

## Gate and Blockers

`Backend Complete Gate: not passed`.

Frontend Phase 7 tidak boleh dimulai sampai Phase 6.1–6.6 green. Blocker/gate items:

- current schema belum mempunyai capability/effective organization/route/consent/location/legacy-access model v1.1;
- XLSX monthly import, remediation queue, default/global PIC, dan three-Union-account provisioning belum diimplementasikan;
- routing, Union assignment, conditional identity, dan leadership/dashboard authorization masih memakai contract lama;
- Gemini/Vertex adapter belum diganti dengan OpenAI Responses dan location review belum tersedia;
- OpenAPI/client, migration upgrade, privacy/security, serta 10.000-account regression belum dire-freeze;
- live Responses classification/location smoke memerlukan `OPENAI_BASE_URL`, `OPENAI_MODEL`, dan `OPENAI_API_KEY` external runtime config pada Phase 6.4/6.6.

Ketiadaan OpenAI runtime config tidak menghalangi implementasi Phase 6.1–6.5, tetapi final Backend Complete Gate tidak boleh lulus tanpa live non-sensitive smoke.

## Next Recommended Action

Mulai Phase 6.1:

1. inventarisasi current Prisma schema, migrations, unique indexes, serializers, dan historical ownership fields;
2. rancang expand/contract schema untuk account kind, raw structural position, capability, effective organization/route, consent, location review, dan legacy handler;
3. tetapkan deterministic backfill/reconciliation rules yang mempertahankan seluruh ID, route owner, assignment, actor, event, closure, rating, notification, dan PIC historis;
4. buat current-schema-to-v1.1 upgrade fixture/test sebelum mengubah destructive constraint;
5. jangan memulai frontend atau menghapus legacy columns sampai compatibility readers/writers dan backfill verification green.

## Checks Run in This Documentation Session

- workbook shape/statistics diperiksa dengan spreadsheet tooling tanpa memodifikasi source workbook;
- PRD dan roadmap diaudit dengan targeted searches; istilah lama hanya tersisa pada historical/supersession/removal statements, bukan sebagai contract normatif;
- official OpenAI Responses API reference diverifikasi untuk `responses.create`, `/responses`, dan Structured Outputs;
- `pnpm exec prettier --check .agent/PRD.md .agent/implementationPhases.md .agent/sessionHandoff.md docs/adr/0004-care-v1-1-organization-routing-ai-and-frontend.md` — passed;
- `git diff --check` — passed;
- roadmap status scan — tepat satu subphase, Phase 6.1, berstatus `in_progress`.

Full source CI/backend tests tidak dijalankan karena sesi ini tidak mengubah source code, schema, dependency, workflow, atau runtime configuration. Tidak ada server, watcher, database container, atau background process yang dimulai pada sesi ini.
