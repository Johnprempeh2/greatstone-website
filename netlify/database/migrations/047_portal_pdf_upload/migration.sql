-- Short-lived, token-bound PDF staging for Netlify's buffered MCP endpoint.
-- Bytes stay outside portal_documents until the existing set_file tool succeeds.
CREATE TABLE public.mcp_pdf_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.mcp_tokens(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.portal_documents(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  filename text NOT NULL,
  declared_bytes integer NOT NULL CHECK (declared_bytes BETWEEN 1 AND 20971520),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  received_bytes integer NOT NULL DEFAULT 0,
  next_index integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);
CREATE INDEX mcp_pdf_uploads_token_expiry ON public.mcp_pdf_uploads(token_id, expires_at);
CREATE INDEX mcp_pdf_uploads_expiry ON public.mcp_pdf_uploads(expires_at);
CREATE TABLE public.mcp_pdf_chunks (
  upload_id uuid NOT NULL REFERENCES public.mcp_pdf_uploads(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  bytes bytea NOT NULL,
  PRIMARY KEY (upload_id, chunk_index)
);
ALTER TABLE public.mcp_pdf_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_pdf_uploads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_pdf_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_pdf_chunks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_pdf_uploads, public.mcp_pdf_chunks FROM public, anon, authenticated, service_role;

CREATE FUNCTION mcp_portal_pdf_cleanup() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.mcp_pdf_uploads WHERE expires_at <= now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE FUNCTION mcp_portal_pdf_begin(p_token_sha256 text, p_run_id uuid, p_agent_id uuid,
                                     p_document_id uuid, p_filename text, p_size integer, p_sha256 text)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok public.mcp_tokens := mcp_portal_token(p_token_sha256);
        v_doc public.portal_documents%ROWTYPE;
        v_id uuid;
BEGIN
  PERFORM mcp_portal_check_document(v_tok, p_document_id);
  SELECT * INTO v_doc FROM public.portal_documents WHERE id = p_document_id;
  IF v_doc.status <> 'draft' THEN
    RAISE EXCEPTION 'a file can be attached only to a draft (this one is %)', v_doc.status USING ERRCODE = 'check_violation';
  END IF;
  IF p_run_id IS NULL OR p_agent_id IS NULL THEN
    RAISE EXCEPTION 'run_id and agent_id are needed' USING ERRCODE = 'check_violation';
  END IF;
  IF p_size IS NULL OR p_size < 1 OR p_size > 20971520 THEN
    RAISE EXCEPTION 'the file is 20 MB at most' USING ERRCODE = 'check_violation';
  END IF;
  IF p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'sha256 must be 64 lowercase hex characters' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tok.id::text, 0));
  PERFORM mcp_portal_pdf_cleanup();
  IF (SELECT count(*) FROM public.mcp_pdf_uploads WHERE token_id = v_tok.id) >= 3 THEN
    RAISE EXCEPTION 'finish or wait for an open PDF upload before starting another' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.mcp_pdf_uploads(token_id, document_id, run_id, agent_id, filename, declared_bytes, sha256)
    VALUES (v_tok.id, p_document_id, p_run_id, p_agent_id, p_filename, p_size, p_sha256) RETURNING id INTO v_id;
  RETURN jsonb_build_object('session_id', v_id, 'chunk_bytes', 2097152, 'expires_in_seconds', 1800);
END;
$$;

CREATE FUNCTION mcp_portal_pdf_chunk(p_token_sha256 text, p_run_id uuid, p_agent_id uuid,
                                     p_session_id uuid, p_index integer, p_content_base64 text)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok public.mcp_tokens := mcp_portal_token(p_token_sha256);
        v_upload public.mcp_pdf_uploads%ROWTYPE;
        v_bytes bytea;
BEGIN
  SELECT * INTO v_upload FROM public.mcp_pdf_uploads
    WHERE id = p_session_id AND token_id = v_tok.id AND run_id = p_run_id AND agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'upload session not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_upload.expires_at <= now() THEN
    DELETE FROM public.mcp_pdf_uploads WHERE id = v_upload.id;
    RETURN jsonb_build_object('error', 'upload session expired');
  END IF;
  IF p_index IS DISTINCT FROM v_upload.next_index THEN
    RAISE EXCEPTION 'expected chunk index %', v_upload.next_index USING ERRCODE = 'check_violation';
  END IF;
  v_bytes := decode(p_content_base64, 'base64');
  IF octet_length(v_bytes) < 1 OR octet_length(v_bytes) > 2097152 THEN
    RAISE EXCEPTION 'a chunk must be 1 byte to 2 MB' USING ERRCODE = 'check_violation';
  END IF;
  IF v_upload.received_bytes + octet_length(v_bytes) > v_upload.declared_bytes THEN
    RAISE EXCEPTION 'chunks exceed the declared file size' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.mcp_pdf_chunks(upload_id, chunk_index, bytes) VALUES (v_upload.id, p_index, v_bytes);
  UPDATE public.mcp_pdf_uploads SET received_bytes = received_bytes + octet_length(v_bytes), next_index = next_index + 1
    WHERE id = v_upload.id;
  RETURN jsonb_build_object('next_index', p_index + 1, 'received_bytes', v_upload.received_bytes + octet_length(v_bytes));
