-- Port of supabase/rollback/0038_portal_mcp_down.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- Rollback of 0038_portal_mcp.sql (GRE-1228). Removes the MCP tokens and functions and puts 0037's audit trigger
-- function back as 0037 wrote it. Portal documents, acceptances and audit rows written through MCP stay (they
-- belong to 0037); their audit rows keep actor_kind 'agent' and the run.
--
-- Before running: revoke the connection in GS Agentic Manager, so agents stop calling the server; then
--   supabase functions delete portal-mcp
-- Run in one transaction:  psql "$DB_URL" -1 -f supabase/rollback/0038_portal_mcp_down.sql

DROP FUNCTION IF EXISTS mcp_portal_revoke_token(uuid);
DROP FUNCTION IF EXISTS mcp_portal_remove_client(uuid, uuid);
DROP FUNCTION IF EXISTS mcp_portal_add_client(uuid, uuid);
DROP FUNCTION IF EXISTS mcp_portal_issue_token(text, uuid[]);
DROP FUNCTION IF EXISTS mcp_portal_request_publish(text, uuid, uuid, uuid, integer);
DROP FUNCTION IF EXISTS mcp_portal_set_file(text, uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS mcp_portal_update_draft(text, uuid, uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS mcp_portal_create_draft(text, uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS mcp_portal_client_activity(text, uuid);
DROP FUNCTION IF EXISTS mcp_portal_get_document(text, uuid);
DROP FUNCTION IF EXISTS mcp_portal_list_documents(text, uuid);
DROP FUNCTION IF EXISTS mcp_portal_list_clients(text);
DROP FUNCTION IF EXISTS mcp_portal_check_fields(jsonb, text[]);
DROP FUNCTION IF EXISTS mcp_portal_doc_json(uuid);
DROP FUNCTION IF EXISTS mcp_portal_done();
DROP FUNCTION IF EXISTS mcp_portal_act(public.mcp_tokens, uuid, uuid);
DROP FUNCTION IF EXISTS mcp_portal_check_document(public.mcp_tokens, uuid);
DROP FUNCTION IF EXISTS mcp_portal_check_client(public.mcp_tokens, uuid);
DROP FUNCTION IF EXISTS mcp_portal_token(text);

DROP TABLE IF EXISTS public.mcp_token_clients;
DROP TABLE IF EXISTS public.mcp_tokens;

-- 0037's audit trigger function, unchanged (only if 0037 is still there)
DO $do$
BEGIN
  IF to_regclass('public.portal_audit') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE $fn$
CREATE OR REPLACE FUNCTION portal_documents_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text;
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
  VALUES (NEW.org_id, NEW.customer_id, portal_actor_kind(NEW.created_by_kind),
          coalesce(auth.uid()::text, NEW.created_by::text), NEW.created_run_id, v_event, NEW.id,
          jsonb_build_object('version', NEW.version, 'status', NEW.status)
            || CASE WHEN v_event IN ('submitted_for_approval','published')
                    THEN jsonb_build_object('content_sha256', NEW.content_sha256, 'approval_id', NEW.approval_id)
                    ELSE '{}'::jsonb END);
  RETURN NULL;
END;
$$;
$fn$;
  REVOKE ALL ON FUNCTION portal_documents_audit() FROM public, anon, authenticated;
END $do$;
