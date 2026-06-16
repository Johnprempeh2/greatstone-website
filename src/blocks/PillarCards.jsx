import { useReveal } from './reveal.js';
import { safeHref } from '../lib/safe-url.js';

// PillarCards: method.html's "The Eight Pillars / Every facet, examined." — a 4-up wall of examinable
// pillar cards (P·01…P·08), each with a number + "Inspect" affordance, a name, a one-line tag, a short
// definition, and a row of assessment chips, with a lime top-border sweep on hover. Faithful port of
// .pillars / .pillar-card. Cards link only when a target is set, so defaults never dead-link.
export function PillarCards({ kicker, heading, body, pillars = [] }) {
  const ref = useReveal([pillars.length]);
  return (
    <section ref={ref} className="b-pc-section section">
      <div className="wrap">
        <div className="b-pc-head center" data-reveal>
          {kicker ? <span className="kicker">{kicker}</span> : null}
          {heading ? <h2 className="b-pc-h2">{heading}</h2> : null}
          {body ? <p className="lead b-pc-lead">{body}</p> : null}
        </div>
        <div className="b-pc-grid">
          {pillars.map((p, i) => {
            const linked = p.href && p.href !== '#';
            const Tag = linked ? 'a' : 'article';
            const extra = linked ? { href: safeHref(p.href) } : {};
            return (
              <Tag key={i} className="b-pc-card" data-reveal style={{ transitionDelay: `${i * 60}ms` }} {...extra}>
                <div className="b-pc-top">
                  {p.n ? <span className="b-pc-n">{p.n}</span> : null}
                  {linked ? <span className="b-pc-go">Inspect →</span> : null}
                </div>
                {p.name ? <div className="b-pc-name">{p.name}</div> : null}
                {p.tag ? <div className="b-pc-tag">{p.tag}</div> : null}
                {p.def ? <p className="b-pc-def">{p.def}</p> : null}
                {Array.isArray(p.chips) && p.chips.length ? (
                  <ul className="b-pc-assess">{p.chips.map((c, j) => <li key={j}>{c.text}</li>)}</ul>
                ) : null}
              </Tag>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-pc-head{margin-bottom:44px}
.b-pc-h2{font-size:clamp(1.7rem,3.6vw,2.6rem);font-weight:900;letter-spacing:-.025em;margin-top:.1em}
.b-pc-lead{margin-inline:auto}
.b-pc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
@media(max-width:1000px){.b-pc-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.b-pc-grid{grid-template-columns:1fr}}
.b-pc-card{display:flex;flex-direction:column;gap:10px;padding:24px;border-radius:16px;height:100%;text-align:left;
  background:var(--gs-card);border:1px solid var(--gs-border-soft);position:relative;overflow:hidden;
  color:inherit;text-decoration:none;transition:transform .3s var(--gs-ease),border-color .3s,background .3s}
.b-pc-card:hover{transform:translateY(-5px);border-color:var(--gs-border);background:var(--gs-card-hover)}
.b-pc-card::after{content:'';position:absolute;left:0;top:0;height:2px;width:0;background:var(--gs-accent);transition:width .4s var(--gs-ease)}
.b-pc-card:hover::after{width:100%}
.b-pc-top{display:flex;align-items:baseline;justify-content:space-between}
.b-pc-n{font-size:.72rem;font-weight:800;letter-spacing:.16em;color:var(--gs-accent)}
.b-pc-name{font-size:1.18rem;font-weight:800;margin:.1em 0}
.b-pc-tag{font-size:.82rem;font-weight:700;color:var(--gs-text)}
.b-pc-def{font-size:.86rem;color:var(--gs-text-muted);line-height:1.5}
.b-pc-assess{list-style:none;display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:8px;padding-left:0}
.b-pc-assess li{font-size:.68rem;letter-spacing:.04em;color:var(--gs-text-faint);border:1px solid var(--gs-border-soft);border-radius:100px;padding:3px 9px}
.b-pc-go{font-size:.74rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-accent);opacity:0;transition:opacity .3s}
.b-pc-card:hover .b-pc-go{opacity:1}
`;

const CHIPS = (arr) => arr.map((text) => ({ text }));

export const puck = {
  label: 'Pillar cards (8-up wall)',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    body: { type: 'textarea', label: 'Intro', contentEditable: true },
    pillars: {
      type: 'array', label: 'Pillars',
      arrayFields: {
        n: { type: 'text', label: 'Number' },
        name: { type: 'text', label: 'Name' },
        tag: { type: 'text', label: 'Tagline' },
        def: { type: 'textarea', label: 'Definition' },
        chips: {
          type: 'array', label: 'Assessment chips',
          arrayFields: { text: { type: 'text', label: 'Chip' } },
          defaultItemProps: { text: 'Facet' },
          getItemSummary: (i) => i.text || 'Chip',
        },
        href: { type: 'text', label: 'Deep-link (optional)' },
      },
      defaultItemProps: { n: 'P·00', name: 'Pillar', tag: 'A one-line tag.', def: 'What we examine here.', chips: [], href: '' },
      getItemSummary: (i) => i.name || 'Pillar',
    },
  },
  defaultProps: {
    kicker: 'The Eight Pillars',
    heading: 'Every facet, examined.',
    body: 'Here’s what we look at, and what we measure, across every pillar of the method.',
    pillars: [
      { n: 'P·01', name: 'People', tag: 'Know who moves what.', def: 'We map the relationship networks inside your company: roles, capabilities, resourcing and sentiment, so change lands with the grain, not against it.', chips: CHIPS(['Roles & reporting', 'Capabilities', 'Resourcing', 'Sentiment']), href: '' },
      { n: 'P·02', name: 'Communication', tag: 'Make the value land.', def: 'We evaluate how well you communicate your value, inside and out, then build strategies that leave any audience engaged.', chips: CHIPS(['Internal messaging', 'External messaging', 'Engagement']), href: '' },
      { n: 'P·03', name: 'Innovation', tag: 'Innovate on purpose.', def: 'We examine how deliberately you innovate, whether you do it constantly and whether your environment enables it, then benchmark you.', chips: CHIPS(['Repeatability', 'Learning loops', 'Environment']), href: '' },
      { n: 'P·04', name: 'Data', tag: 'Map the lifecycle.', def: 'We map your data lifecycle end to end: its structure, accessibility, accuracy, consistency, reliability and validity.', chips: CHIPS(['Structure', 'Accuracy', 'Reliability', 'Validity']), href: '' },
      { n: 'P·05', name: 'Customer', tag: 'Know who you serve.', def: 'We identify who your customers really are and how to serve them better, through customer intelligence, journeys and every touchpoint between.', chips: CHIPS(['Intelligence', 'Journeys', 'Touchpoints']), href: '' },
      { n: 'P·06', name: 'Competition', tag: 'Set the pace.', def: 'One question, answered plainly: are you staying ahead of your competitors, and how do we position you as a pioneer in your field?', chips: CHIPS(['Position', 'Market lead', 'Pioneer status']), href: '' },
      { n: 'P·07', name: 'Technology', tag: 'Pressure-test the stack.', def: 'We analyse your stack: how maturely you use your tools, where integrations fall short, and how resilient the infrastructure underneath really is.', chips: CHIPS(['Tool maturity', 'Integration gaps', 'Resilience']), href: '' },
      { n: 'P·08', name: 'Value', tag: 'Align value both ways.', def: 'We align your values with value for the customer, so every transformation pays off for you and, ultimately, for them.', chips: CHIPS(['KPIs', 'Reporting', 'Capacity', 'Performance']), href: '' },
    ],
  },
  render: (props) => <PillarCards {...props} />,
};

export default PillarCards;
