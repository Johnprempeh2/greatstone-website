-- GRE-4081 (GRE-4079 step 2a). GSAM writes portal documents through the admin bridge's write key, as the studio's
-- Client portal tab does: create a draft, edit a draft, submit it for approval, return it to draft, approve and
-- publish one exact version, and withdraw a published one. Builds on 039 (the portal), 040 (its audit trigger) and
-- 049 (the write role, its audit row and _bridge_ctx). Adds:
--
--   1. portal_bridge_approvers: which GSAM person (actor user:<id>) is which registered portal approver. Like
--      portal_approvers, NO grant and NO policy for any API role or bridge role: John adds his own row in the SQL
--      editor at deploy, so no agent, staff owner, write key or migration can make an approver.
--   2. bridge_portal_* functions, SECURITY DEFINER, for the write role only. Each reads the org and the actor from the
--      audit row this transaction opened (_bridge_ctx), never from the request body. 039's triggers still hold every
--      rule: new rows are drafts, content is frozen outside draft, the fingerprint is the database's, and a row is
--      published only with an approval that matches its fingerprint.
--        create, edit, submit, return to draft   any actor (agent or person)
--        withdraw                                people only (user:)
--        approve and publish                     people only, and only a person linked in portal_bridge_approvers to
--                                                a registered approver who is active staff of the organisation
--   3. portal_documents_audit names the GSAM actor and run for a bridge write (actor_kind agent, or staff for a
--      person; actor_id the actor; detail.via = 'bridge'), and admin_bridge_change logs portal_documents and
--      portal_approvals rows a bridge write changes.
--   4. The read role may read content_sha256, row_version and approval_id of portal_documents, so GSAM can edit and
--      approve a document the studio made. body and pdf_path stay on the site.
--
-- Error codes: GB400 bad_request, GB403 denied, GB404 not_found, GB409 conflict (049's). Re-runnable.
-- Rollback: rollback.sql in this folder.

-- ── who may approve from GSAM ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_bridge_approvers (
  gsam_actor   text PRIMARY KEY CHECK (gsam_actor ~ '^user:[A-Za-z0-9_-]{1,64}$'),
  auth_user_id uuid NOT NULL REFERENCES public.portal_approvers(auth_user_id) ON DELETE CASCADE,
  label        text NOT NULL CHECK (length(btrim(label)) > 0),
  added_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.portal_bridge_approvers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_bridge_approvers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_bridge_approvers
  FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_write, gsam_bridge_refund;

-- ── the audit trigger names the bridge actor ────────────────────────────────────────────────────────
-- 040's portal_documents_audit(), plus: inside a bridge write the actor is the GSAM actor and the run its run.
CREATE OR REPLACE FUNCTION portal_documents_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event text;
  v_agent text := nullif(current_setting('portal.mcp_agent', true), '');
  v_bridge record;
BEGIN
  -- no open bridge audit row (a staff or MCP write): both fields are null
  SELECT o.actor, o.run INTO v_bridge FROM app_bridge_open_audit('write') o;
  IF v_agent IS NOT NULL THEN v_bridge.actor := NULL; END IF;
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
          CASE WHEN v_agent IS NOT NULL THEN 'agent'
               WHEN v_bridge.actor IS NOT NULL THEN CASE WHEN v_bridge.actor LIKE 'user:%' THEN 'staff' ELSE 'agent' END
               ELSE portal_actor_kind(NEW.created_by_kind) END,
          coalesce(v_agent, v_bridge.actor, auth.uid()::text, NEW.created_by::text),
          CASE WHEN v_agent IS NOT NULL THEN nullif(current_setting('portal.mcp_run', true), '')::uuid
               WHEN v_bridge.actor IS NOT NULL THEN v_bridge.run
               ELSE NEW.created_run_id END,
          v_event, NEW.id,
          jsonb_build_object('version', NEW.version, 'status', NEW.status)
            || CASE WHEN v_event IN ('submitted_for_approval','published')
                    THEN jsonb_build_object('content_sha256', NEW.content_sha256, 'approval_id', NEW.approval_id)
                    ELSE '{}'::jsonb END
            || CASE WHEN v_agent IS NOT NULL
                    THEN jsonb_build_object('via', 'mcp', 'token_id', current_setting('portal.mcp_token', true))
                    WHEN v_bridge.actor IS NOT NULL THEN jsonb_build_object('via', 'bridge')
                    ELSE '{}'::jsonb END);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION portal_documents_audit() FROM public, anon, authenticated;

-- 039's approval audit names the website user; the bridge's approval also names the GSAM person.
CREATE OR REPLACE FUNCTION portal_approvals_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := (SELECT o.actor FROM app_bridge_open_audit('write') o);
BEGIN
  INSERT INTO public.portal_audit (org_id, customer_id, actor_kind, actor_id, event, document_id, detail)
  VALUES (NEW.org_id, NEW.customer_id, 'staff', NEW.approver_user_id::text, 'approved', NEW.document_id,
          jsonb_build_object('approval_id', NEW.id, 'content_sha256', NEW.content_sha256,
                             'gsam_approval_ref', NEW.gsam_approval_ref)
            || CASE WHEN v_actor IS NOT NULL THEN jsonb_build_object('via', 'bridge', 'gsam_actor', v_actor)
                    ELSE '{}'::jsonb END);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION portal_approvals_audit() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.portal_documents;
CREATE TRIGGER trg_admin_bridge_change AFTER INSERT OR UPDATE OR DELETE ON public.portal_documents
  FOR EACH ROW EXECUTE FUNCTION admin_bridge_log_change();
DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.portal_approvals;
CREATE TRIGGER trg_admin_bridge_change AFTER INSERT OR UPDATE OR DELETE ON public.portal_approvals
  FOR EACH ROW EXECUTE FUNCTION admin_bridge_log_change();

-- ── reads ───────────────────────────────────────────────────────────────────────────────────────────
GRANT SELECT (content_sha256, row_version, approval_id) ON public.portal_documents TO gsam_bridge_read;

-- A document of the bridge's org as a write answers with it: everything GSAM wrote and where it is in its life.
-- The PDF path and the author's website id stay on the site.
CREATE OR REPLACE FUNCTION bridge_portal_document(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ctx record := _bridge_ctx('write');
BEGIN
  RETURN (SELECT to_jsonb(d) - 'org_id' - 'created_by' - 'pdf_path' || jsonb_build_object('has_pdf', d.pdf_sha256 IS NOT NULL)
            FROM portal_documents d WHERE d.id = p_id AND d.org_id = ctx.org_id);
END $$;

-- The document, locked, or GB404. Another org's document is not found.
CREATE OR REPLACE FUNCTION _bridge_portal_lock(p_org uuid, p_id uuid) RETURNS portal_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v portal_documents%ROWTYPE;
BEGIN
  SELECT * INTO v FROM portal_documents d WHERE d.id = p_id AND d.org_id = p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document not found' USING ERRCODE = 'GB404'; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION _bridge_portal_lock(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION _bridge_portal_expect(v portal_documents, p_status text, p_row_version integer) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF v.status <> p_status THEN RAISE EXCEPTION 'the document is %, not %', v.status, p_status USING ERRCODE = 'GB409'; END IF;
  IF p_row_version IS NOT NULL AND v.row_version IS DISTINCT FROM p_row_version THEN
    RAISE EXCEPTION 'row version' USING ERRCODE = 'GB409';
  END IF;
END $$;
REVOKE ALL ON FUNCTION _bridge_portal_expect(portal_documents, text, integer) FROM PUBLIC, anon, authenticated, service_role;

-- ── writes ──────────────────────────────────────────────────────────────────────────────────────────
-- A new draft for a client of the org. p_fields (checked by the site function first): kind, series, title, summary,
-- body, demos, action, confirmation_text, signatory_email. A series starts the next version of a document of the
-- same client.
CREATE OR REPLACE FUNCTION bridge_portal_create(p_customer uuid, p_fields jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v_series uuid := nullif(p_fields ->> 'series', '')::uuid;
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = p_customer AND c.org_id = ctx.org_id AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'client not found' USING ERRCODE = 'GB404';
  END IF;
  IF v_series IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM portal_documents d WHERE d.series = v_series AND d.customer_id = p_customer AND d.org_id = ctx.org_id) THEN
    RAISE EXCEPTION 'series not found for this client' USING ERRCODE = 'GB404';
  END IF;
  INSERT INTO portal_documents (org_id, customer_id, kind, series, title, summary, body, demos, action, confirmation_text,
                                signatory_email, created_by_kind, created_by, created_run_id)
  VALUES (ctx.org_id, p_customer, p_fields ->> 'kind', coalesce(v_series, gen_random_uuid()), p_fields ->> 'title',
          coalesce(p_fields ->> 'summary', ''), coalesce(nullif(p_fields -> 'body', 'null'), '{"sections":[]}'::jsonb),
          coalesce(nullif(p_fields -> 'demos', 'null'), '[]'::jsonb), coalesce(p_fields ->> 'action', 'none'),
          p_fields ->> 'confirmation_text', nullif(btrim(coalesce(p_fields ->> 'signatory_email', '')), ''),
          CASE WHEN ctx.actor LIKE 'user:%' THEN 'staff' ELSE 'agent' END, NULL, ctx.run)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Changes a draft at its expected row version. A field given as null is cleared (or set to its default).
CREATE OR REPLACE FUNCTION bridge_portal_edit_draft(p_id uuid, p_expected_row_version integer, p_fields jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v portal_documents%ROWTYPE := _bridge_portal_lock(ctx.org_id, p_id);
  f jsonb := p_fields;
BEGIN
  PERFORM _bridge_portal_expect(v, 'draft', p_expected_row_version);
  UPDATE portal_documents SET
    title             = CASE WHEN f ? 'title' THEN f ->> 'title' ELSE title END,
    summary           = CASE WHEN f ? 'summary' THEN coalesce(f ->> 'summary', '') ELSE summary END,
    body              = CASE WHEN f ? 'body' THEN coalesce(nullif(f -> 'body', 'null'), '{"sections":[]}') ELSE body END,
    demos             = CASE WHEN f ? 'demos' THEN coalesce(nullif(f -> 'demos', 'null'), '[]') ELSE demos END,
    action            = CASE WHEN f ? 'action' THEN coalesce(f ->> 'action', 'none') ELSE action END,
    confirmation_text = CASE WHEN f ? 'confirmation_text' THEN f ->> 'confirmation_text' ELSE confirmation_text END,
    signatory_email   = CASE WHEN f ? 'signatory_email'
                             THEN nullif(btrim(coalesce(f ->> 'signatory_email', '')), '') ELSE signatory_email END
  WHERE id = v.id;
  RETURN v.id;
END $$;

-- draft to pending_approval (039's trigger freezes it and computes the fingerprint), or back to draft.
CREATE OR REPLACE FUNCTION bridge_portal_set_draft_state(p_id uuid, p_expected_row_version integer, p_to text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v portal_documents%ROWTYPE := _bridge_portal_lock(ctx.org_id, p_id);
BEGIN
  IF p_to NOT IN ('pending_approval', 'draft') THEN RAISE EXCEPTION 'status' USING ERRCODE = 'GB400'; END IF;
  PERFORM _bridge_portal_expect(v, CASE p_to WHEN 'pending_approval' THEN 'draft' ELSE 'pending_approval' END, p_expected_row_version);
  UPDATE portal_documents SET status = p_to WHERE id = v.id;
  RETURN v.id;
END $$;

-- People only: hides a published version from the client (039's portal_withdraw, for a GSAM person).
CREATE OR REPLACE FUNCTION bridge_portal_withdraw(p_id uuid, p_expected_row_version integer) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v portal_documents%ROWTYPE;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  v := _bridge_portal_lock(ctx.org_id, p_id);
  PERFORM _bridge_portal_expect(v, 'published', p_expected_row_version);
  PERFORM set_config('portal.via', 'on', true);
  UPDATE portal_documents SET status = 'withdrawn', withdrawn_at = now() WHERE id = v.id;
  PERFORM set_config('portal.via', '', true);
  RETURN v.id;
END $$;

-- People only, and only the registered approver: 039's portal_approve_and_publish, where the approver is the GSAM
-- person of this transaction's audit row, linked in portal_bridge_approvers to a portal approver who is active staff
-- of the org. The fingerprint must equal the one the approver was shown. Returns the approval id.
CREATE OR REPLACE FUNCTION bridge_portal_approve_and_publish(p_id uuid, p_expected_sha256 text, p_gsam_approval_ref text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v portal_documents%ROWTYPE;
  v_uid uuid;
  v_approval uuid;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  SELECT b.auth_user_id INTO v_uid FROM portal_bridge_approvers b
    JOIN portal_approvers r ON r.auth_user_id = b.auth_user_id
   WHERE b.gsam_actor = ctx.actor
     AND EXISTS (SELECT 1 FROM users u WHERE u.auth_subject = b.auth_user_id::text AND u.org_id = ctx.org_id
                   AND u.is_active AND u.deleted_at IS NULL);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'only the registered approver can publish a portal document' USING ERRCODE = 'GB403';
  END IF;
  v := _bridge_portal_lock(ctx.org_id, p_id);
  IF EXISTS (SELECT 1 FROM portal_approvals a WHERE a.document_id = v.id) THEN
    RAISE EXCEPTION 'this version already has an approval' USING ERRCODE = 'GB409';
  END IF;
  PERFORM _bridge_portal_expect(v, 'pending_approval', NULL);
  IF p_expected_sha256 IS NULL OR v.content_sha256 IS DISTINCT FROM lower(btrim(p_expected_sha256))
     OR v.content_sha256 IS DISTINCT FROM portal_content_hash(v) THEN
    RAISE EXCEPTION 'the fingerprint does not match the version waiting for approval' USING ERRCODE = 'GB409';
  END IF;
  INSERT INTO portal_approvals (org_id, customer_id, document_id, content_sha256, approver_user_id, gsam_approval_ref)
  VALUES (v.org_id, v.customer_id, v.id, v.content_sha256, v_uid, nullif(btrim(coalesce(p_gsam_approval_ref, '')), ''))
  RETURNING id INTO v_approval;
  PERFORM set_config('portal.via', 'on', true);
  UPDATE portal_documents SET status = 'superseded'
   WHERE series = v.series AND status = 'published' AND id <> v.id;
  UPDATE portal_documents SET status = 'published', approval_id = v_approval, published_at = now() WHERE id = v.id;
  PERFORM set_config('portal.via', '', true);
  RETURN v_approval;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['bridge_portal_document(uuid)', 'bridge_portal_create(uuid, jsonb)',
    'bridge_portal_edit_draft(uuid, integer, jsonb)', 'bridge_portal_set_draft_state(uuid, integer, text)',
    'bridge_portal_withdraw(uuid, integer)', 'bridge_portal_approve_and_publish(uuid, text, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO gsam_bridge_write', f);
  END LOOP;
END $$;
