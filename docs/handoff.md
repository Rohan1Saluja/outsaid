# Session 03 handoff: private report drafting and submission

Date: 2026-10-13
Branch: `feat/session-03-private-reports`
Base: `main` at `24d7464` (Session 02 PR #2 and provisioning diagnostics PR #3 both merged).
Status: Implementation complete; partial verification pending native PostgreSQL/Supabase and browser availability. No merge or deployment initiated.

## Reported environment, distinct from verification

The user reports both migrations applied to Supabase, auth permission-group SQL applied, a restricted outsaid_backend login created, an administrator provisioned, and local login → account → logout → protected redirect working. Their Node pg connection uses the Supabase CA with sslmode=verify-full and sslrootcert. These reports supersede the earlier provisioning failure in historical handoff; no credentials/certificate/development target were supplied here, and no remote database or Vercel authentication/certificate check was performed.

## Implemented

- Authenticated POST /reports, GET /reports/mine, GET /reports/:id, PATCH /reports/:id and POST /reports/:id/submit.
- CONTRIBUTOR/MODERATOR/ADMIN authoring with own-report-only access for every role; cross-user details/mutations return 404.
- Explicit private DTO selections, bounded nested validation/UTF-8 JSON size, no uploads/URL fetching, exact-origin and session-bound CSRF through existing SessionGuard.
- Atomic revision 1 creation; DRAFT-only author/version CAS edits; source replacement with retained JSON history; submission snapshot/status/timestamp/version transaction; submitted read-only state and independent UNVERIFIED status.
- Existing durable throttles extended with account/action HMAC budgets: creation 20/hour, editing 120/hour, submission 20/hour in fixed UTC windows. Counters commit before report work; storage failure is closed; existing 24-hour cleanup applies.
- Separate reviewed report permission-group SQL with bounded column grants/RLS. No owner/superuser/BYPASSRLS/schema CREATE, report deletion, history mutation or moderation permissions. Nest ownership remains mandatory.
- Light My reports/pagination/new/edit/detail UI, source add/remove, editorial/privacy guidance, conflict/error retention, unsaved-navigation warning, native confirmation dialog and read-only submissions; account links and typed same-origin API client/contracts.
- API, report operations, authentication/deployment/architecture guidance and AGENTS scope updated. No schema migration or application dependency changes; original SQL migrations/triggers/constraints/auth/proxy behavior retained.

## Verification evidence

| Check | Result |
| --- | --- |
| Frozen pnpm 11.25.0 installation | Pass |
| Workspace lint and strict typechecks | Pass |
| API and web production builds | Pass |
| Prisma generate/validate | Pass; no migration engine or external apply claimed |
| AUTH_TEST_WEB=1 AUTH_TEST_CLI=1 REPORT_TEST_WEB=1 API test suite | 23 tests pass; zero skipped |
| Real Prisma pg adapters → disposable PGlite via TCP | Pass; existing migration SQL + both permission scripts executed; app uses restricted test LOGIN/NOBYPASSRLS and owner is separate |
| Create → edit/source removal → submit with immutable snapshots | Pass; safe DTOs/status/version/metadata and append-only triggers |
| Every route: missing/disabled/revoked/expired sessions; every role own-only | Pass; live role changes observed through existing sessions |
| Origin/session-bound CSRF, forbidden ownership/status/approval inputs, nested/scheme/version/JSON limits | Pass |
| Stale/concurrent edits, concurrent submissions and edit versus submit | Pass on PGlite; native lock scheduling unverified |
| Induced revision-insert failure and invalid legacy content | Pass; creation/edit/submission rollback, source/history intact, sanitized errors/logs |
| Private read/throttle storage outage | Pass; uncached sanitized 503 and no report write on throttle failure |
| Default 20/max 100 pagination, equal timestamps, exclusive cursors, empty/malformed boundaries | Pass |
| Durable action limits across two clients, independence/window reset/24-hour cleanup/429 | Pass on PGlite |
| Restricted-role CRUD; approval/verification/publication/schema/history/moderation denial; public-role denial | Pass on disposable engine |
| Actual Next dev rewrite HTTP flow | Pass: login → create → edit → submit → denied edit → mine → logout → 401; no-store/cookies/CSRF transported |
| Existing authentication, health and hidden-password provisioning regression checks | Pass |
| React/accessibility/static boundary review | Pass; final form copies only editable fields, uses labels/legends/native dialog, stable source keys and no browser storage |
| Native PostgreSQL/Supabase pooling/TLS and development migration status | Unverified: no isolated credentials; local native setup blocked by container package/user permissions |
| Desktop/mobile browser, keyboard/dialog/navigation QA | Unverified: Chromium archive download truncated/invalid |
| Diff whitespace | Pass |

PGlite is a real PostgreSQL WASM engine, not mocked persistence, but multiplexes a single connection. Its concurrency/RLS results do not prove native scheduling, Supabase TLS/pooling, Data API settings or Prisma migrate status. Optional REPORT_TEST_DATABASE_URL supports a new disposable outsaid_reports_test_* database, refuses existing outsaid schema and never resets/drops a supplied target. See docs/reports.md for reproducible commands and remaining platform gates. HTTP rewrite tests exercise transport, not browser UI interactions.

## Development setup and remaining gates

There is no new migration or environment variable. Review/apply apps/api/prisma/operations/reports-runtime-role.sql as owner on a **confirmed dedicated development database**, then explicitly grant outsaid_reports_runtime to outsaid_backend alongside existing auth membership. This script/membership was tested only on disposable PGlite, never applied remotely. Keep outsaid outside the Supabase Data API, retain restricted runtime credentials and CA verification, and inspect real grants before applying. Configure existing trusted hourly auth:cleanup for both auth/report throttle retention before pilot release.

Before release, rerun native persistence/concurrency/runtime-role tests, actual development migration status and Supabase pooling/TLS checks; complete desktop/mobile UI and deployed rewrite/cookie/CSRF/certificate checks on isolated preview. Older production 500 observations below remain historical. Session 03 makes no present production health claim, environment change, remote migration, merge or production deployment.

## Session 04 can assume

Private author draft/edit/submission contracts, immutable revisions, role guards, durable limits and safe same-origin UI are implemented and locally reviewable. SUBMITTED stays private/read-only; verification remains independent; no ModerationEvent is misused for contributor actions. Current sources are replaceable but revisions retain removed source content; human redaction/retention remains an operational prerequisite for real evidence.

Session 04 must inspect this PR's actual merge state and the new permission script before adding review/publication behavior. Moderator access to other authors is intentionally absent and requires a separate server-side permission design, revised least-privilege grants, immutable exact-revision approval and auditing. Public serializers must redact private identities/evidence and use a human-reviewed revision. Await the explicit Session 04 prompt; no moderation/publication/public feed/corrections/uploads/AI/notification work was started.

---

# Session 02 follow-up: provisioning diagnostics

Date: 2026-10-13
Branch: `fix/pilot-provisioning-diagnostics`
Base: current main at `e9a915b` (Session 02 PR #2 merged).

The user reports both migrations applied to Supabase and auth runtime-role SQL executed successfully. Provisioning still fails; a user-run Node pg probe reported SELF_SIGNED_CERT_IN_CHAIN. After supplying CA-file guidance, provisioning again failed with the old generic message; its current underlying cause is unknown. No credentials or CA file were supplied to this workspace, and no external database changes were made here.

Implemented: operator-only safe provisioning stage/category diagnostics, specific length/mismatch feedback, known Prisma/pg wrapper classification and accurate reporting if cleanup fails after account creation. Passwords remain hidden, untrimmed and outside CLI arguments. No auth endpoint behavior or migrations changed.

Verified: API lint, strict typecheck/build and auth integration tests including POSIX hidden-password provisioning, plus diagnostic redaction/category tests. 12 tests pass; optional web-rewrite test skipped in this focused run (unchanged and previously verified). Windows terminal and current Supabase connection remain unverified. No merge or deployment performed.

Next: run the updated provisioning CLI locally and report only its stage/category. Resolve that actual error before switching to the restricted backend role. Previous Session 02 handoff follows; its original database-availability statements are historical.

---

# Session 02 handoff

Date: 2026-10-12
Branch: `feat/session-02-authentication`
Base: `main` at `64f83b1` (merged foundation PR #1)
PR title: `feat: add secure pilot authentication and database sessions`
Status: Implementation complete locally; partial verification pending external development infrastructure and browser availability. No merge or deployment performed.

## Implemented
- Nest login/me/csrf/logout modules, DTO validation and explicitly selected safe user responses.
- Argon2id, seven-day absolute opaque sessions with SHA-256-only persistence, expiry/revocation/disabled/current-role checks.
- Secure host-only deployed cookies, local HTTP exception, exact Origin allowlist and session-bound CSRF; reusable session and fail-closed role guards.
- Atomic PostgreSQL throttling for HMAC account/source dimensions, fail-closed storage errors, bounded opportunistic cleanup and trusted retention CLI.
- Non-echoing interactive pilot provisioning, contributor default, explicit elevated roles; no public registration/reset/email features.
- Light login/account UI and typed same-origin client, including error/loading/logout handling.
- Additive auth throttle migration and backend-only RLS/grant operations script; foundation migration and editorial/history invariants unchanged.
- Updated contracts, architecture, environment examples and deployment/security operations.

## Verification evidence

| Check | Result |
| --- | --- |
| Frozen dependency installation | Pass |
| Workspace lint and strict typechecks | Pass |
| Both app production builds | Pass |
| Prisma generate/validate | Pass |
| `AUTH_TEST_WEB=1 AUTH_TEST_CLI=1 pnpm --filter @outsaid/api test` | 11 tests pass |
| Real Prisma pg adapter against disposable PGlite PostgreSQL via TCP | Pass; both migration SQL files executed, no persistence mocks |
| Success/failure/nonexistent/disabled login, safe DTO, normalization and untrimmed passwords | Pass |
| Session hash storage/uniqueness, expiry/revocation, role updates and role guard denial | Pass |
| Origin/CSRF denials, cross-session token rejection, cookie settings, persisted logout | Pass |
| Two Prisma clients concurrently consuming the same durable throttle; source limit; cleanup; storage failure | Pass on PGlite; native scheduling remains unverified |
| RLS enabled on eight tables, backend role read permitted, role changes/report access denied, public role denied | Pass on disposable engine |
| Actual Next dev rewrite: login → me/csrf → logout → 401, health | Pass over HTTP; cookie and request headers preserved |
| Python POSIX pseudo-terminal provisioning | Pass: default CONTRIBUTOR, password not echoed, resulting account can log in |
| Browser UI flow/screenshots | Blocked: Chromium archive download was invalid/truncated |
| Diff whitespace | Pass |

PGlite is a real PostgreSQL WASM engine, but its single-connection multiplexer does not prove native PostgreSQL lock scheduling, Supabase TLS, transaction pooling or Prisma migration-engine compatibility. A standalone Prisma migrate-status attempt did not succeed against PGlite. No real development/production database credentials were supplied, and no external migrations were applied. The optional AUTH_TEST_DATABASE_URL path permits rerunning integration tests on a newly created disposable native database named outsaid_auth_test_* and refuses an existing outsaid schema.

## Deployment observations / blockers

Vercel confirmed project IDs/domains:
- `outsaid-frontend` → https://outsaid.vercel.app
- `outsaid-backend` → https://outsaid-api.vercel.app

Read-only HTTP checks on 2026-10-12 returned **500 FUNCTION_INVOCATION_FAILED** for both direct API `/v1/health` and web `/api/v1/health`. This predates deploying Session 02. The initial deployment is not healthy; its cause was not diagnosed or changed in this session.

Before pilot use:
1. Supply a confirmed isolated development database; inspect/apply Prisma migrations explicitly and verify limited runtime-role Prisma access through Supabase transaction pooling plus private schema/Data API configuration.
2. Rerun native PostgreSQL concurrency/integration and migration-engine checks; PGlite tests are not a substitute for these platform checks.
3. Set API-only AUTH_ALLOWED_ORIGINS/AUTH_SECRET and isolated preview credentials. Verify Secure cookies and platform source-header spoof resistance on the actual two-project rewrite. Shared proxy-source budgets are deliberately conservative until proven otherwise.
4. Configure trusted hourly auth cleanup for retention during idle periods.
5. Complete desktop/mobile browser QA and investigate existing production health failure before an independently authorized release.

## Session 03 handoff

Auth endpoints, safe wire contracts, session and role guards, provisioning and minimal account UI are available for review. Report routes remain absent; no submission, publication, moderation UI, uploads or public onboarding were introduced. Future protected mutations must use SessionGuard (origin/CSRF included) and appropriate server-side authorization; auth does not replace report ownership/editorial invariants. Extend runtime grants only for explicitly approved modules. Resolve the development database and deployment gates before building on unverified remote infrastructure.

Next: Session 03 scope to be explicitly defined after this PR review; suggested focus is private report drafting/submission with ownership and editorial invariants. No Session 03 work performed.

---

# Historical Session 01 handoff


Date: 2026-10-12
Branch: `chore/session-01-foundation`
PR title: `chore: establish Outsaid monorepo foundation`
Status: Foundation implementation complete; runtime deployment/database limitations below.

## Repository baseline
The repository was empty. `main` received only the permitted bootstrap README commit (`bd0b064`); all foundation changes are on the dedicated session branch. Do not merge or deploy without authorization.

## Implemented
- pnpm 11.25.0 / Turborepo workspace, Node 24.x, strict TypeScript and ESLint.
- Independently buildable Next.js 16.4 / React 19 / Tailwind 4 web and NestJS 12 Express API.
- Light, responsive editorial landing page, metadata/icon, typed/validated browser health client and same-origin rewrite.
- API environment validation, global DTO ValidationPipe, sanitized exception filter and `/v1/health` liveness endpoint.
- API-owned Prisma 7.10 Client/adapter with bounded lazy PostgreSQL pool.
- Seven related models in private `outsaid` schema; separate publication/verification enums; generated initial SQL migration plus privacy, history and data-invariant safeguards.
- Type-only shared contracts and documented future authentication/report contracts.
- Independent Vercel project configuration and local/deployment/editorial/architecture instructions.

No authentication, report endpoints, feeds, submission, moderation UI, uploads or production deployment were implemented. shadcn/ui components can be added when an interactive UI is in scope; the static foundation does not need a component runtime.

## Verified locally

| Check | Result |
| --- | --- |
| `pnpm install` and `pnpm install --frozen-lockfile` | Pass |
| `pnpm lint` | Pass, no warnings |
| `pnpm typecheck` | Pass |
| `pnpm build` | Pass for both apps and shared declarations |
| Each app's separate `pnpm --filter ... build` | Pass |
| `pnpm test` | 3 tests pass: exact health contract/no database, API 404/route absence, environment validation |
| `pnpm db:validate` / `pnpm db:generate` | Pass without live database credentials |
| Root `pnpm dev` | Both watch processes start; landing HTTP 200 |
| Direct `/v1/health` and rewritten `/api/v1/health` | Exact expected 200 JSON, in dev and compiled production runtimes |
| Rewritten unimplemented `/api/v1/reports` | 404 with API error envelope |
| Frontend boundary review | Production dependency list only contracts/Next/React/React DOM; no database code, SDK or credentials |
| Initial SQL execution | Pass in temporary PGlite embedded PostgreSQL; 11 checks covering table/RLS setup, private defaults, normalized email, publication requirements, cross-report revision rejection, append-only history, independent verification, and public-role denial |
| `git diff --check` | Pass |

The SQL check used a scratch-only PGlite installation, not a new application dependency. It does not prove Supabase permissions, network/TLS, transaction pooling or Prisma migration history. `prisma migrate deploy` was **not** run on Supabase or any external database.

Health is liveness only. Placeholder development database URLs are intentionally unreachable; the health test also uses a closed port to establish that it never queries the database. No real credentials were supplied or committed.

Next local scripts explicitly bind 127.0.0.1, which also avoids the execution environment's restricted network-interface enumeration. Use an explicit hostname override if LAN access is needed. Requests outside `/v1` receive the Express adapter's 404; the structured error envelope applies inside the API namespace.

## Unverified / blockers for later release
- Supabase: no credentials supplied. Apply the reviewed migration to a development database and verify real schema, role privileges, TLS, pooling and Prisma CRUD before auth integration.
- Vercel: no deployment performed; actual project/domain availability, remote builds, regions, preview protection and deployment environment settings remain unverified.
- Browser visual/responsive/accessibility runtime QA: Chromium installation failed because the download returned an invalid/truncated archive. Landing HTML renders, responsive classes/semantics were reviewed, but no browser screenshot or viewport test is claimed.
- Production security: auth, durable rate limits, origin/CSRF checks and permission guards are explicitly future work; no corresponding product endpoints are exposed.

## Session 02 can assume
The two apps build independently after workspace install, shared types are server-free, Prisma generation is offline, and the same-origin transport works locally. Only `/v1/health` exists. The schema/migration are committed proposals awaiting real development-database application. SQL CHECK constraints and history triggers must be preserved when evolving migrations.

Suggested next session: backend authentication and database-backed sessions, with explicit acceptance criteria before implementation. Start by inspecting this PR/main state, confirming contribution eligibility and password/session/email-verification policy, and configuring a separate development database. Implement Argon2id, opaque hashed sessions, secure host-only cookies, expiration/revocation, current-role authorization, CSRF/origin checks and persistent auth throttling together with failure/ownership tests. Do not start report features merely because their contracts are documented.

Stop at Session 01 in the current PR.
