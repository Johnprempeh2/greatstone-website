// GRE-6446 (John, 28 Nov: "more like the previous build ... where we had prototypes"): one Transformation
// Services category's services, laid out like the service catalogue on How we help. The opened category
// spans the whole row and leads with the category's interactive prototype (src/store/service-demos, the
// July build), then the services as catalogue cards: format, name, one-liner, View details, Try it (shows its
// prototype above) and Add to basket. The block (src/blocks/TransformationServices.jsx) and the HTML page island
// (app/islands.jsx) both render it. No prices.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TideField } from '../blocks/TideField.jsx';
import { InquiryToggle } from './BasketServiceControls.jsx';
import { serviceSlug, shortFormat } from './services.mjs';
import ServiceDemo, { hasServiceDemo } from './service-demos/index.jsx';

const Arrow = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

// John, 28 Nov ("add the liquid glass effect that we have in the home screen to the background, make it a bit
// more dynamic. Add some images"): the home page's calm tide runs behind the whole page, the category cards
// are liquid glass over it, and each category opens with a photo. The photos are generated scenes in the
// home hero's style (no clients, no real screens). The tide answers the pointer; with reduced motion it
// draws one still frame and nothing on the page moves.
export const categoryImages = {
  websites: '/assets/transformation/websites.webp',
  commerce: '/assets/transformation/commerce.webp',
  'ai-assistants': '/assets/transformation/ai-assistants.webp',
  automation: '/assets/transformation/automation.webp',
  comms: '/assets/transformation/comms.webp',
  knowledge: '/assets/transformation/knowledge.webp',
  reporting: '/assets/transformation/reporting.webp',
  brand: '/assets/transformation/brand.webp',
};

export function CategoryMedia({ id }) {
  const src = categoryImages[id];
  if (!src) return null;
  return <div className="svc-cat-media"><img src={src} alt="" width="1200" height="800" loading="lazy" decoding="async" /></div>;
}

// One fixed tide layer on the body, behind the page. Mount it once per page.
export function CatalogueBackdrop() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    const root = document.documentElement;
    root.classList.add('svc-glass-on');
    // A soft light follows the pointer across the glass card under it.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(pointer: coarse)').matches;
    let frame = 0;
    const onMove = (event) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const card = event.target instanceof Element ? event.target.closest('.b-transform-card') : null;
        if (!card) return;
        const box = card.getBoundingClientRect();
        card.style.setProperty('--mx', Math.round(event.clientX - box.left) + 'px');
        card.style.setProperty('--my', Math.round(event.clientY - box.top) + 'px');
      });
    };
    if (!still) document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      root.classList.remove('svc-glass-on');
      document.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  if (!ready) return null;
  return createPortal(<div className="svc-backdrop" aria-hidden="true"><TideField view="calm" /></div>, document.body);
}

export function ServiceShelf({ id, services = [], open, onToggle, hrefFor = (slug) => '/service/' + slug, editing = false }) {
  const withDemo = services.filter(hasServiceDemo);
  const [demoSlug, setDemoSlug] = useState(null);
  const stage = useRef(null);
  if (!services.length) return null;
  const demo = withDemo.find((item) => item.slug === demoSlug) || withDemo[0];
  const panelId = id + '-services';
  const tryIt = (slug) => {
    setDemoSlug(slug);
    const node = stage.current;
    if (node) {
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      node.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
      node.focus({ preventScroll: true });
    }
  };
  return <div className={'svc-shelf' + (open ? ' is-open' : '')}>
    <button type="button" className="svc-shelf-open" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
      {open ? 'Hide the services' : `See the ${services.length} service${services.length === 1 ? '' : 's'}`}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open ? <div id={panelId} className="svc-shelf-panel">
      {demo ? <div className="svc-shelf-stage" ref={stage} tabIndex={-1}>
        <p className="svc-shelf-showing">Prototype: <strong>{demo.name}</strong></p>
        <ServiceDemo key={demo.slug} svc={demo} headingId={id + '-demo-h'} />
      </div> : null}
      <p className="svc-shelf-count">{services.length} service{services.length === 1 ? '' : 's'} in this step</p>
      <div className="svc-shelf-grid">
        {services.map((item, index) => {
          const slug = item.slug || serviceSlug(item);
          const showing = demo && demo.slug === slug;
          return <article key={slug} className={'svc-card' + (showing ? ' is-showing' : '')} style={{ '--i': Math.min(index, 12) }}>
            <div className="svc-card-top">
              {item.format ? <span className="svc-card-fmt">{shortFormat(item.format)}</span> : null}
              {showing ? <span className="svc-card-live">Showing above</span> : null}
            </div>
            <h3 className="svc-card-name"><a href={hrefFor(slug)}>{item.name}</a></h3>
            {item.oneLiner ? <p className="svc-card-one">{item.oneLiner}</p> : null}
            <div className="svc-card-foot">
              <a className="svc-card-view" href={hrefFor(slug)} tabIndex={-1} aria-hidden="true">View details<Arrow /></a>
              {hasServiceDemo(item) && !showing ? <button type="button" className="svc-card-try" onClick={() => tryIt(slug)}>
                Try it<span className="sr-only">: {item.name}</span></button> : null}
              {editing ? null : <InquiryToggle service={item} />}
            </div>
          </article>;
        })}
      </div>
    </div> : null}
  </div>;
}

