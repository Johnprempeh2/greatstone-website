-- 0018_service_popularity_selfprune.sql — make the IP-dedupe table self-maintaining so it NEVER needs a
-- scheduled/manual cleanup. The dedupe only ever checks TODAY's rows (day = current_date), so any row with
-- an earlier day is dead weight. The bump rpc now opportunistically deletes those stale rows on ~1% of
-- calls — negligible cost, and it keeps service_popularity_hits at roughly a single day's size on its own.
-- (Self-contained; only this function reads/writes the locked-down hits table.)

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

  -- self-prune: drop dedupe rows from earlier days (useless — dedup only checks current_date). Runs on a
  -- small random fraction of calls so the table stays ~one day in size with no scheduler and no manual work.
  IF random() < 0.01 THEN
    DELETE FROM service_popularity_hits WHERE day < current_date;
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
