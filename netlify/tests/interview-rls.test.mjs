// Schema `interview` (GRE-2612): who can read what, the claims bridge on a pooled connection, claim_seat under
// concurrency, the org_unit triggers, and the rollback. Against a real Postgres with every migration applied.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { startPostgres, skip, OWNER, MIGRATIONS } from './lib/postgres.mjs';

const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const E1 = id('e1', 1), E2 = id('e1', 2), E3 = id('e1', 3), E4 = id('e1', 4);
const U1 = id('a1', 1);
const PA = id('b1', 1), PB = id('b1', 2);
const EA = id('c1', 1), EB = id('c1', 2), EC = id('c1', 3);
const X = id('c1', 4), Y = id('c1', 5), P = id('c1', 6), Q = id('c1', 7);
const SA = id('d1', 1), SB = id('d1', 2), SC = id('d1', 3);

const TABLES = ['person', 'engagement', 'org_unit', 'employee', 'session', 'turn', 'insight', 'synthesis',
  'synthesis_cache', 'synthesis_run', 'memory_blob', 'context_pack', 'usage_ledger', 'outbox', 'consent_event', 'seat_request',
  'seat_purchase', 'rate_event', 'audit_log',
  // 055 (GRE-2653)
  'deletion_record', 'anonymised_themes'];
const ALICE = { role: 'interview_worker', scope: 'participant', sub: id('f1', 1), email: 'alice@a.test', email_verified: true };
const SYSTEM = { role: 'interview_worker', scope: 'system' };

let db;
let pool;

