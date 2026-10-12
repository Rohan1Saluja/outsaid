# Pilot authentication and operations

## Security model

Backend only: Argon2id v19, 64 MiB memory, three passes, one lane, 32-byte output and library-generated random salt. The nonexistent-account path verifies a dummy hash with the same parameters; disabled accounts also verify before a generic failure. Comparable computational work is intended, not constant end-to-end network timing. All pilot password hashes must be created by the CLI with these parameters. Passwords are not trimmed or normalized.

Sessions use 32 cryptographically random bytes encoded as base64url (256 bits); PostgreSQL stores SHA-256 hashes only. Seven-day **absolute** lifetime, no sliding extension. Every protected request reads the database and checks expiry/revocation, user disabling and current role. Logout revokes before clearing the cookie; storage failure returns 503 and does not pretend logout succeeded. Existing cookies cannot be used after revocation. Session tokens, passwords and database errors are not logged.

Cookie: `__Host-outsaid-session`, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain when NODE_ENV=production or VERCEL=1. Local HTTP development/test only uses `outsaid-session-local` without Secure. Never override deployed cookies to allow HTTP. Cookie expiry matches the seven-day database deadline; the database remains authoritative.

CSRF: HMAC-SHA256 of the raw session token with a purpose prefix, using AUTH_SECRET. `/auth/csrf` requires a valid session and is uncached. Authenticated mutations require its constant-time-checked value in `x-csrf-token` plus exact Origin. Login requires exact Origin even before a session exists. Missing/`null`/wildcard/subdomain-lookalike origins fail. Trusted origins never come from Host or forwarding headers. No browser storage is used for auth tokens; the UI gets CSRF immediately before logout.

## Environment (API only)

| Variable | Requirement |
| --- | --- |
| AUTH_ALLOWED_ORIGINS | Exact comma-separated web origins, no spaces/trailing slash/path/wildcards. Local `http://localhost:3000`; production `https://outsaid.vercel.app`. HTTPS mandatory when deployed. Explicit isolated preview origins only. |
| AUTH_SECRET | 32 random bytes as 64 lowercase hex characters. Generate privately using Node crypto. Shared across API instances in one environment; different in each environment. Required even for local startup. |
| DATABASE_URL | Dedicated backend runtime role, private schema, Supabase transaction pooler and TLS. No migration ownership or public Supabase API credentials. |
| DIRECT_URL | Trusted migration operator only, direct/session pooler; never used by runtime services. |
| VERCEL | Vercel-provided deployment marker. Do not manually set outside Vercel or spoof it in local environments. |

No new web environment variables or secrets. `API_ORIGIN` remains the server/build-only rewrite target. AUTH_SECRET rotation invalidates outstanding CSRF tokens and resets HMAC rate-limit identities; existing sessions can fetch a new CSRF token. Revoke sessions separately if incident response requires it. Do not rotate casually to bypass throttling.

## Client source and durable throttling

Express `trust proxy` is false. Outside Vercel, only `socket.remoteAddress` is accepted; all supplied forwarding headers are ignored. Local web-proxied users intentionally share the proxy socket budget. Inside Vercel only the platform's `x-vercel-forwarded-for` is accepted, requiring a single valid IP. Missing/malformed values fail closed with 503. Never deploy that trust mode on an untrusted custom proxy.

IPv4-mapped addresses are normalized; IPv6 uses a canonical /64 prefix. Raw emails/IPs never enter the throttle table: HMAC-SHA256 with separate account/source prefixes protects identifiers against offline guessing without AUTH_SECRET. The normal private User table necessarily stores pilot email addresses.

Limits: **10 attempts per normalized account and 50 per source per fixed 15-minute UTC window**, including successful logins. Upserts atomically increment both dimensions in one database transaction across instances. Denial is returned only after committing counters. Counters saturate safely. Storage failures return 503, never a bypass. Fixed windows permit a boundary burst up to twice the limit; shared networks may exhaust a shared source budget, and targeted attempts can temporarily block an account. These are explicit pilot tradeoffs.

Vercel documents overwriting forwarded IPs to prevent spoofing: https://vercel.com/docs/headers/request-headers . The deployed two-project rewrite may yield a shared proxy source instead of the original visitor. **Before enabling pilot traffic, verify direct and rewritten requests plus spoofed forwarding headers on an isolated preview.** Do not weaken trust or accept arbitrary X-Forwarded-For to fix shared budgets. If original-source preservation cannot be verified, retain conservative shared throttling and review an authenticated proxy design separately. No signed browser-supplied source is accepted.

Each login deletes up to 100 throttle records older than 24 hours using an indexed predicate. Configure a trusted hourly scheduler to run `pnpm --filter @outsaid/api auth:cleanup` after building: this removes old login and report-mutation throttles and sessions expired/revoked for more than 24 hours, including during idle periods. No public cleanup endpoint. A scheduler is not configured by this PR; until configured, idle records can remain longer. Treat scheduler setup as a pilot deployment gate for bounded retention.

