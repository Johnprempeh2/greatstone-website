// Assignee model (cycle 19). `assignee` is OPTIONAL reversible metadata on a page:
//   { who, by, ts }  or  null / absent === "unassigned".
// A DIRECTED ownership flag ("ben owns this review") — distinct from the standing team note
// (notes-model), statusHistory (machine transitions), and the activity log (system events). Pure:
// read fns never throw; set/clear return a NEW state for setState (mirrors notes-model's setNote).
// The model NEVER calls Date.now() — App passes `ts` + `by` (house rule; keeps node --test deterministic).

// read: absent / null / blank `who` all collapse to null ("unassigned").
export function pageAssignee(page) {
  const a = page && page.assignee;
  if (!a || typeof a.who !== 'string' || !a.who.trim()) return null;
  return { who: a.who.trim(), by: a.by || null, ts: Number.isFinite(a.ts) ? a.ts : null };
}

// set: blank/whitespace `who` routes to clear (one canonical "unassigned" shape). Shallow-merge, no mutate.
export function setAssignee(state, slug, who, by, ts) {
  const page = state && state.pages && state.pages[slug];
  if (!page) return state;
  const w = String(who == null ? '' : who).trim();
  if (!w) return clearAssignee(state, slug);
  return { ...state, pages: { ...state.pages, [slug]: { ...page, assignee: { who: w, by: by || null, ts: Number.isFinite(ts) ? ts : null } } } };
}

export function clearAssignee(state, slug) {
  const page = state && state.pages && state.pages[slug];
  if (!page) return state;
  return { ...state, pages: { ...state.pages, [slug]: { ...page, assignee: null } } };
}

// list: walk `order`, return pages carrying an assignee, newest-first (mirrors listNotes).
export function listAssignees(state) {
  const order = (state && state.order) || [];
  const pages = (state && state.pages) || {};
  const out = [];
  for (const slug of order) {
    const page = pages[slug];
    if (!page) continue;
    const a = pageAssignee(page);
    if (!a) continue;
    out.push({ slug, title: page.title, status: page.status, who: a.who, by: a.by, ts: a.ts });
  }
  out.sort((a, b) => (b.ts || 0) - (a.ts || 0)); // newest-first; null ts sinks to the bottom
  return out;
}
