-- Operator-reviewed development setup; NOT a migration/build hook.
-- Apply after existing auth-runtime-role.sql. Backend LOGIN keeps auth membership
-- and receives this group separately. Do not grant either group to public/Data API roles.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'outsaid_reports_runtime') THEN
    CREATE ROLE outsaid_reports_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA outsaid TO outsaid_reports_runtime;
GRANT SELECT ON outsaid."Report", outsaid."ReportSource", outsaid."ReportRevision" TO outsaid_reports_runtime;
GRANT INSERT (id, "authorId", headline, body, locality, "claimBasis", "createdAt", "updatedAt")
  ON outsaid."Report" TO outsaid_reports_runtime;
GRANT UPDATE (headline, body, locality, "claimBasis", version, "publicationStatus", "submittedAt", "updatedAt")
  ON outsaid."Report" TO outsaid_reports_runtime;
GRANT INSERT, DELETE ON outsaid."ReportSource" TO outsaid_reports_runtime;
GRANT INSERT ON outsaid."ReportRevision" TO outsaid_reports_runtime;
-- No Report DELETE, source UPDATE, revision UPDATE/DELETE, moderation/flag access,
-- schema creation, approval/verification writes or role-management privileges.
DROP POLICY IF EXISTS reports_runtime_read ON outsaid."Report";
CREATE POLICY reports_runtime_read ON outsaid."Report" FOR SELECT TO outsaid_reports_runtime USING (true);
DROP POLICY IF EXISTS reports_runtime_create ON outsaid."Report";
CREATE POLICY reports_runtime_create ON outsaid."Report" FOR INSERT TO outsaid_reports_runtime
  WITH CHECK ("publicationStatus" = 'DRAFT' AND "verificationStatus" = 'UNVERIFIED' AND version = 1
    AND "submittedAt" IS NULL AND "approvedById" IS NULL AND "approvedAt" IS NULL
    AND "publishedAt" IS NULL AND "publishedRevisionId" IS NULL);
DROP POLICY IF EXISTS reports_runtime_edit ON outsaid."Report";
CREATE POLICY reports_runtime_edit ON outsaid."Report" FOR UPDATE TO outsaid_reports_runtime
  USING ("publicationStatus" = 'DRAFT')
  WITH CHECK ("publicationStatus" IN ('DRAFT', 'SUBMITTED') AND "verificationStatus" = 'UNVERIFIED'
    AND (("publicationStatus" = 'DRAFT' AND "submittedAt" IS NULL) OR ("publicationStatus" = 'SUBMITTED' AND "submittedAt" IS NOT NULL))
    AND "approvedById" IS NULL AND "approvedAt" IS NULL AND "publishedAt" IS NULL AND "publishedRevisionId" IS NULL);
DROP POLICY IF EXISTS reports_runtime_source_read ON outsaid."ReportSource";
CREATE POLICY reports_runtime_source_read ON outsaid."ReportSource" FOR SELECT TO outsaid_reports_runtime USING (true);
DROP POLICY IF EXISTS reports_runtime_source_create ON outsaid."ReportSource";
CREATE POLICY reports_runtime_source_create ON outsaid."ReportSource" FOR INSERT TO outsaid_reports_runtime
  WITH CHECK (EXISTS (SELECT 1 FROM outsaid."Report" r WHERE r.id = "reportId" AND r."publicationStatus" = 'DRAFT'));
DROP POLICY IF EXISTS reports_runtime_source_remove ON outsaid."ReportSource";
CREATE POLICY reports_runtime_source_remove ON outsaid."ReportSource" FOR DELETE TO outsaid_reports_runtime
  USING (EXISTS (SELECT 1 FROM outsaid."Report" r WHERE r.id = "reportId" AND r."publicationStatus" = 'DRAFT'));
DROP POLICY IF EXISTS reports_runtime_revision_read ON outsaid."ReportRevision";
CREATE POLICY reports_runtime_revision_read ON outsaid."ReportRevision" FOR SELECT TO outsaid_reports_runtime USING (true);
DROP POLICY IF EXISTS reports_runtime_revision_append ON outsaid."ReportRevision";
CREATE POLICY reports_runtime_revision_append ON outsaid."ReportRevision" FOR INSERT TO outsaid_reports_runtime
  WITH CHECK (EXISTS (SELECT 1 FROM outsaid."Report" r WHERE r.id = "reportId" AND r."authorId" = "editorId"
    AND r.version = number AND r."publicationStatus" IN ('DRAFT', 'SUBMITTED')));
-- Example ONLY: GRANT outsaid_reports_runtime TO your_backend_login;
-- The shared backend role can read private reports. Nest ownership predicates remain
-- mandatory: RLS restricts operations/status, not the authenticated HTTP user's identity.
COMMIT;
