import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { makeCatalogueHandler } from '../functions/catalogue.mjs';
import { asCatalogueAnon, catalogueRead } from '../functions/lib/catalogue-store.mjs';
import { startPostgres, skip } from './lib/postgres.mjs';

test('catalogue request rejects invalid operations and bounded filters before database access', async () => {
  const handler = makeCatalogueHandler({ pool: () => { throw new Error('should not connect'); } });
  for (const [url, method] of [
    ['https://example.test/api/catalogue?op=unknown', 'GET'],
    ['https://example.test/api/catalogue?op=detail&slug=invalid/slug', 'GET'],
    ['https://example.test/api/catalogue?pageSize=101', 'GET'],
    ['https://example.test/api/catalogue', 'POST'],
  ]) {
    const response = await handler(new Request(url, { method }));
    assert.equal(response.status, method === 'POST' ? 405 : 400);
  }
});

test('published slugs with plus signs reach the detail query', async () => {
  const client = { query: async () => ({ rows: [] }), release: () => {} };
  const handler = makeCatalogueHandler({ pool: () => ({ connect: async () => client }), read: async (_client, _op, params) => params.slug });
  const response = await handler(new Request('https://example.test/api/catalogue?op=detail&slug=aspose-tex-for-c%2B%2B'));
  assert.equal(response.status, 200);
  assert.equal(await response.json(), 'aspose-tex-for-c++');
});

test('catalogue transaction sets anon and empty identity claims locally, then closes on success and failure', async () => {
  const commands = [];
  const client = { query: async (sql, values) => { commands.push([sql, values]); return { rows: [] }; }, release: () => commands.push(['release']) };
  const pool = { connect: async () => client };
  await asCatalogueAnon(pool, async () => 'ok');
  assert.deepEqual(commands.map(([sql]) => sql), ['BEGIN', 'SET LOCAL ROLE anon', "SELECT set_config('request.jwt.claims', $1, true)", 'COMMIT', 'release']);
  assert.deepEqual(JSON.parse(commands[2][1][0]), { role: 'anon', sub: null, email: null, email_verified: false });
  commands.length = 0;
  await assert.rejects(asCatalogueAnon(pool, async () => { throw new Error('query failed'); }), /query failed/);
  assert.deepEqual(commands.slice(-2).map(([sql]) => sql), ['ROLLBACK', 'release']);
});

test('listing filters are parameters and cards use the shared pricing calculation', async () => {
  const queries = [];
  const card = { id: 'one', slug: 'one', name: 'One', type: 'product', from_price_minor: '100', vendor: { id: 'v' }, category: { id: 'c' } };
  const client = { query: async (sql, values = []) => {
    queries.push([sql, values]);
    if (sql.startsWith('SELECT count')) return { rows: [{ total: 1 }] };
    if (sql.startsWith('SELECT o.id')) return { rows: [card] };
    if (sql.startsWith('SELECT * FROM pricing_rules')) return { rows: [] };
    if (sql.startsWith('SELECT rule_id')) return { rows: [] };
    if (sql.startsWith('SELECT usd_to_gbp')) return { rows: [{ usd_to_gbp_display_rate: '1' }] };
    throw new Error('unexpected SQL');
  } };
  const result = await catalogueRead(client, 'list', { vendor: 'sample', q: 'document', page: 2, pageSize: 1 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].pricing.final, 100);
  const listing = queries.find(([sql]) => sql.startsWith('SELECT o.id'));
  assert.match(listing[0], /v\.slug = \$1/);
  assert.match(listing[0], /websearch_to_tsquery\('simple', \$2\)/);
  assert.deepEqual(listing[1], ['sample', 'document', 1, 1]);
  assert.doesNotMatch(listing[0], /sample|document/);
});

