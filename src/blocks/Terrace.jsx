import { useEffect, useRef, useState } from 'react';
import { useReveal } from './reveal.js';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// Terrace: home §06 "How a Diagnostic works" — a centered chapter (reusing the .b-chapter framing) over
// a stack of slabs that grow WIDER as they descend (calc(70% + i*15%)), each a lime trapezoid that
// settles up from below in a top-down stagger when the stack scrolls in. Faithful port of .dd-stack /
// .dd-slab. The chapter copy lands first, then "each layer settles before the next one lands".
export function Terrace({ id, puck, index, eyebrow, headline, highlight, body, slabs = [] }) {
  const ref = useReveal([slabs.length]);
  const editing = puck && puck.isEditing;
  const stackRef = useRef(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setSettled(true); return; }
    const r = el.getBoundingClientRect();
    if (r.top < (innerHeight || 800) * 0.85 && r.bottom > 0) { setSettled(true); return; } // already in view
    const obs = new IntersectionObserver((es, ob) => es.forEach((e) => {
      if (e.isIntersecting) { setSettled(true); ob.disconnect(); }
    }), { threshold: 0.35 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [slabs.length]);

  return (
    <section ref={ref} className="b-chapter align-center b-terrace">
      <div className="wrap b-chapter-inner">
        <div className="b-chapter-eyebrow" data-reveal>
          {index ? <span className="b-chapter-num">{index}</span> : null}
          <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="span" className="b-chapter-name" singleLine placeholder="Eyebrow…" />
        </div>
        <h2 className="b-chapter-h" data-reveal><EditableText editing={editing} id={id} field="headline" value={headline} as="span" singleLine placeholder="Headline…" /> {highlight ? <span className="accent">{highlight}</span> : null}</h2>
        <EditableText editing={editing} id={id} field="body" value={body} as="p" className="b-chapter-body" placeholder="Intro…" data-reveal />

        <ol ref={stackRef} className={'b-terrace-stack' + (settled ? ' is-settled' : '')}>
          {slabs.map((s, i) => (
            <li className="b-terrace-slab" style={{ '--i': i }} key={i}>
              <span className="b-terrace-n">{s.n}</span>
              <span className="b-terrace-h">{s.title}</span>
              <span className="b-terrace-d">{s.body}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export const css = `
.b-terrace-stack{display:flex;flex-direction:column;align-items:center;gap:12px;max-width:600px;margin:36px auto 0;list-style:none;padding:0}
.b-terrace-slab{width:min(100%, calc(70% + var(--i) * 15%));display:grid;grid-template-columns:auto 1fr;column-gap:18px;align-items:center;
  padding:16px 26px;text-align:left;border:1px solid var(--gs-border-strong);border-radius:14px;
  background:linear-gradient(180deg,rgba(200,255,0,.055),rgba(255,255,255,.015));
  clip-path:polygon(2.5% 0,100% 0,97.5% 100%,0 100%);
  transform:translateY(24px) scaleY(.94);transform-origin:bottom;
  transition:transform 720ms var(--gs-ease);transition-delay:calc(var(--i) * 130ms);will-change:transform}
.b-terrace-stack.is-settled .b-terrace-slab{transform:none}
.b-terrace-n{grid-row:1/3;font-weight:900;font-size:1.5rem;color:var(--gs-accent);letter-spacing:-.02em}
.b-terrace-h{font-weight:800;font-size:1.05rem;letter-spacing:-.01em}
.b-terrace-d{grid-column:2;font-size:.84rem;color:var(--gs-text-muted);line-height:1.45}
@media(max-width:600px){.b-terrace-slab{width:100%}}
@media(prefers-reduced-motion:reduce){.b-terrace-slab{transform:none !important}}
`;

export const puck = {
  label: 'Terrace (slab stack)',
  fields: {
    index: { type: 'text', label: 'Number', contentEditable: true },
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    headline: { type: 'custom', label: 'Headline', render: (props) => <RichTextField {...props} variant="heading" /> },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'custom', label: 'Intro', render: (props) => <RichTextField {...props} /> },
    slabs: {
      type: 'array', label: 'Slabs',
      arrayFields: {
        n: { type: 'text', label: 'Number' },
        title: { type: 'text', label: 'Title' },
        body: { type: 'text', label: 'Description' },
      },
      defaultItemProps: { n: '0', title: 'Step', body: 'What happens here.' },
      getItemSummary: (i) => i.title || 'Slab',
    },
  },
  defaultProps: {
    index: '06', eyebrow: 'How a Diagnostic Works',
    headline: 'Three moves to your', highlight: 'foundation.',
    body: 'No theatre, no twelve-week discovery. We diagnose, we report, we build, and each layer settles before the next one lands.',
    slabs: [
      { n: '01', title: 'Diagnostic', body: 'We map where the week goes, across all eight pillars.' },
      { n: '02', title: 'Periscope Report', body: 'A clear read of where you stand and the fastest gains.' },
      { n: '03', title: 'Phased Roadmap', body: 'The build, embedded into how you already work, not bolted on.' },
    ],
  },
  render: (props) => <Terrace {...props} />,
};

export default Terrace;
