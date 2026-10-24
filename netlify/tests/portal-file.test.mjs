import assert from 'node:assert/strict';
import test from 'node:test';
import { makePortalFileHandler } from '../functions/portal-file.mjs';

const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'member@example.test', email_confirmed_at: '2026-01-01' };
const DOC = '00000000-0000-4000-8000-000000000002';
const req = (id = DOC, token = 'valid') => new Request('https://example.test/api/portal-file', {
  method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ document_id: id }),
});

test('portal PDF requires a valid request and verified identity', async () => {
  const handler = makePortalFileHandler({ verify: async (token) => token === 'valid' ? USER : null,
    pool: () => { throw new Error('database reached'); }, log: () => {} });
  assert.equal((await handler(new Request('https://example.test/api/portal-file'))).status, 405);
  assert.equal((await handler(req('bad'))).status, 400);
  assert.equal((await handler(req(DOC, 'bad'))).status, 401);
  assert.equal((await handler(new Request('https://example.test/api/portal-file', { method: 'POST', body: '{}' }))).status, 400);
});

test('portal PDF is read through the claims transaction before private blob access', async () => {
  const sql = [];
  const client = { query: async (statement, values) => {
    sql.push([statement, values]);
    return { rows: statement.startsWith('SELECT id,title') ? [{ id: DOC, title: 'Test document', version: 2, pdf_path: 'private/path.pdf' }] : [] };
  }, release: () => sql.push(['release']) };
  let blobPath;
  const handler = makePortalFileHandler({ verify: async () => USER, pool: () => ({ connect: async () => client }),
    store: () => ({ get: async (path) => { blobPath = path; return new TextEncoder().encode('%PDF-test').buffer; } }) });
  const result = await handler(req());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('content-disposition'), 'attachment; filename="test-document-v2.pdf"');
  assert.equal(blobPath, 'private/path.pdf');
  assert.deepEqual(sql.map(([statement]) => statement), ['BEGIN', 'SET LOCAL ROLE authenticated',
    "SELECT set_config('request.jwt.claims', $1, true)", 'SELECT id,title,version,pdf_path FROM portal_documents WHERE id=$1', 'COMMIT', 'release']);
  assert.deepEqual(JSON.parse(sql[2][1][0]), { role: 'authenticated', sub: USER.id, email: USER.email, email_verified: true });
  assert.deepEqual(sql[3][1], [DOC]);
  sql.length = 0;
  const denied = makePortalFileHandler({ verify: async () => USER, pool: () => ({ connect: async () => ({
    query: async (statement) => { sql.push([statement]); return { rows: [] }; }, release: () => {},
  }) }),
    store: () => { throw new Error('Blob store reached'); } });
  assert.equal((await denied(req())).status, 404);
});