## Development database procedure

1. Confirm the hostname, database/project and environment are a dedicated development database. Check `pnpm --filter @outsaid/api exec prisma migrate status` using DIRECT_URL before any changes. Never reset a shared database.
2. Review both committed migrations; explicitly run `pnpm db:migrate:deploy` against that target. Never run migrations during builds/previews. Existing foundation SQL, history triggers and editorial constraints are unchanged.
3. Review/apply `apps/api/prisma/operations/auth-runtime-role.sql` as database owner. It creates a NOLOGIN/NOBYPASSRLS group with auth-only grants and RLS policies. Give a separate backend LOGIN/INHERIT/NOBYPASSRLS role membership; supply its password securely using your database tooling. Do not use owner/superuser/BYPASSRLS privileges at runtime. Confirm role membership cannot escalate to an owner role.
4. The auth runtime group can SELECT User, and SELECT/INSERT/UPDATE/DELETE Session and LoginThrottle. This auth-only group cannot provision users, change roles, or read report tables. Session 03 adds a separate reviewed outsaid_reports_runtime membership; see reports.md. Provisioning uses a separate trusted operator connection.
5. Do not add `outsaid` to Supabase Data API exposed schemas or grant access to anon/authenticated/service_role. Verify dashboard settings and schema/table grants on the actual project.
6. Verify Prisma CRUD through the runtime transaction pooler, denied public access, and owner/role isolation. Use direct/session pooling for migrations only. This PR has no Supabase credentials and cannot verify these remote checks.

## Provisioning

On a trusted operator terminal, configure DATABASE_URL privately for the **intended database and provisioning operator**, then run:

```sh
pnpm --filter @outsaid/api auth:provision
```

No command-line arguments accepted; stdin/stdout must be a terminal. The CLI displays only host/port/database (no URL credentials), requires typing PROVISION, then asks for email, display name and role. Empty role means CONTRIBUTOR; MODERATOR/ADMIN require explicit entry. Password and confirmation use non-echoing terminal input, 12–128 characters. No default account, password reset, overwrite/upsert or public endpoint. Duplicate accounts fail generically. Restore the limited runtime connection afterward; do not deploy operator credentials.

## Verification commands and limits

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test
# Optional real Next rewrite and Python 3 POSIX pseudo-terminal CLI checks:
AUTH_TEST_WEB=1 AUTH_TEST_CLI=1 pnpm --filter @outsaid/api test
```

Default integration tests create a disposable in-memory PGlite PostgreSQL engine, execute unchanged migration SQL, and connect the real Prisma pg adapter via TCP. No persistence mocks. PGlite multiplexes a single PostgreSQL connection: concurrent two-client tests prove persisted counter behavior here, **not native PostgreSQL lock scheduling, Supabase pooling, TLS or Prisma migration-engine compatibility**. Native `prisma migrate status` against the standalone PGlite attempt did not succeed; no migration-engine verification is claimed.

For native PostgreSQL integration supply AUTH_TEST_DATABASE_URL referencing a new disposable database named `outsaid_auth_test_*`. Tests refuse an existing outsaid schema, execute the migration SQL, and never drop/reset the target; dispose of that test database separately afterward. Run this before release, along with actual `prisma migrate deploy/status` on development. PGlite is test-only, not production storage.

## Provisioning diagnostics follow-up

The CLI now identifies the failed stage and an allowlisted diagnostic category, including PASSWORD_LENGTH, PASSWORD_MISMATCH, DUPLICATE_ACCOUNT, DATABASE_AUTH, DATABASE_PERMISSION, DATABASE_SCHEMA, TLS_TRUST and CERTIFICATE_FILE. It never prints raw exception messages, SQL, driver metadata, connection strings, input passwords or hashes. Unknown driver errors retain only the stage and UNKNOWN. Account creation followed by cleanup failure is reported as created, preventing misleading retries.

If TLS_TRUST appears, download the CA certificate from your Supabase Database Settings and configure the runtime URL with `sslmode=verify-full&sslrootcert=certs/supabase-ca.crt`, placing that public CA file under apps/api/certs. Paths are relative to the API working directory; the file must also be available in any deployed runtime. Keep certificate validation enabled. A migration success with the Prisma schema engine does not prove TLS trust in the Node pg adapter.

## Session 03 report mutations

The same SessionGuard protects all private report reads/mutations; CSRF/Origin behavior is unchanged. LoginThrottle now also stores purpose-separated report account/action HMACs with creation/edit/submission budgets 20/120/20 per UTC hour. The existing cleanup CLI handles their 24-hour retention. Report grants are separate from auth grants; apply the reviewed development-only reports-runtime-role.sql and grant that group to the restricted backend login. No new auth environment variables or web secrets. See [private report operations](reports.md).
