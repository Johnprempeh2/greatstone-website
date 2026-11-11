// GSAM admin bridge, admin parity round 2 (migration 073_bridge_admin_parity): seat requests (list and a person's
// decision), the buyer's PO file streamed from the private store, and a front door lead's agent package. Signed
// requests through makeAdminBridgeHandler on a throwaway real Postgres (lib/postgres.mjs). Every new route refuses an
// unsigned call and an unknown key (401); the decision refuses a read key (403 capability_denied) and an agent (403
// denied, at the site and again in the database). Another organisation's rows are never found. Without the Postgres
// server binaries the database tests are skipped, and say so.
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
const QUOTE = 'c1000000-0000-4000-8000-000000000001';
const QUOTE_NOPO = 'c1000000-0000-4000-8000-000000000002';
const QUOTE_FOREIGN = 'c1000000-0000-4000-8000-000000000003';
const ORDER = 'f1000000-0000-4000-8000-000000000001';
const REQ = 'd1000000-0000-4000-8000-000000000001';
const REQ_DECLINE = 'd1000000-0000-4000-8000-000000000002';
const REQ_FOREIGN = 'd1000000-0000-4000-8000-000000000003';
const REQ_AGENT = 'd1000000-0000-4000-8000-000000000004';
const FD = '9b000000-0000-4000-8000-000000000001';
const FD_EMPTY = '9b000000-0000-4000-8000-000000000002';
const FD_FOREIGN = '9b000000-0000-4000-8000-000000000003';
const PO_PATH = `${QUOTE}/0000-buyer-po.pdf`;
const PO_FOREIGN = `${QUOTE_FOREIGN}/0000-other-po.pdf`;
const PO_BYTES = '%PDF-1.4 test purchase order';
const V = '/api/admin/v1';
let db;
let pool;
let handler;
const logs = [];
const blobStore = (name) => ({ get: async (path, opts) => {
  assert.equal(opts.type, 'stream');
  return name === 'po-documents' && (path === PO_PATH || path === PO_FOREIGN) ? new Blob([PO_BYTES]).stream() : null;
} });

before(async () => {
  if (skip) return;
  db = startPostgres('admin-bridge-parity');
  await db.migrate('003');
  sql(`INSERT INTO organisations (id, slug, name, created_at) VALUES ('${ORG}', 'greatstone', 'Greatstone', now() - interval '1 day'),
    ('${OTHER}', 'other', 'Other org', now());`);
  await db.migrate();
  sql(`INSERT INTO customers (id, org_id, slug, name) VALUES ('${ACME}', '${ORG}', 'acme', 'Acme'), ('${FOREIGN}', '${OTHER}', 'foreign', 'Foreign');
    INSERT INTO quotes (id, org_id, reference, customer_id, contact_email, po_document_path, po_document_name) VALUES
      ('${QUOTE}', '${ORG}', 'Q-1', '${ACME}', 'buyer@example.test', '${PO_PATH}', 'Buyer PO.pdf'),
      ('${QUOTE_NOPO}', '${ORG}', 'Q-2', '${ACME}', 'buyer@example.test', NULL, NULL),
      ('${QUOTE_FOREIGN}', '${OTHER}', 'Q-3', '${FOREIGN}', 'other@example.test', '${PO_FOREIGN}', 'Other.pdf');
    INSERT INTO orders (id, org_id, reference, quote_id, customer_id, customer_email, status, total_minor) VALUES
      ('${ORDER}', '${ORG}', 'O-1', '${QUOTE}', '${ACME}', 'buyer@example.test', 'confirmed', 1200);
    INSERT INTO member_invite_requests (id, org_id, customer_id, full_name, email, role, note) VALUES
      ('${REQ}', '${ORG}', '${ACME}', 'Nia Mensah', 'nia@example.test', 'member', 'Finance lead'),
      ('${REQ_DECLINE}', '${ORG}', '${ACME}', NULL, 'later@example.test', 'admin', NULL),
      ('${REQ_AGENT}', '${ORG}', '${ACME}', 'Kofi', 'kofi@example.test', 'member', NULL),
      ('${REQ_FOREIGN}', '${OTHER}', '${FOREIGN}', 'Other', 'other@example.test', 'member', NULL);
    INSERT INTO front_door_leads (id, org_id, industry, company_name, contact_email, agent_package) VALUES
      ('${FD}', '${ORG}', 'Retail', 'Lead Co', 'lead@example.test', '{"COMPANY.md": "# Lead Co team"}'),
      ('${FD_EMPTY}', '${ORG}', 'Retail', 'Empty Co', 'empty@example.test', NULL),
      ('${FD_FOREIGN}', '${OTHER}', 'Retail', 'Other Co', 'o@example.test', '{"COMPANY.md": "# Other"}');`);
  pool = new pg.Pool({ connectionString: db.url, max: 4 });
  handler = makeAdminBridgeHandler({ pool: () => pool, keys: KEYS, allowedIps: new Set(), log: (m) => logs.push(m), blobStore });
});

