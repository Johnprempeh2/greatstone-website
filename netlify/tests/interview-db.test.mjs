// The interview data client (GRE-2612): the supabase-js surface the ported engine uses, over pg, as interview_worker
// with claims that end with each statement's transaction. A small schema of its own, so it runs without 054.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { interviewDb, interviewDbOnClient, claimsFor } from '../functions/lib/interview/db.mjs';

const SCHEMA = `
  DO $$ BEGIN CREATE ROLE interview_worker NOLOGIN NOBYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT interview_worker TO CURRENT_USER;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$
    SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
  GRANT USAGE ON SCHEMA auth TO interview_worker;
  CREATE SCHEMA interview;
  GRANT USAGE ON SCHEMA interview TO interview_worker;
  CREATE TABLE interview.thing (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner text NOT NULL, n bigint NOT NULL DEFAULT 0, score numeric,
    tags text[] NOT NULL DEFAULT '{}', state jsonb NOT NULL DEFAULT '{}', items jsonb NOT NULL DEFAULT '[]',
    at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz, UNIQUE (owner, n));
  ALTER TABLE interview.thing ENABLE ROW LEVEL SECURITY;
  ALTER TABLE interview.thing FORCE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE, DELETE ON interview.thing TO interview_worker;
  CREATE POLICY worker ON interview.thing TO interview_worker
    USING (auth.jwt()->>'scope' = 'system' OR owner = auth.jwt()->>'email')
    WITH CHECK (auth.jwt()->>'scope' = 'system' OR owner = auth.jwt()->>'email');
  CREATE FUNCTION interview.add(a int, b int) RETURNS int LANGUAGE sql AS 'SELECT a + b';
  CREATE FUNCTION interview.nothing(p jsonb) RETURNS void LANGUAGE sql AS 'SELECT';
  CREATE FUNCTION interview.echo(p jsonb) RETURNS jsonb LANGUAGE sql AS 'SELECT p';
  CREATE FUNCTION interview.who() RETURNS text LANGUAGE sql AS $f$ SELECT current_user || ':' || (auth.jwt()->>'scope') $f$;
  CREATE FUNCTION interview.mine() RETURNS SETOF interview.thing LANGUAGE sql AS 'SELECT * FROM interview.thing';
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA interview TO interview_worker;
`;

const alice = { id: '11111111-1111-4111-8111-111111111111', email: 'Alice@A.test' };
const bob = { id: '22222222-2222-4222-8222-222222222222', email: 'bob@b.test' };

test('claims: participant needs id and email; system is scoped', () => {
  assert.deepEqual(claimsFor('system'), { role: 'interview_worker', scope: 'system' });
  assert.equal(claimsFor(alice).email, 'alice@a.test');
  // the Better Auth user id is the identity the interview policies match on
  assert.deepEqual([claimsFor(alice).scope, claimsFor(alice).sub], ['participant', alice.id]);
  assert.throws(() => claimsFor({ id: 'x' }));
  assert.throws(() => claimsFor(null));
});

