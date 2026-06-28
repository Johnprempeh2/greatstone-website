import PanelFrame from './PanelFrame.jsx';

// Read-only Accessibility coach: renders checkA11y(state) — content a11y issues (vague link text 2.4.4,
// H1 structure 2.4.6/1.3.1) grouped by page, each with the offending block/field, a why + suggestion, and
// an Open deep-link. Advisory only; App owns the computation (report={checkA11y(state)}). Complements the
// publish-time image-alt check (no overlap). Reuses gs-la-*/gs-cs-* classes.
function renderSnippet(s) {
  if (!s) return null;
  const before = s.text.slice(0, s.hi.start);
  const hit = s.text.slice(s.hi.start, s.hi.end);
  const after = s.text.slice(s.hi.end);
  return (<>{s.truncatedStart ? '…' : ''}{before}<mark className="gs-cs-mark">{hit}</mark>{after}{s.truncatedEnd ? '…' : ''}</>);
}

export default function A11yPanel({ report, pages = {}, onOpen, onClose, embedded }) {
  const groups = (report && report.groups) || [];
  const total = report ? report.total : 0;
  const title = (slug) => (pages[slug] && pages[slug].title) || slug;

  return (
    <PanelFrame embedded={embedded} label={<>Accessibility {total ? <span className="gs-panel-count">{total}</span> : null}</>} name="Accessibility" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Your content checked for accessibility beyond images — vague link text (“click here”, “read
          more”) and main-heading structure (a page should have exactly one, non-empty H1).
          <strong> Advisory only:</strong> it never changes anything. Image alt text is checked separately
          when you publish.
        </p>

        {total === 0 ? (
          <p className="gs-la-clean" role="status">✓ Every page passes these accessibility checks. Nothing to fix.</p>
        ) : (
          groups.map((g) => (
            <section className="gs-la-group" key={g.pageSlug} aria-label={title(g.pageSlug) + ', ' + g.count + ' issues'}>
              <header className="gs-cs-grouph">
                <h3>{title(g.pageSlug)} <span className="gs-cs-sub">{g.count} issue{g.count === 1 ? '' : 's'}</span></h3>
                {onOpen ? <button type="button" className="gs-btn ghost sm" onClick={() => onOpen(g.pageSlug)} aria-label={'Open ' + title(g.pageSlug) + ' in the editor'}>Open</button> : null}
              </header>
              <ul className="gs-la-list">
                {g.issues.map((i, k) => (
                  <li className="gs-la-row" key={k}>
                    <span className={'gs-la-pill is-' + (i.severity === 'error' ? 'broken' : 'recoverable')}>{i.severity === 'error' ? 'Error' : 'Warning'}</span>
                    <span className="gs-la-body">
                      <span className="gs-la-where">{i.blockType}{i.fieldLabel && i.fieldLabel !== 'Page structure' ? ' · ' + i.fieldLabel : ''}{i.wcag ? ' · WCAG ' + i.wcag : ''}</span>
                      {i.snippet ? <span className="gs-cs-snippet">{renderSnippet(i.snippet)}</span> : null}
                      <span className="gs-la-target">{i.label} — {i.suggestion}</span>
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
