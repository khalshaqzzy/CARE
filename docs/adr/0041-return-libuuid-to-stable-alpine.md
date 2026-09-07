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
