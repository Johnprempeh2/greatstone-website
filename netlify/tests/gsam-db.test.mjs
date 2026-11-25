// GSAM for Mac (P4) on a throwaway real Postgres with every migration applied (076 included). The mocked suites
// never parse the SQL; this proves the webhook's writes run under the worker role, a repeat is settled once, and a
// company member sees only their own company's key (RLS), which is stored as ciphertext.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { makeGsamWebhookHandler } from '../functions/gsam-webhook.mjs';
import { makeGsamAccountHandler } from '../functions/gsam-account.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const A = 'c0760000-0000-4000-8000-00000000000a';
const B = 'c0760000-0000-4000-8000-00000000000b';
const WHO = { id: 'd0760000-0000-4000-8000-00000000000a', email: 'a@example.test', emailVerified: true };
const OTHER = { id: 'd0760000-0000-4000-8000-00000000000b', email: 'b@example.test', emailVerified: true };
const at = 1_700_000_000;
const env = { GSAM_STRIPE_WEBHOOK_SECRET: 'whsec_test_gsam', STRIPE_SECRET_KEY: 'sk_test_fixture', GSAM_BILLING_EVENTS_SECRET: 'hub-secret',
  GSAM_HUB_URL: 'https://hub.example.test', GSAM_LICENCE_ENCRYPTION_KEY: 'c'.repeat(64), GSAM_DMG_URL: 'https://downloads.example.test/GSAM.dmg' };
const sign = (body) => `t=${at},v1=${createHmac('sha256', env.GSAM_STRIPE_WEBHOOK_SECRET).update(`${at}.${body}`).digest('hex')}`;

let db;
let pool;

before(async () => {
  if (skip) return;
  db = startPostgres('gsam-db');
  await db.migrate();
  const seed = db.psql(`INSERT INTO organisations(id,slug,name) VALUES ('${ORG}','test-org','Test Org') ON CONFLICT DO NOTHING;
    INSERT INTO customers(id,org_id,slug,name,stripe_customer_id) VALUES
      ('${A}','${ORG}','gsam-a','Buyer A','cus_testa'), ('${B}','${ORG}','gsam-b','Buyer B','cus_testb');
    INSERT INTO customer_users(org_id,customer_id,email,full_name,auth_subject,is_primary) VALUES
      ('${ORG}','${A}','${WHO.email}','Buyer A','${WHO.id}',true), ('${ORG}','${B}','${OTHER.email}','Buyer B','${OTHER.id}',true);`);
  assert.equal(seed.status, 0, seed.stderr);
  pool = new pg.Pool({ connectionString: db.url, max: 2 });
});

after(async () => { await pool?.end(); db?.stop(); });

test('checkout stores the key encrypted once; the buyer reveals it, another company cannot', { skip }, async () => {
  const errors = [];
  let hubCalls = 0;
  const webhook = makeGsamWebhookHandler({ env, now: () => at, pool: () => pool, log: (line) => errors.push(line),
    fetchImpl: async () => { hubCalls += 1; return Response.json({ outcome: 'processed', instanceId: 'inst-a',
      validUntil: '2026-12-25T00:00:00.000Z', licenceKey: 'gsamlk_dbfixture', licenceKeyExpiresAt: '2026-12-02T00:00:00.000Z' }); } });
  const body = JSON.stringify({ id: 'evt_test_db1', livemode: false, type: 'checkout.session.completed', created: at,
    data: { object: { id: 'cs_test_db', mode: 'subscription', payment_status: 'paid', customer: 'cus_testa', subscription: 'sub_a',
      metadata: { source: 'gsam', customer_id: A } } } });
  const deliver = () => webhook(new Request('https://site.example.test/api/gsam/stripe-webhook',
    { method: 'POST', headers: { 'stripe-signature': sign(body) }, body }));
  assert.equal((await deliver()).status, 200, errors.join('\n'));
  assert.equal((await deliver()).status, 200, errors.join('\n'));
  assert.equal(hubCalls, 1, 'the repeat is settled from gsam_billing_events');

  const stored = db.psql(`SELECT licence_key_enc FROM gsam_accounts WHERE customer_id='${A}'`).stdout.trim();
  assert.match(stored, /^v1:/);
  assert.doesNotMatch(stored, /gsamlk_/);
  assert.equal(db.psql(`SELECT count(*) FROM gsam_billing_events`).stdout.trim(), '1');

  const stripe = async (url) => url.includes('/v1/subscriptions')
    ? Response.json({ data: [{ id: 'sub_a', status: 'active', metadata: { source: 'gsam' }, cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_x', nickname: 'Agents', recurring: { interval: 'month' } }, current_period_end: 1_790_000_000 }] } }] })
    : Response.json({ data: [] });
  const account = (who) => makeGsamAccountHandler({ env, pool: () => pool, verify: async () => who, fetchImpl: stripe, log: (line) => errors.push(line) });
  const get = (who, reveal) => account(who)(new Request('https://site.example.test/api/gsam/account' + (reveal ? '?reveal=1' : ''),
    { headers: { authorization: 'Bearer x' } }));

  const plain = await (await get(WHO, false)).json();
  assert.equal(plain.licence.ready, true);
  assert.equal(plain.licence.key, undefined, 'the key is sent only on reveal');
  assert.equal(plain.subscription.paidUntil, '2026-12-25T00:00:00.000Z');
  assert.deepEqual(plain.subscription.modules, ['Agents']);
  assert.equal(plain.downloadUrl, env.GSAM_DMG_URL);
  assert.equal((await (await get(WHO, true)).json()).licence.key, 'gsamlk_dbfixture');
  const other = await (await get(OTHER, true)).json();
  assert.equal(other.licence, null, errors.join('\n'));
});

test('a company member cannot write gsam_accounts and anon cannot read it', { skip }, async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'authenticated', sub: WHO.id, email: WHO.email, email_verified: true })]);
    await assert.rejects(client.query(`UPDATE gsam_accounts SET licence_key_enc='v1:x' WHERE customer_id=$1`, [A]), /permission denied/);
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE anon');
    await assert.rejects(client.query('SELECT * FROM gsam_accounts'), /permission denied/);
    await client.query('ROLLBACK');
  } finally { client.release(); }
});
