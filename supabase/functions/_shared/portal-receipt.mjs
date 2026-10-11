// Client portal receipts (GRE-1256; spec GRE-1227 revision 2, sections 2 and 7). One module for:
//   - the fixed record of an acceptance, in two labelled blocks (verified from the account / entered by the
//     signer); the receipt page (src/portal/PortalReceipt.jsx) and the email both use receiptRecord()
//   - the receipt email, built from the database record only, with a self-contained HTML copy of the version
//   - the retry schedule (1, 5, 15, 60 minutes, then every 6 hours; failed after 8 attempts)
//   - runWorker(): claim, send with the idempotency key, mark sent / retry / failed, alert on the last failure
// Pure apart from the injected db and fetch, so `node --test` covers it and the edge function
// (supabase/functions/portal-receipt-worker) runs the same code.

import { readingOrder } from './portal-gita.mjs';

export const MAX_ATTEMPTS = 8;
const RETRY_MINUTES = [1, 5, 15, 60];
const LATER_MINUTES = 6 * 60;

/** When to try again after attempt number `attempts` failed; null when that was the last one. */
export function nextAttemptAt(attempts, now = new Date()) {
  if (attempts >= MAX_ATTEMPTS) return null;
  const mins = RETRY_MINUTES[attempts - 1] ?? LATER_MINUTES;
  return new Date(now.getTime() + mins * 60000);
}

export const idempotencyKey = (acceptanceId) => 'portal-receipt-' + acceptanceId;

const ACTION_LABEL = { accept: 'Accepted', agree_in_principle: 'Agreed in principle' };
export const actionLabel = (a) => ACTION_LABEL[a] || 'Accepted';

