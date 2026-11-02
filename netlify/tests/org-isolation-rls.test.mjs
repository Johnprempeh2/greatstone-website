// The app.current_org policies are gone (GRE-3772, migration 062_drop_org_isolation). 004, 007 and 055 made
// org_isolation (and 004 org_self) with no TO clause, so they applied to anon too and trusted a GUC that any
// session can set. Nothing sets it, but if anything did, anon got the whole org. This sets it as anon on purpose
// and checks that anon still sees only the public catalogue and writes nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startPostgres, skip } from './lib/postgres.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const MIGRATION = new URL('../database/migrations/062_drop_org_isolation/', import.meta.url);
let db;
const owner = (sql) => {
  const r = db.psql(sql);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const anon = (sql) => db.psql(`BEGIN; SET LOCAL ROLE anon;
  SELECT set_config('request.jwt.claims', '{"role":"anon"}', true) \\g /dev/null
  SELECT set_config('app.current_org', '${ORG}', true) \\g /dev/null
  ${sql}
  COMMIT;`);
const count = (sql) => {
  const r = anon(sql);
  return r.status === 0 ? r.stdout.trim() : 'denied';
};
const GUC_POLICIES = `SELECT count(*) FROM pg_policies
  WHERE coalesce(qual, '') || coalesce(with_check, '') ~ '(app_current_org|app\\.current_org)';`;

before(async () => {
  if (skip) return;
  db = startPostgres('org-isolation-rls');
  await db.migrate('003');
  owner(`INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'test-org', 'Test org');`);
  await db.migrate();
  owner(`INSERT INTO customers (org_id, slug, name) VALUES ('${ORG}', 'co-a', 'Company A');
    INSERT INTO offerings (org_id, type, slug, name, status) VALUES
      ('${ORG}', 'service', 'test-published', 'Published', 'published'), ('${ORG}', 'service', 'test-draft', 'Draft', 'draft');`);
});

after(() => db?.stop());

test('no policy trusts app.current_org', { skip }, () => {
  assert.equal(owner(GUC_POLICIES), '0');
});

test('anon with app.current_org set still sees only public rows and writes nothing', { skip }, () => {
  assert.equal(count('SELECT count(*) FROM offerings;'), '1', 'only the published offering');
  for (const table of ['customers', 'customer_users', 'orders', 'audit_log', 'ai_actions', 'import_jobs', 'role_permissions'])
    assert.ok(['0', 'denied'].includes(count(`SELECT count(*) FROM ${table};`)), `${table} stays closed to anon`);
  assert.equal(count('SELECT count(*) FROM organisations;'), '0');
  const write = anon(`INSERT INTO categories (org_id, slug, name) VALUES ('${ORG}', 'anon-cat', 'Anon');`);
  assert.notEqual(write.status, 0, 'anon cannot add a category');
  const update = anon(`UPDATE offerings SET name = 'Changed' WHERE slug = 'test-published' RETURNING id;`);
  assert.ok(update.status !== 0 || update.stdout.trim() === '', 'anon cannot change an offering');
  assert.equal(owner(`SELECT name FROM offerings WHERE slug = 'test-published';`), 'Published');
});

test('the rollback puts the policies back and the migration runs again', { skip }, () => {
  owner(readFileSync(new URL('rollback.sql', MIGRATION), 'utf8'));
  assert.equal(owner(GUC_POLICIES), '29');
  owner(readFileSync(new URL('migration.sql', MIGRATION), 'utf8'));
  assert.equal(owner(GUC_POLICIES), '0');
});
