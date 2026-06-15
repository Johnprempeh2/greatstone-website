import { useReveal } from './reveal.js';
import { MediaField } from '../cms/MediaField.jsx';

// A general image with an optional caption — the simplest "drop a real photo on the page"
// block. Image comes from the media library (URL or small upload); alt + caption are editable.
export function Figure({ image, alt, caption, width = 'standard' }) {
  const ref = useReveal();
  return (
    <section ref={ref} className={`b-figure width-${width}`}>
      <div className="wrap">
        <figure className="b-figure-inner" data-reveal>
          {image
            ? <img className="b-figure-img" src={image} alt={alt || ''} loading="lazy" />
            : <div className="b-figure-ph">Choose an image in the panel →</div>}
          {caption ? <figcaption className="b-figure-cap">{caption}</figcaption> : null}
        </figure>
      </div>
    </section>
  );
}

export const css = `
.b-figure{padding:clamp(28px,5vw,64px) 0}
.b-figure-inner{margin:0 auto;max-width:760px}
.b-figure.width-wide .b-figure-inner{max-width:1080px}
.b-figure-img{width:100%;height:auto;display:block;border-radius:16px;border:1px solid var(--gs-border-soft)}
.b-figure-ph{aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;border:1px dashed var(--gs-border);border-radius:16px;
  color:var(--gs-faint);font-size:.85rem;font-weight:600;background:var(--gs-card)}
.b-figure-cap{margin-top:12px;text-align:center;color:var(--gs-faint);font-size:.82rem;line-height:1.5}
`;

export const puck = {
  label: 'Image / figure',
  fields: {
    image: { type: 'custom', label: 'Image', render: (props) => <MediaField {...props} /> },
    alt: { type: 'text', label: 'Alt text (accessibility)' },
    caption: { type: 'text', label: 'Caption (optional)', contentEditable: true },
    width: { type: 'radio', label: 'Width', options: [
      { label: 'Standard', value: 'standard' }, { label: 'Wide', value: 'wide' },
    ]},
  },
  defaultProps: { image: '', alt: '', caption: '', width: 'standard' },
  render: (props) => <Figure {...props} />,
};

export default Figure;
