-- Port of supabase/migrations/0038_portal_mcp.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0038 — portal MCP server: agents write drafts for the clients their token is scoped to (GRE-1228; spec
-- GRE-1227 revision 2, section 6). Needs 0037.
--
-- The edge function supabase/functions/portal-mcp is a thin MCP front: every read and write goes through one of
-- the mcp_portal_* functions below, and each one checks the caller's token and its client scope here, in the
-- database. The edge function holds only a SHA-256 of the token.
--
--   mcp_tokens         one row per connection token (only its SHA-256 is kept). Revoked, never deleted.
--   mcp_token_clients  the clients a token may act for. A token never reads or writes any other client.
--
-- What a token can do: list its clients; create and edit DRAFT documents of those clients; attach the designed
-- PDF to a draft; submit a draft for approval (status pending_approval, fingerprint computed by 0037's trigger);
-- read documents, acceptances and Agreements in Principle of those clients. What it cannot do: publish. There is
-- no publishing function here, the functions run as the service key (no auth.uid(), so 0037's
-- portal_approve_and_publish() refuses it), and 0037's guard trigger refuses a direct status change. A client
-- sees a document only after John presses Approve and publish in the studio.
--
-- Audit: every write lands in portal_audit through 0037's trigger. This migration teaches that trigger to read
-- who acted when the write came through MCP: actor_kind 'agent', actor_id the agent, run_id the run, and the
-- token in detail. The three settings it reads are transaction-local and set only inside these functions.
--
-- Tokens are issued, scoped and revoked by the database owner in the Supabase SQL editor (no API role can call
-- those functions), so no agent and no staff account can widen a token's scope.
--
-- Re-runnable. Rollback: supabase/rollback/0038_portal_mcp_down.sql.

-- ── tokens ────────────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mcp_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  label        text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz
);

CREATE TABLE IF NOT EXISTS public.mcp_token_clients (
  token_id    uuid NOT NULL REFERENCES public.mcp_tokens(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_id, customer_id)
);

ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_token_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_token_clients FORCE ROW LEVEL SECURITY;
-- no API role reads or writes these tables, not even the service key: only the functions below (and the
-- database owner in the SQL editor) touch them
REVOKE ALL ON public.mcp_tokens, public.mcp_token_clients FROM anon, authenticated, service_role;

