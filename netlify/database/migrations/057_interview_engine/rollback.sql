-- Rollback for 057_interview_engine. Turn the interview functions off first; this deletes every interview row
-- (rounds, people, transcripts, synthesis). Export what must be kept before running it.
-- engagement's FK to public.customers and memory_blob's go with the schema; public.customers is untouched.
DROP SCHEMA IF EXISTS interview CASCADE;
-- ltree was added for org_unit.path only; RESTRICT keeps it if anything else has come to use it.
DROP EXTENSION IF EXISTS ltree;
REVOKE EXECUTE ON FUNCTION auth.jwt() FROM interview_worker;
REVOKE USAGE ON SCHEMA auth FROM interview_worker;
REVOKE USAGE ON SCHEMA public FROM interview_worker;
REVOKE interview_worker FROM CURRENT_USER;
-- The role is cluster-wide: keep it if anything still depends on it.
DO $$ BEGIN DROP ROLE IF EXISTS interview_worker;
EXCEPTION WHEN dependent_objects_still_exist THEN RAISE NOTICE 'interview_worker kept: other objects depend on it'; END $$;
