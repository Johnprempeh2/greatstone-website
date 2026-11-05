// GSAM admin bridge, portal documents (GRE-4081, migration 066_bridge_portal_documents). Signed requests through
// makeAdminBridgeHandler on a throwaway real Postgres (lib/postgres.mjs) prove each route: create, edit a draft,
// submit, return to draft, approve and publish, withdraw. Every write names the GSAM actor in the bridge audit, the
// change log and the portal audit. Approve and publish is refused to an agent, to a person who is not linked to a
// registered approver and to an approver who is no longer active staff; withdraw is refused to an agent; an unknown
// kid and the read key are refused. Then, as the database roles: no bridge role can read or write the approver link,
// and only the write role can call the new functions. Without the Postgres server binaries the database tests are
// skipped, and say so.
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
]));
const CAP = { 'test-read-1': 'read', 'test-write-1': 'write' };
const ORIGIN = 'https://staging.example.test';
const AGENT = 'agent:d5651a41-e5e0-4512-8fb0-069815ff4278';
const JOHN = 'user:UGJwnXKO0P0yBvVh4krv4LH3EThDwrRP';
const PERSON = 'user:someone-else';
const FORMER = 'user:former-approver';
const RUN = '7a000000-0000-4000-8000-000000000001';
const key16 = () => randomBytes(16).toString('base64url');

function signed(path, { method = 'POST', kid = 'test-write-1', body = '', actor = JOHN, nonce = key16(), idem = key16(), run = RUN } = {}) {
  const u = new URL(path, ORIGIN);
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const time = Math.floor(Date.now() / 1000);
  const scheme = CAP[kid] === 'write' ? SCHEME_V2 : SCHEME;
  const canonical = canonicalString({ scheme, method, host: u.host, path: u.pathname, query: canonicalQuery(u.searchParams),
    time, nonce, actor, run, bodySha256: createHash('sha256').update(text, 'utf8').digest('hex'), idempotencyKey: idem });
  const headers = {
    'x-gs-bridge-key': kid, 'x-gs-bridge-time': String(time), 'x-gs-bridge-nonce': nonce, 'x-gs-bridge-actor': actor,
    'x-gs-bridge-signature': sign(null, Buffer.from(canonical, 'utf8'), PRIVATE).toString('base64url'),
    ...(run ? { 'x-gs-bridge-run': run } : {}),
    ...(scheme === SCHEME_V2 ? { 'x-gs-bridge-idempotency-key': idem } : {}),
  };
  return new Request(u, { method, headers, ...(method === 'GET' ? {} : { body: text }) });
}

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = 'c7000000-0000-4000-8000-000000000001';
const OTHER_CUSTOMER = 'c7000000-0000-4000-8000-000000000002';
const OTHER_DOC = 'c8000000-0000-4000-8000-000000000009';
const JOHN_AUTH = 'c9000000-0000-4000-8000-000000000001';
const FORMER_AUTH = 'c9000000-0000-4000-8000-000000000002';
const DOCS = '/api/admin/v1/portal-documents';
const DRAFT = {
  customerId: CUSTOMER, kind: 'pre_read', title: 'Pre-read', summary: 'Before we meet',
  body: { sections: [{ id: 'intro', title: 'Intro', html: '<p>Hello <a href="https://example.test">there</a></p>' }] },
  action: 'accept', confirmationText: 'I have read this.',
};
let db;
let pool;
let handler;

