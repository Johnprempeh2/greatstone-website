// Studio Home: a content-health overview so a lead (and the future DX-dashboard audience) reads site
// readiness at a glance — page status + draft drift, catalogue health, team + pending invites, and the
// most recent changes. Read-only; the numbers come straight from the store the other panels manage.
import PanelFrame from './PanelFrame.jsx';

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function when(ts) {
  if (!ts) return '';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function OverviewPanel({ order = [], pages = {}, products = [], categories = [], team = [], activity = [], org, catalogDrift = false, onClose, embedded }) {
  // Page status counts mirror the Releases board exactly (status-field based), so the two views never
  // disagree. Live + In review + Draft sum to the total — no contradictory axes on one dashboard.
  const pg = order.reduce((m, slug) => {
    const p = pages[slug]; if (!p) return m;
    m.total++; m[p.status] = (m[p.status] || 0) + 1;
    if (!eq(p.data, p.published)) m.drift++;
    return m;
  }, { total: 0, draft: 0, review: 0, approved: 0, published: 0, drift: 0 });
  const prod = products.reduce((m, p) => { m.total++; m[p.status === 'legacy' ? 'legacy' : p.status === 'draft' ? 'draft' : 'active']++; return m; }, { total: 0, active: 0, legacy: 0, draft: 0 });
  const tm = { active: team.filter((m) => m.status !== 'invited').length, invited: team.filter((m) => m.status === 'invited').length };
  const recent = (activity || []).slice(0, 5);
  const pendingReview = (pg.review || 0) + (pg.approved || 0);

  return (
    <PanelFrame embedded={embedded} label={'Studio' + (org ? ' · ' + org.name : '')} name="Studio home" onClose={onClose}>
      <div className="gs-panel-body">
        <div className="gs-ov-tiles">
          <div className="gs-ov-tile"><b>{pg.published || 0}</b><span>Live pages</span></div>
          <div className={'gs-ov-tile' + (pendingReview ? ' is-warn' : '')}><b>{pendingReview}</b><span>In review</span></div>
          <div className={'gs-ov-tile' + (pg.drift ? ' is-warn' : '')}><b>{pg.drift}</b><span>Unpublished changes</span></div>
          <div className="gs-ov-tile"><b>{pg.draft || 0}</b><span>Draft pages</span></div>
          <div className={'gs-ov-tile' + (catalogDrift ? ' is-warn' : '')}><b>{prod.total}</b><span>{catalogDrift ? 'Products · unpublished' : 'Products'}</span></div>
          <div className={'gs-ov-tile' + (tm.invited ? ' is-warn' : '')}><b>{tm.invited}</b><span>Pending invites</span></div>
        </div>

        <div className="gs-ov-line">
          <span>Catalogue</span>
          <span>{prod.active} active · {prod.legacy} legacy · {prod.draft} draft · {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}</span>
        </div>
        <div className="gs-ov-line">
          <span>Team</span>
          <span>{tm.active} member{tm.active === 1 ? '' : 's'}{tm.invited ? ' · ' + tm.invited + ' invited' : ''}</span>
        </div>

        <div className="gs-ov-recent-label">Recent changes</div>
        {recent.length === 0 ? (
          <p className="gs-empty">No catalogue or team changes logged yet.</p>
        ) : (
          <ul className="gs-ov-recent">
            {recent.map((a) => (
              <li key={a.id}><span className="gs-ov-recent-label-txt">{a.label}</span><span className="gs-ov-recent-meta">{when(a.ts)}{a.by ? ' · ' + a.by : ''}</span></li>
            ))}
          </ul>
        )}
      </div>
    </PanelFrame>
  );
}
