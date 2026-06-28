import PanelFrame from './PanelFrame.jsx';

// Read-only Site Health scorecard: renders computeHealth(reports) — one quality score (0-100) + grade
// rolling up the six site audits (Link health, Navigation, Accessibility, SEO, Copy, Media), with a
// per-dimension breakdown worst-first and an Open deep-link into each audit. Advisory; App owns the
// computation. Models SeoHealthPanel's report/onFix shape; reuses gs-la-* classes (no new CSS).
const SEV_RANK = { error: 0, warn: 1, ok: 2 };
const PILL = { error: 'is-broken', warn: 'is-recoverable', ok: 'is-orphan' };
const PILL_TEXT = { error: 'Errors', warn: 'Warnings', ok: 'OK' };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

export default function SiteHealthPanel({ report, onFix, onClose, embedded }) {
  const r = report || { score: 100, grade: 'A', errors: 0, warnings: 0, dimensions: [] };
  const dims = [...(r.dimensions || [])].sort((a, b) => (SEV_RANK[a.severity] - SEV_RANK[b.severity]) || (b.count - a.count));
  const clean = r.score === 100;

  return (
    <PanelFrame embedded={embedded} label={<>Site health {r.grade ? <span className="gs-panel-count">{r.grade}</span> : null}</>} name="Site health" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          One score rolling up all six site audits. Each error costs 3 points, each warning 1, out of 100.
          <strong> Advisory only:</strong> a dashboard heuristic, not a verdict — open any dimension to act.
        </p>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', margin: '8px 0 4px' }}
          role="group" aria-label={'Site health score ' + r.score + ' out of 100, grade ' + r.grade}>
          <span style={{ fontSize: 46, fontWeight: 800, lineHeight: 1 }}>{r.score}<span style={{ fontSize: 18, opacity: 0.5, fontWeight: 600 }}>/100</span></span>
          <span style={{ fontSize: 30, fontWeight: 800 }} aria-hidden="true">{r.grade}</span>
          <span style={{ opacity: 0.7, fontSize: 13 }}>{plural(r.errors, 'error')} · {plural(r.warnings, 'warning')}</span>
        </div>

        {clean ? (
          <p className="gs-la-clean" role="status">✓ All six audits clean. Site health is grade A — 100/100.</p>
        ) : null}

        <ul className="gs-la-list" style={{ marginTop: 14 }} aria-label="Health by dimension">
          {dims.map((d) => (
            <li className="gs-la-row" key={d.key}>
              <span className={'gs-la-pill ' + PILL[d.severity]}>{PILL_TEXT[d.severity]}</span>
              <span className="gs-la-body">
                <span className="gs-la-where">{d.label}</span>
                <span className="gs-la-target">
                  {d.count === 0 ? 'No issues' : plural(d.count, 'issue') + (d.errors && d.warnings ? ' (' + plural(d.errors, 'error') + ', ' + plural(d.warnings, 'warning') + ')' : '')}
                </span>
              </span>
              {onFix && d.count > 0 ? <button type="button" className="gs-btn ghost sm" onClick={() => onFix(d.section)} aria-label={'Open ' + d.label}>Open</button> : null}
            </li>
          ))}
        </ul>
      </div>
    </PanelFrame>
  );
}
