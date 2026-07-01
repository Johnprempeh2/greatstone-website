import { useReveal } from './reveal.js';
import { useEffect, useState } from 'react';
import { Arrow } from './icons.jsx';
import { resolveLink } from '../lib/link-resolver.mjs';
import { LinkField } from '../cms/LinkField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// THE BLOCK CONTRACT (every block file follows this):
//   export function X(props)      — the React component; renders public + editor canvas.
//   export const css              — the block's own scoped styles (aggregated into one <style>).
//   export const puck             — Puck config fragment { label, fields, defaultProps, permissions?, render }.
// Editable text props are rendered DIRECTLY as children so Puck's contentEditable transform can
// swap them for inline-editable fields on the canvas. Never string-manipulate an editable prop,
// and never feed one into an attribute (href, etc.) — those stay plain (non-contentEditable) fields.
export function Hero({ id, puck, kicker, headline, highlight, headlineSuffix = '', body, prompt, cueStyle = 'text', align = 'left', size = 'full', ctaLabel, ctaHref = '#', ctaLabel2, ctaHref2 = '#', meta = [], lines = [], pillEyebrow = false, gridBackdrop = false, scrollCue = false }) {
  const ref = useReveal();
  // home-hero only (opt-in): hide the scroll indicator once the visitor scrolls past the fold so it
  // doesn't linger over the content below. Passive listener, removed on unmount; inert unless scrollCue.
  const [cueHidden, setCueHidden] = useState(false);
  useEffect(() => {
    if (!scrollCue || typeof window === 'undefined') return undefined;
    const onScroll = () => setCueHidden((window.scrollY || 0) > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [scrollCue]);
  // stacked headline (e.g. climb "Pebble. / Plateau. / Peak."): an explicit lines array forces a line
  // break per item, accenting (+ glow) the flagged ones — kept off the contentEditable headline string.
  const stacked = Array.isArray(lines) && lines.length > 0;
  // CTA targets come from the LinkField (structured) or a legacy string; resolveLink folds both into
  // sanitised anchor props. '#book'/'#go/<slug>' are handled by App's global click handler.
  const cta1 = resolveLink(ctaHref);
  const cta2 = resolveLink(ctaHref2);
  return (
    <section ref={ref} className={`b-hero size-${size} align-${align}${gridBackdrop ? ' has-grid' : ''}`}>
      <div className="wrap b-hero-inner">
        <EditableText editing={puck && puck.isEditing} id={id} field="kicker" value={kicker} as="span" className={pillEyebrow ? 'pill' : 'kicker'} singleLine placeholder="Eyebrow…" data-reveal />
        <h1 data-reveal className={stacked ? 'b-hero-stack' : undefined}>
          {stacked
            ? lines.map((l, i) => <span className={'b-hero-line' + (l.accent ? ' accent b-hero-glow' : '')} key={i}>{l.text}</span>)
            : <>{headline} {highlight ? <span className="accent">{highlight}</span> : null}{headlineSuffix || ''}</>}
        </h1>
        <EditableText editing={puck && puck.isEditing} id={id} field="body" value={body} as="p" className="lede" placeholder="Add a subheading…" data-reveal />
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
            {ctaLabel ? <a className="b-cta" href={cta1.href} target={cta1.target} rel={cta1.rel}>{ctaLabel}<Arrow /></a> : null}
            {ctaLabel2 ? <a className="b-cta ghost" href={cta2.href} target={cta2.target} rel={cta2.rel}>{ctaLabel2}</a> : null}
          </div>
        ) : null}
        {prompt ? (
          cueStyle === 'mouse'
            ? <span className="b-hero-mousecue" data-reveal><span className="b-hero-capsule" aria-hidden="true"></span>{prompt}</span>
            : <span className="b-hero-prompt" data-reveal>{prompt}</span>
        ) : null}
      </div>
      {scrollCue ? (
        <span className={'b-hero-scrollcue' + (cueHidden ? ' is-gone' : '')} aria-hidden="true">
          <span className="b-hero-scrollcue-label">Scroll down to start the climb</span>
          <span className="b-hero-scrollcue-chevron" />
        </span>
      ) : null}
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
.b-hero-stat{min-width:0}
.b-hero-bignum{display:block;font-weight:900;font-size:clamp(2.6rem,6vw,5rem);line-height:1;color:var(--gs-accent);letter-spacing:-.03em;overflow-wrap:anywhere}
.b-hero-statlabel{display:block;font-size:.82rem;font-weight:600;letter-spacing:.04em;color:var(--gs-text-muted);margin-top:.35rem;max-width:22ch}
/* matches the live homepage .hero-cue */
.b-hero-prompt{display:inline-flex;align-items:center;gap:.6em;margin-top:30px;font-size:10px;font-weight:700;
  letter-spacing:2.5px;text-transform:uppercase;color:var(--gs-text-faint)}
.b-hero-prompt::before{content:"";width:26px;height:1px;background:linear-gradient(90deg,transparent,var(--gs-accent))}
.b-hero.align-center .b-hero-prompt{justify-content:center}
/* faithful port of the live climb .scroll-cue: an animated mouse-capsule + dropping lime dot. Opt-in via cueStyle:'mouse' */
.b-hero-mousecue{display:inline-flex;align-items:center;gap:.7em;margin-top:46px;font-size:.72rem;font-weight:700;
  letter-spacing:.28em;text-transform:uppercase;color:var(--gs-text-faint)}
.b-hero.align-center .b-hero-mousecue{justify-content:center}
.b-hero-capsule{width:18px;height:30px;border:1.5px solid var(--gs-border);border-radius:100px;position:relative}
.b-hero-capsule::after{content:"";position:absolute;left:50%;top:6px;width:3px;height:6px;margin-left:-1.5px;
  border-radius:3px;background:var(--gs-accent);animation:bHeroCueDrop 1.9s var(--gs-ease) infinite}
@keyframes bHeroCueDrop{0%,15%{transform:translateY(0);opacity:1}70%,100%{transform:translateY(12px);opacity:0}}
@media (prefers-reduced-motion: reduce){.b-hero-capsule::after{animation:none}}
/* home-hero scroll indicator (opt-in via scrollCue): a lime chevron that bounces at the foot of the
   full-height hero and fades out once the visitor scrolls. Decorative (aria-hidden). */
.b-hero-scrollcue{position:absolute;left:50%;bottom:clamp(20px,4vh,38px);transform:translateX(-50%);
  display:flex;flex-direction:column;align-items:center;gap:9px;z-index:2;pointer-events:none;
  opacity:1;transition:opacity .5s var(--gs-ease),transform .5s var(--gs-ease)}
.b-hero-scrollcue.is-gone{opacity:0;transform:translateX(-50%) translateY(8px)}
.b-hero-scrollcue-label{font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--gs-text-faint)}
.b-hero-scrollcue-chevron{width:13px;height:13px;border-right:2px solid var(--gs-accent);border-bottom:2px solid var(--gs-accent);
  transform:rotate(45deg);animation:bHeroScrollBounce 1.8s var(--gs-ease) infinite}
@keyframes bHeroScrollBounce{0%,100%{transform:rotate(45deg) translate(0,0);opacity:.55}50%{transform:rotate(45deg) translate(3px,3px);opacity:1}}
@media (prefers-reduced-motion: reduce){.b-hero-scrollcue-chevron{animation:none;opacity:.7}}
/* opt-in engineered grid backdrop — faithful to the live .svc-hero::before (services only) */
.b-hero.has-grid::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:-1;opacity:.5;
  background-image:linear-gradient(var(--gs-border-soft) 1px,transparent 1px),linear-gradient(90deg,var(--gs-border-soft) 1px,transparent 1px);
  background-size:64px 64px;
  -webkit-mask-image:radial-gradient(120% 90% at 80% 0%,#000 25%,transparent 70%);
          mask-image:radial-gradient(120% 90% at 80% 0%,#000 25%,transparent 70%)}
`;

export const puck = {
  label: 'Hero',
  permissions: { delete: false }, // the page hero is structural; protected in code, not trust
  fields: {
    kicker: { type: 'custom', label: 'Kicker', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    headlineSuffix: { type: 'text', label: 'Headline suffix (after highlight, optional)' },
    body: { type: 'custom', label: 'Body', render: (props) => <RichTextField {...props} /> },
    prompt: { type: 'text', label: 'Cursor prompt (optional)', contentEditable: true },
    cueStyle: { type: 'radio', label: 'Cue style', options: [
      { label: 'Text line', value: 'text' }, { label: 'Mouse capsule (scroll)', value: 'mouse' },
    ]},
    scrollCue: { type: 'radio', label: 'Scroll indicator (home hero)', options: [
      { label: 'Off', value: false }, { label: 'On (bouncing chevron)', value: true },
    ]},
    align: { type: 'radio', label: 'Alignment', options: [
      { label: 'Left', value: 'left' }, { label: 'Centre', value: 'center' },
    ]},
    pillEyebrow: { type: 'radio', label: 'Eyebrow style', options: [
      { label: 'Kicker (label)', value: false }, { label: 'Pill (bordered)', value: true },
    ]},
    gridBackdrop: { type: 'radio', label: 'Grid backdrop', options: [
      { label: 'None', value: false }, { label: 'Engineered grid', value: true },
    ]},
    size: { type: 'radio', label: 'Height', options: [
      { label: 'Full screen', value: 'full' }, { label: 'Standard', value: 'standard' }, { label: 'Compact', value: 'compact' },
    ]},
    ctaLabel: { type: 'text', label: 'Primary button label (optional)' },
    ctaHref: { type: 'custom', label: 'Primary button link', render: (props) => <LinkField {...props} /> },
    ctaLabel2: { type: 'text', label: 'Ghost button label (optional)' },
    ctaHref2: { type: 'custom', label: 'Ghost button link', render: (props) => <LinkField {...props} /> },
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
    cueStyle: 'text',
    headlineSuffix: '',
    align: 'left', size: 'full', ctaLabel: 'Book a Diagnostic', ctaHref: '#book', ctaLabel2: '', ctaHref2: '#', meta: [], lines: [], pillEyebrow: false, gridBackdrop: false, scrollCue: false,
  },
  render: (props) => <Hero {...props} />,
};

export default Hero;
