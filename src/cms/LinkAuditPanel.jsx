import PanelFrame from './PanelFrame.jsx';

// Read-only Link health report. Renders the result of auditLinks(state) (App owns the computation):
// broken/recoverable internal links grouped by their source page, plus orphan pages nothing reaches.
// Each issue carries a text severity label (not colour alone — WCAG 1.4.1) and a Fix button that
// deep-links into that page's editor. Nothing here mutates state.
export default function LinkAuditPanel({ audit, pages = {}, onOpen, onClose, embedded }) {
  const issues = (audit && audit.issues) || [];
  const orphans = (audit && audit.orphans) || [];
  const total = (audit ? audit.broken + audit.recoverable : 0) + orphans.length;
  const clean = issues.length === 0 && orphans.length === 0;
  const title = (slug) => (pages[slug] && pages[slug].title) || slug;

  // group issues by source page so an editor sees "what's wrong on Services" in one place
  const byPage = {};
  issues.forEach((i) => { (byPage[i.pageSlug] = byPage[i.pageSlug] || []).push(i); });

  const describe = (i) => {
    if (i.dead) return 'this button is labelled but links nowhere';
    if (i.severity === 'recoverable') return 'forwards to “' + title(i.fixSlug) + '” via a redirect. Repoint it';
    return 'points at “' + i.target + '”, which no longer exists';
  };

  return (
    <PanelFrame embedded={embedded} label={<>Link health {total ? <span className="gs-panel-count">{total}</span> : null}</>} name="Link health" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Every internal link across your pages and navigation, checked against the pages that actually exist.
          <strong> Broken</strong> links point at a deleted page; <strong>recoverable</strong> links still work
          because the site forwards them through a redirect, but are worth repointing. External links and emails
          aren’t checked.
        </p>

        {clean ? (
          <p className="gs-la-clean" role="status">✓ All links resolve. No broken links or orphan pages.</p>
        ) : (
          <>
            {Object.keys(byPage).map((slug) => (
              <section className="gs-la-group" key={slug}>
                <h3 className="gs-la-grouph">{slug === '(navigation)' ? 'Navigation bar' : title(slug)}</h3>
                <ul className="gs-la-list">
                  {byPage[slug].map((i, k) => (
                    <li className="gs-la-row" key={k}>
                      <span className={'gs-la-pill is-' + i.severity}>{i.severity === 'recoverable' ? 'Recoverable' : 'Broken'}</span>
                      <span className="gs-la-body">
                        <span className="gs-la-where">{i.blockType}{i.field ? ' · ' + i.field : ''}</span>
                        <span className="gs-la-target">{describe(i)}</span>
                      </span>
                      {slug !== '(navigation)' && onOpen
                        ? <button type="button" className="gs-btn ghost sm gs-la-fix" onClick={() => onOpen(slug)}>Fix on {title(slug)}</button>
                        : <span className="gs-la-navnote">Edit in Navigation</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {orphans.length ? (
              <section className="gs-la-group">
                <h3 className="gs-la-grouph">Orphan pages <span className="gs-la-sub">nothing links here</span></h3>
                <ul className="gs-la-list">
                  {orphans.map((slug) => (
                    <li className="gs-la-row" key={slug}>
                      <span className="gs-la-pill is-orphan">Orphan</span>
                      <span className="gs-la-body">
                        <span className="gs-la-where">{title(slug)}</span>
                        <span className="gs-la-target">reachable only by direct URL. Add it to the navigation or link to it from a page</span>
                      </span>
                      {onOpen ? <button type="button" className="gs-btn ghost sm gs-la-fix" onClick={() => onOpen(slug)}>Open</button> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </PanelFrame>
  );
}
