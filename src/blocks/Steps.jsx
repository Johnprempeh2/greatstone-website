import { useReveal } from './reveal.js';

// A numbered process: how a Deep Dive works. Each step settles before the next lands (the
// stagger does the talking). Numbering is derived; marketing edits titles and copy.
export function Steps({ index, eyebrow, headline, highlight, body, items = [], align = 'left', numberStyle = 'badge' }) {
  const ref = useReveal([items.length]);
  return (
    <section ref={ref} className="b-steps" data-align={align}>
      <div className="wrap">
        <div className="b-chapter-eyebrow" data-reveal>
          {index ? <span className="b-chapter-num">{index}</span> : null}
          {eyebrow ? <span className="b-chapter-name">{eyebrow}</span> : null}
        </div>
        <h2 className="b-steps-head" data-reveal>{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
        {body ? <p className="b-steps-body" data-reveal>{body}</p> : null}
        <ol className="b-steps-grid">
          {items.map((it, i) => (
            <li className="b-step" data-reveal style={{ transitionDelay: `${i * 90}ms` }} key={i}>
              <span className={numberStyle === 'text' ? 'b-step-n is-text' : 'b-step-n'}>{String(i + 1).padStart(2, '0')}</span>
              {it.phase ? <span className="b-step-phase">{it.phase}</span> : null}
              <h3>{it.title}</h3>
              <p>{it.text}</p>
              {it.timing ? <p className="b-step-timing">{it.timing}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export const css = `
.b-steps{padding:clamp(64px,11vw,140px) 0;position:relative}
.b-steps-head{font-size:clamp(1.9rem,4.6vw,3.2rem);font-weight:900;line-height:1.03;letter-spacing:-.03em;max-width:16ch}
.b-steps-body{margin-top:22px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.18rem);max-width:62ch;line-height:1.7}
.b-steps-grid{list-style:none;display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(16px,2.4vw,30px);margin-top:clamp(36px,5vw,58px)}
@media(max-width:820px){.b-steps-grid{grid-template-columns:1fr}}
.b-step{position:relative;padding:28px 26px;border:1px solid var(--gs-border-soft);border-radius:18px;
  background:var(--gs-card);backdrop-filter:blur(6px);transition:transform .4s var(--gs-ease),border-color .4s var(--gs-ease)}
.b-step:hover{transform:translateY(-4px);border-color:var(--gs-border)}
.b-step-n{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:13px;
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
    eyebrow: { type: 'text', label: 'Eyebrow', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
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
        title: { type: 'text', label: 'Title' },
        text: { type: 'textarea', label: 'Description' },
        timing: { type: 'text', label: 'Timing line (optional)' },
      },
      defaultItemProps: { phase: '', title: 'Step', text: 'What happens here.', timing: '' },
      getItemSummary: (item) => item.title || 'Step',
    },
  },
  defaultProps: {
    index: '06', eyebrow: 'How a Deep Dive Works',
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
