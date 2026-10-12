// Contact enquiry (GRE-654, release plan GRE-638 rev 2 §3.4): the row the `enquiry` edge function saves in
// service_inquiries (0023, attribution and industry from 0035, size band from 0040), the internal Resend alert, and the one
// handler that ties them together. Pure: the database and the email are injected, so
// `node --test` covers every path and the edge function imports the same code.
// Wire contract with the BookDeepDive block (src/lib/enquiry.mjs):
//   POST /functions/v1/enquiry  { name?, company?, email, size_band?, industry?, message?, attribution?: { first, last }, page?, website? }
// The form asks for a name too (GRE-970), but only the email is required here: a visitor on an older page
// still reaches us. The optional interest choice arrives as the message's first line ("Interest: …").
//   → 200 { ok: true, ref } when the row is saved or the alert went (the lead is on record)
//   → 4xx/5xx { ok: false, error } otherwise; the block then shows the contact address.
// `website` is a honeypot: people never see it, so a value means a bot. We answer ok and keep nothing.

import { sendEmail } from './front-door-leads.mjs';

export { sendEmail };

// The same limits submit_service_inquiry (0023) enforces, so the edge path and the rpc path agree.
export const ENQUIRY_LIMITS = { name: 200, email: 200, company: 200, size_band: 40, industry: 80, message: 4000, page: 200 };
export const PER_IP_PER_DAY = 10;
export const SOURCE = 'contact';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const line = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const cap = (s, max) => line(s).replace(/[<>]/g, '').slice(0, max);
// the message keeps its line breaks; only runs of blank lines are folded
const capText = (s, max) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

// The visitor's fields. Returns { ok, enquiry } or { ok: false, error } (a visitor-safe sentence).
export function normaliseEnquiry(body) {
  const b = body && typeof body === 'object' ? body : {};
  const enquiry = {
    name: cap(b.name, ENQUIRY_LIMITS.name),
    email: cap(b.email, ENQUIRY_LIMITS.email),
    company: cap(b.company, ENQUIRY_LIMITS.company),
    size_band: cap(b.size_band, ENQUIRY_LIMITS.size_band),
    industry: cap(b.industry, ENQUIRY_LIMITS.industry),
    message: capText(b.message, ENQUIRY_LIMITS.message),
  };
  if (!EMAIL_RE.test(enquiry.email)) return { ok: false, error: 'Please add an email address we can reply to.' };
  return { ok: true, enquiry };
}

// One touch as analytics.js stores it ({ utm_*, landing, referrer, at }). Only those keys survive.
function normaliseTouch(t) {
  if (!t || typeof t !== 'object') return null;
  const out = {};
  for (const k of UTM_KEYS) if (t[k]) out[k] = cap(t[k], 120);
  if (t.landing) out.landing = cap(t.landing, 200);
  if (t.referrer) out.referrer = cap(t.referrer, 200);
  if (typeof t.at === 'string' && !Number.isNaN(Date.parse(t.at))) out.at = new Date(t.at).toISOString();
  return Object.keys(out).length ? out : null;
}

// { first, last, page } from getAttribution() plus the page the form was sent from.
export function normaliseAttribution(raw, page) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  const first = normaliseTouch(a.first);
  const last = normaliseTouch(a.last);
  if (first) out.first = first;
  if (last) out.last = last;
  const p = cap(page, ENQUIRY_LIMITS.page);
  if (p) out.page = p;
  return out;
}

