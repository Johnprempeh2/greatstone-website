// Client portal data and security (GRE-1255, spec GRE-1227 revision 2, section 5). Runs every migration on a
// throwaway local Postgres (supabase/seed/local-roles.sql + supabase/tests/supabase-shim.sql), adds made-up data
// (two client companies, people in each, a registered approver, an owner who is not one, and an editor), then
// acts as each person to prove who can and cannot read and write. Needs the Postgres server binaries (initdb,
// pg_ctl, psql): found through PG_BIN, pg_config or /usr/lib/postgresql/<n>/bin. Without them the suite is
// skipped, and says so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');

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

// ── made-up people and companies ──────────────────────────────────────────────────────────────
const ORG = '11111111-1111-4111-8111-111111111111';
const A = 'a0000000-0000-4000-8000-00000000000a';
const B = 'b0000000-0000-4000-8000-00000000000b';
const U = {
  approver: { sub: '00000000-0000-4000-8000-000000000001', email: 'approver@example.test' }, // owner, registered
  owner: { sub: '00000000-0000-4000-8000-000000000003', email: 'owner@example.test' }, // owner, NOT registered
  editor: { sub: '00000000-0000-4000-8000-000000000002', email: 'editor@example.test' },
  a1: { sub: '00000000-0000-4000-8000-0000000000a1', email: 'person.one@client-a.example.test' },
  a2: { sub: '00000000-0000-4000-8000-0000000000a2', email: 'person.two@client-a.example.test' },
  b1: { sub: '00000000-0000-4000-8000-0000000000b1', email: 'person.one@client-b.example.test' },
};
const DOC = {
  a: 'd0000000-0000-4000-8000-0000000000a1', // A, accept, published in the tests
  aDraft: 'd0000000-0000-4000-8000-0000000000a2', // A, stays a draft
  aSign: 'd0000000-0000-4000-8000-0000000000a3', // A, named signatory a2
  b: 'd0000000-0000-4000-8000-0000000000b1', // B, published
};
const SERIES_A = 'e0000000-0000-4000-8000-0000000000a1';
const CONFIRM = 'I confirm this is a made-up test sentence.';
const ZERO_SHA = '0'.repeat(64);

let dir;
let sock;
let port;

function psql(sql) {
  return spawnSync(join(BIN, 'psql'), ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', sock, '-p', String(port), '-U', 'postgres', '-d', 'portal', '-f', '-'], {
    input: sql,
    encoding: 'utf8',
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
  });
}

/**
 * Run sql in one transaction as a person, as 'anon', as 'service' (the service key: service_role, no user), or
 * as null (the database owner).
 */
function as(who, sql) {
  let pre = '';
  if (who === 'anon') pre = 'SET LOCAL ROLE anon;';
  else if (who === 'service') pre = 'SET LOCAL ROLE service_role;';
  else if (who) pre = `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '${JSON.stringify(U[who])}', true) \\g /dev/null\n`;
  const r = psql(`BEGIN;\n${pre}\n${sql}\nCOMMIT;\n`);
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}

function ok(who, sql) {
  const r = as(who, sql);
  assert.ok(r.ok, `expected success as ${who}: ${r.err}`);
  return r.out;
}

function refused(who, sql, pattern) {
  const r = as(who, sql);
  assert.equal(r.ok, false, `expected refusal as ${who}, got: ${r.out}`);
  if (pattern) assert.match(r.err, pattern);
  return r.err;
}

const accept = (doc, ticked = true) => `SELECT portal_accept('${doc}', 'Test Person', 'Test Title', ${ticked});`;
const publish = (doc, sha, ref = null) => `SELECT portal_approve_and_publish('${doc}', '${sha}'${ref ? `, '${ref}'` : ''});`;
/** Staff submits a draft for approval; returns the fingerprint the database computed. */
const submit = (doc, who = 'editor') => ok(who, `UPDATE portal_documents SET status = 'pending_approval' WHERE id = '${doc}' RETURNING content_sha256;`);
const statusOf = (doc) => ok(null, `SELECT status FROM portal_documents WHERE id = '${doc}';`);

