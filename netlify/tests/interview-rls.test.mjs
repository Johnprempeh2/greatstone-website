// Schema `interview` (GRE-2612): who can read what, the claims bridge on a pooled connection, claim_seat under
// concurrency, the org_unit triggers, the customer_id / user_id scope triggers, and the rollback. Against a real
// Postgres with every migration applied. Identity is the Better Auth user id (claims.sub), never the email, except
// when a signed-in person claims an invitation addressed to their verified email.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { startPostgres, skip, OWNER, MIGRATIONS } from './lib/postgres.mjs';
import { interviewDb } from '../functions/lib/interview/db.mjs';
import { loadActiveMemoryBlob } from '../functions/lib/interview/memory.mjs';
import { getEmployeeContextByUserId } from '../functions/lib/interview/employee.mjs';
import { retentionDelete } from '../functions/lib/interview/retention.mjs';
import { enrol } from '../functions/interview-join.mjs';
import { runPortalOp } from '../functions/lib/interview/portal-ops.mjs';
import { CURRENT as AGREEMENT } from '../functions/lib/interview/agreement.mjs';

const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = id('90', 1), ORG2 = id('90', 2);
const CA = id('91', 1), CB = id('91', 2), CX = id('91', 3); // CX belongs to ORG2
const E1 = id('e1', 1), E2 = id('e1', 2), E3 = id('e1', 3), E4 = id('e1', 4);
const U1 = id('a1', 1), U2 = id('a1', 2);
const PA = id('b1', 1), PB = id('b1', 2);
const EA = id('c1', 1), EB = id('c1', 2), EC = id('c1', 3);
const X = id('c1', 4), Y = id('c1', 5), P = id('c1', 6), Q = id('c1', 7), EI = id('c1', 8);
const SA = id('d1', 1), SB = id('d1', 2), SC = id('d1', 3);
const UA = 'ba-user-alice', UB = 'ba-user-bob', UC = 'ba-user-carol', UD = 'ba-user-dan', UM = 'ba-user-mallory';

const TABLES = ['person', 'engagement', 'org_unit', 'employee', 'session', 'turn', 'insight', 'synthesis',
  'synthesis_cache', 'synthesis_run', 'memory_blob', 'context_pack', 'usage_ledger', 'outbox', 'consent_event', 'seat_request',
  'seat_purchase', 'rate_event', 'audit_log', 'withdrawal', 'agreement_acceptance'];
// not client data: allow-listed in scripts/org-scope-allow.netlify.json
const UNSCOPED = ['person', 'rate_event'];
const SCOPED = TABLES.filter((t) => !UNSCOPED.includes(t));
const participant = (sub, email) => ({ role: 'interview_worker', scope: 'participant', sub, email, email_verified: true });
const ALICE = participant(UA, 'alice@a.test');
const DAN = participant(UD, 'dan@a.test');
// a different account that has (been given) Alice's address: the email must not make her rows his
const MALLORY = participant(UM, 'alice@a.test');
const SYSTEM = { role: 'interview_worker', scope: 'system' };
const SYSTEM_A = { ...SYSTEM, org: ORG, customer_id: CA };
const SYSTEM_B = { ...SYSTEM, org: ORG, customer_id: CB };

let db;
let pool;

function sql(text) {
  const result = db.psql(text);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function sqlFails(text, pattern) {
  const result = db.psql(text);
  assert.notEqual(result.status, 0, `expected failure: ${text}`);
  assert.match(result.stderr, pattern);
}

// One transaction as interview_worker with the given claims, as interviewDb() runs every statement.
async function as(claims, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE interview_worker');
    if (claims) await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
const count = async (c, table, where = '') => Number((await c.query(`SELECT count(*) AS n FROM interview.${table} ${where}`)).rows[0].n);

before(async () => {
  if (skip) return;
  db = startPostgres('interview-rls');
  await db.migrate('003');
  sql(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'test-org', 'Test org');`);
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 1 });
  // customer_id and user_id are left to the scope triggers everywhere below except where a test says otherwise
  sql(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG2}', 'other-tenant', 'Other tenant');
    INSERT INTO customers (id, org_id, slug, name) VALUES ('${CA}', '${ORG}', 'client-a', 'Client A'),
      ('${CB}', '${ORG}', 'client-b', 'Client B'), ('${CX}', '${ORG2}', 'client-x', 'Client X');
    SET search_path TO interview, public;
    INSERT INTO engagement (id, customer_id, org_id, client_name, seat_total, enrol_token, allowed_email_domains) VALUES
      ('${E1}', '${CA}', '${ORG}', 'Round one', 5, 'tok-1', '{a.test,b.test}'),
      ('${E2}', '${CB}', '${ORG}', 'Round two', 5, NULL, '{}'),
      ('${E3}', '${CA}', '${ORG}', 'Round three', 1, NULL, '{}'),
      ('${E4}', '${CA}', '${ORG}', 'Round four', 1, NULL, '{}');
    INSERT INTO org_unit (id, engagement_id, name) VALUES ('${U1}', '${E1}', 'Root'), ('${U2}', '${E2}', 'Root B');
    INSERT INTO context_pack (engagement_id, content) VALUES ('${E1}', '{}'), ('${E2}', '{}');
    INSERT INTO person (person_id, verified_email, auth_user_id) VALUES ('${PA}', 'alice@a.test', '${UA}'),
      ('${PB}', 'bob@b.test', '${UB}');
    INSERT INTO employee (id, engagement_id, person_id, unit_id, name, email, user_id) VALUES
      ('${EA}', '${E1}', '${PA}', '${U1}', 'Alice', 'Alice@A.test', NULL),
      ('${EB}', '${E1}', '${PB}', '${U1}', 'Bob', 'bob@b.test', NULL),
      ('${EC}', '${E2}', NULL, NULL, 'Carol', 'carol@c.test', '${UC}'),
      ('${EI}', '${E1}', NULL, '${U1}', 'Dan', 'Dan@A.test', NULL),
      ('${X}', '${E3}', NULL, NULL, 'X', 'x@x.test', NULL), ('${Y}', '${E3}', NULL, NULL, 'Y', 'y@x.test', NULL),
      ('${P}', '${E4}', NULL, NULL, 'P', 'p@x.test', NULL), ('${Q}', '${E4}', NULL, NULL, 'Q', 'q@x.test', NULL);
    INSERT INTO session (id, employee_id) VALUES ('${SA}', '${EA}'), ('${SB}', '${EB}'), ('${SC}', '${EC}');
    INSERT INTO turn (session_id, role, content) VALUES ('${SA}', 'agent', 'hello'), ('${SA}', 'user', 'hi'),
      ('${SB}', 'agent', 'hello'), ('${SC}', 'agent', 'hello');
    INSERT INTO insight (session_id, type, label) VALUES ('${SA}', 'task', 'a'), ('${SB}', 'task', 'b'), ('${SC}', 'task', 'c');
    INSERT INTO consent_event (employee_id, kind, value) VALUES ('${EA}', 'participation', true), ('${EB}', 'participation', true);
    INSERT INTO usage_ledger (session_id, engagement_id, model, cost_pence) VALUES ('${SA}', '${E1}', 'm', 3), ('${SB}', '${E1}', 'm', 4);
    INSERT INTO memory_blob (person_id, customer_id, blob, opted_in, expires_at) VALUES
      ('${PA}', '${CA}', '{"role_title":"Clerk"}', true, now() + interval '1 year'), ('${PB}', '${CA}', '{}', false, NULL);
    INSERT INTO synthesis (engagement_id) VALUES ('${E1}');
    INSERT INTO synthesis_cache (engagement_id, kind, key, fingerprint, payload, model) VALUES ('${E1}', 'session', '${SA}', 'f', '{}', 'm');
    INSERT INTO synthesis_run (engagement_id, actor) VALUES ('${E1}', 'gsam');
    INSERT INTO outbox (idempotency_key, engagement_id, payload) VALUES ('${SA}:session_start', '${E1}', '{}'),
      ('${SC}:session_start', '${E2}', '{}');
    INSERT INTO seat_request (engagement_id, requested_by, seats) VALUES ('${E1}', '${EB}', 1);
    INSERT INTO seat_purchase (engagement_id, seats, purchased_by) VALUES ('${E1}', 1, '${EB}');
    INSERT INTO audit_log (engagement_id, action, summary) VALUES ('${E1}', 'seed', 'seed');
    INSERT INTO rate_event (bucket_key, window_start, count) VALUES ('seed', now(), 1);`);
});
after(async () => { await pool?.end(); db?.stop(); });

test('schema shape: FORCE RLS on every table, worker role attributes, outbox renamed', { skip }, () => {
  assert.equal(sql(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'interview' AND c.relkind = 'r' AND c.relrowsecurity AND c.relforcerowsecurity`), String(TABLES.length));
  assert.equal(sql(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'interview' AND c.relkind = 'r'`), String(TABLES.length));
  assert.equal(sql(`SELECT rolcanlogin || ':' || rolbypassrls FROM pg_roles WHERE rolname = 'interview_worker'`), 'false:false');
  assert.equal(sql(`SELECT to_regclass('interview.notion_outbox') IS NULL AND to_regclass('interview.outbox') IS NOT NULL`), 't');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(sql(`SELECT has_schema_privilege('${role}', 'interview', 'USAGE')`), 'f', role);
    assert.equal(sql(`SELECT has_function_privilege('${role}', 'interview.claim_seat(uuid)', 'EXECUTE')`), 'f', role);
  }
});

