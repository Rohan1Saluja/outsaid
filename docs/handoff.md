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
