// Service popularity from real visitor interaction — detail-page views (weight 1) and add-to-inquiry
// (weight 3, stronger intent) — persisted to localStorage so the catalogue's "Popular" surface adapts
// to engagement with no backend. This is THIS visitor's signal (a privacy-safe "trending for you"); the
// global cross-visitor numbers flow to GA4 via track(). A Supabase counter could make it global later.
// Module singleton + useSyncExternalStore so the catalogue re-derives "Popular" the moment a count moves.
import { useSyncExternalStore } from 'react';

const KEY = 'gs_service_pop_v1';
const SEEN = 'gs_service_pop_seen_v1'; // per-session view dedupe so a refresh can't inflate a view
const subs = new Set();

function read() { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
let counts = read();

function commit(next) {
  counts = next;
  try { localStorage.setItem(KEY, JSON.stringify(counts)); } catch { /* in-memory still works */ }
  subs.forEach((f) => f());
}

export function getCounts() { return counts; }
function subscribe(f) { subs.add(f); return () => subs.delete(f); }
export function usePopularity() { return useSyncExternalStore(subscribe, getCounts, getCounts); }

// kind: 'view' (deduped once per session per slug) | 'inquiry' (every add — strong intent)
export function bumpService(slug, kind = 'view') {
  if (!slug) return;
  if (kind === 'view') {
    try {
      const seen = JSON.parse(sessionStorage.getItem(SEEN) || '[]');
      if (Array.isArray(seen) && seen.includes(slug)) return; // already counted this session
      sessionStorage.setItem(SEEN, JSON.stringify([...(Array.isArray(seen) ? seen : []), slug]));
    } catch { /* sessionStorage unavailable — still count */ }
  }
  const w = kind === 'inquiry' ? 3 : 1;
  commit({ ...counts, [slug]: (counts[slug] || 0) + w });
}

// the most-interacted slugs, highest first (only those with any interaction)
export function topSlugs(counts_ = counts, n = 12) {
  return Object.entries(counts_).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, n);
}
export function popularityOf(slug) { return counts[slug] || 0; }
