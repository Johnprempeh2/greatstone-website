-- Rollback for 002_auth_bridge. Only before 003 is applied: every later migration depends on it. The roles stay
-- (they are cluster-wide, and 001 uses anon).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
DROP SCHEMA IF EXISTS storage CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
