import PanelFrame from './PanelFrame.jsx';

// Read-only Copy coach: renders checkVoice(state) — house-voice issues grouped by page, each with a
// highlighted snippet, the rule + a suggested direction, and an Open deep-link. Advisory only; App owns
// the computation (report={checkVoice(state)}), like LinkAuditPanel. Reuses the gs-la-* / gs-cs-* classes.
function renderSnippet(s) {
  const before = s.text.slice(0, s.hi.start);
  const hit = s.text.slice(s.hi.start, s.hi.end);
  const after = s.text.slice(s.hi.end);
  return (<>{s.truncatedStart ? '…' : ''}{before}<mark className="gs-cs-mark">{hit}</mark>{after}{s.truncatedEnd ? '…' : ''}</>);
}

export default function CopyCoachPanel({ report, pages = {}, onOpen, onClose, embedded }) {
  const groups = (report && report.groups) || [];
  const total = report ? report.total : 0;
  const title = (slug) => (pages[slug] && pages[slug].title) || slug;

  return (
    <PanelFrame embedded={embedded} label={<>Copy coach {total ? <span className="gs-panel-count">{total}</span> : null}</>} name="Copy coach" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Every page’s wording, checked against the Greatstone house voice — banned filler, em-dashes, the
          “not just X, it’s Y” tic, metaphor clichés, and “whilst”. <strong>Advisory only:</strong> it flags
          wording with a why and a suggested direction; it never rewrites anything.
        </p>

        {total === 0 ? (
          <p className="gs-la-clean" role="status">✓ Every page reads on-brand. No voice issues found.</p>
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
                    <span className={'gs-la-pill is-' + (i.severity === 'hard' ? 'broken' : 'recoverable')}>{i.severity === 'hard' ? 'Em-dash' : 'Voice'}</span>
                    <span className="gs-la-body">
                      <span className="gs-la-where">{i.blockType}{i.fieldLabel && i.fieldLabel !== 'Page title' ? ' · ' + i.fieldLabel : ''}</span>
                      <span className="gs-cs-snippet">{renderSnippet(i.snippet)}</span>
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
