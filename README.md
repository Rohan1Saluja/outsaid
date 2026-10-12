# Outsaid

Independent, community-powered public-interest reporting, starting with Delhi NCR.

Session 02 adds controlled pilot login, database sessions, CSRF/origin protection, durable login throttling, trusted account provisioning and minimal login/account pages. Public registration, reporting, feeds, moderation and uploads remain deferred.

## Local setup

Prerequisites: Node.js **24.x**, pnpm **11.25.0** (the `packageManager` field pins it).

```sh
npm install --global pnpm@11.25.0
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Set AUTH_SECRET privately in apps/api/.env before starting (see docs/authentication.md).
pnpm dev
```

Web: http://localhost:3000. API: http://localhost:4000/v1/health.
The example database URL is an intentionally nonfunctional local placeholder. It permits API liveness and proxy checks without connecting to a database. Replace it with real development credentials before database work. The API validates configuration at startup but connects lazily; health is **liveness, not database readiness**.

```sh
curl http://localhost:4000/v1/health
curl http://localhost:3000/api/v1/health
# Both: {"status":"ok","service":"outsaid-api"}
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Both apps in watch mode |
| `pnpm build` | Both apps and shared declarations |
| `pnpm lint` | ESLint across application/contracts sources |
| `pnpm typecheck` | Strict TypeScript and Next route types |
| `pnpm test` | Disposable PostgreSQL-engine auth/HTTP/configuration tests |
| `pnpm db:validate` | Validate Prisma schema offline |
| `pnpm db:generate` | Generate API-owned Prisma Client offline |
| `pnpm db:migrate:dev --name <name>` | Explicit development migration (needs DB/shadow access) |
| `pnpm db:migrate:deploy` | Explicit reviewed migration application (needs DIRECT_URL) |

Each app builds independently from the workspace installation:

```sh
pnpm --filter @outsaid/api build
pnpm --filter @outsaid/web build
```

No build or install applies migrations. API build, dev, tests, and typecheck generate Prisma Client automatically. No database credentials are needed to build either app. Type-only contracts are resolved from source, avoiding a runtime dependency on sibling build output. Root `.env.example` is a reference; runtime environment files are app-specific. A root `.env` is not loaded by the apps.

## Structure

- `apps/web`: Next.js App Router, Tailwind, metadata, typed same-origin HTTP client.
- `apps/api`: NestJS Express, validation/error boundary, liveness, Prisma/schema/migrations.
- `packages/contracts`: dependency-free wire types.
- `packages/config`: strict TypeScript and shared ESLint configuration.
- `docs`: architecture, editorial policy, deployment, future contracts, session handoff.

See [architecture](docs/architecture.md), [editorial policy](docs/editorial-policy.md), [API contracts](docs/api-contracts.md), [deployment](docs/deployment.md), and [handoff](docs/handoff.md).

Vercel project configuration is supplied, but neither app has been deployed by this session. Database migration execution requires separate credentials and review.

See [authentication operations](docs/authentication.md) for pilot provisioning, secrets, runtime roles, retention and remaining deployment gates.
