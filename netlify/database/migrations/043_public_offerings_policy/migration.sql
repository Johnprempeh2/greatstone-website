-- 003 left this redundant policy beside 004's org_isolation and 005's public_read.
-- Its direct cast of an empty app.current_org breaks public reads after a pooled connection has used that GUC.
-- 004's org_isolation uses app_current_org(), which handles empty values safely; keep that and public_read.
DROP POLICY IF EXISTS offerings_tenant_isolation ON offerings;
