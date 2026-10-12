# Private report drafting and submission (Session 03)

## Boundary and editorial meaning

All five report routes require the existing database-backed SessionGuard followed by RolesGuard. Provisioned CONTRIBUTOR, MODERATOR and ADMIN users can author reports. Every role can access only its own reports in this session: Nest queries include authorId, and another user's UUID returns the same 404 as an absent report. No public report endpoint, moderation UI or publication transition is implemented.

Drafts are DRAFT / UNVERIFIED. Submission advances only publicationStatus to SUBMITTED, sets submittedAt and creates another immutable content/source revision. It does not confer factual verification, human approval or publication. Submitted reports are read-only. Contributor actions never write ModerationEvent.

The contributor chooses an explicit claim basis. Forms ask contributors to attribute allegations, describe direct observations and explain document provenance/context; selecting DOCUMENTED_INFORMATION does not establish factual corroboration. Only broad locality is requested. Guidance discourages witness identities, coordinates, addresses and real-time sensitive locations; anonymity is not guaranteed. Saved content and source descriptions remain in immutable private history. Operational retention/redaction review remains necessary before real evidence collection.

## Inputs and limits

All content fields must be present on creation and PATCH, except locality. PATCH replaces the complete content/source collection; it is not a partial-field merge. Strings are trimmed except URLs, which must already be valid. Whitespace-only required fields fail. Optional locality/URL/notes may be omitted or null subject to the conditional source requirements below. Unknown top-level and nested properties are rejected.

| Field | Rules |
| --- | --- |
| headline | Required string, 5–200 characters |
| body | Required string, 20–20,000 characters |
| locality | Optional/null string, 1–120 characters when provided; broad locality only |
| claimBasis | ALLEGATION, EYEWITNESS_ACCOUNT or DOCUMENTED_INFORMATION |
| sources | Required array, 1–10 objects |
| source.kind | DOCUMENT, LINK or EYEWITNESS; OTHER is not accepted in this authoring session |
| source.label | Required string, 5–200 characters |
| source.url | Required for DOCUMENT/LINK; optional for EYEWITNESS. Maximum 2,048 characters; absolute http/https URL with a valid domain, no embedded credentials |
| source.notes | Required eyewitness description; optional context for DOCUMENT/LINK. 20–1,000 characters when provided |
| expectedVersion | Required on PATCH and submit; integer 1–2,147,483,646, no coercion from strings |
| changeSummary | Required on PATCH, trimmed string, 5–500 characters |
| Combined content + sources | Maximum 65,536 bytes of canonical UTF-8 JSON, including field names/nulls; checked on creation, edit and submission |
| mine.limit | Optional decimal query string; default 20, range 1–100 |
| mine.cursor | Opaque base64url JSON tuple of createdAt ISO timestamp and UUID; maximum 200 characters; malformed input returns 400 |

No file uploads or server-side URL fetching occur. A reference URL is untrusted attribution, not validated evidence. URL content is not inspected, endorsed or corroborated. Existing Express JSON transport parsing also bounds request bodies; the 64 KiB application content limit is separate.

The only private content response is PrivateReport: id, headline, body, locality, claimBasis, sources (kind/label/url/notes), publicationStatus, verificationStatus, version, createdAt, updatedAt and submittedAt. The /mine summary omits body, locality and sources. Explicit Prisma selections and serialization omit author/editor identities, source IDs, passwords, emails, session data, approval metadata and internal records. All API responses/errors stay no-store; no content/token is stored in localStorage. The static web shell contains no report content; authenticated data is fetched through /api/v1.

## Transactions and concurrency

Creation writes the report, source rows and revision 1 in a single Prisma transaction. Edit checks ownership, DRAFT and expectedVersion, then performs conditional UPDATE with all three predicates before changing sources. PostgreSQL rechecks the predicate after competing updates release their row lock; zero updated rows means 409. Content, sources, version increment and new revision commit together.

ReportSource has only an outbound report foreign key; no revision references its ID. Edit deletes/recreates current source rows after acquiring the report lock. Existing revision JSON snapshots retain removed source content. Returned sources and snapshots use deterministic source-ID order; source order is not user-significant and can change after replacement.

Submit acquires the same conditional report UPDATE lock before reading sources, revalidates persisted content, writes the submitted snapshot and commits the status/timestamp/version together. Invalid legacy content or failed revision insert rolls back everything. Duplicate or competing submissions return 409; an edit racing submission has one winner. Report versions and revision numbers remain aligned. Existing unique constraints, append-only triggers, composite published-revision FK and independent verification/publication invariants remain unchanged.

There is no schema change or new migration. Neither builds nor tests mutate an external Supabase project. Test SQL executes only on a newly created disposable engine/database.

## Persistent mutation budgets

Existing LoginThrottle also stores report budgets under purpose-separated HMAC-SHA256 keys `report:<action>:<account UUID>` using AUTH_SECRET. Raw account IDs, emails, IPs and report content never enter throttle rows. No browser-provided identity determines the limit. There are no in-memory counters.

