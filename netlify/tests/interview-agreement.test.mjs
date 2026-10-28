// The client accepts the interview data processing agreement in the app before any invite goes out (GRE-2794, gate
// GRE-2656). On a throwaway real Postgres with every migration: a company admin accepts through
// /api/interview/agreement, the record holds every field and cannot be edited, a new text blocks until accepted
// again, the join link and the seat stay shut until then, and the admin and GSAM can download the accepted copy.
// The bridge's invite routes are covered in interview-bridge.test.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, randomBytes, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ORG, ORIGIN, asWorker, makeHandlers, makeVerify, newCustomer, portal, post, quietLog, seedRound, skip,
  startInterviewDb } from './lib/interview-harness.mjs';
import { makeAgreementHandler } from '../functions/interview-agreement.mjs';
import { makeAdminBridgeHandler } from '../functions/admin-bridge.mjs';
import { SCHEME, canonicalQuery, canonicalString, parseBridgeKeys } from '../functions/lib/admin-bridge-auth.mjs';
import { AGREEMENT_KEY, CURRENT, agreementHtml, checkAcceptance, requireAgreement } from '../functions/lib/interview/agreement.mjs';
import { TEXT as DPA_V2 } from '../functions/lib/interview/agreement/dpa-v2.mjs';
import { interviewDb } from '../functions/lib/interview/db.mjs';

// website accounts: Better Auth ids are uuids here (auth.sync_better_auth_user refuses others)
const account = (label) => ({ id: randomUUID(), email: `${label}@example.test`, name: label[0].toUpperCase() + label.slice(1), emailVerified: true });
const ENV = { INTERVIEW_ENABLED: '1', JOIN_RATE_TOKEN_PER_MIN: '1000', JOIN_RATE_IP_PER_MIN: '1000', VOICE_ENABLED: '0' };
const admin = account('ada');
const member = account('max');
const outsider = account('oli');
const staffer = account('eve');
const people = [admin, member, outsider, staffer];
let db;
let cust;
let elsewhere;
let round;
let agreement;
let h;

const form = (over = {}) => ({ version: CURRENT.version, contentSha256: CURRENT.sha256, readConfirmed: true, authorityConfirmed: true,
  name: 'Ada Admin', roleTitle: 'Operations Director', legalName: 'Example Holdings Limited', companyCountry: 'England and Wales',
  companyNumber: '01234567', registeredAddress: '1 Test Street, London', ...over });
const ask = async (user, body, headers = {}) => {
  const res = await agreement(post('/api/interview/agreement', { user, body, headers }));
  return { status: res.status, body: await res.json() };
};

before(async () => {
  if (skip) return;
  db = await startInterviewDb('interview-agreement');
  cust = newCustomer(db.sql, 'Example Ltd');
  elsewhere = newCustomer(db.sql, 'Elsewhere Ltd');
  for (const a of people) db.sql(`INSERT INTO better_auth."user" (id, name, email, "emailVerified") VALUES ('${a.id}', '${a.name}', '${a.email}', true)`);
  db.sql(`INSERT INTO customer_users (org_id, customer_id, email, full_name, auth_subject, role) VALUES
    ('${ORG}', '${cust}', '${admin.email}', 'Ada Admin', '${admin.id}', 'admin'),
    ('${ORG}', '${cust}', '${member.email}', 'Max Member', '${member.id}', 'member'),
    ('${ORG}', '${elsewhere}', '${outsider.email}', 'Oli Outsider', '${outsider.id}', 'admin')`);
  round = seedRound(db.sql, { customerId: cust, agreement: false });
  const verify = makeVerify(people);
  agreement = makeAgreementHandler({ pool: () => db.pool, verify, env: ENV, log: quietLog });
  h = makeHandlers({ pool: db.pool, env: ENV, verify });
});
after(async () => { await db?.stop(); });