after(async () => { await pool?.end(); db?.stop(); });

// without a database the signature checks still run: they refuse before any pool is asked for
const authOnly = makeAdminBridgeHandler({ pool: () => null, keys: KEYS, allowedIps: new Set(), log: () => {}, blobStore });
const raw = async (req) => (handler || authOnly)(req);
const call = async (req) => { const res = await raw(req); const text = await res.text(); return { status: res.status, body: JSON.parse(text) }; };
function sql(q) { const r = db.psql(q); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); }

const ROUTES = [
  ['GET', `${V}/quotes/${QUOTE}/po-document`], ['GET', `${V}/orders/${ORDER}/po-document`],
  ['GET', `${V}/enquiries/fd-${FD}/agent-package`], ['GET', `${V}/invite-requests?customer=${ACME}`],
  ['POST', `${V}/invite-requests/${REQ}/decision`],
];

test('every new route refuses an unsigned call and an unknown key: 401, and no file', async () => {
  for (const [method, path] of ROUTES) {
    const unsigned = await call(new Request(new URL(path, ORIGIN), { method, ...(method === 'GET' ? {} : { body: '{"decision":"approve"}' }) }));
    assert.equal(unsigned.status, 401, `unsigned ${path}`);
    const unknown = await call(signed(path, { method, kid: 'test-unknown-1', body: method === 'GET' ? '' : { decision: 'approve' } }));
    assert.deepEqual([unknown.status, unknown.body], [401, { error: { code: 'bad_key' } }], `unknown ${path}`);
  }
});

test('the decision is a people-only write route; a read key cannot decide', async () => {
  const r = writeRoute('POST', ['invite-requests', REQ, 'decision']);
  assert.deepEqual([r.capability, r.people], ['write', true]);
  assert.equal(writeRoute('PATCH', ['invite-requests', REQ]), null);
  assert.equal(writeRoute('POST', ['invite-requests', 'not-a-uuid', 'decision']), null);
  const res = await call(signed(`${V}/invite-requests/${REQ}/decision`, { method: 'POST', kid: 'test-read-1', body: { decision: 'approve' } }));
  assert.deepEqual([res.status, res.body], [403, { error: { code: 'capability_denied' } }]);
});

test('the buyer PO file streams for a quote and for its order; none, or another organisation, is not found', { skip }, async () => {
  for (const path of [`${V}/quotes/${QUOTE}/po-document`, `${V}/orders/${ORDER}/po-document`]) {
    const res = await raw(signed(path));
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get('content-type'), 'application/octet-stream');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="Buyer_PO.pdf"');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(await res.text(), PO_BYTES);
  }
  for (const path of [`${V}/quotes/${QUOTE_NOPO}/po-document`, `${V}/quotes/${QUOTE_FOREIGN}/po-document`, `${V}/quotes/nope/po-document`]) {
    const res = await call(signed(path));
    assert.deepEqual([res.status, res.body], [404, { error: { code: 'not_found' } }], path);
  }
  assert.equal(sql(`SELECT outcome || ' ' || resource FROM admin_bridge_audit WHERE path = '${V}/quotes/${QUOTE}/po-document'`), 'ok quotes');
  const quote = await call(signed(`${V}/quotes/${QUOTE}`));
  assert.equal(quote.body.item.has_po_document, true);
  assert.equal((await call(signed(`${V}/quotes/${QUOTE_NOPO}`))).body.item.has_po_document, false);
  assert.equal(JSON.stringify(quote.body).includes(PO_PATH), false, 'the store path never leaves the site');
  assert.equal((await call(signed(`${V}/orders/${ORDER}`))).body.item.has_po_document, true);
});

test('the agent package is a .zip of the saved package; a lead with none, or another organisation, is not found', { skip }, async () => {
  const res = await raw(signed(`${V}/enquiries/fd-${FD}/agent-package`));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/zip');
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="lead-co-team.zip"');
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  assert.ok(bytes.includes(Buffer.from('# Lead Co team')));
  for (const id of [`fd-${FD_EMPTY}`, `fd-${FD_FOREIGN}`, `si-${FD}`]) {
    const out = await call(signed(`${V}/enquiries/${id}/agent-package`));
    assert.equal(out.status, 404, id);
  }
  const list = await call(signed(`${V}/enquiries`));
  const byId = Object.fromEntries(list.body.items.map((e) => [e.id, e]));
  assert.deepEqual([byId[`fd-${FD}`].agentPackage, byId[`fd-${FD_EMPTY}`].agentPackage, byId[`fd-${FD_FOREIGN}`]], [true, false, undefined]);
});

