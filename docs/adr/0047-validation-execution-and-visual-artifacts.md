# ADR-0047: Validation execution and visual inspection artifacts

Status: Accepted; shared validation, capture artifacts and CI job separation implemented locally
Date: 2026-09-10

## Context and evidence

The inspected staging checkout is `fb55191c6e3358d2a8fc60c1499069bf1560b8d6`.
The working tree was clean before this analysis. Hosted run
[34323788233](https://github.com/khalshaqzzy/CARE/actions/runs/34323788233)
passed every required job and staging deployment. Earlier handoff statements
about pending Caddy remediation are therefore historical.

Four successful runs were sampled: 34323788233, 34321661515, 34313869382 and 34302179367. Quality duration was 599, 519, 552 and 581 seconds, respectively;
container validation was 320, 257, 278 and 249 seconds. These are hosted step/job
durations, not estimates from the local machine. Queue delays are not included.

Latest successful run:

| Work                                   |           Seconds | Observation                                                        |
| -------------------------------------- | ----------------: | ------------------------------------------------------------------ |
| Quality job                            |               599 | Dominant pre-deployment path; almost all steps serial              |
| Browser tests                          |               212 | 310 tests using two workers, including visual tests                |
| Integration                            |               111 | 88 tests; organization-routing file alone took 96.5 seconds        |
| Browser installation                   |                45 | Chromium and WebKit installed together                             |
| Lint / typecheck / unit / build        | 29 / 22 / 13 / 24 | Independent checks and partially overlapping compilation           |
| Fullstack                              |                23 | Five tests, one worker, shared mutable database                    |
| Container job                          |               320 | Already parallel with quality                                      |
| Container build/start                  |               193 | No persistent external BuildKit cache configured                   |
| Six Trivy steps                        |          99 total | Filesystem plus five images, sequential                            |
| Migration release                      |                57 | Already parallel; distinct upgrade contract                        |
| Deployment-script quality              |                45 | Already parallel                                                   |
| CodeQL / secrets / dependency security |      93 / 21 / 32 | Already parallel                                                   |
| Staging deployment                     |               585 | Separate from CI: upload 133 seconds, remote operation 433 seconds |

The organization-routing integration includes real 7,018-row XLSX and
10,000-account CSV imports, query-count bounds, session revocation, and injected
rollback assertions. It is useful coverage, not an arbitrary sleep to remove.
Several integration files truncate shared tables; `fileParallelism: false` is
intentional. Fullstack similarly uses one database and automatic global seeding.

Tracked files total approximately 74.5 MB uncompressed, including approximately
69.8 MB of PNGs. Screenshot directories account for approximately 40 MB on disk.
The deployment workflow archives the entire Git tree. Docker build contexts
already exclude `e2e`, so removing snapshots would primarily affect source
archive/checkout/storage, not those Docker contexts. No upload-time saving is
claimed from file size alone.

## Implementation scope

The accepted implementation covers native capture and artifact galleries, shared
local/CI task definitions, removal of exact duplicate checks, and independent CI
jobs. External BuildKit caches, browser-ready images, parallel Trivy scanning,
image promotion and deployment archive changes are deferred. Existing container
and deployment jobs remain unchanged. No hosted speedup is claimed before a new run.

Implemented files and behavior:

- `scripts/validation/run.mjs` schedules shared prerequisites once per invocation,
  collects bounded parallel static-task failures and cleans up a local test database.
  `plan.mjs` expands unknown/shared local inputs conservatively. No cross-run test
  result cache is implemented; repeat only after relevant input changes.
- `verify:local --plan [--base=ref]` exposes scope before running. No base means
  working-tree changes; `--base` adds committed changes since the merge base.
  `verify:repro` runs in an already provisioned Linux shell; it does not create a
  Linux container or install system dependencies automatically.
- The build job verifies generated contracts, cleans app output, typechecks all
  existing scopes, emits the API, bundles both Vite apps and checks PWA compatibility.
  A source SHA/content and output-checksum manifest is verified before browser use.
  Generated contract verification compares before/after generation bytes, allowing
  intentional working-tree updates without weakening clean-checkout CI drift checks.
  API typechecking of scripts/tests remains intact. Default `pnpm build` is unchanged.
- CI static quality, build and four isolated API matrix jobs start independently.
  Two functional browser shards, two capture shards and WebKit consume the build;
  fullstack has its own database and one worker. Each matrix entry has an isolated
  runner. Full audit occurs once per event; PR dependency review remains additional.
- Capture retains all existing non-pixel assertions and validates mounted roots,
  fonts/images and nonempty PNG output. A reporter writes per-scenario images,
  viewport/browser metadata, SHA/run provenance and offline HTML. The aggregate
  gallery requires 128 unique successful scenarios (131 images at introduction).
  Intentional scenario additions must update the inventory expectation and tests.
- CI uploads partial evidence on failure where available, merges Playwright blob
  reports and stores the final report/gallery for 30 days. Artifacts are downloadable,
  not a published website. Baseline PNGs were removed from the current tree without
  rewriting Git history. Native local references are tracked in `e2e/captures/local/`; only intermediate
  output stays ignored. Successful local runs update selected scenarios without
  overwriting unaffected ones. CI never writes these native references.
- The stable `quality` and `Release candidate gate` check names are retained. The
  aggregate gate requires every new job/matrix and report result to succeed.
  Obsolete PR runs can be cancelled; staging deployment is never auto-cancelled.
- Rules §4.2, PRD §31.2, release checklist and earlier visual ADRs now use this
  contract. The former unconditional local release-parity rule is superseded.

## Decisions and detailed design

The following design records the implementation rationale and explicitly identifies
later optimizations. Proposed command names below are now implemented; optional
cross-run caching and later delivery/cache changes remain unimplemented.

### Visual inspection

Visual references are intended for human inspection. The proposed replacement is
one native local capture per relevant scenario and a separate CI capture on Linux,
with no cross-platform pixel comparison or repeated baseline verification.
Actions artifacts plus a downloadable HTML gallery, with proposed 30-day retention,
are the confirmed storage preference. No CI-generated commit to `staging`, `main`
or a screenshot branch is needed. Native repository PNGs use descriptive scenario/viewport filenames; internal IDs
remain in the manifest. An Actions artifact is not a hosted website;
the gallery is opened after download. Repository retention limits still apply.

The existing visual scenarios are retained. Only screenshot comparison is removed:

- Replace `toHaveScreenshot` with a shared capture helper using page/locator
  screenshots and test attachments. Do not simulate success with automatic
  `--update-snapshots` in CI.
- Preserve all pre-existing interactions and non-pixel assertions, including
  assignment footer visibility and selected-candidate state.
- Wait for application readiness, fonts and image decoding; retain deterministic
  clocks/data and reduced motion. Do not add fixed sleeps.
- Record scenario, viewport, browser, OS/architecture, source SHA, run/attempt and
  screenshot path in a manifest. Validate expected scenario coverage and nonempty
  files; a blank page must not count as successful rendering.
- Keep functional, accessibility, keyboard, overflow, PWA and legacy WebKit tests
  blocking. Capture/runtime failures remain blocking; visual appearance is reviewed
  manually. Pixel-difference detection is explicitly retired, so identical test
  counts must not be described as identical assertion coverage.
- Store native references in the repository under `e2e/captures/local/` and
  intermediate output in ignored `visual-output/`. Produce selected native screenshots
  once after the final relevant UI change; regenerate only if that change affects
  the captured view. No Linux x64 emulation is required for local visual review.
- Upload screenshots, HTML and manifests even on test failure when output exists.
  Use unique artifact names per SHA/job/shard/attempt, and synthetic fixtures only.
- Replace old multi-platform baseline directories with one tracked native capture
  gallery after scenario inventory is reconciled. Historical Git objects remain;
  no history rewrite is proposed.

This intentionally trades automated pixel regression detection for lower local
maintenance and direct visual inspection. DOM assertions cannot detect every
spacing, color or typography regression. Screenshot generation alone also still
incurs browser startup, navigation, layout and encoding cost; it does not remove
the entire 212-second browser workload.

### Local validation and parity

Absolute `local pass = CI pass` cannot be guaranteed across macOS/Linux, runner
load, fresh vulnerability databases, network services, PR merge refs and different
source revisions. A shared task definition can guarantee the same selected
commands, inputs and assertions. Release authority remains the exact candidate's
hosted gate.

Shared commands:

| Command                      | Purpose                                                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| `pnpm verify:local`          | Shared fast checks plus conservative affected suites, native runtime   |
| `pnpm visual:capture`        | Relevant native visual inspection output, no comparison                |
| `pnpm verify:full`           | Optional complete native application validation before a major handoff |
| `pnpm verify:repro -- <job>` | Isolated reproduction of a specific Linux CI failure                   |
| `pnpm verify:ci -- <job>`    | Same task definitions consumed by hosted jobs                          |

The orchestrator should execute a dependency graph, collect every child exit code,
and report completed/reused/failed/not-selected checks separately. Local reuse is
allowed only for matching content/config/lockfile/toolchain/environment inputs.
Unknown impact expands scope. Lockfile, shared contracts, schema, shared UI, test
infrastructure and workflow changes fan out to their dependants. Failed checks,
live security findings and time-sensitive measurements are not cached as green.
Install is repeated when dependency/runtime inputs change, not unconditionally
after every source edit. CI always performs frozen installation in clean jobs.

Keep native PostgreSQL testing Docker-managed. Reserve Linux reproduction for
platform-specific scripts, native modules and actual CI failures. Performance on
a fast Mac is advisory for the hosted performance gate. Keep production-image
validation and Linux flock contention authoritative in CI, with local reproduction
when relevant. Commit-time directory Gitleaks still includes uncommitted files.

Rules §4.2 now replaces unconditional full local workflow replay before every
commit with this contract; PRD §31.2, release checklist and affected visual ADRs
were updated together. A fast local pass is labelled scoped evidence, never a claim that
all hosted gates ran. No local command needs to reproduce CodeQL/deployment to
offer useful development feedback.

### CI execution graph

Start independent branches immediately; do not make every job wait for lint or
another aggregate quality job:

1. Static checks: format, lint, complete typecheck, unit tests, mocked provider
   contract smoke and generated-contract verification. Use bounded parallelism;
   OpenAPI generation writes files and must complete before consumers that could
   race against those files.
2. Build: frozen install, Prisma generation, clean production build and PWA
   compatibility; publish same-run application build output for browser/fullstack.
   Validate source SHA and required artifact contents. Native dependencies and
   Prisma runtime generation remain platform-specific, not copied from macOS.
3. Browser: consume build output; use two functional Chromium shards, a dedicated
   legacy WebKit job, and two capture shards. PWA/push suites remain included in
   Chromium execution with their original service-worker configuration. Merge blob
   reports and attach the gallery. Begin with one or two workers per runner and
   measure; increasing workers on the same runner is not free capacity.
4. API: keep each job serial internally initially. Isolate organization-routing in
   its own job with its own PostgreSQL; another runs the other integration files
   and security tests. Do not run the slow file both via explicit invocation and
   the unfiltered integration command. Splitting this dominant file improves fast
   feedback but cannot divide its own 96.5-second workload by the shard count.
5. Performance: its own PostgreSQL and otherwise idle runner; migrate, seed, then
   benchmark and reconcile in that order. Preserve workload, query bounds and p95
   thresholds. Define CPU/memory/pool conditions and compare warm/cold behavior
   before changing the gate's measurement protocol.
6. Fullstack: consume build output and use a fresh isolated PostgreSQL, migrate
   before Playwright globalSetup. Retain one worker and all five journeys. Never
   reuse performance or integration fixtures.
7. Migrations: fresh deployment, all five data-upgrade harnesses, destructive
   policy with resolved base SHA and previous-SHA migration/status. Keep distinct
   upgrade assertions, but group inexpensive work to avoid excessive job startup.
8. Containers: preserve Dockerfile compilation and all runtime/routing/persistence
   checks. Configure Buildx/Bake external layer caches per image/platform; existing
   `RUN --mount=type=cache` alone does not persist across disposable runners.
   Consider bounded parallel image scans after builds and a separate filesystem
   scan. Collect all results and retain cleanup under failure. Avoid downloading
   one vulnerability DB concurrently into a shared writable cache.
9. Keep CodeQL, secret scanning, dependency review/audit and deployment-script
   quality as independent required branches.
10. Keep the stable `Release candidate gate` check, explicitly requiring every new
    branch/matrix result. Cancellation, failure or unexpected skip cannot pass.
    Report upload uses failure-safe conditions; test jobs are not silently skipped.

Use cached pnpm stores consistently across jobs, rather than sharing node_modules.
A pinned browser-ready CI image is worth measuring against the current 45-second
browser installation; account for image pull time and match the repository's Node,
pnpm and Playwright versions. Browser caches alone are not assumed faster.

Initial changes retain full CI coverage on every current trigger. Path-based CI
skips and scheduled-only replacements are deferred. Obsolete PR runs can be
cancelled using PR-scoped concurrency. The current workflow also invokes deployment;
do not add unconditional workflow-level cancellation that can interrupt an active
deployment. Preserve the existing deployment lock and freshness check. PR checks
and subsequent staging checks can evaluate different trees, so they are not
automatically redundant.

### Redundancy inventory

| Existing work                                                 | Proposed treatment                                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Default `test:frontend:e2e` followed by visual suite          | Default already includes visual; select each scenario exactly once                                               |
| Native generation plus repeated Darwin/Linux verification     | Replace with native capture and CI artifact capture                                                              |
| Audit in quality and dependency-security on push              | Keep one full audit per run in dependency-security; keep PR dependency review too                                |
| `security:audit` plus `pnpm audit --audit-level high` locally | Exact alias; run once                                                                                            |
| Standalone typecheck plus frontend build `tsc -b`             | After coverage mapping, CI typechecks once then invokes Vite bundling; retain safe default build for normal use  |
| API typecheck versus API build                                | Not equivalent: typecheck includes scripts/tests; build only src and emits runtime code; retain both obligations |
| OpenAPI generate followed by openapi:check                    | Check already regenerates; one invocation sufficient unless source changed                                       |
| All upgrade harnesses plus individual lifecycle harness       | Parent already executes the child; targeted run replaces, not accompanies, the parent when scoped                |
| Destructive check without base plus with base                 | Base-aware script also scans all migrations; one base-aware execution in CI suffices                             |
| Manual Admin seed before fullstack                            | Global setup already seeds; remove explicit duplicate                                                            |
| Unit tests versus integration/security/performance            | Distinct selected suites; do not delete based on names                                                           |
| Fresh migration / data upgrade / previous-SHA upgrade         | Different contracts; preserve                                                                                    |
| Preview build versus production Docker build                  | Different packaging validation; not safely removable by name alone                                               |
| Gitleaks / dependency review / audit / CodeQL / Trivy         | Different threat/format coverage; consolidate only exact repeated invocations                                    |

Frontend typecheck optimization must preserve existing tsconfig inclusion and
generated-code order. Vite does not replace TypeScript checking. Cache task results
only with complete dependencies; an output directory merely existing is not proof
that a build matches current source.

### Later delivery optimization

Deployment remains outside the initial CI refactor. Today CI builds/scans runtime
images and the VM rebuilds them from a full source archive. A later build-once
design can publish immutable image digests, test/scan those same digests and deploy
them without VM recompilation. It requires registry permissions, provenance,
candidate SHA propagation, rollback manifests and protected handling of PR images.
Do not replace this with a mutable latest tag or remove migration/health/rollback
checks.

A smaller immediate delivery proposal is a tested archive allowlist excluding
design references and E2E PNGs while preserving all Docker/build/deployment inputs
and SHA/checksum validation. Dockerignore does not filter `git archive`. Neither
delivery proposal is implemented by this analysis.

## Expected impact and tradeoffs

The observed pre-deployment critical job takes 8.7–10 minutes. A reasonable initial
target is 4–6 minutes, conditional on runner availability, setup/upload overhead
and cache hits. This is a hypothesis to benchmark, not a measured result. Container
validation at 4.2–5.3 minutes becomes the next bound when quality is split.
More runners reduce wall time but may increase billed runner-minutes and storage.
Start with two browser/capture shards; expand only from measured imbalance.

Local savings are primarily the removal of x64 emulation, repeated screenshot
comparison and unconditional full release validation after small edits. A universal
local duration target is not supported by the inspected hosted evidence.

## Validation and rollout

Shared task inventory, artifact capture and independent CI branches were implemented
together with the rule replacement. Measured caches/container scans and immutable
image delivery remain follow-up work.

Record the old and new test IDs/assertion categories, not just total counts. The
current baseline is 212 unit tests, 88 integration, 14 security, two performance,
310 default Playwright (182 functional and 128 visual), five fullstack and five
data-upgrade harnesses. Capture scenarios can have multiple images per test.
Prove no missing or duplicate tests across shard unions, and explicitly list pixel
assertions retired. Test failure, empty-suite, missing artifact, cancelled shard,
stale build and upload failure behavior. Keep non-pixel assertions from visual specs.

Compare at least five comparable successful runs, reporting median/p95 job and
total wall time, runner-minutes, cache-hit status, queue time and artifact size.
Include a cold-cache run, source-only change, lockfile change, API/migration change
and frontend change. Do not change product thresholds to meet CI timing targets.

The initial analysis was read-only. The subsequent implementation changes validation
scripts, workflow scheduling, visual capture tests and documentation; application
behavior, dependency versions, container builds and deployment behavior remain
unchanged. Validation evidence and runtime cleanup are recorded in sessionHandoff.md.

## References

- [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots): platform-dependent rendering.
- [Playwright sharding](https://playwright.dev/docs/test-sharding): matrix execution and report merging.
- [Playwright CI](https://playwright.dev/docs/ci): workers and browser installation/cache tradeoffs.
- [GitHub workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data): build/report transfer and retention.
- [Docker cache management in Actions](https://docs.docker.com/build/ci/github-actions/cache/): persistent BuildKit caches.
- [GitHub token behavior](https://docs.github.com/en/actions/concepts/security/github_token): workflow-generated pushes do not act like ordinary developer pushes.

## CI environment isolation correction — 10 September 2026

The first hosted split run passed all application and capture jobs but failed the
container release-identity check. Workflow-global `RELEASE_SHA=ci` took precedence
over the production Compose fixture's zero SHA. Application test environment is
therefore scoped exclusively to the five application job definitions. No test
DATABASE_URL, NODE_ENV or signing values are inherited by container/deployment jobs.
The zero-SHA fixture and production assertions remain unchanged. Regression tests
check the boundary; Compose resolution and Actionlint verify the corrected graph.
