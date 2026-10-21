-- 001_enquiry_inbox — the contact form's enquiries on Netlify Database (GRE-1794, step 1 of the GRE-1703 plan).
--
-- The same service_inquiries table the Supabase migrations build (0023, attribution and industry from 0035, the
-- 30-day IP purge from 0036, the size band from 0040): same columns, defaults and checks. Two differences, both
-- because the rest of the schema has not moved yet (GRE-1795 ports it):
--   * org_id is nullable and has no foreign key: organisations is not on this database. The `enquiry`
--     function leaves it empty. GRE-1795 adds the key and fills it when organisations arrives.
--   * There is no staff policy yet (0023's staff_all needs app_staff_org()). Until GRE-1795, staff read the
--     inbox in the owner alert email, and the Supabase copy stays as it is.
--
-- Access: the `enquiry` Netlify Function connects with the site connection but runs every query inside a
-- transaction as `anon` (SET LOCAL ROLE, claims set with set_config(..., true)), never as the owner. `anon` may
-- INSERT a contact enquiry (named columns only, RLS checks the row) and call two narrow functions: the per-IP
-- count and "alert sent". It has no SELECT, UPDATE or DELETE on the table, so it cannot read an enquiry back.
--
-- Rollback: rollback.sql in this folder (drops the table and its rows; export them first).

-- Roles. Idempotent: roles are cluster-wide, and GRE-1795 adds `authenticated` and the worker role.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon TO CURRENT_USER;  -- lets the site connection SET LOCAL ROLE anon
GRANT USAGE ON SCHEMA public TO anon;

-- updated_at / row_version upkeep, as Supabase 0001 defines it (CREATE OR REPLACE, so the 0001 port is a no-op).
CREATE OR REPLACE FUNCTION touch_row() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    IF TG_OP = 'UPDATE' AND NEW.row_version = OLD.row_version THEN
        NEW.row_version := OLD.row_version + 1;          -- optimistic-lock bump
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS service_inquiries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid,                                  -- 0023: NOT NULL REFERENCES organisations(id); see above
  services        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- the chosen services: [{ slug, name, category }]
  contact_name    text,
  contact_email   text,
  contact_company text,
  message         text,
  status          text NOT NULL DEFAULT 'new',          -- 'new' | 'contacted' | 'closed'
  source          text NOT NULL DEFAULT 'web',
  ip              text,                                  -- first hop, for the per-IP limit; cleared after 30 days
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  row_version     integer NOT NULL DEFAULT 1,
  deleted_at      timestamptz,
  attribution     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- 0035: { first, last, page }
  industry        text,                                  -- 0035
  alert_sent_at   timestamptz,                           -- 0035
  size_band       text,                                  -- 0040
  CONSTRAINT chk_inquiry_status CHECK (status IN ('new','contacted','closed')),
  CONSTRAINT chk_inquiry_extra CHECK (jsonb_typeof(attribution) = 'object' AND char_length(coalesce(industry, '')) <= 80),
  CONSTRAINT chk_inquiry_size_band CHECK (char_length(coalesce(size_band, '')) <= 40)
);
CREATE INDEX IF NOT EXISTS idx_inquiries_org ON service_inquiries(org_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_ip ON service_inquiries(ip, created_at DESC);

DROP TRIGGER IF EXISTS trg_touch_inquiries ON service_inquiries;
CREATE TRIGGER trg_touch_inquiries BEFORE UPDATE ON service_inquiries
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- RLS on and forced. The owner keeps one policy so the SECURITY DEFINER functions below (and 0036's purge
-- trigger) work whether or not the platform role has BYPASSRLS; no request runs as the owner.
ALTER TABLE service_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_inquiries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON service_inquiries FROM PUBLIC, anon;
GRANT INSERT (id, services, contact_name, contact_email, contact_company, message, size_band, industry, attribution, source, ip)
  ON service_inquiries TO anon;

DROP POLICY IF EXISTS owner_definer ON service_inquiries;
CREATE POLICY owner_definer ON service_inquiries FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_contact_insert ON service_inquiries;
CREATE POLICY anon_contact_insert ON service_inquiries FOR INSERT TO anon
  WITH CHECK (source = 'contact' AND services = '[]'::jsonb AND status = 'new' AND alert_sent_at IS NULL AND deleted_at IS NULL);

-- Enquiries from one IP in the last day (the function refuses the eleventh). A count only, never a row.
CREATE OR REPLACE FUNCTION enquiry_recent_count(p_ip text) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM service_inquiries WHERE ip = left(coalesce(p_ip, ''), 64) AND created_at > now() - interval '1 day'
$$;

-- "The owner alert went" for an enquiry saved in the last hour, once. Returns whether it marked a row.
CREATE OR REPLACE FUNCTION enquiry_mark_alerted(p_id uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows integer;
BEGIN
  UPDATE service_inquiries SET alert_sent_at = now()
    WHERE id = p_id AND alert_sent_at IS NULL AND created_at > now() - interval '1 hour';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;
REVOKE ALL ON FUNCTION enquiry_recent_count(text), enquiry_mark_alerted(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enquiry_recent_count(text), enquiry_mark_alerted(uuid) TO anon;

-- 0036: clear an enquiry's IP after 30 days (the Privacy page's promise). Every insert prunes older IPs.
CREATE OR REPLACE FUNCTION purge_inquiry_ips() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows integer;
BEGIN
  UPDATE service_inquiries SET ip = NULL
    WHERE ip IS NOT NULL AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION purge_inquiry_ips() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION trg_purge_inquiry_ips() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM purge_inquiry_ips();
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION trg_purge_inquiry_ips() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_inquiry_ip_purge ON service_inquiries;
CREATE TRIGGER trg_inquiry_ip_purge
  AFTER INSERT ON service_inquiries
  FOR EACH STATEMENT EXECUTE FUNCTION trg_purge_inquiry_ips();
