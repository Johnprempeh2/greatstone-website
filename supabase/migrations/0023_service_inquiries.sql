-- 0023_service_inquiries.sql — capture website "Inquire about these services" submissions into the studio.
--
-- ⚠️ DORMANT: written for review, NOT yet applied. Apply when John signs off. Until applied, the table +
-- rpc do not exist: the public inquiry drawer's capture call is a best-effort no-op (the prefilled email
-- still opens, unchanged), and the admin "Service inquiries" tab shows its empty/not-enabled state. No app
-- code path breaks if the table is absent — applying this migration purely turns the inbox on.
--
-- Anonymous visitors SUBMIT only through a SECURITY DEFINER rpc (submit_service_inquiry) — never a direct
-- table INSERT — so the table grants stay staff-only and the write is validated + IP rate-limited at the
-- database, exactly like bump_service_popularity (0020-0022). Staff read + manage their org's rows via the
-- standard staff_all policy (org_id = app_staff_org(), mirrors 0004/0019). Re-runnable (IF NOT EXISTS / OR REPLACE).

CREATE TABLE IF NOT EXISTS service_inquiries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  services        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- the chosen services: [{ slug, name, category }]
  contact_name    text,
  contact_email   text,
  contact_company text,
  message         text,
  status          text NOT NULL DEFAULT 'new',          -- 'new' | 'contacted' | 'closed'
  source          text NOT NULL DEFAULT 'web',
  ip              text,                                  -- first hop of x-forwarded-for, for rate-limiting; staff-only (RLS), never public
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  row_version     integer NOT NULL DEFAULT 1,
  deleted_at      timestamptz,
  CONSTRAINT chk_inquiry_status CHECK (status IN ('new','contacted','closed'))
);
CREATE INDEX IF NOT EXISTS idx_inquiries_org ON service_inquiries(org_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_ip ON service_inquiries(ip, created_at DESC);

-- updated_at / row_version maintenance (reuse the shared trigger fn from 0001).
DROP TRIGGER IF EXISTS trg_touch_inquiries ON service_inquiries;
CREATE TRIGGER trg_touch_inquiries BEFORE UPDATE ON service_inquiries
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- RLS: staff read + manage their org's rows. NO anon/authenticated INSERT grant — submission is rpc-only. ----
ALTER TABLE service_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_inquiries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON service_inquiries FROM anon;
GRANT SELECT, UPDATE ON service_inquiries TO authenticated;  -- staff read + status update; not INSERT/DELETE directly

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
