import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeHref } from '../lib/safe-url.js';

// IntelBand: the prominent entry point to the AI Intelligence Hub from the Insights page. A glass band
// with a live pulse, the hub's pitch + a primary CTA that opens #intel, and a radar motif on the right
// echoing the hub's signature visual. Static SVG (no three.js) to keep the public page light.
export function IntelBand({ kicker, heading, highlight, body, ctaLabel, ctaHref = '#intel', themes = [], stat1, stat2 }) {
  const ref = useReveal([themes.length]);
  return (
    <section ref={ref} className="b-intel section">
      <div className="wrap">
        <a className="b-intel-card" href={safeHref(ctaHref)} data-reveal>
          <div className="b-intel-glow" aria-hidden="true" />
          <div className="b-intel-main">
            {kicker ? <span className="b-intel-live"><span className="b-intel-dot" aria-hidden="true" />{kicker}</span> : null}
            <h2 className="b-intel-h2">{heading} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
            {body ? <p className="b-intel-body">{body}</p> : null}
            {themes.length ? (
              <div className="b-intel-themes" aria-hidden="true">
                {themes.map((t, i) => <span className="b-intel-theme" key={i}>{typeof t === 'string' ? t : t.label}</span>)}
              </div>
            ) : null}
            {ctaLabel ? <span className="b-cta b-intel-cta">{ctaLabel}<Arrow /></span> : null}
            {(stat1?.value || stat2?.value) ? (
              <div className="b-intel-stats">
                {stat1?.value ? <span><b>{stat1.value}</b> {stat1.label}</span> : null}
                {stat2?.value ? <span><b>{stat2.value}</b> {stat2.label}</span> : null}
              </div>
            ) : null}
          </div>
          <div className="b-intel-viz" aria-hidden="true">
            <svg viewBox="0 0 200 200" className="b-intel-radar">
              {[1, 2, 3].map((r) => <circle key={r} cx="100" cy="100" r={r * 28} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />)}
              {[0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return <line key={i} x1="100" y1="100" x2={100 + Math.cos(a) * 84} y2={100 + Math.sin(a) * 84} stroke="rgba(255,255,255,.06)" strokeWidth="1" />; })}
              <polygon points="100,28 158,84 138,150 70,156 46,96 78,52" fill="rgba(200,255,0,.16)" stroke="#c8ff00" strokeWidth="1.6" strokeLinejoin="round" />
              <circle className="b-intel-sweep" cx="100" cy="100" r="3" fill="#c8ff00" />
            </svg>
          </div>
        </a>
      </div>
    </section>
  );
}

