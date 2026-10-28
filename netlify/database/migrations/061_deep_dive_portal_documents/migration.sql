-- GRE-2621: Deep Dive versions use the existing portal publication and acceptance chain.
-- A new kind leaves all existing rows, RLS policies, triggers and receipt jobs unchanged.
ALTER TABLE public.portal_documents DROP CONSTRAINT portal_documents_kind_check;
ALTER TABLE public.portal_documents ADD CONSTRAINT portal_documents_kind_check
  CHECK (kind IN ('engagement_pack','nda','gita','terms','pre_read',
                 'north_star','investigation_plan','deep_dive','gdxp'));
