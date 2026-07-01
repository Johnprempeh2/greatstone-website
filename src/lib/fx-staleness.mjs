// How stale is the manually-set USD→GBP rate? The rate is set by hand (no automatic feed), so if nobody
// refreshes it while the real market rate drifts, the whole catalogue silently mis-prices — every product
// is stored in USD and shown in GBP as USD ÷ rate. This turns the rate's last-updated timestamp into a
// clear staleness signal for staff, so a forgotten rate gets caught before it under- or over-charges a
// live customer. Pure and unit-tested: no DB, no I/O, deterministic when `now` is passed in.

// Thresholds in days. Gentle nudge at two weeks; strong warning at a month (a month of unattended FX
// drift is enough to move a price by a meaningful amount while selling live).
export const FX_AGEING_DAYS = 14;
export const FX_STALE_DAYS = 30;

// Whole days between the rate's last update and `now`, or null if the timestamp is missing/unparseable.
export function fxStalenessDays(updatedAt, now = new Date()) {
  if (updatedAt == null) return null;
  const then = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  const t = then.getTime();
  if (!Number.isFinite(t)) return null;
  const ms = now.getTime() - t;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

// A UI-ready verdict: { days, level, label, warn }.
//   level: 'fresh' | 'ageing' | 'stale' | 'unknown'
//   warn:  true once it needs attention (ageing or stale), so callers can gate the "check it" nudge.
export function fxStaleness(updatedAt, now = new Date()) {
  const days = fxStalenessDays(updatedAt, now);
  if (days == null) return { days: null, level: 'unknown', label: 'Rate age unknown', warn: false };
  let level = 'fresh';
  if (days >= FX_STALE_DAYS) level = 'stale';
  else if (days >= FX_AGEING_DAYS) level = 'ageing';
  const ago = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return { days, level, label: `Rate last updated ${ago}`, warn: level === 'ageing' || level === 'stale' };
}
