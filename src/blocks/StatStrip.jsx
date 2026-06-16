import { useEffect, useRef } from 'react';
import { useReveal } from './reveal.js';

const fmt = (n, dec) => (dec > 0 ? n.toFixed(dec) : Math.round(n).toLocaleString('en-GB'));

// Proof, not promises: an intro, a clients line, and a row of stats that count up once on
// entry (and honour reduced-motion by showing the final figure immediately). The counter
// drives DOM text directly so the figures are real text content for accessibility/SEO.
export function StatStrip({ index, eyebrow, headline, highlight, body, clients, stats = [], columns = 4, variant = 'aurora' }) {
  const reveal = useReveal([stats.length]);
  const countRef = useRef(null);
  const band = variant === 'band';
  useEffect(() => {
    const el = countRef.current; if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const run = () => el.querySelectorAll('.b-stat-num[data-target]').forEach((node) => {
      const stat = node.closest('.b-stat'); if (stat) stat.classList.add('is-lit'); // live: .stat.lit num turns lime
      const target = parseFloat(node.dataset.target || '0'), dec = parseInt(node.dataset.dec || '0', 10);
      const pre = node.dataset.prefix || '';
      if (reduce) { node.textContent = pre + fmt(target, dec); return; }
      const dur = 1500; let start = null;
      const step = (ts) => { if (start === null) start = ts; const pr = Math.min((ts - start) / dur, 1); const e = 1 - Math.pow(1 - pr, 3);
        node.textContent = pre + fmt(target * e, dec); if (pr < 1) requestAnimationFrame(step); else node.textContent = pre + fmt(target, dec); };
      requestAnimationFrame(step);
    });
    const obs = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { run(); obs.disconnect(); } }), { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [JSON.stringify(stats)]);

  const hasHeader = index || eyebrow || headline || highlight || body || clients;
  return (
    <section ref={reveal} className={'b-proof' + (band ? ' b-proof-band' : '')}>
      {band ? null : <div className="b-proof-aurora" aria-hidden="true" />}
      <div className="wrap">
        {hasHeader ? (
          <>
            {(index || eyebrow) ? (
              <div className="b-chapter-eyebrow" data-reveal>
                {index ? <span className="b-chapter-num">{index}</span> : null}
                {eyebrow ? <span className="b-chapter-name">{eyebrow}</span> : null}
              </div>
            ) : null}
            {(headline || highlight) ? <h2 className="b-proof-head" data-reveal>{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2> : null}
            {body ? <p className="b-proof-body" data-reveal>{body}</p> : null}
            {clients ? <p className="b-proof-clients" data-reveal>{clients}</p> : null}
          </>
        ) : null}
        {stats.length > 0 && (
          <div className="b-proof-stats" ref={countRef} style={{ '--b-cols': columns }}>
            {stats.map((s, i) => (
              <div className="b-stat" data-reveal style={{ transitionDelay: `${i * 70}ms` }} key={i}>
                <div className="b-stat-fig">
                  <span className="b-stat-num" data-target={s.value} data-prefix={s.prefix || ''} data-dec={s.dec || 0}>{(s.prefix || '') + '0'}</span>
                  {s.suffix ? <span className="b-stat-suffix">{s.suffix}</span> : null}
                </div>
                <div className="b-stat-l">{s.label}</div>
                {s.note ? <div className="b-stat-n">{s.note}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export const css = `
.b-proof{position:relative;overflow:hidden;padding:clamp(64px,11vw,140px) 0;
  border-top:1px solid var(--gs-border-soft);border-bottom:1px solid var(--gs-border-soft);background:rgba(12,14,12,.45)}
.b-proof-aurora{position:absolute;inset:-30%;z-index:0;pointer-events:none;
  background:radial-gradient(38% 50% at 28% 28%,rgba(27,80,57,.42),transparent 70%),radial-gradient(34% 46% at 76% 70%,rgba(200,255,0,.08),transparent 70%);
  filter:blur(8px);animation:gsDrift 24s var(--gs-ease) infinite alternate}
@media(prefers-reduced-motion:reduce){.b-proof-aurora{animation:none}}
.b-proof .wrap{position:relative;z-index:1}
.b-proof-head{font-size:clamp(1.9rem,4.8vw,3.3rem);font-weight:900;line-height:1.02;letter-spacing:-.03em}
.b-proof-body{margin-top:22px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.18rem);max-width:62ch;line-height:1.7}
.b-proof-clients{margin-top:18px;color:var(--gs-faint);font-size:.82rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.b-proof-stats{display:grid;grid-template-columns:repeat(var(--b-cols,4),1fr);gap:clamp(18px,3vw,40px);margin-top:clamp(34px,5vw,56px)}
@media(max-width:760px){.b-proof-stats{grid-template-columns:repeat(2,1fr) !important;gap:28px}}
.b-stat-fig{display:flex;align-items:baseline;gap:.06em}
.b-stat-num{font-size:clamp(2.2rem,5vw,3.4rem);font-weight:900;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums;
  background:linear-gradient(180deg,#fff,#c8ff00);-webkit-background-clip:text;background-clip:text;color:transparent}
.b-stat-suffix{font-size:clamp(1.4rem,3vw,2.2rem);font-weight:800;letter-spacing:-.02em;line-height:1;
  background:linear-gradient(180deg,#fff,#c8ff00);-webkit-background-clip:text;background-clip:text;color:transparent}
.b-stat-l{margin-top:12px;font-size:.9rem;color:var(--gs-text);font-weight:700;line-height:1.35;max-width:26ch}
.b-stat-n{margin-top:6px;font-size:.74rem;color:var(--gs-faint);font-weight:500;line-height:1.45;max-width:30ch}
/* band variant — the live proof .stat-band: border-block + accent-soft gradient, no header, per-stat left accent
   bar, solid white number that lights lime on reveal, smaller solid-lime suffix, muted label */
.b-proof-band{border-top:1px solid var(--gs-border-soft);border-bottom:1px solid var(--gs-border-soft);
  background:linear-gradient(180deg,var(--gs-accent-soft),transparent 60%);padding:clamp(40px,7vw,90px) 0}
.b-proof-band .b-stat{position:relative;padding:6px 4px 8px 18px}
.b-proof-band .b-stat::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:2px;border-radius:2px;
  background:linear-gradient(180deg,var(--gs-accent),transparent);opacity:.55}
.b-proof-band .b-stat-num{background:none;-webkit-text-fill-color:currentColor;color:var(--gs-text);
  font-size:clamp(2.8rem,6vw,4.6rem);line-height:.92;letter-spacing:-.04em;transition:color .5s var(--gs-ease)}
.b-proof-band .b-stat.is-lit .b-stat-num{color:var(--gs-accent)}
.b-proof-band .b-stat-suffix{background:none;-webkit-text-fill-color:currentColor;color:var(--gs-accent);
  font-size:clamp(1.3rem,2.6vw,2.1rem)}
.b-proof-band .b-stat-l{margin-top:12px;font-weight:600;color:var(--gs-text-muted);font-size:.86rem;max-width:24ch}
`;

const STAT = (value, suffix, prefix, dec, label) => ({ value, suffix, prefix, dec, label });

export const puck = {
  label: 'Proof / stats',
  fields: {
    index: { type: 'text', label: 'Number', contentEditable: true },
    eyebrow: { type: 'text', label: 'Eyebrow', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    clients: { type: 'text', label: 'Clients line', contentEditable: true },
    columns: { type: 'number', label: 'Columns', min: 2, max: 4 },
    variant: { type: 'radio', label: 'Style', options: [
      { label: 'Aurora (with header)', value: 'aurora' }, { label: 'Band (headerless stat row)', value: 'band' },
    ]},
    stats: {
      type: 'array', label: 'Stats',
      arrayFields: {
        value: { type: 'number', label: 'Value' },
        prefix: { type: 'text', label: 'Prefix' },
        suffix: { type: 'text', label: 'Suffix' },
        dec: { type: 'number', label: 'Decimals' },
        label: { type: 'text', label: 'Label (keep short)' },
        note: { type: 'textarea', label: 'Note (optional)' },
      },
      defaultItemProps: { value: 100, prefix: '', suffix: '+', dec: 0, label: 'A stat', note: '' },
      getItemSummary: (item) => item.label || 'Stat',
    },
  },
  defaultProps: {
    index: '05', eyebrow: 'Proof, Not Promises',
    headline: 'Measured in', highlight: 'hours back.',
    body: 'Our leadership has delivered transformation for Deloitte, Lloyds, Bank of Scotland and the NHS. Today we’re embedded with clients across the UK and Africa.',
    clients: 'Deloitte · Lloyds · Bank of Scotland · NHS',
    columns: 4, variant: 'aurora',
    stats: [
      STAT(21, '+', '', 0, 'Hours recovered weekly, one engagement'),
      STAT(27, 'k', '£', 0, 'Capacity returned annually'),
      STAT(20, '', '', 0, 'Years of leadership heritage'),
      STAT(2, '', '', 0, 'Continents, one team'),
    ],
  },
  render: (props) => <StatStrip {...props} />,
};

export default StatStrip;
