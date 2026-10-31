import { useReveal } from './reveal.js';
import { resolveLink, hasLink } from '../lib/link-resolver.mjs';
import { LinkField } from '../cms/LinkField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// PillarCards: method.html's "The Eight Pillars / Every facet, examined." — a 4-up wall of examinable
// pillar cards (P·01…P·08), each with a number + "Inspect" affordance, a name, a one-line tag, a short
// definition, and a row of assessment chips, with a lime top-border sweep on hover. Faithful port of
// .pillars / .pillar-card. Cards link only when a target is set, so defaults never dead-link.
export function PillarCards({ id, puck, kicker, heading, body, pillars = [] }) {
  const ref = useReveal([pillars.length]);
  const editing = puck && puck.isEditing;
  return (
    <section ref={ref} className={'b-pc-section section gs-rhythm' + (pillars.length === 5 ? ' b-pc-capabilities' : '')}>
      <div className="wrap">
        <div className="b-pc-head center" data-reveal>
          <EditableText editing={editing} id={id} field="kicker" value={kicker} as="span" className="kicker" singleLine placeholder="Kicker…" />
          <EditableText editing={editing} id={id} field="heading" value={heading} as="h2" className="b-pc-h2" singleLine placeholder="Heading…" />
          <EditableText editing={editing} id={id} field="body" value={body} as="p" className="lead b-pc-lead" placeholder="Intro…" />
        </div>
        <div className="b-pc-grid">
          {pillars.map((p, i) => {
            const linked = hasLink(p.href);
            // in the editor render each card as a <div> (not a link) so its inline text editors are
            // clickable; the public site keeps the <a> deep-link when one is set.
            const Tag = editing ? 'div' : (linked ? 'a' : 'article');
            const extra = (!editing && linked) ? resolveLink(p.href) : {};
            return (
              <Tag key={i} className="b-pc-card" data-reveal style={{ transitionDelay: `${i * 60}ms` }} {...extra}>
                <div className="b-pc-top">
                  {p.n && pillars.length !== 5 ? <span className="b-pc-n">{p.n}</span> : null}
                  {linked ? <span className="b-pc-go">Inspect →</span> : null}
                </div>
                <EditableText editing={editing} id={id} arrayField="pillars" index={i} field="name" value={p.name} as="div" className="b-pc-name" singleLine placeholder="Name…" />
                <EditableText editing={editing} id={id} arrayField="pillars" index={i} field="tag" value={p.tag} as="div" className="b-pc-tag" singleLine placeholder="Tagline…" />
                <EditableText editing={editing} id={id} arrayField="pillars" index={i} field="def" value={p.def} as="p" className="b-pc-def" placeholder="Definition…" />
                {Array.isArray(p.chips) && p.chips.length ? (
                  <ul className="b-pc-assess">{p.chips.map((c, j) => <li key={j}><EditableText editing={editing} id={id} path={[{ key: 'pillars', index: i }, { key: 'chips', index: j }]} field="text" value={c.text} as="span" singleLine placeholder="Chip…" /></li>)}</ul>
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
.b-pc-h2{font-size:clamp(2rem,4.5vw,3.6rem);font-weight:900;letter-spacing:-.025em;margin-top:.1em;line-height:1.05}
.b-pc-lead{margin-inline:auto}
.b-pc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
@media(max-width:1000px){.b-pc-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.b-pc-grid{grid-template-columns:1fr}}
.b-pc-card{display:flex;flex-direction:column;gap:10px;padding:24px;border-radius:16px;height:100%;text-align:left;
  background:var(--gs-card);border:1px solid var(--gs-border-soft);position:relative;overflow:hidden;
  color:inherit;text-decoration:none;transition:transform var(--gs-dur) var(--gs-ease),border-color var(--gs-dur),background var(--gs-dur)}
.b-pc-card:hover{transform:translateY(-5px);border-color:var(--gs-border);background:var(--gs-card-hover)}
.b-pc-card::after{content:'';position:absolute;left:0;top:0;height:2px;width:0;background:var(--gs-accent);transition:width .4s var(--gs-ease)}
.b-pc-card:hover::after{width:100%}
.b-pc-top{display:flex;align-items:baseline;justify-content:space-between}
.b-pc-n{font-size:.72rem;font-weight:800;letter-spacing:.16em;color:var(--gs-accent)}
.b-pc-name{font-size:1.18rem;font-weight:800;margin:.1em 0;overflow-wrap:anywhere}
.b-pc-tag{font-size:.82rem;font-weight:700;color:var(--gs-text);overflow-wrap:anywhere}
.b-pc-def{font-size:.86rem;color:var(--gs-text-muted);line-height:1.5;overflow-wrap:anywhere}
.b-pc-assess{list-style:none;display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:8px;padding-left:0}
.b-pc-assess li{font-size:.68rem;letter-spacing:.04em;color:var(--gs-text-faint);border:1px solid var(--gs-border-soft);border-radius:100px;padding:3px 9px}
.b-pc-go{font-size:.74rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-accent);opacity:0;transition:opacity .3s}
.b-pc-card:hover .b-pc-go{opacity:1}
.b-pc-capabilities .b-pc-grid{grid-template-columns:repeat(5,minmax(0,1fr))}
.b-pc-capabilities .b-pc-card{border-radius:var(--gs-card-radius);border-color:var(--gs-border-soft)}
.b-pc-capabilities .b-pc-card:hover,.b-pc-capabilities .b-pc-card:focus-visible{border-color:var(--gs-border-strong)}
.b-pc-capabilities .b-pc-card::after{display:none}
.b-pc-capabilities .b-pc-top:empty{display:none}
@media(max-width:1000px){.b-pc-capabilities .b-pc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.b-pc-capabilities .b-pc-grid{grid-template-columns:1fr}}
@media(hover:none){.b-pc-go{opacity:1}}
@media(prefers-reduced-motion:reduce){.b-pc-card:hover{transform:none}}
`;

const CHIPS = (arr) => arr.map((text) => ({ text }));

export const puck = {
  label: 'Pillar cards (8-up wall)',
  fields: {
    kicker: { type: 'custom', label: 'Kicker', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    body: { type: 'custom', label: 'Intro', render: (props) => <RichTextField {...props} /> },
    // array field stays LAST (see memory "puck-slot-misdetection-inline-editing")
    pillars: {
      type: 'array', label: 'Pillars',
      // within the item, the nested `chips` array is declared LAST so the custom name/tag/def fields
      // before it don't mis-slot (same rule applied at the sub-field level, to be safe).
      arrayFields: {
        n: { type: 'text', label: 'Number' },
        name: { type: 'custom', label: 'Name', render: (props) => <RichTextField {...props} variant="heading" /> },
        tag: { type: 'custom', label: 'Tagline', render: (props) => <RichTextField {...props} /> },
        def: { type: 'custom', label: 'Definition', render: (props) => <RichTextField {...props} /> },
        href: { type: 'custom', label: 'Deep-link (optional)', render: (props) => <LinkField {...props} /> },
        chips: {
          type: 'array', label: 'Assessment chips',
          arrayFields: { text: { type: 'custom', label: 'Chip', render: (props) => <RichTextField {...props} /> } },
          defaultItemProps: { text: 'Facet' },
          getItemSummary: (i) => i.text || 'Chip',
        },
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
