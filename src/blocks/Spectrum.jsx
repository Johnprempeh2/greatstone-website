import { useReveal } from './reveal.js';

// services.html's "Start with the problem, then pick the tool" band: a tinted full-spectrum strip.
// LEFT = the statement (kicker + headline + lead + a muted aside). RIGHT = a bordered glass
// .tool-figure listing tool-first (one grey "bad" row) vs problem-first (lime "good" rows), each with
// a term + a right-aligned note, closing on a caption. Faithful port of .spectrum / .tool-figure.
export function Spectrum({ kicker, headline, highlight, body, coda, rows = [], caption }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="b-spectrum">
      <div className="wrap">
        <div className="grid cols-2 b-spectrum-grid">
          <div data-reveal>
            {kicker ? <span className="kicker">{kicker}</span> : null}
            <h2 className="h2 b-spectrum-head">{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
            {body ? <p className="lead b-spectrum-lead">{body}</p> : null}
            {coda ? <p className="b-spectrum-coda">{coda}</p> : null}
          </div>

          <div className="b-spectrum-figure" role="group" data-reveal aria-label="Tool selection driven by the problem, not the product">
            {rows.map((r, i) => (
              <div className="b-spectrum-row" key={i}>
                <span className={'b-spectrum-dot ' + (r.tone === 'bad' ? 'bad' : 'good')} aria-hidden="true" />
                <strong>{r.term}</strong>
                {r.meta ? <span className="b-spectrum-meta">{r.meta}</span> : null}
              </div>
            ))}
            {caption ? <p className="b-spectrum-cap">{caption}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-spectrum{padding:clamp(64px,11vw,140px) 0;position:relative;background:linear-gradient(180deg,transparent,var(--gs-accent-soft),transparent)}
.b-spectrum-grid{align-items:center}
.b-spectrum-head{max-width:14ch;font-weight:900;letter-spacing:-.03em;margin:.4em 0 .6em}
.b-spectrum-coda{margin-top:1.2em;color:var(--gs-text-muted);line-height:1.7}
.b-spectrum-figure{border:1px solid var(--gs-border-soft);border-radius:18px;padding:clamp(22px,2.6vw,34px);background:var(--gs-card);backdrop-filter:blur(8px)}
.b-spectrum-row{display:flex;align-items:center;gap:14px;padding:.85em 0;border-bottom:1px solid var(--gs-border-soft)}
.b-spectrum-row:last-of-type{border-bottom:0}
.b-spectrum-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
.b-spectrum-dot.bad{background:var(--gs-text-faint)}
.b-spectrum-dot.good{background:var(--gs-accent);box-shadow:0 0 12px var(--gs-accent-glow)}
.b-spectrum-row strong{font-weight:700}
.b-spectrum-meta{font-size:.84rem;color:var(--gs-text-muted);margin-left:auto;text-align:right}
.b-spectrum-cap{font-size:.78rem;color:var(--gs-text-faint);margin-top:14px}
@media(max-width:900px){.b-spectrum-figure{margin-top:8px}}
@media(max-width:480px){.b-spectrum-row{flex-wrap:wrap}.b-spectrum-meta{margin-left:0;text-align:left;width:100%}}
`;

const R = (tone, term, meta) => ({ tone, term, meta });

export const puck = {
  label: 'Spectrum band',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Lead', contentEditable: true },
    coda: { type: 'textarea', label: 'Aside (muted, optional)', contentEditable: true },
    rows: {
      type: 'array', label: 'Tool-figure rows',
      arrayFields: {
        tone: { type: 'radio', label: 'Dot', options: [{ label: 'Good (lime)', value: 'good' }, { label: 'Bad (grey)', value: 'bad' }] },
        term: { type: 'text', label: 'Term' },
        meta: { type: 'text', label: 'Note' },
      },
      defaultItemProps: { tone: 'good', term: 'Option', meta: 'when it fits' },
      getItemSummary: (i) => i.term || 'Row',
    },
    caption: { type: 'text', label: 'Caption' },
  },
  defaultProps: {
    kicker: 'Full-spectrum DX',
    headline: 'Start with the problem. Then pick the', highlight: 'tool.',
    body: 'When all you sell is a hammer, everything looks like a nail. That’s why most AI spend never pays back: the tool came first, the problem second. We work the other way round. We diagnose what’s actually costing you hours, then choose from the full spectrum (AI, automation, integration, or simply a better process) and use only what fits.',
    coda: 'Sometimes the right answer isn’t AI at all. We’ll tell you. We leave no stone unturned, and we don’t sell you stone you don’t need.',
    rows: [
      R('bad', 'Tool-first', 'AI everywhere → little payback'),
      R('good', 'Problem-first', 'Right tool → hours returned'),
      R('good', 'AI', 'where judgement scales'),
      R('good', 'Automation', 'where work repeats'),
      R('good', 'Integration', 'where tools should talk'),
      R('good', 'Better process', 'where no tech is needed'),
    ],
    caption: 'The diagnosis chooses the tool: never the other way round.',
  },
  render: (props) => <Spectrum {...props} />,
};

export default Spectrum;
