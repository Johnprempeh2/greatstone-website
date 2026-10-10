-- 0037 — client portal, phase 1a: data and security (GRE-1255; spec GRE-1227 sections 4, 5, 6 and 11).
--
-- Three tables and one private bucket:
--   portal_documents    one row per VERSION of a document for one client. A version that has been published
--                       is never edited again; a change is a new version in the same series.
--   portal_acceptances  append-only. Written only by portal_accept(), never by a direct insert.
--   portal_audit        append-only. Written only by the triggers on the two tables above, so no write path
--                       can forget it. Staff read it; clients never do.
--   portal-files        private bucket for designed PDFs, octet-stream only (0029 pattern).
--
-- Who may do what (the database enforces it, not only the app):
--   client (app_customer_id() = the row's customer)  reads PUBLISHED documents of its own company and its own
--                                                     company's acceptances; accepts through portal_accept().
--   staff  (org_id = app_staff_org())                 reads everything of the org; inserts and edits DRAFTS.
--   owner  (staff role 'owner')                       publishes through portal_publish(); a publish records
--                                                     the approval (owner's id + approval reference + time).
--   owner or admin                                    withdraws a published version through portal_withdraw().
-- Nobody deletes a document, an acceptance or an audit row: there is no grant and no policy for it, and a
-- trigger refuses it even for the service role.
--
-- Status and the approval and publish columns change only inside portal_publish() / portal_withdraw(): they
-- set the transaction-local flag portal.via, which a REST caller cannot set, and the guard trigger refuses a
-- change to those columns without it.
--
-- Re-runnable. Rollback: supabase/rollback/0037_client_portal_down.sql.

-- ── portal_documents ──────────────────────────────────────────────────────────────────────────

-- Demo links: a list of { label, url, note, afterSection } with an https:// url (the safe-url.js rule,
-- tightened to https only, as the spec asks).
CREATE OR REPLACE FUNCTION portal_demos_valid(p jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT jsonb_typeof(p) = 'array' AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p) d
       WHERE jsonb_typeof(d) <> 'object'
          OR jsonb_typeof(d -> 'url') IS DISTINCT FROM 'string'
          OR (d ->> 'url') !~ '^https://[^\s/]+'
          OR length(btrim(coalesce(d ->> 'label', ''))) = 0)
  $$;

CREATE TABLE IF NOT EXISTS public.portal_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL DEFAULT app_staff_org() REFERENCES public.organisations(id) ON DELETE RESTRICT,
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  kind              text NOT NULL CHECK (kind IN ('engagement_pack','nda','gita','terms','pre_read',
                                                 'north_star','investigation_plan','gdxp')),
  -- versions of one document share a series; version is filled in (next in the series) when left empty
  series            uuid NOT NULL DEFAULT gen_random_uuid(),
  version           integer CHECK (version > 0),
  title             text NOT NULL CHECK (length(btrim(title)) > 0),
  summary           text NOT NULL DEFAULT '',
  -- { sections: [{ id, title, html }] }; html is sanitised on write (edge function) and again on render
  body              jsonb NOT NULL DEFAULT '{"sections":[]}'::jsonb
                    CHECK (jsonb_typeof(body) = 'object' AND jsonb_typeof(body -> 'sections') = 'array'),
  demos             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (portal_demos_valid(demos)),
  -- optional designed PDF in portal-files at <customer_id>/<document_id>/<file>; its hash is part of the
  -- fingerprint, so the two come together
  pdf_path          text,
  pdf_sha256        text CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  action            text NOT NULL DEFAULT 'none' CHECK (action IN ('none','accept','agree_in_principle')),
  -- the exact sentence the checkbox shows, copied from Harbor's approved wording when the version is made
  confirmation_text text,
  signatory_email   citext,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','published','withdrawn','superseded')),
  content_sha256    text CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),   -- set by portal_publish()
  created_by_kind   text NOT NULL DEFAULT 'staff' CHECK (created_by_kind IN ('agent','staff')),
  created_by        uuid DEFAULT auth.uid(),                        -- auth user id, or agent id
  created_run_id    uuid,                                           -- GS Agentic Manager run, for agents
  approved_by       uuid,
  approval_ref      text,
  approved_at       timestamptz,
  published_at      timestamptz,
  withdrawn_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  row_version       integer NOT NULL DEFAULT 1,
  UNIQUE (series, version),
  CHECK ((pdf_path IS NULL) = (pdf_sha256 IS NULL)),
  CHECK (pdf_path IS NULL OR pdf_path LIKE customer_id::text || '/' || id::text || '/_%')
);
CREATE INDEX IF NOT EXISTS portal_documents_customer ON public.portal_documents (customer_id, status);
CREATE INDEX IF NOT EXISTS portal_documents_org ON public.portal_documents (org_id, status);

