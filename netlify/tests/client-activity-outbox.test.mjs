import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { canonicalQuery, canonicalString, parseBridgeKeys } from '../functions/lib/admin-bridge-auth.mjs';
import { makeAdminBridgeHandler } from '../functions/admin-bridge.mjs';

const vector = JSON.parse(readFileSync(new URL('../../contracts/gs-bridge-v1/vectors.json', import.meta.url))).key;
const privateKey = createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(vector.seedHex, 'hex')]),
  format: 'der', type: 'pkcs8',
});
const ORG = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = '22222222-2222-4222-8222-222222222222';
let db, pool, handler;

function signed(path) {
  const url = new URL(path, 'https://staging.example.test');
  const time = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString('base64url');
  const actor = 'agent:activity-test';
  const canonical = canonicalString({ method: 'GET', host: url.host, path: url.pathname,
    query: canonicalQuery(url.searchParams), time, nonce, actor, run: null,
    bodySha256: createHash('sha256').update('').digest('hex') });
  return new Request(url, { headers: { 'x-gs-bridge-key': vector.kid, 'x-gs-bridge-time': String(time),
    'x-gs-bridge-nonce': nonce, 'x-gs-bridge-actor': actor,
    'x-gs-bridge-signature': sign(null, Buffer.from(canonical), privateKey).toString('base64url') } });
}
async function page(path) {
  const response = await handler(signed(path));
  return { status: response.status, body: await response.json() };
}
async function query(sql, values = []) { return pool.query(sql, values); }

before(async () => {
  if (skip) return;
  db = startPostgres('activity-outbox');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url });
  handler = makeAdminBridgeHandler({ pool: () => pool,
    keys: parseBridgeKeys(JSON.stringify([{ kid: vector.kid, capability: 'read', publicKey: vector.publicKey }])),
    log: () => {} });
  await query("INSERT INTO organisations(id,slug,name) VALUES ($1,'greatstone','Greatstone'),($2,'other','Other')", [ORG, OTHER]);
});
after(async () => { await pool?.end(); db?.stop(); });

test('live source actions emit once, with no content or personal details', { skip }, async () => {
  await query("INSERT INTO customers(id,org_id,slug,name) VALUES ($1,$2,'client','Private'),($3,$4,'other','Other')",
    [CUSTOMER, ORG, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', OTHER]);
  const quote = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const order = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await query("INSERT INTO quotes(id,org_id,reference,customer_id,message,contact_email) VALUES ($1,$2,'Q-1',$3,'private answer','private@example.test')",
    [quote, ORG, CUSTOMER]);
  await query("INSERT INTO orders(id,org_id,reference,customer_id,invoice_number,stripe_payment_intent) VALUES ($1,$2,'O-1',$3,'I-1','pi_test_1')",
    [order, ORG, CUSTOMER]);
  const document = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  await query("INSERT INTO portal_documents(id,org_id,customer_id,kind,title,pdf_path,pdf_sha256) VALUES ($1,$2,$3,'pre_read','Private title',$4,$5)",
    [document, ORG, CUSTOMER, `${CUSTOMER}/${document}/file.pdf`, 'a'.repeat(64)]);
  const tenant = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const request = '99999999-9999-4999-8999-999999999999';
  await query('INSERT INTO deep_dive_tenant_links(tenant_id,customer_id,org_id) VALUES ($1,$2,$3)', [tenant, CUSTOMER, ORG]);
  const snapshot = { schema: 'gs-deep-dive-sync-v1', tenantId: tenant,
    documentRequests: [{ id: request, status: 'open', title: 'Private request' }] };
  await query('INSERT INTO deep_dive_snapshots(tenant_id,org_id,snapshot) VALUES ($1,$2,$3::jsonb)',
    [tenant, ORG, JSON.stringify(snapshot)]);
  await query('UPDATE deep_dive_snapshots SET snapshot=$2::jsonb WHERE tenant_id=$1', [tenant, JSON.stringify(snapshot)]);
  await query("INSERT INTO engagements(org_id,customer_id,kind,status,title,body_html) VALUES ($1,$2,'deliverable','shared','Private title','private document')",
    [ORG, CUSTOMER]);
  await query("UPDATE orders SET stripe_payment_intent='pi_test_1',invoice_number='I-1' WHERE id=$1", [order]);
  const { rows } = await query('SELECT kind,organisation_id,subject_id,label FROM client_activity_outbox WHERE org_id=$1 ORDER BY sequence', [ORG]);
  assert.deepEqual(rows.map((r) => r.kind), ['account.created','quote.made','order.made','invoice.issued','invoice.paid',
    'document.uploaded','document.requested','deliverable.published']);
  assert(rows.every((r) => r.organisation_id === CUSTOMER));
  assert(rows.every((r) => !JSON.stringify(r).includes('private')));
  assert.equal((await query('SELECT count(*)::int AS n FROM client_activity_outbox WHERE org_id=$1', [OTHER])).rows[0].n, 1);
});

test('signed pull orders, replays and holds the cursor on an empty page', { skip }, async () => {
  const first = await page('/api/admin/v1/activity-events?cursor=0&limit=2');
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 2);
  assert.equal(first.body.nextCursor, first.body.items[1].sequence);
  assert.equal(first.body.items[0].organisationId, CUSTOMER);
  assert.equal(first.body.items[0].label, 'Account created');
  assert.match(first.body.items[0].occurredAt, /Z$/);
  const replay = await page('/api/admin/v1/activity-events?cursor=0&limit=2');
  assert.deepEqual(replay.body.items, first.body.items);
  const rest = await page(`/api/admin/v1/activity-events?cursor=${first.body.nextCursor}&limit=100`);
  assert.equal(rest.body.items.length, 6);
  assert(rest.body.items.every((row, i, all) => i === 0 || BigInt(row.sequence) > BigInt(all[i - 1].sequence)));
  const empty = await page(`/api/admin/v1/activity-events?cursor=${rest.body.nextCursor}&limit=100`);
  assert.deepEqual(empty.body, { items: [], nextCursor: rest.body.nextCursor });
  for (const suffix of ['cursor=-1&limit=100', 'cursor=0&limit=101', 'cursor=0&limit=1&limit=2', 'cursor=0&limit=1&x=1']) {
    assert.equal((await page(`/api/admin/v1/activity-events?${suffix}`)).status, 400);
  }
});

test('event emission rolls back with its action and the outbox is append-only', { skip }, async () => {
  const beforeCount = (await query('SELECT count(*)::int AS n FROM client_activity_outbox')).rows[0].n;
  const beforeSequence = (await query('SELECT last_sequence FROM client_activity_sequence WHERE id=1')).rows[0].last_sequence;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO quotes(org_id,reference,customer_id) VALUES ($1,'Q-ROLLBACK',$2)", [ORG, CUSTOMER]);
    await client.query('ROLLBACK');
  } finally { client.release(); }
  assert.equal((await query('SELECT count(*)::int AS n FROM client_activity_outbox')).rows[0].n, beforeCount);
  assert.equal((await query('SELECT last_sequence FROM client_activity_sequence WHERE id=1')).rows[0].last_sequence, beforeSequence);
  assert.equal((await query("SELECT count(*)::int AS n FROM quotes WHERE reference='Q-ROLLBACK'")).rows[0].n, 0);
  await assert.rejects(query('DELETE FROM client_activity_outbox WHERE organisation_id=$1', [CUSTOMER]), /append-only/);
});