before(async () => {
  if (skip) return;
  db = startPostgres('admin-bridge-portal');
  await db.migrate('003');
  const run = (q) => { const r = db.psql(q); assert.equal(r.status, 0, r.stderr); };
  run(`INSERT INTO organisations (id, slug, name, created_at) VALUES ('${ORG}', 'greatstone', 'Greatstone', now() - interval '1 day'),
    ('${OTHER}', 'other', 'Other org', now());`);
  await db.migrate();
  // John is a registered approver and active staff, linked to his GSAM person; a former approver is linked but inactive
  run(`INSERT INTO customers (id, org_id, slug, name) VALUES ('${CUSTOMER}', '${ORG}', 'c-a', 'C A'), ('${OTHER_CUSTOMER}', '${OTHER}', 'c-b', 'C B');
    INSERT INTO auth.users (id, email) VALUES ('${JOHN_AUTH}', 'approver@example.test'), ('${FORMER_AUTH}', 'former@example.test');
    INSERT INTO users (org_id, email, role, auth_subject, is_active) VALUES
      ('${ORG}', 'approver@example.test', 'owner', '${JOHN_AUTH}', true), ('${ORG}', 'former@example.test', 'admin', '${FORMER_AUTH}', false);
    INSERT INTO portal_approvers (auth_user_id, label) VALUES ('${JOHN_AUTH}', 'Approver'), ('${FORMER_AUTH}', 'Former');
    INSERT INTO portal_bridge_approvers (gsam_actor, auth_user_id, label) VALUES ('${JOHN}', '${JOHN_AUTH}', 'Approver'), ('${FORMER}', '${FORMER_AUTH}', 'Former');
    INSERT INTO portal_documents (id, org_id, customer_id, kind, title) VALUES ('${OTHER_DOC}', '${OTHER}', '${OTHER_CUSTOMER}', 'nda', 'Theirs');`);
  pool = new pg.Pool({ connectionString: db.url, max: 4 });
  handler = makeAdminBridgeHandler({ pool: () => pool, keys: KEYS, allowedIps: new Set(), log: () => {}, stripe: () => 'test' });
});

after(async () => { await pool?.end(); db?.stop(); });

