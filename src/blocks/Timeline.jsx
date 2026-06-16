import { useEffect, useRef } from 'react';
import { useReveal } from './reveal.js';

// The about page's signature: a scroll-tracking timeline spine. A lime fill grows down the rail
// as you scroll, and each milestone "lights" as it arrives. Honours reduced-motion (all lit,
// fill full) and shows everything flat inside the editor.
export function Timeline({ index, eyebrow, headline, highlight, body, items = [] }) {
  const headRef = useReveal();
  const tlRef = useRef(null);
  useEffect(() => {
    const tl = tlRef.current; if (!tl) return;
    const track = tl.querySelector('.tl-track');
    const els = [...tl.querySelectorAll('.tl-item')];
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (track) track.style.setProperty('--tl-progress', '1'); els.forEach((e) => e.classList.add('lit')); return;
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add('lit'); }),
      { threshold: 0.35, rootMargin: '0px 0px -18% 0px' });
    els.forEach((e) => io.observe(e));

    // rAF-batch the scroll work: at most one layout read + style write per frame (never per scroll
    // event), and only while the timeline is on/near screen — so the listener is near-free elsewhere.
    let visible = false, rafId = 0;
    const update = () => {
      rafId = 0;
      if (!track || !visible) return;
      const r = track.getBoundingClientRect();
      const p = Math.min(Math.max((innerHeight * 0.55 - r.top) / Math.max(r.height, 1), 0), 1);
      track.style.setProperty('--tl-progress', String(p));
    };
    const onScroll = () => { if (!rafId) rafId = requestAnimationFrame(update); };
    const visIO = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) onScroll(); },
      { rootMargin: '140px 0px 140px 0px' });
    visIO.observe(tl);
    addEventListener('scroll', onScroll, { passive: true });
    return () => { io.disconnect(); visIO.disconnect(); removeEventListener('scroll', onScroll); if (rafId) cancelAnimationFrame(rafId); };
  }, [items.length]);

  return (
    <section ref={headRef} className="b-timeline">
      <div className="wrap">
        {(index || eyebrow) ? (
          <div className="b-chapter-eyebrow" data-reveal>
            {index ? <span className="b-chapter-num">{index}</span> : null}
            {eyebrow ? <span className="b-chapter-name">{eyebrow}</span> : null}
          </div>
        ) : null}
        <h2 className="b-timeline-head" data-reveal>{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
        {body ? <p className="b-timeline-body" data-reveal>{body}</p> : null}
        <div className="timeline" ref={tlRef}>
          <div className="tl-track" aria-hidden="true"><div className="tl-fill" /></div>
          {items.map((it, i) => (
            <article className="tl-item" key={i}>
              <span className="tl-dot" />
              <div className="tl-year">{it.year}</div>
              <h3 className="tl-head">{it.head}</h3>
              <p className="tl-body">{it.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-timeline{padding:clamp(64px,11vw,140px) 0;position:relative}
.b-timeline-head{font-size:clamp(1.9rem,4.6vw,3.2rem);font-weight:900;line-height:1.03;letter-spacing:-.03em;max-width:18ch}
.b-timeline-body{margin-top:20px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.18rem);max-width:62ch;line-height:1.7}
.timeline{position:relative;margin-top:clamp(40px,7vh,80px)}
.tl-track{position:absolute;top:0;bottom:0;left:22px;width:2px;--tl-progress:0}
.tl-track::before{content:"";position:absolute;inset:0;width:2px;background:var(--gs-border-soft)}
.tl-fill{position:absolute;top:0;left:0;width:2px;height:calc(var(--tl-progress) * 100%);background:linear-gradient(180deg,var(--gs-accent),rgba(200,255,0,.2))}
.tl-fill::after{content:"";position:absolute;left:50%;bottom:-3px;width:9px;height:9px;transform:translateX(-50%);border-radius:50%;background:var(--gs-accent);box-shadow:0 0 14px var(--gs-accent-glow)}
.tl-item{position:relative;padding:0 0 clamp(40px,6vh,72px) clamp(58px,8vw,88px);opacity:.32;transform:translateY(14px);transition:opacity .6s var(--gs-ease),transform .6s var(--gs-ease)}
.tl-item:last-child{padding-bottom:0}
.tl-item.lit{opacity:1;transform:none}
.tl-dot{position:absolute;left:14px;top:4px;width:18px;height:18px;border-radius:50%;background:var(--gs-bg-deep,#0c0e0c);border:2px solid var(--gs-border-soft);transition:border-color .45s var(--gs-ease),box-shadow .45s var(--gs-ease)}
.tl-dot::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--gs-accent);transform:scale(0);transition:transform .45s var(--gs-ease)}
.tl-item.lit .tl-dot{border-color:var(--gs-accent);box-shadow:0 0 0 5px var(--gs-accent-dim),0 0 22px var(--gs-accent-glow)}
.tl-item.lit .tl-dot::after{transform:scale(1)}
.tl-year{font-weight:900;font-size:clamp(1.1rem,1.6vw,1.35rem);color:var(--gs-accent);letter-spacing:.02em}
.tl-head{font-size:clamp(1.25rem,2.2vw,1.7rem);font-weight:800;line-height:1.1;margin:.35rem 0 .55rem;letter-spacing:-.01em}
.tl-body{color:var(--gs-muted);max-width:58ch;line-height:1.65}
.is-edit .tl-item{opacity:1 !important;transform:none !important}
.is-edit .tl-fill{height:100% !important}
@media(prefers-reduced-motion:reduce){.tl-item{opacity:1;transform:none}}
`;

const M = (year, head, text) => ({ year, head, text });

export const puck = {
  label: 'Timeline',
  fields: {
    index: { type: 'text', label: 'Number', contentEditable: true },
    eyebrow: { type: 'text', label: 'Eyebrow', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    items: {
      type: 'array', label: 'Milestones',
      arrayFields: { year: { type: 'text', label: 'Year' }, head: { type: 'text', label: 'Heading' }, text: { type: 'textarea', label: 'Description' } },
      defaultItemProps: { year: '2025', head: 'A milestone', text: 'What happened.' },
      getItemSummary: (item) => (item.year ? item.year + ' · ' : '') + (item.head || 'Milestone'),
    },
  },
  defaultProps: {
    index: '02', eyebrow: 'The Long Road',
    headline: 'How the method', highlight: 'took shape.',
    body: 'Twenty years, told as a handful of milestones.',
    items: [
      M('2005', 'One business, one problem worth solving.', 'A single client, a process bleeding time, and a refusal to accept that this is just how it works here.'),
      M('2011', 'Advice was not enough.', 'We stopped advising and started building, sitting inside the business until the change actually shipped.'),
      M('2016', 'The eight pillars took shape.', 'Years of deep dives became a method we could assess any business against.'),
      M('2021', 'From projects to partnerships.', 'Clients stopped hiring us for one thing and kept us as their foundation.'),
      M('Today', 'Buying back the hours, at scale.', 'Same belief, broader reach. We find the time a business is quietly losing, and win it back.'),
    ],
  },
  render: (props) => <Timeline {...props} />,
};

export default Timeline;
