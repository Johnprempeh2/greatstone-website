// Portal MCP server (GRE-1228): protocol, tools and input checks, with a fake database. The database side (scope,
// drafts only, audit, no publishing) is proved on Postgres in supabase/tests/portal-mcp.test.mjs. Run with `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createPortalMcp, checkSectionHtml, checkDocumentFields, safePdfName, fromBase64, sha256Hex, SECTION_TAGS, TOOLS,
  publicTools, PROTOCOL_VERSIONS, GENERAL_ERROR, KINDS,
} from './portal-mcp.mjs';
import { ALLOWED, DEMOTE } from '../../../src/lib/sanitize-html.mjs';

const TOKEN = 'gspm_' + 'ab'.repeat(32);
const TOKEN_SHA = createHash('sha256').update(TOKEN).digest('hex');
const CUSTOMER = 'a0000000-0000-4000-8000-00000000000a';
const DOC = 'd0000000-0000-4000-8000-0000000000a1';
const RUN = 'f0000000-0000-4000-8000-000000000001';
const AGENT = 'c0000000-0000-4000-8000-000000000001';
const PDF = Buffer.from('%PDF-1.7\nmade-up test file\n%%EOF');

const headers = (auth = `Bearer ${TOKEN}`) => new Headers(auth ? { authorization: auth } : {});

