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

## Proposed for later sessions (not implemented)

Dates are ISO 8601 UTC strings; identifiers are UUID strings. Public responses must be explicitly selected/redacted. Client-provided roles, ownership, approval or verification fields are never accepted.

### Reports and moderation

| Method/path | Input / access | Intended result |
| --- | --- | --- |
| POST /v1/reports | Eligible contributor; `{ headline, body, locality?, claimBasis, sources }` | 201 private DRAFT DTO |
| GET /v1/reports/mine | Authenticated owner; `cursor?`, `limit?` | Cursor page of own private reports |
| GET /v1/reports/:id | Owner or moderator/admin | Private role-appropriate DTO, otherwise 404 |
| PATCH /v1/reports/:id | Owner, editable state; content + expected `version` | New immutable revision; 409 on stale/conflicting version |
| POST /v1/reports/:id/submit | Owner + expected `version` | Transition eligible draft to SUBMITTED; still private |
| GET /v1/public/reports | Public; `cursor?`, `limit?` | Only PUBLISHED records using reviewed revision and redacted DTO |
| GET /v1/public/reports/:id | Public | Reviewed public DTO or 404 |
| POST /v1/reports/:id/moderation | Moderator/admin; `{ action, reason, revisionId, expectedVersion }` | Transactional authorized transition + audit |
| POST /v1/reports/:id/flags | Authenticated; `{ reason, details? }` | 201 private flag acknowledgement |

Default limit 20, maximum 100; deterministic `(timestamp, id)` cursors. Bound string/source counts and validate URL schemes in DTOs. No server-side source fetching without SSRF controls. All mutations require origin/CSRF protection where authenticated and persistent submission throttles. Error cases include 400 invalid input, 401 unauthenticated, 403 forbidden, 404 hidden/nonexistent, 409 stale/invalid transition and 429 rate limit. Public DTOs must omit author IDs/emails, session fields, private notes, unreviewed source snapshots and precise sensitive location data.

Publishing requires human approval of the exact revision plus audit in one transaction. Verification changes are separate explicit reviewed actions. Once published, draft changes cannot alter the public snapshot until reviewed again. These contracts are a design handoff, not feature implementations or promises of endpoint availability.
