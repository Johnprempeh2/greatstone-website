// GSAM admin bridge, client users (GRE-2631, migration 054_gsam_bridge_client_users). Signed requests through
// makeAdminBridgeHandler on a throwaway real Postgres (lib/postgres.mjs): a create makes one Better Auth user (no
// password) and one membership, and a second create, a retry or two at once give the same ids; an existing user or a
// sales contact is linked, never duplicated; staff, a member of another organisation and an unknown organisation are
// refused, each with its audit row; the read by ids returns client users only and leaves the rest out; a write key
// cannot read, a read key cannot create, a replayed nonce is refused; the bridge roles cannot reach better_auth except
// through their own function; no email or name reaches the site log. Without the Postgres server binaries the suite
// is skipped, and says so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { SCHEME, SCHEME_V2, canonicalQuery, canonicalString, parseBridgeKeys } from '../functions/lib/admin-bridge-auth.mjs';
import { makeAdminBridgeHandler } from '../functions/admin-bridge.mjs';

const CONTRACT = JSON.parse(readFileSync(new URL('../../contracts/gs-bridge-v1/vectors.json', import.meta.url), 'utf8'));
const PRIVATE = createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(CONTRACT.key.seedHex, 'hex')]), format: 'der', type: 'pkcs8',
});
const KEYS = parseBridgeKeys(JSON.stringify([
  { kid: 'test-read-1', capability: 'read', publicKey: CONTRACT.key.publicKey },
  { kid: 'test-write-1', capability: 'write', publicKey: CONTRACT.key.publicKey },
]));
const CAP = { 'test-read-1': 'read', 'test-write-1': 'write' };
const ORIGIN = 'https://staging.example.test';
const AGENT = 'agent:d5651a41-e5e0-4512-8fb0-069815ff4278';
const key16 = () => randomBytes(16).toString('base64url');

function signed(path, { method = 'GET', kid = 'test-read-1', body = '', nonce = key16(), idem = key16(),
  time = Math.floor(Date.now() / 1000) } = {}) {
  const u = new URL(path, ORIGIN);
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const scheme = CAP[kid] === 'read' ? SCHEME : SCHEME_V2;
  const canonical = canonicalString({ scheme, method, host: u.host, path: u.pathname, query: canonicalQuery(u.searchParams),
    time, nonce, actor: AGENT, run: null, bodySha256: createHash('sha256').update(text, 'utf8').digest('hex'), idempotencyKey: idem });
  const headers = {
    'x-gs-bridge-key': kid, 'x-gs-bridge-time': String(time), 'x-gs-bridge-nonce': nonce, 'x-gs-bridge-actor': AGENT,
    'x-gs-bridge-signature': sign(null, Buffer.from(canonical, 'utf8'), PRIVATE).toString('base64url'),
    ...(scheme === SCHEME_V2 ? { 'x-gs-bridge-idempotency-key': idem } : {}),
  };
  return new Request(u, { method, headers, ...(method === 'GET' ? {} : { body: text }) });
}
const create = (org, body, opts = {}) => signed(`/api/admin/v1/customers/${org}/users`, { method: 'POST', kid: 'test-write-1', body, ...opts });
const read = (ids, opts = {}) => signed(`/api/admin/v1/users?ids=${ids.join(',')}`, opts);

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ACME = 'c0000000-0000-4000-8000-000000000001';
const BETA = 'c0000000-0000-4000-8000-000000000002';
const GONE = 'c0000000-0000-4000-8000-000000000003';
const FOREIGN = 'c0000000-0000-4000-8000-000000000004';
const EXISTING = 'b0000000-0000-4000-8000-000000000001'; // a Better Auth user with no membership
const BETA_USER = 'b0000000-0000-4000-8000-000000000002'; // a member of Beta
const STAFF_USER = 'b0000000-0000-4000-8000-000000000003'; // a staff sign-in
const SEEDED = 'd0000000-0000-4000-8000-000000000001'; // a contact sales added, with no sign-in
let db;
let pool;
let handler;
const logs = [];

