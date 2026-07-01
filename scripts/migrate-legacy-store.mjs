#!/usr/bin/env node
// migrate-legacy-store.mjs — one-time (re-runnable) importer that loads an exported legacy-store dataset
// into our Supabase schema. ALL mapping/validation lives in src/lib/legacy-migrate.mjs (unit-tested);
// this file is just I/O + idempotent upserts. Safe to run repeatedly: companies upsert on
// customers.slug, orders on orders.reference ("legacy:<id>"), so a second run updates rather than dupes.
//
//   Usage:
//     node scripts/migrate-legacy-store.mjs <export.json> --dry-run     # report only, writes nothing
//     node scripts/migrate-legacy-store.mjs <export.json>               # apply
//     node scripts/migrate-legacy-store.mjs <export.json> --org <uuid>  # override target org
//
//   Env (server-side, NEVER the client bundle):
//     SUPABASE_URL (or VITE_SUPABASE_URL)   — the target project's URL
//     SUPABASE_SERVICE_ROLE_KEY             — service-role key (bypasses RLS for the import)
//   Load them however you like, e.g.:  node --env-file=.env scripts/migrate-legacy-store.mjs ...
//
// See docs/MIGRATION-IMPORT.md for the export format and a sample file.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { validateExport, buildCustomer, buildOrder, orderReference, summarise } from '../src/lib/legacy-migrate.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const orgOverride = (() => { const i = args.indexOf('--org'); return i >= 0 ? args[i + 1] : null; })();

if (!file) { console.error('Usage: node scripts/migrate-legacy-store.mjs <export.json> [--dry-run] [--org <uuid>]'); process.exit(2); }

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }

const raw = JSON.parse(readFileSync(file, 'utf8'));
if (orgOverride) raw.org_id = orgOverride;

// validate + summarise up front (throws on any bad record before we touch the DB)
let plan;
try { plan = summarise(raw); } catch (e) { fail('Export failed validation: ' + e.message); }
console.log('Target org : ' + plan.orgId);
console.log('Plan       : %d companies, %d users, %d orders, %d line items, %d licence keys',
  plan.customers, plan.users, plan.orders, plan.orderItems, plan.licenceKeys);
if (plan.orphanOrders.length) console.warn('⚠ %d order(s) reference an unknown customer and will import UNLINKED: %s',
  plan.orphanOrders.length, plan.orphanOrders.join(', '));
const dupCustomers = plan.duplicateCustomerSlugs || [];
const dupOrders = plan.duplicateOrderReferences || [];
const dupLegacyIds = plan.duplicateCustomerLegacyIds || [];
if (dupCustomers.length) console.warn('⚠ %d duplicate customer key(s) — these records would MERGE into one on import (data loss): %s', dupCustomers.length, dupCustomers.join(', '));
if (dupOrders.length) console.warn('⚠ %d duplicate order reference(s) — these orders would MERGE into one on import (data loss): %s', dupOrders.length, dupOrders.join(', '));
if (dupLegacyIds.length) console.warn('⚠ %d duplicate customer legacy_id(s) — orders for these would link to the WRONG customer: %s', dupLegacyIds.length, dupLegacyIds.join(', '));

if (dryRun) { console.log('\n--dry-run: nothing written. Re-run without --dry-run to apply.'); process.exit(0); }

// A one-shot money migration must never silently merge two distinct records or mis-link an order. Refuse to
// apply until the export is de-duplicated; the dry-run above names the offending keys.
if (dupCustomers.length || dupOrders.length || dupLegacyIds.length) fail('Refusing to apply: the export has duplicate idempotency keys (listed above). De-duplicate the source records, then re-run.');

if (!URL || !KEY) fail('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side) to apply. See docs/MIGRATION-IMPORT.md.');
const db = createClient(URL, KEY, { auth: { persistSession: false } });
const v = validateExport(raw);
const orgId = v.orgId;

const stats = { companies: 0, users: 0, orders: 0, items: 0, keys: 0, skippedKeys: 0 };

// 1) companies + their people. Upsert on (org_id, slug) so re-runs update in place.
const customerIdBySlug = new Map();
const customerIdByLegacy = new Map();
for (const c of v.customers) {
  const { company, users } = buildCustomer(c, orgId);
  const { data, error } = await db.from('customers')
    .upsert(company, { onConflict: 'org_id,slug' })
    .select('id, slug').single();
  if (error) fail('customer ' + company.slug + ': ' + error.message);
  customerIdBySlug.set(company.slug, data.id);
  if (c.legacy_id != null) customerIdByLegacy.set(String(c.legacy_id), data.id);
  stats.companies++;
  for (const u of users) {
    const { error: uErr } = await db.from('customer_users')
      .upsert({ ...u, customer_id: data.id }, { onConflict: 'org_id,customer_id,email' });
    if (uErr) fail('user ' + u.email + ': ' + uErr.message);
    stats.users++;
  }
}

// 2) orders + items + historical keys. Upsert order on (org_id, reference); items are fully derived, so
// replace them (delete + insert) to stay idempotent; keys insert-if-absent (no natural unique).
for (const o of v.orders) {
  const custId = o.customer_legacy_id != null ? (customerIdByLegacy.get(String(o.customer_legacy_id)) || null) : null;
  const { order, items, keys } = buildOrder(o, orgId, custId);
  const { data: ord, error } = await db.from('orders')
    .upsert(order, { onConflict: 'org_id,reference' })
    .select('id, reference').single();
  if (error) fail('order ' + order.reference + ': ' + error.message);
  stats.orders++;

  await db.from('order_items').delete().eq('order_id', ord.id);
  if (items.length) {
    const { error: iErr } = await db.from('order_items').insert(items.map((it) => ({ ...it, order_id: ord.id })));
    if (iErr) fail('items for ' + order.reference + ': ' + iErr.message);
    stats.items += items.length;
  }

  for (const k of keys) {
    // licence_keys.customer_id is NOT NULL, so a historical key can only import onto a LINKED order
    if (!custId) { stats.skippedKeys++; console.warn('  key skipped for ' + order.reference + ' (order has no linked customer)'); continue; }
    const { data: existing } = await db.from('licence_keys')
      .select('id').eq('order_id', ord.id).eq('licence_key', k.licence_key).limit(1);
    if (existing && existing.length) { stats.skippedKeys++; continue; }
    const { error: kErr } = await db.from('licence_keys')
      .insert({ ...k, order_id: ord.id, customer_id: custId });
    if (kErr) console.warn('  key skipped for ' + order.reference + ' (' + kErr.message + ')');
    else stats.keys++;
  }
}

console.log('\n✓ Imported: %d companies, %d users, %d orders, %d line items, %d licence keys (%d already present).',
  stats.companies, stats.users, stats.orders, stats.items, stats.keys, stats.skippedKeys);
console.log('Re-running with the same export is safe (upserts on slug/reference).');
