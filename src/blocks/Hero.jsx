import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeHref } from '../lib/safe-url.js';

// THE BLOCK CONTRACT (every block file follows this):
//   export function X(props)      — the React component; renders public + editor canvas.
//   export const css              — the block's own scoped styles (aggregated into one <style>).
//   export const puck             — Puck config fragment { label, fields, defaultProps, permissions?, render }.
// Editable text props are rendered DIRECTLY as children so Puck's contentEditable transform can
// swap them for inline-editable fields on the canvas. Never string-manipulate an editable prop,
// and never feed one into an attribute (href, etc.) — those stay plain (non-contentEditable) fields.
export function Hero({ kicker, headline, highlight, body, prompt, align = 'left', size = 'full', ctaLabel, ctaHref = '#', ctaLabel2, ctaHref2 = '#', meta = [], lines = [], pillEyebrow = false }) {
  const ref = useReveal();
  // stacked headline (e.g. climb "Pebble. / Plateau. / Peak."): an explicit lines array forces a line
  // break per item, accenting (+ glow) the flagged ones — kept off the contentEditable headline string.
  const stacked = Array.isArray(lines) && lines.length > 0;
  return (
    <section ref={ref} className={`b-hero size-${size} align-${align}`}>
      <div className="wrap b-hero-inner">
        {kicker ? <span className={pillEyebrow ? 'pill' : 'kicker'} data-reveal>{kicker}</span> : null}
        <h1 data-reveal className={stacked ? 'b-hero-stack' : undefined}>
          {stacked
            ? lines.map((l, i) => <span className={'b-hero-line' + (l.accent ? ' accent b-hero-glow' : '')} key={i}>{l.text}</span>)
            : <>{headline} {highlight ? <span className="accent">{highlight}</span> : null}</>}
        </h1>
        {body ? <p className="lede" data-reveal>{body}</p> : null}
        {Array.isArray(meta) && meta.length ? (
          <div className="b-hero-meta" data-reveal>
            {meta.map((m, i) => (
              <div className="b-hero-stat" key={i}>
                <span className="b-hero-bignum">{m.bignum}</span>
                <span className="b-hero-statlabel">{m.label}</span>
              </div>
            ))}
          </div>
        ) : null}
        {(ctaLabel || ctaLabel2) ? (
          <div className="b-cta-row" data-reveal>
            {ctaLabel ? <a className="b-cta" href={safeHref(ctaHref)}>{ctaLabel}<Arrow /></a> : null}
            {ctaLabel2 ? <a className="b-cta ghost" href={safeHref(ctaHref2)}>{ctaLabel2}</a> : null}
          </div>
        ) : null}
        {prompt ? <span className="b-hero-prompt" data-reveal>{prompt}</span> : null}
      </div>
    </section>
  );
}

