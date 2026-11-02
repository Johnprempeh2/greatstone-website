export function proofBarsProblem(content = []) {
  for (const block of content) {
    if (block.type !== 'ProofBars') continue;
    const { source, date, bars } = block.props || {};
    if (!String(source || '').trim() || /^placeholder\b/i.test(String(source).trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return 'Proof bars need a source and a valid measurement date.';
    if (!Array.isArray(bars) || !bars.length || bars.some((bar) => !String(bar.label || '').trim() || /^placeholder\b/i.test(String(bar.label).trim()) || !Number.isFinite(Number(bar.value)) || Number(bar.value) < 0)) return 'Proof bars need labelled, non-negative measurements.';
  }
  return null;
}
