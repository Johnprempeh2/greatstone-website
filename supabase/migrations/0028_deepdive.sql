-- 0028 — the Deep Dive record (Operating Standard 4.10).
--
-- Until now the record lived in one JSON file per client on one laptop, outside git, with no second
-- copy and no way for a colleague to open it. These tables are where it actually lives.
--
-- ⚠⚠ STAFF ONLY, AND DELIBERATELY SO. THERE IS NO CLIENT POLICY IN THIS MIGRATION.
-- The plan is ONE jsonb document holding internal and shared items together, and RLS is ROW level.
-- A client permitted to select their own row would receive the WHOLE document, every internal item
-- included. Per-item visibility lives in deepdive_item_state and cannot redact a column. So a
-- client-facing read is not a policy, it is a SECURITY DEFINER function that returns the plan with
-- everything not marked `shared` stripped out, and that is separate work. Adding a
-- "customers can read their own row" policy here would look like access control and would be a leak.
-- Admin-first is the decision on record: Greatstone works the investigation, and publishes
-- deliberately.

CREATE EXTENSION IF NOT EXISTS citext;

-- ── the plan: what the investigation IS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deepdive_plans (
  slug         citext PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  plan         jsonb NOT NULL,
  -- GENERATED, never written by the app. The register reads these three columns, and a register
  -- that can disagree with the record it describes is exactly the bug this build already hit once
  -- with index.json: a cache two writers were supposed to maintain and only one did.
  client       text GENERATED ALWAYS AS (plan->'engagement'->>'client') STORED,
  title        text GENERATED ALWAYS AS (plan->'engagement'->>'title')  STORED,
  stage        text GENERATED ALWAYS AS (plan->'engagement'->>'stage')  STORED,
  -- coverage counts, which mix the plan with per-item state, so they cannot be generated from the
  -- plan alone. Nullable on purpose: the portal falls back to computing them.
  summary      jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_version  integer NOT NULL DEFAULT 1,   -- optimistic concurrency; the app writes .eq(row_version)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid
);
CREATE INDEX IF NOT EXISTS deepdive_plans_org ON public.deepdive_plans (org_id);
CREATE INDEX IF NOT EXISTS deepdive_plans_customer ON public.deepdive_plans (customer_id);

