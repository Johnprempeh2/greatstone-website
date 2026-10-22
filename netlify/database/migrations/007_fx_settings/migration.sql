-- Port of supabase/migrations/0005_fx_settings.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0005_fx_settings.sql — ONE editable global USD->GBP rate per org, with a change audit.
-- USD is the stored source of truth (see 0006); GBP is computed at READ time from this rate,
-- so a rate change instantly reprices the whole catalogue with NO stored-price writes (no mirror).
-- Follows the established conventions: org_id FK, touch_row trigger, RLS layers from 0002/0003/0004.

CREATE TABLE IF NOT EXISTS org_settings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    -- The display rate the admin types: '$ to the £'. 1.30 means $1.30 = £1, and
    -- GBP_pounds = round(USD_pounds / rate)  (matches Ben's $1000 / 1.32 -> £758).
    usd_to_gbp_display_rate NUMERIC(12,6) NOT NULL DEFAULT 1.300000,
    -- Guardrail: a fat-fingered rate can't zero-out or 100x the catalogue.
    CONSTRAINT chk_rate_sane CHECK (usd_to_gbp_display_rate BETWEEN 0.10 AND 100.0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    UNIQUE (org_id)                          -- exactly one rate row per org
);
CREATE INDEX IF NOT EXISTS idx_org_settings_org ON org_settings(org_id);
DROP TRIGGER IF EXISTS trg_touch_org_settings ON org_settings;
CREATE TRIGGER trg_touch_org_settings BEFORE UPDATE ON org_settings
    FOR EACH ROW EXECUTE FUNCTION touch_row();

-- Immutable rate-change history (powers the FX editor's "was X -> now Y, by whom, when" panel).
CREATE TABLE IF NOT EXISTS fx_rate_history (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    old_rate     NUMERIC(12,6),                 -- NULL on first set
    new_rate     NUMERIC(12,6) NOT NULL,
    changed_by   UUID REFERENCES users(id),
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    note         TEXT
);
CREATE INDEX IF NOT EXISTS idx_fx_history_org_at ON fx_rate_history(org_id, changed_at DESC);

-- Log every rate set/change to fx_rate_history. No catalogue reprice needed: GBP is derived at read.
CREATE OR REPLACE FUNCTION org_settings_log_fx() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.usd_to_gbp_display_rate IS DISTINCT FROM OLD.usd_to_gbp_display_rate THEN
    INSERT INTO fx_rate_history (org_id, old_rate, new_rate, changed_by)
      VALUES (NEW.org_id,
              CASE WHEN TG_OP = 'UPDATE' THEN OLD.usd_to_gbp_display_rate END,
              NEW.usd_to_gbp_display_rate, NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_org_settings_log_fx ON org_settings;
CREATE TRIGGER trg_org_settings_log_fx AFTER INSERT OR UPDATE ON org_settings
    FOR EACH ROW EXECUTE FUNCTION org_settings_log_fx();

-- RLS, mirroring the three established layers.
ALTER TABLE org_settings    ENABLE ROW LEVEL SECURITY; ALTER TABLE org_settings    FORCE ROW LEVEL SECURITY;
ALTER TABLE fx_rate_history ENABLE ROW LEVEL SECURITY; ALTER TABLE fx_rate_history FORCE ROW LEVEL SECURITY;
-- 0002-style org GUC backstop
DROP POLICY IF EXISTS org_isolation ON org_settings;
CREATE POLICY org_isolation ON org_settings USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
DROP POLICY IF EXISTS org_isolation ON fx_rate_history;
CREATE POLICY org_isolation ON fx_rate_history USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org());
-- 0004-style staff write (owner/admin/editor of the org)
GRANT SELECT, INSERT, UPDATE ON org_settings TO authenticated;
GRANT SELECT, INSERT ON fx_rate_history TO authenticated;
DROP POLICY IF EXISTS staff_all ON org_settings;
CREATE POLICY staff_all ON org_settings FOR ALL TO authenticated USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org());
DROP POLICY IF EXISTS staff_all ON fx_rate_history;
CREATE POLICY staff_all ON fx_rate_history FOR ALL TO authenticated USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org());
-- 0003-style public read: the storefront (anon) must fetch the rate to convert prices client-side. Not secret.
GRANT SELECT ON org_settings TO anon, authenticated;
DROP POLICY IF EXISTS public_read ON org_settings;
CREATE POLICY public_read ON org_settings FOR SELECT TO public USING (true);

-- Seed the single Greatstone org rate at the default 1.30 (idempotent).
-- Netlify: only when the organisation row is there. A fresh Netlify database has none until the data move (which
-- brings this org_settings row too); 0005's plain VALUES insert would fail the deploy on its foreign key.
INSERT INTO org_settings (org_id, usd_to_gbp_display_rate)
  SELECT id, 1.300000 FROM organisations WHERE id = '11111111-1111-4111-8111-111111111111'
  ON CONFLICT (org_id) DO NOTHING;
