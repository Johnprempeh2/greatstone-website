import PanelFrame from './PanelFrame.jsx';

// Read-only Navigation health scorecard: renders auditNavCoverage(state) — menu items pointing at
// unpublished pages, dead custom links, empty dropdowns, and published pages absent from the menu —
// grouped by the page (or the menu itself) each concerns, with a Fix deep-link into the Navigation editor.
// Advisory; App owns the computation. Broken/renamed link targets stay owned by Link health (no overlap).
export default function NavCoveragePanel({ report, pages = {}, onFix, onClose, embedded }) {
  const groups = (report && report.groups) || [];
  const total = report ? report.total : 0;
  const NAV = '(navigation)';
  const title = (slug) => (slug === NAV ? 'Navigation menu' : (pages[slug] && pages[slug].title) || slug);

  return (
    <PanelFrame embedded={embedded} label={<>Navigation health {total ? <span className="gs-panel-count">{total}</span> : null}</>} name="Navigation health" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Your header menu, checked against the pages that actually exist and are published.
          <strong> Errors</strong> — a menu item points at an unpublished page (visitors never see it) or a
          custom link that goes nowhere. <strong>Advisories</strong> — a published page that isn’t in any
          menu, or an empty dropdown. It never changes anything; broken or renamed links live under Link health.
        </p>

        {total === 0 ? (
          <p className="gs-la-clean" role="status">✓ Every menu item points at a live page, and every published page has a home in the menu.</p>
        ) : (
          groups.map((g) => {
            const section = (g.issues[0] && g.issues[0].fixSection) || 'navigation';
            const slug = g.pageSlug === NAV ? null : g.pageSlug;
            return (
              <section className="gs-la-group" key={g.pageSlug} aria-label={title(g.pageSlug) + ', ' + g.count + ' issue' + (g.count === 1 ? '' : 's')}>
                <header className="gs-cs-grouph">
                  <h3>{title(g.pageSlug)} <span className="gs-cs-sub">{g.count} issue{g.count === 1 ? '' : 's'}</span></h3>
                  {onFix ? <button type="button" className="gs-btn ghost sm" onClick={() => onFix(section, slug)} aria-label={'Fix navigation for ' + title(g.pageSlug)}>Fix</button> : null}
                </header>
                <ul className="gs-la-list">
                  {g.issues.map((i, k) => (
                    <li className="gs-la-row" key={k}>
                      <span className={'gs-la-pill is-' + (i.severity === 'error' ? 'broken' : 'recoverable')}>{i.severity === 'error' ? 'Error' : 'Warning'}</span>
                      <span className="gs-la-body">
                        <span className="gs-la-where">{i.label}</span>
                        <span className="gs-la-target">{i.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </PanelFrame>
  );
}
