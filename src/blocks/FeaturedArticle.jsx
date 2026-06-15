import { useReveal } from './reveal.js';

// The insights hero post: a two-up card with a stone-echo media panel (giant glyph + terraced
// ridges + corner wave) and the article meta. Editable label, title, excerpt and read time.
export function FeaturedArticle({ label, title, excerpt, meta, glyph = 'G', readTime }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="b-featured-sec">
      <div className="wrap">
        <article className="featured" data-reveal>
          <svg className="corner-wave" viewBox="0 0 170 170" aria-hidden="true">
            <path d="M170 30 A140 140 0 0 0 30 170" /><path d="M170 62 A108 108 0 0 0 62 170" />
            <path d="M170 94 A76 76 0 0 0 94 170" /><path d="M170 126 A44 44 0 0 0 126 170" />
          </svg>
          <div className="featured__media" aria-hidden="true"><span className="featured__glyph">{glyph}</span></div>
          <div className="featured__body">
            {label ? <span className="pill">{label}</span> : null}
            <h2 className="h3">{title}</h2>
            {excerpt ? <p className="muted">{excerpt}</p> : null}
            <div className="featured__meta">
              {meta ? <span className="faint">{meta}</span> : null}
              {readTime ? <span className="pill">{readTime}</span> : null}
            </div>
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
.featured__glyph{position:absolute;left:6%;top:50%;translate:0 -50%;font-weight:900;font-size:clamp(7rem,16vw,15rem);line-height:.8;
  color:rgba(255,255,255,.08);transition:transform .6s var(--gs-ease)}
.featured:hover .featured__glyph{transform:scale(1.06) translateX(6px)}
.featured__body{padding:clamp(28px,3.2vw,48px);display:flex;flex-direction:column;justify-content:center;gap:14px}
.featured__body .h3{max-width:18ch}
.featured__meta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:.78rem}
.corner-wave{position:absolute;top:0;right:0;width:120px;height:120px;z-index:2;fill:none;stroke:var(--gs-accent);stroke-width:1;opacity:.4;pointer-events:none}
`;

export const puck = {
  label: 'Featured article',
  fields: {
    label: { type: 'text', label: 'Label', contentEditable: true },
    title: { type: 'text', label: 'Title', contentEditable: true },
    excerpt: { type: 'textarea', label: 'Excerpt', contentEditable: true },
    meta: { type: 'text', label: 'Meta (category etc.)', contentEditable: true },
    readTime: { type: 'text', label: 'Read time' },
    glyph: { type: 'text', label: 'Media glyph' },
  },
  defaultProps: {
    label: 'Featured', glyph: 'G',
    title: 'The hours your business is quietly losing, and how to get them back.',
    excerpt: 'A field-level look at where time actually leaks: the manual handoffs, the duplicated tools, the approvals that wait on a single inbox.',
    meta: 'AI & Automation', readTime: '8 min read',
  },
  render: (props) => <FeaturedArticle {...props} />,
};

export default FeaturedArticle;
