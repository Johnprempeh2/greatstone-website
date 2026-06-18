import { useReveal } from './reveal.js';

// A pull-quote: a single human line, lime quote marks, attribution. Lets a page close on a
// person's words instead of another CTA.
export function Quote({ text, attr, align = 'center' }) {
  const ref = useReveal();
  return (
    <section ref={ref} className={`b-quote align-${align}`}>
      <div className="wrap quote-wrap">
        <blockquote className="quote" data-reveal><span className="mark" aria-hidden="true">“</span>{text}<span className="mark" aria-hidden="true">”</span></blockquote>
        {attr ? <cite className="quote-attr" data-reveal>{attr}</cite> : null}
      </div>
    </section>
  );
}

export const css = `
.b-quote{padding:clamp(56px,9vw,120px) 0;position:relative}
.b-quote.align-center{text-align:center}
.b-quote .quote{font-weight:800;font-size:clamp(1.6rem,3.6vw,3rem);line-height:1.18;letter-spacing:-.02em;max-width:22ch}
.b-quote.align-center .quote{margin-inline:auto}
.b-quote .quote .mark{color:var(--gs-accent);font-size:1.1em;line-height:0}
.b-quote .quote-attr{display:block;margin-top:28px;font-size:.86rem;font-weight:700;font-style:normal;letter-spacing:.08em;text-transform:uppercase;color:var(--gs-muted)}
`;

export const puck = {
  label: 'Quote',
  fields: {
    text: { type: 'textarea', label: 'Quote', contentEditable: true },
    attr: { type: 'text', label: 'Attribution', contentEditable: true },
    align: { type: 'radio', label: 'Alignment', options: [{ label: 'Centre', value: 'center' }, { label: 'Left', value: 'left' }] },
  },
  defaultProps: {
    text: 'They didn’t hand us a deck and leave. They moved in, found the hours we were losing, and gave them back.',
    attr: 'Operations Director, national real-estate group', align: 'center',
  },
  render: (props) => <Quote {...props} />,
};

export default Quote;
