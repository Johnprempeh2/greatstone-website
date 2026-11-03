// The Supabase exporter (scripts/supabase-export.mjs, GRE-2567) on two throwaway real Postgres clusters with every
// migration applied (lib/postgres.mjs). The source gets Supabase's auth.users columns, so it stands in for the old
// database. Proves: the export's identities pass the importer's ten-user check; its tables payload moves into a fresh
// target with the same counts; files are 0600 and never overwritten; deleted users are left out; a table outside
// TABLES with rows, a user with no password or a stored file stops the export; no row value reaches its output.
// The catch-up (export --since, GRE-3902): only rows whose key is new move, with exact counts, onto the target that
// took the first export; a new user brings the whole identity set at the new count; a row changed or removed since
// stops it with names and counts only, and nothing written.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { startPostgres, skip } from './lib/postgres.mjs';
import { TABLES, buildTablesData, moveTables, targetColumns } from '../functions/lib/owner-import.mjs';
import { validateImport } from '../database/migrations/052_better_auth/import-users.mjs';
import { problems } from '../../scripts/supabase-export.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/supabase-export.mjs', import.meta.url));
const ORG = '11111111-1111-4111-8111-111111111111';
const USERS = Array.from({ length: 10 }, (_, i) => ({
  id: `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  email: `exported${i}@example.test`, name: `Exported Person ${i}`,
  hash: `$2a$10$${String.fromCharCode(65 + i).repeat(53)}`,
}));
const LATE = { id: 'a0000000-0000-4000-8000-00000000000a', email: 'late@example.test', name: 'Late Joiner', hash: `$2a$10$${'L'.repeat(53)}` };
const SECRETS = [...[...USERS, LATE].flatMap((u) => [u.email, u.name, u.hash]), 'Northwind Exported',
  'staff-only@example.test', 'Contoso Late', 'Northwind Renamed', 'late-log-label'];

let source;
let target;
let dir;
before(async () => {
  if (skip) return;
  [source, target] = [startPostgres('export-src'), startPostgres('export-dst')];
  await source.migrate();
  await target.migrate();
  const ok = (r) => assert.equal(r.status, 0, r.stderr);
  // Supabase's own auth.users columns, which the Netlify bridge table does not have
  ok(source.psql(`ALTER TABLE auth.users ADD COLUMN encrypted_password text, ADD COLUMN raw_user_meta_data jsonb,
    ADD COLUMN deleted_at timestamptz;`));
  ok(source.psql(`BEGIN;
    ${USERS.map((u, i) => `INSERT INTO auth.users (id, email, email_confirmed_at, encrypted_password, raw_user_meta_data)
      VALUES ('${u.id}', '${u.email}', ${i % 2 ? 'NULL' : 'now()'}, '${u.hash}', '{"full_name": "${u.name}"}');`).join('\n')}
    INSERT INTO auth.users (id, email, encrypted_password, deleted_at)
      VALUES ('a0000000-0000-4000-8000-0000000000ff', 'deleted@example.test', '${USERS[0].hash}', now());
    INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'greatstone', 'Greatstone');
    INSERT INTO org_settings (org_id) VALUES ('${ORG}');
    INSERT INTO users (org_id, email, full_name, auth_subject) VALUES ('${ORG}', 'staff-only@example.test', 'Staff', '${USERS[0].id}');
    INSERT INTO customers (id, org_id, slug, name) VALUES ('c1000000-0000-4000-8000-000000000001', '${ORG}', 'northwind', 'Northwind Exported');
    INSERT INTO deepdive_plans (slug, org_id, plan) VALUES ('northwind', '${ORG}', '{"engagement": {"client": "Northwind", "title": "Plan", "stage": "live"}}');
    INSERT INTO deepdive_log (slug, org_id) VALUES ('northwind', '${ORG}'), ('northwind', '${ORG}');
    COMMIT;`));
  // Supabase never had the Netlify-only tables that migrations seed or triggers fill (056 activity outbox, 059
  // compose problems), so the stand-in source must not hold rows outside TABLES either
  ok(source.psql(`DO $$ DECLARE t text; BEGIN
    FOR t IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
      AND relname <> ALL (ARRAY['${TABLES.join("','")}']) LOOP
      EXECUTE format('TRUNCATE public.%I CASCADE', t);
    END LOOP; END $$;`));
  dir = mkdtempSync(join(tmpdir(), 'export-out-'));
});
after(() => { source?.stop(); target?.stop(); if (dir) rmSync(dir, { recursive: true, force: true }); });

const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], {
  encoding: 'utf8', env: { ...process.env, SUPABASE_DB_URL: source.url },
});
function assertNoValues(text) {
  for (const s of SECRETS) assert.ok(!text.includes(s), 'a row value reached the output');
}

test('export: ten identities the importer accepts, tables that move with the same counts, counts-only output', { skip }, async () => {
  const out = run('export', '--out', dir);
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assertNoValues(out.stdout + out.stderr);
  for (const f of ['identities.json', 'tables.json', 'counts.json'])
    assert.equal(statSync(join(dir, f)).mode & 0o777, 0o600, f);

  const identities = JSON.parse(readFileSync(join(dir, 'identities.json'), 'utf8'));
  const users = validateImport(identities, 10);
  assert.ok(!users.some((u) => u.email === 'deleted@example.test'), 'a deleted user was exported');
  assert.equal(users.find((u) => u.id === USERS[3].id).name, USERS[3].name);
  assert.equal(users.filter((u) => u.emailVerified).length, 5);

  const counts = JSON.parse(readFileSync(join(dir, 'counts.json'), 'utf8'));
  assert.equal(counts.authUsers, 10);
  assert.equal(counts.storageObjects, 0);
  const pool = new pg.Pool({ connectionString: target.url, max: 1 });
  try {
    const client = await pool.connect();
    let built;
    try { built = buildTablesData(JSON.parse(readFileSync(join(dir, 'tables.json'), 'utf8')), await targetColumns(client)); }
    finally { client.release(); }
    const moved = await moveTables(pool, built.data, true);
    for (const c of moved.tables) assert.equal(c.after, counts.tables[c.table], c.table);
  } finally { await pool.end(); }

  const again = run('export', '--out', dir);
  assert.notEqual(again.status, 0, 'an existing export was overwritten');
  assert.match(again.stderr, /Export stopped/);
});

test('export --since: only rows with a new key move, with exact counts; a new user brings every identity (GRE-3902)', { skip }, async () => {
  // the live site keeps writing after the step 4 export: a new client, two log rows and a new user. Supabase has none
  // of the Netlify-only triggers the stand-in source carries (056's activity outbox), so they are off for the write.
  const ok = (r) => assert.equal(r.status, 0, r.stderr);
  ok(source.psql(`BEGIN; SET LOCAL session_replication_role = replica;
    INSERT INTO customers (id, org_id, slug, name) VALUES ('c1000000-0000-4000-8000-000000000002', '${ORG}', 'contoso', 'Contoso Late');
    INSERT INTO deepdive_log (slug, org_id, label) VALUES ('northwind', '${ORG}', 'late-log-label'), ('northwind', '${ORG}', NULL);
    INSERT INTO auth.users (id, email, email_confirmed_at, encrypted_password, raw_user_meta_data)
      VALUES ('${LATE.id}', '${LATE.email}', now(), '${LATE.hash}', '{"full_name": "${LATE.name}"}');
    COMMIT;`, 'postgres'));
  const delta = mkdtempSync(join(tmpdir(), 'export-delta-'));
  try {
    const out = run('export', '--since', dir, '--out', delta);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assertNoValues(out.stdout + out.stderr);
    assert.match(out.stdout, /"customers":\{"new":1,"changed":0,"removed":0\}/);
    assert.match(out.stdout, /"deepdive_log":\{"new":2,"changed":0,"removed":0\}/);
    assert.match(out.stdout, /identityCount must become 11/);
    for (const f of ['identities.json', 'tables.json', 'counts.json'])
      assert.equal(statSync(join(delta, f)).mode & 0o777, 0o600, f);

    const tables = JSON.parse(readFileSync(join(delta, 'tables.json'), 'utf8'));
    const sizes = Object.fromEntries(Object.entries(tables).filter(([, rows]) => rows.length).map(([t, rows]) => [t, rows.length]));
    assert.deepEqual(sizes, { customers: 1, deepdive_log: 2 });
    assert.deepEqual(Object.keys(tables), [...TABLES]);
    const users = validateImport(JSON.parse(readFileSync(join(delta, 'identities.json'), 'utf8')), 11);
    assert.ok(users.some((u) => u.id === LATE.id));

    // the delta moves onto the target that already took the step 4 export: every count now matches the source's
    const counts = JSON.parse(readFileSync(join(delta, 'counts.json'), 'utf8'));
    const pool = new pg.Pool({ connectionString: target.url, max: 1 });
    try {
      const client = await pool.connect();
      let built;
      try { built = buildTablesData(tables, await targetColumns(client)); } finally { client.release(); }
      const moved = await moveTables(pool, built.data, true);
      for (const c of moved.tables) {
        assert.equal(c.rows, sizes[c.table] ?? 0, c.table);
        assert.equal(c.after, counts.tables[c.table], c.table);
      }
    } finally { await pool.end(); }
  } finally { rmSync(delta, { recursive: true, force: true }); }

  // no new user: no identities.json
  ok(source.psql(`DELETE FROM auth.users WHERE id = '${LATE.id}';`));
  const quiet = mkdtempSync(join(tmpdir(), 'export-delta-'));
  try {
    const out = run('export', '--since', dir, '--out', quiet);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /No new users: no identities\.json/);
    assert.deepEqual(readdirSync(quiet).sort(), ['counts.json', 'tables.json']);
  } finally { rmSync(quiet, { recursive: true, force: true }); }
});

test('export --since: a row changed or removed in place stops it for a person, names and counts only (GRE-3902)', { skip }, () => {
  const ok = (r) => assert.equal(r.status, 0, r.stderr);
  ok(source.psql(`BEGIN; SET LOCAL session_replication_role = replica;
    UPDATE customers SET name = 'Northwind Renamed' WHERE slug = 'northwind';
    DELETE FROM deepdive_log WHERE id = (SELECT min(id) FROM deepdive_log);
    UPDATE auth.users SET encrypted_password = '${LATE.hash}' WHERE id = '${USERS[2].id}';
    COMMIT;`, 'postgres'));
  const delta = mkdtempSync(join(tmpdir(), 'export-delta-'));
  try {
    const out = run('export', '--since', dir, '--out', delta);
    assert.equal(out.status, 1, 'a changed row did not stop the catch-up');
    assertNoValues(out.stdout + out.stderr);
    assert.match(out.stdout, /Changed since the earlier export: customers \(1\)/);
    assert.match(out.stdout, /Removed since the earlier export: deepdive_log \(1\)/);
    assert.match(out.stdout, /Changed since the earlier export: auth\.users \(1\)/);
    assert.match(out.stdout, /Stopped for a person: nothing written/);
    assert.deepEqual(readdirSync(delta), []);
  } finally { rmSync(delta, { recursive: true, force: true }); }
});

test('export --since: an unreadable earlier export is refused without quoting it (GRE-3902)', { skip }, () => {
  const bad = mkdtempSync(join(tmpdir(), 'export-since-bad-'));
  const out = mkdtempSync(join(tmpdir(), 'export-delta-'));
  try {
    writeFileSync(join(bad, 'tables.json'), `{"customers": [{"name": "Northwind Exported"`);
    writeFileSync(join(bad, 'identities.json'), '[]');
    const r = run('export', '--since', bad, '--out', out);
    assert.equal(r.status, 1);
    assertNoValues(r.stdout + r.stderr);
    assert.match(r.stderr, /--since needs the earlier export's tables\.json and identities\.json/);
    assert.deepEqual(readdirSync(out), []);
  } finally { rmSync(bad, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
});

test('counts: writes nothing and names what would be left behind', { skip }, () => {
  const ok = (r) => assert.equal(r.status, 0, r.stderr);
  ok(source.psql(`INSERT INTO storage.buckets (id, name) VALUES ('t', 't') ON CONFLICT DO NOTHING;
    INSERT INTO storage.objects (bucket_id, name) VALUES ('t', 'file.pdf');
    UPDATE auth.users SET encrypted_password = NULL WHERE id = '${USERS[9].id}';`));
  const out = run('counts');
  assert.equal(out.status, 0, out.stderr);
  assertNoValues(out.stdout);
  assert.match(out.stdout, /Users with no password: 1/);
  assert.match(out.stdout, /Stored files: 1/);
  const fresh = mkdtempSync(join(tmpdir(), 'export-refuse-'));
  try {
    const refused = run('export', '--out', fresh);
    assert.equal(refused.status, 1, 'an export with problems exited 0');
  } finally { rmSync(fresh, { recursive: true, force: true }); }
});

test('a failed connect or a bad URL prints no part of SUPABASE_DB_URL (GRE-3863)', { skip }, () => {
  const marker = 'leakmarker7f3a';
  const urls = [
    source.url.replace(/^postgres:\/\/[^@]+@/, `postgres://${marker}_role:${marker}_pw@`), // role does not exist
    source.url.replace('/netlifydb?', `/${marker}_db?`), // database does not exist
    `postgres://${marker}_role:${marker}_pw@[${marker}`, // the URL itself does not parse
  ];
  for (const url of urls) for (const command of ['counts', 'export']) {
    const out = spawnSync(process.execPath, [SCRIPT, command, '--out', dir], {
      encoding: 'utf8', timeout: 20_000, env: { ...process.env, SUPABASE_DB_URL: url },
    });
    assert.equal(out.status, 1, `${command} did not fail cleanly: ${out.signal ?? ''}`);
    assert.ok(!(out.stdout + out.stderr).includes(marker), `${command}: a SUPABASE_DB_URL part reached the output`);
    assert.match(out.stderr, /Export stopped: could not connect/);
  }
});

test('problems: rows outside TABLES and a missing source table are named', () => {
  const tables = Object.fromEntries(TABLES.map((t) => [t, 0]));
  assert.deepEqual(problems({ tables: { ...tables, audit_log: 4 }, authUsersNoPassword: 0, storageObjects: 0 }),
    ['Rows outside TABLES: audit_log (4)']);
  const { organisations, ...rest } = tables;
  assert.deepEqual(problems({ tables: { ...rest, audit_log: 0 }, authUsersNoPassword: 0, storageObjects: 0 }),
    ['Missing on the source: organisations']);
});
