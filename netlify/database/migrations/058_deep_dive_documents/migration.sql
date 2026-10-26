-- GRE-2620. Private bytes live in Netlify Blobs; this table is the tenant-scoped index.
CREATE TABLE public.deep_dive_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.deep_dive_tenant_links(tenant_id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  source_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('client', 'collected', 'deliverable')),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  mime text NOT NULL CHECK (length(mime) BETWEEN 1 AND 150),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 26214400),
  blob_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_id, kind)
);
ALTER TABLE public.deep_dive_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deep_dive_documents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.deep_dive_documents FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_write, gsam_bridge_refund;
GRANT SELECT ON public.deep_dive_documents TO authenticated;
GRANT SELECT, INSERT (tenant_id,customer_id,source_id,kind,file_name,mime,byte_size,blob_key)
  ON public.deep_dive_documents TO gsam_bridge_write;
GRANT SELECT ON public.deep_dive_tenant_links TO gsam_bridge_write;
GRANT SELECT ON public.deep_dive_tenant_links TO gsam_bridge_read;
CREATE POLICY deep_dive_link_bridge ON public.deep_dive_tenant_links FOR SELECT TO gsam_bridge_write
  USING (org_id=app_bridge_write_org());
CREATE POLICY deep_dive_link_bridge_read ON public.deep_dive_tenant_links FOR SELECT TO gsam_bridge_read
  USING (org_id=app_bridge_org());
CREATE POLICY deep_dive_document_customer ON public.deep_dive_documents FOR SELECT TO authenticated
  USING (customer_id=app_customer_id() AND EXISTS (SELECT 1 FROM public.deep_dive_tenant_links l
    WHERE l.tenant_id=deep_dive_documents.tenant_id AND l.customer_id=app_customer_id()));
CREATE POLICY deep_dive_document_bridge_insert ON public.deep_dive_documents FOR INSERT TO gsam_bridge_write
  WITH CHECK (kind IN ('collected','deliverable') AND EXISTS
    (SELECT 1 FROM public.deep_dive_tenant_links l WHERE l.tenant_id=deep_dive_documents.tenant_id
      AND l.customer_id=deep_dive_documents.customer_id AND l.org_id=app_bridge_write_org()));
CREATE POLICY deep_dive_document_bridge_read ON public.deep_dive_documents FOR SELECT TO gsam_bridge_write
  USING (EXISTS (SELECT 1 FROM public.deep_dive_tenant_links l WHERE l.tenant_id=deep_dive_documents.tenant_id
    AND l.customer_id=deep_dive_documents.customer_id AND l.org_id=app_bridge_write_org()));
GRANT SELECT ON public.deep_dive_documents TO gsam_bridge_read;
CREATE POLICY deep_dive_document_bridge_download ON public.deep_dive_documents FOR SELECT TO gsam_bridge_read
  USING (kind='client' AND EXISTS (SELECT 1 FROM public.deep_dive_tenant_links l
    WHERE l.tenant_id=deep_dive_documents.tenant_id AND l.customer_id=deep_dive_documents.customer_id
      AND l.org_id=app_bridge_org()));
ALTER TABLE public.deep_dive_answers ADD COLUMN document_id uuid REFERENCES public.deep_dive_documents(id) ON DELETE RESTRICT;
GRANT INSERT (document_id), UPDATE (document_id) ON public.deep_dive_answers TO authenticated;
CREATE FUNCTION public.deep_dive_answer_document_guard() RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.document_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM public.deep_dive_documents d WHERE d.id=NEW.document_id
      AND d.tenant_id=NEW.tenant_id AND d.customer_id=NEW.customer_id
      AND d.source_id=NEW.request_id AND d.kind='client') THEN
    RAISE EXCEPTION 'answer document does not belong to request' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.deep_dive_answer_document_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER deep_dive_answer_document_guard BEFORE INSERT OR UPDATE OF document_id,tenant_id,customer_id,request_id
  ON public.deep_dive_answers FOR EACH ROW EXECUTE FUNCTION public.deep_dive_answer_document_guard();
