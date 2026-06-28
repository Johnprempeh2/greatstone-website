import PanelFrame from './PanelFrame.jsx';
import { fmtBytes } from '../lib/media-audit.mjs';

// Read-only Media usage audit: renders auditMedia(state) — UNTRACKED page images (used but not in the
// library, so no curated alt), MISSING ALT (a known image field with blank alt), and UNUSED library
// images (no page uses them, still taking up saved space) + a "where used" view. Advisory; App owns the
// computation. Models A11yPanel's grouped/onOpen-deep-link shape. No delete action this cycle (read-only).
const THUMB = { borderRadius: 6, objectFit: 'cover', flex: '0 0 auto' };
const uniq = (arr) => arr.filter((v, i, a) => a.indexOf(v) === i);

export default function MediaUsagePanel({ report, pages = {}, onOpen, onClose, embedded }) {
  const r = report || { unused: [], untracked: [], missingAlt: [], bytes: 0, counts: {} };
  const counts = r.counts || {};
  const actionable = (counts.untracked || 0) + (counts.missingAlt || 0);
  const total = (counts.unused || 0) + actionable;
  const pageTitle = (slug) => (pages[slug] && pages[slug].title) || slug;
  const isReal = (slug) => !!(slug && pages[slug]);
  const openBtn = (slug) => (onOpen && isReal(slug)
    ? <button type="button" className="gs-btn ghost sm" onClick={() => onOpen(slug)} aria-label={'Open ' + pageTitle(slug) + ' in the editor'}>Open</button>
    : null);

  return (
    <PanelFrame embedded={embedded} label={<>Media usage {actionable ? <span className="gs-panel-count">{actionable}</span> : null}</>} name="Media usage" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Your image library checked against where images are actually used. <strong>Untracked</strong> —
          a page image that isn’t in the library. <strong>Missing alt</strong> — an image with no alt text.
          <strong> Unused</strong> — a library image no page references (it still takes up saved space).
          <strong> Advisory only:</strong> it never changes anything; matching is by exact URL.
        </p>

        {total === 0 ? (
          <p className="gs-la-clean" role="status">✓ Every image is in your library, used, and has alt text.</p>
        ) : (
          <>
            <p className="gs-cs-sub" style={{ margin: '0 0 14px' }}>
              {(counts.untracked || 0)} untracked · {(counts.missingAlt || 0)} missing alt · {(counts.unused || 0)} unused{r.bytes ? ' (~' + fmtBytes(r.bytes) + ' reclaimable)' : ''}
            </p>

            {r.untracked.length ? (
              <section className="gs-la-group" aria-label={'Untracked page images, ' + r.untracked.length}>
                <header className="gs-cs-grouph"><h3>Untracked page images <span className="gs-cs-sub">{r.untracked.length}</span></h3></header>
                <ul className="gs-la-list">
                  {r.untracked.map((u, k) => (
                    <li className="gs-la-row" key={k}>
                      <span className="gs-la-pill is-recoverable">Untracked</span>
                      <span className="gs-la-body">
                        <span className="gs-la-where">{u.isData ? 'Uploaded image (not in library)' : u.url.slice(0, 64)}</span>
                        <span className="gs-la-target">Used in {u.uses.length} place{u.uses.length === 1 ? '' : 's'}: {uniq(u.uses.map((x) => isReal(x.pageSlug) ? pageTitle(x.pageSlug) : (x.pageSlug === '(catalogue)' ? 'Catalogue' : x.pageSlug))).slice(0, 4).join(', ')}</span>
                      </span>
                      {openBtn(u.uses[0] && u.uses[0].pageSlug)}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {r.missingAlt.length ? (
              <section className="gs-la-group" aria-label={'Missing alt text, ' + r.missingAlt.length}>
                <header className="gs-cs-grouph"><h3>Missing alt text <span className="gs-cs-sub">{r.missingAlt.length}</span></h3></header>
                <ul className="gs-la-list">
                  {r.missingAlt.map((m, k) => (
                    <li className="gs-la-row" key={k}>
                      <span className="gs-la-pill is-recoverable">No alt</span>
                      <span className="gs-la-body">
                        <span className="gs-la-where">{m.where}{isReal(m.pageSlug) ? ' · ' + pageTitle(m.pageSlug) : (m.pageSlug === '(catalogue)' ? ' · Catalogue' : '')}</span>
                        <span className="gs-la-target">Add alt text so screen readers can describe this image.</span>
                      </span>
                      {openBtn(m.pageSlug)}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {r.unused.length ? (
              <section className="gs-la-group" aria-label={'Unused library images, ' + r.unused.length}>
                <header className="gs-cs-grouph"><h3>Unused library images <span className="gs-cs-sub">{r.unused.length}</span></h3></header>
                <ul className="gs-la-list">
                  {r.unused.map((a, k) => (
                    <li className="gs-la-row" key={k}>
                      <span className="gs-la-pill is-orphan">Unused</span>
                      {a.url ? <img src={a.url} alt="" width="40" height="40" loading="lazy" style={THUMB} /> : null}
                      <span className="gs-la-body">
                        <span className="gs-la-where">{a.alt || (a.isData ? 'Uploaded image' : a.url.slice(0, 56))}</span>
                        <span className="gs-la-target">{a.isData ? fmtBytes(a.bytes) + ' · uploaded' : 'Linked image'} — no page uses this.</span>
                      </span>
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