// The service_inquiries row. `services` stays empty: this is a general enquiry, not a services basket.
// org_id is the caller's (the edge function looks up the primary org, as 0023's rpc does).
export function enquiryRow({ orgId, enquiry, attribution = {}, ip = '' }) {
  return {
    ...(orgId ? { org_id: orgId } : {}),
    services: [],
    contact_name: enquiry.name || null,
    contact_email: enquiry.email,
    contact_company: enquiry.company || null,
    message: enquiry.message || null,
    size_band: enquiry.size_band || null,
    industry: enquiry.industry || null,
    attribution,
    source: SOURCE,
    ip: ip || 'unknown',
  };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const touchLabel = (t) => (t ? [t.utm_source, t.utm_medium, t.utm_campaign].filter(Boolean).join(' / ') || 'Direct or organic' : 'Not known');

// The interest choice travels as the message's first line (src/lib/enquiry.mjs withInterest); split it back out.
export function splitInterest(message) {
  const m = String(message || '').match(/^Interest: ([^\n]+)(?:\n+([\s\S]*))?$/);
  return m ? { interest: m[1].trim(), work: (m[2] || '').trim() } : { interest: '', work: String(message || '').trim() };
}

// "Source" in the alert (GRE-652 §4.6): utm_source / utm_campaign of the latest touch, else the first, else direct.
export function sourceLabel(attribution = {}) {
  const t = [attribution.last, attribution.first].find((x) => x && x.utm_source);
  return t ? [t.utm_source, t.utm_campaign].filter(Boolean).join(' / ') : 'direct';
}

const fmtTime = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

// The internal alert, worded as GRE-652 §4.6 (the "Reply by" line waits on the enquiry owner and reply time,
// decision D6). When the row is saved the studio holds the record and the email links to the Inquiries tab.
// When it is not saved the email carries everything: it is the record.
export function buildEnquiryAlert({ enquiry, attribution = {}, saved, ref = '', studioUrl = '', at = new Date() }) {
  const who = enquiry.company || enquiry.name || enquiry.email;
  const { interest, work } = splitInterest(enquiry.message);
  const size = enquiry.size_band || '';
  const source = sourceLabel(attribution);
  const summary = [
    (enquiry.name || enquiry.email) + (enquiry.company ? ' at ' + enquiry.company : '') + (size ? ' (' + size + ')' : '') + ' sent an enquiry at ' + fmtTime(at) + '.',
    ...(interest ? ['Interested in: ' + interest + '.'] : []),
    ...(work ? ['Work they want time back from: "' + work + '".'] : []),
    'Source: ' + source + '.',
    'Then add them to Pipedrive.',
  ];
  const rows = [['From', [enquiry.name, enquiry.company].filter(Boolean).join(', ') || 'Not given'], ['Email', enquiry.email]];
  if (size) rows.push(['Organisation size', size]);
  if (interest) rows.push(['Interested in', interest]);
  if (enquiry.industry) rows.push(['Industry', enquiry.industry]);
  rows.push(['Source', source], ['First visit from', touchLabel(attribution.first)], ['Latest visit from', touchLabel(attribution.last)]);
  if (attribution.page) rows.push(['Sent from', attribution.page]);
  if (saved && ref) rows.push(['Enquiry', ref]);
  const subject = (saved ? 'New enquiry: ' : 'Enquiry NOT SAVED: ') + who + (size ? ', ' + size : '');
  const intro = saved
    ? 'A visitor sent the contact form. The enquiry is saved in the studio.'
    : 'A visitor sent the contact form, but the enquiry could not be saved in the studio. This email is the only record. Reply from here and add it to the CRM by hand.';
  const link = saved && studioUrl ? studioUrl : '';
  const html = `<div style="background:#1f1f1f;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;padding:28px;max-width:560px;margin:0 auto;border-radius:14px">
    <div style="font-weight:800;font-size:18px;letter-spacing:.04em">GREATST<span style="color:#c8ff00">O</span>NE</div>
    <h1 style="font-size:20px;margin:18px 0 6px">${saved ? 'New enquiry' : 'Enquiry not saved'}</h1>
    <p style="color:#b0b0b0;font-size:14px;margin:0 0 14px">${esc(intro)}</p>
    <p style="color:#f5f5f5;font-size:14px;white-space:pre-wrap;margin:0 0 18px">${esc(summary.join('\n'))}</p>
    <table style="font-size:14px;border-collapse:collapse;margin:0 0 18px">${rows.map(([k, v]) =>
      `<tr><td style="color:#b0b0b0;padding:4px 16px 4px 0;vertical-align:top">${esc(k)}</td><td style="color:#f5f5f5;padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>
    ${link ? `<a href="${esc(link)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:800;color:#0e1611;background:#c8ff00;text-decoration:none;border-radius:100px">Open enquiries</a>` : ''}
    <p style="color:#707070;font-size:12px;margin-top:22px">Internal alert from the website contact form. Do not forward.</p>
  </div>`;
  const text = [...summary, '', intro, '', ...rows.map(([k, v]) => k + ': ' + v), ...(link ? ['', 'Open enquiries: ' + link] : [])].join('\n');
  return { subject, html, text };
}

// The whole request. deps:
//   countRecent(ip) → number | null     enquiries from this IP in the last day (null: could not count)
//   saveRow(row)    → { id } | null      null when the row could not be saved (logged by the caller)
//   sendAlert(msg)  → { sent, error? }
//   markAlerted(id) → void               best effort
//   log(level, msg)
// Returns { status, body }. The lead is on record when the row is saved OR the alert went; only when both
// fail does the visitor get { ok: false } and the contact address.
export async function handleEnquiry(body, { ip = '', studioUrl = '', now = () => new Date(), countRecent, saveRow, sendAlert, markAlerted, log = () => {} } = {}) {
  const b = body && typeof body === 'object' ? body : {};
  if (b.website) return { status: 200, body: { ok: true } };  // honeypot: quietly drop
  const norm = normaliseEnquiry(b);
  if (!norm.ok) return { status: 400, body: { ok: false, error: norm.error } };
  const { enquiry } = norm;
  const attribution = normaliseAttribution(b.attribution, b.page);

  let recent = null;
  try { recent = await countRecent(ip || 'unknown'); } catch (e) { recent = null; }
  if (typeof recent === 'number' && recent >= PER_IP_PER_DAY) {
    return { status: 429, body: { ok: false, error: 'Too many enquiries from here today. Please email us instead.' } };
  }

  let saved = null;
  try { saved = await saveRow(enquiryRow({ enquiry, attribution, ip })); } catch (e) { saved = null; }
  const id = saved && saved.id ? String(saved.id) : '';
  const ref = id.slice(0, 8);
  if (!id) log('error', 'enquiry: not saved, the alert carries it');

  let alert = { sent: false, error: 'not sent' };
  try { alert = await sendAlert(buildEnquiryAlert({ enquiry, attribution, saved: !!id, ref, studioUrl, at: now() })); } catch (e) { alert = { sent: false, error: 'alert threw' }; }
  if (!alert.sent) log(id ? 'warn' : 'error', 'enquiry: alert not sent ' + (alert.error || ''));
  if (id && alert.sent) { try { await markAlerted(id); } catch (e) { /* best effort */ } }

  if (!id && !alert.sent) {
    log('error', 'enquiry: LOST, neither saved nor alerted');
    return { status: 503, body: { ok: false, error: 'We could not send your enquiry just now. Please email us instead.' } };
  }
  return { status: 200, body: { ok: true, ref } };
}