function sql(text) {
  const result = db.psql(text);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
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
const count = async (c, table) => Number((await c.query(`SELECT count(*) AS n FROM interview.${table}`)).rows[0].n);

before(async () => {
  if (skip) return;
  db = startPostgres('interview-rls');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 1 });
  sql(`SET search_path TO interview, public;
    INSERT INTO engagement (id, client_name, seat_total, enrol_token, allowed_email_domains) VALUES
      ('${E1}', 'Round one', 5, 'tok-1', '{a.test,b.test}'), ('${E2}', 'Round two', 5, NULL, '{}'),
      ('${E3}', 'Round three', 1, NULL, '{}'), ('${E4}', 'Round four', 1, NULL, '{}');
    INSERT INTO org_unit (id, engagement_id, name) VALUES ('${U1}', '${E1}', 'Root');
    INSERT INTO context_pack (engagement_id, content) VALUES ('${E1}', '{}');
    INSERT INTO person (person_id, verified_email) VALUES ('${PA}', 'alice@a.test'), ('${PB}', 'bob@b.test');
    INSERT INTO employee (id, engagement_id, person_id, unit_id, name, email) VALUES
      ('${EA}', '${E1}', '${PA}', '${U1}', 'Alice', 'Alice@A.test'),
      ('${EB}', '${E1}', '${PB}', '${U1}', 'Bob', 'bob@b.test'),
      ('${EC}', '${E2}', NULL, NULL, 'Carol', 'carol@c.test'),
      ('${X}', '${E3}', NULL, NULL, 'X', 'x@x.test'), ('${Y}', '${E3}', NULL, NULL, 'Y', 'y@x.test'),
      ('${P}', '${E4}', NULL, NULL, 'P', 'p@x.test'), ('${Q}', '${E4}', NULL, NULL, 'Q', 'q@x.test');
    INSERT INTO session (id, employee_id) VALUES ('${SA}', '${EA}'), ('${SB}', '${EB}'), ('${SC}', '${EC}');
    INSERT INTO turn (session_id, role, content) VALUES ('${SA}', 'agent', 'hello'), ('${SA}', 'user', 'hi'),
      ('${SB}', 'agent', 'hello'), ('${SC}', 'agent', 'hello');
    INSERT INTO insight (session_id, type, label) VALUES ('${SA}', 'task', 'a'), ('${SB}', 'task', 'b');
    INSERT INTO consent_event (employee_id, kind, value) VALUES ('${EA}', 'participation', true), ('${EB}', 'participation', true);
    INSERT INTO usage_ledger (session_id, engagement_id, model, cost_pence) VALUES ('${SA}', '${E1}', 'm', 3), ('${SB}', '${E1}', 'm', 4);
    INSERT INTO memory_blob (person_id) VALUES ('${PA}'), ('${PB}');
    INSERT INTO synthesis (engagement_id) VALUES ('${E1}');
    INSERT INTO synthesis_cache (engagement_id, kind, key, fingerprint, payload, model) VALUES ('${E1}', 'session', '${SA}', 'f', '{}', 'm');
    INSERT INTO synthesis_run (engagement_id, actor) VALUES ('${E1}', 'gsam');
    INSERT INTO outbox (idempotency_key, engagement_id, payload) VALUES ('${SA}:session_start', '${E1}', '{}');
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

test('(b) a participant sees only her own rows', { skip }, async () => {
  await as(ALICE, async (c) => {
    assert.deepEqual((await c.query('SELECT person_id FROM interview.person')).rows.map((r) => r.person_id), [PA]);
    assert.deepEqual((await c.query('SELECT id FROM interview.employee')).rows.map((r) => r.id), [EA]);
    assert.deepEqual((await c.query('SELECT id FROM interview.session')).rows.map((r) => r.id), [SA]);
    const turns = (await c.query('SELECT session_id FROM interview.turn')).rows;
    assert.equal(turns.length, 2);
    assert.ok(turns.every((r) => r.session_id === SA));
    assert.equal(await count(c, 'insight'), 1);
    assert.equal(await count(c, 'consent_event'), 1);
    assert.equal(await count(c, 'usage_ledger'), 1);
    assert.deepEqual((await c.query('SELECT person_id FROM interview.memory_blob')).rows.map((r) => r.person_id), [PA]);
    for (const table of ['synthesis', 'synthesis_cache', 'synthesis_run', 'outbox', 'seat_request', 'seat_purchase', 'audit_log']) {
      assert.equal(await count(c, table), 0, table);
    }
    // round metadata for enrolment and the prompt
    assert.equal(await count(c, 'engagement'), 4);
    assert.equal(await count(c, 'org_unit'), 1);
    assert.equal(await count(c, 'context_pack'), 1);
    // engagement-wide spend through the definer function
    const spend = (await c.query('SELECT total_pence FROM interview.engagement_spend($1)', [[E1]])).rows;
    assert.equal(Number(spend[0].total_pence), 7);
  });
});

test('(b) a participant cannot change other rows or the round', { skip }, async () => {
  await as(ALICE, async (c) => {
    assert.equal((await c.query(`UPDATE interview.employee SET name = 'x' WHERE id = $1`, [EB])).rowCount, 0);
    assert.equal((await c.query(`UPDATE interview.employee SET name = 'x' WHERE id = $1`, [EC])).rowCount, 0);
    assert.equal((await c.query(`UPDATE interview.session SET phase = 'automation' WHERE id = $1`, [SC])).rowCount, 0);
    assert.equal((await c.query(`UPDATE interview.engagement SET seat_total = 99 WHERE id = $1`, [E2])).rowCount, 0);
    assert.equal((await c.query(`UPDATE interview.engagement SET seat_total = 99 WHERE id = $1`, [E1])).rowCount, 0);
    assert.equal((await c.query(`UPDATE interview.org_unit SET name = 'x'`)).rowCount, 0);
    assert.equal((await c.query(`DELETE FROM interview.turn WHERE session_id = $1`, [SB])).rowCount, 0);
  });
  assert.equal(sql(`SELECT seat_total FROM interview.engagement WHERE id = '${E1}'`), '5');
  await assert.rejects(as(ALICE, (c) => c.query(`INSERT INTO interview.turn (session_id, role, content) VALUES ($1, 'user', 'x')`, [SB])),
    /row-level security/);
  await assert.rejects(as(ALICE, (c) => c.query(`INSERT INTO interview.employee (engagement_id, name, email) VALUES ($1, 'B', 'bob@b.test')`, [E2])),
    /row-level security/);
  await assert.rejects(as(ALICE, (c) => c.query(`INSERT INTO interview.employee (engagement_id, name, email, portal_role) VALUES ($1, 'A', 'alice@a.test', 'client_admin')`, [E2])),
    /row-level security/);
  await assert.rejects(as(ALICE, (c) => c.query(`UPDATE interview.employee SET portal_role = 'client_admin' WHERE id = $1`, [EA])),
    /participant may not change/);
  await assert.rejects(as(ALICE, (c) => c.query(`UPDATE interview.employee SET status = 'started' WHERE id = $1`, [EA])),
    /participant may not change/);
});

test('(b) a participant writes her own turn, consent, usage, status and memory', { skip }, async () => {
  await as(ALICE, async (c) => {
    await c.query(`INSERT INTO interview.turn (session_id, role, content, client_turn_id) VALUES ($1, 'user', 'mine', 'ct-1')`, [SA]);
    await c.query(`INSERT INTO interview.consent_event (employee_id, kind, value) VALUES ($1, 'attribution', true)`, [EA]);
    await c.query(`INSERT INTO interview.usage_ledger (session_id, engagement_id, model, cost_pence) VALUES ($1, $2, 'm', 1)`, [SA, E1]);
    assert.equal((await c.query(`UPDATE interview.employee SET status = 'declined' WHERE id = $1`, [EA])).rowCount, 1);
    assert.equal((await c.query(`UPDATE interview.session SET phase = 'day_in_life' WHERE id = $1`, [SA])).rowCount, 1);
    assert.equal((await c.query(`DELETE FROM interview.memory_blob WHERE person_id = $1`, [PA])).rowCount, 1);
    assert.equal(await c.query(`SELECT interview.bump_rate('chat:' || $1, 60, 10) AS ok`, [SA]).then((r) => r.rows[0].ok), true);
    await c.query(`INSERT INTO interview.audit_log (engagement_id, action, summary) VALUES ($1, 'declined', 'x')`, [E1]);
  });
  await assert.rejects(as(ALICE, (c) => c.query(`INSERT INTO interview.usage_ledger (session_id, engagement_id, model) VALUES ($1, $2, 'm')`, [SA, E2])),
    /row-level security/);
  assert.equal(sql(`SELECT count(*) FROM interview.turn WHERE client_turn_id = 'ct-1' AND session_id = '${SA}'`), '1');
  assert.equal(sql(`SELECT status FROM interview.employee WHERE id = '${EA}'`), 'declined');
  sql(`UPDATE interview.employee SET status = 'invited' WHERE id = '${EA}'`);
});

test('(c) system claims see every row', { skip }, async () => {
  const owner = Object.fromEntries(TABLES.map((t) => [t, sql(`SELECT count(*) FROM interview.${t}`)]));
  await as(SYSTEM, async (c) => {
    for (const table of TABLES) assert.equal(String(await count(c, table)), owner[table], table);
    assert.equal((await c.query(`UPDATE interview.outbox SET status = 'sent', sent_at = now()`)).rowCount, 1);
  });
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
  const eng = await as(SYSTEM, async (c) => (await c.query(
    `SELECT interview.create_engagement('Round five', 3, '{a.test}', 'tok-5', now() + interval '7 days', 'staff@g.test', '{}') AS id`)).rows[0].id);
  const units = Object.fromEntries(sql(`SELECT name || '|' || id || '|' || path::text FROM interview.org_unit
    WHERE engagement_id = '${eng}'`).split('\n').map((l) => { const [n, i, p] = l.split('|'); return [n, { id: i, path: p }]; }));
  const label = (u) => u.id.replaceAll('-', '_');
  assert.equal(units['Round five'].path, label(units['Round five']));
  assert.equal(units.Unassigned.path, `${label(units['Round five'])}.${label(units.Unassigned)}`);
  assert.equal(sql(`SELECT enrol_enabled || ':' || (default_unit_id = '${units.Unassigned.id}') || ':' || mode || ':' || target_minutes
    FROM interview.engagement WHERE id = '${eng}'`), 'false:true:person:20');
  assert.equal(sql(`SELECT portal_role FROM interview.employee WHERE engagement_id = '${eng}'`), 'gs_admin');

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

test('the bridge can switch to interview_worker and back inside one transaction', { skip }, async () => {
  const client = await pool.connect();
  const E6 = id('e1', 6);
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE gsam_bridge_write');
    await assert.rejects(client.query('SAVEPOINT s; SELECT count(*) FROM interview.engagement'), /permission denied/);
    await client.query('ROLLBACK TO SAVEPOINT s');
    await client.query('SET LOCAL ROLE interview_worker');
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(SYSTEM)]);
    await client.query(`INSERT INTO interview.engagement (id, client_name, status, org_id) VALUES ($1, 'Bridge round', 'draft', $1)`, [E6]);
    await client.query('SET LOCAL ROLE gsam_bridge_write');
    assert.equal((await client.query('SELECT current_user AS u')).rows[0].u, 'gsam_bridge_write');
    await client.query('COMMIT');
  } finally { client.release(); }
  assert.equal(sql(`SELECT status FROM interview.engagement WHERE id = '${E6}'`), 'draft');
});

test('(g) rollback.sql removes the schema and the role', { skip }, () => {
  sql(readFileSync(join(MIGRATIONS, '054_interview_engine', 'rollback.sql'), 'utf8'));
  assert.equal(sql(`SELECT count(*) FROM pg_namespace WHERE nspname = 'interview'`), '0');
  assert.equal(sql(`SELECT count(*) FROM pg_roles WHERE rolname = 'interview_worker'`), '0');
  assert.equal(sql(`SELECT count(*) FROM pg_extension WHERE extname = 'ltree'`), '0');
  assert.equal(sql(`SELECT auth.jwt()::text`), '{}');
});
