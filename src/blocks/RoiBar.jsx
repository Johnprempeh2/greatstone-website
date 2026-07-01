import { useEffect, useRef } from 'react';
import { useReveal } from './reveal.js';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// The payback viz: a bar that fills to the break-even point on entry, with the rest of the year
// read as pure return. The figures are editable; the bar width follows the payback percentage.
export function RoiBar({ id, puck, index, eyebrow, headline, highlight, body, paybackPct = 29, markerLabel = 'Payback', s1, s2, s3, paybackNum = '', paybackCap, legendCost, legendReturn }) {
  const ref = useReveal();
  const editing = puck && puck.isEditing;
  const roiRef = useRef(null);
  useEffect(() => {
    const el = roiRef.current; if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } }), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} className="b-roi">
      <div className="wrap">
        {(index || eyebrow || editing) ? (
          <div className="b-chapter-eyebrow" data-reveal>
            {index ? <span className="b-chapter-num">{index}</span> : null}
            <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="span" className="b-chapter-name" singleLine placeholder="Eyebrow…" />
          </div>
        ) : null}
        <div className="roi" ref={roiRef} style={{ '--roi-w': `${paybackPct}%` }}>
          <div className="roi-track-wrap" data-reveal>
            <div className="roi-track" role="img" aria-label={`Engagement reaches ${(markerLabel || 'payback').toLowerCase()} at roughly ${paybackNum || 'the payback point'}; the rest of the year is return.`}>
              <div className="roi-fill" />
              {markerLabel ? <span className="roi-marker">{markerLabel}</span> : null}
            </div>
            <div className="roi-scale"><span>{s1}</span><span>{s2}</span><span>{s3}</span></div>
          </div>
          <div className="roi-copy">
            <h2 className="h3" data-reveal><EditableText editing={editing} id={id} field="headline" value={headline} as="span" singleLine placeholder="Headline…" /> {highlight ? <span className="accent">{highlight}</span> : null}</h2>
            <EditableText editing={editing} id={id} field="body" value={body} as="p" className="lead" placeholder="Body…" data-reveal />
            <div className="roi-payback" data-reveal>{paybackNum ? <span className="p-num">{paybackNum}</span> : null}<span className="p-cap">{paybackCap}</span></div>
            <div className="roi-legend" data-reveal>
              <span><i className="l-cost" />{legendCost}</span>
              <span><i className="l-return" />{legendReturn}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-roi{padding:clamp(56px,9vw,120px) 0;position:relative}
.roi{display:grid;grid-template-columns:1.05fr 1fr;gap:clamp(34px,5vw,72px);align-items:center;margin-top:clamp(20px,3vw,32px)}
@media(max-width:820px){.roi{grid-template-columns:1fr}}
.roi-track{position:relative;height:62px;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.04);border:1px solid var(--gs-border-soft)}
.roi-fill{position:absolute;inset:0 auto 0 0;width:0;background:linear-gradient(90deg,var(--gs-emerald),var(--gs-accent));border-radius:14px 4px 4px 14px;transition:width 1.2s var(--gs-ease)}
.roi.in .roi-fill{width:var(--roi-w,29%)}
.roi-fill::after{content:"";position:absolute;right:0;top:0;bottom:0;width:3px;background:var(--gs-accent);box-shadow:0 0 18px 2px var(--gs-accent-glow)}
.roi-marker{position:absolute;top:50%;transform:translate(-50%,-50%);left:0;font-size:.72rem;font-weight:800;letter-spacing:.04em;color:#0e1611;opacity:0;transition:left 1.2s var(--gs-ease),opacity .6s var(--gs-ease) .6s;z-index:1}
.roi.in .roi-marker{opacity:1;left:var(--roi-w,29%)}
.roi-scale{display:flex;justify-content:space-between;margin-top:12px;font-size:.7rem;font-weight:700;letter-spacing:.1em;color:var(--gs-faint);text-transform:uppercase}
.roi-payback{margin-top:26px;display:flex;align-items:baseline;gap:.5em}
.roi-payback .p-num{font-weight:900;font-size:clamp(2.2rem,4vw,3rem);color:var(--gs-accent);line-height:1;letter-spacing:-.03em}
.roi-payback .p-cap{font-size:.92rem;color:var(--gs-muted);font-weight:600}
.roi-copy h2{margin-bottom:14px}
.roi-legend{display:flex;gap:22px;margin-top:22px;flex-wrap:wrap}
.roi-legend span{display:inline-flex;align-items:center;gap:8px;font-size:.78rem;font-weight:600;color:var(--gs-muted)}
.roi-legend i{width:14px;height:14px;border-radius:4px;display:inline-block}
.roi-legend .l-cost{background:var(--gs-emerald)}
.roi-legend .l-return{background:var(--gs-accent)}
.is-edit .roi .roi-fill{width:var(--roi-w,29%)}
.is-edit .roi .roi-marker{opacity:1;left:var(--roi-w,29%)}
@media(prefers-reduced-motion:reduce){.roi-fill,.roi-marker{transition:none}}
`;

export const puck = {
  label: 'ROI / payback',
  fields: {
    index: { type: 'text', label: 'Number', contentEditable: true },
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    headline: { type: 'custom', label: 'Headline', render: (props) => <RichTextField {...props} variant="heading" /> },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'custom', label: 'Body', render: (props) => <RichTextField {...props} /> },
    paybackPct: { type: 'number', label: 'Payback point (%)', min: 5, max: 95 },
    markerLabel: { type: 'text', label: 'Marker label' },
    s1: { type: 'text', label: 'Scale start' },
    s2: { type: 'text', label: 'Scale middle' },
    s3: { type: 'text', label: 'Scale end' },
    paybackNum: { type: 'text', label: 'Payback figure' },
    paybackCap: { type: 'text', label: 'Payback caption' },
    legendCost: { type: 'text', label: 'Legend: cost' },
    legendReturn: { type: 'text', label: 'Legend: return' },
  },
  defaultProps: {
    index: '03', eyebrow: 'Return on Investment',
    headline: 'Paid back before', highlight: 'the quarter’s out.',
    body: 'On a typical engagement, the investment is recovered in the first few months. Everything after that line is time and money handed back, every week.',
    paybackPct: 29, markerLabel: 'Payback', s1: 'Day one', s2: 'Month 6', s3: 'Year one',
    paybackNum: '3.5 months', paybackCap: 'to break even, on average',
    legendCost: 'Recovering the investment', legendReturn: 'Pure return',
  },
  render: (props) => <RoiBar {...props} />,
};

export default RoiBar;
