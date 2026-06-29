import PanelFrame from './PanelFrame.jsx';
// Document outline panel (cycle 21) — heading tree + skipped-level/not-h1-first; dynamic pages noted, not faked.

// Read-only Document outline: renders buildSiteOutline(state, headingsOf) — the per-page heading TREE
// (h1/h2/h3 nesting, exactly as a screen reader sees it) + heading-ORDER issues (skipped-level,
// not-h1-first; WCAG 1.3.1). Heading PRESENCE (missing/duplicate/empty H1) stays owned by the
// Accessibility coach (checkA11y) — zero overlap. Advisory; App owns the computation. Reuses gs-la-*/gs-cs-*.
export default function OutlinePanel({ report, pages = {}, onOpen, onClose, embedded }) {
  const groups = (report && report.groups) || [];
  const total = report ? report.total : 0;
  const title = (slug) => (pages[slug] && pages[slug].title) || slug;
  const tag = (lv) => 'H' + lv;

  return (
    <PanelFrame embedded={embedded} label={<>Document outline {total ? <span className="gs-panel-count">{total}</span> : null}</>} name="Document outline" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          The heading structure of every page — its H1 → H2 → H3 tree, built from the sections you’ve placed.
          Flags heading levels that <strong>jump down more than one</strong> (e.g. H2→H4) or pages that
          don’t open with their H1. <strong>Advisory only:</strong> it never changes anything. Missing,
          empty, or duplicate main headings are handled by the Accessibility coach.
        </p>

        {groups.length === 0 ? (
          <p className="gs-la-clean" role="status">No pages to outline yet.</p>
        ) : (
          groups.map((g) => (
            <section className="gs-la-group" key={g.pageSlug} aria-label={title(g.pageSlug) + ' outline'}>
              <header className="gs-cs-grouph">
                <h3>{title(g.pageSlug)} {g.dynamic ? <span className="gs-cs-sub">live section</span> : g.count ? <span className="gs-cs-sub">{g.count} issue{g.count === 1 ? '' : 's'}</span> : <span className="gs-cs-sub gs-ok">structure ok</span>}</h3>
                {onOpen ? <button type="button" className="gs-btn ghost sm" onClick={() => onOpen(g.pageSlug)} aria-label={'Open ' + title(g.pageSlug) + ' in the editor'}>Open</button> : null}
              </header>

              {g.dynamic ? (
                <p className="gs-ol-empty">This page renders a live, runtime-generated section (its headings are produced when the page loads), so it isn’t statically outlined here.</p>
              ) : (
              /* the heading tree — a real list, indented by level, level shown as TEXT (never colour-only, WCAG 1.4.1) */
              <ol className="gs-ol-tree" aria-label={title(g.pageSlug) + ' headings'}>
                {g.items.length === 0
                  ? <li className="gs-ol-empty">No headings on this page.</li>
                  : g.items.map((it, k) => (
                    <li key={k} className={'gs-ol-item gs-ol-l' + it.level} style={{ marginInlineStart: (it.level - 1) * 18 }}>
                      <span className="gs-ol-tag" aria-hidden="true">{tag(it.level)}</span>
                      <span className="gs-sr-only">Heading level {it.level}: </span>
                      <span className="gs-ol-text">{it.text || <em className="gs-ol-none">(no text)</em>}</span>
                      <span className="gs-ol-block">{it.blockType}</span>
                    </li>
                  ))}
              </ol>
              )}

              {g.issues.length ? (
                <ul className="gs-la-list">
                  {g.issues.map((i, k) => (
                    <li className="gs-la-row" key={k}>
                      <span className="gs-la-pill is-recoverable">Warning</span>
                      <span className="gs-la-body">
                        <span className="gs-la-where">{i.blockType}{i.wcag ? ' · WCAG ' + i.wcag : ''}</span>
                        <span className="gs-la-target">{i.label} — {i.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))
        )}
      </div>
    </PanelFrame>
  );
}
