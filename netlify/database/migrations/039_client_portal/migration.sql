-- Port of supabase/migrations/0037_client_portal.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0037 — client portal, phase 1a: data and security (GRE-1255; spec GRE-1227 revision 2, sections 4, 5, 6, 11).
--
-- Tables and one private bucket:
--   portal_documents     one row per VERSION of a document for one client. A version that has been published
--                        is never edited again; a change is a new version in the same series.
--   portal_approvers     who may approve publishing. NO grant and NO policy for any API role: John adds his own
--                        row in the SQL editor at deploy, so no agent, staff owner or migration can make an approver.
--   portal_approvals     append-only. One approval for one document version, bound to its fingerprint. Written
--                        only by portal_approve_and_publish().
--   portal_acceptances   append-only. Written only by portal_accept(), never by a direct insert.
--   portal_receipt_jobs  one email job per acceptance, queued in the same transaction as the acceptance.
--   portal_audit         append-only. Written only by the triggers on the tables above, so no write path can
--                        forget it. Staff read it; clients never do.
--   portal-files         private bucket for designed PDFs, octet-stream only (0029 pattern).
--
-- Lifecycle of a document version:
--   draft ──(staff: status = 'pending_approval')──▶ pending_approval   content frozen, fingerprint computed here
--   pending_approval ──(staff: status = 'draft')──▶ draft              fingerprint dropped; an approval for it is
--                                                                      then useless
--   pending_approval ──portal_approve_and_publish()──▶ published       registered approver, fingerprint match,
--                                                                      one approval per version
--   published ──portal_withdraw() (owner/admin)──▶ withdrawn
--   published ──(next version published)──▶ superseded
-- Published, withdrawn and superseded are set only inside the two functions: they set the transaction-local
-- flag portal.via, which a REST caller cannot set, and the guard trigger refuses those changes without it.
-- Even with the flag, a row becomes published only with an approval row that matches its fingerprint.
--
-- Nobody deletes a document, an approval, an acceptance, a receipt job or an audit row: there is no grant and no
-- policy for it, and a trigger refuses it even for the service role.
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
                    CHECK (status IN ('draft','pending_approval','published','withdrawn','superseded')),
  -- set by the database when the draft is submitted for approval; cleared when it goes back to draft
  content_sha256    text CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_by_kind   text NOT NULL DEFAULT 'staff' CHECK (created_by_kind IN ('agent','staff')),
  created_by        uuid DEFAULT auth.uid(),                        -- auth user id, or agent id
  created_run_id    uuid,                                           -- GS Agentic Manager run, for agents
  published_at      timestamptz,
  withdrawn_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  row_version       integer NOT NULL DEFAULT 1,
  UNIQUE (series, version),
  CHECK ((pdf_path IS NULL) = (pdf_sha256 IS NULL)),
  CHECK (pdf_path IS NULL OR pdf_path LIKE customer_id::text || '/' || id::text || '/_%'),
  CHECK ((status = 'draft') = (content_sha256 IS NULL))
);
CREATE INDEX IF NOT EXISTS portal_documents_customer ON public.portal_documents (customer_id, status);
CREATE INDEX IF NOT EXISTS portal_documents_org ON public.portal_documents (org_id, status);

-- The version fingerprint: SHA-256 over a canonical JSON (jsonb orders its keys) of everything the client is
-- shown or agrees to. Shown to the approver, checked at publish, copied onto every acceptance and receipt.
CREATE OR REPLACE FUNCTION portal_content_hash(d public.portal_documents) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT encode(sha256(convert_to(jsonb_build_object(
      'customer_id', d.customer_id, 'kind', d.kind, 'series', d.series, 'version', d.version,
      'title', d.title, 'summary', d.summary, 'body', d.body, 'demos', d.demos, 'pdf_sha256', d.pdf_sha256,
      'action', d.action, 'confirmation_text', d.confirmation_text,
      'signatory_email', d.signatory_email::text)::text, 'UTF8')), 'hex')
  $$;

-- ── portal_approvers (no API access at all) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.portal_approvers (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  label        text NOT NULL CHECK (length(btrim(label)) > 0),
  added_at     timestamptz NOT NULL DEFAULT now()
);

