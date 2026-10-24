import test from 'node:test';
import assert from 'node:assert/strict';
import { makeNotifyLicenceIssuedHandler } from '../functions/notify-licence-issued.mjs';

const userId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const request = () => new Request('https://staging.example.test/api/notify-licence-issued', {
  method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify({ order_id: orderId }),
});

function fixture(isStaff = true) {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('FROM users')) return { rows: isStaff ? [{ id: userId }] : [] };
      if (sql.includes('FROM orders')) return { rows: [{ id: orderId, reference: 'test-order', customer_email: 'buyer@example.test' }] };
      if (sql.includes('FROM licence_keys')) return { rows: [{ offering_name: 'Example app', variant_name: 'Team', licence_key: 'NEVER_EMAIL_THIS' }] };
      if (sql.includes('FROM vendors')) return { rows: [] };
      return { rows: [] };
    },
    release: () => calls.push(['release']),
  };
  return { calls, pool: () => ({ connect: async () => client }) };
}

test('staff mail reads under authenticated claims and never includes the licence key', async () => {
  const { calls, pool } = fixture();
  let email;
  const handler = makeNotifyLicenceIssuedHandler({ env: { RESEND_API_KEY: 'test', RESEND_FROM: 'sender@example.test', APP_SITE_ORIGIN: 'https://staging.example.test' },
    pool, verify: async () => ({ id: userId, email: 'staff@example.test', email_confirmed_at: '2026-01-01' }),
    fetchImpl: async (_url, init) => { email = JSON.parse(init.body); return new Response('', { status: 200 }); } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sent, true);
  assert.equal(calls[0][0], 'BEGIN');
  assert.equal(calls[1][0], 'SET LOCAL ROLE authenticated');
  assert.deepEqual(JSON.parse(calls[2][1][0]), { role: 'authenticated', sub: userId, email: 'staff@example.test', email_verified: true });
  assert.equal(calls.at(-2)[0], 'COMMIT');
  assert.equal(email.to, 'buyer@example.test');
  assert.equal(JSON.stringify(email).includes('NEVER_EMAIL_THIS'), false);
});

test('non-staff caller cannot read the order or send mail', async () => {
  const { calls, pool } = fixture(false);
  const handler = makeNotifyLicenceIssuedHandler({ env: { RESEND_API_KEY: 'test' }, pool, verify: async () => ({ id: userId }),
    fetchImpl: () => { throw new Error('Email reached'); } });
  assert.equal((await handler(request())).status, 403);
  assert.equal(calls.some(([sql]) => sql.includes('FROM orders')), false);
});