-- The fingerprint shown on the receipt: title, body, demos, PDF hash and confirmation text.
CREATE OR REPLACE FUNCTION portal_content_sha256(d public.portal_documents) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT encode(sha256(convert_to(jsonb_build_object(
      'title', d.title, 'body', d.body, 'demos', d.demos,
      'pdf_sha256', d.pdf_sha256, 'confirmation_text', d.confirmation_text)::text, 'UTF8')), 'hex')
  $$;

-- New rows are drafts, and a new version stays with the client of its series.
CREATE OR REPLACE FUNCTION portal_documents_before_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid;
BEGIN
  IF NEW.status <> 'draft' OR NEW.content_sha256 IS NOT NULL OR NEW.approved_by IS NOT NULL
     OR NEW.approval_ref IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.published_at IS NOT NULL
     OR NEW.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'a portal document starts as a draft; publish it with portal_publish()'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT d.customer_id INTO v_customer FROM public.portal_documents d WHERE d.series = NEW.series LIMIT 1;
  IF FOUND AND v_customer <> NEW.customer_id THEN
    RAISE EXCEPTION 'a new version must be for the same client as its series' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version IS NULL THEN
    SELECT coalesce(max(d.version), 0) + 1 INTO NEW.version FROM public.portal_documents d WHERE d.series = NEW.series;
  END IF;
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.row_version := 1;
  RETURN NEW;
END;
$$;

-- No edit after publish; status and approval columns only through the functions; no publish without approval.
CREATE OR REPLACE FUNCTION portal_documents_before_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- lifecycle columns: owned by portal_publish() / portal_withdraw()
  v_life constant text[] := ARRAY['status','content_sha256','approved_by','approval_ref','approved_at',
                                  'published_at','withdrawn_at','updated_at','row_version'];
  v_via boolean := coalesce(current_setting('portal.via', true), '') = 'on';
BEGIN
  IF (NEW.id, NEW.org_id, NEW.customer_id, NEW.series, NEW.version, NEW.created_by_kind, NEW.created_by,
      NEW.created_run_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.org_id, OLD.customer_id, OLD.series, OLD.version, OLD.created_by_kind,
                       OLD.created_by, OLD.created_run_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a portal document''s client, series, version and author do not change'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'draft' AND (to_jsonb(NEW) - v_life) IS DISTINCT FROM (to_jsonb(OLD) - v_life) THEN
    RAISE EXCEPTION 'a % portal document is fixed; make a new version instead', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT v_via AND (NEW.status, NEW.content_sha256, NEW.approved_by, NEW.approval_ref, NEW.approved_at,
                    NEW.published_at, NEW.withdrawn_at)
               IS DISTINCT FROM (OLD.status, OLD.content_sha256, OLD.approved_by, OLD.approval_ref,
                                 OLD.approved_at, OLD.published_at, OLD.withdrawn_at) THEN
    RAISE EXCEPTION 'status and approval change only through portal_publish() or portal_withdraw()'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status IN ('draft','approved') AND NEW.status IN ('approved','published'))
    OR (OLD.status = 'published' AND NEW.status IN ('withdrawn','superseded'))) THEN
    RAISE EXCEPTION 'a portal document cannot go from % to %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'published' AND OLD.status <> 'published' THEN
    IF NEW.approved_by IS NULL OR length(btrim(coalesce(NEW.approval_ref, ''))) = 0 OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'publishing needs a recorded approval (approved_by, approval_ref, approved_at)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.action <> 'none' AND length(btrim(coalesce(NEW.confirmation_text, ''))) = 0 THEN
      RAISE EXCEPTION 'a document that asks for an action needs its confirmation text before publishing'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.content_sha256 IS DISTINCT FROM portal_content_sha256(NEW) THEN
      RAISE EXCEPTION 'publishing needs the content fingerprint' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_documents_before_insert ON public.portal_documents;
