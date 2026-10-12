# Architecture

## Request boundary
Browser requests `/api/v1/*` on the web origin. Next.js rewrites them to NestJS `/v1/*`. The browser never receives the upstream URL from the client helper. Next.js owns presentation and routing; NestJS owns all application decisions and database access.

The only implemented business-independent route is `GET /v1/health`. It returns the fixed `HealthResponse` contract and `Cache-Control: no-store`. It proves that Nest can handle an HTTP request, not that PostgreSQL is reachable. Unknown routes under `/v1` receive the shared error envelope. Routes outside that namespace return the adapter's 404 response.

Nest uses an explicit Express adapter, a global `v1` prefix, strict ValidationPipe (unknown DTO properties rejected, implicit conversion disabled, no target/value leak), and an exception filter. Unexpected errors are sanitized; logs deliberately omit raw errors, bodies and database URLs. Add structured request IDs and safe stage-specific diagnostics when real services are introduced.

## Workspaces
`@outsaid/contracts` exports TypeScript-only response/envelope/pagination types; it has no runtime or database dependencies. Future contracts are proposals in docs/api-contracts.md, not live routes. `@outsaid/config` provides strict compiler settings and shared lint rules. Web adds Next-specific rules and prohibits database/API imports.

Turborepo orchestrates independent apps; it tracks `API_ORIGIN` for web build caching. Prisma Client is generated into ignored API source and compiled alongside Nest. A generated client is reusable within one process; it contains no session/application state. No database connection is opened until a query is performed. The PostgreSQL driver pool is bounded to two connections per instance, with idle and acquisition timeouts, in addition to Supabase transaction pooling.

## Data model
All tables and enums live in `outsaid`, not an exposed Supabase schema.

| Model | Responsibility and invariants |
| --- | --- |
| User | Normalized unique email, password hash, role and deactivation timestamp |
| Session | Unique hashed opaque token, owner, expiration and revocation; no raw token |
| Report | Private working copy, owner, independent publication/verification states, version, approval/publication metadata |
| ReportSource | Private evidence link/document/eyewitness description; not automatically public |
| ReportRevision | Immutable numbered content and source snapshot; unique number within a report |
| ModerationEvent | Append-only actor, action, reason and status transition record |
| ContentFlag | Private flag, reporter, review status and resolver metadata |

Indexes support author collections, moderation queues, public publication order, session expiry and audit history. All future collections use bounded cursor pagination. Foreign keys preserve report/audit ownership; user deletion is restricted where it would erase reporting history. Session rows cascade on user deletion. Account disabling is separate from deletion.

The published revision composite foreign key prevents selecting another report's revision. SQL constraints require positive versions, valid session lifetimes, normalized email, source snapshot arrays, consistent approval/flag metadata, and approval + revision + timestamp for PUBLISHED. Append-only triggers prevent ordinary UPDATE/DELETE of revisions and moderation events. These SQL invariants supplement Prisma and are intentionally not all expressible in its schema.

A database FK does not prove a moderator approved content. Future backend transactions must check roles/ownership, freeze the reviewed revision, write the audit event, and transition publication together. Public DTOs must redact evidence and identity fields and read the approved revision, never the mutable draft. Changing the working copy must not silently change published content. These workflows are not implemented in Session 01.

## Privacy and access
The migration revokes PUBLIC schema/table privileges and enables RLS without public policies as defense in depth. Do not add `outsaid` to Supabase exposed schemas or grant `anon`/`authenticated` access. Use a backend-only database role configured by the operator; table-owner/migration privileges and runtime access must be reviewed before launch. RLS is not a substitute for Nest authorization; owner roles bypass it. No Supabase keys or SDKs belong in the web project.

Audit/revision immutability is for ordinary application writes; administrative maintenance can still alter data. A retention/redaction procedure for personal information must be designed before collecting real evidence. This is not a guarantee of anonymity or decentralized storage. Outsaid currently uses centrally hosted infrastructure.

## Intentionally absent
Auth/session guards, CSRF/origin enforcement, rate limiting, registration/login endpoints, public report queries, submission/moderation services, uploads and real news. A future session must implement and test the security controls before enabling the corresponding endpoint.
