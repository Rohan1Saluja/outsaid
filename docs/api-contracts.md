# API contracts

## Implemented

`GET /v1/health` → 200 `{"status":"ok","service":"outsaid-api"}`. No auth; no database query; no-store.

Errors use `{ "error": { "code": "HTTP_400", "message": "Request validation failed.", "details": ["..."] } }`. `details` is optional. Unexpected failures return `INTERNAL_ERROR` and a generic message. Do not serialize stack traces, Prisma records or untrusted request values.

## Proposed for later sessions (not implemented)

Browser callers use `/api/v1` in place of `/v1`. All dates are ISO 8601 UTC strings; identifiers are UUID strings. Public responses are explicitly selected/redacted. Client-provided roles, ownership, approval or verification fields are never accepted.

### Authentication

| Method/path | Input | Intended result and access |
| --- | --- | --- |
| POST /v1/auth/register | `{ email, password, displayName }` | 201 safe current-user DTO; contribution eligibility/verification policy to be decided before enabling |
| POST /v1/auth/login | `{ email, password }` | 200 `{ user: { id, displayName, role } }`, session cookie; generic 401 on failure |
| GET /v1/auth/me | Session cookie | 200 safe current-user DTO or 401 |
| GET /v1/auth/csrf | Session cookie | 200 session-bound CSRF token, no-store |
| POST /v1/auth/logout | Session cookie + CSRF header | 204, revoke current database session and clear cookie |

Use Argon2id, random high-entropy opaque session tokens and SHA-256 token hashes in PostgreSQL. Cookies must be HttpOnly, Secure in deployed environments, host-only (no Domain), Path=/ and SameSite=Lax unless a documented flow requires otherwise; use a production `__Host-` name. Local HTTP needs a documented non-Secure development cookie name. Do not store auth tokens in localStorage. Verify exact allowed Origin on all auth mutations, including login/register, and session-bound CSRF tokens on authenticated mutations. Do not trust forwarded headers as an origin allowlist. Configure exact preview web origins separately.

Database sessions require expiration/revocation checks and disabled-user checks on every authenticated request. Authorization uses current server-side role/ownership. Auth responses are no-store. Login/registration throttling must work across serverless instances. Session duration, password rules, registration eligibility, email verification and reset flows need a Session 02 decision. No route listed here grants access today.

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
