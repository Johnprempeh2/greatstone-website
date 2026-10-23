-- 045_visitor_quotes — quotes from visitors, and the buyer's Stripe Customer id, under RLS (GRE-2018, for GRE-1989).
-- Netlify only; no Supabase port.
--
-- On Supabase the `request-quote`, `stripe-checkout` and `stripe-portal` edge functions used the service role. The
-- Netlify functions run each visitor request as anon or authenticated (the claims bridge, 002), and service_role stays
-- for the Stripe webhook and other workers. This opens exactly what those three functions write, and nothing more:
--
--   * One quote per transaction, as in 044. The function makes the quote id (crypto.randomUUID()), binds it, then
--     inserts the quote and its items:
--       set_config('request.jwt.claims', '{"role":"anon","visitor_quote":"<uuid>"}', true)          -- a guest
--       set_config('request.jwt.claims', '{"sub":…,"email":…,"visitor_quote":"<uuid>"}', true)      -- signed in
--     visitor_quote_id() reads it. Every visitor policy below matches only that quote, and only when it was created
--     in this same transaction (created_at = now(), the transaction's start time; the guard below sets created_at),
--     so a transaction can never read or add to another quote, even one whose id it learns. Without the claim a
--     visitor gets nothing. So the quote and its items go in one transaction, which also keeps them all-or-nothing.
--   * Quote insert: org_id comes from its default, visitor_quote_org(). A guest's quote has no customer. A signed-in
--     buyer may stamp their own company and contact (customer_id = app_customer_id(), customer_user_id = their own
--     customer_users row), so the quote shows in their account through 014's customer_self; or neither.
--     Staff columns stay closed: status is 'new', reference comes from 014's trigger, and assigned_to,
--     quoted_total_minor, valid_until, deleted_at and metadata keep their defaults. created_at is always now(),
--     so a visitor cannot make an old quote look new. A PO document is recorded at insert, under '<quote id>/'.
--     The function stores the bytes (Netlify Blobs) before the insert; 028 still gives visitors no storage write.
--   * Item insert: only into the bound quote, and only for a variant the visitor can see (005's public_read: a
--     published offering), matching its offering. org_id comes from the default.
--   * Visitors read back only id, reference and created_at of the bound quote (INSERT ... RETURNING id, reference).
--     No UPDATE and no DELETE on quotes or items for visitors.
--   * Buyers and staff share the authenticated role, and staff need every column, so column grants limit anon only.
--     For a signed-in visitor the same limits come from guard_visitor_quote(), a BEFORE INSERT trigger that skips
--     staff (app_staff_org()), service_role and the owner, as 011's guards do.
--   * customers.stripe_customer_id: 011's guard blocked buyers from it, so checkout and the billing portal could not
--     save the Stripe Customer they create. A buyer may now set it once, on their own company (010's
--     customer_self_update), from NULL to a 'cus_…' id. They cannot change or clear it, and every other guarded
--     column stays blocked. uq_customers_stripe (010) stops two companies sharing one id. Write it as a guarded,
--     compare-and-set update; Stripe's idempotency key ('gs-cust-' || customer id) makes a parallel retry a no-op:
--       UPDATE customers SET stripe_customer_id = $1 WHERE id = app_customer_id() AND stripe_customer_id IS NULL
--     The webhook keeps service_role.
-- Re-runnable. Rollback: rollback.sql in this folder.

-- The quote this transaction may touch, or NULL. Not a uuid means NULL, never an error.
CREATE OR REPLACE FUNCTION visitor_quote_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v::uuid END
    FROM (SELECT auth.jwt() ->> 'visitor_quote' AS v) c $$;
REVOKE ALL ON FUNCTION visitor_quote_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION visitor_quote_id() TO anon, authenticated, service_role;

-- The organisation a visitor's quote belongs to: the first one, as request-quote's ORG and 044's front_door_org().
-- Visitors cannot read organisations, so this runs as the owner and returns only the id. It is also the column
-- default, so staff inserts that leave org_id out run it too.
CREATE OR REPLACE FUNCTION visitor_quote_org() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM organisations ORDER BY created_at LIMIT 1 $$;
REVOKE ALL ON FUNCTION visitor_quote_org() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION visitor_quote_org() TO anon, authenticated, service_role;
ALTER TABLE quotes ALTER COLUMN org_id SET DEFAULT visitor_quote_org();
ALTER TABLE quote_items ALTER COLUMN org_id SET DEFAULT visitor_quote_org();

-- Visitor limits for a signed-in visitor (anon is held to the same by its column grants). SECURITY INVOKER, so
-- current_user is the request's role. Named to fire before 014's trg_set_quote_reference.
CREATE OR REPLACE FUNCTION guard_visitor_quote() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR app_staff_org() IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'quotes' THEN
    IF NEW.status IS DISTINCT FROM 'new'
       OR coalesce(NEW.reference, '') <> ''
       OR NEW.assigned_to IS NOT NULL OR NEW.quoted_total_minor IS NOT NULL OR NEW.valid_until IS NOT NULL
       OR NEW.deleted_at IS NOT NULL OR NEW.metadata IS DISTINCT FROM '{}'::jsonb
       OR NEW.source NOT IN ('product_page', 'enquiry_basket', 'contact_form')
       OR (NEW.po_document_path IS NOT NULL AND left(NEW.po_document_path, 37) IS DISTINCT FROM NEW.id::text || '/') THEN
      RAISE EXCEPTION 'visitors may only send a new quote' USING ERRCODE = '42501';
    END IF;
    NEW.updated_at := now();
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_visitor_quote ON quotes;
CREATE TRIGGER trg_guard_visitor_quote BEFORE INSERT ON quotes FOR EACH ROW EXECUTE FUNCTION guard_visitor_quote();
DROP TRIGGER IF EXISTS trg_guard_visitor_quote ON quote_items;
CREATE TRIGGER trg_guard_visitor_quote BEFORE INSERT ON quote_items FOR EACH ROW EXECUTE FUNCTION guard_visitor_quote();

-- Anon: replace Supabase's blanket default grants (002) with the columns a quote request writes and reads back.
-- Anon had no policy on either table, so this takes nothing away.
REVOKE ALL ON quotes, quote_items FROM anon;
GRANT INSERT (id, contact_name, contact_email, contact_company, contact_phone, message, po_reference, source,
              currency, indicative_total_minor, po_document_path, po_document_name) ON quotes TO anon;
GRANT SELECT (id, reference, created_at) ON quotes TO anon;
GRANT INSERT (quote_id, offering_id, variant_id, applied_rule_id, offering_name, variant_name, qty, list_price_minor,
              captured_price_minor, currency) ON quote_items TO anon;

DROP POLICY IF EXISTS visitor_insert_own ON quotes;
CREATE POLICY visitor_insert_own ON quotes FOR INSERT TO anon, authenticated
  WITH CHECK (
    id = visitor_quote_id() AND org_id = visitor_quote_org()
    AND (
      (customer_id IS NULL AND customer_user_id IS NULL)
      OR (customer_id = app_customer_id() AND EXISTS (
            SELECT 1 FROM customer_users cu
             WHERE cu.id = quotes.customer_user_id AND cu.customer_id = quotes.customer_id
               AND cu.auth_subject = (auth.uid())::text AND cu.deleted_at IS NULL))
    ));

DROP POLICY IF EXISTS visitor_select_own ON quotes;
CREATE POLICY visitor_select_own ON quotes FOR SELECT TO anon, authenticated
  USING (id = visitor_quote_id() AND created_at = now());

DROP POLICY IF EXISTS visitor_insert_own ON quote_items;
CREATE POLICY visitor_insert_own ON quote_items FOR INSERT TO anon, authenticated
  WITH CHECK (
    quote_id = visitor_quote_id() AND org_id = visitor_quote_org()
    AND EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_items.quote_id AND q.created_at = now())
    AND EXISTS (SELECT 1 FROM offering_variants v
                 WHERE v.id = quote_items.variant_id AND v.offering_id = quote_items.offering_id));

-- customers: 011's guard, with one change: a buyer may set stripe_customer_id once, from NULL to a Stripe id.
CREATE OR REPLACE FUNCTION guard_customer_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_customer_id() IS NULL THEN RETURN NEW; END IF;
  IF NEW.tier_id            IS DISTINCT FROM OLD.tier_id
     OR (NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
         AND NOT (OLD.stripe_customer_id IS NULL AND NEW.stripe_customer_id ~ '^cus_[A-Za-z0-9]{1,250}$'))
     OR NEW.org_id          IS DISTINCT FROM OLD.org_id
     OR NEW.slug            IS DISTINCT FROM OLD.slug
     OR NEW.billing_currency IS DISTINCT FROM OLD.billing_currency
     OR NEW.deleted_at      IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'buyers may only edit company name, domain and notes, and set the Stripe Customer id once';
  END IF;
  RETURN NEW;
END; $$;
