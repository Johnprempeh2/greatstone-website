-- Port of supabase/migrations/0026_po_documents.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0026_po_documents.sql — let a buyer attach a PO document at checkout.
--
-- Ben (1 Jul): the "Pay by purchase order" method should let a buyer UPLOAD their PO, not only type a PO
-- number. Checkout is reachable by guests, so an anon/customer Storage-INSERT policy would be an abuse vector
-- (anyone could fill the bucket). Instead the buyer's browser sends the file (base64) in the request-quote
-- call, and that edge function — which runs with the SERVICE ROLE — uploads it to a PRIVATE bucket itself.
-- So there is NO buyer-facing write policy; only the service role writes (it bypasses RLS). Staff read the PO
-- from QuotesManager via a short-lived signed URL.
--
-- Apply with the migrations. Idempotent, no secrets. Path convention: '<quote_id>/<filename>'.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS po_document_path TEXT;   -- object path within the 'po-documents' bucket
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS po_document_name TEXT;   -- original filename, for the staff download

-- private bucket, 10 MB ceiling (a PO is small); no public read
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('po-documents', 'po-documents', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

-- Storage RLS: staff of the org may READ (so QuotesManager can mint a signed URL). Deliberately NO
-- INSERT/UPDATE/DELETE policy for anon or authenticated — the only writer is the service-role edge function,
-- which bypasses RLS. This keeps the guest-reachable checkout from being an open upload endpoint.
DROP POLICY IF EXISTS po_documents_staff_read ON storage.objects;
CREATE POLICY po_documents_staff_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'po-documents' AND public.app_staff_org() IS NOT NULL);
