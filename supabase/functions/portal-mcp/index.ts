// Portal MCP server (Supabase Edge Function, Deno; GRE-1228, spec GRE-1227 revision 2, section 6). Agents
// connect to it as a GS Agentic Manager connection and write DRAFT portal documents for the clients their token
// is scoped to. Protocol, tools and input checks: ../_shared/portal-mcp.mjs (run by `node --test`). Scope, draft
// rules and the audit: supabase/migrations/0038_portal_mcp.sql. Nothing here publishes; John does, in the studio.
// Auth: Authorization: Bearer gspm_... (a token issued in the SQL editor; see the how-to on GRE-1228). The
// function sends only its SHA-256 to the database.
// Secrets: none of its own; SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by Supabase.
// Deploy: supabase functions deploy portal-mcp --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createPortalMcp } from '../_shared/portal-mcp.mjs';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

const server = createPortalMcp({
  rpc: (fn: string, params: Record<string, unknown>) => supabase.rpc(fn, params),
  upload: (path: string, bytes: Uint8Array) =>
    supabase.storage.from('portal-files').upload(path, bytes, { contentType: 'application/octet-stream', upsert: false }),
  log: (...args: unknown[]) => console.error(...args),
});

Deno.serve(async (req) => {
  const out = await server.handle({ method: req.method, headers: req.headers, text: req.method === 'POST' ? await req.text() : '' });
  return new Response(out.body, { status: out.status, headers: out.headers });
});
