import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portalMcpRpc } from '../functions/lib/portal-mcp-db.mjs';
import { makePortalMcpHandler } from '../functions/portal-mcp.mjs';

const token = `gspm_${'a'.repeat(64)}`;

function fakePool({ fail = false } = {}) {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (fail && sql.startsWith('SELECT mcp_portal_')) throw Object.assign(new Error('denied'), { code: '42501' });
      return { rows: sql.startsWith('SELECT mcp_portal_') ? [{ data: [{ customer_id: 'client-a' }] }] : [] };
    },
    release() { released = true; },
  };
  return { calls, get released() { return released; }, async connect() { return client; } };
}

test('MCP RPC runs as anon without a person claim and commits', async () => {
  const pool = fakePool();
  const result = await portalMcpRpc(pool, 'mcp_portal_list_clients', { p_token_sha256: 'a'.repeat(64) });
  assert.deepEqual(result, { data: [{ customer_id: 'client-a' }], error: null });
  assert.deepEqual(pool.calls.map((call) => call.sql), [
    'BEGIN', 'SET LOCAL ROLE anon', "SELECT set_config('request.jwt.claims', $1, true)",
    'SELECT mcp_portal_list_clients(p_token_sha256 => $1::text) AS data', 'COMMIT',
  ]);
  assert.deepEqual(JSON.parse(pool.calls[2].values[0]), { role: 'anon' });
  assert.equal(pool.released, true);
});

test('MCP RPC rolls back database errors and rejects other functions', async () => {
  const pool = fakePool({ fail: true });
  const result = await portalMcpRpc(pool, 'mcp_portal_list_clients', { p_token_sha256: 'a'.repeat(64) });
  assert.equal(result.error.code, '42501');
  assert.equal(pool.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(pool.released, true);
  await assert.rejects(portalMcpRpc(pool, 'portal_approve_and_publish', {}), RangeError);
});

test('Netlify MCP endpoint answers protocol requests through the anon bridge', async () => {
  const pool = fakePool();
  const handler = makePortalMcpHandler({ pool: () => pool, store: () => ({ set: async () => {} }) });
  const request = new Request('https://example.test/api/portal-mcp', { method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }),
  });
  const response = await handler(request);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.serverInfo.name, 'greatstone-portal');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(pool.calls.some((call) => call.sql === 'SET LOCAL ROLE anon'), true);
});

test('Netlify MCP gives a clear upload limit error before the platform rejects the request', async () => {
  const handler = makePortalMcpHandler({ pool: () => { throw new Error('database should not open'); } });
  const request = new Request('https://example.test/api/portal-mcp', { method: 'POST',
    headers: { 'content-length': String(5 * 1024 * 1024) }, body: '{}' });
  const response = await handler(request);
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /smaller than 3 MB/);
});

test('Netlify MCP checks actual body bytes when length is not supplied', async () => {
  const pool = fakePool();
  const handler = makePortalMcpHandler({ pool: () => pool });
  const request = new Request('https://example.test/api/portal-mcp', { method: 'POST',
    body: 'x'.repeat(4 * 1024 * 1024 + 1) });
  request.headers.delete('content-length');
  const response = await handler(request);
  assert.equal(response.status, 413);
  assert.equal(pool.calls.length, 0);
});