-- ── portal_approvals (append-only) ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.portal_approvals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  -- one approval per document version: it cannot be used again for this or any other version
  document_id       uuid NOT NULL UNIQUE REFERENCES public.portal_documents(id) ON DELETE RESTRICT,
  content_sha256    text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  approver_user_id  uuid NOT NULL,
  approved_at       timestamptz NOT NULL DEFAULT now(),
  -- link to the GS Agentic Manager approval, for reading only; never checked as authority
  gsam_approval_ref text CHECK (length(gsam_approval_ref) <= 200)
);
CREATE INDEX IF NOT EXISTS portal_approvals_org ON public.portal_approvals (org_id);

ALTER TABLE public.portal_documents
  ADD COLUMN IF NOT EXISTS approval_id uuid UNIQUE REFERENCES public.portal_approvals(id) ON DELETE RESTRICT;

-- ── portal_documents guards ───────────────────────────────────────────────────────────────────

-- New rows are drafts, and a new version stays with the client of its series.
CREATE OR REPLACE FUNCTION portal_documents_before_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid;
BEGIN
  IF NEW.status <> 'draft' OR NEW.content_sha256 IS NOT NULL OR NEW.approval_id IS NOT NULL
     OR NEW.published_at IS NOT NULL OR NEW.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'a portal document starts as a draft; publish it with portal_approve_and_publish()'
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

-- Content is fixed outside draft; the fingerprint is the database's; publishing needs a matching approval.
CREATE OR REPLACE FUNCTION portal_documents_before_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- lifecycle columns: everything else is content
  v_life constant text[] := ARRAY['status','content_sha256','approval_id','published_at','withdrawn_at',
                                  'updated_at','row_version'];
  v_via boolean := coalesce(current_setting('portal.via', true), '') = 'on';
  v_ok  boolean;
BEGIN
  IF (NEW.id, NEW.org_id, NEW.customer_id, NEW.series, NEW.version, NEW.created_by_kind, NEW.created_by,
      NEW.created_run_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.org_id, OLD.customer_id, OLD.series, OLD.version, OLD.created_by_kind,
                       OLD.created_by, OLD.created_run_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a portal document''s client, series, version and author do not change'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'draft' AND (to_jsonb(NEW) - v_life) IS DISTINCT FROM (to_jsonb(OLD) - v_life) THEN
    IF OLD.status = 'pending_approval' THEN
      RAISE EXCEPTION 'a document waiting for approval is frozen; return it to draft to edit it'
        USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'a % portal document is fixed; make a new version instead', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  -- only the two functions move a version past pending_approval, or touch the approval and dates
  IF NOT v_via AND ((NEW.approval_id, NEW.published_at, NEW.withdrawn_at)
                    IS DISTINCT FROM (OLD.approval_id, OLD.published_at, OLD.withdrawn_at)
                    OR NEW.status IN ('published','withdrawn','superseded')
                       AND NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'publishing happens only through portal_approve_and_publish()'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'draft' AND NEW.status = 'pending_approval')
    OR (OLD.status = 'pending_approval' AND NEW.status IN ('draft','published'))
    OR (OLD.status = 'published' AND NEW.status IN ('withdrawn','superseded'))) THEN
    RAISE EXCEPTION 'a portal document cannot go from % to %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  -- the fingerprint is computed here, never taken from the caller
  IF NEW.status = 'draft' THEN
    NEW.content_sha256 := NULL;
  ELSIF OLD.status = 'draft' THEN
    IF NEW.action <> 'none' AND length(btrim(coalesce(NEW.confirmation_text, ''))) = 0 THEN
      RAISE EXCEPTION 'a document that asks for an action needs its confirmation text before approval'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.content_sha256 := portal_content_hash(NEW);
  ELSIF NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 THEN
    RAISE EXCEPTION 'the fingerprint is set by the database' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'published' AND OLD.status <> 'published' THEN
    SELECT EXISTS (SELECT 1 FROM public.portal_approvals a
                     JOIN public.portal_approvers r ON r.auth_user_id = a.approver_user_id
                    WHERE a.id = NEW.approval_id AND a.document_id = NEW.id
                      AND a.content_sha256 = NEW.content_sha256) INTO v_ok;
    IF NOT v_ok OR NEW.content_sha256 IS DISTINCT FROM portal_content_hash(NEW) THEN
      RAISE EXCEPTION 'publishing needs an approval for this exact version' USING ERRCODE = 'check_violation';
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
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  customer_id          uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  document_id          uuid NOT NULL REFERENCES public.portal_documents(id) ON DELETE RESTRICT,
  document_version     integer NOT NULL,
  content_sha256       text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  action               text NOT NULL CHECK (action IN ('accept','agree_in_principle')),
  -- entered by the signer
  signer_name          text NOT NULL CHECK (length(btrim(signer_name)) > 0),
  signer_title         text NOT NULL CHECK (length(btrim(signer_title)) > 0),
  -- verified: customers.name of the signed-in client, and the email from the auth token; never from the form
  account_company_name text NOT NULL CHECK (length(btrim(account_company_name)) > 0),
  signer_email         citext NOT NULL,
  customer_user_id     uuid REFERENCES public.customer_users(id) ON DELETE RESTRICT,
  auth_subject         text NOT NULL,
  confirmation_text    text NOT NULL,
  confirmed            boolean NOT NULL CHECK (confirmed = true),
  accepted_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, auth_subject)                -- one person accepts one version once
);
CREATE INDEX IF NOT EXISTS portal_acceptances_customer ON public.portal_acceptances (customer_id);
CREATE INDEX IF NOT EXISTS portal_acceptances_org ON public.portal_acceptances (org_id);