CREATE TRIGGER portal_documents_before_insert BEFORE INSERT ON public.portal_documents
  FOR EACH ROW EXECUTE FUNCTION portal_documents_before_insert();
DROP TRIGGER IF EXISTS portal_documents_before_update ON public.portal_documents;
CREATE TRIGGER portal_documents_before_update BEFORE UPDATE ON public.portal_documents
  FOR EACH ROW EXECUTE FUNCTION portal_documents_before_update();

-- ── portal_acceptances (append-only) ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.portal_acceptances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  document_id       uuid NOT NULL REFERENCES public.portal_documents(id) ON DELETE RESTRICT,
  document_version  integer NOT NULL,
  content_sha256    text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  action            text NOT NULL CHECK (action IN ('accept','agree_in_principle')),
  signer_name       text NOT NULL CHECK (length(btrim(signer_name)) > 0),
  signer_title      text NOT NULL CHECK (length(btrim(signer_title)) > 0),
  signer_company    text NOT NULL CHECK (length(btrim(signer_company)) > 0),
  signer_email      citext NOT NULL,               -- from the auth token, never from the form
  customer_user_id  uuid REFERENCES public.customer_users(id) ON DELETE RESTRICT,
  auth_subject      text NOT NULL,
  confirmation_text text NOT NULL,
  confirmed         boolean NOT NULL CHECK (confirmed = true),
  accepted_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, auth_subject)                -- one person accepts one version once
);
CREATE INDEX IF NOT EXISTS portal_acceptances_customer ON public.portal_acceptances (customer_id);
CREATE INDEX IF NOT EXISTS portal_acceptances_org ON public.portal_acceptances (org_id);

-- ── portal_audit (append-only, written by triggers) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.portal_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_kind  text NOT NULL CHECK (actor_kind IN ('client','staff','agent','system')),
  actor_id    text,
  run_id      uuid,
  event       text NOT NULL CHECK (event IN ('draft_created','draft_updated','approved','published','withdrawn',
                                             'superseded','accepted','agreed_in_principle','receipt_sent',
                                             'receipt_failed')),
  document_id uuid REFERENCES public.portal_documents(id) ON DELETE RESTRICT,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS portal_audit_document ON public.portal_audit (document_id, at);
CREATE INDEX IF NOT EXISTS portal_audit_org ON public.portal_audit (org_id, at);

-- Who is acting, for the audit row.
CREATE OR REPLACE FUNCTION portal_actor_kind(p_created_by_kind text DEFAULT NULL) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE WHEN app_staff_org() IS NOT NULL THEN 'staff'
                WHEN app_customer_id() IS NOT NULL THEN 'client'
                WHEN p_created_by_kind = 'agent' THEN 'agent'
                ELSE 'system' END
  $$;

CREATE OR REPLACE FUNCTION portal_documents_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'draft_created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := NEW.status;                      -- approved, published, withdrawn, superseded
  ELSE
    v_event := 'draft_updated';
  END IF;
  INSERT INTO public.portal_audit (org_id, customer_id, actor_kind, actor_id, run_id, event, document_id, detail)
  VALUES (NEW.org_id, NEW.customer_id, portal_actor_kind(NEW.created_by_kind),
          coalesce(auth.uid()::text, NEW.created_by::text), NEW.created_run_id, v_event, NEW.id,
          jsonb_build_object('version', NEW.version, 'status', NEW.status)
            || CASE WHEN v_event = 'published'
                    THEN jsonb_build_object('approval_ref', NEW.approval_ref, 'content_sha256', NEW.content_sha256)
                    ELSE '{}'::jsonb END);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION portal_acceptances_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.portal_audit (org_id, customer_id, actor_kind, actor_id, event, document_id, detail)
  VALUES (NEW.org_id, NEW.customer_id, 'client', NEW.auth_subject,
          CASE NEW.action WHEN 'accept' THEN 'accepted' ELSE 'agreed_in_principle' END, NEW.document_id,
          jsonb_build_object('acceptance_id', NEW.id, 'version', NEW.document_version,
                             'content_sha256', NEW.content_sha256));
  RETURN NULL;
