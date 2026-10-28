import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { getPool } from './lib/db.mjs';
import { asCustomer } from './lib/customer-store.mjs';
import { userFromRequest, authIdentity } from './lib/better-auth.mjs';
import { asBridgeWriter } from './lib/admin-bridge-write.mjs';
import { asBridgeReader } from './lib/admin-bridge-store.mjs';
import { verifyBridgeRequest, parseBridgeKeys, BridgeAuthError } from './lib/admin-bridge-auth.mjs';
import { sniff, MAX_FILE_BYTES } from '../../src/data/deepdive-sniff.mjs';
import { answerForClient, clientSnapshot } from './lib/deep-dive-client.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const safeName = (name) => typeof name === 'string' && name.trim() && name.length <= 255 &&
  !/[\\/\u0000-\u001f\u007f]/.test(name) ? name.trim() : null;
function requestName(headers) {
  const encoded = headers.get('x-file-name-encoded');
  if (!encoded) return safeName(headers.get('x-file-name'));
  if (!/^[A-Za-z0-9_-]{1,1024}$/.test(encoded)) return null;
  try { return safeName(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(encoded, 'base64url'))); }
  catch { return null; }
}
const downloadName = (name) => name.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/^\.+/, '_');
const EXTENSIONS = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument',
  xls: 'application/x-ole-storage', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', sav: 'application/x-spss-sav', zsav: 'application/x-spss-sav',
  txt: 'text/plain', csv: 'text/plain' };
export function allowedFileType(name, bytes) {
  const ext = name?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const kind = sniff(bytes);
  return ext && kind && EXTENSIONS[ext] === kind.mime ? kind : null;
}

async function verifiedUser(req, verify) {
  return userFromRequest(req, verify);
}

export function allowedDocument(snapshot, row) {
  if (row.kind === 'client') return snapshot.documentRequests.some((r) => r.id === row.source_id);
  if (row.kind === 'collected') return snapshot.files.some((f) => f.id === row.source_id && f.status === 'held');
  return snapshot.deliverables.some((d) => d.id === row.source_id && ['published', 'accepted'].includes(d.status));
}

