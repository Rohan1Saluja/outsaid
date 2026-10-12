-- Operator-reviewed setup, NOT an application migration. Run as the development
-- database owner after migrations. Supply login membership separately; no passwords here.
-- Group role has no login and only the authentication capabilities needed in Session 02.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'outsaid_auth_runtime') THEN
    CREATE ROLE outsaid_auth_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA outsaid TO outsaid_auth_runtime;
GRANT SELECT ON outsaid."User" TO outsaid_auth_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON outsaid."Session", outsaid."LoginThrottle" TO outsaid_auth_runtime;
DROP POLICY IF EXISTS auth_runtime_user_read ON outsaid."User";
CREATE POLICY auth_runtime_user_read ON outsaid."User" FOR SELECT TO outsaid_auth_runtime USING (true);
DROP POLICY IF EXISTS auth_runtime_sessions ON outsaid."Session";
CREATE POLICY auth_runtime_sessions ON outsaid."Session" TO outsaid_auth_runtime USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS auth_runtime_throttles ON outsaid."LoginThrottle";
CREATE POLICY auth_runtime_throttles ON outsaid."LoginThrottle" TO outsaid_auth_runtime USING (true) WITH CHECK (true);
-- Example ONLY, replace with your dedicated backend LOGIN role (INHERIT, NOBYPASSRLS):
-- GRANT outsaid_auth_runtime TO your_backend_login;
-- Do NOT grant this membership to anon, authenticated, service_role or a frontend role.
-- Provisioning uses a separate trusted owner/operator connection, not this runtime login.
