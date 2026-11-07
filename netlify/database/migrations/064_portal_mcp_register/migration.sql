-- GRE-3769. Register a portal MCP token from its SHA-256, so a token can be made on Netlify Database.
--
-- 040's mcp_portal_issue_token makes the token inside the database and returns it, which suits the Supabase SQL
-- editor. Netlify gives the owner role only to code in a deploy (GRE-2567 plan, section 1), and that code must
-- never see a token. So the token is made on John's own computer ('gspm_' + 64 hex, scripts/mcp-token-new.mjs)
-- and only its SHA-256 reaches the database, through the owner importer's mcp-token mode
-- (netlify/functions/lib/owner-import.mjs). The database keeps the SHA-256 only, as before.
--
-- Same client checks as mcp_portal_issue_token: one or more existing clients, all of one organisation. It also
-- refuses a hash that is not 64 lower-case hex characters (a raw 'gspm_' token is refused here) and a hash
-- already registered. Returns the token's id, which revoking (mcp_portal_revoke_token) needs.
--
-- Owner only: no API role, not even the service key, may call it.
CREATE OR REPLACE FUNCTION mcp_portal_register_token(p_label text, p_customer_ids uuid[], p_token_sha256 text)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_n   integer;
  v_id  uuid;
BEGIN
  IF p_token_sha256 IS NULL OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'give the token''s SHA-256 as 64 lower-case hex characters' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(DISTINCT c.org_id), min(c.org_id::text)::uuid INTO v_n, v_org
    FROM public.customers c WHERE c.id = ANY (p_customer_ids);
  IF coalesce(cardinality(p_customer_ids), 0) = 0 OR array_position(p_customer_ids, NULL) IS NOT NULL OR v_n <> 1
     OR (SELECT count(*) FROM public.customers c WHERE c.id = ANY (p_customer_ids))
        <> (SELECT count(DISTINCT x) FROM unnest(p_customer_ids) x) THEN
    RAISE EXCEPTION 'give one or more existing clients of one organisation' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mcp_tokens t WHERE t.token_sha256 = p_token_sha256) THEN
    RAISE EXCEPTION 'this token is already registered' USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO public.mcp_tokens (org_id, label, token_sha256)
  VALUES (v_org, btrim(p_label), p_token_sha256)
  RETURNING id INTO v_id;
  INSERT INTO public.mcp_token_clients (token_id, customer_id)
  SELECT v_id, x FROM (SELECT DISTINCT x FROM unnest(p_customer_ids) x) s;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION mcp_portal_register_token(text, uuid[], text) FROM public, anon, authenticated, service_role;
