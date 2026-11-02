-- GRE-2630: recurring billing records. No charging or Stripe subscription is created here.
CREATE TABLE public.billing_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  offering_id uuid REFERENCES public.offerings(id),
  variant_id uuid REFERENCES public.offering_variants(id),
  order_id uuid REFERENCES public.orders(id),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
  qty integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  billing_period billing_period NOT NULL CHECK (billing_period IN ('monthly', 'quarterly', 'annual', 'multi_year')),
  starts_on date NOT NULL,
  next_bill_on date,
  ends_on date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  notes text CHECK (length(notes) <= 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  row_version integer NOT NULL DEFAULT 1,
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK (next_bill_on IS NULL OR next_bill_on >= starts_on),
  CHECK (status <> 'ended' OR ends_on IS NOT NULL)
);
CREATE INDEX billing_lines_customer_page ON public.billing_lines (org_id, customer_id, created_at, id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_touch_billing_lines BEFORE UPDATE ON public.billing_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_row();

-- The default Netlify grants include anon. Remove them before opening any bridge policy.
REVOKE ALL ON public.billing_lines FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.billing_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.billing_lines
  USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
CREATE POLICY staff_all ON public.billing_lines FOR ALL TO authenticated
  USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org());
GRANT SELECT, INSERT, UPDATE ON public.billing_lines TO authenticated;

GRANT SELECT (id, org_id, customer_id, offering_id, variant_id, order_id, description, qty,
  unit_price_minor, currency, billing_period, starts_on, next_bill_on, ends_on, status, notes,
  created_at, updated_at, deleted_at, row_version)
  ON public.billing_lines TO gsam_bridge_read, gsam_bridge_write;
GRANT INSERT (org_id, customer_id, offering_id, variant_id, order_id, description, qty,
  unit_price_minor, currency, billing_period, starts_on, next_bill_on, ends_on, notes),
  UPDATE (description, qty, unit_price_minor, currency, billing_period, starts_on, next_bill_on,
  ends_on, status, notes, deleted_at)
  ON public.billing_lines TO gsam_bridge_write;
CREATE POLICY gsam_bridge_read ON public.billing_lines FOR SELECT TO gsam_bridge_read
  USING (org_id = app_bridge_org());
CREATE POLICY gsam_bridge_read_scope ON public.billing_lines AS RESTRICTIVE FOR ALL TO gsam_bridge_read
  USING (org_id = app_bridge_org()) WITH CHECK (false);
CREATE POLICY gsam_bridge_write ON public.billing_lines FOR ALL TO gsam_bridge_write
  USING (org_id = app_bridge_write_org()) WITH CHECK (org_id = app_bridge_write_org());
CREATE POLICY gsam_bridge_write_scope ON public.billing_lines AS RESTRICTIVE FOR ALL TO gsam_bridge_write
  USING (org_id = app_bridge_write_org()) WITH CHECK (org_id = app_bridge_write_org());

-- A foreign key checks existence, not tenancy. Check every reference against this line's org.
CREATE FUNCTION public.billing_line_refs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = NEW.customer_id AND org_id = NEW.org_id AND deleted_at IS NULL)
    OR (NEW.offering_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM offerings WHERE id = NEW.offering_id AND org_id = NEW.org_id AND deleted_at IS NULL))
    OR (NEW.variant_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM offering_variants WHERE id = NEW.variant_id AND org_id = NEW.org_id AND deleted_at IS NULL
       AND (NEW.offering_id IS NULL OR offering_id = NEW.offering_id)))
    OR (NEW.order_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM orders WHERE id = NEW.order_id AND org_id = NEW.org_id AND customer_id = NEW.customer_id AND deleted_at IS NULL))
  THEN RAISE EXCEPTION 'billing line reference is not a live row in this organisation' USING ERRCODE = 'GB400'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.billing_line_refs() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_billing_line_refs BEFORE INSERT OR UPDATE OF org_id, customer_id, offering_id, variant_id, order_id
  ON public.billing_lines FOR EACH ROW EXECUTE FUNCTION public.billing_line_refs();
CREATE TRIGGER trg_admin_bridge_change AFTER INSERT OR UPDATE ON public.billing_lines
  FOR EACH ROW EXECUTE FUNCTION public.admin_bridge_log_change();
