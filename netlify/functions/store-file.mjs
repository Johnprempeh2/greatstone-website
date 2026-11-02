// Licence files and PO documents in Netlify Blobs (GRE-1992). Every read and write first reads or writes the
// storage.objects index row in the signed-in person's claims transaction, so the 0024 and 0026 policies decide:
// staff of the org read and write licence files, a buyer reads only their own customer folder, and staff read PO
// documents. No row, no bytes.
import { getStore } from '@netlify/blobs';
import { randomUUID } from 'node:crypto';
import { userFromRequest, authIdentity } from './lib/better-auth.mjs';
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';

const BUCKETS = new Set(['licence-files', 'po-documents']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = /^[0-9a-f-]{36}\/[\w.-]{1,120}$/i;
const MAX_LICENCE_BYTES = 5 * 1024 * 1024;
const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (error, status) => Response.json({ error }, { status, headers: HEADERS });

export const safeFileName = (name) => {
  const safe = String(name || '').replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').replace(/\.{2,}/g, '.').slice(-80);
  return safe && safe !== '.' ? safe : 'licence.lic';
};

export function makeStoreFileHandler({ pool = getPool, verify, store = (bucket) => getStore(bucket), log = console.error } = {}) {
  return async (req) => {
    const url = new URL(req.url);
    const bucket = url.searchParams.get('bucket');
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) return json('Use GET, POST or DELETE.', 405);
    if (!BUCKETS.has(bucket) || req.method !== 'GET' && bucket !== 'licence-files') return json('Invalid file request.', 400);
    const path = url.searchParams.get('path');
    const customer = url.searchParams.get('customer');
    if (req.method === 'POST' ? !UUID.test(customer || '') : !PATH.test(path || '')) return json('Invalid file request.', 400);
    try {
      const user = await userFromRequest(req, verify);
      if (!user?.id || !UUID.test(user.id)) return json('Session expired. Sign in again.', 401);
      const db = pool();
      if (!db) return json('Files unavailable. Try again.', 503);
      const blobs = store(bucket);
      if (req.method === 'POST') {
        const declared = Number(req.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > MAX_LICENCE_BYTES) return json('The licence file must be 5 MB or smaller.', 413);
        const bytes = new Uint8Array(await req.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_LICENCE_BYTES) return json('The licence file must be 5 MB or smaller.', 413);
        const name = req.headers.get('x-file-name') ? Buffer.from(req.headers.get('x-file-name'), 'base64').toString('utf8') : '';
        const target = `${customer.toLowerCase()}/${randomUUID()}-${safeFileName(name)}`;
        await asCustomer(db, authIdentity(user), async (client) => {
          await client.query(`INSERT INTO storage.objects (bucket_id,name,owner) VALUES ($1,$2,$3)`, [bucket, target, user.id]);
          await blobs.set(target, bytes);
        });
        return Response.json({ path: target }, { headers: HEADERS });
      }
      if (req.method === 'DELETE') {
        const removed = await asCustomer(db, authIdentity(user), async (client) => {
          const rows = (await client.query(`DELETE FROM storage.objects WHERE bucket_id=$1 AND name=$2 RETURNING id`, [bucket, path])).rows;
          if (rows.length) await blobs.delete(path);
          return rows.length > 0;
        });
        if (!removed) return json('File not found.', 404);
        return Response.json({ ok: true }, { headers: HEADERS });
      }
      const visible = await asCustomer(db, authIdentity(user), async (client) =>
        (await client.query(`SELECT id FROM storage.objects WHERE bucket_id=$1 AND name=$2`, [bucket, path])).rows.length > 0);
      if (!visible) return json('File not found.', 404);
      const bytes = await blobs.get(path, { type: 'arrayBuffer' });
      if (!bytes) return json('File not found.', 404);
      return new Response(bytes, { headers: { ...HEADERS, 'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="file"' } });
    } catch (error) {
      // 42501: the policy refused the index row (a non-staff upload or delete).
      if (error?.code === '42501') return json('Record access denied.', 403);
      log('store-file: request failed (' + (error?.code || error?.name || 'error') + ')');
      return json('Files unavailable. Try again.', 503);
    }
  };
}

export default makeStoreFileHandler();
export const config = { path: '/api/store-file' };