-- ── item state: where each item has GOT TO, and whether the client sees it ────────────────────
CREATE TABLE IF NOT EXISTS public.deepdive_item_state (
  slug        citext NOT NULL REFERENCES public.deepdive_plans(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  item_id     text NOT NULL,
  org_id      uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'open'     CHECK (status IN ('open','active','done','blocked')),
  -- Internal is the default in the schema as well as in the app, so nothing reaches a client by
  -- omission, a forgotten column default, or a row inserted by something other than the portal.
  visibility  text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','shared')),
  note        text NOT NULL DEFAULT '',
  agreement   jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  PRIMARY KEY (slug, item_id)
);
CREATE INDEX IF NOT EXISTS deepdive_item_state_org ON public.deepdive_item_state (org_id);

-- ── findings: what an agent or a practitioner proposed, and what was validated ────────────────
CREATE TABLE IF NOT EXISTS public.deepdive_findings (
  slug         citext NOT NULL REFERENCES public.deepdive_plans(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  id           text NOT NULL,
  org_id       uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  question_id  text,
  session_id   text,
  text         text NOT NULL DEFAULT '',
  source       text NOT NULL DEFAULT '',
  source_id    text,
  confidence   text,
  state        text,
  supersedes   text,
  by           text CHECK (by IN ('portal','mcp')),
  at           timestamptz,
  validated_at timestamptz,
  note         text NOT NULL DEFAULT '',
  PRIMARY KEY (slug, id)
);
CREATE INDEX IF NOT EXISTS deepdive_findings_org ON public.deepdive_findings (org_id);

-- ── the trail: every change, and whose hand made it ──────────────────────────────────────────
-- ⚠ THIS TABLE IS THE REASON THE MIGRATION HAS FOUR TABLES AND NOT TWO.
-- The Supabase read path in deepdive-state.mjs returns `log: []`, and the write path never sends the
-- log anywhere. So moving to Supabase WITHOUT this would have silently emptied the History tab: the
-- record would look healthy and would have forgotten who did what. The trail names the hand, and a
-- trail that only survives in memory is not a trail.
CREATE TABLE IF NOT EXISTS public.deepdive_log (
  id          bigserial PRIMARY KEY,
  slug        citext NOT NULL REFERENCES public.deepdive_plans(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  at          timestamptz NOT NULL DEFAULT now(),
  item_id     text,
  label       text,
  -- `by` says which WRITER made the change (the portal, or an MCP session). `actor` says which
  -- HAND: the signed-in person as the portal knew them at the time. Storing only a user id would
  -- make the trail depend on that row still existing and still being named the same, and a trail
  -- that has to go and look somebody up is one that can quietly stop naming them. A null actor is
  -- honest and renders as unattributed; it is never guessed.
  by          text,
  actor       jsonb,
  by_user_id  uuid,
  finding_id  text,
  changed     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS deepdive_log_slug_at ON public.deepdive_log (slug, at DESC);
CREATE INDEX IF NOT EXISTS deepdive_log_org ON public.deepdive_log (org_id);

-- ── row-level security: staff of the owning org, and nobody else ─────────────────────────────
-- Same shape as 0004's staff_all, using the same app_staff_org() helper, so there is one definition
-- of "staff" in this database rather than a second one that can drift from it.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['deepdive_plans','deepdive_item_state','deepdive_findings','deepdive_log']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_all ON public.%I', t);
    EXECUTE format('CREATE POLICY staff_all ON public.%I FOR ALL TO authenticated USING (org_id = app_staff_org()) WITH CHECK (org_id = app_staff_org())', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.deepdive_log_id_seq TO authenticated;

-- updated_at maintained by the database, so a client that forgets to send it cannot lie about when
-- the record last moved.
-- search_path pinned: a mutable one is a resolution the caller can influence, and the database
-- linter flags it. Everything this function touches is in public.
CREATE OR REPLACE FUNCTION public.deepdive_touch() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS deepdive_plans_touch ON public.deepdive_plans;
CREATE TRIGGER deepdive_plans_touch BEFORE UPDATE ON public.deepdive_plans
  FOR EACH ROW EXECUTE FUNCTION public.deepdive_touch();
DROP TRIGGER IF EXISTS deepdive_item_state_touch ON public.deepdive_item_state;
CREATE TRIGGER deepdive_item_state_touch BEFORE UPDATE ON public.deepdive_item_state
  FOR EACH ROW EXECUTE FUNCTION public.deepdive_touch();

-- ── added after the first apply, because the write path was never tested ──────────────────────
-- ⚠ org_id WAS NOT NULL WITH NO DEFAULT, AND NO CLIENT WRITE PATH SENT IT.
-- Every status, visibility and note save was refused — not by the not-null constraint but by RLS,
-- since `org_id = app_staff_org()` is never true when org_id is NULL. 42501 is in the app's
-- isAbsentOrForbidden list, so the refusal read as "the table is not there yet" and the write fell
-- through to the practitioner's own localStorage. It reported saved. Nobody else ever saw it.
--
-- The lesson is in the shape of the mistake: the RLS was verified by proving the WRONG people
-- cannot read. Nobody proved the RIGHT people can write.
--
-- Patching the call sites would leave the next one to be found later. The org a row belongs to is
-- not a client's decision: it is whoever is signed in, which the database already knows. So it
-- becomes the default, and the RLS WITH CHECK confirms what the default filled in. A caller cannot
-- misfile a row, and a non-staff caller gets NULL and is refused.
ALTER TABLE public.deepdive_plans      ALTER COLUMN org_id SET DEFAULT app_staff_org();
ALTER TABLE public.deepdive_item_state ALTER COLUMN org_id SET DEFAULT app_staff_org();
ALTER TABLE public.deepdive_findings   ALTER COLUMN org_id SET DEFAULT app_staff_org();
ALTER TABLE public.deepdive_log        ALTER COLUMN org_id SET DEFAULT app_staff_org();
