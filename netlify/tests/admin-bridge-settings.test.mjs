// GSAM admin bridge, commerce settings (GRE-4782, migration 072_bridge_commerce_settings). Signed requests through
// makeAdminBridgeHandler on a throwaway real Postgres (lib/postgres.mjs). For every route: a signed write works, a
// read key is refused (403 capability_denied) and an unknown kid is refused (401 bad_key). The people-only routes
// (client emails, licence issue, re-key and revoke, client tier, sharing, lead delete) refuse an agent at the site and
// again in the database; the plain status and record edits work for an agent. Each write leaves an audit row naming
// the actor, and a licence key never reaches an answer, the change log or the site log. Then the rollback.
// Without the Postgres server binaries the database tests are skipped, and say so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { SCHEME, SCHEME_V2, canonicalQuery, canonicalString, parseBridgeKeys } from '../functions/lib/admin-bridge-auth.mjs';
import { makeAdminBridgeHandler } from '../functions/admin-bridge.mjs';
import { licenceMailer, writeRoute } from '../functions/lib/admin-bridge-write.mjs';

const CONTRACT = JSON.parse(readFileSync(new URL('../../contracts/gs-bridge-v1/vectors.json', import.meta.url), 'utf8'));
const PRIVATE = createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(CONTRACT.key.seedHex, 'hex')]), format: 'der', type: 'pkcs8',
});
const PUB = CONTRACT.key.publicKey;
const KEYS = parseBridgeKeys(JSON.stringify([
  { kid: 'test-read-1', capability: 'read', publicKey: PUB },
  { kid: 'test-write-1', capability: 'write', publicKey: PUB },
  { kid: 'test-refund-1', capability: 'refund_request', publicKey: PUB },
]));
const CAP = { 'test-read-1': 'read', 'test-write-1': 'write', 'test-refund-1': 'refund_request', 'test-unknown-1': 'write' };
const ORIGIN = 'https://staging.example.test';
const AGENT = 'agent:d5651a41-e5e0-4512-8fb0-069815ff4278';
const JOHN = 'user:UGJwnXKO0P0yBvVh4krv4LH3EThDwrRP';
const key16 = () => randomBytes(16).toString('base64url');

function signed(path, { method = 'GET', kid, body = '', actor = JOHN, nonce = key16(), idem = key16() } = {}) {
  kid ??= method === 'GET' ? 'test-read-1' : 'test-write-1';
  const u = new URL(path, ORIGIN);
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const time = Math.floor(Date.now() / 1000);
  const scheme = CAP[kid] === 'read' ? SCHEME : SCHEME_V2;
  const canonical = canonicalString({ scheme, method, host: u.host, path: u.pathname, query: canonicalQuery(u.searchParams),
    time, nonce, actor, run: null, bodySha256: createHash('sha256').update(text, 'utf8').digest('hex'), idempotencyKey: idem });
  const headers = {
    'x-gs-bridge-key': kid, 'x-gs-bridge-time': String(time), 'x-gs-bridge-nonce': nonce, 'x-gs-bridge-actor': actor,
    'x-gs-bridge-signature': sign(null, Buffer.from(canonical, 'utf8'), PRIVATE).toString('base64url'),
    ...(scheme === SCHEME_V2 ? { 'x-gs-bridge-idempotency-key': idem } : {}),
  };
  return new Request(u, { method, headers, ...(method === 'GET' ? {} : { body: text }) });
}

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ACME = 'b7000000-0000-4000-8000-000000000001';
const FOREIGN = 'b7000000-0000-4000-8000-000000000003';
const GOLD = 'e1000000-0000-4000-8000-000000000001';
const FOREIGN_TIER = 'e1000000-0000-4000-8000-000000000002';
const ORDER = 'f1000000-0000-4000-8000-000000000001';
const ORDER_NOKEY = 'f1000000-0000-4000-8000-000000000002';
const FOREIGN_ORDER = 'f1000000-0000-4000-8000-000000000003';
const LIC = 'a2000000-0000-4000-8000-000000000001';
const SI = '9a000000-0000-4000-8000-000000000001';
const FD = '9b000000-0000-4000-8000-000000000001';
const FD_GONE = '9b000000-0000-4000-8000-000000000002';
const ENG = '8e000000-0000-4000-8000-000000000001';
const SHARED = '8e000000-0000-4000-8000-000000000002';
const DOC = '7d000000-0000-4000-8000-000000000001';
const ACC = '7a000000-0000-4000-8000-000000000001';
const ACC_SENT = '7a000000-0000-4000-8000-000000000002';
const VENDOR = '6b000000-0000-4000-8000-000000000001';
const SHA = 'a'.repeat(64);
const KEY = 'SECRET-KEY-AB12CD34';
const V = '/api/admin/v1';
let db;
let pool;
let handler;
const logs = [];
const sent = [];

