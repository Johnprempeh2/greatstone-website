import { useState } from 'react';
import EditableText from './EditableText.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';

// Coordinates are percentages in the diagram, not geolocation claims. The
// locations themselves are editable page data; no unverified markets ship.
const defaultPlaces = [
  { name: 'United Kingdom', region: 'Europe', services: 'DX Consultancy, DX Tools', x: 38, y: 25, confirmed: true },
  { name: 'Ghana', region: 'Africa', services: 'DX Consultancy, DX Tools', x: 48, y: 63, confirmed: true },
];

export function BridgeMap({ id, puck, eyebrow, heading, body, places = defaultPlaces }) {
  const editing = !!puck?.isEditing;
  const [filter, setFilter] = useState('All');
  const confirmed = places.filter((p) => p.confirmed || editing);
  const filters = ['All', ...new Set(confirmed.flatMap((p) => [p.region, ...(p.services || '').split(',').map((v) => v.trim())]).filter(Boolean))];
  const matches = (p) => filter === 'All' || p.region === filter || (p.services || '').split(',').map((v) => v.trim()).includes(filter);
  return <section className="b-bridge"><div className="wrap">
    <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="p" className="kicker" singleLine />
    <EditableText editing={editing} id={id} field="heading" value={heading} as="h2" className="b-bridge-head" singleLine />
    <EditableText editing={editing} id={id} field="body" value={body} as="p" className="b-bridge-lead" />
    <div className="b-bridge-filters" aria-label="Filter places">{filters.map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>
    <div className="b-bridge-layout">
      <div className="b-bridge-map" role="img" aria-label={'Diagram of ' + confirmed.filter(matches).map((p) => p.name).join(' and ')}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M38 25 Q56 35 48 63" /></svg>
        {confirmed.map((p, i) => <div key={i} className={'b-bridge-marker' + (matches(p) ? ' is-lit' : '')} style={{ left: `${Math.max(4, Math.min(96, Number(p.x) || 50))}%`, top: `${Math.max(4, Math.min(96, Number(p.y) || 50))}%` }}><span />{p.name}</div>)}
      </div>
      <ul className="b-bridge-places">{confirmed.filter(matches).map((p, i) => <li key={i}><strong>{p.name}</strong><span>{p.region} · {p.services}</span>{!p.confirmed && <em>Placeholder: confirm with John</em>}</li>)}</ul>
    </div>
  </div></section>;
}

export const css = `
.b-bridge{padding:clamp(72px,9vw,128px) 0;background:var(--gs-bg);color:var(--gs-text)}
.b-bridge-head{font-size:clamp(2.1rem,4.8vw,4.5rem);line-height:1.06;letter-spacing:-.03em;margin:14px 0 18px}.b-bridge-lead{max-width:66ch;color:var(--gs-text-muted);line-height:1.7}
.b-bridge-filters{display:flex;flex-wrap:wrap;gap:8px;margin:36px 0 24px}.b-bridge-filters button{min-height:44px;padding:9px 18px;border-radius:100px;border:1px solid var(--gs-border-strong);background:transparent;color:var(--gs-text);font:inherit;cursor:pointer}
.b-bridge-filters button[aria-pressed=true]{background:var(--gs-accent);color:var(--gs-bg-deep);font-weight:700}.b-bridge-filters button:focus-visible{outline:2px solid var(--gs-accent);outline-offset:3px}
.b-bridge-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(240px,.65fr);gap:clamp(24px,4vw,60px)}
.b-bridge-map{position:relative;min-height:410px;border:1px solid var(--gs-border-strong);border-radius:16px;background:radial-gradient(ellipse at 50% 50%,var(--gs-accent-soft),transparent 70%),var(--gs-bg-deep);overflow:hidden}
.b-bridge-map svg{position:absolute;inset:0;width:100%;height:100%}.b-bridge-map path{fill:none;stroke:var(--gs-accent);stroke-width:.25;stroke-dasharray:1 1;opacity:.55}
.b-bridge-marker{position:absolute;display:flex;align-items:center;gap:8px;white-space:nowrap;transform:translate(-12px,-50%);font-size:.8rem;font-weight:700;color:var(--gs-text-muted);opacity:.35;transition:opacity .3s}
.b-bridge-marker.is-lit{color:var(--gs-text);opacity:1}.b-bridge-marker span{width:13px;height:13px;border:3px solid var(--gs-accent);border-radius:50%;background:var(--gs-bg-deep)}.b-bridge-marker.is-lit span{animation:gsBridgePulse 2.6s ease-in-out infinite}
@keyframes gsBridgePulse{50%{box-shadow:0 0 0 9px var(--gs-accent-dim)}}
.b-bridge-places{list-style:none;margin:0;padding:0;border-top:1px solid var(--gs-border-strong)}.b-bridge-places li{padding:20px 0;border-bottom:1px solid var(--gs-border-strong)}.b-bridge-places strong,.b-bridge-places span,.b-bridge-places em{display:block}.b-bridge-places strong{font-size:1.1rem}.b-bridge-places span,.b-bridge-places em{color:var(--gs-text-muted);font-size:.9rem;line-height:1.5;margin-top:5px}
@media(max-width:700px){.b-bridge-layout{grid-template-columns:1fr}.b-bridge-map{min-height:320px}.b-bridge-marker{font-size:.72rem}}
@media(prefers-reduced-motion:reduce){.b-bridge-marker,.b-bridge-marker.is-lit span{transition:none;animation:none}}
@media print{.b-bridge{background:white;color:black}.b-bridge-map{background:white;min-height:260px}.b-bridge-marker,.b-bridge-marker.is-lit{color:black;opacity:1}}
`;

export const puck = { label: 'Bridge map', fields: {
  eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
  heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
  body: { type: 'custom', label: 'Introduction', render: (props) => <RichTextField {...props} /> },
  places: { type: 'array', label: 'Places', arrayFields: {
    name: { type: 'text', label: 'Place' }, region: { type: 'text', label: 'Region' }, services: { type: 'text', label: 'Service lines, comma separated' }, x: { type: 'number', label: 'Map X (%)' }, y: { type: 'number', label: 'Map Y (%)' }, confirmed: { type: 'radio', label: 'Confirmed by John', options: [{ label: 'Yes', value: true }, { label: 'No, placeholder', value: false }] },
  }, defaultItemProps: { name: 'Unconfirmed place', region: 'Region', services: 'DX Consultancy', x: 50, y: 50, confirmed: false }, getItemSummary: (p) => p.name || 'Place' },
}, defaultProps: { eyebrow: 'Where we work', heading: 'A bridge between the UK and Ghana.', body: 'Our work connects teams and markets across both places.', places: defaultPlaces }, render: (props) => <BridgeMap {...props} /> };
