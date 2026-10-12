# Deployment configuration

## Two independent projects

The existing projects are `outsaid-frontend` and `outsaid-backend`. Their verified domains are `outsaid.vercel.app` and `outsaid-api.vercel.app` (Vercel API, Session 02). No deployment was performed in Session 02. Both direct `/v1/health` and rewritten `/api/v1/health` returned HTTP 500 `FUNCTION_INVOCATION_FAILED` during read-only checks on 2026-10-12; the existing deployment needs investigation before pilot use.

| Setting | outsaid | outsaid-api |
| --- | --- | --- |
| Root Directory | `apps/web` | `apps/api` |
| Framework preset | Next.js | NestJS |
| Node.js | 24.x | 24.x |
| Install command | `cd ../.. && pnpm install --frozen-lockfile` | Same |
| Build command | `cd ../.. && pnpm exec turbo run build --filter=@outsaid/web...` | `cd ../.. && pnpm exec turbo run build --filter=@outsaid/api...` |
| Output directory | Framework default (`.next`) | Framework default; do not set a static output directory |
| Intended production domain | `outsaid.vercel.app` | `outsaid-api.vercel.app` |

App-local `vercel.json` files encode framework/install/build settings. Root Directory is a dashboard/project setting, not a `vercel.json` field. Enable **Include source files outside of the Root Directory in the Build Step** for both projects. Keep the root workspace manifest and pnpm lockfile available. Use the pinned pnpm version from the root `packageManager`; enable Vercel Corepack support (`ENABLE_EXPERIMENTAL_COREPACK=1`) if needed to honor the pin. Confirm the install log reports 11.25.0.

The filter includes only the target app and its workspace dependencies, so web deploys do not build the API or require database credentials. API builds run `prisma generate` before Nest compilation. Neither install nor build invokes `migrate deploy`, `migrate dev`, or `db push`.

Vercel's native NestJS preset detects `src/main.ts` and its normal `app.listen` bootstrap. It runs the app as a Vercel Function; no legacy `builds`/`@vercel/node` wrapper or catch-all `api/index.ts` is needed. Do not replace the backend with Next route handlers. Fluid instances remain stateless; database connection/client reuse is allowed, session storage in memory is not.

Before enabling automatic production Git deployments, establish the release approval process. No production deployment is authorized by this foundation session. Domain assignment is verified; remote build/runtime configuration and region/database connectivity remain unverified.

## Environment ownership

| Variable | Where | Purpose |
| --- | --- | --- |
| `API_ORIGIN` | Web, build/server only | Local `http://localhost:4000`; production `https://outsaid-api.vercel.app`; preview must point to the matching preview API |
| `DATABASE_URL` | API runtime only | Supabase transaction pooler, usually port 6543, TLS enabled |
| `DIRECT_URL` | Trusted migration operator only | Direct PostgreSQL or Supabase session pooler (5432), for explicit CLI migrations |
| `NODE_ENV` | Framework/runtime | development/test/production; Vercel sets production |
| `PORT` | API local/platform | Local default 4000; honor the platform-assigned port |

Never use NEXT_PUBLIC_ for a database URL or secret, and never add database credentials to the web project. Root `.env.example` shows Supabase placeholder formats. Local apps read `apps/api/.env` and `apps/web/.env.local`, respectively. Prisma CLI loads the API `.env` from its workspace. Generation and validation work without credentials; runtime requires a syntactically valid DATABASE_URL. DIRECT_URL can be omitted for generation and is mandatory for migrations.

`API_ORIGIN` is used by Next's rewrite at build time. Set it before building; changing it requires a rebuild. The production default is the intended production API, while development defaults to localhost. For a local production-build smoke test use `API_ORIGIN=http://localhost:4000 pnpm --filter @outsaid/web build` followed by `pnpm --filter @outsaid/web start`. Use separate dev/preview databases; never point preview mutations at production.

Deployments with Vercel Authentication enabled can block the rewrite before Nest is reached. Before a later preview test, configure an approved backend protection/bypass strategy and ensure the target preview URL is correct. Do not place bypass secrets in the browser or a public URL.

## Supabase PostgreSQL

Use Prisma with the `@prisma/adapter-pg` driver and the transaction pooler at runtime. The adapter limits each instance to two connections, with short idle/acquisition timeouts. Do not rely on obsolete Prisma engine URL parameters to control the `pg` pool. Copy TLS-enabled URLs from the Supabase Connect panel; percent-encode password special characters. Never disable certificate validation. Keep `outsaid` outside Supabase exposed schemas, and do not give `anon` or `authenticated` access.

The migration creates a private schema, revokes PUBLIC access and enables table RLS. Provision backend/migration database roles with explicit appropriate access; the table owner bypasses RLS, while a non-owner runtime role needs a deliberate backend-only policy/grant design. This operator-specific role setup must be verified against the real Supabase project before production. No Supabase SDK/API keys are required.

## Migrations

The committed initial migration is generated offline from the schema, then extended with SQL invariants and append-only safeguards. Review it before applying to an empty development database:

```sh
# Supply DIRECT_URL privately in apps/api/.env or the trusted operator environment.
pnpm db:migrate:deploy
```

For schema changes use `pnpm db:migrate:dev --name <name>` with a disposable development/shadow database, then review SQL. Do not run against production. Do not regenerate the initial migration after it has been applied. Keep custom CHECK constraints, RLS and append-only triggers in subsequent migrations.

Production application must be a separately authorized, credentialed operation after backups and migration review, never part of preview/build hooks. Offline generation does **not** prove the migration ran, the schema exists remotely, or the connection pool/roles work. Session 01 does not verify these without credentials.

## Pre-release checks for a future deployment session

Run frozen install, lint, typecheck, build, tests and Prisma validation. Verify direct and rewritten health endpoints, cookie/CSRF behavior once auth exists, region proximity to Supabase, connection pooling, migration state, database isolation and project/domain configuration. Health alone is insufficient for database readiness.

## Official references consulted

- [Vercel NestJS conventions](https://vercel.com/docs/frameworks/backend/nestjs)
- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Next.js external rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites)
- [Prisma Client generator](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)
- [Supabase Prisma integration](https://supabase.com/docs/guides/database/prisma)

Domain assignments were inspected; Session 02 production health checks failed as recorded above. No new deployment was initiated.


## Session 02 authentication gate

Follow [authentication operations](authentication.md) before deploying this branch. New required **API-only** variables: AUTH_ALLOWED_ORIGINS and AUTH_SECRET. VERCEL is platform-provided, not a client header. Configure preview origins and isolated preview databases explicitly. The web project still requires only API_ORIGIN; no auth secret or database access belongs there.

Provision the least-privilege runtime role separately from migration/provisioning credentials; explicitly apply migrations to confirmed development first. Schedule hourly trusted `auth:cleanup` for retention. Before release, verify actual secure cookie forwarding, source-header spoof resistance through both direct/rewrite paths, native PostgreSQL concurrency, Supabase transaction pooling and schema exposure settings. Do not set production variables or run production migrations as part of this PR.
