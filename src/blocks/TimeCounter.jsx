import { useEffect, useRef } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { resolveLink } from '../lib/link-resolver.mjs';
import { LinkField } from '../cms/LinkField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// contact.html's signature hero: "You still can't buy time. Let's save yours." over a compact bordered
// time-cost chip — a blinking dot + a live MM:SS clock counting the visitor's time on the page + an
// escalating narrative line ("you won't get them back"). Faithful port of .timecost / tcPulse. The
// clock ticks once per second (paused when the tab is hidden); reduced-motion only stills the dot.
export function TimeCounter({ id, puck, kicker, headline, highlight, body, clockLabel, ctaLabel, ctaHref = '#book' }) {
  const ref = useReveal();
  const editing = puck && puck.isEditing;
  const clockRef = useRef(null);
  const lineRef = useRef(null);
  useEffect(() => {
    const clk = clockRef.current, line = lineRef.current;
    if (!clk) return;
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    const phrase = (s) => {
      if (s < 1) return 'The clock’s already running. You won’t get this second back, now imagine a year of them.';
      if (s < 60) return `You’ve been here <b>${s} second${s === 1 ? '' : 's'}</b>, that’s ${s} you won’t get back. Now imagine a year of them.`;
      const m = Math.floor(s / 60), r = s % 60;
      return `You’ve been here <b>${m} minute${m === 1 ? '' : 's'} ${r}s</b>, gone for good. A whole business loses that every few minutes, all year.`;
    };
    let t0 = null, lastSec = -1;
    const tick = () => {
      if (document.hidden) return;
      if (t0 == null) t0 = Date.now();
      const s = Math.floor((Date.now() - t0) / 1000);
      if (s === lastSec) return;
      lastSec = s;
      clk.textContent = pad(Math.floor(s / 60)) + ':' + pad(s % 60);
      if (line) line.innerHTML = phrase(s);
    };
    tick();
    // reduced-motion: render one static frame, don't tick every second (WCAG 2.2.2: no auto-updating the user can't pause)
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section ref={ref} className="b-time">
      <div className="wrap b-time-inner">
        <EditableText editing={editing} id={id} field="kicker" value={kicker} as="span" className="kicker" singleLine placeholder="Kicker…" data-reveal />
        <h1 className="b-time-head" data-reveal><EditableText editing={editing} id={id} field="headline" value={headline} as="span" singleLine placeholder="Headline…" /> {highlight ? <span className="accent">{highlight}</span> : null}</h1>
        <EditableText editing={editing} id={id} field="body" value={body} as="p" className="lead b-time-body" placeholder="Lead…" data-reveal />

        <div className="b-tc-chip" data-reveal role="status" aria-live="polite">
          <div className="b-tc-top">
            <span className="b-tc-dot" aria-hidden="true" />
            <span className="b-tc-clock" ref={clockRef}>00:00</span>
            <EditableText editing={editing} id={id} field="clockLabel" value={clockLabel} as="span" className="b-tc-label" singleLine placeholder="Clock label…" />
          </div>
          <p className="b-tc-line" ref={lineRef}>The clock’s already running. You won’t get this second back, now imagine a year of them.</p>
        </div>

        {ctaLabel ? <a className="b-cta b-time-cta" {...resolveLink(ctaHref)} data-reveal>{ctaLabel}<Arrow /></a> : null}
      </div>
    </section>
  );
}

export const css = `
.b-time{padding:clamp(120px,18vh,210px) 0 clamp(48px,8vh,96px);position:relative}
.b-time-inner{max-width:920px;position:relative;z-index:2}
.b-time-head{margin-top:14px;font-size:clamp(2.4rem,7vw,5rem);font-weight:900;line-height:1.0;letter-spacing:-.03em;color:#fff;max-width:16ch}
.b-time-body{margin-top:22px;max-width:60ch}
.b-tc-chip{margin-top:2.4rem;display:inline-flex;flex-direction:column;gap:.45rem;padding:1.1rem 1.5rem;
  border:1px solid var(--gs-border);border-radius:16px;background:linear-gradient(180deg,var(--gs-accent-soft),transparent);
  backdrop-filter:blur(6px);max-width:min(540px,92vw)}
.b-tc-top{display:flex;align-items:center;gap:.7rem}
.b-tc-dot{width:9px;height:9px;border-radius:50%;background:var(--gs-accent);box-shadow:0 0 0 0 var(--gs-accent-glow);
  animation:gsTcPulse 1s steps(1,end) infinite}
@keyframes gsTcPulse{0%{box-shadow:0 0 0 0 var(--gs-accent-glow);opacity:1}50%{box-shadow:0 0 0 7px transparent;opacity:.35}100%{box-shadow:0 0 0 0 transparent;opacity:1}}
.b-tc-clock{font-variant-numeric:tabular-nums;font-weight:900;font-size:clamp(1.5rem,3.4vw,2.2rem);letter-spacing:-.01em;color:var(--gs-accent);line-height:1}
.b-tc-label{font-size:.72rem;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:var(--gs-text-faint)}
.b-tc-line{font-size:clamp(.95rem,1.5vw,1.1rem);color:var(--gs-text-muted)}
.b-tc-line b{color:var(--gs-text);font-weight:700}
.b-time-cta{margin-top:clamp(28px,4vw,40px)}
@media(prefers-reduced-motion:reduce){.b-tc-dot{animation:none}}
`;

export const puck = {
  label: 'Time counter (live)',
  fields: {
    kicker: { type: 'custom', label: 'Kicker', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    headline: { type: 'custom', label: 'Headline', render: (props) => <RichTextField {...props} variant="heading" /> },
    highlight: { type: 'text', label: 'Highlighted line', contentEditable: true },
    body: { type: 'custom', label: 'Lead', render: (props) => <RichTextField {...props} /> },
    clockLabel: { type: 'custom', label: 'Clock label', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    ctaLabel: { type: 'text', label: 'Button label (optional)' },
    ctaHref: { type: 'custom', label: 'Button link', render: (props) => <LinkField {...props} /> },
  },
  defaultProps: {
    kicker: 'Book a Diagnostic',
    headline: 'You still can’t buy time.', highlight: 'Let’s save yours.',
    body: 'Everyone sells you tools. We buy back the hours your business is quietly losing, week after week, in the gaps you’ve stopped noticing. One diagnostic. No pitch, no obligation. We come in, look hard, and leave no stone unturned.',
    clockLabel: 'on this page',
    ctaLabel: '', ctaHref: '#book',
  },
  render: (props) => <TimeCounter {...props} />,
};

export default TimeCounter;
