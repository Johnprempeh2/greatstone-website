-- Removes the bridge's commerce settings writes. Deploy admin-bridge without these routes first (and without the
-- engagements read resource). Rows written through the bridge, and their audit and change rows, stay. The change
-- log and the receipt audit go back to 049's and 039's bodies.
DROP FUNCTION IF EXISTS public.bridge_receipt_requeue(uuid);
DROP FUNCTION IF EXISTS public.bridge_tier_edit(uuid, jsonb);
DROP FUNCTION IF EXISTS public.bridge_tier_create(jsonb);
DROP FUNCTION IF EXISTS public._bridge_tier_json(uuid, uuid);
DROP FUNCTION IF EXISTS public.bridge_licence_set_status(uuid, integer, text);
DROP FUNCTION IF EXISTS public.bridge_licence_edit(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.bridge_licence_issue(uuid, jsonb);
DROP FUNCTION IF EXISTS public._bridge_licence_json(uuid, uuid);
DROP FUNCTION IF EXISTS public.bridge_engagement_delete(uuid, integer);
DROP FUNCTION IF EXISTS public.bridge_engagement_set_status(uuid, integer, text);
DROP FUNCTION IF EXISTS public.bridge_engagement_edit(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.bridge_engagement_create(uuid, jsonb);
DROP FUNCTION IF EXISTS public._bridge_engagement_lock(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public._bridge_engagement_json(uuid, uuid);
DROP FUNCTION IF EXISTS public.bridge_customer_edit(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.bridge_customer_create(jsonb);
DROP FUNCTION IF EXISTS public._bridge_customer_tier(uuid, text, uuid);
DROP FUNCTION IF EXISTS public._bridge_customer_json(uuid, uuid);
DROP FUNCTION IF EXISTS public.bridge_lead_delete(uuid);
DROP FUNCTION IF EXISTS public.bridge_enquiry_set_status(text, uuid, text, integer);
DROP FUNCTION IF EXISTS public.bridge_order_licence_email(uuid);
DROP FUNCTION IF EXISTS public.bridge_order_set_status(uuid, text, integer);
DROP FUNCTION IF EXISTS public._bridge_log_row(text, uuid, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public._bridge_expect_version(integer, integer);

DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.customers;
DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.engagements;
DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.licence_keys;
DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.customer_tiers;

DROP POLICY IF EXISTS gsam_bridge_read ON public.engagements;
DROP POLICY IF EXISTS gsam_bridge_read_scope ON public.engagements;
REVOKE SELECT ON public.engagements FROM gsam_bridge_read;
REVOKE SELECT (row_version) ON public.customers FROM gsam_bridge_read;
REVOKE SELECT (row_version) ON public.licence_keys FROM gsam_bridge_read;

CREATE OR REPLACE FUNCTION admin_bridge_log_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_audit uuid;
BEGIN
  IF c IS NULL OR c ->> 'role' IS DISTINCT FROM 'gsam_bridge' OR c ->> 'cap' IS DISTINCT FROM 'write' THEN RETURN NULL; END IF;
  SELECT audit_id INTO v_audit FROM app_bridge_open_audit('write');
  IF v_audit IS NULL THEN RAISE EXCEPTION 'bridge write with no open audit row' USING ERRCODE = 'GB003'; END IF;
  INSERT INTO admin_bridge_change (audit_id, table_name, row_id, op, before, after)
    VALUES (v_audit, TG_TABLE_NAME, CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END, lower(TG_OP),
            CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'search_tsv' - 'stripe_payment_intent' END,
            CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'search_tsv' - 'stripe_payment_intent' END);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION admin_bridge_log_change() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION portal_receipt_jobs_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event    text;
  v_requeue  boolean := coalesce(current_setting('portal.requeue', true), '') = 'on';
  v_document uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'receipt_queued';
  ELSIF v_requeue THEN
    v_event := 'receipt_requeued';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := CASE NEW.status WHEN 'sent' THEN 'receipt_sent'
                               WHEN 'failed' THEN 'receipt_failed'
                               WHEN 'queued' THEN 'receipt_retry'
                               ELSE NULL END;          -- queued → sending is the worker claiming it
  END IF;
  IF v_event IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT a.document_id INTO v_document FROM public.portal_acceptances a WHERE a.id = NEW.acceptance_id;
  INSERT INTO public.portal_audit (org_id, customer_id, actor_kind, actor_id, event, document_id, detail)
  VALUES (NEW.org_id, NEW.customer_id, CASE WHEN v_requeue THEN 'staff' ELSE 'system' END, auth.uid()::text,
          v_event, v_document,
          jsonb_build_object('acceptance_id', NEW.acceptance_id, 'job_id', NEW.id, 'attempts', NEW.attempts));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION portal_receipt_jobs_audit() FROM public, anon, authenticated;
