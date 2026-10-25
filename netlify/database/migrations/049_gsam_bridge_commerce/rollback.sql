-- Remove the write and refund_request keys from GSAM_BRIDGE_KEYS and redeploy before rolling this migration back.
-- To turn write or refund off without a redeploy, revoke instead:
--   REVOKE EXECUTE ON FUNCTION admin_bridge_begin_write(text, text, bigint, text, uuid, text, text, text, text) FROM gsam_bridge_write;
--   REVOKE EXECUTE ON FUNCTION admin_bridge_begin_refund(text, text, bigint, text, uuid, text, text, text, text) FROM gsam_bridge_refund;
-- refund_requests, the change log and the idempotency rows go with their tables: export them first if they are
-- still needed. The read capability (048) keeps working.

-- the staff functions get their 012 and 014 bodies back
CREATE OR REPLACE FUNCTION convert_quote_to_order(p_quote_id uuid)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := app_staff_org();
  q quotes%ROWTYPE;
  v_oid uuid; v_sub bigint; v_total bigint; v_inv text;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'not authorised (catalogue editor only)'; END IF;
  SELECT * INTO q FROM quotes WHERE id = p_quote_id AND org_id = v_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'quote not found'; END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE quote_id = p_quote_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'quote already converted to an order';
  END IF;
  SELECT COALESCE(sum(COALESCE(captured_price_minor, 0) * qty), 0) INTO v_sub FROM quote_items WHERE quote_id = p_quote_id;
  -- inc-VAT total: the staff's finalised figure if set, else subtotal + 20% VAT
  v_total := COALESCE(q.quoted_total_minor, round(v_sub * 1.20));
  v_inv := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_no_seq')::text, 5, '0');
  INSERT INTO orders(org_id, reference, quote_id, customer_id, customer_user_id, customer_email, status, currency, subtotal_minor, total_minor, po_reference, invoice_number, placed_at)
    VALUES (v_org, q.reference || '-ORD', p_quote_id, q.customer_id, q.customer_user_id, q.contact_email, 'confirmed', q.currency, v_sub, v_total, q.po_reference, v_inv, now())
    RETURNING id INTO v_oid;
  INSERT INTO order_items(org_id, order_id, offering_id, variant_id, applied_rule_id, offering_name, variant_name, qty, unit_price_minor, line_total_minor, currency)
    SELECT v_org, v_oid, offering_id, variant_id, applied_rule_id, offering_name, variant_name, qty,
           COALESCE(captured_price_minor, 0), COALESCE(captured_price_minor, 0) * qty, currency
      FROM quote_items WHERE quote_id = p_quote_id;
  UPDATE quotes SET status = 'won', updated_at = now() WHERE id = p_quote_id;
  RETURN jsonb_build_object('order_id', v_oid, 'invoice_number', v_inv);
END; $$;

