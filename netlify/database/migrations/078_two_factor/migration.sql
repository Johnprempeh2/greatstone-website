-- 078_two_factor: two-factor sign-in for site accounts (GRE-6335), using Better Auth's two-factor plugin.
--
--   user."twoFactorEnabled"  set by Better Auth once an authenticator code is confirmed; sign-in then asks for a code.
--   "twoFactor"              one row per user: the authenticator secret, encrypted by Better Auth with
--                            BETTER_AUTH_SECRET, and the recovery codes as keyed hashes (never the codes). The plugin
--                            keeps a per-account failure count and lock time here.
--   "rateLimit"              Better Auth's database rate limiter, used for the /two-factor/* endpoints, so the limit
--                            holds across function instances.
--
-- Same rules as 052: only auth_server (inside a request transaction) and the owner can touch these tables; anon,
-- authenticated and service_role cannot read them. Additive only. Rollback: rollback.sql in this folder.

ALTER TABLE better_auth."user" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS better_auth."twoFactor" (
  "id" text PRIMARY KEY,
  "secret" text NOT NULL,
  "backupCodes" text NOT NULL,
  "userId" text NOT NULL UNIQUE REFERENCES better_auth."user"("id") ON DELETE CASCADE,
  "verified" boolean DEFAULT true,
  "failedVerificationCount" integer DEFAULT 0,
  "lockedUntil" timestamptz
);

CREATE TABLE IF NOT EXISTS better_auth."rateLimit" (
  "id" text PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "count" integer NOT NULL,
  "lastRequest" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS better_auth_rate_limit_last_idx ON better_auth."rateLimit" ("lastRequest");

DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['twoFactor', 'rateLimit'] LOOP
    EXECUTE format('ALTER TABLE better_auth.%I ENABLE ROW LEVEL SECURITY', tab);
    EXECUTE format('ALTER TABLE better_auth.%I FORCE ROW LEVEL SECURITY', tab);
    EXECUTE format('REVOKE ALL ON better_auth.%I FROM PUBLIC, anon, authenticated, service_role', tab);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON better_auth.%I TO auth_server', tab);
    EXECUTE format('DROP POLICY IF EXISTS auth_server_all ON better_auth.%I', tab);
    EXECUTE format('CREATE POLICY auth_server_all ON better_auth.%I FOR ALL TO auth_server USING (true) WITH CHECK (true)', tab);
    EXECUTE format('DROP POLICY IF EXISTS owner_all ON better_auth.%I', tab);
    EXECUTE format('CREATE POLICY owner_all ON better_auth.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', tab);
  END LOOP;
END $$;
