import { getStore } from '@netlify/blobs';
import { getPool } from './lib/db.mjs';
import { portalMcpRpc } from './lib/portal-mcp-db.mjs';
import { createPortalMcp } from '../../supabase/functions/_shared/portal-mcp.mjs';
import { portalFileStorage } from './lib/portal-onedrive.mjs';

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
// Leave room below Netlify's 6 MB buffered request limit until GRE-2064 adds chunked uploads.
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const tooLarge = () => Response.json({ error: 'This PDF upload is too large for this connection. Use a PDF smaller than 3 MB until chunked upload is available.' }, { status: 413, headers: HEADERS });
const unavailable = () => Response.json({ error: 'Portal tools unavailable. Try again.' }, { status: 503, headers: HEADERS });

export function makePortalMcpHandler({ pool = getPool, store = () => getStore('portal-files'), log = console.error,
  files = portalFileStorage({ blob: store, log }) } = {}) {
  return async (req) => {
    if (req.method === 'POST' && Number(req.headers.get('content-length')) > MAX_REQUEST_BYTES) return tooLarge();
    const db = pool();
    if (!db) return unavailable();
    const server = createPortalMcp({
      rpc: (name, params) => portalMcpRpc(db, name, params),
      upload: async (path, bytes) => {
        try { await files.set(path, bytes); return { error: null }; }
        catch { return { error: { message: 'storage unavailable' } }; }
      },
      chunkedPdf: true,
      log,
    });
    try {
      const body = req.method === 'POST' ? await req.text() : '';
      if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) return tooLarge();
      const out = await server.handle({ method: req.method, headers: req.headers, text: body });
      return new Response(out.body, { status: out.status, headers: { ...out.headers, ...HEADERS } });
    } catch (error) {
      log('portal-mcp: request failed (' + (error?.code || error?.name || 'error') + ')');
      return unavailable();
    }
  };
}

export default makePortalMcpHandler();
export const config = { path: '/api/portal-mcp' };
