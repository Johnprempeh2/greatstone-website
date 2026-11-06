// The interview engine's hash routes (GRE-2612, docs/INTERVIEW-ENGINE.md "Pages"). Pure, so `node --test`
// covers them. App.jsx checks parseInterviewHash BEFORE the client portal's parsePortalHash, so
// #portal/interview… reaches the interview and never the portal's not-found screen.
//
// Port: the source's Next.js paths map one to one onto hash routes:
//   /interview            → #portal/interview            (view 'home')
//   /interview/session    → #portal/interview/session    (view 'session')
//   /interview/complete   → #portal/interview/complete   (view 'complete')
//   /interview/goodbye    → #portal/interview/goodbye    (view 'goodbye')
//   /interview/discarded  → #portal/interview/discarded  (view 'discarded')
//   /deliverable/<id>     → #portal/interview/results[/<engagementId>]  (view 'results', released synthesis only)
//   /join/<token>?team=   → #join/<token>[?team=<unitId>]               (view 'join')
// The source's searchParams (?seats=exhausted, ?consent=required, ?team=) ride after a '?' in the hash.

export const INTERVIEW_BASE = '#portal/interview';

/** Where "back to your portal" goes. Source: '/', the portal home. Port: the website's client portal. */
export const PORTAL_HOME_HASH = '#portal';

const VIEWS = new Set(['session', 'complete', 'goodbye', 'discarded', 'results']);

function parseQuery(q) {
  const out = {};
  if (!q) return out;
  for (const [k, v] of new URLSearchParams(q)) out[k] = v;
  return out;
}

/**
 * '#portal/interview[/<view>][?query]' → { view, query, engagementId? };
 * '#join/<token>[?team=<unitId>]' → { view: 'join', token, unitId, query };
 * anything else → null (not an interview route).
 * An unknown sub-path under #portal/interview is { view: 'notfound' }, never the portal.
 */
export function parseInterviewHash(hash) {
  const raw = String(hash || '');
  const qAt = raw.indexOf('?');
  const path = qAt >= 0 ? raw.slice(0, qAt) : raw;
  const query = parseQuery(qAt >= 0 ? raw.slice(qAt + 1) : '');

  const join = /^#\/?join\/([\w-]+)\/?$/i.exec(path);
  if (join) return { view: 'join', token: join[1], unitId: query.team || null, query };

  if (!/^#\/?portal\/interview(\/|$)/i.test(path)) return null;
  const rest = path.replace(/^#\/?portal\/interview\/?/i, '').replace(/\/+$/, '');
  if (!rest) return { view: 'home', query };
  const [view, id, ...more] = rest.split('/');
  const v = view.toLowerCase();
  if (v === 'results' && !more.length) {
    if (!id) return { view: 'results', query, engagementId: null };
    if (/^[\w-]+$/.test(id)) return { view: 'results', query, engagementId: id };
  }
  if (VIEWS.has(v) && !id) return { view: v, query };
  return { view: 'notfound', query };
}

/** The hash for a view: interviewHref('session') → '#portal/interview/session'. */
export function interviewHref(view = 'home', query) {
  const base = view === 'home' ? INTERVIEW_BASE : `${INTERVIEW_BASE}/${view}`;
  const qs = query ? new URLSearchParams(query).toString() : '';
  return qs ? `${base}?${qs}` : base;
}

/**
 * Port: a source `redirect('/interview/x')` arrives from the server as `{ redirect: '#portal/interview/x' }`.
 * Only interview and portal hashes are honoured, so a response can never send the browser off-site.
 */
export function safeRedirect(target) {
  const t = String(target || '');
  return /^#\/?portal(\/|$|\?)/i.test(t) ? t : null;
}
