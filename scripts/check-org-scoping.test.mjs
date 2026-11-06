// npm run org-scope:check (GRE-2623): run against throwaway migration dirs and against the real ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'check-org-scoping.mjs');
const ROOT = join(HERE, '..');

function run(files, allow) {
  const dir = mkdtempSync(join(tmpdir(), 'orgscope-'));
  for (const [name, sql] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, sql);
  }
  const allowFile = join(dir, 'allow.json');
  writeFileSync(allowFile, JSON.stringify(allow ?? {}));
  try {
    return spawnSync(process.execPath, [SCRIPT, dir, allowFile], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a table with customer_id passes; a table with only org_id does not (org_id is the Greatstone tenant, not the client)', () => {
  const r = run({
    '0001_a.sql': `CREATE TABLE orgs (id uuid, org_id uuid);
CREATE TABLE IF NOT EXISTS public.buys (id uuid, customer_id uuid REFERENCES customers(id));`,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /orgs: no customer_id column/);
  assert.doesNotMatch(r.stderr, /\bbuys\b: /);
});

test('a client-scoped table with neither column exits 1 and names the table', () => {
  const r = run({
    '0001_a.sql': `CREATE TABLE safe (id uuid, customer_id uuid);
CREATE TABLE open_door (id uuid, name text);`,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /open_door: no customer_id column \(created in 0001_a\.sql\)/);
  assert.doesNotMatch(r.stderr, /\bsafe\b: /);
});

test('a later ADD COLUMN brings a table into scope; a later DROP COLUMN takes it out', () => {
  const added = run({
    '0001_a.sql': 'CREATE TABLE t1 (id uuid);',
    '0002_b.sql': 'ALTER TABLE t1 ADD COLUMN customer_id uuid;',
  });
  assert.equal(added.status, 0, added.stderr);

  const dropped = run({
    '0001_a.sql': 'CREATE TABLE t1 (id uuid, customer_id uuid);',
    '0002_b.sql': 'ALTER TABLE t1 DROP COLUMN customer_id;',
  });
  assert.equal(dropped.status, 1);
  assert.match(dropped.stderr, /t1: no customer_id column/);
});

test('a password column outside customer_users/better_auth/users fails; on those it passes', () => {
  const bad = run({
    '0001_a.sql': 'CREATE TABLE shadow_accounts (id uuid, customer_id uuid, email text, password_hash text);',
  });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /shadow_accounts: has a password\/password_hash column/);

  const ok = run(
    {
      '0001_a.sql': `CREATE TABLE customer_users (id uuid, org_id uuid, customer_id uuid, email text);
CREATE TABLE users (id uuid, org_id uuid, email text);
CREATE SCHEMA better_auth;
CREATE TABLE better_auth."account" (id text, "userId" text, password text);`,
    },
    { users: 'staff, not client-scoped', 'better_auth.account': 'Better Auth, keyed by userId not customer_id' },
  );
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
});

test('an allow-listed table with no tenant column passes; an allow-list entry with no reason fails', () => {
  const files = { '0001_a.sql': 'CREATE TABLE lookup_codes (id uuid, code text);' };
  const good = run(files, { lookup_codes: 'global reference data shared by every org, no client data' });
  assert.equal(good.status, 0, good.stdout);
  assert.match(good.stdout, /1 allow-listed/);
  const bad = run(files, { lookup_codes: ' ' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /lookup_codes: allow-list entry has no reason/);
});

test('a column defined inside a CHECK(...) expression is not mistaken for a tenant column', () => {
  const r = run({
    '0001_a.sql': "CREATE TABLE t1 (id uuid, status text CHECK (status IN ('org_id', 'customer_id')));",
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /t1: no customer_id column/);
});

test('an empty migrations directory exits 1 instead of silently passing', () => {
  const r = run({});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /found 0 tables/);
});

test('one folder per migration (netlify/database/migrations layout): migration.sql is read, rollback.sql is not', () => {
  const r = run({
    '001_a/migration.sql': 'CREATE TABLE t1 (id uuid, customer_id uuid);',
    '001_a/rollback.sql': 'CREATE TABLE evil_if_read (id uuid);', // would fail the check if it were read
    '002_b/migration.sql': 'CREATE TABLE t2 (id uuid, customer_id uuid);',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2 tables/);
});

test('an explicit schema.table is tracked under that schema regardless of search_path', () => {
  const r = run({
    '0001_a.sql': `CREATE SCHEMA audit;
CREATE TABLE audit.log (id uuid, customer_id uuid);`,
  }, { 'audit.log': 'already carries customer_id, listed only to prove the schema-qualified key' });
  // audit.log carries customer_id directly, so it should pass without even needing the allow-list entry.
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /1 tables/);
});

test('SET LOCAL search_path puts later unqualified CREATE TABLEs in that schema, keyed as schema.table', () => {
  const r = run({
    '0001_a.sql': `CREATE SCHEMA interview;
SET LOCAL search_path TO interview, public;
CREATE TABLE engagement (id uuid, customer_id uuid);`,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /1 tables/);
});

test('the real supabase/migrations pass', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('the real netlify/database/migrations pass (the live website DB)', () => {
  const r = spawnSync(
    process.execPath,
    [SCRIPT, join(ROOT, 'netlify/database/migrations'), join(ROOT, 'scripts/org-scope-allow.netlify.json')],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /tables/);
});
