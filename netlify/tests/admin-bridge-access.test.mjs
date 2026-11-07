// GSAM admin bridge, people and access (GRE-4082, migration 066_bridge_people_access). Signed requests through
// makeAdminBridgeHandler on a throwaway real Postgres (lib/postgres.mjs) prove each route: the read key lists staff,
// portal approvers and one client organisation's members; a person changes a staff role, adds and removes a portal
// approver, and adds, re-roles and removes a client member, each with an audit row naming the person and a change
// row. An agent (and a system actor) is refused on every change, by the site function and again by the database.
// Then the guards (last owner, approver needs an active sign-in, another organisation's rows), the database roles,
// and the rollback. Without the Postgres server binaries the database tests are skipped, and say so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { SCHEME, SCHEME_V2, canonicalQuery, canonicalString, parseBridgeKeys } from '../functions/lib/admin-bridge-auth.mjs';
import { makeAdminBridgeHandler } from '../functions/admin-bridge.mjs';
import { writeRoute } from '../functions/lib/admin-bridge-write.mjs';

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
const CAP = { 'test-read-1': 'read', 'test-write-1': 'write', 'test-refund-1': 'refund_request' };
const ORIGIN = 'https://staging.example.test';
const AGENT = 'agent:d5651a41-e5e0-4512-8fb0-069815ff4278';
const SYSTEM = 'system:gsam-sync';
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
// staff: the owner and a second owner (both with sign-ins), an admin, a viewer with no sign-in, an inactive editor,
// and one staff member of the other organisation
const OWNER = 'a1000000-0000-4000-8000-000000000001';
const OWNER2 = 'a1000000-0000-4000-8000-000000000002';
const ADMIN = 'a1000000-0000-4000-8000-000000000003';
const NOSIGNIN = 'a1000000-0000-4000-8000-000000000004';
const INACTIVE = 'a1000000-0000-4000-8000-000000000005';
const FOREIGN_STAFF = 'a1000000-0000-4000-8000-000000000006';
const AUTH = (n) => `c1000000-0000-4000-8000-00000000000${n}`;
const ACME = 'b7000000-0000-4000-8000-000000000001';
const GONE = 'b7000000-0000-4000-8000-000000000002';
const FOREIGN = 'b7000000-0000-4000-8000-000000000003';
const BEA = 'd0000000-0000-4000-8000-000000000001'; // a member of Acme
const FOREIGN_MEMBER = 'd0000000-0000-4000-8000-000000000002';
const A = '/api/admin/v1/access';
let db;
let pool;
let handler;
const logs = [];

