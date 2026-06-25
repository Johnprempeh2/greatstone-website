// Service popularity — now GLOBAL (cross-visitor) via a Supabase counter, with a local cache for an
// instant warm start and an offline fallback. Interaction weights: a detail-page view = 1, an
// add-to-inquiry = 3 (stronger intent). Reads aggregate counts from `service_popularity` (public RLS
// read) and writes through the locked-down `bump_service_popularity` rpc (anon EXECUTE, SECURITY
// DEFINER — no direct table writes). Also mirrors each event to GA4. Module singleton +
// useSyncExternalStore so the catalogue's "Popular" surface re-derives the moment counts move.
import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase.mjs';

const KEY = 'gs_service_pop_v1';   // local cache of the global scores (warm start + offline fallback)
const SEEN = 'gs_service_pop_seen_v1'; // per-session view dedupe so a refresh can't inflate a view
const subs = new Set();

function readLocal() { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
function persist(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* quota — in-memory still works */ } }

let base = readLocal();   // authoritative scores: the cached/global counts (views + 3·inquiries)
const optimistic = {};    // this session's own bumps, applied on top so a visitor's action shows at once
let snapshot = { ...base };

function recompute() {
  const m = { ...base };
  for (const k in optimistic) m[k] = (m[k] || 0) + optimistic[k];
  snapshot = m;
  persist(snapshot); // warm cache for next visit (offline-safe); replaced by global on next load
  subs.forEach((f) => f());
}

export function getCounts() { return snapshot; }
function subscribe(f) { subs.add(f); return () => subs.delete(f); }
export function usePopularity() { return useSyncExternalStore(subscribe, getCounts, getCounts); }

let loadPromise = null;
// Pull the global aggregate once (idempotent — repeated calls reuse the in-flight/last promise). Sets it
// as the authoritative base; the session's optimistic bumps stay layered on top.
export function loadGlobalPopularity() {
  if (!supabase) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { data, error } = await supabase.from('service_popularity').select('slug,views,inquiries');
      if (error || !Array.isArray(data)) return;
      const g = {};
      for (const r of data) { if (r && r.slug) g[r.slug] = (r.views || 0) + 3 * (r.inquiries || 0); }
      base = g; recompute(); // recompute persists the merged (global + this session's optimistic) snapshot
    } catch { /* offline / unconfigured — keep the local cache */ }
  })();
  return loadPromise;
}

const GTM_SAFE = (slug) => String(slug || '').slice(0, 120);

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
  optimistic[slug] = (optimistic[slug] || 0) + w; // session delta — recompute() persists the merged snapshot
  recompute();
  // write through to the global counter (fire-and-forget; failures are non-fatal)
  if (supabase) { try { supabase.rpc('bump_service_popularity', { p_slug: GTM_SAFE(slug), p_kind: kind }).then(() => {}, () => {}); } catch { /* ignore */ } }
}

// the most-interacted slugs, highest first (only those with any interaction)
export function topSlugs(counts_ = snapshot, n = 12) {
  return Object.entries(counts_).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, n);
}
export function popularityOf(slug) { return snapshot[slug] || 0; }