test('schema shape: customer_id NOT NULL on every client table, user_id on the person-owned ones', { skip }, () => {
  const col = (table, column) => sql(`SELECT data_type || ':' || is_nullable FROM information_schema.columns
    WHERE table_schema = 'interview' AND table_name = '${table}' AND column_name = '${column}'`);
  for (const t of SCOPED) assert.equal(col(t, 'customer_id'), 'uuid:NO', t);
  for (const t of UNSCOPED) assert.equal(col(t, 'customer_id'), '', t);
  for (const t of ['session', 'turn', 'insight', 'consent_event', 'memory_blob']) assert.equal(col(t, 'user_id'), 'text:NO', t);
  assert.equal(col('employee', 'user_id'), 'text:YES');
  assert.equal(col('person', 'auth_user_id'), 'text:NO');
  assert.equal(col('engagement', 'org_id'), 'uuid:NO');
  assert.equal(sql(`SELECT string_agg(a.attname, ',' ORDER BY a.attnum) FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = 'interview.memory_blob'::regclass AND i.indisprimary`), 'person_id,customer_id');
});

test('(a) anon, authenticated and service_role cannot read any interview table', { skip }, () => {
  for (const role of ['anon', 'authenticated', 'service_role']) for (const table of TABLES) {
    const result = db.psql(`BEGIN; SET LOCAL ROLE ${role}; SELECT count(*) FROM interview.${table}; COMMIT;`);
    assert.notEqual(result.status, 0, `${role} read ${table}`);
    assert.match(result.stderr, /permission denied/);
  }
});

test('interview_worker without claims sees no rows', { skip }, async () => {
  await as(null, async (c) => {
    for (const table of TABLES.filter((t) => t !== 'rate_event')) assert.equal(await count(c, table), 0, table);
  });
});

test('(1) a row written without customer_id / user_id takes them from its parent', { skip }, () => {
  // engagement children
  assert.equal(sql(`SELECT string_agg(DISTINCT customer_id::text, ',') FROM interview.org_unit WHERE engagement_id = '${E1}'`), CA);
  assert.equal(sql(`SELECT customer_id FROM interview.org_unit WHERE id = '${U2}'`), CB);
  // employee: customer from the round, user from the linked person; an unlinked invitation has no user yet
  assert.equal(sql(`SELECT customer_id || ' ' || user_id FROM interview.employee WHERE id = '${EA}'`), `${CA} ${UA}`);
  assert.equal(sql(`SELECT customer_id || ' ' || coalesce(user_id, '-') FROM interview.employee WHERE id = '${EI}'`), `${CA} -`);
  // session from employee; turn and insight from session
  assert.equal(sql(`SELECT customer_id || ' ' || user_id FROM interview.session WHERE id = '${SA}'`), `${CA} ${UA}`);
  assert.equal(sql(`SELECT customer_id || ' ' || user_id FROM interview.session WHERE id = '${SC}'`), `${CB} ${UC}`);
  assert.equal(sql(`SELECT string_agg(DISTINCT customer_id || ' ' || user_id, ',') FROM interview.turn WHERE session_id = '${SA}'`), `${CA} ${UA}`);
  assert.equal(sql(`SELECT customer_id || ' ' || user_id FROM interview.insight WHERE session_id = '${SC}'`), `${CB} ${UC}`);
  assert.equal(sql(`SELECT customer_id || ' ' || user_id FROM interview.consent_event WHERE employee_id = '${EB}'`), `${CA} ${UB}`);
  assert.equal(sql(`SELECT user_id FROM interview.memory_blob WHERE person_id = '${PA}' AND customer_id = '${CA}'`), UA);
  // a given value that agrees is accepted
  sql(`INSERT INTO interview.turn (session_id, role, content, customer_id, user_id) VALUES ('${SA}', 'agent', 'ok', '${CA}', '${UA}')`);
});