before(async () => {
  if (skip) return;
  db = startPostgres('admin-bridge-access');
  await db.migrate('003');
  sql(`INSERT INTO organisations (id, slug, name, created_at) VALUES ('${ORG}', 'greatstone', 'Greatstone', now() - interval '1 day'),
    ('${OTHER}', 'other', 'Other org', now());`);
  await db.migrate();
  sql(`INSERT INTO better_auth."user" ("id", "name", "email") VALUES ('${AUTH(1)}', 'Olive Owner', 'owner@example.test'),
      ('${AUTH(2)}', 'Otto Owner', 'owner2@example.test'), ('${AUTH(3)}', 'Ada Admin', 'admin@example.test'),
      ('${AUTH(5)}', 'Ian Inactive', 'inactive@example.test'), ('${AUTH(6)}', 'Fay Foreign', 'foreign@example.test'),
      ('${AUTH(7)}', 'Bea Member', 'bea@example.test');
    INSERT INTO users (id, org_id, email, full_name, role, auth_subject, is_active) VALUES
      ('${OWNER}', '${ORG}', 'owner@example.test', 'Olive Owner', 'owner', '${AUTH(1)}', true),
      ('${OWNER2}', '${ORG}', 'owner2@example.test', 'Otto Owner', 'owner', '${AUTH(2)}', true),
      ('${ADMIN}', '${ORG}', 'admin@example.test', 'Ada Admin', 'admin', '${AUTH(3)}', true),
      ('${NOSIGNIN}', '${ORG}', 'nosignin@example.test', 'No Signin', 'viewer', NULL, true),
      ('${INACTIVE}', '${ORG}', 'inactive@example.test', 'Ian Inactive', 'editor', '${AUTH(5)}', false),
      ('${FOREIGN_STAFF}', '${OTHER}', 'foreign@example.test', 'Fay Foreign', 'owner', '${AUTH(6)}', true);
    INSERT INTO portal_approvers (auth_user_id, label) VALUES ('${AUTH(1)}', 'Olive'), ('${AUTH(6)}', 'Fay');
    INSERT INTO customers (id, org_id, slug, name, deleted_at) VALUES ('${ACME}', '${ORG}', 'acme', 'Acme', NULL),
      ('${GONE}', '${ORG}', 'gone', 'Gone', now()), ('${FOREIGN}', '${OTHER}', 'foreign', 'Foreign', NULL);
    INSERT INTO customer_users (id, org_id, customer_id, email, full_name, auth_subject, role) VALUES
      ('${BEA}', '${ORG}', '${ACME}', 'bea@example.test', 'Bea Member', '${AUTH(7)}', 'member'),
      ('${FOREIGN_MEMBER}', '${OTHER}', '${FOREIGN}', 'fm@example.test', 'Foreign Member', NULL, 'member');`);
  pool = new pg.Pool({ connectionString: db.url, max: 4 });
  handler = makeAdminBridgeHandler({ pool: () => pool, keys: KEYS, allowedIps: new Set(), log: (m) => logs.push(m), stripe: () => 'test' });
});

after(async () => { await pool?.end(); db?.stop(); });

const call = async (req) => { const res = await handler(req); const text = await res.text(); return { status: res.status, body: JSON.parse(text), text }; };
function sql(q) { const r = db.psql(q); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); }
const auditOf = (nonce) => sql(`SELECT capability || ' ' || method || ' ' || coalesce(resource, '-') || ' ' || coalesce(resource_id, '-')
  || ' ' || outcome || ' ' || actor_type || ':' || actor_id FROM admin_bridge_audit WHERE nonce = '${nonce}';`);
const changes = (nonce) => sql(`SELECT coalesce(string_agg(c.table_name || ' ' || c.op, ',' ORDER BY c.id), '') FROM admin_bridge_change c
  JOIN admin_bridge_audit a ON a.id = c.audit_id WHERE a.nonce = '${nonce}';`);
// every staff role, approver and membership, and the sign-in count, as one string
const everyone = () => sql(`SELECT (SELECT string_agg(id::text || role::text || is_active::text, ',' ORDER BY id) FROM users) || '|'
  || (SELECT string_agg(auth_user_id::text || label, ',' ORDER BY auth_user_id) FROM portal_approvers) || '|'
  || (SELECT string_agg(id::text || role || coalesce(deleted_at::text, '-'), ',' ORDER BY id) FROM customer_users)
  || '|' || (SELECT count(*) FROM better_auth."user");`);
const roleOf = (id) => sql(`SELECT role FROM users WHERE id = '${id}';`);

// ── the routes ─────────────────────────────────────────────────────────────────────────────────────
test('the change routes are write routes, people only; other shapes are not routes', () => {
  for (const [method, parts] of [['PATCH', ['access', 'staff', OWNER]], ['PUT', ['access', 'portal-approvers', ADMIN]],
    ['DELETE', ['access', 'portal-approvers', ADMIN]], ['POST', ['access', 'clients', ACME, 'members']],
    ['PATCH', ['access', 'clients', ACME, 'members', BEA]], ['DELETE', ['access', 'clients', ACME, 'members', BEA]]]) {
    const r = writeRoute(method, parts);
    assert.deepEqual([r?.capability, r?.people], ['write', true], `${method} ${parts.join('/')}`);
  }
  for (const [method, parts] of [['DELETE', ['access', 'staff', OWNER]], ['POST', ['access', 'staff']],
    ['PATCH', ['access', 'portal-approvers', ADMIN]], ['PUT', ['access', 'clients', ACME, 'members']],
    ['POST', ['access', 'clients', ACME, 'members', BEA]], ['PATCH', ['access', 'staff', OWNER, 'x']],
    ['PATCH', ['access', 'clients', ACME, 'members', BEA, 'x']], ['PATCH', ['access', 'other', OWNER]]]) {
    assert.equal(writeRoute(method, parts), null, `${method} ${parts.join('/')}`);
  }
});

