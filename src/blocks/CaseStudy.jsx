import { useReveal } from './reveal.js';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// Selected engagements as case cards: the drain we found, the foundation we left, and the
// number that came back. Names withheld, outcomes intact.
export function CaseStudy({ id, puck, index, eyebrow, headline, highlight, body, items = [] }) {
  const ref = useReveal([items.length]);
  const editing = puck && puck.isEditing;
  // Ships EMPTY (see defaultProps) so a section headed "Selected Engagements" can never stand over
  // nothing, and can never stand over engagements nobody had. The editor still sees the block.
  if (!items.length && !editing) return null;
  return (
    <section ref={ref} className="b-cases">
      <div className="wrap">
        {(index || eyebrow || editing) ? (
          index
            ? (
              <div className="b-chapter-eyebrow" data-reveal>
                <span className="b-chapter-num">{index}</span>
                <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="span" className="b-chapter-name" singleLine placeholder="Eyebrow…" />
              </div>
            )
            : <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="span" className="kicker" singleLine placeholder="Eyebrow…" data-reveal />
        ) : null}
        {(headline || highlight || editing) ? <h2 className="b-cases-head" data-reveal><EditableText editing={editing} id={id} field="headline" value={headline} as="span" singleLine placeholder="Headline…" /> {highlight ? <span className="accent">{highlight}</span> : null}</h2> : null}
        <EditableText editing={editing} id={id} field="body" value={body} as="p" className="b-cases-body" placeholder="Body…" data-reveal />
        <div className="b-cases-grid">
          {items.map((c, i) => (
            <article className="card case" data-reveal style={{ transitionDelay: `${i * 70}ms` }} key={i}>
              {c.tag ? <span className="pill case-tag">{c.tag}</span> : null}
              <EditableText editing={editing} id={id} arrayField="items" index={i} field="head" value={c.head} as="h3" singleLine placeholder="Heading…" />
              <div className="case-rows">
                <div className="case-row"><span className="case-key">The drain</span><EditableText editing={editing} id={id} arrayField="items" index={i} field="drain" value={c.drain} as="span" className="case-val" placeholder="The drain…" /></div>
                <div className="case-row"><span className="case-key">We built</span><EditableText editing={editing} id={id} arrayField="items" index={i} field="built" value={c.built} as="span" className="case-val" placeholder="We built…" /></div>
              </div>
              <div className="case-out"><span className="o-num">{c.outNum}</span><span className="o-cap">{c.outCap}</span></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-cases{padding:clamp(64px,11vw,140px) 0;position:relative}
.b-cases-head{font-size:clamp(2rem,4.5vw,3.6rem);font-weight:900;line-height:1.05;letter-spacing:-.025em;max-width:20ch}
.b-cases-body{margin-top:20px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.18rem);max-width:62ch;line-height:1.7}
.b-cases-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(16px,2vw,24px);margin-top:clamp(28px,4vw,44px)}
@media(max-width:920px){.b-cases-grid{grid-template-columns:1fr}}
.card.case{display:flex;flex-direction:column;gap:18px}
.case-tag{align-self:flex-start}
.case h3{font-size:1.25rem;font-weight:800;letter-spacing:-.01em}
.case-rows{display:grid;gap:14px}
.case-row{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start}
.case-key{font-size:.66rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gs-accent);padding-top:3px;white-space:nowrap}
.case-val{font-size:.92rem;color:var(--gs-muted);line-height:1.5}
.case-out{margin-top:6px;padding-top:18px;border-top:1px solid var(--gs-border-soft);display:flex;align-items:baseline;gap:.4em;flex-wrap:wrap}
.case-out .o-num{font-weight:900;font-size:1.9rem;line-height:1;color:var(--gs-accent);letter-spacing:-.03em}
.case-out .o-cap{font-size:.78rem;font-weight:600;color:var(--gs-muted)}
`;

const C = (tag, head, drain, built, outNum, outCap) => ({ tag, head, drain, built, outNum, outCap });

export const puck = {
  label: 'Case studies',
  fields: {
    index: { type: 'text', label: 'Number', contentEditable: true },
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    headline: { type: 'custom', label: 'Headline', render: (props) => <RichTextField {...props} variant="heading" /> },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'custom', label: 'Body', render: (props) => <RichTextField {...props} /> },
    // array field stays LAST (see memory "puck-slot-misdetection-inline-editing")
    items: {
      type: 'array', label: 'Cases',
      arrayFields: {
        tag: { type: 'text', label: 'Tag' },
        head: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
        drain: { type: 'custom', label: 'The drain', render: (props) => <RichTextField {...props} /> },
        built: { type: 'custom', label: 'We built', render: (props) => <RichTextField {...props} /> },
        outNum: { type: 'text', label: 'Outcome figure' },
        outCap: { type: 'text', label: 'Outcome caption' },
      },
      defaultItemProps: { tag: 'Sector', head: 'What changed.', drain: 'The drain we found.', built: 'The foundation we left.', outNum: '9 hrs', outCap: 'saved per person each week' },
      getItemSummary: (item) => item.tag || item.head || 'Case',
    },
  },
  defaultProps: {
    index: '02', eyebrow: 'Selected Engagements',
    headline: 'The drain we found.', highlight: 'The foundation we left.',
    body: 'Names withheld, outcomes intact. Three businesses, three quiet leaks of time, closed.',
    // Deliberately EMPTY, following LogoWall's logos, StatStrip's clients and Quote's testimonial.
    // This shipped THREE complete case studies as its default: a "National real-estate group" saving
    // "9 hrs per agent each week", a "Regional healthcare provider" and a "Multi-site logistics
    // operator", each with a named problem and a claimed outcome. Anyone adding the block published
    // three client stories, with figures, without typing anything. Real engagements go in by hand.
    items: [],
  },
  render: (props) => <CaseStudy {...props} />,
};

export default CaseStudy;
