-- GSAM admin bridge, client users (GRE-2631; John's GRE-2609 rule). The website's Better Auth and database are the
-- only store of client users: GSAM keeps no copy, creates them through the bridge and reads names and emails by id.
-- Builds on 048, 049 and 052. Adds objects only, so the previous deploy runs against it unchanged.
--
--   * bridge_create_client_user (gsam_bridge_write): in the write transaction, creates the Better Auth user (no
--     password, email not verified: the person signs in by the reset or verification email, and Better Auth adds the
--     credential then) and the customer_users membership of one client organisation (a customers row). An email that
--     is already a user gets the membership only; one already in this organisation returns its ids and writes nothing.
--   * bridge_client_users (gsam_bridge_read): id, email, name and memberships of the client users asked for. An id
--     that is unknown, not a uuid's user, staff only or without a live membership is left out, never an error.
--   * Neither role gets a grant on better_auth: only these two SECURITY DEFINER functions reach it.
--   * Guards, as ensure_customer_account (010) holds them: a staff account never becomes a client user, and a user
--     has at most one live membership in the tenant (uq_customer_users_auth), so app_customer_id() stays one company.
--   * customer_users joins 049's change log, so each create leaves its before and after with the audit row.
-- Error codes as 049: GB400 bad_request, GB404 not_found, GB409 conflict.
-- Re-runnable. Rollback: rollback.sql in this folder.

CREATE OR REPLACE FUNCTION bridge_create_client_user(p_customer uuid, p_email text, p_name text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_user text;
  v_cu customer_users%ROWTYPE;
  v_new boolean := false;
BEGIN
  IF char_length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'email is not an address' USING ERRCODE = 'GB400';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'a name of 1 to 200 characters is needed' USING ERRCODE = 'GB400';
  END IF;
  PERFORM 1 FROM customers WHERE id = p_customer AND org_id = ctx.org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'client organisation not found' USING ERRCODE = 'GB404'; END IF;
  -- two creates for one email (each with its own idempotency key) take turns, so the second sees the first's user
  PERFORM pg_advisory_xact_lock(hashtextextended('bridge_client_user:' || v_email, 0));

  SELECT u."id" INTO v_user FROM better_auth."user" u WHERE lower(u."email") = v_email;
  IF EXISTS (SELECT 1 FROM users s WHERE s.deleted_at IS NULL
               AND (lower(s.email::text) = v_email OR (v_user IS NOT NULL AND s.auth_subject = v_user))) THEN
    RAISE EXCEPTION 'a staff account cannot be a client user' USING ERRCODE = 'GB409';
  END IF;
  IF v_user IS NULL THEN
    -- auth.sync_better_auth_user() (002) adds the auth.users row
    INSERT INTO better_auth."user" ("id", "name", "email", "emailVerified")
      VALUES (gen_random_uuid()::text, v_name, v_email, false) RETURNING "id" INTO v_user;
    v_new := true;
  END IF;

  SELECT * INTO v_cu FROM customer_users WHERE org_id = ctx.org_id AND auth_subject = v_user AND deleted_at IS NULL;
  IF FOUND THEN
    IF v_cu.customer_id <> p_customer THEN
      RAISE EXCEPTION 'the user belongs to another client organisation' USING ERRCODE = 'GB409';
    END IF;
  ELSE
    -- a contact sales added, or a removed membership: the email is unique per organisation, so link that row
    SELECT * INTO v_cu FROM customer_users
     WHERE org_id = ctx.org_id AND customer_id = p_customer AND email = v_email::citext FOR UPDATE;
    IF FOUND THEN
      IF v_cu.deleted_at IS NULL AND v_cu.auth_subject IS NOT NULL THEN
        RAISE EXCEPTION 'the contact is linked to another sign-in' USING ERRCODE = 'GB409';
      END IF;
      UPDATE customer_users SET auth_subject = v_user, full_name = coalesce(full_name, v_name), deleted_at = NULL,
        updated_at = now()
      WHERE id = v_cu.id;
    ELSE
      INSERT INTO customer_users (org_id, customer_id, email, full_name, auth_subject)
        VALUES (ctx.org_id, p_customer, v_email, v_name, v_user) RETURNING * INTO v_cu;
    END IF;
    v_new := true;
  END IF;
  RETURN jsonb_build_object('userId', v_user, 'organisationId', p_customer, 'membershipId', v_cu.id, 'created', v_new);
END $$;
REVOKE ALL ON FUNCTION bridge_create_client_user(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_refund;
GRANT EXECUTE ON FUNCTION bridge_create_client_user(uuid, text, text) TO gsam_bridge_write;

-- Read claims only (app_bridge_org() is null otherwise), at most 100 ids, live memberships of live organisations.
CREATE OR REPLACE FUNCTION bridge_client_users(p_ids uuid[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', u."id", 'email', u."email", 'name', u."name",
    'memberships', m.list) ORDER BY u."id"), '[]'::jsonb)
  FROM better_auth."user" u
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('organisationId', cu.customer_id, 'membershipId', cu.id)
      ORDER BY cu.created_at, cu.id) AS list
    FROM customer_users cu JOIN customers c ON c.id = cu.customer_id AND c.deleted_at IS NULL
    WHERE cu.auth_subject = u."id" AND cu.org_id = app_bridge_org() AND cu.deleted_at IS NULL) m
  WHERE m.list IS NOT NULL AND app_bridge_org() IS NOT NULL AND cardinality(p_ids) <= 100
    AND u."id" IN (SELECT x::text FROM unnest(p_ids) x) $$;
REVOKE ALL ON FUNCTION bridge_client_users(uuid[]) FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_write, gsam_bridge_refund;
GRANT EXECUTE ON FUNCTION bridge_client_users(uuid[]) TO gsam_bridge_read;

DROP TRIGGER IF EXISTS trg_admin_bridge_change ON public.customer_users;
CREATE TRIGGER trg_admin_bridge_change AFTER INSERT OR UPDATE OR DELETE ON public.customer_users
  FOR EACH ROW EXECUTE FUNCTION admin_bridge_log_change();
