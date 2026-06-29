import PanelFrame from './PanelFrame.jsx';

// Read-only Conversion map (cycle 22): across the whole site, which CTA LABELS point at the same
// destination (a brand smell + casing dupes), which CTAs have a real href but a BLANK label (a hidden
// button), each page's conversion map, and dead-end pages. Complements c1 Link health (which checks link
// VALIDITY) with the conversion dimension it never sees. Advisory only — the editor picks the wording.
export default function CtaConsistencyPanel({ report, pages = {}, onOpen, onClose, embedded }) {
  const r = report || {};
  const inconsistent = r.inconsistent || [];
  const emptyLabel = r.emptyLabel || [];
  const deadEnds = r.deadEnds || [];
  const perPage = r.perPage || {};
  const summary = r.summary || {};
  const hard = (summary.casingDupeCount || 0) + (summary.deadEndCount || 0);
  const title = (slug) => (pages[slug] && pages[slug].title) || slug;
  const clean = !inconsistent.length && !emptyLabel.length && !deadEnds.length;
  const pageSlugs = Object.keys(perPage);
  const jump = (slug, label) => (onOpen ? <button type="button" className="gs-inv-link" onClick={() => onOpen(slug)}>{label || title(slug)}</button> : (label || title(slug)));

  return (
    <PanelFrame embedded={embedded} label={<>Conversion map {hard ? <span className="gs-panel-count">{hard}</span> : null}</>} name="Conversion map" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Every call to action across the site, grouped by where it sends people. Flags the same destination
          reached by <strong>different labels</strong> (or labels differing only in capitalisation), CTAs with
          a real link but <strong>no label</strong> (so no button shows), and pages with no next step.
          <strong> Advisory only:</strong> it never changes anything; you choose the wording.
        </p>

        {clean ? (
          <p className="gs-la-clean" role="status">✓ Every call to action is consistent and visible. No conflicting labels, hidden buttons, or dead-end pages.</p>
        ) : null}

        {inconsistent.length ? (
          <section className="gs-cta-sec" aria-label="Inconsistent CTA labels">
            <h3 className="gs-cs-h">One destination, several labels <span className="gs-cs-sub">{inconsistent.length}</span></h3>
            {inconsistent.map((d) => (
              <div className="gs-la-group" key={d.dest}>
                <header className="gs-cs-grouph">
                  <h3><code className="gs-cta-dest">{d.dest}</code> {d.casingDupe ? <span className="gs-la-pill is-broken" title="Two labels differ only in capitalisation">Casing dupe</span> : null} <span className="gs-cs-sub">{d.distinct} labels</span></h3>
                </header>
                <ul className="gs-cta-chips">
                  {d.labels.map((l) => <li key={l.label}><span className="gs-la-pill">“{l.label}”{l.count > 1 ? ' ×' + l.count : ''}</span></li>)}
                </ul>
                <p className="gs-cta-on">On: {[...new Set(d.pages.map((p) => p.slug))].map((slug, i) => <span key={slug}>{i ? ', ' : ''}{jump(slug)}</span>)}</p>
              </div>
            ))}
          </section>
        ) : null}

        {emptyLabel.length ? (
          <section className="gs-cta-sec" aria-label="Hidden CTAs">
            <h3 className="gs-cs-h">Hidden call to action (no label) <span className="gs-cs-sub">{emptyLabel.length}</span></h3>
            <ul className="gs-la-list">
              {emptyLabel.map((e, i) => (
                <li className="gs-la-row" key={i}>
                  <span className="gs-la-pill is-recoverable">Hidden</span>
                  <span className="gs-la-body">
                    <span className="gs-la-where">{e.blockType} on {title(e.slug)} · {e.labelKey}</span>
                    <span className="gs-la-target">links to <code className="gs-cta-dest">{e.dest}</code> but has no label, so no button renders. {jump(e.slug, 'Open')}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {deadEnds.length ? (
          <section className="gs-cta-sec" aria-label="Dead-end pages">
            <h3 className="gs-cs-h">Dead-end pages (no call to action) <span className="gs-cs-sub">{deadEnds.length}</span></h3>
            <ul className="gs-la-list">
              {deadEnds.map((slug) => (
                <li className="gs-la-row" key={slug}>
                  <span className="gs-la-pill is-broken">Dead end</span>
                  <span className="gs-la-body"><span className="gs-la-target">{title(slug)} gives the visitor no next step. {jump(slug, 'Open')}</span></span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {pageSlugs.length ? (
          <section className="gs-cta-sec" aria-label="Per-page conversion map">
            <h3 className="gs-cs-h">Conversion map by page</h3>
            <ul className="gs-la-list">
              {pageSlugs.map((slug) => (
                <li className="gs-la-row" key={slug}>
                  <span className="gs-la-body">
                    <span className="gs-la-where">{jump(slug)}</span>
                    <span className="gs-cta-map">
                      {perPage[slug].length === 0
                        ? <em className="gs-ol-none">no call to action</em>
                        : perPage[slug].map((c, i) => <span className="gs-la-pill" key={i} title={c.blockType + ' · ' + c.labelKey}>“{c.label}” → {c.dest}</span>)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </PanelFrame>
  );
}