const call = async (req) => { const res = await handler(req); const text = await res.text(); return { status: res.status, body: JSON.parse(text), text }; };
const sql = (q) => { const r = db.psql(q); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const doc = (id) => JSON.parse(sql(`SELECT json_build_object('status', status, 'row_version', row_version, 'sha', content_sha256, 'title', title) FROM portal_documents WHERE id = '${id}';`));
const auditOf = (nonce) => sql(`SELECT method || ' ' || resource || ' ' || coalesce(resource_id, '-') || ' ' || outcome || ' '
  || actor_type || ':' || actor_id || ' ' || coalesce(gsam_run_id::text, '-') FROM admin_bridge_audit WHERE nonce = '${nonce}';`);
const create = async (body = DRAFT, actor = AGENT) => {
  const res = await call(signed(DOCS, { body, actor }));
  assert.equal(res.status, 201, res.text);
  return res.body.item;
};
const submit = async (id, actor = AGENT) => {
  const res = await call(signed(`${DOCS}/${id}/submit`, { actor, body: { expectedRowVersion: doc(id).row_version } }));
  assert.equal(res.status, 200, res.text);
  return res.body.item;
};

test('the routes are on the write capability; anything else is not a route', () => {
  const id = OTHER_DOC;
  for (const [method, parts] of [['POST', ['portal-documents']], ['PATCH', ['portal-documents', id]],
    ['POST', ['portal-documents', id, 'submit']], ['POST', ['portal-documents', id, 'return-to-draft']],
    ['POST', ['portal-documents', id, 'withdraw']], ['POST', ['portal-documents', id, 'approve-and-publish']]]) {
    assert.equal(writeRoute(method, parts)?.capability, 'write', `${method} ${parts.join('/')}`);
  }
  for (const [method, parts] of [['DELETE', ['portal-documents', id]], ['PUT', ['portal-documents', id]],
    ['POST', ['portal-documents', id, 'publish']], ['POST', ['portal-documents', 'not-a-uuid', 'submit']],
    ['PATCH', ['portal-documents']], ['POST', ['portal-documents', id, 'submit', 'x']]]) {
    assert.equal(writeRoute(method, parts), null, `${method} ${parts.join('/')}`);
  }
  assert.equal(writeRoute('POST', ['portal-documents', id, 'approve-and-publish']).people, true);
  assert.equal(writeRoute('POST', ['portal-documents', id, 'withdraw']).people, true);
});

test('an agent creates a draft: 201, the document, and the agent and run in every audit', { skip }, async () => {
  const nonce = key16();
  const res = await call(signed(DOCS, { nonce, actor: AGENT, body: DRAFT }));
  assert.equal(res.status, 201, res.text);
  const { item } = res.body;
  assert.deepEqual([item.status, item.kind, item.title, item.version, item.row_version, item.created_by_kind, item.created_run_id, item.content_sha256],
    ['draft', 'pre_read', 'Pre-read', 1, 1, 'agent', RUN, null]);
  assert.deepEqual(item.body, DRAFT.body);
  assert.equal(item.confirmation_text, 'I have read this.');
  for (const hidden of ['org_id', 'pdf_path', 'created_by']) assert.ok(!(hidden in item), hidden);
  assert.equal(auditOf(nonce), `POST portal-documents ${item.id} ok ${AGENT} ${RUN}`);
  assert.equal(sql(`SELECT actor_kind || ' ' || actor_id || ' ' || run_id || ' ' || (detail ->> 'via') FROM portal_audit
    WHERE document_id = '${item.id}' AND event = 'draft_created';`), `agent ${AGENT} ${RUN} bridge`);
  assert.equal(sql(`SELECT count(*) FROM admin_bridge_change c JOIN admin_bridge_audit a ON a.id = c.audit_id
    WHERE a.nonce = '${nonce}' AND c.table_name = 'portal_documents' AND c.op = 'insert';`), '1');
});

test('create refuses unsafe html, unknown fields, a bad kind and a missing client with a 400', { skip }, async () => {
  const before = sql('SELECT count(*) FROM portal_documents;');
  for (const body of [
    { ...DRAFT, body: { sections: [{ id: 's', title: 'S', html: '<script>alert(1)</script>' }] } },
    { ...DRAFT, body: { sections: [{ id: 's', title: 'S', html: '<a href="javascript:x">x</a>' }] } },
    { ...DRAFT, status: 'published' }, { ...DRAFT, contentSha256: 'a'.repeat(64) }, { ...DRAFT, kind: 'invoice' },
    { ...DRAFT, customerId: undefined }, { ...DRAFT, title: '' }, { ...DRAFT, series: 'nope' },
  ]) {
    const res = await call(signed(DOCS, { actor: AGENT, body }));
    assert.deepEqual([res.status, res.body.error?.code], [400, 'bad_request'], JSON.stringify(body).slice(0, 120));
  }
  assert.equal(sql('SELECT count(*) FROM portal_documents;'), before);
});

test('another organisation\'s client, or a series of another client, is a 404', { skip }, async () => {
  const theirs = await call(signed(DOCS, { actor: AGENT, body: { ...DRAFT, customerId: OTHER_CUSTOMER } }));
  assert.deepEqual([theirs.status, theirs.body.error.code], [404, 'not_found']);
  const series = sql(`SELECT series FROM portal_documents WHERE id = '${OTHER_DOC}';`);
  const res = await call(signed(DOCS, { actor: AGENT, body: { ...DRAFT, series } }));
  assert.deepEqual([res.status, res.body.error.code], [404, 'not_found']);
});

test('edit a draft at its version; a stale version is a 409 with the current document', { skip }, async () => {
  const d = await create();
  const res = await call(signed(`${DOCS}/${d.id}`, { method: 'PATCH', actor: AGENT, body: { title: 'Pre-read v2', signatoryEmail: 'signer@example.test', expectedRowVersion: 1 } }));
  assert.equal(res.status, 200, res.text);
  assert.deepEqual([res.body.item.title, res.body.item.signatory_email, res.body.item.row_version], ['Pre-read v2', 'signer@example.test', 2]);
  const stale = await call(signed(`${DOCS}/${d.id}`, { method: 'PATCH', actor: AGENT, body: { title: 'Late', expectedRowVersion: 1 } }));
  assert.deepEqual([stale.status, stale.body.error.code, stale.body.current.row_version, stale.body.current.title], [409, 'conflict', 2, 'Pre-read v2']);
  for (const body of [{ title: 'x' }, { kind: 'nda', expectedRowVersion: 2 }, { expectedRowVersion: 2 }]) {
    const bad = await call(signed(`${DOCS}/${d.id}`, { method: 'PATCH', actor: AGENT, body }));
    assert.equal(bad.status, 400, JSON.stringify(body));
  }
  assert.equal(sql(`SELECT count(*) FROM portal_audit WHERE document_id = '${d.id}' AND event = 'draft_updated' AND actor_id = '${AGENT}';`), '1');
});

test('submit freezes the draft with the database\'s fingerprint; it cannot be edited until returned to draft', { skip }, async () => {
  const d = await create();
  const item = await submit(d.id);
  assert.equal(item.status, 'pending_approval');
  assert.match(item.content_sha256, /^[0-9a-f]{64}$/);
  const edit = await call(signed(`${DOCS}/${d.id}`, { method: 'PATCH', actor: AGENT, body: { title: 'x', expectedRowVersion: item.row_version } }));
  assert.deepEqual([edit.status, edit.body.error.code, edit.body.current.status], [409, 'conflict', 'pending_approval']);
  const again = await call(signed(`${DOCS}/${d.id}/submit`, { actor: AGENT, body: { expectedRowVersion: item.row_version } }));
  assert.equal(again.status, 409);
  const back = await call(signed(`${DOCS}/${d.id}/return-to-draft`, { actor: AGENT, body: { expectedRowVersion: item.row_version } }));
  assert.equal(back.status, 200, back.text);
  assert.deepEqual([back.body.item.status, back.body.item.content_sha256], ['draft', null]);
  assert.equal(sql(`SELECT string_agg(event, ',' ORDER BY at) FROM portal_audit WHERE document_id = '${d.id}';`),
    'draft_created,submitted_for_approval,returned_to_draft');
});

test('an agent cannot approve and publish: 403, no approval, the document still waits', { skip }, async () => {
  const d = await create();
  const { content_sha256: sha } = await submit(d.id);
  const nonce = key16();
  const res = await call(signed(`${DOCS}/${d.id}/approve-and-publish`, { nonce, actor: AGENT, body: { expectedContentSha256: sha } }));
  assert.deepEqual([res.status, res.body], [403, { error: { code: 'denied' } }]);
  assert.equal(auditOf(nonce).split(' ')[3], 'denied');
  assert.equal(doc(d.id).status, 'pending_approval');
  assert.equal(sql(`SELECT count(*) FROM portal_approvals WHERE document_id = '${d.id}';`), '0');
});

test('a person who is not a registered approver, or an approver no longer active, cannot approve and publish', { skip }, async () => {
  const d = await create();
  const { content_sha256: sha } = await submit(d.id);
  for (const actor of [PERSON, FORMER, 'system:scheduler']) {
    const res = await call(signed(`${DOCS}/${d.id}/approve-and-publish`, { actor, body: { expectedContentSha256: sha } }));
    assert.deepEqual([res.status, res.body.error.code], [403, 'denied'], actor);
  }
  assert.equal(doc(d.id).status, 'pending_approval');
});

test('the registered approver approves and publishes the exact version shown; once only', { skip }, async () => {
  const d = await create();
  const { content_sha256: sha } = await submit(d.id);
  const wrong = await call(signed(`${DOCS}/${d.id}/approve-and-publish`, { body: { expectedContentSha256: 'a'.repeat(64) } }));
  assert.deepEqual([wrong.status, wrong.body.error.code, wrong.body.current.status], [409, 'conflict', 'pending_approval']);
  for (const body of [{}, { expectedContentSha256: 'nope' }, { expectedContentSha256: sha, expectedRowVersion: 3 }]) {
    assert.equal((await call(signed(`${DOCS}/${d.id}/approve-and-publish`, { body }))).status, 400, JSON.stringify(body));
  }
  const nonce = key16();
  const res = await call(signed(`${DOCS}/${d.id}/approve-and-publish`, { nonce, body: { expectedContentSha256: sha, gsamApprovalRef: 'GRE-4081' } }));
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.item.status, 'published');
  assert.ok(res.body.item.published_at);
  assert.equal(res.body.item.approval_id, res.body.approvalId);
  assert.equal(sql(`SELECT approver_user_id || ' ' || gsam_approval_ref FROM portal_approvals WHERE id = '${res.body.approvalId}';`), `${JOHN_AUTH} GRE-4081`);
  assert.equal(sql(`SELECT detail ->> 'gsam_actor' FROM portal_audit WHERE document_id = '${d.id}' AND event = 'approved';`), JOHN);
  assert.equal(sql(`SELECT actor_kind || ' ' || actor_id FROM portal_audit WHERE document_id = '${d.id}' AND event = 'published';`), `staff ${JOHN}`);
  assert.equal(auditOf(nonce), `POST portal-documents ${d.id} ok ${JOHN} ${RUN}`);
  const twice = await call(signed(`${DOCS}/${d.id}/approve-and-publish`, { body: { expectedContentSha256: sha } }));
  assert.deepEqual([twice.status, twice.body.error.code], [409, 'conflict']);
});

