import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx';

// The five approved steps are shared method language (18 Nov copy pass, John 27 Nov). Editors can change the
// introduction and invitation, while the order and claims stay consistent. A step with no tag shows none: the
// Playbook goes up untagged until John confirms it is a paid deliverable.
export const STEPS = [
  { name: 'Executive discovery', tag: 'Free', text: 'A conversation with our senior team about where your business wants to go, and what is in the way of getting there: the processes, systems and habits that slow you down. Led by people, not software.' },
  { name: 'Initial assessment', tag: 'Free', text: 'Where technology and AI could help, with an indicative scope, no commitment.' },
  { name: 'Deep dive', tag: 'Paid', text: 'We look closely at how the work is really done, with the people who do it, not only with leaders. Every role has its say. We map who does what and where the work gets stuck. This step begins after a written scope is agreed. You come away with a clear picture of what to change first, and why.' },
  { name: 'Playbook', tag: '', text: 'Your DX playbook: the plan for your transformation, written for your business alone. It sets the priorities, the order, who owns each change and how you will know it is working. It is the most strategic thing we deliver, and it is yours to keep, whoever builds it.' },
  { name: 'Build', tag: 'Where it fits', text: 'We put the playbook into practice one step at a time: the systems, the automation and the AI your team will use. A person on your side approves the work at the points you choose. If it helps, we keep running it for you as a managed service.' },
];
// The line above step 01 (site-wide narrative sweep, John 27 Nov).
export const STEPS_LEAD = 'Strategy first. Each step ties what we build to the goals you set.';

export function DxConsultancyMethod({ id, puck, eyebrow, heading, headingLevel = 'h1', body, secondStepNote, closeHeading, closeBody, introOnly = false }) {
  const editing = !!puck?.isEditing;
  const introHeading = headingLevel === 'h2' ? 'h2' : 'h1';
  const StepHeading = headingLevel === 'h2' ? 'h3' : 'h2';
  return <section id="consultancy-method" className="b-dx-method gs-rhythm">
    <div className="wrap">
      <header className="b-dx-method-intro">
        <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="p" className="kicker" singleLine />
        <EditableText editing={editing} id={id} field="heading" value={heading} as={introHeading} className="h1" singleLine />
        <EditableText editing={editing} id={id} field="body" value={body} as="p" className="muted" />
      </header>
      {!introOnly && <><nav className="b-dx-method-overview" aria-label="Method steps">
        {STEPS.map((step, index) => <a key={step.name} href={`#dx-step-${index + 1}`}>
          <strong>{step.name}</strong>{step.tag ? <span>{step.tag}</span> : null}
        </a>)}
      </nav>
      <p className="b-dx-method-lead">{STEPS_LEAD}</p>
      <ol className="b-dx-method-steps" aria-label="Our five steps">
        {STEPS.map((step, index) => <li key={step.name} id={`dx-step-${index + 1}`}>
          <span className="b-dx-method-number" aria-hidden="true">0{index + 1}</span>
          <div><div className="b-dx-method-title"><StepHeading>{step.name}</StepHeading>{step.tag ? <span>{step.tag}</span> : null}</div><p>{step.text}</p>{index === 1 && secondStepNote ? <EditableText editing={editing} id={id} field="secondStepNote" value={secondStepNote} as="p" className="b-dx-method-note" /> : null}</div>
        </li>)}
      </ol></>}
      {(closeHeading || closeBody) && <div className="b-dx-method-close">
        <EditableText editing={editing} id={id} field="closeHeading" value={closeHeading} as="h2" singleLine />
        <EditableText editing={editing} id={id} field="closeBody" value={closeBody} as="p" />
        <a className="b-cta" href="#enquire/a-free-executive-discovery">Begin the Conversation</a>
      </div>}
    </div>
  </section>;
}

