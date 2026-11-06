import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedCheckoutSession } from './checkout-confirmation.mjs';

const id = 'cs_test_123abc';
const key = 'sk_test_fixture';

test('only a paid test checkout session with the requested id confirms an order', async () => {
  const reply = (session) => async () => ({ ok: true, json: async () => session });
  assert.equal(await verifiedCheckoutSession(id, key, reply({ id, status: 'complete', payment_status: 'paid', livemode: false })), true);
  for (const session of [
    { id: 'cs_test_other', status: 'complete', payment_status: 'paid', livemode: false },
    { id, status: 'open', payment_status: 'unpaid', livemode: false },
    { id, status: 'complete', payment_status: 'paid', livemode: true },
  ]) assert.equal(await verifiedCheckoutSession(id, key, reply(session)), false);
  assert.equal(await verifiedCheckoutSession(id, 'sk_live_fixture', reply({ id, status: 'complete', payment_status: 'paid', livemode: false })), false);
  assert.equal(await verifiedCheckoutSession('bad', key, reply({ id, status: 'complete', payment_status: 'paid', livemode: false })), false);
});
