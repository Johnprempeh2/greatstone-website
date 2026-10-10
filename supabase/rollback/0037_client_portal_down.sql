-- Rollback of 0037_client_portal.sql (GRE-1255). Removes only what 0037 adds; no existing table changes.
--
-- Before running:
--   1. If any real acceptances exist, export them first (Studio → portal_acceptances, portal_approvals,
--      portal_receipt_jobs and portal_audit → export CSV). This script refuses to run while
--      portal_acceptances or portal_approvals has rows unless you set
--        SET portal.rollback_drop_acceptances = 'on';
--      in the same session, as a deliberate second step.
--   2. Empty and delete the bucket 'portal-files' through the Storage API or dashboard. Supabase refuses
--      direct deletes from the storage tables, so this script only removes the bucket's policies.
--
-- Run in one transaction:  psql "$DB_URL" -1 -f supabase/rollback/0037_client_portal_down.sql

DO $$
DECLARE t text; n bigint := 0; m bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['portal_acceptances','portal_approvals'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO m;
      n := n + m;
    END IF;
  END LOOP;
  IF n > 0 AND coalesce(current_setting('portal.rollback_drop_acceptances', true), '') <> 'on' THEN
    RAISE EXCEPTION 'portal acceptances or approvals have rows: export them, then SET portal.rollback_drop_acceptances = ''on''';
  END IF;
END $$;

-- the receipt worker's cron job, if John scheduled it (pg_cron is not on every database)
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE $q$SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'portal-receipt-worker'$q$;
  END IF;
END $$;

DROP POLICY IF EXISTS portal_files_staff_write ON storage.objects;
DROP POLICY IF EXISTS portal_files_staff_read ON storage.objects;

DROP FUNCTION IF EXISTS portal_requeue_receipt(uuid);
DROP FUNCTION IF EXISTS portal_withdraw(uuid);
DROP FUNCTION IF EXISTS portal_approve_and_publish(uuid, text, text);
DROP FUNCTION IF EXISTS portal_accept(uuid, text, text, boolean);

-- takes the table's row type, so it goes before the table
DROP FUNCTION IF EXISTS portal_content_hash(public.portal_documents);

-- dropping the tables drops their triggers and policies; documents and approvals point at each other
ALTER TABLE IF EXISTS public.portal_documents DROP COLUMN IF EXISTS approval_id;
DROP TABLE IF EXISTS public.portal_audit;
DROP TABLE IF EXISTS public.portal_receipt_jobs;
DROP TABLE IF EXISTS public.portal_acceptances;
DROP TABLE IF EXISTS public.portal_approvals;
DROP TABLE IF EXISTS public.portal_approvers;
DROP TABLE IF EXISTS public.portal_documents;

DROP FUNCTION IF EXISTS portal_append_only();
DROP FUNCTION IF EXISTS portal_receipt_jobs_audit();
DROP FUNCTION IF EXISTS portal_acceptances_after_insert();
DROP FUNCTION IF EXISTS portal_approvals_audit();
DROP FUNCTION IF EXISTS portal_documents_audit();
DROP FUNCTION IF EXISTS portal_actor_kind(text);
DROP FUNCTION IF EXISTS portal_receipt_jobs_before_update();
DROP FUNCTION IF EXISTS portal_documents_before_update();
DROP FUNCTION IF EXISTS portal_documents_before_insert();
DROP FUNCTION IF EXISTS portal_demos_valid(jsonb);
