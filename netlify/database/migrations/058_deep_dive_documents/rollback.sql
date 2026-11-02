-- Only after preserving any uploaded files and pending answers externally.
DROP TRIGGER deep_dive_answer_document_guard ON public.deep_dive_answers;
DROP FUNCTION public.deep_dive_answer_document_guard();
REVOKE INSERT (document_id), UPDATE (document_id) ON public.deep_dive_answers FROM authenticated;
ALTER TABLE public.deep_dive_answers DROP COLUMN document_id;
DROP TABLE public.deep_dive_documents;
DROP POLICY deep_dive_link_bridge ON public.deep_dive_tenant_links;
REVOKE SELECT ON public.deep_dive_tenant_links FROM gsam_bridge_write;
DROP POLICY deep_dive_link_bridge_read ON public.deep_dive_tenant_links;
REVOKE SELECT ON public.deep_dive_tenant_links FROM gsam_bridge_read;