before(async () => {
  if (skip) return;
  db = startPostgres('admin-bridge-settings');
  await db.migrate('003');
  sql(`INSERT INTO organisations (id, slug, name, created_at) VALUES ('${ORG}', 'greatstone', 'Greatstone', now() - interval '1 day'),
    ('${OTHER}', 'other', 'Other org', now());`);
  await db.migrate();
  sql(`INSERT INTO customer_tiers (id, org_id, slug, name, rank) VALUES ('${GOLD}', '${ORG}', 'gold', 'Gold', 10),
      ('${FOREIGN_TIER}', '${OTHER}', 'gold', 'Gold', 10);
    INSERT INTO customers (id, org_id, slug, name) VALUES ('${ACME}', '${ORG}', 'acme', 'Acme'), ('${FOREIGN}', '${OTHER}', 'foreign', 'Foreign');
    INSERT INTO vendors (id, org_id, slug, name, activation_instructions) VALUES ('${VENDOR}', '${ORG}', 'thing', 'Thing', 'Open Thing, then paste the key.');
    INSERT INTO orders (id, org_id, reference, customer_id, customer_email, status, total_minor) VALUES
      ('${ORDER}', '${ORG}', 'O-1', '${ACME}', 'buyer@example.test', 'confirmed', 1200),
      ('${ORDER_NOKEY}', '${ORG}', 'O-2', '${ACME}', 'buyer@example.test', 'confirmed', 1200),
      ('${FOREIGN_ORDER}', '${OTHER}', 'O-3', '${FOREIGN}', 'other@example.test', 'confirmed', 1200);
    INSERT INTO licence_keys (id, org_id, customer_id, order_id, offering_name, variant_name, licence_key) VALUES
      ('${LIC}', '${ORG}', '${ACME}', '${ORDER}', 'Thing Pro', 'Team', '${KEY}');
    INSERT INTO service_inquiries (id, org_id, contact_name, contact_email) VALUES ('${SI}', '${ORG}', 'Sam Lead', 'sam@example.test');
    INSERT INTO front_door_leads (id, org_id, industry, company_name, contact_email) VALUES
      ('${FD}', '${ORG}', 'Retail', 'Lead Co', 'lead@example.test'), ('${FD_GONE}', '${ORG}', 'Retail', 'Gone Co', 'gone@example.test');
    INSERT INTO engagements (id, org_id, customer_id, kind, status, title) VALUES
      ('${ENG}', '${ORG}', '${ACME}', 'note', 'draft', 'Draft note'), ('${SHARED}', '${ORG}', '${ACME}', 'note', 'shared', 'Shared note');`);
  // the portal's own triggers allow a published document only through its approval flow; the seed skips them
  const r = db.psql(`SET session_replication_role = replica;
    INSERT INTO portal_documents (id, org_id, customer_id, kind, title, status, content_sha256, action, confirmation_text)
      VALUES ('${DOC}', '${ORG}', '${ACME}', 'nda', 'NDA', 'published', '${SHA}', 'accept', 'I accept');
    INSERT INTO portal_acceptances (id, org_id, customer_id, document_id, document_version, content_sha256, action, signer_name,
      signer_title, account_company_name, signer_email, auth_subject, confirmation_text, confirmed) VALUES
      ('${ACC}', '${ORG}', '${ACME}', '${DOC}', 1, '${SHA}', 'accept', 'Sam', 'CEO', 'Acme', 'signer@example.test', 'sub-1', 'I accept', true),
      ('${ACC_SENT}', '${ORG}', '${ACME}', '${DOC}', 1, '${SHA}', 'accept', 'Sue', 'CFO', 'Acme', 'sue@example.test', 'sub-2', 'I accept', true);
    INSERT INTO portal_receipt_jobs (org_id, customer_id, acceptance_id, status, attempts, last_error) VALUES
      ('${ORG}', '${ACME}', '${ACC}', 'failed', 5, 'resend 500'), ('${ORG}', '${ACME}', '${ACC_SENT}', 'sent', 1, NULL);
    SET session_replication_role = DEFAULT;`, 'postgres');
  assert.equal(r.status, 0, r.stderr);
  pool = new pg.Pool({ connectionString: db.url, max: 4 });
  const licenceMail = licenceMailer({ RESEND_API_KEY: 're_test', RESEND_FROM: 'Greatstone <hello@example.test>', APP_SITE_ORIGIN: ORIGIN },
    async (message) => { sent.push(message); return { sent: true }; });
  handler = makeAdminBridgeHandler({ pool: () => pool, keys: KEYS, allowedIps: new Set(), log: (m) => logs.push(m), stripe: () => 'test',
    licenceMail });
});