export const css = `
.b-hero{position:relative;display:flex;align-items:center}
.b-hero.size-full{min-height:100vh}
.b-hero.size-standard{min-height:72vh;padding:clamp(80px,14vh,160px) 0}
/* compact: a short sub-page hero (the live .ind-hero / .ins-hero) so the section below sits near the fold */
.b-hero.size-compact{min-height:auto;padding:clamp(140px,20vh,220px) 0 clamp(48px,7vh,90px)}
.b-hero.align-center{text-align:center}
.b-hero.align-center.size-full{padding-top:72px}
.b-hero-inner{max-width:660px;position:relative;z-index:2}
.b-hero.align-center .b-hero-inner{max-width:1040px;margin-inline:auto}
/* matches the live homepage .hero-title scale exactly */
.b-hero h1{font-weight:900;line-height:1.02;letter-spacing:-2.5px;font-size:clamp(40px,6.2vw,84px);
  text-shadow:0 2px 60px rgba(0,0,0,.6);margin-top:20px}
.b-hero h1.b-hero-stack .b-hero-line{display:block}
.b-hero h1.b-hero-stack .b-hero-line.b-hero-glow{text-shadow:0 0 50px var(--gs-accent-glow),0 2px 60px rgba(0,0,0,.6)}
.b-hero .lede{margin-top:24px;color:var(--gs-text-muted);font-size:clamp(15px,1.4vw,18px);line-height:1.8;max-width:560px;
  text-shadow:0 2px 30px rgba(0,0,0,.7)}
.b-hero.align-center .lede{margin-inline:auto}
.b-hero .b-cta-row{margin-top:30px}
.b-hero.align-center .b-cta-row{justify-content:center}
/* optional stats row (about hero .hero-meta) */
.b-hero-meta{display:flex;flex-wrap:wrap;gap:clamp(28px,5vw,64px);margin-top:clamp(34px,5vh,56px)}
.b-hero.align-center .b-hero-meta{justify-content:center}
.b-hero-bignum{display:block;font-weight:900;font-size:clamp(2.6rem,6vw,5rem);line-height:1;color:var(--gs-accent);letter-spacing:-.03em}
.b-hero-statlabel{display:block;font-size:.82rem;font-weight:600;letter-spacing:.04em;color:var(--gs-text-muted);margin-top:.35rem;max-width:22ch}
/* matches the live homepage .hero-cue */
.b-hero-prompt{display:inline-flex;align-items:center;gap:.6em;margin-top:30px;font-size:10px;font-weight:700;
  letter-spacing:2.5px;text-transform:uppercase;color:var(--gs-text-faint)}
.b-hero-prompt::before{content:"";width:26px;height:1px;background:linear-gradient(90deg,transparent,var(--gs-accent))}
.b-hero.align-center .b-hero-prompt{justify-content:center}
`;

export const puck = {
  label: 'Hero',
  permissions: { delete: false }, // the page hero is structural; protected in code, not trust
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    prompt: { type: 'text', label: 'Cursor prompt (optional)', contentEditable: true },
    align: { type: 'radio', label: 'Alignment', options: [
      { label: 'Left', value: 'left' }, { label: 'Centre', value: 'center' },
    ]},
    pillEyebrow: { type: 'radio', label: 'Eyebrow style', options: [
      { label: 'Kicker (label)', value: false }, { label: 'Pill (bordered)', value: true },
    ]},
    size: { type: 'radio', label: 'Height', options: [
      { label: 'Full screen', value: 'full' }, { label: 'Standard', value: 'standard' }, { label: 'Compact', value: 'compact' },
    ]},
    ctaLabel: { type: 'text', label: 'Primary button label (optional)' },
    ctaHref: { type: 'text', label: 'Primary button link' },
    ctaLabel2: { type: 'text', label: 'Ghost button label (optional)' },
    ctaHref2: { type: 'text', label: 'Ghost button link' },
    meta: {
      type: 'array', label: 'Stats row (optional)',
      arrayFields: { bignum: { type: 'text', label: 'Figure' }, label: { type: 'text', label: 'Label' } },
      defaultItemProps: { bignum: '20', label: 'Years' },
      getItemSummary: (item) => item.bignum || 'Stat',
    },
    lines: {
      type: 'array', label: 'Stacked headline lines (optional, overrides headline)',
      arrayFields: {
        text: { type: 'text', label: 'Line' },
        accent: { type: 'radio', label: 'Accent', options: [{ label: 'No', value: false }, { label: 'Yes (lime + glow)', value: true }] },
      },
      defaultItemProps: { text: 'Line', accent: false },
      getItemSummary: (item) => item.text || 'Line',
    },
  },
  defaultProps: {
    kicker: 'The Foundation of Digital Excellence',
    headline: 'We don’t decorate businesses with technology.',
    highlight: 'We build what holds everything up.',
    body: 'A transformation partner, not a software house. Edit any line on the canvas, pick the 3D background, add blocks.',
    prompt: 'Move your cursor. The stone responds',
    align: 'left', size: 'full', ctaLabel: 'Book a Deep Dive', ctaHref: '#book', ctaLabel2: '', ctaHref2: '#', meta: [], lines: [], pillEyebrow: false,
  },
  render: (props) => <Hero {...props} />,
};

export default Hero;
