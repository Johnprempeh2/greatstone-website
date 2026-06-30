import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { resolveLink } from '../lib/link-resolver.mjs';
import { LinkField } from '../cms/LinkField.jsx';
import { MediaField } from '../cms/MediaField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import RichText from './RichText.jsx';
import { ctaStyleClass } from '../lib/cta-style.mjs';

// Columns: the missing layout primitive — place 2 to 4 things SIDE BY SIDE (media one side, copy the other;
// two text columns; a row of cards). Each column is a fixed, typed set of parts (image, sub-heading, rich
// body, optional button), so it needs NO change to the deliberately-flat public render path and no Puck
// nested slot/zone. Composes the existing sanitised primitives: RichText (the inline-sanitised body), the
// media library, and the safe link resolver. Stacks to a single column on mobile.
const hideOnError = (e) => { e.currentTarget.style.display = 'none'; };

export function Columns({ columns = [], valign = 'top', ctaStyle }) {
  const ref = useReveal([columns.length]);
  const n = Math.max(1, Math.min(4, columns.length || 1));
  return (
    <section ref={ref} className={'b-cols valign-' + valign}>
      <div className="wrap">
        <div className="b-cols-grid" style={{ '--cols': n }} data-reveal>
          {columns.map((c, i) => (
            <div className="b-col" key={i}>
              {c.image
                ? <img className="b-col-img" src={c.image} alt={c.alt || ''} loading="lazy" decoding="async" onError={hideOnError} />
                : null}
              {c.heading ? <h3 className="b-col-h">{c.heading}</h3> : null}
              {c.body ? <RichText as="div" className="b-col-body" html={c.body} /> : null}
              {c.ctaLabel ? <a className={('b-cta ghost b-col-cta ' + ctaStyleClass(ctaStyle)).trim()} {...resolveLink(c.ctaHref || '#')}>{c.ctaLabel}<Arrow /></a> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export const css = `
.b-cols{padding:clamp(40px,7vw,96px) 0}
.b-cols-grid{display:grid;grid-template-columns:repeat(var(--cols,2),minmax(0,1fr));gap:clamp(24px,3.5vw,48px)}
.b-cols.valign-center .b-cols-grid{align-items:center}
.b-col{min-width:0}
.b-col-img{width:100%;height:auto;display:block;border-radius:14px;border:1px solid var(--gs-border-soft);margin-bottom:18px}
.b-col-h{font-size:clamp(1.2rem,2vw,1.55rem);font-weight:800;letter-spacing:-.015em;line-height:1.2;margin-bottom:10px;color:var(--gs-text)}
.b-col-body{color:var(--gs-muted);font-size:1.02rem;line-height:1.7}
.b-col-body strong{color:var(--gs-text);font-weight:700}
.b-col-cta{margin-top:18px}
@media(max-width:760px){.b-cols-grid{grid-template-columns:1fr;gap:clamp(28px,7vw,40px)}}
`;

export const puck = {
  label: 'Columns (side by side)',
  fields: {
    columns: {
      type: 'array', label: 'Columns',
      arrayFields: {
        image: { type: 'custom', label: 'Image (optional)', render: (props) => <MediaField {...props} /> },
        alt: { type: 'text', label: 'Image alt text' },
        heading: { type: 'text', label: 'Sub-heading (optional)' },
        body: { type: 'custom', label: 'Body', render: (props) => <RichTextField {...props} /> },
        ctaLabel: { type: 'text', label: 'Button label (optional)' },
        ctaHref: { type: 'custom', label: 'Button link', render: (props) => <LinkField {...props} /> },
      },
      defaultItemProps: { image: '', alt: '', heading: 'Column heading', body: 'What this column is about.', ctaLabel: '', ctaHref: '#' },
      getItemSummary: (it, i) => it.heading || ('Column ' + (i + 1)),
      max: 4,
    },
    valign: { type: 'radio', label: 'Vertical align', options: [
      { label: 'Top', value: 'top' }, { label: 'Centre', value: 'center' },
    ]},
  },
  defaultProps: {
    valign: 'top',
    columns: [
      { image: '', alt: '', heading: 'Built for the work', body: 'We learn your rules, then build the system to match the business. **Never** the other way around.', ctaLabel: '', ctaHref: '#' },
      { image: '', alt: '', heading: 'Embedded, not advisory', body: 'Shoulder to shoulder with the people who run it. No reports that gather dust.', ctaLabel: '', ctaHref: '#' },
    ],
  },
  render: (props) => <Columns {...props} />,
};

export default Columns;