test('visitors and client sessions have no outbox table access', { skip }, async () => {
  for (const role of ['anon', 'authenticated']) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(client.query('SELECT sequence FROM client_activity_outbox LIMIT 1'), /permission denied/);
    } finally { await client.query('ROLLBACK'); client.release(); }
  }
});

test('concurrent commits keep cursor order and 100-row pages do not skip rows', { skip }, async () => {
  const first = await pool.connect();
  const second = await pool.connect();
  try {
    await first.query('BEGIN');
    await first.query("INSERT INTO quotes(org_id,reference,customer_id) VALUES ($1,'Q-CONCURRENT-1',$2)", [ORG, CUSTOMER]);
    await second.query('BEGIN');
    const later = second.query("INSERT INTO quotes(org_id,reference,customer_id) VALUES ($1,'Q-CONCURRENT-2',$2)", [ORG, CUSTOMER]);
    await first.query('COMMIT');
    await later;
    await second.query('COMMIT');
  } finally {
    await first.query('ROLLBACK').catch(() => {});
    await second.query('ROLLBACK').catch(() => {});
    first.release(); second.release();
  }
  const { rows: ordered } = await query("SELECT sequence FROM client_activity_outbox WHERE kind='quote.made' ORDER BY sequence DESC LIMIT 2");
  assert(BigInt(ordered[0].sequence) > BigInt(ordered[1].sequence));
  const start = (await query('SELECT max(sequence)::text AS cursor FROM client_activity_outbox')).rows[0].cursor;
  await query(`SELECT client_activity_emit($1,$2,'document.requested','batch:' || n,'Document requested')
    FROM generate_series(1,105) n`, [ORG, CUSTOMER]);
  assert.equal((await query('SELECT count(*)::int AS n FROM client_activity_outbox WHERE sequence > $1', [start])).rows[0].n, 105);
  const full = await page(`/api/admin/v1/activity-events?cursor=${start}&limit=100`);
  assert.equal(full.body.items.length, 100);
  assert(BigInt(full.body.items[0].sequence) > BigInt(start), `cursor ${start}; first ${full.body.items[0].sequence}`);
  const tail = await page(`/api/admin/v1/activity-events?cursor=${full.body.nextCursor}&limit=100`);
  assert.equal(tail.body.items.length, 5, JSON.stringify({ start, first: full.body.items[0].sequence,
    last: full.body.nextCursor, tailFirst: tail.body.items[0]?.sequence, tailLast: tail.body.nextCursor }));
  assert.equal(new Set([...full.body.items, ...tail.body.items].map((item) => item.id)).size, 105);
});
