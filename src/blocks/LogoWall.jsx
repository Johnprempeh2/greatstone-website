import { useReveal } from './reveal.js';
import { MediaField } from '../cms/MediaField.jsx';
import { safeHref } from '../lib/safe-url.js';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// LogoWall: a "trusted by" client-logo strip, the trust signal a skeptical buyer scans for near the
// top of the funnel. Deliberately content-safe: it ships with empty slots and renders nothing until an
// editor drops in real, permissioned logos (the company owns those relationships; we never fabricate a
// client mark). Each logo is an editable image + alt + optional link; image-less rows are filtered out
// so empty slots never show a broken glyph. Logos sit muted and lift to full strength on hover/focus.
const hideOnError = (e) => { e.currentTarget.style.display = 'none'; };

export function LogoWall({ id, puck, eyebrow, logos = [] }) {
  const shown = logos.filter((l) => l && l.image);
  const ref = useReveal([shown.length]);
  const editing = puck && puck.isEditing;
  return (
    <section ref={ref} className="b-logos">
      <div className="wrap b-logos-wrap">
        <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="p" className="b-logos-eyebrow" singleLine placeholder="Eyebrow…" data-reveal />
        {shown.length ? (
          <ul className="b-logos-row" data-reveal>
            {shown.map((l, i) => {
              const img = <img src={l.image} alt={l.alt || ''} loading="lazy" decoding="async" onError={hideOnError} />;
              const href = safeHref(l.href || '');
              return (
                <li className="b-logos-item" key={i}>
                  {href && href !== '#'
                    ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={l.alt || 'Client'}>{img}</a>
                    : img}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export const css = `
.b-logos{padding:clamp(36px,6vw,72px) 0;position:relative}
.b-logos-wrap{text-align:center}
.b-logos-eyebrow{font-size:.78rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gs-text-faint)}
.b-logos-row{list-style:none;margin:clamp(18px,3vw,30px) 0 0;padding:0;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:clamp(26px,5vw,60px)}
.b-logos-item{display:inline-flex;align-items:center}
.b-logos-item img{height:clamp(24px,3.2vw,36px);width:auto;max-width:160px;object-fit:contain;display:block;opacity:.65;transition:opacity .3s var(--gs-ease)}
.b-logos-item a{display:inline-flex;align-items:center}
.b-logos-item a:hover img,.b-logos-item a:focus-visible img{opacity:1}
@media(prefers-reduced-motion:reduce){.b-logos-item img{transition:none}}
`;

const LOGO = (alt, image, href) => ({ alt, image, href });

export const puck = {
  label: 'Logo wall (trusted by)',
  fields: {
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    logos: {
      type: 'array', label: 'Logos (add real, permissioned client marks)',
      arrayFields: {
        image: { type: 'custom', label: 'Logo image', render: (props) => <MediaField {...props} /> },
        alt: { type: 'text', label: 'Company name (alt text)' },
        href: { type: 'text', label: 'Link (optional)' },
      },
      defaultItemProps: { alt: '', image: '', href: '' },
      getItemSummary: (item) => item.alt || 'Logo',
    },
  },
  defaultProps: {
    eyebrow: 'Trusted by teams at',
    logos: [LOGO('', '', ''), LOGO('', '', ''), LOGO('', '', ''), LOGO('', '', '')],
  },
  render: (props) => <LogoWall {...props} />,
};

export default LogoWall;
