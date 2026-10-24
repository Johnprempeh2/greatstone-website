import { getStore } from '@netlify/blobs';
import { createClient } from '@supabase/supabase-js';
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { pdfDownloadName } from '../../supabase/functions/_shared/portal-file.mjs';
import { oneDriveSettings, portalFileStorage } from './lib/portal-onedrive.mjs';

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

export function makePortalFileHandler({ pool = getPool, verify = verifyToken, store = () => getStore('portal-files'),
  log = console.error, files = portalFileStorage({ blob: store, log }), settings = oneDriveSettings } = {}) {
  return async (req) => {
    if (!['POST', 'GET'].includes(req.method)) return json('Use POST or GET.', 405);
    let body;
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { return json('Invalid request.', 400); }
      if (!UUID.test(body?.document_id || '')) return json('This link is not complete.', 400);
    }
    const token = /^Bearer ([^\s]+)$/.exec(req.headers.get('authorization') || '')?.[1];
    if (!token) return json('Sign in to download this file.', 401);
    try {
      const user = await verify(token);
      if (!user?.id || !UUID.test(user.id)) return json('Session expired. Sign in again.', 401);
      const db = pool();
      if (!db) return json('The PDF is unavailable. Try again.', 503);
      if (req.method === 'GET') {
        const staffOrg = await asCustomer(db, { id: user.id, email: user.email || null, email_verified: !!user.email_confirmed_at },
          async (client) => (await client.query('SELECT app_staff_org() AS org_id')).rows[0]?.org_id);
        if (!staffOrg) return json('Not available for this account.', 403);
        return Response.json({ connected: settings().enabled }, { headers: HEADERS });
      }
      const doc = await asCustomer(db, { id: user.id, email: user.email || null, email_verified: !!user.email_confirmed_at },
        async (client) => (await client.query('SELECT id,title,version,pdf_path FROM portal_documents WHERE id=$1', [body.document_id])).rows[0]);
      if (!doc) return json('This document is not in your portal.', 404);
      if (!doc.pdf_path) return json('This document has no PDF.', 404);
      const bytes = await files.get(doc.pdf_path);
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