export const serviceShelfCss = `
.svc-backdrop{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;background:#0f1310}
.svc-backdrop .td-tide{position:absolute;inset:0;background:repeating-radial-gradient(circle at 3% 107%,transparent 0 34px,rgba(200,255,0,.05) 34px 35px)}
.svc-backdrop .td-tide.live{background:none}
.svc-backdrop::after{content:'';position:absolute;inset:0;background:radial-gradient(80% 60% at 90% 0%,rgba(200,255,0,.06),transparent 60%),linear-gradient(180deg,rgba(15,19,16,.2),rgba(15,19,16,.62))}
html.svc-glass-on{background:#0f1310}
html.svc-glass-on body{background:transparent}
.b-transform .b-transform-grid{gap:clamp(14px,1.6vw,22px);background:none;border:0}
.b-transform .b-transform-card{position:relative;isolation:isolate;display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.11);border-radius:20px;
  background:linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.02) 45%,rgba(255,255,255,.045)),rgba(16,22,18,.4);
  backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.14),inset 0 -1px 0 rgba(255,255,255,.03),0 18px 40px rgba(0,0,0,.35);
  transition:transform .4s cubic-bezier(.2,.7,.2,1),border-color .25s ease,box-shadow .4s ease}
.b-transform .b-transform-card::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:0;transition:opacity .3s ease;
  background:radial-gradient(520px circle at var(--mx,50%) var(--my,0),rgba(200,255,0,.09),transparent 45%)}
.b-transform .b-transform-card:hover::before{opacity:1}
.b-transform .b-transform-card:hover{transform:translateY(-4px);border-color:rgba(200,255,0,.32);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 26px 60px rgba(0,0,0,.45)}
.b-transform .b-transform-card:has(.svc-shelf.is-open){transform:none}
.b-transform .b-transform-card>a{align-self:flex-start}
.svc-cat-media{order:-1;position:relative;margin:calc(-1 * clamp(28px,3.6vw,50px)) calc(-1 * clamp(28px,3.6vw,50px)) clamp(22px,2.6vw,32px);aspect-ratio:16/7;overflow:hidden}
.svc-cat-media img{display:block;width:100%;height:100%;object-fit:cover;transform:scale(1.02);transition:transform 1.4s cubic-bezier(.2,.7,.2,1)}
.svc-cat-media::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,19,16,0) 40%,rgba(15,19,16,.72)),linear-gradient(90deg,rgba(200,255,0,.06),transparent 50%)}
.b-transform-card:hover .svc-cat-media img{transform:scale(1.07)}
.b-transform-card:has(.svc-shelf.is-open) .svc-cat-media{aspect-ratio:21/5}
.b-transform .inq-bar,.gs-svc-bar .inq-bar{background:rgba(16,22,18,.62)!important;backdrop-filter:blur(18px) saturate(160%);-webkit-backdrop-filter:blur(18px) saturate(160%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 18px 40px rgba(0,0,0,.4)}
@media(max-width:700px){.b-transform .b-transform-card{border-radius:16px}.svc-cat-media{aspect-ratio:16/8}.b-transform-card:has(.svc-shelf.is-open) .svc-cat-media{aspect-ratio:16/7}}
.b-transform-card:has(.svc-shelf.is-open){grid-column:1/-1}
.svc-shelf{margin:8px 0 4px}
.svc-shelf-open{display:inline-flex;align-items:center;gap:10px;min-height:44px;margin:8px 24px 0 0;padding:0 20px;border-radius:999px;
  border:1px solid rgba(200,255,0,.45);background:transparent;color:var(--gs-text,#f5f5f5);font:inherit;font-weight:700;cursor:pointer;
  transition:background .18s ease}
.svc-shelf-open svg{width:16px;height:16px;transition:transform .2s ease}
.svc-shelf-open[aria-expanded="true"] svg{transform:rotate(180deg)}
.svc-shelf-open[aria-expanded="true"],.svc-shelf-open:hover{background:rgba(200,255,0,.1)}
.svc-shelf button:focus-visible,.svc-shelf a:focus-visible,.svc-shelf-stage:focus-visible{outline:2px solid var(--gs-accent,#c8ff00);outline-offset:3px}
.svc-shelf-panel{margin:28px 0 12px}
.svc-shelf-stage{scroll-margin-top:110px;padding:clamp(18px,2.4vw,30px);border:1px solid rgba(200,255,0,.18);border-radius:18px;
  background:radial-gradient(120% 80% at 0% 0%,rgba(200,255,0,.07),transparent 60%),rgba(12,16,13,.45);box-shadow:inset 0 1px 0 rgba(255,255,255,.1)}
.svc-shelf-stage:focus{outline:none}
.svc-shelf-showing{margin:0 0 6px!important;font-size:.74rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gs-accent,#c8ff00)!important}
.svc-shelf-showing strong{color:var(--gs-text,#f5f5f5);letter-spacing:.04em}
.svc-shelf-stage .sdemo-section{margin-top:0}
.svc-shelf-stage .sdemo-head h2{font-size:clamp(1.3rem,2vw,1.7rem);margin:0}
.svc-shelf-count{margin:clamp(26px,3.4vw,40px) 0 16px!important;font-size:.76rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gs-faint,#8d948a)!important}
.svc-shelf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:clamp(12px,1.4vw,18px);align-items:stretch}
.svc-card{position:relative;display:flex;flex-direction:column;padding:clamp(18px,2vw,24px);border:1px solid var(--gs-border-soft,rgba(255,255,255,.1));
  border-radius:14px;background:linear-gradient(135deg,rgba(255,255,255,.07),rgba(255,255,255,.015) 50%,rgba(255,255,255,.035)),rgba(12,16,13,.35);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.1);transition:transform .25s ease,border-color .18s ease,background .18s ease;
  animation:svc-rise .55s cubic-bezier(.2,.7,.2,1) backwards;animation-delay:calc(var(--i,0) * 45ms)}
@keyframes svc-rise{from{opacity:0;transform:translateY(14px)}}
.svc-shelf-stage{animation:svc-rise .5s cubic-bezier(.2,.7,.2,1) backwards}
.svc-card:hover{transform:translateY(-3px);border-color:rgba(200,255,0,.4);background:rgba(200,255,0,.025)}
.svc-card.is-showing{border-color:rgba(200,255,0,.55);background:linear-gradient(180deg,rgba(200,255,0,.07),transparent 65%)}
.svc-card-top{display:flex;align-items:center;gap:8px;min-height:22px;margin-bottom:14px}
.svc-card-fmt{font-size:.66rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gs-accent,#c8ff00);
  background:rgba(200,255,0,.08);border:1px solid rgba(200,255,0,.18);border-radius:6px;padding:.3em .6em}
.svc-card-live{margin-left:auto;font-size:.62rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#0e1611;background:var(--gs-accent,#c8ff00);border-radius:6px;padding:.28em .6em}
.svc-card-name{font-size:1.08rem!important;font-weight:800;line-height:1.25!important;letter-spacing:-.01em;margin:0 0 .45em!important}
.svc-card-name a{color:var(--gs-text,#f5f5f5)!important;text-decoration:none!important;border:0!important;padding:0!important;margin:0!important;display:inline!important}
.svc-card-name a::after{content:'';position:absolute;inset:0;border-radius:inherit}
.svc-card-one{color:var(--gs-muted,#b8bdb5)!important;font-size:.92rem;line-height:1.55!important;margin:0 0 1.2em!important;flex:1}
.svc-card-foot{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;margin-top:auto}
.svc-card a.svc-card-view{display:inline-flex!important;align-items:center;gap:.3em;font-size:.82rem;font-weight:700;color:var(--gs-accent,#c8ff00)!important;
  text-decoration:none!important;border:0!important;padding:0!important;margin:0 0 4px!important;flex-basis:100%}
.svc-card-view svg{width:14px;height:14px}
.svc-card-try{position:relative;z-index:1;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--gs-border-soft,rgba(255,255,255,.16));
  background:transparent;color:var(--gs-text,#f5f5f5);font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}
.svc-card-try:hover{border-color:rgba(200,255,0,.45);color:var(--gs-accent,#c8ff00)}
.svc-card .inq-toggle{position:relative;z-index:1;min-height:40px}
.svc-shelf .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media(max-width:700px){.svc-shelf-grid{grid-template-columns:1fr}.svc-shelf-stage{padding:16px;border-radius:14px;margin:0 -8px}}
@media(prefers-reduced-motion:reduce){.svc-card,.svc-shelf-open svg,.b-transform .b-transform-card,.svc-cat-media img{transition:none}.svc-card,.svc-shelf-stage{animation:none}
  .svc-card:hover,.b-transform .b-transform-card:hover,.b-transform-card:hover .svc-cat-media img{transform:none}}
`;
