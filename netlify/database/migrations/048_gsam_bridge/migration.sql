-- GSAM admin bridge, read capability (GRE-2323). GSAM calls /api/admin/v1/* with an Ed25519-signed request; the
-- function checks the signature, then opens a transaction as gsam_bridge_read:
--   BEGIN; SET LOCAL ROLE gsam_bridge_read;
--   SELECT * FROM admin_bridge_begin(...)            -- window check, nonce claim, audit row; returns the org
--   SELECT set_config('request.jwt.claims', '{"role":"gsam_bridge","cap":"read","org":…}', true);
--   … allow-listed SELECTs …; SELECT admin_bridge_finish(...); COMMIT;
-- The org comes from the database (the first organisation, as front_door_org() and visitor_quote_org() choose it),
-- never from the request. The role reads only the columns granted below, and RLS decides the rows.
--   * gsam_bridge_read: NOLOGIN, no BYPASSRLS, SELECT on allow-listed columns only. No write on any table.
--   * app_bridge_org(): the org from the claims, only when role = 'gsam_bridge' and cap = 'read'.
--   * admin_bridge_nonce: one row per (kid, nonce), kept 10 minutes. A second use is a replay.
--   * admin_bridge_audit: append-only, one row per call, reads included. No API role may read, change or remove it.
-- Write and refund-request capabilities get their own roles in later phases.

DO $$ BEGIN CREATE ROLE gsam_bridge_read NOLOGIN NOBYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- A role made earlier by hand could carry attributes this one must not have.
DO $$ BEGIN
  IF (SELECT rolbypassrls OR rolsuper OR rolcanlogin OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = 'gsam_bridge_read') THEN
    RAISE EXCEPTION 'gsam_bridge_read must be NOLOGIN, NOBYPASSRLS, NOSUPERUSER, NOCREATEROLE and NOCREATEDB';
  END IF;
END $$;
-- lets the site connection SET LOCAL ROLE to it
GRANT gsam_bridge_read TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO gsam_bridge_read;

-- ── claims ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_bridge_org() RETURNS uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN c ->> 'role' = 'gsam_bridge' AND c ->> 'cap' = 'read'
              THEN nullif(c ->> 'org', '')::uuid END
  FROM (SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb AS c) s $$;
REVOKE ALL ON FUNCTION app_bridge_org() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_bridge_org() TO gsam_bridge_read;

-- ── nonces and audit ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_bridge_nonce (
  kid      text NOT NULL,
  nonce    text NOT NULL,
  seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kid, nonce)
);
CREATE INDEX IF NOT EXISTS admin_bridge_nonce_seen ON public.admin_bridge_nonce (seen_at);

CREATE TABLE IF NOT EXISTS public.admin_bridge_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at           timestamptz NOT NULL DEFAULT now(),
  kid          text NOT NULL,
  capability   text NOT NULL CHECK (capability IN ('read', 'write', 'refund_request')),
  actor_type   text NOT NULL CHECK (actor_type IN ('agent', 'user')),
  actor_id     text NOT NULL CHECK (actor_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  gsam_run_id  uuid,
  method       text NOT NULL CHECK (method IN ('GET', 'POST', 'PATCH', 'PUT', 'DELETE')),
  path         text NOT NULL CHECK (char_length(path) <= 2048),
  resource     text CHECK (char_length(resource) <= 40),
  resource_id  text CHECK (char_length(resource_id) <= 80),
  outcome      text NOT NULL DEFAULT 'started' CHECK (outcome IN ('started', 'ok', 'not_found', 'bad_request')),
  row_count    integer CHECK (row_count >= 0),
  nonce        text NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_bridge_audit_at ON public.admin_bridge_audit (at DESC);
CREATE INDEX IF NOT EXISTS admin_bridge_audit_actor ON public.admin_bridge_audit (actor_type, actor_id, at DESC);

-- 002's default grants gave these to anon, authenticated and service_role. Take them all back: only the two
-- functions below touch these tables. RLS with no policy is a second lock.
REVOKE ALL ON public.admin_bridge_nonce, public.admin_bridge_audit FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read;
ALTER TABLE public.admin_bridge_nonce ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bridge_nonce FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bridge_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bridge_audit FORCE ROW LEVEL SECURITY;
-- the owner keeps its own rights through these policies, as 002 does for auth.users
DROP POLICY IF EXISTS owner_all ON public.admin_bridge_nonce;
CREATE POLICY owner_all ON public.admin_bridge_nonce FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS owner_insert ON public.admin_bridge_audit;
CREATE POLICY owner_insert ON public.admin_bridge_audit FOR INSERT TO CURRENT_USER WITH CHECK (true);
DROP POLICY IF EXISTS owner_read ON public.admin_bridge_audit;
CREATE POLICY owner_read ON public.admin_bridge_audit FOR SELECT TO CURRENT_USER USING (true);
-- finish may only close a row this transaction opened
DROP POLICY IF EXISTS owner_finish ON public.admin_bridge_audit;
CREATE POLICY owner_finish ON public.admin_bridge_audit FOR UPDATE TO CURRENT_USER
  USING (outcome = 'started' AND at = now()) WITH CHECK (outcome <> 'started');

-- Opens a bridge call: checks the signed time against the database clock (60 s), claims the nonce, removes nonces
-- older than 10 minutes and writes the audit row, all in the caller's transaction. A replay is a unique violation
-- (23505); a time outside the window raises GB001 and a malformed nonce GB002. Returns the audit id and the org the claims must name.
CREATE OR REPLACE FUNCTION admin_bridge_begin(p_kid text, p_capability text, p_nonce text, p_time bigint,
  p_actor text, p_run uuid, p_method text, p_path text)
RETURNS TABLE (audit_id uuid, org_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type text := split_part(p_actor, ':', 1);
  v_id   text := substr(p_actor, length(split_part(p_actor, ':', 1)) + 2);
  v_org  uuid;
  v_audit uuid;
BEGIN
  IF p_time IS NULL OR abs(extract(epoch FROM now()) - p_time) > 60 THEN
    RAISE EXCEPTION 'bridge request time outside the window' USING ERRCODE = 'GB001';
  END IF;
  IF p_nonce IS NULL OR p_nonce !~ '^[A-Za-z0-9_-]{22}$' THEN
    RAISE EXCEPTION 'bridge nonce malformed' USING ERRCODE = 'GB002';
  END IF;
  DELETE FROM admin_bridge_nonce WHERE seen_at < now() - interval '10 minutes';
  INSERT INTO admin_bridge_nonce (kid, nonce) VALUES (p_kid, p_nonce);
  SELECT o.id INTO v_org FROM organisations o ORDER BY o.created_at LIMIT 1;
  INSERT INTO admin_bridge_audit (kid, capability, actor_type, actor_id, gsam_run_id, method, path, nonce)
    VALUES (p_kid, p_capability, v_type, v_id, p_run, p_method, p_path, p_nonce)
    RETURNING id INTO v_audit;
  RETURN QUERY SELECT v_audit, v_org;
END $$;
REVOKE ALL ON FUNCTION admin_bridge_begin(text, text, text, bigint, text, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_bridge_begin(text, text, text, bigint, text, uuid, text, text) TO gsam_bridge_read;

-- Closes the audit row begin opened in this transaction, with what was read.
CREATE OR REPLACE FUNCTION admin_bridge_finish(p_audit uuid, p_resource text, p_resource_id text, p_outcome text,
  p_row_count integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE admin_bridge_audit SET resource = p_resource, resource_id = p_resource_id, outcome = p_outcome,
    row_count = p_row_count
  WHERE id = p_audit AND outcome = 'started' AND at = now();
  IF NOT FOUND THEN RAISE EXCEPTION 'no open bridge audit row in this transaction' USING ERRCODE = 'GB003'; END IF;
END $$;
REVOKE ALL ON FUNCTION admin_bridge_finish(uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_bridge_finish(uuid, text, text, text, integer) TO gsam_bridge_read;

-- ── what the role may read ──────────────────────────────────────────────────────────────────────────
-- The last four characters of a licence key, so the full key never leaves the site through the bridge.
ALTER TABLE public.licence_keys ADD COLUMN IF NOT EXISTS licence_key_last4 text
  GENERATED ALWAYS AS (right(licence_key, 4)) STORED;

-- Column grants: no Stripe ids, no storage paths, no auth subjects, no full licence keys, no visitor IPs.
GRANT SELECT (id, org_id, slug, name, tier_id, domain, billing_currency, notes, created_at, updated_at, deleted_at)
  ON public.customers TO gsam_bridge_read;
GRANT SELECT (id, org_id, customer_id, email, full_name, phone, is_primary, role, created_at, updated_at, deleted_at)
  ON public.customer_users TO gsam_bridge_read;
GRANT SELECT (id, org_id, reference, customer_id, customer_user_id, contact_name, contact_email, contact_company,
  contact_phone, message, status, source, currency, indicative_total_minor, quoted_total_minor, po_reference,
  valid_until, created_at, updated_at, deleted_at)
  ON public.quotes TO gsam_bridge_read;
GRANT SELECT (id, org_id, quote_id, offering_id, variant_id, offering_name, variant_name, qty, list_price_minor,
  captured_price_minor, currency, created_at)
  ON public.quote_items TO gsam_bridge_read;
GRANT SELECT (id, org_id, reference, quote_id, customer_id, customer_user_id, customer_email, status, currency,
  subtotal_minor, total_minor, refunded_minor, po_reference, invoice_number, placed_at, created_at, updated_at,
  deleted_at)
  ON public.orders TO gsam_bridge_read;
GRANT SELECT (id, org_id, order_id, offering_id, variant_id, offering_name, variant_name, qty, unit_price_minor,
  line_total_minor, currency, created_at)
  ON public.order_items TO gsam_bridge_read;
GRANT SELECT (id, org_id, customer_id, order_id, offering_name, variant_name, licence_key_last4, seats, status,
  delivered_at, expires_at, file_name, created_at, updated_at, deleted_at)
  ON public.licence_keys TO gsam_bridge_read;
GRANT SELECT (id, org_id, customer_id, kind, series, version, title, summary, pdf_sha256, action, signatory_email,
  status, created_by_kind, created_run_id, published_at, withdrawn_at, created_at, updated_at)
  ON public.portal_documents TO gsam_bridge_read;
GRANT SELECT (id, org_id, customer_id, document_id, document_version, content_sha256, action, signer_name,
  signer_title, account_company_name, signer_email, customer_user_id, confirmation_text, accepted_at)
  ON public.portal_acceptances TO gsam_bridge_read;
GRANT SELECT (id, org_id, services, contact_name, contact_email, contact_company, message, status, source,
  attribution, industry, size_band, created_at, updated_at, deleted_at)
  ON public.service_inquiries TO gsam_bridge_read;
GRANT SELECT (id, org_id, industry, team_size, company_name, source, contact_name, contact_email, contact_role,
  contact_at, consent_given, consent_at, consent_version, status, last_contacted_at, created_at, updated_at)
  ON public.front_door_leads TO gsam_bridge_read;

-- One read policy per table. With no claims, or other claims, app_bridge_org() is null and no row matches.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers', 'customer_users', 'quotes', 'quote_items', 'orders', 'order_items',
    'licence_keys', 'portal_documents', 'portal_acceptances', 'service_inquiries', 'front_door_leads'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS gsam_bridge_read ON public.%I', t);
    EXECUTE format('CREATE POLICY gsam_bridge_read ON public.%I FOR SELECT TO gsam_bridge_read USING (org_id = app_bridge_org())', t);
  END LOOP;
END $$;
