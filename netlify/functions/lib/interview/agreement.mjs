// The interview data processing agreement gate (GRE-2794; gate GRE-2656). A client organisation's company admin
// reads the agreement in the app, ticks that they have read it and have authority, and accepts. The acceptance is
// one kept row in interview.agreement_acceptance (migration 058). Until the organisation has a row for the CURRENT
// text, the site sends no invite, resend or reminder, hands out no join link and opens no seat.
// The text is Harbor's and is copied unchanged (agreement/dpa-v2.mjs); the summary and labels below are the
// click-accept wording, also Harbor's.
import { createHash } from 'node:crypto';
import { BridgeRequestError } from '../admin-bridge-store.mjs';
import * as dpaV2 from './agreement/dpa-v2.mjs';

export const AGREEMENT_KEY = 'interview-dpa';
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// Placeholder wording until Harbor answers on GRE-2794; changing it does not change the agreement or its version.
export const WORDING = {
  title: 'Data processing agreement for the discovery interviews',
  summary: [
    'Your staff will talk to the Greatstone interviewer. What they say is personal data.',
    'Under this agreement your organisation is the controller and Greatstone is the processor.',
    'You receive themes only, never transcripts, audio or individual answers.',
    'Answers, audio and transcripts are deleted 90 days after the readout.',
    'Greatstone sends no invites until your organisation accepts this agreement.',
  ],
  readLabel: 'I have read the data processing agreement.',
  authorityLabel: 'I have authority to accept it for my organisation.',
  acceptLabel: 'Accept the agreement',
  approved: false,
};

const make = (mod) => ({ key: AGREEMENT_KEY, version: mod.VERSION, sha256: sha256(mod.TEXT), text: mod.TEXT, source: mod.SOURCE });
// every text an organisation may have accepted, so an old acceptance can still be printed
const VERSIONS = [make(dpaV2)];
export const CURRENT = VERSIONS[VERSIONS.length - 1];
export const agreementFor = (sha) => VERSIONS.find((v) => v.sha256 === sha) || null;

// ── reads and the gate ───────────────────────────────────────────────────────────────────────────

const must = ({ data, error }) => { if (error) throw Object.assign(new Error(error.message), { code: error.code }); return data; };
const COLS = `id, customer_id, agreement_key, agreement_version, content_sha256, accepted_at, user_id, customer_user_id, name,
  email, role_title, legal_name, company_country, company_number, registered_address, read_confirmed, authority_confirmed,
  ip_address, user_agent`;

/** The organisation's acceptance of this agreement text, or null. db: an interview client with system claims. */
export async function acceptanceFor(db, customerId, agreement = CURRENT) {
  const rows = must(await db.sql(`SELECT ${COLS} FROM agreement_acceptance
    WHERE customer_id = $1 AND agreement_key = $2 AND agreement_version = $3 AND content_sha256 = $4
    ORDER BY accepted_at DESC LIMIT 1`, [customerId, agreement.key, agreement.version, agreement.sha256]));
  return rows[0] ?? null;
}

/** Every acceptance of the organisation, newest first. */
export async function acceptanceHistory(db, customerId) {
  return must(await db.sql(`SELECT ${COLS} FROM agreement_acceptance WHERE customer_id = $1 ORDER BY accepted_at DESC, id`, [customerId]));
}

export const AGREEMENT_REQUIRED = 'The organisation has not accepted the current interview data processing agreement. '
  + 'A company admin accepts it in the client portal (Interview agreement); then invites can go out.';

/** Throws agreement_required (409 on the bridge) unless the organisation has accepted the current text. */
export async function requireAgreement(db, customerId, agreement = CURRENT) {
  const row = await acceptanceFor(db, customerId, agreement);
  if (!row) throw new BridgeRequestError('agreement_required', AGREEMENT_REQUIRED);
  return row;
}