after(async () => { await pool?.end(); db?.stop(); });

const call = async (req) => { const res = await (handler || authOnly)(req); const text = await res.text(); return { status: res.status, body: JSON.parse(text), text }; };
// without a database the signature checks still run: they refuse before any pool is asked for
const authOnly = makeAdminBridgeHandler({ pool: () => null, keys: KEYS, allowedIps: new Set(), log: () => {} });
function sql(q) { const r = db.psql(q); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); }
const auditOf = (nonce) => sql(`SELECT method || ' ' || coalesce(resource, '-') || ' ' || coalesce(resource_id, '-')
  || ' ' || outcome || ' ' || actor_type || ':' || actor_id FROM admin_bridge_audit WHERE nonce = '${nonce}';`);
const changes = (nonce) => sql(`SELECT coalesce(string_agg(c.table_name || ' ' || c.op, ',' ORDER BY c.id), '') FROM admin_bridge_change c
  JOIN admin_bridge_audit a ON a.id = c.audit_id WHERE a.nonce = '${nonce}';`);
const one = (q) => sql(q);

// ── every route ────────────────────────────────────────────────────────────────────────────────────
// [name, method, path, body, people only, status for a person]. Run in this order by the person test below.
const ROUTES = [
  ['order status', 'PATCH', `${V}/orders/${ORDER}`, { status: 'fulfilled' }, false, 200],
  ['licence issued email', 'POST', `${V}/orders/${ORDER}/notify-licence`, {}, true, 200],
  ['enquiry status', 'PATCH', `${V}/enquiries/si-${SI}`, { status: 'contacted' }, false, 200],
  ['lead status', 'PATCH', `${V}/enquiries/fd-${FD}`, { status: 'contacted' }, false, 200],
  ['lead delete', 'DELETE', `${V}/enquiries/fd-${FD_GONE}`, '', true, 200],
  ['client create', 'POST', `${V}/customers`, { name: 'Beta Ltd', domain: 'beta.example' }, false, 201],
  ['client edit', 'PATCH', `${V}/customers/${ACME}`, { notes: 'Renewal in March', expectedRowVersion: 1 }, false, 200],
  ['timeline add', 'POST', `${V}/customers/${ACME}/engagements`, { kind: 'kickoff', title: 'Kickoff call' }, false, 201],
  ['timeline edit', 'PATCH', `${V}/engagements/${ENG}`, { summary: 'What we agreed' }, false, 200],
  ['timeline share', 'POST', `${V}/engagements/${ENG}/share`, {}, true, 200],
  ['timeline unshare', 'POST', `${V}/engagements/${ENG}/unshare`, {}, true, 200],
  ['timeline delete', 'DELETE', `${V}/engagements/${ENG}`, '', false, 200],
  ['licence issue', 'POST', `${V}/customers/${ACME}/licences`, { offeringName: 'Thing Pro', orderId: ORDER, licenceKey: 'NEW-KEY-9999-WXYZ' }, true, 201],
  ['licence edit', 'PATCH', `${V}/licences/${LIC}`, { notes: 'Two seats in use', seats: 2 }, false, 200],
  ['licence revoke', 'POST', `${V}/licences/${LIC}/revoke`, {}, true, 200],
  ['licence re-issue', 'POST', `${V}/licences/${LIC}/reissue`, {}, true, 200],
  ['tier create', 'POST', `${V}/customer-tiers`, { slug: 'silver', name: 'Silver', rank: 5 }, false, 201],
  ['tier edit', 'PATCH', `${V}/customer-tiers/${GOLD}`, { description: 'Top tier' }, false, 200],
  ['receipt send again', 'POST', `${V}/portal-acceptances/${ACC}/resend`, {}, true, 200],
  ['activation steps', 'PUT', `${V}/vendors/${VENDOR}/activation-steps`, { activationSteps: 'Open Thing, then sign in.', expectedRowVersion: 1 }, false, 200],
];
const partsOf = (path) => new URL(path, ORIGIN).pathname.slice(V.length + 1).split('/');

