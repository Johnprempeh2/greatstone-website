// Portal MCP server (GRE-1228; spec GRE-1227 revision 2, section 6): the protocol, the tools and their input
// checks. The `portal-mcp` edge function wraps this with the service key; `node --test` runs the same code with a
// fake database. No MCP SDK: the server answers JSON-RPC over one POST (MCP "Streamable HTTP" with plain JSON
// responses), which is all a tools-only server needs, so there is no dependency to review.
//
// Security lives in the database (supabase/migrations/0038_portal_mcp.sql): every tool calls one mcp_portal_*
// function with the SHA-256 of the caller's token, and that function checks the token and its client scope.
// The checks here give agents clear errors early and keep unsafe HTML out of drafts (the reader sanitises again
// on render). There is no publish tool: request_publish only submits a draft for John's approval.

export const SERVER_INFO = { name: 'greatstone-portal', version: '1.0.0' };
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const TOKEN_RE = /^gspm_[0-9a-f]{64}$/;
export const MAX_BODY_BYTES = 30 * 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024; // the portal-files bucket allows 25 MB
export const MAX_PDF_CHUNK_BYTES = 2 * 1024 * 1024; // base64 JSON stays well below Netlify's 6 MB request limit

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;
export const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);

// The document kinds and actions of 0037 (portal_documents.kind / action).
export const KINDS = ['engagement_pack', 'nda', 'gita', 'terms', 'pre_read', 'north_star', 'investigation_plan', 'deep_dive', 'gdxp'];
export const ACTIONS = ['none', 'accept', 'agree_in_principle'];
export const LIMITS = { title: 200, summary: 2000, sections: 60, sectionTitle: 200, html: 100_000, demos: 20, label: 120, note: 500, confirmation: 1000 };

