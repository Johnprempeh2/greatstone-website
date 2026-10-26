-- GRE-2679. A staff link makes an existing enquiry visible in the client's activity stream.
ALTER TABLE public.service_inquiries
  ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT;
ALTER TABLE public.front_door_leads
  ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT;
GRANT UPDATE (customer_id) ON public.service_inquiries, public.front_door_leads TO authenticated;

-- Keep the five-argument function for existing triggers. The sixth argument carries
-- the original enquiry time; NULL preserves the existing clock time behaviour.
CREATE FUNCTION public.client_activity_emit(p_org uuid, p_customer uuid, p_kind text,
    p_subject text, p_label text, p_occurred_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_customer IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer AND org_id = p_org) THEN
    RAISE EXCEPTION 'activity client does not belong to tenant';
  END IF;
  PERFORM pg_advisory_xact_lock(2652, 1);
  INSERT INTO public.client_activity_outbox(org_id, organisation_id, kind, subject_id, label, occurred_at)
    VALUES (p_org, p_customer, p_kind, p_subject, p_label, coalesce(p_occurred_at, clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION public.client_activity_emit(uuid,uuid,text,text,text,timestamptz)
  FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_write, gsam_bridge_refund;
CREATE OR REPLACE FUNCTION public.client_activity_emit(p_org uuid, p_customer uuid, p_kind text,
    p_subject text, p_label text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.client_activity_emit(p_org, p_customer, p_kind, p_subject, p_label, NULL);
END $$;

CREATE FUNCTION public.enquiry_client_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'client link cannot be changed';
  END IF;
  IF NEW.customer_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.customer_id IS NULL) THEN
    IF TG_OP = 'UPDATE' AND (current_user <> 'authenticated' OR public.app_staff_org() IS DISTINCT FROM NEW.org_id) THEN
      RAISE EXCEPTION 'staff access required to link enquiry';
    END IF;
    IF TG_TABLE_NAME = 'service_inquiries' THEN
      IF NEW.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'deleted enquiry cannot be linked';
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = NEW.customer_id AND org_id = NEW.org_id) THEN
      RAISE EXCEPTION 'activity client does not belong to tenant';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enquiry_client_link_guard BEFORE INSERT OR UPDATE OF customer_id ON public.service_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.enquiry_client_link_guard();
CREATE TRIGGER front_door_client_link_guard BEFORE INSERT OR UPDATE OF customer_id ON public.front_door_leads
  FOR EACH ROW EXECUTE FUNCTION public.enquiry_client_link_guard();

CREATE FUNCTION public.enquiry_client_link_emit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.customer_id IS NULL) THEN
    IF TG_TABLE_NAME = 'front_door_leads' THEN
      PERFORM public.client_activity_emit(NEW.org_id, NEW.customer_id, 'enquiry.received',
        'front_door_lead:' || NEW.id::text, 'Enquiry received', coalesce(NEW.contact_at, NEW.created_at));
    ELSE
      PERFORM public.client_activity_emit(NEW.org_id, NEW.customer_id, 'enquiry.received',
        'service_inquiry:' || NEW.id::text, 'Enquiry received', NEW.created_at);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enquiry_client_link_emit AFTER INSERT OR UPDATE OF customer_id ON public.service_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.enquiry_client_link_emit();
CREATE TRIGGER front_door_client_link_emit AFTER INSERT OR UPDATE OF customer_id ON public.front_door_leads
  FOR EACH ROW EXECUTE FUNCTION public.enquiry_client_link_emit();
REVOKE ALL ON FUNCTION public.enquiry_client_link_guard(), public.enquiry_client_link_emit()
  FROM PUBLIC, anon, authenticated, service_role, gsam_bridge_read, gsam_bridge_write, gsam_bridge_refund;
