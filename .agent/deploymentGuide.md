# Deployment Guide — CARE Staging

Dokumen ini adalah runbook operator untuk Phase 13. Scope aktif hanya staging. Push ke `main`
tetap menjalankan CI, tetapi `workflow_dispatch` deployment dan deployment production sengaja belum
dikonfigurasi. Production tidak boleh diaktifkan sebelum seluruh prerequisite Phase 14 tersedia dan
disetujui.

Runbook ini mengadaptasi pola operasional `supplier-henkaten` untuk dua origin CARE, lima runtime
image, satu API bersama, forward-only Prisma migration, live Responses validation, dan release
identity berbasis full Git SHA. Jangan menulis IP, credential, private key, endpoint/hash Web Push,
atau PII workforce ke repository maupun release evidence.

## 1. Topologi dan Batas Risiko

Satu VM Ubuntu 22.04 LTS menjalankan satu Compose project bernama `care-staging`:

- Caddy adalah satu-satunya service yang membuka host port TCP `80`/`443` dan UDP `443`;
- workforce web, Admin web, dan API hanya berada pada network Compose;
- PostgreSQL hanya berada pada internal data network dan tidak memiliki published port;
- workforce dan Admin memakai satu API serta satu PostgreSQL, tetapi session/cookie tetap host-scoped;
- data PostgreSQL, media, state Caddy, dan state deployment berada di `/opt/care/staging/shared`;
- source dan runtime env per SHA berada di `/opt/care/staging/releases`.

| Surface       | URL                                       |
| ------------- | ----------------------------------------- |
| Workforce PWA | `https://care.qd-tmmin.site`              |
| CARE Admin    | `https://admin-ped.qd-tmmin.site`         |
| API           | same-origin `/api/v1/*` pada kedua domain |

Responses API dan browser push provider adalah integrasi operasional aplikasi. Tidak ada callback
atau deployment service eksternal tambahan.

> **Critical Accepted Risk:** v1 tidak memiliki backup database/media, WAL archive/PITR, restore
> procedure, disaster recovery, replica, failover, RPO/RTO, atau high availability. Kehilangan
> VM/disk/volume atau operator error dapat menghilangkan data secara permanen. Code rollback bukan
> schema/data restore. CARE tidak boleh diklaim backed up, recoverable, atau highly available.

## 2. Layout Runtime

Hosted root dikunci sebagai berikut:

```text
/opt/care/staging/
  current -> releases/<full-sha>
  current_release
  previous_release
  deploy.lock
  incoming/
  releases/<full-sha>/
    .runtime.env
    .source.sha
  shared/
    postgres-data/
    media/
    caddy-data/
    caddy-config/
    deployment-state/highest_seen_run
```

`releases/<sha>/.runtime.env` wajib mode `0600`. Jangan menampilkan, menyalin ke evidence, atau
mengeksekusi file tersebut sebagai shell script. Jangan menghapus atau melakukan prune terhadap
subpath `shared`.

## 3. DNS dan Firewall

Buat dua record DNS yang menunjuk ke public IP VM staging yang sama:

| Record                    | Target               |
| ------------------------- | -------------------- |
| `care.qd-tmmin.site`      | public IP VM staging |
| `admin-ped.qd-tmmin.site` | public IP VM staging |

Verifikasi dari jaringan publik:

```bash
dig +short care.qd-tmmin.site
dig +short admin-ped.qd-tmmin.site
```

Kedua hasil harus beririsan dengan address `VM_HOST`. Buka port SSH final, TCP 80/443, dan UDP 443
pada firewall VM/provider. Jangan membuka port PostgreSQL, API, workforce web, atau Admin web.
Caddy baru dapat memperoleh sertifikat setelah DNS dan TCP 80/443 dapat dijangkau publik.

## 4. SSH Key Deployment

Buat key khusus CI pada workstation operator; jangan memakai key personal:

```bash
ssh-keygen -t ed25519 -a 100 -f ./care-staging-ci -C care-staging-ci
```

- isi private key lengkap menjadi GitHub environment secret `VM_SSH_PRIVATE_KEY`;
- berikan public key `care-staging-ci.pub` kepada operator bootstrap;
- simpan salinan private key di password manager yang disetujui; jangan commit ke repository.

Setelah bootstrap, ambil host key melalui jaringan terpercaya:

```bash
ssh-keyscan -p 22 -H VM_HOST > care-staging-known-hosts
ssh-keygen -lf care-staging-known-hosts
```

Ganti `22` bila memakai port lain. Cocokkan fingerprint dengan console/provider VM sebelum mengisi
`VM_SSH_KNOWN_HOSTS`. Workflow tidak boleh mengambil `ssh-keyscan` secara dinamis karena hal itu
menghilangkan verifikasi host identity.

