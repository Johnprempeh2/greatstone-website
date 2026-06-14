import { useReveal } from './reveal.js';

// The Methodology section: an intro, then the eight pillars as an interactive emerald grid.
// Marketing edits the pillar copy in the panel; the card treatment, hover lift and accent
// sweep are code-owned (brand-locked). The numbering is derived, never hand-typed.
export function Pillars({ index, eyebrow, headline, highlight, body, items = [] }) {
  const ref = useReveal([items.length]);
  return (
    <section ref={ref} className="b-pillars">
      <div className="wrap">
        <div className="b-chapter-eyebrow" data-reveal>
          {index ? <span className="b-chapter-num">{index}</span> : null}
          {eyebrow ? <span className="b-chapter-name">{eyebrow}</span> : null}
        </div>
        <h2 className="b-pillars-head" data-reveal>{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
        {body ? <p className="b-pillars-body" data-reveal>{body}</p> : null}
        <div className="b-pillars-grid">
          {items.map((it, i) => (
            <article
              className="b-pillar" data-reveal key={i}
              style={{ transitionDelay: `${Math.min(i, 7) * 55}ms` }}
              onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`); }}
            >
              <span className="b-pillar-n">{String(i + 1).padStart(2, '0')}</span>
              <h3>{it.title}</h3>
              <p>{it.text}</p>
              <span className="b-pillar-sweep" aria-hidden="true" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-pillars{padding:clamp(72px,12vh,140px) 0;position:relative}
.b-pillars-head{font-size:clamp(1.9rem,4.6vw,3.3rem);font-weight:900;line-height:1.03;letter-spacing:-.03em;max-width:18ch}
.b-pillars-body{margin-top:22px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.2rem);max-width:64ch;line-height:1.7}
.b-pillars-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(12px,1.4vw,18px);margin-top:clamp(34px,5vw,56px)}
@media(max-width:980px){.b-pillars-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.b-pillars-grid{grid-template-columns:1fr}}
.b-pillar{position:relative;overflow:hidden;background:var(--gs-card);border:1px solid var(--gs-border-soft);
  border-radius:16px;padding:22px 22px 26px;backdrop-filter:blur(6px);
  transition:transform .4s var(--gs-ease),border-color .4s var(--gs-ease),background .4s var(--gs-ease)}
.b-pillar::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--gs-accent);
  transform:scaleY(0);transform-origin:bottom;transition:transform .45s var(--gs-ease)}
.b-pillar:hover{transform:translateY(-5px);border-color:var(--gs-border);background:rgba(200,255,0,.04)}
.b-pillar:hover::before{transform:scaleY(1)}
.b-pillar-n{font-size:.72rem;font-weight:900;letter-spacing:.1em;color:var(--gs-faint);font-variant-numeric:tabular-nums}
.b-pillar:hover .b-pillar-n{color:var(--gs-accent)}
.b-pillar h3{margin-top:12px;font-size:1.12rem;font-weight:800;letter-spacing:-.01em}
.b-pillar p{margin-top:9px;color:var(--gs-muted);font-size:.9rem;line-height:1.55}
.b-pillar-sweep{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .5s var(--gs-ease);
  background:radial-gradient(120px 120px at var(--mx,50%) 0%,rgba(200,255,0,.12),transparent 70%)}
.b-pillar:hover .b-pillar-sweep{opacity:1}
`;

const PILLAR = (title, text) => ({ title, text });

export const puck = {
  label: 'Pillars',
  fields: {
    index: { type: 'text', label: 'Number', contentEditable: true },
    eyebrow: { type: 'text', label: 'Eyebrow', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    items: {
      type: 'array', label: 'Pillars',
      arrayFields: { title: { type: 'text', label: 'Title' }, text: { type: 'textarea', label: 'Description' } },
      defaultItemProps: { title: 'Pillar', text: 'A short, honest read.' },
      getItemSummary: (item) => item.title || 'Pillar',
    },
  },
  defaultProps: {
    index: '03', eyebrow: 'The Methodology',
    headline: 'We leave no stone', highlight: 'unturned.',
    body: 'Every engagement begins with the Digital Transformation Playbook: a rigorous diagnostic across eight pillars, producing the Periscope Report, a scored view of where you stand and a phased roadmap to where you’re going.',
    items: [
      PILLAR('People', 'Know who moves what, and set them up to move it well.'),
      PILLAR('Communication', 'Make the value land, inside the business and out.'),
      PILLAR('Innovation', 'A repeatable way to find the next worthwhile change.'),
      PILLAR('Data', 'Map the lifecycle so the right decision is the easy one.'),
      PILLAR('Customer', 'See the whole relationship, not just the last ticket.'),
      PILLAR('Competition', 'Know the field, and where your edge actually is.'),
      PILLAR('Technology', 'A stack that earns its keep and bends when you need it to.'),
      PILLAR('Value', 'Tie every move back to money, time or risk.'),
    ],
  },
  render: (props) => <Pillars {...props} />,
};

export default Pillars;
