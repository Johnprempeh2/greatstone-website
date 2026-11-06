// GRE-2673. Interview state changes emit client activity in the same transaction, through the engine's own calls:
// an invitation, claim_seat, sign-off and close-out. Retries do not repeat an event, a rolled-back action leaves none,
// and the signed pull returns them with only opaque ids and fixed labels. Against a real Postgres.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { canonicalQuery, canonicalString, parseBridgeKeys } from '../functions/lib/admin-bridge-auth.mjs';
import { makeAdminBridgeHandler } from '../functions/admin-bridge.mjs';
import { interviewDb, inInterviewTransaction } from '../functions/lib/interview/db.mjs';
import { closeOutSession } from '../functions/lib/interview/lifecycle.mjs';

const vector = JSON.parse(readFileSync(new URL('../../contracts/gs-bridge-v1/vectors.json', import.meta.url))).key;
const privateKey = createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(vector.seedHex, 'hex')]),
  format: 'der', type: 'pkcs8',
});
const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = id('90', 1);
const CLIENT = id('91', 1);
const ROUND = id('e1', 1);
const ALICE = id('c1', 1), BOB = id('c1', 2), ADMIN = id('c1', 3);
const UA = 'ba-user-alice', UB = 'ba-user-bob';
const ALICE_ID = { id: UA, email: 'alice@a.test' };
const BOB_ID = { id: UB, email: 'bob@a.test' };
let db, pool, handler;

const query = (sql, values = []) => pool.query(sql, values);
const events = async () => (await query(`SELECT kind, organisation_id, subject_id, label FROM client_activity_outbox
  WHERE kind LIKE 'interview.%' ORDER BY sequence`)).rows;
const must = ({ data, error }) => { if (error) throw Object.assign(new Error(error.message), error); return data; };

function signed(path) {
  const url = new URL(path, 'https://staging.example.test');
  const time = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString('base64url');
  const actor = 'agent:interview-activity-test';
  const canonical = canonicalString({ method: 'GET', host: url.host, path: url.pathname,
    query: canonicalQuery(url.searchParams), time, nonce, actor, run: null,
    bodySha256: createHash('sha256').update('').digest('hex') });
  return new Request(url, { headers: { 'x-gs-bridge-key': vector.kid, 'x-gs-bridge-time': String(time),
    'x-gs-bridge-nonce': nonce, 'x-gs-bridge-actor': actor,
    'x-gs-bridge-signature': sign(null, Buffer.from(canonical), privateKey).toString('base64url') } });
}

before(async () => {
  if (skip) return;
  db = startPostgres('interview-activity');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url });
  handler = makeAdminBridgeHandler({ pool: () => pool,
    keys: parseBridgeKeys(JSON.stringify([{ kid: vector.kid, capability: 'read', publicKey: vector.publicKey }])),
    log: () => {} });
  await query("INSERT INTO organisations(id,slug,name) VALUES ($1,'greatstone','Greatstone')", [ORG]);
  await query("INSERT INTO customers(id,org_id,slug,name) VALUES ($1,$2,'client','Private Client')", [CLIENT, ORG]);
  await query(`INSERT INTO interview.engagement(id,customer_id,org_id,client_name,seat_total)
    VALUES ($1,$2,$3,'Private round',5)`, [ROUND, CLIENT, ORG]);
});
after(async () => { await pool?.end(); db?.stop(); });

