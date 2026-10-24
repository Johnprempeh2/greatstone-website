-- Better Auth core tables. The site connection may enter auth_server only inside
-- a transaction; neither visitors nor staff can read password hashes or tokens.
DO $$ BEGIN CREATE ROLE auth_server NOLOGIN NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF (SELECT rolbypassrls OR rolcanlogin FROM pg_roles WHERE rolname = 'auth_server') THEN
    RAISE EXCEPTION 'auth_server must be NOLOGIN and must not bypass RLS';
  END IF;
END $$;
GRANT auth_server TO CURRENT_USER;
CREATE SCHEMA better_auth;
REVOKE ALL ON SCHEMA better_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA better_auth TO auth_server;

CREATE TABLE better_auth."user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE better_auth."session" (
  "id" text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES better_auth."user"("id") ON DELETE CASCADE
);
CREATE INDEX better_auth_session_user_idx ON better_auth."session" ("userId");
CREATE TABLE better_auth."account" (
  "id" text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES better_auth."user"("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX better_auth_account_user_idx ON better_auth."account" ("userId");
CREATE TABLE better_auth."verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX better_auth_verification_identifier_idx ON better_auth."verification" ("identifier");

DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['user', 'account', 'session', 'verification'] LOOP
    EXECUTE format('ALTER TABLE better_auth.%I ENABLE ROW LEVEL SECURITY', tab);
    EXECUTE format('ALTER TABLE better_auth.%I FORCE ROW LEVEL SECURITY', tab);
    EXECUTE format('REVOKE ALL ON better_auth.%I FROM PUBLIC, anon, authenticated, service_role', tab);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON better_auth.%I TO auth_server', tab);
    EXECUTE format('CREATE POLICY auth_server_all ON better_auth.%I FOR ALL TO auth_server USING (true) WITH CHECK (true)', tab);
    EXECUTE format('CREATE POLICY owner_all ON better_auth.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', tab);
  END LOOP;
END $$;

CREATE TRIGGER trg_auth_users_sync AFTER INSERT OR UPDATE OR DELETE ON better_auth."user"
  FOR EACH ROW EXECUTE FUNCTION auth.sync_better_auth_user();
