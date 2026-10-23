// Portal MCP server, database side (GRE-1228; spec GRE-1227 revision 2, section 6; moved from supabase/tests in
// GRE-1795). Applies every Netlify migration to a throwaway real Postgres, as portal-rls.test.mjs does, with
// made-up data: two client companies, a person in each, a registered approver, and two MCP tokens (one scoped to client A, one to client B). Then calls
// the mcp_portal_* functions as anon (what the Netlify portal-mcp function uses) to prove: drafts work,
// publishing without John's approval is refused, a token never reaches another client, every write is audited
// with the agent and the run. Without the Postgres server binaries the suite is skipped (on CI it fails).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { startPostgres, skip, MIGRATIONS } from './lib/postgres.mjs';
import { createHash } from 'node:crypto';
import { createPortalMcp } from '../../supabase/functions/_shared/portal-mcp.mjs';


// ── made-up companies, people, agents and runs ────────────────────────────────────────────────
const ORG = '11111111-1111-4111-8111-111111111111';
const A = 'a0000000-0000-4000-8000-00000000000a';
const B = 'b0000000-0000-4000-8000-00000000000b';
const U = {
  approver: { sub: '00000000-0000-4000-8000-000000000001', email: 'approver@example.test' },
  a1: { sub: '00000000-0000-4000-8000-0000000000a1', email: 'person.one@client-a.example.test' },
  b1: { sub: '00000000-0000-4000-8000-0000000000b1', email: 'person.one@client-b.example.test' },
};
const AGENT = 'c0000000-0000-4000-8000-000000000001';
const AGENT2 = 'c0000000-0000-4000-8000-000000000002';
const RUN1 = 'f0000000-0000-4000-8000-000000000001';
const RUN2 = 'f0000000-0000-4000-8000-000000000002';
const CONFIRM = 'I confirm this is a made-up test sentence.';
const sha = (s) => createHash('sha256').update(s).digest('hex');

let db;
const TOK = {}; // { a, b } -> SHA-256 of the issued token, as the edge function sends it

const psql = (sql) => db.psql(sql);