function fakeServer({ rpc, upload } = {}) {
  const calls = [];
  const uploads = [];
  const server = createPortalMcp({
    rpc: async (fn, params) => {
      calls.push({ fn, params });
      if (rpc) return rpc(fn, params);
      if (fn === 'mcp_portal_get_document') return { data: { id: DOC, customer_id: CUSTOMER, status: 'draft' }, error: null };
      return { data: { ok: true, fn, content_sha256: 'c'.repeat(64) }, error: null };
    },
    upload: async (path, bytes) => { uploads.push({ path, bytes }); return upload ? upload(path, bytes) : { error: null }; },
  });
  const post = async (msg, auth) => {
    const out = await server.handle({ method: 'POST', headers: headers(auth), text: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    return { ...out, json: out.body ? JSON.parse(out.body) : null };
  };
  const tool = async (name, args) => (await post({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } })).json.result;
  return { server, calls, uploads, post, tool };
}

// ── protocol ──────────────────────────────────────────────────────────────────────────────────

test('initialize checks the token and answers with the protocol version and tools capability', async () => {
  const { post, calls } = fakeServer();
  const r = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal(r.status, 200);
  assert.equal(r.json.result.protocolVersion, '2025-03-26');
  assert.deepEqual(r.json.result.capabilities, { tools: { listChanged: false } });
  assert.equal(r.json.result.serverInfo.name, 'greatstone-portal');
  assert.deepEqual(calls, [{ fn: 'mcp_portal_list_clients', params: { p_token_sha256: TOKEN_SHA } }]);
  const unknown = await post({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(unknown.json.result.protocolVersion, PROTOCOL_VERSIONS[0]);
});

test('no token, a malformed one, or a revoked one gets 401; only the SHA-256 reaches the database', async () => {
  const { post, calls } = fakeServer({ rpc: async () => ({ data: null, error: { code: '42501', message: 'invalid or revoked token' } }) });
  for (const auth of [null, 'Bearer nope', 'Basic ' + TOKEN, `Bearer ${TOKEN}x`]) {
    const r = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, auth);
    assert.equal(r.status, 401);
    assert.match(r.headers['www-authenticate'], /^Bearer/);
  }
  assert.equal(calls.length, 0);
  const revoked = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(revoked.status, 401);
  const call = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_clients', arguments: {} } });
  assert.equal(call.status, 401);
  for (const c of calls) {
    assert.equal(c.params.p_token_sha256, TOKEN_SHA);
    assert.ok(!JSON.stringify(c).includes(TOKEN));
  }
});

test('tools/list shows the tools without their database function names; there is no publish tool', async () => {
  const { post } = fakeServer();
  const r = await post({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  const names = r.json.result.tools.map((t) => t.name);
  assert.deepEqual(names, ['list_clients', 'list_documents', 'get_document', 'read_client_activity', 'create_draft', 'update_draft', 'attach_pdf', 'request_publish']);
  assert.ok(!names.some((n) => /^publish|approve/.test(n)));
  for (const t of r.json.result.tools) {
    assert.equal(t.rpc, undefined);
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(typeof t.description, 'string');
  }
  // every write tool asks for the run and the agent, for the audit
  for (const t of publicTools().filter((x) => !x.annotations.readOnlyHint)) {
    assert.ok(t.inputSchema.required.includes('run_id') && t.inputSchema.required.includes('agent_id'), t.name);
  }
});

test('notifications get 202 and no body; bad JSON, batches, unknown methods and GET are refused', async () => {
  const { post, server } = fakeServer();
  const n = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(n.status, 202);
  assert.equal(n.body, null);
  assert.equal((await post('{nope')).json.error.code, -32700);
  assert.equal((await post([{ jsonrpc: '2.0', id: 1, method: 'ping' }])).json.error.code, -32600);
  assert.equal((await post({ jsonrpc: '2.0', id: 1, method: 'resources/list' })).json.error.code, -32601);
  assert.deepEqual((await post({ jsonrpc: '2.0', id: 9, method: 'ping' })).json, { jsonrpc: '2.0', id: 9, result: {} });
  const get = await server.handle({ method: 'GET', headers: headers(), text: '' });
  assert.equal(get.status, 405);
});

// ── tools ─────────────────────────────────────────────────────────────────────────────────────

test('each tool calls its database function with the token hash and named parameters', async () => {
  const { tool, calls } = fakeServer();
  await tool('list_clients', {});
  await tool('list_documents', { customer_id: CUSTOMER });
  await tool('get_document', { document_id: DOC });
  await tool('read_client_activity', { customer_id: CUSTOMER });
  await tool('create_draft', { customer_id: CUSTOMER, run_id: RUN, agent_id: AGENT, document: { kind: 'gita', title: 'Test GITA' } });
  await tool('update_draft', { document_id: DOC, expected_row_version: 2, run_id: RUN, agent_id: AGENT, changes: { summary: 'x' } });
  await tool('request_publish', { document_id: DOC, expected_row_version: 3, run_id: RUN, agent_id: AGENT });
  assert.deepEqual(calls.map((c) => c.fn), [
    'mcp_portal_list_clients', 'mcp_portal_list_documents', 'mcp_portal_get_document', 'mcp_portal_client_activity',
    'mcp_portal_create_draft', 'mcp_portal_update_draft', 'mcp_portal_request_publish',
  ]);
  for (const c of calls) assert.equal(c.params.p_token_sha256, TOKEN_SHA);
  assert.deepEqual(calls[4].params, {
    p_token_sha256: TOKEN_SHA, p_run_id: RUN, p_agent_id: AGENT, p_customer_id: CUSTOMER, p_fields: { kind: 'gita', title: 'Test GITA' },
  });
  assert.equal(calls[5].params.p_expected_row_version, 2);
  assert.equal(calls[6].params.p_expected_row_version, 3);
});

test('request_publish says plainly that John still has to approve the fingerprint', async () => {
  const { tool } = fakeServer({ rpc: async () => ({ data: { id: DOC, status: 'pending_approval', content_sha256: 'e'.repeat(64) }, error: null }) });
  const r = await tool('request_publish', { document_id: DOC, expected_row_version: 1, run_id: RUN, agent_id: AGENT });
  assert.equal(r.isError, undefined);
  assert.equal(r.structuredContent.status, 'pending_approval');
  assert.match(r.structuredContent.next_step, new RegExp(`fingerprint ${'e'.repeat(64)}`));
  assert.match(r.structuredContent.next_step, /client sees nothing yet/);
  assert.match(r.structuredContent.next_step, /John/);
});

test('writes without a run or agent, with bad ids or unknown arguments are refused before the database', async () => {
  const { tool, calls } = fakeServer();
  const cases = [
    ['create_draft', { customer_id: CUSTOMER, agent_id: AGENT, document: { kind: 'gita', title: 'x' } }, /run_id is needed/],
    ['create_draft', { customer_id: CUSTOMER, run_id: 'run-1', agent_id: AGENT, document: { kind: 'gita', title: 'x' } }, /run_id must be a uuid/],
    ['update_draft', { document_id: DOC, run_id: RUN, agent_id: AGENT, changes: { title: 'x' } }, /expected_row_version/],
    ['get_document', { document_id: 'not-a-uuid' }, /document_id must be a uuid/],
    ['list_clients', { customer_id: CUSTOMER }, /unknown arguments: customer_id/],
    ['publish', {}, /unknown tool: publish/],
    ['create_draft', { customer_id: CUSTOMER, run_id: RUN, agent_id: AGENT, document: { kind: 'gita', title: 'x', status: 'published' } }, /cannot be set here: status/],
  ];
  for (const [name, args, re] of cases) {
    const r = await tool(name, args);
    assert.equal(r.isError, true, name);
    assert.match(r.content[0].text, re);
  }
  assert.equal(calls.length, 0);
});

test('database refusals reach the agent in their own words; anything else becomes a general line', async () => {
  const errors = [
    [{ code: 'P0002', message: 'client not found' }, 'client not found'],
    [{ code: '23514', message: 'only a draft can be changed (this one is published); a published document changes by a new version' }, /only a draft can be changed/],
    [{ code: '40001', message: 'the draft changed since you read it (row_version is now 4); read it again' }, /row_version is now 4/],
    [{ code: 'XX000', message: 'internal: relation secret_table at /var/lib' }, GENERAL_ERROR],
    [{ code: undefined, message: 'fetch failed' }, GENERAL_ERROR],
  ];
  for (const [error, expected] of errors) {
    const { tool } = fakeServer({ rpc: async () => ({ data: null, error }) });
    const r = await tool('list_documents', { customer_id: CUSTOMER });
    assert.equal(r.isError, true);
    if (expected instanceof RegExp) assert.match(r.content[0].text, expected);
    else assert.equal(r.content[0].text, expected);
  }
});

test('attach_pdf checks scope and draft in the database first, stores the PDF under the document, then records its hash', async () => {
  const { tool, calls, uploads } = fakeServer();
  const r = await tool('attach_pdf', { document_id: DOC, run_id: RUN, agent_id: AGENT, filename: '../Pack Final!.PDF', content_base64: PDF.toString('base64') });
  assert.equal(r.isError, undefined, r.content?.[0]?.text);
  const hash = createHash('sha256').update(PDF).digest('hex');
  assert.deepEqual(calls.map((c) => c.fn), ['mcp_portal_get_document', 'mcp_portal_set_file']);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].path, `${CUSTOMER}/${DOC}/${hash.slice(0, 12)}-pack-final-.pdf`);
  assert.deepEqual(Buffer.from(uploads[0].bytes), PDF);
  assert.equal(calls[1].params.p_path, uploads[0].path);
  assert.equal(calls[1].params.p_sha256, hash);
});

test('attach_pdf refuses a non-PDF, bad base64, another client\'s or a non-draft document, and says when storage fails', async () => {
  const base = { document_id: DOC, run_id: RUN, agent_id: AGENT, filename: 'x.pdf' };
  let s = fakeServer();
  assert.match((await s.tool('attach_pdf', { ...base, content_base64: Buffer.from('<html>').toString('base64') })).content[0].text, /must be a PDF/);
  assert.match((await s.tool('attach_pdf', { ...base, content_base64: 'not base64!' })).content[0].text, /base64/);
  assert.equal(s.uploads.length, 0);

  s = fakeServer({ rpc: async () => ({ data: null, error: { code: 'P0002', message: 'document not found' } }) });
  assert.match((await s.tool('attach_pdf', { ...base, content_base64: PDF.toString('base64') })).content[0].text, /document not found/);
  assert.equal(s.uploads.length, 0);

  s = fakeServer({ rpc: async () => ({ data: { id: DOC, customer_id: CUSTOMER, status: 'pending_approval' }, error: null }) });
  assert.match((await s.tool('attach_pdf', { ...base, content_base64: PDF.toString('base64') })).content[0].text, /only to a draft/);
  assert.equal(s.uploads.length, 0);

  s = fakeServer({ upload: async () => ({ error: { message: 'storage unavailable' } }) });
  const r = await s.tool('attach_pdf', { ...base, content_base64: PDF.toString('base64') });
  assert.match(r.content[0].text, /could not be stored just now.*draft is unchanged/);
  assert.deepEqual(s.calls.map((c) => c.fn), ['mcp_portal_get_document']);
});

// ── input checks ──────────────────────────────────────────────────────────────────────────────

test('section html: the reader\'s tags pass; scripts, handlers, styles and unsafe links are refused', () => {
  assert.deepEqual(checkSectionHtml('<h2>Known</h2><p class="marker-known">We <strong>know</strong> this. 3 &lt; 4.</p><ul><li><a href="https://example.test/a?b=1&amp;c=2">link</a></li></ul><br/><hr>'), []);
  assert.deepEqual(checkSectionHtml('<p><a href="mailto:dx@example.test">mail</a></p>'), []);
  const bad = [
    ['<script>alert(1)</script>', /<script> is not allowed/],
    ['<p onclick="x()">hi</p>', /onclick attribute/],
    ['<p style="color:red">hi</p>', /style attribute/],
    ['<a href="javascript:alert(1)">x</a>', /https:\/\/ or mailto:/],
    ['<a href="&#106;avascript:alert(1)">x</a>', /https:\/\/ or mailto:/],
    ['<a href=" https://x.test">x</a>', /https:\/\/ or mailto:/],
    ['<a href="http://x.test">x</a>', /https:\/\/ or mailto:/],
    ['<img src=x onerror=alert(1)>', /<img> is not allowed/],
    ['<svg><script>x</script></svg>', /<svg> is not allowed/],
    ['<iframe src="https://x.test"></iframe>', /<iframe> is not allowed/],
    ['<!-- hidden -->', /comments/],
    ['<p class="a:b">x</p>', /class may hold/],
    ['a <b c', /literal </],
    ['<p>x</p data-x>', /cannot have attributes/],
  ];
  for (const [html, re] of bad) assert.match(checkSectionHtml(html).join('; '), re, html);
});

test('the section tags are the portal reader\'s own (src/lib/sanitize-html.mjs), so nothing allowed here is stripped there', () => {
  for (const tag of SECTION_TAGS) assert.ok(ALLOWED.has(tag) || DEMOTE.has(tag), tag);
});

test('document fields: a full GITA passes; wrong kinds, demo links, sections and emails are named', () => {
  const gita = {
    kind: 'gita',
    title: 'Test GITA',
    summary: 'Made-up',
    body: { sections: [{ id: 'where-you-are', title: 'Where you are', html: '<p>Text</p>' }, { id: 'commercial', title: 'Commercial Perspective', html: '<p>Text</p>' }] },
    demos: [{ label: 'Demo', url: 'https://demo.example.test', note: 'Opens in a new tab', afterSection: 'where-you-are' }],
    action: 'agree_in_principle',
    confirmation_text: 'Made-up sentence.',
    signatory_email: 'person@client.example.test',
  };
  assert.deepEqual(checkDocumentFields(gita, 'create'), []);
  assert.deepEqual(checkDocumentFields({ summary: 'only this' }, 'update'), []);
  const p = (f, mode = 'create') => checkDocumentFields(f, mode).join('; ');
  assert.match(p({ ...gita, kind: 'journey_map' }), new RegExp(`kind must be one of: ${KINDS.join(', ')}`));
  assert.match(p({ ...gita, demos: [{ label: 'x', url: 'http://demo.example.test' }] }), /demo 1: url must be an https/);
  assert.match(p({ ...gita, demos: [{ label: 'x', url: 'javascript:alert(1)' }] }), /demo 1: url must be an https/);
  assert.match(p({ ...gita, body: { sections: [{ id: 'a', title: 'A', html: '<p>1</p>' }, { id: 'a', title: 'B', html: '<p>2</p>' }] } }), /id a is used twice/);
  assert.match(p({ ...gita, body: { sections: [{ id: 'a', title: 'A', html: '<script>x</script>' }] } }), /section 1: <script> is not allowed/);
  assert.match(p({ ...gita, body: { sections: [], extra: 1 } }), /body holds only sections/);
  assert.match(p({ ...gita, signatory_email: 'not an email' }), /signatory_email must be an email/);
  assert.match(p({ ...gita, title: '  ' }), /title cannot be empty/);
  assert.match(p({ ...gita, action: 'publish' }), /action must be one of/);
  assert.match(p({ kind: 'gita', title: 'x', series: 'x' }), /series must be a uuid/);
  assert.match(p({ kind: 'gita', title: 'x' }, 'update'), /cannot be set here: kind/);
  assert.match(p({}, 'update'), /at least one field/);
  assert.match(p({ title: null }, 'update'), /title is needed/);
});

test('helpers: pdf names, base64, sha256 and every tool has a database function', async () => {
  assert.equal(safePdfName('../../etc/passwd'), 'passwd.pdf');
  assert.equal(safePdfName('Engagement Pack v2.pdf'), 'engagement-pack-v2.pdf');
  assert.equal(safePdfName(''), 'document.pdf');
  assert.equal(fromBase64('***'), null);
  assert.deepEqual(Buffer.from(fromBase64(PDF.toString('base64'))), PDF);
  assert.equal(await sha256Hex('abc'), createHash('sha256').update('abc').digest('hex'));
  for (const t of TOOLS) assert.match(t.rpc, /^mcp_portal_/);
});