test('(2) a wrong customer_id or user_id is refused, and both are immutable', { skip }, () => {
  sqlFails(`INSERT INTO interview.turn (session_id, role, content, customer_id) VALUES ('${SA}', 'user', 'x', '${CB}')`, /customer_id does not match/);
  sqlFails(`INSERT INTO interview.turn (session_id, role, content, user_id) VALUES ('${SA}', 'user', 'x', '${UB}')`, /user_id does not match/);
  sqlFails(`INSERT INTO interview.session (employee_id, customer_id) VALUES ('${EB}', '${CB}')`, /customer_id does not match/);
  sqlFails(`INSERT INTO interview.insight (session_id, type, label, customer_id) VALUES ('${SC}', 'task', 'x', '${CA}')`, /customer_id does not match/);
  sqlFails(`INSERT INTO interview.outbox (idempotency_key, engagement_id, payload, customer_id) VALUES ('k-wrong', '${E1}', '{}', '${CB}')`,
    /customer_id does not match/);
  sqlFails(`INSERT INTO interview.usage_ledger (session_id, engagement_id, model) VALUES ('${SC}', '${E1}', 'm')`, /customer_id does not match/);
  sqlFails(`INSERT INTO interview.employee (engagement_id, name, email, customer_id) VALUES ('${E2}', 'Z', 'z@b.test', '${CA}')`,
    /customer_id does not match/);
  // an employee linked to a person carries that person's user id, no other
  sqlFails(`INSERT INTO interview.employee (engagement_id, person_id, name, email, user_id) VALUES ('${E2}', '${PA}', 'A', 'a@b.test', '${UB}')`,
    /user_id does not match/);
  // a session needs an employee somebody has claimed
  sqlFails(`INSERT INTO interview.session (employee_id) VALUES ('${EI}')`, /has not been claimed/);
  // immutable
  sqlFails(`UPDATE interview.turn SET customer_id = '${CB}' WHERE session_id = '${SA}'`, /customer_id is immutable/);
  sqlFails(`UPDATE interview.session SET user_id = '${UB}' WHERE id = '${SA}'`, /user_id is immutable/);
  sqlFails(`UPDATE interview.employee SET user_id = '${UB}' WHERE id = '${EA}'`, /user_id is immutable/);
  sqlFails(`UPDATE interview.engagement SET customer_id = '${CB}' WHERE id = '${E1}'`, /customer_id is immutable/);
  sqlFails(`UPDATE interview.memory_blob SET customer_id = '${CB}' WHERE person_id = '${PA}'`, /customer_id is immutable/);
  // the round's customer must exist and belong to the round's tenant
  sqlFails(`INSERT INTO interview.engagement (customer_id, org_id, client_name) VALUES ('${CX}', '${ORG}', 'Wrong tenant')`,
    /engagement_customer_org_fkey/);
  sqlFails(`INSERT INTO interview.engagement (customer_id, org_id, client_name) VALUES ('${id('91', 9)}', '${ORG}', 'No customer')`,
    /engagement_customer_org_fkey/);
  sqlFails(`INSERT INTO interview.engagement (org_id, client_name) VALUES ('${ORG}', 'No customer')`, /customer_id/);
  // the SQLSTATEs the callers can tell apart
  assert.equal(sql(`DO $$ BEGIN INSERT INTO interview.turn (session_id, role, content, customer_id) VALUES ('${SA}', 'user', 'x', '${CB}');
    EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok'; END $$; SELECT 'caught'`), 'caught');
  assert.equal(sql(`DO $$ BEGIN UPDATE interview.turn SET user_id = 'x' WHERE session_id = '${SA}';
    EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok'; END $$; SELECT 'caught'`), 'caught');
});

test('(b) a participant sees only her own rows', { skip }, async () => {
  await as(ALICE, async (c) => {
    assert.deepEqual((await c.query('SELECT person_id FROM interview.person')).rows.map((r) => r.person_id), [PA]);
    assert.deepEqual((await c.query('SELECT id FROM interview.employee')).rows.map((r) => r.id), [EA]);
    assert.deepEqual((await c.query('SELECT id FROM interview.session')).rows.map((r) => r.id), [SA]);
    const turns = (await c.query('SELECT session_id FROM interview.turn')).rows;
    assert.ok(turns.length >= 2);
    assert.ok(turns.every((r) => r.session_id === SA));
    assert.equal(await count(c, 'insight'), 1);
    assert.equal(await count(c, 'consent_event'), 1);
    assert.equal(await count(c, 'usage_ledger'), 1);
    assert.deepEqual((await c.query('SELECT person_id FROM interview.memory_blob')).rows.map((r) => r.person_id), [PA]);
    for (const table of ['synthesis', 'synthesis_cache', 'synthesis_run', 'outbox', 'seat_request', 'seat_purchase', 'audit_log']) {
      assert.equal(await count(c, table), 0, table);
    }
    // round metadata for the prompt: only the round she is in
    assert.deepEqual((await c.query('SELECT id FROM interview.engagement')).rows.map((r) => r.id), [E1]);
    assert.equal(await count(c, 'org_unit'), 1);
    assert.equal(await count(c, 'context_pack'), 1);
    // engagement-wide spend through the definer function
    const spend = (await c.query('SELECT total_pence FROM interview.engagement_spend($1)', [[E1]])).rows;
    assert.equal(Number(spend[0].total_pence), 7);
    // ...and only for a round she is in
    assert.deepEqual((await c.query('SELECT * FROM interview.engagement_spend($1)', [[E2, E3]])).rows, []);
  });
});

