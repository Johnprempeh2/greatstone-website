// Pure monthly-spend bucketing for the #org relationship-pulse sparkline. Sums live order totals (excluding
// cancelled + refunded) by calendar month, returns the last N months, and flags whether there's an actual
// trend (>= 2 months) so a single month never renders as a one-bar "trend". Undated orders are skipped rather
// than mis-bucketed. No React deps so it runs under plain `node --test`.

export function monthlySpend(orders, opts = {}) {
  const maxMonths = opts.maxMonths || 6;
  const live = (Array.isArray(orders) ? orders : []).filter(o => o && o.status !== 'cancelled' && o.status !== 'refunded');
  const byMonth = {};
  for (const o of live) {
    const d = new Date(o.placed_at || o.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    byMonth[k] = (byMonth[k] || 0) + (Number(o.total_minor) || 0);
  }
  const months = Object.keys(byMonth).sort().slice(-maxMonths);
  const max = Math.max(1, ...months.map(m => byMonth[m]));
  const total = live.reduce((s, o) => s + (Number(o.total_minor) || 0), 0);
  const curr = (live[0] && live[0].currency) || 'GBP';
  return { months, byMonth, max, total, curr, hasTrend: months.length >= 2 };
}
