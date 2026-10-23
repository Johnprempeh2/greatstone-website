-- Back to 044: no visitor access to quotes, and 011's customers guard (buyers cannot set stripe_customer_id).
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
DROP POLICY IF EXISTS visitor_insert_own ON quote_items;
DROP POLICY IF EXISTS visitor_select_own ON quotes;
DROP POLICY IF EXISTS visitor_insert_own ON quotes;
-- back to 002's default grants (anon had no policy, so they gave nothing)
REVOKE ALL ON quotes, quote_items FROM anon;
GRANT ALL ON quotes, quote_items TO anon;
DROP TRIGGER IF EXISTS trg_guard_visitor_quote ON quote_items;
DROP TRIGGER IF EXISTS trg_guard_visitor_quote ON quotes;
DROP FUNCTION IF EXISTS guard_visitor_quote();
ALTER TABLE quote_items ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE quotes ALTER COLUMN org_id DROP DEFAULT;
DROP FUNCTION IF EXISTS visitor_quote_org();
DROP FUNCTION IF EXISTS visitor_quote_id();