test('each route is a write route; people-only routes say so; other shapes are not routes', () => {
  for (const [name, method, path, , people] of ROUTES) {
    const r = writeRoute(method, partsOf(path));
    assert.equal(r?.capability, 'write', name);
    assert.equal(Boolean(r.people), people, name);
  }
  for (const [method, path] of [['DELETE', `${V}/enquiries/si-${SI}`], ['PATCH', `${V}/enquiries/${SI}`], ['DELETE', `${V}/orders/${ORDER}`],
    ['POST', `${V}/orders/${ORDER}/refund`], ['PATCH', `${V}/licences/not-a-uuid`], ['DELETE', `${V}/customer-tiers/${GOLD}`],
    ['POST', `${V}/portal-acceptances/${ACC}`], ['POST', `${V}/engagements/${ENG}/archive`], ['DELETE', `${V}/customers/${ACME}`],
    ['PATCH', `${V}/orders/${ORDER}/x/y`]]) {
    assert.equal(writeRoute(method, partsOf(path)), null, `${method} ${path}`);
  }
});

test('a read key is refused on every route: 403 capability_denied', async () => {
  for (const [name, method, path, body] of ROUTES) {
    const res = await call(signed(path, { method, body, kid: 'test-read-1' }));
    assert.deepEqual([res.status, res.body], [403, { error: { code: 'capability_denied' } }], name);
  }
});

test('an unknown kid is refused on every route: 401 bad_key', async () => {
  for (const [name, method, path, body] of ROUTES) {
    const res = await call(signed(path, { method, body, kid: 'test-unknown-1' }));
    assert.deepEqual([res.status, res.body], [401, { error: { code: 'bad_key' } }], name);
  }
});

test('the refund key cannot use these routes', { skip }, async () => {
  for (const [name, method, path, body] of ROUTES.filter((r) => r[1] === 'POST')) {
    const res = await call(signed(path, { method, body, kid: 'test-refund-1' }));
    assert.deepEqual([res.status, res.body.error.code], [403, 'capability_denied'], name);
  }
});

// ── agents ─────────────────────────────────────────────────────────────────────────────────────────
const snapshot = () => sql(`SELECT (SELECT string_agg(status::text || row_version, ',' ORDER BY id) FROM orders) || '|'
  || (SELECT string_agg(status::text || row_version || coalesce(licence_key, '-'), ',' ORDER BY id) FROM licence_keys) || '|'
  || (SELECT string_agg(status::text || row_version || coalesce(deleted_at::text, '-'), ',' ORDER BY id) FROM engagements) || '|'
  || (SELECT count(*) FROM front_door_leads) || '|' || (SELECT string_agg(coalesce(tier_id::text, '-'), ',' ORDER BY id) FROM customers)
  || '|' || (SELECT string_agg(status || attempts, ',' ORDER BY id) FROM portal_receipt_jobs);`);

test('an agent is refused every people-only change: 403 denied, audited, nothing changed, no email', { skip }, async () => {
  const before = snapshot();
  const extra = [
    ['client tier on create', 'POST', `${V}/customers`, { name: 'Agent Co', tierId: GOLD }],
    ['client tier on edit', 'PATCH', `${V}/customers/${ACME}`, { tierId: GOLD }],
    ['licence re-key', 'PATCH', `${V}/licences/${LIC}`, { licenceKey: 'AGENT-KEY-0000-0000' }],
    ['licence download link', 'PATCH', `${V}/licences/${LIC}`, { downloadUrl: 'https://example.test/x.lic' }],
    ['shared item edit', 'PATCH', `${V}/engagements/${SHARED}`, { title: 'Changed' }],
    ['shared item delete', 'DELETE', `${V}/engagements/${SHARED}`, ''],
  ];
  for (const [name, method, path, body] of [...ROUTES.filter((r) => r[4]), ...extra]) {
    const nonce = key16();
    const res = await call(signed(path, { method, body, actor: AGENT, nonce }));
    assert.deepEqual([res.status, res.body], [403, { error: { code: 'denied' } }], name);
    assert.match(auditOf(nonce), new RegExp(` denied ${AGENT}$`), name);
    assert.equal(changes(nonce), '', name);
  }
  assert.equal(snapshot(), before);
  assert.equal(sent.length, 0);
});

test('the database refuses an agent on every people-only function, even when the site function is skipped', { skip }, () => {
  const people = [
    `bridge_order_licence_email('${ORDER}')`, `bridge_lead_delete('${FD}')`,
    `bridge_customer_create('{"name":"X","tier_id":"${GOLD}"}')`, `bridge_customer_edit('${ACME}', NULL, '{"tier_id":"${GOLD}"}')`,
    `bridge_engagement_set_status('${ENG}', NULL, 'shared')`, `bridge_engagement_edit('${SHARED}', NULL, '{"title":"x"}')`,
    `bridge_engagement_delete('${SHARED}', NULL)`, `bridge_licence_issue('${ACME}', '{"offering_name":"X","licence_key":"K-1234-5678"}')`,
    `bridge_licence_edit('${LIC}', NULL, '{"licence_key":"K-1234-5678"}')`, `bridge_licence_set_status('${LIC}', NULL, 'revoked')`,
    `bridge_receipt_requeue('${ACC}')`,
  ];
  for (const f of people) assert.match(as('gsam_bridge_write', `SELECT ${f};`, { actor: AGENT }).err, /people only/, f);
  assert.ok(as('gsam_bridge_write', `SELECT bridge_licence_set_status('${LIC}', NULL, 'revoked');`).ok, 'a person may');
});

