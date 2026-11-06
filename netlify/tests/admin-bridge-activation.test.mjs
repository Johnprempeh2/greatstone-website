// GSAM admin bridge, a product range's activation steps (GRE-3981, migration 065_bridge_activation_steps). Signed
// requests through makeAdminBridgeHandler on a throwaway real Postgres (lib/postgres.mjs) prove the route: a person
// writes, clears and retries; an agent changes only a draft vendor; a stale version is a 409 with the current steps;
// steps that contain a licence key are refused, and no answer or log line carries the key. Then, as the database
// roles: the write role changes only activation steps (and its other granted vendor columns), never a licence key;
// the read role and anon change nothing and cannot call the new functions. Without the Postgres server binaries the
// database tests are skipped, and say so.
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
const JOHN = 'user:UGJwnXKO0P0yBvVh4krv4LH3EThDwrRP';
const key16 = () => randomBytes(16).toString('base64url');

function signed(path, { method = 'PUT', kid = 'test-write-1', body = '', actor = JOHN, nonce = key16(), idem = key16() } = {}) {
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
const VEN = 'b0000000-0000-4000-8000-000000000001';
const VEN_DRAFT = 'b0000000-0000-4000-8000-000000000002';
const VEN_OTHER = 'b0000000-0000-4000-8000-000000000003';
const CUSTOMER = 'b7000000-0000-4000-8000-000000000001';
const OTHER_CUSTOMER = 'b7000000-0000-4000-8000-000000000002';
// test keys only, made up for this suite
const KEY = 'TEST-ASPOSE-0000-1111-WXYZ';
const OTHER_KEY = 'TEST-OTHERORG-9999-QRST';
const path = (id) => `/api/admin/v1/vendors/${id}/activation-steps`;
let db;
let pool;
let handler;
const logs = [];

before(async () => {
  if (skip) return;
  db = startPostgres('admin-bridge-activation');
  await db.migrate('003');
  const run = (q) => { const r = db.psql(q); assert.equal(r.status, 0, r.stderr); };
  run(`INSERT INTO organisations (id, slug, name, created_at) VALUES ('${ORG}', 'greatstone', 'Greatstone', now() - interval '1 day'),
    ('${OTHER}', 'other', 'Other org', now());`);
  await db.migrate();
  run(`INSERT INTO vendors (id, org_id, slug, name, status, activation_instructions) VALUES
      ('${VEN}', '${ORG}', 'aspose', 'Aspose', 'published', 'Old steps'),
      ('${VEN_DRAFT}', '${ORG}', 'iron', 'Iron Software', 'draft', NULL),
      ('${VEN_OTHER}', '${OTHER}', 'aspose-o', 'Aspose', 'published', NULL);
    INSERT INTO customers (id, org_id, slug, name) VALUES ('${CUSTOMER}', '${ORG}', 'c-a', 'C A'), ('${OTHER_CUSTOMER}', '${OTHER}', 'c-b', 'C B');
    INSERT INTO licence_keys (org_id, customer_id, offering_name, licence_key) VALUES
      ('${ORG}', '${CUSTOMER}', 'Aspose.Words for .NET', '${KEY}'),
      ('${ORG}', '${CUSTOMER}', 'Aspose.Total', 'SHORT'),
      ('${ORG}', '${CUSTOMER}', 'IronPDF', 'TEST-IRON-2222-3333-ABCD'),
      ('${ORG}', '${CUSTOMER}', 'Iron Man poster', 'TEST-NOTIRON-4444-EFGH'),
      ('${OTHER}', '${OTHER_CUSTOMER}', 'Aspose.Cells', '${OTHER_KEY}');`);
  pool = new pg.Pool({ connectionString: db.url, max: 4 });
  handler = makeAdminBridgeHandler({ pool: () => pool, keys: KEYS, allowedIps: new Set(), log: (m) => logs.push(m), stripe: () => 'test' });
});

after(async () => { await pool?.end(); db?.stop(); });

const call = async (req) => { const res = await handler(req); const text = await res.text(); return { status: res.status, body: JSON.parse(text), text }; };
const sql = (q) => { const r = db.psql(q); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const version = (id) => Number(sql(`SELECT row_version FROM vendors WHERE id = '${id}';`));
const auditOf = (nonce) => sql(`SELECT capability || ' ' || method || ' ' || resource || ' ' || resource_id || ' ' || outcome || ' '
  || actor_type || ':' || actor_id FROM admin_bridge_audit WHERE nonce = '${nonce}';`);

test('the route is PUT vendors/<id>/activation-steps on the write capability only', () => {
  assert.equal(writeRoute('PUT', ['vendors', VEN, 'activation-steps']).capability, 'write');
  assert.equal(writeRoute('PATCH', ['vendors', VEN, 'activation-steps']), null);
  assert.equal(writeRoute('PUT', ['vendors', VEN, 'activation-steps', 'x']), null);
  assert.equal(writeRoute('PUT', ['licences', VEN, 'activation-steps']), null);
});

test('a person writes the steps: 200, the steps, the new version and the licences that name the range; one audit row', { skip }, async () => {
  const nonce = key16();
  const res = await call(signed(path(VEN), { nonce, body: { activationSteps: '1. Open the licence file.\n2. Call SetLicense.', expectedRowVersion: version(VEN) } }));
  assert.equal(res.status, 200, res.text);
  const { item } = res.body;
  assert.deepEqual([item.vendorId, item.vendorName, item.status, item.activationSteps, item.licencesInRange],
    [VEN, 'Aspose', 'published', '1. Open the licence file.\n2. Call SetLicense.', 2]);
  assert.equal(item.rowVersion, 2);
  assert.equal(auditOf(nonce), `write PUT vendors ${VEN} ok user:UGJwnXKO0P0yBvVh4krv4LH3EThDwrRP`);
  assert.equal(sql(`SELECT count(*) FROM admin_bridge_change c JOIN admin_bridge_audit a ON a.id = c.audit_id WHERE a.nonce = '${nonce}'
    AND c.before ->> 'activation_instructions' = 'Old steps';`), '1');
});

test('the licence count matches the range the way the account page does', { skip }, async () => {
  const res = await call(signed(path(VEN_DRAFT), { actor: AGENT, body: { activationSteps: 'Iron steps', expectedRowVersion: version(VEN_DRAFT) } }));
  assert.equal(res.status, 200, res.text);
  // IronPDF extends "iron"; "Iron Man poster" has a bare "iron" token, so it is not in the range
  assert.equal(res.body.item.licencesInRange, 1);
});

test('the same idempotency key and body answers the same and writes once; another body is a mismatch', { skip }, async () => {
  const idem = key16();
  const body = { activationSteps: 'Retry steps', expectedRowVersion: version(VEN) };
  const first = await call(signed(path(VEN), { idem, body }));
  const again = await call(signed(path(VEN), { idem, body }));
  assert.equal(first.status, 200);
  assert.deepEqual([again.status, again.body], [first.status, first.body]);
  assert.equal((await call(signed(path(VEN), { idem, body: { ...body, activationSteps: 'Other' } }))).body.error.code, 'idempotency_mismatch');
});

test('null clears the steps; a blank string, a missing field or an unknown field is a 400', { skip }, async () => {
  const cleared = await call(signed(path(VEN), { body: { activationSteps: null, expectedRowVersion: version(VEN) } }));
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.item.activationSteps, null);
  for (const body of [{ activationSteps: '   ', expectedRowVersion: version(VEN) }, { expectedRowVersion: version(VEN) },
    { activationSteps: 'x' }, { activationSteps: 'x', expectedRowVersion: version(VEN), name: 'Renamed' },
    { activationSteps: 'x'.repeat(20001), expectedRowVersion: version(VEN) }]) {
    const res = await call(signed(path(VEN), { body }));
    assert.deepEqual([res.status, res.body.error.code], [400, 'bad_request'], JSON.stringify(body).slice(0, 80));
  }
  assert.equal(sql(`SELECT name FROM vendors WHERE id = '${VEN}';`), 'Aspose');
});

test('a stale version is a 409 with the current steps', { skip }, async () => {
  const res = await call(signed(path(VEN), { body: { activationSteps: 'Late', expectedRowVersion: 1 } }));
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'conflict');
  assert.equal(res.body.current.rowVersion, version(VEN));
});

