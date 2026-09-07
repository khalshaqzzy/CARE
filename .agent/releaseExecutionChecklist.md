# CARE Release Execution Checklist

Use one copy of this checklist per staging candidate/rehearsal. Record links, timestamps, SHAs, run numbers, and redacted outcomes only. Never record IP addresses, credentials, private keys, push endpoints, endpoint hashes, or workforce PII.

## Candidate Identity

- [ ] Environment is `staging`.
- [ ] Branch is `staging` and candidate is its current full 40-character SHA.
- [ ] GitHub run URL/number/attempt recorded in the approved evidence store.
- [ ] Workforce target is `https://care.qd-tmmin.site`.
- [ ] Admin target is `https://admin-ped.qd-tmmin.site`.
- [ ] VM bootstrap `--check` passes and runtime env file is mode `0600`.
- [ ] DNS, TLS reachability, disk space, Docker, Compose, Buildx, paths, groups, and bind-mount permissions pass preflight.

## CI Release Gate

- [ ] Quality/contracts/build green.
- [ ] Workforce app dan custom worker dibangun dengan target `safari11.3`; compatibility bootstrap external berada sebelum module entry dan tidak ada inline script CSP exception.
- [ ] `pnpm pwa:compat-check` lulus: entry/worker bebas syntax yang tidak dapat diparse Safari 11.3 dan gzip bootstrap-app tidak melewati budget +15% tanpa ADR/review.
- [ ] Chromium, PWA Chromium, current WebKit legacy-capability emulation, visual, dan full-stack browser projects yang relevan hijau.
- [ ] Evidence menyatakan iOS 11.3 diuji melalui build/probe/artifact/current-WebKit emulation; real-device iOS 11.3 tidak diklaim sebagai acceptance evidence.
- [ ] PostgreSQL integration, security, performance, and reconciliation green.
- [ ] Fresh migration and previous-SHA-to-current migration/status green.
- [ ] Mocked Playwright and serial full-stack Playwright green.
- [ ] actionlint, ShellCheck, Hadolint, bash syntax, bootstrap check, and deployment harness green.
- [ ] Production Compose/routing/non-root/persistence acceptance green.
- [ ] Gitleaks, dependency audit/review, CodeQL, Trivy filesystem, and every runtime image green with no unresolved High/Critical finding.
- [ ] `release-gate` is `success`; no required job is failed, cancelled, or skipped.
- [ ] Candidate remained branch HEAD at both freshness checks.

## Automatic Staging Deployment

- [ ] Archive checksum was verified before extraction and safe-member validation passed.
- [ ] Remote `flock` was acquired; high-water run/SHA checks accepted the candidate.
- [ ] PostgreSQL healthy; forward-only migration completed; Admin bootstrap completed without credential output.
- [ ] API exact-SHA readiness passed.
- [ ] Live DeepSeek Chat Completions classification and location function schemas passed.
- [x] 1 September 2026: independent `dx-2` Granite stack, `inference.qd-tmmin.site` tunnel route, unauthenticated 401, authenticated model list, and exact-one classification/location calls passed; this stack was not built by CARE deploy. Granite retains named forcing; DeepSeek thinking uses its documented tool mode without named `tool_choice` and remains fail-closed.
- [ ] Workforce, Admin, and Caddy became healthy in order.
- [ ] Internal and external two-origin smoke passed.
- [ ] `current` and `current_release` changed only after smoke success.
- [ ] Active/previous release identity and retention result recorded.

## Hosted Verification

- [ ] Workforce `/release.json` contains `care-web-voice` and exact candidate SHA.
- [ ] Admin `/release.json` contains `care-web-admin` and exact candidate SHA.
- [ ] `/health` and `/ready` pass on both hosts; `/ready.releaseSha` is exact.
- [ ] Workforce/Admin root and representative deep links return the correct SPA.
- [ ] Same-origin `/api/v1` proxy works; unauthenticated endpoints enforce expected status.
- [ ] TLS, HSTS, CSP, anti-frame, `nosniff`, Referrer-Policy, Permissions-Policy, and server-header removal pass.
- [ ] Hashed assets are immutable; HTML and `/release.json` are `no-store`; workforce PWA files are not stale-cached; Admin manifest/service worker return 404.
- [ ] Session/CSRF cookies are secure and host-scoped; login state does not cross origins.
- [ ] PostgreSQL is not externally reachable and media/API responses are not publicly cached.
- [ ] Bootstrap/import/remediation/Union/privacy/media and critical workforce/Admin journeys pass using staging acceptance data.

## Optional Manual Web Push Canary

This section is operational evidence only. It is not an automated test, deployment smoke, or auto-deploy gate.

- [ ] A designated staging PWA installation is enrolled and its active subscription hash is configured outside Git.
- [ ] Start timestamp recorded without endpoint/subscription data.
- [ ] From the active release directory, operator ran the `push-canary` Compose profile manually.
- [ ] Provider accepted the generic redacted payload.
- [ ] Selected subscription `lastSuccessAt` is strictly later than the start timestamp.
- [ ] Any 404/410 subscription was re-enrolled before relying on later canary evidence.

## Rollback Rehearsal (after Two Releases Exist)

- [ ] Rehearsal was dispatched through the guarded GitHub workflow and serialized by concurrency group `deploy-staging`.
- [ ] Guard phrase and expected previous/current SHAs were reviewed by the operator.
- [ ] PostgreSQL system identifier and media sentinel were recorded before rehearsal.
- [ ] Previous release activation succeeded without database rollback.
- [ ] Current candidate was attempted with forced smoke failure.
- [ ] Automatic rollback restored the previous code SHA and did not activate the failed candidate.
- [ ] Original current release was restored and exact SHA verified.
- [ ] PostgreSQL identifier and media sentinel are unchanged.
- [ ] Migration status remains applied/healthy; no reset/down migration occurred.
- [ ] Overlapping/stale candidate test proves the lower run cannot overwrite the higher run.

## Closeout

- [ ] Evidence contains no secret, subscription identifier, IP, private key, credential, or PII.
- [ ] Failures and remediation commits/reruns are linked.
- [ ] Phase status was updated only from completed evidence.
- [ ] Phase 13 may be marked `done` only after automatic deployment, hosted verification, critical journeys, persistence, ordering, and rollback rehearsal all pass.
- [ ] Delivery Complete Gate remains open until production readiness and all PRD release criteria pass.
