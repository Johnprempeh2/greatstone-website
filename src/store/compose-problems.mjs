// ComposeExplorer problems (GRE-3407), read from the site database through /api/compose-problems. The bundled source
// (src/data/compose-problems.mjs, which also generates the database seed) is the first paint and the offline
// fallback; the database answer replaces it once it arrives. Module singleton + useSyncExternalStore, as popularity.mjs.
import { useSyncExternalStore } from 'react';
import { problems as BUNDLED } from '../data/compose-problems.mjs';

const subs = new Set();
let snapshot = BUNDLED;

export function getProblems() { return snapshot; }
function subscribe(f) { subs.add(f); return () => subs.delete(f); }
export function useComposeProblems() { return useSyncExternalStore(subscribe, getProblems, getProblems); }

// a row is usable when it has an id, a title and a list of slugs; anything else keeps the bundled copy
const valid = (rows) => Array.isArray(rows) && rows.length > 0 &&
  rows.every((r) => r && typeof r.id === 'string' && typeof r.title === 'string' && Array.isArray(r.services));

let loadPromise = null;
export function loadComposeProblems(fetcher = (url) => fetch(url)) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const res = await fetcher('/api/compose-problems');
      if (!res.ok) return;
      const rows = await res.json();
      if (!valid(rows)) return;
      snapshot = rows.map((r) => ({ id: r.id, title: r.title, subline: r.subline || '', source: r.source || '',
        placeholder: !!r.placeholder, services: r.services }));
      subs.forEach((f) => f());
    } catch { /* offline or unconfigured: keep the bundled copy */ }
  })();
  return loadPromise;
}

// tests only: back to the bundled copy, and allow another load
export function resetComposeProblems() { snapshot = BUNDLED; loadPromise = null; subs.forEach((f) => f()); }