before(() => {
  if (!BIN) return;
  // a unix socket path must stay short, so prefer a short temp root
  const root = tmpdir().length < 60 ? tmpdir() : '/tmp';
  dir = mkdtempSync(join(root, 'portal-rls-'));
  sock = dir;
  port = 20000 + Math.floor(Math.random() * 20000);
  const init = spawnSync(join(BIN, 'initdb'), ['-D', join(dir, 'data'), '-U', 'postgres', '-A', 'trust'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const start = spawnSync(
    join(BIN, 'pg_ctl'),
    ['-D', join(dir, 'data'), '-w', '-l', join(dir, 'log'), '-o', `-p ${port} -k ${sock} -c listen_addresses=''`, 'start'],
    { encoding: 'utf8' },
  );
  assert.equal(start.status, 0, start.stderr);
  const create = spawnSync(join(BIN, 'psql'), ['-X', '-q', '-h', sock, '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-c', 'CREATE DATABASE portal'], { encoding: 'utf8' });
  assert.equal(create.status, 0, create.stderr);

  const run = (label, sql) => {
    const r = psql(sql);
    assert.equal(r.status, 0, `${label}: ${r.stderr}`);
  };
  const file = (p) => `\\i '${p.replace(/'/g, "''")}'\n`;
  run('setup', 'CREATE EXTENSION pgcrypto;\n' + file(join(ROOT, 'supabase/seed/local-roles.sql')) + file(join(ROOT, 'supabase/tests/supabase-shim.sql')));
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    run(f, file(join(MIGRATIONS, f)));
    // 0005 onwards expect the single org row that the real seed adds; a made-up one here
    if (f.startsWith('0001_')) run('org', `INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'test-org', 'Test org');`);
  }
  run(
    'made-up data',
    `
    INSERT INTO auth.users (id, email) SELECT (u ->> 'sub')::uuid, u ->> 'email' FROM jsonb_each('${JSON.stringify(U)}'::jsonb) AS e(k, u);
    INSERT INTO users (org_id, email, full_name, role, auth_subject) VALUES
      ('${ORG}', '${U.approver.email}', 'Test Approver', 'owner', '${U.approver.sub}'),
      ('${ORG}', '${U.owner.email}', 'Test Owner', 'owner', '${U.owner.sub}'),
      ('${ORG}', '${U.editor.email}', 'Test Editor', 'editor', '${U.editor.sub}');
    INSERT INTO customers (id, org_id, slug, name) VALUES
      ('${A}', '${ORG}', 'test-client-a', 'Test Client A'),
      ('${B}', '${ORG}', 'test-client-b', 'Test Client B');
    INSERT INTO customer_users (org_id, customer_id, email, full_name, auth_subject) VALUES
      ('${ORG}', '${A}', '${U.a1.email}', 'Test A One', '${U.a1.sub}'),
      ('${ORG}', '${A}', '${U.a2.email}', 'Test A Two', '${U.a2.sub}'),
      ('${ORG}', '${B}', '${U.b1.email}', 'Test B One', '${U.b1.sub}');
    INSERT INTO portal_documents (id, org_id, customer_id, kind, series, title, action, confirmation_text, created_by_kind, signatory_email) VALUES
      ('${DOC.a}', '${ORG}', '${A}', 'engagement_pack', '${SERIES_A}', 'Test pack A', 'accept', '${CONFIRM}', 'agent', NULL),
      ('${DOC.aDraft}', '${ORG}', '${A}', 'nda', DEFAULT, 'Test draft A', 'accept', '${CONFIRM}', 'staff', NULL),
      ('${DOC.aSign}', '${ORG}', '${A}', 'terms', DEFAULT, 'Test terms A', 'accept', '${CONFIRM}', 'staff', '${U.a2.email}'),
      ('${DOC.b}', '${ORG}', '${B}', 'gita', DEFAULT, 'Test GITA B', 'agree_in_principle', '${CONFIRM}', 'staff', NULL);
    -- John's deploy step, done here by the database owner: one registered approver
    INSERT INTO portal_approvers (auth_user_id, label) VALUES ('${U.approver.sub}', 'Test approver');
    `,
  );
  // the approver publishes everything except A's pack and A's draft (those paths are asserted below)
  for (const d of [DOC.aSign, DOC.b]) ok('approver', publish(d, submit(d)));
});

after(() => {
  if (!dir) return;
  spawnSync(join(BIN, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', 'stop'], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
});

// ── 4 and 5: submitting and publishing ────────────────────────────────────────────────────────

let shaA; // A's pack fingerprint as first submitted
let shaA2; // after it was edited and submitted again

test('submitting computes the fingerprint; a pending version is frozen; back to draft drops it', { skip }, () => {
  shaA = submit(DOC.a);
  assert.match(shaA, /^[0-9a-f]{64}$/);
  assert.equal(ok(null, `SELECT portal_content_hash(d) FROM portal_documents d WHERE id = '${DOC.a}';`), shaA);
  refused('editor', `UPDATE portal_documents SET title = 'Changed while pending' WHERE id = '${DOC.a}';`, /return it to draft/);
  refused('editor', `UPDATE portal_documents SET content_sha256 = '${ZERO_SHA}' WHERE id = '${DOC.a}';`, /set by the database/);
  refused('editor', `UPDATE portal_documents SET status = 'pending_approval', confirmation_text = NULL WHERE id = '${DOC.aDraft}';`, /confirmation text/);
  // a client never sees a pending version
  assert.equal(ok('a1', `SELECT count(*) FROM portal_documents WHERE id = '${DOC.a}';`), '0');
});

test('publishing is refused for anyone not registered as approver, including an owner', { skip }, () => {
  refused('owner', publish(DOC.a, shaA), /only the registered approver/);
  refused('editor', publish(DOC.a, shaA), /only the registered approver/);
  refused('a1', publish(DOC.a, shaA), /only the registered approver/);
  // the service key has no signed-in user
  refused('service', publish(DOC.a, shaA), /only the registered approver/);
  refused('anon', publish(DOC.a, shaA), /permission denied/);
  assert.equal(statusOf(DOC.a), 'pending_approval');
});

test('publishing is refused with a fingerprint that does not match', { skip }, () => {
  refused('approver', publish(DOC.a, ZERO_SHA), /fingerprint does not match/);
  refused('approver', `SELECT portal_approve_and_publish('${DOC.a}', NULL);`, /fingerprint does not match/);
  assert.equal(statusOf(DOC.a), 'pending_approval');
});

test('publishing is refused for the fingerprint seen before the draft was edited', { skip }, () => {
  ok('editor', `UPDATE portal_documents SET status = 'draft' WHERE id = '${DOC.a}';`);
  assert.equal(ok(null, `SELECT coalesce(content_sha256, 'none') FROM portal_documents WHERE id = '${DOC.a}';`), 'none');
  refused('approver', publish(DOC.a, shaA), /only a document waiting for approval/);
  ok('editor', `UPDATE portal_documents SET summary = 'Edited after submission' WHERE id = '${DOC.a}';`);
  shaA2 = submit(DOC.a);
  assert.notEqual(shaA2, shaA);
  refused('approver', publish(DOC.a, shaA), /fingerprint does not match/);
  assert.equal(statusOf(DOC.a), 'pending_approval');
});

test('publishing around the function is refused, even for the database owner', { skip }, () => {
  // staff: the update policy only covers draft and pending_approval
  refused('editor', `UPDATE portal_documents SET status = 'published' WHERE id = '${DOC.a}';`, /row-level security|portal_approve_and_publish/);
  refused('owner', `UPDATE portal_documents SET status = 'published' WHERE id = '${DOC.a}';`, /row-level security|portal_approve_and_publish/);
  // the database owner (and so the service role) is stopped by the guard trigger
  refused(null, `UPDATE portal_documents SET status = 'published' WHERE id = '${DOC.a}';`, /only through portal_approve_and_publish/);
  refused('service', `UPDATE portal_documents SET status = 'published' WHERE id = '${DOC.a}';`, /only through portal_approve_and_publish/);
  // ...and, even inside the function's own path, without an approval for this exact version: none, or B's
  refused(
    null,
    `SELECT set_config('portal.via', 'on', true); UPDATE portal_documents SET status = 'published' WHERE id = '${DOC.a}';`,
    /approval for this exact version/,
  );
  refused(
    null,
    `SELECT set_config('portal.via', 'on', true); UPDATE portal_documents SET status = 'published', approval_id = (SELECT id FROM portal_approvals WHERE document_id = '${DOC.b}') WHERE id = '${DOC.a}';`,
    /approval for this exact version|duplicate key/,
  );
  refused(null, `INSERT INTO portal_documents (org_id, customer_id, kind, title, status) VALUES ('${ORG}', '${A}', 'nda', 'Sneaky', 'published');`, /starts as a draft/);
  assert.equal(statusOf(DOC.a), 'pending_approval');
});

test('nobody reaches portal_approvers through the API; approvals are written only by the function', { skip }, () => {
  for (const who of ['approver', 'owner', 'editor', 'a1', 'service', 'anon']) {
    refused(who, `SELECT count(*) FROM portal_approvers;`, /permission denied/);
    refused(who, `INSERT INTO portal_approvers (auth_user_id, label) VALUES ('${U.owner.sub}', 'Me too');`, /permission denied/);
  }
  const ins = `INSERT INTO portal_approvals (org_id, customer_id, document_id, content_sha256, approver_user_id) VALUES ('${ORG}', '${A}', '${DOC.a}', '${shaA2}', '${U.approver.sub}');`;
  for (const who of ['approver', 'owner', 'editor', 'a1', 'service', 'anon']) refused(who, ins, /permission denied/);
  refused(null, `UPDATE portal_approvals SET content_sha256 = '${ZERO_SHA}';`, /append-only/);
  refused(null, `DELETE FROM portal_approvals;`, /append-only/);
  // staff read approvals; a client reads none
  assert.equal(ok('editor', `SELECT count(*) FROM portal_approvals;`), '2');
  assert.equal(ok('a1', `SELECT count(*) FROM portal_approvals;`), '0');
});

test('the registered approver publishes; the approval is recorded and audited', { skip }, () => {
  const approval = ok('approver', publish(DOC.a, shaA2, 'GSAM-TEST-REF'));
  assert.match(approval, /^[0-9a-f-]{36}$/);
  assert.equal(
    ok(null, `SELECT status, approval_id, published_at IS NOT NULL, content_sha256 FROM portal_documents WHERE id = '${DOC.a}';`),
    `published|${approval}|t|${shaA2}`,
  );
  assert.equal(
    ok(null, `SELECT document_id, content_sha256, approver_user_id, gsam_approval_ref FROM portal_approvals WHERE id = '${approval}';`),
    `${DOC.a}|${shaA2}|${U.approver.sub}|GSAM-TEST-REF`,
  );
  assert.equal(
    ok('owner', `SELECT actor_kind || ':' || event FROM portal_audit WHERE document_id = '${DOC.a}' ORDER BY at;`),
    [
      'agent:draft_created',
      'staff:submitted_for_approval',
      'staff:returned_to_draft',
      'staff:draft_updated',
      'staff:submitted_for_approval',
      'staff:approved',
      'staff:published',
    ].join('\n'),
  );
});

test('an approval is used once: the same document cannot be approved again', { skip }, () => {
  refused('approver', publish(DOC.a, shaA2), /already has an approval/);
  assert.equal(ok(null, `SELECT count(*) FROM portal_approvals WHERE document_id = '${DOC.a}';`), '1');
});

// ── 1 and 2: what a client can read ───────────────────────────────────────────────────────────

test("client A reads A's published documents and not A's drafts", { skip }, () => {
  assert.equal(ok('a1', `SELECT title FROM portal_documents ORDER BY title;`), 'Test pack A\nTest terms A');
  assert.equal(ok('a1', `SELECT count(*) FROM portal_documents WHERE id = '${DOC.aDraft}';`), '0');
  assert.equal(ok('b1', `SELECT title FROM portal_documents;`), 'Test GITA B');
});

test("client A cannot read B's documents, acceptances, receipt jobs or audit", { skip }, () => {
  ok('b1', accept(DOC.b));
  assert.equal(ok('b1', `SELECT count(*) FROM portal_acceptances;`), '1');
  assert.equal(ok('b1', `SELECT count(*) FROM portal_receipt_jobs;`), '1');
  assert.equal(ok('a1', `SELECT count(*) FROM portal_documents WHERE customer_id = '${B}' OR id = '${DOC.b}';`), '0');
  assert.equal(ok('a1', `SELECT count(*) FROM portal_acceptances WHERE customer_id = '${B}';`), '0');
  assert.equal(ok('a1', `SELECT count(*) FROM portal_receipt_jobs WHERE customer_id = '${B}';`), '0');
  // no audit rows at all for a client, not even its own company's
  assert.equal(ok('a1', `SELECT count(*) FROM portal_audit;`), '0');
  assert.equal(ok('b1', `SELECT count(*) FROM portal_audit;`), '0');
  assert.ok(Number(ok('owner', `SELECT count(*) FROM portal_audit WHERE customer_id = '${B}';`)) >= 5);
});

test('an anonymous visitor reads nothing', { skip }, () => {
  for (const t of ['portal_documents', 'portal_approvals', 'portal_acceptances', 'portal_receipt_jobs', 'portal_audit']) {
    refused('anon', `SELECT count(*) FROM ${t};`, /permission denied/);
  }
  refused('anon', accept(DOC.a), /permission denied/);
});

// ── 1: accepting ──────────────────────────────────────────────────────────────────────────────

test("client A cannot accept B's document, or A's draft", { skip }, () => {
  refused('a1', accept(DOC.b), /document not found/);
  refused('a1', accept(DOC.aDraft), /document not found/);
  refused('a1', accept('d0000000-0000-4000-8000-000000000999'), /document not found/);
});

test('staff can never accept on a client’s behalf', { skip }, () => {
  refused('approver', accept(DOC.a), /only a signed-in client/);
  refused('editor', accept(DOC.a), /only a signed-in client/);
});

test('client A accepts A’s published document; the record, receipt job and audit are right', { skip }, () => {
  refused('a1', accept(DOC.a, false), /must be ticked/);
  refused('a1', `SELECT portal_accept('${DOC.a}', ' ', 'Test Title', true);`, /are needed/);
  // 4b: there is no company parameter, so the browser cannot pass one
  refused('a1', `SELECT portal_accept('${DOC.a}', 'Test Person', 'Test Title', 'Some Other Company', true);`, /does not exist/);
  const id = ok('a1', accept(DOC.a));
  assert.match(id, /^[0-9a-f-]{36}$/);
  const rec = ok(
    'a1',
    `SELECT customer_id, document_version, content_sha256, action, signer_name, signer_title, account_company_name, signer_email, auth_subject, confirmation_text, confirmed, customer_user_id IS NOT NULL FROM portal_acceptances WHERE id = '${id}';`,
  );
  assert.equal(rec, `${A}|1|${shaA2}|accept|Test Person|Test Title|Test Client A|${U.a1.email}|${U.a1.sub}|${CONFIRM}|t|t`);
  // the receipt job was queued in the same transaction, and the client can read its state
  assert.equal(ok('a1', `SELECT status, attempts FROM portal_receipt_jobs WHERE acceptance_id = '${id}';`), 'queued|0');
  // another person in A sees the company's acceptance
  assert.equal(ok('a2', `SELECT count(*) FROM portal_acceptances WHERE id = '${id}';`), '1');
  assert.equal(
    ok('owner', `SELECT actor_kind || ':' || event FROM portal_audit WHERE detail ->> 'acceptance_id' = '${id}' ORDER BY at;`),
    'client:accepted\nsystem:receipt_queued',
  );
  refused('a1', accept(DOC.a), /already accepted/);
});

test('an acceptance without a receipt job cannot exist, whichever path wrote it', { skip }, () => {
  // even the database owner's direct insert gets its job from the trigger
  ok(null, `INSERT INTO portal_acceptances (org_id, customer_id, document_id, document_version, content_sha256, action, signer_name, signer_title, account_company_name, signer_email, auth_subject, confirmation_text, confirmed)
    SELECT org_id, customer_id, id, version, content_sha256, 'accept', 'X', 'X', 'Test Client A', 'x@example.test', 'direct-insert-test', 'X', true FROM portal_documents WHERE id = '${DOC.a}';`);
  assert.equal(ok(null, `SELECT count(*) FROM portal_acceptances a WHERE NOT EXISTS (SELECT 1 FROM portal_receipt_jobs j WHERE j.acceptance_id = a.id);`), '0');
});

test('a named signatory document is accepted only by that person', { skip }, () => {
  refused('a1', accept(DOC.aSign), /named signatory/);
  ok('a2', accept(DOC.aSign));
});

// ── 3: no direct writes ───────────────────────────────────────────────────────────────────────

test('no direct insert, update or delete on acceptances, for anyone', { skip }, () => {
  const ins = `INSERT INTO portal_acceptances (org_id, customer_id, document_id, document_version, content_sha256, action, signer_name, signer_title, account_company_name, signer_email, auth_subject, confirmation_text, confirmed)
    SELECT org_id, customer_id, id, version, content_sha256, 'accept', 'X', 'X', 'X', 'x@example.test', '${U.a2.sub}', 'X', true FROM portal_documents WHERE id = '${DOC.a}';`;
  for (const who of ['a1', 'a2', 'approver', 'editor']) {
    refused(who, ins, /permission denied/);
    refused(who, `UPDATE portal_acceptances SET signer_name = 'Changed';`, /permission denied/);
    refused(who, `DELETE FROM portal_acceptances;`, /permission denied/);
  }
  // the database owner, as the service role would, is stopped by the append-only trigger
  refused(null, `UPDATE portal_acceptances SET account_company_name = 'Changed';`, /append-only/);
  refused(null, `DELETE FROM portal_acceptances;`, /append-only/);
  refused(null, `DELETE FROM portal_audit;`, /append-only/);
  refused(null, `UPDATE portal_audit SET event = 'published';`, /append-only/);
  refused('owner', `INSERT INTO portal_audit (org_id, customer_id, actor_kind, event) VALUES ('${ORG}', '${A}', 'staff', 'published');`, /permission denied/);
});

test('a published document cannot be changed, by a client, staff or the database owner', { skip }, () => {
  ok('a1', `UPDATE portal_documents SET title = 'Changed' WHERE id = '${DOC.a}';`); // no policy: 0 rows
  ok('editor', `UPDATE portal_documents SET title = 'Changed' WHERE id = '${DOC.a}';`); // drafts only: 0 rows
  refused(null, `UPDATE portal_documents SET title = 'Changed' WHERE id = '${DOC.a}';`, /is fixed/);
  refused(null, `UPDATE portal_documents SET customer_id = '${B}' WHERE id = '${DOC.aDraft}';`, /do not change/);
  refused('a1', `DELETE FROM portal_documents WHERE id = '${DOC.a}';`, /permission denied/);
  refused(null, `DELETE FROM portal_documents WHERE id = '${DOC.a}';`, /append-only/);
  assert.equal(ok(null, `SELECT title FROM portal_documents WHERE id = '${DOC.a}';`), 'Test pack A');
});

test('staff edit drafts, and only for their own clients', { skip }, () => {
  ok('editor', `UPDATE portal_documents SET title = 'Test draft A, edited' WHERE id = '${DOC.aDraft}';`);
  assert.equal(ok(null, `SELECT title FROM portal_documents WHERE id = '${DOC.aDraft}';`), 'Test draft A, edited');
  assert.equal(ok('owner', `SELECT event FROM portal_audit WHERE document_id = '${DOC.aDraft}' ORDER BY at;`), 'draft_created\ndraft_updated');
  refused('a1', `INSERT INTO portal_documents (customer_id, kind, title) VALUES ('${A}', 'nda', 'Client-made');`, /row-level security|null value/);
  refused('editor', `INSERT INTO portal_documents (customer_id, kind, title, demos) VALUES ('${A}', 'nda', 'Bad demo', '[{"label":"x","url":"javascript:alert(1)"}]');`, /check constraint/);
});

// ── receipt jobs ──────────────────────────────────────────────────────────────────────────────

test('receipt jobs: clients read the state only; the worker sends; staff re-queue a failed one', { skip }, () => {
  const acc = ok('a1', `SELECT id FROM portal_acceptances WHERE document_id = '${DOC.a}' AND auth_subject = '${U.a1.sub}';`);
  const job = `portal_receipt_jobs WHERE acceptance_id = '${acc}'`;
  refused('a1', `SELECT last_error FROM ${job};`, /permission denied/);
  for (const who of ['a1', 'approver', 'editor']) {
    refused(who, `UPDATE ${job.replace('WHERE', "SET status = 'sent' WHERE")};`, /permission denied/);
    refused(who, `DELETE FROM ${job};`, /permission denied/);
  }
  refused('service', `INSERT INTO portal_receipt_jobs (org_id, customer_id, acceptance_id) VALUES ('${ORG}', '${A}', '${acc}');`, /permission denied/);
  refused('service', `DELETE FROM ${job};`, /permission denied/);
  // the worker (service role): claim, fail for good, staff re-queue, claim, send
  ok('service', `UPDATE portal_receipt_jobs SET status = 'sending', attempts = attempts + 1 WHERE acceptance_id = '${acc}';`);
  ok('service', `UPDATE portal_receipt_jobs SET status = 'failed', last_error = 'test provider error' WHERE acceptance_id = '${acc}';`);
  refused('a1', `SELECT portal_requeue_receipt('${acc}');`, /only staff/);
  ok('editor', `SELECT portal_requeue_receipt('${acc}');`);
  assert.equal(ok(null, `SELECT status, attempts, coalesce(last_error, 'none') FROM ${job};`), 'queued|0|none');
  ok('service', `UPDATE portal_receipt_jobs SET status = 'sending', attempts = attempts + 1 WHERE acceptance_id = '${acc}';`);
  ok('service', `UPDATE portal_receipt_jobs SET status = 'sent', sent_at = now(), provider_message_id = 'test-id' WHERE acceptance_id = '${acc}';`);
  // a sent job is never sent again
  refused('service', `UPDATE portal_receipt_jobs SET status = 'queued' WHERE acceptance_id = '${acc}';`, /cannot go from sent/);
  refused('editor', `SELECT portal_requeue_receipt('${acc}');`, /cannot be queued again/);
  assert.equal(ok('a1', `SELECT status FROM ${job};`), 'sent');
  assert.equal(
    ok('owner', `SELECT event FROM portal_audit WHERE detail ->> 'acceptance_id' = '${acc}' AND event LIKE 'receipt%' ORDER BY at;`),
    'receipt_queued\nreceipt_failed\nreceipt_requeued\nreceipt_sent',
  );
});

// ── versions, withdraw ────────────────────────────────────────────────────────────────────────

test('publishing a new version supersedes the old one; acceptances stay', { skip }, () => {
  const v2 = ok('editor', `INSERT INTO portal_documents (customer_id, kind, series, title, action, confirmation_text) VALUES ('${A}', 'engagement_pack', '${SERIES_A}', 'Test pack A v2', 'accept', '${CONFIRM}') RETURNING id;`);
  assert.equal(ok(null, `SELECT version FROM portal_documents WHERE id = '${v2}';`), '2');
  refused('editor', `INSERT INTO portal_documents (customer_id, kind, series, title) VALUES ('${B}', 'engagement_pack', '${SERIES_A}', 'Wrong client');`, /same client/);
  ok('approver', publish(v2, submit(v2)));
  assert.equal(statusOf(DOC.a), 'superseded');
  assert.equal(ok('a1', `SELECT title FROM portal_documents WHERE series = '${SERIES_A}';`), 'Test pack A v2');
  assert.equal(ok('a1', `SELECT count(*) FROM portal_acceptances WHERE document_id = '${DOC.a}' AND auth_subject = '${U.a1.sub}';`), '1');
  assert.equal(ok('owner', `SELECT count(*) FROM portal_audit WHERE document_id = '${DOC.a}' AND event = 'superseded';`), '1');
});

// ── 0039: approver check and the worker's claim (GRE-1256) ────────────────────────────────────

test('the receipt keeps the title of a superseded version, for its own company and staff only', { skip }, () => {
  const acc = ok('a1', `SELECT id FROM portal_acceptances WHERE document_id = '${DOC.a}' AND auth_subject = '${U.a1.sub}';`);
  assert.equal(statusOf(DOC.a), 'superseded');
  assert.equal(ok('a1', `SELECT count(*) FROM portal_documents WHERE id = '${DOC.a}';`), '0');
  const row = `SELECT title || '|' || version || '|' || status FROM portal_receipt_document('${acc}');`;
  assert.equal(ok('a1', row), 'Test pack A|1|superseded');
  assert.equal(ok('editor', row), 'Test pack A|1|superseded');
  assert.equal(ok('b1', row), '');
  refused('anon', row, /permission denied/);
});

test('portal_is_approver() answers for the caller only', { skip }, () => {
  assert.equal(ok('approver', 'SELECT portal_is_approver();'), 't');
  assert.equal(ok('owner', 'SELECT portal_is_approver();'), 'f');
  assert.equal(ok('a1', 'SELECT portal_is_approver();'), 'f');
  assert.equal(ok('service', 'SELECT portal_is_approver();'), 'f');
  refused('anon', 'SELECT portal_is_approver();', /permission denied/);
});

test('the worker claims a due job once, even with another worker holding it; stuck jobs go back', { skip }, async () => {
  const v2 = ok(null, `SELECT id FROM portal_documents WHERE series = '${SERIES_A}' AND status = 'published';`);
  const acc = ok('a1', `SELECT portal_accept('${v2}', 'Test Person', 'Test Title', true);`);
  const job = ok(null, `SELECT id FROM portal_receipt_jobs WHERE acceptance_id = '${acc}';`);
  const claim = `SELECT id || ':' || status || ':' || attempts FROM portal_claim_receipt_jobs(10) WHERE acceptance_id = '${acc}';`;
  for (const who of ['a1', 'editor', 'approver', 'anon']) refused(who, claim, /permission denied/);

  // a second session holds the row lock (as a worker mid-claim would); SKIP LOCKED passes over it
  const { spawn } = await import('node:child_process');
  const holder = spawn(join(BIN, 'psql'), ['-X', '-q', '-h', sock, '-p', String(port), '-U', 'postgres', '-d', 'portal', '-c',
    `BEGIN; SELECT 1 FROM portal_receipt_jobs WHERE id = '${job}' FOR UPDATE; SELECT pg_sleep(1.5); COMMIT;`]);
  const done = new Promise((res) => holder.on('exit', res));
  for (let i = 0; i < 50 && ok(null, "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%pg_sleep(1.5)%' AND pid <> pg_backend_pid();") === '0'; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(ok('service', claim), '');
  await done;
  assert.equal(ok('service', claim), `${job}:sending:1`);
  assert.equal(ok('service', claim), '', 'a claimed job is not claimed again');

  // a worker that died mid-send: after 10 minutes in 'sending' the job is queued again and claimed once more
  ok(null, `ALTER TABLE portal_receipt_jobs DISABLE TRIGGER portal_receipt_jobs_before_update;
    UPDATE portal_receipt_jobs SET updated_at = now() - interval '11 minutes' WHERE id = '${job}';
    ALTER TABLE portal_receipt_jobs ENABLE TRIGGER portal_receipt_jobs_before_update;`);
  assert.equal(ok('service', claim), `${job}:sending:2`);
  // a job due later is not claimed yet
  ok('service', `UPDATE portal_receipt_jobs SET status = 'queued', next_attempt_at = now() + interval '5 minutes' WHERE id = '${job}';`);
  assert.equal(ok('service', claim), '');
  assert.equal(
    ok('owner', `SELECT event FROM portal_audit WHERE detail ->> 'acceptance_id' = '${acc}' AND event LIKE 'receipt%' ORDER BY at;`),
    'receipt_queued\nreceipt_retry\nreceipt_retry',
  );
});

test('owner or admin withdraws; an editor or a client cannot', { skip }, () => {
  refused('editor', `SELECT portal_withdraw('${DOC.b}');`, /owner or admin/);
  refused('b1', `SELECT portal_withdraw('${DOC.b}');`, /owner or admin/);
  ok('owner', `SELECT portal_withdraw('${DOC.b}');`);
  assert.equal(ok('b1', `SELECT count(*) FROM portal_documents;`), '0');
  assert.equal(ok('b1', `SELECT count(*) FROM portal_acceptances;`), '1');
  refused('b1', accept(DOC.b), /document not found/);
});

// ── the bucket ────────────────────────────────────────────────────────────────────────────────

test('portal-files: private; staff write only under a draft; clients get nothing', { skip }, () => {
  assert.equal(ok(null, `SELECT public || ':' || array_to_string(allowed_mime_types, ',') FROM storage.buckets WHERE id = 'portal-files';`), 'false:application/octet-stream');
  ok('editor', `INSERT INTO storage.objects (bucket_id, name) VALUES ('portal-files', '${A}/${DOC.aDraft}/pack.pdf');`);
  refused('editor', `INSERT INTO storage.objects (bucket_id, name) VALUES ('portal-files', '${A}/${DOC.aSign}/pack.pdf');`, /row-level security/);
  refused('editor', `INSERT INTO storage.objects (bucket_id, name) VALUES ('portal-files', '${B}/${DOC.aDraft}/pack.pdf');`, /row-level security/);
  refused('a1', `INSERT INTO storage.objects (bucket_id, name) VALUES ('portal-files', '${A}/${DOC.aDraft}/x.pdf');`, /row-level security/);
  assert.equal(ok('a1', `SELECT count(*) FROM storage.objects WHERE bucket_id = 'portal-files';`), '0');
  assert.equal(ok('owner', `SELECT count(*) FROM storage.objects WHERE bucket_id = 'portal-files';`), '1');
});

// ── rollback (runs last: it removes everything above) ─────────────────────────────────────────

test('rollback refuses while acceptances exist, then removes 0039 and 0037 cleanly, and both apply again', { skip }, () => {
  const down38 = `\\i '${join(ROOT, 'supabase/rollback/0039_portal_receipt_worker_down.sql')}'`;
  assert.equal(ok(null, `${down38}\nSELECT count(*) FROM pg_proc WHERE proname IN ('portal_is_approver', 'portal_claim_receipt_jobs', 'portal_receipt_document');`), '0');
  const down = `\\i '${join(ROOT, 'supabase/rollback/0037_client_portal_down.sql')}'`;
  const left = `SELECT count(*) FROM pg_class WHERE relname LIKE 'portal\\_%' AND relkind = 'r';
    SELECT count(*) FROM pg_proc WHERE proname LIKE 'portal\\_%';
    SELECT count(*) FROM pg_policies WHERE policyname LIKE 'portal\\_files%';`;
  refused(null, down, /export them/);
  assert.equal(ok(null, left), '6\n15\n2');
  assert.equal(ok(null, `SET LOCAL portal.rollback_drop_acceptances = 'on';\n${down}\n${left}`), '0\n0\n0');
  ok(null, `\\i '${join(MIGRATIONS, '0037_client_portal.sql')}'\n`);
  assert.equal(ok(null, left), '6\n15\n2');
  // and the migration runs a second time on top of itself
  ok(null, `\\i '${join(MIGRATIONS, '0037_client_portal.sql')}'\n`);
  ok(null, `\\i '${join(MIGRATIONS, '0039_portal_receipt_worker.sql')}'\n\\i '${join(MIGRATIONS, '0039_portal_receipt_worker.sql')}'\n`);
  assert.equal(ok(null, left), '6\n18\n2');
});
