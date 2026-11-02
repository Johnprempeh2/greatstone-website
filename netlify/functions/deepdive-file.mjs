import { getStore } from '@netlify/blobs';
import { userFromRequest, authIdentity } from './lib/better-auth.mjs';
import { createHash } from 'node:crypto';
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { sniff, MAX_FILE_BYTES } from '../../src/data/deepdive-sniff.mjs';

const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const ID = /^[0-9a-f]{12}$/;
const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (error, status) => Response.json({ error }, { status, headers: HEADERS });

export function makeDeepdiveFileHandler({ pool = getPool, verify, store = () => getStore('deepdive-files'), log = console.error } = {}) {
  return async (req) => {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    const bareId = url.searchParams.get('id');
    if (!['POST', 'GET', 'DELETE'].includes(req.method)) return json('Use POST, GET or DELETE.', 405);
    if (!SLUG.test(slug || '') || req.method !== 'POST' && !ID.test(bareId || '')) return json('Invalid file request.', 400);
    try {
      const user = await userFromRequest(req, verify);
      if (!user?.id) return json('Session expired. Sign in again.', 401);
      const db = pool();
      if (!db) return json('Files unavailable. Try again.', 503);
      if (req.method === 'POST') {
        const declared = Number(req.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) return json('File too large.', 413);
        const bytes = new Uint8Array(await req.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_FILE_BYTES) return json('File too large or empty.', 413);
        const kind = sniff(bytes);
        if (!kind) return json('File type is not accepted.', 400);
        const id = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
        const path = `${slug}/${id}`;
        const allowed = await asCustomer(db, authIdentity(user), async (client) => {
          const plan = await client.query('SELECT slug FROM deepdive_plans WHERE slug=$1', [slug]);
          if (!plan.rows.length) return false;
          await client.query(`INSERT INTO storage.objects (bucket_id,name,owner)
            VALUES ('deepdive-files',$1,$2) ON CONFLICT (bucket_id,name) DO NOTHING`, [path, user.id]);
          const indexed = await client.query(`SELECT id FROM storage.objects
            WHERE bucket_id='deepdive-files' AND name=$1`, [path]);
          if (!indexed.rows.length) return false;
          await store().set(path, bytes);
          return true;
        });
        if (!allowed) return json('Record access denied.', 403);
        return Response.json({ id: `a:${id}`, mime: kind.mime, ext: kind.ext, bytes: bytes.length,
          suggestedLabel: req.headers.get('x-file-name') ? Buffer.from(req.headers.get('x-file-name'), 'base64').toString('utf8').slice(0, 255) : 'Document' },
        { headers: HEADERS });
      }
      const path = `${slug}/${bareId}`;
      const allowed = await asCustomer(db, authIdentity(user), async (client) => {
        const indexed = await client.query(`SELECT id FROM storage.objects
          WHERE bucket_id='deepdive-files' AND name=$1`, [path]);
        if (!indexed.rows.length) return false;
        if (req.method === 'DELETE') {
          await store().delete(path);
          await client.query(`DELETE FROM storage.objects WHERE bucket_id='deepdive-files' AND name=$1`, [path]);
        }
        return true;
      });
      if (!allowed) return json('File not found.', 404);
      if (req.method === 'DELETE') return Response.json({ ok: true }, { headers: HEADERS });
      const bytes = await store().get(path, { type: 'arrayBuffer' });
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
