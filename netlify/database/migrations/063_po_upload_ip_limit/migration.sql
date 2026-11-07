-- GRE-3772 (Flint's GRE-1797 follow-up). One IP gets ten PO uploads a day on /api/request-quote. Netlify only.
--
-- A quote may carry a 10 MB PO document, stored in the 'po-documents' blob store before the quote row is written.
-- Nothing limited how many a visitor could send. The enquiry form counts by first-hop IP over a day (001's
-- enquiry_recent_count); this does the same for PO uploads, taken in the visitor's anon transaction before the bytes
-- are stored, so a refused upload stores nothing.
--
--   po_upload_take_slot(ip)  SECURITY DEFINER, search_path pinned. An advisory lock per IP makes check-and-insert
--                            atomic (032's front_door_take_slot shape), so parallel requests cannot pass ten. Every
--                            call deletes rows older than a day, so an IP is kept for a day at most (the enquiry
--                            form keeps its IP for 30). Only this function reads or writes po_upload_rate.
-- Pricing runs as anon for every visitor, so only anon executes it (default privileges also grant authenticated).
-- Re-runnable. Rollback: rollback.sql in this folder.

CREATE TABLE IF NOT EXISTS public.po_upload_rate (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip         text NOT NULL CHECK (length(ip) <= 64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_po_upload_rate_ip ON public.po_upload_rate (ip, created_at);
CREATE INDEX IF NOT EXISTS idx_po_upload_rate_age ON public.po_upload_rate (created_at);
ALTER TABLE public.po_upload_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_upload_rate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.po_upload_rate FROM PUBLIC, anon, authenticated, service_role;
-- No policies: only the owner, through the function below.

CREATE OR REPLACE FUNCTION public.po_upload_take_slot(p_ip text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ip text := left(coalesce(p_ip, ''), 64); v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('po_upload_rate:' || v_ip));
  DELETE FROM public.po_upload_rate WHERE created_at < now() - interval '1 day';
  SELECT count(*) INTO v_count FROM public.po_upload_rate WHERE ip = v_ip;
  IF v_count >= 10 THEN RETURN false; END IF;
  INSERT INTO public.po_upload_rate (ip) VALUES (v_ip);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.po_upload_take_slot(text) FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.po_upload_take_slot(text) TO anon;
