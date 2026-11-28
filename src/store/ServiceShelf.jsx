// GRE-6446 (John, 28 Nov: "more like the previous build ... where we had prototypes"): one Transformation
// Services category's services, laid out like the service catalogue on How we help. The opened category
// spans the whole row and leads with the category's interactive prototype (src/store/service-demos, the
// July build), then the services as catalogue cards: format, name, one-liner, View details, Try it (shows its
// prototype above) and Add to basket. The block (src/blocks/TransformationServices.jsx) and the HTML page island
// (app/islands.jsx) both render it. No prices.
import { useRef, useState } from 'react';
import { InquiryToggle } from './BasketServiceControls.jsx';
import { serviceSlug, shortFormat } from './services.mjs';
import ServiceDemo, { hasServiceDemo } from './service-demos/index.jsx';

const Arrow = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

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
        {services.map((item) => {
          const slug = item.slug || serviceSlug(item);
          const showing = demo && demo.slug === slug;
          return <article key={slug} className={'svc-card' + (showing ? ' is-showing' : '')}>
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
  background:radial-gradient(120% 80% at 0% 0%,rgba(200,255,0,.06),transparent 60%),rgba(255,255,255,.015)}
.svc-shelf-stage:focus{outline:none}
.svc-shelf-showing{margin:0 0 6px!important;font-size:.74rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gs-accent,#c8ff00)!important}
.svc-shelf-showing strong{color:var(--gs-text,#f5f5f5);letter-spacing:.04em}
.svc-shelf-stage .sdemo-section{margin-top:0}
.svc-shelf-stage .sdemo-head h2{font-size:clamp(1.3rem,2vw,1.7rem);margin:0}
.svc-shelf-count{margin:clamp(26px,3.4vw,40px) 0 16px!important;font-size:.76rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gs-faint,#8d948a)!important}
.svc-shelf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:clamp(12px,1.4vw,18px);align-items:stretch}
.svc-card{position:relative;display:flex;flex-direction:column;padding:clamp(18px,2vw,24px);border:1px solid var(--gs-border-soft,rgba(255,255,255,.1));
  border-radius:14px;background:rgba(255,255,255,.02);transition:transform .18s ease,border-color .18s ease,background .18s ease}
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
@media(prefers-reduced-motion:reduce){.svc-card,.svc-shelf-open svg{transition:none}.svc-card:hover{transform:none}}
`;