## 5. Bootstrap VM

Requirement:

- VM baru Ubuntu 22.04 LTS;
- akses awal `root`/`sudo` melalui console atau key provider;
- Docker Engine 24+, Compose 2.20+, dan Buildx akan dipasang oleh script;
- minimum 5 GiB free disk saat preflight; sediakan kapasitas lebih besar untuk image dan data;
- public key deployment dan port SSH final sudah ditentukan.

Kirim script melalui akses awal VM:

```bash
scp deploy/scripts/bootstrap-vm.sh ubuntu@VM_HOST:/tmp/bootstrap-vm.sh
ssh ubuntu@VM_HOST
```

Validasi input dan OS dahulu, lalu jalankan bootstrap sebagai root. Ganti contoh user/key/port
dengan nilai aktual:

```bash
bash /tmp/bootstrap-vm.sh --check staging care-deploy \
  "ssh-ed25519 AAAA... care-staging-ci" 22

sudo bash /tmp/bootstrap-vm.sh staging care-deploy \
  "ssh-ed25519 AAAA... care-staging-ci" 22
```

Script idempotent tersebut memasang Docker dari repository resmi, membuat deploy user, memasukkan
user ke group Docker, membuat group `care-data` GID 2000, menyiapkan `/opt/care/staging`, memberi
`postgres-data` kepada UID/GID `70:70`, dan mengaktifkan UFW. Script hanya menerima `staging` dan
Ubuntu 22.04.

Putuskan sesi lalu login ulang agar membership group berlaku:

```bash
ssh -i ./care-staging-ci -p 22 care-deploy@VM_HOST
docker version
docker compose version
docker buildx version
id
test -w /opt/care/staging/incoming
test -w /opt/care/staging/shared/deployment-state
test "$(stat -c '%u' /opt/care/staging/shared/postgres-data)" = 70
```

## 6. GitHub Environment

Di repository GitHub buka **Settings → Environments**, lalu buat environment bernama tepat
`staging`.

Tambahkan environment secrets berikut:

| Secret                  | Isi                                                         |
| ----------------------- | ----------------------------------------------------------- |
| `VM_HOST`               | hostname atau IPv4 VM tanpa scheme/port                     |
| `VM_USER`               | deploy user, misalnya `care-deploy`                         |
| `VM_SSH_PRIVATE_KEY`    | private key OpenSSH lengkap                                 |
| `VM_SSH_KNOWN_HOSTS`    | output known-hosts yang fingerprint-nya telah diverifikasi  |
| `CADDY_EMAIL`           | email valid untuk ACME                                      |
| `POSTGRES_USER`         | identifier dotenv-safe, misalnya `care`                     |
| `POSTGRES_PASSWORD`     | random minimum 32 karakter                                  |
| `POSTGRES_DATABASE`     | identifier dotenv-safe, misalnya `care`                     |
| `SESSION_HASH_SECRET`   | random minimum 32 karakter                                  |
| `SESSION_CSRF_SECRET`   | random minimum 32 karakter dan berbeda                      |
| `AUTH_THROTTLE_SECRET`  | random minimum 32 karakter dan berbeda                      |
| `CURSOR_SIGNING_SECRET` | random minimum 32 karakter dan berbeda                      |
| `METRICS_TOKEN`         | random minimum 32 karakter dan berbeda                      |
| `CARE_ADMIN_USERNAME`   | username tunggal CARE Admin                                 |
| `CARE_ADMIN_PASSWORD`   | initial password minimum 12 karakter, berbeda dari username |
| `OPENAI_API_KEY`        | server-only provider key staging                            |
| `OPENAI_MODEL`          | model Responses API yang sudah disetujui                    |
| `OPENAI_BASE_URL`       | HTTPS base URL provider yang sudah disetujui                |
| `VAPID_SUBJECT`         | `mailto:` atau HTTPS contact subject                        |
| `VAPID_PUBLIC_KEY`      | public key dari CLI CARE                                    |
| `VAPID_PRIVATE_KEY`     | private key pasangan VAPID staging                          |

Optional environment secret:

| Secret                      | Isi                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `PUSH_CANARY_ENDPOINT_HASH` | SHA-256 lowercase dari satu endpoint subscription staging; kosongkan sebelum enrollment |

Tambahkan environment variables:

| Variable                  | Isi                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `VM_SSH_PORT`             | port SSH; bila kosong workflow memakai `22`                                              |
| `OPENAI_REASONING_EFFORT` | `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, atau `max`; kosong berarti `medium` |

Secret proteksi yang berbeda fungsi harus memiliki value berbeda. Untuk secret dotenv-safe:

```bash
openssl rand -base64 48 | tr '+/' '_-' | tr -d '=\n' | cut -c1-48
```

Buat VAPID key pair di terminal operator yang terkontrol, lalu langsung pindahkan nilainya ke secret
store:

```bash
pnpm vapid:generate -- --output /secure/operator/path/care-staging-vapid.env
```

Jangan menyimpan output tersebut di repository. Runtime renderer menolak placeholder, newline,
karakter dotenv yang tidak didukung, secret proteksi yang sama, URL non-HTTPS, dan VAPID subject
invalid. Domain, published port, Compose project, remote path, dan release SHA dikunci oleh workflow.

Rekomendasi branch protection `staging`:

- require pull request dan branch up-to-date;
- require status check **Release candidate gate**;
- block force push dan branch deletion;
- jangan menambahkan manual environment approval bila kontrak yang diinginkan tetap auto-deploy
  setelah gate hijau.

## 7. Trigger dan First Deployment

Pull request ke `staging` menjalankan seluruh gate tetapi tidak deploy. Hanya event `push` pada
branch `staging` yang masih menjadi HEAD terbaru dapat memanggil reusable deployment workflow.
Gunakan squash merge agar satu commit menjadi satu release candidate.

Sebelum push pertama, pastikan VM/bootstrap, DNS, GitHub environment, provider quota/privacy
approval, VAPID, dan semua required secrets tersedia. First release belum memiliki previous code
untuk dipulihkan; bila gagal, application surface dihentikan sedangkan PostgreSQL/media tetap ada.

```bash
git switch staging
git pull --ff-only
```

Pantau **Actions → CARE CI and Staging Delivery**, atau:

```bash
gh run list --branch staging --limit 10
gh run view RUN_ID --json status,conclusion,jobs,url
gh run view RUN_ID --log-failed
```

Urutan deployment:

1. seluruh quality, database, migration, browser, deployment, container, dan security job hijau;
2. `Release candidate gate` sukses dan candidate dicek masih menjadi HEAD;
3. exact SHA diarsipkan, checksum dan archive member divalidasi, lalu di-upload via strict SSH;
4. remote preflight memeriksa OS, Docker/Compose, disk, permission, Compose exposure, dan DNS;
5. PostgreSQL dimulai, lalu `prisma migrate deploy` dan idempotent Admin bootstrap;
6. API healthy, live Responses classification/location schema check sukses;
7. workforce/Admin web healthy, kemudian Caddy dimulai terakhir;
8. internal dan external two-origin smoke harus sukses sebelum pointer `current` diaktifkan.

Keberhasilan workflow berarti exact SHA telah lolos smoke dari VM dan GitHub runner. Bootstrap
Admin hanya membuat akun bila username belum ada dan tidak mencetak password. Perubahan secret
bootstrap pada deployment berikutnya tidak merotasi password akun yang sudah ada.

## 8. Verifikasi Setelah Deploy

Set `SHA` ke full 40-character SHA hasil merge:

```bash
SHA=0123456789abcdef0123456789abcdef01234567

curl -fsS https://care.qd-tmmin.site/release.json \
  | jq -e --arg sha "$SHA" '.application=="care-web-voice" and .releaseSha==$sha'
curl -fsS https://admin-ped.qd-tmmin.site/release.json \
  | jq -e --arg sha "$SHA" '.application=="care-web-admin" and .releaseSha==$sha'
curl -fsS https://admin-ped.qd-tmmin.site/ready \
  | jq -e --arg sha "$SHA" '.status=="ready" and .releaseSha==$sha'

deploy/scripts/smoke-check.sh "$SHA" \
  https://care.qd-tmmin.site \
  https://admin-ped.qd-tmmin.site