test('the read key lists staff with their role and approver flag, and nothing of another organisation', { skip }, async () => {
  const nonce = key16();
  const res = await call(signed(`${A}/staff`, { nonce, actor: AGENT }));
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.nextCursor, null);
  assert.deepEqual(res.body.items.map((s) => [s.email, s.role, s.isActive, s.canSignIn, s.portalApprover]), [
    ['admin@example.test', 'admin', true, true, false], ['inactive@example.test', 'editor', false, true, false],
    ['nosignin@example.test', 'viewer', true, false, false], ['owner2@example.test', 'owner', true, true, false],
    ['owner@example.test', 'owner', true, true, true]]);
  assert.deepEqual(Object.keys(res.body.items[0]).sort(),
    ['canSignIn', 'email', 'id', 'isActive', 'lastLoginAt', 'name', 'portalApprover', 'role', 'updatedAt']);
  assert.ok(!res.text.includes(AUTH(1)), 'no sign-in id in the answer');
  assert.equal(auditOf(nonce), `read GET access-staff - ok agent:d5651a41-e5e0-4512-8fb0-069815ff4278`);
});

test('the read key lists portal approvers of this organisation only', { skip }, async () => {
  const res = await call(signed(`${A}/portal-approvers`));
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.body.items.map((r) => [r.staffId, r.email, r.label, r.staffActive]), [[OWNER, 'owner@example.test', 'Olive', true]]);
});

test('the read key lists one client organisation\'s members; another organisation\'s, a deleted one or a bad id is not found', { skip }, async () => {
  const res = await call(signed(`${A}/clients/${ACME}/members`));
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.body.items.map((m) => [m.membershipId, m.organisationId, m.email, m.role, m.isPrimary]),
    [[BEA, ACME, 'bea@example.test', 'member', false]]);
  for (const id of [FOREIGN, GONE, 'not-a-uuid']) {
    const r = await call(signed(`${A}/clients/${id}/members`));
    assert.deepEqual([r.status, r.body], [404, { error: { code: 'not_found' } }], id);
  }
  const q = await call(signed(`${A}/staff?limit=5`));
  assert.deepEqual([q.status, q.body.error.code], [400, 'bad_request']);
  assert.equal((await call(signed(`${A}/nothing`))).status, 404);
});

// ── agents are refused on every change ─────────────────────────────────────────────────────────────
const CHANGES = [
  ['PATCH', `${A}/staff/${ADMIN}`, { role: 'viewer' }],
  ['PUT', `${A}/portal-approvers/${ADMIN}`, { label: 'Ada' }],
  ['DELETE', `${A}/portal-approvers/${OWNER}`, ''],
  ['POST', `${A}/clients/${ACME}/members`, { email: 'agent-made@example.test', name: 'Agent Made', role: 'admin' }],
  ['PATCH', `${A}/clients/${ACME}/members/${BEA}`, { role: 'admin' }],
  ['DELETE', `${A}/clients/${ACME}/members/${BEA}`, ''],
];

