import { useReveal } from './reveal.js';
import { BRAND_TAGLINE, PRIMARY_CTA_LABEL, PRIMARY_CTA_HREF } from '../lib/brand.mjs';
import { useEffect, useState, useRef } from 'react';
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
// The hero's own 3D mark, mounted into a CONTAINED box rather than the full-screen Stage, so it sits
// beside the Opening Statement instead of behind the reading. Two things make this cheap:
//   three.js is ~520KB and deliberately kept off the critical path (App.jsx lazy-loads Stage for
//   exactly that reason), so the module is imported dynamically here too: the hero paints immediately
//   and the mark arrives when its chunk lands.
//   greatstone-logo.mjs already self-gates on its own IntersectionObserver, so the loop stops the
//   moment the hero scrolls away. Nothing extra to wire.
function HeroStone({ enabled = true, still = false }) {
  const host = useRef(null);
  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof matchMedia === 'undefined') return undefined;
    // The mark is only rendered at two-column widths, and standing up a WebGL context for a canvas
    // nobody can see is pure cost on exactly the devices least able to pay. But the breakpoint has to
    // be WATCHED, not read once: read once, a visitor who loads at 900px and then maximises their
    // window keeps an empty column until they reload. So mount and unmount follow the query.
    const mq = matchMedia('(min-width:1024px)');
    let handle = null, dead = false, loading = false;
    const up = () => {
      if (handle || loading || !host.current) return;
      loading = true;
      // three.js is ~520KB and deliberately kept off the critical path (App.jsx lazy-loads Stage for
      // exactly that reason), so this is a dynamic import too: the hero paints at once and the mark
      // arrives when its chunk lands.
      import('../lib/greatstone-logo.mjs').then((m) => {
        loading = false;
        if (dead || handle || !host.current || !mq.matches) return;
        // mounting constructs a WebGLRenderer, which THROWS where WebGL is unavailable (blocklisted
        // GPU, hardened browser, some VMs). Guard it: the hero simply renders without the mark.
        try {
          handle = m.mountGreatstoneLogo(host.current, {
            envUrl: import.meta.env.BASE_URL + 'env-emerald.jpg',
            bloom: 0.6, exposure: 1.3, idle: true, autoTurn: true,
          });
        } catch (e) { handle = null; }
      }).catch(() => { loading = false; });
    };
    const down = () => { if (handle) { try { handle.destroy(); } catch (e) { /* already gone */ } handle = null; } };
    const onChange = () => (mq.matches ? up() : down());
    onChange();
    // Safari before 14 has no addEventListener on MediaQueryList
    if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
    return () => {
      dead = true;
      if (mq.removeEventListener) mq.removeEventListener('change', onChange); else mq.removeListener(onChange);
      down();
    };
  }, [enabled]);
  return <div className="b-hero-stone" ref={host} aria-hidden="true" data-cursor="explore">{still && <img className="b-hero-stone-still" src="/motion/stone-still.png" alt="" width="660" height="880" />}</div>;
}

