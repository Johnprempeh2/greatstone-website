import { useEffect, useRef, useState } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeHref } from '../lib/safe-url.js';

// MethodTieIn: climb.html's "(4) method tie-in" — a two-column band. LEFT: kicker + headline (accented
// "lowest first") + lead + a ghost link to the method. RIGHT: a 4×2 mini bar chart of the eight pillars
// (each a square with a bottom-anchored bar at its score), the single "lowest" one lime-highlighted —
// "we climb the lowest first". Faithful port of .tiein / .pillars-mini; bars grow on scroll-in.
export function MethodTieIn({ kicker, heading, highlight, body, ctaLabel, ctaHref = '#', pillars = [] }) {
  const ref = useReveal([pillars.length]);
  const chartRef = useRef(null);
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setGrown(true); return; }
    const r = el.getBoundingClientRect();
    if (r.top < (innerHeight || 800) * 0.85 && r.bottom > 0) { setGrown(true); return; }
    const obs = new IntersectionObserver((es, ob) => es.forEach((e) => {
      if (e.isIntersecting) { setGrown(true); ob.disconnect(); }
    }), { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [pillars.length]);

  return (
    <section ref={ref} className="b-tiein-section section">
      <div className="wrap">
        <div className="b-tiein">
          <div data-reveal>
            {kicker ? <span className="kicker">{kicker}</span> : null}
            {(heading || highlight) ? (
              <h2 className="b-tiein-h2">{heading} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
            ) : null}
            {body ? <p className="lead b-tiein-lead">{body}</p> : null}
            {ctaLabel ? <a className="b-cta ghost b-tiein-cta" href={safeHref(ctaHref)}>{ctaLabel}<Arrow /></a> : null}
          </div>

          <div ref={chartRef} className={'b-tiein-chart' + (grown ? ' is-grown' : '')} data-reveal aria-hidden="true">
            {pillars.map((p, i) => (
              <div className={'b-tiein-pm' + (p.lowest ? ' lowest' : '')} style={{ '--h': (Number.isFinite(+p.height) ? +p.height : 30) + '%' }} key={i}>
                <span>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-tiein{display:grid;grid-template-columns:1.1fr .9fr;gap:clamp(24px,4vw,56px);align-items:center}
@media(max-width:860px){.b-tiein{grid-template-columns:1fr}}
.b-tiein-h2{margin-top:14px;font-size:clamp(1.7rem,3.6vw,2.6rem);font-weight:900;letter-spacing:-.025em;line-height:1.08}
.b-tiein-lead{margin-top:18px}
.b-tiein-cta{margin-top:26px;display:inline-flex}
.b-tiein-chart{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.b-tiein-pm{aspect-ratio:1;border:1px solid var(--gs-border-soft);border-radius:12px;display:flex;align-items:flex-end;
  justify-content:center;padding:8px;font-size:.62rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;
  text-align:center;color:var(--gs-text-faint);position:relative;overflow:hidden;overflow-wrap:anywhere;line-height:1.15}
.b-tiein-pm::before{content:'';position:absolute;left:6px;right:6px;bottom:6px;border-radius:6px;height:0;
  background:linear-gradient(180deg,var(--gs-accent-soft),var(--gs-accent-dim));transition:height .8s var(--gs-ease)}
.b-tiein-chart.is-grown .b-tiein-pm::before{height:var(--h,30%)}
.b-tiein-pm.lowest{border-color:var(--gs-accent-mid);color:var(--gs-accent)}
.b-tiein-pm.lowest::before{background:linear-gradient(180deg,var(--gs-accent-mid),var(--gs-accent));box-shadow:0 0 22px -4px var(--gs-accent-glow)}
.b-tiein-pm span{position:relative;z-index:1}
@media(prefers-reduced-motion:reduce){.b-tiein-pm::before{transition:none}}
`;

export const puck = {
  label: 'Method tie-in (pillar bars)',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted phrase', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    ctaLabel: { type: 'text', label: 'Ghost button label' },
    ctaHref: { type: 'text', label: 'Ghost button link' },
    pillars: {
      type: 'array', label: 'Pillars (mini bar chart)',
      arrayFields: {
        label: { type: 'text', label: 'Label' },
        height: { type: 'number', label: 'Bar height (%)', min: 0, max: 100 },
        lowest: { type: 'radio', label: 'Lowest (highlight)', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] },
      },
      defaultItemProps: { label: 'Pillar', height: 50, lowest: false },
      getItemSummary: (i) => i.label || 'Pillar',
    },
  },
  defaultProps: {
    kicker: 'The climb meets the method',
    heading: 'We score all eight. Then climb the', highlight: 'lowest first.',
    body: 'Your altitude isn’t one number, it’s eight. We assess you across all eight pillars of the method, find the one holding the whole climb back, and start there. We leave no stone unturned.',
    ctaLabel: 'See the 8 pillars', ctaHref: '#go/method',
    pillars: [
      { label: 'People', height: 42, lowest: false },
      { label: 'Communication', height: 58, lowest: false },
      { label: 'Innovation', height: 22, lowest: true },
      { label: 'Data', height: 66, lowest: false },
      { label: 'Customer', height: 50, lowest: false },
      { label: 'Competition', height: 74, lowest: false },
      { label: 'Technology', height: 38, lowest: false },
      { label: 'Value', height: 60, lowest: false },
    ],
  },
  render: (props) => <MethodTieIn {...props} />,
};

export default MethodTieIn;
