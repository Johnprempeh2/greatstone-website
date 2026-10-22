-- Port of supabase/migrations/0006_relabel_usd.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0006_relabel_usd.sql — USD becomes the stored price currency.
-- John's decision: the existing demo numbers ARE the USD list prices. We only relabel the currency
-- (numbers unchanged); GBP is computed at read time as round(usd/rate) to the whole pound, so e.g.
-- a stored 870 (was "£8.70/£870") now reads as $870 -> £669 at the seeded 1.30 rate.
-- base_price_minor / from_price_minor keep their values; chk_variant_price_pair stays valid because
-- we never change the (price, currency) both-or-neither pairing — only the currency code.

UPDATE offering_variants SET currency = 'USD'
  WHERE base_price_minor IS NOT NULL AND currency IS DISTINCT FROM 'USD';

UPDATE offerings SET from_price_currency = 'USD'
  WHERE from_price_minor IS NOT NULL AND from_price_currency IS DISTINCT FROM 'USD';
