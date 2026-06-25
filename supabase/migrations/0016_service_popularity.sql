-- 0016_service_popularity.sql — GLOBAL, cross-visitor popularity for the Managed Services catalogue's
-- "Popular" surface. One counter row per service slug. PUBLIC READ (anon) so the storefront can rank;
-- all writes go ONLY through the SECURITY DEFINER bump rpc (granted to anon) — never direct — so the
-- table can't be arbitrarily mutated, and the rpc validates the slug shape to reject junk rows.
-- Fully self-contained: references no existing table, so it cannot affect the commerce catalogue.

CREATE TABLE IF NOT EXISTS service_popularity (
  slug        text PRIMARY KEY,
  views       integer NOT NULL DEFAULT 0,
  inquiries   integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_popularity_slug_len CHECK (char_length(slug) BETWEEN 1 AND 120)
);

ALTER TABLE service_popularity ENABLE ROW LEVEL SECURITY;

-- PUBLIC may READ the aggregate counts (nothing sensitive: just a slug + two integers).
DROP POLICY IF EXISTS public_read ON service_popularity;
CREATE POLICY public_read ON service_popularity FOR SELECT TO public USING (true);
-- No INSERT/UPDATE/DELETE policy → direct writes are denied for anon/authenticated. Only the
-- SECURITY DEFINER function below (owned by the migration role) can write.

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON service_popularity TO anon, authenticated;

-- Atomic increment. SECURITY DEFINER so it writes despite RLS. Validates the slug (lowercase a-z0-9-,
-- ≤120 chars) so a hostile caller can't seed garbage. Idempotent upsert; one statement, one transaction.
CREATE OR REPLACE FUNCTION bump_service_popularity(p_slug text, p_kind text DEFAULT 'view')
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slug   text := lower(trim(COALESCE(p_slug, '')));
  v_is_inq boolean := (p_kind = 'inquiry');
BEGIN
  IF char_length(v_slug) < 1 OR char_length(v_slug) > 120 OR v_slug !~ '^[a-z0-9-]+$' THEN
    RETURN; -- reject anything that isn't a plausible service slug
  END IF;
  INSERT INTO service_popularity AS sp (slug, views, inquiries, updated_at)
    VALUES (v_slug, CASE WHEN v_is_inq THEN 0 ELSE 1 END, CASE WHEN v_is_inq THEN 1 ELSE 0 END, now())
  ON CONFLICT (slug) DO UPDATE
    SET views      = sp.views      + (CASE WHEN v_is_inq THEN 0 ELSE 1 END),
        inquiries  = sp.inquiries  + (CASE WHEN v_is_inq THEN 1 ELSE 0 END),
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION bump_service_popularity(text, text) FROM public;
GRANT EXECUTE ON FUNCTION bump_service_popularity(text, text) TO anon, authenticated;
