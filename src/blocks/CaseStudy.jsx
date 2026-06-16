import { useReveal } from './reveal.js';

// Selected engagements as case cards: the drain we found, the foundation we left, and the
// number that came back. Names withheld, outcomes intact.
export function CaseStudy({ index, eyebrow, headline, highlight, body, items = [] }) {
  const ref = useReveal([items.length]);
  return (
    <section ref={ref} className="b-cases">
      <div className="wrap">
        {(index || eyebrow) ? (
          index
            ? (
              <div className="b-chapter-eyebrow" data-reveal>
                <span className="b-chapter-num">{index}</span>
                {eyebrow ? <span className="b-chapter-name">{eyebrow}</span> : null}
              </div>
            )
            : (eyebrow ? <span className="kicker" data-reveal>{eyebrow}</span> : null)
        ) : null}
        <h2 className="b-cases-head" data-reveal>{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
        {body ? <p className="b-cases-body" data-reveal>{body}</p> : null}
        <div className="b-cases-grid">
          {items.map((c, i) => (
            <article className="card case" data-reveal style={{ transitionDelay: `${i * 70}ms` }} key={i}>
              {c.tag ? <span className="pill case-tag">{c.tag}</span> : null}
              <h3>{c.head}</h3>
              <div className="case-rows">
                <div className="case-row"><span className="case-key">The drain</span><span className="case-val">{c.drain}</span></div>
                <div className="case-row"><span className="case-key">We built</span><span className="case-val">{c.built}</span></div>
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
.b-cases-head{font-size:clamp(1.9rem,4.6vw,3.2rem);font-weight:900;line-height:1.03;letter-spacing:-.03em;max-width:20ch}
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
    eyebrow: { type: 'text', label: 'Eyebrow', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    items: {
      type: 'array', label: 'Cases',
      arrayFields: {
        tag: { type: 'text', label: 'Tag' },
        head: { type: 'text', label: 'Heading' },
        drain: { type: 'textarea', label: 'The drain' },
        built: { type: 'textarea', label: 'We built' },
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
    items: [
      C('National real-estate group', 'Listings that took days now take minutes.', 'Agents re-keyed every listing across four disconnected systems, hours lost per property, errors compounding.', 'A single source of truth with automated syndication and an internal portal their teams actually wanted to use.', '9 hrs', 'saved per agent each week'),
      C('Regional healthcare provider', 'Less time on the form, more on the patient.', 'Clinical admin swallowed a third of every shift: paper handoffs, duplicate entry, manual scheduling.', 'A compliant intake-to-record workflow with automated triage routing and a staff dashboard.', '31%', 'drop in admin time per clinician'),
      C('Multi-site logistics operator', 'One screen replaced a wall of spreadsheets.', 'Dispatch ran on spreadsheets and phone calls: no live view, costly idle trucks, daily firefighting.', 'A real-time operations layer with predictive routing and exception alerts on their existing fleet.', '3.4×', 'return inside the first year'),
    ],
  },
  render: (props) => <CaseStudy {...props} />,
};

export default CaseStudy;
