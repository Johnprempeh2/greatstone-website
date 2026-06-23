// Front-end-only "since last visit" greeting. Records the visit timestamp in localStorage per surface and
// returns a friendly gap string for the PREVIOUS visit (computed before overwriting). No server, no PII —
// just a local timestamp. now/storage are injectable so it runs under plain `node --test`.
// (A server-side per-user last-seen is the gated wishlist upgrade.)

export function firstNameOf(name) {
  const n = (name || '').trim();
  if (!n) return '';
  return n.split(/\s+/)[0];
}

// per-page-load memo of the real-storage path, so React StrictMode's dev double-invoke of a useState
// initializer (and any re-call) doesn't read back the timestamp it just wrote. Tests inject opts → bypass it.
const _seen = new Map();

// Returns e.g. "last here earlier today" / "last here yesterday" / "last here 5 days ago", or null on the
// first-ever visit / unavailable storage / a junk stored value. Records `now` as the latest visit (once).
export function sinceLastVisit(key, opts = {}) {
  const injected = opts.now !== undefined || opts.storage !== undefined;
  if (!injected && key && _seen.has(key)) return _seen.get(key);
  const now = opts.now != null ? opts.now : Date.now();
  const storage = opts.storage !== undefined ? opts.storage : (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!storage || !key) return null;
  let prev = null;
  try {
    const raw = storage.getItem(key);
    if (raw != null) { const n = Number(raw); if (Number.isFinite(n) && n > 0) prev = n; }
  } catch { /* storage blocked — degrade to no greeting */ }
  try { storage.setItem(key, String(now)); } catch { /* ignore */ }
  let result;
  if (prev === null || prev > now) result = null;          // first visit, or a clock that ran backwards
  else { const days = Math.floor((now - prev) / 86400000); result = days <= 0 ? 'last here earlier today' : days === 1 ? 'last here yesterday' : `last here ${days} days ago`; }
  if (!injected) _seen.set(key, result);
  return result;
}