-- ── who is acting (for 0037's audit trigger) ──────────────────────────────────────────────────

-- Same as 0037's portal_documents_audit(), plus: inside an mcp_portal_* write the actor is the agent, the run is
-- the agent's run, and the token is in detail.
CREATE OR REPLACE FUNCTION portal_documents_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event text;
  v_agent text := nullif(current_setting('portal.mcp_agent', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'draft_created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := CASE NEW.status WHEN 'pending_approval' THEN 'submitted_for_approval'
                               WHEN 'draft' THEN 'returned_to_draft'
                               ELSE NEW.status END;     -- published, withdrawn, superseded
  ELSE
    v_event := 'draft_updated';
  END IF;
  INSERT INTO public.portal_audit (org_id, customer_id, actor_kind, actor_id, run_id, event, document_id, detail)
  VALUES (NEW.org_id, NEW.customer_id,
          CASE WHEN v_agent IS NOT NULL THEN 'agent' ELSE portal_actor_kind(NEW.created_by_kind) END,
          coalesce(v_agent, auth.uid()::text, NEW.created_by::text),
          CASE WHEN v_agent IS NOT NULL THEN nullif(current_setting('portal.mcp_run', true), '')::uuid
               ELSE NEW.created_run_id END,
          v_event, NEW.id,
          jsonb_build_object('version', NEW.version, 'status', NEW.status)
            || CASE WHEN v_event IN ('submitted_for_approval','published')
                    THEN jsonb_build_object('content_sha256', NEW.content_sha256, 'approval_id', NEW.approval_id)
                    ELSE '{}'::jsonb END
            || CASE WHEN v_agent IS NOT NULL
                    THEN jsonb_build_object('via', 'mcp', 'token_id', current_setting('portal.mcp_token', true))
                    ELSE '{}'::jsonb END);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION portal_documents_audit() FROM public, anon, authenticated;

-- ── internal helpers ──────────────────────────────────────────────────────────────────────────

-- The token behind a SHA-256, or an error. One answer for unknown and revoked.
CREATE OR REPLACE FUNCTION mcp_portal_token(p_token_sha256 text) RETURNS public.mcp_tokens
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok public.mcp_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_tok FROM public.mcp_tokens t
   WHERE t.token_sha256 = lower(btrim(coalesce(p_token_sha256, ''))) AND t.revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or revoked token' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_tok;
END;
$$;

-- Refuses a client outside the token's scope with the same answer as a client that does not exist.
CREATE OR REPLACE FUNCTION mcp_portal_check_client(p_tok public.mcp_tokens, p_customer_id uuid) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_customer_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.mcp_token_clients tc JOIN public.customers c ON c.id = tc.customer_id
        WHERE tc.token_id = p_tok.id AND tc.customer_id = p_customer_id AND c.org_id = p_tok.org_id) THEN
    RAISE EXCEPTION 'client not found' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- Refuses a document outside the token's scope with the same answer as one that does not exist. (Takes and
-- returns ids, not the portal_documents row type, so 0037's rollback can still drop that table.)
CREATE OR REPLACE FUNCTION mcp_portal_check_document(p_tok public.mcp_tokens, p_document_id uuid) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_document_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.portal_documents d
         JOIN public.mcp_token_clients tc ON tc.customer_id = d.customer_id AND tc.token_id = p_tok.id
        WHERE d.id = p_document_id AND d.org_id = p_tok.org_id) THEN
    RAISE EXCEPTION 'document not found' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- Marks the rest of this transaction as an MCP write by this agent and run (read by the audit trigger).
CREATE OR REPLACE FUNCTION mcp_portal_act(p_tok public.mcp_tokens, p_run_id uuid, p_agent_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_run_id IS NULL OR p_agent_id IS NULL THEN
    RAISE EXCEPTION 'run_id and agent_id are needed for every write' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('portal.mcp_agent', p_agent_id::text, true);
  PERFORM set_config('portal.mcp_run', p_run_id::text, true);
  PERFORM set_config('portal.mcp_token', p_tok.id::text, true);
END;
$$;

CREATE OR REPLACE FUNCTION mcp_portal_done() RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT set_config('portal.mcp_agent', '', true), set_config('portal.mcp_run', '', true),
           set_config('portal.mcp_token', '', true);
  $$;

-- What an agent gets back for a document: everything it wrote, plus where it is in its life.
CREATE OR REPLACE FUNCTION mcp_portal_doc_json(p_document_id uuid) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT to_jsonb(d) - 'org_id' - 'created_by' - 'created_run_id' - 'approval_id'
      FROM public.portal_documents d WHERE d.id = p_document_id
  $$;

-- The content fields an agent may set; anything else in the input is refused rather than ignored.
CREATE OR REPLACE FUNCTION mcp_portal_check_fields(p_fields jsonb, p_allowed text[]) RETURNS void
  LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_bad text;
BEGIN
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'the document fields must be an object' USING ERRCODE = 'check_violation';
  END IF;
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_bad FROM jsonb_object_keys(p_fields) k WHERE k <> ALL (p_allowed);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'these fields cannot be set here: %', v_bad USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- ── reads ─────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mcp_portal_list_clients(p_token_sha256 text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok public.mcp_tokens := mcp_portal_token(p_token_sha256);
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('customer_id', c.id, 'name', c.name) ORDER BY c.name)
      FROM public.mcp_token_clients tc JOIN public.customers c ON c.id = tc.customer_id
     WHERE tc.token_id = v_tok.id AND c.org_id = v_tok.org_id), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION mcp_portal_list_documents(p_token_sha256 text, p_customer_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok public.mcp_tokens := mcp_portal_token(p_token_sha256);
BEGIN
  PERFORM mcp_portal_check_client(v_tok, p_customer_id);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', d.id, 'kind', d.kind, 'series', d.series, 'version', d.version, 'title', d.title,
             'status', d.status, 'action', d.action, 'content_sha256', d.content_sha256,
             'row_version', d.row_version, 'updated_at', d.updated_at, 'published_at', d.published_at)
             ORDER BY d.series, d.version)
      FROM public.portal_documents d WHERE d.customer_id = p_customer_id AND d.org_id = v_tok.org_id), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION mcp_portal_get_document(p_token_sha256 text, p_document_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok public.mcp_tokens := mcp_portal_token(p_token_sha256);
BEGIN
  PERFORM mcp_portal_check_document(v_tok, p_document_id);
  RETURN mcp_portal_doc_json(p_document_id);
END;
$$;

-- What the client has done: acceptances and Agreements in Principle (who, which version, when) with the state of
-- the receipt email. The signer's email is left out (least data; the receipt in the portal has it).
CREATE OR REPLACE FUNCTION mcp_portal_client_activity(p_token_sha256 text, p_customer_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok public.mcp_tokens := mcp_portal_token(p_token_sha256);
BEGIN
  PERFORM mcp_portal_check_client(v_tok, p_customer_id);
  RETURN jsonb_build_object('acceptances', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'acceptance_id', a.id, 'document_id', a.document_id, 'document_title', d.title, 'kind', d.kind,
             'document_version', a.document_version, 'content_sha256', a.content_sha256, 'action', a.action,
             'signer_name', a.signer_name, 'signer_title', a.signer_title,
             'account_company_name', a.account_company_name, 'accepted_at', a.accepted_at,
             'receipt_status', j.status) ORDER BY a.accepted_at)
      FROM public.portal_acceptances a
      JOIN public.portal_documents d ON d.id = a.document_id
      LEFT JOIN public.portal_receipt_jobs j ON j.acceptance_id = a.id
     WHERE a.customer_id = p_customer_id AND a.org_id = v_tok.org_id), '[]'::jsonb));