test('seat requests list for one client, never another organisation', { skip }, async () => {
  const res = await call(signed(`${V}/invite-requests?customer=${ACME}`));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map((r) => r.id).sort(), [REQ, REQ_DECLINE, REQ_AGENT].sort());
  assert.deepEqual(Object.keys(res.body.items[0]).sort(), ['created_at', 'customer_id', 'email', 'full_name', 'handled_at', 'id', 'note', 'role', 'status']);
  assert.equal((await call(signed(`${V}/invite-requests`))).body.items.some((r) => r.id === REQ_FOREIGN), false);
  assert.equal((await call(signed(`${V}/invite-requests/${REQ_FOREIGN}`))).status, 404);
});

test('an agent cannot decide a seat request: 403 denied, still pending, no member added', { skip }, async () => {
  const res = await call(signed(`${V}/invite-requests/${REQ_AGENT}/decision`, { method: 'POST', actor: AGENT, body: { decision: 'approve' } }));
  assert.deepEqual([res.status, res.body], [403, { error: { code: 'denied' } }]);
  assert.equal(sql(`SELECT status FROM member_invite_requests WHERE id = '${REQ_AGENT}'`), 'pending');
  assert.equal(sql(`SELECT count(*) FROM customer_users WHERE email = 'kofi@example.test'`), '0');
  // and the database refuses it too, whatever the site function lets through
  await assert.rejects(pool.query('SELECT bridge_invite_request_decide($1, $2)', [REQ_AGENT, 'approve']));
});

test('a person approves (the member is added) or declines; a decided or foreign request cannot be decided again', { skip }, async () => {
  const approved = await call(signed(`${V}/invite-requests/${REQ}/decision`, { method: 'POST', body: { decision: 'approve' } }));
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.item.status, 'provisioned');
  assert.equal(approved.body.member.email, 'nia@example.test');
  assert.equal(sql(`SELECT role || ' ' || customer_id FROM customer_users WHERE email = 'nia@example.test' AND deleted_at IS NULL`), `member ${ACME}`);
  const declined = await call(signed(`${V}/invite-requests/${REQ_DECLINE}/decision`, { method: 'POST', body: { decision: 'decline' } }));
  assert.deepEqual([declined.status, declined.body.item.status, declined.body.member], [200, 'declined', null]);
  assert.equal(sql(`SELECT count(*) FROM customer_users WHERE email = 'later@example.test'`), '0');
  const again = await call(signed(`${V}/invite-requests/${REQ}/decision`, { method: 'POST', body: { decision: 'decline' } }));
  assert.deepEqual([again.status, again.body.error.code], [409, 'conflict']);
  const foreign = await call(signed(`${V}/invite-requests/${REQ_FOREIGN}/decision`, { method: 'POST', body: { decision: 'approve' } }));
  assert.equal(foreign.status, 404);
  const bad = await call(signed(`${V}/invite-requests/${REQ_AGENT}/decision`, { method: 'POST', body: { decision: 'maybe' } }));
  assert.equal(bad.status, 400);
  assert.equal(sql(`SELECT string_agg(c.op || ' ' || (c.after ->> 'status'), ',') FROM admin_bridge_change c WHERE c.table_name = 'member_invite_requests'`),
    'update provisioned,update declined');
});

test('the PO path and a lead\'s agents stay hidden from the bridge roles; only the functions answer', { skip }, () => {
  for (const role of ['gsam_bridge_read', 'gsam_bridge_write']) {
    for (const [table, column] of [['quotes', 'po_document_path'], ['front_door_leads', 'agents'], ['front_door_leads', 'agent_package']]) {
      assert.equal(sql(`SELECT has_column_privilege('${role}', 'public.${table}', '${column}', 'SELECT');`), 'f', `${role} ${table}.${column}`);
    }
  }
  assert.equal(sql(`SELECT has_function_privilege('gsam_bridge_write', 'bridge_po_document(text, uuid)', 'EXECUTE');`), 'f');
  assert.equal(sql(`SELECT has_function_privilege('anon', 'bridge_lead_package(uuid)', 'EXECUTE');`), 'f');
  // without bridge claims the functions find nothing
  assert.equal(sql(`SELECT coalesce(bridge_po_document('quotes', '${QUOTE}')::text, 'none');`), 'none');
});

test('the rollback removes the functions and reads, and the migration applies again', { skip }, () => {
  const dir = new URL('../database/migrations/073_bridge_admin_parity/', import.meta.url).pathname;
  const count = () => sql(`SELECT count(*) FROM pg_proc WHERE proname IN ('bridge_invite_request_decide', 'bridge_po_document',
    'bridge_quote_has_po', 'bridge_lead_has_package', 'bridge_lead_package', '_bridge_any_org');`);
  sql(`\\i '${dir}rollback.sql'`);
  assert.equal(count(), '0');
  assert.equal(sql(`SELECT has_column_privilege('gsam_bridge_read', 'public.member_invite_requests', 'email', 'SELECT');`), 'f');
  sql(`\\i '${dir}migration.sql'`);
  sql(`\\i '${dir}migration.sql'`);
  assert.equal(count(), '6');
});
