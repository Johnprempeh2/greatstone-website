// Editorial-note model. `note` is OPTIONAL reversible metadata on a page:
//   { text, by, ts }  or  null / absent === "no note".
// A standing, human-authored flag for the team ("waiting on legal", "copy approved by Ben") — distinct
// from statusHistory (machine transitions) and the activity log (system events). Pure: read fns never
// throw; set/clear return a NEW state for setState (mirrors schedule-model's setSchedule). The model
// NEVER calls Date.now() — App passes `ts` + `by` (house rule; keeps node --test deterministic).

// read: absent / null / blank-text all collapse to null ("no note").
export function pageNote(page) {
  const n = page && page.note;
  if (!n || typeof n.text !== 'string' || !n.text.trim()) return null;
  return { text: n.text, by: n.by || null, ts: Number.isFinite(n.ts) ? n.ts : null };
}

// set: blank/whitespace text routes to clear (one canonical "no note" shape). Shallow-merge, no mutate.
export function setNote(state, slug, text, by, ts) {
  const page = state && state.pages && state.pages[slug];
  if (!page) return state;
  const t = String(text == null ? '' : text).trim();
  if (!t) return clearNote(state, slug);
  return { ...state, pages: { ...state.pages, [slug]: { ...page, note: { text: t, by: by || null, ts: Number.isFinite(ts) ? ts : null } } } };
}

export function clearNote(state, slug) {
  const page = state && state.pages && state.pages[slug];
  if (!page) return state;
  return { ...state, pages: { ...state.pages, [slug]: { ...page, note: null } } };
}

// list: walk `order`, return pages carrying a note, newest-first (mirrors listSchedules).
export function listNotes(state) {
  const order = (state && state.order) || [];
  const pages = (state && state.pages) || {};
  const out = [];
  for (const slug of order) {
    const page = pages[slug];
    if (!page) continue;
    const n = pageNote(page);
    if (!n) continue;
    out.push({ slug, title: page.title, status: page.status, text: n.text, by: n.by, ts: n.ts });
  }
  out.sort((a, b) => (b.ts || 0) - (a.ts || 0)); // newest-first; null ts sinks to the bottom
  return out;
}

// relative age, past-only: "just now" / "5 min ago" / "3 h ago" / "2 days ago". Takes `now` as a param.
export function describeNoteAge(ts, now) {
  if (!Number.isFinite(ts)) return '';
  const abs = Math.max(0, now - ts);
  if (abs < 60000) return 'just now';
  if (abs < 3600000) return Math.round(abs / 60000) + ' min ago';
  if (abs < 86400000) return Math.round(abs / 3600000) + ' h ago';
  const d = Math.round(abs / 86400000);
  return d === 1 ? '1 day ago' : d + ' days ago';
}