```

Login ke Admin origin menggunakan credential bootstrap, lalu segera ganti password melalui halaman
Account dan perbarui secret store sesuai prosedur operator. Lengkapi
`.agent/releaseExecutionChecklist.md`, termasuk:

- deep link kedua SPA, same-origin `/api/v1`, dan host-scoped auth/cookie isolation;
- HSTS, CSP, anti-framing, `nosniff`, Referrer-Policy, Permissions-Policy, dan cache policy;
- workforce manifest/service worker tersedia, sedangkan Admin manifest/service worker 404;
- semua long-running container non-root dan PostgreSQL tidak memiliki host port;
- live Responses, Admin bootstrap/import/remediation, Union/privacy/media, dan critical workforce
  journey memakai staging acceptance data.

Simpan evidence yang teredaksi. Jangan menyimpan business response body, PII, token, atau secret.

## 9. Release, Race Control, dan Retention

Ordering dilindungi oleh empat lapis:

- GitHub concurrency `deploy-staging` dengan `cancel-in-progress: false`;
- branch-head check saat job dimulai dan tepat sebelum SSH;
- satu VM `flock` untuk deploy, rollback, dan rehearsal;
- persistent high-water run number yang terikat pada SHA.

Run lebih rendah ditolak. Run yang sama hanya diterima untuk SHA yang sama. Jangan mengedit
`highest_seen_run` untuk memaksa candidate lama. `current` dan `current_release` hanya berubah setelah
smoke sukses. Retention mempertahankan current, previous, dan maksimal lima exact release; cleanup
hanya menghapus directory/tag SHA yang tervalidasi dan tidak pernah menyentuh shared state.

Untuk acceptance ordering, merge dua candidate berdekatan. Hasil akhir wajib SHA HEAD terbaru;
candidate lama boleh tercatat superseded, tetapi tidak boleh mengaktifkan SHA lama.

## 10. Migration dan Rollback

- Hosted deployment hanya menjalankan `prisma migrate deploy`.
- Migration wajib forward-only, expand/contract, dan backward-compatible dengan setidaknya satu
  retained code release sebelumnya.
- `prisma migrate reset`, down migration, database reset, atau destructive one-step migration
  dilarang.
- Migration failure tidak mencoba database rollback. Schema yang sudah berubah tidak dipulihkan.
- Rotasi `POSTGRES_PASSWORD` bukan secret-only change; role database dan runtime secret harus
  diubah terkoordinasi dengan rollback plan.

Manual code rollback ke SHA yang masih retained:

```bash
ssh -p 22 care-deploy@VM_HOST
bash /opt/care/staging/releases/TARGET_40_CHARACTER_SHA/deploy/scripts/remote-rollback.sh \
  staging TARGET_40_CHARACTER_SHA /opt/care/staging
```

Pastikan target kompatibel dengan schema yang telah maju, lalu jalankan external smoke. Code
rollback menghidupkan image/env lama terhadap PostgreSQL/media yang sama; tidak ada down migration
atau data restore.

## 11. Guarded Rollback Rehearsal

Setelah minimal dua release sehat tersedia, buka **Actions → CARE staging rollback rehearsal → Run
workflow**. Isi previous/current full SHA dan confirmation phrase:

```text
I_ACCEPT_STAGING_INTERRUPTION
```

Workflow memakai concurrency group `deploy-staging`, strict SSH, memverifikasi current SHA masih
HEAD `staging`, lalu script mengambil VM lock yang sama. Command VM ekuivalen berikut hanya untuk
diagnosis; evidence rutin harus memakai guarded GitHub workflow:

```bash
bash /opt/care/staging/current/deploy/scripts/rehearse-staging.sh \
  PREVIOUS_40_CHARACTER_SHA CURRENT_40_CHARACTER_SHA \
  /opt/care/staging VM_HOST I_ACCEPT_STAGING_INTERRUPTION
```

Rehearsal mencatat identitas cluster PostgreSQL, membuat media sentinel, mengaktifkan previous code,
mencoba current release dengan forced smoke failure, membuktikan automatic rollback, mengembalikan
current release, dan memverifikasi persistence. Jalankan hanya dalam maintenance window staging.
Rehearsal tidak pernah membalik migration.

## 12. Manual Web Push Canary

Canary bersifat optional operational evidence. Ia bukan automated test, deployment smoke, atau
syarat auto-deploy.

1. Login ke workforce PWA staging pada device/browser yang ditunjuk dan aktifkan notification.
2. Pilih tepat satu active staging subscription melalui lookup operasional yang berizin.
3. Simpan hanya SHA-256 lowercase endpoint tersebut sebagai `PUSH_CANARY_ENDPOINT_HASH`; jangan
   menyalin raw endpoint ke Git/docs/evidence.
4. Deploy candidate berikutnya agar hash masuk ke `.runtime.env` release baru.
5. Jalankan manual pada VM:

```bash
cd /opt/care/staging/current
docker compose --env-file .runtime.env \
  -f deploy/compose/docker-compose.remote.yml \
  --profile operations run --rm push-canary
