import { useState } from 'react';
import EditableText from './EditableText.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import { STEPS } from './DxConsultancyMethod.jsx';

// The visual and method list use the same four approved steps.
const layers = STEPS;

export function LayerStack({ id, puck, eyebrow, heading, body, secondStepNote }) {
  const [active, setActive] = useState(-1);
  const editing = !!puck?.isEditing;
  return <section className="b-layer-stack"><div className="wrap">
    <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="p" className="kicker" singleLine />
    <EditableText editing={editing} id={id} field="heading" value={heading} as="h2" className="b-layer-head" singleLine />
    <EditableText editing={editing} id={id} field="body" value={body} as="p" className="b-layer-lead" />
    <div className="b-layer-layout">
      <ol className="b-layer-list">{layers.map((step, i) => <li key={step.name}>
        <button type="button" className={active === i ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)} aria-pressed={active === i}>
          <span className="b-layer-num">0{i + 1}</span><span><strong>{step.name}</strong><span>{step.text}</span>{i === 1 && secondStepNote ? <EditableText editing={editing} id={id} field="secondStepNote" value={secondStepNote} as="span" className="b-layer-note" /> : null}</span>
        </button>
      </li>)}</ol>
      <div className="b-layer-visual" aria-hidden="true">{layers.map((step, i) => <div key={step.name} className={'b-layer-slab' + (active === i ? ' is-active' : active >= 0 ? i < active ? ' is-before' : ' is-after' : '')} style={{ '--i': i }}><span>0{i + 1}</span></div>)}</div>
    </div>
  </div></section>;
}

export const css = `
.b-layer-stack{padding:clamp(72px,9vw,128px) 0;background:var(--gs-bg-deep);color:var(--gs-text)}
.b-layer-head{font-size:clamp(2.1rem,4.8vw,4.5rem);line-height:1.06;letter-spacing:-.03em;margin:14px 0 18px}
.b-layer-lead{color:var(--gs-text-muted);max-width:68ch;line-height:1.7}
.b-layer-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.8fr);gap:clamp(32px,7vw,100px);align-items:center;margin-top:48px}
.b-layer-list{list-style:none;padding:0;margin:0;border-top:1px solid var(--gs-border-strong)}
.b-layer-list li{border-bottom:1px solid var(--gs-border-strong)}
.b-layer-list button{display:grid;grid-template-columns:56px 1fr;gap:16px;width:100%;min-height:76px;padding:20px 10px;border:0;background:transparent;color:var(--gs-text);text-align:left;font:inherit;cursor:pointer}
.b-layer-list button:hover,.b-layer-list button.is-active{background:var(--gs-accent-soft)}
.b-layer-list button:focus-visible{outline:2px solid var(--gs-accent);outline-offset:-2px}
.b-layer-num{color:var(--gs-accent);font-weight:800}.b-layer-list strong{display:block;font-size:clamp(1.12rem,1.8vw,1.5rem);margin-bottom:9px}
.b-layer-list button span span{display:block;color:var(--gs-text-muted);line-height:1.6}
.b-layer-list button span .b-layer-note{margin-top:12px;color:var(--gs-text)}
.b-layer-visual{display:flex;flex-direction:column;align-items:center;perspective:600px;padding:58px 0}
.b-layer-slab{display:flex;align-items:center;gap:18px;width:calc(78% + var(--i) * 11%);min-height:86px;padding:18px 24px;border:1px solid var(--gs-border-strong);border-radius:14px;background:var(--gs-accent-soft);box-shadow:0 18px 32px rgba(0,0,0,.18);transform:rotateX(16deg);transition:transform .55s var(--gs-ease),background .55s var(--gs-ease)}
.b-layer-slab+.b-layer-slab{margin-top:-18px}
.b-layer-slab.is-before{transform:rotateX(16deg) translateY(-18px)}.b-layer-slab.is-after{transform:rotateX(16deg) translateY(18px)}
.b-layer-slab.is-active{transform:rotateX(16deg) translateY(-4px) scale(1.025);background:var(--gs-accent-dim)}
.b-layer-slab span{color:var(--gs-accent);font-weight:800}.b-layer-slab strong{font-size:clamp(.94rem,1.4vw,1.18rem)}
@media(max-width:720px){.b-layer-layout{grid-template-columns:1fr;gap:16px;margin-top:24px}.b-layer-visual{order:-1;padding:30px 0 40px}.b-layer-slab{min-height:65px;padding:10px 18px}.b-layer-list button{grid-template-columns:40px 1fr}}
@media(max-width:360px){.b-layer-slab{width:100%}}
@media(prefers-reduced-motion:reduce){.b-layer-slab{transition:none;transform:none}.b-layer-slab.is-before,.b-layer-slab.is-after,.b-layer-slab.is-active{transform:none}}
@media print{.b-layer-stack{background:white;color:black}.b-layer-list button,.b-layer-slab{color:black;box-shadow:none}.b-layer-slab,.b-layer-slab.is-before,.b-layer-slab.is-after,.b-layer-slab.is-active{transform:none}.b-layer-visual{min-height:0}}
`;

export const puck = { label: 'Layer stack', fields: {
  eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
  heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
  body: { type: 'custom', label: 'Introduction', render: (props) => <RichTextField {...props} /> },
  secondStepNote: { type: 'custom', label: 'Note under initial assessment', render: (props) => <RichTextField {...props} /> },
}, defaultProps: { eyebrow: 'How we work', heading: 'A method that builds in layers.', body: 'Each step gives the next one a firmer footing.' }, render: (props) => <LayerStack {...props} /> };
