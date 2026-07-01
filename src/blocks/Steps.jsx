import { useReveal } from './reveal.js';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// A numbered process: how a Diagnostic works. Each step settles before the next lands (the
// stagger does the talking). Numbering is derived; marketing edits titles and copy.
export function Steps({ id, puck, index, eyebrow, headline, highlight, body, items = [], align = 'left', numberStyle = 'badge' }) {
  const ref = useReveal([items.length]);
  const editing = puck && puck.isEditing;
  return (
    <section ref={ref} className="b-steps" data-align={align}>
      <div className="wrap">
        {(index || eyebrow || editing) ? (
          <div className="b-chapter-eyebrow" data-reveal>
            {index ? <span className="b-chapter-num">{index}</span> : null}
            <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="span" className="b-chapter-name" singleLine placeholder="Eyebrow…" />
          </div>
        ) : null}
        {(headline || highlight || editing) ? (
          <h2 className="b-steps-head" data-reveal><EditableText editing={editing} id={id} field="headline" value={headline} as="span" singleLine placeholder="Headline…" /> {highlight ? <span className="accent">{highlight}</span> : null}</h2>
        ) : null}
        <EditableText editing={editing} id={id} field="body" value={body} as="p" className="b-steps-body" placeholder="Body…" data-reveal />
        <ol className="b-steps-grid">
          {items.map((it, i) => {
            const num = String(i + 1).padStart(2, '0');
            // Text mode reads the number as a label line, so fold the phase into it
            // ("01 · Within 24 hours", matching the live contact page). Badge mode can't
            // hold a phrase in its tile, so it keeps the separate uppercase phase label.
            const textMode = numberStyle === 'text';
            return (
              <li className="b-step" data-reveal style={{ transitionDelay: `${i * 90}ms` }} key={i}>
                <span className={textMode ? 'b-step-n is-text' : 'b-step-n'}>{textMode && it.phase ? `${num} · ${it.phase}` : num}</span>
                {it.phase && !textMode ? <span className="b-step-phase">{it.phase}</span> : null}
                <EditableText editing={editing} id={id} arrayField="items" index={i} field="title" value={it.title} as="h3" singleLine placeholder="Title…" />
                <EditableText editing={editing} id={id} arrayField="items" index={i} field="text" value={it.text} as="p" placeholder="Description…" />
                {it.timing ? <p className="b-step-timing">{it.timing}</p> : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export const css = `
.b-steps{padding:clamp(64px,11vw,140px) 0;position:relative}
.b-steps-head{font-size:clamp(2rem,4.5vw,3.6rem);font-weight:900;line-height:1.05;letter-spacing:-.025em;max-width:16ch}
.b-steps-body{margin-top:22px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.18rem);max-width:62ch;line-height:1.7}
.b-steps-grid{list-style:none;display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(16px,2.4vw,30px);margin-top:clamp(36px,5vw,58px)}
@media(max-width:820px){.b-steps-grid{grid-template-columns:1fr}}
.b-step{position:relative;padding:28px 26px;border:1px solid var(--gs-border-soft);border-radius:18px;
  background:var(--gs-card);backdrop-filter:blur(6px);transition:transform var(--gs-dur) var(--gs-ease),border-color var(--gs-dur) var(--gs-ease)}
.b-step:hover{transform:translateY(-4px);border-color:var(--gs-border)}
.b-step-n{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:12px;
  font-weight:900;font-size:1.04rem;color:var(--gs-accent);background:rgba(200,255,0,.08);border:1px solid var(--gs-border);
  font-variant-numeric:tabular-nums}
.b-step-phase{display:block;margin-top:14px;font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gs-accent)}
.b-step h3{margin-top:18px;font-size:1.22rem;font-weight:800;letter-spacing:-.01em}
.b-step-phase + h3{margin-top:6px}
.b-step p{margin-top:10px;color:var(--gs-muted);font-size:.95rem;line-height:1.6}
.b-step p.b-step-timing{margin-top:.9rem;font-size:.74rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-text-faint);line-height:1.4}
/* centred header (live industries wraps kicker/h2/lead in .center); cards stay left */
.b-steps[data-align="center"] .b-chapter-eyebrow{justify-content:center}
.b-steps[data-align="center"] .b-steps-head,
.b-steps[data-align="center"] .b-steps-body{margin-left:auto;margin-right:auto;text-align:center}
/* small lime TEXT number (live .card .num: .78rem / .2em / lime) instead of the badge tile */
.b-step-n.is-text{display:inline-block;width:auto;height:auto;border:0;background:none;border-radius:0;
  font-size:.78rem;font-weight:700;letter-spacing:.2em;color:var(--gs-accent);font-variant-numeric:tabular-nums}
`;

const STEP = (title, text) => ({ title, text });

export const puck = {
  label: 'Steps',
  fields: {
    index: { type: 'text', label: 'Number', contentEditable: true },
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    headline: { type: 'custom', label: 'Headline', render: (props) => <RichTextField {...props} variant="heading" /> },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'custom', label: 'Body', render: (props) => <RichTextField {...props} /> },
    align: { type: 'radio', label: 'Header alignment', options: [
      { label: 'Left', value: 'left' }, { label: 'Centre', value: 'center' },
    ]},
    numberStyle: { type: 'radio', label: 'Step number style', options: [
      { label: 'Badge tile', value: 'badge' }, { label: 'Small lime text', value: 'text' },
    ]},
    items: {
      type: 'array', label: 'Steps',
      arrayFields: {
        phase: { type: 'text', label: 'Phase label (optional)' },
        title: { type: 'custom', label: 'Title', render: (props) => <RichTextField {...props} variant="heading" /> },
        text: { type: 'custom', label: 'Description', render: (props) => <RichTextField {...props} /> },
        timing: { type: 'text', label: 'Timing line (optional)' },
      },
      defaultItemProps: { phase: '', title: 'Step', text: 'What happens here.', timing: '' },
      getItemSummary: (item) => item.title || 'Step',
    },
  },
  defaultProps: {
    index: '06', eyebrow: 'How a Diagnostic Works',
    headline: 'Three moves to your', highlight: 'foundation.',
    align: 'left', numberStyle: 'badge',
    body: 'No theatre, no twelve-week discovery. We diagnose, we report, we build, and each layer settles before the next one lands.',
    items: [
      STEP('Diagnostic', 'We map where the week goes, across all eight pillars.'),
      STEP('Periscope Report', 'A clear read of where you stand and the fastest gains.'),
      STEP('Phased Roadmap', 'The build, embedded into how you already work, not bolted on.'),
    ],
  },
  render: (props) => <Steps {...props} />,
};

export default Steps;
