-- Netlify portal MCP calls run as anon with {"role":"anon"} and no subject.
-- The SECURITY DEFINER tools check the MCP token and its client scope. No table,
-- helper, token administration or publish grant changes here. Apply after 040.
GRANT EXECUTE ON FUNCTION mcp_portal_list_clients(text) TO anon;
GRANT EXECUTE ON FUNCTION mcp_portal_list_documents(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION mcp_portal_get_document(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION mcp_portal_client_activity(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION mcp_portal_create_draft(text, uuid, uuid, uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION mcp_portal_update_draft(text, uuid, uuid, uuid, integer, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION mcp_portal_set_file(text, uuid, uuid, uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION mcp_portal_request_publish(text, uuid, uuid, uuid, integer) TO anon;