END;
$$;

-- ── writes (drafts only) ──────────────────────────────────────────────────────────────────────

-- A new draft for a client in scope. Give series to start the next version of an existing document (same
-- client; 0037 checks it). Returns the draft.
CREATE OR REPLACE FUNCTION mcp_portal_create_draft(p_token_sha256 text, p_run_id uuid, p_agent_id uuid,
                                                   p_customer_id uuid, p_fields jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tok public.mcp_tokens := mcp_portal_token(p_token_sha256);
  v_doc public.portal_documents%ROWTYPE;
  v_series uuid;
BEGIN
  PERFORM mcp_portal_check_client(v_tok, p_customer_id);
  PERFORM mcp_portal_check_fields(p_fields, ARRAY['kind','series','title','summary','body','demos','action',
                                                  'confirmation_text','signatory_email']);
  v_series := nullif(p_fields ->> 'series', '')::uuid;
  IF v_series IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.portal_documents d WHERE d.series = v_series AND d.customer_id = p_customer_id) THEN
    RAISE EXCEPTION 'series not found for this client' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM mcp_portal_act(v_tok, p_run_id, p_agent_id);
  INSERT INTO public.portal_documents
    (org_id, customer_id, kind, series, title, summary, body, demos, action, confirmation_text, signatory_email,
     created_by_kind, created_by, created_run_id)
  VALUES
    (v_tok.org_id, p_customer_id, p_fields ->> 'kind', coalesce(v_series, gen_random_uuid()), p_fields ->> 'title',
     coalesce(p_fields ->> 'summary', ''), coalesce(p_fields -> 'body', '{"sections":[]}'::jsonb),
     coalesce(p_fields -> 'demos', '[]'::jsonb), coalesce(p_fields ->> 'action', 'none'),
     p_fields ->> 'confirmation_text', nullif(btrim(coalesce(p_fields ->> 'signatory_email', '')), ''),
     'agent', p_agent_id, p_run_id)
  RETURNING * INTO v_doc;
  PERFORM mcp_portal_done();
  RETURN mcp_portal_doc_json(v_doc.id);
END;
$$;