END;
$$;

-- Append-only, for every role including the service role.
CREATE OR REPLACE FUNCTION portal_append_only() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS portal_documents_audit ON public.portal_documents;
CREATE TRIGGER portal_documents_audit AFTER INSERT OR UPDATE ON public.portal_documents
  FOR EACH ROW EXECUTE FUNCTION portal_documents_audit();
DROP TRIGGER IF EXISTS portal_acceptances_audit ON public.portal_acceptances;
CREATE TRIGGER portal_acceptances_audit AFTER INSERT ON public.portal_acceptances
  FOR EACH ROW EXECUTE FUNCTION portal_acceptances_audit();
DROP TRIGGER IF EXISTS portal_documents_no_delete ON public.portal_documents;
CREATE TRIGGER portal_documents_no_delete BEFORE DELETE ON public.portal_documents
  FOR EACH ROW EXECUTE FUNCTION portal_append_only();
DROP TRIGGER IF EXISTS portal_acceptances_append_only ON public.portal_acceptances;
CREATE TRIGGER portal_acceptances_append_only BEFORE UPDATE OR DELETE ON public.portal_acceptances
  FOR EACH ROW EXECUTE FUNCTION portal_append_only();
DROP TRIGGER IF EXISTS portal_audit_append_only ON public.portal_audit;
CREATE TRIGGER portal_audit_append_only BEFORE UPDATE OR DELETE ON public.portal_audit
  FOR EACH ROW EXECUTE FUNCTION portal_append_only();

-- ── row-level security ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.portal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_acceptances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_audit FORCE ROW LEVEL SECURITY;

-- Supabase grants everything on new public tables to anon and authenticated by default; take it all back and
-- give only what the table above says.
REVOKE ALL ON public.portal_documents, public.portal_acceptances, public.portal_audit FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.portal_documents TO authenticated;
GRANT SELECT ON public.portal_acceptances, public.portal_audit TO authenticated;

-- portal_documents: staff read all of the org and write drafts; a client reads its own published ones.
DROP POLICY IF EXISTS staff_read ON public.portal_documents;
CREATE POLICY staff_read ON public.portal_documents FOR SELECT TO authenticated
  USING (org_id = app_staff_org());
DROP POLICY IF EXISTS staff_insert ON public.portal_documents;
CREATE POLICY staff_insert ON public.portal_documents FOR INSERT TO authenticated
  WITH CHECK (org_id = app_staff_org() AND status = 'draft'
              AND customer_id IN (SELECT c.id FROM public.customers c WHERE c.org_id = app_staff_org()));
DROP POLICY IF EXISTS staff_update_draft ON public.portal_documents;
CREATE POLICY staff_update_draft ON public.portal_documents FOR UPDATE TO authenticated
  USING (org_id = app_staff_org() AND status = 'draft')
  WITH CHECK (org_id = app_staff_org() AND status = 'draft');
DROP POLICY IF EXISTS client_read_published ON public.portal_documents;
CREATE POLICY client_read_published ON public.portal_documents FOR SELECT TO authenticated
  USING (customer_id = app_customer_id() AND status = 'published');

-- portal_acceptances: read only. Inserts come through portal_accept().
DROP POLICY IF EXISTS staff_read ON public.portal_acceptances;
CREATE POLICY staff_read ON public.portal_acceptances FOR SELECT TO authenticated
  USING (org_id = app_staff_org());
DROP POLICY IF EXISTS client_read_own ON public.portal_acceptances;
CREATE POLICY client_read_own ON public.portal_acceptances FOR SELECT TO authenticated
  USING (customer_id = app_customer_id());

