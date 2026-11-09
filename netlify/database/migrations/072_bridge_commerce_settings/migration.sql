-- GRE-4782 (GRE-4079 step 5a). The commerce settings the admin bridge could not write yet: order status and the
-- "licence issued" email, enquiry and front door lead status and lead delete, client companies, the client timeline
-- (engagements), licence keys, customer tiers and a portal receipt "send again". Builds on 015, 019, 033, 039, 048,
-- 049 and 067. Adds objects only (and replaces two trigger bodies), so the previous deploy runs against it unchanged.
--
--   * Every write is a bridge_* function, SECURITY DEFINER, for gsam_bridge_write only. The write role still has no
--     grant on these tables. Each function reads the org and the actor from the audit row this transaction opened
--     (_bridge_ctx), never from the request body.
--   * People only (John, 5 Nov: what emails a client, changes money, or issues or revokes a licence key goes through
--     a person's approval card in GSAM; so do sharing and personal-data deletes). _bridge_person refuses any actor
--     that is not user:. These are:
--       the licence-issued email (bridge_order_licence_email), the receipt "send again", issuing a licence, changing
--       its key or download link, revoking and re-issuing it, a client's tier (it sets the client's prices),
--       sharing and unsharing a timeline item, changing or deleting one the client can see, and deleting a lead.
--     Everything else (status and record edits) any actor may do.
--   * The change log: customers, engagements, licence_keys and customer_tiers join 049's trigger. admin_bridge_log_change
--     now leaves out licence_key, so a key is never copied into the log. service_inquiries and front_door_leads hold
--     personal data, so their functions log status and row version only (a deleted lead leaves no copy behind).
--   * Reads: engagements become a read resource; customers and licence_keys give their row_version.
-- Error codes as 049: GB400 bad_request, GB403 denied, GB404 not_found, GB409 conflict.
-- Re-runnable. Rollback: rollback.sql in this folder.

-- ── reads ───────────────────────────────────────────────────────────────────────────────────────────
GRANT SELECT (row_version) ON public.customers TO gsam_bridge_read;
GRANT SELECT (row_version) ON public.licence_keys TO gsam_bridge_read;
GRANT SELECT (id, org_id, customer_id, kind, status, title, summary, body_html, external_url, occurred_on, phase,
  owner_name, attendees, tags, pinned, created_at, updated_at, deleted_at, row_version)
  ON public.engagements TO gsam_bridge_read;
DROP POLICY IF EXISTS gsam_bridge_read ON public.engagements;
CREATE POLICY gsam_bridge_read ON public.engagements FOR SELECT TO gsam_bridge_read USING (org_id = app_bridge_org());
DROP POLICY IF EXISTS gsam_bridge_read_scope ON public.engagements;
CREATE POLICY gsam_bridge_read_scope ON public.engagements AS RESTRICTIVE FOR ALL TO gsam_bridge_read
  USING (org_id = app_bridge_org()) WITH CHECK (false);

-- ── shared helpers ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _bridge_expect_version(p_have integer, p_want integer) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_want IS NOT NULL AND p_have IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'row version' USING ERRCODE = 'GB409'; END IF;
END $$;
REVOKE ALL ON FUNCTION _bridge_expect_version(integer, integer) FROM PUBLIC, anon, authenticated, service_role;

-- A change log row written by a function, for tables whose rows hold personal data.
CREATE OR REPLACE FUNCTION _bridge_log_row(p_table text, p_id uuid, p_op text, p_before jsonb, p_after jsonb)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO admin_bridge_change (audit_id, table_name, row_id, op, before, after)
  VALUES ((SELECT audit_id FROM app_bridge_open_audit('write')), p_table, p_id, p_op, p_before, p_after) $$;
REVOKE ALL ON FUNCTION _bridge_log_row(text, uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- 049's change log, without the licence key.
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
            CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'search_tsv' - 'stripe_payment_intent' - 'licence_key' END,
            CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'search_tsv' - 'stripe_payment_intent' - 'licence_key' END);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION admin_bridge_log_change() FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers', 'engagements', 'licence_keys', 'customer_tiers'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_admin_bridge_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION admin_bridge_log_change()', t);
  END LOOP;
