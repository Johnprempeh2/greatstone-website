import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startPostgres, skip } from './lib/postgres.mjs';

const orgA = '11111111-1111-4111-8111-111111111111';
const orgB = '22222222-2222-4222-8222-222222222222';
const owner = '00000000-0000-4000-8000-0000000000a1';
const admin = '00000000-0000-4000-8000-0000000000a2';
const editor = '00000000-0000-4000-8000-0000000000a3';
const otherOwner = '00000000-0000-4000-8000-0000000000b1';
let db;

function runAs(subject, statement, currentOrg = orgA) {
  const claims = JSON.stringify({ sub: subject, email: 'staff@example.test', email_verified: true });
  return db.psql(`BEGIN;
    SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claims', '${claims}', true);
    SELECT set_config('app.current_org', '${currentOrg}', true);
    ${statement}
    COMMIT;`);
}

function sql(statement) {
  const result = db.psql(statement);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

before(async () => {
  if (skip) return;
  db = startPostgres('staff-user-writes');
  await db.migrate();
  sql(`INSERT INTO organisations(id,slug,name) VALUES
    ('${orgA}','staff-org-a','A'), ('${orgB}','staff-org-b','B');
    INSERT INTO users(org_id,email,role,auth_subject) VALUES
    ('${orgA}','owner-a@example.test','owner','${owner}'),
    ('${orgA}','admin-a@example.test','admin','${admin}'),
    ('${orgA}','editor-a@example.test','editor','${editor}'),
    ('${orgB}','owner-b@example.test','owner','${otherOwner}');`);
});
after(() => db?.stop());

test('an owner and an admin can provision staff only in their organisation', { skip }, () => {
  for (const [subject, email] of [[owner, 'new-owner@example.test'], [admin, 'new-admin@example.test']]) {
    const result = runAs(subject, `INSERT INTO users(org_id,email,role) VALUES ('${orgA}','${email}','viewer') RETURNING email;`);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(email));
  }
  assert.equal(sql(`SELECT count(*) FROM users WHERE email LIKE 'new-%@example.test'`), '2');
});

test('an editor cannot write users even with a caller-set organisation', { skip }, () => {
  const inserted = runAs(editor, `INSERT INTO users(org_id,email,role) VALUES ('${orgA}','editor-added@example.test','viewer');`);
  assert.notEqual(inserted.status, 0);
  assert.match(inserted.stderr, /row-level security/);
  const updated = runAs(editor, `UPDATE users SET full_name='Changed' WHERE auth_subject='${owner}' RETURNING id;`);
  assert.equal(updated.status, 0, updated.stderr);
  assert.equal(sql(`SELECT count(*) FROM users WHERE auth_subject='${owner}' AND full_name='Changed'`), '0');
  const deleted = runAs(editor, `DELETE FROM users WHERE auth_subject='${owner}' RETURNING id;`);
  assert.equal(deleted.status, 0, deleted.stderr);
  assert.equal(sql(`SELECT count(*) FROM users WHERE auth_subject='${owner}'`), '1');
});

test('owner cannot write across organisations or move a user into another organisation', { skip }, () => {
  const inserted = runAs(owner, `INSERT INTO users(org_id,email,role) VALUES ('${orgB}','cross-org@example.test','viewer');`, orgB);
  assert.notEqual(inserted.status, 0);
  assert.match(inserted.stderr, /row-level security/);
  const updated = runAs(owner, `UPDATE users SET full_name='Changed' WHERE auth_subject='${otherOwner}' RETURNING id;`, orgB);
  assert.equal(updated.status, 0, updated.stderr);
  assert.equal(sql(`SELECT count(*) FROM users WHERE auth_subject='${otherOwner}' AND full_name='Changed'`), '0');
  const moved = runAs(owner, `UPDATE users SET org_id='${orgB}' WHERE auth_subject='${editor}';`);
  assert.notEqual(moved.status, 0);
  assert.match(moved.stderr, /row-level security/);
  const deleted = runAs(owner, `DELETE FROM users WHERE auth_subject='${otherOwner}' RETURNING id;`, orgB);
  assert.equal(deleted.status, 0, deleted.stderr);
  assert.equal(sql(`SELECT count(*) FROM users WHERE auth_subject='${otherOwner}'`), '1');
});

test('inactive administrators cannot write users', { skip }, () => {
  sql(`UPDATE users SET is_active=false WHERE auth_subject='${admin}'`);
  const result = runAs(admin, `INSERT INTO users(org_id,email,role) VALUES ('${orgA}','inactive-added@example.test','viewer');`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /row-level security/);
});

test('anonymous role has no staff write grant', { skip }, () => {
  const result = db.psql(`BEGIN; SET LOCAL ROLE anon;
    SELECT set_config('request.jwt.claims', '{"sub":"${owner}"}', true);
    INSERT INTO users(org_id,email,role) VALUES ('${orgA}','anon-added@example.test','viewer'); COMMIT;`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /permission denied/);
});
