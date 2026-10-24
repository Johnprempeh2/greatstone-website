import { getStore } from '@netlify/blobs';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { sniff, MAX_FILE_BYTES } from '../../src/data/deepdive-sniff.mjs';

const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const ID = /^[0-9a-f]{12}$/;
const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (error, status) => Response.json({ error }, { status, headers: HEADERS });

async function verifyToken(token) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Auth service not configured');
  const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token);
  return error ? null : data.user;
}

export function makeDeepdiveFileHandler({ pool = getPool, verify = verifyToken, store = () => getStore('deepdive-files'), log = console.error } = {}) {
  return async (req) => {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    const bareId = url.searchParams.get('id');
    if (!['POST', 'GET', 'DELETE'].includes(req.method)) return json('Use POST, GET or DELETE.', 405);
    if (!SLUG.test(slug || '') || req.method !== 'POST' && !ID.test(bareId || '')) return json('Invalid file request.', 400);
    const token = /^Bearer ([^\s]+)$/.exec(req.headers.get('authorization') || '')?.[1];
    if (!token) return json('Sign in to use files.', 401);
    try {
      const user = await verify(token);
      if (!user?.id) return json('Session expired. Sign in again.', 401);
      const db = pool();
      if (!db) return json('Files unavailable. Try again.', 503);
      const allowed = await asCustomer(db, { id: user.id, email: user.email || null, email_verified: !!user.email_confirmed_at },
        async (client) => (await client.query('SELECT slug FROM deepdive_plans WHERE slug=$1', [slug])).rows.length > 0);
      if (!allowed) return json('Record access denied.', 403);
      const blobs = store();
      if (req.method === 'POST') {
        const declared = Number(req.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) return json('File too large.', 413);
        const bytes = new Uint8Array(await req.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_FILE_BYTES) return json('File too large or empty.', 413);
        const kind = sniff(bytes);
        if (!kind) return json('File type is not accepted.', 400);
        const id = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
        await blobs.set(`${slug}/${id}`, bytes);
        return Response.json({ id: `a:${id}`, mime: kind.mime, ext: kind.ext, bytes: bytes.length,
          suggestedLabel: req.headers.get('x-file-name') ? Buffer.from(req.headers.get('x-file-name'), 'base64').toString('utf8').slice(0, 255) : 'Document' },
        { headers: HEADERS });
      }
      const path = `${slug}/${bareId}`;
      if (req.method === 'DELETE') { await blobs.delete(path); return Response.json({ ok: true }, { headers: HEADERS }); }
      const bytes = await blobs.get(path, { type: 'arrayBuffer' });
      if (!bytes) return json('File not found.', 404);
      return new Response(bytes, { headers: { ...HEADERS, 'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="document"' } });
    } catch (error) {
      log('deepdive-file: request failed (' + (error?.code || error?.name || 'error') + ')');
      return json('Files unavailable. Try again.', 503);
    }
  };
}

export default makeDeepdiveFileHandler();
export const config = { path: '/api/deepdive-file' };
