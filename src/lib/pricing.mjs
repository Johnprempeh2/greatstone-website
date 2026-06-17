// Greatstone pricing/discount engine — the single source of price truth.
// PURE (no I/O). Money is integer minor units (pence). Designed to run server-side
// (Supabase Edge Function) and be reused for the studio's read-only "preview as tier".
// Spec: docs/SYSTEM-SPEC.md Part 3.
//
// Invariants (the one sentence an admin can trust):
//   "Rules don't stack. The best single eligible rule applies. Prices never go below the floor,
//    never go negative, and POA items are never discounted."

/** A rule's shape (mirrors pricing_rules + resolved pricing_rule_targets):
 * { id, active, status, scopeType:'all'|'vendor'|'category'|'offering'|'tier',
 *   targets:{ vendorIds?, categoryIds?, offeringIds?, tierIds? },
 *   appliesToOfferingType:'product'|'service'|null,
 *   adjustmentType:'percentage'|'fixed', adjustmentValue (minor, fixed), adjustmentValuePct (percentage),
 *   currency, audience:'public'|'tier', audienceTierId, startsAt, endsAt, priority, floorFraction, label, createdAt } */

const asDate = (v) => v instanceof Date ? v : (v == null ? null : new Date(v));

/** Does a rule apply to this offering / customer-tier / moment? (eligibility, before maths) */
export function ruleApplies(rule, ctx) {
  if (!rule || rule.active !== true) return false;
  if (rule.status && rule.status !== 'published') return false;     // only published rules are live
  const now = asDate(ctx.now) || new Date(0);
  const s = asDate(rule.startsAt), e = asDate(rule.endsAt);
  if (s && now < s) return false;
  if (e && now > e) return false;
  if (rule.appliesToOfferingType && rule.appliesToOfferingType !== ctx.offering.type) return false;
  if (rule.audience === 'tier') {                                   // tier-gated: customer must be in the tier
    if (!ctx.tier || ctx.tier !== rule.audienceTierId) return false;
  }
  const t = rule.targets || {};
  switch (rule.scopeType) {
    case 'all':                                                     // catalogue-wide
    case 'tier':  return true;                                      // tier-wide (eligibility already gated by audience)
    case 'vendor':   return !!ctx.offering.vendorId   && (t.vendorIds   || []).includes(ctx.offering.vendorId);
    case 'category': return !!ctx.offering.categoryId && (t.categoryIds || []).includes(ctx.offering.categoryId);
    case 'offering': return (t.offeringIds || []).includes(ctx.offering.id);
    default: return false;
  }
}

/** The reduction (minor units) a rule would apply to `base`, or null if inapplicable. Never negative. */
export function ruleCut(rule, base, currency) {
  if (rule.adjustmentType === 'percentage') {
    const pct = Number(rule.adjustmentValuePct || 0);
    if (!(pct > 0)) return null;
    return Math.round(base * pct / 100);
  }
  if (rule.adjustmentType === 'fixed') {
    if (!rule.currency || rule.currency !== currency) return null;  // can't apply a GBP discount to a USD price
    const cut = Number(rule.adjustmentValue || 0);
    return cut > 0 ? cut : null;
  }
  return null;
}

/** Single-winner selection: lowest priority, then largest reduction, then newest. NO stacking. */
export function pickWinningRule(rules, ctx, base, currency) {
  const cands = [];
  for (const r of rules || []) {
    if (!ruleApplies(r, ctx)) continue;
    const cut = ruleCut(r, base, currency);
    if (cut == null || cut <= 0) continue;
    cands.push({ rule: r, cut });
  }
  if (!cands.length) return null;
  cands.sort((a, b) =>
    (a.rule.priority ?? 100) - (b.rule.priority ?? 100) ||         // lower priority wins
    b.cut - a.cut ||                                                // larger reduction wins
    String(b.rule.createdAt || b.rule.id || '').localeCompare(String(a.rule.createdAt || a.rule.id || '')) // newest
  );
  return cands[0];
}

/** The effective price for a variant given the live rules + (optional) customer tier.
 * Returns { base, final, currency, poa, hasDiscount, appliedRule, savedMinor }. */
export function effectivePrice(offering, variant, rules, tier = null, now = new Date()) {
  const base = variant?.basePriceMinor ?? null;
  const currency = variant?.currency ?? null;
  if (base == null) {                                               // POA — never discounted
    return { base: null, final: null, currency: null, poa: true, hasDiscount: false, appliedRule: null, savedMinor: 0 };
  }
  const ctx = { offering, tier: tier || null, now };
  const win = pickWinningRule(rules, ctx, base, currency);
  if (!win) return { base, final: base, currency, poa: false, hasDiscount: false, appliedRule: null, savedMinor: 0 };
  const floor = Math.round(base * Number(win.rule.floorFraction || 0));
  const final = Math.max(base - win.cut, floor, 0);                 // clamp: never below floor, never negative
  return {
    base, final, currency, poa: false,
    hasDiscount: final < base,
    appliedRule: { id: win.rule.id, label: win.rule.label || null },
    savedMinor: base - final,
  };
}

/** Lowest effective price across an offering's variants (drives the catalogue "from £X"). */
export function offeringFromPrice(offering, variants, rules, tier = null, now = new Date()) {
  let best = null;
  for (const v of variants || []) {
    const p = effectivePrice(offering, v, rules, tier, now);
    if (p.final == null) continue;
    if (best == null || p.final < best.final) best = p;
  }
  return best; // null if all POA
}

// ---- formatting (GBP; minor units) ----
export const fmtMoney = (minor, currency = 'GBP') =>
  minor == null ? 'POA'
    : new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minor / 100);
export const fmtFrom = (minor, currency = 'GBP') =>
  minor == null ? 'Price on application' : 'from ' + fmtMoney(minor, currency);
