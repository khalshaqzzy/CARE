# ADR-0057: Patched OpenSSL Runtime and Scanner Feed Lag

- Status: Accepted
- Date: 30 September 2026

## Context

PR #60's dependency audit and filesystem scan were repaired by ADR-0045's
same-major dependency overrides. The next production container gate exposed
CVE-2026-84782 in the frozen API Debian 12 OpenSSL runtime. All application jobs
passed, but the release gate correctly rejected the container finding.

The [Debian security tracker](https://security-tracker.debian.org/tracker/CVE-2026-84782)
marks Bookworm's available security package as vulnerable and Trixie's
`3.5.7-1~deb13u3` as fixed by DSA-6531-1. The [OpenSSL advisory](https://openssl-library.org/news/secadv/20260929.txt)
fixes the upstream 3.5 line in 3.5.9. Stable Alpine v3.24 supplies `3.5.9-r0`.
Trivy's 30 September database still flags the fixed Debian backport without a
fixed version, so updating the binaries alone cannot pass that stale finding.

## Decision and implementation

The API runtime moves to digest-pinned Debian 13 distroless cc nonroot. A separate
digest-pinned Debian Trixie build stage downloads exactly `libssl3t64` and
`openssl-provider-legacy` at `3.5.7-1~deb13u3` through signed apt repositories.
Actual package files and their original control/md5sums metadata overlay the
runtime. No package manager, shell, signing bypass or invented package version
is introduced into the shipped image. Node 22.23.2 and the existing Debian
OpenSSL 3 Prisma engine continue to be built in the pinned Bookworm stage.

Both nginx runtimes and PostgreSQL pin `libcrypto3` and `libssl3` at the patched
stable Alpine `3.5.9-r0`. Caddy has no affected OpenSSL package.

Only the API scan receives `deploy/security/trivy-patched-openssl.rego`. This
policy matches exactly CVE-2026-84782, either of the two Debian package names,
and exactly the officially fixed installed version. Both the policy and the
registered exception expire after 7 October 2026 UTC. The exception validator
requires the matching registry entry and deadline. No CVE is added to the global
`.trivyignore`; unpatched versions, other package names, other findings and all
other image scans remain enforced. High/Critical thresholds and unfixed checks
remain unchanged.

## Rationale and alternatives

A real signed vendor patch is preferable to shipping the vulnerable Debian 12
library with a blanket CVE exception. Waiting for Debian 12 packages would leave
the release blocked indefinitely. Compiling OpenSSL independently would create
an unnecessary custom package supply chain. Moving to a full Node runtime would
abandon the existing shell-free runtime architecture. Debian 13 retains that
architecture and provides the official patch now.

The narrow expiring policy addresses a vendor-feed false positive, not acceptance
of an unpatched vulnerability. Exact version matching also prevents an old
runtime or a future unreviewed package from inheriting the exception.

## Consequences and risks

The newer runtime glibc and OpenSSL 3.5 require production-stack compatibility
checks for Node, Prisma migration, bootstrap and readiness. Security package
pins fail closed when repositories retire exact revisions. Rollbacks rebuild
retained source, so historical source may still have its original package pins;
that existing rollback tradeoff is recorded in ADR-0011. The policy expiry will
block validation unless the feed catches up and the policy/registry entry is
removed, or a new explicit review changes the deadline consistently.

## Validation and follow-up

The patched distroless probe passes Trivy with the scoped policy. The original
unpatched Debian 13 base fails for the same CVE with that same policy, verifying
that vulnerable binaries are not hidden. ARM64 production Compose build, migration,
bootstrap, routing/readiness/headers/non-root/isolation and persistence pass, as do
all five runtime image scans under the stated policy. The exact Debian package
stage also builds on AMD64. Hadolint, Actionlint, ShellCheck, deployment validators
and harness, registry/mismatched-expiry rejection, and application checks pass.
Capture reporting passes in an isolated rerun after a local shared-output race.
Hosted final-SHA acceptance remains required. Continued validation includes Hadolint,
Actionlint, ShellCheck, deployment harnesses and exception checks, production
Compose build/migration/bootstrap/routing/persistence, all five image scans and
all hosted jobs for the final candidate SHA. Remove the temporary policy and
registry entry once Trivy recognizes DSA-6531-1, no later than 7 October 2026.