END;
$$;

CREATE FUNCTION mcp_portal_pdf_finish(p_token_sha256 text, p_run_id uuid, p_agent_id uuid, p_session_id uuid)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok public.mcp_tokens := mcp_portal_token(p_token_sha256);
        v_upload public.mcp_pdf_uploads%ROWTYPE;
        v_pdf bytea;
        v_doc public.portal_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_upload FROM public.mcp_pdf_uploads
    WHERE id = p_session_id AND token_id = v_tok.id AND run_id = p_run_id AND agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'upload session not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_upload.expires_at <= now() THEN
    DELETE FROM public.mcp_pdf_uploads WHERE id = v_upload.id;
    RETURN jsonb_build_object('error', 'upload session expired');
  END IF;
  PERFORM mcp_portal_check_document(v_tok, v_upload.document_id);
  SELECT * INTO v_doc FROM public.portal_documents WHERE id = v_upload.document_id;
  IF v_doc.status <> 'draft' THEN
    RAISE EXCEPTION 'a file can be attached only to a draft (this one is %)', v_doc.status USING ERRCODE = 'check_violation';
  END IF;
  IF v_upload.received_bytes <> v_upload.declared_bytes THEN
    RAISE EXCEPTION 'PDF upload is incomplete: % of % bytes received', v_upload.received_bytes, v_upload.declared_bytes USING ERRCODE = 'check_violation';
  END IF;
  SELECT string_agg(bytes, ''::bytea ORDER BY chunk_index) INTO v_pdf FROM public.mcp_pdf_chunks WHERE upload_id = v_upload.id;
  IF octet_length(v_pdf) IS DISTINCT FROM v_upload.declared_bytes OR octet_length(v_pdf) > 20971520 THEN
    RAISE EXCEPTION 'PDF upload size does not match' USING ERRCODE = 'check_violation';
  END IF;
  IF substring(v_pdf FROM 1 FOR 5) <> decode('255044462d', 'hex') THEN
    RAISE EXCEPTION 'the file must be a PDF' USING ERRCODE = 'check_violation';
  END IF;
  IF encode(digest(v_pdf, 'sha256'), 'hex') <> v_upload.sha256 THEN
    RAISE EXCEPTION 'PDF sha256 does not match' USING ERRCODE = 'check_violation';
  END IF;
  RETURN jsonb_build_object('document_id', v_upload.document_id, 'customer_id', v_doc.customer_id,
    'filename', v_upload.filename, 'sha256', v_upload.sha256, 'content_base64', encode(v_pdf, 'base64'));
END;
$$;

CREATE FUNCTION mcp_portal_pdf_discard(p_token_sha256 text, p_run_id uuid, p_agent_id uuid, p_session_id uuid)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok public.mcp_tokens := mcp_portal_token(p_token_sha256);
BEGIN
  DELETE FROM public.mcp_pdf_uploads WHERE id = p_session_id AND token_id = v_tok.id
    AND run_id = p_run_id AND agent_id = p_agent_id;
  RETURN jsonb_build_object('discarded', FOUND);
END;
$$;

REVOKE ALL ON FUNCTION mcp_portal_pdf_cleanup() FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_pdf_begin(text, uuid, uuid, uuid, text, integer, text) FROM public, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_pdf_chunk(text, uuid, uuid, uuid, integer, text) FROM public, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_pdf_finish(text, uuid, uuid, uuid) FROM public, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_pdf_discard(text, uuid, uuid, uuid) FROM public, authenticated, service_role;
GRANT EXECUTE ON FUNCTION mcp_portal_pdf_begin(text, uuid, uuid, uuid, text, integer, text) TO anon;
GRANT EXECUTE ON FUNCTION mcp_portal_pdf_chunk(text, uuid, uuid, uuid, integer, text) TO anon;
GRANT EXECUTE ON FUNCTION mcp_portal_pdf_finish(text, uuid, uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION mcp_portal_pdf_discard(text, uuid, uuid, uuid) TO anon;
