import PanelFrame from './PanelFrame.jsx';

// Studio Setup Guide ("Getting started"): a read-only, first-run orientation panel. A live checklist of
// setup tasks — each `done` derived from real state ("changed from the Greatstone default", not merely
// filled) — with a Set up deep-link to the tool that completes it, plus a short map of the studio. App owns
// the derivation (deriveChecklist); this only renders. Read-only; manager-gated (most setup is Site settings).
// Models SiteHealthPanel's report/onFix shape + gs-la-* rows — no new CSS.
const AREAS = [
  ['Content', 'Pages, navigation, SEO, media and the quality checks live here.'],
  ['Commerce', 'The catalogue, pricing, currency, orders and quotes (opens the storefront admin).'],
  ['People & settings', 'Team & roles, plus your site name, logo, footer and the persistent call-to-action.'],
];

export default function GettingStartedPanel({ report, onFix, onClose, embedded }) {
  const r = report || { items: [], doneCount: 0, total: 0, allDone: true, pct: 100, remaining: 0 };
  const items = r.items || [];

  return (
    <PanelFrame embedded={embedded} label={<>Getting started {r.total ? <span className="gs-panel-count">{r.doneCount}/{r.total}</span> : null}</>} name="Getting started" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          A few steps to make this studio yours. Each task links to the tool that completes it, and ticks
          itself off once it’s done. <strong>None of it is required to keep working.</strong>
        </p>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', margin: '8px 0 4px' }}
          role="group" aria-label={'Studio setup ' + r.pct + ' percent complete, ' + r.doneCount + ' of ' + r.total + ' done'}>
          <span style={{ fontSize: 46, fontWeight: 800, lineHeight: 1 }}>{r.pct}<span style={{ fontSize: 18, opacity: 0.5, fontWeight: 600 }}>%</span></span>
          <span style={{ opacity: 0.7, fontSize: 13 }}>{r.doneCount} of {r.total} set up</span>
        </div>

        {r.allDone ? (
          <p className="gs-la-clean" role="status">✓ Your studio is fully set up. Nice work.</p>
        ) : null}

        <ul className="gs-la-list" aria-label="Setup tasks" style={{ marginTop: 12 }}>
          {items.map((i) => (
            <li className="gs-la-row" key={i.key}>
              <span className={'gs-la-pill ' + (i.done ? 'is-orphan' : 'is-recoverable')}>{i.done ? 'Done' : 'To do'}</span>
              <span className="gs-la-body">
                <span className="gs-la-where">{i.label}</span>
                <span className="gs-la-target">{i.hint}</span>
              </span>
              {!i.done && i.section && onFix ? <button type="button" className="gs-btn ghost sm" onClick={() => onFix(i.section)} aria-label={'Set up: ' + i.label}>Set up</button> : null}
            </li>
          ))}
        </ul>

        <dl style={{ marginTop: 18 }} aria-label="What each area of the studio does">
          {AREAS.map(([h, d]) => (
            <div key={h} style={{ marginBottom: 8 }}>
              <dt style={{ fontWeight: 700, fontSize: '.82rem' }}>{h}</dt>
              <dd style={{ margin: 0, opacity: 0.7, fontSize: '.82rem' }}>{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </PanelFrame>
  );
}
