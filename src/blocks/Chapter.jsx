import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeHref } from '../lib/safe-url.js';

// The editorial "chapter" section the live homepage leans on: a numbered eyebrow, a big
// honest headline, a paragraph, an optional accent coda line, and an optional ghost CTA
// (e.g. home §03 "Explore the eight pillars" → method). Reused for several chapters.
export function Chapter({ index, eyebrow, headline, highlight, body, coda, align = 'left', ctaLabel, ctaHref = '#' }) {
  const ref = useReveal();
  return (
    <section ref={ref} className={`b-chapter align-${align}`}>
      <div className="wrap b-chapter-inner">
        <div className="b-chapter-eyebrow" data-reveal>
          {index ? <span className="b-chapter-num">{index}</span> : null}
          {eyebrow ? <span className="b-chapter-name">{eyebrow}</span> : null}
        </div>
        <h2 data-reveal>{headline} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
        {body ? <p className="b-chapter-body" data-reveal>{body}</p> : null}
        {coda ? <p className="b-chapter-coda" data-reveal>{coda}</p> : null}
        {ctaLabel ? <a className="b-cta ghost b-chapter-cta" href={safeHref(ctaHref)} data-reveal>{ctaLabel}<Arrow /></a> : null}
      </div>
    </section>
  );
}

export const css = `
.b-chapter{padding:clamp(72px,13vh,150px) 0;position:relative}
.b-chapter.align-center{text-align:center}
.b-chapter-inner{max-width:760px}
.b-chapter.align-center .b-chapter-inner{margin-inline:auto}
.b-chapter-eyebrow{display:inline-flex;align-items:center;gap:14px;margin-bottom:22px}
.b-chapter.align-center .b-chapter-eyebrow{justify-content:center}
.b-chapter-num{font-size:.86rem;font-weight:900;color:var(--gs-accent);font-variant-numeric:tabular-nums}
.b-chapter-name{position:relative;padding-left:14px;font-size:.72rem;font-weight:800;letter-spacing:.26em;
  text-transform:uppercase;color:var(--gs-faint)}
.b-chapter-name::before{content:"";position:absolute;left:0;top:50%;width:1px;height:13px;transform:translateY(-50%);
  background:var(--gs-border-soft)}
.b-chapter h2{font-size:clamp(1.9rem,4.6vw,3.3rem);font-weight:900;line-height:1.03;letter-spacing:-.03em}
.b-chapter-body{margin-top:24px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.2rem);max-width:62ch;line-height:1.7}
.b-chapter.align-center .b-chapter-body{margin-inline:auto}
.b-chapter-coda{margin-top:22px;font-size:clamp(1rem,1.6vw,1.24rem);font-weight:800;color:var(--gs-text);letter-spacing:-.01em}
.b-chapter-coda::first-line{color:var(--gs-accent)}
.b-chapter-cta{margin-top:28px;display:inline-flex}
.b-chapter.align-center .b-chapter-cta{margin-inline:auto}
`;

export const puck = {
  label: 'Chapter',
  fields: {
    index: { type: 'text', label: 'Number', contentEditable: true },
    eyebrow: { type: 'text', label: 'Eyebrow', contentEditable: true },
    headline: { type: 'text', label: 'Headline', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'textarea', label: 'Body', contentEditable: true },
    coda: { type: 'textarea', label: 'Coda line (optional)', contentEditable: true },
    align: { type: 'radio', label: 'Alignment', options: [
      { label: 'Left', value: 'left' }, { label: 'Centre', value: 'center' },
    ]},
    ctaLabel: { type: 'text', label: 'Ghost button label (optional)' },
    ctaHref: { type: 'text', label: 'Ghost button link' },
  },
  defaultProps: {
    index: '01', eyebrow: 'Twenty Years Deep',
    headline: 'A transformation partner.', highlight: 'Not a software house.',
    body: 'For two decades our team has modernised how organisations actually work (their tools, their processes, their people), and now the intelligent layer above them all.',
    coda: 'Digital transformation first. AI as the accelerator.',
    align: 'left', ctaLabel: '', ctaHref: '#',
  },
  render: (props) => <Chapter {...props} />,
};

export default Chapter;
