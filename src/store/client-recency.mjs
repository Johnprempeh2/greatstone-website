// Pure client-recency helpers for the staff portfolio-health bar + quiet-first sort. No React/Supabase deps,
// so they run under plain `node --test`. Buckets align with the existing staleBadge thresholds (amber >30d,
// red >60d). `now` is injectable for deterministic tests.

export function daysSince(iso, now = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / 86400000);
}

// active (≤7d) · steady (8–30) · quiet (31–60, amber) · cold (>60, red) · none (no engagement yet / bad date)
export function recencyBucket(iso, now = Date.now()) {
  const d = daysSince(iso, now);
  if (d === null) return 'none';
  if (d <= 7) return 'active';
  if (d <= 30) return 'steady';
  if (d <= 60) return 'quiet';
  return 'cold';
}

export const BUCKETS = ['active', 'steady', 'quiet', 'cold', 'none'];

// Count a list of last-activity ISO strings into the buckets above.
export function portfolioHealth(activityList, now = Date.now()) {
  const counts = { active: 0, steady: 0, quiet: 0, cold: 0, none: 0 };
  for (const iso of activityList || []) counts[recencyBucket(iso, now)] += 1;
  return counts;
}

// Sort key for "quiet first": more days since contact = higher; no activity = most quiet (Infinity).
export function quietFirstRank(iso, now = Date.now()) {
  const d = daysSince(iso, now);
  return d === null ? Infinity : d;
}