test('publishing the next version supersedes the last one', { skip }, async () => {
  const first = await create();
  const p1 = await call(signed(`${DOCS}/${first.id}/approve-and-publish`, { body: { expectedContentSha256: (await submit(first.id)).content_sha256 } }));
  assert.equal(p1.status, 200, p1.text);
  const next = await create({ ...DRAFT, series: first.series, title: 'Pre-read, second version' });
  assert.equal(next.version, 2);
  const p2 = await call(signed(`${DOCS}/${next.id}/approve-and-publish`, { body: { expectedContentSha256: (await submit(next.id)).content_sha256 } }));
  assert.equal(p2.status, 200, p2.text);
  assert.deepEqual([doc(first.id).status, doc(next.id).status], ['superseded', 'published']);
});

test('withdraw: an agent is refused; a person withdraws a published document; a draft cannot be withdrawn', { skip }, async () => {
  const d = await create();
  const p = await call(signed(`${DOCS}/${d.id}/approve-and-publish`, { body: { expectedContentSha256: (await submit(d.id)).content_sha256 } }));
  assert.equal(p.status, 200, p.text);
  const version = doc(d.id).row_version;
  const agent = await call(signed(`${DOCS}/${d.id}/withdraw`, { actor: AGENT, body: { expectedRowVersion: version } }));
  assert.deepEqual([agent.status, agent.body.error.code], [403, 'denied']);
  const res = await call(signed(`${DOCS}/${d.id}/withdraw`, { actor: PERSON, body: { expectedRowVersion: version } }));
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.item.status, 'withdrawn');
  assert.ok(res.body.item.withdrawn_at);
  const draft = await create();
  const notPublished = await call(signed(`${DOCS}/${draft.id}/withdraw`, { actor: PERSON, body: { expectedRowVersion: 1 } }));
  assert.deepEqual([notPublished.status, notPublished.body.error.code], [409, 'conflict']);
});

