import { useReveal } from './reveal.js';
import { MediaField } from '../cms/MediaField.jsx';
import { safeHref } from '../lib/safe-url.js';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site
import { publicClientMarks } from './TwoDoors.jsx';

// LogoWall: a "trusted by" client-logo strip, the trust signal a skeptical buyer scans for near the
// top of the funnel. Deliberately content-safe: it ships with empty slots and renders nothing until an
// editor drops in real, permissioned logos (the company owns those relationships; we never fabricate a
// client mark). Each logo is an editable image + alt + optional link; image-less rows are filtered out
// so empty slots never show a broken glyph. Logos sit muted and lift to full strength on hover/focus.
const hideOnError = (e) => { e.currentTarget.style.display = 'none'; };

export function LogoWall({ id, puck, eyebrow, logos = [], mode = 'static' }) {
  // GRE-2585 approved the exact public marks already used by TwoDoors. An editor's
  // configured logos take precedence; marquee mode can reuse that approved set.
  const shown = logos.filter((l) => l && l.image);
  const marks = mode === 'marquee' && !shown.length
    ? publicClientMarks.map(({ name, image }) => ({ alt: name, image })) : shown;
  const marquee = mode === 'marquee' && marks.length > 1;
  const ref = useReveal([marks.length]);
  const editing = puck && puck.isEditing;
  // With no usable logos the eyebrow used to render alone, leaving a heading like "Organisations we
  // have supported" standing over nothing, which reads worse than an absent section and implies a list
  // that does not exist. Render nothing publicly; the editor still sees the block so logos can be added.
  if (!marks.length && !editing) return null;
  return (
    <section ref={ref} className={'b-logos' + (marquee ? ' b-logos-marquee' : '')}>
      <div className="wrap b-logos-wrap">
        {(eyebrow || editing) ? <EditableText editing={editing} id={id} field="eyebrow" value={eyebrow} as="p" className="b-logos-eyebrow" singleLine placeholder="Eyebrow…" data-reveal /> : null}
        {marks.length ? (
          <div className="b-logos-viewport" data-reveal tabIndex={marquee ? 0 : undefined} role={marquee ? 'group' : undefined} aria-label={marquee ? 'Approved public logos. Focus to pause movement.' : undefined}>
          <ul className="b-logos-row">
            {(marquee ? [...marks, ...marks] : marks).map((l, i) => {
              const img = <img src={l.image} alt={l.alt || ''} loading="lazy" decoding="async" onError={hideOnError} />;
              const href = safeHref(l.href || '');
              return (
                <li className={'b-logos-item' + (marquee && !shown.length && i % marks.length === marks.length - 1 ? ' b-logos-dark-mark' : '')} key={i} aria-hidden={marquee && i >= marks.length ? 'true' : undefined}>
                  {href && href !== '#'
                    ? <a href={href} target="_blank" rel="noopener noreferrer" tabIndex={marquee && i >= marks.length ? -1 : undefined} aria-label={l.alt || 'Client'}>{img}</a>
                    : img}
                </li>
              );
            })}
          </ul>
          </div>
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
.b-logos-viewport{overflow:hidden;margin-top:clamp(18px,3vw,30px)}
.b-logos-marquee .b-logos-row{width:max-content;flex-wrap:nowrap;justify-content:flex-start;gap:clamp(26px,5vw,60px);margin:0;animation:bLogoMarquee 40s linear infinite}
.b-logos-marquee .b-logos-item{flex:none;background:var(--gs-logo-surface);border-radius:4px}.b-logos-marquee .b-logos-item img{width:160px;height:76px;max-width:160px;object-fit:contain;padding:10px;opacity:1}.b-logos-marquee .b-logos-dark-mark img{filter:brightness(0)}
.b-logos-marquee .b-logos-viewport:hover .b-logos-row,.b-logos-marquee .b-logos-viewport:focus-within .b-logos-row{animation-play-state:paused}
@keyframes bLogoMarquee{to{transform:translateX(-50%)}}
@media(prefers-reduced-motion:reduce){.b-logos-marquee .b-logos-row{animation:none;flex-wrap:wrap;width:auto;justify-content:center}.b-logos-marquee .b-logos-item[aria-hidden="true"]{display:none}}
@media(prefers-reduced-motion:reduce){.b-logos-item img{transition:none}}
`;

const LOGO = (alt, image, href) => ({ alt, image, href });

export const puck = {
  label: 'Logo wall (trusted by)',
  fields: {
    eyebrow: { type: 'custom', label: 'Eyebrow', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    mode: { type: 'radio', label: 'Layout', options: [{ label: 'Static row', value: 'static' }, { label: 'Marquee (approved marks)', value: 'marquee' }] },
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
    eyebrow: '',
    mode: 'static',
    logos: [LOGO('', '', ''), LOGO('', '', ''), LOGO('', '', ''), LOGO('', '', '')],
  },
  render: (props) => <LogoWall {...props} />,
};

export default LogoWall;