-- ── portal_receipt_jobs ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.portal_receipt_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  customer_id         uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  -- also the idempotency key the worker sends to Resend
  acceptance_id       uuid NOT NULL UNIQUE REFERENCES public.portal_acceptances(id) ON DELETE RESTRICT,
  status              text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed')),
  attempts            integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  last_error          text CHECK (length(last_error) <= 500),   -- provider message, no personal data
  provider_message_id text,
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_receipt_jobs_due ON public.portal_receipt_jobs (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS portal_receipt_jobs_customer ON public.portal_receipt_jobs (customer_id);

-- Who owns a job does not change, and a sent job is never sent again.
CREATE OR REPLACE FUNCTION portal_receipt_jobs_before_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.id, NEW.org_id, NEW.customer_id, NEW.acceptance_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.org_id, OLD.customer_id, OLD.acceptance_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a receipt job''s acceptance does not change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'queued'  AND NEW.status = 'sending')
    OR (OLD.status = 'sending' AND NEW.status IN ('queued','sent','failed'))
    OR (OLD.status = 'failed'  AND NEW.status = 'queued')) THEN
    RAISE EXCEPTION 'a receipt job cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_receipt_jobs_before_update ON public.portal_receipt_jobs;
CREATE TRIGGER portal_receipt_jobs_before_update BEFORE UPDATE ON public.portal_receipt_jobs
  FOR EACH ROW EXECUTE FUNCTION portal_receipt_jobs_before_update();

-- ── portal_audit (append-only, written by triggers) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.portal_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  at          timestamptz NOT NULL DEFAULT clock_timestamp(),     -- keeps the order inside one transaction
  actor_kind  text NOT NULL CHECK (actor_kind IN ('client','staff','agent','system')),
  actor_id    text,
  run_id      uuid,
  event       text NOT NULL CHECK (event IN ('draft_created','draft_updated','submitted_for_approval',
                                             'returned_to_draft','approved','published','withdrawn','superseded',
                                             'accepted','agreed_in_principle','receipt_queued','receipt_sent',
                                             'receipt_retry','receipt_failed','receipt_requeued')),
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
    v_event := CASE NEW.status WHEN 'pending_approval' THEN 'submitted_for_approval'
                               WHEN 'draft' THEN 'returned_to_draft'
                               ELSE NEW.status END;     -- published, withdrawn, superseded
  ELSE
    v_event := 'draft_updated';
  END IF;
  INSERT INTO public.portal_audit (org_id, customer_id, actor_kind, actor_id, run_id, event, document_id, detail)
  VALUES (NEW.org_id, NEW.customer_id, portal_actor_kind(NEW.created_by_kind),
          coalesce(auth.uid()::text, NEW.created_by::text), NEW.created_run_id, v_event, NEW.id,
          jsonb_build_object('version', NEW.version, 'status', NEW.status)
            || CASE WHEN v_event IN ('submitted_for_approval','published')
                    THEN jsonb_build_object('content_sha256', NEW.content_sha256, 'approval_id', NEW.approval_id)
                    ELSE '{}'::jsonb END);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION portal_approvals_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.portal_audit (org_id, customer_id, actor_kind, actor_id, event, document_id, detail)
  VALUES (NEW.org_id, NEW.customer_id, 'staff', NEW.approver_user_id::text, 'approved', NEW.document_id,
          jsonb_build_object('approval_id', NEW.id, 'content_sha256', NEW.content_sha256,
                             'gsam_approval_ref', NEW.gsam_approval_ref));
  RETURN NULL;