/** Run sql in one transaction as a person, as 'anon', as 'service' (the service key), or as null (the owner). */
function as(who, sql) {
  let pre = '';
  if (who === 'anon') pre = 'SET LOCAL ROLE anon;';
  else if (who === 'mcp') pre = `SET LOCAL ROLE anon; SELECT set_config('request.jwt.claims', '{"role":"anon"}', true) \\g /dev/null\n`;
  else if (who === 'service') pre = 'SET LOCAL ROLE service_role;';
  else if (who === 'authenticated') pre = 'SET LOCAL ROLE authenticated;';
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
const q = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => `${q(JSON.stringify(v))}::jsonb`;
/** Call an mcp_portal_* function as anon with no subject and parse its jsonb answer. */
const call = (fn, ...args) => JSON.parse(ok('mcp', `SELECT ${fn}(${args.join(', ')});`));
const callRefused = (pattern, fn, ...args) => refused('mcp', `SELECT ${fn}(${args.join(', ')});`, pattern);

const draftFields = (over = {}) => ({
  kind: 'engagement_pack',
  title: 'Test pack',
  summary: 'Made-up summary',
  body: { sections: [{ id: 's1', title: 'Section one', html: '<p>Made-up text</p>' }] },
  demos: [{ label: 'Demo', url: 'https://demo.example.test/one', note: '', afterSection: 's1' }],
  action: 'accept',
  confirmation_text: CONFIRM,
  ...over,
});
const create = (tok, customer, fields = draftFields(), run = RUN1, agent = AGENT) =>
  call('mcp_portal_create_draft', q(tok), q(run), q(agent), q(customer), j(fields));
const auditOf = (doc) =>
  ok(null, `SELECT coalesce(jsonb_agg(jsonb_build_object('event', event, 'actor_kind', actor_kind, 'actor_id', actor_id,
              'run_id', run_id, 'detail', detail) ORDER BY at), '[]') FROM portal_audit WHERE document_id = '${doc}';`);

before(async () => {
  if (skip) return;
  db = startPostgres('portal-mcp');
  const run = (label, sql) => {
    const r = psql(sql);
    assert.equal(r.status, 0, `${label}: ${r.stderr}`);
    return r.stdout.trim();
  };
  // 003 (Supabase 0001) onwards expect the single org row that the real data brings; a made-up one here
  await db.migrate('003');
  run('org', `INSERT INTO organisations (id, slug, name) VALUES ('${ORG}', 'test-org', 'Test org');`);
  await db.migrate();
  run(
    'made-up data',
    `
    INSERT INTO auth.users (id, email) SELECT (u ->> 'sub')::uuid, u ->> 'email' FROM jsonb_each('${JSON.stringify(U)}'::jsonb) AS e(k, u);
    INSERT INTO users (org_id, email, full_name, role, auth_subject) VALUES
      ('${ORG}', '${U.approver.email}', 'Test Approver', 'owner', '${U.approver.sub}');
    INSERT INTO customers (id, org_id, slug, name) VALUES
      ('${A}', '${ORG}', 'test-client-a', 'Test Client A'),
      ('${B}', '${ORG}', 'test-client-b', 'Test Client B');
    INSERT INTO customer_users (org_id, customer_id, email, full_name, auth_subject) VALUES
      ('${ORG}', '${A}', '${U.a1.email}', 'Test A One', '${U.a1.sub}'),
      ('${ORG}', '${B}', '${U.b1.email}', 'Test B One', '${U.b1.sub}');
    INSERT INTO portal_approvers (auth_user_id, label) VALUES ('${U.approver.sub}', 'Test approver');
    `,
  );
  // the database owner issues the tokens (the deploy step in the how-to); the edge function sends their SHA-256
  TOK.a = sha(run('token a', `SELECT mcp_portal_issue_token('Test connection A', ARRAY['${A}']::uuid[]);`));
  TOK.b = sha(run('token b', `SELECT mcp_portal_issue_token('Test connection B', ARRAY['${B}']::uuid[]);`));
});

after(() => db?.stop());

// ── tokens ────────────────────────────────────────────────────────────────────────────────────

test('a token is shown once; the database keeps only its SHA-256', { skip }, () => {
  assert.equal(ok(null, `SELECT count(*) FROM mcp_tokens WHERE token_sha256 IN ('${TOK.a}', '${TOK.b}');`), '2');
  assert.equal(ok(null, `SELECT count(*) FROM mcp_tokens WHERE token_sha256 !~ '^[0-9a-f]{64}$';`), '0');
});

test('an unknown token is refused by every tool', { skip }, () => {
  const bad = q('0'.repeat(64));
  callRefused(/invalid or revoked token/, 'mcp_portal_list_clients', bad);
  callRefused(/invalid or revoked token/, 'mcp_portal_list_documents', bad, q(A));
  callRefused(/invalid or revoked token/, 'mcp_portal_client_activity', bad, q(A));
  callRefused(/invalid or revoked token/, 'mcp_portal_create_draft', bad, q(RUN1), q(AGENT), q(A), j(draftFields()));
});

test('no API role can read the token tables or issue a token; signed-in users cannot call the tools', { skip }, () => {
  for (const who of ['service', 'anon', 'mcp', 'authenticated', 'approver', 'a1']) {
    refused(who, 'SELECT count(*) FROM mcp_tokens;', /permission denied/);
    refused(who, 'SELECT count(*) FROM mcp_token_clients;', /permission denied/);
    refused(who, `SELECT mcp_portal_issue_token('x', ARRAY['${A}']::uuid[]);`, /permission denied/);
    refused(who, `SELECT mcp_portal_add_client('${A}', '${B}');`, /permission denied/);
  }
  for (const who of ['service', 'anon', 'mcp']) {
    for (const helper of [`mcp_portal_token('${TOK.a}')`, 'mcp_portal_done()', `mcp_portal_doc_json('${A}')`,
                          `mcp_portal_revoke_token('${A}')`, `mcp_portal_remove_client('${A}', '${B}')`])
      refused(who, `SELECT ${helper};`, /permission denied/);
  }
  for (const who of ['authenticated', 'approver', 'a1']) {
    refused(who, `SELECT mcp_portal_list_clients('${TOK.a}');`, /permission denied/);
    refused(who, `SELECT mcp_portal_create_draft('${TOK.a}', '${RUN1}', '${AGENT}', '${A}', '{}'::jsonb);`, /permission denied/);
  }
});

// ── scope: a token never reaches another client ───────────────────────────────────────────────

test('list_clients shows only the clients the token is scoped to', { skip }, () => {
  assert.deepEqual(call('mcp_portal_list_clients', q(TOK.a)), [{ customer_id: A, name: 'Test Client A' }]);
  assert.deepEqual(call('mcp_portal_list_clients', q(TOK.b)), [{ customer_id: B, name: 'Test Client B' }]);
});

test('cross-client access is refused: create, list, read, change, attach, submit and activity', { skip }, () => {
  const docB = create(TOK.b, B, draftFields({ title: 'Test pack B' }));
  // same answer as a client or document that does not exist, so nothing leaks
  callRefused(/client not found/, 'mcp_portal_create_draft', q(TOK.a), q(RUN1), q(AGENT), q(B), j(draftFields()));
  callRefused(/client not found/, 'mcp_portal_list_documents', q(TOK.a), q(B));
  callRefused(/client not found/, 'mcp_portal_client_activity', q(TOK.a), q(B));
  callRefused(/document not found/, 'mcp_portal_get_document', q(TOK.a), q(docB.id));
  callRefused(/document not found/, 'mcp_portal_update_draft', q(TOK.a), q(RUN1), q(AGENT), q(docB.id), docB.row_version, j({ title: 'Taken over' }));
  callRefused(/document not found/, 'mcp_portal_set_file', q(TOK.a), q(RUN1), q(AGENT), q(docB.id), q(`${B}/${docB.id}/x.pdf`), q('a'.repeat(64)));
  callRefused(/document not found/, 'mcp_portal_request_publish', q(TOK.a), q(RUN1), q(AGENT), q(docB.id), docB.row_version);
  // a new version cannot be started in another client's series
  callRefused(/series not found/, 'mcp_portal_create_draft', q(TOK.a), q(RUN1), q(AGENT), q(A), j(draftFields({ series: docB.series })));
  // B's draft is untouched, and its audit has only B's own creation
  assert.equal(call('mcp_portal_get_document', q(TOK.b), q(docB.id)).title, 'Test pack B');
  assert.deepEqual(JSON.parse(auditOf(docB.id)).map((r) => r.event), ['draft_created']);
});

test('a revoked token, or a client taken out of its scope, is refused at once', { skip }, () => {
  const tok = sha(ok(null, `SELECT mcp_portal_issue_token('Test temporary', ARRAY['${A}', '${B}']::uuid[]);`));
  const id = ok(null, `SELECT id FROM mcp_tokens WHERE token_sha256 = '${tok}';`);
  assert.equal(call('mcp_portal_list_clients', q(tok)).length, 2);
  ok(null, `SELECT mcp_portal_remove_client('${id}', '${B}');`);
  assert.deepEqual(call('mcp_portal_list_clients', q(tok)).map((c) => c.customer_id), [A]);
  callRefused(/client not found/, 'mcp_portal_list_documents', q(tok), q(B));
  ok(null, `SELECT mcp_portal_revoke_token('${id}');`);
  callRefused(/invalid or revoked token/, 'mcp_portal_list_clients', q(tok));
});

// ── drafts work, and every write is audited ───────────────────────────────────────────────────

let doc; // client A's pack, written by the agent through MCP

test('an agent creates a draft; the client cannot see it; the audit names the agent and the run', { skip }, () => {
  doc = create(TOK.a, A);
  assert.equal(doc.status, 'draft');
  assert.equal(doc.customer_id, A);
  assert.equal(doc.created_by_kind, 'agent');
  assert.equal(doc.version, 1);
  assert.equal(ok('a1', `SELECT count(*) FROM portal_documents WHERE id = '${doc.id}';`), '0');
  const [row] = JSON.parse(auditOf(doc.id));
  assert.equal(row.event, 'draft_created');
  assert.equal(row.actor_kind, 'agent');
  assert.equal(row.actor_id, AGENT);
  assert.equal(row.run_id, RUN1);
  assert.equal(row.detail.via, 'mcp');
  assert.match(row.detail.token_id, /^[0-9a-f-]{36}$/);
});

test('an agent updates its draft with the row_version it read; a stale one is refused', { skip }, () => {
  const updated = call('mcp_portal_update_draft', q(TOK.a), q(RUN2), q(AGENT2), q(doc.id), doc.row_version, j({ summary: 'Changed by a second run' }));
  assert.equal(updated.summary, 'Changed by a second run');
  assert.equal(updated.title, doc.title); // fields not given stay as they were
  callRefused(/changed since you read it/, 'mcp_portal_update_draft', q(TOK.a), q(RUN2), q(AGENT2), q(doc.id), doc.row_version, j({ summary: 'Stale' }));
  doc = updated;
  const rows = JSON.parse(auditOf(doc.id));
  assert.deepEqual(rows.map((r) => r.event), ['draft_created', 'draft_updated']);
  // the update is recorded against the run and agent that made it, not the ones that created the draft
  assert.equal(rows[1].actor_id, AGENT2);
  assert.equal(rows[1].run_id, RUN2);
});

test('writes need a run and an agent, and only content fields can be set', { skip }, () => {
  callRefused(/run_id and agent_id/, 'mcp_portal_create_draft', q(TOK.a), 'NULL', q(AGENT), q(A), j(draftFields()));
  callRefused(/run_id and agent_id/, 'mcp_portal_update_draft', q(TOK.a), q(RUN1), 'NULL', q(doc.id), doc.row_version, j({ title: 'x' }));
  callRefused(/cannot be set here: status/, 'mcp_portal_create_draft', q(TOK.a), q(RUN1), q(AGENT), q(A), j(draftFields({ status: 'published' })));
  callRefused(/cannot be set here: content_sha256, status/, 'mcp_portal_update_draft', q(TOK.a), q(RUN1), q(AGENT), q(doc.id), doc.row_version, j({ status: 'published', content_sha256: 'a'.repeat(64) }));
  callRefused(/cannot be set here: customer_id/, 'mcp_portal_update_draft', q(TOK.a), q(RUN1), q(AGENT), q(doc.id), doc.row_version, j({ customer_id: B }));
  // 0037's own checks still hold: https demos only
  callRefused(/portal_demos_valid|check/, 'mcp_portal_update_draft', q(TOK.a), q(RUN1), q(AGENT), q(doc.id), doc.row_version, j({ demos: [{ label: 'x', url: 'javascript:alert(1)' }] }));
});

test('an agent attaches the designed PDF of its draft, only under that document', { skip }, () => {
  const fileSha = 'b'.repeat(64);
  callRefused(/under this document/, 'mcp_portal_set_file', q(TOK.a), q(RUN1), q(AGENT), q(doc.id), q(`${A}/other/x.pdf`), q(fileSha));
  const withFile = call('mcp_portal_set_file', q(TOK.a), q(RUN1), q(AGENT), q(doc.id), q(`${A}/${doc.id}/pack.pdf`), q(fileSha));
  assert.equal(withFile.pdf_sha256, fileSha);
  doc = withFile;
  assert.equal(JSON.parse(auditOf(doc.id)).at(-1).event, 'draft_updated');
});

test('a new version of a document is started in the same series', { skip }, () => {
  const v2 = create(TOK.a, A, draftFields({ series: doc.series, title: 'Test pack, version 2' }));
  assert.equal(v2.series, doc.series);
  assert.equal(v2.version, 2);
});

// ── publishing needs John ─────────────────────────────────────────────────────────────────────

let fingerprint;

test('request publish submits the draft for approval and returns its fingerprint; the client still sees nothing', { skip }, () => {
  const pending = call('mcp_portal_request_publish', q(TOK.a), q(RUN1), q(AGENT), q(doc.id), doc.row_version);
  assert.equal(pending.status, 'pending_approval');
  assert.match(pending.content_sha256, /^[0-9a-f]{64}$/);
  fingerprint = pending.content_sha256;
  assert.equal(ok(null, `SELECT portal_content_hash(d) FROM portal_documents d WHERE id = '${doc.id}';`), fingerprint);
  assert.equal(ok('a1', `SELECT count(*) FROM portal_documents WHERE id = '${doc.id}';`), '0');
  const last = JSON.parse(auditOf(doc.id)).at(-1);
  assert.equal(last.event, 'submitted_for_approval');
  assert.equal(last.actor_kind, 'agent');
  assert.equal(last.detail.content_sha256, fingerprint);
  // frozen while it waits: the agent cannot change it or submit it again
  callRefused(/only a draft can be changed/, 'mcp_portal_update_draft', q(TOK.a), q(RUN1), q(AGENT), q(doc.id), pending.row_version, j({ title: 'Sneaky edit' }));
  callRefused(/only a draft can be submitted/, 'mcp_portal_request_publish', q(TOK.a), q(RUN1), q(AGENT), q(doc.id), pending.row_version);
  doc = pending;
});

test('publishing without John is refused: the service key, a direct update, and inside an MCP write', { skip }, () => {
  refused('service', `SELECT portal_approve_and_publish('${doc.id}', '${fingerprint}');`, /only the registered approver/);
  refused('mcp', `SELECT portal_approve_and_publish('${doc.id}', '${fingerprint}');`, /permission denied/);
  refused('mcp', `UPDATE portal_documents SET status = 'published' WHERE id = '${doc.id}';`, /permission denied/);
  refused('service', `UPDATE portal_documents SET status = 'published' WHERE id = '${doc.id}';`, /only through portal_approve_and_publish/);
  refused('service', `INSERT INTO portal_approvals (org_id, customer_id, document_id, content_sha256, approver_user_id)
                      VALUES ('${ORG}', '${A}', '${doc.id}', '${fingerprint}', '${U.approver.sub}');`, /permission denied/);
  // even with the MCP actor settings of a write in place
  refused('service', `SELECT set_config('portal.mcp_agent', '${AGENT}', true), set_config('portal.mcp_run', '${RUN1}', true);
                      UPDATE portal_documents SET status = 'published' WHERE id = '${doc.id}';`, /only through portal_approve_and_publish/);
  assert.equal(call('mcp_portal_get_document', q(TOK.a), q(doc.id)).status, 'pending_approval');
  assert.equal(ok('a1', `SELECT count(*) FROM portal_documents WHERE id = '${doc.id}';`), '0');
});

test('after John approves this fingerprint, the client sees it, accepts it, and the agent reads the acceptance', { skip }, () => {
  ok('approver', `SELECT portal_approve_and_publish('${doc.id}', '${fingerprint}');`);
  assert.equal(ok('a1', `SELECT status FROM portal_documents WHERE id = '${doc.id}';`), 'published');
  // a published version is fixed for the agent too
  callRefused(/only a draft can be changed/, 'mcp_portal_update_draft', q(TOK.a), q(RUN1), q(AGENT), q(doc.id), doc.row_version + 1, j({ title: 'After publish' }));
  ok('a1', `SELECT portal_accept('${doc.id}', 'Test Person', 'Test Title', true);`);
  const { acceptances } = call('mcp_portal_client_activity', q(TOK.a), q(A));
  assert.equal(acceptances.length, 1);
  const [a] = acceptances;
  assert.equal(a.document_id, doc.id);
  assert.equal(a.action, 'accept');
  assert.equal(a.content_sha256, fingerprint);
  assert.equal(a.account_company_name, 'Test Client A');
  assert.equal(a.receipt_status, 'queued');
  assert.equal(a.signer_email, undefined); // least data: the agent does not get the signer's email
  // and client B's token sees none of it
  assert.deepEqual(call('mcp_portal_client_activity', q(TOK.b), q(B)).acceptances, []);
  assert.equal(call('mcp_portal_list_documents', q(TOK.b), q(B)).some((d) => d.id === doc.id), false);
});

test('every MCP write is in the audit with the agent and its run', { skip }, () => {
  const rows = JSON.parse(ok(null, `SELECT jsonb_agg(jsonb_build_object('actor_kind', actor_kind, 'actor_id', actor_id, 'run_id', run_id, 'event', event))
                                     FROM portal_audit WHERE detail ->> 'via' = 'mcp';`));
  assert.ok(rows.length >= 6);
  for (const r of rows) {
    assert.equal(r.actor_kind, 'agent');
    assert.ok([AGENT, AGENT2].includes(r.actor_id));
    assert.ok([RUN1, RUN2].includes(r.run_id));
  }
  // and writes that did not come through MCP are recorded as before (the approver's publish)
  const pub = JSON.parse(auditOf(doc.id)).find((r) => r.event === 'published');
  assert.equal(pub.actor_kind, 'staff');
  assert.equal(pub.actor_id, U.approver.sub);
});

// ── the MCP handler end to end, on this database ──────────────────────────────────────────────
// PostgREST calls a function with named parameters, so this drives the real handler with an rpc that does the same
// through psql, as anon without a subject: it proves the tools and the SQL signatures fit together.

function psqlRpc(fn, params) {
  const lit = (v) => (v === null || v === undefined ? 'NULL'
    : typeof v === 'number' ? String(v)
    : typeof v === 'object' ? `${q(JSON.stringify(v))}::jsonb` : q(v));
  const args = Object.entries(params).map(([k, v]) => `${k} => ${lit(v)}`).join(', ');
  const r = psql(`\\set VERBOSITY verbose\nBEGIN;\nSET LOCAL ROLE anon;\nSELECT set_config('request.jwt.claims', '{"role":"anon"}', true) \\g /dev/null\nSELECT ${fn}(${args});\nCOMMIT;\n`);
  if (r.status === 0) return { data: JSON.parse(r.stdout.trim()), error: null };
  const m = /ERROR:\s+([0-9A-Z]{5}):\s+(.*)/.exec(r.stderr) || [];
  return { data: null, error: { code: m[1], message: m[2] || r.stderr } };
}

test('end to end: the MCP handler creates, changes, attaches, submits; another client stays out of reach', { skip }, async () => {
  const token = ok(null, `SELECT mcp_portal_issue_token('Test end to end', ARRAY['${A}']::uuid[]);`);
  const stored = [];
  const server = createPortalMcp({ rpc: async (fn, params) => psqlRpc(fn, params), upload: async (path, bytes) => { stored.push(path); return { error: null }; } });
  let id = 0;
  const post = async (method, params, auth = `Bearer ${token}`) => {
    const out = await server.handle({ method: 'POST', headers: new Headers({ authorization: auth }), text: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    return { status: out.status, json: JSON.parse(out.body) };
  };
  const tool = async (name, args) => (await post('tools/call', { name, arguments: args })).json.result;

  assert.equal((await post('initialize', { protocolVersion: '2025-06-18' })).status, 200);
  assert.equal((await post('initialize', {}, `Bearer gspm_${'0'.repeat(64)}`)).status, 401);
  assert.deepEqual((await tool('list_clients', {})).structuredContent.items, [{ customer_id: A, name: 'Test Client A' }]);

  const who = { run_id: RUN1, agent_id: AGENT };
  const created = await tool('create_draft', { customer_id: A, ...who, document: draftFields({ kind: 'gita', action: 'agree_in_principle', title: 'Test GITA via MCP' }) });
  assert.equal(created.isError, undefined, created.content[0].text);
  const d = created.structuredContent;
  assert.equal(d.status, 'draft');

  const changed = await tool('update_draft', { document_id: d.id, expected_row_version: d.row_version, ...who, changes: { summary: 'Changed via MCP' } });
  assert.equal(changed.structuredContent.summary, 'Changed via MCP');
  const stale = await tool('update_draft', { document_id: d.id, expected_row_version: d.row_version, ...who, changes: { summary: 'Stale' } });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /changed since you read it/);

  const pdf = Buffer.from('%PDF-1.7\nmade-up\n%%EOF').toString('base64');
  const attached = await tool('attach_pdf', { document_id: d.id, ...who, filename: 'gita.pdf', content_base64: pdf });
  assert.equal(attached.isError, undefined, attached.content[0].text);
  assert.equal(stored.length, 1);
  assert.ok(stored[0].startsWith(`${A}/${d.id}/`));

  const listed = (await tool('list_documents', { customer_id: A })).structuredContent.items.find((x) => x.id === d.id);
  const submitted = await tool('request_publish', { document_id: d.id, expected_row_version: listed.row_version, ...who });
  assert.equal(submitted.structuredContent.status, 'pending_approval');
  assert.match(submitted.structuredContent.next_step, /John/);
  assert.equal(ok('a1', `SELECT count(*) FROM portal_documents WHERE id = '${d.id}';`), '0');

  // client B: refused in the same words as something that does not exist
  const docB = JSON.parse(ok(null, `SELECT to_jsonb(d) FROM portal_documents d WHERE customer_id = '${B}' LIMIT 1;`));
  for (const [name, args, re] of [
    ['list_documents', { customer_id: B }, /client not found/],
    ['read_client_activity', { customer_id: B }, /client not found/],
    ['get_document', { document_id: docB.id }, /document not found/],
    ['create_draft', { customer_id: B, ...who, document: draftFields() }, /client not found/],
    ['attach_pdf', { document_id: docB.id, ...who, filename: 'x.pdf', content_base64: pdf }, /document not found/],
  ]) {
    const r = await tool(name, args);
    assert.equal(r.isError, true, name);
    assert.match(r.content[0].text, re, name);
  }
  assert.equal(stored.length, 1); // nothing was stored for client B

  // the audit holds each write with the agent and the run
  const events = JSON.parse(auditOf(d.id)).map((r) => `${r.event}:${r.actor_kind}:${r.run_id}`);
  assert.deepEqual(events, [
    `draft_created:agent:${RUN1}`, `draft_updated:agent:${RUN1}`, `draft_updated:agent:${RUN1}`, `submitted_for_approval:agent:${RUN1}`,
  ]);
});

// ── rollback (runs last) ──────────────────────────────────────────────────────────────────────

test('rollback removes 0038 and restores 0037\'s audit; 0038 applies again on top of itself', { skip }, () => {
  const anonGrant = `SELECT has_function_privilege('anon', 'mcp_portal_list_clients(text)', 'EXECUTE');`;
  assert.equal(ok(null, anonGrant), 't');
  ok(null, `\\i '${join(MIGRATIONS, '046_portal_mcp_anon/rollback.sql')}'`);
  assert.equal(ok(null, anonGrant), 'f');
  ok(null, `\\i '${join(MIGRATIONS, '046_portal_mcp_anon/migration.sql')}'`);
  assert.equal(ok(null, anonGrant), 't');
  const left = `SELECT count(*) FROM pg_class WHERE relname LIKE 'mcp\\_token%' AND relkind = 'r';
    SELECT count(*) FROM pg_proc WHERE proname LIKE 'mcp\\_portal\\_%';
    SELECT position('portal.mcp_agent' IN prosrc) > 0 FROM pg_proc WHERE proname = 'portal_documents_audit';`;
  assert.equal(ok(null, left), '2\n19\nt');
  ok(null, `\\i '${join(MIGRATIONS, '040_portal_mcp/rollback.sql')}'`);
  assert.equal(ok(null, left), '0\n0\nf');
  // the restored trigger still audits a staff write
  const before = ok(null, 'SELECT count(*) FROM portal_audit;');
  ok(null, `INSERT INTO portal_documents (org_id, customer_id, kind, title) VALUES ('${ORG}', '${A}', 'nda', 'After rollback');`);
  assert.equal(Number(ok(null, 'SELECT count(*) FROM portal_audit;')), Number(before) + 1);
  ok(null, `\\i '${join(MIGRATIONS, '040_portal_mcp/migration.sql')}'`);
  ok(null, `\\i '${join(MIGRATIONS, '040_portal_mcp/migration.sql')}'`);
  assert.equal(ok(null, left), '2\n19\nt');
  assert.equal(ok(null, anonGrant), 'f');
  ok(null, `\\i '${join(MIGRATIONS, '046_portal_mcp_anon/migration.sql')}'`);
  assert.equal(ok(null, anonGrant), 't');
});
