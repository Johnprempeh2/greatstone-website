import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startPostgres, skip, OWNER } from './lib/postgres.mjs';
import { authServerPool } from '../functions/lib/auth-server-pool.mjs';
import { validateImport, importUsers } from '../database/migrations/052_better_auth/import-users.mjs';

let db;
let pool;
const uid = 'c0ffee00-0000-4000-8000-000000000048';
const tables = ['user', 'account', 'session', 'verification'];

function sql(text) {
  const result = db.psql(text);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

before(async () => {
  if (skip) return;
  db = startPostgres('better-auth');
  await db.migrate();
  pool = new pg.Pool({ connectionString: db.url, max: 1 });
});
after(async () => { await pool?.end(); db?.stop(); });

test('private schema has FORCE RLS and no new public tables', { skip }, () => {
  assert.equal(sql(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='better_auth' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity`), '4');
  assert.equal(sql(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('user','account','session','verification') AND c.relkind='r'`), '0');
  assert.equal(sql(`SELECT rolcanlogin || ':' || rolbypassrls FROM pg_roles WHERE rolname='auth_server'`), 'false:false');
});

test('anon and authenticated cannot read any Better Auth table', { skip }, () => {
  for (const role of ['anon', 'authenticated']) for (const table of tables) {
    const result = db.psql(`BEGIN; SET LOCAL ROLE ${role}; SELECT count(*) FROM better_auth."${table}"; COMMIT;`);
    assert.notEqual(result.status, 0, `${role} read ${table}`);
    assert.match(result.stderr, /permission denied/);
  }
});

test('auth_server cannot read app tables or auth.users', { skip }, () => {
  for (const table of ['public.customers', 'public.orders', 'auth.users']) {
    const result = db.psql(`BEGIN; SET LOCAL ROLE auth_server; SELECT count(*) FROM ${table}; COMMIT;`);
    assert.notEqual(result.status, 0, `auth_server read ${table}`);
    assert.match(result.stderr, /permission denied/);
  }
});

test('auth_server can write sign-in, session and reset rows; user ids sync', { skip }, async () => {
  const auth = authServerPool(pool);
  const client = await auth.connect();
  await client.query(`INSERT INTO "user" ("id","name","email") VALUES ($1,'Test','auth-rls@example.test')`, [uid]);
  await client.query(`INSERT INTO "account" ("id","accountId","providerId","userId","password")
    VALUES ('account-48',$1,'credential',$1,'test-hash')`, [uid]);
  await client.query(`INSERT INTO "session" ("id","token","userId","expiresAt")
    VALUES ('session-48','token-48',$1,now() + interval '1 day')`, [uid]);
  await client.query(`INSERT INTO "verification" ("id","identifier","value","expiresAt")
    VALUES ('verification-48','reset','secret',now() + interval '1 hour')`);
  await client.query(`DELETE FROM "verification" WHERE "id"='verification-48'`);
  await auth.finish();
  assert.equal(sql(`SELECT id FROM auth.users WHERE id='${uid}'`), uid);
  assert.equal(sql(`SELECT count(*) FROM better_auth."session" WHERE "userId"='${uid}'`), '1');
  const bad = db.psql(`INSERT INTO better_auth."user" ("id","name","email") VALUES ('not-a-uuid','Bad','bad-48@example.test')`);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /not a uuid/);
});

test('nested commit stays in auth_server; nested rollback keeps outer transaction usable', { skip }, async () => {
  const auth = authServerPool(pool);
  const first = await auth.connect();
  assert.equal(await auth.connect(), first, 'one bound client per request');
  const who = () => first.query('SELECT current_user AS role').then(({ rows }) => rows[0].role);
  assert.equal(await who(), 'auth_server');
  await first.query('BEGIN');
  assert.equal(await who(), 'auth_server');
  await first.query('COMMIT');
  assert.equal(await who(), 'auth_server', 'inner commit did not end the role bridge');
  await first.query('BEGIN');
  await first.query(`INSERT INTO "verification" ("id","identifier","value","expiresAt")
    VALUES ('rolled-back','reset','secret',now() + interval '1 hour')`);
  await first.query('ROLLBACK');
  assert.equal(await who(), 'auth_server');
  await first.query('BEGIN');
  await assert.rejects(first.query('SELECT 1 / 0'));
  await first.query('ROLLBACK');
  assert.equal(await who(), 'auth_server');
  await auth.finish();
  assert.equal(sql(`SELECT count(*) FROM better_auth."verification" WHERE "id"='rolled-back'`), '0');
});

