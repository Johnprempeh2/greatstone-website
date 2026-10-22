-- Port of supabase/migrations/0009_account_guards.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0009_account_guards.sql — close the cross-tenant write holes the adversarial review found.
-- Buyers and staff share the `authenticated` Postgres role, so a column GRANT would also cripple staff.
-- Instead: BEFORE UPDATE trigger guards that fire ONLY for self-service buyers (app_customer_id() not null;
-- staff and service_role both resolve NULL and pass through). Plus: require a verified email before the
-- ensure_customer_account email re-link (prevents takeover of a sales-seeded contact when confirmation is off).

-- 1) customer_users: a buyer may edit only full_name / phone on their OWN row. Block tenant/identity columns.
CREATE OR REPLACE FUNCTION guard_customer_user_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_customer_id() IS NULL THEN RETURN NEW; END IF;        -- staff / service_role / not-a-buyer: unrestricted
  IF NEW.customer_id  IS DISTINCT FROM OLD.customer_id
     OR NEW.org_id    IS DISTINCT FROM OLD.org_id
     OR NEW.auth_subject IS DISTINCT FROM OLD.auth_subject
     OR NEW.email     IS DISTINCT FROM OLD.email
     OR NEW.is_primary IS DISTINCT FROM OLD.is_primary THEN
    RAISE EXCEPTION 'buyers may only edit name and phone';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_customer_user_update ON customer_users;
CREATE TRIGGER trg_guard_customer_user_update BEFORE UPDATE ON customer_users
  FOR EACH ROW EXECUTE FUNCTION guard_customer_user_update();

-- 2) customers: a buyer may edit only name / domain / notes on their OWN company. Block tier/stripe/tenant columns.
CREATE OR REPLACE FUNCTION guard_customer_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_customer_id() IS NULL THEN RETURN NEW; END IF;
  IF NEW.tier_id            IS DISTINCT FROM OLD.tier_id
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.org_id          IS DISTINCT FROM OLD.org_id
     OR NEW.slug            IS DISTINCT FROM OLD.slug
     OR NEW.billing_currency IS DISTINCT FROM OLD.billing_currency
     OR NEW.deleted_at      IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'buyers may only edit company name, domain and notes';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_customer_update ON customers;
CREATE TRIGGER trg_guard_customer_update BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION guard_customer_update();

-- 3) ensure_customer_account: only re-link a sales-seeded contact when the JWT email is VERIFIED.
--    (Unverified signup with confirmation off must NOT inherit an existing company by email.)
CREATE OR REPLACE FUNCTION ensure_customer_account(p_company_name TEXT DEFAULT NULL, p_full_name TEXT DEFAULT NULL)
  RETURNS TABLE (customer_id uuid, customer_user_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email citext;
  v_verified boolean := COALESCE((auth.jwt() ->> 'email_verified')::boolean, false);
  v_org   uuid := '11111111-1111-4111-8111-111111111111';
  v_cu    customer_users%ROWTYPE;
  v_cid   uuid;
  v_cuid  uuid;
  v_slug  citext;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.auth_subject = v_uid::text AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'staff account cannot self-provision as a customer';
  END IF;

  SELECT (auth.jwt() ->> 'email')::citext INTO v_email;

  -- already provisioned? (fast path)
  SELECT * INTO v_cu FROM public.customer_users
   WHERE org_id = v_org AND auth_subject = v_uid::text AND deleted_at IS NULL LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT v_cu.customer_id, v_cu.id; RETURN; END IF;

  -- re-link a sales-seeded contact by email — ONLY when the email is verified
  IF v_email IS NOT NULL AND v_verified THEN
    SELECT * INTO v_cu FROM public.customer_users
     WHERE org_id = v_org AND email = v_email AND deleted_at IS NULL LIMIT 1;
    IF FOUND THEN
      UPDATE public.customer_users
         SET auth_subject = v_uid::text, full_name = COALESCE(full_name, p_full_name), updated_at = now()
       WHERE id = v_cu.id;
      RETURN QUERY SELECT v_cu.customer_id, v_cu.id; RETURN;
    END IF;
  END IF;

  -- first-time buyer → create company + primary contact
  v_slug := left(regexp_replace(lower(coalesce(NULLIF(p_company_name,''), split_part(coalesce(v_email,'buyer'),'@',1))), '[^a-z0-9]+', '-', 'g'), 40)
            || '-' || substr(v_uid::text, 1, 8);
  INSERT INTO public.customers (org_id, slug, name, metadata)
    VALUES (v_org, v_slug, COALESCE(NULLIF(p_company_name,''), split_part(coalesce(v_email,'buyer'),'@',1)), jsonb_build_object('self_signup', true))
    RETURNING id INTO v_cid;
  INSERT INTO public.customer_users (org_id, customer_id, email, full_name, is_primary, auth_subject)
    VALUES (v_org, v_cid, COALESCE(v_email, (v_uid::text || '@unknown.local')::citext), p_full_name, true, v_uid::text)
    RETURNING id INTO v_cuid;
  RETURN QUERY SELECT v_cid, v_cuid;
END; $$;
