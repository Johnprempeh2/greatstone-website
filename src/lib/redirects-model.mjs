import { resolveRedirect } from './link-audit.mjs';

// Manage the slug-rename forwarding table (state.redirects = [{from, to, ts}]) that setSlug writes and
// the #go self-heal + link audit consume — but which nothing lets an editor view or prune. Pure CRUD +
// validation, mirroring setSlug/setNavigation conventions: mutations return a NEW state and on failure
// stamp a transient _redirectError code (like setSlug's _slugError); read helpers classify rows for the
// panel. Reuses resolveRedirect's chain/cycle semantics rather than reinventing them.

// mirror of store.RESERVED_SLUGS (duplicated to avoid a store <-> lib import cycle; store re-exports this).
const RESERVED = ['home', 'contact'];
const isLivePage = (state, slug) => !!(state && state.pages && state.pages[slug]);

// any cycle in the from→to graph? (a chain that revisits a node it has already seen)
function hasCycle(redirects) {
  for (const start of redirects) {
    let cur = start.from; const seen = new Set();
    while (cur) {
      if (seen.has(cur)) return true;
      seen.add(cur);
      const r = redirects.find((x) => x && x.from === cur);
      cur = r ? r.to : null;
    }
  }
  return false;
}

// the collapsed table that adding/repointing f→t produces: rewrite rows pointing AT f to t (a→f, f→t ⇒
// a→t), drop the stale f-row AND any self-redirect the rewrite created, then push f→t. Mirrors setSlug's
// chain-collapse (store.js:981) and, with the from!==to filter, can never leave a self-redirect.
function collapsed(redirects, f, t) {
  return (redirects || [])
    .map((r) => (r.to === f ? { ...r, to: t } : r))
    .filter((r) => r.from !== f && r.from !== r.to)
    .concat([{ from: f, to: t, ts: Date.now() }]);
}

// null when OK, else a stable error code: 'empty'|'same'|'from-reserved'|'from-live'|'exists'|'cycle'.
// The cycle check runs on the PROPOSED collapsed table, so a loop is judged on what would actually exist.
export function validateRedirect(state, from, to, opts = {}) {
  const f = (from || '').trim(), t = (to || '').trim();
  if (!f || !t) return 'empty';
  if (f === t) return 'same';
  if (RESERVED.includes(f)) return 'from-reserved';   // can't shadow a structural route
  if (isLivePage(state, f)) return 'from-live';        // a live page would never fire the redirect
  if ((state.redirects || []).some((r) => r && r.from === f && r.from !== opts.ignoreFrom)) return 'exists';
  const base = (state.redirects || []).filter((r) => r && r.from !== opts.ignoreFrom);
  if (hasCycle(collapsed(base, f, t))) return 'cycle';
  return null;
}

export function addRedirect(state, from, to) {
  const err = validateRedirect(state, from, to);
  if (err) return { ...state, _redirectError: err };
  return { ...state, redirects: collapsed(state.redirects || [], from.trim(), to.trim()), _redirectError: null };
}

export function removeRedirect(state, from) {
  return { ...state, redirects: (state.redirects || []).filter((r) => r.from !== from), _redirectError: null };
}

// repoint an existing redirect's target (from stays). Only empty/same/cycle apply — the row already passed
// the from-live/reserved checks when it was created (or by setSlug).
export function setRedirect(state, from, to) {
  const t = (to || '').trim();
  if (!from || !t) return { ...state, _redirectError: 'empty' };
  if (from === t) return { ...state, _redirectError: 'same' };
  const base = (state.redirects || []).filter((r) => r && r.from !== from);
  if (hasCycle(collapsed(base, from, t))) return { ...state, _redirectError: 'cycle' };
  return { ...state, redirects: collapsed(base, from, t), _redirectError: null };
}

// dedupe by from (last wins), drop self-redirects, collapse chains so every `to` is final. Pure/read-only;
// a defensive normaliser the panel + a future migrate hardening can use. Does not mutate the input.
export function normalizeRedirects(redirects, pages = {}) {
  const byFrom = new Map();
  (redirects || []).forEach((r) => { if (r && r.from && r.to && r.from !== r.to) byFrom.set(r.from, { ...r }); });
  const state = { pages, redirects: [...byFrom.values()] };
  const out = [];
  byFrom.forEach((r) => {
    const final = pages[r.to] ? r.to : (resolveRedirect(state, r.to) || r.to);
    if (final !== r.from) out.push({ ...r, to: final });
  });
  return out;
}

// classify ONE row: 'ok' (forwards to a live page) | 'target-missing' (dead-ends) | 'shadowed' (from is a
// live page now, so the redirect can never fire).
export function classifyRedirect(state, row) {
  if (!row) return 'target-missing';
  if (isLivePage(state, row.from)) return 'shadowed';
  return resolveRedirect(state, row.to) ? 'ok' : 'target-missing';
}

const STATUS_RANK = { 'target-missing': 0, shadowed: 1, ok: 2 };
// rows decorated with status + the resolved live target, problems first (target-missing, then shadowed,
// then ok), newest within a rank. Pure.
export function listRedirects(state) {
  return (state.redirects || [])
    .map((r) => ({ ...r, status: classifyRedirect(state, r), resolved: resolveRedirect(state, r.to) }))
    .sort((a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || (b.ts || 0) - (a.ts || 0));
}
