import { useReveal } from './reveal.js';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// ComparisonMatrix: turns the site's pervasive "we don't advise, we become your foundation" wedge into
// a scannable side-by-side a skeptical buyer reads in five seconds. A real <table> (tabular data, with
// proper column + row headers) carrying a good/bad token per cell, reusing the Spectrum dot vocabulary.
// On narrow screens it reflows to one card per criterion (each cell labelled from its column). Content
// is fully editable; the defaults only restate positioning the site already asserts in prose, and the
// "alternative" column stays a generic archetype, never a named competitor (no invented claims).
export function ComparisonMatrix({ id, puck, eyebrow, heading, highlight, colA = 'Greatstone', colB = 'The typical alternative', rows = [] }) {
  const ref = useReveal([rows.length]);
  const editing = puck && puck.isEditing;
  const qa = rows.filter((r) => r && r.dimension);
  return (
    <section ref={ref} className="b-cmp band-light gs-rhythm">
      <div className="wrap">
        {(eyebrow || heading || highlight || editing) ? (
          <div className="b-cmp-head" data-reveal>
            <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="span" className="kicker" singleLine placeholder="Eyebrow…" />
            {(heading || highlight || editing) ? <h2 className="h2 b-cmp-h"><EditableText editing={editing} id={id} field="heading" value={heading} as="span" singleLine placeholder="Heading…" /> {highlight ? <span className="accent">{highlight}</span> : null}</h2> : null}
          </div>
        ) : null}
        {qa.length ? (
          <div className="b-cmp-scroll" data-reveal>
            <table className="b-cmp-table">
              <thead>
                <tr>
                  <th scope="col"><span className="gs-sr-only">Criterion</span></th>
                  <th scope="col" className="b-cmp-us">{colA}</th>
                  <th scope="col">{colB}</th>
                </tr>
              </thead>
              <tbody>
                {qa.map((r, i) => {
                  const ri = rows.indexOf(r); // map filtered row back to its real index for nested writes
                  return (
                  <tr key={i}>
                    <th scope="row"><EditableText editing={editing} id={id} arrayField="rows" index={ri} field="dimension" value={r.dimension} as="span" singleLine placeholder="Criterion…" /></th>
                    <td className="b-cmp-cell b-cmp-us" data-label={colA}><span className="b-cmp-dot good" aria-hidden="true" /><EditableText editing={editing} id={id} arrayField="rows" index={ri} field="a" value={r.a} as="span" placeholder="Your column…" /></td>
                    <td className="b-cmp-cell" data-label={colB}><span className="b-cmp-dot bad" aria-hidden="true" /><EditableText editing={editing} id={id} arrayField="rows" index={ri} field="b" value={r.b} as="span" placeholder="Alternative…" /></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export const css = `
.b-cmp{padding:clamp(56px,9vw,110px) 0;position:relative}
.b-cmp-head{margin-bottom:clamp(22px,4vw,40px);max-width:60ch}
.b-cmp-h{font-size:clamp(2rem,4.5vw,3.6rem);font-weight:900;letter-spacing:-.025em;line-height:1.05;margin-top:.4em}
.b-cmp-scroll{overflow-x:auto}
.b-cmp-table{width:100%;border-collapse:collapse;min-width:520px}
.b-cmp-table th,.b-cmp-table td{text-align:left;padding:clamp(12px,1.6vw,18px);vertical-align:top;border-bottom:1px solid var(--gs-border-soft)}
.b-cmp-table thead th{font-size:.82rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gs-text-faint);border-bottom:1px solid var(--gs-border)}
.b-cmp-table tbody th[scope="row"]{font-weight:700;color:var(--gs-text);font-size:.96rem;width:26%;overflow-wrap:anywhere}
.b-cmp-cell{font-size:.92rem;color:var(--gs-text-muted);line-height:1.5;overflow-wrap:anywhere}
.b-cmp-us{background:var(--gs-accent-soft)}
.b-cmp-table thead th.b-cmp-us{color:var(--gs-accent)}
.b-cmp-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:9px;vertical-align:baseline}
.b-cmp-dot.good{background:var(--gs-accent);box-shadow:0 0 12px var(--gs-accent-glow)}
.b-cmp-dot.bad{background:var(--gs-text-faint)}
.b-cmp-table tbody tr:last-child th,.b-cmp-table tbody tr:last-child td{border-bottom:0}
.b-cmp.band-light .b-cmp-h,.b-cmp.band-light .b-cmp-table tbody th[scope="row"]{color:var(--gs-text)}
.b-cmp.band-light .b-cmp-cell,.b-cmp.band-light .b-cmp-table thead th{color:var(--gs-text-muted)}
.b-cmp.band-light .b-cmp-table thead th.b-cmp-us{color:var(--gs-emerald)}
.b-cmp.band-light .b-cmp-us{background:var(--gs-emerald-wash)}
.b-cmp.band-light .b-cmp-dot.good{background:var(--gs-emerald);box-shadow:none}
@media(max-width:620px){
  .b-cmp-table,.b-cmp-table tbody,.b-cmp-table tr,.b-cmp-table th,.b-cmp-table td{display:block;width:auto}
  .b-cmp-table{min-width:0}
  .b-cmp-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .b-cmp-table tbody tr{border:1px solid var(--gs-border-soft);border-radius:14px;background:var(--gs-card);padding:4px 16px 14px;margin-bottom:12px}
  .b-cmp-table tbody th[scope="row"]{width:auto;font-size:1.05rem;padding:14px 0 8px;border-bottom:1px solid var(--gs-border-soft)}
  .b-cmp-cell{padding:12px 0 0;border-bottom:0}
  .b-cmp-cell::before{content:attr(data-label);display:block;font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gs-text-faint);margin-bottom:3px}
  .b-cmp-us{background:none}
  .b-cmp-cell.b-cmp-us::before{color:var(--gs-accent)}
}
`;

const ROW = (dimension, a, b) => ({ dimension, a, b });

export const puck = {
  label: 'Comparison matrix (us vs the alternative)',
  fields: {
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    heading: { type: 'custom', label: 'Heading', render: (props) => <RichTextField {...props} variant="heading" /> },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    colA: { type: 'text', label: 'Your column label' },
    colB: { type: 'text', label: 'Alternative column label (keep generic, no named competitors)' },
    rows: {
      type: 'array', label: 'Rows',
      arrayFields: {
        dimension: { type: 'custom', label: 'Criterion', render: (props) => <RichTextField {...props} variant="heading" /> },
        a: { type: 'custom', label: 'Your column', render: (props) => <RichTextField {...props} /> },
        b: { type: 'custom', label: 'Alternative column', render: (props) => <RichTextField {...props} /> },
      },
      defaultItemProps: { dimension: 'Criterion', a: 'What we do', b: 'What they do' },
      getItemSummary: (it) => it.dimension || 'Row',
    },
  },
  defaultProps: {
    eyebrow: 'The Difference',
    heading: 'Not a deck.', highlight: 'A foundation.',
    colA: 'Greatstone', colB: 'The typical alternative',
    rows: [
      ROW('What you walk away with', 'A working system, built into how you already run.', 'A slide deck and recommendations to action yourself.'),
      ROW('Where we work', 'Embedded inside your business, shoulder-to-shoulder.', 'From the outside, at arm’s length.'),
      ROW('After go-live', 'We stay until the new way is the only way.', 'Handover, then gone.'),
      ROW('What we optimise for', 'Hours your business gets back, week after week.', 'Scope delivered, hours billed.'),
      ROW('On AI', 'Transformation first; AI only where it pays back.', 'AI-first: a tool hunting for a problem.'),
    ],
  },
  render: (props) => <ComparisonMatrix {...props} />,
};

export default ComparisonMatrix;
