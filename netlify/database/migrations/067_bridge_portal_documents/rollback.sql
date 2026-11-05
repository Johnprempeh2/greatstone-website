-- Removes the bridge's portal document writes. Deploy admin-bridge without the portal-documents write routes first.
-- Documents, approvals and audit rows written through the bridge stay. The two audit triggers go back to 040's and
-- 039's bodies.
DROP FUNCTION IF EXISTS public.bridge_portal_approve_and_publish(uuid, text, text);
DROP FUNCTION IF EXISTS public.bridge_portal_withdraw(uuid, integer);
DROP FUNCTION IF EXISTS public.bridge_portal_set_draft_state(uuid, integer, text);
DROP FUNCTION IF EXISTS public.bridge_portal_edit_draft(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.bridge_portal_create(uuid, jsonb);
DROP FUNCTION IF EXISTS public.bridge_portal_document(uuid);
DROP FUNCTION IF EXISTS public._bridge_portal_expect(portal_documents, text, integer);
DROP FUNCTION IF EXISTS public._bridge_portal_lock(uuid, uuid);
REVOKE SELECT (content_sha256, row_version, approval_id) ON public.portal_documents FROM gsam_bridge_read;
DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.portal_documents;
DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.portal_approvals;
DROP TABLE IF EXISTS public.portal_bridge_approvers;

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

CREATE OR REPLACE FUNCTION portal_approvals_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.portal_audit (org_id, customer_id, actor_kind, actor_id, event, document_id, detail)
  VALUES (NEW.org_id, NEW.customer_id, 'staff', NEW.approver_user_id::text, 'approved', NEW.document_id,
          jsonb_build_object('approval_id', NEW.id, 'content_sha256', NEW.content_sha256,
                             'gsam_approval_ref', NEW.gsam_approval_ref));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION portal_approvals_audit() FROM public, anon, authenticated;
