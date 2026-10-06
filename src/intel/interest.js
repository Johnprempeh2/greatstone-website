// AI Intelligence Hub — the engagement → interest → recommendation engine.
//
// We watch what a visitor actually opens and dwells on (which topics, which vendors), build a per-visitor
// interest profile that decays gently over time, and use it to rank a personalised "For you" feed. The
// same signal is pushed to the analytics dataLayer (track) so it can feed the CRM: a salesperson can see
// "this account keeps reading AI-security + model-comparison, most-viewed vendor Anthropic". Nothing
// identifying is stored or sent — topic ids, vendor domains and opaque item ids only.
import { track, optionalStorageAllowed } from '../lib/analytics.js';

const KEY = 'gs-intel-profile';
const HALF_LIFE_DAYS = 14;          // an interest halves in ~2 weeks of no reinforcement
const DAY = 86400000;
const MAX_READS = 80;               // cap the read history we keep

const now = () => Date.now();
const blank = () => ({ topics: {}, vendors: {}, reads: [], opens: 0, dwellMs: 0, createdAt: now(), updatedAt: now() });

function read() {
  if (typeof localStorage === 'undefined' || !optionalStorageAllowed()) return memoryProfile ? JSON.parse(JSON.stringify(memoryProfile)) : blank();
  try { const p = JSON.parse(localStorage.getItem(KEY) || 'null'); return p && p.topics ? p : blank(); }
  catch (e) { return blank(); }
}
// The profile is personalisation, so it is stored only after "Accept analytics" (GRE-659). Without
// consent the feed still works for this page load from the in-memory profile below.
let memoryProfile = null;
function write(p) {
  memoryProfile = p;
  if (typeof localStorage === 'undefined' || !optionalStorageAllowed()) return;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode / quota */ }
}

// apply exponential decay since last update so stale interests fade without ever hard-resetting
function decay(p) {
  const dt = (now() - (p.updatedAt || now())) / DAY;
  if (dt <= 0) return p;
  const k = Math.pow(0.5, dt / HALF_LIFE_DAYS);
  for (const m of [p.topics, p.vendors]) for (const id in m) { m[id] *= k; if (m[id] < 0.01) delete m[id]; }
  p.updatedAt = now();
  return p;
}

function bump(map, id, w) { if (!id) return; map[id] = (map[id] || 0) + w; }

// weight an engagement: a read is worth more than a hover; dwell adds on top
function reinforce(p, { topics = [], vendor, weight = 1 }) {
  for (const t of topics) bump(p.topics, t, weight);
  if (vendor) bump(p.vendors, vendor, weight);
  p.updatedAt = now();
}

export function getProfile() { const p = decay(read()); write(p); return p; }

// a visitor opened/expanded a briefing — the strongest signal
export function recordRead(b, dwellMs = 0) {
  if (!b) return;
  const p = decay(read());
  reinforce(p, { topics: b.topics || [], vendor: b.vendorDomain, weight: 1 + Math.min(dwellMs, 60000) / 60000 }); // up to +1 for a full minute
  p.reads.unshift({ id: b.id, at: now(), topics: b.topics || [], vendor: b.vendorDomain });
  p.reads = p.reads.slice(0, MAX_READS);
  p.opens += 1; p.dwellMs += dwellMs;
  write(p);
  track('intel_read', { item: b.id, vendor: b.vendorDomain, topics: (b.topics || []).join(','), dwell_ms: Math.round(dwellMs) });
}

// lighter signals
export function recordTopicFocus(topic) { const p = decay(read()); reinforce(p, { topics: [topic], weight: 0.5 }); write(p); track('intel_topic', { topic }); }
export function recordVendor(domain) { const p = decay(read()); reinforce(p, { vendor: domain, weight: 0.5 }); write(p); track('intel_vendor', { vendor: domain }); }
export function recordTab(tab) { track('intel_tab', { tab }); }
export function recordCompare(names) { track('intel_compare', { entries: (names || []).join(' vs ') }); }
export function recordOpen() { const p = read(); track('intel_open', { returning: (p.opens || 0) > 0 }); }
// dwell on an already-recorded read: a sales signal only, no profile re-weight (the read was counted on open)
export function recordDwell(id, dwellMs) { if (id && dwellMs > 400) track('intel_dwell', { item: id, dwell_ms: Math.round(dwellMs) }); }

// the top things this visitor cares about, for the "for you" header + the sales signal
export function topInterests(p = getProfile(), n = 4) {
  const rank = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, w]) => ({ id, w }));
  return { topics: rank(p.topics), vendors: rank(p.vendors), hasSignal: Object.keys(p.topics).length + Object.keys(p.vendors).length > 0 };
}

// score a briefing against the profile: interest match (topics + vendor) + freshness + intrinsic importance.
// Deterministic + cheap (no per-user LLM) so it scales to every visitor.
const IMPORTANCE = { high: 1, medium: 0.6, low: 0.3 };
export function scoreFor(b, p = getProfile()) {
  let s = 0;
  for (const t of b.topics || []) s += (p.topics[t] || 0) * 2;
  s += (p.vendors[b.vendorDomain] || 0) * 1.5;
  const ageDays = b.date ? Math.max(0, (now() - Date.parse(b.date)) / DAY) : 30;
  s += Math.max(0, 1 - ageDays / 30) * 0.8;                 // fresher ranks higher
  s += (IMPORTANCE[b.importance] || 0.3) * 0.6;
  return s;
}

// the personalised feed: highest-scoring first. When there's no signal yet, it falls back to
// importance + freshness, so a first-time visitor still sees a sensible "most important now" order.
export function rankForYou(briefings = [], p = getProfile()) {
  return [...briefings].map((b) => ({ b, s: scoreFor(b, p) })).sort((a, b) => b.s - a.s).map((x) => x.b);
}

// has the visitor engaged enough that a "for you" view is meaningful yet?
export function hasInterestSignal(p = getProfile()) { return (p.opens || 0) >= 2 || Object.keys(p.topics).length >= 2; }