| Action | Budget per authenticated account | Window |
| --- | --- | --- |
| Creation | 20 requests | Fixed UTC hour |
| Editing | 120 requests | Fixed UTC hour |
| Submission | 20 requests | Fixed UTC hour |

Budgets are separate from login throttles. Atomic upsert, bounded cleanup and counter commit run before the report transaction; denied budgets and subsequent 404/409/database failures still consume an attempt. Requests rejected by auth/origin/CSRF/DTO validation do not consume report counters. JSON size validation is in the service, so over-budget content attempts do consume a counter. Storage failure returns sanitized 503 before any report write. 429 follows committed counters; it is never thrown inside the counter transaction. Fixed windows permit a boundary burst of up to twice each budget. AUTH_SECRET rotation changes rate-limit identities as documented for authentication.

Per-mutation cleanup removes up to 100 rows older than 24 hours. The existing trusted hourly `auth:cleanup` CLI removes both auth and report throttle rows during idle periods; no public cleanup endpoint is added. A scheduler remains a deployment gate, not a configured service in this PR.

## Reviewed development permissions

1. Independently confirm a dedicated development target and inspect `prisma migrate status` using private DIRECT_URL. Do not reset a shared database, apply production SQL or run migrations during builds.
2. Session 01/02 migrations must be applied; there are no Session 03 migration files.
3. As trusted development owner, review/apply `apps/api/prisma/operations/reports-runtime-role.sql`, after the existing auth operations SQL. Inspect existing role memberships/table grants first; a broader existing grant would override column restrictions.
4. Grant the new NOLOGIN / NOBYPASSRLS group `outsaid_reports_runtime` to the existing restricted backend LOGIN. Keep its separate `outsaid_auth_runtime` membership. Example with the user's reported login: `GRANT outsaid_reports_runtime TO outsaid_backend;`. This membership is an explicit operator action, not executed remotely by this session.
5. Report INSERT grants exclude approval/verification/status/version fields, which receive private defaults. UPDATE grants allow only content, version, submittedAt/publicationStatus and updatedAt. RLS permits DRAFT edits and a private UNVERIFIED SUBMITTED transition, rejects publication/approval, and makes submitted sources read-only. Revisions have SELECT/INSERT only and retain append-only triggers. No Report DELETE, source UPDATE, ModerationEvent/ContentFlag access, schema CREATE, role management, owner/superuser/BYPASSRLS or unrestricted schema grant.
6. The backend database group can read private reports across authors. It does not know the HTTP user's identity. Nest ownership predicates are mandatory and are independently tested with the restricted connection. RLS limits the role's operations; it does not replace application authorization.
7. Never grant these groups to Supabase anon/authenticated/service_role, expose outsaid through the Data API, or place backend/operator credentials in the frontend. Independently inspect real Supabase settings and connection-pool/TLS behavior before release.

No new environment variables or integration accounts are needed. DATABASE_URL remains restricted-runtime/API-only, with the user's configured CA-based TLS verification; DIRECT_URL stays operator-only. Do not disable certificate verification.

## Reproducible verification and limits

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm db:validate
AUTH_TEST_WEB=1 AUTH_TEST_CLI=1 REPORT_TEST_WEB=1 pnpm --filter @outsaid/api test
```

Default report tests execute the existing migration SQL and both role-setup scripts in a fresh PGlite PostgreSQL engine, connect through TCP with real Prisma pg adapters, and serve the app as a restricted LOGIN/INHERIT/NOBYPASSRLS role. Provisioning/assertions use a separate test owner connection. No persistence is mocked. Tests cover ownership, safe serialization, session lifecycle/current roles, origin/session CSRF, validation/byte limits, append-only snapshots, conflicts, concurrent requests, induced database rollback, deterministic pagination, persistent limits/cleanup/failure, runtime/public permissions and actual Next rewrite transport.

For native PostgreSQL, privately set REPORT_TEST_DATABASE_URL to a new disposable database named `outsaid_reports_test_<suffix>` using its test-owner credentials. The suite refuses an existing outsaid schema, never drops/resets the database, creates uniquely named test roles and leaves native disposal to the operator. Existing auth tests use their separate AUTH_TEST_DATABASE_URL / outsaid_auth_test_* target. These variables are test-only and must never refer to shared or production databases. The role tests assume test-owner CREATE ROLE privilege; do not grant this to the production runtime login.

PGlite uses real PostgreSQL persistence semantics but a single-connection multiplexer. Its concurrency results are not native PostgreSQL lock-scheduling, Supabase TLS, transaction-pool or migration-engine verification. Those checks remain unverified without an isolated native target. Desktop/mobile keyboard/dialog/navigation QA remains unverified when Chromium cannot be installed. Unsaved-change guidance is always visible; beforeunload and intercepted links prompt where the browser permits. SPA history/back gestures can still discard text; browser-local drafts are deliberately not retained.

User-reported Supabase migrations/auth grants/provisioning/local login results are recorded in handoff as user reports, not independent agent evidence. No Vercel environment changes, production checks, remote migrations, merge or deployment were performed in Session 03.
