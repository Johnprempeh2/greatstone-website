import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureAllowed, runStagingMcpFixture } from '../functions/lib/staging-mcp-fixture.mjs';
import { makeStagingMcpFixtureHandler } from '../functions/staging-mcp-fixture.mjs';
import { startPostgres, skip } from './lib/postgres.mjs';
import pg from 'pg';

const siteId = '8c1135a6-6f8e-43f4-b9b2-3c4d5b6a36cb';
const env = { SITE_ID: siteId, STAGING_MCP_FIXTURE_SECRET: 's'.repeat(64) };
const hash = 'a'.repeat(64);
const tokenId = '123e4567-e89b-42d3-a456-426614174000';
const clientAId = '123e4567-e89b-42d3-a456-426614174001';
const clientBId = '123e4567-e89b-42d3-a456-426614174002';

function fixturePool() {
  const calls = [];
  let customers = 0;
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('INSERT INTO public.customers')) return { rows: [{ id: ++customers === 1 ? clientAId : clientBId }] };
      if (sql.includes('INSERT INTO public.mcp_tokens') || sql.includes('SELECT id FROM public.mcp_tokens'))
        return { rows: [{ id: tokenId }] };
      return { rows: [] };
    },
    release() { calls.push({ sql: 'RELEASE' }); },
  };
  return { pool: { connect: async () => client }, calls };
}

test('site and one-time secret guard both have to match', () => {
  assert.equal(fixtureAllowed(env, env.STAGING_MCP_FIXTURE_SECRET), true);
  for (const badEnv of [{ ...env, SITE_ID: '3b1e97e6' }, { ...env, SITE_ID: undefined },
    { ...env, STAGING_MCP_FIXTURE_SECRET: '' }])
    assert.equal(fixtureAllowed(badEnv, env.STAGING_MCP_FIXTURE_SECRET), false);
  assert.equal(fixtureAllowed(env, undefined), false);
  assert.equal(fixtureAllowed(env, 'wrong'), false);
});

test('handler refuses unauthorised input before calling database, and validates setup hash', async () => {
  const calls = [];
  const handler = makeStagingMcpFixtureHandler({ env, run: async (...args) => { calls.push(args); return { tokenId }; } });
  const req = (body, secret = env.STAGING_MCP_FIXTURE_SECRET) => new Request('https://example.test/api/staging-mcp-fixture',
    { method: 'POST', headers: { 'x-staging-fixture-secret': secret }, body: JSON.stringify(body) });
  assert.equal((await handler(req({ action: 'setup', hash }, 'wrong'))).status, 404);
  assert.equal((await handler(req({ action: 'setup', hash: 'bad' }))).status, 400);
  assert.equal((await handler(req({ action: 'setup', hash, extra: true }))).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await handler(req({ action: 'setup', hash }))).status, 200);
  assert.deepEqual(calls[0], ['setup', hash, { siteId }]);
});

test('setup writes synthetic clients and token scope together, returning only IDs', async () => {
  const { pool, calls } = fixturePool();
  assert.deepEqual(await runStagingMcpFixture('setup', hash, { siteId, pool }),
    { tokenId, clientAId, clientBId });
  assert.equal(calls[0].sql, 'BEGIN');
  assert.equal(calls.at(-2).sql, 'COMMIT');
  assert.equal(calls.at(-1).sql, 'RELEASE');
  assert.deepEqual(calls.filter(({ sql }) => sql.includes('INSERT INTO public.mcp_token_clients'))[0].values,
    [tokenId, clientAId]);
  assert.equal(calls.some(({ sql }) => sql.includes(clientBId)), false);
  await assert.rejects(runStagingMcpFixture('setup', hash, { siteId: 'greatstone-home', pool }), /Staging site only/);
  await assert.rejects(runStagingMcpFixture('setup', 'bad', { siteId, pool }), /SHA-256/);
});

test('revoke calls owner-only database function for this fixture token', async () => {
  const { pool, calls } = fixturePool();
  assert.deepEqual(await runStagingMcpFixture('revoke', tokenId, { siteId, pool }), { revoked: true });
  assert.equal(calls.some(({ sql, values }) => sql.includes('mcp_portal_revoke_token') && values[0] === tokenId), true);
  assert.equal(calls.at(-2).sql, 'COMMIT');
  const handler = makeStagingMcpFixtureHandler({ env, run: async () => ({ revoked: true }) });
  const response = await handler(new Request('https://example.test/api/staging-mcp-fixture', { method: 'POST',
    headers: { 'x-staging-fixture-secret': env.STAGING_MCP_FIXTURE_SECRET },
    body: JSON.stringify({ action: 'revoke', tokenId }) }));
  assert.deepEqual(await response.json(), { revoked: true });
});

test('owner pool creates a scoped token and revokes it on migrated Postgres', { skip }, async () => {
  const db = startPostgres('staging-mcp-fixture');
  let pool;
  try {
    await db.migrate('003');
    assert.equal(db.psql(`INSERT INTO organisations (id, slug, name)
      VALUES ('99999999-9999-4999-8999-999999999999', 'migration-seed', 'Migration seed')`).status, 0);
    await db.migrate();
    pool = new pg.Pool({ connectionString: db.url });
    const result = await runStagingMcpFixture('setup', hash, { siteId, pool });
    const scope = db.psql(`SELECT c.slug FROM public.mcp_token_clients tc
      JOIN public.customers c ON c.id = tc.customer_id WHERE tc.token_id = '${result.tokenId}'`);
    assert.equal(scope.status, 0);
    assert.equal(scope.stdout.trim(), 'gre-2066-mcp-test-a');
    assert.deepEqual(await runStagingMcpFixture('revoke', result.tokenId, { siteId, pool }), { revoked: true });
    const revoked = db.psql(`SELECT revoked_at IS NOT NULL FROM public.mcp_tokens WHERE id = '${result.tokenId}'`);
    assert.equal(revoked.stdout.trim(), 't');
  } finally {
    await pool?.end();
    db.stop();
  }
});
