// Basket enquiry (GRE-6446, John 27 Nov): a visitor adds several services to the basket and sends one enquiry
// for all of them. Not a payment. The row is saved by submit_service_inquiry (migration 025), then the team
// gets the alert, the visitor gets a confirmation that lists the services, and Pipedrive gets a Person and a
// Deal with the services in its note, through the front door's CRM calls (front-door-crm.mjs).
// Pure: the database, the email and fetch are injected, so `node --test` covers every path.
//   POST /api/service-inquiry { services: [{ slug, name?, category?, kind?, quantity? }], name?, email, company?, contact_role?, message? }
//   → 200 { ok: true, id } when the row is saved or the team alert went (the lead is on record)
//   → 4xx/5xx { ok: false, error } otherwise; the basket keeps the services and shows the error.
// No prices: the services are quoted by the team.

import { CONTACT_ROLES } from './enquiry.mjs';
import { call, upsertPerson } from './front-door-crm.mjs';

export const SERVICE_LIMIT = 50;
const LIMITS = { name: 200, email: 200, company: 200, message: 4000, serviceName: 120, category: 80 };
const SLUG = /^[a-z0-9-]{1,120}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLE_LABELS = { owner_director: 'Owner or director', manager: 'Manager', other: 'Other' };
const line = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const cap = (s, max) => line(s).replace(/[<>]/g, '').slice(0, max);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const tooLong = (b) => [['name', LIMITS.name], ['email', LIMITS.email], ['company', LIMITS.company], ['message', LIMITS.message]]
  .some(([key, max]) => b[key] != null && (typeof b[key] !== 'string' || b[key].length > max));

// Returns { ok, enquiry } or { ok: false, error } (a visitor-safe sentence).
export function normaliseServiceEnquiry(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!Array.isArray(b.services) || !b.services.length || b.services.length > SERVICE_LIMIT ||
    b.services.some((s) => !s || typeof s.slug !== 'string' || !SLUG.test(s.slug)) || tooLong(b))
    return { ok: false, error: 'Check your enquiry and try again.' };
  const email = cap(b.email, LIMITS.email);
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Please add an email address we can reply to.' };
  const role = line(b.contact_role);
  if (role && !CONTACT_ROLES.includes(role)) return { ok: false, error: 'Please choose your role.' };
  const services = b.services.map((s) => ({
    slug: s.slug,
    name: cap(s.name, LIMITS.serviceName) || s.slug,
    ...(cap(s.category, LIMITS.category) ? { category: cap(s.category, LIMITS.category) } : {}),
    ...(s.kind === 'tool' || s.kind === 'service' ? { kind: s.kind } : {}),
    ...(Number.isInteger(s.quantity) && s.quantity > 1 ? { quantity: Math.min(s.quantity, 1000) } : {}),
    ...(typeof s.checkoutSessionId === 'string' && /^cs_(test|live)_[A-Za-z0-9_]{1,200}$/.test(s.checkoutSessionId) ? { checkoutSessionId: s.checkoutSessionId } : {}),
  }));
  return { ok: true, enquiry: {
    services, email, name: cap(b.name, LIMITS.name), company: cap(b.company, LIMITS.company), role,
    message: String(b.message == null ? '' : b.message).replace(/\r\n?/g, '\n').trim().slice(0, LIMITS.message),
  } };
}

// The message column holds the role too: submit_service_inquiry has no role argument.
export function storedMessage(enquiry) {
  const role = ROLE_LABELS[enquiry.role];
  return [role ? 'Role: ' + role : '', enquiry.message].filter(Boolean).join('\n\n').slice(0, LIMITS.message) || null;
}

const serviceLine = (s) => s.name + (s.quantity > 1 ? ' × ' + s.quantity : '') + (s.category ? ' (' + s.category + ')' : '');
const who = (e) => e.company || e.name || e.email;
// The visitor's message without the stored basket dump the mixed-basket path appends (cart.mjs).
const visitorWords = (message) => String(message || '').split('\nBasket: ')[0].replace(/^Basket: [\s\S]*$/, '').trim();

const frame = (title, inner, foot) => `<div style="background:#1f1f1f;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;padding:28px;max-width:560px;margin:0 auto;border-radius:14px">
    <div style="font-weight:800;font-size:18px;letter-spacing:.04em">GREATST<span style="color:#c8ff00">O</span>NE</div>
    <h1 style="font-size:20px;margin:18px 0 6px">${esc(title)}</h1>
    ${inner}
    <p style="color:#707070;font-size:12px;margin-top:22px">${esc(foot)}</p>
  </div>`;
