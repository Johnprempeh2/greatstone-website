// ComposeExplorer mapping in the database (GRE-3407, migration 059_compose_problems). Applies the migrations to a
// throwaway real Postgres (lib/postgres.mjs), then proves a guest can read the mapping but not change it, and that the
// generated seed replaces it cleanly with exactly what src/data/compose-problems.mjs says. Without the Postgres server
// binaries the suite is skipped, and says so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startPostgres, skip } from './lib/postgres.mjs';
import { problems } from '../../src/data/compose-problems.mjs';
import { SEED_PATH } from '../../scripts/gen-compose-seed.mjs';

let db;
const anon = (sql) => db.psql(`BEGIN;\nSET LOCAL ROLE anon;\n${sql}\nCOMMIT;\n`);
const pairs = (list) => list.flatMap((p) => p.services.map((s) => `${p.id}:${s}`)).sort();

before(async () => {
  if (skip) return;
  db = startPostgres('compose');
  await db.migrate();
});
after(() => db?.stop());

test('a guest reads the mapping the migration seeded', { skip }, () => {
  const r = anon('SELECT id FROM public.compose_problems ORDER BY sort;');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), problems.map((p) => p.id));
  const links = anon("SELECT problem_id || ':' || service_slug FROM public.compose_problem_services;");
  assert.deepEqual(links.stdout.trim().split('\n').sort(), pairs(problems));
});

test('a guest cannot change the mapping', { skip }, () => {
  for (const sql of [
    "INSERT INTO public.compose_problems (id, title) VALUES ('x', 'x');",
    "UPDATE public.compose_problems SET title = 'x';",
    'DELETE FROM public.compose_problem_services;',
  ]) {
    const r = anon(sql);
    assert.notEqual(r.status, 0, `anon should be refused: ${sql}`);
    assert.match(r.stderr, /permission denied/);
  }
});

test('the generated seed re-applies and matches the source', { skip }, () => {
  for (let i = 0; i < 2; i++) {
    const r = db.psql(readFileSync(SEED_PATH, 'utf8'));
    assert.equal(r.status, 0, r.stderr);
  }
  const placeholders = db.psql('SELECT id FROM public.compose_problems WHERE placeholder ORDER BY sort;');
  assert.deepEqual(placeholders.stdout.trim().split('\n'), problems.filter((p) => p.placeholder).map((p) => p.id));
  const links = db.psql("SELECT problem_id || ':' || service_slug FROM public.compose_problem_services;");
  assert.deepEqual(links.stdout.trim().split('\n').sort(), pairs(problems));
});
