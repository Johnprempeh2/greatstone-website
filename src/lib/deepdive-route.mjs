// Where the Deep Dive Portal lives, in one place.
//
// The name is settled: it stays the Deep Dive Portal. Every link and every route test goes through
// here anyway, so the shape of a URL is one edit rather than a hunt through the app.
export const DEEPDIVE_BASE = 'deepdive';

// Matches #deepdive and #deep-dive, with or without a leading slash, so an old link keeps working.
export const DEEPDIVE_HASH_RE = /^#\/?deep-?dive\b/i;
export const DEEPDIVE_SLUG_RE = /^#\/?deep-?dive\/([\w-]+)(?:$|\/|\?)/i;

// ANY item can be its own page: #deepdive/<slug>/<kind>/<id>.
//
// Sessions came first, but a question and an evidence item each need somewhere to hold what a row
// cannot: where the answer came from, how confident we are in it, what it made us ask next, and the
// history of who changed it and when. Ids carry a colon (q:1908dcbf), which is legal in a fragment
// and needs no encoding.
// A unit has no page of its own on purpose: the Organisation tab already shows it with
// everything in it. Listing a kind here that nothing routes would make a link fall silently through
// to the Overview, which is worse than not linking at all.
export const ITEM_KINDS = ['session', 'question', 'evidence', 'process', 'source', 'person', 'build', 'competitor', 'kpi', 'hypothesis'];
export const DEEPDIVE_ITEM_RE =
  new RegExp(`^#\\/?deep-?dive\\/([\\w-]+)\\/(${ITEM_KINDS.join('|')})\\/([\\w:-]+)`, 'i');

/** Link to a client's record. Pass a customers.slug; a customer with nothing gathered yet gets the
 *  empty state rather than a dead link, which is the point of the record existing from day one. */
export const deepDiveHref = (slug) => `#${DEEPDIVE_BASE}${slug ? '/' + encodeURIComponent(slug) : ''}`;

/** One item's own page. */
export const itemHref = (slug, kind, id) => `${deepDiveHref(slug)}/${kind}/${id}`;

// Kept because sessions were the first thing to get a page and the name reads better at call sites.
export const sessionHref = (slug, sessionId) => itemHref(slug, 'session', sessionId);
export const questionHref = (slug, questionId) => itemHref(slug, 'question', questionId);
export const evidenceHref = (slug, evidenceId) => itemHref(slug, 'evidence', evidenceId);
