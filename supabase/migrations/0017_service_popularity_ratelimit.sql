-- 0017_service_popularity_ratelimit.sql — make the global popularity counter tamper-resistant.
-- The bump rpc now dedupes by CLIENT IP: at most one view-count and one inquiry-count per (ip, slug)
-- per day, so a single visitor can't inflate a service by refreshing/scripting the rpc. The IP comes from
-- PostgREST's forwarded request headers (Supabase's gateway sets x-forwarded-for to the real client IP).
-- The hits table is locked down (RLS on, NO policies, grants revoked) — only the SECURITY DEFINER rpc
-- (which runs as its owner and bypasses RLS) reads/writes it; IPs are never exposed publicly.

CREATE TABLE IF NOT EXISTS service_popularity_hits (
  ip    text NOT NULL,
  slug  text NOT NULL,
  kind  text NOT NULL,
  day   date NOT NULL DEFAULT current_date,
  PRIMARY KEY (ip, slug, kind, day)
);
ALTER TABLE service_popularity_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON service_popularity_hits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION bump_service_popularity(p_slug text, p_kind text DEFAULT 'view')
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slug   text := lower(trim(COALESCE(p_slug, '')));
  v_is_inq boolean := (p_kind = 'inquiry');
  v_kind   text := CASE WHEN (p_kind = 'inquiry') THEN 'inquiry' ELSE 'view' END;
  v_ip     text;
  v_rows   integer;
BEGIN
  IF char_length(v_slug) < 1 OR char_length(v_slug) > 120 OR v_slug !~ '^[a-z0-9-]+$' THEN
    RETURN; -- reject anything that isn't a plausible service slug
  END IF;

  -- client IP from PostgREST's forwarded headers (first hop of x-forwarded-for). If absent (e.g. a
  -- service-role/direct call), everyone shares the 'unknown' bucket so it still rate-limits.
  BEGIN
    v_ip := nullif(split_part(coalesce((current_setting('request.headers', true))::json ->> 'x-forwarded-for', ''), ',', 1), '');
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;
  IF v_ip IS NULL THEN v_ip := 'unknown'; END IF;
  v_ip := left(trim(v_ip), 64);

  -- dedup: one count per (ip, slug, kind) per day. If the hit already exists, do NOT increment.
  INSERT INTO service_popularity_hits (ip, slug, kind, day)
    VALUES (v_ip, v_slug, v_kind, current_date)
    ON CONFLICT (ip, slug, kind, day) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN; -- this IP already counted for this service + kind today
  END IF;

  INSERT INTO service_popularity AS sp (slug, views, inquiries, updated_at)
    VALUES (v_slug, CASE WHEN v_is_inq THEN 0 ELSE 1 END, CASE WHEN v_is_inq THEN 1 ELSE 0 END, now())
  ON CONFLICT (slug) DO UPDATE
    SET views      = sp.views      + (CASE WHEN v_is_inq THEN 0 ELSE 1 END),
        inquiries  = sp.inquiries  + (CASE WHEN v_is_inq THEN 1 ELSE 0 END),
        updated_at = now();
END;
$$;
