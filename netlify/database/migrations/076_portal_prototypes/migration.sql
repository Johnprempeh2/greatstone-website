-- 076_portal_prototypes: the client portal's Prototypes section (John, 14 Nov). GSAM pushes, per client organisation
-- (customers.id), the whole list of prototypes a Greatstone person chose to show that client; a later push replaces
-- it, so a prototype turned off in GSAM is gone after the next push (GSAM pushes at once). Nothing here is public.
--
--   * customer_id is the website organisation id (GRE-2623) and must be a client of the row's org (trigger below).
--   * A signed-in client reads only rows of their own organisation (app_customer_id()), read only.
--   * Only the bridge write role writes, and only rows of its own org; GSAM never sends another org's client.
--   * The thumbnail is a small JPEG data URL, so the site never fetches from GSAM or the prototype's host.
-- Additive: one new table, no change to any existing object. Re-runnable. Rollback: rollback.sql in this folder.

CREATE TABLE IF NOT EXISTS public.portal_prototypes (
  org_id       uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  customer_id  uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  prototype_id text NOT NULL CHECK (prototype_id ~ '^[A-Za-z0-9_.:-]{1,100}$'),
  title        text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description  text CHECK (description IS NULL OR length(description) <= 600),
  url          text NOT NULL CHECK (url ~ '^https://[^\s/]+' AND length(url) <= 2000),
  version      integer NOT NULL CHECK (version > 0),
  thumbnail    text CHECK (thumbnail IS NULL OR (length(thumbnail) <= 40000
                 AND thumbnail ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')),
  updated_at   timestamptz NOT NULL,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, prototype_id)
);

-- The client must be of the row's org. A trigger, not a (customer_id, org_id) foreign key, so 050's rollback can still
-- drop its customers (id, org_id) index. Raised as a foreign key violation, which the bridge answers as not_found.
CREATE OR REPLACE FUNCTION portal_prototypes_client_of_org() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = NEW.customer_id AND c.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'client not found in this organisation' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION portal_prototypes_client_of_org() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_portal_prototypes_client_of_org ON public.portal_prototypes;
CREATE TRIGGER trg_portal_prototypes_client_of_org BEFORE INSERT OR UPDATE ON public.portal_prototypes
  FOR EACH ROW EXECUTE FUNCTION portal_prototypes_client_of_org();
CREATE INDEX IF NOT EXISTS portal_prototypes_org ON public.portal_prototypes (org_id, customer_id);

ALTER TABLE public.portal_prototypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_prototypes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.portal_prototypes
  FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_write, gsam_bridge_refund;
GRANT SELECT ON public.portal_prototypes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.portal_prototypes TO gsam_bridge_write;

DROP POLICY IF EXISTS portal_prototypes_customer ON public.portal_prototypes;
CREATE POLICY portal_prototypes_customer ON public.portal_prototypes FOR SELECT TO authenticated
  USING (customer_id = app_customer_id());
DROP POLICY IF EXISTS portal_prototypes_bridge ON public.portal_prototypes;
CREATE POLICY portal_prototypes_bridge ON public.portal_prototypes FOR ALL TO gsam_bridge_write
  USING (org_id = app_bridge_write_org()) WITH CHECK (org_id = app_bridge_write_org());