before(async () => {
  if (skip) return;
  db = startPostgres('admin-bridge-client-users');
  await db.migrate('003');
  sql(`INSERT INTO organisations (id, slug, name, created_at) VALUES ('${ORG}', 'greatstone', 'Greatstone', now() - interval '1 day'),
    ('${OTHER}', 'other', 'Other org', now());`);
  await db.migrate();
  sql(`INSERT INTO customers (id, org_id, slug, name, deleted_at) VALUES ('${ACME}', '${ORG}', 'acme', 'Acme', NULL),
      ('${BETA}', '${ORG}', 'beta', 'Beta', NULL), ('${GONE}', '${ORG}', 'gone', 'Gone', now()),
      ('${FOREIGN}', '${OTHER}', 'foreign', 'Foreign', NULL);
    INSERT INTO better_auth."user" ("id", "name", "email") VALUES ('${EXISTING}', 'Ex Isting', 'existing@example.test'),
      ('${BETA_USER}', 'Bea Member', 'bea@example.test'), ('${STAFF_USER}', 'Staff Person', 'staff@example.test');
    INSERT INTO users (org_id, email, role, auth_subject) VALUES ('${ORG}', 'staff@example.test', 'admin', '${STAFF_USER}'),
      ('${ORG}', 'nosignin@example.test', 'viewer', NULL);
    INSERT INTO customer_users (org_id, customer_id, email, full_name, auth_subject) VALUES ('${ORG}', '${BETA}', 'bea@example.test', 'Bea', '${BETA_USER}');
    INSERT INTO customer_users (id, org_id, customer_id, email, full_name) VALUES ('${SEEDED}', '${ORG}', '${ACME}', 'seeded@example.test', 'Seeded Contact');`);
  pool = new pg.Pool({ connectionString: db.url, max: 4 });
  handler = makeAdminBridgeHandler({ pool: () => pool, keys: KEYS, allowedIps: new Set(), log: (m) => logs.push(m) });
});

after(async () => { await pool?.end(); db?.stop(); });

const call = async (req) => { const res = await handler(req); return { status: res.status, body: await res.json() }; };
function sql(q) { const r = db.psql(q); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); }
const audit = (nonce) => sql(`SELECT capability || ' ' || method || ' ' || coalesce(resource, '-') || ' ' || coalesce(resource_id, '-') || ' ' || outcome
  FROM admin_bridge_audit WHERE nonce = '${nonce}';`);
const count = (email) => sql(`SELECT (SELECT count(*) FROM better_auth."user" WHERE lower("email") = '${email}') || ' '
  || (SELECT count(*) FROM customer_users WHERE email = '${email}' AND deleted_at IS NULL);`);

