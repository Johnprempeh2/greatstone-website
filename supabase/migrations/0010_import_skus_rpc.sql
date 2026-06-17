-- 0010_import_skus_rpc.sql — atomic SKU bulk import.
-- Moves the multi-statement client apply() into ONE SECURITY DEFINER function. A plpgsql function runs
-- in a single transaction, so any error rolls the WHOLE import back — no orphaned offerings/vendors or
-- half-applied price updates. Staff-gated via app_staff_org(). The client still computes the dry-run
-- plan (buildSkuPlan) for the preview, then commits it here. USD only; GBP stays read-time derived.

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

REVOKE ALL ON FUNCTION import_skus(jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION import_skus(jsonb, jsonb) TO authenticated;
