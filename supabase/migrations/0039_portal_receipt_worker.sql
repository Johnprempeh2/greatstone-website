-- 0039 — client portal, phase 1b: the three database calls the screens and the receipt worker need (GRE-1256;
-- spec GRE-1227 revision 2, sections 3 and 7). No new table, no change to 0037's tables or policies.
--
--   portal_is_approver()            the studio asks "may the signed-in person approve?", so Approve and publish
--                                   is shown only to the registered approver. Answers for the caller only;
--                                   portal_approvers itself stays out of reach of every API role.
--   portal_claim_receipt_jobs(n)    the receipt worker (service role only) first returns jobs stuck in
--                                   'sending' for more than 10 minutes to the queue, then claims up to n due jobs
--                                   with FOR UPDATE SKIP LOCKED: status 'sending', attempts + 1. Two workers
--                                   running at once never claim the same job.
--   portal_receipt_document(id)     the receipt page shows the title of what was accepted even after that version
--                                   was superseded or withdrawn (a client reads only published rows). Returns
--                                   title, kind, version and status for an acceptance of the caller's own company
--                                   (or, for staff, of their org); nothing for anyone else.
--
-- Re-runnable. Rollback: supabase/rollback/0039_portal_receipt_worker_down.sql.

CREATE OR REPLACE FUNCTION portal_is_approver() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT auth.uid() IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.portal_approvers r WHERE r.auth_user_id = auth.uid())
  $$;

CREATE OR REPLACE FUNCTION portal_claim_receipt_jobs(p_limit integer DEFAULT 10)
  RETURNS SETOF public.portal_receipt_jobs
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- a worker that died mid-send leaves its job in 'sending'; give it back (audited as receipt_retry). The send
  -- carries the idempotency key, so a resend of an email that did go out is dropped by Resend.
  UPDATE public.portal_receipt_jobs
     SET status = 'queued', next_attempt_at = now()
   WHERE status = 'sending' AND updated_at < now() - interval '10 minutes';
  RETURN QUERY
    UPDATE public.portal_receipt_jobs j
       SET status = 'sending', attempts = j.attempts + 1
     WHERE j.id IN (SELECT q.id FROM public.portal_receipt_jobs q
                     WHERE q.status = 'queued' AND q.next_attempt_at <= now()
                     ORDER BY q.next_attempt_at
                     LIMIT greatest(1, least(coalesce(p_limit, 10), 50))
                     FOR UPDATE SKIP LOCKED)
    RETURNING j.*;
END;
$$;

CREATE OR REPLACE FUNCTION portal_receipt_document(p_acceptance_id uuid)
  RETURNS TABLE (document_id uuid, title text, kind text, version integer, status text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT d.id, d.title, d.kind, d.version, d.status
      FROM public.portal_acceptances a
      JOIN public.portal_documents d ON d.id = a.document_id
     WHERE a.id = p_acceptance_id
       AND (a.customer_id = app_customer_id() OR a.org_id = app_staff_org())
  $$;

REVOKE ALL ON FUNCTION portal_receipt_document(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION portal_receipt_document(uuid) TO authenticated;
REVOKE ALL ON FUNCTION portal_is_approver() FROM public, anon;
GRANT EXECUTE ON FUNCTION portal_is_approver() TO authenticated;
REVOKE ALL ON FUNCTION portal_claim_receipt_jobs(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_claim_receipt_jobs(integer) TO service_role;

-- ── deploy steps for John (not run by this migration) ─────────────────────────────────────────
-- 1. Deploy the worker:  supabase functions deploy portal-receipt-worker --no-verify-jwt
--    Function secrets: RESEND_API_KEY, RESEND_FROM, PORTAL_RECEIPT_TO (Greatstone owner address, comma list),
--    PORTAL_WORKER_SECRET (any long random string; the cron call below sends it), optional APP_SITE_ORIGIN.
-- 2. Store the same secret in Vault and schedule the worker every minute (pg_cron + pg_net):
--      SELECT vault.create_secret('<the PORTAL_WORKER_SECRET value>', 'portal_worker_secret');
--      SELECT cron.schedule('portal-receipt-worker', '* * * * *', $cron$
--        SELECT net.http_post(
--          url := 'https://<project-ref>.supabase.co/functions/v1/portal-receipt-worker',
--          headers := jsonb_build_object('content-type', 'application/json', 'x-portal-worker-secret',
--            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'portal_worker_secret')),
--          body := '{}'::jsonb)
--      $cron$);