test('(b) a participant cannot change other rows or the round', { skip }, async () => {
  await as(ALICE, async (c) => {
    assert.equal((await c.query(`UPDATE interview.employee SET name = 'x' WHERE id = $1`, [EB])).rowCount, 0);
    assert.equal((await c.query(`UPDATE interview.employee SET name = 'x' WHERE id = $1`, [EC])).rowCount, 0);
    assert.equal((await c.query(`UPDATE interview.employee SET name = 'x' WHERE id = $1`, [EI])).rowCount, 0);
    assert.equal((await c.query(`UPDATE interview.session SET phase = 'automation' WHERE id = $1`, [SC])).rowCount, 0);
    assert.equal((await c.query(`UPDATE interview.engagement SET seat_total = 99 WHERE id = $1`, [E2])).rowCount, 0);
    assert.equal((await c.query(`UPDATE interview.engagement SET seat_total = 99 WHERE id = $1`, [E1])).rowCount, 0);
    assert.equal((await c.query(`UPDATE interview.org_unit SET name = 'x'`)).rowCount, 0);
    assert.equal((await c.query(`DELETE FROM interview.turn WHERE session_id = $1`, [SB])).rowCount, 0);
  });
  assert.equal(sql(`SELECT seat_total FROM interview.engagement WHERE id = '${E1}'`), '5');
  await assert.rejects(as(ALICE, (c) => c.query(`INSERT INTO interview.turn (session_id, role, content) VALUES ($1, 'user', 'x')`, [SB])),
    /row-level security/);
  // enrolment inserts a row for the caller's own user id and verified email only
  await assert.rejects(as(ALICE, (c) => c.query(`INSERT INTO interview.employee (engagement_id, name, email, user_id) VALUES ($1, 'B', 'bob@b.test', $2)`, [E2, UA])),
    /row-level security/);
  await assert.rejects(as(ALICE, (c) => c.query(`INSERT INTO interview.employee (engagement_id, name, email) VALUES ($1, 'A', 'alice@a.test')`, [E2])),
    /row-level security/);
  await assert.rejects(as(ALICE, (c) => c.query(`INSERT INTO interview.employee (engagement_id, name, email, user_id, portal_role) VALUES ($1, 'A', 'alice@a.test', $2, 'client_admin')`, [E2, UA])),
    /row-level security/);
  await assert.rejects(as(ALICE, (c) => c.query(`UPDATE interview.employee SET portal_role = 'client_admin' WHERE id = $1`, [EA])),
    /participant may not change/);
  await assert.rejects(as(ALICE, (c) => c.query(`UPDATE interview.employee SET status = 'started' WHERE id = $1`, [EA])),
    /participant may not change/);
  await assert.rejects(as(ALICE, (c) => c.query(`UPDATE interview.employee SET user_id = $2 WHERE id = $1`, [EA, UM])),
    /participant may not change/);
  // definer functions that only GSAM may call
  await assert.rejects(as(ALICE, (c) => c.query(`SELECT interview.claim_first_admin($1, $2)`, [E1, EA])), /system calls only/);
  await assert.rejects(as(ALICE, (c) => c.query(
    `SELECT interview.create_engagement($1, 'x', 1, '{}', 'tok-x', now(), 'a@a.test', '{}')`, [CA])), /system calls only/);
});

test('(b) a participant writes her own turn, consent, usage, status and memory', { skip }, async () => {
  await as(ALICE, async (c) => {
    await c.query(`INSERT INTO interview.turn (session_id, role, content, client_turn_id) VALUES ($1, 'user', 'mine', 'ct-1')`, [SA]);
    await c.query(`INSERT INTO interview.consent_event (employee_id, kind, value) VALUES ($1, 'attribution', true)`, [EA]);
    await c.query(`INSERT INTO interview.usage_ledger (session_id, engagement_id, model, cost_pence) VALUES ($1, $2, 'm', 1)`, [SA, E1]);
    assert.equal((await c.query(`UPDATE interview.employee SET status = 'declined' WHERE id = $1`, [EA])).rowCount, 1);
    assert.equal((await c.query(`UPDATE interview.session SET phase = 'day_in_life' WHERE id = $1`, [SA])).rowCount, 1);
    assert.equal(await c.query(`SELECT interview.bump_rate('chat:' || $1, 60, 10) AS ok`, [SA]).then((r) => r.rows[0].ok), true);
    await c.query(`INSERT INTO interview.audit_log (engagement_id, action, summary) VALUES ($1, 'declined', 'x')`, [E1]);
  });
  await assert.rejects(as(ALICE, (c) => c.query(`INSERT INTO interview.usage_ledger (session_id, engagement_id, model) VALUES ($1, $2, 'm')`, [SA, E3])),
    /row-level security/);
  await assert.rejects(as(ALICE, (c) => c.query(`INSERT INTO interview.audit_log (engagement_id, action, summary) VALUES ($1, 'x', 'x')`, [E2])),
    /row-level security/);
  assert.equal(sql(`SELECT count(*) FROM interview.turn WHERE client_turn_id = 'ct-1' AND session_id = '${SA}'`), '1');
  assert.equal(sql(`SELECT status FROM interview.employee WHERE id = '${EA}'`), 'declined');
  sql(`UPDATE interview.employee SET status = 'invited' WHERE id = '${EA}'`);
});

test('(3) the same email under another user id reaches nothing once the row is claimed', { skip }, async () => {
  await as(MALLORY, async (c) => {
    for (const table of ['employee', 'session', 'turn', 'insight', 'consent_event', 'usage_ledger', 'memory_blob', 'person',
      'engagement', 'org_unit', 'context_pack']) {
      assert.equal(await count(c, table), 0, table);
    }
    assert.equal((await c.query(`UPDATE interview.employee SET user_id = $2 WHERE id = $1`, [EA, UM])).rowCount, 0);
    assert.equal((await c.query(`UPDATE interview.session SET phase = 'automation' WHERE id = $1`, [SA])).rowCount, 0);
  });
  await assert.rejects(as(MALLORY, (c) => c.query(`INSERT INTO interview.turn (session_id, role, content) VALUES ($1, 'user', 'x')`, [SA])),
    /row-level security/);
  // ...and the same holds through the engine's own client and lookups
  const m = interviewDb({ id: UM, email: 'alice@a.test' }, { pool });
  assert.deepEqual((await m.from('session').select('id')).data, []);
  assert.deepEqual((await m.from('employee').select('id')).data, []);
});

test('an invitation is claimed once, by the signed-in owner of its email, and is then theirs by user id', { skip }, async () => {
  await as(DAN, async (c) => {
    // before the claim: visible by email (and only because user_id is NULL), nothing else is
    assert.deepEqual((await c.query('SELECT id FROM interview.employee')).rows.map((r) => r.id), [EI]);
    assert.equal(await count(c, 'engagement'), 0);
  });
  // the claim must name the caller
  await assert.rejects(as(DAN, (c) => c.query(`UPDATE interview.employee SET user_id = $2 WHERE id = $1`, [EI, UM])), /row-level security/);
  await as(DAN, async (c) => {
    await c.query(`INSERT INTO interview.person (verified_email, auth_user_id) VALUES ('dan@a.test', $1)`, [UD]);
    const person = (await c.query('SELECT person_id FROM interview.person')).rows[0].person_id;
    assert.equal((await c.query(`UPDATE interview.employee SET user_id = $2, person_id = $3 WHERE id = $1`, [EI, UD, person])).rowCount, 1);
    assert.deepEqual((await c.query('SELECT id FROM interview.engagement')).rows.map((r) => r.id), [E1]);
    // now a session can start
    await c.query(`INSERT INTO interview.session (employee_id) VALUES ($1)`, [EI]);
  });
  assert.equal(sql(`SELECT user_id || ' ' || customer_id FROM interview.session WHERE employee_id = '${EI}'`), `${UD} ${CA}`);
  // a claimed row cannot be claimed again, even by someone with the same email
  const dan2 = participant('ba-user-dan-2', 'dan@a.test');
  await as(dan2, async (c) => assert.equal(await count(c, 'employee'), 0));
  sqlFails(`UPDATE interview.employee SET user_id = NULL WHERE id = '${EI}'`, /user_id is immutable/);
});