test('an agent or a system actor is refused every access change: 403 denied, audited, nothing changed', { skip }, async () => {
  const before = everyone();
  for (const actor of [AGENT, SYSTEM]) {
    for (const [method, path, body] of CHANGES) {
      const nonce = key16();
      const res = await call(signed(path, { method, body, actor, nonce }));
      assert.deepEqual([res.status, res.body], [403, { error: { code: 'denied' } }], `${actor} ${method} ${path}`);
      assert.match(auditOf(nonce), new RegExp(`^write ${method} access-[a-z-]+ [0-9a-f-]{36} denied ${actor}$`), `${method} ${path}`);
      assert.equal(changes(nonce), '');
    }
  }
  assert.equal(everyone(), before);
});

test('the read and refund keys cannot make an access change', { skip }, async () => {
  for (const kid of ['test-read-1', 'test-refund-1']) {
    for (const [method, path, body] of CHANGES) {
      const res = await call(signed(path, { method, body, kid }));
      assert.deepEqual([res.status, res.body.error.code], [403, 'capability_denied'], `${kid} ${method} ${path}`);
    }
  }
});

// ── a person makes each change ─────────────────────────────────────────────────────────────────────
test('a person changes a staff role: 200, the staff member, audit and change rows; the same role again changes nothing', { skip }, async () => {
  const nonce = key16();
  const res = await call(signed(`${A}/staff/${ADMIN}`, { method: 'PATCH', body: { role: 'editor' }, nonce }));
  assert.equal(res.status, 200, res.text);
  assert.deepEqual([res.body.item.id, res.body.item.role], [ADMIN, 'editor']);
  assert.equal(roleOf(ADMIN), 'editor');
  assert.equal(auditOf(nonce), `write PATCH access-staff ${ADMIN} ok ${JOHN}`);
  assert.equal(changes(nonce), 'users update');
  const again = key16();
  assert.equal((await call(signed(`${A}/staff/${ADMIN}`, { method: 'PATCH', body: { role: 'editor' }, nonce: again }))).status, 200);
  assert.equal(changes(again), '');
});

test('a staff role change is refused for a bad role, an unknown or foreign staff member, and the last active owner', { skip }, async () => {
  const patch = (id, body) => call(signed(`${A}/staff/${id}`, { method: 'PATCH', body }));
  assert.deepEqual((await patch(ADMIN, { role: 'superuser' })).body.error.code, 'bad_request');
  assert.deepEqual((await patch(ADMIN, {})).body.error.code, 'bad_request');
  assert.deepEqual((await patch(ADMIN, { role: 'viewer', isActive: false })).body.error.code, 'bad_request');
  assert.deepEqual((await patch(FOREIGN_STAFF, { role: 'viewer' })).body.error.code, 'not_found');
  assert.deepEqual((await patch('a1000000-0000-4000-8000-0000000000ff', { role: 'viewer' })).body.error.code, 'not_found');
  // two owners: one may step down, then the other is the last and may not
  const first = await patch(OWNER2, { role: 'admin' });
  assert.equal(first.status, 200, first.text);
  const last = await patch(OWNER, { role: 'admin' });
  assert.deepEqual([last.status, last.body.error.code], [409, 'conflict']);
  assert.equal(roleOf(OWNER), 'owner');
  // an inactive owner does not count as the other owner
  sql(`UPDATE users SET role = 'owner', is_active = false WHERE id = '${OWNER2}';`);
  assert.equal((await patch(OWNER, { role: 'admin' })).status, 409);
  sql(`UPDATE users SET role = 'owner', is_active = true WHERE id = '${OWNER2}';`);
  assert.equal(roleOf(FOREIGN_STAFF), 'owner');
});

