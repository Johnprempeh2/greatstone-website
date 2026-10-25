// GSAM runs a Parallel Interview round through the signed admin bridge (GRE-2612, contracts/gs-interview-v1):
// create and update a round, invite people, read status and events, start synthesis, release and withdraw, close.
// Signed requests through makeAdminBridgeHandler on a throwaway real Postgres with every migration applied.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { SCHEME, SCHEME_V2, canonicalQuery, canonicalString, parseBridgeKeys } from '../functions/lib/admin-bridge-auth.mjs';
import { makeAdminBridgeHandler } from '../functions/admin-bridge.mjs';
import { checkRound, inviteEmail } from '../functions/lib/interview/bridge.mjs';

const CONTRACT = JSON.parse(readFileSync(new URL('../../contracts/gs-bridge-v1/vectors.json', import.meta.url), 'utf8'));
const PRIVATE = createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(CONTRACT.key.seedHex, 'hex')]), format: 'der', type: 'pkcs8',
});
const KEYS = parseBridgeKeys(JSON.stringify([
  { kid: 'test-read-1', capability: 'read', publicKey: CONTRACT.key.publicKey },
  { kid: 'test-write-1', capability: 'write', publicKey: CONTRACT.key.publicKey },
]));
const ORIGIN = 'https://staging.example.test';
const AGENT = 'agent:3567f4b8-877d-4e4a-8d9c-9288d01c1f8c';
const ORG = '90000000-0000-4000-8000-000000000001';
const ROUND = 'b1000000-0000-4000-8000-000000000001';
const ROOT = 'b2000000-0000-4000-8000-000000000001';
const FIN = 'b2000000-0000-4000-8000-000000000002';
const OPS = 'b2000000-0000-4000-8000-000000000003';
const key16 = () => randomBytes(16).toString('base64url');

function signed(path, { method = 'GET', kid = method === 'GET' ? 'test-read-1' : 'test-write-1', body = '', idem = key16() } = {}) {
  const u = new URL(path, ORIGIN);
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const scheme = kid === 'test-read-1' ? SCHEME : SCHEME_V2;
  const time = Math.floor(Date.now() / 1000);
  const nonce = key16();
  const canonical = canonicalString({ scheme, method, host: u.host, path: u.pathname, query: canonicalQuery(u.searchParams),
    time, nonce, actor: AGENT, run: null, bodySha256: createHash('sha256').update(text, 'utf8').digest('hex'), idempotencyKey: idem });
  const headers = { 'x-gs-bridge-key': kid, 'x-gs-bridge-time': String(time), 'x-gs-bridge-nonce': nonce, 'x-gs-bridge-actor': AGENT,
    'x-gs-bridge-signature': sign(null, Buffer.from(canonical, 'utf8'), PRIVATE).toString('base64url'),
    ...(scheme === SCHEME_V2 ? { 'x-gs-bridge-idempotency-key': idem } : {}) };
  return new Request(u, { method, headers, ...(method === 'GET' ? {} : { body: text }) });
}
const post = (path, body, opts) => signed(path, { method: 'POST', body, ...opts });

const round = (over = {}) => ({
  schema: 'gs-interview-round-v1', clientName: 'Example Ltd', customerId: null, sponsor: 'Sponsor Person', mode: 'team',
  targetMinutes: 20, status: 'open', seatTotal: 3, costEnvelopePence: 5000, endDate: '2026-11-13', retentionDeleteAfter: null,
  enrol: { enabled: true, expiresAt: null, allowedEmailDomains: ['Example.test'], defaultUnitId: OPS },
  units: [{ id: ROOT, parentId: null, name: 'Example Ltd', kind: 'organisation', seatAllocation: null },
    { id: FIN, parentId: ROOT, name: 'Finance', kind: 'team', seatAllocation: 2 },
    { id: OPS, parentId: ROOT, name: 'Operations', kind: 'team', seatAllocation: null }],
  contextPack: { company_background: 'A test company.', scope: 'Revenue scope.', units: { [FIN]: 'Ask about month end.' },
    people: { 'Ann@example.test': 'Ask about the board pack.' } },
  ...over,
});

let pgc;
let pool;
let handler;
const mails = [];
const starts = [];
const logs = [];

