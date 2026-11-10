// scripts/db-copy-back.mjs (GRE-4942) on a real Postgres with every migration: a "fork" database copied from "live",
// then turns and ledger rows lost on live, a later answer written on live, and the copy-back. Proves: only the lost
// rows come back, md5 matches, every other row is unchanged, a second run inserts nothing, the dry run writes nothing,
// another organisation's rows are never touched, and a withdrawal or deletion after the recovery point is respected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { startInterviewDb, newCustomer, seedRound, skip } from '../netlify/tests/lib/interview-harness.mjs';
import { copyBack, parseArgs, sameDatabase } from './db-copy-back.mjs';

// every user table's row count and md5, to show what changed between two moments
function fingerprint(sql, db) {
  const q = `SELECT format('SELECT %L, count(*), md5(coalesce(string_agg(x::text, E''\\n'' ORDER BY x::text), '''')) FROM %I.%I x',
    schemaname || '.' || relname, schemaname, relname) FROM pg_stat_user_tables ORDER BY 1 \\gexec`;
  return Object.fromEntries(sql(q, db).split('\n').filter(Boolean).map((l) => { const [t, n, m] = l.split('|'); return [t, `${n}|${m}`]; }));
}

test('copy-back restores only the lost rows of one organisation', { skip }, async () => {
  const db = await startInterviewDb('copyback');
  const sql = (q, d = 'netlifydb') => { const r = db.pgc.psql(q, undefined, d); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const clients = [];
  try {
    // two organisations, one session each with 6 turns and 3 ledger rows
    const seed = (name) => {
      const customerId = newCustomer(sql, name);
      const round = seedRound(sql, { customerId, clientName: name });
      const employee = randomUUID();
      const session = randomUUID();
      sql(`SET search_path TO interview, public;
        INSERT INTO employee (id, engagement_id, name, email, user_id, status) VALUES ('${employee}', '${round.id}', 'P', 'p-${employee}@example.test', 'ba-${employee}', 'started');
        INSERT INTO session (id, employee_id, started_at) VALUES ('${session}', '${employee}', '2026-11-10T09:00:00Z');
        INSERT INTO turn (session_id, role, content, ts, client_turn_id)
          SELECT '${session}', CASE WHEN g % 2 = 0 THEN 'user' ELSE 'agent' END::turn_role, '${name} answer ' || g, '2026-11-10T09:00:00Z'::timestamptz + g * interval '1 minute', 'c' || g
          FROM generate_series(1, 6) g;
        INSERT INTO usage_ledger (session_id, engagement_id, model, input_tokens, output_tokens, cost_pence, ts)
          SELECT '${session}', '${round.id}', 'claude-sonnet-4-6', 9007199254740993, g, g, '2026-11-10T09:00:00Z'::timestamptz + g * interval '1 minute'
          FROM generate_series(1, 3) g;`);
      return { customerId, session };
    };
    const a = seed('Org A');
    const b = seed('Org B');

    // the fork: the database as it was at the snapshot
    sql('CREATE DATABASE fork TEMPLATE netlifydb', 'postgres');

    // the loss on live: 3 turns and 2 ledger rows of Org A, and one Org B turn outside the scope of the copy-back
    sql(`DELETE FROM interview.turn WHERE id IN (SELECT id FROM interview.turn WHERE customer_id = '${a.customerId}' ORDER BY seq LIMIT 3);
         DELETE FROM interview.usage_ledger WHERE id IN (SELECT id FROM interview.usage_ledger WHERE customer_id = '${a.customerId}' ORDER BY ts LIMIT 2);
         DELETE FROM interview.turn WHERE id IN (SELECT id FROM interview.turn WHERE customer_id = '${b.customerId}' ORDER BY seq LIMIT 1);`);
    // an answer written on live after the snapshot: a restore would lose it, the copy-back must keep it
    sql(`INSERT INTO interview.turn (session_id, role, content, ts) VALUES ('${a.session}', 'user', 'written after the snapshot', '2026-11-10T09:30:00Z')`);
    // a row both sides have but live changed after the snapshot: live wins
    sql(`UPDATE interview.turn SET content = 'edited on live' WHERE customer_id = '${a.customerId}' AND client_turn_id = 'c6'`);

    const before = fingerprint(sql, 'netlifydb');
    const connect = async (database) => {
      const c = new pg.Client({ connectionString: db.pgc.url.replace('/netlifydb?', `/${database}?`) });
      await c.connect();
      clients.push(c);
      return c;
    };
    const source = await connect('fork');
    const target = await connect('netlifydb');
    const args = { source, target, customerId: a.customerId, from: '2026-11-10T08:00:00Z' };

    // dry run: reports the same plan, writes nothing
    const dry = await copyBack(args);
    assert.equal(dry.applied, false);
    assert.deepEqual(dry.tables.map((t) => t.inserted), [0, 3, 2]);
    assert.deepEqual(fingerprint(sql, 'netlifydb'), before);

    const run = await copyBack({ ...args, apply: true });
    assert.equal(run.applied, true);
    assert.deepEqual(run.tables.map((t) => [t.table, t.candidates, t.present, t.inserted]), [
      ['interview.session', 1, 1, 0],
      ['interview.turn', 6, 3, 3],
      ['interview.usage_ledger', 3, 1, 2],
    ]);
    for (const t of run.tables) assert.equal(t.md5Target, t.md5Source, t.table);

    // Org A's turns and ledger now match the fork, plus the later answer, with live's edit kept
    const rows = (d, table, cust) => sql(`SELECT string_agg(x::text, E'\\n' ORDER BY x.id) FROM interview.${table} x WHERE customer_id = '${cust}'`, d);
    assert.equal(rows('netlifydb', 'usage_ledger', a.customerId), rows('fork', 'usage_ledger', a.customerId));
    assert.equal(sql(`SELECT count(*) FROM interview.turn WHERE customer_id = '${a.customerId}'`), '7');
    assert.equal(sql(`SELECT count(*) FROM interview.turn WHERE content = 'written after the snapshot'`), '1');
    assert.equal(sql(`SELECT content FROM interview.turn WHERE customer_id = '${a.customerId}' AND client_turn_id = 'c6'`), 'edited on live');
    assert.equal(sql(`SELECT input_tokens FROM interview.usage_ledger WHERE customer_id = '${a.customerId}' LIMIT 1`), '9007199254740993');

    // no other row changed: only the turn and ledger tables differ, and without the inserted ids they are as before
    const after = fingerprint(sql, 'netlifydb');
    const changed = Object.keys(after).filter((k) => after[k] !== before[k]).sort();
    assert.deepEqual(changed, ['interview.turn', 'interview.usage_ledger']);
    const inserted = run.tables.flatMap((t) => t.insertedIds).map((id) => `'${id}'`).join(',');
    const without = (table) => sql(`SELECT count(*) || '|' || md5(coalesce(string_agg(x::text, E'\\n' ORDER BY x::text), '')) FROM interview.${table} x WHERE id NOT IN (${inserted})`);
    assert.equal(without('turn'), before['interview.turn']);
    assert.equal(without('usage_ledger'), before['interview.usage_ledger']);
    assert.equal(sql(`SELECT count(*) FROM interview.turn WHERE customer_id = '${b.customerId}'`), '5'); // Org B's loss is not in scope

    // idempotent: a second run inserts nothing and changes nothing
    const again = await copyBack({ ...args, apply: true });
    assert.deepEqual(again.tables.map((t) => t.inserted), [0, 0, 0]);
    assert.deepEqual(fingerprint(sql, 'netlifydb'), after);
  } finally {
    for (const c of clients) await c.end().catch(() => {});
    await db.stop();
  }
});

test('a lost session comes back with its turns', { skip }, async () => {
  const db = await startInterviewDb('copyback-session');
  const sql = (q, d = 'netlifydb') => { const r = db.pgc.psql(q, undefined, d); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const clients = [];
  try {
    const customerId = newCustomer(sql, 'Org S');
    const round = seedRound(sql, { customerId });
    const employee = randomUUID();
    const session = randomUUID();
    sql(`SET search_path TO interview, public;
      INSERT INTO employee (id, engagement_id, name, email, user_id, status) VALUES ('${employee}', '${round.id}', 'P', 'p@example.test', 'ba-p', 'started');
      INSERT INTO session (id, employee_id, started_at, ended_at) VALUES ('${session}', '${employee}', '2026-11-10T09:00:00Z', '2026-11-10T09:20:00Z');
      INSERT INTO turn (session_id, role, content, ts) SELECT '${session}', 'user', 'a' || g, '2026-11-10T09:00:00Z'::timestamptz + g * interval '1 minute' FROM generate_series(1, 4) g;`);
    sql('CREATE DATABASE fork TEMPLATE netlifydb', 'postgres');
    // lost without a trace, as a wrong restore loses it: no withdrawal row (a delete through the app writes one)
    sql(`ALTER TABLE interview.session DISABLE TRIGGER trg_session_withdrawal;
         DELETE FROM interview.session WHERE id = '${session}';
         ALTER TABLE interview.session ENABLE TRIGGER trg_session_withdrawal;`); // cascades to its turns
    const connect = async (database) => {
      const c = new pg.Client({ connectionString: db.pgc.url.replace('/netlifydb?', `/${database}?`) });
      await c.connect();
      clients.push(c);
      return c;
    };
    const run = await copyBack({ source: await connect('fork'), target: await connect('netlifydb'), customerId, from: '2026-11-10T00:00:00Z', apply: true });
    assert.deepEqual(run.tables.map((t) => t.inserted), [1, 4, 0]);
    assert.equal(sql(`SELECT count(*) FROM interview.turn WHERE session_id = '${session}'`), '4');
  } finally {
    for (const c of clients) await c.end().catch(() => {});
    await db.stop();
  }
});

test('rows deleted on purpose after the recovery point stay deleted', { skip }, async () => {
  const db = await startInterviewDb('copyback-rights');
  const sql = (q, d = 'netlifydb') => { const r = db.pgc.psql(q, undefined, d); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const clients = [];
  try {
    const customerId = newCustomer(sql, 'Org W');
    const round = seedRound(sql, { customerId });
    const people = [randomUUID(), randomUUID()];
    for (const [i, employee] of people.entries()) {
      sql(`SET search_path TO interview, public;
        INSERT INTO employee (id, engagement_id, name, email, user_id, status) VALUES ('${employee}', '${round.id}', 'P${i}', 'p${i}@example.test', 'ba-p${i}', 'started');
        INSERT INTO session (employee_id, started_at) VALUES ('${employee}', '2026-11-10T09:00:00Z');
        INSERT INTO turn (session_id, role, content, ts) SELECT id, 'user', 'a', '2026-11-10T09:01:00Z' FROM session WHERE employee_id = '${employee}';`);
    }
    sql('CREATE DATABASE fork TEMPLATE netlifydb', 'postgres');
    // P0 withdraws (the session delete writes a withdrawal); P1's turn is lost by mistake
    sql(`DELETE FROM interview.session WHERE employee_id = '${people[0]}';
         DELETE FROM interview.turn WHERE user_id = 'ba-p1';`);
    const connect = async (database) => {
      const c = new pg.Client({ connectionString: db.pgc.url.replace('/netlifydb?', `/${database}?`) });
      await c.connect();
      clients.push(c);
      return c;
    };
    const args = { source: await connect('fork'), target: await connect('netlifydb'), customerId, from: '2026-11-10T00:00:00Z', apply: true };
    const run = await copyBack(args);
    assert.deepEqual(run.withheldUsers, ['ba-p0']);
    assert.deepEqual(run.tables.map((t) => [t.withheld, t.inserted]), [[1, 0], [1, 1], [0, 0]]);
    assert.equal(sql(`SELECT count(*) FROM interview.session WHERE user_id = 'ba-p0'`), '0');
    assert.equal(sql(`SELECT count(*) FROM interview.turn WHERE user_id = 'ba-p1'`), '1');

    // a retention or self-service deletion in the window stops the run before any write
    sql(`INSERT INTO interview.deletion_record (engagement_id, kind) VALUES ('${round.id}', 'self_service')`);
    await assert.rejects(copyBack(args), /self_service deletion ran .* set --to before it/);
  } finally {
    for (const c of clients) await c.end().catch(() => {});
    await db.stop();
  }
});

test('arguments: organisation and start time are required; the two databases must differ', () => {
  assert.throws(() => parseArgs(['--from', '2026-11-10T00:00:00Z']), /--customer/);
  assert.throws(() => parseArgs(['--customer', randomUUID()]), /--from/);
  assert.throws(() => parseArgs(['--customer', randomUUID(), '--from', 'yesterday']), /ISO/);
  assert.throws(() => parseArgs(['--customer', randomUUID(), '--from', '2026-11-10T00:00:00Z', '--force']), /unknown/);
  const ok = parseArgs(['--customer', '68cb9934-8627-4f21-8158-0a04c9eb04ff', '--from', '2026-11-10T00:00:00Z', '--apply']);
  assert.equal(ok.apply, true);
  assert.equal(sameDatabase('postgres://u:p@h.example/db?sslmode=require', 'postgres://v:q@h.example/db'), true);
  assert.equal(sameDatabase('postgres://u@h1.example/db', 'postgres://u@h2.example/db'), false);
});
