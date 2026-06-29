// Bulk metadata (cycle 19) — the SET sibling of bulk-status (cycle 14, which is STATUS-ONLY). Folds the
// per-slug schedule (c12) / note (c13) / assignee (c19) helpers across a selection into ONE new state.
// SAFETY: every edge is ADDITIVE + REVERSIBLE metadata — publishAt is a scheduled-DATE field (NOT an
// auto-publisher; go-live stays the gated publish() in App.jsx, which never reads publishAt), note +
// assignee are editorial flags. clear* exactly undoes set*. NOTHING here publishes, approves, or deletes.
// Pure: no Date.now() (App injects ts+by, house rule); never mutates; no-ops ghost/unknown slugs.
// Store-free (imports three store-free models), so bare `node --test` loads it.
import { setSchedule, clearSchedule } from './schedule-model.mjs';
import { setNote, clearNote } from './notes-model.mjs';
import { setAssignee, clearAssignee } from './assignee-model.mjs';

// Fold a per-slug (state, slug) => newState helper across slugs. `count` = slugs that exist in
// state.pages (ghosts skipped — the helper no-ops them anyway, but we don't count a no-op). Returns
// the SAME state reference when nothing applied (count 0), a new state otherwise — mirroring bulkSetStatus.
function fold(state, slugs, fn) {
  if (!state || !state.pages || !Array.isArray(slugs)) return { state, count: 0 };
  let next = state, count = 0;
  for (const slug of slugs) {
    if (!next.pages[slug]) continue;          // ghost / unknown → skip, don't count
    next = fn(next, slug);
    count++;
  }
  return count ? { state: next, count } : { state, count: 0 };
}

export function bulkSetSchedule(state, slugs, ts) {
  if (!Number.isFinite(ts)) return { state, count: 0 }; // failed Date.parse upstream → no-op, no NaN publishAt
  return fold(state, slugs, (s, slug) => setSchedule(s, slug, ts));
}
export function bulkClearSchedule(state, slugs) {
  return fold(state, slugs, (s, slug) => clearSchedule(s, slug));
}
export function bulkSetNote(state, slugs, text, by, ts) {
  return fold(state, slugs, (s, slug) => setNote(s, slug, text, by, ts));
}
export function bulkClearNote(state, slugs) {
  return fold(state, slugs, (s, slug) => clearNote(s, slug));
}
export function bulkSetAssignee(state, slugs, who, by, ts) {
  return fold(state, slugs, (s, slug) => setAssignee(s, slug, who, by, ts));
}
export function bulkClearAssignee(state, slugs) {
  return fold(state, slugs, (s, slug) => clearAssignee(s, slug));
}