test('a person adds a portal approver (201), changes the label (200) and removes them; each is logged with the person', { skip }, async () => {
  const put = key16();
  const added = await call(signed(`${A}/portal-approvers/${ADMIN}`, { method: 'PUT', body: { label: 'Ada' }, nonce: put }));
  assert.equal(added.status, 201, added.text);
  assert.deepEqual([added.body.item.staffId, added.body.item.label], [ADMIN, 'Ada']);
  assert.equal(sql(`SELECT label FROM portal_approvers WHERE auth_user_id = '${AUTH(3)}';`), 'Ada');
  assert.equal(auditOf(put), `write PUT access-portal-approvers ${ADMIN} ok ${JOHN}`);
  assert.equal(changes(put), 'portal_approvers insert');

  const relabel = key16();
  const renamed = await call(signed(`${A}/portal-approvers/${ADMIN}`, { method: 'PUT', body: { label: ' Ada L ' }, nonce: relabel }));
  assert.deepEqual([renamed.status, renamed.body.item.label], [200, 'Ada L']);
  assert.equal(changes(relabel), 'portal_approvers update');

  const del = key16();
  const removed = await call(signed(`${A}/portal-approvers/${ADMIN}`, { method: 'DELETE', nonce: del }));
  assert.deepEqual([removed.status, removed.body], [200, { staffId: ADMIN, removed: true }]);
  assert.equal(sql(`SELECT count(*) FROM portal_approvers WHERE auth_user_id = '${AUTH(3)}';`), '0');
  assert.equal(changes(del), 'portal_approvers delete');
  assert.equal(sql(`SELECT c.before ->> 'label' FROM admin_bridge_change c JOIN admin_bridge_audit a ON a.id = c.audit_id
    WHERE a.nonce = '${del}';`), 'Ada L');
  const again = await call(signed(`${A}/portal-approvers/${ADMIN}`, { method: 'DELETE' }));
  assert.deepEqual([again.status, again.body.error.code], [404, 'not_found']);
});

test('a portal approver must be active staff of this organisation with a sign-in', { skip }, async () => {
  const put = (id, body = { label: 'X' }) => call(signed(`${A}/portal-approvers/${id}`, { method: 'PUT', body }));
  assert.deepEqual((await put(NOSIGNIN)).body.error.code, 'conflict');
  assert.deepEqual((await put(INACTIVE)).body.error.code, 'conflict');
  assert.deepEqual((await put(FOREIGN_STAFF)).body.error.code, 'not_found');
  assert.deepEqual((await put(ADMIN, { label: '   ' })).body.error.code, 'bad_request');
  assert.deepEqual((await put(ADMIN, { label: 'x'.repeat(101) })).body.error.code, 'bad_request');
  // another organisation's approver cannot be removed from here
  const foreign = await call(signed(`${A}/portal-approvers/${FOREIGN_STAFF}`, { method: 'DELETE' }));
  assert.deepEqual([foreign.status, foreign.body.error.code], [404, 'not_found']);
  assert.equal(sql(`SELECT label FROM portal_approvers WHERE auth_user_id = '${AUTH(6)}';`), 'Fay');
});

test('a person adds a client member with a role (201), the same add again is 200, another role is a conflict', { skip }, async () => {
  const nonce = key16();
  const add = (body, opts = {}) => call(signed(`${A}/clients/${ACME}/members`, { method: 'POST', body, ...opts }));
  const res = await add({ email: 'Cara.Client@Example.test', name: 'Cara Client', role: 'admin' }, { nonce });
  assert.equal(res.status, 201, res.text);
  const { item } = res.body;
  assert.deepEqual([item.organisationId, item.email, item.name, item.role], [ACME, 'cara.client@example.test', 'Cara Client', 'admin']);
  assert.match(item.userId, /^[0-9a-f-]{36}$/);
  assert.equal(auditOf(nonce), `write POST access-members ${ACME} ok ${JOHN}`);
  assert.equal(changes(nonce), 'customer_users insert,customer_users update');
  const same = await add({ email: 'cara.client@example.test', name: 'Cara Client', role: 'admin' });
  assert.deepEqual([same.status, same.body.item.membershipId], [200, item.membershipId]);
  const other = await add({ email: 'cara.client@example.test', name: 'Cara Client', role: 'member' });
  assert.deepEqual([other.status, other.body.error.code], [409, 'conflict']);
  // refused: a staff email, a bad role, a deleted or foreign client organisation
  assert.equal((await add({ email: 'admin@example.test', name: 'Ada', role: 'member' })).body.error.code, 'conflict');
  assert.equal((await add({ email: 'x@example.test', name: 'X', role: 'owner' })).body.error.code, 'bad_request');
  assert.equal((await add({ email: 'x@example.test', name: 'X' })).body.error.code, 'bad_request');
  for (const id of [GONE, FOREIGN]) {
    const r = await call(signed(`${A}/clients/${id}/members`, { method: 'POST', body: { email: 'y@example.test', name: 'Y', role: 'member' } }));
    assert.equal(r.body.error.code, 'not_found', id);
  }
});

