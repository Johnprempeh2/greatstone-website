// Pure expiry classification for licence keys — shared by the LicenceKeys badge, the #account renewal
// nudge, and unit tests. No React / DOM / Supabase deps so it runs under plain `node --test`.
// Returns null when there's no usable date (absent or Invalid Date — never throws, never NaN).

export function daysUntil(expiresAt, now = Date.now()) {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - now) / 86400000);
}

// Badge descriptor: red once past, amber within `soonDays`, nothing further out (kind 'ok', empty label).
export function expiryInfo(expiresAt, soonDays = 30, now = Date.now()) {
  const days = daysUntil(expiresAt, now);
  if (days === null) return null;
  if (days < 0) return { kind: 'over', label: 'Expired', cls: 'lk-exp-over', days };
  if (days === 0) return { kind: 'soon', label: 'Expires today', cls: 'lk-exp-soon', days };
  if (days <= soonDays) return { kind: 'soon', label: `Expires in ${days} day${days === 1 ? '' : 's'}`, cls: 'lk-exp-soon', days };
  return { kind: 'ok', label: '', cls: '', days };
}

// True when an *issued* key expires within `soonDays` (and not already past) — drives the renewal nudge.
export function isExpiringSoon(key, soonDays = 30, now = Date.now()) {
  if (!key || key.status !== 'issued') return false;
  const days = daysUntil(key.expires_at, now);
  return days !== null && days >= 0 && days <= soonDays;
}
