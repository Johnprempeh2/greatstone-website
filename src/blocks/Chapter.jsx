import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { resolveLink } from '../lib/link-resolver.mjs';
import { LinkField } from '../cms/LinkField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site
import { APPEARANCE_FIELD, APPEARANCE_DEFAULT, CTA_STYLE_FIELD, CTA_STYLE_DEFAULT, HEADING_LEVEL_FIELD } from '../cms/style-field.jsx';
import { appearanceClass } from '../lib/block-style.mjs';
import { ctaStyleClass } from '../lib/cta-style.mjs';
import { headingTag } from '../lib/heading-level.mjs';

// The editorial "chapter" section the live homepage leans on: a numbered eyebrow, a big
// honest headline, a paragraph, an optional accent coda line, and an optional ghost CTA
// (e.g. home §03 "Explore the eight pillars" → method). Reused for several chapters.
export function Chapter({ id, puck, index, eyebrow, headline, highlight, body, coda, align = 'left', ctaLabel, ctaHref = '#', ctaVariant = 'ghost', ctaStyle, headingLevel, appearance }) {
  const ref = useReveal();
  const HeadTag = headingTag(headingLevel);
  const editing = puck && puck.isEditing;
  return (
    <section ref={ref} className={`b-chapter align-${align}`}>
      <div className={('wrap b-chapter-inner ' + appearanceClass(appearance)).trim()}>
        <div className="b-chapter-eyebrow" data-reveal>
          {index ? <span className="b-chapter-num">{index}</span> : null}
          <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="span" className="b-chapter-name" singleLine placeholder="Eyebrow…" />
        </div>
        <HeadTag className="b-chapter-h" data-reveal><EditableText editing={editing} id={id} field="headline" value={headline} as="span" singleLine placeholder="Headline…" /> {highlight ? <span className="accent">{highlight}</span> : null}</HeadTag>
        <EditableText editing={editing} id={id} field="body" value={body} as="p" className="b-chapter-body" placeholder="Body…" data-reveal />
        <EditableText editing={editing} id={id} field="coda" value={coda} as="p" className="b-chapter-coda" placeholder="Coda line (optional)…" data-reveal />
        {ctaLabel ? <a className={('b-cta b-chapter-cta' + (ctaVariant === 'primary' ? '' : ' ghost') + ' ' + ctaStyleClass(ctaStyle)).trim()} {...resolveLink(ctaHref)} data-reveal>{ctaLabel}<Arrow /></a> : null}
      </div>
    </section>
  );
}

export const css = `
.b-chapter{padding:clamp(72px,13vh,150px) 0;position:relative}
.b-chapter.align-center{text-align:center}
/* copy sits over the 3D stone; a soft radial scrim + text-shadow keep it legible without a visible box
   (faithful to the live .panel-inner::before — full scroll-pinning is intentionally not ported) */
.b-chapter-inner{max-width:760px;position:relative;text-shadow:0 1px 22px rgba(8,10,9,.85),0 0 50px rgba(8,10,9,.5)}
.b-chapter-inner::before{content:"";position:absolute;z-index:-1;inset:-14% -16%;pointer-events:none;filter:blur(22px);
  background:radial-gradient(ellipse 62% 58% at 50% 50%,rgba(9,12,10,.66),rgba(9,12,10,.34) 52%,transparent 76%)}
.b-chapter.align-center .b-chapter-inner{margin-inline:auto}
.b-chapter-eyebrow{display:inline-flex;align-items:center;gap:14px;margin-bottom:22px}
.b-chapter.align-center .b-chapter-eyebrow{justify-content:center}
.b-chapter-num{font-size:.86rem;font-weight:900;color:var(--gs-accent);font-variant-numeric:tabular-nums}
.b-chapter-name{position:relative;padding-left:14px;font-size:.72rem;font-weight:800;letter-spacing:.26em;
  text-transform:uppercase;color:var(--gs-faint)}
.b-chapter-name::before{content:"";position:absolute;left:0;top:50%;width:1px;height:13px;transform:translateY(-50%);
  background:var(--gs-border-soft)}
.b-chapter .b-chapter-h{font-size:clamp(2rem,4.5vw,3.6rem);font-weight:900;line-height:1.05;letter-spacing:-.025em}
.b-chapter-body{margin-top:24px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.2rem);max-width:62ch;line-height:1.7}
.b-chapter.align-center .b-chapter-body{margin-inline:auto}
/* coda is just a follow-on body paragraph (the live .ch-copy is one muted block, no lime callout) */
.b-chapter-coda{margin-top:14px;color:var(--gs-muted);font-size:clamp(1.02rem,1.5vw,1.2rem);max-width:62ch;line-height:1.7}
.b-chapter.align-center .b-chapter-coda{margin-inline:auto}
/* subtle inline emphasis, faithful to live .ch-copy strong: brighter text + weight 700, never lime */
.b-chapter-body strong,.b-chapter-coda strong{color:var(--gs-text);font-weight:700}
.b-chapter-cta{margin-top:28px;display:inline-flex}
.b-chapter.align-center .b-chapter-cta{margin-inline:auto}
`;

export const puck = {
  label: 'Chapter',
  fields: {
    index: { type: 'text', label: 'Number', contentEditable: true },
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    headline: { type: 'custom', label: 'Headline', render: (props) => <RichTextField {...props} variant="heading" /> },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    body: { type: 'custom', label: 'Body', render: (props) => <RichTextField {...props} /> },
    coda: { type: 'custom', label: 'Coda line (optional)', render: (props) => <RichTextField {...props} /> },
    align: { type: 'radio', label: 'Alignment', options: [
      { label: 'Left', value: 'left' }, { label: 'Centre', value: 'center' },
    ]},
    ctaLabel: { type: 'text', label: 'Button label (optional)' },
    ctaHref: { type: 'custom', label: 'Button link', render: (props) => <LinkField {...props} /> },
    ctaVariant: { type: 'radio', label: 'Button fill', options: [
      { label: 'Ghost', value: 'ghost' }, { label: 'Primary (solid)', value: 'primary' },
    ]},
    ctaStyle: CTA_STYLE_FIELD,
    headingLevel: HEADING_LEVEL_FIELD,
    appearance: APPEARANCE_FIELD,
  },
  defaultProps: {
    index: '01', eyebrow: 'Twenty Years Deep',
    headline: 'A transformation partner.', highlight: 'Not a software house.',
    body: 'For two decades our team has modernised how organisations actually work (their tools, their processes, their people), and now the intelligent layer above them all.',
    coda: 'Digital transformation first. AI as the accelerator.',
    align: 'left', ctaLabel: '', ctaHref: '#', ctaVariant: 'ghost', ctaStyle: CTA_STYLE_DEFAULT,
    headingLevel: 'h2', appearance: APPEARANCE_DEFAULT,
  },
  render: (props) => <Chapter {...props} />,
};

export default Chapter;
