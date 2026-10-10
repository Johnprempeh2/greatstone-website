-- Rollback of 0037_client_portal.sql (GRE-1255). Removes only what 0037 adds; no existing table changes.
--
-- Before running:
--   1. If any real acceptances exist, export them first (Studio → portal_acceptances → export CSV, plus
--      portal_audit). This script refuses to run while portal_acceptances has rows unless you set
--        SET portal.rollback_drop_acceptances = 'on';
--      in the same session, as a deliberate second step.
--   2. Empty and delete the bucket 'portal-files' through the Storage API or dashboard. Supabase refuses
--      direct deletes from the storage tables, so this script only removes the bucket's policies.
--
-- Run in one transaction:  psql "$DB_URL" -1 -f supabase/rollback/0037_client_portal_down.sql

DO $$
BEGIN
  IF to_regclass('public.portal_acceptances') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.portal_acceptances)
     AND coalesce(current_setting('portal.rollback_drop_acceptances', true), '') <> 'on' THEN
    RAISE EXCEPTION 'portal_acceptances has rows: export them, then SET portal.rollback_drop_acceptances = ''on''';
  END IF;
END $$;

DROP POLICY IF EXISTS portal_files_staff_write ON storage.objects;
DROP POLICY IF EXISTS portal_files_staff_read ON storage.objects;

DROP FUNCTION IF EXISTS portal_withdraw(uuid);
DROP FUNCTION IF EXISTS portal_publish(uuid, text);
DROP FUNCTION IF EXISTS portal_accept(uuid, text, text, text, boolean);

-- takes the table's row type, so it goes before the table
DROP FUNCTION IF EXISTS portal_content_sha256(public.portal_documents);

-- dropping the tables drops their triggers and policies
DROP TABLE IF EXISTS public.portal_audit;
DROP TABLE IF EXISTS public.portal_acceptances;
DROP TABLE IF EXISTS public.portal_documents;

DROP FUNCTION IF EXISTS portal_append_only();
DROP FUNCTION IF EXISTS portal_acceptances_audit();
DROP FUNCTION IF EXISTS portal_documents_audit();
DROP FUNCTION IF EXISTS portal_actor_kind(text);
DROP FUNCTION IF EXISTS portal_documents_before_update();
DROP FUNCTION IF EXISTS portal_documents_before_insert();
DROP FUNCTION IF EXISTS portal_demos_valid(jsonb);