// ── a person makes every change ─────────────────────────────────────────────────────────────────────
test('a signed write works on every route, and its audit row names the person', { skip }, async () => {
  for (const [name, method, path, body, , status] of ROUTES) {
    const nonce = key16();
    const res = await call(signed(path, { method, body, nonce }));
    assert.equal(res.status, status, `${name}: ${res.text}`);
    assert.match(auditOf(nonce), new RegExp(`^${method} [a-z-]+ [0-9a-z-]{36,39} ok ${JOHN}$`), name);
  }
});

test('the results of those writes are in the database', { skip }, () => {
  assert.equal(one(`SELECT status FROM orders WHERE id = '${ORDER}';`), 'fulfilled');
  assert.equal(one(`SELECT status FROM service_inquiries WHERE id = '${SI}';`), 'contacted');
  assert.equal(one(`SELECT status || ' ' || (last_contacted_at IS NOT NULL) FROM front_door_leads WHERE id = '${FD}';`), 'contacted true');
  assert.equal(one(`SELECT count(*) FROM front_door_leads WHERE id = '${FD_GONE}';`), '0');
  assert.equal(one(`SELECT slug || ' ' || domain FROM customers WHERE name = 'Beta Ltd';`), 'beta-ltd beta.example');
  assert.equal(one(`SELECT notes FROM customers WHERE id = '${ACME}';`), 'Renewal in March');
  assert.equal(one(`SELECT status FROM engagements WHERE title = 'Kickoff call';`), 'draft');
  assert.equal(one(`SELECT summary || ' ' || status || ' ' || (deleted_at IS NOT NULL) FROM engagements WHERE id = '${ENG}';`), 'What we agreed draft true');
  assert.equal(one(`SELECT status || ' ' || seats FROM licence_keys WHERE id = '${LIC}';`), 'issued 2');
  assert.equal(one(`SELECT count(*) FROM licence_keys WHERE licence_key = 'NEW-KEY-9999-WXYZ' AND customer_id = '${ACME}';`), '1');
  assert.equal(one(`SELECT name FROM customer_tiers WHERE slug = 'silver';`), 'Silver');
  assert.equal(one(`SELECT description FROM customer_tiers WHERE id = '${GOLD}';`), 'Top tier');
  assert.equal(one(`SELECT status || attempts || coalesce(last_error, '-') FROM portal_receipt_jobs WHERE acceptance_id = '${ACC}';`), 'queued0-');
  assert.equal(one(`SELECT actor_id || ' ' || (detail ->> 'via') FROM portal_audit WHERE event = 'receipt_requeued';`), `${JOHN} bridge`);
  assert.equal(one(`SELECT activation_instructions FROM vendors WHERE id = '${VENDOR}';`), 'Open Thing, then sign in.');
});

test('an agent may make the plain status and record edits', { skip }, async () => {
  for (const [method, path, body, status] of [
    ['PATCH', `${V}/orders/${ORDER_NOKEY}`, { status: 'fulfilled' }, 200],
    ['PATCH', `${V}/enquiries/si-${SI}`, { status: 'closed' }, 200],
    ['POST', `${V}/customers`, { name: 'Gamma Ltd', slug: 'gamma' }, 201],
    ['PATCH', `${V}/customers/${ACME}`, { domain: 'acme.example' }, 200],
    ['POST', `${V}/customers/${ACME}/engagements`, { kind: 'note', title: 'Agent note' }, 201],
    ['PATCH', `${V}/licences/${LIC}`, { notes: 'Checked by an agent' }, 200],
    ['POST', `${V}/customer-tiers`, { slug: 'bronze', name: 'Bronze' }, 201],
  ]) {
    const nonce = key16();
    const res = await call(signed(path, { method, body, actor: AGENT, nonce }));
    assert.equal(res.status, status, `${method} ${path}: ${res.text}`);
    assert.match(auditOf(nonce), new RegExp(` ok ${AGENT}$`));
  }
});

