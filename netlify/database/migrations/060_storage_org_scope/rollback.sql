-- Rollback for 060_storage_org_scope: back to 026 and 028's bucket-wide staff policies.
DROP POLICY IF EXISTS licence_files_staff_all ON storage.objects;
CREATE POLICY licence_files_staff_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'licence-files' AND public.app_staff_org() IS NOT NULL)
  WITH CHECK (bucket_id = 'licence-files' AND public.app_staff_org() IS NOT NULL);

DROP POLICY IF EXISTS po_documents_staff_read ON storage.objects;
CREATE POLICY po_documents_staff_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'po-documents' AND public.app_staff_org() IS NOT NULL);
