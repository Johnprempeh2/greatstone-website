import { getStore } from '@netlify/blobs';
import { getPool } from './lib/db.mjs';
import { portalMcpRpc } from './lib/portal-mcp-db.mjs';
import { createPortalMcp, MAX_BODY_BYTES } from '../../supabase/functions/_shared/portal-mcp.mjs';

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const unavailable = () => Response.json({ error: 'Portal tools unavailable. Try again.' }, { status: 503, headers: HEADERS });

export function makePortalMcpHandler({ pool = getPool, store = () => getStore('portal-files'), log = console.error } = {}) {
  return async (req) => {
    if (req.method === 'POST' && Number(req.headers.get('content-length')) > MAX_BODY_BYTES) {
      return Response.json({ error: 'Request too large.' }, { status: 413, headers: HEADERS });
    }
    const db = pool();
    if (!db) return unavailable();
    const server = createPortalMcp({
      rpc: (name, params) => portalMcpRpc(db, name, params),
      upload: async (path, bytes) => {
        try { await store().set(path, bytes); return { error: null }; }
        catch { return { error: { message: 'storage unavailable' } }; }
      },
      log,
    });
    try {
      const out = await server.handle({ method: req.method, headers: req.headers,
        text: req.method === 'POST' ? await req.text() : '' });
      return new Response(out.body, { status: out.status, headers: { ...out.headers, ...HEADERS } });
    } catch (error) {
      log('portal-mcp: request failed (' + (error?.code || error?.name || 'error') + ')');
      return unavailable();
    }
  };
}

export default makePortalMcpHandler();
export const config = { path: '/api/portal-mcp' };