// ── route by route ─────────────────────────────────────────────────────────────────────────────────
test('order status: refunded is refused, a cancelled order stays cancelled, a stale version is a conflict, another org\'s is not found', { skip }, async () => {
  const patch = (id, body) => call(signed(`${V}/orders/${id}`, { method: 'PATCH', body }));
  assert.equal((await patch(ORDER, { status: 'refunded' })).body.error.code, 'bad_request');
  assert.equal((await patch(ORDER, { status: 'fulfilled', notes: 'x' })).body.error.code, 'bad_request');
  const stale = await patch(ORDER, { status: 'cancelled', expectedRowVersion: 1 });
  assert.deepEqual([stale.status, stale.body.error.code, stale.body.current.id], [409, 'conflict', ORDER]);
  const version = Number(one(`SELECT row_version FROM orders WHERE id = '${ORDER_NOKEY}';`));
  const cancelled = await patch(ORDER_NOKEY, { status: 'cancelled', expectedRowVersion: version });
  assert.deepEqual([cancelled.status, cancelled.body.item.status, cancelled.body.item.row_version], [200, 'cancelled', version + 1]);
  assert.equal((await patch(ORDER_NOKEY, { status: 'confirmed' })).body.error.code, 'conflict');
  assert.equal((await patch(FOREIGN_ORDER, { status: 'fulfilled' })).body.error.code, 'not_found');
});

test('the licence email goes after the commit, to the order\'s email, with no key; a replay sends nothing', { skip }, async () => {
  assert.equal(sent.length, 1, 'the person test sent one');
  const [first] = sent;
  assert.equal(first.to, 'buyer@example.test');
  assert.ok(first.text.includes('Thing Pro') && first.text.includes('O-1'));
  assert.ok(!JSON.stringify(first).includes(KEY) && !JSON.stringify(first).includes('NEW-KEY-9999-WXYZ'), 'no key in the email');
  const idem = key16();
  const res = await call(signed(`${V}/orders/${ORDER}/notify-licence`, { method: 'POST', body: {}, idem }));
  assert.deepEqual([res.status, res.body.email, res.body.item.id], [200, 'sent', ORDER]);
  assert.ok(!res.text.includes(KEY));
  const again = await call(signed(`${V}/orders/${ORDER}/notify-licence`, { method: 'POST', body: {}, idem }));
  assert.deepEqual([again.status, again.body.email], [200, 'sending']);
  assert.equal(sent.length, 2, 'the replay sent nothing');
  // an order with no issued licence, or no email, is a conflict and sends nothing
  assert.equal((await call(signed(`${V}/orders/${ORDER_NOKEY}/notify-licence`, { method: 'POST', body: {} }))).body.error.code, 'conflict');
  assert.equal((await call(signed(`${V}/orders/${FOREIGN_ORDER}/notify-licence`, { method: 'POST', body: {} }))).body.error.code, 'not_found');
  assert.equal(sent.length, 2);
});

test('a failed send says so, and with Resend not set up the answer says that', async () => {
  assert.equal(await licenceMailer({}, async () => ({ sent: true }))({ to: 'a@example.test', items: [], vendors: [] }), 'not_configured');
  assert.equal(await licenceMailer({ RESEND_API_KEY: 'k', RESEND_FROM: 'f' }, async () => ({ sent: false }))(
    { to: 'a@example.test', reference: 'O-1', items: [{ offering_name: 'X' }], vendors: [] }), 'not_sent');
});

test('enquiries: a bad id or a service enquiry delete is not a route or not found; a lead delete keeps no personal data', { skip }, async () => {
  assert.equal((await call(signed(`${V}/enquiries/si-${FD}`, { method: 'PATCH', body: { status: 'closed' } }))).body.error.code, 'not_found');
  assert.equal((await call(signed(`${V}/enquiries/si-${SI}`, { method: 'DELETE' }))).status, 404);
  assert.equal((await call(signed(`${V}/enquiries/fd-${FD}`, { method: 'PATCH', body: { status: 'won' } }))).body.error.code, 'bad_request');
  const res = await call(signed(`${V}/enquiries/fd-${FD}`, { method: 'PATCH', body: { status: 'closed' } }));
  assert.deepEqual([res.body.item.id, res.body.item.status], [`fd-${FD}`, 'closed']);
  assert.equal(one(`SELECT count(*) FROM admin_bridge_change WHERE table_name IN ('front_door_leads', 'service_inquiries')
    AND (before::text LIKE '%@example.test%' OR after::text LIKE '%@example.test%');`), '0');
  assert.equal(one(`SELECT count(*) FROM admin_bridge_change WHERE table_name = 'front_door_leads' AND op = 'delete';`), '1');
  assert.equal((await call(signed(`${V}/enquiries/fd-${FD_GONE}`, { method: 'DELETE' }))).body.error.code, 'not_found');
});

