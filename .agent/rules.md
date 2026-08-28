# Coding Agent Rules

Document status: Active
Purpose: operating rules for Codex and future agents when reading or updating `.agent/`

## 1. Why This Folder Exists

The `.agent/` folder is the project memory and execution layer for this project.

It exists to:

- preserve product, features, architecture decisions, and implementation intent across sessions
- prevent re-deciding decisions that are already locked
- keep implementation aligned with requirements
- record roadmap status, deployment assumptions, and recommended next steps
- make future sessions aware that of the last session's progress
- document changes readable to developers product owners

## 2. Required Read Order

For most implementation sessions, read in this order:

1. `.agent/rules.md`
2. `.agent/PRD.md`
3. `.agent/sessionHandoff.md`, if present
4. `.agent/implementationPhases.md`
5. `.agent/releaseExecutionChecklist.md`, if present and relevant
6. deployment or environment docs only after they are recreated for deployment work
7. relevant ADRs under `docs/adr/` if present

## 3. Source-of-truth Files

- `PRD.md`: product contract, clinical safety posture, users, workflows, data model, API scope, AI decisions, deployment scope, acceptance criteria.
- `implementationPhases.md`: implementation roadmap, phase/subphase sequencing, progress state, dependencies, acceptance checks, and next recommended task.
- `sessionHandoff.md`: latest session handoff, current objective, changed files, decisions, blockers, checks run, and next recommended action.
- `releaseExecutionChecklist.md`: operator checklist for release windows, if present and relevant.
- Deployment/environment docs: future source-of-truth files to recreate only when deployment work is ready.

If code and docs disagree, do not silently pick one. Inspect the current repo state, identify the mismatch, and update the relevant `.agent` file as part of the same work when the change is intentional.

## 4 Local Development Runtime Rules

Future agents must preserve these development-environment decisions:

- Local development database must run as a Docker-managed PostgreSQL instance with pgvector enabled or provisioned through the local Compose setup.
- Do not require developers to install or use a host-machine PostgreSQL service for normal local development.
- Local app and tests should read database connection details from environment variables that point to the Docker database.
- Automated tests may use isolated Docker databases, disposable schemas, transactions, or test containers, but must not depend on a manually configured host PostgreSQL instance.
- Frontend clients must never connect directly to the database; all database access goes through the backend API.

## 4.1 End-of-task Process And Container Cleanup

Future agents must treat runtime cleanup as part of finishing a task:

- Shut down dev servers, long-running shells, file watchers, background workers, and other processes started during the session after they are no longer needed.
- Run `docker compose down` or the equivalent project-specific shutdown command after tasks that start Docker containers, unless the user explicitly asks to keep them running.
- Before final response, confirm there are no agent-started long-running processes or containers still needed for the completed task.
- If a process or container must remain running for the user to inspect the app, state that explicitly and include the URL or reason.

The production-like local full stack is operated only through these root scripts:

```text
pnpm local:up
pnpm local:status
pnpm local:logs
pnpm local:down
```

It reads the ignored mode-`0600` `.env.local`, exposes the workforce and Admin
origins through Caddy, and preserves its Docker-managed PostgreSQL volume across
`local:down`. Do not source `.env.local` in shell code or connect frontend code
directly to its database.

## 4.2 Mandatory Local GitHub Actions Parity Checks

Before creating any commit, future agents must inspect every workflow under `.github/workflows/`
that is triggered by the target branch and run its relevant checks locally. A previous successful
local command is not evidence when generated files or build output from an earlier run may still
exist.

Required behavior:

- use the repository-pinned Node.js and pnpm versions;
- run `pnpm install --frozen-lockfile`;
- begin from a clean-artifact state or a temporary clean Git worktree so ignored generated output
  cannot hide a missing generation/build dependency;
- execute the workflow commands in the same order and with the same required environment variables
  as GitHub Actions;
- run database checks against the Docker-managed disposable test database and always stop the
  Compose stack afterward;
- run the same secret scanner used by CI. When the GitHub Action supplies Gitleaks, run the matching
  Gitleaks version locally, preferably through a pinned Docker image;
- never silence a scanner broadly. A false-positive exception must identify the exact finding,
  explain why it is safe, and preserve scanning for the rest of the file/repository;
- the exact ignored root `.env` may be excluded from directory scanning because it is the local
  runtime secret store generated mode `0600`; `.env.example`, nested files, imports, and all other
  repository paths remain scanned;
- record the exact commands and results in `.agent/sessionHandoff.md`;
- do not commit while any local CI-equivalent check is failing.

The current baseline is:

