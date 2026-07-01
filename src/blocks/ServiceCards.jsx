import { useEffect, useRef } from 'react';
import { useReveal } from './reveal.js';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// ServiceCards: services.html's "Three moves. One foundation." — three framed cards, each badged
// 01/02/03 with an accent sub-eyebrow, glowing-dot bullets pinned to the foot, corner ticks, and the
// signature lime "scan line" that sweeps top→bottom once when the card reveals (staggered L→R).
// Faithful port of .svc-grid / .svc-card (.scan + .tick + svc-scan keyframes, --scan-h per card).
export function ServiceCards({ id, puck, kicker, heading, highlight, cards = [] }) {
  const ref = useReveal([cards.length]);
  const editing = puck && puck.isEditing;
  const cardRefs = useRef([]);

  // size each card's scan sweep to its own height so the line travels edge-to-edge whatever the
  // content length (faithful to the live --scan-h script); re-measure on resize.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const set = () => cardRefs.current.forEach((c) => { if (c) c.style.setProperty('--scan-h', (c.offsetHeight + 6) + 'px'); });
    set();
    addEventListener('resize', set, { passive: true });
    return () => removeEventListener('resize', set);
  }, [cards.length]);

  return (
    <section ref={ref} className="b-svc section--tight">
      <div className="wrap">
        {(kicker || heading || highlight || editing) ? (
          <div className="b-svc-head" data-reveal>
            <EditableText editing={editing} id={id} field="kicker" value={kicker} as="span" className="kicker" singleLine placeholder="Kicker…" />
            {(heading || highlight || editing) ? (
              <h2 className="b-svc-h2"><EditableText editing={editing} id={id} field="heading" value={heading} as="span" singleLine placeholder="Heading…" /> {highlight ? <span className="accent">{highlight}</span> : null}</h2>
            ) : null}
          </div>
        ) : null}

        <div className="grid cols-3 b-svc-grid">
          {cards.map((c, i) => (
            <article
              key={i}
              ref={(el) => { cardRefs.current[i] = el; }}
              className="card b-svc-card" data-reveal
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <span className="b-svc-tick tl" aria-hidden="true" /><span className="b-svc-tick br" aria-hidden="true" />
              <span className="b-svc-scan" aria-hidden="true" />
              {c.badge ? <div className="b-svc-badge">{c.badge}</div> : null}
              {c.sub ? <div className="b-svc-sub">{c.sub}</div> : null}
              <EditableText editing={editing} id={id} arrayField="cards" index={i} field="title" value={c.title} as="h3" className="b-svc-title" singleLine placeholder="Title…" />
              <EditableText editing={editing} id={id} arrayField="cards" index={i} field="body" value={c.body} as="p" placeholder="Body…" />
              {Array.isArray(c.bullets) && c.bullets.length ? (
                <ul className="b-svc-list">
                  {c.bullets.map((b, j) => <li key={j}><EditableText editing={editing} id={id} path={[{ key: 'cards', index: i }, { key: 'bullets', index: j }]} field="text" value={b.text} as="span" placeholder="Bullet…" /></li>)}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-svc-head{text-align:center;margin-bottom:clamp(36px,5vw,64px)}
.b-svc-h2{margin-top:.4em;font-size:clamp(2rem,4.5vw,3.6rem);font-weight:900;letter-spacing:-.025em;line-height:1.05}
.b-svc-grid{align-items:stretch}
.b-svc-card{position:relative;overflow:hidden;height:100%;display:flex;flex-direction:column}
.b-svc-badge{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;border:1px solid var(--gs-border);
  background:var(--gs-accent-soft);font-weight:800;font-size:1rem;color:var(--gs-accent);margin-bottom:18px}
.b-svc-sub{font-size:.78rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--gs-accent);margin-bottom:1em}
.b-svc-title{margin-bottom:.55em;font-size:clamp(1.2rem,1.9vw,1.5rem);font-weight:800}
.b-svc-card p{color:var(--gs-text-muted);margin-bottom:1.2em}
.b-svc-list{list-style:none;margin-top:auto;display:grid;gap:.55em;padding:0}
.b-svc-list li{position:relative;padding-left:1.4em;font-size:.92rem;color:var(--gs-text);overflow-wrap:anywhere;word-break:break-word}
.b-svc-list li::before{content:'';position:absolute;left:0;top:.62em;width:7px;height:7px;border-radius:50%;
  background:var(--gs-accent);box-shadow:0 0 10px var(--gs-accent-glow)}
.b-svc-scan{position:absolute;left:0;right:0;top:0;height:2px;z-index:2;pointer-events:none;opacity:0;transform:translateY(-4px);
  background:linear-gradient(90deg,transparent,var(--gs-accent) 18%,var(--gs-accent) 82%,transparent);
  box-shadow:0 0 16px 2px var(--gs-accent-glow)}
.b-svc-scan::after{content:'';position:absolute;left:0;right:0;top:0;height:90px;transform:translateY(-90px);
  background:linear-gradient(to bottom,var(--gs-accent-soft),transparent)}
.b-svc-card.is-in .b-svc-scan{animation:gsSvcScan 1.25s var(--gs-ease) .15s forwards}
@keyframes gsSvcScan{0%{opacity:0;transform:translateY(-4px)}8%{opacity:1}88%{opacity:1}100%{opacity:0;transform:translateY(var(--scan-h,380px))}}
.b-svc-grid .b-svc-card:nth-child(2).is-in .b-svc-scan{animation-delay:.32s}
.b-svc-grid .b-svc-card:nth-child(3).is-in .b-svc-scan{animation-delay:.49s}
.b-svc-tick{position:absolute;width:12px;height:12px;border-color:var(--gs-accent-mid);border-style:solid;border-width:0;opacity:.55}
.b-svc-tick.tl{top:14px;left:14px;border-top-width:1.5px;border-left-width:1.5px}
.b-svc-tick.br{bottom:14px;right:14px;border-bottom-width:1.5px;border-right-width:1.5px}
@media(prefers-reduced-motion:reduce){.b-svc-scan{display:none}}
`;

const BULLETS = (arr) => arr.map((text) => ({ text }));

export const puck = {
  label: 'Service cards',
  fields: {
    kicker: { type: 'custom', label: 'Kicker', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    cards: {
      type: 'array', label: 'Cards (3)',
      arrayFields: {
        badge: { type: 'text', label: 'Badge (01/02/03)' },
        sub: { type: 'text', label: 'Eyebrow' },
        title: { type: 'custom', label: 'Title', render: (props) => <RichTextField {...props} variant="heading" /> },
        body: { type: 'custom', label: 'Body', render: (props) => <RichTextField {...props} /> },
        bullets: {
          type: 'array', label: 'Bullets',
          arrayFields: { text: { type: 'custom', label: 'Bullet', render: (props) => <RichTextField {...props} /> } },
          defaultItemProps: { text: 'A capability.' },
          getItemSummary: (i) => i.text || 'Bullet',
        },
      },
      defaultItemProps: { badge: '0', sub: 'Eyebrow', title: 'Move', body: 'What this move does.', bullets: [] },
      getItemSummary: (i) => i.title || 'Card',
    },
  },
  defaultProps: {
    kicker: 'The offer',
    heading: 'Three moves. One', highlight: 'foundation.',
    cards: [
      {
        badge: '01', sub: 'Discovery & DXP', title: 'Find the drains',
        body: 'Before we build anything, we find where the week actually goes. Our 8-pillar Digital Excellence assessment maps the silent leaks (the rework, the swivel-chair, the waiting) and scores you on every pillar so the plan is evidence, not opinion.',
        bullets: BULLETS(['8-pillar DXP assessment', 'Where-the-week-goes audit', 'Prioritised, costed roadmap']),
      },
      {
        badge: '02', sub: 'AI · Automation · Integration', title: 'Build the systems',
        body: 'We build the fix into how you already work, not bolted on beside it. AI where it earns its keep, automation for the repetitive, integration so your tools finally talk. Shipped in weeks, owned by your team, measured against the hours it returns.',
        bullets: BULLETS(['AI built into the workflow', 'Automation for the repetitive', 'Integration across your stack']),
      },
      {
        badge: '03', sub: 'Adoption & ongoing', title: 'Embed & scale',
        body: 'A system nobody uses saves nobody time. We train your people, drive real adoption, and stay on as your foundation: tuning, extending and scaling what works. Embedded, not advisory. We don’t disappear when the invoice clears.',
        bullets: BULLETS(['Training & real adoption', 'Ongoing tuning & support', 'Scale what works, retire what doesn’t']),
      },
    ],
  },
  render: (props) => <ServiceCards {...props} />,
};

export default ServiceCards;
