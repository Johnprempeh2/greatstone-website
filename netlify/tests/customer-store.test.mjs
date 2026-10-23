import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { makeCustomerStoreHandler } from '../functions/customer-store.mjs';
import { asCustomer, customerStore } from '../functions/lib/customer-store.mjs';
import { startPostgres, skip, OWNER } from './lib/postgres.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const A = 'a0000000-0000-4000-8000-00000000000a';
const B = 'b0000000-0000-4000-8000-00000000000b';
const WHO = { id: '00000000-0000-4000-8000-0000000000a1', email: 'buyer-a@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' };
const OTHER = { id: '00000000-0000-4000-8000-0000000000b1', email: 'buyer-b@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' };
const ORDER_A = 'a0000000-0000-4000-8000-000000000010';
const ORDER_B = 'b0000000-0000-4000-8000-000000000010';

const request = (op, args = {}, token = 'valid') => new Request('https://example.test/api/customer-store', {
  method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
  body: JSON.stringify({ op, args }),
});

test('rejects bad operation, order id and missing or invalid session before database access', async () => {
  const handler = makeCustomerStoreHandler({ pool: () => { throw new Error('unexpected database access'); }, verify: async () => null });
  assert.equal((await handler(new Request('https://example.test/api/customer-store'))).status, 405);
  assert.equal((await handler(request('arbitrary'))).status, 400);
  assert.equal((await handler(request('invoice', { orderId: 'not-a-uuid' }))).status, 400);
  assert.equal((await handler(new Request('https://example.test/api/customer-store', { method: 'POST', body: JSON.stringify({ op: 'profile' }) }))).status, 401);
  assert.equal((await handler(request('profile'))).status, 401);
});

test('database outage returns a visible retry response', async () => {
  const handler = makeCustomerStoreHandler({ pool: () => null, verify: async () => WHO });
  const response = await handler(request('profile'));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /unavailable/);
});

test('transaction sets verified claims locally and rolls back on a failed query', async () => {
  const commands = [];
  const client = { query: async (sql, params) => { commands.push([sql, params]); return { rows: [] }; }, release: () => commands.push(['release']) };
  const pool = { connect: async () => client };
  const identity = { id: WHO.id, email: WHO.email, email_verified: true };
  await asCustomer(pool, identity, async () => 'ok');
  assert.deepEqual(commands.map(([sql]) => sql), ['BEGIN', 'SET LOCAL ROLE authenticated', "SELECT set_config('request.jwt.claims', $1, true)", 'COMMIT', 'release']);
  assert.deepEqual(JSON.parse(commands[2][1][0]), { role: 'authenticated', sub: WHO.id, email: WHO.email, email_verified: true });
  commands.length = 0;
  await assert.rejects(asCustomer(pool, identity, async () => { throw new Error('query failed'); }), /query failed/);
  assert.deepEqual(commands.slice(-2).map(([sql]) => sql), ['ROLLBACK', 'release']);
});

test('customer flows use migrated RLS for own company, orders, quotes and invoice', { skip }, async () => {
  const db = startPostgres('customer-store');
  let pool;
  try {
    await db.migrate();
    const seed = db.psql(`INSERT INTO organisations(id,slug,name) VALUES ('${ORG}','test-org','Test Org');
      INSERT INTO customers(id,org_id,slug,name) VALUES
      ('${A}','${ORG}','buyer-a','Buyer A'), ('${B}','${ORG}','buyer-b','Buyer B');
      INSERT INTO customer_users(org_id,customer_id,email,full_name,auth_subject,is_primary) VALUES
      ('${ORG}','${A}','${WHO.email}','Buyer A','${WHO.id}',true),
      ('${ORG}','${B}','${OTHER.email}','Buyer B','${OTHER.id}',true);
      INSERT INTO orders(id,org_id,reference,customer_id,subtotal_minor,total_minor) VALUES
      ('${ORDER_A}','${ORG}','TEST-A','${A}',100,120), ('${ORDER_B}','${ORG}','TEST-B','${B}',200,240);
      INSERT INTO quotes(org_id,reference,customer_id) VALUES
      ('${ORG}','Q-TEST-A','${A}'), ('${ORG}','Q-TEST-B','${B}');
      INSERT INTO engagements(org_id,customer_id,kind,status,title,occurred_on) VALUES
      ('${ORG}','${A}','note','shared','Shared fixture','2026-01-03'),
      ('${ORG}','${A}','note','draft','Draft fixture','2026-01-04'),
      ('${ORG}','${B}','note','shared','Other fixture','2026-01-05');`);
    assert.equal(seed.status, 0, seed.stderr);
    pool = new pg.Pool({ connectionString: db.url, max: 1 });
    const handler = makeCustomerStoreHandler({ pool: () => pool, verify: async (token) => token === 'valid' ? WHO : OTHER });
    const call = async (op, args) => {
      const response = await handler(request(op, args));
      if (response.status !== 200) assert.fail(`${response.status}: ${await response.text()}`);
      return (await response.json()).data;
    };
    assert.equal((await call('profile')).customer.id, A);
    assert.equal((await call('profile', { subject: OTHER.id })).customer.id, A, 'a request cannot supply identity claims');
    const orders = await call('orders');
    assert.deepEqual(orders.map((x) => x.id), [ORDER_A]);
    assert.equal(orders[0].total_minor, 120);
    assert.deepEqual((await call('quotes')).map((x) => x.reference), ['Q-TEST-A']);
    assert.equal((await call('invoice', { orderId: ORDER_A })).id, ORDER_A);
    assert.equal(await call('invoice', { orderId: ORDER_B }), null);
    assert.equal((await call('members')).length, 1);
    assert.deepEqual((await call('engagements')).map((x) => x.title), ['Shared fixture']);
    assert.deepEqual(await call('order-keys'), []);
    await call('request-invite', { email: 'new-person@example.test', role: 'member', fullName: 'New Person', subject: OTHER.id });
    assert.deepEqual((await call('invite-requests')).map((x) => x.email), ['new-person@example.test']);
    await call('update-profile', { fullName: 'Updated Buyer', phone: null });
    assert.equal((await call('profile')).full_name, 'Updated Buyer');
    await call('update-company', { name: 'Updated Company', domain: null, notes: null });
    assert.equal((await call('profile')).customer.name, 'Updated Company');
    // The pooled connection must not retain the previous buyer's role or claims.
    const connection = await pool.connect();
    try {
      const { rows } = await connection.query('SELECT current_user AS role, auth.uid() AS subject');
      assert.deepEqual(rows[0], { role: OWNER, subject: null });
    } finally { connection.release(); }
  } finally {
    await pool?.end();
    db.stop();
  }
});