test('a create makes one Better Auth user with no password and one membership; a second create returns the same ids', { skip }, async () => {
  const nonce = key16();
  const first = await call(create(ACME, { email: 'Ann.Client@Example.test ', name: 'Ann Client' }, { nonce }));
  assert.equal(first.status, 201);
  assert.deepEqual(Object.keys(first.body).sort(), ['membershipId', 'organisationId', 'userId']);
  const { userId, organisationId, membershipId } = first.body;
  assert.equal(organisationId, ACME);
  // the Better Auth user: lower-cased email, not verified, no credential account; auth.users kept in step (002)
  assert.equal(sql(`SELECT "email" || ' ' || "name" || ' ' || "emailVerified" FROM better_auth."user" WHERE "id" = '${userId}';`),
    'ann.client@example.test Ann Client false');
  assert.equal(sql(`SELECT count(*) FROM better_auth."account" WHERE "userId" = '${userId}';`), '0');
  assert.equal(sql(`SELECT email FROM auth.users WHERE id = '${userId}';`), 'ann.client@example.test');
  assert.equal(sql(`SELECT customer_id || ' ' || auth_subject || ' ' || role || ' ' || is_primary FROM customer_users WHERE id = '${membershipId}';`),
    `${ACME} ${userId} member false`);
  // one audit row naming the membership, and the change row with it
  assert.equal(audit(nonce), `write POST customer-users ${membershipId} ok`);
  assert.equal(sql(`SELECT count(*) || ' ' || min(c.table_name) || ' ' || min(c.op) FROM admin_bridge_change c
    JOIN admin_bridge_audit a ON a.id = c.audit_id WHERE a.nonce = '${nonce}';`), '1 customer_users insert');

  // again, with a new idempotency key and another case: the same ids, nothing written
  const again = await call(create(ACME, { email: 'ann.client@example.test', name: 'Someone Else' }));
  assert.deepEqual([again.status, again.body], [200, first.body]);
  assert.equal(count('ann.client@example.test'), '1 1');
  assert.equal(sql(`SELECT "name" FROM better_auth."user" WHERE "id" = '${userId}';`), 'Ann Client');
});

test('a retry with the same idempotency key replays the answer; two creates at once give one user and one membership', { skip }, async () => {
  const idem = key16();
  const body = { email: 'retry@example.test', name: 'Re Try' };
  const first = await call(create(ACME, body, { idem }));
  const nonce = key16();
  const retry = await call(create(ACME, body, { idem, nonce }));
  assert.deepEqual([first.status, retry.status, retry.body], [201, 201, first.body]);
  assert.match(audit(nonce), / replayed$/);
  // another body under the same key is a mismatch, and writes nothing
  const other = await call(create(ACME, { email: 'other@example.test', name: 'Other' }, { idem }));
  assert.deepEqual([other.status, other.body.error.code], [409, 'idempotency_mismatch']);
  assert.equal(count('other@example.test'), '0 0');

  const both = await Promise.all([1, 2].map(() => call(create(BETA, { email: 'race@example.test', name: 'Ra Ce' }))));
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 201]);
  assert.deepEqual(both[0].body, both[1].body);
  assert.equal(count('race@example.test'), '1 1');
});

test('an existing user gets the membership only; a sales contact is linked, not duplicated', { skip }, async () => {
  const existing = await call(create(ACME, { email: 'existing@example.test', name: 'Ignored' }));
  assert.deepEqual([existing.status, existing.body.userId], [201, EXISTING]);
  assert.equal(count('existing@example.test'), '1 1');
  assert.equal(sql(`SELECT customer_id FROM customer_users WHERE auth_subject = '${EXISTING}';`), ACME);

  const seeded = await call(create(ACME, { email: 'seeded@example.test', name: 'New Name' }));
  assert.equal(seeded.status, 201);
  assert.equal(seeded.body.membershipId, SEEDED);
  assert.equal(sql(`SELECT auth_subject || ' ' || full_name FROM customer_users WHERE id = '${SEEDED}';`), `${seeded.body.userId} Seeded Contact`);
  assert.equal(count('seeded@example.test'), '1 1');

  // a removed membership comes back as the same row
  sql(`UPDATE customer_users SET deleted_at = now() WHERE id = '${SEEDED}';`);
  const back = await call(create(ACME, { email: 'seeded@example.test', name: 'New Name' }));
  assert.deepEqual([back.status, back.body.membershipId, back.body.userId], [201, SEEDED, seeded.body.userId]);
  assert.equal(count('seeded@example.test'), '1 1');
});

