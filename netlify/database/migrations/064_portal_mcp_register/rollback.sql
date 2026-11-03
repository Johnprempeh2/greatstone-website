-- Rollback for 064_portal_mcp_register (numbered 061 until GRE-3833). Registered tokens stay in mcp_tokens; revoke them with mcp_portal_revoke_token.
DROP FUNCTION IF EXISTS mcp_portal_register_token(text, uuid[], text);
