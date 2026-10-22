-- Port of supabase/migrations/0008_customer_accounts.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0008_customer_accounts.sql — hybrid, B2B-ready customer accounts.
-- A signup creates a customer (company) + customer_user (contact) linked to the auth user; tiers
-- and multiple users per company switch on later with no migration. Mirrors 0004's SECURITY DEFINER
-- + staff_all / self_read patterns. A customer reads ONLY their own company's orders + own profile.

-- 1) Stripe customer linkage on the COMPANY (shared saved cards/invoices when multi-user switches on).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_stripe ON customers(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- 2) Order -> buyer linkage. customer_id FK exists (0001) but is never stamped; add the captured
--    email + the placing contact, and indexes for the portal read.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email CITEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES customer_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(org_id, customer_email) WHERE deleted_at IS NULL;

-- 3) Make a customer_user's auth link resolvable + collision-proof: one auth user -> at most one
--    customer_user in the org.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_users_auth ON customer_users(org_id, auth_subject) WHERE auth_subject IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customer_users_auth_lookup ON customer_users(auth_subject) WHERE auth_subject IS NOT NULL AND deleted_at IS NULL;

-- 4) app_customer_id(): the signed-in buyer's company id. SECURITY DEFINER (reads under FORCE RLS),
--    the customer-side twin of app_staff_org() from 0004. NULL for staff/anon.
CREATE OR REPLACE FUNCTION app_customer_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT cu.customer_id FROM public.customer_users cu
     WHERE cu.auth_subject = (auth.uid())::text
       AND cu.deleted_at IS NULL
     LIMIT 1
  $$;

-- 5) ensure_customer_account(): idempotent provisioning, called from the browser after signUp and on
--    every signIn. Creates company+contact for a first-time buyer, re-links a sales-seeded contact by
--    email, or returns the existing pair. SECURITY DEFINER (writes under FORCE RLS as the auth user).
--    HARD GUARD: never provisions a staff auth user as a customer.
CREATE OR REPLACE FUNCTION ensure_customer_account(p_company_name TEXT DEFAULT NULL, p_full_name TEXT DEFAULT NULL)
  RETURNS TABLE (customer_id uuid, customer_user_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email citext;
  v_org   uuid := '11111111-1111-4111-8111-111111111111';   -- single live org (swap to a lookup when multi-org)
  v_cu    customer_users%ROWTYPE;
  v_cid   uuid;
  v_cuid  uuid;
  v_slug  citext;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- Staff auth users (identity in public.users) must never become customers.
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.auth_subject = v_uid::text AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'staff account cannot self-provision as a customer';
  END IF;

  SELECT (auth.jwt() ->> 'email')::citext INTO v_email;

  -- Already provisioned? (idempotent fast path)
  SELECT * INTO v_cu FROM public.customer_users
   WHERE org_id = v_org AND auth_subject = v_uid::text AND deleted_at IS NULL LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_cu.customer_id, v_cu.id; RETURN;
  END IF;

  -- Re-link a sales-seeded contact with the same email (B2B onboarding).
  IF v_email IS NOT NULL THEN
    SELECT * INTO v_cu FROM public.customer_users
     WHERE org_id = v_org AND email = v_email AND deleted_at IS NULL LIMIT 1;
    IF FOUND THEN
      UPDATE public.customer_users
         SET auth_subject = v_uid::text, full_name = COALESCE(full_name, p_full_name), updated_at = now()
       WHERE id = v_cu.id;
      RETURN QUERY SELECT v_cu.customer_id, v_cu.id; RETURN;
    END IF;
  END IF;

  -- First-time buyer -> create company + primary contact.
  v_slug := left(regexp_replace(lower(coalesce(NULLIF(p_company_name,''), split_part(coalesce(v_email,'buyer'),'@',1))), '[^a-z0-9]+', '-', 'g'), 40)
            || '-' || substr(v_uid::text, 1, 8);
  INSERT INTO public.customers (org_id, slug, name, metadata)
    VALUES (v_org, v_slug, COALESCE(NULLIF(p_company_name,''), split_part(coalesce(v_email,'buyer'),'@',1)), jsonb_build_object('self_signup', true))
    RETURNING id INTO v_cid;
  INSERT INTO public.customer_users (org_id, customer_id, email, full_name, is_primary, auth_subject)
    VALUES (v_org, v_cid, COALESCE(v_email, (v_uid::text || '@unknown.local')::citext), p_full_name, true, v_uid::text)
    RETURNING id INTO v_cuid;
  RETURN QUERY SELECT v_cid, v_cuid;
END;
$$;
REVOKE ALL ON FUNCTION ensure_customer_account(text,text) FROM public;
GRANT EXECUTE ON FUNCTION ensure_customer_account(text,text) TO authenticated;

-- 6) customer_self RLS — a customer reads ONLY their own company's orders/order_items + own profile.
--    Permissive (OR'd with org_isolation + staff_all), so staff/admin paths are unaffected.
GRANT SELECT ON orders, order_items TO authenticated;
GRANT SELECT, UPDATE ON customers TO authenticated;
GRANT SELECT, UPDATE ON customer_users TO authenticated;
GRANT SELECT ON customer_tiers TO authenticated;

DROP POLICY IF EXISTS customer_self ON orders;
CREATE POLICY customer_self ON orders FOR SELECT TO authenticated
  USING (customer_id IS NOT NULL AND customer_id = app_customer_id());

DROP POLICY IF EXISTS customer_self ON order_items;
CREATE POLICY customer_self ON order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.customer_id = app_customer_id()));

DROP POLICY IF EXISTS customer_self ON customers;
CREATE POLICY customer_self ON customers FOR SELECT TO authenticated
  USING (id = app_customer_id());
DROP POLICY IF EXISTS customer_self_update ON customers;
CREATE POLICY customer_self_update ON customers FOR UPDATE TO authenticated
  USING (id = app_customer_id()) WITH CHECK (id = app_customer_id());

DROP POLICY IF EXISTS customer_self ON customer_users;
CREATE POLICY customer_self ON customer_users FOR SELECT TO authenticated
  USING (customer_id = app_customer_id());
DROP POLICY IF EXISTS customer_self_update ON customer_users;
CREATE POLICY customer_self_update ON customer_users FOR UPDATE TO authenticated
  USING (auth_subject = (auth.uid())::text) WITH CHECK (auth_subject = (auth.uid())::text);

DROP POLICY IF EXISTS customer_self ON customer_tiers;
CREATE POLICY customer_self ON customer_tiers FOR SELECT TO authenticated
  USING (id = (SELECT c.tier_id FROM customers c WHERE c.id = app_customer_id()));
