// Saved sections: a library of named, reusable blocks (state.sections = [{ id, label, type, props, ts }]).
// An editor saves a configured block from any page, then inserts a fresh-id COPY into any page. The
// id-remap mirrors duplicatePage (store.js) — re-mint props.id (and, defensively, any nested item id) so
// an inserted copy never collides with the source or with itself. Pure: every mutation returns a NEW
// state, and the id factory is INJECTED (the app passes store.rid; tests pass a deterministic counter) so
// the model is testable without rid's Math.random.

// Deep-clone a block ({type, props}) and re-mint every key named `id` at any depth — the top-level
// props.id (every rendered block needs a stable id; withAnchor wraps on it) plus any nested item id.
export function remapIds(block, mintId) {
  const type = (block && block.type) || 'blk';
  const reItem = (v) => {
    if (Array.isArray(v)) return v.map(reItem);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = (k === 'id' ? mintId(type) : reItem(v[k]));
      return o;
    }
    return v;
  };
  const clone = JSON.parse(JSON.stringify(block)); // structural deep-clone, same mechanism as duplicatePage
  const props = reItem(clone.props || {});
  if (!props.id) props.id = mintId(type);
  return { ...clone, props };
}

// the fresh-id {type, props} block to append to a page from a saved section (drops the section's id/label).
export function buildInsertBlock(section, mintId) {
  return remapIds({ type: section.type, props: section.props }, mintId);
}

// Save a configured block as a named preset — a deep-cloned SNAPSHOT, so a later edit to the source page
// (or to the inserted copy) can't mutate the saved preset.
export function addSection(state, block, label, mintId) {
  if (!block || !block.type) return state;
  const snapshot = JSON.parse(JSON.stringify({ type: block.type, props: block.props || {} }));
  const section = { id: mintId('sec'), label: (label || '').trim() || block.type, type: block.type, props: snapshot.props, ts: Date.now() };
  return { ...state, sections: [section, ...(state.sections || [])] };
}

export function removeSection(state, id) {
  return { ...state, sections: (state.sections || []).filter((s) => s.id !== id) };
}

export function renameSection(state, id, label) {
  const next = (label || '').trim();
  if (!next) return state; // a blank rename keeps the old label (mirrors renamePage's title guard)
  return { ...state, sections: (state.sections || []).map((s) => (s.id === id ? { ...s, label: next } : s)) };
}

export function listSections(state) {
  return [...((state && state.sections) || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