-- portal_audit: staff read; clients have no policy.
DROP POLICY IF EXISTS staff_read ON public.portal_audit;
CREATE POLICY staff_read ON public.portal_audit FOR SELECT TO authenticated
  USING (org_id = app_staff_org());

-- ── functions ─────────────────────────────────────────────────────────────────────────────────

-- A client accepts (or agrees in principle to) a published document of its own company. The email comes from
-- the token, the time from the database. A staff account has no client company, so it can never act here.
CREATE OR REPLACE FUNCTION portal_accept(p_document_id uuid, p_name text, p_title text, p_company text,
                                         p_confirmed boolean)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer uuid := app_customer_id();
  v_subject  text := auth.uid()::text;
  v_email    citext := nullif(btrim(auth.jwt() ->> 'email'), '')::citext;
  v_doc      public.portal_documents%ROWTYPE;
  v_cu       uuid;
  v_id       uuid;
BEGIN
  IF v_customer IS NULL OR v_subject IS NULL THEN
    RAISE EXCEPTION 'only a signed-in client can accept a document' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_doc FROM public.portal_documents d WHERE d.id = p_document_id FOR SHARE;
  -- the same answer for "not yours", "not published" and "does not exist": nothing leaks across clients
  IF NOT FOUND OR v_doc.customer_id <> v_customer OR v_doc.status <> 'published' THEN
    RAISE EXCEPTION 'document not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_doc.action = 'none' THEN
    RAISE EXCEPTION 'this document does not ask for an acceptance' USING ERRCODE = 'check_violation';
  END IF;
  IF p_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'the confirmation box must be ticked' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(p_name, ''))) = 0 OR length(btrim(coalesce(p_title, ''))) = 0
     OR length(btrim(coalesce(p_company, ''))) = 0 THEN
    RAISE EXCEPTION 'name, job title and company are needed' USING ERRCODE = 'check_violation';
  END IF;
  IF length(p_name) > 200 OR length(p_title) > 200 OR length(p_company) > 200 THEN
    RAISE EXCEPTION 'name, job title and company are 200 characters at most' USING ERRCODE = 'check_violation';
  END IF;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'the signed-in account has no email' USING ERRCODE = 'check_violation';
  END IF;
  IF v_doc.signatory_email IS NOT NULL AND v_doc.signatory_email <> v_email THEN
    RAISE EXCEPTION 'this document is for its named signatory to accept' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.portal_acceptances a
              WHERE a.document_id = v_doc.id AND a.auth_subject = v_subject) THEN
    RAISE EXCEPTION 'already accepted' USING ERRCODE = 'unique_violation';
  END IF;
  SELECT cu.id INTO v_cu FROM public.customer_users cu
   WHERE cu.auth_subject = v_subject AND cu.customer_id = v_customer AND cu.deleted_at IS NULL
   LIMIT 1;
  INSERT INTO public.portal_acceptances
    (org_id, customer_id, document_id, document_version, content_sha256, action, signer_name, signer_title,
     signer_company, signer_email, customer_user_id, auth_subject, confirmation_text, confirmed)
  VALUES
    (v_doc.org_id, v_doc.customer_id, v_doc.id, v_doc.version, v_doc.content_sha256, v_doc.action,
     btrim(p_name), btrim(p_title), btrim(p_company), v_email, v_cu, v_subject, v_doc.confirmation_text, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- The owner publishes a draft and records the approval: their user id, the approval reference (typed, or the
-- GS Agentic Manager approval id) and the time. An earlier published version of the same series becomes
-- superseded. Returns the content fingerprint.
CREATE OR REPLACE FUNCTION portal_publish(p_document_id uuid, p_approval_ref text)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.portal_documents%ROWTYPE;
  v_uid uuid := auth.uid();
  v_sha text;
BEGIN
  SELECT * INTO v_doc FROM public.portal_documents d WHERE d.id = p_document_id FOR UPDATE;
  IF NOT FOUND OR v_uid IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.users u
        WHERE u.auth_subject = v_uid::text AND u.org_id = v_doc.org_id AND u.role = 'owner'
          AND u.is_active AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'only the owner can publish a portal document' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF length(btrim(coalesce(p_approval_ref, ''))) = 0 THEN
    RAISE EXCEPTION 'publishing needs an approval reference' USING ERRCODE = 'check_violation';
  END IF;
  IF v_doc.status NOT IN ('draft','approved') THEN
    RAISE EXCEPTION 'only a draft can be published (this one is %)', v_doc.status USING ERRCODE = 'check_violation';
  END IF;
  v_sha := portal_content_sha256(v_doc);
  PERFORM set_config('portal.via', 'on', true);
  UPDATE public.portal_documents
     SET status = 'superseded'
   WHERE series = v_doc.series AND status = 'published' AND id <> v_doc.id;
  UPDATE public.portal_documents
     SET status = 'published', approved_by = v_uid, approval_ref = btrim(p_approval_ref),
         approved_at = now(), published_at = now(), content_sha256 = v_sha
   WHERE id = v_doc.id;
  PERFORM set_config('portal.via', '', true);
  RETURN v_sha;
END;
$$;

-- Owner or admin hides a published version from the client. Nothing is deleted; acceptances stay.
CREATE OR REPLACE FUNCTION portal_withdraw(p_document_id uuid)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.portal_documents%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_doc FROM public.portal_documents d WHERE d.id = p_document_id FOR UPDATE;
  IF NOT FOUND OR v_uid IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.users u
        WHERE u.auth_subject = v_uid::text AND u.org_id = v_doc.org_id AND u.role IN ('owner','admin')
          AND u.is_active AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'only an owner or admin can withdraw a portal document' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_doc.status <> 'published' THEN
    RAISE EXCEPTION 'only a published document can be withdrawn' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('portal.via', 'on', true);
  UPDATE public.portal_documents SET status = 'withdrawn', withdrawn_at = now() WHERE id = v_doc.id;
  PERFORM set_config('portal.via', '', true);
END;
$$;

REVOKE ALL ON FUNCTION portal_accept(uuid, text, text, text, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION portal_publish(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION portal_withdraw(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION portal_accept(uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_publish(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_withdraw(uuid) TO authenticated;
-- internal helpers: not callable over REST
REVOKE ALL ON FUNCTION portal_actor_kind(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION portal_documents_before_insert() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION portal_documents_before_update() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION portal_documents_audit() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION portal_acceptances_audit() FROM public, anon, authenticated;

-- ── the bytes ─────────────────────────────────────────────────────────────────────────────────
-- PRIVATE, octet-stream only (see 0029 for why). Path <customer_id>/<document_id>/<file>. Staff of the org
-- read any of their clients' files and write only under a DRAFT document of the client named in the path.
-- Clients get no policy: they read through a short-lived signed URL from an edge function after the same
-- checks as RLS (phase 1b).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('portal-files', 'portal-files', false, 26214400, ARRAY['application/octet-stream'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 26214400, allowed_mime_types = ARRAY['application/octet-stream'];

DROP POLICY IF EXISTS portal_files_staff_read ON storage.objects;
CREATE POLICY portal_files_staff_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'portal-files'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.customers c WHERE c.org_id = app_staff_org())
  );
DROP POLICY IF EXISTS portal_files_staff_write ON storage.objects;
CREATE POLICY portal_files_staff_write ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'portal-files'
    AND EXISTS (SELECT 1 FROM public.portal_documents d
                 WHERE d.org_id = app_staff_org() AND d.status = 'draft'
                   AND d.customer_id::text = (storage.foldername(name))[1]
                   AND d.id::text = (storage.foldername(name))[2])
  )
  WITH CHECK (
    bucket_id = 'portal-files'
    AND EXISTS (SELECT 1 FROM public.portal_documents d
                 WHERE d.org_id = app_staff_org() AND d.status = 'draft'
                   AND d.customer_id::text = (storage.foldername(name))[1]
                   AND d.id::text = (storage.foldername(name))[2])
  );