test('a person changes a member\'s role and removes them; the membership is checked against the client in the path', { skip }, async () => {
  const set = key16();
  const res = await call(signed(`${A}/clients/${ACME}/members/${BEA}`, { method: 'PATCH', body: { role: 'admin' }, nonce: set }));
  assert.deepEqual([res.status, res.body.item.membershipId, res.body.item.role], [200, BEA, 'admin']);
  assert.equal(auditOf(set), `write PATCH access-members ${BEA} ok ${JOHN}`);
  assert.equal(changes(set), 'customer_users update');
  assert.equal((await call(signed(`${A}/clients/${ACME}/members/${BEA}`, { method: 'PATCH', body: { role: 'boss' } }))).body.error.code, 'bad_request');
  // the wrong client in the path, or another organisation's member
  assert.equal((await call(signed(`${A}/clients/${GONE}/members/${BEA}`, { method: 'PATCH', body: { role: 'member' } }))).body.error.code, 'not_found');
  assert.equal((await call(signed(`${A}/clients/${FOREIGN}/members/${FOREIGN_MEMBER}`, { method: 'DELETE' }))).body.error.code, 'not_found');

  const del = key16();
  const removed = await call(signed(`${A}/clients/${ACME}/members/${BEA}`, { method: 'DELETE', nonce: del }));
  assert.deepEqual([removed.status, removed.body], [200, { membershipId: BEA, organisationId: ACME, removed: true }]);
  assert.equal(sql(`SELECT deleted_at IS NOT NULL FROM customer_users WHERE id = '${BEA}';`), 't');
  assert.equal(changes(del), 'customer_users update');
  assert.equal((await call(signed(`${A}/clients/${ACME}/members/${BEA}`, { method: 'DELETE' }))).body.error.code, 'not_found');
  const list = await call(signed(`${A}/clients/${ACME}/members`));
  assert.ok(!list.body.items.some((m) => m.membershipId === BEA));
  assert.equal(sql(`SELECT deleted_at IS NULL FROM customer_users WHERE id = '${FOREIGN_MEMBER}';`), 't');
});

test('a retry with the same idempotency key replays the answer and writes nothing', { skip }, async () => {
  const idem = key16();
  const body = { role: 'sales' };
  const first = await call(signed(`${A}/staff/${NOSIGNIN}`, { method: 'PATCH', body, idem }));
  sql(`UPDATE users SET role = 'viewer' WHERE id = '${NOSIGNIN}';`);
  const second = await call(signed(`${A}/staff/${NOSIGNIN}`, { method: 'PATCH', body, idem }));
  assert.deepEqual([second.status, second.body], [first.status, first.body]);
  assert.equal(roleOf(NOSIGNIN), 'viewer');
});

// ── the database roles ─────────────────────────────────────────────────────────────────────────────
let n = 0;
function as(role, q, { actor = JOHN, claims = 'write' } = {}) {
  const k = `a${String(++n).padStart(21, '0')}`;
  const open = role === 'gsam_bridge_write'
    ? `SELECT audit_id FROM admin_bridge_begin_write('stg-write-1', '${k}', extract(epoch FROM now())::bigint, '${actor}', NULL, 'PATCH', '/t', '${k.replace('a', 'i')}', '${'c'.repeat(64)}') \\gset\n`
      + `SELECT set_config('request.jwt.claims', replace('${JSON.stringify({ role: 'gsam_bridge', cap: claims, org: ORG, kid: 'stg-write-1', audit: ':A' })}', ':A', :'audit_id'), true) \\g /dev/null\n`
    : '';
  const r = db.psql(`BEGIN;\nSET LOCAL ROLE ${role};\n${open}${q}\nROLLBACK;\n`);
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}

