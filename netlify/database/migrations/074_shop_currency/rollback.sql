-- Removes 074. Deploy the site without the shop currency first (it then prices in pounds, as before). The history
-- rows keep their rates; their currency columns go.
DROP FUNCTION IF EXISTS public.bridge_set_shop_currency(text, integer);
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
ALTER TABLE fx_rate_history DROP COLUMN IF EXISTS old_currency, DROP COLUMN IF EXISTS new_currency;
ALTER TABLE org_settings DROP CONSTRAINT IF EXISTS chk_shop_currency;
ALTER TABLE org_settings DROP COLUMN IF EXISTS shop_currency;
