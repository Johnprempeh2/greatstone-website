-- Port of supabase/migrations/0023_service_inquiries.sql (GRE-1795).
--
-- Netlify: service_inquiries already exists (001_enquiry_inbox made it early, for the contact form, before
-- organisations was here). So this is a forward migration on that table, not 0023's CREATE TABLE:
--   * org_id gets 0023's foreign key. It stays nullable: the contact form saves as `anon`, which has no grant on
--     org_id, and an enquiry must be saved even when no organisation row exists yet (the data move brings it).
--     A trigger fills org_id with the primary organisation on insert, and a trigger on organisations fills the
--     rows saved before it existed, so no enquiry stays hidden from staff.
--   * 0023's staff_all policy and staff grants. `anon` keeps 001's grants: 0023's REVOKE ALL ... FROM anon would
--     take away the contact form's INSERT, and enquiries would then reach only the alert email.
--   * Staff get SELECT and UPDATE, as 0023 states. (On Supabase the default grants also gave them INSERT and
--     DELETE, which 0023 did not intend.) The worker role gets all, as Supabase's service_role had.
--   * submit_service_inquiry, the services-basket rpc, is 0023's, unchanged.
--
-- Rollback: rollback.sql in this folder (removes only what this adds; 001's table and rows stay).

ALTER TABLE service_inquiries DROP CONSTRAINT IF EXISTS service_inquiries_org_id_fkey;
ALTER TABLE service_inquiries ADD CONSTRAINT service_inquiries_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE;

-- single-tenant: the primary organisation, as submit_service_inquiry picks it
CREATE OR REPLACE FUNCTION fill_inquiry_org() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM organisations ORDER BY created_at LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fill_inquiry_org() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_fill_inquiry_org ON service_inquiries;
CREATE TRIGGER trg_fill_inquiry_org BEFORE INSERT ON service_inquiries
  FOR EACH ROW EXECUTE FUNCTION fill_inquiry_org();

-- enquiries saved before the organisation existed get it when it arrives (and now, if it is already here)
CREATE OR REPLACE FUNCTION fill_orphan_inquiries() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE service_inquiries SET org_id = (SELECT id FROM organisations ORDER BY created_at LIMIT 1)
    WHERE org_id IS NULL;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION fill_orphan_inquiries() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_fill_orphan_inquiries ON organisations;
CREATE TRIGGER trg_fill_orphan_inquiries AFTER INSERT ON organisations
  FOR EACH STATEMENT EXECUTE FUNCTION fill_orphan_inquiries();
UPDATE service_inquiries SET org_id = (SELECT id FROM organisations ORDER BY created_at LIMIT 1) WHERE org_id IS NULL;

-- RLS stays on and forced (001). Staff read and manage their org's rows; no anon change.
GRANT SELECT, UPDATE ON service_inquiries TO authenticated;
GRANT ALL ON service_inquiries TO service_role;

DROP POLICY IF EXISTS staff_all ON service_inquiries;
CREATE POLICY staff_all ON service_inquiries FOR ALL TO authenticated
  USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org());

-- Public submission: validated + IP rate-limited, runs as owner (bypasses RLS for the one INSERT). Mirrors
-- bump_service_popularity's IP handling. Returns the new inquiry id (or raises on invalid/rate-limited input).
CREATE OR REPLACE FUNCTION submit_service_inquiry(
  p_services jsonb, p_name text DEFAULT NULL, p_email text DEFAULT NULL, p_company text DEFAULT NULL, p_message text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_services jsonb := COALESCE(p_services, '[]'::jsonb);
  v_org uuid; v_ip text; v_count int; v_id uuid;
BEGIN
  IF jsonb_typeof(v_services) <> 'array' OR jsonb_array_length(v_services) = 0 OR jsonb_array_length(v_services) > 50 THEN
    RAISE EXCEPTION 'invalid services';
  END IF;
  IF char_length(COALESCE(p_message,'')) > 4000 OR char_length(COALESCE(p_name,'')) > 200
     OR char_length(COALESCE(p_email,'')) > 200 OR char_length(COALESCE(p_company,'')) > 200 THEN
    RAISE EXCEPTION 'field too long';
  END IF;

  BEGIN
    v_ip := nullif(split_part(coalesce((current_setting('request.headers', true))::json ->> 'x-forwarded-for', ''), ',', 1), '');
  EXCEPTION WHEN others THEN v_ip := NULL; END;
  IF v_ip IS NULL THEN v_ip := 'unknown'; END IF;
  v_ip := left(trim(v_ip), 64);

  SELECT count(*) INTO v_count FROM service_inquiries WHERE ip = v_ip AND created_at > now() - interval '1 day';
  IF v_count >= 10 THEN RAISE EXCEPTION 'rate limited'; END IF;

  SELECT id INTO v_org FROM organisations ORDER BY created_at LIMIT 1;  -- single-tenant: the primary org
  IF v_org IS NULL THEN RAISE EXCEPTION 'no organisation'; END IF;

  INSERT INTO service_inquiries (org_id, services, contact_name, contact_email, contact_company, message, ip)
    VALUES (v_org, v_services, nullif(trim(p_name), ''), nullif(trim(p_email), ''), nullif(trim(p_company), ''), nullif(trim(p_message), ''), v_ip)
    RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION submit_service_inquiry(jsonb, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION submit_service_inquiry(jsonb, text, text, text, text) TO anon, authenticated;
