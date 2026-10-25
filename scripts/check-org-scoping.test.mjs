// npm run org-scope:check (GRE-2623): run against throwaway migration dirs and against the real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'check-org-scoping.mjs');

function run(files, allow) {
  const dir = mkdtempSync(join(tmpdir(), 'orgscope-'));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  const allowFile = join(dir, 'allow.json');
  writeFileSync(allowFile, JSON.stringify(allow ?? {}));
  try {
    return spawnSync(process.execPath, [SCRIPT, dir, allowFile], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a table with org_id and one with customer_id both pass', () => {
  const r = run({
    '0001_a.sql': `CREATE TABLE orgs (id uuid, org_id uuid);
CREATE TABLE IF NOT EXISTS public.buys (id uuid, customer_id uuid REFERENCES customers(id));`,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 tables/);
});

test('a client-scoped table with neither column exits 1 and names the table', () => {
  const r = run({
    '0001_a.sql': `CREATE TABLE safe (id uuid, org_id uuid);
CREATE TABLE open_door (id uuid, name text);`,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /open_door: no org_id or customer_id column \(created in 0001_a\.sql\)/);
  assert.doesNotMatch(r.stderr, /\bsafe\b: /);
});

test('a later ADD COLUMN brings a table into scope; a later DROP COLUMN takes it out', () => {
  const added = run({
    '0001_a.sql': 'CREATE TABLE t1 (id uuid);',
    '0002_b.sql': 'ALTER TABLE t1 ADD COLUMN org_id uuid;',
  });
  assert.equal(added.status, 0, added.stderr);

  const dropped = run({
    '0001_a.sql': 'CREATE TABLE t1 (id uuid, org_id uuid);',
    '0002_b.sql': 'ALTER TABLE t1 DROP COLUMN org_id;',
  });
  assert.equal(dropped.status, 1);
  assert.match(dropped.stderr, /t1: no org_id or customer_id column/);
});

test('a password column outside customer_users/users fails; on customer_users it passes', () => {
  const bad = run({
    '0001_a.sql': 'CREATE TABLE shadow_accounts (id uuid, org_id uuid, email text, password_hash text);',
  });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /shadow_accounts: has a password\/password_hash column/);

  const ok = run({
    '0001_a.sql': `CREATE TABLE customer_users (id uuid, org_id uuid, customer_id uuid, email text);
CREATE TABLE users (id uuid, org_id uuid, email text);`,
  });
  assert.equal(ok.status, 0, ok.stderr);
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
  assert.match(r.stderr, /t1: no org_id or customer_id column/);
});

test('the real migrations pass', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
