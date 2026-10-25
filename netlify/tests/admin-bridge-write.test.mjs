// GSAM admin bridge function, phase 2c (GRE-2354, migration 049_gsam_bridge_commerce). The v2 signing contract
// against the shared vectors (v1 cases unchanged), then signed requests through makeAdminBridgeHandler on a throwaway
// real Postgres (lib/postgres.mjs): the commerce reads and the payment report; capability comes from the key; agents
// draft and people publish, change FX, apply imports, issue invoices and decide refunds; the same idempotency key
// writes once; a stale expectedRowVersion is a 409 with the current row; a failed write still leaves its audit row.
// Without the Postgres server binaries the database tests are skipped, and say so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { SCHEME, SCHEME_V2, canonicalQuery, canonicalString, parseBridgeKeys, verifyBridgeRequest } from '../functions/lib/admin-bridge-auth.mjs';
import { makeAdminBridgeHandler, stripeMode } from '../functions/admin-bridge.mjs';

const RAW = readFileSync(new URL('../../contracts/gs-bridge-v1/vectors.json', import.meta.url), 'utf8');
const CONTRACT = JSON.parse(RAW);
const PRIVATE = createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(CONTRACT.key.seedHex, 'hex')]), format: 'der', type: 'pkcs8',
});
const PUB = CONTRACT.key.publicKey;
const KEYS = parseBridgeKeys(JSON.stringify([
  { kid: 'test-read-1', capability: 'read', publicKey: PUB },
  { kid: 'test-write-1', capability: 'write', publicKey: PUB },
  { kid: 'test-refund-1', capability: 'refund_request', publicKey: PUB },
]));
const CAP = { 'test-read-1': 'read', 'test-write-1': 'write', 'test-refund-1': 'refund_request' };
const ORIGIN = 'https://staging.example.test';
const AGENT = 'agent:d5651a41-e5e0-4512-8fb0-069815ff4278';
const JOHN = 'user:UGJwnXKO0P0yBvVh4krv4LH3EThDwrRP';
const key16 = () => randomBytes(16).toString('base64url');

/** Signs a request the way GSAM's bridge client does: v1 for a read key, v2 (with the idempotency key) otherwise. */
function signed(path, { method = 'GET', kid = 'test-read-1', body = '', actor = AGENT, run = null, nonce = key16(),
  idem = key16(), time = Math.floor(Date.now() / 1000), tamper = {} } = {}) {
  const u = new URL(path, ORIGIN);
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const scheme = CAP[kid] === 'read' ? SCHEME : SCHEME_V2;
  const canonical = canonicalString({ scheme, method, host: u.host, path: u.pathname, query: canonicalQuery(u.searchParams),
    time, nonce, actor, run, bodySha256: createHash('sha256').update(text, 'utf8').digest('hex'), idempotencyKey: idem });
  const headers = {
    'x-gs-bridge-key': kid, 'x-gs-bridge-time': String(time), 'x-gs-bridge-nonce': nonce, 'x-gs-bridge-actor': actor,
    'x-gs-bridge-signature': sign(null, Buffer.from(canonical, 'utf8'), PRIVATE).toString('base64url'),
    ...(scheme === SCHEME_V2 ? { 'x-gs-bridge-idempotency-key': idem } : {}), ...(run ? { 'x-gs-bridge-run': run } : {}), ...tamper,
  };
  return new Request(u, { method, headers, ...(method === 'GET' ? {} : { body: text }) });
}
const write = (path, body, opts = {}) => signed(path, { method: 'POST', kid: 'test-write-1', body, ...opts });
const patch = (path, body, opts = {}) => signed(path, { method: 'PATCH', kid: 'test-write-1', body, ...opts });

