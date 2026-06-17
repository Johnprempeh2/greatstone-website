// Releases: the only SITE-WIDE governance view. Per-page status lived in the toolbar and the Pages
// list, but nothing showed the whole site's publish state at once — which pages have unpublished
// changes (draft drift), which are awaiting review/approval, and when each last went live. This is
// the lead's "what's ready / what's pending" board. Read-only overview; actions happen in-page.
import PanelFrame from './PanelFrame.jsx';

const STATUS = { draft: 'Draft', review: 'In review', approved: 'Approved', published: 'Published' };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function when(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ReleaseBoard({ order, pages, current, onOpen, onClose, embedded }) {
  const rows = order.map((slug) => {
    const p = pages[slug];
    const lastPub = (p.versions || []).find((v) => v.status === 'published');
    return { slug, title: p.title, status: p.status, drift: !eq(p.data, p.published), lastPubTs: lastPub ? lastPub.ts : null, lastPubBy: lastPub ? lastPub.by : null };
  });
  const counts = rows.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {});
  const driftCount = rows.filter((r) => r.drift).length;
  // attention first: in review, then approved, then anything with unpublished changes, then the rest
  const score = (r) => (r.status === 'review' ? 4 : 0) + (r.status === 'approved' ? 3 : 0) + (r.drift ? 1 : 0);
  const sorted = rows.slice().sort((a, b) => score(b) - score(a) || order.indexOf(a.slug) - order.indexOf(b.slug));

  return (
    <PanelFrame embedded={embedded} label="Releases" onClose={onClose}>
      <div className="gs-panel-body">
        <div className="gs-rel-summary">
          <div className="gs-rel-stat"><b>{counts.published || 0}</b><span>Published</span></div>
          <div className="gs-rel-stat"><b>{counts.review || 0}</b><span>In review</span></div>
          <div className="gs-rel-stat"><b>{counts.approved || 0}</b><span>Approved</span></div>
          <div className="gs-rel-stat"><b>{counts.draft || 0}</b><span>Draft</span></div>
        </div>
        <p className={'gs-rel-note' + (driftCount ? '' : ' gs-rel-clean')}>
          {driftCount ? (driftCount + (driftCount > 1 ? ' pages have' : ' page has') + ' unpublished changes.') : 'Every page is up to date — no unpublished changes.'}
        </p>
        <ul className="gs-rel-list">
          {sorted.map((r) => (
            <li key={r.slug} className={'gs-rel-row' + (r.slug === current ? ' is-current' : '')}>
              <button className="gs-rel-open" onClick={() => onOpen(r.slug)} title="Open this page">
                <span className="gs-rel-title">{r.title}{r.drift ? <em className="gs-rel-drift" title="Has unpublished changes">unpublished</em> : null}</span>
                <span className="gs-rel-meta">{r.lastPubTs ? 'Published ' + when(r.lastPubTs) + (r.lastPubBy ? ' · ' + r.lastPubBy : '') : 'Never published'}</span>
              </button>
              <span className={'gs-page-status gs-st-' + r.status} title={STATUS[r.status] || r.status}>
                <span className="gs-dot" />{STATUS[r.status] || r.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </PanelFrame>
  );
}