/** The record as GSAM and the portal see it. */
export function acceptanceView(row) {
  if (!row) return null;
  return {
    id: row.id, organisationId: row.customer_id, agreementKey: row.agreement_key, version: row.agreement_version,
    contentSha256: row.content_sha256, acceptedAt: new Date(row.accepted_at).toISOString(), userId: row.user_id,
    name: row.name, email: row.email, roleTitle: row.role_title, legalName: row.legal_name,
    companyCountry: row.company_country ?? null, companyNumber: row.company_number ?? null,
    registeredAddress: row.registered_address ?? null, readConfirmed: row.read_confirmed,
    authorityConfirmed: row.authority_confirmed, ipAddress: row.ip_address, current: row.content_sha256 === CURRENT.sha256,
  };
}

/** { key, version, contentSha256, accepted, acceptance } for the organisation. */
export async function agreementState(db, customerId) {
  const row = await acceptanceFor(db, customerId);
  return { key: CURRENT.key, version: CURRENT.version, contentSha256: CURRENT.sha256, accepted: Boolean(row),
    acceptance: acceptanceView(row) };
}

// ── accepting ────────────────────────────────────────────────────────────────────────────────────

const text = (x, max, { required = true } = {}) => {
  if (x == null || (typeof x === 'string' && !x.trim())) return required ? undefined : null;
  return typeof x === 'string' && x.trim().length <= max ? x.trim().replace(/\s+/g, ' ') : undefined;
};

/** The admin's form: { version, contentSha256, readConfirmed, authorityConfirmed, name, roleTitle, legalName, ... }. */
export function checkAcceptance(body, agreement = CURRENT) {
  const allowed = ['version', 'contentSha256', 'readConfirmed', 'authorityConfirmed', 'name', 'roleTitle', 'legalName',
    'companyCountry', 'companyNumber', 'registeredAddress'];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request.' };
  if (Object.keys(body).some((k) => !allowed.includes(k))) return { error: 'Invalid request.' };
  // the admin accepts the text they were shown: a stale page is refused, not taken as the new text
  if (body.version !== agreement.version || body.contentSha256 !== agreement.sha256) {
    return { error: 'The agreement has changed since you opened it. Please read the new version.', stale: true };
  }
  if (body.readConfirmed !== true) return { error: 'Please confirm that you have read the agreement.' };
  if (body.authorityConfirmed !== true) return { error: 'Please confirm that you have authority to accept it for your organisation.' };
  const out = {
    name: text(body.name, 200), roleTitle: text(body.roleTitle, 200), legalName: text(body.legalName, 300),
    companyCountry: text(body.companyCountry, 100, { required: false }), companyNumber: text(body.companyNumber, 100, { required: false }),
    registeredAddress: text(body.registeredAddress, 500, { required: false }),
  };
  if (!out.name) return { error: 'Please enter your name.' };
  if (!out.roleTitle) return { error: 'Please enter your role or title.' };
  if (!out.legalName) return { error: "Please enter your organisation's legal name." };
  for (const k of ['companyCountry', 'companyNumber', 'registeredAddress']) if (out[k] === undefined) return { error: 'Invalid request.' };
  return { value: out };
}

/**
 * Writes the acceptance (once per organisation and text; a second accept returns the first). db: an interview client
 * with system claims keyed to the organisation. who: { userId, customerUserId, email }; ip and userAgent from the request.
 */
export async function recordAcceptance(db, { customerId, who, form, ip, userAgent, agreement = CURRENT }) {
  const inserted = must(await db.sql(`INSERT INTO agreement_acceptance (customer_id, agreement_key, agreement_version, content_sha256,
      user_id, customer_user_id, name, email, role_title, legal_name, company_country, company_number, registered_address,
      read_confirmed, authority_confirmed, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, true, $14, $15)
    ON CONFLICT (customer_id, agreement_key, content_sha256) DO NOTHING RETURNING ${COLS}`,
  [customerId, agreement.key, agreement.version, agreement.sha256, who.userId, who.customerUserId, form.name,
    String(who.email || '').toLowerCase().slice(0, 254), form.roleTitle, form.legalName, form.companyCountry, form.companyNumber,
    form.registeredAddress, String(ip || 'unknown').slice(0, 64), userAgent ? String(userAgent).slice(0, 500) : null]));
  if (inserted[0]) return { row: inserted[0], created: true };
  return { row: await acceptanceFor(db, customerId, agreement), created: false };
}

