-- Admin parity round 2 (the last old-admin features GSAM did not have). Builds on 017, 018, 028, 033, 036, 048, 049,
-- 066 and 072. Adds grants, policies and one function only, so the previous deploy runs against it unchanged.
--
--   * Seat requests: a client admin's "add a teammate" request (017) becomes a read resource (invite-requests) and a
--     person decides it through bridge_invite_request_decide. Approve adds the member with 066's
--     bridge_access_add_client_member (so the same checks hold) and marks the request provisioned; decline marks it
--     declined. People only: it gives someone access to a client's portal.
--   * The buyer's PO file: bridge_po_document tells the bridge where a quote's file is, so it can stream it from the
--     private po-documents store to GSAM. The path never leaves the site and no public link is made.
--   * The front door agent package: bridge_lead_package reads a lead's agents and saved package (036), so the bridge
--     can build the .zip the old studio offered. The columns themselves stay hidden from the bridge roles.
-- Error codes as 049: GB400 bad_request, GB403 denied, GB404 not_found, GB409 conflict.
-- Re-runnable. Rollback: rollback.sql in this folder.

-- ── reads ───────────────────────────────────────────────────────────────────────────────────────────
GRANT SELECT (id, org_id, customer_id, full_name, email, role, note, status, created_at, handled_at)
  ON public.member_invite_requests TO gsam_bridge_read;
DROP POLICY IF EXISTS gsam_bridge_read ON public.member_invite_requests;
CREATE POLICY gsam_bridge_read ON public.member_invite_requests FOR SELECT TO gsam_bridge_read USING (org_id = app_bridge_org());
DROP POLICY IF EXISTS gsam_bridge_read_scope ON public.member_invite_requests;
CREATE POLICY gsam_bridge_read_scope ON public.member_invite_requests AS RESTRICTIVE FOR ALL TO gsam_bridge_read
  USING (org_id = app_bridge_org()) WITH CHECK (false);

-- The PO file's store path and a lead's agents stay hidden from both roles (048's column grants): these functions answer
-- only what GSAM needs, for the transaction's own organisation (read claims, or write claims when a write reads a row
-- back), and nothing for anyone else.
CREATE OR REPLACE FUNCTION _bridge_any_org() RETURNS uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN c ->> 'role' = 'gsam_bridge' AND c ->> 'cap' IN ('read', 'write') THEN nullif(c ->> 'org', '')::uuid END
  FROM (SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb AS c) s $$;
REVOKE ALL ON FUNCTION _bridge_any_org() FROM PUBLIC, anon, authenticated, service_role;

-- Whether a quote holds the buyer's PO file (028).
CREATE OR REPLACE FUNCTION bridge_quote_has_po(p_quote uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT q.po_document_path IS NOT NULL FROM quotes q
    WHERE q.id = p_quote AND q.org_id = _bridge_any_org() AND q.deleted_at IS NULL), false) $$;

-- The PO file of a quote ('quotes') or of the quote an order came from ('orders'): { path, name }, or null. Read only.
CREATE OR REPLACE FUNCTION bridge_po_document(p_kind text, p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('path', q.po_document_path, 'name', q.po_document_name)
  FROM quotes q
  WHERE q.org_id = app_bridge_org() AND q.deleted_at IS NULL AND q.po_document_path IS NOT NULL
    AND q.id = CASE p_kind WHEN 'quotes' THEN p_id
                           WHEN 'orders' THEN (SELECT o.quote_id FROM orders o WHERE o.id = p_id AND o.org_id = app_bridge_org() AND o.deleted_at IS NULL)
               END $$;

-- Whether a front door lead has agents or a saved package (036) to download.
CREATE OR REPLACE FUNCTION bridge_lead_has_package(p_lead uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT jsonb_array_length(f.agents) > 0 OR f.agent_package IS NOT NULL FROM front_door_leads f
    WHERE f.id = p_lead AND f.org_id = app_bridge_org()), false) $$;

-- What the agent package is built from: company, industry, team size, brand words, agents and the saved package. Read only.
CREATE OR REPLACE FUNCTION bridge_lead_package(p_lead uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('company_name', f.company_name, 'industry', f.industry, 'team_size', f.team_size,
    'brand_words', f.brand_words, 'agents', f.agents, 'agent_package', f.agent_package)
  FROM front_door_leads f WHERE f.id = p_lead AND f.org_id = app_bridge_org() $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['bridge_po_document(text, uuid)', 'bridge_lead_has_package(uuid)', 'bridge_lead_package(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_write, gsam_bridge_refund', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO gsam_bridge_read', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION bridge_quote_has_po(uuid) FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_refund;
GRANT EXECUTE ON FUNCTION bridge_quote_has_po(uuid) TO gsam_bridge_read, gsam_bridge_write;

-- ── seat requests ───────────────────────────────────────────────────────────────────────────────────
-- p_decision: approve or decline. Only a pending request is decided; a second decision is a conflict.
CREATE OR REPLACE FUNCTION bridge_invite_request_decide(p_id uuid, p_decision text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v member_invite_requests%ROWTYPE;
  v_member jsonb;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'decline') THEN
    RAISE EXCEPTION 'decision is approve or decline' USING ERRCODE = 'GB400';
  END IF;
  SELECT r.* INTO v FROM member_invite_requests r JOIN customers c ON c.id = r.customer_id AND c.deleted_at IS NULL
   WHERE r.id = p_id AND r.org_id = ctx.org_id FOR UPDATE OF r;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found' USING ERRCODE = 'GB404'; END IF;
  IF v.status <> 'pending' THEN RAISE EXCEPTION 'the request is already %', v.status USING ERRCODE = 'GB409'; END IF;
  IF p_decision = 'approve' THEN
    v_member := bridge_access_add_client_member(v.customer_id, v.email::text,
      coalesce(nullif(btrim(coalesce(v.full_name, '')), ''), split_part(v.email::text, '@', 1)), v.role);
  END IF;
  UPDATE member_invite_requests SET status = CASE p_decision WHEN 'approve' THEN 'provisioned' ELSE 'declined' END::invite_request_status,
    handled_at = now()
   WHERE id = v.id RETURNING * INTO v;
  PERFORM _bridge_log_row('member_invite_requests', v.id, 'update', jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', v.status));
  RETURN jsonb_build_object('item', jsonb_build_object('id', v.id, 'customer_id', v.customer_id, 'full_name', v.full_name,
      'email', v.email, 'role', v.role, 'note', v.note, 'status', v.status, 'created_at', v.created_at, 'handled_at', v.handled_at),
    'member', v_member -> 'item');
END $$;
REVOKE ALL ON FUNCTION bridge_invite_request_decide(uuid, text) FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_refund;
GRANT EXECUTE ON FUNCTION bridge_invite_request_decide(uuid, text) TO gsam_bridge_write;