test('an agent changes only a draft vendor; a person changes a published one', { skip }, async () => {
  const res = await call(signed(path(VEN), { actor: AGENT, body: { activationSteps: 'Agent steps', expectedRowVersion: version(VEN) } }));
  assert.deepEqual([res.status, res.body.error.code], [403, 'denied']);
});

test('another organisation\'s vendor, a deleted vendor or a bad id is a 404', { skip }, async () => {
  for (const id of [VEN_OTHER, 'b0000000-0000-4000-8000-00000000ffff', 'not-a-uuid']) {
    const res = await call(signed(path(id), { body: { activationSteps: 'x', expectedRowVersion: 1 } }));
    assert.deepEqual([res.status, res.body.error.code], [404, 'not_found'], id);
  }
});

test('steps with a licence key of this organisation are refused, on this route and on PATCH vendors; the key is never echoed', { skip }, async () => {
  const before = sql(`SELECT activation_instructions FROM vendors WHERE id = '${VEN}';`);
  const nonce = key16();
  const res = await call(signed(path(VEN), { nonce, body: { activationSteps: `Paste ${KEY} into the box`, expectedRowVersion: version(VEN) } }));
  assert.deepEqual([res.status, res.body], [400, { error: { code: 'licence_key_in_text' } }]);
  assert.equal(auditOf(nonce).split(' ')[4], 'bad_request');
  const viaPatch = await call(signed(`/api/admin/v1/vendors/${VEN}`, { method: 'PATCH',
    body: { activationInstructions: `Key: ${KEY.toLowerCase()} or ${KEY}`, expectedRowVersion: version(VEN) } }));
  assert.equal(viaPatch.body.error.code, 'licence_key_in_text');
  assert.equal(sql(`SELECT coalesce(activation_instructions, '') FROM vendors WHERE id = '${VEN}';`), before);
  // a key of another organisation, a key shorter than 8 characters and part of a key are not this organisation's keys
  for (const steps of [`Example ${OTHER_KEY}`, 'Use the SHORT form', `Keys look like ${KEY.slice(0, 15)}…`]) {
    const ok = await call(signed(path(VEN), { body: { activationSteps: steps, expectedRowVersion: version(VEN) } }));
    assert.equal(ok.status, 200, steps);
  }
  for (const line of logs) assert.ok(!line.includes(KEY) && !line.includes(OTHER_KEY), line);
  assert.ok(!sql(`SELECT string_agg(coalesce(path, ''), ' ') FROM admin_bridge_audit;`).includes(KEY));
});