export function makeDeepDiveDocumentHandler({ pool = getPool, verify, store = () => getStore('deep-dive-client-documents'),
  keys = parseBridgeKeys(process.env.GSAM_BRIDGE_KEYS, console.error), log = console.error } = {}) {
  return async (req) => {
    const url = new URL(req.url);
    if (!['GET', 'POST', 'PUT'].includes(req.method)) return json({ error: 'Use GET, POST or PUT.' }, 405);
    const db = pool();
    if (!db) return json({ error: 'Documents unavailable. Try again.' }, 503);
    try {
      if (req.method === 'GET' && url.searchParams.get('bridge') === '1') {
        const call = verifyBridgeRequest({ method: 'GET', url: req.url, headers: req.headers, body: '', keys,
          nowSeconds: Math.floor(Date.now() / 1000) });
        if (call.capability !== 'read') return json({ error: 'Access denied.' }, 403);
        const tenantId = url.searchParams.get('tenantId');
        const requestId = url.searchParams.get('requestId');
        if (!UUID.test(tenantId || '') || !UUID.test(requestId || '')) return json({ error: 'Invalid request.' }, 400);
        const row = await asBridgeReader(db, { ...call, method: 'GET', path: url.pathname + url.search,
          resource: 'deep-dive-document', resourceId: requestId }, async (client) => {
          const { rows: [document] } = await client.query(`SELECT d.blob_key,d.file_name FROM deep_dive_documents d
            WHERE d.tenant_id=$1 AND d.source_id=$2 AND d.kind='client' LIMIT 1`, [tenantId, requestId]);
          return { outcome: document ? 'ok' : 'not_found', rowCount: document ? 1 : 0, body: document || null };
        });
        if (!row) return json({ error: 'Document not found.' }, 404);
        const bytes = await store().get(row.blob_key, { type: 'arrayBuffer' });
        if (!bytes) return json({ error: 'Document unavailable. Try again.' }, 503);
        return new Response(bytes, { headers: { ...HEADERS, 'content-type': 'application/octet-stream',
          'content-disposition': `attachment; filename="${downloadName(row.file_name)}"` } });
      }
      if (req.method === 'PUT') {
        // GSAM supplies bytes with its write bridge key. The normal bridge audit claims the nonce and idempotency key.
        if (Number(req.headers.get('content-length')) > MAX_FILE_BYTES) return json({ error: 'File too large.' }, 413);
        const bytes = Buffer.from(await req.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_FILE_BYTES) return json({ error: 'File too large or empty.' }, 413);
        const call = verifyBridgeRequest({ method: 'PUT', url: req.url, headers: req.headers, body: bytes, keys,
          nowSeconds: Math.floor(Date.now() / 1000) });
        if (call.capability !== 'write') return json({ error: 'Access denied.' }, 403);
        const tenantId = url.searchParams.get('tenantId');
        const sourceId = url.searchParams.get('sourceId');
        const kind = url.searchParams.get('kind');
        const name = requestName(req.headers);
        const type = allowedFileType(name, bytes);
        if (!UUID.test(tenantId || '') || !UUID.test(sourceId || '') || !['collected', 'deliverable'].includes(kind) || !name || !type)
          return json({ error: 'Invalid document.' }, 400);
        const path = `${tenantId}/${randomUUID()}`;
        const result = await asBridgeWriter(db, { ...call, method: 'PUT', path: url.pathname + url.search,
          resource: 'deep-dive-document', resourceId: sourceId }, async (client) => {
          const { rows: [link] } = await client.query(`SELECT customer_id FROM deep_dive_tenant_links WHERE tenant_id=$1`, [tenantId]);
          if (!link) return { status: 404, body: { error: 'Tenant not linked.' }, rowCount: 0 };
          const { rows: [snapshot] } = await client.query(`SELECT snapshot FROM deep_dive_snapshots WHERE tenant_id=$1`, [tenantId]);
          const proposed = { kind, source_id: sourceId };
          if (!snapshot || !allowedDocument(snapshot.snapshot, proposed))
            return { status: 404, body: { error: 'Document not shared.' }, rowCount: 0 };
          const existing = await client.query(`SELECT id FROM deep_dive_documents WHERE tenant_id=$1 AND source_id=$2 AND kind=$3`,
            [tenantId, sourceId, kind]);
          if (existing.rows.length) return { status: 409, body: { error: 'Document already stored.' }, rowCount: 0 };
          await store().set(path, bytes);
          try {
            const { rows: [row] } = await client.query(`INSERT INTO deep_dive_documents
              (tenant_id,customer_id,source_id,kind,file_name,mime,byte_size,blob_key)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
              [tenantId, link.customer_id, sourceId, kind, name, type.mime, bytes.length, path]);
            return { status: 200, body: { id: row.id }, rowCount: 1, resourceId: row.id };
          } catch (error) { await store().delete(path).catch(() => {}); throw error; }
        });
        return json(result.body, result.status);
      }

      const user = await verifiedUser(req, verify);
      if (!UUID.test(user?.id || '')) return json({ error: 'Session expired. Sign in again.' }, 401);
      if (req.method === 'GET') {
        const id = url.searchParams.get('id');
        const result = await asCustomer(db, authIdentity(user), async (client) => {
          const snapshot = await clientSnapshot(client);
          if (!snapshot) return null;
          const { rows } = await client.query(`SELECT id,source_id,kind,file_name,mime,byte_size,blob_key,created_at
            FROM deep_dive_documents WHERE customer_id=app_customer_id() ORDER BY created_at DESC LIMIT 1000`);
          // Deliverables become client-readable only through the approved portal_documents version.
          const visible = rows.filter((row) => row.kind !== 'deliverable' && allowedDocument(snapshot, row));
          return id ? visible.find((row) => row.id === id) || null : visible.map(({ blob_key, ...row }) => row);
        });
        if (id) {
          if (!UUID.test(id) || !result) return json({ error: 'Document not found.' }, 404);
          const bytes = await store().get(result.blob_key, { type: 'arrayBuffer' });
          if (!bytes) return json({ error: 'Document unavailable. Try again.' }, 503);
          return new Response(bytes, { headers: { ...HEADERS, 'content-type': 'application/octet-stream',
            'content-disposition': `attachment; filename="${downloadName(result.file_name)}"` } });
        }
        return json({ data: result || [] });
      }

      if (Number(req.headers.get('content-length')) > MAX_FILE_BYTES) return json({ error: 'File too large.' }, 413);
      const requestId = url.searchParams.get('requestId');
      const name = requestName(req.headers);
      if (!UUID.test(requestId || '') || !name) return json({ error: 'Invalid document.' }, 400);
      const bytes = Buffer.from(await req.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_FILE_BYTES) return json({ error: 'File too large or empty.' }, 413);
      const type = allowedFileType(name, bytes);
      if (!type) return json({ error: 'File type is not accepted.' }, 400);
      const path = `${randomUUID()}/${randomUUID()}`;
      const access = await asCustomer(db, authIdentity(user), async (client) => {
        const access = await answerForClient(client, requestId);
        if (!access) return null;
        const { rows: [answer] } = await client.query(`SELECT status FROM deep_dive_answers
          WHERE tenant_id=$1 AND request_id=$2 AND customer_id=app_customer_id() LIMIT 1`, [access.tenantId, requestId]);
        if (answer?.status === 'received') return null;
        const existing = await client.query(`SELECT id FROM deep_dive_documents WHERE tenant_id=$1 AND source_id=$2 AND kind='client'`,
          [access.tenantId, requestId]);
        if (existing.rows.length) return { existing: true, id: existing.rows[0].id };
        const { rows: [customer] } = await client.query('SELECT app_customer_id() AS id');
        return { tenantId: access.tenantId, customerId: customer.id };
      });
      if (!access) return json({ error: 'This request is not available.' }, 404);
      if (access.existing) return json({ data: { id: access.id, status: 'saved' } });
      await store().set(path, bytes);
      try {
        const { rows: [row] } = await db.query(`INSERT INTO deep_dive_documents
          (tenant_id,customer_id,source_id,kind,file_name,mime,byte_size,blob_key)
          SELECT l.tenant_id,l.customer_id,$2::uuid,'client',$4,$5,$6,$7
          FROM deep_dive_tenant_links l JOIN deep_dive_snapshots s ON s.tenant_id=l.tenant_id
          WHERE l.tenant_id=$1 AND l.customer_id=$3 AND EXISTS
            (SELECT 1 FROM jsonb_array_elements(s.snapshot->'documentRequests') r
              WHERE r->>'id'=$2::uuid::text AND r->>'status'='open')
            AND NOT EXISTS (SELECT 1 FROM deep_dive_answers a WHERE a.tenant_id=l.tenant_id
              AND a.customer_id=l.customer_id AND a.request_id=$2 AND a.status='received') RETURNING id`,
          [access.tenantId, requestId, access.customerId, name, type.mime, bytes.length, path]);
        if (!row) { await store().delete(path).catch(() => {}); return json({ error: 'This request is not available.' }, 404); }
        return json({ data: { id: row.id, status: 'saved' } }, 201);
      } catch (error) { await store().delete(path).catch(() => {}); throw error; }
    } catch (error) {
      if (error instanceof BridgeAuthError) return json({ error: 'Access denied.' }, 403);
      log('deep-dive-document: request failed (' + (error?.code || error?.name || 'error') + ')');
      return json({ error: 'Documents unavailable. Try again.' }, 503);
    }
  };
}

export default makeDeepDiveDocumentHandler();
export const config = { path: '/api/deep-dive-document' };
