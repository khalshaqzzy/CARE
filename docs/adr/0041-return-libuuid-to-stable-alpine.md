# ADR-0041: Return libuuid Pin to Stable Alpine

- Status: Accepted
- Date: 6 September 2026

## Context

The production PostgreSQL and nginx runtime images temporarily installed `libuuid=2.42.3-r0` from a tagged Alpine edge repository because the pinned Alpine v3.24 base did not yet expose a patched package consistently on Linux x64 and ARM64. That exact edge revision later disappeared. A production Compose build with fresh package indexes consequently failed before application images could be validated.

Package probes against the pinned PostgreSQL and nginx Alpine bases now show `libuuid=2.42.3-r1` in the stable v3.24 main repository for both `linux/amd64` and `linux/arm64`.

## Decision

The PostgreSQL, workforce nginx, and Admin nginx runtime layers pin `libuuid=2.42.3-r1` from their existing stable repository. The temporary tagged edge repository is removed. The other explicit patched-library pins and every base-image digest remain unchanged.

## Rationale

An exact stable-repository pin restores reproducible builds while minimizing package-source trust and avoiding unrelated dependency upgrades. Applying the same revision to all three affected runtimes keeps local ARM64 development and hosted x64 CI aligned.

## Consequences

- Production builds no longer depend on the rolling edge repository or a removed package revision.
- Future stable package revision changes remain fail-closed and require an explicit reviewed update.
- Runtime image and Trivy checks are required after this change because it affects shipped container packages.

## Validation

- Probe stable package availability on Linux x64 and ARM64.
- Run Hadolint on all Dockerfiles.
- Build the production Compose images with fresh package indexes.
- Verify migration, bootstrap, routing, headers, non-root users, private database exposure, and persistence across restart.
- Scan the repository and all production runtime images for High/Critical vulnerabilities using the committed exception policy.

## 24 September 2026: libexpat stable mirror rollover

The staging container gate failed while building both nginx runtimes after Alpine
replaced the exact `libexpat=2.8.4-r0` revision. The CDN index reached by the
runner exposed only `2.8.3-r0`, so retaining the patch requirement correctly
stopped the build before release. The web images now pin the newer stable
`libexpat=2.8.5-r0` and add Alpine's `dl-4` v3.24 main mirror alongside the
base repository. The mirror supplies the same signed stable packages when a
CDN edge has a stale index. The other package pins and image digests remain
unchanged.

The exact pin continues to fail closed when that revision is retired. A future
rollover still needs an explicit version review and runtime vulnerability scan.
The package installation was verified on the pinned nginx base for both
`linux/amd64` and `linux/arm64`; hosted container and Trivy gates remain the
release acceptance checks.

## 21 October 2026: libexpat 2.9.0 rollover

The container gate failed again because Alpine v3.24 main retired
`libexpat=2.8.5-r0`; both the CDN and the `dl-4` mirror index now list only
`2.9.0-r0`. Both web images pin `libexpat=2.9.0-r0`. Trivy then reported
CVE-2026-88806 (High) in the base image's `libx11` 1.8.13-r0, so both images
also pin `libx11=1.8.14-r0`. The other pins are still present in the index and
stay unchanged. The install was verified on the pinned
nginx base (`linux/amd64`); the hosted container and Trivy gates remain the
release checks.

## 27 October 2026: brotli and curl

Trivy reported CVE-2026-111497 (High) in the base image's `brotli-libs`
1.2.0-r1 and CVE-2026-92392 (High) in `curl`/`libcurl` 8.21.0-r0. Both web
images pin `brotli-libs=1.2.1-r0`, `curl=8.23.0-r0` and `libcurl=8.23.0-r0`.
A local Trivy 0.70.0 scan of the pinned nginx base, the Postgres runtime base
and the Caddy image reports 0 High/Critical.

## 28 October 2026: go-jose in the Caddy binary

The staging run for `39c7450` failed the Caddy image scan: Trivy reported
CVE-2026-116587 (High, denial of service when parsing JWKs that contain RSA
keys) in two modules compiled into `/usr/bin/caddy`:

- `github.com/go-jose/go-jose/v4` 4.1.4, used by ACME (`mholt/acmez`), OIDC and
  gRPC. A fixed release exists, and `deploy/caddy/Dockerfile` now requires
  `v4.1.6` alongside the existing module pins.
- `github.com/go-jose/go-jose/v3` 3.0.5, reached only through Caddy's PKI app
  (`modules/standard` → `caddypki` → `smallstep/certificates` →
  `go.step.sm/crypto/jose`). No fixed v3 release exists.

