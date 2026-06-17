// Studio Home: a content-health overview so a lead (and the future DX-dashboard audience) reads site
// readiness at a glance — page status, the LIVE catalogue size (from Supabase, not the legacy local
// store), team + pending invites, and the most recent changes. Read-only.
import { useState, useEffect } from 'react';
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

export default function OverviewPanel({ order = [], pages = {}, team = [], activity = [], org, onClose, embedded, onSection, onCatalogue }) {
  // the live product catalogue is the Supabase one (159 offerings), NOT the legacy local store — fetch
  // its size lazily (dynamic import keeps the Supabase client out of the eager bundle).
  const [catCount, setCatCount] = useState(null);
  useEffect(() => {
    let alive = true;
    import('../lib/supabase.mjs').then(async ({ supabase }) => {
      if (!supabase) return;
      const { count } = await supabase.from('offerings').select('id', { count: 'exact', head: true });
      if (alive && typeof count === 'number') setCatCount(count);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // Page status counts mirror the Releases board exactly (status-field based), so the two views never
  // disagree. Live + In review + Draft sum to the total — no contradictory axes on one dashboard.
  const pg = order.reduce((m, slug) => {
    const p = pages[slug]; if (!p) return m;
    m.total++; m[p.status] = (m[p.status] || 0) + 1;
    if (!eq(p.data, p.published)) m.drift++;
    return m;
  }, { total: 0, draft: 0, review: 0, approved: 0, published: 0, drift: 0 });
  const tm = { active: team.filter((m) => m.status !== 'invited').length, invited: team.filter((m) => m.status === 'invited').length };
  const recent = (activity || []).slice(0, 5);
  const pendingReview = (pg.review || 0) + (pg.approved || 0);

  // a tile is a clickable shortcut into the relevant destination when wired (console); in the
  // in-editor sidebar (no callbacks) it stays a plain readout. `go` may be a console section
  // (via onSection) or 'catalogue' (via onCatalogue, since the catalogue is a separate route).
  const Tile = ({ n, label, warn, to, catalogue }) => {
    const handler = catalogue ? onCatalogue : (to && onSection ? () => onSection(to) : null);
    return handler
      ? <button type="button" className={'gs-ov-tile' + (warn ? ' is-warn' : '')} onClick={handler} title={catalogue ? 'Open the catalogue' : 'Go to ' + to}><b>{n}</b><span>{label}</span></button>
      : <div className={'gs-ov-tile' + (warn ? ' is-warn' : '')}><b>{n}</b><span>{label}</span></div>;
  };

  return (
    <PanelFrame embedded={embedded} label={'Studio' + (org ? ' · ' + org.name : '')} name="Studio home" onClose={onClose}>
      <div className="gs-panel-body">
        <div className="gs-ov-tiles">
          <Tile n={pg.published || 0} label="Live pages" to="pages" />
          <Tile n={pendingReview} label="In review" warn={!!pendingReview} to="releases" />
          <Tile n={pg.drift} label="Unpublished changes" warn={!!pg.drift} to="releases" />
          <Tile n={pg.draft || 0} label="Draft pages" to="pages" />
          <Tile n={catCount == null ? '—' : catCount} label="Catalogue products" catalogue />
          <Tile n={tm.invited} label="Pending invites" warn={!!tm.invited} to="team" />
        </div>

        <div className="gs-ov-line">
          <span>Catalogue</span>
          <span>{catCount == null ? 'Live store (Supabase)' : catCount + ' products · managed under Commerce'}</span>
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
