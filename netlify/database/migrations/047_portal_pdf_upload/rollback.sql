-- Stop the Netlify MCP and cleanup functions before rolling this migration back.
DROP FUNCTION IF EXISTS mcp_portal_pdf_discard(text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS mcp_portal_pdf_finish(text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS mcp_portal_pdf_chunk(text, uuid, uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS mcp_portal_pdf_begin(text, uuid, uuid, uuid, text, integer, text);
DROP FUNCTION IF EXISTS mcp_portal_pdf_cleanup();
DROP TABLE IF EXISTS public.mcp_pdf_chunks;
DROP TABLE IF EXISTS public.mcp_pdf_uploads;