test('detail reads variants and specs then decorates prices', async () => {
  const client = { query: async (sql) => {
    if (sql.startsWith('SELECT o.id')) return { rows: [{ id: 'one', slug: 'one', name: 'One', type: 'product', vendor: { id: 'v' }, category: { id: 'c' } }] };
    if (sql.startsWith('SELECT id,sku')) return { rows: [{ id: 'edition', sort_order: 1, base_price_minor: '100', name: 'Edition' }] };
    if (sql.startsWith('SELECT label')) return { rows: [{ label: 'Feature', sort_order: 1 }] };
    if (sql.startsWith('SELECT * FROM pricing_rules') || sql.startsWith('SELECT rule_id')) return { rows: [] };
    if (sql.startsWith('SELECT usd_to_gbp')) return { rows: [{ usd_to_gbp_display_rate: '1' }] };
    throw new Error('unexpected SQL');
  } };
  const result = await catalogueRead(client, 'detail', { slug: 'one' });
  assert.equal(result.variants[0].pricing.final, 100);
  assert.equal(result.from.final, 100);
  assert.equal(result.specs[0].label, 'Feature');
});

test('migrated RLS serves published browse, detail, related and pricing through the API path', { skip }, async () => {
  const db = startPostgres('catalogue-function');
  let pool;
  try {
    await db.migrate();
    const seed = readFileSync(new URL('../../supabase/seed/seed.sql', import.meta.url), 'utf8')
      .replace(/^(INSERT INTO offering_variants .*);$/gm, '$1 ON CONFLICT DO NOTHING;');
    const inserted = db.psql(seed);
    assert.equal(inserted.status, 0, inserted.stderr);
    const renamed = db.psql("UPDATE offerings SET name = 'Staging Search Sample' WHERE id = (SELECT id FROM offerings WHERE status = 'published' ORDER BY slug LIMIT 1)");
    assert.equal(renamed.status, 0, renamed.stderr);
    pool = new pg.Pool({ connectionString: db.url, max: 2 });
    const handler = makeCatalogueHandler({ pool: () => pool });
    const request = async (query) => {
      const response = await handler(new Request('https://example.test/api/catalogue?' + query));
      if (response.status !== 200) assert.fail(`${response.status}: ${await response.text()}`);
      return response.json();
    };
    const vendors = await request('op=vendors');
    const categories = await request('op=categories');
    const listing = await request('op=list&pageSize=2');
    assert.ok(vendors.length > 0 && categories.length > 0 && listing.total > 2);
    assert.equal(listing.items.length, 2);
    const detail = await request('op=detail&slug=' + listing.items[0].slug);
    assert.equal(detail.id, listing.items[0].id);
    assert.ok(Array.isArray(detail.variants) && Array.isArray(detail.specs));
    const variantPrices = detail.variants.map((v) => v.pricing.final).filter((v) => v != null);
    assert.equal(detail.from?.final ?? null, variantPrices.length ? Math.min(...variantPrices) : null);
    const related = await request('op=related&slug=' + detail.slug);
    assert.ok(Array.isArray(related));
    assert.ok(related.every((o) => o.slug !== detail.slug));
    const filtered = await request('op=list&vendor=' + encodeURIComponent(vendors[0].slug));
    assert.ok(filtered.items.every((o) => o.vendor?.slug === vendors[0].slug));
    const direct = await asCatalogueAnon(pool, (client) => catalogueRead(client, 'detail', { slug: detail.slug }));
    assert.equal(direct.id, detail.id);
    const emptyOrg = await asCatalogueAnon(pool, async (client) => {
      await client.query("SELECT set_config('app.current_org', '', true)");
      return catalogueRead(client, 'list', { page: 1, pageSize: 2 });
    });
    assert.equal(emptyOrg.total, listing.total);
    const searched = await asCatalogueAnon(pool, (client) => catalogueRead(client, 'list', { q: 'Staging', page: 1, pageSize: 2 }));
    assert.equal(searched.total, 1);
  } finally {
    await pool?.end();
    db.stop();
  }
});