/** Database time, shown the same way everywhere: "10 Oct 2026, 19:30 UTC". */
export function fmtUtc(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${mon} ${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/**
 * The fixed record of one acceptance. `document` is optional (the title comes from it); everything else is
 * the acceptance row as the database wrote it.
 */
export function receiptRecord(acceptance = {}, document = {}) {
  const a = acceptance || {};
  return {
    action: actionLabel(a.action),
    record: [
      ['Document', (document && document.title) || 'Document'],
      ['Version', String(a.document_version ?? '')],
      ['Fingerprint (SHA-256)', a.content_sha256 || ''],
      [actionLabel(a.action) + ' on', fmtUtc(a.accepted_at)],
      ['Reference', a.id || ''],
    ],
    confirmation: a.confirmation_text || '',
    verified: [
      ['Company', a.account_company_name || ''],
      ['Signed-in email', a.signer_email || ''],
    ],
    entered: [
      ['Name', a.signer_name || ''],
      ['Job title', a.signer_title || ''],
    ],
  };
}

const EMAIL_STATE = {
  queued: 'Email copy: on its way',
  sending: 'Email copy: sending',
  sent: 'Email copy: sent',
  failed: 'Email copy: not sent yet. We will keep trying and our team has been told.',
};
/** What the receipt shows about the email copy. A queued job that has been tried before is "retrying". */
export function emailStateLabel(job) {
  if (!job) return EMAIL_STATE.queued;
  if (job.status === 'queued' && job.attempts > 0) return 'Email copy: retrying';
  return EMAIL_STATE[job.status] || EMAIL_STATE.queued;
}

// ── HTML for the email copy (no DOM in the edge runtime) ──────────────────────────────────────

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const KEEP = new Set(['p', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'br', 'blockquote', 'code', 'pre', 'span', 'hr']);
const VOID = new Set(['br', 'hr']);
const DROP = new Set(['script', 'style', 'svg', 'math', 'noscript', 'template', 'textarea', 'title', 'iframe', 'object', 'embed', 'xmp', 'head']);
const DEMOTE = new Set(['h1', 'h2', 'h3', 'h4']);

/**
 * Rebuilds section HTML from its tokens: only the allowlisted tags are written back, with no attributes
 * except a safe href on <a>; the contents of script, style and the like are dropped; every other character
 * is escaped. The output contains no markup this function did not write itself. Same policy as
 * src/lib/sanitize-html.mjs (which needs a DOM).
 */
export function sanitizeForEmail(html) {
  const src = String(html ?? '').replace(/\u0000/g, '');
  const out = [];
  const tag = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  let dropping = null;
  const text = (s) => { if (!dropping && s) out.push(esc(s.replace(/&(#?\w+);/g, '\u0000$1;')).replace(/\u0000/g, '&')); };
  for (let m; (m = tag.exec(src));) {
    text(src.slice(last, m.index));
    last = tag.lastIndex;
    if (!m[2]) continue; // a comment
    const close = m[1] === '/';
    let name = m[2].toLowerCase();
    if (dropping) { if (close && name === dropping) dropping = null; continue; }
    if (DROP.has(name)) { if (!close && !/\/\s*$/.test(m[3])) dropping = name; continue; }
    if (DEMOTE.has(name)) name = 'h5';
    if (!KEEP.has(name)) continue;
    if (close) { if (!VOID.has(name)) out.push(`</${name}>`); continue; }
    if (name === 'a') {
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[3]);
      const url = href ? (href[1] ?? href[2] ?? href[3] ?? '').trim() : '';
      out.push(/^(https?:|mailto:)/i.test(url) ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">` : '<a>');
      continue;
    }
    out.push(`<${name}>`);
  }
  text(src.slice(last));
  return out.join('');
}

const CSS = 'body{font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1a1a1a;line-height:1.55}'
  + 'h1{font-size:22px}h2{font-size:17px;margin-top:28px}dt{font-weight:700}dd{margin:0 0 8px}code{word-break:break-all}'
  + '.box{border:1px solid #ccc;border-radius:8px;padding:12px 16px;margin:12px 0}';

const rows = (pairs) => pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${k.startsWith('Fingerprint') ? `<code>${esc(v)}</code>` : esc(v)}</dd>`).join('');

/** The accepted version as one HTML file that needs nothing else to open (attached to the email). */
export function documentCopyHtml(document = {}, acceptance = {}) {
  const d = document || {};
  const sections = readingOrder(d.kind, d.body && Array.isArray(d.body.sections) ? d.body.sections : []).map((s) =>
    `<h2>${esc(s.title)}</h2>${sanitizeForEmail(s.html)}`).join('');
  const demos = Array.isArray(d.demos) && d.demos.length
    ? `<h2>Demos</h2><ul>${d.demos.map((x) => `<li>${/^https:\/\//i.test(String(x.url || '')) ? `<a href="${esc(x.url)}">${esc(x.label)}</a>` : esc(x.label)}${x.note ? ' · ' + esc(x.note) : ''}</li>`).join('')}</ul>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(d.title)} (version ${esc(d.version)})</title>`
    + `<style>${CSS}</style></head><body><h1>${esc(d.title)}</h1>`
    + `<p>Version ${esc(d.version)} · Fingerprint (SHA-256) <code>${esc(acceptance.content_sha256 || d.content_sha256 || '')}</code></p>`
    + (d.summary ? `<p>${esc(d.summary)}</p>` : '') + sections + demos + '</body></html>';
}

const utf8ToBase64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const fileSafe = (s) => String(s || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'document';

/** The receipt email for both sides. Built from the acceptance and document rows only. */
export function buildReceiptEmail({ acceptance, document, siteOrigin = 'https://greatstoneint.com' }) {
  const r = receiptRecord(acceptance, document);
  const link = siteOrigin.replace(/\/+$/, '') + '/#portal/receipt/' + acceptance.id;
  const title = (document && document.title) || 'Document';
  const subject = `${r.action}: ${title} (version ${acceptance.document_version})`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${CSS}</style></head><body>`
    + `<h1>${esc(r.action)}: ${esc(title)}</h1>`
    + `<p>This is the record of what was ${r.action === 'Accepted' ? 'accepted' : 'agreed in principle'} in the Greatstone client portal. A copy of the version is attached.</p>`
    + `<div class="box"><dl>${rows(r.record)}</dl></div>`
    + `<h2>Wording confirmed</h2><div class="box"><p>${esc(r.confirmation)}</p></div>`
    + `<h2>Verified from the account</h2><div class="box"><dl>${rows(r.verified)}</dl></div>`
    + `<h2>Entered by the signer</h2><div class="box"><dl>${rows(r.entered)}</dl></div>`
    + `<p><a href="${esc(link)}">View this receipt in the portal</a></p></body></html>`;
  const text = [`${r.action}: ${title}`, '', ...r.record.map(([k, v]) => `${k}: ${v}`), '', 'Wording confirmed:', r.confirmation, '',
    'Verified from the account', ...r.verified.map(([k, v]) => `${k}: ${v}`), '',
    'Entered by the signer', ...r.entered.map(([k, v]) => `${k}: ${v}`), '', 'Receipt: ' + link].join('\n');
  const attachment = {
    filename: `${fileSafe(title)}-v${acceptance.document_version}.html`,
    content: utf8ToBase64(documentCopyHtml(document, acceptance)),
  };
  return { subject, html, text, attachment };
}

/** The alert to Greatstone when a receipt could not be sent after the last attempt. No personal data. */
export function buildFailedAlert({ acceptance, studioUrl }) {
  const subject = 'Portal receipt not sent after ' + MAX_ATTEMPTS + ' attempts';
  const text = `The email copy of acceptance ${acceptance.id} could not be sent. The acceptance is recorded and stands. `
    + `Open Clients & DX → Portal to see it and press Send again: ${studioUrl}`;
  return { subject, text, html: `<p>${esc(text)}</p>` };
}

// The provider's message, kept short and with any email address taken out (the job row holds no personal data).
export const cleanError = (s) => String(s || 'unknown error').replace(/[^\s@<>"']+@[^\s@<>"']+/g, '<address>').slice(0, 500);

/** One Resend call. Never throws. */
export async function resendSend({ apiKey, from, to, subject, html, text, attachments, idempotency, fetchImpl = (...a) => fetch(...a) }) {
  if (!apiKey || !from) return { ok: false, error: 'email not configured' };
  try {
    const headers = { Authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' };
    if (idempotency) headers['Idempotency-Key'] = idempotency;
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', headers, body: JSON.stringify({ from, to, subject, html, text, attachments }),
    });
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) return { ok: false, error: cleanError('resend ' + res.status + (body && body.message ? ': ' + body.message : '')) };
    return { ok: true, id: (body && body.id) || null };
  } catch (e) {
    return { ok: false, error: cleanError('resend unreachable: ' + (e && e.message)) };
  }
}

/**
 * One worker run. `db` is { claim(limit) → jobs, load(acceptanceId) → { acceptance, document },
 * sent(job, providerId), retry(job, nextAt, error), failed(job, error) }. `send(message)` is resendSend bound to
 * the config. Jobs come from claim() already in 'sending' with attempts counted, so a job is in one run only.
 * Returns a summary for the log (counts, no personal data).
 */
export async function runWorker({ db, send, ownerTo = [], siteOrigin, studioUrl, limit = 10, now = () => new Date() }) {
  const out = { claimed: 0, sent: 0, retry: 0, failed: 0, alertFailed: 0 };
  const jobs = await db.claim(limit);
  out.claimed = jobs.length;
  for (const job of jobs) {
    let res;
    let rec = null;
    try {
      rec = await db.load(job.acceptance_id);
    } catch (e) {
      res = { ok: false, error: cleanError('could not read the acceptance: ' + (e && e.message)) };
    }
    if (rec && !res) {
      const msg = buildReceiptEmail({ acceptance: rec.acceptance, document: rec.document, siteOrigin });
      const to = [rec.acceptance.signer_email, ...ownerTo].filter(Boolean);
      res = await send({ to, subject: msg.subject, html: msg.html, text: msg.text, attachments: [msg.attachment], idempotency: idempotencyKey(job.acceptance_id) });
    }
    if (res.ok) {
      await db.sent(job, res.id);
      out.sent++;
      continue;
    }
    const next = nextAttemptAt(job.attempts, now());
    if (next) {
      await db.retry(job, next, res.error);
      out.retry++;
      continue;
    }
    await db.failed(job, res.error);
    out.failed++;
    if (ownerTo.length) {
      const alert = buildFailedAlert({ acceptance: { id: job.acceptance_id }, studioUrl });
      const a = await send({ to: ownerTo, ...alert, idempotency: idempotencyKey(job.acceptance_id) + '-failed' });
      if (!a.ok) out.alertFailed++; // the failed job still shows in the studio
    }
  }
  return out;
}