test('another organisation\'s document, or one that does not exist, is a 404 on every route', { skip }, async () => {
  for (const id of [OTHER_DOC, 'c8000000-0000-4000-8000-00000000ffff']) {
    for (const [method, sub, body] of [['PATCH', '', { title: 'x', expectedRowVersion: 1 }], ['POST', '/submit', { expectedRowVersion: 1 }],
      ['POST', '/return-to-draft', { expectedRowVersion: 1 }], ['POST', '/withdraw', { expectedRowVersion: 1 }],
      ['POST', '/approve-and-publish', { expectedContentSha256: 'a'.repeat(64) }]]) {
      const res = await call(signed(`${DOCS}/${id}${sub}`, { method, body }));
      assert.deepEqual([res.status, res.body.error.code], [404, 'not_found'], `${method} ${sub} ${id}`);
    }
  }
  assert.equal(doc(OTHER_DOC).title, 'Theirs');
});

test('an unknown kid is refused with 401 bad_key; the read key gets capability_denied; nothing is written', { skip }, async () => {
  const before = sql('SELECT count(*) FROM portal_documents;');
  const unknown = await call(signed(DOCS, { kid: 'test-nope-1', actor: AGENT, body: DRAFT }));
  assert.deepEqual([unknown.status, unknown.body], [401, { error: { code: 'bad_key' } }]);
  const read = await call(signed(DOCS, { kid: 'test-read-1', actor: AGENT, body: DRAFT }));
  assert.deepEqual([read.status, read.body.error.code], [403, 'capability_denied']);
  assert.equal(sql('SELECT count(*) FROM portal_documents;'), before);
});