test('(c) system claims without a customer see every row', { skip }, async () => {
  const owner = Object.fromEntries(TABLES.map((t) => [t, sql(`SELECT count(*) FROM interview.${t}`)]));
  await as(SYSTEM, async (c) => {
    for (const table of TABLES) assert.equal(String(await count(c, table)), owner[table], table);
    assert.equal((await c.query(`UPDATE interview.outbox SET status = 'sent', sent_at = now()`)).rowCount, 2);
  });
});

test('(4) system claims keyed to organisation A cannot see or write organisation B rows', { skip }, async () => {
  await as(SYSTEM_A, async (c) => {
    assert.deepEqual((await c.query('SELECT id FROM interview.engagement ORDER BY id')).rows.map((r) => r.id), [E1, E3, E4]);
    for (const table of SCOPED) {
      assert.equal(await count(c, table, `WHERE customer_id <> '${CA}'`), 0, table);
    }
    assert.equal(await count(c, 'session', `WHERE id = '${SC}'`), 0);
    assert.equal(await count(c, 'org_unit', `WHERE id = '${U2}'`), 0);
    assert.equal((await c.query(`UPDATE interview.engagement SET seat_total = 99 WHERE id = $1`, [E2])).rowCount, 0);
    assert.equal((await c.query(`DELETE FROM interview.turn WHERE session_id = $1`, [SC])).rowCount, 0);
    assert.deepEqual((await c.query('SELECT engagement_id FROM interview.engagement_spend($1)', [[E1, E2]])).rows.map((r) => r.engagement_id), [E1]);
    // person and rate_event carry no client data and stay reachable
    assert.equal(await count(c, 'person'), Number(sql('SELECT count(*) FROM interview.person')));
  });
  await assert.rejects(as(SYSTEM_A, (c) => c.query(`INSERT INTO interview.turn (session_id, role, content) VALUES ($1, 'agent', 'x')`, [SC])),
    /row-level security/);
  await assert.rejects(as(SYSTEM_A, (c) => c.query(`INSERT INTO interview.outbox (idempotency_key, engagement_id, payload) VALUES ('k-b', $1, '{}')`, [E2])),
    /row-level security/);
  await assert.rejects(as(SYSTEM_A, (c) => c.query(`INSERT INTO interview.engagement (customer_id, org_id, client_name) VALUES ($1, $2, 'B round')`, [CB, ORG])),
    /row-level security/);
  await assert.rejects(as(SYSTEM_A, (c) => c.query(
    `SELECT interview.create_engagement($1, 'B round', 1, '{}', 'tok-b', now(), 'a@g.test', '{}')`, [CB])), /outside this call/);
  await as(SYSTEM_B, async (c) => {
    assert.deepEqual((await c.query('SELECT id FROM interview.engagement')).rows.map((r) => r.id), [E2]);
    assert.deepEqual((await c.query('SELECT id FROM interview.session')).rows.map((r) => r.id), [SC]);
  });
});

test('(6) memory for a person in organisation A is not visible in organisation B', { skip }, async () => {
  // Alice is interviewed for B as well (her round-two row)
  sql(`INSERT INTO interview.employee (engagement_id, person_id, name, email) VALUES ('${E2}', '${PA}', 'Alice', 'alice@a.test')`);
  const alice = interviewDb({ id: UA, email: 'alice@a.test' }, { pool });
  assert.deepEqual(await loadActiveMemoryBlob(alice, PA, CA), { role_title: 'Clerk' });
  assert.equal(await loadActiveMemoryBlob(alice, PA, CB), null);
  await as(SYSTEM_B, async (c) => assert.equal(await count(c, 'memory_blob', `WHERE person_id = '${PA}'`), 0));
  // a B memory is a row of its own; A's is untouched by it
  await as(ALICE, (c) => c.query(`INSERT INTO interview.memory_blob (person_id, customer_id, blob, opted_in, expires_at)
    VALUES ($1, $2, '{"role_title":"Lead"}', true, now() + interval '1 year')`, [PA, CB]));
  assert.deepEqual(await loadActiveMemoryBlob(alice, PA, CB), { role_title: 'Lead' });
  assert.deepEqual(await loadActiveMemoryBlob(alice, PA, CA), { role_title: 'Clerk' });
  await as(SYSTEM_A, async (c) => assert.deepEqual(
    (await c.query(`SELECT blob->>'role_title' AS r FROM interview.memory_blob WHERE person_id = $1`, [PA])).rows.map((r) => r.r), ['Clerk']));
  // opting out in B deletes B only
  await as(ALICE, (c) => c.query(`DELETE FROM interview.memory_blob WHERE person_id = $1 AND customer_id = $2`, [PA, CB]));
  assert.equal(sql(`SELECT string_agg(customer_id::text, ',') FROM interview.memory_blob WHERE person_id = '${PA}'`), CA);
  // memory under another person's user id is refused
  await assert.rejects(as(ALICE, (c) => c.query(`INSERT INTO interview.memory_blob (person_id, customer_id) VALUES ($1, $2)`, [PB, CB])),
    /row-level security/);
});