-- Changes a draft. expected_row_version is the row_version the agent last read, so two writers cannot overwrite
-- each other without knowing. A field given as null is cleared (or set to its default).
CREATE OR REPLACE FUNCTION mcp_portal_update_draft(p_token_sha256 text, p_run_id uuid, p_agent_id uuid,
                                                   p_document_id uuid, p_expected_row_version integer,
                                                   p_fields jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tok public.mcp_tokens := mcp_portal_token(p_token_sha256);
  v_doc public.portal_documents%ROWTYPE;
  f jsonb := p_fields;
BEGIN
  PERFORM mcp_portal_check_fields(p_fields, ARRAY['title','summary','body','demos','action','confirmation_text',
                                                  'signatory_email']);
  PERFORM mcp_portal_check_document(v_tok, p_document_id);
  SELECT * INTO v_doc FROM public.portal_documents d WHERE d.id = p_document_id FOR UPDATE;
  IF v_doc.status <> 'draft' THEN
    RAISE EXCEPTION 'only a draft can be changed (this one is %); a published document changes by a new version',
      v_doc.status USING ERRCODE = 'check_violation';
  END IF;
  IF p_expected_row_version IS DISTINCT FROM v_doc.row_version THEN
    RAISE EXCEPTION 'the draft changed since you read it (row_version is now %); read it again',
      v_doc.row_version USING ERRCODE = 'serialization_failure';
  END IF;
  PERFORM mcp_portal_act(v_tok, p_run_id, p_agent_id);
  UPDATE public.portal_documents SET
    title             = CASE WHEN f ? 'title' THEN f ->> 'title' ELSE title END,
    summary           = CASE WHEN f ? 'summary' THEN coalesce(f ->> 'summary', '') ELSE summary END,
    body              = CASE WHEN f ? 'body' THEN coalesce(nullif(f -> 'body', 'null'), '{"sections":[]}') ELSE body END,
    demos             = CASE WHEN f ? 'demos' THEN coalesce(nullif(f -> 'demos', 'null'), '[]') ELSE demos END,
    action            = CASE WHEN f ? 'action' THEN coalesce(f ->> 'action', 'none') ELSE action END,
    confirmation_text = CASE WHEN f ? 'confirmation_text' THEN f ->> 'confirmation_text' ELSE confirmation_text END,
    signatory_email   = CASE WHEN f ? 'signatory_email'
                             THEN nullif(btrim(coalesce(f ->> 'signatory_email', '')), '') ELSE signatory_email END
  WHERE id = v_doc.id
  RETURNING * INTO v_doc;
  PERFORM mcp_portal_done();
  RETURN mcp_portal_doc_json(v_doc.id);
END;
$$;

-- Records the designed PDF of a draft, after the edge function stored the bytes at
-- <customer_id>/<document_id>/<file> in portal-files (0037 checks the path; the hash joins the fingerprint).
CREATE OR REPLACE FUNCTION mcp_portal_set_file(p_token_sha256 text, p_run_id uuid, p_agent_id uuid,
                                               p_document_id uuid, p_path text, p_sha256 text)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tok public.mcp_tokens := mcp_portal_token(p_token_sha256);
  v_doc public.portal_documents%ROWTYPE;
BEGIN
  PERFORM mcp_portal_check_document(v_tok, p_document_id);
  SELECT * INTO v_doc FROM public.portal_documents d WHERE d.id = p_document_id FOR UPDATE;
  IF v_doc.status <> 'draft' THEN
    RAISE EXCEPTION 'a file can be attached only to a draft (this one is %)', v_doc.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_path IS NULL OR p_path NOT LIKE v_doc.customer_id::text || '/' || v_doc.id::text || '/_%' THEN
    RAISE EXCEPTION 'the file path must be under this document' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM mcp_portal_act(v_tok, p_run_id, p_agent_id);
  UPDATE public.portal_documents SET pdf_path = p_path, pdf_sha256 = lower(p_sha256)
   WHERE id = v_doc.id RETURNING * INTO v_doc;
  PERFORM mcp_portal_done();
  RETURN mcp_portal_doc_json(v_doc.id);
END;
$$;

-- "Request publish": the draft goes to pending_approval. 0037's trigger freezes it and computes the fingerprint,
-- which comes back so the agent can put it on its task for John. The client still sees nothing: only John's
-- Approve and publish in the studio publishes, for this fingerprint.
CREATE OR REPLACE FUNCTION mcp_portal_request_publish(p_token_sha256 text, p_run_id uuid, p_agent_id uuid,
                                                      p_document_id uuid, p_expected_row_version integer)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tok public.mcp_tokens := mcp_portal_token(p_token_sha256);
  v_doc public.portal_documents%ROWTYPE;
BEGIN
  PERFORM mcp_portal_check_document(v_tok, p_document_id);
  SELECT * INTO v_doc FROM public.portal_documents d WHERE d.id = p_document_id FOR UPDATE;
  IF v_doc.status <> 'draft' THEN
    RAISE EXCEPTION 'only a draft can be submitted for approval (this one is %)', v_doc.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_expected_row_version IS DISTINCT FROM v_doc.row_version THEN
    RAISE EXCEPTION 'the draft changed since you read it (row_version is now %); read it again',
      v_doc.row_version USING ERRCODE = 'serialization_failure';
  END IF;
  PERFORM mcp_portal_act(v_tok, p_run_id, p_agent_id);
  UPDATE public.portal_documents SET status = 'pending_approval' WHERE id = v_doc.id RETURNING * INTO v_doc;
  PERFORM mcp_portal_done();
  RETURN mcp_portal_doc_json(v_doc.id);
END;
$$;

-- ── token administration (database owner only, in the SQL editor) ─────────────────────────────

-- Issues a token for the given clients (all of one org) and returns it. This is the only time the token is
-- shown; the database keeps its SHA-256.
CREATE OR REPLACE FUNCTION mcp_portal_issue_token(p_label text, p_customer_ids uuid[]) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org   uuid;
  v_n     integer;
  v_token text := 'gspm_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_id    uuid;
BEGIN
  SELECT count(DISTINCT c.org_id), min(c.org_id::text)::uuid INTO v_n, v_org
    FROM public.customers c WHERE c.id = ANY (p_customer_ids);
  IF coalesce(cardinality(p_customer_ids), 0) = 0 OR v_n <> 1
     OR (SELECT count(*) FROM public.customers c WHERE c.id = ANY (p_customer_ids))
        <> (SELECT count(DISTINCT x) FROM unnest(p_customer_ids) x) THEN
    RAISE EXCEPTION 'give one or more existing clients of one organisation' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.mcp_tokens (org_id, label, token_sha256)
  VALUES (v_org, btrim(p_label), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  RETURNING id INTO v_id;
  INSERT INTO public.mcp_token_clients (token_id, customer_id)
  SELECT v_id, x FROM (SELECT DISTINCT x FROM unnest(p_customer_ids) x) s;
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION mcp_portal_add_client(p_token_id uuid, p_customer_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.mcp_tokens t JOIN public.customers c ON c.org_id = t.org_id
                  WHERE t.id = p_token_id AND c.id = p_customer_id AND t.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'token or client not found (or not of one organisation)' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.mcp_token_clients (token_id, customer_id) VALUES (p_token_id, p_customer_id)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION mcp_portal_remove_client(p_token_id uuid, p_customer_id uuid) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    DELETE FROM public.mcp_token_clients WHERE token_id = p_token_id AND customer_id = p_customer_id
  $$;

CREATE OR REPLACE FUNCTION mcp_portal_revoke_token(p_token_id uuid) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE public.mcp_tokens SET revoked_at = coalesce(revoked_at, now()) WHERE id = p_token_id
  $$;

-- ── who may call what ─────────────────────────────────────────────────────────────────────────

-- tools: the service key only (the portal-mcp edge function)
REVOKE ALL ON FUNCTION mcp_portal_list_clients(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION mcp_portal_list_documents(text, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION mcp_portal_get_document(text, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION mcp_portal_client_activity(text, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION mcp_portal_create_draft(text, uuid, uuid, uuid, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION mcp_portal_update_draft(text, uuid, uuid, uuid, integer, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION mcp_portal_set_file(text, uuid, uuid, uuid, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION mcp_portal_request_publish(text, uuid, uuid, uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION mcp_portal_list_clients(text) TO service_role;
GRANT EXECUTE ON FUNCTION mcp_portal_list_documents(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION mcp_portal_get_document(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION mcp_portal_client_activity(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION mcp_portal_create_draft(text, uuid, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION mcp_portal_update_draft(text, uuid, uuid, uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION mcp_portal_set_file(text, uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION mcp_portal_request_publish(text, uuid, uuid, uuid, integer) TO service_role;
-- helpers and token administration: no API role at all
REVOKE ALL ON FUNCTION mcp_portal_token(text) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_check_client(public.mcp_tokens, uuid) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_check_document(public.mcp_tokens, uuid) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_act(public.mcp_tokens, uuid, uuid) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_done() FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_doc_json(uuid) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_check_fields(jsonb, text[]) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_issue_token(text, uuid[]) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_add_client(uuid, uuid) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_remove_client(uuid, uuid) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION mcp_portal_revoke_token(uuid) FROM public, anon, authenticated, service_role;