The PKI app cannot be dropped from the build: Caddy issues local certificates
for `localhost` and IP origins through it, which the production-like local
stack relies on. The deployed Caddyfile configures no `acme_server`, no `pki`
app and no internal issuer, so the v3 JWK parsing is not reachable from the
served routes. The CVE is therefore registered as the first exact entry in
`.trivyignore`, with its rationale and an expiry of 31 December 2026 in
`.agent/securityExceptions.json`, as the exception policy requires. Trivy reads
`.trivyignore` from the workspace root for every scan in the container job.

Before the expiry, the entry is removed once a fixed v3 is released or Caddy no
longer depends on v3, and re-justified otherwise.

## 3 November 2026: libexpat 2.10.0 rollover

The staging run for `4debef3` (PR #123) and its pull-request run failed in
"Production containers and routing": `apk add` in both nginx runtimes could
not select `libexpat=2.9.0-r0`, because Alpine v3.24 main had replaced it with
`2.10.0-r0`, and the CDN and `dl-4` indexes no longer listed the old revision.
The fail-closed pin stopped the build before release, so staging kept serving
`81c4410`. Both web images now pin `libexpat=2.10.0-r0`. Every other pin
(`libcrypto3`, `libssl3`, `libuuid`, `pcre2`, `tiff`, `libx11`, `brotli-libs`,
`curl`, `libcurl`) is still the current index revision and stays unchanged.

The full pinned `apk add` was run on the pinned nginx base (`linux/amd64`)
against the `dl-4` repository URL used by the Dockerfiles. A local Trivy 0.70.0
scan of that patched base with the CI flags (vulnerabilities, High/Critical,
unfixed included) reports 0 findings. The hosted container and Trivy gates
remain the release checks.

## 7 November 2026: musl regcomp overflow

The pull-request run for `88a627b` (PR #129) failed the web-voice image scan:
Trivy reported CVE-2026-107891 (High, integer overflow in `regcomp`) in `musl`
and `musl-utils` 1.2.6-r2, fixed in 1.2.6-r3. The Postgres runtime base ships
the same revision. Both web images and the Postgres runtime now pin
`musl=1.2.6-r3` and `musl-utils=1.2.6-r3` alongside the existing pins. A local
Trivy 0.70.0 scan (vulnerabilities, High/Critical, unfixed included, with the
repository `.trivyignore`) of the pinned nginx base and the pinned Postgres
runtime base reports 0 findings. The hosted container and Trivy gates remain
the release checks.

The following run (`dd6e3e3`) passed both web images and Postgres and failed the
Caddy scan: CVE-2026-78661 (High, denial of service in `golang.org/x/net/html`)
in `golang.org/x/net` v0.60.0, fixed in 0.62.0. The Caddy build now pins
`golang.org/x/net@v0.62.0`, which requires `golang.org/x/crypto@v0.58.0` and
`golang.org/x/text@v0.43.0`, so those pins move too. The rebuilt image reports
Caddy v2.11.4, validates the production Caddyfile, and a local Trivy 0.70.0 scan
with the repository `.trivyignore` reports 0 High/Critical.

## 12 November 2026: libxslt and krb5-libs

The pull-request run for `8cf0427` (PR #135) failed the web-voice image scan:
Trivy reported CVE-2026-87636 and CVE-2026-9947 (High, XML handling) in
`libxslt` 1.1.43-r3, fixed in 1.1.43-r4. The same `staging` commit had passed
the gate on 10 November, so the findings are new advisories against the frozen
base images, not a regression in application code. The scan stops at the first
failing image, so the remaining Alpine runtimes were checked locally. The nginx
base carries the same `libxslt` revision. The Postgres runtime base carries it
too, plus `krb5-libs` 1.22.2-r1 with 16 High findings (including
CVE-2026-107364, CVE-2026-112315 and CVE-2026-112316), all fixed in 1.22.3-r0.
The nginx base does not ship `krb5-libs`, and the distroless Caddy runtime has
neither package.

Both web images now pin `libxslt=1.1.43-r4`, and the Postgres runtime pins
`libxslt=1.1.43-r4` and `krb5-libs=1.22.3-r0`, alongside the existing pins.
Every other pin is unchanged. The full pinned `apk add` was run on the pinned
nginx base and the pinned Postgres runtime base (`linux/amd64`). Local Trivy
0.70.0 scans of both patched bases (vulnerabilities, High/Critical, unfixed
included, with the repository `.trivyignore`) report 0 findings, and PostgreSQL
16.15 still starts its binary. The hosted container and Trivy gates remain the
release checks.