test('invite, start, complete and close-out each emit once, keyed by the client', { skip }, async () => {
  const system = interviewDb('system', { pool });
  must(await system.from('employee').insert([
    { id: ALICE, engagement_id: ROUND, name: 'Alice Private', email: 'alice@a.test', status: 'invited' },
    { id: BOB, engagement_id: ROUND, name: 'Bob Private', email: 'bob@a.test', status: 'invited' },
    { id: ADMIN, engagement_id: ROUND, name: 'Greatstone Admin', email: 'admin@gs.test', portal_role: 'gs_admin' },
  ]));
  // a retried invitation conflicts on (engagement, email): the statement and its event roll back together
  assert((await system.from('employee').insert({ engagement_id: ROUND, name: 'Alice', email: 'alice@a.test' })).error);
  await query('UPDATE interview.employee SET user_id = $2 WHERE id = $1', [ALICE, UA]);
  await query('UPDATE interview.employee SET user_id = $2 WHERE id = $1', [BOB, UB]);

  for (const [who, employee] of [[ALICE_ID, ALICE], [BOB_ID, BOB]]) {
    const participant = interviewDb(who, { pool });
    must(await participant.rpc('claim_seat', { p_employee_id: employee }));
    must(await participant.rpc('claim_seat', { p_employee_id: employee })); // retry: already started, no event
  }
  const alice = interviewDb(ALICE_ID, { pool });
  const session = must(await alice.from('session').insert({ employee_id: ALICE, phase: 'sign_off' }).select('id').single()).id;
  must(await alice.from('session').update({ ended_at: new Date().toISOString(), resumable: false }).eq('id', session));
  must(await alice.from('employee').update({ status: 'completed' }).eq('id', ALICE));
  must(await alice.from('employee').update({ status: 'completed' }).eq('id', ALICE)); // retry: no event

  const bob = interviewDb(BOB_ID, { pool });
  const open = must(await bob.from('session').insert({ employee_id: BOB, phase: 'pain_mapping' }).select('id').single()).id;
  assert.equal((await closeOutSession(system, ROUND, open)).ok, true);
  assert.equal((await closeOutSession(system, ROUND, open)).ok, false); // retry: already ended, no event

  const rows = await events();
  assert.deepEqual(rows.map((r) => [r.kind, r.subject_id]), [
    ['interview.invited', `interview_employee:${ALICE}`], ['interview.invited', `interview_employee:${BOB}`],
    ['interview.started', `interview_employee:${ALICE}`], ['interview.started', `interview_employee:${BOB}`],
    ['interview.completed', `interview_employee:${ALICE}`], ['interview.abandoned', `interview_session:${open}`],
  ]);
  assert(rows.every((r) => r.organisation_id === CLIENT));
  assert.deepEqual([...new Set(rows.map((r) => r.label))],
    ['Interview invited', 'Interview started', 'Interview completed', 'Interview abandoned']);
  assert(rows.every((r) => !/private|alice|bob|@/i.test(JSON.stringify(r))));
  // a sign-off is not an abandonment: Alice's ended session has no end_reason
  assert.equal((await query('SELECT end_reason FROM interview.session WHERE id = $1', [session])).rows[0].end_reason, null);
});

test('a participant cannot mark a session closed out, and end_reason does not change', { skip }, async () => {
  const before = (await events()).length;
  const bob = interviewDb(BOB_ID, { pool });
  const own = must(await bob.from('session').insert({ employee_id: BOB, phase: 'pain_mapping' }).select('id').single()).id;
  const refused = await bob.from('session').update({ ended_at: new Date().toISOString(), resumable: false, end_reason: 'closed_out' })
    .eq('id', own);
  assert.match(refused.error?.message ?? '', /only a system caller/);
  await query("UPDATE interview.session SET ended_at = now(), resumable = false, end_reason = 'closed_out' WHERE id = $1", [own]);
  await assert.rejects(query('UPDATE interview.session SET end_reason = NULL WHERE id = $1', [own]), /cannot be changed/);
  assert.equal((await events()).length, before + 1);
});

test('a rolled-back action leaves no event and no sequence gap', { skip }, async () => {
  const before = (await query("SELECT count(*)::int AS n FROM client_activity_outbox WHERE kind LIKE 'interview.%'")).rows[0].n;
  const sequence = (await query('SELECT last_sequence FROM client_activity_sequence WHERE id = 1')).rows[0].last_sequence;
  const carol = id('c1', 9);
  await assert.rejects(inInterviewTransaction(pool, async (tx) => {
    must(await tx.from('employee').insert({ id: carol, engagement_id: ROUND, name: 'Carol', email: 'carol@a.test' }));
    must(await tx.rpc('claim_seat', { p_employee_id: carol }));
    throw new Error('the action failed after its writes');
  }), /action failed/);
  assert.equal((await query("SELECT count(*)::int AS n FROM client_activity_outbox WHERE kind LIKE 'interview.%'")).rows[0].n, before);
  assert.equal((await query('SELECT last_sequence FROM client_activity_sequence WHERE id = 1')).rows[0].last_sequence, sequence);
  assert.equal((await query('SELECT count(*)::int AS n FROM interview.employee WHERE id = $1', [carol])).rows[0].n, 0);
});

test('the signed pull returns interview events with opaque ids and fixed labels only', { skip }, async () => {
  const response = await handler(signed('/api/admin/v1/activity-events?cursor=0&limit=100'));
  assert.equal(response.status, 200);
  const { items } = await response.json();
  const interview = items.filter((item) => item.kind.startsWith('interview.'));
  assert.deepEqual(interview.map((item) => item.kind), ['interview.invited', 'interview.invited', 'interview.started',
    'interview.started', 'interview.completed', 'interview.abandoned', 'interview.abandoned']);
  for (const item of interview) {
    assert.deepEqual(Object.keys(item).sort(), ['id', 'kind', 'label', 'occurredAt', 'organisationId', 'sequence', 'subjectId']);
    assert.equal(item.organisationId, CLIENT);
    assert.match(item.subjectId, /^interview_(employee|session):[0-9a-f-]{36}$/);
    assert.match(item.label, /^Interview (invited|started|completed|abandoned)$/);
  }
  assert(!/private|alice|bob|carol|@a\.test|Greatstone Admin/i.test(JSON.stringify(items)));
});