test('the same idempotency key and body answers the same and creates once', { skip }, async () => {
  const before = Number(sql('SELECT count(*) FROM portal_documents;'));
  const idem = key16();
  const first = await call(signed(DOCS, { idem, actor: AGENT, body: DRAFT }));
  const again = await call(signed(DOCS, { idem, actor: AGENT, body: DRAFT }));
  assert.equal(first.status, 201);
  assert.deepEqual([again.status, again.body], [first.status, first.body]);
  assert.equal(Number(sql('SELECT count(*) FROM portal_documents;')), before + 1);
});

test('a document larger than the 64 KB write limit is accepted on this route, up to 1 MB', { skip }, async () => {
  const html = `<p>${'x'.repeat(90_000)}</p>`;
  const big = await call(signed(DOCS, { actor: AGENT, body: { ...DRAFT, body: { sections: [{ id: 'a', title: 'A', html }] } } }));
  assert.equal(big.status, 201, big.text.slice(0, 200));
  const sections = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, title: 'S', html }));
  const tooBig = await call(signed(DOCS, { actor: AGENT, body: { ...DRAFT, body: { sections } } }));
  assert.deepEqual([tooBig.status, tooBig.body.error.code], [400, 'bad_request']);
});

test('the read key reads the fingerprint, row version and approval of a document, not its body', { skip }, async () => {
  const d = await create();
  const { content_sha256: sha } = await submit(d.id);
  const res = await call(signed(`${DOCS}/${d.id}`, { method: 'GET', kid: 'test-read-1', actor: 'system:sync' }));
  assert.equal(res.status, 200, res.text);
  assert.deepEqual([res.body.item.content_sha256, res.body.item.row_version, res.body.item.approval_id], [sha, 2, null]);
  assert.ok(!('body' in res.body.item) && !('pdf_path' in res.body.item));
});

// ── the database roles ─────────────────────────────────────────────────────────────────────────────
let n = 0;
function as(role, q, { actor = JOHN } = {}) {
  const k = `p${String(++n).padStart(21, '0')}`;
  const open = role === 'gsam_bridge_write'
    ? `SELECT audit_id FROM admin_bridge_begin_write('stg-write-1', '${k}', extract(epoch FROM now())::bigint, '${actor}', NULL, 'POST', '/t', '${k.replace('p', 'i')}', '${'c'.repeat(64)}') \\gset\n`
      + `SELECT set_config('request.jwt.claims', replace('${JSON.stringify({ role: 'gsam_bridge', cap: 'write', org: ORG, kid: 'stg-write-1', audit: ':A' })}', ':A', :'audit_id'), true) \\g /dev/null\n`
    : '';
  const r = db.psql(`BEGIN;\nSET LOCAL ROLE ${role};\n${open}${q}\nROLLBACK;\n`);
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}