before(async () => {
  if (skip) return;
  pgc = startPostgres('interview-bridge');
  await pgc.migrate('003');
  const r = pgc.psql(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'greatstone', 'Greatstone');`);
  assert.equal(r.status, 0, r.stderr);
  await pgc.migrate();
  pool = new pg.Pool({ connectionString: pgc.url, max: 4 });
  handler = makeAdminBridgeHandler({ pool: () => pool, keys: KEYS, allowedIps: new Set(), log: (m) => logs.push(m),
    mail: async (m) => { mails.push(m); return true; }, startSynthesis: async (job) => { starts.push(job); } });
});
after(async () => { await pool?.end(); pgc?.stop(); });

const call = async (req) => { const res = await handler(req); return { status: res.status, body: await res.json() }; };
const sql = (q) => { const r = pgc.psql(q); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };

test('round body checks', () => {
  assert.equal(checkRound(round()).status, 'active');
  assert.deepEqual(checkRound(round()).enrol.domains, ['example.test']);
  assert.throws(() => checkRound(round({ extra: 1 })), { code: 'bad_request' });
  assert.throws(() => checkRound(round({ schema: 'v0' })), { code: 'bad_request' });
  assert.throws(() => checkRound(round({ seatTotal: 0 })), { code: 'bad_request' });
  assert.throws(() => checkRound(round({ enrol: { allowedEmailDomains: [] } })), { code: 'bad_request' });
  assert.throws(() => checkRound(round({ units: [{ id: FIN, parentId: ROOT, name: 'x' }] })), { code: 'bad_request' });
  assert.equal(checkRound(round({ status: 'draft', contextPack: null, seatTotal: 0 })).status, 'draft');
  const mail = inviteEmail({ name: 'Ann', clientName: 'Example Ltd', url: 'https://x/#join/t', targetMinutes: 20 });
  assert.match(mail.text, /https:\/\/x\/#join\/t/);
});

test('GSAM creates, updates and reads a round', { skip }, async () => {
  const created = await call(post(`/api/admin/v1/interview/rounds/${ROUND}`, round()));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const r1 = created.body.round;
  assert.deepEqual([r1.status, r1.mode, r1.seatTotal, r1.contextPackVersion], ['open', 'team', 3, 1]);
  assert.match(r1.joinUrl, /^https:\/\/.+\/#join\/[A-Za-z0-9_-]{32}$/);
  assert.equal(r1.enrol.defaultUnitId, OPS);
  assert.equal(sql(`SELECT org_id FROM interview.engagement WHERE id = '${ROUND}'`), ORG);
  assert.equal(sql(`SELECT count(*) FROM interview.org_unit WHERE engagement_id = '${ROUND}'`), '3');
  assert.equal(sql(`SELECT content->'people'->>'ann@example.test' FROM interview.context_pack WHERE engagement_id = '${ROUND}'`),
    'Ask about the board pack.');

  // the same pack makes no new version; a changed one does; rotating the token changes the link
  const same = await call(post(`/api/admin/v1/interview/rounds/${ROUND}`, round()));
  assert.equal(same.body.round.contextPackVersion, 1);
  assert.equal(same.body.round.joinUrl, r1.joinUrl);
  const changed = await call(post(`/api/admin/v1/interview/rounds/${ROUND}`, round({
    contextPack: { ...round().contextPack, scope: 'Full revenue scope.' }, enrol: { ...round().enrol, rotateToken: true } })));
  assert.equal(changed.body.round.contextPackVersion, 2);
  assert.notEqual(changed.body.round.joinUrl, r1.joinUrl);

  // an over-allocated carve-up is a 400, and nothing of it stays
  const over = await call(post(`/api/admin/v1/interview/rounds/${ROUND}`, round({ units: [
    { id: ROOT, parentId: null, name: 'Example Ltd', kind: 'organisation', seatAllocation: 1 },
    { id: FIN, parentId: ROOT, name: 'Finance', kind: 'team', seatAllocation: 2 },
    { id: OPS, parentId: ROOT, name: 'Operations', kind: 'team', seatAllocation: null }] })));
  assert.equal(over.status, 400, JSON.stringify(over.body));
  assert.equal(sql(`SELECT coalesce(seat_allocation::text, 'null') FROM interview.org_unit WHERE id = '${ROOT}'`), 'null');

  const read = await call(signed(`/api/admin/v1/interview/rounds/${ROUND}`));
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.item.counts, { invited: 0, started: 0, completed: 0, declined: 0, abandoned: 0 });
  // a read key cannot write, and another round id is not found
  assert.equal((await call(signed(`/api/admin/v1/interview/rounds/${ROUND}`, { method: 'POST', kid: 'test-read-1', body: round() }))).status, 403);
  assert.equal((await call(signed('/api/admin/v1/interview/rounds/b1000000-0000-4000-8000-0000000000ff'))).status, 404);
  assert.equal((await call(signed('/api/admin/v1/interview/rounds/not-a-uuid'))).status, 404);
});

test('GSAM invites people; the site emails them once, after commit', { skip }, async () => {
  const body = { send: true, people: [
    { email: 'Ann@Example.test', name: 'Ann Analyst', roleTitle: 'Analyst', unitId: FIN },
    { email: 'bo@example.test', name: 'Bo Boss', portalRole: 'team_leader', unitId: OPS },
    { email: 'cee@client-board.test', name: 'Cee Client', portalRole: 'client_admin' }] };
  const idem = key16();
  const first = await call(post(`/api/admin/v1/interview/rounds/${ROUND}/invites`, body, { idem }));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body.invited.map((i) => [i.email, i.outcome]),
    [['ann@example.test', 'created'], ['bo@example.test', 'created'], ['cee@client-board.test', 'created']]);
  assert.equal(mails.length, 3);
  assert.match(mails[0].text, /#join\//);
  // a retry with the same idempotency key writes and emails nothing again
  const replay = await call(post(`/api/admin/v1/interview/rounds/${ROUND}/invites`, body, { idem }));
  assert.deepEqual(replay.body, first.body);
  assert.equal(mails.length, 3);
  // a second invite of the same people updates them and emails no one
  const again = await call(post(`/api/admin/v1/interview/rounds/${ROUND}/invites`, body));
  assert.deepEqual(again.body.invited.map((i) => i.outcome), ['updated', 'updated', 'updated']);
  assert.equal(mails.length, 3);
  // a domain off the list is refused unless the person is a client admin
  const off = await call(post(`/api/admin/v1/interview/rounds/${ROUND}/invites`, { people: [{ email: 'x@elsewhere.test', name: 'X' }] }));
  assert.equal(off.status, 400);

  const people = await call(signed(`/api/admin/v1/interview/rounds/${ROUND}/people`));
  assert.deepEqual(people.body.items.map((p) => [p.email, p.status, p.portalRole]),
    [['ann@example.test', 'invited', 'employee'], ['bo@example.test', 'invited', 'team_leader'], ['cee@client-board.test', 'invited', 'client_admin']]);
  assert.equal(people.body.items[0].phase, null);
  const read = await call(signed(`/api/admin/v1/interview/rounds/${ROUND}`));
  assert.equal(read.body.item.counts.invited, 3);
});

test('events page oldest first with a cursor; synthesis start is single-flight', { skip }, async () => {
  sql(`INSERT INTO interview.outbox (idempotency_key, engagement_id, payload, created_at) SELECT 'k' || g, '${ROUND}',
    jsonb_build_object('event', 'phase_complete', 'n', g), now() - make_interval(secs => 10 - g) FROM generate_series(1, 3) g;`);
  const p1 = await call(signed(`/api/admin/v1/interview/rounds/${ROUND}/events?limit=2`));
  assert.equal(p1.status, 200, JSON.stringify(p1.body));
  assert.deepEqual(p1.body.items.map((e) => e.payload.n), [1, 2]);
  const p2 = await call(signed(`/api/admin/v1/interview/rounds/${ROUND}/events?limit=2&after=${p1.body.nextCursor}`));
  assert.deepEqual([p2.body.items.map((e) => e.payload.n), p2.body.nextCursor], [[3], null]);
  assert.equal((await call(signed(`/api/admin/v1/interview/rounds/${ROUND}/events?bogus=1`))).status, 400);

  const s1 = await call(post(`/api/admin/v1/interview/rounds/${ROUND}/synthesis`, {}));
  assert.equal(s1.status, 202, JSON.stringify(s1.body));
  assert.deepEqual(starts.map((s) => [s.engagementId, s.origin]), [[ROUND, ORIGIN]]);
  const s2 = await call(post(`/api/admin/v1/interview/rounds/${ROUND}/synthesis`, {}));
  assert.equal(s2.status, 409);
  assert.equal(starts.length, 1);
  const latest = await call(signed(`/api/admin/v1/interview/rounds/${ROUND}/synthesis/latest`));
  assert.deepEqual([latest.status, latest.body.item], [200, null]);
  const released = await call(signed(`/api/admin/v1/interview/rounds/${ROUND}/synthesis/released`));
  assert.deepEqual([released.status, released.body.item], [200, null]);
});

test('close: enrolment off, eligible open sessions closed out, early ones left', { skip }, async () => {
  sql(`INSERT INTO interview.session (employee_id, phase) SELECT id, 'automation' FROM interview.employee WHERE email = 'ann@example.test';
    INSERT INTO interview.session (employee_id, phase) SELECT id, 'warmup' FROM interview.employee WHERE email = 'bo@example.test';
    UPDATE interview.employee SET status = 'started' WHERE email IN ('ann@example.test', 'bo@example.test');`);
  const closed = await call(post(`/api/admin/v1/interview/rounds/${ROUND}/close`, {}));
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.closedSessions, 1);
  assert.deepEqual([closed.body.round.status, closed.body.round.enrol.enabled, closed.body.round.counts.abandoned], ['closed', false, 1]);
  assert.equal(sql(`SELECT count(*) FROM interview.session WHERE ended_at IS NULL`), '1');
  assert.equal(sql(`SELECT count(*) FROM interview.audit_log WHERE engagement_id = '${ROUND}' AND action = 'session.closed_out'`), '1');
  assert.equal(sql(`SELECT count(*) FROM admin_bridge_audit WHERE resource = 'interview'`) > '0', true);
});
