import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStripePortalHandler } from './stripe-portal.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const env = { STRIPE_SECRET_KEY: 'sk_test_example', APP_SITE_ORIGIN: 'https://staging.example.test' };
const request = (returnUrl = env.APP_SITE_ORIGIN + '/#account') => new Request('https://staging.example.test/api/stripe-portal', {
  method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify({ returnUrl }),
});

function fixture(account) {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('FROM users')) return { rows: [] };
      if (sql.includes('FROM customer_users')) return { rows: account ? [account] : [] };
      return { rows: [] };
    },
    release: () => calls.push(['release']),
  };
  return { calls, pool: () => ({ connect: async () => client }) };
}

test('opens a test portal only for the RLS visible customer and commits the claims transaction', async () => {
  const { calls, pool } = fixture({ stripe_customer_id: 'cus_test123' });
  const stripe = [];
  const handler = makeStripePortalHandler({ env, pool, verify: async () => ({ id, email: 'buyer@example.test', email_confirmed_at: '2026-01-01' }),
    fetchImpl: async (url, init) => { stripe.push([url, init]); return Response.json({ url: 'https://billing.stripe.com/session/test' }); } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).url, 'https://billing.stripe.com/session/test');
  assert.deepEqual(calls.slice(0, 3).map(([sql]) => sql), ['BEGIN', 'SET LOCAL ROLE authenticated', "SELECT set_config('request.jwt.claims', $1, true)"]);
  assert.deepEqual(JSON.parse(calls[2][1][0]), { role: 'authenticated', sub: id, email: 'buyer@example.test', email_verified: true });
  assert.equal(calls.at(-2)[0], 'COMMIT');
  assert.equal(stripe.length, 1);
  assert.equal(new URLSearchParams(stripe[0][1].body).get('customer'), 'cus_test123');
});

test('rejects a foreign return URL before database and Stripe calls', async () => {
  const handler = makeStripePortalHandler({ env, pool: () => { throw new Error('database reached'); }, verify: async () => ({ id }) });
  assert.equal((await handler(request('https://elsewhere.example/#account'))).status, 400);
});

test('missing Stripe customer does not create one or escape RLS', async () => {
  const { calls, pool } = fixture({ stripe_customer_id: null });
  const handler = makeStripePortalHandler({ env, pool, verify: async () => ({ id }), fetchImpl: () => { throw new Error('Stripe reached'); } });
  assert.equal((await handler(request())).status, 503);
  assert.equal(calls.at(-2)[0], 'COMMIT');
});