test('the read and refund keys cannot write the steps', { skip }, async () => {
  for (const kid of ['test-read-1', 'test-refund-1']) {
    const res = await call(signed(path(VEN), { kid, body: { activationSteps: 'x', expectedRowVersion: version(VEN) } }));
    assert.deepEqual([res.status, res.body.error.code], [403, 'capability_denied'], kid);
  }
});

// ── the database roles ─────────────────────────────────────────────────────────────────────────────
let n = 0;
function as(role, q, { claims = 'write', end = 'ROLLBACK' } = {}) {
  const k = `a${String(++n).padStart(21, '0')}`;
  const open = role === 'gsam_bridge_write'
    ? `SELECT audit_id FROM admin_bridge_begin_write('stg-write-1', '${k}', extract(epoch FROM now())::bigint, '${JOHN}', NULL, 'PUT', '/t', '${k.replace('a', 'i')}', '${'c'.repeat(64)}') \\gset\n`
      + `SELECT set_config('request.jwt.claims', replace('${JSON.stringify({ role: 'gsam_bridge', cap: claims, org: ORG, kid: 'stg-write-1', audit: ':A' })}', ':A', :'audit_id'), true) \\g /dev/null\n`
    : '';
  const r = db.psql(`BEGIN;\nSET LOCAL ROLE ${role};\n${open}${q}\n${end};\n`);
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}

