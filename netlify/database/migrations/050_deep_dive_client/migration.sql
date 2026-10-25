-- GRE-2374. Site-side Deep Dive cache. A site customer is linked to a GSAM tenant only
-- by an explicit staff-controlled row. No data is copied or linked by this migration.
CREATE UNIQUE INDEX IF NOT EXISTS customers_id_org_for_deep_dive ON public.customers (id, org_id);
CREATE TABLE IF NOT EXISTS public.deep_dive_tenant_links (
  tenant_id uuid PRIMARY KEY,
  customer_id uuid NOT NULL UNIQUE,
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (customer_id, org_id) REFERENCES public.customers (id, org_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public.deep_dive_snapshots (
  tenant_id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL CHECK (snapshot ->> 'schema' = 'gs-deep-dive-sync-v1'
    AND snapshot ->> 'tenantId' = tenant_id::text),
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.deep_dive_answers (
  answer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.deep_dive_tenant_links(tenant_id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_user_id uuid NOT NULL REFERENCES public.customer_users(id) ON DELETE RESTRICT,
  name text CHECK (length(name) <= 200),
  email text CHECK (length(email) <= 320),
  note text NOT NULL CHECK (length(note) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received')),
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_id, customer_id)
);

ALTER TABLE public.deep_dive_tenant_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deep_dive_tenant_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.deep_dive_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deep_dive_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.deep_dive_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deep_dive_answers FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.deep_dive_tenant_links, public.deep_dive_snapshots, public.deep_dive_answers
  FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_write, gsam_bridge_refund;
GRANT SELECT ON public.deep_dive_tenant_links, public.deep_dive_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE (status, received_at) ON public.deep_dive_answers TO authenticated;
GRANT SELECT, INSERT, UPDATE (snapshot, synced_at) ON public.deep_dive_snapshots TO gsam_bridge_write;

CREATE POLICY deep_dive_link_customer ON public.deep_dive_tenant_links FOR SELECT TO authenticated
  USING (customer_id = app_customer_id());
CREATE POLICY deep_dive_snapshot_customer ON public.deep_dive_snapshots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deep_dive_tenant_links l
    WHERE l.tenant_id = deep_dive_snapshots.tenant_id AND l.customer_id = app_customer_id()
      AND l.org_id = deep_dive_snapshots.org_id));
CREATE POLICY deep_dive_snapshot_bridge ON public.deep_dive_snapshots FOR ALL TO gsam_bridge_write
  USING (org_id = app_bridge_write_org()) WITH CHECK (org_id = app_bridge_write_org());
CREATE POLICY deep_dive_answer_customer ON public.deep_dive_answers FOR ALL TO authenticated
  USING (customer_id = app_customer_id() AND EXISTS (SELECT 1 FROM public.deep_dive_tenant_links l
    WHERE l.tenant_id = deep_dive_answers.tenant_id AND l.customer_id = app_customer_id()))
  WITH CHECK (customer_id = app_customer_id() AND EXISTS (SELECT 1 FROM public.deep_dive_tenant_links l
    WHERE l.tenant_id = deep_dive_answers.tenant_id AND l.customer_id = app_customer_id()));
