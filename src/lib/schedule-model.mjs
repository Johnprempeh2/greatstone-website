// Publish-scheduling intent model. `publishAt` is OPTIONAL reversible metadata on a page (epoch ms, or
// absent === "not scheduled"). NOTHING here triggers a go-live: classify/list are pure reads; set/clear
// return a NEW state for setState to apply. Go-live stays the manual, admin-gated, preflight-checked
// publish() in App.jsx — it never reads publishAt. Every fn that compares against the clock takes `now`
// as a parameter and never calls Date.now() (house rule — keeps the model node --test deterministic).

const DAY = 86400000;

// ---- field read: absent / null / non-finite all collapse to null ("not scheduled"), never throws.
export function pageSchedule(page) {
  if (!page) return null;
  const ts = page.publishAt;
  return Number.isFinite(ts) ? ts : null;
}

// ---- drift: is the page actually live with its current content? Mirrors ReleaseBoard's drift signal
// (a page is live & current only if published != null AND data deep-equals published), tightened with
// status === 'published'. A never-published page (published == null) is NOT live.
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function isLiveCurrent(page) {
  return !!page && page.status === 'published' && page.published != null && eq(page.data, page.published);
}

// ---- classify:
//   'none'      — no publishAt set, OR the embargo passed AND the page is already live & current (spent).
//   'scheduled' — publishAt in the future (publishAt > now).
//   'overdue'   — publishAt <= now AND the page is NOT already live with current content (the embargo
//                 time passed but an admin hasn't run the manual publish).
export function classifySchedule(page, now) {
  const ts = pageSchedule(page);
  if (ts == null) return 'none';
  if (ts > now) return 'scheduled';
  return isLiveCurrent(page) ? 'none' : 'overdue';
}

// ---- list / group: walk `order`, classify each, return the two actionable buckets.
// scheduled: soonest-first; overdue: most-overdue-first (both ascending publishAt).
export function listSchedules(state, now) {
  const order = (state && state.order) || [];
  const pages = (state && state.pages) || {};
  const scheduled = [];
  const overdue = [];
  for (const slug of order) {
    const page = pages[slug];
    if (!page) continue;
    const bucket = classifySchedule(page, now);
    if (bucket === 'none') continue;
    const entry = { slug, title: page.title, status: page.status, publishAt: pageSchedule(page), bucket };
    (bucket === 'scheduled' ? scheduled : overdue).push(entry);
  }
  scheduled.sort((a, b) => a.publishAt - b.publishAt);
  overdue.sort((a, b) => a.publishAt - b.publishAt);
  return { scheduled, overdue };
}

// ---- relative human string: "in 3 days" / "tomorrow" / "in 5 h" / "now" / "2 days overdue".
export function describeDue(ts, now) {
  if (!Number.isFinite(ts)) return '';
  const diff = ts - now; // >0 future, <0 past
  const ahead = diff >= 0;
  const abs = Math.abs(diff);
  if (abs < 3600000) { // < 1h
    const m = Math.round(abs / 60000);
    if (m < 1) return ahead ? 'now' : 'just now overdue';
    return ahead ? 'in ' + m + ' min' : m + ' min overdue';
  }
  if (abs < DAY) { // < 1 day
    const h = Math.round(abs / 3600000);
    return ahead ? 'in ' + h + ' h' : h + ' h overdue';
  }
  const d = Math.round(abs / DAY);
  if (ahead) return d === 1 ? 'tomorrow' : 'in ' + d + ' days';
  return d === 1 ? '1 day overdue' : d + ' days overdue';
}

// ---- set / clear: return a NEW state via shallow merge (mirrors patchPage / store {...p,...patch});
// never mutate. clearSchedule writes publishAt:null so the embargo is genuinely removed (classify → none).
export function setSchedule(state, slug, ts) {
  const page = state && state.pages && state.pages[slug];
  if (!page) return state;
  return { ...state, pages: { ...state.pages, [slug]: { ...page, publishAt: ts } } };
}
export function clearSchedule(state, slug) {
  const page = state && state.pages && state.pages[slug];
  if (!page) return state;
  return { ...state, pages: { ...state.pages, [slug]: { ...page, publishAt: null } } };
}

// ---- component helper (co-located, not part of the pure clock model): ms → the value a
// <input type="datetime-local"> expects ("YYYY-MM-DDTHH:mm", local zone). Date formatting only.
export function toLocalInput(ts) {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