CREATE OR REPLACE FUNCTION import_skus(p_creates jsonb DEFAULT '[]'::jsonb, p_updates jsonb DEFAULT '[]'::jsonb)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := app_staff_org();
  c jsonb; u jsonb;
  v_slug citext; v_oid uuid; v_vendor uuid; v_cat uuid;
  v_created int := 0; v_updated int := 0;
  v_touched uuid[] := '{}';
  fn_slug text;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'not authorised (catalogue editor only)'; END IF;

  -- CREATES: resolve/auto-create parent offering (+ vendor/category), then insert the variant.
  FOR c IN SELECT value FROM jsonb_array_elements(p_creates) LOOP
    v_slug := c->>'offeringSlug';
    SELECT id INTO v_oid FROM offerings WHERE org_id = v_org AND slug = v_slug AND deleted_at IS NULL LIMIT 1;
    IF v_oid IS NULL THEN
      v_vendor := NULL;
      IF NULLIF(c->>'vendor', '') IS NOT NULL THEN
        fn_slug := trim(both '-' from regexp_replace(lower(c->>'vendor'), '[^a-z0-9]+', '-', 'g'));
        SELECT id INTO v_vendor FROM vendors WHERE org_id = v_org AND (slug = fn_slug OR lower(name) = lower(c->>'vendor')) LIMIT 1;
        IF v_vendor IS NULL THEN
          INSERT INTO vendors(org_id, slug, name) VALUES (v_org, left(fn_slug, 60), c->>'vendor') RETURNING id INTO v_vendor;
        END IF;
      END IF;
      v_cat := NULL;
      IF NULLIF(c->>'category', '') IS NOT NULL THEN
        fn_slug := trim(both '-' from regexp_replace(lower(c->>'category'), '[^a-z0-9]+', '-', 'g'));
        SELECT id INTO v_cat FROM categories WHERE org_id = v_org AND (slug = fn_slug OR lower(name) = lower(c->>'category')) LIMIT 1;
        IF v_cat IS NULL THEN
          INSERT INTO categories(org_id, slug, name) VALUES (v_org, left(fn_slug, 60), c->>'category') RETURNING id INTO v_cat;
        END IF;
      END IF;
      INSERT INTO offerings(org_id, slug, name, type, status, featured, fulfilment, vendor_id, category_id)
        VALUES (v_org, v_slug, COALESCE(NULLIF(c->>'offeringName', ''), v_slug::text), 'product',
                COALESCE(NULLIF(c->>'status', ''), 'draft')::publish_status, COALESCE((c->>'featured')::boolean, false),
                'license', v_vendor, v_cat)
        RETURNING id INTO v_oid;
    END IF;
    INSERT INTO offering_variants(org_id, offering_id, sku, name, license_type, billing_period, base_price_minor, currency)
      VALUES (v_org, v_oid, c->>'sku', COALESCE(NULLIF(c#>>'{variant,name}', ''), 'Standard'),
              NULLIF(c#>>'{variant,license_type}', ''),
              COALESCE(NULLIF(c#>>'{variant,billing_period}', ''), 'perpetual')::billing_period,
              NULLIF(c#>>'{variant,base_price_minor}', '')::bigint,
              CASE WHEN NULLIF(c#>>'{variant,base_price_minor}', '') IS NOT NULL THEN 'USD' ELSE NULL END);
    v_created := v_created + 1;
    v_touched := array_append(v_touched, v_oid);
  END LOOP;

  -- UPDATES: patch only changed fields by variant id (org-scoped).
  FOR u IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
    UPDATE offering_variants SET
      name             = COALESCE(NULLIF(u#>>'{changes,name,to}', ''), name),
      license_type     = COALESCE(u#>>'{changes,license_type,to}', license_type),
      billing_period   = COALESCE(NULLIF(u#>>'{changes,billing_period,to}', ''), billing_period::text)::billing_period,
      base_price_minor = COALESCE((u#>>'{changes,base_price_minor,to}')::bigint, base_price_minor),
      currency         = CASE WHEN (u#>>'{changes,base_price_minor,to}') IS NOT NULL THEN 'USD' ELSE currency END,
      updated_at       = now()
    WHERE id = (u->>'variantId')::uuid AND org_id = v_org;
    IF FOUND THEN v_updated := v_updated + 1; v_touched := array_append(v_touched, (u->>'offeringId')::uuid); END IF;
  END LOOP;

  -- Recompute each touched offering's from_price (min USD across its priced, non-deleted variants).
  UPDATE offerings o SET
    from_price_minor = sub.m,
    from_price_currency = CASE WHEN sub.m IS NULL THEN NULL ELSE 'USD' END
  FROM (
    SELECT ov.offering_id, min(ov.base_price_minor) AS m
      FROM offering_variants ov
     WHERE ov.org_id = v_org AND ov.deleted_at IS NULL AND ov.base_price_minor IS NOT NULL
     GROUP BY ov.offering_id
  ) sub
  WHERE o.id = sub.offering_id AND o.id = ANY(v_touched);
  -- touched offerings left with no priced variant → POA
  UPDATE offerings SET from_price_minor = NULL, from_price_currency = NULL
   WHERE id = ANY(v_touched)
     AND NOT EXISTS (SELECT 1 FROM offering_variants v WHERE v.offering_id = offerings.id AND v.deleted_at IS NULL AND v.base_price_minor IS NOT NULL);

  RETURN jsonb_build_object('created', v_created, 'updated', v_updated);
END; $$;

-- 048's read begin, as it was
CREATE OR REPLACE FUNCTION admin_bridge_begin(p_kid text, p_capability text, p_nonce text, p_time bigint,
  p_actor text, p_run uuid, p_method text, p_path text)
RETURNS TABLE (audit_id uuid, org_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type text := split_part(p_actor, ':', 1);
  v_id   text := substr(p_actor, length(split_part(p_actor, ':', 1)) + 2);
  v_org  uuid;
  v_audit uuid;
BEGIN
  IF p_time IS NULL OR abs(extract(epoch FROM now()) - p_time) > 60 THEN
    RAISE EXCEPTION 'bridge request time outside the window' USING ERRCODE = 'GB001';
  END IF;
  IF p_nonce IS NULL OR p_nonce !~ '^[A-Za-z0-9_-]{22}$' THEN
    RAISE EXCEPTION 'bridge nonce malformed' USING ERRCODE = 'GB002';
  END IF;
  DELETE FROM admin_bridge_nonce WHERE seen_at < now() - interval '10 minutes';
  INSERT INTO admin_bridge_nonce (kid, nonce) VALUES (p_kid, p_nonce);
  SELECT o.id INTO v_org FROM organisations o ORDER BY o.created_at LIMIT 1;
  INSERT INTO admin_bridge_audit (kid, capability, actor_type, actor_id, gsam_run_id, method, path, nonce)
    VALUES (p_kid, p_capability, v_type, v_id, p_run, p_method, p_path, p_nonce)
    RETURNING id INTO v_audit;
  RETURN QUERY SELECT v_audit, v_org;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors', 'categories', 'offerings', 'offering_variants', 'offering_specs', 'offering_media',
    'pricing_rules', 'pricing_rule_targets', 'org_settings', 'quotes', 'orders', 'order_items', 'import_jobs',
    'import_job_rows'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.%I', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['vendors', 'categories', 'offerings', 'pricing_rules', 'offering_variants', 'offering_specs',
    'offering_media', 'pricing_rule_targets', 'import_jobs', 'import_job_rows'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_bridge_write ON public.%I', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['customers', 'customer_users', 'quotes', 'quote_items', 'orders', 'order_items',
    'licence_keys', 'portal_documents', 'portal_acceptances', 'service_inquiries', 'front_door_leads',
    'vendors', 'categories', 'offerings', 'offering_variants', 'offering_specs', 'offering_media', 'customer_tiers',
    'pricing_rules', 'pricing_rule_targets', 'org_settings', 'fx_rate_history', 'import_jobs', 'import_job_rows'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS gsam_bridge_read_scope ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS gsam_bridge_write_scope ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS gsam_bridge_write ON public.%I', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['vendors', 'categories', 'offerings', 'offering_variants', 'offering_specs', 'offering_media',
    'customer_tiers', 'pricing_rules', 'pricing_rule_targets', 'org_settings', 'fx_rate_history', 'import_jobs',
    'import_job_rows'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS gsam_bridge_read ON public.%I', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM gsam_bridge_read', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS trg_refund_requests_match ON public.orders;

DROP FUNCTION IF EXISTS bridge_set_fx(numeric, integer);
DROP FUNCTION IF EXISTS bridge_set_status(text, uuid, text, integer);
DROP FUNCTION IF EXISTS bridge_import_apply(uuid);
DROP FUNCTION IF EXISTS bridge_issue_invoice(uuid, integer);
DROP FUNCTION IF EXISTS bridge_edit_draft_invoice(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS bridge_convert_quote(uuid);
DROP FUNCTION IF EXISTS _import_skus(uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS _convert_quote(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS _next_invoice_number();
DROP FUNCTION IF EXISTS admin_bridge_log_change();
DROP FUNCTION IF EXISTS guard_bridge_import_write();
DROP FUNCTION IF EXISTS guard_bridge_catalogue_write();
DROP FUNCTION IF EXISTS _bridge_ref_ok(text, uuid);
DROP FUNCTION IF EXISTS bridge_refund_decision(uuid, text, text);
DROP FUNCTION IF EXISTS bridge_request_refund(uuid, bigint, text);
DROP FUNCTION IF EXISTS refund_requests_match();
DROP FUNCTION IF EXISTS _refund_allocate(uuid);
DROP FUNCTION IF EXISTS admin_bridge_finish_refund(uuid, text, text, text, integer, jsonb);
DROP FUNCTION IF EXISTS admin_bridge_begin_refund(text, text, bigint, text, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS admin_bridge_finish_write(uuid, text, text, text, integer, jsonb);
DROP FUNCTION IF EXISTS admin_bridge_begin_write(text, text, bigint, text, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS _admin_bridge_close(text, uuid, text, text, text, integer, jsonb);
DROP FUNCTION IF EXISTS _admin_bridge_open_idempotent(text, text, text, bigint, text, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS _admin_bridge_open(text, text, text, bigint, text, uuid, text, text);
DROP FUNCTION IF EXISTS _bridge_person(text);
DROP FUNCTION IF EXISTS _bridge_ctx(text);
DROP FUNCTION IF EXISTS app_bridge_write_actor();
DROP FUNCTION IF EXISTS app_bridge_open_audit(text);
DROP FUNCTION IF EXISTS app_bridge_write_org();

DROP TABLE IF EXISTS public.refund_requests;
DROP TABLE IF EXISTS public.admin_bridge_change;
DROP TABLE IF EXISTS public.admin_bridge_idempotency;
REVOKE SELECT (row_version) ON public.quotes FROM gsam_bridge_read;
REVOKE SELECT (row_version, paid_by_stripe) ON public.orders FROM gsam_bridge_read;
ALTER TABLE public.orders DROP COLUMN IF EXISTS paid_by_stripe;
-- audit rows written under 049 keep their outcomes; the 048 check holds for new rows only
ALTER TABLE public.admin_bridge_audit DROP CONSTRAINT IF EXISTS admin_bridge_audit_outcome_check;
ALTER TABLE public.admin_bridge_audit ADD CONSTRAINT admin_bridge_audit_outcome_check
  CHECK (outcome IN ('started', 'ok', 'not_found', 'bad_request')) NOT VALID;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['gsam_bridge_write', 'gsam_bridge_refund'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', r);
      EXECUTE format('DROP ROLE %I', r);
    END IF;
  END LOOP;
END $$;
