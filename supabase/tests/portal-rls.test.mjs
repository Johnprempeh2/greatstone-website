// Client portal data and security (GRE-1255, spec GRE-1227 section 5). Runs every migration on a throwaway
// local Postgres (supabase/seed/local-roles.sql + supabase/tests/supabase-shim.sql), adds made-up data (two
// client companies, people in each, an owner and an editor), then acts as each person to prove who can and
// cannot read and write. Needs the Postgres server binaries (initdb, pg_ctl, psql): found through PG_BIN,
// pg_config or /usr/lib/postgresql/<n>/bin. Without them the suite is skipped, and says so.
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
  owner: { sub: '00000000-0000-4000-8000-000000000001', email: 'owner@example.test' },
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

/** Run sql in one transaction as a person (or 'anon', or null for the database owner, like the service role). */
function as(who, sql) {
  let pre = '';
  if (who === 'anon') pre = 'SET LOCAL ROLE anon;';
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

const accept = (doc, ticked = true) => `SELECT portal_accept('${doc}', 'Test Person', 'Test Title', 'Test Company', ${ticked});`;

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
    INSERT INTO users (org_id, email, full_name, role, auth_subject) VALUES
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
    `,
  );
  // the owner publishes everything except A's draft (the owner path itself is asserted below)
  for (const d of [DOC.aSign, DOC.b]) ok('owner', `SELECT portal_publish('${d}', 'TEST-APPROVAL-1');`);
});

after(() => {
  if (!dir) return;
  spawnSync(join(BIN, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', 'stop'], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
});

// ── 4 and 5: publishing ───────────────────────────────────────────────────────────────────────

test('a non-owner cannot publish', { skip }, () => {
  refused('editor', `SELECT portal_publish('${DOC.a}', 'TEST-APPROVAL-2');`, /only the owner can publish/);
  refused('a1', `SELECT portal_publish('${DOC.a}', 'TEST-APPROVAL-2');`, /only the owner can publish/);
  refused('anon', `SELECT portal_publish('${DOC.a}', 'TEST-APPROVAL-2');`, /permission denied/);
  assert.equal(ok(null, `SELECT status FROM portal_documents WHERE id = '${DOC.a}';`), 'draft');
});

test('publish without an approval is refused', { skip }, () => {
  refused('owner', `SELECT portal_publish('${DOC.a}', '  ');`, /approval reference/);
  // staff cannot set status or the approval columns directly
  refused('editor', `UPDATE portal_documents SET status = 'published' WHERE id = '${DOC.a}';`, /row-level security|portal_publish/);
  refused('editor', `UPDATE portal_documents SET approval_ref = 'X' WHERE id = '${DOC.a}';`, /portal_publish/);
  // even the database owner (as the service role would) cannot publish around the function...
  refused(null, `UPDATE portal_documents SET status = 'published' WHERE id = '${DOC.a}';`, /portal_publish/);
  // ...nor, inside the function's own path, without the approval fields
  refused(
    null,
    `SELECT set_config('portal.via', 'on', true); UPDATE portal_documents SET status = 'published' WHERE id = '${DOC.a}';`,
    /recorded approval/,
  );
  refused(null, `INSERT INTO portal_documents (org_id, customer_id, kind, title, status) VALUES ('${ORG}', '${A}', 'nda', 'Sneaky', 'published');`, /starts as a draft/);
  assert.equal(ok(null, `SELECT status FROM portal_documents WHERE id = '${DOC.a}';`), 'draft');
});

test('the owner publishes, the approval is recorded and the audit gets a row', { skip }, () => {
  const sha = ok('owner', `SELECT portal_publish('${DOC.a}', 'TEST-APPROVAL-3');`);
  assert.match(sha, /^[0-9a-f]{64}$/);
  const row = ok(null, `SELECT status, approved_by, approval_ref, approved_at IS NOT NULL, content_sha256 FROM portal_documents WHERE id = '${DOC.a}';`);
  assert.equal(row, `published|${U.owner.sub}|TEST-APPROVAL-3|t|${sha}`);
  assert.equal(ok('owner', `SELECT actor_kind || ':' || event FROM portal_audit WHERE document_id = '${DOC.a}' ORDER BY at, event;`), 'agent:draft_created\nstaff:published');
});

// ── 1 and 2: what a client can read ───────────────────────────────────────────────────────────

test("client A reads A's published documents and not A's drafts", { skip }, () => {
  assert.equal(ok('a1', `SELECT title FROM portal_documents ORDER BY title;`), 'Test pack A\nTest terms A');
  assert.equal(ok('a1', `SELECT count(*) FROM portal_documents WHERE id = '${DOC.aDraft}';`), '0');
  assert.equal(ok('b1', `SELECT title FROM portal_documents;`), 'Test GITA B');
});

test("client A cannot read B's documents, acceptances or audit", { skip }, () => {
  ok('b1', accept(DOC.b));
  assert.equal(ok('b1', `SELECT count(*) FROM portal_acceptances;`), '1');
  assert.equal(ok('a1', `SELECT count(*) FROM portal_documents WHERE customer_id = '${B}' OR id = '${DOC.b}';`), '0');
  assert.equal(ok('a1', `SELECT count(*) FROM portal_acceptances WHERE customer_id = '${B}';`), '0');
  // no audit rows at all for a client, not even its own company's
  assert.equal(ok('a1', `SELECT count(*) FROM portal_audit;`), '0');
  assert.equal(ok('b1', `SELECT count(*) FROM portal_audit;`), '0');
  assert.ok(Number(ok('owner', `SELECT count(*) FROM portal_audit WHERE customer_id = '${B}';`)) >= 3);
});

test('an anonymous visitor reads nothing', { skip }, () => {
  refused('anon', `SELECT count(*) FROM portal_documents;`, /permission denied/);
  refused('anon', `SELECT count(*) FROM portal_acceptances;`, /permission denied/);
  refused('anon', `SELECT count(*) FROM portal_audit;`, /permission denied/);
  refused('anon', accept(DOC.a), /permission denied/);
});

// ── 1: accepting ──────────────────────────────────────────────────────────────────────────────

test("client A cannot accept B's document, or A's draft", { skip }, () => {
  refused('a1', accept(DOC.b), /document not found/);
  refused('a1', accept(DOC.aDraft), /document not found/);
  refused('a1', accept('d0000000-0000-4000-8000-000000000999'), /document not found/);
});

test('staff can never accept on a client’s behalf', { skip }, () => {
  refused('owner', accept(DOC.a), /only a signed-in client/);
  refused('editor', accept(DOC.a), /only a signed-in client/);
});

test('client A accepts A’s published document; the record and audit are right', { skip }, () => {
  refused('a1', accept(DOC.a, false), /must be ticked/);
  refused('a1', `SELECT portal_accept('${DOC.a}', ' ', 'Test Title', 'Test Company', true);`, /are needed/);
  const id = ok('a1', accept(DOC.a));
  assert.match(id, /^[0-9a-f-]{36}$/);
  const sha = ok(null, `SELECT content_sha256 FROM portal_documents WHERE id = '${DOC.a}';`);
  const rec = ok(
    'a1',
    `SELECT customer_id, document_version, content_sha256, action, signer_email, auth_subject, confirmation_text, confirmed, customer_user_id IS NOT NULL FROM portal_acceptances WHERE id = '${id}';`,
  );
  assert.equal(rec, `${A}|1|${sha}|accept|${U.a1.email}|${U.a1.sub}|${CONFIRM}|t|t`);
  // another person in A sees the company's acceptance
  assert.equal(ok('a2', `SELECT count(*) FROM portal_acceptances WHERE id = '${id}';`), '1');
  assert.equal(ok('owner', `SELECT actor_kind || ':' || actor_id FROM portal_audit WHERE event = 'accepted' AND detail ->> 'acceptance_id' = '${id}';`), `client:${U.a1.sub}`);
  refused('a1', accept(DOC.a), /already accepted/);
});

test('a named signatory document is accepted only by that person', { skip }, () => {
  refused('a1', accept(DOC.aSign), /named signatory/);
  ok('a2', accept(DOC.aSign));
});

// ── 3: no direct writes ───────────────────────────────────────────────────────────────────────

test('no direct insert, update or delete on acceptances, for anyone', { skip }, () => {
  const ins = `INSERT INTO portal_acceptances (org_id, customer_id, document_id, document_version, content_sha256, action, signer_name, signer_title, signer_company, signer_email, auth_subject, confirmation_text, confirmed)
    SELECT org_id, customer_id, id, version, content_sha256, 'accept', 'X', 'X', 'X', 'x@example.test', '${U.a2.sub}', 'X', true FROM portal_documents WHERE id = '${DOC.a}';`;
  for (const who of ['a1', 'a2', 'owner', 'editor']) {
    refused(who, ins, /permission denied/);
    refused(who, `UPDATE portal_acceptances SET signer_name = 'Changed';`, /permission denied/);
    refused(who, `DELETE FROM portal_acceptances;`, /permission denied/);
  }
  // the database owner, as the service role would, is stopped by the append-only trigger
  refused(null, `UPDATE portal_acceptances SET signer_name = 'Changed';`, /append-only/);
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
  assert.equal(ok('owner', `SELECT event FROM portal_audit WHERE document_id = '${DOC.aDraft}' ORDER BY at, event;`), 'draft_created\ndraft_updated');
  refused('a1', `INSERT INTO portal_documents (customer_id, kind, title) VALUES ('${A}', 'nda', 'Client-made');`, /row-level security|null value/);
  refused('editor', `INSERT INTO portal_documents (customer_id, kind, title, demos) VALUES ('${A}', 'nda', 'Bad demo', '[{"label":"x","url":"javascript:alert(1)"}]');`, /check constraint/);
});

// ── versions, withdraw ────────────────────────────────────────────────────────────────────────

test('publishing a new version supersedes the old one; acceptances stay', { skip }, () => {
  const v2 = ok('editor', `INSERT INTO portal_documents (customer_id, kind, series, title, action, confirmation_text) VALUES ('${A}', 'engagement_pack', '${SERIES_A}', 'Test pack A v2', 'accept', '${CONFIRM}') RETURNING id;`);
  assert.equal(ok(null, `SELECT version FROM portal_documents WHERE id = '${v2}';`), '2');
  refused('editor', `INSERT INTO portal_documents (customer_id, kind, series, title) VALUES ('${B}', 'engagement_pack', '${SERIES_A}', 'Wrong client');`, /same client/);
  ok('owner', `SELECT portal_publish('${v2}', 'TEST-APPROVAL-4');`);
  assert.equal(ok(null, `SELECT status FROM portal_documents WHERE id = '${DOC.a}';`), 'superseded');
  assert.equal(ok('a1', `SELECT title FROM portal_documents WHERE series = '${SERIES_A}';`), 'Test pack A v2');
  assert.equal(ok('a1', `SELECT count(*) FROM portal_acceptances WHERE document_id = '${DOC.a}';`), '1');
  assert.equal(ok('owner', `SELECT count(*) FROM portal_audit WHERE document_id = '${DOC.a}' AND event = 'superseded';`), '1');
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

test('rollback refuses while acceptances exist, then removes 0037 cleanly, and 0037 applies again', { skip }, () => {
  const down = `\\i '${join(ROOT, 'supabase/rollback/0037_client_portal_down.sql')}'`;
  const left = `SELECT count(*) FROM pg_class WHERE relname LIKE 'portal\\_%' AND relkind = 'r';
    SELECT count(*) FROM pg_proc WHERE proname LIKE 'portal\\_%';
    SELECT count(*) FROM pg_policies WHERE policyname LIKE 'portal\\_files%';`;
  refused(null, down, /export them/);
  assert.equal(ok(null, left), '3\n11\n2');
  assert.equal(ok(null, `SET LOCAL portal.rollback_drop_acceptances = 'on';\n${down}\n${left}`), '0\n0\n0');
  ok(null, `\\i '${join(MIGRATIONS, '0037_client_portal.sql')}'\n`);
  assert.equal(ok(null, left), '3\n11\n2');
});