export const css = `
.b-dx-method{padding:clamp(80px,10vw,144px) 0 72px;color:var(--gs-text);scroll-margin-top:90px}
.b-dx-method-intro{max-width:860px;margin-bottom:clamp(48px,7vw,88px)}
.b-dx-method-intro h1{margin:16px 0 22px;font-size:clamp(2.7rem,6vw,4.5rem);line-height:1.04;letter-spacing:-.035em}
.b-dx-method-intro h2{margin:16px 0 22px;font-size:clamp(2rem,4vw,2.75rem);line-height:1.08;letter-spacing:-.025em}
.b-dx-method-intro p:last-child{max-width:66ch;font-size:clamp(1rem,1.6vw,1.2rem);line-height:1.7}
.b-dx-method-overview{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:clamp(64px,8vw,110px)}
.b-dx-method-overview a{display:flex;flex-direction:column;gap:12px;justify-content:space-between;padding:20px;min-height:100px;background:var(--gs-card);color:var(--gs-text);text-decoration:none;border:1px solid var(--gs-border-soft);border-radius:24px;transition:transform var(--gs-dur-standard) var(--gs-ease),border-color var(--gs-dur-standard)}
.b-dx-method-overview a:hover{transform:translateY(-4px);background:var(--gs-card-hover);border-color:var(--gs-border-strong)}
.b-dx-method-overview strong{font-size:clamp(.9rem,1.2vw,1.1rem);line-height:1.3}
.b-dx-method-overview span{color:var(--gs-accent);font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.b-dx-method-lead{max-width:66ch;margin:0 0 clamp(24px,3vw,36px);font-size:clamp(1.1rem,1.8vw,1.35rem);font-weight:700;line-height:1.5;color:var(--gs-text)}
.b-dx-method-steps{list-style:none;margin:0;padding:0;border-top:1px solid var(--gs-border)}
.b-dx-method-steps li{display:grid;grid-template-columns:clamp(70px,11vw,170px) minmax(0,1fr);gap:24px;padding:clamp(30px,4vw,56px) 0;border-bottom:1px solid var(--gs-border);scroll-margin-top:100px}
.b-dx-method-number{color:var(--gs-accent);font-size:clamp(1.5rem,2.5vw,2.5rem);font-weight:700;line-height:1.1}
.b-dx-method-title{display:flex;align-items:baseline;flex-wrap:wrap;gap:12px 20px;margin-bottom:18px}
.b-dx-method-title h2,.b-dx-method-title h3{font-size:clamp(1.5rem,2.6vw,2.5rem);line-height:1.15;margin:0;letter-spacing:-.025em}
.b-dx-method-title span{font-size:.78rem;font-weight:700;color:var(--gs-accent);text-transform:uppercase;letter-spacing:.08em}
.b-dx-method-steps p{max-width:70ch;color:var(--gs-text-muted);line-height:1.7;margin:0}
.b-dx-method-steps .b-dx-method-note{margin-top:14px;color:var(--gs-text)}
.b-dx-method-close{max-width:760px;margin:clamp(72px,9vw,120px) auto 0;text-align:center}
.b-dx-method-close h2{font-size:clamp(2rem,4vw,3.5rem);line-height:1.1;margin:0 0 20px}
.b-dx-method-close p{color:var(--gs-text-muted);line-height:1.7;font-size:1.1rem;margin:0 0 32px}
.b-dx-method-close .b-cta{display:inline-block;background:var(--gs-accent);color:#111;padding:14px 22px;border-radius:100px;font-weight:800;text-decoration:none}
.b-dx-method a:focus-visible{outline:2px solid var(--gs-accent);outline-offset:5px}
@media(prefers-reduced-motion:reduce){.b-dx-method-overview a:hover{transform:none}}
@media(max-width:700px){.b-dx-method{padding:72px 0 48px}.b-dx-method-overview{grid-template-columns:repeat(2,minmax(0,1fr))}.b-dx-method-overview a:last-child{grid-column:1/-1}.b-dx-method-overview a{min-height:88px;padding:16px}.b-dx-method-steps li{grid-template-columns:42px minmax(0,1fr);gap:14px}.b-dx-method-title{display:block}.b-dx-method-title span{display:inline-block;margin-top:10px}}
`;

export const puck = {
  label: 'DX Consultancy Method',
  fields: {
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    headingLevel: { type: 'radio', label: 'Heading role', options: [{ label: 'Page title (H1)', value: 'h1' }, { label: 'Section title (H2)', value: 'h2' }] },
    introOnly: { type: 'radio', label: 'Display', options: [{ label: 'Introduction and steps', value: false }, { label: 'Introduction only', value: true }] },
    body: { type: 'custom', label: 'Introduction', render: (props) => <RichTextField {...props} /> },
    secondStepNote: { type: 'custom', label: 'Note under initial assessment', render: (props) => <RichTextField {...props} /> },
    closeHeading: { type: 'custom', label: 'Closing heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    closeBody: { type: 'custom', label: 'Closing body', render: (props) => <RichTextField {...props} /> },
  },
  defaultProps: {
    eyebrow: 'DX Consultancy',
    heading: 'Most companies use AI one task at a time.',
    headingLevel: 'h1',
    body: 'One tool here, one assistant there. Each brings some value, but none of them is tied to the rest of the business. We start with the whole business, then plan where technology and AI fit, step by step.',
    secondStepNote: '',
    closeHeading: 'Start with a conversation.',
    closeBody: 'The first two steps are free. You will know where you stand before you commit to anything.',
  },
  render: (props) => <DxConsultancyMethod {...props} />,
};
