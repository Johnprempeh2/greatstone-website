import { transformationServices } from '../data/transformation-services.mjs';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx';

// One approved section. Editors can change its introduction and close, while the
// eight category names and claims stay aligned with the approved navigation.
export function TransformationServices({ id, puck, eyebrow, heading, body, closeHeading, closeBody }) {
  const editing = !!puck?.isEditing;
  return <section className="b-transform">
    <div className="wrap">
      <header className="b-transform-intro">
        <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="p" className="kicker" singleLine />
        <EditableText editing={editing} id={id} field="heading" value={heading} as="h1" className="h1" singleLine />
        <EditableText editing={editing} id={id} field="body" value={body} as="p" className="muted" />
      </header>
      <div className="b-transform-grid">
        {transformationServices.map((service) => <article id={service.id} key={service.id} className="b-transform-card" tabIndex={-1}>
          <h2>{service.title}</h2>
          <p>{service.step}</p>
          <p className="b-transform-whole"><strong>As part of the full transformation:</strong> {service.whole}</p>
          <a href="#go/contact/enquiry">Ask about this step</a>
        </article>)}
      </div>
      <div className="b-transform-close">
        <EditableText editing={editing} id={id} field="closeHeading" value={closeHeading} as="h2" singleLine />
        <EditableText editing={editing} id={id} field="closeBody" value={closeBody} as="p" />
        <div className="b-transform-actions"><a className="b-cta" href="#enquire/a-free-executive-discovery">Begin the Conversation</a><a href="#go/method">See the full transformation</a></div>
      </div>
    </div>
  </section>;
}

export const css = `
.b-transform{padding:clamp(88px,12vw,160px) 0 100px;color:var(--gs-text)}
.b-transform-intro{max-width:850px;margin-bottom:clamp(48px,7vw,88px)}
.b-transform-intro h1{margin:16px 0 22px;font-size:clamp(2.7rem,6vw,5.5rem);line-height:1.02;letter-spacing:-.045em}
.b-transform-intro p:last-child{max-width:66ch;font-size:clamp(1rem,1.6vw,1.2rem);line-height:1.7}
.b-transform-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--gs-border);border:1px solid var(--gs-border)}
.b-transform-card{padding:clamp(28px,3.6vw,50px);background:#121713;scroll-margin-top:110px}
.b-transform-card h2{font-size:clamp(1.35rem,2.2vw,2rem);line-height:1.16;margin:0 0 24px}
.b-transform-card p{line-height:1.65;margin:0 0 16px;color:var(--gs-muted)}
.b-transform-whole strong{color:var(--gs-text)}
.b-transform-card a,.b-transform-actions a:last-child{display:inline-block;color:var(--gs-accent);font-weight:700;text-decoration:none;border-bottom:1px solid currentColor;padding-bottom:4px;margin-top:12px}
.b-transform-card a:hover,.b-transform-actions a:last-child:hover{color:#fff}
.b-transform-close{max-width:820px;margin:clamp(76px,10vw,128px) auto 0;text-align:center}
.b-transform-close h2{font-size:clamp(2rem,4vw,3.5rem);line-height:1.1;margin:0 0 20px}
.b-transform-close p{color:var(--gs-muted);line-height:1.7;font-size:1.1rem}
.b-transform-actions{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:24px;margin-top:36px}
.b-transform-actions .b-cta{background:var(--gs-accent);color:#111;padding:14px 22px;border-radius:100px;font-weight:800;text-decoration:none}
.b-transform a:focus-visible{outline:2px solid var(--gs-accent);outline-offset:5px}
@media(max-width:700px){.b-transform{padding:70px 0 75px}.b-transform-grid{grid-template-columns:1fr}.b-transform-card{scroll-margin-top:85px}.b-transform-actions{flex-direction:column}}
`;

export const puck = {
  label: 'Transformation Services',
  fields: {
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    body: { type: 'custom', label: 'Introduction', render: (props) => <RichTextField {...props} /> },
    closeHeading: { type: 'custom', label: 'Closing heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    closeBody: { type: 'custom', label: 'Closing body', render: (props) => <RichTextField {...props} /> },
  },
  defaultProps: {
    eyebrow: 'Transformation Services', heading: 'Take one step, or the whole way.',
    body: 'Take a step on its own when that is what you need now. Or take it as part of the full transformation, where every step is planned with the others. Either way, we show you what could come next.',
    closeHeading: 'Not sure which step comes first?',
    closeBody: 'That is what the full transformation is for. We look at the whole business, then plan each step so they work together. It starts with a free conversation.',
  },
  render: (props) => <TransformationServices {...props} />,
};
