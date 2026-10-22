-- 002_auth_bridge — what Supabase gave the website's 40 migrations for free, as a real migration (GRE-1795, step 2
-- of the GRE-1703 plan). It replaces supabase/tests/supabase-shim.sql and supabase/seed/local-roles.sql, so the
-- ported migrations (003 to 042) and their 86 policies run unchanged.
--
--   * Extensions pgcrypto, citext and pg_trgm (003 creates them again with IF NOT EXISTS).
--   * Roles. A request never runs as the owner: a Netlify Function opens a transaction, runs SET LOCAL ROLE anon or
--     authenticated, and sets the signed-in user with set_config('request.jwt.claims', '{"sub":…,"email":…}', true).
--     Both end with the transaction, so nothing carries over to the next request on a pooled connection.
--     service_role is the worker role: BYPASSRLS, for scheduled jobs and webhooks only, never for a visitor's
--     request. It keeps Supabase's name, so the ported grants (front door, portal MCP, receipt worker) stay as written.
--   * auth.jwt() and auth.uid() read request.jwt.claims, as on Supabase.
--   * auth.users keeps each user's uuid, so foreign keys and auth.uid() still match. Better Auth (step 6) writes
--     its "user" table; a trigger on it calls auth.sync_better_auth_user() to keep this table in step.
--   * storage.buckets and storage.objects: the file index the ported file policies (licence files, PO documents,
--     deep dive files, portal files) are written against. Step 7 stores the bytes in Netlify Blobs and checks this
--     table, under RLS, before every read or write.
--   * Supabase's default grants (everything on new public tables and functions to anon, authenticated and
--     service_role). The ported migrations assume them and REVOKE where they must; RLS does the rest.
--
-- Rollback: rollback.sql in this folder (only before 003 is applied; later migrations depend on all of this).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Roles are cluster-wide, so each one is created only if missing. 001 already made anon.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- An existing service_role without BYPASSRLS would see nothing under FORCE RLS: an empty app, not an error.
DO $$ BEGIN
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'service_role exists without BYPASSRLS; the worker would see no rows';
  END IF;
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'anon') OR (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'anon and authenticated must not bypass RLS';
  END IF;
END $$;
-- lets the site connection SET LOCAL ROLE to each of them
GRANT anon, authenticated, service_role TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── auth ──────────────────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- The claims of this transaction ({} when none are set). Same body as Supabase's.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
-- The signed-in user's id, or NULL.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'sub', '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;

-- Only what the ported migrations use: the id (portal_approvers' foreign key) and the email (finding a user).
-- No passwords here; Better Auth keeps those in its own tables.
CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY,
  email              citext UNIQUE,
  email_confirmed_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.users FORCE ROW LEVEL SECURITY;
REVOKE ALL ON auth.users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON auth.users TO service_role;
-- the owner keeps one policy so its own writes (and the sync below) work without BYPASSRLS
DROP POLICY IF EXISTS owner_all ON auth.users;
CREATE POLICY owner_all ON auth.users FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

-- Trigger function for Better Auth's "user" table (step 6 attaches it):
--   CREATE TRIGGER trg_auth_users_sync AFTER INSERT OR UPDATE OR DELETE ON "user"
--     FOR EACH ROW EXECUTE FUNCTION auth.sync_better_auth_user();
-- Better Auth is set to use uuid ids and the 8 existing users keep theirs. An id that is not a uuid is refused,
-- so a mismatch fails the sign-up instead of leaving a user that no policy can match.
CREATE OR REPLACE FUNCTION auth.sync_better_auth_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM auth.users WHERE id = OLD."id"::uuid;
    RETURN OLD;
  END IF;
  BEGIN
    v_id := NEW."id"::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Better Auth user id % is not a uuid; set Better Auth to generate uuid ids', NEW."id"
      USING ERRCODE = '22P02';
  END;
  IF TG_OP = 'UPDATE' AND OLD."id" IS DISTINCT FROM NEW."id" THEN
    RAISE EXCEPTION 'a user id cannot change' USING ERRCODE = '23514';
  END IF;
  INSERT INTO auth.users (id, email, email_confirmed_at)
    VALUES (v_id, NEW."email", CASE WHEN NEW."emailVerified" THEN now() END)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    email_confirmed_at = CASE
      WHEN NOT NEW."emailVerified" THEN NULL
      ELSE coalesce(auth.users.email_confirmed_at, EXCLUDED.email_confirmed_at) END,
    updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION auth.sync_better_auth_user() FROM PUBLIC, anon, authenticated, service_role;

-- ── storage (the file index) ──────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  public             boolean DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id  text REFERENCES storage.buckets(id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- The folders of an object name: 'a/b/c.pdf' gives {a,b}. Same as Supabase's.
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
-- Buckets are made by migrations only; a signed-in user acts on objects, and the file policies decide which.
REVOKE ALL ON storage.buckets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON storage.buckets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated, service_role;

-- ── Supabase's default grants on new objects in public ───────────────────────────────────────────
-- Only for objects the migration role creates from here on. 001's service_inquiries keeps its own grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