// ── the readable text and the downloadable copy ──────────────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>');

/** The agreement's markdown as HTML: headings, paragraphs, lists, tables, rules. Everything is escaped first. */
export function agreementHtml(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let para = [];
  const flush = () => { if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); para = []; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { flush(); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); const n = Math.min(h[1].length + 1, 5); out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    if (/^---+\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
    if (/^\|/.test(line)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r, k) => !(k === 1 && /^\|[\s:|-]+\|?$/.test(r)));
      const [head, ...rest] = body;
      out.push(`<table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        rest.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const ol = /^\d+\.\s+/.test(line);
    const ul = /^[-*]\s+/.test(line);
    if (ol || ul) {
      flush();
      const items = [];
      const re = ol ? /^\d+\.\s+/ : /^[-*]\s+/;
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ''));
      i--;
      const tag = ol ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}

const RECORD_ROWS = [
  ['Organisation (Controller)', 'legalName'], ['Country', 'companyCountry'], ['Company number', 'companyNumber'],
  ['Registered address', 'registeredAddress'], ['Accepted by', 'name'], ['Role or title', 'roleTitle'], ['Email', 'email'],
  ['Website user id', 'userId'], ['Accepted at (UTC)', 'acceptedAt'], ['IP address', 'ipAddress'],
  ['Agreement', 'version'], ['Text fingerprint (SHA-256)', 'contentSha256'], ['Acceptance id', 'id'],
];

/** A self-contained HTML file: the acceptance record, then the agreement text exactly as accepted. */
export function acceptanceCopyHtml(row) {
  const agreement = agreementFor(row.content_sha256);
  if (!agreement) return null;
  const v = acceptanceView(row);
  const record = RECORD_ROWS.map(([label, k]) => `<tr><th>${esc(label)}</th><td>${esc(v[k] ?? '—')}</td></tr>`).join('');
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><title>${esc(WORDING.title)}: ${esc(v.legalName)} (${esc(v.version)})</title>
<style>
body{font:15px/1.55 Georgia,'Times New Roman',serif;color:#1d2433;max-width:46rem;margin:2.5rem auto;padding:0 1.25rem}
h1,h2,h3,h4{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.25}h1{font-size:1.5rem}
table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.92rem}th,td{border:1px solid #c9ced8;padding:.4rem .55rem;text-align:left;vertical-align:top}
th{background:#f3f5f8}.record{border:2px solid #1d2433;padding:1rem 1.25rem;margin:1.5rem 0}.record th{width:38%}
.note{font-size:.88rem;color:#4a5263}code{font-size:.9em}
</style></head><body>
<h1>${esc(WORDING.title)}</h1>
<section class="record"><h2>Acceptance record</h2>
<p>${esc(v.name)} accepted this agreement in the Greatstone client portal for ${esc(v.legalName)}, and confirmed that they had read it and had authority to accept it for their organisation.</p>
<table>${record}</table>
<p class="note">This record takes the place of the signature blocks and fills the bracketed details of the Controller. The text below is the agreement exactly as accepted; its SHA-256 fingerprint is in the record. Greatstone keeps this record and cannot edit it.</p>
</section>
${agreementHtml(agreement.text)}
</body></html>
`;
}

export const copyFilename = (row) => `interview-dpa-${row.agreement_version}-${new Date(row.accepted_at).toISOString().slice(0, 10)}.html`;