test('supabase-shaped queries over pg, under RLS', { skip }, async (t) => {
  const pgc = startPostgres('ivdb');
  t.after(() => pgc.stop());
  const r = pgc.psql(SCHEMA);
  assert.equal(r.status, 0, r.stderr);
  const pool = new pg.Pool({ connectionString: pgc.url, max: 4 });
  t.after(() => pool.end());
  const sys = interviewDb('system', { pool });
  const a = interviewDb(alice, { pool });
  const b = interviewDb(bob, { pool });

  await t.test('insert with select returns rows; json arrays go in as json', async () => {
    const { data, error } = await a.from('thing').insert({ owner: 'alice@a.test', n: 1, items: [1, 2], state: { phase: 'warmup' },
      tags: ['x', 'y'] }).select('*').single();
    assert.equal(error, null);
    assert.deepEqual(data.items, [1, 2]);
    assert.deepEqual(data.state, { phase: 'warmup' });
    assert.deepEqual(data.tags, ['x', 'y']);
    assert.equal(typeof data.n, 'number');
    assert.match(data.at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    const plain = await a.from('thing').insert({ owner: 'alice@a.test', n: 2 });
    assert.equal(plain.error, null);
    assert.equal(plain.data, null);
  });

  await t.test('RLS: a participant cannot write or read for another email', async () => {
    const bad = await a.from('thing').insert({ owner: 'bob@b.test', n: 9 });
    assert.equal(bad.error.code, '42501');
    await b.from('thing').insert({ owner: 'bob@b.test', n: 1 });
    const { data } = await a.from('thing').select('owner');
    assert.deepEqual([...new Set(data.map((x) => x.owner))], ['alice@a.test']);
    const all = await sys.from('thing').select('id', { count: 'exact', head: true });
    assert.equal(all.count, 3);
    const upd = await a.from('thing').update({ score: 5 }).eq('owner', 'bob@b.test').select('id');
    assert.deepEqual(upd.data, []);
  });

  await t.test('filters, order, limit, single and maybeSingle', async () => {
    const { data } = await sys.from('thing').select('owner, n').order('owner', { ascending: false }).order('n').limit(2);
    assert.deepEqual(data, [{ owner: 'bob@b.test', n: 1 }, { owner: 'alice@a.test', n: 1 }]);
    assert.equal((await sys.from('thing').select('n').in('n', [1, 2])).data.length, 3);
    assert.equal((await sys.from('thing').select('n').is('ended_at', null)).data.length, 3);
    assert.equal((await sys.from('thing').select('n').not('ended_at', 'is', null)).data.length, 0);
    assert.equal((await sys.from('thing').select('n').not('n', 'in', '(1)')).data.length, 1);
    assert.equal((await sys.from('thing').select('n').gt('n', 1)).data.length, 1);
    assert.equal((await sys.from('thing').select('n').ilike('owner', 'ALICE%')).data.length, 2);
    assert.equal((await sys.from('thing').select('n').contains('tags', ['x'])).data.length, 1);
    assert.equal((await sys.from('thing').select('n').contains('state', { phase: 'warmup' })).data.length, 1);
    assert.equal((await sys.from('thing').select('n').filter('state->>phase', 'eq', 'warmup')).data.length, 1);
    const many = await sys.from('thing').select('n').single();
    assert.equal(many.error.code, 'PGRST116');
    const none = await sys.from('thing').select('n').eq('n', 42).maybeSingle();
    assert.deepEqual([none.data, none.error], [null, null]);
    const noneOne = await sys.from('thing').select('n').eq('n', 42).single();
    assert.equal(noneOne.error.code, 'PGRST116');
    const counted = await sys.from('thing').select('n', { count: 'exact' }).eq('owner', 'alice@a.test');
    assert.equal(counted.count, 2);
    assert.deepEqual(Object.keys(counted.data[0]), ['n']);
  });

  await t.test('unique violation surfaces the SQLSTATE, as supabase-js did', async () => {
    const dup = await a.from('thing').insert({ owner: 'alice@a.test', n: 1 }).select('*').single();
    assert.equal(dup.error.code, '23505');
  });

  await t.test('upsert and delete', async () => {
    const up = await a.from('thing').upsert({ owner: 'alice@a.test', n: 1, score: 7 }, { onConflict: 'owner,n' }).select('score').single();
    assert.equal(up.data.score, 7);
    const del = await a.from('thing').delete().eq('n', 2).select('n');
    assert.deepEqual(del.data, [{ n: 2 }]);
    const unfiltered = await a.from('thing').delete();
    assert.equal(unfiltered.error.code, '21000');
  });

  await t.test('rpc: scalar, void, json and setof', async () => {
    assert.equal((await sys.rpc('add', { a: 2, b: 3 })).data, 5);
    assert.deepEqual(await sys.rpc('nothing', { p: [1] }), { data: null, error: null });
    assert.deepEqual((await sys.rpc('echo', { p: [1, { x: 2 }] })).data, [1, { x: 2 }]);
    assert.equal((await a.rpc('mine')).data.length, 1);
    assert.equal((await sys.rpc('missing')).error.code, 'PGRST202');
    assert.equal((await sys.rpc('who')).data, 'interview_worker:system');
  });

  await t.test('embedded selects are refused; db.sql is the way', async () => {
    const r1 = await sys.from('thing').select('*, other:other_id!inner(*)');
    assert.equal(r1.error.code, 'PGRST100');
    const r2 = await a.sql('SELECT count(*)::int AS c FROM thing');
    assert.equal(r2.data[0].c, 1);
  });

  await t.test('inside a held transaction: savepoint per statement, holder role and claims restored', async () => {
    assert.equal(pgc.psql(`DO $$ BEGIN CREATE ROLE holder NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT holder TO CURRENT_USER;`).status, 0);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE holder');
      await client.query(`SELECT set_config('request.jwt.claims', '{"role":"holder"}', true)`);
      const db = interviewDbOnClient(client, { org: 'o1' });
      const [ins, bad] = await Promise.all([
        db.from('thing').insert({ owner: 'carol@c.test', n: 1 }).select('id').single(),
        db.from('thing').insert({ owner: 'carol@c.test', n: 1 }).select('id').single(),
      ]);
      assert.equal(ins.error, null);
      assert.equal(bad.error.code, '23505');
      assert.equal((await db.rpc('who')).data, 'interview_worker:system');
      const { rows: [now] } = await client.query(`SELECT current_user AS u, current_setting('request.jwt.claims', true) AS c`);
      assert.deepEqual([now.u, JSON.parse(now.c).role], ['holder', 'holder']);
      await client.query('ROLLBACK');
    } finally { client.release(); }
    assert.equal((await sys.from('thing').select('id').eq('owner', 'carol@c.test')).data.length, 0);
  });

  await t.test('role and claims do not outlive the statement on a pooled connection', async () => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`SELECT current_user AS u, current_setting('request.jwt.claims', true) AS c`);
      assert.notEqual(rows[0].u, 'interview_worker');
      assert.ok(!rows[0].c);
    } finally { client.release(); }
  });
});
