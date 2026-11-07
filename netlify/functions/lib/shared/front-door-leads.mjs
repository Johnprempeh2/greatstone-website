// Front door leads (GRE-463, spec GRE-416 rev 2 §3 and S8): the row the `front-door` edge function saves at
// S5, the contact it adds at S6, and the internal Resend alert. Pure apart from sendEmail (fetch is
// injected), so `node --test` covers it and the edge function imports the same code.
// Table: supabase/migrations/0031_front_door_leads.sql. Studio tab: src/store/FrontDoorLeadsManager.jsx.

import { TEAM_SIZES } from './front-door-engine.mjs';
import { buildAgentPackage } from './front-door-package.mjs';

// The consent wording versions we have shown visitors (GRE-467). Add a new one here when the wording changes.
export const CONSENT_VERSIONS = ['front-door-consent-v1'];
export const CONTACT_LIMITS = { name: 80, email: 254, role: 80 };

const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const cap = (s, max) => squash(s).replace(/[<>]/g, '').slice(0, max);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

export const isLeadId = (s) => typeof s === 'string' && UUID_RE.test(s);

// The visit's source as the FrontDoor block sends it: { page, referrer, firstTouch, gaClientId }.
// Only the keys we asked for survive (spec §3: nothing typed in fields we did not ask for).
export function normaliseSource(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  if (src.page) out.page = cap(src.page, 200);
  if (src.referrer) out.referrer = cap(src.referrer, 200);
  const ft = src.firstTouch && typeof src.firstTouch === 'object' ? src.firstTouch : null;
  if (ft) {
    const t = {};
    for (const k of UTM_KEYS) if (ft[k]) t[k] = cap(ft[k], 120);
    if (ft.landing) t.landing = cap(ft.landing, 200);
    if (ft.referrer) t.referrer = cap(ft.referrer, 200);
    if (typeof ft.at === 'string' && !Number.isNaN(Date.parse(ft.at))) t.at = new Date(ft.at).toISOString();
    if (Object.keys(t).length) out.firstTouch = t;
  }
  if (typeof src.gaClientId === 'string' && /^\d{1,20}\.\d{1,20}$/.test(src.gaClientId)) out.gaClientId = src.gaClientId;
  for (const k of Object.keys(out)) if (out[k] === '') delete out[k];
  return out;
}

// The S5 row: anonymous. `intake` is normaliseIntake()'s output, `proposal` a validated 'ok' proposal.
// The chat itself is never stored, only how many messages the visitor sent and the model's summary.
export function leadRow({ orgId, intake, industryOther = false, proposal, turns = 0, source }) {
  return {
    org_id: orgId,
    industry: intake.industry,
    industry_other: industryOther === true,
    team_size: TEAM_SIZES.includes(intake.teamSize) ? intake.teamSize : null,
    brand_words: intake.words.slice(0, 3),
    company_name: intake.company,
    agents: proposal.agents,
    chat_summary: (proposal.chat_summary || []).slice(0, 5),
    chat_turns: Math.max(0, Math.min(Number(turns) || 0, 6)),
    source: normaliseSource(source),
    agent_package: buildAgentPackage({ intake, agents: proposal.agents }),  // B8 (GRE-468), migration 0034
  };
}

