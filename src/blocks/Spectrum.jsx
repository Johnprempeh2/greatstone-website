import { useReveal } from './reveal.js';

// The "start with the problem, then pick the tool" band: a tinted full-spectrum strip with a
// short statement on one side and the spectrum of options on the other. Problem first, tool second.
export function Spectrum({ kicker, headline, highlight, body, coda, items = [] }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="b-spectrum">
      <div className="wrap">
        <div className="grid cols-2 b-spectrum-grid">
          <div data-reveal>
            {kicker ? <span className="kicker">{kicker}</span> : null}
            <h2 className="h2 b-spectrum-head">{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
          </div>
          <div data-reveal>
            {body ? <p className="lead">{body}</p> : null}
            <ul className="b-spectrum-list">
              {items.map((it, i) => (
                <li key={i}><b>{it.title}</b>{it.text ? <> {it.text}</> : null}</li>
              ))}
            </ul>
            {coda ? <p className="b-spectrum-coda">{coda}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-spectrum{padding:clamp(64px,11vw,140px) 0;position:relative;background:linear-gradient(180deg,transparent,var(--gs-accent-soft),transparent)}
.b-spectrum-grid{align-items:center}
.b-spectrum-head{max-width:14ch;font-weight:900;letter-spacing:-.03em}
.b-spectrum-list{list-style:none;margin-top:18px;display:grid;gap:14px}
.b-spectrum-list li{position:relative;padding-left:22px;color:var(--gs-muted);font-size:1rem;line-height:1.6}
.b-spectrum-list li::before{content:"";position:absolute;left:0;top:.62em;width:9px;height:9px;border-radius:2px;background:var(--gs-accent)}
.b-spectrum-list li b{color:var(--gs-text);font-weight:700}
.b-spectrum-coda{margin-top:18px;font-weight:800;color:var(--gs-text)}
`;

const S = (title, text) => ({ title, text });

export const puck = {
  label: 'Spectrum band',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    coda: { type: 'textarea', label: 'Coda (optional)', contentEditable: true },
    items: {
      type: 'array', label: 'Spectrum',
      arrayFields: { title: { type: 'text', label: 'Term' }, text: { type: 'text', label: 'Note' } },
      defaultItemProps: { title: 'Option', text: 'when it fits.' },
      getItemSummary: (item) => item.title || 'Item',
    },
  },
  defaultProps: {
    kicker: 'Full-spectrum DX',
    headline: 'Start with the problem. Then pick the', highlight: 'tool.',
    body: 'When all you sell is a hammer, everything looks like a nail. We work the other way round: diagnose what is costing you hours, then choose only what fits.',
    coda: 'Sometimes the right answer isn’t AI at all. We’ll tell you.',
    items: [
      S('AI', 'where it reasons better than a rule.'),
      S('Automation', 'for the repetitive and the predictable.'),
      S('Integration', 'so your tools finally talk.'),
      S('A better process', 'when that is all it takes.'),
    ],
  },
  render: (props) => <Spectrum {...props} />,
};

export default Spectrum;