test('the v2 signing vectors verify, and the v1 cases are byte for byte unchanged', () => {
  // the v1 part of the file, as GRE-2323 merged it (sha256 of the whole 048 file: be6ae25e…1327)
  const v1 = RAW.slice(0, RAW.indexOf('  ],\n  "_commentV2"'));
  assert.equal(v1.length, 3962);
  assert.equal(createHash('sha256').update(v1).digest('hex'), '11ea48dac5b5c5937f3452978af20b3d29c9ea8e4d0558fb3fa0ae37d76cb221');
  assert.equal(CONTRACT.vectors.length, 4);
  assert.ok(CONTRACT.vectorsV2.length >= 4);
  for (const v of CONTRACT.vectorsV2) {
    const u = new URL(v.url);
    assert.equal(createHash('sha256').update(v.body, 'utf8').digest('hex'), v.expected.bodySha256, v.name);
    const canonical = canonicalString({ scheme: SCHEME_V2, method: v.method, host: u.host, path: u.pathname,
      query: v.expected.canonicalQuery, time: v.time, nonce: v.nonce, actor: v.actor, run: v.run,
      bodySha256: v.expected.bodySha256, idempotencyKey: v.idempotencyKey });
    assert.equal(canonical, v.expected.canonical, v.name);
    assert.equal(canonical.split('\n').length, 10, v.name);
    assert.equal(sign(null, Buffer.from(canonical, 'utf8'), PRIVATE).toString('base64url'), v.expected.signature, v.name);
    const headers = (extra = {}) => new Headers({ 'x-gs-bridge-key': v.kid, 'x-gs-bridge-time': String(v.time), 'x-gs-bridge-nonce': v.nonce,
      'x-gs-bridge-actor': v.actor, 'x-gs-bridge-signature': v.expected.signature, 'x-gs-bridge-idempotency-key': v.idempotencyKey,
      ...(v.run ? { 'x-gs-bridge-run': v.run } : {}), ...extra });
    const check = (h) => verifyBridgeRequest({ method: v.method, url: v.url, headers: h, body: v.body, keys: KEYS, nowSeconds: v.time });
    const call = check(headers());
    assert.deepEqual([call.kid, call.capability, call.idempotencyKey], [v.kid, v.capability, v.idempotencyKey], v.name);
    // the idempotency key is signed: another one, or none, does not verify
    assert.throws(() => check(headers({ 'x-gs-bridge-idempotency-key': key16() })), { code: 'bad_signature' }, v.name);
    const without = headers();
    without.delete('x-gs-bridge-idempotency-key');
    assert.throws(() => check(without), { code: 'bad_signature' }, v.name);
  }
  // the retry vector keeps the key and changes the nonce
  const [first, retry] = CONTRACT.vectorsV2;
  assert.equal(first.idempotencyKey, retry.idempotencyKey);
  assert.notEqual(first.nonce, retry.nonce);
});

test('stripeMode reads only the prefix of the key', () => {
  assert.equal(stripeMode('sk_test_abc'), 'test');
  assert.equal(stripeMode('rk_live_abc'), 'live');
  assert.equal(stripeMode(''), 'unset');
  assert.equal(stripeMode(undefined), 'unset');
});

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const VEN = 'a0000000-0000-4000-8000-000000000001';
const VEN_DRAFT = 'a0000000-0000-4000-8000-000000000002';
const OFF = 'a1000000-0000-4000-8000-000000000001';
const RULE = 'a2000000-0000-4000-8000-000000000001';
const TIER = 'a3000000-0000-4000-8000-000000000001';
const JOB = 'a4000000-0000-4000-8000-000000000001';
const QUOTE = 'a5000000-0000-4000-8000-000000000001';
const PAID = 'a6000000-0000-4000-8000-000000000001';
let db;
let pool;
let handler;
const logs = [];

