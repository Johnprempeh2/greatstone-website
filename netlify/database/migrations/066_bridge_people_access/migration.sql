-- GRE-4082 (GRE-4079 step 3a). People and access through the GSAM admin bridge: staff roles, portal approvers and
-- client company members, which until now only the website admin or the owner importer (GRE-3964) could set.
-- Builds on 039, 048, 049 and 054. Adds objects only, so the previous deploy runs against it unchanged.
--
--   * Reads (gsam_bridge_read): bridge_access_staff, bridge_access_portal_approvers, bridge_access_client_members.
--     Each answers for the claims' organisation only. portal_approvers itself still has no grant for any API role.
--   * Writes (gsam_bridge_write): set a staff role, add or remove a portal approver, add a client member, change a
--     member's role, remove a member. Every write is people only: _bridge_person refuses any actor that is not
--     user:, read from the audit row this transaction opened, not from the request. This holds until John answers
--     on GRE-4079 which access changes an agent may make; the site function refuses agents first as well.
--   * Each change leaves its before and after in admin_bridge_change with the audit row that names the actor:
--     users joins 049's change trigger here, customer_users joined it in 054, and portal_approvers (keyed by its
--     auth user, no id column) is logged by the functions below.
--   * Guards: the organisation keeps at least one active owner; a portal approver is live, active staff of the
--     organisation with a sign-in; a staff account never becomes a client member (054); a member is changed only
--     through the client organisation in the path.
-- Error codes as 049: GB400 bad_request, GB403 denied, GB404 not_found, GB409 conflict.
-- Re-runnable. Rollback: rollback.sql in this folder.

-- ── answers ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _bridge_staff_json(p_org uuid, p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', u.id, 'email', u.email, 'name', u.full_name, 'role', u.role, 'isActive', u.is_active,
    'canSignIn', u.auth_subject IS NOT NULL,
    'portalApprover', EXISTS (SELECT 1 FROM portal_approvers r WHERE r.auth_user_id::text = u.auth_subject),
    'lastLoginAt', u.last_login_at, 'updatedAt', u.updated_at)
  FROM users u WHERE u.id = p_id AND u.org_id = p_org AND u.deleted_at IS NULL $$;
