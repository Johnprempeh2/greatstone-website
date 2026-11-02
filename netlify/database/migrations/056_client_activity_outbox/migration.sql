-- GRE-2652. Client activity is written by row triggers in the action's transaction.
-- The client organisation id is customers.id; org_id is the site's internal tenant.
CREATE TABLE public.client_activity_outbox (
  sequence bigint PRIMARY KEY,
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  organisation_id uuid NOT NULL, -- durable source id even if the client row is later removed
  kind text NOT NULL CHECK (kind IN (
    'account.created','interview.invited','interview.started','interview.completed','interview.abandoned',
    'document.requested','document.uploaded','deliverable.published','deliverable.accepted',
    'quote.made','order.made','invoice.issued','invoice.paid','enquiry.received',
    'deep_dive.shared_item_viewed')),
  subject_id text NOT NULL CHECK (subject_id ~ '^[A-Za-z0-9_:-]{1,120}$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120 AND label !~ '[\r\n\t<>]'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX client_activity_outbox_org_sequence ON public.client_activity_outbox(org_id, sequence);
ALTER TABLE public.client_activity_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_activity_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_activity_outbox FROM PUBLIC, anon, authenticated, service_role,
  gsam_bridge_read, gsam_bridge_write, gsam_bridge_refund;
GRANT SELECT (sequence, id, org_id, organisation_id, kind, subject_id, label, occurred_at)
  ON public.client_activity_outbox TO gsam_bridge_read;
CREATE POLICY client_activity_owner ON public.client_activity_outbox FOR ALL TO CURRENT_USER
  USING (true) WITH CHECK (true);
CREATE POLICY client_activity_bridge ON public.client_activity_outbox FOR SELECT TO gsam_bridge_read
  USING (org_id = app_bridge_org());

-- A single locked row allocates the global site sequence inside the action transaction.
-- Its update rolls back with the event, and later emitters wait until commit.
CREATE TABLE public.client_activity_sequence (
  id smallint PRIMARY KEY CHECK (id = 1),
  last_sequence bigint NOT NULL CHECK (last_sequence >= 0)
);
INSERT INTO public.client_activity_sequence(id, last_sequence) VALUES (1, 0);
ALTER TABLE public.client_activity_sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_activity_sequence FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_activity_sequence FROM PUBLIC, anon, authenticated, service_role,
  gsam_bridge_read, gsam_bridge_write, gsam_bridge_refund;
CREATE POLICY client_activity_sequence_owner ON public.client_activity_sequence FOR ALL TO CURRENT_USER
  USING (true) WITH CHECK (true);

CREATE FUNCTION public.client_activity_next_sequence() RETURNS bigint
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sequence bigint;
BEGIN
  UPDATE public.client_activity_sequence SET last_sequence = last_sequence + 1 WHERE id = 1
    RETURNING last_sequence INTO STRICT v_sequence;
  RETURN v_sequence;
END $$;
REVOKE ALL ON FUNCTION public.client_activity_next_sequence() FROM PUBLIC, anon, authenticated,
  service_role, gsam_bridge_read, gsam_bridge_write, gsam_bridge_refund;
ALTER TABLE public.client_activity_outbox ALTER COLUMN sequence SET DEFAULT public.client_activity_next_sequence();

CREATE FUNCTION public.client_activity_no_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'client activity is append-only';
END $$;
CREATE TRIGGER client_activity_no_change BEFORE UPDATE OR DELETE ON public.client_activity_outbox
  FOR EACH ROW EXECUTE FUNCTION public.client_activity_no_change();

CREATE FUNCTION public.client_activity_emit(p_org uuid, p_customer uuid, p_kind text,
    p_subject text, p_label text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_customer IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer AND org_id = p_org) THEN
    RAISE EXCEPTION 'activity client does not belong to tenant';
  END IF;
  INSERT INTO public.client_activity_outbox(org_id, organisation_id, kind, subject_id, label)
    VALUES (p_org, p_customer, p_kind, p_subject, p_label);
END $$;
REVOKE ALL ON FUNCTION public.client_activity_emit(uuid,uuid,text,text,text) FROM PUBLIC, anon,
  authenticated, service_role, gsam_bridge_read, gsam_bridge_write, gsam_bridge_refund;

CREATE FUNCTION public.client_activity_from_customer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.client_activity_emit(NEW.org_id, NEW.id, 'account.created', NEW.id::text, 'Account created');
  RETURN NEW;
END $$;
CREATE TRIGGER client_activity_customer AFTER INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.client_activity_from_customer();

CREATE FUNCTION public.client_activity_from_quote() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.customer_id IS NULL) THEN
    PERFORM public.client_activity_emit(NEW.org_id, NEW.customer_id, 'quote.made', NEW.id::text, 'Quote made');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_activity_quote AFTER INSERT OR UPDATE OF customer_id ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.client_activity_from_quote();

CREATE FUNCTION public.client_activity_from_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.client_activity_emit(NEW.org_id, NEW.customer_id, 'order.made', NEW.id::text, 'Order made');
  ELSIF NEW.customer_id IS NOT NULL AND OLD.customer_id IS NULL THEN
    PERFORM public.client_activity_emit(NEW.org_id, NEW.customer_id, 'order.made', NEW.id::text, 'Order made');
  END IF;
  IF NEW.invoice_number IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.invoice_number IS NULL) THEN
    PERFORM public.client_activity_emit(NEW.org_id, NEW.customer_id, 'invoice.issued', NEW.id::text, 'Invoice issued');
  END IF;
  IF NEW.invoice_number IS NOT NULL AND NEW.paid_by_stripe IS TRUE AND
      (TG_OP = 'INSERT' OR OLD.paid_by_stripe IS DISTINCT FROM TRUE OR OLD.invoice_number IS NULL) THEN
    PERFORM public.client_activity_emit(NEW.org_id, NEW.customer_id, 'invoice.paid', NEW.id::text, 'Invoice paid');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_activity_order AFTER INSERT OR UPDATE OF customer_id, invoice_number, stripe_payment_intent ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.client_activity_from_order();