END $$;

-- ── orders ──────────────────────────────────────────────────────────────────────────────────────────
-- pending, confirmed, fulfilled or cancelled. refunded is the Stripe webhook's (money moves through refund
-- requests), and a cancelled or refunded order does not change status here.
CREATE OR REPLACE FUNCTION bridge_order_set_status(p_order uuid, p_status text, p_expected_row_version integer)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v orders%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('pending', 'confirmed', 'fulfilled', 'cancelled') THEN
    RAISE EXCEPTION 'status is pending, confirmed, fulfilled or cancelled' USING ERRCODE = 'GB400';
  END IF;
  SELECT * INTO v FROM orders WHERE id = p_order AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found' USING ERRCODE = 'GB404'; END IF;
  PERFORM _bridge_expect_version(v.row_version, p_expected_row_version);
  IF v.status::text <> p_status AND v.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'the order is %', v.status USING ERRCODE = 'GB409';
  END IF;
  IF v.status::text <> p_status THEN UPDATE orders SET status = p_status::order_status WHERE id = v.id; END IF;
  RETURN v.id;
END $$;

-- People only: what the "licence issued" email needs. The site sends it after the commit. Never a key. The order
-- must have a customer email and at least one live, issued licence.
CREATE OR REPLACE FUNCTION bridge_order_licence_email(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v orders%ROWTYPE;
  v_items jsonb;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  SELECT * INTO v FROM orders WHERE id = p_order AND org_id = ctx.org_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found' USING ERRCODE = 'GB404'; END IF;
  IF v.customer_email IS NULL THEN RAISE EXCEPTION 'the order has no customer email' USING ERRCODE = 'GB409'; END IF;
  SELECT jsonb_agg(jsonb_build_object('offering_name', k.offering_name, 'variant_name', k.variant_name) ORDER BY k.created_at, k.id)
    INTO v_items FROM licence_keys k
   WHERE k.order_id = v.id AND k.org_id = ctx.org_id AND k.status = 'issued' AND k.deleted_at IS NULL;
  IF v_items IS NULL THEN RAISE EXCEPTION 'the order has no issued licence' USING ERRCODE = 'GB409'; END IF;
  RETURN jsonb_build_object('reference', v.reference, 'to', v.customer_email, 'items', v_items,
    'vendors', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'activation_instructions', x.activation_instructions)
                  ORDER BY x.sort_order, x.name), '[]'::jsonb)
                  FROM vendors x WHERE x.org_id = ctx.org_id AND x.deleted_at IS NULL AND x.activation_instructions IS NOT NULL));
END $$;