END;
$$;

-- An acceptance is recorded, audited and its receipt email queued in the same transaction: an acceptance
-- without a job cannot exist, whichever path inserted it.
CREATE OR REPLACE FUNCTION portal_acceptances_after_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.portal_audit (org_id, customer_id, actor_kind, actor_id, event, document_id, detail)
  VALUES (NEW.org_id, NEW.customer_id, 'client', NEW.auth_subject,
          CASE NEW.action WHEN 'accept' THEN 'accepted' ELSE 'agreed_in_principle' END, NEW.document_id,
          jsonb_build_object('acceptance_id', NEW.id, 'version', NEW.document_version,
                             'content_sha256', NEW.content_sha256));
  INSERT INTO public.portal_receipt_jobs (org_id, customer_id, acceptance_id)
  VALUES (NEW.org_id, NEW.customer_id, NEW.id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION portal_receipt_jobs_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event    text;
  v_requeue  boolean := coalesce(current_setting('portal.requeue', true), '') = 'on';
  v_document uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'receipt_queued';
  ELSIF v_requeue THEN
    v_event := 'receipt_requeued';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := CASE NEW.status WHEN 'sent' THEN 'receipt_sent'
                               WHEN 'failed' THEN 'receipt_failed'
                               WHEN 'queued' THEN 'receipt_retry'
                               ELSE NULL END;          -- queued → sending is the worker claiming it
  END IF;
  IF v_event IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT a.document_id INTO v_document FROM public.portal_acceptances a WHERE a.id = NEW.acceptance_id;
  INSERT INTO public.portal_audit (org_id, customer_id, actor_kind, actor_id, event, document_id, detail)
  VALUES (NEW.org_id, NEW.customer_id, CASE WHEN v_requeue THEN 'staff' ELSE 'system' END, auth.uid()::text,
          v_event, v_document,
          jsonb_build_object('acceptance_id', NEW.acceptance_id, 'job_id', NEW.id, 'attempts', NEW.attempts));
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
DROP TRIGGER IF EXISTS portal_approvals_audit ON public.portal_approvals;
CREATE TRIGGER portal_approvals_audit AFTER INSERT ON public.portal_approvals
  FOR EACH ROW EXECUTE FUNCTION portal_approvals_audit();
DROP TRIGGER IF EXISTS portal_acceptances_after_insert ON public.portal_acceptances;
CREATE TRIGGER portal_acceptances_after_insert AFTER INSERT ON public.portal_acceptances
  FOR EACH ROW EXECUTE FUNCTION portal_acceptances_after_insert();
DROP TRIGGER IF EXISTS portal_receipt_jobs_audit ON public.portal_receipt_jobs;
CREATE TRIGGER portal_receipt_jobs_audit AFTER INSERT OR UPDATE ON public.portal_receipt_jobs
  FOR EACH ROW EXECUTE FUNCTION portal_receipt_jobs_audit();

DROP TRIGGER IF EXISTS portal_documents_no_delete ON public.portal_documents;
CREATE TRIGGER portal_documents_no_delete BEFORE DELETE ON public.portal_documents
  FOR EACH ROW EXECUTE FUNCTION portal_append_only();
DROP TRIGGER IF EXISTS portal_approvals_append_only ON public.portal_approvals;
CREATE TRIGGER portal_approvals_append_only BEFORE UPDATE OR DELETE ON public.portal_approvals
  FOR EACH ROW EXECUTE FUNCTION portal_append_only();
DROP TRIGGER IF EXISTS portal_acceptances_append_only ON public.portal_acceptances;
CREATE TRIGGER portal_acceptances_append_only BEFORE UPDATE OR DELETE ON public.portal_acceptances
  FOR EACH ROW EXECUTE FUNCTION portal_append_only();
DROP TRIGGER IF EXISTS portal_receipt_jobs_no_delete ON public.portal_receipt_jobs;
CREATE TRIGGER portal_receipt_jobs_no_delete BEFORE DELETE ON public.portal_receipt_jobs
  FOR EACH ROW EXECUTE FUNCTION portal_append_only();
DROP TRIGGER IF EXISTS portal_audit_append_only ON public.portal_audit;
CREATE TRIGGER portal_audit_append_only BEFORE UPDATE OR DELETE ON public.portal_audit
  FOR EACH ROW EXECUTE FUNCTION portal_append_only();

-- ── row-level security ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.portal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_approvers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_approvers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_acceptances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_receipt_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_receipt_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_audit FORCE ROW LEVEL SECURITY;

-- Supabase grants everything on new public tables to anon, authenticated and service_role by default; take it
-- back and give only what the spec's table says.
REVOKE ALL ON public.portal_documents, public.portal_approvers, public.portal_approvals,
              public.portal_acceptances, public.portal_receipt_jobs, public.portal_audit
  FROM anon, authenticated;
-- approvers: no API role at all, not even the service key (it bypasses RLS, so take the grant away too)
REVOKE ALL ON public.portal_approvers FROM service_role;
-- approvals: only portal_approve_and_publish() writes; the service role may read, never write
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.portal_approvals FROM service_role;
-- receipt jobs: the worker (service role) updates them; nobody inserts or deletes directly
REVOKE INSERT, DELETE, TRUNCATE ON public.portal_receipt_jobs FROM service_role;

GRANT SELECT, INSERT, UPDATE ON public.portal_documents TO authenticated;
GRANT SELECT ON public.portal_approvals, public.portal_acceptances, public.portal_audit TO authenticated;
-- clients see the state of their own receipt email, not the provider's error text or message id
GRANT SELECT (id, org_id, customer_id, acceptance_id, status, attempts, next_attempt_at, sent_at,
              created_at, updated_at) ON public.portal_receipt_jobs TO authenticated;

-- portal_documents: staff read all of the org and write drafts (and submit them, or take them back);
-- a client reads its own published ones.
DROP POLICY IF EXISTS staff_read ON public.portal_documents;
CREATE POLICY staff_read ON public.portal_documents FOR SELECT TO authenticated
  USING (org_id = app_staff_org());
DROP POLICY IF EXISTS staff_insert ON public.portal_documents;
CREATE POLICY staff_insert ON public.portal_documents FOR INSERT TO authenticated
  WITH CHECK (org_id = app_staff_org() AND status = 'draft'
              AND customer_id IN (SELECT c.id FROM public.customers c WHERE c.org_id = app_staff_org()));
DROP POLICY IF EXISTS staff_update_draft ON public.portal_documents;
CREATE POLICY staff_update_draft ON public.portal_documents FOR UPDATE TO authenticated
  USING (org_id = app_staff_org() AND status IN ('draft','pending_approval'))
  WITH CHECK (org_id = app_staff_org() AND status IN ('draft','pending_approval'));
DROP POLICY IF EXISTS client_read_published ON public.portal_documents;
CREATE POLICY client_read_published ON public.portal_documents FOR SELECT TO authenticated
  USING (customer_id = app_customer_id() AND status = 'published');

-- portal_approvers: no policy (and no grant above).

-- portal_approvals: staff read; clients have no policy.
DROP POLICY IF EXISTS staff_read ON public.portal_approvals;
CREATE POLICY staff_read ON public.portal_approvals FOR SELECT TO authenticated
  USING (org_id = app_staff_org());

-- portal_acceptances: read only. Inserts come through portal_accept().
DROP POLICY IF EXISTS staff_read ON public.portal_acceptances;
CREATE POLICY staff_read ON public.portal_acceptances FOR SELECT TO authenticated
  USING (org_id = app_staff_org());
DROP POLICY IF EXISTS client_read_own ON public.portal_acceptances;
CREATE POLICY client_read_own ON public.portal_acceptances FOR SELECT TO authenticated
  USING (customer_id = app_customer_id());

-- portal_receipt_jobs: staff read; a client reads its own company's jobs (the columns granted above).
DROP POLICY IF EXISTS staff_read ON public.portal_receipt_jobs;
CREATE POLICY staff_read ON public.portal_receipt_jobs FOR SELECT TO authenticated
  USING (org_id = app_staff_org());
DROP POLICY IF EXISTS client_read_own ON public.portal_receipt_jobs;
CREATE POLICY client_read_own ON public.portal_receipt_jobs FOR SELECT TO authenticated
  USING (customer_id = app_customer_id());

-- portal_audit: staff read; clients have no policy.
DROP POLICY IF EXISTS staff_read ON public.portal_audit;
CREATE POLICY staff_read ON public.portal_audit FOR SELECT TO authenticated
  USING (org_id = app_staff_org());

-- ── functions ─────────────────────────────────────────────────────────────────────────────────

-- A client accepts (or agrees in principle to) a published document of its own company. The company comes
-- from the client account (customers.name), the email from the token, the time from the database: none of
-- them is a parameter. A staff account has no client company, so it can never act here. The receipt job and
-- the audit rows are written by the insert trigger, in this same transaction.
CREATE OR REPLACE FUNCTION portal_accept(p_document_id uuid, p_name text, p_title text, p_confirmed boolean)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer uuid := app_customer_id();
  v_subject  text := auth.uid()::text;
  v_email    citext := nullif(btrim(auth.jwt() ->> 'email'), '')::citext;
  v_doc      public.portal_documents%ROWTYPE;
  v_company  text;
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
  IF length(btrim(coalesce(p_name, ''))) = 0 OR length(btrim(coalesce(p_title, ''))) = 0 THEN
    RAISE EXCEPTION 'name and job title are needed' USING ERRCODE = 'check_violation';
  END IF;
  IF length(p_name) > 200 OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'name and job title are 200 characters at most' USING ERRCODE = 'check_violation';
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
  SELECT c.name INTO v_company FROM public.customers c WHERE c.id = v_customer;
  SELECT cu.id INTO v_cu FROM public.customer_users cu
   WHERE cu.auth_subject = v_subject AND cu.customer_id = v_customer AND cu.deleted_at IS NULL
   LIMIT 1;
  INSERT INTO public.portal_acceptances
    (org_id, customer_id, document_id, document_version, content_sha256, action, signer_name, signer_title,
     account_company_name, signer_email, customer_user_id, auth_subject, confirmation_text, confirmed)
  VALUES
    (v_doc.org_id, v_doc.customer_id, v_doc.id, v_doc.version, v_doc.content_sha256, v_doc.action,
     btrim(p_name), btrim(p_title), v_company, v_email, v_cu, v_subject, v_doc.confirmation_text, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- The registered approver approves one exact version and publishes it, in one call. Checks, in one transaction:
-- the caller (auth.uid(), from the session, never a field) is in portal_approvers and is active staff of the
-- document's org; the document waits for approval; the fingerprint recomputed now equals the stored one and the
-- one the approver was shown; no approval exists yet for this document. The approval row it writes is unique per
-- document, so it can never be used for another version or document. The service key has no auth.uid(), so it
-- cannot publish either. gsam_approval_ref is kept for reading only. Returns the approval id.
CREATE OR REPLACE FUNCTION portal_approve_and_publish(p_document_id uuid, p_expected_sha256 text,
                                                      p_gsam_approval_ref text DEFAULT NULL)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc      public.portal_documents%ROWTYPE;
  v_uid      uuid := auth.uid();
  v_approval uuid;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.portal_approvers r WHERE r.auth_user_id = v_uid) THEN
    RAISE EXCEPTION 'only the registered approver can publish a portal document'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_doc FROM public.portal_documents d WHERE d.id = p_document_id FOR UPDATE;
  IF NOT FOUND OR v_doc.org_id IS DISTINCT FROM app_staff_org() THEN
    RAISE EXCEPTION 'document not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.portal_approvals a WHERE a.document_id = v_doc.id) THEN
    RAISE EXCEPTION 'this version already has an approval; it cannot be approved again'
      USING ERRCODE = 'unique_violation';
  END IF;
  IF v_doc.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'only a document waiting for approval can be published (this one is %)', v_doc.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_expected_sha256 IS NULL OR v_doc.content_sha256 IS DISTINCT FROM lower(btrim(p_expected_sha256))
     OR v_doc.content_sha256 IS DISTINCT FROM portal_content_hash(v_doc) THEN
    RAISE EXCEPTION 'the fingerprint does not match the version waiting for approval'
      USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.portal_approvals (org_id, customer_id, document_id, content_sha256, approver_user_id,
                                       gsam_approval_ref)
  VALUES (v_doc.org_id, v_doc.customer_id, v_doc.id, v_doc.content_sha256, v_uid,
          nullif(btrim(coalesce(p_gsam_approval_ref, '')), ''))
  RETURNING id INTO v_approval;
  PERFORM set_config('portal.via', 'on', true);
  UPDATE public.portal_documents
     SET status = 'superseded'
   WHERE series = v_doc.series AND status = 'published' AND id <> v_doc.id;
  UPDATE public.portal_documents
     SET status = 'published', approval_id = v_approval, published_at = now()
   WHERE id = v_doc.id;
  PERFORM set_config('portal.via', '', true);
  RETURN v_approval;
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

-- Staff "Send again": puts the same job back in the queue, due now, with a fresh set of attempts. The job (and
-- so the idempotency key) stays the same. A job already sent is not sent again.
CREATE OR REPLACE FUNCTION portal_requeue_receipt(p_acceptance_id uuid)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_job public.portal_receipt_jobs%ROWTYPE;
BEGIN
  IF app_staff_org() IS NULL THEN
    RAISE EXCEPTION 'only staff can send a receipt again' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_job FROM public.portal_receipt_jobs j WHERE j.acceptance_id = p_acceptance_id FOR UPDATE;
  IF NOT FOUND OR v_job.org_id <> app_staff_org() THEN
    RAISE EXCEPTION 'receipt not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_job.status NOT IN ('queued','failed') THEN
    RAISE EXCEPTION 'this receipt is % and cannot be queued again', v_job.status USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('portal.requeue', 'on', true);
  UPDATE public.portal_receipt_jobs
     SET status = 'queued', attempts = 0, next_attempt_at = now(), last_error = NULL
   WHERE id = v_job.id;
  PERFORM set_config('portal.requeue', '', true);
END;
$$;

REVOKE ALL ON FUNCTION portal_accept(uuid, text, text, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION portal_approve_and_publish(uuid, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION portal_withdraw(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION portal_requeue_receipt(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION portal_accept(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_approve_and_publish(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_withdraw(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_requeue_receipt(uuid) TO authenticated;
-- internal helpers: not callable over REST
REVOKE ALL ON FUNCTION portal_actor_kind(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION portal_documents_before_insert() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION portal_documents_before_update() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION portal_receipt_jobs_before_update() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION portal_documents_audit() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION portal_approvals_audit() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION portal_acceptances_after_insert() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION portal_receipt_jobs_audit() FROM public, anon, authenticated;

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

-- ── deploy steps for John (not run by this migration; no personal data in the repo) ───────────
-- 1. Register the approver, in the Supabase SQL editor, with John's own staff sign-in:
--      INSERT INTO public.portal_approvers (auth_user_id, label)
--      SELECT id, 'John' FROM auth.users WHERE email = '<John''s staff sign-in email>';
-- 2. After the receipt worker (phase 1b) is deployed, schedule it (pg_cron + pg_net, like 0036):
--      SELECT cron.schedule('portal-receipt-worker', '* * * * *', $$ SELECT net.http_post(...) $$);