// The S6 step: { leadId, contact: { name, email, role }, consent: { given, version } }. Returns the column
// update for the lead, or null when the input is not usable. Consent counts only against wording we know.
export function contactUpdate(body, now = new Date()) {
  const c = body && typeof body.contact === 'object' && body.contact ? body.contact : null;
  if (!c) return null;
  const name = cap(c.name, CONTACT_LIMITS.name);
  const email = cap(c.email, CONTACT_LIMITS.email);
  const role = cap(c.role, CONTACT_LIMITS.role);
  if (!name || !role || !EMAIL_RE.test(email)) return null;
  const version = body.consent && CONSENT_VERSIONS.includes(body.consent.version) ? body.consent.version : null;
  const given = !!(body.consent && body.consent.given === true && version);
  const at = now.toISOString();
  return {
    contact_name: name, contact_email: email, contact_role: role, contact_at: at,
    consent_given: given, consent_at: given ? at : null, consent_version: version,
  };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const leadRef = (id) => (isLeadId(id) ? id.slice(0, 8) : '');

// S8: the internal alert. Industry, team size, company name and a link to the studio tab. The contact
// details stay in the studio; they are in the email only when the lead could not be saved (`contact`),
// so the alert is then the record and the lead is not lost.
// `packSent` (GRE-464): true or false says whether the visitor's team pack went; staff send it by hand when not.
/** @param {{ lead?: any, studioUrl?: string, contact?: any, packSent?: boolean | null }} [opts] */
export function buildAlertEmail({ lead = {}, studioUrl = '', contact = null, packSent = null } = {}) {
  const saved = !contact;
  const industry = lead.industry ? lead.industry + (lead.industry_other ? ' (typed in)' : '') : 'Not known';
  const size = lead.team_size ? lead.team_size + ' people' : 'Not given';
  const company = lead.company_name || 'Not known';
  const ref = leadRef(lead.id);
  const rows = [['Industry', industry], ['Team size', size], ['Company', company]];
  if (packSent !== null) rows.push(['Team pack', packSent ? 'Sent' : 'Not sent. Send it by hand.']);
  if (saved) {
    rows.push(['Consent to contact', lead.consent_given ? 'Yes' : 'No']);
    if (ref) rows.push(['Lead', ref]);
  } else {
    rows.push(['Name', contact.contact_name], ['Email', contact.contact_email], ['Role', contact.contact_role],
      ['Consent to contact', contact.consent_given ? 'Yes (' + contact.consent_version + ')' : 'No']);
  }
  const subject = (saved ? 'New front door lead: ' : 'Front door lead NOT SAVED: ') + company;
  const intro = saved
    ? 'A visitor met their three employees and asked for the team pack.'
    : 'A visitor asked for the team pack, but the lead could not be saved in the studio. This email is the only record. Add it to the CRM by hand.';
  const link = saved && studioUrl ? studioUrl : '';
  const html = `<div style="background:#1f1f1f;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;padding:28px;max-width:560px;margin:0 auto;border-radius:14px">
    <div style="font-weight:800;font-size:18px;letter-spacing:.04em">GREATST<span style="color:#c8ff00">O</span>NE</div>
    <h1 style="font-size:20px;margin:18px 0 6px">${saved ? 'New front door lead' : 'Front door lead not saved'}</h1>
    <p style="color:#b0b0b0;font-size:14px;margin:0 0 14px">${esc(intro)}</p>
    <table style="font-size:14px;border-collapse:collapse;margin:0 0 18px">${rows.map(([k, v]) =>
      `<tr><td style="color:#b0b0b0;padding:4px 16px 4px 0;vertical-align:top">${esc(k)}</td><td style="color:#f5f5f5;padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>
    ${link ? `<a href="${esc(link)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:800;color:#0e1611;background:#c8ff00;text-decoration:none;border-radius:100px">Open front door leads</a>` : ''}
    <p style="color:#707070;font-size:12px;margin-top:22px">Internal alert from the website front door. Do not forward.</p>
  </div>`;
  const text = [intro, '', ...rows.map(([k, v]) => k + ': ' + v), ...(link ? ['', 'Open front door leads: ' + link] : [])].join('\n');
  return { subject, html, text };
}

// One Resend call. Returns { sent: true } or { sent: false, error }; never throws.
export async function sendEmail({ apiKey, from, to, subject, html, text, fetchImpl = (...a) => fetch(...a) }) {
  if (!apiKey || !to) return { sent: false, error: 'not configured' };
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ from: from || 'Greatstone <onboarding@resend.dev>', to, subject, html, text }),
    });
    if (!res.ok) return { sent: false, error: 'resend ' + res.status };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: 'resend unreachable' };
  }
}