const WRITES = [
  `bridge_access_set_staff_role('${NOSIGNIN}', 'sales')`,
  `bridge_access_put_portal_approver('${ADMIN}', 'Ada')`,
  `bridge_access_remove_portal_approver('${OWNER}')`,
  `bridge_access_add_client_member('${ACME}', 'db-agent@example.test', 'Db Agent', 'member')`,
  `bridge_access_set_client_member_role('${ACME}', '${BEA}', 'member')`,
  `bridge_access_remove_client_member('${ACME}', '${BEA}')`,
];

test('the database refuses an agent on every access function, even when the site function is skipped', { skip }, () => {
  for (const actor of [AGENT, SYSTEM]) {
    for (const f of WRITES) assert.match(as('gsam_bridge_write', `SELECT ${f};`, { actor }).err, /people only/, `${actor} ${f}`);
  }
  // as a person, the same call works as the write role
  assert.ok(as('gsam_bridge_write', `SELECT ${WRITES[0]};`).ok);
});

test('the write role still cannot touch the tables directly; the read role, anon and authenticated cannot call the functions', { skip }, () => {
  assert.match(as('gsam_bridge_write', `UPDATE users SET role = 'owner' WHERE id = '${ADMIN}';`).err, /permission denied/);
  assert.match(as('gsam_bridge_write', `INSERT INTO portal_approvers (auth_user_id, label) VALUES ('${AUTH(3)}', 'x');`).err, /permission denied/);
  assert.match(as('gsam_bridge_write', 'SELECT bridge_access_staff();').err, /permission denied for function/);
  for (const role of ['gsam_bridge_read', 'gsam_bridge_refund', 'anon', 'authenticated']) {
    for (const f of WRITES) assert.match(as(role, `SELECT ${f};`).err, /permission denied for function/, `${role} ${f}`);
    for (const f of [`_bridge_staff_json('${ORG}', '${OWNER}')`, `_bridge_log_approver(NULL, NULL, 'insert', NULL, NULL)`]) {
      assert.match(as(role, `SELECT ${f};`).err, /permission denied for function/, `${role} ${f}`);
    }
  }
  for (const role of ['anon', 'authenticated', 'gsam_bridge_refund']) {
    assert.match(as(role, 'SELECT bridge_access_staff();').err, /permission denied for function/, role);
  }
  // the read role with no claims sees nothing
  assert.equal(as('gsam_bridge_read', 'SELECT bridge_access_staff()::text;').out, '[]');
});

test('no email or name reaches the site log', { skip }, () => {
  const text = logs.join('\n');
  for (const s of ['@example.test', 'Cara', 'Olive', 'Bea']) assert.ok(!text.includes(s), s);
});

test('the rollback removes the functions and the users change log, and the migration applies again', { skip }, () => {
  const dir = new URL('../database/migrations/066_bridge_people_access/', import.meta.url).pathname;
  sql(`\\i '${dir}rollback.sql'`);
  assert.equal(sql(`SELECT count(*) FROM pg_proc WHERE proname LIKE 'bridge_access_%' OR proname IN ('_bridge_staff_json', '_bridge_approver_json', '_bridge_member_json', '_bridge_log_approver');`), '0');
  assert.equal(sql(`SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_admin_bridge_change' AND tgrelid = 'public.users'::regclass;`), '0');
  sql(`\\i '${dir}migration.sql'`);
  sql(`\\i '${dir}migration.sql'`);
  assert.equal(sql(`SELECT count(*) FROM pg_proc WHERE proname LIKE 'bridge_access_%';`), '9');
});
