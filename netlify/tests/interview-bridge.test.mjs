// GSAM runs a Parallel Interview round through the signed admin bridge (GRE-2612, contracts/gs-interview-v1):
// create and update a round, invite people, read status and events, start synthesis, release and withdraw, close,
// read completed interviews and push the synthesis GSAM released. Every path is keyed by the organisation id.
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
import { CURRENT as AGREEMENT } from '../functions/lib/interview/agreement.mjs';

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
const CUST = '91000000-0000-4000-8000-000000000001';
const OTHER = '91000000-0000-4000-8000-000000000002';
const ROUND = 'b1000000-0000-4000-8000-000000000001';
const AT = `/api/admin/v1/interview/organisations/${CUST}/rounds`;
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
  schema: 'gs-interview-round-v1', sponsor: 'Sponsor Person', mode: 'team',
  targetMinutes: 20, status: 'open', seatTotal: 3, costEnvelopePence: 5000, endDate: '2026-11-13', retentionDeleteAfter: null,
  enrol: { enabled: true, expiresAt: null, allowedEmailDomains: ['Example.test'], defaultUnitId: OPS },
  units: [{ id: ROOT, parentId: null, name: 'Example Ltd', kind: 'organisation', seatAllocation: null },
    { id: FIN, parentId: ROOT, name: 'Finance', kind: 'team', seatAllocation: 2 },
    { id: OPS, parentId: ROOT, name: 'Operations', kind: 'team', seatAllocation: null }],
  contextPack: { company_background: 'A test company.', scope: 'Revenue scope.', units: { [FIN]: 'Ask about month end.' },
    people: { 'Ann@example.test': 'Ask about the board pack.', 'a7000000-0000-4000-8000-00000000000d': 'Ask about the forecast.' } },
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
  const r = pgc.psql(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'greatstone', 'Greatstone');
    INSERT INTO customers (id, org_id, slug, name) VALUES ('${CUST}', '${ORG}', 'example', 'Example Ltd'),
      ('${OTHER}', '${ORG}', 'other', 'Other Ltd');`);
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
  // the client's name is the organisation's: GSAM no longer sends it
  assert.throws(() => checkRound(round({ clientName: 'Example Ltd' })), { code: 'bad_request' });
  assert.throws(() => checkRound(round({ contextPack: { people: { 'not an id': 'x' } } })), { code: 'bad_request' });
  assert.throws(() => checkRound(round({ schema: 'v0' })), { code: 'bad_request' });
  assert.throws(() => checkRound(round({ seatTotal: 0 })), { code: 'bad_request' });
  assert.throws(() => checkRound(round({ enrol: { allowedEmailDomains: [] } })), { code: 'bad_request' });
  assert.throws(() => checkRound(round({ units: [{ id: FIN, parentId: ROOT, name: 'x' }] })), { code: 'bad_request' });
  assert.equal(checkRound(round({ status: 'draft', contextPack: null, seatTotal: 0 })).status, 'draft');
  const mail = inviteEmail({ name: 'Ann', clientName: 'Example Ltd', url: 'https://x/#join/t', targetMinutes: 20 });
  assert.match(mail.text, /https:\/\/x\/#join\/t/);
});

test('GSAM creates, updates and reads a round', { skip }, async () => {
  const created = await call(post(`${AT}/${ROUND}`, round()));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const r1 = created.body.round;
  assert.deepEqual([r1.status, r1.mode, r1.seatTotal, r1.contextPackVersion], ['open', 'team', 3, 1]);
  // no join link until the organisation accepts the agreement (next test); the token is there
  assert.equal(r1.joinUrl, null);
  const token = () => sql(`SELECT enrol_token FROM interview.engagement WHERE id = '${ROUND}'`);
  const t1 = token();
  assert.match(t1, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(r1.enrol.defaultUnitId, OPS);
  assert.equal(sql(`SELECT org_id || ' ' || customer_id FROM interview.engagement WHERE id = '${ROUND}'`), `${ORG} ${CUST}`);
  assert.equal(r1.organisationId, CUST);
  assert.equal(r1.clientName, undefined);
  assert.equal(sql(`SELECT client_name FROM interview.engagement WHERE id = '${ROUND}'`), 'Example Ltd');
  assert.equal(r1.voice, true);
  const typed = await call(post(`${AT}/${ROUND}`, round({ voice: false })));
  assert.equal(typed.body.round.voice, false);
  assert.equal(sql(`SELECT branding_config->>'voice' FROM interview.engagement WHERE id = '${ROUND}'`), 'false');
  assert.equal((await call(post(`${AT}/${ROUND}`, round({ voice: 'no' })))).status, 400);
  assert.equal(sql(`SELECT count(*) FROM interview.org_unit WHERE engagement_id = '${ROUND}'`), '3');
  assert.equal(sql(`SELECT content->'people'->>'ann@example.test' FROM interview.context_pack WHERE engagement_id = '${ROUND}'`),
    'Ask about the board pack.');
  assert.equal(sql(`SELECT content->'people'->>'a7000000-0000-4000-8000-00000000000d' FROM interview.context_pack WHERE engagement_id = '${ROUND}'`),
    'Ask about the forecast.');

  // the same pack makes no new version; a changed one does; rotating the token changes the link
  const same = await call(post(`${AT}/${ROUND}`, round()));
  assert.equal(same.body.round.contextPackVersion, 1);
  assert.equal(token(), t1);
  const changed = await call(post(`${AT}/${ROUND}`, round({
    contextPack: { ...round().contextPack, scope: 'Full revenue scope.' }, enrol: { ...round().enrol, rotateToken: true } })));
  assert.equal(changed.body.round.contextPackVersion, 2);
  assert.notEqual(token(), t1);

  // an over-allocated carve-up is a 400, and nothing of it stays
  const over = await call(post(`${AT}/${ROUND}`, round({ units: [
    { id: ROOT, parentId: null, name: 'Example Ltd', kind: 'organisation', seatAllocation: 1 },
    { id: FIN, parentId: ROOT, name: 'Finance', kind: 'team', seatAllocation: 2 },
    { id: OPS, parentId: ROOT, name: 'Operations', kind: 'team', seatAllocation: null }] })));
  assert.equal(over.status, 400, JSON.stringify(over.body));
  assert.equal(sql(`SELECT coalesce(seat_allocation::text, 'null') FROM interview.org_unit WHERE id = '${ROOT}'`), 'null');

  const read = await call(signed(`${AT}/${ROUND}`));
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.item.counts, { invited: 0, started: 0, completed: 0, declined: 0, abandoned: 0 });
  // a read key cannot write, and another round id is not found
  assert.equal((await call(signed(`${AT}/${ROUND}`, { method: 'POST', kid: 'test-read-1', body: round() }))).status, 403);
  assert.equal((await call(signed(`${AT}/b1000000-0000-4000-8000-0000000000ff`))).status, 404);
  assert.equal((await call(signed(`${AT}/not-a-uuid`))).status, 404);

  // another organisation cannot see, read or take over the round; an organisation the tenant lacks is refused
  const other = `/api/admin/v1/interview/organisations/${OTHER}/rounds/${ROUND}`;
  assert.equal((await call(signed(other))).status, 404);
  assert.equal((await call(signed(`${other}/people`))).status, 404);
  assert.equal((await call(post(other, round()))).status, 404);
  assert.equal(sql(`SELECT customer_id FROM interview.engagement WHERE id = '${ROUND}'`), CUST);
  const nowhere = '/api/admin/v1/interview/organisations/91000000-0000-4000-8000-0000000000ff/rounds/b1000000-0000-4000-8000-000000000009';
  assert.equal((await call(post(nowhere, round()))).status, 400);
  // the old unkeyed path is gone
  assert.equal((await call(signed(`/api/admin/v1/interview/rounds/${ROUND}`))).status, 404);
});

// gate GRE-2656 (GRE-2794): no invite, resend, reminder or join link until the organisation accepts the agreement
const accept = (customerId, { version = AGREEMENT.version, sha = AGREEMENT.sha256 } = {}) => sql(`INSERT INTO interview.agreement_acceptance
    (customer_id, agreement_key, agreement_version, content_sha256, user_id, customer_user_id, name, email, role_title, legal_name,
     read_confirmed, authority_confirmed, ip_address)
  VALUES ('${customerId}', 'interview-dpa', '${version}', '${sha}', 'a7000000-0000-4000-8000-0000000000aa',
    'a8000000-0000-4000-8000-0000000000aa', 'Ada Admin', 'ada@example.test', 'Director', 'Example Ltd', true, true, '192.0.2.1')`);

test('without an accepted agreement GSAM can create, send, resend or remind no invite, and gets no join link', { skip }, async () => {
  const refused = (r) => { assert.equal(r.status, 409, JSON.stringify(r.body)); assert.deepEqual(r.body, { error: { code: 'agreement_required' } }); };
  const people = { send: true, people: [{ email: 'ann@example.test', name: 'Ann Analyst' }] };
  refused(await call(post(`${AT}/${ROUND}/invites`, people)));
  refused(await call(post(`${AT}/${ROUND}/invites`, { send: false, people: people.people })));
  // resend and remind name someone on the round; GSAM put them there before the gate (or by hand)
  sql(`INSERT INTO interview.employee (engagement_id, email, name, status) VALUES ('${ROUND}', 'pre@example.test', 'Pre Gate', 'invited')`);
  const pre = sql(`SELECT id FROM interview.employee WHERE email = 'pre@example.test'`);
  refused(await call(post(`${AT}/${ROUND}/invites/send`, { kind: 'resend', employeeIds: [pre] })));
  refused(await call(post(`${AT}/${ROUND}/invites/send`, { kind: 'remind', employeeIds: [pre] })));
  assert.equal(mails.length, 0);
  assert.equal(sql(`SELECT count(*) FROM interview.employee WHERE engagement_id = '${ROUND}'`), '1');
  // the refusal is audited as a conflict and leaves no invite audit
  assert.equal(sql(`SELECT count(*) FROM interview.audit_log WHERE engagement_id = '${ROUND}' AND action LIKE 'round.%' AND action <> 'round.created' AND action <> 'round.updated'`), '0');
  const view = (await call(signed(`${AT}/${ROUND}`))).body.item;
  assert.equal(view.joinUrl, null);
  assert.deepEqual(view.agreement, { version: AGREEMENT.version, contentSha256: AGREEMENT.sha256, accepted: false, acceptedAt: null });

  // an acceptance of an older text, or of another organisation, does not open it
  accept(CUST, { version: 'v1', sha: 'a'.repeat(64) });
  accept(OTHER);
  refused(await call(post(`${AT}/${ROUND}/invites`, people)));
  refused(await call(post(`${AT}/${ROUND}/invites/send`, { kind: 'remind', employeeIds: [pre] })));

  // the current text accepted: the link shows and the invites go out
  accept(CUST);
  const opened = (await call(signed(`${AT}/${ROUND}`))).body.item;
  assert.match(opened.joinUrl, /#join\//);
  assert.equal(opened.agreement.accepted, true);
  assert.match(opened.agreement.acceptedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal((await call(post(`${AT}/${ROUND}/invites/send`, { kind: 'remind', employeeIds: [pre] }))).status, 200);
  mails.length = 0;
  sql(`DELETE FROM interview.employee WHERE email = 'pre@example.test'`);
});

test('GSAM invites people; the site emails them once, after commit', { skip }, async () => {
  const body = { send: true, people: [
    { email: 'Ann@Example.test', name: 'Ann Analyst', roleTitle: 'Analyst', unitId: FIN },
    { email: 'bo@example.test', name: 'Bo Boss', portalRole: 'team_leader', unitId: OPS },
    { email: 'cee@client-board.test', name: 'Cee Client', portalRole: 'client_admin' }] };
  const idem = key16();
  const first = await call(post(`${AT}/${ROUND}/invites`, body, { idem }));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  // GSAM gets ids only: no account yet, so no user id until the person joins
  assert.deepEqual(first.body.invited.map((i) => [i.userId, i.organisationId, i.outcome, i.email]),
    [[null, CUST, 'created', undefined], [null, CUST, 'created', undefined], [null, CUST, 'created', undefined]]);
  assert.equal(mails.length, 3);
  assert.match(mails[0].text, /#join\//);
  // a retry with the same idempotency key writes and emails nothing again
  const replay = await call(post(`${AT}/${ROUND}/invites`, body, { idem }));
  assert.deepEqual(replay.body, first.body);
  assert.equal(mails.length, 3);
  // a second invite of the same people updates them and emails no one
  const again = await call(post(`${AT}/${ROUND}/invites`, body));
  assert.deepEqual(again.body.invited.map((i) => i.outcome), ['updated', 'updated', 'updated']);
  assert.equal(mails.length, 3);
  // a domain off the list is refused unless the person is a client admin
  const off = await call(post(`${AT}/${ROUND}/invites`, { people: [{ email: 'x@elsewhere.test', name: 'X' }] }));
  assert.equal(off.status, 400);

  // an existing website account of the organisation is invited by user id; the site reads its name and email
  sql(`INSERT INTO better_auth."user" (id, name, email, "emailVerified") VALUES ('a7000000-0000-4000-8000-00000000000d', 'Dee Account', 'Dee@example.test', true),
      ('a7000000-0000-4000-8000-00000000000e', 'Eve Outsider', 'eve@example.test', true);
    INSERT INTO customer_users (org_id, customer_id, email, full_name, auth_subject)
      VALUES ('${ORG}', '${CUST}', 'dee@example.test', 'Dee Director', 'a7000000-0000-4000-8000-00000000000d'),
             ('${ORG}', '${OTHER}', 'eve@example.test', 'Eve Outsider', 'a7000000-0000-4000-8000-00000000000e');`);
  const dee = await call(post(`${AT}/${ROUND}/invites`, { send: true, people: [{ userId: 'a7000000-0000-4000-8000-00000000000d', roleTitle: 'Director', unitId: FIN }] }));
  assert.equal(dee.status, 200, JSON.stringify(dee.body));
  assert.deepEqual(dee.body.invited.map((i) => [i.userId, i.organisationId, i.outcome]), [['a7000000-0000-4000-8000-00000000000d', CUST, 'created']]);
  assert.equal(mails.length, 4);
  assert.equal(mails[3].to, 'dee@example.test');
  assert.equal(sql(`SELECT e.name || ' ' || e.email || ' ' || p.auth_user_id FROM interview.employee e JOIN interview.person p
    ON p.person_id = e.person_id WHERE e.user_id = 'a7000000-0000-4000-8000-00000000000d'`), 'Dee Director dee@example.test a7000000-0000-4000-8000-00000000000d');
  // a member of another organisation, an unknown id, and a mixed body are refused, and nothing is written
  for (const people of [[{ userId: 'a7000000-0000-4000-8000-00000000000e' }], [{ userId: 'a7000000-0000-4000-8000-0000000000ff' }], [{ userId: 'a7000000-0000-4000-8000-00000000000d', email: 'dee@example.test' }]]) {
    assert.equal((await call(post(`${AT}/${ROUND}/invites`, { people }))).status, 400, JSON.stringify(people));
  }
  assert.equal(sql(`SELECT count(*) FROM interview.employee WHERE engagement_id = '${ROUND}'`), '4');
  // an invitation held by email is linked when GSAM later names the account
  sql(`INSERT INTO better_auth."user" (id, name, email, "emailVerified") VALUES ('a7000000-0000-4000-8000-00000000000c', 'Cee', 'cee@client-board.test', true);
    INSERT INTO customer_users (org_id, customer_id, email, full_name, auth_subject)
      VALUES ('${ORG}', '${CUST}', 'cee@client-board.test', 'Cee Client', 'a7000000-0000-4000-8000-00000000000c');`);
  const cee = await call(post(`${AT}/${ROUND}/invites`, { people: [{ userId: 'a7000000-0000-4000-8000-00000000000c', portalRole: 'client_admin' }] }));
  assert.deepEqual(cee.body.invited.map((i) => [i.userId, i.outcome]), [['a7000000-0000-4000-8000-00000000000c', 'updated']]);

  const people = await call(signed(`${AT}/${ROUND}/people`));
  assert.deepEqual(people.body.items.map((p) => [p.userId, p.email, p.status, p.portalRole]),
    [[null, 'ann@example.test', 'invited', 'employee'], [null, 'bo@example.test', 'invited', 'team_leader'],
      ['a7000000-0000-4000-8000-00000000000c', 'cee@client-board.test', 'invited', 'client_admin'], ['a7000000-0000-4000-8000-00000000000d', 'dee@example.test', 'invited', 'employee']]);
  assert.equal(people.body.items[0].phase, null);
  const read = await call(signed(`${AT}/${ROUND}`));
  assert.equal(read.body.item.counts.invited, 4);
});

test('GSAM resends the link or sends a reminder; each new key emails again, a replay does not', { skip }, async () => {
  const DEE = 'a7000000-0000-4000-8000-00000000000d';
  const CEE = 'a7000000-0000-4000-8000-00000000000c';
  const ann = sql(`SELECT id FROM interview.employee WHERE engagement_id = '${ROUND}' AND email = 'ann@example.test'`);
  const send = (body, opts) => call(post(`${AT}/${ROUND}/invites/send`, body, opts));
  const before = mails.length;
  // by user id, and by employee id for an invitation not yet taken up
  const idem = key16();
  const first = await send({ kind: 'resend', userIds: [DEE], employeeIds: [ann] }, { idem });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body, { emailed: 2, skipped: 0 });
  assert.deepEqual(mails.slice(before).map((m) => m.to).sort(), ['ann@example.test', 'dee@example.test']);
  assert.match(mails[before].text, /#join\//);
  assert.deepEqual((await send({ kind: 'resend', userIds: [DEE], employeeIds: [ann] }, { idem })).body, first.body);
  assert.equal(mails.length, before + 2);
  // a second reminder with a new key is sent
  for (let i = 1; i <= 2; i += 1) {
    assert.deepEqual((await send({ kind: 'remind', userIds: [DEE] })).body, { emailed: 1, skipped: 0 });
    assert.equal(mails.length, before + 2 + i);
  }
  assert.match(mails.at(-1).subject, /reminder/);
  // resend skips someone who has started; remind still reaches them; neither reaches someone who finished
  sql(`UPDATE interview.employee SET status = 'started' WHERE user_id = '${DEE}'; UPDATE interview.employee SET status = 'completed' WHERE user_id = '${CEE}'`);
  assert.deepEqual((await send({ kind: 'resend', userIds: [DEE, CEE] })).body, { emailed: 0, skipped: 2 });
  assert.deepEqual((await send({ kind: 'remind', userIds: [DEE, CEE] })).body, { emailed: 1, skipped: 1 });
  sql(`UPDATE interview.employee SET status = 'invited' WHERE user_id IN ('${DEE}', '${CEE}')`);
  // someone not on the round, a bad kind, or an empty list is refused
  assert.equal((await send({ kind: 'remind', userIds: ['a7000000-0000-4000-8000-00000000000e'] })).status, 400);
  assert.equal((await send({ kind: 'nag', userIds: [DEE] })).status, 400);
  assert.equal((await send({ kind: 'remind', userIds: [] })).status, 400);
  // another organisation's path cannot send for this round
  assert.equal((await call(post(`/api/admin/v1/interview/organisations/${OTHER}/rounds/${ROUND}/invites/send`, { kind: 'remind', userIds: [DEE] }))).status, 404);
});

test('events page oldest first with a cursor; synthesis start is single-flight', { skip }, async () => {
  sql(`INSERT INTO interview.outbox (idempotency_key, engagement_id, payload, created_at) SELECT 'k' || g, '${ROUND}',
    jsonb_build_object('event', 'phase_complete', 'n', g), now() - make_interval(secs => 10 - g) FROM generate_series(1, 3) g;`);
  const p1 = await call(signed(`${AT}/${ROUND}/events?limit=2`));
  assert.equal(p1.status, 200, JSON.stringify(p1.body));
  assert.deepEqual(p1.body.items.map((e) => e.payload.n), [1, 2]);
  const p2 = await call(signed(`${AT}/${ROUND}/events?limit=2&after=${p1.body.nextCursor}`));
  assert.deepEqual([p2.body.items.map((e) => e.payload.n), p2.body.nextCursor], [[3], null]);
  assert.equal((await call(signed(`${AT}/${ROUND}/events?bogus=1`))).status, 400);

  const s1 = await call(post(`${AT}/${ROUND}/synthesis`, {}));
  assert.equal(s1.status, 202, JSON.stringify(s1.body));
  assert.deepEqual(starts.map((s) => [s.engagementId, s.origin]), [[ROUND, ORIGIN]]);
  const s2 = await call(post(`${AT}/${ROUND}/synthesis`, {}));
  assert.equal(s2.status, 409);
  assert.equal(starts.length, 1);
  const latest = await call(signed(`${AT}/${ROUND}/synthesis/latest`));
  assert.deepEqual([latest.status, latest.body.item], [200, null]);
  const released = await call(signed(`${AT}/${ROUND}/synthesis/released`));
  assert.deepEqual([released.status, released.body.item], [200, null]);
});

test('close: enrolment off, eligible open sessions closed out, early ones left', { skip }, async () => {
  sql(`UPDATE interview.employee SET user_id = 'ba-' || split_part(email, '@', 1) WHERE email IN ('ann@example.test', 'bo@example.test');
    INSERT INTO interview.session (employee_id, phase) SELECT id, 'automation' FROM interview.employee WHERE email = 'ann@example.test';
    INSERT INTO interview.session (employee_id, phase) SELECT id, 'warmup' FROM interview.employee WHERE email = 'bo@example.test';
    UPDATE interview.employee SET status = 'started' WHERE email IN ('ann@example.test', 'bo@example.test');`);
  const closed = await call(post(`${AT}/${ROUND}/close`, {}));
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.closedSessions, 1);
  assert.deepEqual([closed.body.round.status, closed.body.round.enrol.enabled, closed.body.round.counts.abandoned], ['closed', false, 1]);
  assert.equal(sql(`SELECT count(*) FROM interview.session WHERE ended_at IS NULL`), '1');
  assert.equal(sql(`SELECT count(*) FROM interview.audit_log WHERE engagement_id = '${ROUND}' AND action = 'session.closed_out'`), '1');
  assert.equal(sql(`SELECT count(*) FROM admin_bridge_audit WHERE resource = 'interview'`) > '0', true);
});

const ANN_SAYS = 'Every month end I rebuild the board pack by hand from four spreadsheets and it takes two full days.';
const BO_SAYS = 'My team rebuilds the board pack by hand every month and we lose about two days of work to it.';
const theme = (quotes) => ({ theme_id: 't1', label: 'Board pack rebuilt by hand', summary: 'Manual board pack.',
  evidence_quotes: quotes });

test('GSAM reads completed interviews and pushes its released synthesis; the site re-verifies it', { skip }, async () => {
  // Ann's closed-out automation session is partial; Bo finished a second, complete session
  sql(`INSERT INTO interview.session (employee_id, phase, started_at, ended_at, resumable)
      SELECT id, 'sign_off', now() - interval '30 minutes', now(), false FROM interview.employee WHERE email = 'bo@example.test';
    INSERT INTO interview.turn (session_id, role, content) SELECT s.id, 'user', CASE e.email WHEN 'ann@example.test' THEN '${ANN_SAYS}' ELSE '${BO_SAYS}' END
      FROM interview.session s JOIN interview.employee e ON e.id = s.employee_id WHERE s.ended_at IS NOT NULL;
    INSERT INTO interview.insight (session_id, type, label, evidence_quote, confidence)
      SELECT s.id, 'pain', 'Board pack by hand', CASE e.email WHEN 'ann@example.test' THEN '${ANN_SAYS}' ELSE '${BO_SAYS}' END, 0.9
      FROM interview.session s JOIN interview.employee e ON e.id = s.employee_id WHERE s.ended_at IS NOT NULL;`);

  const list = await call(signed(`${AT}/${ROUND}/interviews`));
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.deepEqual(list.body.items.map((i) => [i.userId, i.complete, i.partial]).sort(), [['ba-ann', false, true], ['ba-bo', true, false]]);
  assert.equal(list.body.counts.eligible, 2);
  const one = list.body.items.find((i) => i.userId === 'ba-ann');
  const detail = await call(signed(`${AT}/${ROUND}/interviews/${one.interviewId}`));
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.deepEqual(detail.body.item.turns.map((t) => [t.role, t.content]), [['user', ANN_SAYS]]);
  assert.equal(detail.body.item.insights[0].quoteEligible, true);
  assert.equal(detail.body.item.insights[0].confidence, 0.7); // partial: capped
  // an interview of this round is not readable through another organisation
  assert.equal((await call(signed(`/api/admin/v1/interview/organisations/${OTHER}/rounds/${ROUND}/interviews/${one.interviewId}`))).status, 404);
  assert.equal((await call(signed(`${AT}/${ROUND}/interviews/b9000000-0000-4000-8000-000000000001`))).status, 404);

  const ids = Object.fromEntries((await Promise.all(list.body.items.map(async (i) =>
    [i.userId, (await call(signed(`${AT}/${ROUND}/interviews/${i.interviewId}`))).body.item.insights[0].id]))));
  const push = (over) => ({ schema: 'gs-interview-synthesis-v1', synthesisId: 'b5000000-0000-4000-8000-000000000001',
    headlineRead: { text: 'The board pack costs two days a month.', supporting_insight_ids: Object.values(ids) },
    themes: [theme([{ insight_id: ids['ba-ann'], quote: ANN_SAYS }, { insight_id: ids['ba-bo'], quote: BO_SAYS }])],
    hotSpots: [], recommendations: [], followUps: [], methodology: { interviews: 2 }, modelVersion: 'gsam', rulesVersion: 'v1',
    inputInsightIds: Object.values(ids), ...over });

  // one voice only: the two-voice rule refuses it and nothing is stored
  const lone = await call(post(`${AT}/${ROUND}/synthesis/released`, push({ synthesisId: 'b5000000-0000-4000-8000-000000000002',
    themes: [theme([{ insight_id: ids['ba-ann'], quote: ANN_SAYS }, { insight_id: ids['ba-ann'], quote: ANN_SAYS }])] })));
  assert.equal(lone.status, 400, JSON.stringify(lone.body));
  // a quote that is not in the stored turns is refused too
  const made = await call(post(`${AT}/${ROUND}/synthesis/released`, push({ synthesisId: 'b5000000-0000-4000-8000-000000000003',
    themes: [theme([{ insight_id: ids['ba-ann'], quote: 'We never had a problem with the board pack at all, it is quick.' },
      { insight_id: ids['ba-bo'], quote: BO_SAYS }])] })));
  assert.equal(made.status, 400);
  assert.equal(sql(`SELECT count(*) FROM interview.synthesis WHERE engagement_id = '${ROUND}'`), '0');
  assert.equal((await call(post(`${AT}/${ROUND}/synthesis/released`, push({ schema: 'v0' })))).status, 400);

  const ok = await call(post(`${AT}/${ROUND}/synthesis/released`, push()));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual([ok.body.synthesisId, ok.body.version, ok.body.round.released.synthesisId],
    ['b5000000-0000-4000-8000-000000000001', 1, 'b5000000-0000-4000-8000-000000000001']);
  const released = await call(signed(`${AT}/${ROUND}/synthesis/released`));
  assert.equal(released.body.item.themes[0].theme_id, 't1');
  assert.equal(sql(`SELECT customer_id FROM interview.synthesis WHERE id = 'b5000000-0000-4000-8000-000000000001'`), CUST);
  // the same synthesis id again is a conflict
  assert.equal((await call(post(`${AT}/${ROUND}/synthesis/released`, push()))).status, 409);
});

test('withdrawals: a hard-deleted interview or person is listed for GSAM; a deleted round lists nothing', { skip }, async () => {
  const empty = await call(signed(`${AT}/${ROUND}/withdrawals`));
  assert.deepEqual([empty.status, empty.body.items, empty.body.nextCursor], [200, [], null]);
  const annSession = sql(`SELECT s.id FROM interview.session s JOIN interview.employee e ON e.id = s.employee_id
    WHERE e.user_id = 'ba-ann' LIMIT 1`);
  sql(`DELETE FROM interview.session WHERE id = '${annSession}';`);
  // a person removed with their sessions is one row for the person
  sql(`DELETE FROM interview.employee WHERE user_id = 'ba-bo';`);
  const p1 = await call(signed(`${AT}/${ROUND}/withdrawals?limit=1`));
  assert.equal(p1.status, 200, JSON.stringify(p1.body));
  assert.deepEqual(p1.body.items.map((w) => [w.userId, w.interviewId]), [['ba-ann', annSession]]);
  const p2 = await call(signed(`${AT}/${ROUND}/withdrawals?after=${p1.body.nextCursor}`));
  assert.deepEqual([p2.body.items.map((w) => [w.userId, w.interviewId]), p2.body.nextCursor], [[['ba-bo', null]], null]);
  assert.equal(sql(`SELECT count(*) FROM interview.withdrawal WHERE customer_id = '${CUST}'`), '2');
  assert.equal((await call(signed(`/api/admin/v1/interview/organisations/${OTHER}/rounds/${ROUND}/withdrawals`))).status, 404);
  assert.equal((await call(signed(`${AT}/${ROUND}/withdrawals?bogus=1`))).status, 400);
  // retention deletes the round: its cascade writes no withdrawals (and the round's rows go with it)
  sql(`DELETE FROM interview.engagement WHERE id = '${ROUND}';`);
  assert.equal(sql(`SELECT count(*) FROM interview.withdrawal`), '0');
});
