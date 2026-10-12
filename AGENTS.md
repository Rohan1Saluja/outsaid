# Outsaid engineering instructions

## Mission and scope
Independent, community-powered public-interest news, initially Delhi NCR. Apply identical editorial standards across political affiliations. Do not fabricate reports, evidence, sources, or claims of verification.

Work only on the current session. Session 03 adds private author drafting, immutable revisions and submission for human review. Publishing, moderation UI, uploads and public registration remain out of scope. Do not silently implement later work.

## Architecture
- pnpm/Turborepo, strict TypeScript, Next.js App Router + Tailwind (shadcn/ui when interactive components are needed), NestJS Express REST + class-validator, Prisma + Supabase PostgreSQL.
- Browser → web `/api/v1/*` rewrite → API `/v1/*` → Prisma → private PostgreSQL.
- `apps/web` owns presentation only. Never import Prisma, a Supabase SDK, API internals, database credentials, or business logic there.
- `apps/api` owns validation, auth, authorization, persistence, moderation, audit, and rate limits. All permissions must be enforced here.
- Shared packages contain wire contracts and config only. Never share ORM models as API responses.
- All application tables belong to the private `outsaid` schema. Never expose it through Supabase Data API.

## Security and editorial boundaries
- Auth: Argon2id, random opaque tokens, database-backed sessions storing only token hashes, expiration and revocation; Secure/HttpOnly/host-only cookies, suitable SameSite, same-origin proxy, CSRF + origin checks for mutations. No localStorage tokens or in-memory sessions.
- Implement rate limits using durable infrastructure before enabling login/submission. CORS is not authentication or CSRF protection.
- Unreviewed reports remain private. Human review precedes publication; popularity or AI output is never verification.
- Keep publication and verification states independent; distinguish claims and evidence. Public reads must use an approved immutable revision and explicit redacted DTOs.
- Preserve revision and moderation history. Never expose private identities, evidence notes, precise at-risk locations, secrets, or raw exception details.
- Do not promise anonymity. Minimize personal data and implement a considered retention/redaction policy.

## Session workflow
1. Inspect branch, commits, AGENTS.md, relevant code and docs/handoff.md before editing.
2. Use the assigned dedicated branch. Preserve working code, migrations and unrelated history.
3. Implement only the assigned acceptance criteria; document out-of-scope issues.
4. Run install, lint, typecheck, build and relevant tests/smoke checks. Consult official docs for version-sensitive behavior.
5. Update docs/handoff.md with actual evidence and limitations.
6. Open a focused PR against main. Do not merge or deploy to production without explicit authorization.

No force-push, committed secrets/.env files, automatic production migrations in builds, or persistent process state. Use Supabase pooling at runtime; use DIRECT_URL only for explicit migration operations. SQL constraints and append-only triggers in migrations supplement Prisma and must be preserved.

## Completion report
Status (Complete/Partial/Blocked), actual PR link, implemented changes, verified results, actual deployment status, blockers, handoff, next session. Never claim a check or deployment happened without evidence.
