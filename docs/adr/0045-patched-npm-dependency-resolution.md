# ADR-0045: Patched npm Dependency Resolution for High-Severity Advisories

- Status: Accepted
- Date: 9 September 2026

## Context

The dependency audit gate (`pnpm audit --audit-level high`) began failing after
GitHub advisories were published for three packages resolved by the API and the
root ESLint configuration:

- `sharp` (direct dependency of the API) resolved `0.35.3`; patched in `0.35.4`
  (vendored libheif fixes, GHSA-rgj7-g3m4-5g8c).
- `js-yaml@4.3.1` was resolved transitively through `eslint` →
  `@eslint/eslintrc`; patched in `4.3.2` (GHSA-2883-xcg3-v3hh).
- `multer@2.2.0` was resolved transitively through `@nestjs/platform-express`,
  which declares an exact `multer: 2.2.0` dependency; patched in `2.3.0`
  (three DoS advisories: GHSA-wc9g-mqfw-jrwm, GHSA-535w-7cp7-47q4, and
  GHSA-qfvm-cv95-jqjf).

All advisories were published on 8–9 September 2026, so the audit gate passed on
earlier releases. The API does not use Nest's multer interceptors; uploads are
streamed by the media module itself, but the audit gate evaluates resolved
versions rather than call paths.

## Decision

Dependency versions are updated to the patched revisions:

- The API's direct `sharp` pin is advanced to `0.35.4`.
- The workspace override list in `pnpm-workspace.yaml` gains two scoped
  overrides: `js-yaml@^4.1.0: 4.3.2` and `multer@^2.0.0: 2.3.0`. The `js-yaml`
  selector is range-scoped so `js-yaml@5.x` consumers are unaffected, and the
  `multer` selector keeps working if `@nestjs/platform-express` widens its
  declaration later.

No audit exceptions or scanner suppressions are introduced. The pre-existing
moderate advisories remain below the High gate and are unchanged.

## Rationale

Resolving actual patched versions is the only durable correction; a scanner
exception would suppress the finding while shipping vulnerable versions, which
the repository's exception policy does not permit. Scoped overrides keep the
correction minimal and avoid unrelated dependency upgrades, consistent with the
existing override entries (`deepmerge-ts`, `path-to-regexp`).

## Consequences

- Fresh and frozen installs resolve patched versions and the audit gate passes
  at the High threshold.
- Overrides must be revisited when upstream declarations are widened or the
  packages receive further advisories; package-wide exact overrides are
  intentionally avoided.
- `sharp` is a native module; future pin changes must re-run build, media, and
  image-scanning checks.

## Validation

- `pnpm install` (then `pnpm install --frozen-lockfile`) succeeded with
  `strict-peer-dependencies=true`; resolved lockfile versions verified.
- `pnpm security:audit` reports zero High findings.
- Full local quality parity re-run on the corrected tree: Prisma generation,
  format, lint, typecheck, unit suites, destructive migration check, OpenAPI
  drift check, production build, PWA compatibility gate, Compose config,
  integration (88), security (14), performance (2), fullstack (5), and the
  complete browser suite (310, including media/attachment paths that exercise
  `sharp`).
- Gitleaks directory scan and `git diff --check` passed.
