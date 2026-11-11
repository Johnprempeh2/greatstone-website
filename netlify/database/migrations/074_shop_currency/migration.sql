-- The shop currency (GSAM Commerce, Currency tab, 11 Nov 2026). Builds on 007 and 049.
--
--   * org_settings.shop_currency: 'GBP' (the default, and what the shop has always done: the stored US dollar price
--     divided by the display rate, rounded to the whole pound) or 'USD' (the stored dollar prices as they are, no
--     rate). The storefront, basket, quotes and checkout read it; a missing or unreadable value is GBP.
--   * fx_rate_history records the currency next to the rate, so one history covers both: old_currency and
--     new_currency, null on rows written before this migration.
--   * bridge_set_shop_currency: people only, at the row version, like bridge_set_fx.
-- Adds a defaulted column, two nullable columns, grants and one function, so the previous deploy runs unchanged.
-- Error codes as 049. Re-runnable. Rollback: rollback.sql in this folder.

ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS shop_currency text NOT NULL DEFAULT 'GBP';
DO $$ BEGIN
  ALTER TABLE org_settings ADD CONSTRAINT chk_shop_currency CHECK (shop_currency IN ('GBP', 'USD'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE fx_rate_history ADD COLUMN IF NOT EXISTS old_currency text, ADD COLUMN IF NOT EXISTS new_currency text;

-- 007's log, now on a currency change too. Both currencies are written on every row from here on.
CREATE OR REPLACE FUNCTION org_settings_log_fx() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.usd_to_gbp_display_rate IS DISTINCT FROM OLD.usd_to_gbp_display_rate
     OR NEW.shop_currency IS DISTINCT FROM OLD.shop_currency THEN
    INSERT INTO fx_rate_history (org_id, old_rate, new_rate, changed_by, old_currency, new_currency)
      VALUES (NEW.org_id,
              CASE WHEN TG_OP = 'UPDATE' THEN OLD.usd_to_gbp_display_rate END,
              NEW.usd_to_gbp_display_rate, NEW.updated_by,
              CASE WHEN TG_OP = 'UPDATE' THEN OLD.shop_currency END,
              NEW.shop_currency);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

GRANT SELECT (shop_currency) ON public.org_settings TO gsam_bridge_read, gsam_bridge_write;
GRANT SELECT (old_currency, new_currency) ON public.fx_rate_history TO gsam_bridge_read, gsam_bridge_write;

-- People only, like bridge_set_fx: the trigger above writes the history row.
CREATE OR REPLACE FUNCTION bridge_set_shop_currency(p_currency text, p_expected_row_version integer) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ctx record := _bridge_ctx('write');
  v_id uuid;
BEGIN
  PERFORM _bridge_person(ctx.actor);
  IF p_currency IS NULL OR p_currency NOT IN ('GBP', 'USD') THEN RAISE EXCEPTION 'currency' USING ERRCODE = 'GB400'; END IF;
  UPDATE org_settings SET shop_currency = p_currency, updated_by = NULL
   WHERE org_id = ctx.org_id AND row_version = p_expected_row_version RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM org_settings WHERE org_id = ctx.org_id) THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'GB404'; END IF;
    RAISE EXCEPTION 'row version' USING ERRCODE = 'GB409';
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION bridge_set_shop_currency(text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION bridge_set_shop_currency(text, integer) TO gsam_bridge_write;
