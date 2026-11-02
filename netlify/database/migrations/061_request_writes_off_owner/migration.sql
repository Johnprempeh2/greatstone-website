-- GRE-1797 fails 4 and 5 (Flint). Three writes ran on a visitor's request with more than the visitor's rights:
--   * request-quote indexed a guest's PO document as service_role (BYPASSRLS);
--   * deep-dive-document saved a client's file index row on the owner pool;
--   * deep-dive-client marked a client's answer received on the owner pool.
-- netlifydb_owner has BYPASSRLS on Netlify Database (checked on staging, 2 Nov), so the owner queries ran with no RLS.
-- Each write is now one SECURITY DEFINER function, called by the request's own role (anon or authenticated) inside
-- its claims transaction. The function picks the row from the caller's claims (visitor_quote_id(), app_customer_id()),
-- so a caller can only touch its own quote or its own customer's Deep Dive rows.

-- The PO index row for the quote this transaction just made (created_at = now(), as 045's visitor policies). The path
-- is the one on the quote, which the 045 guard holds to '<quote id>/…'. It commits or rolls back with the quote, so
-- a failed quote leaves no index row.
CREATE FUNCTION public.visitor_quote_po_index() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH added AS (
    INSERT INTO storage.objects (bucket_id, name)
    SELECT 'po-documents', q.po_document_path FROM public.quotes q
     WHERE q.id = public.visitor_quote_id() AND q.created_at = now() AND q.po_document_path IS NOT NULL
       AND left(q.po_document_path, 37) = q.id::text || '/'
    ON CONFLICT (bucket_id, name) DO NOTHING RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM added) $$;
REVOKE ALL ON FUNCTION public.visitor_quote_po_index() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.visitor_quote_po_index() TO anon, authenticated;

-- A client's own upload for an open document request in its linked tenant, until its answer is received.
-- The customer comes from the claims, not from the caller.
CREATE FUNCTION public.deep_dive_client_document_add(p_tenant_id uuid, p_request_id uuid, p_file_name text,
  p_mime text, p_byte_size integer, p_blob_key text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.deep_dive_documents (tenant_id, customer_id, source_id, kind, file_name, mime, byte_size, blob_key)
  SELECT l.tenant_id, l.customer_id, p_request_id, 'client', p_file_name, p_mime, p_byte_size, p_blob_key
    FROM public.deep_dive_tenant_links l
    JOIN public.deep_dive_snapshots s ON s.tenant_id = l.tenant_id AND s.org_id = l.org_id
   WHERE l.tenant_id = p_tenant_id AND l.customer_id = public.app_customer_id()
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.snapshot -> 'documentRequests') r
       WHERE r ->> 'id' = p_request_id::text AND r ->> 'status' = 'open')
     AND NOT EXISTS (SELECT 1 FROM public.deep_dive_answers a WHERE a.tenant_id = l.tenant_id
       AND a.customer_id = l.customer_id AND a.request_id = p_request_id AND a.status = 'received')
  RETURNING id $$;
REVOKE ALL ON FUNCTION public.deep_dive_client_document_add(uuid, uuid, text, text, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deep_dive_client_document_add(uuid, uuid, text, text, integer, text) TO authenticated;

-- Delivery state stays out of the client's column grants (051). The site calls this only after GSAM took the answer.
CREATE FUNCTION public.deep_dive_answer_received(p_answer_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH done AS (
    UPDATE public.deep_dive_answers SET status = 'received', received_at = now()
     WHERE answer_id = p_answer_id AND customer_id = public.app_customer_id() AND status = 'pending'
    RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM done) $$;
REVOKE ALL ON FUNCTION public.deep_dive_answer_received(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deep_dive_answer_received(uuid) TO authenticated;
