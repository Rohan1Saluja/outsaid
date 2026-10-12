# API contracts

## Implemented

`GET /v1/health` → 200 `{"status":"ok","service":"outsaid-api"}`. No auth; no database query; no-store.

Errors use `{ "error": { "code": "HTTP_400", "message": "Request validation failed.", "details": ["..."] } }`. `details` is optional. Unexpected failures return `INTERNAL_ERROR` and a generic message. Do not serialize stack traces, Prisma records or untrusted request values.

## Implemented authentication (controlled pilot)

Browser callers use `/api/v1` through the existing web rewrite. All auth responses, including failures, are `Cache-Control: no-store`.

| Method/path | Input | Result |
| --- | --- | --- |
| POST /v1/auth/login | JSON `{email,password}` and exact allowed Origin | 200 `{user:{id,displayName,role}}` plus session cookie |
| GET /v1/auth/me | Session cookie | 200 `{user:{id,displayName,role}}`; current database role |
| GET /v1/auth/csrf | Session cookie | 200 `{csrfToken}` bound to that session |
| POST /v1/auth/logout | Session cookie, allowed Origin, `x-csrf-token` | 204, persisted revocation and expired cookie |

No `/auth/register` route exists. Public registration, email verification, password reset and email delivery are deferred. Trusted operators provision pilot accounts with the interactive CLI; accounts default to CONTRIBUTOR. Email ownership is not verified by this flow.

Login email is trimmed/lowercased; passwords are never normalized or trimmed. Login accepts 1–128 characters; provisioning requires 12–128. Unknown JSON fields are rejected. Incorrect password, nonexistent email and disabled user all return the same 401. Invalid input returns 400; missing/disallowed Origin or invalid session-bound CSRF returns 403; exhausted login budget returns 429; database/throttle failures return sanitized 503. Invalid, expired, revoked or disabled-user sessions return 401.

Only `id`, `displayName`, and `role` are serialized. No email, hash, private timestamps or session identifiers appear in user responses. CSRF tokens are returned only to authenticated requests; no permissive CORS is enabled. RolesGuard requires SessionGuard first and reads only its database-validated user. SessionGuard automatically enforces origin and CSRF on protected mutations.

See [authentication operations](authentication.md) for cookie settings, lifetimes, rate limits, provisioning, database roles and required deployment gates.

## Implemented private reports (Session 03)

Dates are ISO 8601 UTC strings; identifiers are UUIDs. Every route requires a valid current database-backed session. CONTRIBUTOR, MODERATOR and ADMIN can author, but each can access only their own reports. Another user's report returns 404 for every detail/mutation route, regardless of role. All responses, including failures, are uncached. Authenticated mutations use the existing exact Origin + session-bound x-csrf-token protections.

| Method/path | Input | Result |
| --- | --- | --- |
| POST /v1/reports | ReportContent: headline, body, locality?, claimBasis, sources | 201 PrivateReport; DRAFT / UNVERIFIED, version 1 |
| GET /v1/reports/mine | cursor?, limit? | 200 CursorPage<PrivateReportSummary>; default 20, maximum 100 |
| GET /v1/reports/:id | Own report UUID | 200 PrivateReport, otherwise 404 |
| PATCH /v1/reports/:id | Complete ReportContent + expectedVersion + changeSummary | 200 PrivateReport; atomic content/source replacement and revision; DRAFT only |
| POST /v1/reports/:id/submit | {expectedVersion} | 201 PrivateReport; SUBMITTED / UNVERIFIED, timestamp and version advanced, immutable snapshot |

PrivateReport contains id, headline, body, locality, claimBasis, sources (kind/label/url/notes), publicationStatus, verificationStatus, version, createdAt, updatedAt and submittedAt. PrivateReportSummary omits body, locality and sources. No author/editor identity, approval fields or full Prisma records are serialized. Reports remain private on submission and become read-only; no moderation/publication is implied.

Exact input limits: headline 5–200; body 20–20,000; optional locality 1–120 when provided; claimBasis ALLEGATION/EYEWITNESS_ACCOUNT/DOCUMENTED_INFORMATION; 1–10 source objects; source kind DOCUMENT/LINK/EYEWITNESS; label 5–200; URL max 2,048, absolute http/https with valid domain and no credentials (required for DOCUMENT/LINK); notes 20–1,000 when provided (required for EYEWITNESS); PATCH summary 5–500; expectedVersion integer 1–2,147,483,646. Combined canonical content/source JSON max 65,536 UTF-8 bytes. Unknown nested/top-level fields, including client owner/role/publication/verification/approval fields, are rejected. No uploads or URL fetching.

Collection order is createdAt DESC, id DESC, with exclusive timestamp/UUID cursor; edits do not reorder creation order. Cursor maximum 200 characters, malformed input 400, limit 1–100. A cursor is a position, not an ownership credential; author filtering always applies.

Errors: 400 invalid input/content; 401 invalid/disabled/revoked/expired session; 403 Origin/CSRF or denied role; 404 hidden/absent report; 409 stale version or read-only/duplicate transition; 429 durable hourly account budget; sanitized 503 database/limit storage failure. Creation/edit/submission have separate fixed UTC-hour budgets of 20/120/20, committed even if later report work fails. See [report operations](reports.md) for transactions, grants, retention, precise required fields and testing limitations.

## Proposed for later sessions (not implemented)

| Method/path | Intended access/behavior |
| --- | --- |
| GET /v1/public/reports | Public cursor page using human-reviewed immutable revisions and redacted DTOs |
| GET /v1/public/reports/:id | Reviewed public DTO or 404 |
| POST /v1/reports/:id/moderation | Explicit moderator/admin permission, exact revision approval, reason, expectedVersion, audit transaction |
| POST /v1/reports/:id/flags | Authenticated private flag acknowledgement |

Publishing requires human approval of the exact revision plus audit in one transaction. Verification changes remain separate explicit reviewed actions. Public DTOs must omit contributor identity, private notes, unreviewed sources and precise sensitive locations. These future contracts are design notes, not endpoint availability.
