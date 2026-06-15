import { useEffect, useRef } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeHref } from '../lib/safe-url.js';

// The one thing you can't make more of. A live clock counts the time slipping past since the
// visitor arrived, under the "you can't buy time, we're the exception" line. The number is
// code-driven (rAF, paused when the tab is hidden, seconds-only under reduced-motion); the copy
// is editable. Pairs with a tide background.
export function TimeCounter({ kicker, headline, highlight, body, clockLabel, coda, ctaLabel, ctaHref = '#book' }) {
  const ref = useReveal();
  const clockRef = useRef(null);
  useEffect(() => {
    const el = clockRef.current; if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let t0 = null, raf = 0, lastSec = -1;
    const loop = (now) => {
      if (!document.hidden) {
        if (t0 == null) t0 = now;
        const t = (now - t0) / 1000;
        if (reduce) { const s = Math.floor(t); if (s !== lastSec) { lastSec = s; el.textContent = s + 's'; } }
        else el.textContent = t.toFixed(1) + 's';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section ref={ref} className="b-time">
      <div className="wrap b-time-inner">
        {kicker ? <span className="kicker" data-reveal>{kicker}</span> : null}
        <h2 data-reveal>{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
        {body ? <p className="b-time-body" data-reveal>{body}</p> : null}
        <div className="b-time-clock" data-reveal>
          {clockLabel ? <span className="b-time-label">{clockLabel}</span> : null}
          <span className="b-time-num" ref={clockRef}>0.0s</span>
        </div>
        {coda ? <p className="b-time-coda" data-reveal>{coda}</p> : null}
        {ctaLabel ? <a className="b-cta" href={safeHref(ctaHref)} data-reveal>{ctaLabel}<Arrow /></a> : null}
      </div>
    </section>
  );
}

export const css = `
.b-time{padding:clamp(72px,13vw,160px) 0;position:relative;text-align:center}
.b-time-inner{max-width:760px;margin-inline:auto;position:relative;z-index:2}
.b-time h2{margin-top:14px;font-size:clamp(2rem,5.4vw,3.8rem);font-weight:900;line-height:1.02;letter-spacing:-.03em;color:#fff}
.b-time-body{margin:22px auto 0;max-width:54ch;color:var(--gs-muted);font-size:clamp(1.02rem,1.6vw,1.22rem);line-height:1.7}
.b-time-clock{margin-top:clamp(32px,5vw,52px);display:flex;flex-direction:column;align-items:center;gap:8px}
.b-time-label{font-size:.7rem;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:var(--gs-faint)}
.b-time-num{font-weight:900;font-size:clamp(3rem,9vw,6rem);line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums;
  color:var(--gs-accent);text-shadow:0 0 50px rgba(200,255,0,.35)}
.b-time-coda{margin:clamp(28px,4vw,40px) auto 0;max-width:48ch;font-weight:800;color:var(--gs-text);font-size:clamp(1rem,1.6vw,1.22rem)}
.b-time .b-cta{margin-top:clamp(28px,4vw,40px)}
`;

export const puck = {
  label: 'Time counter (live)',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    clockLabel: { type: 'text', label: 'Clock label', contentEditable: true },
    coda: { type: 'textarea', label: 'Coda (optional)', contentEditable: true },
    ctaLabel: { type: 'text', label: 'Button label (optional)' },
    ctaHref: { type: 'text', label: 'Button link' },
  },
  defaultProps: {
    kicker: 'The one thing you can’t make more of',
    headline: 'You can’t buy time.', highlight: 'We’re the exception.',
    body: 'It moves in one direction and never comes back. The whole of business is a fight to spend less of it on the wrong things. That fight is what we win for you.',
    clockLabel: 'Slipping past since you arrived',
    coda: '', ctaLabel: 'Book a Deep Dive', ctaHref: '#book',
  },
  render: (props) => <TimeCounter {...props} />,
};

export default TimeCounter;
