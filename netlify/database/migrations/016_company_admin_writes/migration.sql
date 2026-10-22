-- Port of supabase/migrations/0014_company_admin_writes.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0014_company_admin_writes.sql — close the company-profile write gap found in the cycle-3 review.
-- Before this, customer_self_update (0008) + guard_customer_update (0009) let ANY company member UPDATE
-- name/domain/notes on the shared company row (only tenant/billing columns were blocked). The #org UI
-- gates editing to the admin, but that was client-side only. This makes the DB the authority:
-- a non-admin buyer may no longer change the company profile.

-- The signed-in buyer is their company's admin (explicit role OR the primary contact).
CREATE OR REPLACE FUNCTION app_customer_is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.customer_users cu
       WHERE cu.auth_subject = (auth.uid())::text
         AND cu.deleted_at IS NULL
         AND (cu.role = 'admin' OR cu.is_primary)
    )
  $$;

-- Extend the 0009 buyer guard: tenant/billing columns stay blocked for all buyers; name/domain/notes
-- are now editable only by the company admin. Staff / service_role (app_customer_id() IS NULL) pass through.
CREATE OR REPLACE FUNCTION guard_customer_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_customer_id() IS NULL THEN RETURN NEW; END IF;        -- staff / service_role / not-a-buyer: unrestricted
  IF NEW.tier_id             IS DISTINCT FROM OLD.tier_id
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.org_id           IS DISTINCT FROM OLD.org_id
     OR NEW.slug             IS DISTINCT FROM OLD.slug
     OR NEW.billing_currency IS DISTINCT FROM OLD.billing_currency
     OR NEW.deleted_at       IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'buyers may only edit company name, domain and notes';
  END IF;
  IF (NEW.name   IS DISTINCT FROM OLD.name
      OR NEW.domain IS DISTINCT FROM OLD.domain
      OR NEW.notes  IS DISTINCT FROM OLD.notes)
     AND NOT app_customer_is_admin() THEN
    RAISE EXCEPTION 'only the company admin may edit the company profile';
  END IF;
  RETURN NEW;
END; $$;
-- (trigger trg_guard_customer_update from 0009 already points at this function — no re-create needed.)
