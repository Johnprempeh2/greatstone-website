-- 0030_front_door_rate.sql — the per-IP limit for the website front door (GRE-462, spec GRE-416 rev 2 §5):
-- three proposals per visitor IP a day, counted in the database like bump_service_popularity (0020-0022).
--
-- ⚠️ DORMANT until applied. Without it the `front-door` edge function answers every proposal with the
-- "not available, use the contact form" message (it fails closed, so no model spend goes unmetered).
--
-- Only the `front-door` edge function (service role) uses this. The IP is never stored in clear: the
-- function sends a keyed SHA-256 hash, and rows older than 24 hours are deleted on every call (spec §3).
-- No anon or authenticated access to the table or the functions. Re-runnable.
-- Rollback: DROP FUNCTION IF EXISTS front_door_release_slot(uuid); DROP FUNCTION IF EXISTS
--           front_door_take_slot(text, int); DROP TABLE IF EXISTS front_door_rate;

CREATE TABLE IF NOT EXISTS front_door_rate (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash     text NOT NULL,                              -- keyed SHA-256 of the visitor IP, never the IP
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_front_door_rate_hash CHECK (ip_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS idx_front_door_rate_ip ON front_door_rate(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_front_door_rate_age ON front_door_rate(created_at);

ALTER TABLE front_door_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE front_door_rate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON front_door_rate FROM anon, authenticated;
-- No policies: nobody but the owner (and the service role, which bypasses RLS) can read or write it.

-- Take one of today's proposals for this IP hash. Returns the slot id, or NULL when the limit is reached.
-- The advisory lock makes check-and-insert atomic per hash, so parallel calls cannot slip past the limit.
CREATE OR REPLACE FUNCTION front_door_take_slot(p_ip_hash text, p_limit int DEFAULT 3)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_id uuid;
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid ip hash'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('front_door_rate:' || p_ip_hash));
  DELETE FROM front_door_rate WHERE created_at < now() - interval '24 hours';
  SELECT count(*) INTO v_count FROM front_door_rate WHERE ip_hash = p_ip_hash;
  IF v_count >= GREATEST(COALESCE(p_limit, 3), 0) THEN RETURN NULL; END IF;
  INSERT INTO front_door_rate (ip_hash) VALUES (p_ip_hash) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Give a slot back when the proposal failed on our side, so a failed build does not count.
CREATE OR REPLACE FUNCTION front_door_release_slot(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM front_door_rate WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION front_door_take_slot(text, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION front_door_release_slot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION front_door_take_slot(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION front_door_release_slot(uuid) TO service_role;