before(async () => {
  if (skip) return;
  db = startPostgres('admin-bridge-write-fn');
  await db.migrate('003');
  const run = (sql) => { const r = db.psql(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  run(`INSERT INTO organisations (id, slug, name, created_at) VALUES ('${ORG}', 'greatstone', 'Greatstone', now() - interval '1 day'),
    ('${OTHER}', 'other', 'Other org', now());`);
  await db.migrate();
  run(`INSERT INTO users (id, org_id, email, role) VALUES ('a9000000-0000-4000-8000-000000000001', '${ORG}', 'staff@example.test', 'admin');
    INSERT INTO vendors (id, org_id, slug, name, status, activation_instructions, created_by)
      VALUES ('${VEN}', '${ORG}', 'aspose', 'Aspose', 'published', 'Paste the key', 'a9000000-0000-4000-8000-000000000001'),
             ('${VEN_DRAFT}', '${ORG}', 'draft-v', 'Draft vendor', 'draft', NULL, NULL);
    INSERT INTO vendors (org_id, slug, name, status) VALUES ('${OTHER}', 'other-v', 'Other vendor', 'published');
    INSERT INTO offerings (id, org_id, type, vendor_id, slug, name, status, fulfilment, tags)
      VALUES ('${OFF}', '${ORG}', 'product', '${VEN}', 'words', 'Words', 'published', 'license', '{pdf}');
    INSERT INTO offering_variants (org_id, offering_id, name, base_price_minor, currency) VALUES ('${ORG}', '${OFF}', 'Developer', 99900, 'USD');
    INSERT INTO offering_specs (org_id, offering_id, label, value, sort_order) VALUES ('${ORG}', '${OFF}', 'Formats', 'DOCX', 1);
    INSERT INTO customer_tiers (id, org_id, slug, name) VALUES ('${TIER}', '${ORG}', 'partner', 'Partner');
    INSERT INTO pricing_rules (id, org_id, name, scope_type, adjustment_type, adjustment_value, adjustment_value_pct, status)
      VALUES ('${RULE}', '${ORG}', 'Summer', 'vendor', 'percentage', 0, 10, 'draft');
    INSERT INTO pricing_rule_targets (org_id, rule_id, vendor_id) VALUES ('${ORG}', '${RULE}', '${VEN}');
    INSERT INTO import_jobs (id, org_id, filename, type, status, rollback_token) VALUES ('${JOB}', '${ORG}', 'old.csv', 'variants', 'applied', gen_random_uuid());
    INSERT INTO import_job_rows (org_id, job_id, row_number, raw, action) SELECT '${ORG}', '${JOB}', g, '{"secret":"raw"}', 'noop' FROM generate_series(1, 5) g;
    INSERT INTO quotes (id, org_id, reference, contact_email) VALUES ('${QUOTE}', '${ORG}', 'Q-9', 'buyer@example.test');
    INSERT INTO quote_items (org_id, quote_id, offering_name, qty, captured_price_minor) VALUES ('${ORG}', '${QUOTE}', 'Words', 1, 1000);
    INSERT INTO orders (id, org_id, reference, status, total_minor, refunded_minor, stripe_payment_intent, currency)
      VALUES ('${PAID}', '${ORG}', 'O-PAID', 'confirmed', 5000, 1000, 'pi_secret_123', 'GBP'),
             ('a6000000-0000-4000-8000-000000000002', '${ORG}', 'O-INVOICE', 'confirmed', 700, 0, NULL, 'GBP');`);
  pool = new pg.Pool({ connectionString: db.url, max: 4 });
  handler = makeAdminBridgeHandler({ pool: () => pool, keys: KEYS, allowedIps: new Set(), log: (m) => logs.push(m), stripe: () => 'test' });
});

after(async () => { await pool?.end(); db?.stop(); });

const call = async (req) => { const res = await handler(req); return { status: res.status, body: await res.json() }; };
const sql = (q) => { const r = db.psql(q); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const audit = (nonce) => sql(`SELECT capability || ' ' || method || ' ' || coalesce(resource, '-') || ' ' || outcome FROM admin_bridge_audit WHERE nonce = '${nonce}';`);

test('the commerce reads: catalogue, tiers, FX, imports and no user ids', { skip }, async () => {
  const offerings = await call(signed('/api/admin/v1/offerings'));
  assert.equal(offerings.status, 200);
  const [o] = offerings.body.items;
  assert.deepEqual([o.slug, o.status, o.variants.length, o.specs[0].label, o.media.length, o.row_version], ['words', 'published', 1, 'Formats', 0, 1]);
  assert.equal(o.search_tsv, undefined);
  assert.equal(o.created_by, undefined);
  const vendors = await call(signed('/api/admin/v1/vendors'));
  assert.deepEqual(vendors.body.items.map((v) => [v.slug, v.activation_instructions, v.created_by]),
    [['aspose', 'Paste the key', undefined], ['draft-v', null, undefined]]);
  const rule = await call(signed(`/api/admin/v1/pricing-rules/${RULE}`));
  assert.equal(rule.body.item.targets[0].vendor_id, VEN);
  assert.equal((await call(signed('/api/admin/v1/customer-tiers'))).body.items[0].slug, 'partner');
  assert.equal((await call(signed('/api/admin/v1/categories'))).body.items.length, 0);
  const fx = await call(signed('/api/admin/v1/fx'));
  assert.equal(fx.body.item.usd_to_gbp_display_rate, '1.300000');
  assert.equal(fx.body.item.history[0].new_rate, '1.300000');
  assert.equal(fx.body.item.history[0].changed_by, undefined);
  // an import's rows page by row number, without the raw spreadsheet row or the rollback token
  const first = await call(signed(`/api/admin/v1/imports/${JOB}?limit=2`));
  assert.equal(first.body.item.rollback_token, undefined);
  assert.deepEqual(first.body.item.rows.items.map((r) => r.row_number), [1, 2]);
  assert.equal(first.body.item.rows.items[0].raw, undefined);
  const second = await call(signed(`/api/admin/v1/imports/${JOB}?limit=4&cursor=${first.body.item.rows.nextCursor}`));
  assert.deepEqual(second.body.item.rows.items.map((r) => r.row_number), [3, 4, 5]);
  assert.equal(second.body.item.rows.nextCursor, null);
  // the catalogue has no customer filter; a typo is refused
  assert.equal((await call(signed(`/api/admin/v1/offerings?customer=${ORG}`))).status, 400);
  assert.equal((await call(signed('/api/admin/v1/fx/1'))).status, 404);
});

test('the payment report comes from the site database only: a boolean for Stripe, never the payment intent', { skip }, async () => {
  const res = await call(signed('/api/admin/v1/payments?from=2000-01-01T00:00:00Z'));
  assert.equal(res.status, 200);
  assert.equal(res.body.stripeMode, 'test');
  assert.deepEqual(res.body.items.map((o) => [o.reference, o.paid_by_stripe, o.unallocated_refund_minor]), [['O-PAID', true, '1000']]);
  assert.deepEqual(res.body.totals, [{ currency: 'GBP', orders: 1, total_minor: '5000', refunded_minor: '1000' }]);
  assert.equal(JSON.stringify(res.body).includes('pi_secret'), false);
  assert.equal((await call(signed('/api/admin/v1/payments?from=yesterday'))).status, 400);
  assert.equal((await call(signed('/api/admin/v1/payments?customer=x'))).status, 400);
});

test('capability comes from the key: read cannot write, write cannot read or ask for a refund, refund cannot write', { skip }, async () => {
  const code = async (req) => { const r = await call(req); return `${r.status} ${r.body.error?.code}`; };
  assert.equal(await code(signed('/api/admin/v1/vendors', { method: 'POST', body: '{}' })), '403 capability_denied');
  assert.equal(await code(signed('/api/admin/v1/vendors', { kid: 'test-write-1' })), '403 capability_denied');
  assert.equal(await code(signed('/api/admin/v1/health', { kid: 'test-refund-1' })), '403 capability_denied');
  assert.equal(await code(write('/api/admin/v1/refund-requests', { orderId: PAID, amountMinor: 1, reason: 'x' })), '403 capability_denied');
  assert.equal(await code(write('/api/admin/v1/vendors', { slug: 'x', name: 'X' }, { kid: 'test-refund-1' })), '403 capability_denied');
  assert.equal(await code(signed('/api/admin/v1/vendors', { method: 'PATCH', kid: 'test-refund-1', body: '{}' })), '403 capability_denied');
  // no generic table writer: an unknown route is not found
  assert.equal(await code(write('/api/admin/v1/users', { email: 'x' })), '404 not_found');
  assert.equal(await code(write('/api/admin/v1/orders', {})), '404 not_found');
});

test('an agent makes a draft; the answer is the row, with an audit row and a change row', { skip }, async () => {
  const nonce = key16();
  const res = await call(write('/api/admin/v1/vendors', { slug: 'groupdocs', name: 'GroupDocs', activationInstructions: 'Step 1' }, { nonce }));
  assert.equal(res.status, 201);
  assert.deepEqual([res.body.item.slug, res.body.item.status, res.body.item.activation_instructions], ['groupdocs', 'draft', 'Step 1']);
  assert.equal(audit(nonce), 'write POST vendors ok');
  assert.equal(sql(`SELECT count(*) || ' ' || min(c.op) FROM admin_bridge_change c JOIN admin_bridge_audit a ON a.id = c.audit_id WHERE a.nonce = '${nonce}';`), '1 insert');
  // a child row of a draft, then a refused one under a published parent
  const off = await call(write('/api/admin/v1/offerings', { type: 'product', vendorId: res.body.item.id, slug: 'gd-viewer', name: 'Viewer' }));
  assert.equal(off.status, 201);
  const variant = await call(write(`/api/admin/v1/offerings/${off.body.item.id}/variants`, { name: 'Site', basePriceMinor: 5000, currency: 'USD' }));
  assert.deepEqual([variant.status, variant.body.item.base_price_minor], [201, '5000']);
  assert.equal((await call(write(`/api/admin/v1/offerings/${OFF}/specs`, { label: 'x', value: 'y' }))).body.error.code, 'denied');
  // unknown and malformed fields are refused before any write
  assert.equal((await call(write('/api/admin/v1/vendors', { slug: 'a', name: 'A', status: 'published' }))).body.error.code, 'bad_request');
  assert.equal((await call(write('/api/admin/v1/vendors', { slug: 'has space', name: 'A' }))).body.error.code, 'bad_request');
});

test('a people-only route refuses an agent with denied, and the call is audited; a person may', { skip }, async () => {
  const nonce = key16();
  const denied = await call(write(`/api/admin/v1/vendors/${VEN_DRAFT}/publish`, { expectedRowVersion: 1 }, { nonce }));
  assert.deepEqual([denied.status, denied.body.error.code], [403, 'denied']);
  assert.equal(audit(nonce), 'write POST vendors denied');
  assert.equal(sql(`SELECT status FROM vendors WHERE id = '${VEN_DRAFT}';`), 'draft');
  for (const [path, body] of [[`/api/admin/v1/imports/${JOB}/apply`, {}], [`/api/admin/v1/invoices/${PAID}/issue`, { expectedRowVersion: 1 }]]) {
    assert.equal((await call(write(path, body))).body.error.code, 'denied', path);
  }
  assert.equal((await call(patch('/api/admin/v1/fx', { usdToGbpDisplayRate: '1.31', expectedRowVersion: 1 }))).body.error.code, 'denied');
  const ok = await call(write(`/api/admin/v1/vendors/${VEN_DRAFT}/publish`, { expectedRowVersion: 1 }, { actor: JOHN }));
  assert.deepEqual([ok.status, ok.body.item.status, ok.body.item.row_version], [200, 'published', 2]);
  // an agent may not edit what is now published
  assert.equal((await call(patch(`/api/admin/v1/vendors/${VEN_DRAFT}`, { name: 'x', expectedRowVersion: 2 }))).body.error.code, 'denied');
});

test('the same idempotency key twice writes once; another body under the key is a 409', { skip }, async () => {
  const idem = key16();
  const body = { name: 'Aspose Pty', expectedRowVersion: 1 };
  const first = await call(patch(`/api/admin/v1/vendors/${VEN}`, body, { idem, actor: JOHN }));
  assert.deepEqual([first.status, first.body.item.name, first.body.item.row_version], [200, 'Aspose Pty', 2]);
  // a retry: same key and body, new nonce
  const nonce = key16();
  const again = await call(patch(`/api/admin/v1/vendors/${VEN}`, body, { idem, actor: JOHN, nonce }));
  assert.deepEqual(again, first);
  assert.equal(audit(nonce), 'write PATCH vendors replayed');
  assert.equal(sql(`SELECT row_version FROM vendors WHERE id = '${VEN}';`), '2');
  assert.equal(sql(`SELECT count(*) FROM admin_bridge_change WHERE row_id = '${VEN}';`), '1');
  const other = await call(patch(`/api/admin/v1/vendors/${VEN}`, { ...body, name: 'Else' }, { idem, actor: JOHN }));
  assert.deepEqual([other.status, other.body.error.code], [409, 'idempotency_mismatch']);
  // the same key and body on another route is not a replay of this one
  const moved = await call(patch(`/api/admin/v1/vendors/${VEN_DRAFT}`, body, { idem, actor: JOHN }));
  assert.equal(moved.body.error.code, 'idempotency_mismatch');
});

test('two calls with the same key at once: one writes, the other waits on the key and replays its answer', { skip }, async () => {
  const idem = key16();
  const body = { status: 'contacted', expectedRowVersion: 1 };
  const [a, b] = await Promise.all([call(patch(`/api/admin/v1/quotes/${QUOTE}`, body, { idem })), call(patch(`/api/admin/v1/quotes/${QUOTE}`, body, { idem }))]);
  assert.deepEqual(a, b);
  assert.equal(a.status, 200);
  assert.equal(sql(`SELECT status || ' ' || row_version FROM quotes WHERE id = '${QUOTE}';`), 'contacted 2');
  assert.equal(sql(`SELECT string_agg(outcome, ' ' ORDER BY outcome) FROM admin_bridge_audit a JOIN admin_bridge_idempotency i ON i.kid = a.kid
    WHERE i.key = '${idem}' AND a.path = '/api/admin/v1/quotes/${QUOTE}' AND a.at >= i.at;`), 'ok replayed');
});

test('a stale expectedRowVersion is a 409 with the current row; a missing one is a 400', { skip }, async () => {
  const stale = await call(patch(`/api/admin/v1/quotes/${QUOTE}`, { poReference: 'PO-1', expectedRowVersion: 1 }));
  assert.deepEqual([stale.status, stale.body.error.code, stale.body.current.row_version, stale.body.current.status], [409, 'conflict', 2, 'contacted']);
  assert.equal((await call(patch(`/api/admin/v1/quotes/${QUOTE}`, { poReference: 'PO-1' }))).status, 400);
  const fresh = await call(patch(`/api/admin/v1/quotes/${QUOTE}`, { poReference: 'PO-1', expectedRowVersion: 2 }));
  assert.deepEqual([fresh.status, fresh.body.item.po_reference], [200, 'PO-1']);
  assert.equal((await call(patch('/api/admin/v1/quotes/a5000000-0000-4000-8000-0000000000ff', { poReference: 'x', expectedRowVersion: 1 }))).status, 404);
});

test('a failed write still leaves its audit row, writes nothing and spends its nonce', { skip }, async () => {
  const nonce = key16();
  const req = patch(`/api/admin/v1/vendors/${VEN_DRAFT}`, { name: '', expectedRowVersion: 2 }, { nonce, actor: JOHN });
  const again = new Request(req.url, { method: 'PATCH', headers: req.headers, body: JSON.stringify({ name: '', expectedRowVersion: 2 }) });
  assert.equal((await call(req)).body.error.code, 'bad_request');
  assert.equal(audit(nonce), 'write PATCH vendors bad_request');
  assert.equal((await call(again)).body.error.code, 'replay');
  // a database refusal is the same: a duplicate slug rolls back to the savepoint and is a 409
  const dup = key16();
  assert.equal((await call(write('/api/admin/v1/vendors', { slug: 'aspose', name: 'Again' }, { nonce: dup }))).body.error.code, 'conflict');
  assert.equal(audit(dup), 'write POST vendors conflict');
  assert.equal(sql(`SELECT count(*) FROM vendors WHERE slug = 'aspose';`), '1');
  assert.equal(sql(`SELECT count(*) FROM admin_bridge_change c JOIN admin_bridge_audit a ON a.id = c.audit_id WHERE a.nonce IN ('${nonce}', '${dup}');`), '0');
});

test('quote to invoice: an agent converts and edits the draft, a person issues it', { skip }, async () => {
  const draft = await call(write(`/api/admin/v1/quotes/${QUOTE}/convert`, {}));
  assert.equal(draft.status, 201);
  assert.deepEqual([draft.body.item.status, draft.body.item.invoice_number], ['pending', null]);
  const order = draft.body.item.id;
  assert.equal((await call(write(`/api/admin/v1/quotes/${QUOTE}/convert`, {}))).body.error.code, 'conflict');
  const edited = await call(patch(`/api/admin/v1/invoices/${order}`, { expectedRowVersion: 1, poReference: 'PO-2',
    lines: [{ offeringName: 'Words', qty: 2, unitPriceMinor: 1000 }] }));
  assert.deepEqual([edited.status, edited.body.item.subtotal_minor, edited.body.item.total_minor, edited.body.item.items.length], [200, '2000', '2400', 1]);
  assert.equal((await call(write(`/api/admin/v1/invoices/${order}/issue`, { expectedRowVersion: 2 }))).body.error.code, 'denied');
  const stale = await call(write(`/api/admin/v1/invoices/${order}/issue`, { expectedRowVersion: 1 }, { actor: JOHN }));
  assert.deepEqual([stale.status, stale.body.current.row_version], [409, 2]);
  const issued = await call(write(`/api/admin/v1/invoices/${order}/issue`, { expectedRowVersion: 2 }, { actor: JOHN }));
  assert.equal(issued.body.item.status, 'confirmed');
  assert.match(issued.body.item.invoice_number, /^INV-\d{4}-\d{5}$/);
});

test('an import: an agent makes the dry run, a person applies it', { skip }, async () => {
  const rows = [
    { rowNumber: 1, raw: { SKU: 'W-1' }, mapped: { offeringSlug: 'words', sku: 'W-1', variant: { name: 'OEM', base_price_minor: '150000' } }, action: 'insert' },
    { rowNumber: 2, raw: { SKU: 'W-2' }, action: 'noop' },
  ];
  const dry = await call(write('/api/admin/v1/imports', { filename: 'skus.csv', type: 'variants', rows }));
  assert.deepEqual([dry.status, dry.body.item.status, dry.body.item.dry_run, dry.body.item.diff_summary.inserts], [201, 'validated', true, 1]);
  const failed = await call(write('/api/admin/v1/imports', { filename: 'bad.csv', type: 'variants', rows: [{ rowNumber: 1, raw: {}, action: 'error', errors: ['no sku'] }] }));
  assert.equal(failed.body.item.status, 'failed');
  assert.equal((await call(write('/api/admin/v1/imports', { filename: 'x.csv', type: 'variants', rows: [{ rowNumber: 1, raw: {}, action: 'insert' }] }))).status, 400);
  assert.equal((await call(write(`/api/admin/v1/imports/${dry.body.item.id}/apply`, {}))).body.error.code, 'denied');
  const applied = await call(write(`/api/admin/v1/imports/${dry.body.item.id}/apply`, {}, { actor: JOHN }));
  assert.deepEqual([applied.status, applied.body.item.status, applied.body.result.created], [200, 'applied', 1]);
  assert.equal(sql("SELECT name FROM offering_variants WHERE sku = 'W-1';"), 'OEM');
  assert.equal((await call(write(`/api/admin/v1/imports/${failed.body.item.id}/apply`, {}, { actor: JOHN }))).body.error.code, 'conflict');
});

test('FX: a person sets the rate at its row version; the change log names them', { skip }, async () => {
  const nonce = key16();
  const res = await call(patch('/api/admin/v1/fx', { usdToGbpDisplayRate: '1.32', expectedRowVersion: 1 }, { actor: JOHN, nonce }));
  assert.deepEqual([res.status, res.body.item.usd_to_gbp_display_rate, res.body.item.history[0].new_rate], [200, '1.320000', '1.320000']);
  assert.equal(sql(`SELECT a.actor_type || ':' || a.actor_id FROM admin_bridge_change c JOIN admin_bridge_audit a ON a.id = c.audit_id
    WHERE a.nonce = '${nonce}' AND c.table_name = 'org_settings';`), JOHN);
  assert.equal((await call(patch('/api/admin/v1/fx', { usdToGbpDisplayRate: '1.33', expectedRowVersion: 1 }, { actor: JOHN }))).status, 409);
  assert.equal((await call(patch('/api/admin/v1/fx', { usdToGbpDisplayRate: '500', expectedRowVersion: 2 }, { actor: JOHN }))).status, 400);
});

test('refund requests go through the refund key; a person decides; no Stripe call is made', { skip }, async () => {
  const refund = (body, opts) => signed('/api/admin/v1/refund-requests', { method: 'POST', kid: 'test-refund-1', body, ...opts });
  const nonce = key16();
  const res = await call(refund({ orderId: PAID, amountMinor: 1500, reason: 'Charged twice' }, { nonce }));
  assert.deepEqual([res.status, res.body.item.status, res.body.item.requested_by], [201, 'requested', AGENT]);
  assert.equal(audit(nonce), 'refund_request POST refund-requests ok');
  // 5000 total, 1000 refunded, 1500 open: 2501 does not fit
  const over = await call(refund({ orderId: PAID, amountMinor: 2501, reason: 'More' }));
  assert.deepEqual([over.status, over.body.error.code], [409, 'over_refundable']);
  const decision = (opts) => signed(`/api/admin/v1/refund-requests/${res.body.item.id}/decision`,
    { method: 'POST', kid: 'test-refund-1', body: { decision: 'approved', approvalRef: 'approval-1' }, ...opts });
  assert.equal((await call(decision())).body.error.code, 'denied');
  const approved = await call(decision({ actor: JOHN }));
  assert.deepEqual([approved.status, approved.body.item.status, approved.body.item.decided_by], [200, 'approved', JOHN]);
  // the webhook's refund (1000 already there, none allocated) does not cover 1500 yet; 2500 does
  sql(`UPDATE orders SET refunded_minor = 2500 WHERE id = '${PAID}';`);
  const report = await call(signed('/api/admin/v1/payments'));
  assert.deepEqual(report.body.items[0].refund_requests.map((r) => [r.status, r.waiting_on_stripe]), [['done', false]]);
  assert.equal(report.body.items[0].unallocated_refund_minor, '1000');
  assert.deepEqual(report.body.refundRequests, [{ status: 'done', requests: 1, amount_minor: '1500' }]);
  assert.ok(!logs.some((m) => /stripe\.com|api\.stripe/.test(m)));
});