```

Sukses berarti provider menerima generic redacted payload dan `lastSuccessAt` subscription lebih
baru dari waktu mulai operasi; visible notification bukan kriterianya. Missing/inactive/duplicate,
provider rejection, atau timeout berarti gagal. Respons 404/410 menonaktifkan subscription dan
memerlukan re-enrollment sebelum retry.

## 13. Secret Rotation

Rotasi satu concern per waktu dan pertahankan nilai lama sampai replacement tervalidasi:

- SSH: tambahkan key baru, verifikasi login, ganti private key/known-hosts bila relevan, deploy,
  kemudian hapus key lama;
- session/CSRF/throttle/cursor: ganti secret lalu deploy; rencanakan invalidasi session/token;
- database: ubah password role PostgreSQL dan GitHub secret secara terkoordinasi;
- VAPID: public/private key harus berpasangan; subscription lama harus re-enroll;
- OpenAI base/model/key: wajib melewati live schema validation serta approval provider/privacy;
- Admin: ganti password melalui halaman Account. Bootstrap bersifat create-only; mengubah
  `CARE_ADMIN_PASSWORD` saja tidak merotasi akun existing.

Jangan mencetak secret di terminal bersama, workflow log, issue, pull request, atau evidence.

## 14. Diagnostics

Login ke VM, lalu jalankan read-only diagnostics:

```bash
BASE=/opt/care/staging
cd "$BASE/current"

cat "$BASE/current_release"
readlink "$BASE/current"
docker compose --env-file .runtime.env \
  -f deploy/compose/docker-compose.remote.yml ps
docker compose --env-file .runtime.env \
  -f deploy/compose/docker-compose.remote.yml logs --tail=200 api caddy postgres
df -h "$BASE"
sudo ufw status verbose
docker version
docker compose version
```

Jangan menampilkan `.runtime.env`. State release yang aman untuk diperiksa:

```bash
ls -la /opt/care/staging/releases
cat /opt/care/staging/shared/deployment-state/highest_seen_run
```

Common failures:

- **superseded candidate:** HEAD `staging` sudah berubah; biarkan candidate terbaru berjalan;
- **lock contention:** deploy/rollback/rehearsal lain aktif; tunggu dan jangan hapus lock;
- **checksum/archive:** perlakukan upload sebagai tidak terpercaya; jangan extract manual;
- **DNS/TLS:** perbaiki record, propagasi, firewall, atau ACME reachability;
- **runtime env:** perbaiki GitHub secret/variable yang disebut; jangan melemahkan validator;
- **disk/ownership/PostgreSQL:** tambah disk atau perbaiki permission; jangan hapus data existing;
- **migration:** simpan log dan perbaiki dengan forward migration baru; jangan reset/down migrate;
- **live Responses:** periksa endpoint/model/key/quota/schema tanpa mencetak payload/secret;
- **API/web/Caddy/smoke:** periksa exact candidate log, health, route, header, port, dan SHA;
- **rollback:** biarkan database/media tetap utuh dan review code/schema compatibility;
- **push canary:** verifikasi enrollment/hash/VAPID/provider; kegagalannya tidak mengubah hasil
  automatic deployment.

## 15. Acceptance Setelah Bootstrap

Phase 13 hanya boleh ditandai `done` setelah evidence berikut tersimpan sesuai
`.agent/releaseExecutionChecklist.md`:

1. first deployment exact SHA dan kedua HTTPS origin sukses;
2. bootstrap Admin/login/change-password dan acceptance-data critical journeys terbukti;
3. release kedua membuktikan upgrade migration;
4. dua candidate berdekatan tidak menghasilkan out-of-order activation;
5. controlled failed smoke melakukan automatic code rollback;
6. identitas database dan media sentinel bertahan setelah restart/rehearsal;
7. GitHub environment deployment serta seluruh quality/security gate hijau.

Reusable workflow memiliki jalur internal untuk parameter `production`, tetapi production activation
tetap deferred: tidak ada caller `main`, manual deployment dispatch, production domain wiring, atau
klaim deployment production. Phase 14 tetap `pending` sampai seluruh external dependency, UAT,
operational ownership, dan written Critical Accepted Risk approval lengkap.

## 16. Local Full-stack (Bukan Hosted Deployment)

Untuk production-like local verification tanpa DNS/TLS publik:

```bash
cp .env.local.example .env.local # hanya bila .env.local belum ada
pnpm local:up
pnpm local:status
pnpm local:logs
pnpm local:down
```

Origin lokal adalah `http://care.localhost:8080` dan `http://admin.care.localhost:8080`.
`.env.local` wajib mode `0600` dan ignored. OpenAI/VAPID kosong secara default sehingga integration
tersebut dilaporkan degraded tetapi stack lokal tetap ready. PostgreSQL memakai named volume
`care-local-postgres-data`; media/Caddy state berada di ignored `local-data/fullstack` dan dipertahankan
oleh `pnpm local:down`.
