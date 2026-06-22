import { useReveal } from './reveal.js';

// A general three-up card grid for when a section just needs parallel points. Lighter than
// Pillars (no numbering, no sweep) — use it for tiers, services, anything that comes in threes.
export function FeatureGrid({ kicker, heading, body, items = [], variant = 'cards' }) {
  const ref = useReveal([items.length]);
  const principles = variant === 'principles';
  return (
    <section ref={ref} className={'b-features' + (principles ? ' b-features-center' : '')}>
      <div className="wrap">
        {kicker ? <span className="kicker" data-reveal>{kicker}</span> : null}
        {heading ? <h2 className="b-features-head" data-reveal>{heading}</h2> : null}
        {body ? <p className="b-features-intro" data-reveal>{body}</p> : null}
        <div className="b-grid">
          {items.map((it, i) => principles ? (
            <div className="b-feat-principle" data-reveal style={{ transitionDelay: `${i * 60}ms` }} key={i}>
              {it.n ? <div className="b-feat-n">{it.n}</div> : null}
              <h3>{it.title}</h3>
              <p>{it.text}</p>
            </div>
          ) : (
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
.b-features-head{font-size:clamp(2rem,4.5vw,3.6rem);font-weight:900;letter-spacing:-.025em;margin-top:12px;line-height:1.05}
.b-features-intro{margin:18px auto 0;max-width:64ch;color:var(--gs-muted);font-size:clamp(1rem,1.4vw,1.16rem);line-height:1.75}
.b-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(16px,2vw,24px);margin-top:clamp(26px,4vw,42px)}
@media(max-width:860px){.b-grid{grid-template-columns:1fr}}
.b-card{background:var(--gs-card);border:1px solid var(--gs-border-soft);border-radius:18px;padding:clamp(22px,2.6vw,34px);backdrop-filter:blur(8px);transition:transform var(--gs-dur) var(--gs-ease),border-color var(--gs-dur),background var(--gs-dur)}
.b-card:hover{transform:translateY(-4px);border-color:var(--gs-border);background:var(--gs-card-hover)}
.b-card h3{font-size:1.18rem;font-weight:800}
.b-card p{margin-top:8px;color:var(--gs-muted);font-size:.95rem;line-height:1.55}
/* principles variant — the live method framing: centered, no card chrome, leading 01/02/03 number */
.b-features-center{text-align:center}
.b-features-center .b-features-head,.b-features-center .b-features-intro{margin-inline:auto}
.b-feat-n{font-size:.72rem;font-weight:800;letter-spacing:.18em;color:var(--gs-accent)}
.b-feat-principle h3{font-size:1.15rem;font-weight:800;margin:.5em 0 .3em}
.b-feat-principle p{color:var(--gs-text-muted);font-size:.92rem;line-height:1.55}
`;

export const puck = {
  label: 'Feature grid',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    body: { type: 'textarea', label: 'Intro (optional)', contentEditable: true },
    variant: { type: 'radio', label: 'Style', options: [
      { label: 'Cards', value: 'cards' }, { label: 'Principles (centered)', value: 'principles' },
    ]},
    items: {
      type: 'array', label: 'Features',
      arrayFields: { n: { type: 'text', label: 'Number (principles)' }, title: { type: 'text', label: 'Title' }, text: { type: 'textarea', label: 'Description' } },
      defaultItemProps: { n: '', title: 'Pillar', text: 'A short description.' },
      getItemSummary: (item) => item.title || 'Feature',
    },
  },
  defaultProps: {
    kicker: 'The method', heading: 'Eight pillars. One honest read.', variant: 'cards',
    items: [
      { n: '', title: 'People', text: 'Know who moves what, and set them up to move it well.' },
      { n: '', title: 'Communication', text: 'Make the value land, inside the business and out.' },
      { n: '', title: 'Data', text: 'Map the lifecycle so the right decision is the easy one.' },
    ],
  },
  render: (props) => <FeatureGrid {...props} />,
};

export default FeatureGrid;
