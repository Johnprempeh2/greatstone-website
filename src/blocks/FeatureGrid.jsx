import { useReveal } from './reveal.js';

// A general three-up card grid for when a section just needs parallel points. Lighter than
// Pillars (no numbering, no sweep) — use it for tiers, services, anything that comes in threes.
export function FeatureGrid({ kicker, heading, body, items = [] }) {
  const ref = useReveal([items.length]);
  return (
    <section ref={ref} className="b-features">
      <div className="wrap">
        {kicker ? <span className="kicker" data-reveal>{kicker}</span> : null}
        {heading ? <h2 className="b-features-head" data-reveal>{heading}</h2> : null}
        {body ? <p className="b-features-intro" data-reveal>{body}</p> : null}
        <div className="b-grid">
          {items.map((it, i) => (
            <article className="b-card" data-reveal style={{ transitionDelay: `${i * 60}ms` }} key={i}>
              <h3>{it.title}</h3>
              <p>{it.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-features{padding:clamp(48px,8vh,110px) 0;position:relative}
.b-features-head{font-size:clamp(1.7rem,3.4vw,2.6rem);font-weight:900;letter-spacing:-.025em;margin-top:12px}
.b-features-intro{margin:18px auto 0;max-width:64ch;color:var(--gs-muted);font-size:clamp(1rem,1.4vw,1.16rem);line-height:1.75}
.b-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(16px,2vw,24px);margin-top:clamp(26px,4vw,42px)}
@media(max-width:860px){.b-grid{grid-template-columns:1fr}}
.b-card{background:var(--gs-card);border:1px solid var(--gs-border-soft);border-radius:16px;padding:24px 26px;backdrop-filter:blur(6px);
  transition:transform .3s var(--gs-ease),border-color .3s var(--gs-ease)}
.b-card:hover{transform:translateY(-4px);border-color:var(--gs-border)}
.b-card h3{font-size:1.18rem;font-weight:800}
.b-card p{margin-top:8px;color:var(--gs-muted);font-size:.95rem;line-height:1.55}
`;

export const puck = {
  label: 'Feature grid',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    body: { type: 'textarea', label: 'Intro (optional)', contentEditable: true },
    items: {
      type: 'array', label: 'Features',
      arrayFields: { title: { type: 'text', label: 'Title' }, text: { type: 'textarea', label: 'Description' } },
      defaultItemProps: { title: 'Pillar', text: 'A short description.' },
      getItemSummary: (item) => item.title || 'Feature',
    },
  },
  defaultProps: {
    kicker: 'The method', heading: 'Eight pillars. One honest read.',
    items: [
      { title: 'People', text: 'Know who moves what, and set them up to move it well.' },
      { title: 'Communication', text: 'Make the value land, inside the business and out.' },
      { title: 'Data', text: 'Map the lifecycle so the right decision is the easy one.' },
    ],
  },
  render: (props) => <FeatureGrid {...props} />,
};

export default FeatureGrid;