test('client companies: a person sets a tier; a foreign tier, a slug in use or a blank name is refused', { skip }, async () => {
  const set = await call(signed(`${V}/customers/${ACME}`, { method: 'PATCH', body: { tierId: GOLD } }));
  assert.deepEqual([set.status, set.body.item.tier_id], [200, GOLD]);
  assert.equal((await call(signed(`${V}/customers/${ACME}`, { method: 'PATCH', body: { tierId: FOREIGN_TIER } }))).body.error.code, 'bad_request');
  assert.equal((await call(signed(`${V}/customers`, { method: 'POST', body: { name: 'Acme', slug: 'acme' } }))).body.error.code, 'conflict');
  assert.equal((await call(signed(`${V}/customers/${ACME}`, { method: 'PATCH', body: { name: '  ' } }))).body.error.code, 'bad_request');
  assert.equal((await call(signed(`${V}/customers/${FOREIGN}`, { method: 'PATCH', body: { notes: 'x' } }))).body.error.code, 'not_found');
  assert.equal((await call(signed(`${V}/customers/${ACME}`, { method: 'PATCH', body: { notes: 'x', expectedRowVersion: 1 } }))).body.error.code, 'conflict');
  const made = await call(signed(`${V}/customers`, { method: 'POST', body: { name: 'Delta Ltd', tierId: GOLD } }));
  assert.deepEqual([made.status, made.body.item.tier_id, made.body.item.slug], [201, GOLD, 'delta-ltd']);
});

test('timeline: new items are drafts; a status in the body is refused; another org\'s client is not found; the read key lists them', { skip }, async () => {
  assert.equal((await call(signed(`${V}/customers/${ACME}/engagements`, { method: 'POST', body: { title: 'X', status: 'shared' } }))).body.error.code, 'bad_request');
  assert.equal((await call(signed(`${V}/customers/${FOREIGN}/engagements`, { method: 'POST', body: { title: 'X' } }))).body.error.code, 'not_found');
  assert.equal((await call(signed(`${V}/customers/${ACME}/engagements`, { method: 'POST', body: { title: 'X', kind: 'deliverable' } }))).body.error.code, 'bad_request');
  const list = await call(signed(`${V}/engagements?customer=${ACME}`));
  assert.equal(list.status, 200, list.text);
  assert.ok(list.body.items.some((e) => e.id === SHARED && e.status === 'shared'));
  assert.ok(!list.body.items.some((e) => e.id === ENG), 'a deleted item is not listed');
  // a person may change a shared item
  assert.equal((await call(signed(`${V}/engagements/${SHARED}`, { method: 'PATCH', body: { title: 'Shared note (updated)' } }))).status, 200);
});

test('licences: no key in answers or the change log; a key or link is needed; another client\'s order is refused', { skip }, async () => {
  const res = await call(signed(`${V}/customers/${ACME}/licences`, { method: 'POST', body: { offeringName: 'Thing', licenceKey: 'ZZZZ-YYYY-XXXX-1234' } }));
  assert.equal(res.status, 201, res.text);
  assert.deepEqual([res.body.item.licence_key_last4, res.body.item.status], ['1234', 'issued']);
  assert.ok(!res.text.includes('ZZZZ-YYYY'));
  assert.equal(one(`SELECT count(*) FROM admin_bridge_change WHERE before::text LIKE '%KEY%' OR after::text LIKE '%KEY%'
    OR after::text LIKE '%ZZZZ%';`), '0');
  assert.equal((await call(signed(`${V}/customers/${ACME}/licences`, { method: 'POST', body: { offeringName: 'Thing' } }))).body.error.code, 'bad_request');
  assert.equal((await call(signed(`${V}/customers/${ACME}/licences`, { method: 'POST',
    body: { offeringName: 'Thing', licenceKey: 'K-0000-0000', orderId: FOREIGN_ORDER } }))).body.error.code, 'bad_request');
  const rekey = await call(signed(`${V}/licences/${LIC}`, { method: 'PATCH', body: { licenceKey: 'REKEY-0000-5678' } }));
  assert.deepEqual([rekey.status, rekey.body.item.licence_key_last4], [200, '5678']);
  assert.equal((await call(signed(`${V}/licences/${LIC}/reissue`, { method: 'POST', body: {} }))).body.error.code, 'conflict');
  const list = await call(signed(`${V}/licences?customer=${ACME}`));
  assert.ok(list.body.items.every((l) => Number.isInteger(l.row_version)) && !list.text.includes('REKEY'));
});

