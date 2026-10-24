import { getStore } from '@netlify/blobs';
import { userFromRequest, authIdentity } from './lib/better-auth.mjs';
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { pdfDownloadName } from '../../supabase/functions/_shared/portal-file.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (error, status) => Response.json({ error }, { status, headers: HEADERS });

export function makePortalFileHandler({ pool = getPool, verify, store = () => getStore('portal-files'), log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json('Use POST.', 405);
    let body;
    try { body = await req.json(); } catch { return json('Invalid request.', 400); }
    if (!UUID.test(body?.document_id || '')) return json('This link is not complete.', 400);
    try {
      const user = await userFromRequest(req, verify);
      if (!user?.id || !UUID.test(user.id)) return json('Session expired. Sign in again.', 401);
      const db = pool();
      if (!db) return json('The PDF is unavailable. Try again.', 503);
      const doc = await asCustomer(db, authIdentity(user),
        async (client) => (await client.query('SELECT id,title,version,pdf_path FROM portal_documents WHERE id=$1', [body.document_id])).rows[0]);
      if (!doc) return json('This document is not in your portal.', 404);
      if (!doc.pdf_path) return json('This document has no PDF.', 404);
      const bytes = await store().get(doc.pdf_path, { type: 'arrayBuffer' });
      if (!bytes) return json('The PDF is unavailable. Try again.', 503);
      return new Response(bytes, { headers: { ...HEADERS, 'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${pdfDownloadName(doc)}"` } });
    } catch (error) {
      log('portal-file: request failed (' + (error?.code || error?.name || 'error') + ')');
      return json('The PDF is unavailable. Try again.', 503);
    }
  };
}

export default makePortalFileHandler();
export const config = { path: '/api/portal-file' };