test('the agreement text is the approved dpa v2, unchanged, rendered with everything escaped', () => {
  assert.equal(CURRENT.key, AGREEMENT_KEY);
  assert.equal(CURRENT.version, 'v2');
  assert.equal(CURRENT.text, DPA_V2);
  assert.equal(CURRENT.sha256, createHash('sha256').update(DPA_V2, 'utf8').digest('hex'));
  assert.match(DPA_V2, /^## Data processing agreement\n/);
  assert.match(DPA_V2, /Greatstone International Limited/);
  assert.match(DPA_V2, /## Schedule 4: Privacy notice shown to Participants/);
  const html = agreementHtml(DPA_V2);
  assert.match(html, /<h3>Data processing agreement<\/h3>/);
  assert.match(html, /<table><thead><tr><th>Sub-processor<\/th>/);
  assert.match(html, /<code>mip_opt_out<\/code>/);
  assert.equal(agreementHtml('<script>alert(1)</script> **x**'), '<p>&lt;script&gt;alert(1)&lt;/script&gt; <strong>x</strong></p>');
  // the form: both ticks, the typed name, role and legal name, and the text the admin was shown
  assert.ok(checkAcceptance(form()).value);
  assert.match(checkAcceptance(form({ readConfirmed: false })).error, /read/);
  assert.match(checkAcceptance(form({ authorityConfirmed: 'yes' })).error, /authority/);
  assert.match(checkAcceptance(form({ roleTitle: ' ' })).error, /role/);
  assert.match(checkAcceptance(form({ legalName: '' })).error, /legal name/);
  assert.equal(checkAcceptance(form({ contentSha256: 'b'.repeat(64) })).stale, true);
  assert.equal(checkAcceptance(form({ version: 'v1' })).stale, true);
  assert.equal(checkAcceptance({ ...form(), ipAddress: '1.1.1.1' }).error, 'Invalid request.');
});

test('before acceptance: no join link works and no seat is taken', { skip }, async () => {
  const info = await h.join(post('/api/interview/join', { body: { op: 'info', token: round.token } }));
  assert.equal((await info.json()).data.valid, false);
  const person = account('ivy');
  h = makeHandlers({ pool: db.pool, env: ENV, verify: makeVerify([...people, person]) });
  const joined = await h.join(post('/api/interview/join', { user: person, body: { op: 'enrol', token: round.token, name: 'Ivy' } }));
  assert.equal(joined.status, 400);
  assert.match((await joined.json()).data.message, /not open yet/);
  assert.equal(db.sql(`SELECT count(*) FROM interview.employee WHERE engagement_id = '${round.id}'`), '0');
  // someone already on the round (GSAM put them there) cannot take a seat either
  db.sql(`INSERT INTO interview.employee (engagement_id, unit_id, email, name, status, user_id)
    VALUES ('${round.id}', '${round.teamUnit}', '${person.email}', 'Ivy', 'invited', '${person.id}')`);
  const started = await portal(h, person, 'start', { dataConsent: true });
  assert.equal(started.body.data.redirect, '#portal/interview?seats=not-open');
  assert.equal(db.sql(`SELECT count(*) FROM interview.session s JOIN interview.employee e ON e.id = s.employee_id
    WHERE e.engagement_id = '${round.id}'`), '0');
  assert.equal(db.sql(`SELECT count(*) FROM interview.consent_event c JOIN interview.employee e ON e.id = c.employee_id
    WHERE e.engagement_id = '${round.id}' AND c.kind = 'participation'`), '0'); // refused before anything is written
  const page = await portal(h, person, 'interview-page', { seats: 'not-open' });
  assert.equal(page.body.data.seats, 'not-open');
  globalThis.ivy = person;
});

test('any member sees the agreement and its state; only a company admin can accept', { skip }, async () => {
  const seen = await ask(member, { op: 'status' });
  assert.equal(seen.status, 200, JSON.stringify(seen.body));
  assert.deepEqual([seen.body.data.accepted, seen.body.data.isAdmin, seen.body.data.organisationName], [false, false, 'Example Ltd']);
  assert.equal(seen.body.data.agreement.contentSha256, CURRENT.sha256);
  assert.match(seen.body.data.agreement.html, /Data processing agreement/);
  assert.equal(seen.body.data.wording.readLabel.length > 0, true);
  const mine = await ask(admin, { op: 'status' });
  assert.deepEqual([mine.body.data.isAdmin, mine.body.data.defaultName], [true, 'Ada Admin']);

  assert.equal((await ask(member, { op: 'accept', ...form() })).status, 403);
  assert.equal((await ask(staffer, { op: 'accept', ...form() })).status, 403); // no organisation
  assert.equal((await ask(null, { op: 'accept', ...form() })).status, 401);
  assert.equal((await ask(admin, { op: 'accept', ...form({ authorityConfirmed: false }) })).status, 400);
  assert.equal((await ask(admin, { op: 'accept', ...form({ contentSha256: 'c'.repeat(64) }) })).status, 409);
  assert.equal(db.sql('SELECT count(*) FROM interview.agreement_acceptance'), '0');
});

test('the acceptance stores every field, once, and cannot be edited or deleted', { skip }, async () => {
  const done = await ask(admin, { op: 'accept', ...form() }, { 'x-nf-client-connection-ip': '203.0.113.7', 'user-agent': 'TestBrowser/1' });
  assert.equal(done.status, 201, JSON.stringify(done.body));
  const a = done.body.data.acceptance;
  const cuId = db.sql(`SELECT id FROM customer_users WHERE auth_subject = '${admin.id}'`);
  assert.deepEqual({ ...a, id: undefined, acceptedAt: undefined }, {
    id: undefined, acceptedAt: undefined, organisationId: cust, agreementKey: 'interview-dpa', version: 'v2', contentSha256: CURRENT.sha256,
    userId: admin.id, name: 'Ada Admin', email: admin.email, roleTitle: 'Operations Director', legalName: 'Example Holdings Limited',
    companyCountry: 'England and Wales', companyNumber: '01234567', registeredAddress: '1 Test Street, London',
    readConfirmed: true, authorityConfirmed: true, ipAddress: '203.0.113.7', current: true });
  assert.ok(Math.abs(Date.parse(a.acceptedAt) - Date.now()) < 60_000);
  assert.match(a.acceptedAt, /Z$/);
  assert.equal(db.sql(`SELECT customer_user_id || ' ' || user_agent FROM interview.agreement_acceptance WHERE id = '${a.id}'`),
    `${cuId} TestBrowser/1`);
  // accepting again keeps the first record
  const again = await ask(admin, { op: 'accept', ...form({ roleTitle: 'CEO' }) });
  assert.equal(again.status, 200);
  assert.deepEqual([again.body.data.created, again.body.data.acceptance.id, again.body.data.acceptance.roleTitle], [false, a.id, 'Operations Director']);
  // kept as written, by every role: the owner, the worker with system claims
  for (const q of [`UPDATE interview.agreement_acceptance SET role_title = 'x'`, 'DELETE FROM interview.agreement_acceptance',
    'TRUNCATE interview.agreement_acceptance']) {
    const r = db.pgc.psql(q);
    assert.notEqual(r.status, 0, q);
    assert.match(r.stderr, /kept as written/);
  }
  const sys = interviewDb('system', { pool: db.pool });
  assert.equal((await sys.sql(`UPDATE agreement_acceptance SET name = 'x'`)).error.code, '42501');
  assert.equal(db.sql('SELECT count(*) FROM interview.agreement_acceptance'), '1');
  // a participant and another organisation's system claims see none of it
  const count = (claims) => asWorker(db.pool, claims, async (c) => (await c.query('SELECT count(*)::int AS n FROM interview.agreement_acceptance')).rows[0].n);
  assert.equal(await count({ scope: 'system', customer_id: cust }), 1);
  assert.equal(await count({ scope: 'system', customer_id: elsewhere }), 0);
  assert.equal(await count({ scope: 'participant', sub: admin.id, email: admin.email }), 0);
  await assert.rejects(asWorker(db.pool, { scope: 'system', customer_id: elsewhere }, (c) => c.query(`INSERT INTO interview.agreement_acceptance
      (customer_id, agreement_key, agreement_version, content_sha256, user_id, customer_user_id, name, email, role_title, legal_name,
       read_confirmed, authority_confirmed, ip_address)
    VALUES ('${cust}', 'interview-dpa', 'v2', '${'d'.repeat(64)}', 'x', '${randomUUID()}', 'X', 'x@x.test', 'X', 'X', true, true, '1')`)), { code: '42501' });
  const status = await ask(admin, { op: 'status' });
  assert.deepEqual([status.body.data.accepted, status.body.data.history.length], [true, 1]);
  assert.equal((await ask(member, { op: 'status' })).body.data.history.length, 0);
  globalThis.acceptanceId = a.id;
});

test('after acceptance the join link and the seat open', { skip }, async () => {
  const info = await h.join(post('/api/interview/join', { body: { op: 'info', token: round.token } }));
  assert.equal((await info.json()).data.valid, true);
  const started = await portal(h, globalThis.ivy, 'start', { dataConsent: true });
  assert.equal(started.body.data.redirect, '#portal/interview/session', JSON.stringify(started.body));
});

test('a new agreement text blocks invites until the organisation accepts it', { skip }, async () => {
  const sys = interviewDb('system', { pool: db.pool });
  const next = { key: CURRENT.key, version: 'v3', sha256: createHash('sha256').update(`${DPA_V2}\nA changed clause.\n`).digest('hex') };
  await requireAgreement(sys, cust); // v2 accepted
  await assert.rejects(requireAgreement(sys, cust, next), { code: 'agreement_required' });
  db.sql(`INSERT INTO interview.agreement_acceptance (customer_id, agreement_key, agreement_version, content_sha256, user_id,
      customer_user_id, name, email, role_title, legal_name, read_confirmed, authority_confirmed, ip_address)
    VALUES ('${cust}', 'interview-dpa', 'v3', '${next.sha256}', '${admin.id}', '${randomUUID()}', 'Ada Admin', '${admin.email}', 'Director',
      'Example Holdings Limited', true, true, '203.0.113.7')`);
  await requireAgreement(sys, cust, next);
  // and the v2 record is still there, unchanged
  assert.equal(db.sql(`SELECT count(*) FROM interview.agreement_acceptance WHERE customer_id = '${cust}'`), '2');
});

test('the company admin downloads the accepted agreement with its record', { skip }, async () => {
  const get = (user, id) => agreement(new Request(`${ORIGIN}/api/interview/agreement?copy=${id}`,
    { headers: user ? { authorization: `Bearer tok:${user.id}` } : {} }));
  const res = await get(admin, globalThis.acceptanceId);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html/);
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="interview-dpa-v2-\d{4}-\d{2}-\d{2}\.html"$/);
  const html = await res.text();
  for (const s of ['Acceptance record', 'Example Holdings Limited', 'Operations Director', '203.0.113.7', CURRENT.sha256, admin.id,
    'Ada Admin', 'Schedule 2: Sub-processors', 'Greatstone International Limited']) assert.ok(html.includes(s), s);
  assert.equal((await get(member, globalThis.acceptanceId)).status, 403);
  assert.equal((await get(outsider, globalThis.acceptanceId)).status, 404); // another organisation's admin
  assert.equal((await get(null, globalThis.acceptanceId)).status, 401);
  assert.equal((await get(admin, 'not-an-id')).status, 400);
});

