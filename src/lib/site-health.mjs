// Site Health — a pure synthesis of the six site audits into ONE at-a-glance quality score, the roll-up
// cycles 1-10 deliberately skipped. Read-only: consumes the report objects App already memoises
// (auditLinks, checkVoice, checkA11y, checkSeo, auditNavCoverage, auditMedia) — it does NOT re-walk state
// or re-audit. Each dimension is normalised to {errors, warnings} from its native shape, then scored by
// ONE transparent rule: score = 100 − 3·errors − 1·warnings (clamped 0–100). The lone judgment is
// "an error outranks a warning" (3:1, the smallest integer ratio that makes one error beat two warnings)
// — the same error-before-warning split every audit panel already renders. No per-dimension weights, no
// magic thresholds: a clean site scores 100 / grade A, and the score is hand-reconstructable from the
// breakdown. An honest dashboard heuristic, not a certification.

const E = 3, W = 1; // error vs warning penalty — the only ordinal in the model

// `section` = the AdminConsole view id to deep-link to (letters-only, exists in ALL_VIEWS).
// `pick` adapts each report's native shape to {errors, warnings}. Two shapes are irregular:
//   • links — auditLinks returns {broken, recoverable, orphans[]}, NOT errors/warnings. orphans are a
//     navigation-coverage concern owned by navcheck (and empty without a nav tree), so they are NOT
//     folded in here — only broken→errors, recoverable→warnings, matching the live Link health panel.
//   • media — auditMedia hardcodes errors:0 (advisory); only counts.untracked + counts.missingAlt count
//     as warnings (the same numbers studioAttention.mediausage shows; `unused` is a storage hint).
const DIMS = [
  { key: 'links',      label: 'Link health',       section: 'links',
    pick: (r) => ({ errors: r.broken || 0, warnings: r.recoverable || 0 }) },
  { key: 'navcheck',   label: 'Navigation health', section: 'navcheck',
    pick: (r) => ({ errors: r.errors || 0, warnings: r.warnings || 0 }) },
  { key: 'access',     label: 'Accessibility',     section: 'access',
    pick: (r) => ({ errors: r.errors || 0, warnings: r.warnings || 0 }) },
  { key: 'seohealth',  label: 'SEO health',        section: 'seohealth',
    pick: (r) => ({ errors: r.errors || 0, warnings: r.warnings || 0 }) },
  { key: 'copy',       label: 'Copy coach',        section: 'copy',
    pick: (r) => ({ errors: r.hard || 0, warnings: r.flags || 0 }) },          // voice: hard=error, flags=warn
  { key: 'mediausage', label: 'Media usage',       section: 'mediausage',
    pick: (r) => ({ errors: 0, warnings: ((r.counts && r.counts.untracked) || 0) + ((r.counts && r.counts.missingAlt) || 0) }) },
];

const gradeFor = (s) => (s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F');

export function computeHealth(reports = {}) {
  const dimensions = DIMS.map((d) => {
    const norm = (reports[d.key] && d.pick(reports[d.key])) || {};
    const errors = norm.errors || 0;
    const warnings = norm.warnings || 0;
    const count = errors + warnings;
    const severity = errors ? 'error' : warnings ? 'warn' : 'ok';
    return { key: d.key, label: d.label, section: d.section, errors, warnings, count, severity };
  });
  const errors = dimensions.reduce((s, d) => s + d.errors, 0);
  const warnings = dimensions.reduce((s, d) => s + d.warnings, 0);
  const score = Math.max(0, Math.min(100, 100 - E * errors - W * warnings));
  // worst-first ACROSS dimensions: more errors first, then larger total count.
  const topIssues = dimensions
    .filter((d) => d.count > 0)
    .sort((a, b) => (b.errors - a.errors) || (b.count - a.count))
    .map((d) => ({ key: d.key, label: d.label, section: d.section, count: d.count, errors: d.errors, warnings: d.warnings, severity: d.severity }));
  return { score, grade: gradeFor(score), errors, warnings, dimensions, topIssues };
}
