// Migration 0040 (GRE-970): the size band column on service_inquiries. Runs every migration on a throwaway local
// Postgres (as portal-rls.test.mjs does), then proves the column takes the band, refuses an over-long one, leaves
// RLS and the public rpc as they were, and that the rollback drops only the column and 0040 applies again.
// Needs the Postgres server binaries (PG_BIN, pg_config or /usr/lib/postgresql/<n>/bin); skipped without them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const UP = join(MIGRATIONS, '0040_service_inquiry_size_band.sql');
const DOWN = join(ROOT, 'supabase/rollback/0040_service_inquiry_size_band_down.sql');
const ORG = '11111111-1111-4111-8111-111111111111';

function findPgBin() {
  const ok = (d) => d && existsSync(join(d, 'initdb')) && existsSync(join(d, 'pg_ctl')) && existsSync(join(d, 'psql'));
  if (ok(process.env.PG_BIN)) return process.env.PG_BIN;
  const cfg = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  if (cfg.status === 0 && ok(cfg.stdout.trim())) return cfg.stdout.trim();
  const base = '/usr/lib/postgresql';
  if (existsSync(base)) {
    for (const v of readdirSync(base).sort((a, b) => Number(b) - Number(a))) if (ok(join(base, v, 'bin'))) return join(base, v, 'bin');
  }
  return null;
}

const BIN = findPgBin();
const skip = BIN ? false : 'Postgres server binaries not found (set PG_BIN)';
let dir;
let port;

const psql = (sql) => spawnSync(join(BIN, 'psql'), ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', String(port), '-U', 'postgres', '-d', 'enq', '-f', '-'], {
  input: sql, encoding: 'utf8', env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
});
const file = (p) => `\\i '${p.replace(/'/g, "''")}'\n`;
function ok(sql) {
  const r = psql(sql);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function refused(sql, pattern) {
  const r = psql(sql);
  assert.notEqual(r.status, 0, `expected refusal, got: ${r.stdout}`);
  if (pattern) assert.match(r.stderr, pattern);
}
const hasColumn = `SELECT count(*) FROM information_schema.columns WHERE table_name = 'service_inquiries' AND column_name = 'size_band';`;
const rlsState = `SELECT relrowsecurity::text || relforcerowsecurity::text FROM pg_class WHERE relname = 'service_inquiries';
  SELECT string_agg(policyname, ',' ORDER BY policyname) FROM pg_policies WHERE tablename = 'service_inquiries';
  SELECT has_table_privilege('anon', 'service_inquiries', 'SELECT')::text;`;

before(() => {
  if (!BIN) return;
  const root = tmpdir().length < 60 ? tmpdir() : '/tmp';
  dir = mkdtempSync(join(root, 'enq-0040-'));
  port = 20000 + Math.floor(Math.random() * 20000);
  assert.equal(spawnSync(join(BIN, 'initdb'), ['-D', join(dir, 'data'), '-U', 'postgres', '-A', 'trust'], { encoding: 'utf8' }).status, 0);
  const start = spawnSync(join(BIN, 'pg_ctl'), ['-D', join(dir, 'data'), '-w', '-l', join(dir, 'log'), '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, 'start'], { encoding: 'utf8' });
  assert.equal(start.status, 0, start.stderr);
  const create = spawnSync(join(BIN, 'psql'), ['-X', '-q', '-h', dir, '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-c', 'CREATE DATABASE enq'], { encoding: 'utf8' });
  assert.equal(create.status, 0, create.stderr);
  ok('CREATE EXTENSION pgcrypto;\n' + file(join(ROOT, 'supabase/seed/local-roles.sql')) + file(join(ROOT, 'supabase/tests/supabase-shim.sql')));
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    const r = psql(file(join(MIGRATIONS, f)));
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
    if (f.startsWith('0001_')) ok(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'test-org', 'Test org');`);
  }
});

after(() => {
  if (!dir) return;
  spawnSync(join(BIN, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', 'stop'], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
});

test('0040: the enquiry saves its size band; an over-long band is refused', { skip }, () => {
  assert.equal(ok(hasColumn), '1');
  ok(`INSERT INTO service_inquiries (org_id, contact_email, size_band, source) VALUES ('${ORG}', 'a@example.test', '11 to 50', 'contact');`);
  ok(`INSERT INTO service_inquiries (org_id, contact_email, source) VALUES ('${ORG}', 'b@example.test', 'contact');`);
  assert.equal(ok(`SELECT coalesce(size_band, '-') FROM service_inquiries ORDER BY contact_email;`), '11 to 50\n-');
  refused(`INSERT INTO service_inquiries (org_id, contact_email, size_band) VALUES ('${ORG}', 'c@example.test', '${'x'.repeat(41)}');`, /chk_inquiry_size_band/);
});

test('0040: RLS, grants and the public rpc are as they were', { skip }, () => {
  assert.equal(ok(rlsState), 'truetrue\nstaff_all\nfalse');
  refused(`SET ROLE anon; SELECT count(*) FROM service_inquiries;`, /permission denied/);
  // the services-basket rpc still works for a visitor, and leaves the band empty
  ok(`SET ROLE anon; SELECT submit_service_inquiry('[{"slug":"x"}]'::jsonb, 'Test', 'd@example.test');`);
  assert.equal(ok(`SELECT count(*) FROM service_inquiries WHERE contact_email = 'd@example.test' AND size_band IS NULL;`), '1');
});

test('rollback drops only the column (rows stay), and 0040 applies again, twice', { skip }, () => {
  ok(`BEGIN;\n${file(DOWN)}COMMIT;`);
  assert.equal(ok(hasColumn), '0');
  assert.equal(ok(`SELECT count(*) FROM service_inquiries;`), '3');
  assert.equal(ok(`SELECT count(*) FROM information_schema.columns WHERE table_name = 'service_inquiries' AND column_name IN ('attribution', 'industry', 'alert_sent_at');`), '3');
  assert.equal(ok(rlsState), 'truetrue\nstaff_all\nfalse');
  ok(file(UP) + file(UP));
  assert.equal(ok(hasColumn), '1');
});