test('the write role writes activation steps of its organisation, and cannot read or write a licence key', { skip }, () => {
  const w = as('gsam_bridge_write', `WITH u AS (UPDATE vendors SET activation_instructions = 'Role steps' WHERE id = '${VEN}' RETURNING id) SELECT count(*) FROM u;`);
  assert.ok(w.ok, w.err);
  assert.equal(w.out, '1');
  assert.equal(as('gsam_bridge_write', `WITH u AS (UPDATE vendors SET activation_instructions = 'x' WHERE id = '${VEN_OTHER}' RETURNING id) SELECT count(*) FROM u;`).out, '0');
  assert.match(as('gsam_bridge_write', `UPDATE vendors SET activation_instructions = '${KEY}' WHERE id = '${VEN}';`).err, /contain a licence key/);
  assert.match(as('gsam_bridge_write', 'SELECT licence_key FROM licence_keys;').err, /permission denied/);
  assert.match(as('gsam_bridge_write', `UPDATE licence_keys SET licence_key = 'x';`).err, /permission denied/);
  assert.match(as('gsam_bridge_write', `UPDATE vendors SET status = 'archived' WHERE id = '${VEN}';`).err, /permission denied|status changes/);
});

test('the read role and anon cannot write activation steps or call the new functions', { skip }, () => {
  for (const role of ['gsam_bridge_read', 'anon', 'authenticated']) {
    const r = as(role, `WITH u AS (UPDATE vendors SET activation_instructions = 'x' WHERE id = '${VEN}' RETURNING id) SELECT count(*) FROM u;`);
    assert.ok(!r.ok || r.out === '0', `${role}: ${r.out} ${r.err}`);
    for (const f of [`bridge_vendor_licence_count('${VEN}')`, `_bridge_text_has_licence_key('${KEY}')`]) {
      assert.match(as(role, `SELECT ${f};`).err, /permission denied for function/, `${role} ${f}`);
    }
  }
  assert.equal(sql(`SELECT activation_instructions <> 'x' FROM vendors WHERE id = '${VEN}';`), 't');
});

test('with read claims the write role finds no key and counts nothing', { skip }, () => {
  const r = as('gsam_bridge_write', `SELECT _bridge_text_has_licence_key('${KEY}') || ' ' || bridge_vendor_licence_count('${VEN}');`, { claims: 'read' });
  assert.equal(r.out.split('\n').pop(), 'false 0');
});

test('staff writes are not changed by the guard', { skip }, () => {
  sql(`UPDATE vendors SET activation_instructions = 'Staff wrote ${KEY}' WHERE id = '${VEN_DRAFT}';`);
  assert.equal(sql(`SELECT activation_instructions FROM vendors WHERE id = '${VEN_DRAFT}';`), `Staff wrote ${KEY}`);
});

test('the rollback removes the guard and the functions, and the migration applies again', { skip }, () => {
  const dir = new URL('../database/migrations/065_bridge_activation_steps/', import.meta.url).pathname;
  sql(`\\i '${dir}rollback.sql'`);
  assert.equal(sql(`SELECT count(*) FROM pg_proc WHERE proname IN ('bridge_vendor_licence_count', '_bridge_text_has_licence_key', 'guard_bridge_activation_text');`), '0');
  sql(`\\i '${dir}migration.sql'`);
  sql(`\\i '${dir}migration.sql'`);
  assert.equal(sql(`SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_guard_bridge_activation_text';`), '1');
});