test('refused: staff, a member of another organisation, an unknown organisation and a bad body, each audited', { skip }, async () => {
  const refused = async (org, body) => {
    const nonce = key16();
    const r = await call(create(org, body, { nonce }));
    return `${r.status} ${r.body.error?.code} | ${audit(nonce).split(' ').pop()}`;
  };
  // staff never become client users, with or without a sign-in
  assert.equal(await refused(ACME, { email: 'staff@example.test', name: 'S' }), '409 conflict | conflict');
  assert.equal(await refused(ACME, { email: 'NoSignIn@example.test', name: 'S' }), '409 conflict | conflict');
  assert.equal(count('nosignin@example.test'), '0 0');
  // one live membership per user in the tenant, so a member of Beta cannot join Acme
  assert.equal(await refused(ACME, { email: 'bea@example.test', name: 'B' }), '409 conflict | conflict');
  assert.equal(await refused(GONE, { email: 'new1@example.test', name: 'N' }), '404 not_found | not_found');
  assert.equal(await refused(FOREIGN, { email: 'new1@example.test', name: 'N' }), '404 not_found | not_found');
  assert.equal(await refused('c0000000-0000-4000-8000-00000000ffff', { email: 'new1@example.test', name: 'N' }), '404 not_found | not_found');
  assert.equal(await refused('not-a-uuid', { email: 'new1@example.test', name: 'N' }), '404 not_found | not_found');
  assert.equal(count('new1@example.test'), '0 0');
  for (const body of [{ email: 'new2@example.test' }, { name: 'N' }, { email: 'not an email', name: 'N' },
    { email: 'new2@example.test', name: '   ' }, { email: 'new2@example.test', name: 'N', role: 'admin' },
    { email: 'new2@example.test', name: 'N', password: 'x' }]) {
    assert.equal(await refused(ACME, body), '400 bad_request | bad_request', JSON.stringify(body));
  }
  assert.equal(count('new2@example.test'), '0 0');
  // only POST: no other method on the route, and no query string on a write
  assert.equal((await call(signed(`/api/admin/v1/customers/${ACME}/users`, { method: 'PATCH', kid: 'test-write-1', body: '{}' }))).status, 404);
  assert.equal((await call(signed(`/api/admin/v1/customers/${ACME}/users?x=1`, { method: 'POST', kid: 'test-write-1', body: '{}' }))).status, 400);
});