```text
pnpm install --frozen-lockfile
pnpm db:generate
pnpm audit --audit-level high
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm migrations:destructive-check
pnpm openapi:check
pnpm build
pnpm exec playwright install --with-deps chromium
pnpm test:frontend:e2e
docker compose config --quiet
pnpm db:up
pnpm db:wait
pnpm db:verify
pnpm db:test:reset
pnpm db:test:migrate
NODE_ENV=test DATABASE_URL=<disposable-test-url> RELEASE_SHA=ci \
  SESSION_HASH_SECRET=<safe-test-value> SESSION_CSRF_SECRET=<safe-test-value> \
  AUTH_THROTTLE_SECRET=<safe-test-value> CURSOR_SIGNING_SECRET=<safe-test-value> \
  OUTBOX_ENABLED=false pnpm test:integration
NODE_ENV=test DATABASE_URL=<disposable-test-url> RELEASE_SHA=ci \
  SESSION_HASH_SECRET=<safe-test-value> SESSION_CSRF_SECRET=<safe-test-value> \
  AUTH_THROTTLE_SECRET=<safe-test-value> CURSOR_SIGNING_SECRET=<safe-test-value> \
  OUTBOX_ENABLED=false pnpm test:security
NODE_ENV=test DATABASE_URL=<disposable-test-url> <same-safe-test-config> pnpm seed:performance
NODE_ENV=test DATABASE_URL=<disposable-test-url> <same-safe-test-config> pnpm test:performance
NODE_ENV=test DATABASE_URL=<disposable-test-url> <same-safe-test-config> pnpm maintenance:reconcile
FULLSTACK_E2E=1 NODE_ENV=test DATABASE_URL=<disposable-test-url> RELEASE_SHA=ci \
  SESSION_HASH_SECRET=<safe-test-value> SESSION_CSRF_SECRET=<safe-test-value> \
  AUTH_THROTTLE_SECRET=<safe-test-value> CURSOR_SIGNING_SECRET=<safe-test-value> \
  OUTBOX_ENABLED=false pnpm exec playwright test --project=fullstack
# The gated fullstack project seeds the Admin e2e baseline automatically via its
# Playwright globalSetup (`pnpm --filter @care/api seed:admin:e2e`), so no
# explicit seeding step is required before that command.
docker run --rm -v "$PWD:/repo" -w /repo zricethezav/gitleaks:v8.24.3 \
  dir /repo --config=/repo/.gitleaks.toml --redact --verbose
git diff --check
pnpm db:down
```

Production containerization and staging deployment are active. The baseline above is extended by
the following required checks:

```text
pnpm migrations:destructive-check <staging-base-sha>
pnpm deployment:validate
pnpm test:deployment
pnpm security:exceptions:check
pnpm security:audit
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7@sha256:887a259a5a534f3c4f36cb02dca341673c6089431057242cdc931e9f133147e9
docker run --rm -v "$PWD:/repo" -w /repo koalaman/shellcheck-alpine:v0.11.0@sha256:9955be09ea7f0dbf7ae942ac1f2094355bb30d96fffba0ec09f5432207544002 shellcheck deploy/scripts/*.sh deploy/tests/*.sh
for file in apps/api/Dockerfile apps/web-voice/Dockerfile apps/web-admin/Dockerfile deploy/postgres/Dockerfile deploy/caddy/Dockerfile; do docker run --rm -i hadolint/hadolint:v2.14.0-alpine@sha256:7aba693c1442eb31c0b015c129697cb3b6cb7da589d85c7562f9deb435a6657c < "$file"; done
find deploy -type f -name '*.sh' -print0 | xargs -0 -n1 bash -n
docker run --rm -v "$PWD:/repo:ro" ubuntu:22.04@sha256:0e0a0fc6d18feda9db1590da249ac93e8d5abfea8f4c3c0c849ce512b5ef8982 bash /repo/deploy/scripts/bootstrap-vm.sh --check staging care-deploy "<valid-test-public-key>" 22
fresh and previous-SHA-to-current `prisma migrate deploy` plus `prisma migrate status`
the exact production Compose build/start/routing/non-root/persistence sequence from `.github/workflows/ci.yml`
Trivy filesystem plus API, workforce, Admin, PostgreSQL, and Caddy runtime images at HIGH,CRITICAL
```

The deployment-script harness must run on Linux before commit so real `flock` contention is tested;
a macOS run that reports `flock` unavailable is supplemental only. Trivy must use the committed
exact ignore file, and every ignore entry must have a rationale and future expiry in
`.agent/securityExceptions.json`.

The real Web Push canary is implemented but explicitly excluded from automated tests, CI,
deployment smoke, and the automatic staging gate. It may only be invoked manually against the
enrolled staging subscription according to `.agent/deploymentGuide.md`. The live DeepSeek Chat Completions
classification/location operation remains part of automatic staging deployment.

The directory-mode Gitleaks command is the mandatory pre-commit scan because it includes
uncommitted files. After committing and before pushing, also mirror the current GitHub Action
commit scan:

```text
docker run --rm -v "$PWD:/repo" -w /repo zricethezav/gitleaks:v8.24.3 \
  detect --source=/repo --config=/repo/.gitleaks.toml --redact --verbose --log-opts=-1
```