test('(d) role and claims do not outlive the transaction on a pooled connection', { skip }, async () => {
  await as(ALICE, async (c) => assert.equal((await c.query('SELECT current_user AS u')).rows[0].u, 'interview_worker'));
  await assert.rejects(as(ALICE, (c) => c.query('SELECT 1 / 0')));
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT current_user AS u, current_setting('request.jwt.claims', true) AS claims`);
    assert.equal(rows[0].u, OWNER);
    assert.ok(!rows[0].claims);
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE interview_worker');
    assert.equal(await count(client, 'person'), 0, 'no claims carried over');
    await client.query('ROLLBACK');
  } finally { client.release(); }
});

test('(e) claim_seat as interview_worker: takes a seat, is idempotent, refuses past seat_total', { skip }, async () => {
  await as(SYSTEM, (c) => c.query('SELECT interview.claim_seat($1)', [P]));
  await as(SYSTEM, (c) => c.query('SELECT interview.claim_seat($1)', [P]));
  await assert.rejects(as(SYSTEM, (c) => c.query('SELECT interview.claim_seat($1)', [Q])), /seat total exhausted/);
  // a participant reaches it too (the start op), and the guard lets the definer take the seat
  sql(`UPDATE interview.engagement SET seat_total = 6 WHERE id = '${E1}'`);
  await as(ALICE, (c) => c.query('SELECT interview.claim_seat($1)', [EA]));
  assert.equal(sql(`SELECT status FROM interview.employee WHERE id = '${EA}'`), 'started');
  assert.equal(sql(`SELECT string_agg(status::text, ',' ORDER BY email) FROM interview.employee WHERE engagement_id = '${E4}'`), 'started,invited');
});

test('(e) two concurrent claims for the last seat: exactly one wins', { skip }, async () => {
  const first = new pg.Client({ connectionString: db.url });
  const second = new pg.Client({ connectionString: db.url });
  await first.connect();
  await second.connect();
  try {
    for (const c of [first, second]) {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE interview_worker');
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(SYSTEM)]);
    }
    await first.query('SELECT interview.claim_seat($1)', [X]);
    let settled = false;
    const racing = second.query('SELECT interview.claim_seat($1)', [Y]).finally(() => { settled = true; });
    racing.catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(settled, false, 'the second claim waits on the engagement lock');
    await first.query('COMMIT');
    await assert.rejects(racing, /seat total exhausted/);
    await second.query('ROLLBACK');
  } finally {
    await first.end();
    await second.end();
  }
  assert.equal(sql(`SELECT count(*) FROM interview.employee WHERE engagement_id = '${E3}' AND status = 'started'`), '1');
  assert.equal(sql(`SELECT status FROM interview.employee WHERE id = '${X}'`), 'started');
});

test('(f) create_engagement, org_unit paths, reparenting, cycles and allocation hygiene as the worker', { skip }, async () => {
  const eng = await as(SYSTEM_A, async (c) => (await c.query(
    `SELECT interview.create_engagement($1, 'Round five', 3, '{a.test}', 'tok-5', now() + interval '7 days', 'staff@g.test', '{}') AS id`,
    [CA])).rows[0].id);
  assert.equal(sql(`SELECT customer_id || ' ' || org_id FROM interview.engagement WHERE id = '${eng}'`), `${CA} ${ORG}`);
  assert.equal(sql(`SELECT count(*) FROM interview.org_unit WHERE engagement_id = '${eng}' AND customer_id = '${CA}'`), '2');
  assert.equal(sql(`SELECT customer_id FROM interview.context_pack WHERE engagement_id = '${eng}'`), CA);
  const units = Object.fromEntries(sql(`SELECT name || '|' || id || '|' || path::text FROM interview.org_unit
    WHERE engagement_id = '${eng}'`).split('\n').map((l) => { const [n, i, p] = l.split('|'); return [n, { id: i, path: p }]; }));
  const label = (u) => u.id.replaceAll('-', '_');
  assert.equal(units['Round five'].path, label(units['Round five']));
  assert.equal(units.Unassigned.path, `${label(units['Round five'])}.${label(units.Unassigned)}`);
  assert.equal(sql(`SELECT enrol_enabled || ':' || (default_unit_id = '${units.Unassigned.id}') || ':' || mode || ':' || target_minutes
    FROM interview.engagement WHERE id = '${eng}'`), 'false:true:person:20');
  assert.equal(sql(`SELECT portal_role || ':' || customer_id || ':' || coalesce(user_id, '-') FROM interview.employee
    WHERE engagement_id = '${eng}'`), `gs_admin:${CA}:-`);
  await assert.rejects(as(SYSTEM, (c) => c.query(
    `SELECT interview.create_engagement($1, 'x', 1, '{}', 'tok-6', now(), 'a@g.test', '{}')`, [id('91', 9)])), /does not exist/);

  const root = units['Round five'].id;
  const [a, b] = [id('a2', 1), id('a2', 2)];
  await as(SYSTEM, async (c) => {
    await c.query(`INSERT INTO interview.org_unit (id, engagement_id, parent_id, name, seat_allocation) VALUES ($1, $2, $3, 'A', 2)`, [a, eng, root]);
    await c.query(`INSERT INTO interview.org_unit (id, engagement_id, parent_id, name) VALUES ($1, $2, $3, 'B')`, [b, eng, a]);
    // reparent A under Unassigned: B's path follows
    await c.query(`UPDATE interview.org_unit SET parent_id = $1 WHERE id = $2`, [units.Unassigned.id, a]);
  });
  assert.equal(sql(`SELECT path FROM interview.org_unit WHERE id = '${b}'`),
    [root, units.Unassigned.id, a, b].map((i) => i.replaceAll('-', '_')).join('.'));
  await assert.rejects(as(SYSTEM, (c) => c.query(`UPDATE interview.org_unit SET parent_id = $1 WHERE id = $2`, [b, a])), /cycle/);
  await assert.rejects(as(SYSTEM, (c) => c.query(`UPDATE interview.org_unit SET parent_id = $1 WHERE id = $2`, [U1, a])), /different engagement/);
  // children of A (cap 2) may not allocate 3; judged at commit
  await assert.rejects(as(SYSTEM, async (c) => {
    await c.query(`UPDATE interview.org_unit SET seat_allocation = 1 WHERE id = $1`, [b]);
    await c.query(`INSERT INTO interview.org_unit (engagement_id, parent_id, name, seat_allocation) VALUES ($1, $2, 'C', 2)`, [eng, a]);
  }), /exceeding its allocation/);
  // a rebalance judged on its final state passes
  await as(SYSTEM, async (c) => {
    await c.query(`UPDATE interview.org_unit SET seat_allocation = 2 WHERE id = $1`, [b]);
    await c.query(`UPDATE interview.org_unit SET seat_allocation = 3 WHERE id = $1`, [a]);
  });
  assert.equal(sql(`SELECT seat_allocation FROM interview.org_unit WHERE id = '${b}'`), '2');
});

test('(5) R11: after a full fake round no interview row has a null or wrong customer_id', { skip }, async () => {
  const U = 'ba-user-eve';
  const eve = participant(U, 'eve@a.test');
  // GSAM opens a round for B, invites Eve; Eve joins, talks, signs off; synthesis runs
  const eng = await as(SYSTEM_B, async (c) => {
    const e = (await c.query(`SELECT interview.create_engagement($1, 'Round B2', 3, '{a.test}', 'tok-r11', now() + interval '7 days',
      'staff@g.test', '{}') AS id`, [CB])).rows[0].id;
    await c.query(`UPDATE interview.engagement SET seat_total = 3 WHERE id = $1`, [e]);
    await c.query(`INSERT INTO interview.employee (engagement_id, name, email) VALUES ($1, 'Eve', 'eve@a.test')`, [e]);
    await c.query(`INSERT INTO interview.audit_log (engagement_id, action, summary) VALUES ($1, 'round.invited', 'x')`, [e]);
    return e;
  });
  const emp = await as(eve, async (c) => {
    await c.query(`INSERT INTO interview.person (verified_email, auth_user_id) VALUES ('eve@a.test', $1)`, [U]);
    const person = (await c.query('SELECT person_id FROM interview.person')).rows[0].person_id;
    const e = (await c.query(`UPDATE interview.employee SET user_id = $1, person_id = $2 WHERE engagement_id = $3 RETURNING id`, [U, person, eng])).rows[0].id;
    await c.query(`INSERT INTO interview.consent_event (employee_id, kind, value) VALUES ($1, 'participation', true)`, [e]);
    await c.query('SELECT interview.claim_seat($1)', [e]);
    const s = (await c.query(`INSERT INTO interview.session (employee_id) VALUES ($1) RETURNING id`, [e])).rows[0].id;
    await c.query(`INSERT INTO interview.turn (session_id, role, content) VALUES ($1, 'agent', 'hi'), ($1, 'user', 'hello')`, [s]);
    await c.query(`INSERT INTO interview.insight (session_id, type, label) VALUES ($1, 'pain', 'p')`, [s]);
    await c.query(`INSERT INTO interview.usage_ledger (session_id, engagement_id, model, cost_pence) VALUES ($1, $2, 'm', 2)`, [s, eng]);
    await c.query(`INSERT INTO interview.memory_blob (person_id, customer_id, opted_in) VALUES ($1, $2, true)`, [person, CB]);
    await c.query(`INSERT INTO interview.audit_log (engagement_id, action, summary) VALUES ($1, 'person.enrolled', 'x')`, [eng]);
    return { e, s };
  });
  await as(SYSTEM_B, async (c) => {
    await c.query(`INSERT INTO interview.outbox (idempotency_key, engagement_id, payload) VALUES ($1, $2, '{}')`, [`${emp.s}:session_end`, eng]);
    const syn = (await c.query(`INSERT INTO interview.synthesis (engagement_id) VALUES ($1) RETURNING id`, [eng])).rows[0].id;
    await c.query(`INSERT INTO interview.synthesis_cache (engagement_id, kind, key, fingerprint, payload, model)
      VALUES ($1, 'session', $2, 'f', '{}', 'm')`, [eng, emp.s]);
    await c.query(`INSERT INTO interview.synthesis_run (engagement_id, actor, status, synthesis_id) VALUES ($1, 'gsam', 'done', $2)`, [eng, syn]);
    await c.query(`INSERT INTO interview.seat_request (engagement_id, requested_by, seats) VALUES ($1, $2, 1)`, [eng, emp.e]);
    await c.query(`INSERT INTO interview.seat_purchase (engagement_id, seats, purchased_by) VALUES ($1, 1, $2)`, [eng, emp.e]);
    await c.query(`INSERT INTO interview.withdrawal (engagement_id, user_id) VALUES ($1, $2)`, [eng, U]);
    // the organisation's acceptance of the data processing agreement (GRE-2794): its own row, no round
    await c.query(`INSERT INTO interview.agreement_acceptance (customer_id, agreement_key, agreement_version, content_sha256, user_id, customer_user_id,
      name, email, role_title, legal_name, read_confirmed, authority_confirmed, ip_address)
      VALUES ($1, 'interview-dpa', $2, $3, 'ba-user-admin', gen_random_uuid(), 'Ada', 'ada@b.test', 'Director', 'B Ltd', true, true, '192.0.2.1')
      ON CONFLICT DO NOTHING`, [CB, AGREEMENT.version, AGREEMENT.sha256]);
  });
  const withCustomer = sql(`SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.columns
    WHERE table_schema = 'interview' AND column_name = 'customer_id'`).split(',');
  assert.deepEqual(withCustomer, [...SCOPED].sort());
  for (const t of withCustomer) {
    assert.equal(sql(`SELECT count(*) FROM interview.${t} WHERE customer_id IS NULL`), '0', `${t}: null customer_id`);
    assert.ok(Number(sql(`SELECT count(*) FROM interview.${t} WHERE customer_id = '${CB}'`)) > 0, `${t}: the round wrote a row`);
  }
  // wrong: a row whose customer_id is not its round's
  const viaEngagement = SCOPED.filter((t) => !['engagement', 'session', 'turn', 'insight', 'consent_event', 'memory_blob',
    'agreement_acceptance'].includes(t));
  for (const t of viaEngagement) {
    assert.equal(sql(`SELECT count(*) FROM interview.${t} x JOIN interview.engagement g ON g.id = x.engagement_id
      WHERE x.customer_id <> g.customer_id`), '0', t);
  }
  assert.equal(sql(`SELECT count(*) FROM interview.session s JOIN interview.employee e ON e.id = s.employee_id
    WHERE s.customer_id <> e.customer_id OR s.user_id <> e.user_id`), '0');
  assert.equal(sql(`SELECT count(*) FROM interview.consent_event s JOIN interview.employee e ON e.id = s.employee_id
    WHERE s.customer_id <> e.customer_id OR s.user_id <> e.user_id`), '0');
  for (const t of ['turn', 'insight']) {
    assert.equal(sql(`SELECT count(*) FROM interview.${t} x JOIN interview.session s ON s.id = x.session_id
      WHERE x.customer_id <> s.customer_id OR x.user_id <> s.user_id`), '0', t);
  }
  assert.equal(sql(`SELECT count(*) FROM interview.memory_blob m JOIN interview.person p ON p.person_id = m.person_id
    WHERE m.user_id <> p.auth_user_id`), '0');
});

test('organisation_name and organisation_member answer only a system call keyed to that organisation', { skip }, async () => {
  const name = (claims, customer) => as(claims, async (c) =>
    (await c.query('SELECT interview.organisation_name($1) AS n', [customer])).rows[0].n);
  assert.ok(await name(SYSTEM_B, CB));
  assert.equal(await name(SYSTEM_B, CA), null);
  assert.equal(await name(SYSTEM, CB), null);
  assert.equal(await name(participant('ba-user-eve', 'eve@a.test'), CB), null);
  const member = (claims, customer) => as(claims, async (c) =>
    (await c.query('SELECT count(*)::int AS n FROM interview.organisation_member($1, $2)', [customer, 'ba-user-eve'])).rows[0].n);
  assert.equal(await member(SYSTEM_A, CB), 0);
  assert.equal(await member(participant('ba-user-eve', 'eve@a.test'), CB), 0);
});

test('the bridge can switch to interview_worker and back inside one transaction', { skip }, async () => {
  const client = await pool.connect();
  const E6 = id('e1', 6);
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE gsam_bridge_write');
    await assert.rejects(client.query('SAVEPOINT s; SELECT count(*) FROM interview.engagement'), /permission denied/);
    await client.query('ROLLBACK TO SAVEPOINT s');
    await client.query('SET LOCAL ROLE interview_worker');
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(SYSTEM_A)]);
    await client.query(`INSERT INTO interview.engagement (id, client_name, status, customer_id, org_id) VALUES ($1, 'Bridge round', 'draft', $2, $3)`,
      [E6, CA, ORG]);
    await client.query('SET LOCAL ROLE gsam_bridge_write');
    assert.equal((await client.query('SELECT current_user AS u')).rows[0].u, 'gsam_bridge_write');
    await client.query('COMMIT');
  } finally { client.release(); }
  assert.equal(sql(`SELECT status FROM interview.engagement WHERE id = '${E6}'`), 'draft');
});

test('join over the real database: an invitation is claimed by user id, a newcomer gets user_id and customer_id', { skip }, async () => {
  const EJ = id('e1', 7), UJ = id('a1', 7), TOKEN = 'join-token-000000000001';
  sql(`SET search_path TO interview, public;
    INSERT INTO engagement (id, customer_id, org_id, client_name, seat_total, enrol_token, enrol_enabled, allowed_email_domains)
      VALUES ('${EJ}', '${CB}', '${ORG}', 'Join round', 5, '${TOKEN}', true, '{a.test}');
    INSERT INTO org_unit (id, engagement_id, name) VALUES ('${UJ}', '${EJ}', 'Join root');
    UPDATE engagement SET default_unit_id = '${UJ}' WHERE id = '${EJ}';
    INSERT INTO employee (engagement_id, unit_id, name, email, portal_role) VALUES ('${EJ}', '${UJ}', 'Fay', 'Fay@A.test', 'client_admin');`);
  const sys = interviewDb('system', { pool });
  await sys.sql(`INSERT INTO interview.agreement_acceptance (customer_id, agreement_key, agreement_version, content_sha256, user_id, customer_user_id,
      name, email, role_title, legal_name, read_confirmed, authority_confirmed, ip_address)
      VALUES ($1, 'interview-dpa', $2, $3, 'ba-user-admin', gen_random_uuid(), 'Ada', 'ada@b.test', 'Director', 'B Ltd', true, true, '192.0.2.1')
      ON CONFLICT DO NOTHING`, [CB, AGREEMENT.version, AGREEMENT.sha256]);
  const join = (caller) => enrol({ db: interviewDb(caller, { pool }), sys, caller, token: TOKEN, name: caller.name, ip: '192.0.2.1', env: {} });
  const fay = { id: 'ba-user-fay', email: 'fay@a.test', name: 'Fay' };
  const gus = { id: 'ba-user-gus', email: 'gus@a.test', name: 'Gus' };

  // the invitation GSAM sent to Fay's address: claimed, role kept, person made for her account
  assert.equal((await join(fay)).ok, true);
  assert.equal(sql(`SELECT e.user_id || ' ' || e.portal_role || ' ' || e.customer_id || ' ' || p.auth_user_id FROM interview.employee e
    JOIN interview.person p ON p.person_id = e.person_id WHERE e.engagement_id = '${EJ}' AND e.email = 'Fay@A.test'`),
    `${fay.id} client_admin ${CB} ${fay.id}`);
  assert.equal((await join(fay)).ok, true, 'a re-clicked link is fine');
  // another account with Fay's address cannot take the claimed row
  const other = await join({ id: 'ba-user-not-fay', email: 'fay@a.test', name: 'Not Fay' });
  assert.equal(other.ok, false);
  assert.match(other.message, /another account/);
  // a newcomer on an allowed domain: a row of their own, keyed by their account, in the round's organisation
  assert.equal((await join(gus)).ok, true);
  assert.equal(sql(`SELECT user_id || ' ' || customer_id || ' ' || unit_id || ' ' || portal_role FROM interview.employee
    WHERE engagement_id = '${EJ}' AND email = 'gus@a.test'`), `${gus.id} ${CB} ${UJ} employee`);
  const outsider = await join({ id: 'ba-user-hal', email: 'hal@z.test', name: 'Hal' });
  assert.match(outsider.message, /work email/);
  // every later lookup is by user id
  const ctx = await getEmployeeContextByUserId(interviewDb(gus, { pool }), gus.id);
  assert.deepEqual([ctx.engagement.id, ctx.employee.customer_id, ctx.employee.user_id], [EJ, CB, gus.id]);
  assert.equal(await getEmployeeContextByUserId(interviewDb({ id: 'ba-user-not-fay', email: 'fay@a.test' }, { pool }), 'ba-user-not-fay'), null);
  assert.equal(sql(`SELECT count(*) FROM interview.audit_log WHERE engagement_id = '${EJ}' AND customer_id = '${CB}' AND action = 'person.enrolled'`), '1');

  // retention of this round deletes its organisation's memory of its people, not their memory elsewhere
  const fayPerson = sql(`SELECT person_id FROM interview.person WHERE auth_user_id = '${fay.id}'`);
  sql(`INSERT INTO interview.memory_blob (person_id, customer_id, opted_in) VALUES ('${fayPerson}', '${CB}', true), ('${fayPerson}', '${CA}', true)`);
  const report = await retentionDelete(pool, EJ, { confirm: true });
  assert.equal(report.memoryBlobs, 1);
  assert.equal(sql(`SELECT string_agg(customer_id::text, ',') FROM interview.memory_blob WHERE person_id = '${fayPerson}'`), CA);
});

test('an invited person who opens the portal directly claims the one open invitation; two rounds wait for the link', { skip }, async () => {
  const E1 = id('e1', 8), E2 = id('e1', 9), E3 = id('e1', 10);
  sql(`SET search_path TO interview, public;
    INSERT INTO engagement (id, customer_id, org_id, client_name, seat_total) VALUES
      ('${E1}', '${CB}', '${ORG}', 'Arrive round', 5), ('${E2}', '${CB}', '${ORG}', 'Two A', 5), ('${E3}', '${CB}', '${ORG}', 'Two B', 5);
    INSERT INTO employee (engagement_id, name, email) VALUES ('${E1}', 'Ivy', 'ivy@a.test'),
      ('${E2}', 'Jo', 'jo@a.test'), ('${E3}', 'Jo', 'jo@a.test');`);
  const page = (caller) => runPortalOp('interview-page', { db: interviewDb(caller, { pool }), sys: interviewDb('system', { pool }), caller,
    env: { voice: false } });
  const ivy = { id: 'ba-user-ivy', email: 'ivy@a.test', name: 'Ivy' };
  assert.equal((await page(ivy)).screen, 'welcome');
  assert.equal(sql(`SELECT user_id FROM interview.employee WHERE engagement_id = '${E1}'`), ivy.id);
  const jo = { id: 'ba-user-jo', email: 'jo@a.test', name: 'Jo' };
  assert.equal((await page(jo)).screen, 'no-match');
  assert.equal(sql(`SELECT count(*) FROM interview.employee WHERE email = 'jo@a.test' AND user_id IS NOT NULL`), '0');
});

test('(g) rollback.sql removes the schema and the role', { skip }, () => {
  sql(readFileSync(join(MIGRATIONS, '054_interview_engine', 'rollback.sql'), 'utf8'));
  assert.equal(sql(`SELECT count(*) FROM pg_namespace WHERE nspname = 'interview'`), '0');
  assert.equal(sql(`SELECT count(*) FROM pg_roles WHERE rolname = 'interview_worker'`), '0');
  assert.equal(sql(`SELECT count(*) FROM pg_extension WHERE extname = 'ltree'`), '0');
  assert.equal(sql(`SELECT auth.jwt()::text`), '{}');
  // the customers the rounds pointed at are untouched
  assert.equal(sql(`SELECT count(*) FROM customers WHERE id IN ('${CA}', '${CB}')`), '2');
});
