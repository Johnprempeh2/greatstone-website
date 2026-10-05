// npm run rls:check (GRE-803): run against throwaway migration dirs and against the real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { scanSql } from './check-rls.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'check-rls.mjs');

function run(files, allow) {
  const dir = mkdtempSync(join(tmpdir(), 'rlscheck-'));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  const allowFile = join(dir, 'allow.json');
  writeFileSync(allowFile, JSON.stringify(allow ?? {}));
  try {
    return spawnSync(process.execPath, [SCRIPT, dir, allowFile], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('direct form: a table enabled in a later migration passes', () => {
  const r = run({
    '0001_a.sql': 'CREATE TABLE things (id int);\nCREATE TABLE IF NOT EXISTS public.other (id int);',
    '0002_rls.sql': 'ALTER TABLE things ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.other ENABLE ROW LEVEL SECURITY;',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 tables/);
});

test('loop form: tables named in a DO $$ format(...%I ENABLE ROW LEVEL SECURITY) loop pass', () => {
  const r = run({
    '0028_dd.sql': `CREATE TABLE IF NOT EXISTS public.dd_plans (id int);
CREATE TABLE IF NOT EXISTS public.dd_log (id int);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dd_plans','dd_log']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;`,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(scanSql("DO $$ BEGIN FOREACH t IN ARRAY ARRAY['a'] LOOP EXECUTE format('REVOKE ALL ON public.%I FROM anon', t); END LOOP; END $$;").rls, []);
});

test('a table with no RLS exits 1 and names the table; comments and other schemas do not count', () => {
  const r = run({
    '0001_a.sql': `CREATE TABLE safe (id int);
CREATE TABLE open_door (id int);
CREATE TABLE private.elsewhere (id int);
ALTER TABLE safe ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE open_door ENABLE ROW LEVEL SECURITY;
/* ALTER TABLE open_door ENABLE ROW LEVEL SECURITY; */`,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /open_door: no row-level security \(created in 0001_a\.sql\)/);
  assert.doesNotMatch(r.stderr, /safe|elsewhere/);
});

test('a later DISABLE ROW LEVEL SECURITY undoes an earlier ENABLE', () => {
  const r = run({
    '0001_a.sql': 'CREATE TABLE t1 (id int);\nALTER TABLE t1 ENABLE ROW LEVEL SECURITY;',
    '0002_b.sql': 'ALTER TABLE t1 DISABLE ROW LEVEL SECURITY;',
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /t1: no row-level security/);
});

test('an allow-listed table passes; an allow-list entry with no reason fails', () => {
  const files = { '0001_a.sql': 'CREATE TABLE lookup_codes (id int);' };
  const ok = run(files, { lookup_codes: 'public reference data, no rows a visitor should not read' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /1 allow-listed/);
  const bad = run(files, { lookup_codes: ' ' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /lookup_codes: allow-list entry has no reason/);
});

test('the real migrations pass', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