If `.github/workflows/` changes, this list must be reconciled in the same change rather than assumed
to remain complete.

After pushing:

1. inspect the new run with `gh run list --branch <branch>`;
2. use `gh run view <run-id> --json jobs` and `gh run view <run-id> --log-failed`;
3. do not report the delivery as successful until all required jobs are green;
4. if a job fails, reproduce it locally, fix the root cause, rerun all affected local checks, then
   commit and push the correction.

## 5. When To Update `.agent`

Update `.agent` when implementation changes:

- product scope
- API contracts or shared schemas
- feature or functionality changes
- database entities or migration assumptions
- deployment topology, domains, secrets, VM paths, or scripts
- test strategy, acceptance criteria, or release process

Do not let `.agent` become stale after major implementation sessions.

## 5.1 Required Progress Updates

Every substantive task or session must update:

1. `.agent/sessionHandoff.md`
2. `.agent/implementationPhases.md`
3. `docs/adr/`

Update `.agent/sessionHandoff.md` at the end of each substantive task/session with:

- current objective
- files changed
- current phase and subphase
- completed work
- decisions made
- blockers or open questions
- next recommended action
- tests and checks run

Update `.agent/implementationPhases.md` whenever:

- a phase or subphase starts
- a phase or subphase completes
- a phase or subphase becomes blocked
- a phase or subphase is deferred
- dependencies, acceptance checks, scope, or sequencing materially change

Implementation phase progress rules:

- keep only one current phase/subphase marked `in_progress`
- mark completed subphases `done`
- preserve blockers and deferred work explicitly
- never silently skip a phase dependency
- if implementation diverges from the roadmap, update the roadmap in the same session

Create or update an ADR under `docs/adr/` after every substantive task/session. The ADR must record the meaningful decision, implementation direction, tradeoffs, consequences, validation, and follow-up work from the session. If the session extends an existing decision, update the existing ADR instead of creating a duplicate.

## 6. When To Add Files

Add a new `.agent` file when:

- a new phase needs a dedicated kickoff document
- a major session needs handoff context
- a new operational area becomes too large for an existing doc
- a durable architecture decision needs an ADR under `docs/adr/`

Use these naming patterns:

- `sessionHandoff.md`
- stable docs in `camelCase.md`
- ADRs in `docs/adr/000N-kebab-case-title.md`

Do not add scratch files or duplicate content that belongs in an existing source-of-truth document.

## 7. ADR Rules

Use ADRs for durable architecture decisions such as:

- features or functionality additions or changes
- backend or routing changes
- PostgreSQL/pgvector schema strategy
- deployment topology or rollback behavior
- file storage and media processing
- etc

ADRs must include status, date, context, decision, rationale, alternatives considered, implementation details, consequences, validation plan, risks, and follow-up work. ADRs must be comprehensive enough that a future agent can understand why the decision was made without reading the full chat transcript. However, ADR should be written professionally, as if human / developers will be the primary reader. Thus, ADR should not be mentioning anything related to 'phases', users' prompt /request, and should be written in passive and explanatory form.

## 8. Commit and Commit Message Rules

Only commit to `staging` branch unless other branch is specified.

Use conventional commit prefixes:

- `feat:` for user-visible features or new capabilities
- `fix:` for bug fixes, regressions, security fixes, and broken behavior
- `docs:` for documentation-only changes
- `test:` for test-only changes
- `refactor:` for behavior-preserving restructuring
- `ci:` for GitHub Actions and automation changes
- `build:` for build systems, Dockerfiles, and packaging
- `chore:` for maintenance and repo hygiene

Commit subjects should be behavior-based, imperative, concise, and specific. They should describe the observable behavior or capability change, not the implementation phase or roadmap position.

Good examples:

- `docs: require Docker PostgreSQL for local development`
- `feat: add ambient session transcript correction`
- `fix: preserve rule warnings in generated summaries`

Avoid commit subjects that reference phases or sequencing instead of behavior:

- `phase 2 database work`
- `implement phase 6`
- `docs: update phase roadmap`

## 9. Content Rules

When updating `.agent`:

- write for future implementation sessions, not external marketing
- separate locked product decisions from current repo status
- state whether a feature is implemented, planned, deferred, or externally provisioned
- preserve clinical safety constraints explicitly
- avoid unsupported assumptions about hospital policy, external integrations, or clinical validation
- keep deployment secrets out of repo docs except as names/placeholders

## 10. Required End-of-session Updates

After every substantive task/session, update:

1. `.agent/implementationPhases.md`
2. `.agent/sessionHandoff.md`
3. `docs/adr/`

Also update, when relevant:

4. `.agent/releaseExecutionChecklist.md` if preparing a rollout
5. deployment/environment docs after they are recreated for deployment work

If the session only makes small local edits, update only the docs that actually changed in meaning.