REVOKE ALL ON FUNCTION _bridge_staff_json(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION _bridge_approver_json(p_org uuid, p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('staffId', u.id, 'email', u.email, 'name', u.full_name, 'label', r.label,
    'staffActive', u.is_active, 'addedAt', r.added_at)
  FROM users u JOIN portal_approvers r ON r.auth_user_id::text = u.auth_subject
  WHERE u.id = p_id AND u.org_id = p_org AND u.deleted_at IS NULL $$;
REVOKE ALL ON FUNCTION _bridge_approver_json(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION _bridge_member_json(p_org uuid, p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('membershipId', cu.id, 'organisationId', cu.customer_id, 'userId', cu.auth_subject,
    'email', cu.email, 'name', cu.full_name, 'role', cu.role, 'isPrimary', cu.is_primary,
    'createdAt', cu.created_at, 'updatedAt', cu.updated_at)
  FROM customer_users cu WHERE cu.id = p_id AND cu.org_id = p_org AND cu.deleted_at IS NULL $$;
REVOKE ALL ON FUNCTION _bridge_member_json(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ── reads ───────────────────────────────────────────────────────────────────────────────────────────
-- Read claims only (app_bridge_org() is null otherwise, and then the answers are empty or null).
CREATE OR REPLACE FUNCTION bridge_access_staff() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(_bridge_staff_json(u.org_id, u.id) ORDER BY u.email), '[]'::jsonb)
  FROM users u WHERE u.org_id = app_bridge_org() AND u.deleted_at IS NULL $$;

CREATE OR REPLACE FUNCTION bridge_access_portal_approvers() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(_bridge_approver_json(u.org_id, u.id) ORDER BY r.added_at, u.id), '[]'::jsonb)
  FROM users u JOIN portal_approvers r ON r.auth_user_id::text = u.auth_subject
  WHERE u.org_id = app_bridge_org() AND u.deleted_at IS NULL $$;

-- null when the client organisation is not this organisation's, or deleted
CREATE OR REPLACE FUNCTION bridge_access_client_members(p_customer uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT coalesce(jsonb_agg(_bridge_member_json(cu.org_id, cu.id) ORDER BY cu.created_at, cu.id), '[]'::jsonb)
            FROM customer_users cu WHERE cu.customer_id = c.id AND cu.org_id = c.org_id AND cu.deleted_at IS NULL)
  FROM customers c WHERE c.id = p_customer AND c.org_id = app_bridge_org() AND c.deleted_at IS NULL $$;

REVOKE ALL ON FUNCTION bridge_access_staff() FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_write, gsam_bridge_refund;
REVOKE ALL ON FUNCTION bridge_access_portal_approvers() FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_write, gsam_bridge_refund;
REVOKE ALL ON FUNCTION bridge_access_client_members(uuid) FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_write, gsam_bridge_refund;
GRANT EXECUTE ON FUNCTION bridge_access_staff() TO gsam_bridge_read;
GRANT EXECUTE ON FUNCTION bridge_access_portal_approvers() TO gsam_bridge_read;
GRANT EXECUTE ON FUNCTION bridge_access_client_members(uuid) TO gsam_bridge_read;

-- ── staff roles ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bridge_access_set_staff_role(p_user uuid, p_role text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v users%ROWTYPE;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  IF p_role IS NULL OR NOT (p_role = ANY (enum_range(NULL::org_role)::text[])) THEN
    RAISE EXCEPTION 'role is not a staff role' USING ERRCODE = 'GB400';
  END IF;
  -- owners change one at a time, so two demotions cannot each see the other as the remaining owner
  PERFORM 1 FROM users WHERE org_id = ctx.org_id AND role = 'owner' AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO v FROM users WHERE id = p_user AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff member not found' USING ERRCODE = 'GB404'; END IF;
  IF v.role = 'owner' AND p_role <> 'owner' AND NOT EXISTS (SELECT 1 FROM users o WHERE o.org_id = ctx.org_id
       AND o.id <> v.id AND o.role = 'owner' AND o.is_active AND o.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'the organisation needs another active owner first' USING ERRCODE = 'GB409';
  END IF;
  IF v.role::text <> p_role THEN
    UPDATE users SET role = p_role::org_role, updated_at = now() WHERE id = v.id;
  END IF;
  RETURN _bridge_staff_json(ctx.org_id, v.id);
END $$;

-- ── portal approvers ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _bridge_log_approver(p_audit uuid, p_auth uuid, p_op text, p_before jsonb, p_after jsonb)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO admin_bridge_change (audit_id, table_name, row_id, op, before, after)
  VALUES (p_audit, 'portal_approvers', p_auth, p_op, p_before, p_after) $$;
REVOKE ALL ON FUNCTION _bridge_log_approver(uuid, uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- Adds the staff member as a portal approver, or changes the label of one who is. Answers the approver and created.
CREATE OR REPLACE FUNCTION bridge_access_put_portal_approver(p_user uuid, p_label text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v_audit uuid := (SELECT audit_id FROM app_bridge_open_audit('write'));
  v_label text := btrim(coalesce(p_label, ''));
  v users%ROWTYPE;
  v_auth uuid;
  v_old portal_approvers%ROWTYPE;
  v_new portal_approvers%ROWTYPE;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  IF char_length(v_label) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'a label of 1 to 100 characters is needed' USING ERRCODE = 'GB400';
  END IF;
  SELECT * INTO v FROM users WHERE id = p_user AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff member not found' USING ERRCODE = 'GB404'; END IF;
  IF NOT v.is_active THEN RAISE EXCEPTION 'the staff member is not active' USING ERRCODE = 'GB409'; END IF;
  SELECT a.id INTO v_auth FROM auth.users a WHERE a.id::text = v.auth_subject;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'the staff member has no sign-in' USING ERRCODE = 'GB409'; END IF;
  SELECT * INTO v_old FROM portal_approvers WHERE auth_user_id = v_auth FOR UPDATE;
  IF FOUND THEN
    IF v_old.label <> v_label THEN
      UPDATE portal_approvers SET label = v_label WHERE auth_user_id = v_auth RETURNING * INTO v_new;
      PERFORM _bridge_log_approver(v_audit, v_auth, 'update', to_jsonb(v_old), to_jsonb(v_new));
    END IF;
  ELSE
    INSERT INTO portal_approvers (auth_user_id, label) VALUES (v_auth, v_label) RETURNING * INTO v_new;
    PERFORM _bridge_log_approver(v_audit, v_auth, 'insert', NULL, to_jsonb(v_new));
  END IF;
  RETURN jsonb_build_object('item', _bridge_approver_json(ctx.org_id, v.id), 'created', v_old.auth_user_id IS NULL);
END $$;

CREATE OR REPLACE FUNCTION bridge_access_remove_portal_approver(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v_audit uuid := (SELECT audit_id FROM app_bridge_open_audit('write'));
  v_old portal_approvers%ROWTYPE;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  DELETE FROM portal_approvers r USING users u
   WHERE u.id = p_user AND u.org_id = ctx.org_id AND u.deleted_at IS NULL AND r.auth_user_id::text = u.auth_subject
  RETURNING r.* INTO v_old;
  IF v_old.auth_user_id IS NULL THEN RAISE EXCEPTION 'not a portal approver' USING ERRCODE = 'GB404'; END IF;
  PERFORM _bridge_log_approver(v_audit, v_old.auth_user_id, 'delete', to_jsonb(v_old), NULL);
  RETURN jsonb_build_object('staffId', p_user, 'removed', true);
END $$;

-- ── client company members ──────────────────────────────────────────────────────────────────────────
-- Adds a member with a role: 054's bridge_create_client_user makes the sign-in and membership. One who is already
-- a member with the same role is the same answer with created false; with another role it is a conflict (change
-- the role with bridge_access_set_client_member_role).
CREATE OR REPLACE FUNCTION bridge_access_add_client_member(p_customer uuid, p_email text, p_name text, p_role text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  r jsonb;
  v customer_users%ROWTYPE;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  IF p_role IS NULL OR p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'role is admin or member' USING ERRCODE = 'GB400';
  END IF;
  r := bridge_create_client_user(p_customer, p_email, p_name);
  SELECT * INTO v FROM customer_users WHERE id = (r ->> 'membershipId')::uuid FOR UPDATE;
  IF (r ->> 'created')::boolean THEN
    IF v.role <> p_role THEN UPDATE customer_users SET role = p_role, updated_at = now() WHERE id = v.id; END IF;
  ELSIF v.role <> p_role THEN
    RAISE EXCEPTION 'already a member with another role' USING ERRCODE = 'GB409';
  END IF;
  RETURN jsonb_build_object('item', _bridge_member_json(ctx.org_id, v.id), 'created', (r ->> 'created')::boolean);
END $$;

CREATE OR REPLACE FUNCTION bridge_access_set_client_member_role(p_customer uuid, p_membership uuid, p_role text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v customer_users%ROWTYPE;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  IF p_role IS NULL OR p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'role is admin or member' USING ERRCODE = 'GB400';
  END IF;
  SELECT cu.* INTO v FROM customer_users cu JOIN customers c ON c.id = cu.customer_id AND c.deleted_at IS NULL
   WHERE cu.id = p_membership AND cu.customer_id = p_customer AND cu.org_id = ctx.org_id AND cu.deleted_at IS NULL
   FOR UPDATE OF cu;
  IF NOT FOUND THEN RAISE EXCEPTION 'member not found' USING ERRCODE = 'GB404'; END IF;
  IF v.role <> p_role THEN UPDATE customer_users SET role = p_role, updated_at = now() WHERE id = v.id; END IF;
  RETURN _bridge_member_json(ctx.org_id, v.id);
END $$;

-- Ends the membership (soft delete): the person keeps their sign-in but no longer sees the company. Adding them
-- again relinks the same row (054).
CREATE OR REPLACE FUNCTION bridge_access_remove_client_member(p_customer uuid, p_membership uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v_id uuid;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  UPDATE customer_users cu SET deleted_at = now(), updated_at = now()
    FROM customers c
   WHERE cu.id = p_membership AND cu.customer_id = p_customer AND cu.org_id = ctx.org_id AND cu.deleted_at IS NULL
     AND c.id = cu.customer_id AND c.deleted_at IS NULL
  RETURNING cu.id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'member not found' USING ERRCODE = 'GB404'; END IF;
  RETURN jsonb_build_object('membershipId', v_id, 'organisationId', p_customer, 'removed', true);
END $$;

REVOKE ALL ON FUNCTION bridge_access_set_staff_role(uuid, text) FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_refund;
REVOKE ALL ON FUNCTION bridge_access_put_portal_approver(uuid, text) FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_refund;
REVOKE ALL ON FUNCTION bridge_access_remove_portal_approver(uuid) FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_refund;
REVOKE ALL ON FUNCTION bridge_access_add_client_member(uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_refund;
REVOKE ALL ON FUNCTION bridge_access_set_client_member_role(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_refund;
REVOKE ALL ON FUNCTION bridge_access_remove_client_member(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_refund;
GRANT EXECUTE ON FUNCTION bridge_access_set_staff_role(uuid, text) TO gsam_bridge_write;
GRANT EXECUTE ON FUNCTION bridge_access_put_portal_approver(uuid, text) TO gsam_bridge_write;
GRANT EXECUTE ON FUNCTION bridge_access_remove_portal_approver(uuid) TO gsam_bridge_write;
GRANT EXECUTE ON FUNCTION bridge_access_add_client_member(uuid, text, text, text) TO gsam_bridge_write;
GRANT EXECUTE ON FUNCTION bridge_access_set_client_member_role(uuid, uuid, text) TO gsam_bridge_write;
GRANT EXECUTE ON FUNCTION bridge_access_remove_client_member(uuid, uuid) TO gsam_bridge_write;

-- ── the change log ──────────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.users;
CREATE TRIGGER trg_admin_bridge_change AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION admin_bridge_log_change();
