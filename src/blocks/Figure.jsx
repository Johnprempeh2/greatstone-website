import { useReveal } from './reveal.js';
import { MediaField } from '../cms/MediaField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// A general image with an optional caption — the simplest "drop a real photo on the page"
// block. Image comes from the media library (URL or small upload); alt + caption are editable.
const hideOnError = (e) => { e.currentTarget.style.display = 'none'; };

export function Figure({ id, puck, image, alt, caption, width = 'standard', aspect = '16:9' }) {
  const ref = useReveal();
  const editing = puck && puck.isEditing;
  // reserve the image box up-front (aspect-ratio + cover) so it never shifts layout as it loads;
  // 'auto' keeps the intrinsic ratio (no reservation) for editors who want true height.
  const imgStyle = aspect && aspect !== 'auto' ? { aspectRatio: aspect.replace(':', ' / '), objectFit: 'cover' } : undefined;
  return (
    <section ref={ref} className={`b-figure width-${width}`}>
      <div className="wrap">
        <figure className="b-figure-inner" data-reveal>
          {/* The empty state is an instruction to the EDITOR, so it must never reach a visitor. A published
              page with an unset image used to show "Choose an image in the panel" to prospective clients. */}
          {image
            ? <img className="b-figure-img" src={image} alt={alt || ''} loading="lazy" decoding="async" style={imgStyle} onError={hideOnError} />
            : editing ? <div className="b-figure-ph">Choose an image in the panel →</div> : null}
          <EditableText editing={editing} id={id} field="caption" value={caption} as="figcaption" className="b-figure-cap" placeholder="Caption (optional)…" />
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
    caption: { type: 'custom', label: 'Caption (optional)', render: (props) => <RichTextField {...props} /> },
    width: { type: 'radio', label: 'Width', options: [
      { label: 'Standard', value: 'standard' }, { label: 'Wide', value: 'wide' },
    ]},
    aspect: { type: 'select', label: 'Aspect ratio (reserves space)', options: [
      { label: '16:9', value: '16:9' }, { label: '3:2', value: '3:2' }, { label: '4:3', value: '4:3' },
      { label: '1:1', value: '1:1' }, { label: 'Auto (intrinsic)', value: 'auto' },
    ]},
  },
  defaultProps: { image: '', alt: '', caption: '', width: 'standard', aspect: '16:9' },
  render: (props) => <Figure {...props} />,
};

export default Figure;
