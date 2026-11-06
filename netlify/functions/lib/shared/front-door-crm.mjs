// Front door to Pipedrive (GRE-469 B9, spec GRE-416 rev 2 §3; docs/ANALYTICS-CRM-PLAN.md Layer 3): at S6
// the `front-door` edge function upserts a Person (deduped by email) and opens a Deal with a note of the
// team, so sales see who asked and where they came from. Only when the visitor ticked the contact box
// (GRE-467: no tick, no Pipedrive follow-up), and only once per lead (0033's pipedrive_synced_at claim).
// Dormant until PIPEDRIVE_API_TOKEN is set: the lead, the pack and the alert work the same without it.
// Pure apart from fetch (injected), like front-door-leads.mjs, so `node --test` covers the same code.
// No deal value: the front door quotes nothing.

const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const posInt = (v) => (/^\d{1,12}$/.test(String(v || '').trim()) ? Number(v) : null);

// Secrets and settings from the function's env. null means "not live yet", which is not an error.
// PIPEDRIVE_DOMAIN is the optional company subdomain (acme for acme.pipedrive.com); the token works without it.
export function crmConfig(env = {}) {
  const token = squash(env.PIPEDRIVE_API_TOKEN);
  if (!token) return null;
  const domain = squash(env.PIPEDRIVE_DOMAIN).toLowerCase();
  const base = /^[a-z0-9-]{1,63}$/.test(domain) ? `https://${domain}.pipedrive.com/api/v1` : 'https://api.pipedrive.com/v1';
  return { token, base, stageId: posInt(env.PIPEDRIVE_STAGE_ID) };
}

export const dealTitle = (lead) => `Front door: ${squash(lead && lead.company_name).slice(0, 80) || 'new team'}`;

// The note on the deal: what the visitor told us and the three employees, plus the visit's source.
// Contact details are on the Person; the chat summary stays in the studio.
export function dealNote({ lead, contact, studioUrl } = {}) {
  const l = lead || {};
  const src = l.source && typeof l.source === 'object' ? l.source : {};
  const ft = src.firstTouch || {};
  const rows = [
    ['Role', contact && contact.contact_role],
    ['Industry', l.industry_other ? `${l.industry} (their words)` : l.industry],
    ['Team size', l.team_size],
    ['Campaign', [ft.utm_source, ft.utm_medium, ft.utm_campaign].filter(Boolean).join(' / ')],
    ['First landing page', ft.landing],
    ['Converted on', src.page],
    ['GA client id', src.gaClientId],
  ].filter(([, v]) => squash(v));
  const agents = (Array.isArray(l.agents) ? l.agents : []).slice(0, 3)
    .map((a) => `<li>${esc(squash(a && a.name))}: ${esc(squash(a && a.role))}${a && a.is_lead ? ' (lead)' : ''}</li>`);
  return [
    '<p><b>Front door lead</b>. Contact consent given.</p>',
    rows.map(([k, v]) => `<p>${esc(k)}: ${esc(squash(v))}</p>`).join(''),
    agents.length ? `<p>Their three employees:</p><ul>${agents.join('')}</ul>` : '',
    studioUrl ? `<p>Full lead in the studio: ${esc(studioUrl)}</p>` : '',
  ].join('');
}

async function call(cfg, fetchImpl, method, path, body) {
  const res = await fetchImpl(cfg.base + path, {
    method,
    headers: { 'x-api-token': cfg.token, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || !data || data.success === false) throw new Error(`pipedrive ${method} ${path.split('?')[0]} ${res.status}`);
  return data.data;
}

// Dedupe by email (CRM plan): the first exact match, else a new Person.
async function upsertPerson(cfg, fetchImpl, contact) {
  const q = `/persons/search?term=${encodeURIComponent(contact.contact_email)}&fields=email&exact_match=true&limit=1`;
  const found = await call(cfg, fetchImpl, 'GET', q);
  const hit = found && Array.isArray(found.items) && found.items[0] && found.items[0].item;
  if (hit && posInt(hit.id)) return { id: Number(hit.id), created: false };
  const made = await call(cfg, fetchImpl, 'POST', '/persons', {
    name: contact.contact_name,
    email: [{ value: contact.contact_email, primary: true, label: 'work' }],
  });
  return { id: Number(made.id), created: true };
}

// S6. `claim` returns 'claimed' | 'taken' | 'error'; `release` undoes it after a failure so a later S6 can
// try again; `save` records the Pipedrive ids. Never throws: the visitor's answer does not wait on the CRM.
export async function syncLeadToCrm({ config, lead, contact, studioUrl, claim, release, save, fetchImpl = (...a) => fetch(...a) }) {
  if (!config) return { synced: false, reason: 'not configured' };
  if (!lead || !contact || contact.consent_given !== true) return { synced: false, reason: 'no consent' };
  if (!contact.contact_email || !contact.contact_name) return { synced: false, reason: 'no contact' };
  let got;
  try { got = await claim(); } catch { got = 'error'; }
  if (got === 'taken') return { synced: true, reason: 'already synced' };
  if (got !== 'claimed') return { synced: false, reason: 'claim failed' };
  try {
    const person = await upsertPerson(config, fetchImpl, contact);
    const deal = await call(config, fetchImpl, 'POST', '/deals', {
      title: dealTitle(lead), person_id: person.id, ...(config.stageId ? { stage_id: config.stageId } : {}),
    });
    const dealId = Number(deal.id);
    let note = true;
    try { await call(config, fetchImpl, 'POST', '/notes', { deal_id: dealId, content: dealNote({ lead, contact, studioUrl }) }); }
    catch { note = false; } // the deal is the record; a missing note is logged, not undone
    try { await save({ personId: person.id, dealId }); } catch { /* ids are a convenience; the claim stands */ }
    return { synced: true, reason: note ? 'synced' : 'synced without note', personId: person.id, dealId };
  } catch (e) {
    try { await release(); } catch { /* the log below is the trace */ }
    return { synced: false, reason: String((e && e.message) || 'failed') };
  }
}