test('no role but the owner reads or writes the approver link; the write role cannot make itself an approver', { skip }, () => {
  for (const role of ['gsam_bridge_write', 'gsam_bridge_read', 'gsam_bridge_refund', 'anon', 'authenticated', 'service_role']) {
    assert.match(as(role, 'SELECT count(*) FROM portal_bridge_approvers;').err, /permission denied/, role);
    assert.match(as(role, `INSERT INTO portal_bridge_approvers (gsam_actor, auth_user_id, label) VALUES ('${PERSON}', '${JOHN_AUTH}', 'x');`).err,
      /permission denied/, role);
  }
  assert.match(as('gsam_bridge_write', 'SELECT count(*) FROM portal_approvers;').err, /permission denied/);
});

test('the write role changes portal documents only through the functions, never directly', { skip }, () => {
  assert.match(as('gsam_bridge_write', `UPDATE portal_documents SET title = 'x';`).err, /permission denied/);
  assert.match(as('gsam_bridge_write', `INSERT INTO portal_documents (customer_id, kind, title) VALUES ('${CUSTOMER}', 'nda', 'x');`).err, /permission denied/);
  assert.match(as('gsam_bridge_write', `SELECT portal_approve_and_publish('${OTHER_DOC}', '${'a'.repeat(64)}', NULL);`).err, /permission denied/);
  // the functions read the actor from the open audit row, so an agent cannot publish even by calling one directly
  assert.match(as('gsam_bridge_write', `SELECT bridge_portal_approve_and_publish('${OTHER_DOC}', '${'a'.repeat(64)}', NULL);`, { actor: AGENT }).err,
    /people only/);
});

test('the read role, the refund role and anon cannot call the new functions', { skip }, () => {
  for (const role of ['gsam_bridge_read', 'gsam_bridge_refund', 'anon', 'authenticated']) {
    for (const f of [`bridge_portal_create('${CUSTOMER}', '{}')`, `bridge_portal_document('${OTHER_DOC}')`,
      `bridge_portal_approve_and_publish('${OTHER_DOC}', 'x', NULL)`, `bridge_portal_withdraw('${OTHER_DOC}', 1)`]) {
      assert.match(as(role, `SELECT ${f};`).err, /permission denied for function/, `${role} ${f}`);
    }
  }
});

test('a write outside the bridge is audited as before, with no bridge actor', { skip }, () => {
  const id = sql(`INSERT INTO portal_documents (org_id, customer_id, kind, title) VALUES ('${ORG}', '${CUSTOMER}', 'nda', 'Owner draft') RETURNING id;`);
  assert.equal(sql(`SELECT actor_kind || ' ' || coalesce(actor_id, '-') || ' ' || coalesce(detail ->> 'via', '-') FROM portal_audit WHERE document_id = '${id}';`),
    'system - -');
});

test('the rollback removes the link table and functions, restores the audit triggers, and the migration applies again', { skip }, () => {
  const dir = new URL('../database/migrations/066_bridge_portal_documents/', import.meta.url).pathname;
  sql(`\\i '${dir}rollback.sql'`);
  assert.equal(sql(`SELECT count(*) FROM pg_proc WHERE proname LIKE 'bridge_portal_%' OR proname LIKE '_bridge_portal_%';`), '0');
  assert.equal(sql(`SELECT to_regclass('public.portal_bridge_approvers') IS NULL;`), 't');
  assert.equal(sql(`SELECT count(*) FROM pg_proc WHERE proname = 'portal_documents_audit' AND prosrc LIKE '%bridge%';`), '0');
  sql(`\\i '${dir}migration.sql'`);
  sql(`\\i '${dir}migration.sql'`);
  assert.equal(sql(`SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_admin_bridge_change' AND tgrelid = 'public.portal_documents'::regclass;`), '1');
});
