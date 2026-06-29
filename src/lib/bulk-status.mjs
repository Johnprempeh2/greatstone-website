// Bulk-safe status moves — the studio's FIRST multi-select. SAFETY: only the two REVERSIBLE,
// NON-GATED edges (draft<->review) are ever applied. approved / published / delete are excluded BY
// CONSTRUCTION (not keys of SAFE_EDGES, not members of SAFE_STATUSES), so a bulk action can NEVER go
// live, admin-approve, or remove a page — independent of store.js TRANSITIONS (which is wider). Pure:
// no Date.now() (App injects ts+by, house rule — see notes-model.mjs); never mutates; no-ops anything
// invalid/gated/ghost. The statusHistory entry shape mirrors setStatus (App.jsx) minus `note`.
// Deliberately store-free: store.js imports puck.config.jsx (JSX), which bare `node --test` can't load.

export const SAFE_STATUSES = ['draft', 'review'];          // the ONLY bulk targets, ever
const SAFE_EDGES = { draft: 'review', review: 'draft' };   // reversible, statusHistory-only

// Can THIS page be bulk-moved to `to`? Double-lock: target must be a safe status AND the exact
// reversible edge from its current status. Cannot ever return true for approved/published.
export function canBulk(fromStatus, to) {
  return SAFE_STATUSES.includes(to) && SAFE_EDGES[fromStatus] === to;
}

// Apply `to` to every slug whose status legally + safely allows it; no-op the rest. Appends one
// { from, to, by, ts } statusHistory entry per moved page (no `note` — an automated trail). Returns
// { state, moved }: the same state reference when nothing moved, a new state otherwise. ONLY status +
// statusHistory ever change — page.data / page.published / approvedBy are never touched.
export function bulkSetStatus(state, slugs, to, by, ts) {
  if (!state || !state.pages || !SAFE_STATUSES.includes(to) || !Array.isArray(slugs)) {
    return { state, moved: 0 };
  }
  let moved = 0;
  const pages = { ...state.pages };
  for (const slug of slugs) {
    const p = pages[slug];
    if (!p || !canBulk(p.status, to)) continue; // skip invalid / gated / ghost / already-there
    const statusHistory = [...(p.statusHistory || []), { from: p.status, to, by: by || null, ts: Number.isFinite(ts) ? ts : null }];
    pages[slug] = { ...p, status: to, statusHistory };
    moved++;
  }
  return moved ? { state: { ...state, pages }, moved } : { state, moved: 0 };
}

// Which safe transition can be OFFERED for the current selection? Offered ONLY when its from-status
// matches EVERY selected (present) page — mixed/empty selection offers nothing, so the action-bar shows
// exactly one applicable button, never a mix. Returns [{ from, to, count }] or [].
export function bulkActions(pages, slugs) {
  if (!pages || !Array.isArray(slugs) || slugs.length === 0) return [];
  const present = slugs.map((s) => pages[s]).filter(Boolean);
  if (present.length === 0) return [];
  const statuses = new Set(present.map((p) => p.status));
  if (statuses.size !== 1) return []; // mixed selection → offer nothing
  const from = [...statuses][0];
  const to = SAFE_EDGES[from]; // undefined for approved/published → []
  return to ? [{ from, to, count: present.length }] : [];
}
