// Front door team pack (GRE-464, spec GRE-416 rev 2 S6 and S7): the branded email of the visitor's three
// employees, sent by the `front-door` edge function when the visitor asks for it at S6. It goes whether or
// not the consent box is ticked (GRE-467 B7: the tick is for follow-up, not for the pack).
// Pure and framework-free, like front-door-leads.mjs, so `node --test` covers the same code the edge
// function imports. Shell follows supabase/templates/_build.mjs: table layout, inline styles, CSS text
// wordmark (no remote images), dark text on the lime button, a VML button for Outlook, the raw link as a
// fallback. Voice: British English, sentence case, no em or en dashes.
//
// MIRRORS. The edge function cannot import from src/, so two constants are copied here and a test keeps
// them equal: BRAND_SIGNOFF (src/lib/brand.mjs) and BOOKING_URL (src/lib/booking.js).

export const BRAND_SIGNOFF = 'Greatstone International · The Foundation of Digital Excellence';
export const BOOKING_URL = 'https://calendly.com/john-greatstoneinternational299/30min';

const ACCENT = '#c8ff00';
const CARD = '#1f1f1f';
const PANEL = '#262626';
const TEXT = '#f5f5f5';
const MUTED = '#9a9a9a'; // AA on the card (see _build.mjs)

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const list = (v, n) => (Array.isArray(v) ? v.map(squash).filter(Boolean).slice(0, n) : []);
// Booking and site links come from our own config, never the visitor; still, only https goes in an href.
const httpsOr = (u, fallback) => (/^https:\/\/[^\s"'<>]+$/.test(String(u || '')) ? String(u) : fallback);

// The three agents as the email shows them: the visible fields only (never chat_summary), lead first.
export function packAgents(agents) {
  const out = (Array.isArray(agents) ? agents : []).slice(0, 3).map((a) => ({
    name: squash(a && a.name),
    role: squash(a && a.role),
    isLead: !!(a && a.is_lead),
    personality: list(a && a.personality, 3),
    firstTasks: list(a && a.first_tasks, 3),
    worksWith: squash(a && a.works_with),
  })).filter((a) => a.name && a.role);
  return [...out.filter((a) => a.isLead), ...out.filter((a) => !a.isLead)];
}

function cardHtml(a) {
  const border = a.isLead ? ACCENT : '#333333';
  const initial = esc(a.name.charAt(0).toUpperCase());
  const lead = a.isLead
    ? `<p style="margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${ACCENT}">Lead: guards the brand and checks the other two</p>`
    : '';
  const traits = a.personality.length
    ? `<p style="margin:0 0 12px;font-size:13px;color:${MUTED}">${a.personality.map(esc).join(' &middot; ')}</p>` : '';
  const tasks = a.firstTasks.length
    ? `<p style="margin:0 0 4px;font-size:13px;font-weight:800;color:${TEXT}">First three tasks</p>
      <ol style="margin:0 0 12px;padding-left:18px;font-size:14px;line-height:1.5;color:${TEXT}">${a.firstTasks.map((t) => `<li style="margin:0 0 4px">${esc(t)}</li>`).join('')}</ol>` : '';
  const works = a.worksWith ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED}">${esc(a.worksWith)}</p>` : '';
  return `<tr><td style="padding:0 0 14px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PANEL};border:1px solid ${border};border-radius:12px">
      <tr><td style="padding:18px 20px">
        ${lead}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px"><tr>
          <td width="44" height="44" align="center" valign="middle" style="width:44px;height:44px;border-radius:22px;background:${a.isLead ? ACCENT : '#3a3a3a'};color:${a.isLead ? '#0e1611' : TEXT};font-weight:800;font-size:18px" aria-hidden="true">${initial}</td>
          <td style="padding-left:14px">
            <p style="margin:0;font-size:18px;font-weight:800;color:${TEXT}">${esc(a.name)}</p>
            <p style="margin:2px 0 0;font-size:14px;color:${MUTED}">${esc(a.role)}</p>
          </td>
        </tr></table>
        ${traits}${tasks}${works}
      </td></tr>
    </table>
  </td></tr>`;
}

function cardText(a) {
  return [
    a.name + ': ' + a.role + (a.isLead ? ' (lead: guards the brand and checks the other two)' : ''),
    ...(a.personality.length ? ['Personality: ' + a.personality.join(', ')] : []),
    ...(a.firstTasks.length ? ['First three tasks:', ...a.firstTasks.map((t, i) => '  ' + (i + 1) + '. ' + t)] : []),
    ...(a.worksWith ? [a.worksWith] : []),
  ];
}

// buildTeamPackEmail({ contactName, companyName, agents, bookingUrl, siteOrigin }) → { subject, html, text },
// or null when there is no team to send (the caller then sends nothing).
export function buildTeamPackEmail({ contactName = '', companyName = '', agents = [], bookingUrl = BOOKING_URL, siteOrigin = 'https://greatstoneint.com' } = {}) {
  const team = packAgents(agents);
  if (team.length === 0) return null;
  const name = squash(contactName).split(' ')[0];
  const company = squash(companyName);
  const booking = httpsOr(bookingUrl, BOOKING_URL);
  const site = httpsOr(String(siteOrigin || '').replace(/\/+$/, ''), 'https://greatstoneint.com');
  const heading = company ? 'Your first three employees at ' + company : 'Your first three employees';
  const greeting = name ? 'Hi ' + name + ',' : 'Hello,';
  const intro = 'Here is your team pack. Your three employees can run on different models: Claude, ChatGPT, Gemini.';
  const deep = 'Your first three are a start. The deep dive designs the whole company around your goal.';
  const cta = 'Book a 30-minute walk-through';
  const ctaWidth = Math.round(cta.length * 8.5 + 56);

  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#141414">
<div style="display:none;max-height:0;overflow:hidden">${esc(team.map((a) => a.name).join(', '))}: your team pack from Greatstone.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141414"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARD};border-radius:14px;font-family:Arial,Helvetica,sans-serif;color:${TEXT}">
    <tr><td style="padding:28px 28px 8px">
      <div style="font-weight:800;font-size:18px;letter-spacing:.04em">GREATST<span style="color:${ACCENT}">O</span>NE</div>
      <h1 style="font-size:22px;line-height:1.3;margin:18px 0 8px">${esc(heading)}</h1>
      <p style="color:${MUTED};font-size:14px;margin:0 0 4px">${esc(greeting)}</p>
      <p style="color:${MUTED};font-size:14px;line-height:1.55;margin:0 0 18px">${esc(intro)}</p>
    </td></tr>
    <tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${team.map(cardHtml).join('')}</table></td></tr>
    <tr><td style="padding:8px 28px 28px">
      <p style="color:${TEXT};font-size:15px;line-height:1.55;margin:0 0 16px">${esc(deep)}</p>
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(booking)}" style="height:44px;v-text-anchor:middle;width:${ctaWidth}px" arcsize="50%" fillcolor="${ACCENT}" stroke="f"><center style="color:#0e1611;font-family:Arial,sans-serif;font-size:14px;font-weight:bold">${esc(cta)}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!--><a href="${esc(booking)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:800;color:#0e1611;background:${ACCENT};text-decoration:none;border-radius:100px">${esc(cta)}</a><!--<![endif]-->
      <p style="color:${MUTED};font-size:12px;line-height:1.5;margin:16px 0 0">Or open this link: <a href="${esc(booking)}" style="color:#aeb4ad">${esc(booking)}</a></p>
      <p style="color:${MUTED};font-size:12px;line-height:1.5;margin:22px 0 0">You asked for this team pack on <a href="${esc(site)}" style="color:#aeb4ad">${esc(site.replace(/^https:\/\//, ''))}</a>. Questions? Just reply to this email.<br>${esc(BRAND_SIGNOFF)}</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    heading, '', greeting, intro, '',
    ...team.flatMap((a) => [...cardText(a), '']),
    deep, '',
    cta + ': ' + booking, '',
    'You asked for this team pack on ' + site.replace(/^https:\/\//, '') + '. Questions? Just reply to this email.',
    BRAND_SIGNOFF,
  ].join('\n');

  return { subject: company ? 'Your team pack for ' + company : 'Your team pack', html, text };
}

// The S6 send, once per lead. The edge function passes in the database and Resend steps:
//   claim()   → 'claimed' | 'taken' (already sent) | 'error', the UPDATE ... WHERE pack_sent_at IS NULL (0032)
//   release() → clears the claim after a failed send, so a retry can send
//   send(msg) → sendEmail's { sent, error }
// Returns { sent, reason }. Never throws: the contact is already saved, the pack must not undo that.
export async function deliverTeamPack({ lead, contact, claim, release, send, bookingUrl, siteOrigin }) {
  try {
    const email = buildTeamPackEmail({
      contactName: contact && contact.contact_name, companyName: lead && lead.company_name,
      agents: lead && lead.agents, bookingUrl, siteOrigin,
    });
    if (!email) return { sent: false, reason: 'no team' };
    if (!contact || !contact.contact_email) return { sent: false, reason: 'no address' };
    const got = await claim();
    if (got === 'taken') return { sent: true, reason: 'already sent' };
    if (got !== 'claimed') return { sent: false, reason: 'claim failed' };
    const out = await send({ to: contact.contact_email, ...email });
    if (out && out.sent) return { sent: true, reason: 'sent' };
    await release();
    return { sent: false, reason: (out && out.error) || 'send failed' };
  } catch (e) {
    return { sent: false, reason: 'unexpected' };
  }
}