test('GSAM reads the acceptance and downloads the copy through the bridge', { skip }, async () => {
  const CONTRACT = JSON.parse(readFileSync(new URL('../../contracts/gs-bridge-v1/vectors.json', import.meta.url), 'utf8'));
  const PRIVATE = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'),
    Buffer.from(CONTRACT.key.seedHex, 'hex')]), format: 'der', type: 'pkcs8' });
  const bridge = makeAdminBridgeHandler({ pool: () => db.pool, keys: parseBridgeKeys(JSON.stringify([{ kid: 'agreement-read-1', capability: 'read',
    publicKey: CONTRACT.key.publicKey }])), allowedIps: new Set(), log: () => {} });
  const read = async (path) => {
    const u = new URL(path, 'https://staging.example.test');
    const time = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(16).toString('base64url');
    const actor = 'agent:3567f4b8-877d-4e4a-8d9c-9288d01c1f8c';
    const canonical = canonicalString({ scheme: SCHEME, method: 'GET', host: u.host, path: u.pathname, query: canonicalQuery(u.searchParams),
      time, nonce, actor, run: null, bodySha256: createHash('sha256').update('', 'utf8').digest('hex'), idempotencyKey: null });
    const res = await bridge(new Request(u, { headers: { 'x-gs-bridge-key': 'agreement-read-1', 'x-gs-bridge-time': String(time),
      'x-gs-bridge-nonce': nonce, 'x-gs-bridge-actor': actor,
      'x-gs-bridge-signature': sign(null, Buffer.from(canonical, 'utf8'), PRIVATE).toString('base64url') } }));
    return { status: res.status, body: await res.json() };
  };
  const at = `/api/admin/v1/interview/organisations/${cust}/agreement`;
  const state = await read(at);
  assert.equal(state.status, 200, JSON.stringify(state.body));
  assert.deepEqual([state.body.item.accepted, state.body.item.version, state.body.item.history.length], [true, 'v2', 2]);
  assert.equal(state.body.item.acceptance.id, globalThis.acceptanceId);
  const copy = await read(`${at}/acceptances/${globalThis.acceptanceId}/copy`);
  assert.equal(copy.status, 200, JSON.stringify(copy.body));
  assert.match(copy.body.item.filename, /^interview-dpa-v2-/);
  assert.ok(copy.body.item.html.includes('Example Holdings Limited') && copy.body.item.html.includes(CURRENT.sha256));
  // a v3 record whose text the site does not hold cannot be printed; an unknown organisation is not found
  const v3 = db.sql(`SELECT id FROM interview.agreement_acceptance WHERE agreement_version = 'v3'`);
  assert.equal((await read(`${at}/acceptances/${v3}/copy`)).status, 404);
  assert.equal((await read(`/api/admin/v1/interview/organisations/${randomUUID()}/agreement`)).status, 404);
});