-- ── enquiries and front door leads ──────────────────────────────────────────────────────────────────
-- p_kind: si (service_inquiries) or fd (front_door_leads), as the read ids. new, contacted or closed; contacted
-- also stamps a lead's last_contacted_at, as the studio does.
CREATE OR REPLACE FUNCTION bridge_enquiry_set_status(p_kind text, p_id uuid, p_status text, p_expected_row_version integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v_old text;
  v_version integer;
  v_after record;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('new', 'contacted', 'closed') THEN
    RAISE EXCEPTION 'status is new, contacted or closed' USING ERRCODE = 'GB400';
  END IF;
  IF p_kind = 'si' THEN
    SELECT status, row_version INTO v_old, v_version FROM service_inquiries
     WHERE id = p_id AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  ELSIF p_kind = 'fd' THEN
    SELECT status, row_version INTO v_old, v_version FROM front_door_leads WHERE id = p_id AND org_id = ctx.org_id FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'kind' USING ERRCODE = 'GB404';
  END IF;
  IF v_old IS NULL THEN RAISE EXCEPTION 'enquiry not found' USING ERRCODE = 'GB404'; END IF;
  PERFORM _bridge_expect_version(v_version, p_expected_row_version);
  IF v_old <> p_status THEN
    IF p_kind = 'si' THEN
      UPDATE service_inquiries SET status = p_status WHERE id = p_id RETURNING status, row_version, updated_at INTO v_after;
    ELSE
      UPDATE front_door_leads SET status = p_status,
        last_contacted_at = CASE WHEN p_status = 'contacted' THEN now() ELSE last_contacted_at END
       WHERE id = p_id RETURNING status, row_version, updated_at INTO v_after;
    END IF;
    PERFORM _bridge_log_row(CASE p_kind WHEN 'si' THEN 'service_inquiries' ELSE 'front_door_leads' END, p_id, 'update',
      jsonb_build_object('status', v_old, 'row_version', v_version),
      jsonb_build_object('status', v_after.status, 'row_version', v_after.row_version));
  ELSIF p_kind = 'si' THEN
    SELECT status, row_version, updated_at INTO v_after FROM service_inquiries WHERE id = p_id;
  ELSE
    SELECT status, row_version, updated_at INTO v_after FROM front_door_leads WHERE id = p_id;
  END IF;
  RETURN jsonb_build_object('id', p_kind || '-' || p_id, 'status', v_after.status, 'rowVersion', v_after.row_version,
    'updatedAt', v_after.updated_at);
END $$;

-- People only: deletes a front door lead for good, as the studio's delete does. The log keeps no personal data.
CREATE OR REPLACE FUNCTION bridge_lead_delete(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v record;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  DELETE FROM front_door_leads WHERE id = p_id AND org_id = ctx.org_id RETURNING id, status, row_version, created_at INTO v;
  IF v.id IS NULL THEN RAISE EXCEPTION 'lead not found' USING ERRCODE = 'GB404'; END IF;
  PERFORM _bridge_log_row('front_door_leads', v.id, 'delete',
    jsonb_build_object('status', v.status, 'row_version', v.row_version, 'created_at', v.created_at), NULL);
  RETURN jsonb_build_object('id', 'fd-' || v.id, 'deleted', true);
END $$;

-- ── client companies ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _bridge_customer_json(p_org uuid, p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'tier_id', c.tier_id, 'domain', c.domain,
    'billing_currency', c.billing_currency, 'notes', c.notes, 'created_at', c.created_at, 'updated_at', c.updated_at,
    'row_version', c.row_version)
  FROM customers c WHERE c.id = p_id AND c.org_id = p_org $$;
REVOKE ALL ON FUNCTION _bridge_customer_json(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- A tier is a live tier of the org, and setting one is a person's (it sets the client's prices).
CREATE OR REPLACE FUNCTION _bridge_customer_tier(p_org uuid, p_actor text, p_tier uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _bridge_person(p_actor);
  IF p_tier IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customer_tiers t WHERE t.id = p_tier AND t.org_id = p_org AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'tier is not a live tier of this organisation' USING ERRCODE = 'GB400';
  END IF;
END $$;
REVOKE ALL ON FUNCTION _bridge_customer_tier(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- p_fields (checked by the site function first): name, slug, domain, billing_currency, notes, tier_id. With no
-- slug, one is made from the name; a slug in use is a conflict.
CREATE OR REPLACE FUNCTION bridge_customer_create(p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  f jsonb := p_fields;
  v_name text := btrim(coalesce(f ->> 'name', ''));
  v_slug text := coalesce(nullif(btrim(coalesce(f ->> 'slug', '')), ''),
                          btrim(regexp_replace(lower(coalesce(f ->> 'name', '')), '[^a-z0-9]+', '-', 'g'), '-'));
  v_id uuid;
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION 'name is required' USING ERRCODE = 'GB400'; END IF;
  IF v_slug = '' THEN RAISE EXCEPTION 'slug' USING ERRCODE = 'GB400'; END IF;
  IF f ? 'tier_id' AND f ->> 'tier_id' IS NOT NULL THEN PERFORM _bridge_customer_tier(ctx.org_id, ctx.actor, (f ->> 'tier_id')::uuid); END IF;
  IF EXISTS (SELECT 1 FROM customers c WHERE c.org_id = ctx.org_id AND c.slug = v_slug::citext) THEN
    RAISE EXCEPTION 'slug in use' USING ERRCODE = 'GB409';
  END IF;
  INSERT INTO customers (org_id, slug, name, tier_id, domain, billing_currency, notes)
  VALUES (ctx.org_id, v_slug, v_name, (f ->> 'tier_id')::uuid, nullif(btrim(coalesce(f ->> 'domain', '')), ''),
          f ->> 'billing_currency', f ->> 'notes')
  RETURNING id INTO v_id;
  RETURN _bridge_customer_json(ctx.org_id, v_id);
END $$;

-- Changes the fields given at the expected row version. A field given as null is cleared (name and slug may not be).
CREATE OR REPLACE FUNCTION bridge_customer_edit(p_id uuid, p_expected_row_version integer, p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  f jsonb := p_fields;
  v customers%ROWTYPE;
BEGIN
  SELECT * INTO v FROM customers WHERE id = p_id AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found' USING ERRCODE = 'GB404'; END IF;
  PERFORM _bridge_expect_version(v.row_version, p_expected_row_version);
  IF (f ? 'name' AND btrim(coalesce(f ->> 'name', '')) = '') OR (f ? 'slug' AND btrim(coalesce(f ->> 'slug', '')) = '') THEN
    RAISE EXCEPTION 'name and slug cannot be blank' USING ERRCODE = 'GB400';
  END IF;
  IF f ? 'tier_id' AND (f ->> 'tier_id')::uuid IS DISTINCT FROM v.tier_id THEN
    PERFORM _bridge_customer_tier(ctx.org_id, ctx.actor, (f ->> 'tier_id')::uuid);
  END IF;
  IF f ? 'slug' AND EXISTS (SELECT 1 FROM customers c WHERE c.org_id = ctx.org_id AND c.id <> v.id AND c.slug = (f ->> 'slug')::citext) THEN
    RAISE EXCEPTION 'slug in use' USING ERRCODE = 'GB409';
  END IF;
  UPDATE customers SET
    name             = CASE WHEN f ? 'name' THEN btrim(f ->> 'name') ELSE name END,
    slug             = CASE WHEN f ? 'slug' THEN btrim(f ->> 'slug') ELSE slug END,
    domain           = CASE WHEN f ? 'domain' THEN nullif(btrim(coalesce(f ->> 'domain', '')), '') ELSE domain END,
    billing_currency = CASE WHEN f ? 'billing_currency' THEN f ->> 'billing_currency' ELSE billing_currency END,
    notes            = CASE WHEN f ? 'notes' THEN f ->> 'notes' ELSE notes END,
    tier_id          = CASE WHEN f ? 'tier_id' THEN (f ->> 'tier_id')::uuid ELSE tier_id END
  WHERE id = v.id;
  RETURN _bridge_customer_json(ctx.org_id, v.id);
END $$;

-- ── the client timeline (engagements) ───────────────────────────────────────────────────────────────
-- The client sees a shared item (015's customer_self). Sharing, unsharing, and changing or deleting a shared item
-- are a person's; anyone may add, edit and delete drafts. New items are drafts.
CREATE OR REPLACE FUNCTION _bridge_engagement_json(p_org uuid, p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(e) - 'org_id' - 'created_by' - 'metadata' FROM engagements e WHERE e.id = p_id AND e.org_id = p_org $$;
REVOKE ALL ON FUNCTION _bridge_engagement_json(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION _bridge_engagement_lock(p_org uuid, p_id uuid, p_expected_row_version integer) RETURNS engagements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v engagements%ROWTYPE;
BEGIN
  SELECT e.* INTO v FROM engagements e JOIN customers c ON c.id = e.customer_id AND c.deleted_at IS NULL
   WHERE e.id = p_id AND e.org_id = p_org AND e.deleted_at IS NULL FOR UPDATE OF e;
  IF NOT FOUND THEN RAISE EXCEPTION 'timeline item not found' USING ERRCODE = 'GB404'; END IF;
  PERFORM _bridge_expect_version(v.row_version, p_expected_row_version);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION _bridge_engagement_lock(uuid, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;

-- p_fields: kind, title, summary, body_html, external_url, occurred_on, phase, owner_name, attendees, tags, pinned.
CREATE OR REPLACE FUNCTION bridge_engagement_create(p_customer uuid, p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  f jsonb := p_fields;
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = p_customer AND c.org_id = ctx.org_id AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'client not found' USING ERRCODE = 'GB404';
  END IF;
  INSERT INTO engagements (org_id, customer_id, kind, status, title, summary, body_html, external_url, occurred_on,
                           phase, owner_name, attendees, tags, pinned)
  VALUES (ctx.org_id, p_customer, coalesce(f ->> 'kind', 'recap')::engagement_kind, 'draft', f ->> 'title', f ->> 'summary',
          f ->> 'body_html', f ->> 'external_url', coalesce((f ->> 'occurred_on')::date, current_date), f ->> 'phase',
          f ->> 'owner_name', coalesce(ARRAY(SELECT jsonb_array_elements_text(f -> 'attendees')), '{}'),
          coalesce(ARRAY(SELECT jsonb_array_elements_text(f -> 'tags')), '{}'), coalesce((f ->> 'pinned')::boolean, false))
  RETURNING id INTO v_id;
  RETURN _bridge_engagement_json(ctx.org_id, v_id);
END $$;

CREATE OR REPLACE FUNCTION bridge_engagement_edit(p_id uuid, p_expected_row_version integer, p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  f jsonb := p_fields;
  v engagements%ROWTYPE := _bridge_engagement_lock(ctx.org_id, p_id, p_expected_row_version);
BEGIN
  IF v.status = 'shared' THEN PERFORM _bridge_person(ctx.actor); END IF;
  UPDATE engagements SET
    kind         = CASE WHEN f ? 'kind' THEN coalesce(f ->> 'kind', 'recap')::engagement_kind ELSE kind END,
    title        = CASE WHEN f ? 'title' THEN f ->> 'title' ELSE title END,
    summary      = CASE WHEN f ? 'summary' THEN f ->> 'summary' ELSE summary END,
    body_html    = CASE WHEN f ? 'body_html' THEN f ->> 'body_html' ELSE body_html END,
    external_url = CASE WHEN f ? 'external_url' THEN f ->> 'external_url' ELSE external_url END,
    occurred_on  = CASE WHEN f ? 'occurred_on' THEN coalesce((f ->> 'occurred_on')::date, current_date) ELSE occurred_on END,
    phase        = CASE WHEN f ? 'phase' THEN f ->> 'phase' ELSE phase END,
    owner_name   = CASE WHEN f ? 'owner_name' THEN f ->> 'owner_name' ELSE owner_name END,
    attendees    = CASE WHEN f ? 'attendees' THEN coalesce(ARRAY(SELECT jsonb_array_elements_text(f -> 'attendees')), '{}') ELSE attendees END,
    tags         = CASE WHEN f ? 'tags' THEN coalesce(ARRAY(SELECT jsonb_array_elements_text(f -> 'tags')), '{}') ELSE tags END,
    pinned       = CASE WHEN f ? 'pinned' THEN coalesce((f ->> 'pinned')::boolean, false) ELSE pinned END
  WHERE id = v.id;
  RETURN _bridge_engagement_json(ctx.org_id, v.id);
END $$;

-- People only: shared (the client sees it) or draft (hidden again).
CREATE OR REPLACE FUNCTION bridge_engagement_set_status(p_id uuid, p_expected_row_version integer, p_status text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v engagements%ROWTYPE;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  IF p_status IS NULL OR p_status NOT IN ('shared', 'draft') THEN RAISE EXCEPTION 'status' USING ERRCODE = 'GB400'; END IF;
  v := _bridge_engagement_lock(ctx.org_id, p_id, p_expected_row_version);
  IF v.status::text <> p_status THEN UPDATE engagements SET status = p_status::engagement_status WHERE id = v.id; END IF;
  RETURN _bridge_engagement_json(ctx.org_id, v.id);
END $$;

-- Soft delete, as the studio does.
CREATE OR REPLACE FUNCTION bridge_engagement_delete(p_id uuid, p_expected_row_version integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v engagements%ROWTYPE := _bridge_engagement_lock(ctx.org_id, p_id, p_expected_row_version);
BEGIN
  IF v.status = 'shared' THEN PERFORM _bridge_person(ctx.actor); END IF;
  UPDATE engagements SET deleted_at = now() WHERE id = v.id;
  RETURN _bridge_engagement_json(ctx.org_id, v.id);
END $$;

-- ── licence keys ────────────────────────────────────────────────────────────────────────────────────
-- The answer names the last four characters of a key, never the key.
CREATE OR REPLACE FUNCTION _bridge_licence_json(p_org uuid, p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', k.id, 'customer_id', k.customer_id, 'order_id', k.order_id,
    'offering_name', k.offering_name, 'variant_name', k.variant_name, 'licence_key_last4', k.licence_key_last4,
    'has_download_url', k.download_url IS NOT NULL, 'file_name', k.file_name, 'seats', k.seats, 'status', k.status,
    'delivered_at', k.delivered_at, 'expires_at', k.expires_at, 'notes', k.notes, 'created_at', k.created_at,
    'updated_at', k.updated_at, 'row_version', k.row_version)
  FROM licence_keys k WHERE k.id = p_id AND k.org_id = p_org $$;
REVOKE ALL ON FUNCTION _bridge_licence_json(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- People only. p_fields: order_id, offering_name, variant_name, licence_key, download_url, seats, expires_at, notes.
-- An order must be this client's. A key or a download link is needed (019/026's check).
CREATE OR REPLACE FUNCTION bridge_licence_issue(p_customer uuid, p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  f jsonb := p_fields;
  v_id uuid;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  IF NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = p_customer AND c.org_id = ctx.org_id AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'client not found' USING ERRCODE = 'GB404';
  END IF;
  IF f ->> 'order_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = (f ->> 'order_id')::uuid
       AND o.org_id = ctx.org_id AND o.customer_id = p_customer AND o.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'order is not this client''s' USING ERRCODE = 'GB400';
  END IF;
  INSERT INTO licence_keys (org_id, customer_id, order_id, offering_name, variant_name, licence_key, download_url, seats,
                            expires_at, notes, status)
  VALUES (ctx.org_id, p_customer, (f ->> 'order_id')::uuid, f ->> 'offering_name', f ->> 'variant_name',
          nullif(f ->> 'licence_key', ''), nullif(f ->> 'download_url', ''), (f ->> 'seats')::integer,
          (f ->> 'expires_at')::timestamptz, f ->> 'notes', 'issued')
  RETURNING id INTO v_id;
  RETURN _bridge_licence_json(ctx.org_id, v_id);
END $$;

-- Record fields anyone may change; a new key or download link is a person's (it is issuing the licence again).
CREATE OR REPLACE FUNCTION bridge_licence_edit(p_id uuid, p_expected_row_version integer, p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  f jsonb := p_fields;
  v licence_keys%ROWTYPE;
BEGIN
  SELECT * INTO v FROM licence_keys WHERE id = p_id AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'licence not found' USING ERRCODE = 'GB404'; END IF;
  PERFORM _bridge_expect_version(v.row_version, p_expected_row_version);
  IF f ? 'licence_key' OR f ? 'download_url' THEN PERFORM _bridge_person(ctx.actor); END IF;
  UPDATE licence_keys SET
    offering_name = CASE WHEN f ? 'offering_name' THEN f ->> 'offering_name' ELSE offering_name END,
    variant_name  = CASE WHEN f ? 'variant_name' THEN f ->> 'variant_name' ELSE variant_name END,
    licence_key   = CASE WHEN f ? 'licence_key' THEN nullif(f ->> 'licence_key', '') ELSE licence_key END,
    download_url  = CASE WHEN f ? 'download_url' THEN nullif(f ->> 'download_url', '') ELSE download_url END,
    seats         = CASE WHEN f ? 'seats' THEN (f ->> 'seats')::integer ELSE seats END,
    expires_at    = CASE WHEN f ? 'expires_at' THEN (f ->> 'expires_at')::timestamptz ELSE expires_at END,
    notes         = CASE WHEN f ? 'notes' THEN f ->> 'notes' ELSE notes END
  WHERE id = v.id;
  RETURN _bridge_licence_json(ctx.org_id, v.id);
END $$;

-- People only: revoked, or issued again (the studio's revoke and re-issue).
CREATE OR REPLACE FUNCTION bridge_licence_set_status(p_id uuid, p_expected_row_version integer, p_status text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v licence_keys%ROWTYPE;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  IF p_status IS NULL OR p_status NOT IN ('issued', 'revoked') THEN RAISE EXCEPTION 'status' USING ERRCODE = 'GB400'; END IF;
  SELECT * INTO v FROM licence_keys WHERE id = p_id AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'licence not found' USING ERRCODE = 'GB404'; END IF;
  PERFORM _bridge_expect_version(v.row_version, p_expected_row_version);
  IF v.status::text = p_status THEN RAISE EXCEPTION 'the licence is already %', p_status USING ERRCODE = 'GB409'; END IF;
  UPDATE licence_keys SET status = p_status::licence_key_status WHERE id = v.id;
  RETURN _bridge_licence_json(ctx.org_id, v.id);
END $$;

-- ── customer tiers ──────────────────────────────────────────────────────────────────────────────────
-- No row_version on this table (003): an edit is last write wins.
CREATE OR REPLACE FUNCTION _bridge_tier_json(p_org uuid, p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(t) - 'org_id' - 'deleted_at' FROM customer_tiers t WHERE t.id = p_id AND t.org_id = p_org $$;
REVOKE ALL ON FUNCTION _bridge_tier_json(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION bridge_tier_create(p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  f jsonb := p_fields;
  v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM customer_tiers t WHERE t.org_id = ctx.org_id AND t.slug = (f ->> 'slug')::citext) THEN
    RAISE EXCEPTION 'slug in use' USING ERRCODE = 'GB409';
  END IF;
  INSERT INTO customer_tiers (org_id, slug, name, rank, description)
  VALUES (ctx.org_id, f ->> 'slug', f ->> 'name', coalesce((f ->> 'rank')::integer, 0), f ->> 'description')
  RETURNING id INTO v_id;
  RETURN _bridge_tier_json(ctx.org_id, v_id);
END $$;

CREATE OR REPLACE FUNCTION bridge_tier_edit(p_id uuid, p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  f jsonb := p_fields;
  v customer_tiers%ROWTYPE;
BEGIN
  SELECT * INTO v FROM customer_tiers WHERE id = p_id AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tier not found' USING ERRCODE = 'GB404'; END IF;
  IF f ? 'slug' AND EXISTS (SELECT 1 FROM customer_tiers t WHERE t.org_id = ctx.org_id AND t.id <> v.id AND t.slug = (f ->> 'slug')::citext) THEN
    RAISE EXCEPTION 'slug in use' USING ERRCODE = 'GB409';
  END IF;
  UPDATE customer_tiers SET
    slug        = CASE WHEN f ? 'slug' THEN f ->> 'slug' ELSE slug END,
    name        = CASE WHEN f ? 'name' THEN f ->> 'name' ELSE name END,
    rank        = CASE WHEN f ? 'rank' THEN coalesce((f ->> 'rank')::integer, 0) ELSE rank END,
    description = CASE WHEN f ? 'description' THEN f ->> 'description' ELSE description END,
    updated_at  = now()
  WHERE id = v.id;
  RETURN _bridge_tier_json(ctx.org_id, v.id);
END $$;

-- ── portal receipt "send again" ─────────────────────────────────────────────────────────────────────
-- People only (it emails the client): 039's portal_requeue_receipt for a GSAM person. The same job (and so the same
-- Resend idempotency key) goes back in the queue; a receipt already sent, or still sending, is not.
CREATE OR REPLACE FUNCTION bridge_receipt_requeue(p_acceptance uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v portal_receipt_jobs%ROWTYPE;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  SELECT * INTO v FROM portal_receipt_jobs j WHERE j.acceptance_id = p_acceptance AND j.org_id = ctx.org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt not found' USING ERRCODE = 'GB404'; END IF;
  IF v.status NOT IN ('queued', 'failed') THEN
    RAISE EXCEPTION 'this receipt is % and cannot be queued again', v.status USING ERRCODE = 'GB409';
  END IF;
  PERFORM set_config('portal.requeue', 'on', true);
  UPDATE portal_receipt_jobs SET status = 'queued', attempts = 0, next_attempt_at = now(), last_error = NULL
   WHERE id = v.id RETURNING * INTO v;
  PERFORM set_config('portal.requeue', '', true);
  PERFORM _bridge_log_row('portal_receipt_jobs', v.id, 'update', NULL,
    jsonb_build_object('status', v.status, 'attempts', v.attempts, 'acceptance_id', v.acceptance_id));
  RETURN jsonb_build_object('acceptanceId', v.acceptance_id, 'status', v.status, 'attempts', v.attempts,
    'nextAttemptAt', v.next_attempt_at);
END $$;

-- 039's receipt audit, plus: a bridge requeue names the GSAM person and run.
CREATE OR REPLACE FUNCTION portal_receipt_jobs_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event    text;
  v_requeue  boolean := coalesce(current_setting('portal.requeue', true), '') = 'on';
  v_document uuid;
  v_bridge   record;
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
  SELECT o.actor, o.run INTO v_bridge FROM app_bridge_open_audit('write') o;
  SELECT a.document_id INTO v_document FROM public.portal_acceptances a WHERE a.id = NEW.acceptance_id;
  INSERT INTO public.portal_audit (org_id, customer_id, actor_kind, actor_id, run_id, event, document_id, detail)
  VALUES (NEW.org_id, NEW.customer_id, CASE WHEN v_requeue THEN 'staff' ELSE 'system' END,
          coalesce(auth.uid()::text, CASE WHEN v_requeue THEN v_bridge.actor END), CASE WHEN v_requeue THEN v_bridge.run END,
          v_event, v_document,
          jsonb_build_object('acceptance_id', NEW.acceptance_id, 'job_id', NEW.id, 'attempts', NEW.attempts)
            || CASE WHEN v_requeue AND v_bridge.actor IS NOT NULL THEN jsonb_build_object('via', 'bridge') ELSE '{}'::jsonb END);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION portal_receipt_jobs_audit() FROM public, anon, authenticated;

-- ── grants ──────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['bridge_order_set_status(uuid, text, integer)', 'bridge_order_licence_email(uuid)',
    'bridge_enquiry_set_status(text, uuid, text, integer)', 'bridge_lead_delete(uuid)',
    'bridge_customer_create(jsonb)', 'bridge_customer_edit(uuid, integer, jsonb)',
    'bridge_engagement_create(uuid, jsonb)', 'bridge_engagement_edit(uuid, integer, jsonb)',
    'bridge_engagement_set_status(uuid, integer, text)', 'bridge_engagement_delete(uuid, integer)',
    'bridge_licence_issue(uuid, jsonb)', 'bridge_licence_edit(uuid, integer, jsonb)',
    'bridge_licence_set_status(uuid, integer, text)', 'bridge_tier_create(jsonb)', 'bridge_tier_edit(uuid, jsonb)',
    'bridge_receipt_requeue(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_refund', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO gsam_bridge_write', f);
  END LOOP;
END $$;