export const css = `
.b-intel{padding:clamp(8px,2vw,20px) 0}
.b-intel-card{position:relative;display:grid;grid-template-columns:1.35fr .65fr;gap:clamp(20px,4vw,48px);align-items:center;
  overflow:hidden;border-radius:22px;padding:clamp(26px,4vw,46px);text-decoration:none;color:inherit;
  background:linear-gradient(135deg,rgba(200,255,0,.07),rgba(60,60,60,.32) 42%,rgba(28,32,28,.4));
  border:1px solid var(--gs-border-strong,rgba(200,255,0,.18));backdrop-filter:blur(10px);
  box-shadow:0 30px 80px -50px rgba(0,0,0,.9);transition:transform .35s var(--gs-ease),border-color .35s var(--gs-ease),box-shadow .35s var(--gs-ease)}
.b-intel-card:hover{transform:translateY(-4px);border-color:var(--gs-accent-mid,rgba(200,255,0,.45));box-shadow:0 40px 90px -46px rgba(0,0,0,.95)}
.b-intel-glow{position:absolute;top:-40%;right:-10%;width:60%;height:180%;pointer-events:none;
  background:radial-gradient(circle,rgba(200,255,0,.16),transparent 62%);filter:blur(8px)}
.b-intel-main{position:relative;z-index:1}
.b-intel-live{display:inline-flex;align-items:center;gap:8px;font-size:.66rem;font-weight:800;letter-spacing:.18em;
  text-transform:uppercase;color:var(--gs-accent,#c8ff00)}
.b-intel-dot{width:8px;height:8px;border-radius:50%;background:var(--gs-accent,#c8ff00);box-shadow:0 0 0 0 rgba(200,255,0,.5);animation:bIntelPulse 2.4s var(--gs-ease) infinite}
@keyframes bIntelPulse{0%{box-shadow:0 0 0 0 rgba(200,255,0,.5)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
.b-intel-h2{margin-top:12px;font-size:clamp(1.6rem,3.4vw,2.5rem);font-weight:900;letter-spacing:-.03em;line-height:1.05}
.b-intel-body{margin-top:14px;max-width:54ch;color:var(--gs-text-muted,#c4c8c1);font-size:clamp(.98rem,1.4vw,1.1rem);line-height:1.6}
.b-intel-themes{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px}
.b-intel-theme{font-size:.66rem;font-weight:700;letter-spacing:.04em;padding:.34em .8em;border-radius:100px;
  border:1px solid rgba(255,255,255,.14);color:var(--gs-text-muted,#c4c8c1)}
.b-intel-cta{margin-top:24px;display:inline-flex}
.b-intel-stats{display:flex;flex-wrap:wrap;gap:14px 26px;margin-top:22px;font-size:.8rem;color:var(--gs-text-faint,#9ca29b)}
.b-intel-stats b{color:var(--gs-text,#f5f5f5);font-weight:900;font-size:1.05rem;font-variant-numeric:tabular-nums}
.b-intel-viz{position:relative;z-index:1;display:grid;place-items:center}
.b-intel-radar{width:100%;max-width:240px;height:auto;filter:drop-shadow(0 0 26px rgba(200,255,0,.18))}
.b-intel-sweep{transform-origin:100px 100px;animation:bIntelSweep 6s linear infinite}
@keyframes bIntelSweep{from{transform:rotate(0deg) translateX(56px) rotate(0deg)}to{transform:rotate(360deg) translateX(56px) rotate(-360deg)}}
@media(max-width:820px){.b-intel-card{grid-template-columns:1fr}.b-intel-viz{display:none}}
@media(prefers-reduced-motion:reduce){.b-intel-dot,.b-intel-sweep{animation:none}.b-intel-card:hover{transform:none}}
`;

export const puck = {
  label: 'AI Intelligence Hub band (entry)',
  fields: {
    kicker: { type: 'text', label: 'Live label', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted phrase', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    ctaLabel: { type: 'text', label: 'Button label' },
    ctaHref: { type: 'text', label: 'Button link' },
    themes: { type: 'array', label: 'Theme chips', arrayFields: { label: { type: 'text', label: 'Theme' } }, defaultItemProps: { label: 'Theme' }, getItemSummary: (i) => i.label || 'Theme' },
    stat1: { type: 'object', label: 'Stat 1', objectFields: { value: { type: 'text', label: 'Value' }, label: { type: 'text', label: 'Label' } } },
    stat2: { type: 'object', label: 'Stat 2', objectFields: { value: { type: 'text', label: 'Value' }, label: { type: 'text', label: 'Label' } } },
  },
  defaultProps: {
    kicker: 'Live · rebuilt each working day',
    heading: 'The AI landscape,', highlight: 'read for you.',
    body: 'Our standing intelligence briefing: every meaningful move in AI, with Greatstone’s own read on what it means for a business modernising with it. Models ranked, themes tracked, sources shown.',
    ctaLabel: 'Open the AI Intelligence Briefing', ctaHref: '#intel',
    themes: [{ label: 'Frontier models' }, { label: 'Agents' }, { label: 'AI security' }, { label: 'Regulation' }, { label: 'Enterprise' }],
    stat1: { value: '26', label: 'live developments' },
    stat2: { value: '8', label: 'models ranked' },
  },
  render: (props) => <IntelBand {...props} />,
};

export default IntelBand;