const list = (services) => `<ul style="font-size:14px;margin:0 0 18px;padding-left:20px">${services.map((s) => `<li style="margin:0 0 4px">${esc(serviceLine(s))}</li>`).join('')}</ul>`;

// The team alert. When the row is not saved, the email is the only record and says so.
export function buildServiceEnquiryAlert({ enquiry, saved, ref = '', studioUrl = '' }) {
  const n = enquiry.services.length;
  const rows = [['From', [enquiry.name, enquiry.company].filter(Boolean).join(', ') || 'Not given'], ['Email', enquiry.email]];
  if (ROLE_LABELS[enquiry.role]) rows.push(['Role', ROLE_LABELS[enquiry.role]]);
  if (saved && ref) rows.push(['Enquiry', ref]);
  const words = visitorWords(enquiry.message);
  const subject = (saved ? 'New basket enquiry: ' : 'Basket enquiry NOT SAVED: ') + who(enquiry) + ', ' + n + ' service' + (n === 1 ? '' : 's');
  const intro = saved
    ? `A visitor sent one enquiry for ${n} service${n === 1 ? '' : 's'} from the basket. It is saved in the studio.`
    : `A visitor sent one enquiry for ${n} service${n === 1 ? '' : 's'} from the basket, but it could not be saved in the studio. This email is the only record. Reply from here and add it to the CRM by hand.`;
  const html = frame(saved ? 'New basket enquiry' : 'Basket enquiry not saved', `
    <p style="color:#b0b0b0;font-size:14px;margin:0 0 14px">${esc(intro)}</p>
    <p style="font-size:14px;margin:0 0 6px"><b>Services</b></p>${list(enquiry.services)}
    ${words ? `<p style="font-size:14px;white-space:pre-wrap;margin:0 0 18px">${esc(words)}</p>` : ''}
    <table style="font-size:14px;border-collapse:collapse;margin:0 0 18px">${rows.map(([k, v]) =>
      `<tr><td style="color:#b0b0b0;padding:4px 16px 4px 0;vertical-align:top">${esc(k)}</td><td style="color:#f5f5f5;padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>
    ${saved && studioUrl ? `<a href="${esc(studioUrl)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:800;color:#0e1611;background:#c8ff00;text-decoration:none;border-radius:100px">Open enquiries</a>` : ''}`,
  'Internal alert from the website basket. Do not forward.');
  const text = [intro, '', 'Services:', ...enquiry.services.map((s) => '- ' + serviceLine(s)), ...(words ? ['', words] : []), '',
    ...rows.map(([k, v]) => k + ': ' + v), ...(saved && studioUrl ? ['', 'Open enquiries: ' + studioUrl] : [])].join('\n');
  return { subject, html, text };
}

// The visitor's confirmation: what they asked about, and that the team replies. No prices, no promises of time.
export function buildServiceEnquiryConfirmation({ enquiry, ref = '' }) {
  const n = enquiry.services.length;
  const hello = enquiry.name ? 'Hello ' + enquiry.name.split(' ')[0] + ',' : 'Hello,';
  const body = `Thank you for your enquiry. We have your request about ${n === 1 ? 'this service' : 'these ' + n + ' services'}:`;
  const close = 'The team will reply to you at this email address.';
  const subject = 'Your Greatstone enquiry' + (ref ? ' (' + ref + ')' : '');
  const html = frame('We have your enquiry', `
    <p style="font-size:14px;margin:0 0 10px">${esc(hello)}</p>
    <p style="font-size:14px;margin:0 0 10px">${esc(body)}</p>${list(enquiry.services)}
    <p style="font-size:14px;margin:0 0 6px">${esc(close)}</p>
    ${ref ? `<p style="color:#b0b0b0;font-size:13px;margin:12px 0 0">Reference: ${esc(ref)}</p>` : ''}`,
  'Greatstone International Ltd. You get this email because you sent an enquiry on our website.');
  const text = [hello, '', body, ...enquiry.services.map((s) => '- ' + serviceLine(s)), '', close, ...(ref ? ['', 'Reference: ' + ref] : [])].join('\n');
  return { subject, html, text };
}

export const serviceDealTitle = (enquiry) => `Service enquiry: ${who(enquiry).slice(0, 80)}`;

export function serviceDealNote({ enquiry, ref = '', studioUrl = '' }) {
  const words = visitorWords(enquiry.message);
  const rows = [['Role', ROLE_LABELS[enquiry.role]], ['Company', enquiry.company], ['Enquiry', ref]].filter(([, v]) => v);
  return [
    '<p><b>Basket enquiry</b> from the website.</p>',
    `<p>Services:</p><ul>${enquiry.services.map((s) => `<li>${esc(serviceLine(s))}</li>`).join('')}</ul>`,
    rows.map(([k, v]) => `<p>${esc(k)}: ${esc(v)}</p>`).join(''),
    words ? `<p>Message: ${esc(words)}</p>` : '',
    studioUrl ? `<p>Full enquiry in the studio: ${esc(studioUrl)}</p>` : '',
  ].join('');
}

// One Person (deduped by email) and one Deal per enquiry, with the services in its note. Never throws: the
// visitor's answer does not wait on the CRM. Dormant until PIPEDRIVE_API_TOKEN is set (crmConfig).
export async function syncServiceEnquiryToCrm({ config, enquiry, ref, studioUrl, fetchImpl = (...a) => fetch(...a) }) {
  if (!config) return { synced: false, reason: 'not configured' };
  try {
    const person = await upsertPerson(config, fetchImpl, { contact_email: enquiry.email, contact_name: enquiry.name || enquiry.email });
    const deal = await call(config, fetchImpl, 'POST', '/deals', {
      title: serviceDealTitle(enquiry), person_id: person.id, ...(config.stageId ? { stage_id: config.stageId } : {}),
    });
    const dealId = Number(deal.id);
    let note = true;
    try { await call(config, fetchImpl, 'POST', '/notes', { deal_id: dealId, content: serviceDealNote({ enquiry, ref, studioUrl }) }); }
    catch { note = false; }
    return { synced: true, reason: note ? 'synced' : 'synced without note', personId: person.id, dealId };
  } catch (e) {
    return { synced: false, reason: String((e && e.message) || 'failed') };
  }
}

// The whole request. deps:
//   save(enquiry)        → id | null        null when the row could not be saved; throws { rateLimited } at the daily limit
//   sendAlert(msg)       → { sent, error? }
//   sendConfirmation(to, msg) → { sent, error? }
//   syncCrm({ enquiry, ref }) → { synced, reason }
//   log(level, msg)
// The lead is on record when the row is saved OR the team alert went; only when both fail does the visitor get
// { ok: false }. The confirmation and the CRM are best effort and never change the answer.
export async function handleServiceEnquiry(body, { studioUrl = '', save, sendAlert, sendConfirmation, syncCrm, log = () => {} } = {}) {
  if (body && typeof body === 'object' && body.website) return { status: 200, body: { ok: true } }; // honeypot
  const norm = normaliseServiceEnquiry(body);
  if (!norm.ok) return { status: 400, body: { ok: false, error: norm.error } };
  const { enquiry } = norm;

  let id = null;
  try { id = await save(enquiry); } catch (e) {
    if (e && e.rateLimited) return { status: 429, body: { ok: false, error: 'Too many enquiries from here today. Please email us instead.' } };
    id = null;
  }
  const ref = id ? String(id).slice(0, 8) : '';
  if (!id) log('error', 'service-inquiry: not saved, the alert carries it');

  let alert = { sent: false, error: 'not sent' };
  try { alert = await sendAlert(buildServiceEnquiryAlert({ enquiry, saved: !!id, ref, studioUrl })); } catch { alert = { sent: false, error: 'alert threw' }; }
  if (!alert.sent) log(id ? 'warn' : 'error', 'service-inquiry: alert not sent ' + (alert.error || ''));
  if (!id && !alert.sent) {
    log('error', 'service-inquiry: LOST, neither saved nor alerted');
    return { status: 503, body: { ok: false, error: 'We could not send your enquiry just now. Please email us instead.' } };
  }

  const [confirmation, crm] = await Promise.all([
    Promise.resolve().then(() => sendConfirmation(enquiry.email, buildServiceEnquiryConfirmation({ enquiry, ref }))).catch(() => ({ sent: false, error: 'threw' })),
    Promise.resolve().then(() => syncCrm({ enquiry, ref, studioUrl })).catch(() => ({ synced: false, reason: 'threw' })),
  ]);
  if (!confirmation.sent) log('warn', 'service-inquiry: confirmation not sent ' + (confirmation.error || ''));
  if (!crm.synced && crm.reason !== 'not configured') log('warn', 'service-inquiry: pipedrive ' + crm.reason);
  return { status: 200, body: { ok: true, id: id || ref || null } };
}
