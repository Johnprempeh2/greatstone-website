-- 0031_front_door_leads.sql — the website front door's leads (GRE-463, spec GRE-416 rev 2 §3 and S8).
--
-- ⚠️ DORMANT until applied. Without it the `front-door` edge function still shows the visitor their three
-- employees (S5) with no lead id, and the S6 step falls back to the internal alert email so the contact is
-- not lost. The studio "Front door leads" tab shows its not-enabled state. Nothing else breaks.
--
-- Same lock-down as service_inquiries (0023): RLS on, no anon grants, staff read + manage their org's rows
-- (org_id = app_staff_org()). Unlike 0023 there is no public rpc: only the `front-door` edge function
-- writes, with the service role. No IP is kept here at all; the per-IP limit is 0030's front_door_rate
-- (keyed hash, deleted after 24 hours).
--
-- One row per finished proposal (S5, anonymous). S6 adds the contact fields to the same row. Not kept: the
-- full chat, any IP, anything we did not ask for (spec §3).
--
-- Retention (spec §3), applied by front_door_purge(), which the edge function calls on every proposal:
--   * a row is deleted 24 months after its last activity (created, contact given, or last contacted);
--   * a visitor's request to delete is a staff DELETE from the studio tab (staff_all allows it).
-- Re-runnable (IF NOT EXISTS / OR REPLACE).
-- Rollback: DROP FUNCTION IF EXISTS front_door_purge(); DROP TABLE IF EXISTS front_door_leads;

CREATE TABLE IF NOT EXISTS front_door_leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  -- S5, anonymous: what the visitor told us and what we proposed
  industry          text NOT NULL,
  industry_other    boolean NOT NULL DEFAULT false,      -- typed in "Other" rather than picked from the list
  team_size         text,                                -- '1-10' | '11-50' | '51-250' | '250+' | NULL
  brand_words       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- the three words
  company_name      text NOT NULL,
  agents            jsonb NOT NULL DEFAULT '[]'::jsonb,  -- the three agents as validated (GRE-466 schema)
  chat_summary      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- up to 5 lines by the model; never the chat itself
  chat_turns        smallint NOT NULL DEFAULT 0,         -- how many visitor messages, not what they said
  source            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { page, referrer, firstTouch: {utm_*, landing, ...}, gaClientId }
  -- S6: contact and proof of consent
  contact_name      text,
  contact_email     text,
  contact_role      text,
  contact_at        timestamptz,
  consent_given     boolean,
  consent_at        timestamptz,
  consent_version   text,                                -- e.g. 'front-door-consent-v1' (GRE-467)
  -- staff
  status            text NOT NULL DEFAULT 'new',         -- 'new' | 'contacted' | 'closed'
  last_contacted_at timestamptz,                         -- set by staff; restarts the 24-month clock
  alert_sent_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  row_version       integer NOT NULL DEFAULT 1,
  CONSTRAINT chk_fdl_status CHECK (status IN ('new','contacted','closed')),
  CONSTRAINT chk_fdl_team_size CHECK (team_size IS NULL OR team_size IN ('1-10','11-50','51-250','250+')),
  CONSTRAINT chk_fdl_words CHECK (jsonb_typeof(brand_words) = 'array' AND jsonb_array_length(brand_words) <= 3),
  CONSTRAINT chk_fdl_agents CHECK (jsonb_typeof(agents) = 'array' AND jsonb_array_length(agents) <= 3),
  CONSTRAINT chk_fdl_summary CHECK (jsonb_typeof(chat_summary) = 'array' AND jsonb_array_length(chat_summary) <= 5),
  CONSTRAINT chk_fdl_lengths CHECK (
    char_length(industry) <= 80 AND char_length(company_name) <= 80
    AND char_length(coalesce(contact_name, '')) <= 80 AND char_length(coalesce(contact_email, '')) <= 254
    AND char_length(coalesce(contact_role, '')) <= 80 AND char_length(coalesce(consent_version, '')) <= 60),
  -- consent is only ever recorded together with the wording version it was given against
  CONSTRAINT chk_fdl_consent CHECK (consent_given IS NOT TRUE OR (consent_at IS NOT NULL AND consent_version IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_fdl_org ON front_door_leads(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fdl_activity ON front_door_leads(greatest(created_at, contact_at, last_contacted_at));

DROP TRIGGER IF EXISTS trg_touch_front_door_leads ON front_door_leads;
CREATE TRIGGER trg_touch_front_door_leads BEFORE UPDATE ON front_door_leads
  FOR EACH ROW EXECUTE FUNCTION touch_row();

-- RLS: staff read, work the status and delete on request. NO anon access and no INSERT grant: rows come
-- only from the edge function's service role, which bypasses RLS.
ALTER TABLE front_door_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE front_door_leads FORCE ROW LEVEL SECURITY;
REVOKE ALL ON front_door_leads FROM anon, authenticated;
GRANT SELECT, DELETE ON front_door_leads TO authenticated;
GRANT UPDATE (status, last_contacted_at) ON front_door_leads TO authenticated;  -- staff cannot rewrite what the visitor gave

DROP POLICY IF EXISTS staff_all ON front_door_leads;
CREATE POLICY staff_all ON front_door_leads FOR ALL TO authenticated
  USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org());

-- Retention. Returns how many rows it deleted. Cheap (indexed), so the edge function calls it each proposal.
CREATE OR REPLACE FUNCTION front_door_purge() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  DELETE FROM front_door_leads
   WHERE greatest(created_at, contact_at, last_contacted_at) < now() - interval '24 months';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION front_door_purge() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION front_door_purge() TO service_role;