test('the read by ids returns client users with their memberships and leaves every other id out', { skip }, async () => {
  const made = await call(create(BETA, { email: 'reader@example.test', name: 'Rea Der' }));
  const unknown = 'b0000000-0000-4000-8000-00000000ffff';
  const nonce = key16();
  const res = await call(read([made.body.userId.toUpperCase(), BETA_USER, unknown, STAFF_USER, BETA_USER], { nonce }));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map((u) => [u.id, u.email, u.name]).sort(),
    [[BETA_USER, 'bea@example.test', 'Bea Member'], [made.body.userId, 'reader@example.test', 'Rea Der']].sort());
  const reader = res.body.items.find((u) => u.id === made.body.userId);
  assert.deepEqual(reader.memberships, [{ organisationId: BETA, membershipId: made.body.membershipId }]);
  assert.deepEqual(Object.keys(reader).sort(), ['email', 'id', 'memberships', 'name']);
  assert.equal(audit(nonce), 'read GET users - ok');
  // a user whose only membership is removed, or whose organisation is removed, is left out
  sql(`UPDATE customers SET deleted_at = now() WHERE id = '${BETA}';`);
  assert.deepEqual((await call(read([made.body.userId, BETA_USER]))).body.items, []);
  sql(`UPDATE customers SET deleted_at = NULL WHERE id = '${BETA}';`);
  // only ids, 1 to 100 uuids, one ids parameter
  const ids = Array.from({ length: 100 }, (_, i) => `e0000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  assert.deepEqual(await call(read(ids)), { status: 200, body: { items: [] } });
  const code = async (req) => { const r = await call(req); return `${r.status} ${r.body.error?.code}`; };
  assert.equal(await code(read([...ids, unknown])), '400 bad_request');
  assert.equal(await code(read(['nope'])), '400 bad_request');
  assert.equal(await code(read([])), '400 bad_request');
  assert.equal(await code(signed('/api/admin/v1/users')), '400 bad_request');
  assert.equal(await code(signed(`/api/admin/v1/users?ids=${BETA_USER}&ids=${unknown}`)), '400 bad_request');
  assert.equal(await code(signed(`/api/admin/v1/users?ids=${BETA_USER}&email=bea@example.test`)), '400 bad_request');
  assert.equal(await code(signed(`/api/admin/v1/users/${BETA_USER}`)), '404 not_found');
});

test('a write key cannot read users, a read key cannot create, and a replayed nonce is refused', { skip }, async () => {
  const code = async (req) => { const r = await call(req); return `${r.status} ${r.body.error?.code}`; };
  assert.equal(await code(read([BETA_USER], { kid: 'test-write-1' })), '403 capability_denied');
  assert.equal(await code(signed(`/api/admin/v1/customers/${ACME}/users`, { method: 'POST', body: '{"email":"k@example.test","name":"K"}' })),
    '403 capability_denied');
  assert.equal(count('k@example.test'), '0 0');

  const first = create(ACME, { email: 'replay@example.test', name: 'Re Play' });
  const again = new Request(first.url, { method: 'POST', headers: first.headers, body: '{"email":"replay@example.test","name":"Re Play"}' });
  assert.equal(await code(first), '201 undefined');
  assert.equal(await code(again), '401 replay');
  const r1 = read([BETA_USER]);
  assert.equal(await code(r1), '200 undefined');
  assert.equal(await code(new Request(r1.url, { headers: r1.headers })), '401 replay');
});

test('the bridge roles reach better_auth only through their own function', { skip }, () => {
  const as = (role, q, claims = null) => db.psql(`BEGIN; SET LOCAL ROLE ${role};
    ${claims ? `SELECT set_config('request.jwt.claims', '${JSON.stringify(claims)}', true) \\g /dev/null` : ''}
    ${q}
    ROLLBACK;`);
  for (const role of ['gsam_bridge_read', 'gsam_bridge_write', 'gsam_bridge_refund', 'anon', 'authenticated']) {
    assert.match(as(role, 'SELECT count(*) FROM better_auth."user";').stderr, /permission denied/, role);
  }
  for (const role of ['gsam_bridge_read', 'gsam_bridge_refund', 'anon', 'authenticated', 'service_role']) {
    assert.match(as(role, `SELECT bridge_create_client_user('${ACME}', 'x@example.test', 'X');`).stderr, /permission denied/, role);
  }
  for (const role of ['gsam_bridge_write', 'gsam_bridge_refund', 'anon', 'authenticated', 'service_role']) {
    assert.match(as(role, `SELECT bridge_client_users(ARRAY['${BETA_USER}']::uuid[]);`).stderr, /permission denied/, role);
  }
  // the write function needs an open write audit row; the read function needs read claims
  assert.match(as('gsam_bridge_write', `SELECT bridge_create_client_user('${ACME}', 'x@example.test', 'X');`,
    { role: 'gsam_bridge', cap: 'write', org: ORG }).stderr, /no open bridge audit row/);
  const readAs = (claims) => as('gsam_bridge_read', `SELECT bridge_client_users(ARRAY['${BETA_USER}']::uuid[]);`, claims).stdout.trim();
  assert.equal(readAs(null), '[]');
  assert.equal(readAs({ role: 'gsam_bridge', cap: 'write', org: ORG }), '[]');
  assert.equal(readAs({ role: 'gsam_bridge', cap: 'read', org: OTHER }), '[]');
  assert.match(readAs({ role: 'gsam_bridge', cap: 'read', org: ORG }), /bea@example\.test/);
});

test('no email or name reaches the site log', { skip }, () => {
  const text = logs.join('\n');
  for (const s of ['@example.test', 'Ann Client', 'Rea Der', 'Bea']) assert.equal(text.includes(s), false, s);
});
