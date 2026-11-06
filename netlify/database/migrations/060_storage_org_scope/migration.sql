-- GRE-3742. Licence files and PO documents stay in the staff member's own org.
--
-- 026 (licence_files_staff_all) and 028 (po_documents_staff_read) let ANY active staff user reach the whole
-- bucket: they checked only that app_staff_org() is set. Every table policy already checks
-- org_id = app_staff_org(); these two were the gap (Everest, GRE-3741). Same shape as 031's deepdive_files_staff:
-- the first path segment must be a record the staff member's org owns.
--
--   licence-files  '<customer_id>/...'  the customer must be in the staff org. Reads the customers row, not
--                                       licence_keys, so an upload passes before its licence_keys row exists.
--   po-documents   '<quote_id>/...'     the quote must be in the staff org. Read only, as before.
--
-- Unchanged: licence_files_customer_read (a buyer reads only their own customer folder) and the PO write path
-- (the worker role writes the index; no anon or authenticated write policy). Compares text, not uuid, so a
-- folder that is not a uuid is refused rather than raising. /api/store-file reads and writes the index under
-- these policies (SET LOCAL ROLE authenticated), so it needs no change of its own.
DROP POLICY IF EXISTS licence_files_staff_all ON storage.objects;
CREATE POLICY licence_files_staff_all ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'licence-files'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.customers c WHERE c.org_id = public.app_staff_org())
  )
  WITH CHECK (
    bucket_id = 'licence-files'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.customers c WHERE c.org_id = public.app_staff_org())
  );

DROP POLICY IF EXISTS po_documents_staff_read ON storage.objects;
CREATE POLICY po_documents_staff_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'po-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT q.id::text FROM public.quotes q WHERE q.org_id = public.app_staff_org())
  );
