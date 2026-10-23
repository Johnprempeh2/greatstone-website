-- Stop portal-mcp before rollback; its calls will otherwise fail permission checks.
REVOKE EXECUTE ON FUNCTION mcp_portal_list_clients(text) FROM anon;
REVOKE EXECUTE ON FUNCTION mcp_portal_list_documents(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION mcp_portal_get_document(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION mcp_portal_client_activity(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION mcp_portal_create_draft(text, uuid, uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION mcp_portal_update_draft(text, uuid, uuid, uuid, integer, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION mcp_portal_set_file(text, uuid, uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION mcp_portal_request_publish(text, uuid, uuid, uuid, integer) FROM anon;
