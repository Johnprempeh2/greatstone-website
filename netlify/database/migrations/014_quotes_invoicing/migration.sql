-- Port of supabase/migrations/0012_quotes_invoicing.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0012_quotes_invoicing.sql — the B2B quote → PO → invoice path (pay-on-invoice, not card).
-- Builds on the existing quotes/quote_items tables. Adds: PO + finalised-total + validity fields,
-- auto quote references (Q-YYYY-NNNNNN) and invoice numbers (INV-YYYY-NNNNN), customer-self RLS so a
-- buyer sees their own quotes, and an atomic convert_quote_to_order RPC.

CREATE SEQUENCE IF NOT EXISTS quote_ref_seq;
CREATE SEQUENCE IF NOT EXISTS invoice_no_seq START 1000;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS po_reference TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quoted_total_minor BIGINT CHECK (quoted_total_minor IS NULL OR quoted_total_minor >= 0); -- staff's finalised inc-VAT total
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until DATE;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS po_reference TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- Auto-assign a human quote reference on insert when one isn't supplied.
CREATE OR REPLACE FUNCTION set_quote_reference() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    NEW.reference := 'Q-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('quote_ref_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_set_quote_reference ON quotes;
CREATE TRIGGER trg_set_quote_reference BEFORE INSERT ON quotes FOR EACH ROW EXECUTE FUNCTION set_quote_reference();

-- customer_self: a signed-in buyer reads ONLY their own company's quotes + items (mirrors orders, 0008).
GRANT SELECT ON quotes, quote_items TO authenticated;
DROP POLICY IF EXISTS customer_self ON quotes;
CREATE POLICY customer_self ON quotes FOR SELECT TO authenticated
  USING (customer_id IS NOT NULL AND customer_id = app_customer_id());
DROP POLICY IF EXISTS customer_self ON quote_items;
CREATE POLICY customer_self ON quote_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_id AND q.customer_id = app_customer_id()));

-- Atomic quote → order conversion + invoice number. Staff only. One transaction = all-or-nothing.
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
REVOKE ALL ON FUNCTION convert_quote_to_order(uuid) FROM public;
GRANT EXECUTE ON FUNCTION convert_quote_to_order(uuid) TO authenticated;
