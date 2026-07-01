import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMigratedOrder, orderRefDisplay } from './order-ref.mjs';

test('isMigratedOrder detects legacy references only', () => {
  assert.equal(isMigratedOrder('legacy:50231'), true);
  assert.equal(isMigratedOrder('cs_live_abc123'), false);
  assert.equal(isMigratedOrder('cs_test_abc123'), false);
  assert.equal(isMigratedOrder(''), false);
  assert.equal(isMigratedOrder(null), false);
});

test('orderRefDisplay labels migrated orders with their legacy number', () => {
  assert.deepEqual(orderRefDisplay('legacy:50231'), { migrated: true, label: '#50231', full: 'legacy:50231' });
  assert.deepEqual(orderRefDisplay('legacy:'), { migrated: true, label: 'Imported', full: 'legacy:' });
});

test('orderRefDisplay strips the Stripe prefix and truncates live references', () => {
  const r = orderRefDisplay('cs_live_a1b2c3d4e5f6g7h8');
  assert.equal(r.migrated, false);
  assert.equal(r.label, 'a1b2c3d4e5f6…');   // prefix stripped, 12 chars + ellipsis
  const short = orderRefDisplay('cs_test_abc');
  assert.equal(short.label, 'abc');           // no ellipsis when short
  assert.equal(orderRefDisplay('').label, '—');
});