export function Hero({ id, puck, kicker, headline, highlight, headlineSuffix = '', body, prompt, cueStyle = 'text', align = 'left', size = 'full', ctaLabel, ctaHref = '#', ctaLabel2, ctaHref2 = '#', meta = [], lines = [], pillEyebrow = false, gridBackdrop = false, scrollCue = false, variant = 'default', cueLabel = 'Scroll down to start the climb', stone = 'none', motion, motionRuntime = 'still' }) {
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
  // With a mark beside it the copy becomes one column of a grid instead of a single centred block.
  // The wrapper is chosen with plain JSX below rather than a component defined in here: a component
  // declared during render gets a fresh identity every render, and this hero re-renders on scroll
  // (cueHidden), which would tear down and rebuild HeroStone's WebGL context on the first scroll.
  const stoneOn = motion ? motion.effect === 'hero.stone' && motion.intensity !== 'off' : stone === 'right';
  // The hero body, lifted into a variable so the wrapper can change without duplicating it.
  const inner = (
    <>
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
    </>
  );
  return (
    <section ref={ref} className={`b-hero size-${size} align-${align}${variant === 'statement' ? ' v-statement' : ''}${gridBackdrop ? ' has-grid' : ''}${stoneOn ? ' has-stone' : ''}`}>
      {stoneOn
        ? <div className="wrap b-hero-grid"><div className="b-hero-inner">{inner}</div><HeroStone enabled={!motion || motionRuntime === 'animate'} still={!!motion} /></div>
        : <div className="wrap b-hero-inner">{inner}</div>}
      {scrollCue ? (
        <span className={'b-hero-scrollcue' + (cueHidden ? ' is-gone' : '')} aria-hidden="true">
          <span className="b-hero-scrollcue-label">{cueLabel}</span>
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
/* variant: opening statement (Ben's chapter 2). Keep this block LAST in the string: it ties on
   specificity with .b-hero.size-full and wins only on source order. */
.b-hero.v-statement{--stmt-w:min(1240px,100%);
  /* Was a forced 100vh with the statement wrapping to eight lines and 134px of dead space below the
     button. Three changes shorten it WITHOUT shrinking the type, which still has to dominate: a wider
     measure so each approved sentence wraps less, a tighter gap between the three statements, and a
     height that lets the next section peek. The peek also serves the brief, which wants the visitor
     "encouraged to continue reading rather than searching for navigation". */
  /* 86vh was sized to hold the whole three-sentence statement. With sentences 2 and 3 moved to the
     Statement band below, that height left ~270px of void under the button on a 900px screen. 66vh
     still reads as a hero (the band below stays under the fold) without the hollow middle. */
  min-height:66vh;min-height:66svh;align-items:safe center;
  /* The bottom pad is not whitespace, it is the scroll cue's reserved lane. The cue is pinned
     clamp(20px,4vh,38px) from the foot of the section and stands about 36px tall, so any floor
     under ~66px lets it sit on top of the button. At 1280x720 the old 48px floor did exactly that. */
  padding-block:clamp(64px,8vh,96px) clamp(72px,8vh,96px);
  position:relative;isolation:isolate}
/* Atmosphere. The opening screen was flat void, which is what made the page read as a wall of type
   before a word was judged. This is depth, not decoration: two very low-alpha emerald washes, static,
   behind the copy at z-index -1. It is deliberately NOT the 3D stone and NOT animated, because Ben's
   brief says nothing may visually COMPETE with the Opening Statement. Atmosphere does not compete;
   it gives the type somewhere to sit. Contrast is unaffected, measured after: body copy stays 11.04:1.
   No animation, so there is nothing for prefers-reduced-motion to suppress. */
.b-hero.v-statement::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;
  background:
    radial-gradient(58% 46% at 22% 26%, rgba(27,80,57,.34), transparent 68%),
    radial-gradient(46% 38% at 82% 74%, rgba(78,205,196,.10), transparent 70%);}
.b-hero.v-statement .b-hero-inner{max-width:var(--stmt-w)}
.b-hero.v-statement h1{margin-top:0;text-shadow:none;
  /* Was clamp(27px,3.3vw,46px), which made the Opening Statement SMALLER than every section
     heading below it at every viewport: an inverted ramp, and the opposite of "nothing should
     visually compete with it". Paired with the section h2 drop below; the two rates are chosen
     so the ramps never cross (375px 31/27, 800px 32/28, 1440px 48/42). The h1 cap is held at 48
     rather than pushed higher because at 1280x720 a 52px statement pushed the primary CTA 14px
     BELOW the fold, which breaks his acceptance criterion. The dominance win comes from dropping
     the section h2, not from inflating the h1. */
  font-size:clamp(31px,4vw,48px);line-height:1.16;letter-spacing:-.018em;text-wrap:balance}
.b-hero.v-statement h1.b-hero-stack .b-hero-line + .b-hero-line{margin-top:.28em}
/* PHONES. The desktop floor of 31px was tuned for "dominates the first screen" on a laptop and never
   re-checked at 375px, where the three approved sentences ran to THIRTEEN lines and filled the whole
   screen with nothing but type. Dominance on a phone is not the same measurement: at this width the
   statement is the only thing on screen regardless of size, so the size can come down a long way.
   min-height:auto as well, so the hero is as tall as its content instead of a forced 86vh. */
@media(max-width:640px){
  /* The scroll cue is absolutely pinned to the foot of the section. While the hero was a forced 86vh
     there was always slack below the button to hold it; the moment it became content-height the cue
     landed ON the lime button. So the bottom padding now reserves the cue's own height, and the
     "CONTINUE" label is dropped on phones (10px letterspaced grey earns nothing next to the chevron). */
  .b-hero.v-statement{min-height:auto;padding-block:clamp(92px,13vh,112px) 68px}
  .b-hero.v-statement .b-hero-scrollcue-label{display:none}
  .b-hero.v-statement h1{font-size:clamp(22px,5.4vw,27px);line-height:1.24;letter-spacing:-.01em;text-wrap:normal}
  .b-hero.v-statement h1.b-hero-stack .b-hero-line + .b-hero-line{margin-top:.4em}
  .b-hero.v-statement .lede{margin-top:18px}
}
.b-hero.v-statement .lede{margin-top:clamp(22px,3vh,34px);text-shadow:none;
  font-size:clamp(16px,1.3vw,19px);line-height:1.75;max-width:min(620px,100%)}
.b-hero.v-statement .b-cta-row{margin-top:clamp(26px,3.5vh,40px)}
.b-hero.v-statement.align-left .b-hero-scrollcue{
  left:max(var(--gs-gutter),calc((100% - var(--stmt-w))/2 + var(--gs-gutter)));
  transform:none;align-items:flex-start}
.b-hero.v-statement.align-left .b-hero-scrollcue.is-gone{transform:translateY(8px)}

/* TWO-COLUMN HERO (opt-in via the Mark field).
   The single-column statement left the whole right half of a desktop screen empty, which is what made
   the opening read as thin rather than calm: a short approved sentence cannot fill 1240px on its own.
   The mark occupies that half, so the composition is balanced by an object instead of by more words.
   1.15fr/1fr rather than an even split keeps the statement the larger mass, which is the point: Ben's
   brief says nothing may visually compete with it, so the mark stays subordinate by size, by position
   (it follows the copy in reading order) and by being aria-hidden. */
.b-hero.v-statement.has-stone .b-hero-grid{max-width:var(--stmt-w);margin-inline:auto;
  display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);
  gap:clamp(28px,4vw,72px);align-items:center}
.b-hero.v-statement.has-stone .b-hero-inner{max-width:none}
/* Room for the mark to be an object rather than a thumbnail. Capped in vh as well as px so it cannot
   outgrow a short laptop screen and push the primary CTA under the fold. */
.b-hero-stone{position:relative;width:100%;aspect-ratio:1/1.06;max-height:min(58vh,560px);
  justify-self:center;pointer-events:none}
.b-hero-stone-still{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.b-hero.v-statement.has-stone{min-height:78vh;min-height:78svh}
/* Below the breakpoint there is no second column: the copy returns to a single block and the mark is
   not rendered at all (HeroStone refuses to mount under 1024px, so no WebGL context is created). */
@media(max-width:1023px){
  .b-hero.v-statement.has-stone .b-hero-grid{display:block;max-width:var(--stmt-w)}
  .b-hero.v-statement.has-stone{min-height:66vh;min-height:66svh}
  .b-hero-stone{display:none}
}
@media(max-width:640px){
  .b-hero.v-statement.has-stone{min-height:auto}
}

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
    variant: { type: 'radio', label: 'Hero style', options: [
      { label: 'Default hero', value: 'default' }, { label: 'Opening statement', value: 'statement' }] },
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
    stone: { type: 'radio', label: 'Mark (3D stone beside the copy)', options: [
      { label: 'None', value: 'none' }, { label: 'Right', value: 'right' },
    ]},
    size: { type: 'radio', label: 'Height', options: [
      { label: 'Full screen', value: 'full' }, { label: 'Standard', value: 'standard' }, { label: 'Compact', value: 'compact' },
    ]},
    ctaLabel: { type: 'text', label: 'Primary button label (optional)' },
    ctaHref: { type: 'custom', label: 'Primary button link', render: (props) => <LinkField {...props} /> },
    ctaLabel2: { type: 'text', label: 'Ghost button label (optional)' },
    ctaHref2: { type: 'custom', label: 'Ghost button link', render: (props) => <LinkField {...props} /> },
    cueLabel: { type: 'text', label: 'Scroll indicator label' },
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
    kicker: BRAND_TAGLINE,
    headline: 'We don’t decorate businesses with technology.',
    highlight: 'We build what holds everything up.',
    body: 'A transformation partner, not a software house. Edit any line on the canvas, pick the 3D background, add blocks.',
    prompt: 'Move your cursor. The stone responds',
    cueStyle: 'text',
    headlineSuffix: '',
    align: 'left', size: 'full', ctaLabel: PRIMARY_CTA_LABEL, ctaHref: PRIMARY_CTA_HREF, ctaLabel2: '', ctaHref2: '#', meta: [], lines: [], pillEyebrow: false, gridBackdrop: false, scrollCue: false, stone: 'none', variant: 'default', cueLabel: 'Scroll down to start the climb',
  },
  render: (props) => <Hero {...props} />,
};

export default Hero;
