// Pure helper for the #org "Your next move" card: quantify the honest gap the recommended move closes.
// Given the recommended (weakest) pillar's current score and the maturity dataset's target + industry
// benchmark for that same pillar, return the gap to the engagement's target tier if present, else the
// standing vs the industry benchmark. Returns null when neither reference exists (never invents a number).
// No React deps so it runs under plain `node --test`.

const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };
const r1 = (n) => Math.round(n * 10) / 10;

export function moveGap(value, refs = {}) {
  const v = num(value);
  if (v == null || v <= 0) return null;
  const t = num(refs.target);
  if (t != null && t > v) {
    return { kind: 'target', value: r1(v), ref: r1(t), delta: r1(t - v) };
  }
  const b = num(refs.benchmark);
  if (b != null && b > 0) {
    return { kind: 'benchmark', value: r1(v), ref: r1(b), delta: r1(v - b) }; // delta > 0 ahead, < 0 behind
  }
  return null;
}
