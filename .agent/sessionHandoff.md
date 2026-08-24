# CARE Session Handoff

| Atribut | Nilai |
|---|---|
| Date | 24 Agustus 2026 |
| Current objective | Establish the CARE v1 product contract and backend-first delivery sequence |
| Current phase | Phase 0 complete; Phase 1 pending |
| Implementation status | Application code not started |
| Recommended next action | Scaffold repository/toolchain foundation |

## Completed Work

- Created the normative CARE v1 PRD covering product workflows, roles, permission, privacy, AI, data model, API, UX/PWA, security, observability, deployment, CI/CD, tests, acceptance criteria, risks, and launch blockers.
- Created a sequenced implementation roadmap.
- Created the initial architecture ADR.
- Reordered delivery into mandatory Backend Complete, Frontend Complete, and Delivery Complete gates.
- Recorded the backend-first sequencing decision in a dedicated ADR.
- Inspected `.agent/rules.md` and the PRD/deployment patterns in `supplier-henkaten`.
- Verified official Gemini 3.7 Flash model ID, GA status, structured-output support, and supported locations from Google Cloud documentation.

## Files Changed

- `.agent/PRD.md`
- `.agent/implementationPhases.md`
- `.agent/sessionHandoff.md`
- `docs/adr/0001-care-v1-architecture.md`
- `docs/adr/0002-backend-first-delivery-order.md`

## Decisions Made

- CARE is a one-surface role-aware mobile PWA with NestJS/Prisma/PostgreSQL backend.
- Roles are CARE Admin, Member, Manager, Section Head, and shared Union.
- Actual Employee/Manager/Union data is imported through Admin UI and not committed to Git.
- Private Voice is Union-routed and reporter identity is hidden from Union and CARE Admin; Admin may see content.
- General Voice is non-public and visible only to the reporter, route Manager, assigned Section Head, and Admin.
- Routing is deterministic: one Safety/area, one Facility/area, one regular Manager/department.
- Gemini on Vertex AI uses configurable model/location with defaults `gemini-3.7-flash`/`global`, structured JSON, `LOW` thinking, and confidence threshold `0.75`.
- Four statuses are used; reopen is an event returning to In Verification with the previous PIC.
- Closure requires a note and image evidence; rating is stored per closure cycle.
- Notification Center is authoritative and Web Push is best-effort.
- Single-VM-per-environment topology and release-by-SHA deployment pattern are locked.
- Logical retention is unlimited while backup, PITR, RPO/RTO, HA, and DR are explicitly absent.
- Backend implementation and contract tests must be complete before frontend implementation starts.
- Frontend implementation and cross-role E2E must be complete before production application containerization and deployment automation starts.
- Docker-managed PostgreSQL remains mandatory during backend development/testing; it is explicitly excluded from the deferred production containerization work.

## External Blockers

- Actual Employee CSV, Manager CSV, and Union JSON plus data owner.
- GCP project/billing/API/service identity and governance approval for the `global` processing location.
- Labeled Indonesian manufacturing AI evaluation dataset.
- VAPID keys and real mobile UAT devices.
- Staging VM/DNS/SSH/runtime secrets confirmation.
- Production VM/domain/DNS/GitHub environment/runtime secrets.
- Written acceptance of critical risks: no backup/DR, shared Union account, password policy, Admin access to Private content, and indefinite logical retention.

## Checks Performed

- Read repository rules and current repository status.
- Inspected reference PRD headings/content and deployment workflow/Compose/Caddy/scripts.
- Verified document paths and confirmed `.agent/PRD.md` was initially empty.
- Documentation structure and terminology validation performed after writing.
- Roadmap ordering validation confirms that frontend starts only after the Backend Complete Gate and production containerization starts only after the Frontend Complete Gate.
- No application build, test, container, formatter, or migration was applicable because the repository has no application code/toolchain yet.

## Next Recommended Action

Implement Phase 1 from `.agent/implementationPhases.md`: establish the backend-only pinned pnpm/Node workspace, NestJS API, shared OpenAPI contracts, Docker-managed PostgreSQL development/test infrastructure, root backend quality scripts, and initial backend GitHub Actions. Do not start React UI or production application containerization before their respective gates pass.

## Cleanup

No dev server, watcher, background process, or Docker container was started by this session.