// ── section HTML ──────────────────────────────────────────────────────────────────────────────
// Section html may use only the tags the portal reader keeps (src/lib/sanitize-html.mjs ALLOWED, plus h2 to h4,
// which the reader demotes), links to https:// or mailto:, and a plain class. Anything else is refused, not
// rewritten, so the agent sees what to fix and the draft holds exactly what John approves.
export const SECTION_TAGS = new Set(['P', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'B', 'I', 'A', 'BR', 'BLOCKQUOTE', 'CODE', 'PRE', 'SPAN', 'HR']);
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>/g;
const ATTR_RE = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const SAFE_HREF = /^(https:\/\/[^\s"'<>\\]+|mailto:[^\s"'<>\\]+)$/;

/** Problems with one section's html, as sentences; empty when it is fine. */
export function checkSectionHtml(html) {
  if (typeof html !== 'string') return ['html must be a string'];
  const problems = [];
  if (/<!|<\?/.test(html)) problems.push('comments, doctype and processing instructions are not allowed');
  for (const m of html.matchAll(TAG_RE)) {
    const [, closing, name, rest] = m;
    const tag = name.toUpperCase();
    if (!SECTION_TAGS.has(tag)) { problems.push(`<${name.toLowerCase()}> is not allowed`); continue; }
    if (closing) { if (rest.trim()) problems.push(`</${name.toLowerCase()}> cannot have attributes`); continue; }
    for (const a of rest.replace(/\/\s*$/, '').matchAll(ATTR_RE)) {
      const attr = a[1].toLowerCase();
      const value = a[2] ?? a[3] ?? a[4];
      if (attr === 'href' && tag === 'A') {
        if (!SAFE_HREF.test(value || '')) problems.push('links must start with https:// or mailto:');
      } else if (attr === 'class') {
        if (!/^[a-z0-9 _-]*$/i.test(value || '')) problems.push('class may hold only letters, digits, - and _');
      } else {
        problems.push(`the ${attr} attribute is not allowed`);
      }
    }
  }
  if (html.replace(TAG_RE, '').includes('<')) problems.push('write a literal < as &lt;');
  return [...new Set(problems)];
}

// ── document fields ───────────────────────────────────────────────────────────────────────────

const CREATE_FIELDS = ['kind', 'series', 'title', 'summary', 'body', 'demos', 'action', 'confirmation_text', 'signatory_email'];
const UPDATE_FIELDS = CREATE_FIELDS.filter((f) => f !== 'kind' && f !== 'series');

const str = (v, max, name, problems, { required = false, nullable = false } = {}) => {
  if (v == null) {
    if (required || (v === null && !nullable)) problems.push(`${name} is needed`);
    return;
  }
  if (typeof v !== 'string') return problems.push(`${name} must be text`);
  if (required && !v.trim()) problems.push(`${name} cannot be empty`);
  if (v.length > max) problems.push(`${name} is ${max} characters at most`);
};

/** Problems with a document's fields (mode 'create' or 'update'); empty when they are fine. */
export function checkDocumentFields(fields, mode) {
  const problems = [];
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return ['document must be an object'];
  const allowed = mode === 'create' ? CREATE_FIELDS : UPDATE_FIELDS;
  const unknown = Object.keys(fields).filter((k) => !allowed.includes(k));
  if (unknown.length) problems.push(`these fields cannot be set here: ${unknown.sort().join(', ')}`);
  if (mode === 'update' && !Object.keys(fields).length) problems.push('give at least one field to change');
  const has = (k) => mode === 'create' || Object.prototype.hasOwnProperty.call(fields, k);

  if (mode === 'create' && !KINDS.includes(fields.kind)) problems.push(`kind must be one of: ${KINDS.join(', ')}`);
  if (mode === 'create' && fields.series != null && !isUuid(fields.series)) problems.push('series must be a uuid');
  if (has('title')) str(fields.title, LIMITS.title, 'title', problems, { required: true });
  if (has('summary')) str(fields.summary, LIMITS.summary, 'summary', problems, { nullable: true });
  if (has('confirmation_text')) str(fields.confirmation_text, LIMITS.confirmation, 'confirmation_text', problems, { nullable: true });
  if (has('action') && fields.action != null && !ACTIONS.includes(fields.action)) problems.push(`action must be one of: ${ACTIONS.join(', ')}`);
  if (has('signatory_email') && fields.signatory_email != null && fields.signatory_email !== ''
      && !(typeof fields.signatory_email === 'string' && EMAIL_RE.test(fields.signatory_email))) {
    problems.push('signatory_email must be an email address');
  }

  if (has('body') && fields.body != null) {
    const sections = fields.body?.sections;
    if (typeof fields.body !== 'object' || !Array.isArray(sections)) problems.push('body must be { sections: [...] }');
    else {
      const extra = Object.keys(fields.body).filter((k) => k !== 'sections');
      if (extra.length) problems.push(`body holds only sections (not ${extra.join(', ')})`);
      if (sections.length > LIMITS.sections) problems.push(`body has ${LIMITS.sections} sections at most`);
      const ids = new Set();
      sections.forEach((s, i) => {
        const at = `section ${i + 1}`;
        if (!s || typeof s !== 'object') return problems.push(`${at} must be { id, title, html }`);
        const extraKeys = Object.keys(s).filter((k) => !['id', 'title', 'html'].includes(k));
        if (extraKeys.length) problems.push(`${at} holds only id, title and html`);
        if (typeof s.id !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(s.id)) problems.push(`${at}: id must be 1 to 64 letters, digits, - or _`);
        else if (ids.has(s.id)) problems.push(`${at}: id ${s.id} is used twice`);
        else ids.add(s.id);
        str(s.title, LIMITS.sectionTitle, `${at} title`, problems, { required: true });
        if (typeof s.html !== 'string') problems.push(`${at}: html must be text`);
        else if (s.html.length > LIMITS.html) problems.push(`${at}: html is ${LIMITS.html} characters at most`);
        else for (const p of checkSectionHtml(s.html)) problems.push(`${at}: ${p}`);
      });
    }
  }

  if (has('demos') && fields.demos != null) {
    if (!Array.isArray(fields.demos)) problems.push('demos must be a list');
    else {
      if (fields.demos.length > LIMITS.demos) problems.push(`demos has ${LIMITS.demos} links at most`);
      fields.demos.forEach((d, i) => {
        const at = `demo ${i + 1}`;
        if (!d || typeof d !== 'object') return problems.push(`${at} must be { label, url, note, afterSection }`);
        const extraKeys = Object.keys(d).filter((k) => !['label', 'url', 'note', 'afterSection'].includes(k));
        if (extraKeys.length) problems.push(`${at} holds only label, url, note and afterSection`);
        str(d.label, LIMITS.label, `${at} label`, problems, { required: true });
        str(d.note, LIMITS.note, `${at} note`, problems, { nullable: true });
        if (d.afterSection != null && typeof d.afterSection !== 'string') problems.push(`${at}: afterSection must be a section id`);
        let ok = typeof d.url === 'string' && /^https:\/\/[^\s/]+/.test(d.url);
        try { ok = ok && new URL(d.url).protocol === 'https:'; } catch { ok = false; }
        if (!ok) problems.push(`${at}: url must be an https:// link`);
      });
    }
  }
  return problems;
}

/** A file name safe to use in a storage path: letters, digits, dot, dash and underscore, ending in .pdf. */
export function safePdfName(name) {
  const base = String(name || 'document.pdf').split(/[\\/]/).pop().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^[.-]+/, '').slice(0, 80) || 'document.pdf';
  return base.endsWith('.pdf') ? base : `${base}.pdf`;
}

/** Bytes from base64; null when it is not base64. */
export function fromBase64(s) {
  if (typeof s !== 'string' || !s || /[^A-Za-z0-9+/=\s]/.test(s)) return null;
  try {
    const bin = atob(s.replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── tools ─────────────────────────────────────────────────────────────────────────────────────

const uuid = { type: 'string', format: 'uuid' };
const WHO = {
  run_id: { ...uuid, description: 'Your GS Agentic Manager run id ($GSAM_RUN_ID). Recorded in the audit with every write.' },
  agent_id: { ...uuid, description: 'Your GS Agentic Manager agent id ($GSAM_AGENT_ID). Recorded in the audit with every write.' },
};
const section = {
  type: 'object',
  required: ['id', 'title', 'html'],
  properties: {
    id: { type: 'string', description: 'Short id, unique in the document (letters, digits, - and _).' },
    title: { type: 'string' },
    html: { type: 'string', description: 'Only p, h2-h6, ul, ol, li, strong, em, b, i, a (https:// or mailto:), br, blockquote, code, pre, span, hr; a plain class is allowed. No style, no scripts.' },
  },
  additionalProperties: false,
};
const docProps = {
  title: { type: 'string', maxLength: LIMITS.title },
  summary: { type: 'string', maxLength: LIMITS.summary },
  body: { type: 'object', properties: { sections: { type: 'array', items: section } }, required: ['sections'], additionalProperties: false },
  demos: {
    type: 'array',
    description: 'Demo links placed after a section of the document.',
    items: {
      type: 'object',
      required: ['label', 'url'],
      properties: { label: { type: 'string' }, url: { type: 'string', description: 'https:// only' }, note: { type: 'string' }, afterSection: { type: 'string' } },
      additionalProperties: false,
    },
  },
  action: { type: 'string', enum: ACTIONS, description: 'What the client is asked to do at the end: nothing, accept, or agree in principle (GITA).' },
  confirmation_text: { type: ['string', 'null'], description: "The checkbox sentence, copied word for word from Harbor's approved wording. Needed before approval when action is not none." },
  signatory_email: { type: ['string', 'null'], description: 'Optional: the one person at the client who must act.' },
};

export const TOOLS = [
  {
    name: 'list_clients',
    title: 'List my clients',
    description: 'The client companies this connection may act for. Any other client is out of reach.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    rpc: 'mcp_portal_list_clients',
  },
  {
    name: 'list_documents',
    title: 'List portal documents',
    description: "One client's portal documents, every version, with status (draft, pending_approval, published, withdrawn, superseded), fingerprint and row_version.",
    inputSchema: { type: 'object', required: ['customer_id'], properties: { customer_id: uuid }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    rpc: 'mcp_portal_list_documents',
  },
  {
    name: 'get_document',
    title: 'Read a portal document',
    description: 'One document version in full. Use its row_version when you change or submit it.',
    inputSchema: { type: 'object', required: ['document_id'], properties: { document_id: uuid }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    rpc: 'mcp_portal_get_document',
  },
  {
    name: 'read_client_activity',
    title: "Read the client's acceptances",
    description: 'What the client has done in the portal: acceptances and Agreements in Principle (who, title, company, which version and fingerprint, when) and the state of the receipt email. Uploads and interview completion come with later portal phases.',
    inputSchema: { type: 'object', required: ['customer_id'], properties: { customer_id: uuid }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    rpc: 'mcp_portal_client_activity',
  },
  {
    name: 'create_draft',
    title: 'Create a draft document',
    description: `Creates a DRAFT portal document for a client. The client sees nothing until John approves and publishes it in the studio. kind: ${KINDS.join(', ')}. To make the next version of an existing document, give its series.`,
    inputSchema: {
      type: 'object',
      required: ['customer_id', 'run_id', 'agent_id', 'document'],
      properties: {
        customer_id: uuid,
        ...WHO,
        document: {
          type: 'object',
          required: ['kind', 'title'],
          properties: { kind: { type: 'string', enum: KINDS }, series: { ...uuid, description: 'Optional: the series of the document this is a new version of.' }, ...docProps },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    rpc: 'mcp_portal_create_draft',
  },
  {
    name: 'update_draft',
    title: 'Change a draft document',
    description: 'Changes the given fields of a DRAFT. expected_row_version is the row_version you last read; if someone changed the draft since, read it again. Only drafts change; a published document changes by a new version (create_draft with its series).',
    inputSchema: {
      type: 'object',
      required: ['document_id', 'expected_row_version', 'run_id', 'agent_id', 'changes'],
      properties: {
        document_id: uuid,
        expected_row_version: { type: 'integer', minimum: 1 },
        ...WHO,
        changes: { type: 'object', properties: docProps, additionalProperties: false },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    rpc: 'mcp_portal_update_draft',
  },
  {
    name: 'attach_pdf',
    title: 'Attach the designed PDF to a draft',
    description: `Stores the designed PDF of a DRAFT (base64, ${MAX_PDF_BYTES / 1024 / 1024} MB at most) in the private portal bucket and records its hash, which becomes part of the version fingerprint. Attaching again replaces it.`,
    inputSchema: {
      type: 'object',
      required: ['document_id', 'run_id', 'agent_id', 'filename', 'content_base64'],
      properties: { document_id: uuid, ...WHO, filename: { type: 'string' }, content_base64: { type: 'string' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    rpc: 'mcp_portal_set_file',
  },
  {
    name: 'request_publish',
    title: 'Submit a draft for John to approve',
    description: "Freezes a DRAFT and submits it for approval. Returns the version fingerprint (content_sha256): put it on your task so John knows exactly what he approves. This does NOT publish: only John's Approve and publish in the studio (Clients & DX, the client, Portal) makes it visible to the client. To change it afterwards, staff return it to draft.",
    inputSchema: {
      type: 'object',
      required: ['document_id', 'expected_row_version', 'run_id', 'agent_id'],
      properties: { document_id: uuid, expected_row_version: { type: 'integer', minimum: 1 }, ...WHO },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    rpc: 'mcp_portal_request_publish',
  },
];
export const CHUNKED_PDF_TOOLS = [
  {
    name: 'begin_pdf_upload', title: 'Begin a large PDF upload',
    description: 'Start a 30 minute upload of a PDF up to 20 MB. Use 2 MB binary chunks and finish before the draft is changed. At most three uploads may be open for one token.',
    inputSchema: { type: 'object', required: ['document_id', 'run_id', 'agent_id', 'filename', 'size_bytes', 'sha256'],
      properties: { document_id: uuid, ...WHO, filename: { type: 'string' }, size_bytes: { type: 'integer', minimum: 1, maximum: MAX_PDF_BYTES }, sha256: { type: 'string' } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    rpc: 'mcp_portal_pdf_begin',
  },
  {
    name: 'upload_pdf_chunk', title: 'Upload the next PDF chunk',
    description: 'Send chunks in order, starting at index 0. Each decoded chunk is at most 2 MB. Retry a failed request only after checking its next_index.',
    inputSchema: { type: 'object', required: ['session_id', 'run_id', 'agent_id', 'index', 'content_base64'],
      properties: { session_id: uuid, ...WHO, index: { type: 'integer', minimum: 0 }, content_base64: { type: 'string' } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    rpc: 'mcp_portal_pdf_chunk',
  },
  {
    name: 'finish_pdf_upload', title: 'Check and attach the uploaded PDF',
    description: 'Checks the exact byte count, SHA-256, PDF signature and draft permission again, then attaches the file. The client sees nothing before publish.',
    inputSchema: { type: 'object', required: ['session_id', 'run_id', 'agent_id'],
      properties: { session_id: uuid, ...WHO }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    rpc: 'mcp_portal_pdf_finish',
  },
];
export const publicTools = (chunkedPdf = false) => (chunkedPdf ? [...TOOLS, ...CHUNKED_PDF_TOOLS] : TOOLS).map(({ rpc, ...t }) => t);

// ── errors ────────────────────────────────────────────────────────────────────────────────────

// Database errors whose message is ours (0037 / 0038) and safe to pass on; anything else gets a general line.
const PASS_CODES = new Set(['P0002', '42501', '23514', '40001', '23505', '23502', '22P02', '22023']);
export const GENERAL_ERROR = 'The portal could not do this just now. Try again; if it keeps failing, say so on your task.';
export const TOKEN_ERROR = 'invalid or revoked token';

export function dbErrorText(error) {
  if (!error) return GENERAL_ERROR;
  const msg = String(error.message || '').slice(0, 300);
  if (PASS_CODES.has(error.code) && msg) return msg;
  return GENERAL_ERROR;
}

class ToolError extends Error {}
const fail = (msg) => { throw new ToolError(msg); };

const need = (args, keys) => {
  for (const k of keys) if (args[k] == null) fail(`${k} is needed`);
};
const needUuid = (args, keys) => {
  for (const k of keys) if (!isUuid(args[k])) fail(`${k} must be a uuid`);
};
const needVersion = (v) => {
  if (!Number.isInteger(v) || v < 1) fail('expected_row_version must be the row_version you last read (a whole number)');
};

// ── the server ────────────────────────────────────────────────────────────────────────────────

/**
 * deps.rpc(fn, params) → { data, error } (PostgREST rpc as the service key)
 * deps.upload(path, bytes) → { error } (portal-files, application/octet-stream)
 * deps.log(...args) optional
 */
export function createPortalMcp(deps) {
  const log = deps.log || (() => {});
  const tools = deps.chunkedPdf ? [...TOOLS, ...CHUNKED_PDF_TOOLS] : TOOLS;
  const byName = new Map(tools.map((t) => [t.name, t]));

  async function db(fn, params) {
    const { data, error } = await deps.rpc(fn, params);
    if (error) {
      if (error.code === '42501' && /invalid or revoked token/.test(error.message || '')) throw Object.assign(new Error(TOKEN_ERROR), { unauthorised: true });
      if (!PASS_CODES.has(error.code)) log('portal-mcp: database error', fn, error.code);
      fail(dbErrorText(error));
    }
    return data;
  }

  async function callTool(tokenSha, name, args) {
    const tool = byName.get(name);
    if (!tool) fail(`unknown tool: ${name}`);
    if (!args || typeof args !== 'object' || Array.isArray(args)) fail('arguments must be an object');
    const extra = Object.keys(args).filter((k) => !(k in tool.inputSchema.properties));
    if (extra.length) fail(`unknown arguments: ${extra.join(', ')}`);
    const t = { p_token_sha256: tokenSha };
    const who = () => { need(args, ['run_id', 'agent_id']); needUuid(args, ['run_id', 'agent_id']); return { p_run_id: args.run_id, p_agent_id: args.agent_id }; };
    const problems = (list) => { if (list.length) fail(`Fix these and try again:\n- ${list.join('\n- ')}`); };
    const storePdf = async (doc, w, bytes, filename, hash) => {
      const path = `${doc.customer_id}/${doc.id}/${hash.slice(0, 12)}-${safePdfName(filename)}`;
      const up = await deps.upload(path, bytes);
      if (up?.error && !/exists|duplicate/i.test(String(up.error.message || up.error))) {
        log('portal-mcp: upload failed', String(up.error.message || up.error).slice(0, 200));
        fail('The file could not be stored just now. Try again; the draft is unchanged.');
      }
      return db('mcp_portal_set_file', { ...t, ...w, p_document_id: doc.id, p_path: path, p_sha256: hash });
    };

    switch (name) {
      case 'list_clients':
        return db(tool.rpc, t);
      case 'list_documents':
      case 'read_client_activity':
        needUuid(args, ['customer_id']);
        return db(tool.rpc, { ...t, p_customer_id: args.customer_id });
      case 'get_document':
        needUuid(args, ['document_id']);
        return db(tool.rpc, { ...t, p_document_id: args.document_id });
      case 'create_draft': {
        needUuid(args, ['customer_id']);
        const w = who();
        problems(checkDocumentFields(args.document, 'create'));
        return db(tool.rpc, { ...t, ...w, p_customer_id: args.customer_id, p_fields: args.document });
      }
      case 'update_draft': {
        needUuid(args, ['document_id']);
        needVersion(args.expected_row_version);
        const w = who();
        problems(checkDocumentFields(args.changes, 'update'));
        return db(tool.rpc, { ...t, ...w, p_document_id: args.document_id, p_expected_row_version: args.expected_row_version, p_fields: args.changes });
      }
      case 'attach_pdf': {
        needUuid(args, ['document_id']);
        const w = who();
        const bytes = fromBase64(args.content_base64);
        if (!bytes) fail('content_base64 must be the file in base64');
        if (bytes.length > MAX_PDF_BYTES) fail(`the file is ${MAX_PDF_BYTES / 1024 / 1024} MB at most`);
        if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d)) fail('the file must be a PDF');
        // scope and draft checked by the database before any byte is stored
        const doc = await db('mcp_portal_get_document', { ...t, p_document_id: args.document_id });
        if (doc.status !== 'draft') fail(`a file can be attached only to a draft (this one is ${doc.status})`);
        const hash = await sha256Hex(bytes);
        return storePdf(doc, w, bytes, args.filename, hash);
      }
      case 'begin_pdf_upload': {
        needUuid(args, ['document_id']);
        const w = who();
        if (!Number.isInteger(args.size_bytes) || args.size_bytes < 1 || args.size_bytes > MAX_PDF_BYTES) fail('the file is 20 MB at most');
        if (typeof args.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(args.sha256)) fail('sha256 must be 64 lowercase hex characters');
        if (typeof args.filename !== 'string' || !args.filename.trim() || args.filename.length > 200) fail('filename must be 1 to 200 characters');
        return db(tool.rpc, { ...t, ...w, p_document_id: args.document_id, p_filename: args.filename,
          p_size: args.size_bytes, p_sha256: args.sha256 });
      }
      case 'upload_pdf_chunk': {
        needUuid(args, ['session_id']);
        const w = who();
        if (!Number.isInteger(args.index) || args.index < 0 || args.index > 9) fail('index must be a chunk number from 0 to 9');
        const bytes = fromBase64(args.content_base64);
        if (!bytes || bytes.length < 1 || bytes.length > MAX_PDF_CHUNK_BYTES) fail('content_base64 must be 1 byte to 2 MB of base64');
        const result = await db(tool.rpc, { ...t, ...w, p_session_id: args.session_id, p_index: args.index,
          p_content_base64: args.content_base64 });
        if (result?.error) fail(result.error);
        return result;
      }
      case 'finish_pdf_upload': {
        needUuid(args, ['session_id']);
        const w = who();
        const staged = await db(tool.rpc, { ...t, ...w, p_session_id: args.session_id });
        if (staged?.error) fail(staged.error);
        const bytes = fromBase64(staged.content_base64);
        if (!bytes || bytes.length > MAX_PDF_BYTES) fail('PDF upload size does not match');
        const doc = { id: staged.document_id, customer_id: staged.customer_id };
        const attached = await storePdf(doc, w, bytes, staged.filename, staged.sha256);
        try { await db('mcp_portal_pdf_discard', { ...t, ...w, p_session_id: args.session_id }); }
        catch { log('portal-mcp: uploaded PDF session cleanup deferred to expiry'); }
        return attached;
      }
      case 'request_publish': {
        needUuid(args, ['document_id']);
        needVersion(args.expected_row_version);
        const w = who();
        const doc = await db(tool.rpc, { ...t, ...w, p_document_id: args.document_id, p_expected_row_version: args.expected_row_version });
        return {
          ...doc,
          next_step: `Submitted for approval with fingerprint ${doc.content_sha256}. The client sees nothing yet. Ask John on your task to approve and publish this exact fingerprint in the studio (Clients & DX, the client, Portal).`,
        };
      }
      default:
        return fail(`unknown tool: ${name}`);
    }
  }

  const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
  const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  const reply = (status, body, headers = {}) => ({ status, headers: { 'content-type': 'application/json', ...headers }, body: body == null ? null : JSON.stringify(body) });
  const unauthorised = (id) => reply(401, rpcError(id, -32001, 'A valid portal token is needed (Authorization: Bearer gspm_...).'), { 'www-authenticate': 'Bearer realm="greatstone-portal"' });

  /** One HTTP request: { method, headers: { get(name) }, text } → { status, headers, body }. */
  async function handle({ method, headers, text }) {
    if (method !== 'POST') return reply(405, rpcError(null, -32000, 'POST JSON-RPC to this endpoint.'), { allow: 'POST' });
    const auth = headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!TOKEN_RE.test(token)) return unauthorised(null);
    if ((text || '').length > MAX_BODY_BYTES) return reply(413, rpcError(null, -32600, 'The request is too large.'));
    let msg;
    try { msg = JSON.parse(text); } catch { return reply(400, rpcError(null, -32700, 'Parse error')); }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return reply(400, rpcError(msg?.id, -32600, 'Invalid request (one JSON-RPC 2.0 message per POST).'));
    }
    const { id, method: m, params } = msg;
    if (id === undefined) return reply(202, null); // a notification: nothing to answer
    const tokenSha = await sha256Hex(token);

    switch (m) {
      case 'initialize': {
        // checks the token once at connect time, so a revoked or mistyped one fails when the connection is added
        try { await db('mcp_portal_list_clients', { p_token_sha256: tokenSha }); } catch (e) {
          if (e?.unauthorised) return unauthorised(id);
          return reply(200, rpcError(id, -32603, GENERAL_ERROR));
        }
        const asked = params?.protocolVersion;
        return reply(200, rpcResult(id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: 'Greatstone client portal. You write DRAFTS for the clients this connection is scoped to; a client sees a document only after John approves and publishes it in the studio. Pass run_id and agent_id on every write. Call list_clients first.',
        }));
      }
      case 'ping':
        return reply(200, rpcResult(id, {}));
      case 'tools/list':
        return reply(200, rpcResult(id, { tools: publicTools(deps.chunkedPdf) }));
      case 'tools/call': {
        try {
          const data = await callTool(tokenSha, params?.name, params?.arguments ?? {});
          const structured = Array.isArray(data) ? { items: data } : data;
          return reply(200, rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: structured }));
        } catch (e) {
          if (e?.unauthorised) return unauthorised(id);
          if (e instanceof ToolError) return reply(200, rpcResult(id, { content: [{ type: 'text', text: e.message }], isError: true }));
          log('portal-mcp: unexpected', String(e?.name || e));
          return reply(200, rpcResult(id, { content: [{ type: 'text', text: GENERAL_ERROR }], isError: true }));
        }
      }
      default:
        return reply(200, rpcError(id, -32601, `Method not found: ${m}`));
    }
  }

  return { handle, callTool };
}