test('raw COMMIT and role changes cannot escape the wrapper; failed request releases role', { skip }, async () => {
  const auth = authServerPool(pool);
  const client = await auth.connect();
  await assert.rejects(client.query('COMMIT'), /cannot end the outer transaction/);
  for (const statement of ['SET ROLE authenticated', 'RESET ROLE', 'SET SESSION AUTHORIZATION DEFAULT', 'RESET ALL']) {
    await assert.rejects(client.query(statement), /cannot change database role/);
  }
  assert.equal((await client.query('SELECT current_user AS role')).rows[0].role, 'auth_server');
  await assert.rejects(client.query('SELECT 1 / 0'));
  await auth.finish(false);
  const next = await pool.connect();
  try {
    const { rows } = await next.query('SELECT current_user AS role, current_setting($1,true) AS claims', ['request.jwt.claims']);
    assert.equal(rows[0].role, OWNER);
    assert.ok(!rows[0].claims);
  } finally { next.release(); }
});

test('the nested transaction check catches a real risk: raw COMMIT drops the scoped role', { skip }, async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE auth_server');
    assert.equal((await client.query('SELECT current_user AS role')).rows[0].role, 'auth_server');
    await client.query('COMMIT');
    assert.equal((await client.query('SELECT current_user AS role')).rows[0].role, OWNER);
  } finally { client.release(); }
});

test('one-time import checks all eight ids and hashes, rolls back dry run, and keeps identities on apply', { skip }, async () => {
  const fixture = Array.from({ length: 8 }, (_, index) => ({
    id: `f00d0000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    email: `import-${index + 1}@example.test`, name: 'Test', emailVerified: true,
    passwordHash: '$2b$12$' + 'A'.repeat(53),
  }));
  assert.throws(() => validateImport(fixture.slice(1)), /eight/);
  assert.throws(() => validateImport([{ ...fixture[0], passwordHash: 'plain' }, ...fixture.slice(1)]), /Invalid/);
  const duplicateId = 'abcdefab-0000-4000-8000-000000000001';
  assert.throws(() => validateImport([
    { ...fixture[0], id: duplicateId },
    { ...fixture[1], id: duplicateId.toUpperCase() },
    ...fixture.slice(2),
  ]), /Duplicate source identity/);
  const users = validateImport(fixture);
  assert.equal(await importUsers(pool, users), 8);
  assert.equal(sql(`SELECT count(*) FROM better_auth."user" WHERE "email" LIKE 'import-%@example.test'`), '0');
  assert.equal(await importUsers(pool, users, true), 8);
  assert.equal(sql(`SELECT count(*) FROM better_auth."user" WHERE "email" LIKE 'import-%@example.test'`), '8');
  assert.equal(sql(`SELECT count(*) FROM auth.users WHERE email::text LIKE 'import-%@example.test'`), '8');
  assert.equal(await importUsers(pool, users, true), 8, 'rerunning never changes a hash');
});

test('one-time import refuses a non-owner connection before writing identities', { skip }, async () => {
  const fixture = Array.from({ length: 8 }, (_, index) => ({
    id: `f00d0001-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    email: `non-owner-${index + 1}@example.test`, name: 'Test', emailVerified: true,
    passwordHash: '$2b$12$' + 'A'.repeat(53),
  }));
  const rolePool = {
    async connect() {
      const client = await pool.connect();
      return {
        query: async (...args) => {
          if (args[0] === 'BEGIN') {
            await client.query('BEGIN');
            await client.query('SET LOCAL ROLE anon');
            return;
          }
          return client.query(...args);
        },
        release: () => client.release(),
      };
    },
  };
  await assert.rejects(importUsers(rolePool, validateImport(fixture), true), /migration owner role/);
  assert.equal(sql(`SELECT count(*) FROM better_auth."user" WHERE "email" LIKE 'non-owner-%@example.test'`), '0');
});
