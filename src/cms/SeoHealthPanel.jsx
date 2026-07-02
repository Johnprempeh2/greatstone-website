import PanelFrame from './PanelFrame.jsx';

// Read-only SEO health scorecard: renders checkSeo(state) — site-wide meta issues (missing / off-length
// title + description, cross-page duplicates) grouped by page, each with a Fix deep-link to the SEO editor.
// Advisory only; App owns the computation. Heading structure is checked under Accessibility (no overlap).
export default function SeoHealthPanel({ report, pages = {}, onFix, onClose, embedded }) {
  const groups = (report && report.groups) || [];
  const total = report ? report.total : 0;
  const title = (slug) => (pages[slug] && pages[slug].title) || slug;

  return (
    <PanelFrame embedded={embedded} label={<>SEO health {total ? <span className="gs-panel-count">{total}</span> : null}</>} name="SEO health" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Every page’s search-and-social meta, audited together: missing or off-length titles and
          descriptions, plus titles or descriptions reused across pages (which splits your ranking).
          <strong> Advisory only:</strong> it never changes anything. Heading structure is checked under
          Accessibility.
        </p>

        {total === 0 ? (
          <p className="gs-la-clean" role="status">✓ Every page’s SEO meta looks healthy. Nothing to fix.</p>
        ) : (
          groups.map((g) => (
            <section className="gs-la-group" key={g.pageSlug} aria-label={title(g.pageSlug) + ', ' + g.count + ' issues'}>
              <header className="gs-cs-grouph">
                <h3>{title(g.pageSlug)} <span className="gs-cs-sub">{g.count} issue{g.count === 1 ? '' : 's'}</span></h3>
                {onFix ? <button type="button" className="gs-btn ghost sm" onClick={() => onFix(g.pageSlug)} aria-label={'Fix SEO for ' + title(g.pageSlug)}>Fix</button> : null}
              </header>
              <ul className="gs-la-list">
                {g.issues.map((i, k) => (
                  <li className="gs-la-row" key={k}>
                    <span className={'gs-la-pill is-' + (i.severity === 'error' ? 'broken' : 'recoverable')}>{i.severity === 'error' ? 'Error' : 'Warning'}</span>
                    <span className="gs-la-body">
                      <span className="gs-la-where">{i.fieldLabel}{i.value != null ? ' · ' + i.value.length + ' chars' : ''}</span>
                      {i.value ? <span className="gs-cs-snippet">“{i.value.length > 90 ? i.value.slice(0, 90) + '…' : i.value}”</span> : null}
                      <span className="gs-la-target">{i.label}: {i.suggestion}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </PanelFrame>
  );
}
