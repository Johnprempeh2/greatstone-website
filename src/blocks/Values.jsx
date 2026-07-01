import { useReveal } from './reveal.js';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// Values: the about page's "Four values. No slideware." grid — auto-numbered cards with a big faded
// lime index and a left accent bar that wipes up (scaleY) on hover. Faithful port of the live
// .grid.cols-4 of .card.value-card. Lighter than Pillars (no 3D sweep); use for principle/value sets.
export function Values({ id, puck, kicker, heading, items = [] }) {
  const ref = useReveal([items.length]);
  const editing = puck && puck.isEditing;
  return (
    <section ref={ref} className="b-values">
      <div className="wrap">
        <EditableText editing={editing} id={id} field="kicker" value={kicker} as="span" className="kicker" singleLine placeholder="Kicker…" data-reveal />
        <EditableText editing={editing} id={id} field="heading" value={heading} as="h2" className="b-values-head" singleLine placeholder="Heading…" data-reveal />
        <div className="b-values-grid">
          {items.map((it, i) => (
            <div className="b-value-card" data-reveal style={{ transitionDelay: `${i * 60}ms` }} key={i}>
              <div className="b-value-idx" aria-hidden="true">{String(i + 1).padStart(2, '0')}</div>
              <EditableText editing={editing} id={id} arrayField="items" index={i} field="title" value={it.title} as="h3" singleLine placeholder="Title…" />
              <EditableText editing={editing} id={id} arrayField="items" index={i} field="text" value={it.text} as="p" placeholder="Description…" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-values{padding:clamp(48px,7vh,90px) 0;position:relative}
.b-values-head{font-size:clamp(1.7rem,3.4vw,2.6rem);font-weight:900;letter-spacing:-.025em;margin-top:12px}
.b-values-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(18px,2.4vw,32px);margin-top:clamp(26px,4vw,42px)}
@media(max-width:980px){.b-values-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.b-values-grid{grid-template-columns:1fr}}
.b-value-card{position:relative;overflow:hidden;background:var(--gs-card);border:1px solid var(--gs-border-soft);
  border-radius:18px;padding:clamp(22px,2.6vw,34px);backdrop-filter:blur(8px);
  transition:transform var(--gs-dur) var(--gs-ease),border-color var(--gs-dur),background var(--gs-dur)}
.b-value-card:hover{transform:translateY(-4px);border-color:var(--gs-border);background:var(--gs-card-hover)}
.b-value-card::after{content:"";position:absolute;left:0;top:0;height:100%;width:3px;background:var(--gs-accent);
  transform:scaleY(0);transform-origin:top;transition:transform .5s var(--gs-ease)}
.b-value-card:hover::after{transform:scaleY(1)}
.b-value-idx{font-weight:900;font-size:2.2rem;line-height:1;color:var(--gs-accent);opacity:.25;letter-spacing:-.03em}
.b-value-card h3{margin:.6rem 0 .5rem;font-size:clamp(1.15rem,1.8vw,1.45rem);font-weight:800;overflow-wrap:anywhere}
.b-value-card p{color:var(--gs-text-muted);font-size:.98rem;line-height:1.6}
@media(prefers-reduced-motion:reduce){.b-value-card,.b-value-card::after{transition:none}}
`;

export const puck = {
  label: 'Values',
  fields: {
    kicker: { type: 'custom', label: 'Kicker (optional)', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    items: {
      type: 'array', label: 'Values',
      arrayFields: { title: { type: 'custom', label: 'Title', render: (props) => <RichTextField {...props} variant="heading" /> }, text: { type: 'custom', label: 'Description', render: (props) => <RichTextField {...props} /> } },
      defaultItemProps: { title: 'A value', text: 'What it means in practice.' },
      getItemSummary: (item) => item.title || 'Value',
    },
  },
  defaultProps: {
    kicker: '', heading: 'Four values. No slideware.',
    items: [
      { title: 'We leave no stone unturned', text: 'The answer is usually hiding in the part everyone agreed to ignore. We look there first.' },
      { title: 'We become the foundation', text: 'Not a vendor you manage. A layer you build on. We sit inside the work until it holds without us.' },
      { title: 'Plain over clever', text: 'If we cannot explain it to the person who has to live with it, we have not finished the job.' },
      { title: 'Outcomes, not slideware', text: 'We measure ourselves in hours returned and decisions made, never in decks delivered.' },
    ],
  },
  render: (props) => <Values {...props} />,
};

export default Values;
