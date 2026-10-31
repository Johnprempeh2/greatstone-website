import { useEffect, useRef, useState } from 'react';
import EditableText from './EditableText.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';

export function ProofBars({ id, puck, eyebrow, heading, body, unit, method, source, date, bars = [], preview = false }) {
  const editing = !!puck?.isEditing;
  const root = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!root.current) return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { setVisible(true); return; }
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const obs = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); obs.disconnect(); } }, { threshold: .2 });
    obs.observe(root.current);
    return () => obs.disconnect();
  }, []);
  const max = Math.max(1, ...bars.map((bar) => Number(bar.value) || 0));
  if (!editing && !preview && (!source || !date)) return null;
  return <section ref={root} className={'b-proofbars' + (visible ? ' is-visible' : '')}><div className="wrap">
    <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="p" className="kicker" singleLine />
    <EditableText editing={editing} id={id} field="heading" value={heading} as="h2" className="b-proofbars-head" singleLine />
    <EditableText editing={editing} id={id} field="body" value={body} as="p" className="b-proofbars-lead" />
    {bars.length ? <ul className="b-proofbars-list">{bars.map((bar, i) => <li key={i} className={bar.ours ? 'is-ours' : ''}>
      <div className="b-proofbars-label"><EditableText editing={editing} id={id} arrayField="bars" index={i} field="label" value={bar.label} as="strong" singleLine /><span>{bar.value} {unit}</span></div>
      <div className="b-proofbars-track"><span style={{ '--bar-width': `${Math.max(0, Math.min(100, ((Number(bar.value) || 0) / max) * 100))}%` }} /></div>
    </li>)}</ul> : null}
    <div className="b-proofbars-evidence">
      <EditableText editing={editing} id={id} field="method" value={method} as="p" placeholder="Method note required" />
      <p>Source: {editing ? <EditableText editing id={id} field="source" value={source} as="span" singleLine placeholder="Placeholder: source required" /> : source || 'Placeholder: source required'}</p>
      <p>Date: {date || 'Placeholder: date required'}</p>
    </div>
  </div></section>;
}

export const css = `
.b-proofbars{padding:clamp(72px,9vw,128px) 0;background:var(--gs-bg-deep);color:var(--gs-text)}
.b-proofbars-head{font-size:clamp(2.1rem,4.8vw,4.5rem);line-height:1.06;letter-spacing:-.03em;margin:14px 0 18px}.b-proofbars-lead{max-width:66ch;color:var(--gs-text-muted);line-height:1.7}
.b-proofbars-list{list-style:none;padding:0;margin:48px 0 28px;max-width:980px}.b-proofbars-list li{margin:0 0 28px}.b-proofbars-label{display:flex;justify-content:space-between;gap:18px;align-items:baseline;margin-bottom:10px}.b-proofbars-label strong{font-size:1.03rem}.b-proofbars-label span{color:var(--gs-text-muted);font-variant-numeric:tabular-nums}
.b-proofbars-track{height:20px;border-radius:100px;background:var(--gs-border-soft);overflow:hidden}.b-proofbars-track span{display:block;width:var(--bar-width);height:100%;border-radius:inherit;background:var(--gs-text-muted);transform:scaleX(0);transform-origin:left;transition:transform 1.1s var(--gs-ease)}
.b-proofbars.is-visible .b-proofbars-track span{transform:scaleX(1)}.b-proofbars-list .is-ours .b-proofbars-track span{background:var(--gs-accent)}.b-proofbars-list .is-ours strong{color:var(--gs-accent)}
.b-proofbars-evidence{border-top:1px solid var(--gs-border-strong);padding-top:18px;color:var(--gs-text-muted);font-size:.9rem;line-height:1.5}.b-proofbars-evidence p{margin:5px 0}
@media(max-width:390px){.b-proofbars-label{align-items:flex-start}.b-proofbars-label span{white-space:nowrap}}
@media(prefers-reduced-motion:reduce){.b-proofbars-track span{transform:none;transition:none}}
@media print{.b-proofbars{background:white;color:black}.b-proofbars-track{border:1px solid black}.b-proofbars-track span{transform:none;background:black!important}}
`;

export const puck = { label: 'Proof bars', fields: {
  eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
  heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
  body: { type: 'custom', label: 'Introduction', render: (props) => <RichTextField {...props} /> },
  unit: { type: 'text', label: 'Unit' }, method: { type: 'custom', label: 'Method note', render: (props) => <RichTextField {...props} /> }, source: { type: 'text', label: 'Source (required to publish)' }, date: { type: 'text', label: 'Measurement date YYYY-MM-DD (required to publish)' },
  bars: { type: 'array', label: 'Measurements', arrayFields: { label: { type: 'custom', label: 'Label', render: (props) => <RichTextField {...props} variant="heading" /> }, value: { type: 'number', label: 'Value' }, ours: { type: 'radio', label: 'Greatstone measurement', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] } }, defaultItemProps: { label: 'Placeholder: measured result', value: 0, ours: false }, getItemSummary: (bar) => bar.label || 'Measurement' },
}, defaultProps: { eyebrow: 'Measured outcomes', heading: 'Evidence you can inspect.', body: 'Add verified measurements before publication.', unit: '', method: 'Placeholder: add the measurement method.', source: '', date: '', bars: [{ label: 'Placeholder: Greatstone result', value: 0, ours: true }] }, render: (props) => <ProofBars {...props} /> };
