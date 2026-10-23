import { getStore } from '@netlify/blobs';
import { createClient } from '@supabase/supabase-js';
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { pdfDownloadName } from '../../supabase/functions/_shared/portal-file.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (error, status) => Response.json({ error }, { status, headers: HEADERS });

async function verifyToken(token) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Auth service not configured');
  const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token);
  return error ? null : data.user;
}

export function makePortalFileHandler({ pool = getPool, verify = verifyToken, store = () => getStore('portal-files'), log = console.error } = {}) {
  return async (req) => {
    if (req.method !== 'POST') return json('Use POST.', 405);
    let body;
    try { body = await req.json(); } catch { return json('Invalid request.', 400); }
    if (!UUID.test(body?.document_id || '')) return json('This link is not complete.', 400);
    const token = /^Bearer ([^\s]+)$/.exec(req.headers.get('authorization') || '')?.[1];
    if (!token) return json('Sign in to download this file.', 401);
    try {
      const user = await verify(token);
      if (!user?.id || !UUID.test(user.id)) return json('Session expired. Sign in again.', 401);
      const db = pool();
      if (!db) return json('The PDF is unavailable. Try again.', 503);
      const doc = await asCustomer(db, { id: user.id, email: user.email || null, email_verified: !!user.email_confirmed_at },
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