test('tiers: a slug in use is a conflict; another org\'s tier is not found', { skip }, async () => {
  assert.equal((await call(signed(`${V}/customer-tiers`, { method: 'POST', body: { slug: 'gold', name: 'Gold 2' } }))).body.error.code, 'conflict');
  assert.equal((await call(signed(`${V}/customer-tiers/${FOREIGN_TIER}`, { method: 'PATCH', body: { name: 'Mine' } }))).body.error.code, 'not_found');
});

test('send again: a sent receipt is a conflict, an unknown one not found', { skip }, async () => {
  assert.equal((await call(signed(`${V}/portal-acceptances/${ACC_SENT}/resend`, { method: 'POST', body: {} }))).body.error.code, 'conflict');
  assert.equal((await call(signed(`${V}/portal-acceptances/${DOC}/resend`, { method: 'POST', body: {} }))).body.error.code, 'not_found');
});

// ── the database roles ─────────────────────────────────────────────────────────────────────────────
let n = 0;
function as(role, q, { actor = JOHN } = {}) {
  const k = `a${String(++n).padStart(21, '0')}`;
  const open = role === 'gsam_bridge_write'
    ? `SELECT audit_id FROM admin_bridge_begin_write('stg-write-1', '${k}', extract(epoch FROM now())::bigint, '${actor}', NULL, 'PATCH', '/t', '${k.replace('a', 'i')}', '${'c'.repeat(64)}') \\gset\n`
      + `SELECT set_config('request.jwt.claims', replace('${JSON.stringify({ role: 'gsam_bridge', cap: 'write', org: ORG, kid: 'stg-write-1', audit: ':A' })}', ':A', :'audit_id'), true) \\g /dev/null\n`
    : '';
  const r = db.psql(`BEGIN;\nSET LOCAL ROLE ${role};\n${open}${q}\nROLLBACK;\n`);
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}

test('the write role cannot touch the tables directly; other roles cannot call the functions', { skip }, () => {
  for (const q of [`UPDATE orders SET status = 'refunded' WHERE id = '${ORDER}';`, `DELETE FROM front_door_leads;`,
    `UPDATE licence_keys SET status = 'revoked';`, `UPDATE engagements SET status = 'shared';`, `INSERT INTO customer_tiers (org_id, slug, name) VALUES ('${ORG}', 'x', 'X');`,
    `SELECT licence_key FROM licence_keys;`]) {
    assert.match(as('gsam_bridge_write', q).err, /permission denied/, q);
  }
  for (const role of ['gsam_bridge_read', 'gsam_bridge_refund', 'anon', 'authenticated']) {
    for (const f of [`bridge_order_set_status('${ORDER}', 'pending', NULL)`, `bridge_tier_create('{}')`, `bridge_receipt_requeue('${ACC}')`,
      `bridge_lead_delete('${FD}')`, `_bridge_licence_json('${ORG}', '${LIC}')`]) {
      assert.match(as(role, `SELECT ${f};`).err, /permission denied for function/, `${role} ${f}`);
    }
  }
  assert.match(as('gsam_bridge_read', 'SELECT licence_key FROM licence_keys;').err, /permission denied/);
});

test('no email address or licence key reaches the site log', { skip }, () => {
  const text = logs.join('\n');
  for (const s of ['@example.test', KEY, 'NEW-KEY', 'REKEY', 'ZZZZ']) assert.ok(!text.includes(s), s);
});

test('the rollback removes the functions, triggers and engagement reads, and the migration applies again', { skip }, () => {
  const dir = new URL('../database/migrations/072_bridge_commerce_settings/', import.meta.url).pathname;
  const count = () => sql(`SELECT count(*) FROM pg_proc WHERE proname IN ('bridge_order_set_status', 'bridge_order_licence_email',
    'bridge_enquiry_set_status', 'bridge_lead_delete', 'bridge_customer_create', 'bridge_customer_edit', 'bridge_engagement_create',
    'bridge_engagement_edit', 'bridge_engagement_set_status', 'bridge_engagement_delete', 'bridge_licence_issue', 'bridge_licence_edit',
    'bridge_licence_set_status', 'bridge_tier_create', 'bridge_tier_edit', 'bridge_receipt_requeue');`);
  sql(`\\i '${dir}rollback.sql'`);
  assert.equal(count(), '0');
  assert.equal(sql(`SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_admin_bridge_change' AND tgrelid = 'public.engagements'::regclass;`), '0');
  assert.equal(sql(`SELECT has_table_privilege('gsam_bridge_read', 'public.engagements', 'SELECT')
    OR has_column_privilege('gsam_bridge_read', 'public.engagements', 'title', 'SELECT');`), 'f');
  sql(`\\i '${dir}migration.sql'`);
  sql(`\\i '${dir}migration.sql'`);
  assert.equal(count(), '16');
});
