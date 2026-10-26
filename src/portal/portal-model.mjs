// Client portal, the logic behind the screens (GRE-1256; spec GRE-1227 revision 2, sections 2 and 3). Pure, so
// `node --test` covers routes, document states, the action panel's states and checks, and the journey marker.
// The screens: Portal.jsx (client) and PortalStaff.jsx (Clients & DX → Portal).

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ROUTE = new RegExp(`^#\\/?portal(?:\\/(doc|receipt)\\/(${UUID}))?\\/?$`, 'i');

/** #portal → home, #portal/doc/<id> → reader, #portal/receipt/<id> → receipt; anything else under #portal → not found. */
export function parsePortalHash(hash) {
  const h = String(hash || '');
  if (!/^#\/?portal(\/|$)/i.test(h)) return null;
  if (/^#\/?portal\/deep-dive\/?$/i.test(h)) return { view: 'deep-dive' };
  // the interview data processing agreement (GRE-2794); not #portal/interview…, which is the interview engine's
  if (/^#\/?portal\/agreement\/?$/i.test(h)) return { view: 'agreement' };
  const m = ROUTE.exec(h);
  if (!m) return { view: 'notfound' };
  if (!m[1]) return { view: 'home' };
  return { view: m[1].toLowerCase(), id: m[2].toLowerCase() };
}

// The journey stages 0 to 5 (Greatstone Method toolkit, GRE-1212). The Deep Dive is part of the route: no
// GITA-to-GDXP step.
export const JOURNEY = ['Lead and qualification', 'Executive Discovery', 'GITA', 'Commercial commitment', 'Deep Dive', 'GDXP'];

export const KIND_LABEL = {
  engagement_pack: 'Engagement Pack', nda: 'NDA', gita: 'GITA', terms: 'Terms', pre_read: 'Pre-read',
  north_star: 'North Star', investigation_plan: 'Investigation plan', gdxp: 'GDXP',
};

/**
 * Where the client is, from what has been published to them and what they have accepted. No stage is stored
 * for the portal yet, so this reads the documents: a GDXP means 5; a Deep Dive cannot be seen in phase 1;
 * a GITA agreed in principle (or terms accepted) means 3; a GITA published means 2; any Executive Discovery
 * document (pack, NDA, pre-read, North Star) means 1; nothing yet means 0.
 */
export function journeyStage(docs = [], acceptances = []) {
  const kinds = new Set(docs.map((d) => d.kind));
  const acted = new Set(acceptances.map((a) => a.document_id));
  const actedKind = (k) => docs.some((d) => d.kind === k && acted.has(d.id));
  if (kinds.has('gdxp')) return 5;
  if (kinds.has('investigation_plan')) return 4;
  if (actedKind('gita') || actedKind('terms')) return 3;
  if (kinds.has('gita') || kinds.has('terms')) return 2;
  if (['engagement_pack', 'nda', 'pre_read', 'north_star'].some((k) => kinds.has(k))) return 1;
  return 0;
}

export const fmtDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const sameEmail = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** The company's acceptance of a document (one per document in the portal), or null. */
export const acceptanceFor = (doc, acceptances = []) =>
  acceptances.filter((a) => a.document_id === doc.id).sort((x, y) => String(x.accepted_at).localeCompare(String(y.accepted_at)))[0] || null;

/** "To read", "Accepted on 10 Oct 2026" or "Agreed in principle on 10 Oct 2026". */
export function docState(doc, acceptances = []) {
  const a = acceptanceFor(doc, acceptances);
  if (!a) return { key: 'to_read', label: 'To read' };
  return a.action === 'agree_in_principle'
    ? { key: 'agreed', label: 'Agreed in principle on ' + fmtDay(a.accepted_at), acceptance: a }
    : { key: 'accepted', label: 'Accepted on ' + fmtDay(a.accepted_at), acceptance: a };
}

/** The signatory's name when we know it from the company's people, else their email. */
export function signatoryLabel(doc, members = []) {
  if (!doc.signatory_email) return '';
  const m = members.find((p) => sameEmail(p.email, doc.signatory_email));
  return (m && m.full_name) || doc.signatory_email;
}

/**
 * The action panel for this person:
 *   none               the document asks for nothing
 *   done               the company has acted (the receipt summary shows instead)
 *   waiting_signatory  a named signatory must act and this is someone else
 *   eligible           this person may act
 */
export function panelState(doc, { email, acceptances = [] } = {}) {
  if (!doc || doc.action === 'none' || !doc.action) return 'none';
  if (acceptanceFor(doc, acceptances)) return 'done';
  if (doc.signatory_email && !sameEmail(doc.signatory_email, email)) return 'waiting_signatory';
  return 'eligible';
}

/** Published documents that need this person's action, newest first. */
export function waitingForYou(docs = [], { email, acceptances = [] } = {}) {
  return docs.filter((d) => panelState(d, { email, acceptances }) === 'eligible')
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
}

export const FIELD_MAX = 200;

/** Field errors for the panel. Empty object when it can be sent. */
export function validatePanel({ name = '', title = '', confirmed = false } = {}) {
  const e = {};
  if (!String(name).trim()) e.name = 'Enter your full name.';
  else if (String(name).length > FIELD_MAX) e.name = `Your name can be ${FIELD_MAX} characters at most.`;
  if (!String(title).trim()) e.title = 'Enter your job title.';
  else if (String(title).length > FIELD_MAX) e.title = `Your job title can be ${FIELD_MAX} characters at most.`;
  if (!confirmed) e.confirmed = 'Tick the box to confirm.';
  return e;
}

/** The button stays disabled until the box is ticked and both fields are filled. */
export const canSubmit = (f) => Object.keys(validatePanel(f)).length === 0;

/**
 * What to tell the person when the database refused or could not be reached. Each sentence gives a next step;
 * nothing was recorded, so nothing is lost.
 */
export function acceptErrorMessage(error, ref = '') {
  const m = String((error && (error.message || error)) || '');
  const mail = 'email dx@greatstonesoftware.co.uk' + (ref ? ' with the reference ' + ref : '');
  if (/already accepted/i.test(m)) return 'This has already been accepted from your account. Reload the page to see the receipt.';
  if (/named signatory/i.test(m)) return 'This document is for its named signatory to accept. If that should be you, ' + mail + '.';
  if (/document not found/i.test(m)) return 'This document is no longer available to accept. It may have been replaced by a newer version. Go back to your portal, or ' + mail + '.';
  if (/confirmation box/i.test(m)) return 'Tick the box to confirm, then try again.';
  if (/name and job title/i.test(m)) return 'Enter your full name and job title, then try again.';
  if (/no email|only a signed-in client/i.test(m)) return 'Your account cannot accept documents yet. Contact us to correct your account: ' + mail + '.';
  return 'We could not record this. Nothing has been saved. Try again, or ' + mail + '.';
}

/** After a successful acceptance: which line the panel shows about the email copy. */
export function emailOutcome(job) {
  if (job && job.status === 'sent') return 'sent';
  if (job && (job.status === 'failed' || job.attempts > 0)) return 'failed';
  return 'pending';
}

/** The short reference a person can quote by email: the first 8 characters of an id. */
export const shortRef = (id) => String(id || '').slice(0, 8);

/** Demos placed after the section they belong to; any without a known section go at the end. */
export function placeDemos(sections = [], demos = []) {
  const ids = new Set(sections.map((s) => s.id));
  const after = {};
  const end = [];
  for (const d of demos || []) {
    if (!/^https:\/\/[^\s/]+/i.test(String(d && d.url))) continue;
    if (d.afterSection && ids.has(d.afterSection)) (after[d.afterSection] ||= []).push(d);
    else end.push(d);
  }
  return { after, end };
}

/** Staff: the state a document version shows in the Portal section. */
export const STAFF_STATUS = {
  draft: 'Draft', pending_approval: 'Waiting for approval', published: 'Published', withdrawn: 'Withdrawn', superseded: 'Superseded',
};

/** Staff: the receipt job state with the attempts, e.g. "Retrying (attempt 3 of 8)". */
export function receiptJobLabel(job, max = 8) {
  if (!job) return 'Not queued';
  if (job.status === 'sent') return 'Sent';
  if (job.status === 'failed') return 'Failed after ' + job.attempts + ' attempts';
  if (job.status === 'sending') return 'Sending';
  return job.attempts > 0 ? `Retrying (attempt ${job.attempts + 1} of ${max})` : 'Queued';
}

/** Staff: a draft's sections from the editor rows; empty rows dropped, ids kept stable. */
export function cleanSections(rows = []) {
  return rows.filter((r) => String(r.title || '').trim() || String(r.html || '').trim())
    .map((r, i) => ({ id: r.id || 's' + (i + 1), title: String(r.title || '').trim(), html: String(r.html || '') }));
}

/** Staff: demo rows that the database will take (label and an https:// url). Returns { demos, error }. */
export function cleanDemos(rows = []) {
  const demos = [];
  for (const r of rows) {
    const label = String(r.label || '').trim();
    const url = String(r.url || '').trim();
    if (!label && !url) continue;
    if (!label) return { demos, error: 'Each demo needs a label.' };
    if (!/^https:\/\/[^\s/]+/i.test(url)) return { demos, error: `The demo “${label}” needs a link that starts with https://` };
    const d = { label, url };
    if (String(r.note || '').trim()) d.note = String(r.note).trim();
    if (r.afterSection) d.afterSection = r.afterSection;
    demos.push(d);
  }
  return { demos, error: null };
}
