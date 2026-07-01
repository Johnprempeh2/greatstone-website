import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapOrderStatus, customerSlug, orderReference, isMigratedReference, toMinor,
  buildCustomer, buildOrder, validateExport, summarise, DEFAULT_ORG_ID, MIGRATION_SOURCE,
} from './legacy-migrate.mjs';

test('mapOrderStatus keeps valid, aliases known, defaults paid-historical to confirmed', () => {
  assert.equal(mapOrderStatus('fulfilled'), 'fulfilled');
  assert.equal(mapOrderStatus('Paid'), 'confirmed');
  assert.equal(mapOrderStatus('completed'), 'fulfilled');
  assert.equal(mapOrderStatus('Partially Refunded'), 'refunded');
  assert.equal(mapOrderStatus('void'), 'cancelled');
  assert.equal(mapOrderStatus(''), 'confirmed');       // migrated order was paid -> not 'pending'
  assert.equal(mapOrderStatus('something-weird'), 'confirmed');
});

test('customerSlug is deterministic and prefers legacy_id', () => {
  assert.equal(customerSlug({ legacy_id: 42 }), 'legacy-42');
  assert.equal(customerSlug({ legacy_id: 42, company: 'Acme' }), 'legacy-42'); // legacy_id wins → stable re-import
  assert.equal(customerSlug({ company: 'Acme Widgets Ltd' }), 'acme-widgets-ltd');
  assert.equal(customerSlug({ slug: 'Custom-Slug' }), 'custom-slug');
  // same input twice -> same slug (idempotency)
  assert.equal(customerSlug({ legacy_id: 7 }), customerSlug({ legacy_id: '7' }));
});

test('orderReference marks migrated orders and is stable + idempotent', () => {
  assert.equal(orderReference({ legacy_id: 100 }), 'legacy:100');
  assert.ok(isMigratedReference(orderReference({ legacy_id: 100 })));
  assert.ok(!isMigratedReference('cs_live_abc'));
  assert.equal(orderReference({ legacy_id: 100 }), orderReference({ legacy_id: '100' }));
  assert.throws(() => buildOrder({ items: [] }), /legacy_id/);   // no id -> refuse
});

test('toMinor prefers minor, converts major, rejects negatives', () => {
  assert.equal(toMinor(12345, undefined), 12345);
  assert.equal(toMinor(undefined, 123.45), 12345);
  assert.equal(toMinor(undefined, undefined), 0);
  assert.throws(() => toMinor(-1, undefined), /invalid/);
});

test('buildCustomer maps company + users, stamps provenance, derives is_primary', () => {
  const { company, users } = buildCustomer({
    legacy_id: 5, company: 'Acme Ltd', domain: 'acme.com', currency: 'gbp', notes: 'VIP',
    users: [{ email: 'JANE@acme.com', name: 'Jane' }, { email: 'bob@acme.com' }],
  });
  assert.equal(company.slug, 'legacy-5');
  assert.equal(company.name, 'Acme Ltd');
  assert.equal(company.billing_currency, 'GBP');
  assert.equal(company.metadata.source, MIGRATION_SOURCE);
  assert.equal(company.metadata.legacy_id, '5');
  assert.equal(users.length, 2);
  assert.equal(users[0].email, 'jane@acme.com');    // lowercased
  assert.equal(users[0].is_primary, true);          // first defaults primary
  assert.equal(users[1].is_primary, false);
  assert.throws(() => buildCustomer({ legacy_id: 6 }), /company\/name/);      // no name
  assert.throws(() => buildCustomer({ company: 'X', users: [{}] }), /no email/);
});

test('buildOrder maps items, computes totals, keeps historical keys, links customer', () => {
  const { order, items, keys } = buildOrder({
    legacy_id: 900, buyer_email: 'Jane@acme.com', status: 'completed', currency: 'gbp',
    placed_at: '2023-05-01', items: [
      { offering_name: 'Aspose.Total', variant_name: 'Developer', qty: 2, unit_price_minor: 60000 },
      { product: 'IronPDF', unit_price: 199.0 },
    ],
    licence_keys: [{ offering_name: 'Aspose.Total', licence_key: 'ABC-123', download_url: 'https://v/dl' }],
  }, DEFAULT_ORG_ID, 'cust-uuid');
  assert.equal(order.reference, 'legacy:900');
  assert.equal(order.status, 'fulfilled');
  assert.equal(order.customer_id, 'cust-uuid');
  assert.equal(order.customer_email, 'jane@acme.com');
  assert.equal(order.currency, 'GBP');
  assert.equal(items.length, 2);
  assert.equal(items[0].line_total_minor, 120000);   // qty 2 * 60000 derived
  assert.equal(items[1].unit_price_minor, 19900);     // major -> minor
  assert.equal(order.subtotal_minor, 139900);         // summed from items
  assert.equal(order.total_minor, 139900);
  assert.equal(keys.length, 1);
  assert.equal(keys[0].status, 'issued');
  assert.equal(keys[0].licence_key, 'ABC-123');
});

test('validateExport flags orphan orders and rejects bad shapes', () => {
  const v = validateExport({
    customers: [{ legacy_id: 1, company: 'A', users: [{ email: 'a@a.com' }] }],
    orders: [
      { legacy_id: 10, customer_legacy_id: 1, items: [{ offering_name: 'X', unit_price_minor: 1 }] },
      { legacy_id: 11, customer_legacy_id: 999, items: [{ offering_name: 'Y', unit_price_minor: 1 }] }, // orphan
    ],
  });
  assert.deepEqual(v.orphanOrders, ['legacy:11']);
  assert.equal(v.orgId, DEFAULT_ORG_ID);
  assert.throws(() => validateExport(null), /JSON object/);
  assert.throws(() => validateExport({ org_id: 'not-a-uuid' }), /uuid/);
});

test('summarise counts everything without touching a DB', () => {
  const s = summarise({
    customers: [
      { legacy_id: 1, company: 'A', users: [{ email: 'a@a.com' }, { email: 'a2@a.com' }] },
      { legacy_id: 2, company: 'B', users: [{ email: 'b@b.com' }] },
    ],
    orders: [
      { legacy_id: 10, customer_legacy_id: 1, items: [{ offering_name: 'X', unit_price_minor: 1 }, { offering_name: 'Z', unit_price_minor: 2 }], licence_keys: [{ licence_key: 'K1' }] },
    ],
  });
  assert.equal(s.customers, 2);
  assert.equal(s.users, 3);
  assert.equal(s.orders, 1);
  assert.equal(s.orderItems, 2);
  assert.equal(s.licenceKeys, 1);
  assert.deepEqual(s.orphanOrders, []);
});
