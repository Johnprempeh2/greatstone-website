import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { MediaField } from '../cms/MediaField.jsx';
import { resolveLink } from '../lib/link-resolver.mjs';
import { LinkField } from '../cms/LinkField.jsx';
import { RichTextField } from '../cms/RichTextField.jsx';
import EditableText from './EditableText.jsx'; // inline-on-canvas edit while editing, static RichText on the public site

// The insights hero post: a two-up card. A real hero image if one is set, otherwise the
// stone-echo media panel (giant glyph + ridges + corner wave). Editable meta + read time.
const hideOnError = (e) => { e.currentTarget.style.display = 'none'; };

export function FeaturedArticle({ id, puck, label, title, excerpt, meta, glyph = 'G', readTime, image, alt, ctaLabel, ctaHref = '#' }) {
  const ref = useReveal();
  const editing = puck && puck.isEditing;
  return (
    <section ref={ref} className="b-featured-sec">
      <div className="wrap">
        <article className="featured" data-reveal>
          <svg className="corner-wave" viewBox="0 0 170 170" aria-hidden="true">
            <path d="M170 30 A140 140 0 0 0 30 170" /><path d="M170 62 A108 108 0 0 0 62 170" />
            <path d="M170 94 A76 76 0 0 0 94 170" /><path d="M170 126 A44 44 0 0 0 126 170" />
          </svg>
          <div className="featured__media" aria-hidden={image ? undefined : 'true'}>
            {image ? <img className="featured__img" src={image} alt={alt || ''} loading="lazy" decoding="async" onError={hideOnError} /> : <span className="featured__glyph">{glyph}</span>}
          </div>
          <div className="featured__body">
            <EditableText editing={editing} id={id} field="label" value={label} as="span" className="pill" singleLine placeholder="Label…" />
            <EditableText editing={editing} id={id} field="title" value={title} as="h2" className="h3" singleLine placeholder="Title…" />
            <EditableText editing={editing} id={id} field="excerpt" value={excerpt} as="p" className="muted" placeholder="Excerpt…" />
            <div className="featured__meta">
              <EditableText editing={editing} id={id} field="meta" value={meta} as="span" className="faint" singleLine placeholder="Meta…" />
              {readTime ? <span className="pill">{readTime}</span> : null}
            </div>
            {ctaLabel ? <p className="featured__cta"><a className="b-cta" {...resolveLink(ctaHref)}>{ctaLabel}<Arrow /></a></p> : null}
          </div>
        </article>
      </div>
    </section>
  );
}

export const css = `
.b-featured-sec{padding:clamp(40px,6vh,84px) 0;position:relative}
.featured{position:relative;display:grid;grid-template-columns:1.15fr 1fr;gap:0;border:1px solid var(--gs-border-soft);border-radius:22px;overflow:hidden;
  transition:transform .4s var(--gs-ease),border-color .4s var(--gs-ease)}
.featured:hover{border-color:var(--gs-border);transform:translateY(-4px)}
@media(max-width:760px){.featured{grid-template-columns:1fr}}
.featured__media{position:relative;min-height:340px;overflow:hidden;
  background:radial-gradient(120% 120% at 20% 10%,rgba(200,255,0,.18),transparent 55%),linear-gradient(140deg,#16432f,#0e3122)}
@media(max-width:760px){.featured__media{min-height:220px}}
.featured__media::after{content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(125deg,rgba(255,255,255,.06) 0 2px,transparent 2px 18px);transition:transform .6s var(--gs-ease)}
.featured:hover .featured__media::after{transform:scale(1.12) rotate(1deg)}
.featured__img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.featured__glyph{position:absolute;left:6%;top:50%;translate:0 -50%;font-weight:900;font-size:clamp(7rem,16vw,15rem);line-height:.8;
  color:rgba(255,255,255,.08);transition:transform .6s var(--gs-ease)}
.featured:hover .featured__glyph{transform:scale(1.06) translateX(6px)}
.featured__body{padding:clamp(28px,3.2vw,48px);display:flex;flex-direction:column;justify-content:center;gap:14px}
.featured__body .h3{max-width:18ch}
.featured__meta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:.78rem}
.featured__cta{margin-top:6px}
/* animated lime corner-wave (faithful to the live insights .featured): four arcs emit outward, staggered */
.corner-wave{position:absolute;top:-2px;right:-2px;width:170px;height:170px;z-index:2;pointer-events:none}
.corner-wave path{fill:none;stroke:var(--gs-accent);stroke-width:1;opacity:0;transform-origin:100% 0%;
  animation:gsWaveEmit 4.6s var(--gs-ease-inout) infinite}
.corner-wave path:nth-child(1){animation-delay:0s}
.corner-wave path:nth-child(2){animation-delay:.7s}
.corner-wave path:nth-child(3){animation-delay:1.4s}
.corner-wave path:nth-child(4){animation-delay:2.1s}
@keyframes gsWaveEmit{0%{opacity:0;transform:scale(.35)}18%{opacity:.55}70%{opacity:.12}100%{opacity:0;transform:scale(1.1)}}
@media(prefers-reduced-motion:reduce){.corner-wave path{animation:none;opacity:.3}}
`;

export const puck = {
  label: 'Featured article',
  fields: {
    label: { type: 'custom', label: 'Label', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    title: { type: 'custom', label: 'Title', render: (props) => <RichTextField {...props} variant="heading" /> },
    excerpt: { type: 'custom', label: 'Excerpt', render: (props) => <RichTextField {...props} /> },
    meta: { type: 'custom', label: 'Meta (category etc.)', render: (props) => <RichTextField {...props} variant="eyebrow" /> },
    readTime: { type: 'text', label: 'Read time' },
    image: { type: 'custom', label: 'Hero image', render: (props) => <MediaField {...props} /> },
    alt: { type: 'text', label: 'Image alt text (accessibility)' },
    glyph: { type: 'text', label: 'Media glyph (fallback)' },
    ctaLabel: { type: 'text', label: 'Button label (optional)' },
    ctaHref: { type: 'custom', label: 'Button link', render: (props) => <LinkField {...props} /> },
  },
  defaultProps: {
    label: 'Featured', glyph: 'G', image: '', alt: '',
    title: 'The hours your business is quietly losing, and how to get them back.',
    excerpt: 'A field-level look at where time actually leaks: the manual handoffs, the duplicated tools, the approvals that wait on a single inbox.',
    meta: 'AI & Automation', readTime: '8 min read',
    ctaLabel: '', ctaHref: '', // no button until a real link is set (avoids a dead "#" CTA)
  },
  render: (props) => <FeaturedArticle {...props} />,
};

export default FeaturedArticle;