CREATE FUNCTION public.client_activity_from_document() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pdf_path IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.pdf_path IS NULL) THEN
    PERFORM public.client_activity_emit(NEW.org_id, NEW.customer_id, 'document.uploaded', NEW.id::text, 'Document uploaded');
  END IF;
  IF NEW.kind IN ('north_star','investigation_plan','gdxp') AND NEW.status = 'published'
      AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    PERFORM public.client_activity_emit(NEW.org_id, NEW.customer_id, 'deliverable.published', NEW.id::text, 'Deliverable published');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_activity_document AFTER INSERT OR UPDATE OF pdf_path, status ON public.portal_documents
  FOR EACH ROW EXECUTE FUNCTION public.client_activity_from_document();

CREATE FUNCTION public.client_activity_from_acceptance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.portal_documents d WHERE d.id = NEW.document_id
      AND d.kind IN ('north_star','investigation_plan','gdxp')) THEN
    PERFORM public.client_activity_emit(NEW.org_id, NEW.customer_id, 'deliverable.accepted', NEW.document_id::text,
      'Deliverable accepted');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_activity_acceptance AFTER INSERT ON public.portal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.client_activity_from_acceptance();

CREATE FUNCTION public.client_activity_from_engagement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'deliverable' AND NEW.status = 'shared' AND
      (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'shared') THEN
    PERFORM public.client_activity_emit(NEW.org_id, NEW.customer_id, 'deliverable.published', NEW.id::text,
      'Deliverable published');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_activity_engagement AFTER INSERT OR UPDATE OF status ON public.engagements
  FOR EACH ROW EXECUTE FUNCTION public.client_activity_from_engagement();

-- A GSAM snapshot can add a document request. Diff by opaque request id and status;
-- no title, note or requested document content enters the event.
CREATE FUNCTION public.client_activity_from_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE request jsonb; v_customer uuid;
BEGIN
  SELECT customer_id INTO v_customer FROM public.deep_dive_tenant_links
    WHERE tenant_id = NEW.tenant_id AND org_id = NEW.org_id;
  IF v_customer IS NULL THEN RETURN NEW; END IF;
  FOR request IN SELECT value FROM jsonb_array_elements(NEW.snapshot -> 'documentRequests') LOOP
    IF request ->> 'status' = 'open' AND (TG_OP = 'INSERT' OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(OLD.snapshot -> 'documentRequests') previous
      WHERE previous ->> 'id' = request ->> 'id' AND previous ->> 'status' = 'open')) THEN
      PERFORM public.client_activity_emit(NEW.org_id, v_customer, 'document.requested', request ->> 'id',
        'Document requested');
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER client_activity_snapshot AFTER INSERT OR UPDATE OF snapshot ON public.deep_dive_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.client_activity_from_snapshot();

DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['client_activity_no_change','client_activity_from_customer',
    'client_activity_from_quote','client_activity_from_order','client_activity_from_document',
    'client_activity_from_acceptance','client_activity_from_engagement','client_activity_from_snapshot'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_write, gsam_bridge_refund', name);
  END LOOP;
END $$;
