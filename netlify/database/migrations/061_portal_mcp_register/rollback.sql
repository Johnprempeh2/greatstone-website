-- Rollback for 061_portal_mcp_register. Registered tokens stay in mcp_tokens; revoke them with mcp_portal_revoke_token.
DROP FUNCTION IF EXISTS mcp_portal_register_token(text, uuid[], text);
