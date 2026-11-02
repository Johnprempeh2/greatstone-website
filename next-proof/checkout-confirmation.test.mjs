import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedCheckoutSession } from './checkout-confirmation.mjs';

const reply = (session) => async () => ({ ok: true, json: async () => session });

for (const mode of ['test', 'live']) {
  const id = `cs_${mode}_123abc`;
  const key = `sk_${mode}_fixture`;
  const livemode = mode === 'live';
  const other = mode === 'live' ? 'test' : 'live';

  test(`${mode} key: only a paid ${mode} checkout session with the requested id confirms an order`, async () => {
    assert.equal(await verifiedCheckoutSession(id, key, reply({ id, status: 'complete', payment_status: 'paid', livemode })), true);
    for (const session of [
      { id: `cs_${mode}_other`, status: 'complete', payment_status: 'paid', livemode },
      { id, status: 'open', payment_status: 'unpaid', livemode },
      { id, status: 'complete', payment_status: 'unpaid', livemode },
      { id, status: 'complete', payment_status: 'paid', livemode: !livemode },
    ]) assert.equal(await verifiedCheckoutSession(id, key, reply(session)), false);
  });

  test(`${mode} key: garbage, cross-mode or unverifiable ids never confirm`, async () => {
    const paid = reply({ id, status: 'complete', payment_status: 'paid', livemode });
    for (const bad of ['bad', '', undefined, `cs_${other}_123abc`, `${id}/../x`, `${id}?expand=x`])
      assert.equal(await verifiedCheckoutSession(bad, key, paid), false);
    assert.equal(await verifiedCheckoutSession(id, `sk_${other}_fixture`, paid), false);
    assert.equal(await verifiedCheckoutSession(id, undefined, paid), false);
    assert.equal(await verifiedCheckoutSession(id, key, async () => ({ ok: false, json: async () => ({}) })), false);
    assert.equal(await verifiedCheckoutSession(id, key, async () => { throw new Error('network'); }), false);
  });
}
