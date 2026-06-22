import { useEffect, useRef, useState } from 'react';
import { useReveal } from './reveal.js';
import { MediaField } from '../cms/MediaField.jsx';
import { safeHref } from '../lib/safe-url.js';

// InsightsGrid: insights.html's filtered article wall. A row of category chips (aria-pressed, "All"
// auto-prepended) crossfades the grid of post cards by data-cat; each card is a gradient-ink (or image)
// media panel with an uppercase lime tag, a title, an excerpt, and a lime-bullet read-time. Faithful
// port of .chips + #postGrid (.post / .post__media / .ink / .tag), with an empty-state note.
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function InsightsGrid({ categories = [], posts = [], emptyNote = '' }) {
  const ref = useReveal([posts.length, categories.length]);
  const [selected, setSelected] = useState('all'); // chip pressed state — updates immediately
  const [filter, setFilter] = useState('all');      // applied to the posts — lags by the crossfade
  const [fading, setFading] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []); // clear the crossfade timer on unmount

  const chips = [{ label: 'All', value: 'all' }, ...categories.map((c) => ({ label: c.label, value: c.value }))];

  const select = (value) => {
    if (value === selected) return;
    setSelected(value);
    if (reduced()) { setFilter(value); return; }
    setFading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setFilter(value); setFading(false); }, 200);
  };

  const matches = (p) => filter === 'all' || p.cat === filter;
  const shown = posts.filter(matches).length;

  return (
    <section ref={ref} className="b-ins section--tight">
      <div className="wrap">
        <div className="b-ins-chips" role="group" aria-label="Filter insights by category" data-reveal>
          {chips.map((c) => (
            <button key={c.value} className="b-ins-chip" type="button"
              aria-pressed={selected === c.value ? 'true' : 'false'}
              onClick={() => select(c.value)}>{c.label}</button>
          ))}
        </div>
        <p className="gs-sr-only" role="status" aria-live="polite">{shown === 0 && emptyNote ? emptyNote : `${shown} ${shown === 1 ? 'article' : 'articles'}`}</p>

        <div className={'grid cols-3 b-ins-grid' + (fading ? ' is-fade' : '')}>
          {posts.map((p, i) => {
            const n = (i % 6) + 1;
            const catLabel = (categories.find((c) => c.value === p.cat) || {}).label || p.cat || '';
            const cls = 'card b-ins-post' + (matches(p) ? '' : ' is-hidden');
            const inner = (
              <>
                <div className="b-ins-media">
                  {p.image
                    ? <div className="b-ins-ink"><img src={p.image} alt={p.alt || ''} loading="lazy" decoding="async" onError={e => { e.currentTarget.style.display = 'none'; }} /></div>
                    : <div className={'b-ins-ink b-ins-g' + n} />}
                  {catLabel ? <span className="b-ins-tag">{catLabel}</span> : null}
                </div>
                {p.title ? <h3>{p.title}</h3> : null}
                {p.excerpt ? <p className="b-ins-excerpt">{p.excerpt}</p> : null}
                {p.readTime ? <span className="b-ins-readtime">{p.readTime}</span> : null}
              </>
            );
            // A post with a link becomes a real, focusable card-link (with a "Read" affordance); one
            // without a link stays a plain preview card, exactly as before. No nested interactive els.
            return p.href
              ? <a key={i} className={cls + ' is-link'} href={safeHref(p.href)} data-reveal>{inner}<span className="b-ins-more" aria-hidden="true">Read &rarr;</span></a>
              : <article key={i} className={cls} data-reveal>{inner}</article>;
          })}
        </div>

        {shown === 0 && emptyNote ? <p className="b-ins-empty">{emptyNote}</p> : null}
      </div>
    </section>
  );
}

export const css = `
.b-ins-chips{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:clamp(22px,3vw,34px)}
.b-ins-chip{font-family:inherit;cursor:pointer;padding:.55em 1.15em;min-height:44px;display:inline-flex;align-items:center;border-radius:100px;border:1px solid var(--gs-border);
  background:var(--gs-accent-soft);color:var(--gs-text-muted);font-size:.78rem;font-weight:700;letter-spacing:.06em;
  transition:color var(--gs-dur),background var(--gs-dur),border-color var(--gs-dur),transform var(--gs-dur) var(--gs-ease)}
.b-ins-chip:hover{transform:translateY(-2px);color:var(--gs-text);border-color:var(--gs-accent-mid)}
.b-ins-chip[aria-pressed="true"]{background:var(--gs-accent);color:#0e1611;border-color:var(--gs-accent)}
.b-ins-grid{transition:opacity .45s var(--gs-ease)}
.b-ins-grid.is-fade{opacity:0}
.b-ins-post{position:relative;display:flex;flex-direction:column;gap:14px;overflow:hidden}
.b-ins-post.is-hidden{display:none}
.b-ins-media{position:relative;height:168px;border-radius:12px;overflow:hidden;margin:-4px -4px 4px}
.b-ins-ink{position:absolute;inset:0;transition:transform .9s var(--gs-ease),filter .9s var(--gs-ease)}
.b-ins-ink img{width:100%;height:100%;object-fit:cover;display:block}
.b-ins-post:hover .b-ins-ink{transform:scale(1.09);filter:saturate(1.2) brightness(1.08)}
.b-ins-ink::after{content:'';position:absolute;inset:0;mix-blend-mode:overlay;
  background:repeating-linear-gradient(120deg,rgba(255,255,255,.05) 0 1px,transparent 1px 22px)}
.b-ins-g1{background:linear-gradient(135deg,#1b5039,#0e3122 60%,#08231a)}
.b-ins-g2{background:linear-gradient(135deg,#143b2c,#0e3122 55%,#0a2a1d)}
.b-ins-g3{background:linear-gradient(135deg,#1f5a3f,#123726 70%,#0a261b)}
.b-ins-g4{background:linear-gradient(135deg,#0e3122,#1b5039 60%,#0c2c20)}
.b-ins-g5{background:linear-gradient(135deg,#163e2d,#0c2a1e 65%,#081f16)}
.b-ins-g6{background:linear-gradient(135deg,#1b5039,#0a261b 70%,#06190f)}
.b-ins-tag{position:absolute;left:12px;bottom:12px;z-index:2;font-size:.64rem;font-weight:800;letter-spacing:.14em;
  text-transform:uppercase;padding:.35em .8em;border-radius:100px;color:#0e1611;background:var(--gs-accent)}
.b-ins-post h3{font-size:1.12rem;line-height:1.18;font-weight:800}
.b-ins-excerpt{font-size:.92rem;color:var(--gs-text-muted)}
.b-ins-readtime{margin-top:auto;padding-top:6px;color:var(--gs-text-faint);font-weight:600;letter-spacing:.04em;font-size:.78rem}
.b-ins-readtime::before{content:'•';margin-right:10px;color:var(--gs-accent)}
.b-ins-post.is-link{text-decoration:none;color:inherit;cursor:pointer;transition:transform var(--gs-dur) var(--gs-ease),border-color var(--gs-dur)}
.b-ins-post.is-link:hover{transform:translateY(-3px);border-color:var(--gs-accent-mid)}
.b-ins-more{margin-top:4px;color:var(--gs-accent);font-weight:700;font-size:.82rem}
.b-ins-empty{margin-top:28px;text-align:center;color:var(--gs-text-faint);font-size:.92rem}
@media(prefers-reduced-motion:reduce){
  .b-ins-grid{transition:none}
  .b-ins-post:hover .b-ins-ink{transform:none;filter:none}
}
`;

export const puck = {
  label: 'Insights grid (filterable)',
  fields: {
    categories: {
      type: 'array', label: 'Filter categories',
      arrayFields: {
        label: { type: 'text', label: 'Label' },
        value: { type: 'text', label: 'Value (matches a post category)' },
      },
      defaultItemProps: { label: 'Category', value: 'category' },
      getItemSummary: (i) => i.label || 'Category',
    },
    posts: {
      type: 'array', label: 'Posts',
      arrayFields: {
        cat: { type: 'text', label: 'Category value (matches a chip)' },
        title: { type: 'text', label: 'Title' },
        excerpt: { type: 'textarea', label: 'Excerpt' },
        readTime: { type: 'text', label: 'Read time' },
        href: { type: 'text', label: 'Link (optional, makes the card clickable)' },
        image: { type: 'custom', label: 'Image (optional)', render: (props) => <MediaField {...props} /> },
        alt: { type: 'text', label: 'Image alt' },
      },
      defaultItemProps: { cat: 'category', title: 'A field note', excerpt: 'A short standfirst.', readTime: '5 min read', href: '', image: '', alt: '' },
      getItemSummary: (i) => i.title || 'Post',
    },
    emptyNote: { type: 'text', label: 'Empty-state note' },
  },
  defaultProps: {
    categories: [
      { label: 'AI & Automation', value: 'ai' },
      { label: 'Digital Maturity', value: 'maturity' },
      { label: 'Industry', value: 'industry' },
      { label: 'Adoption', value: 'adoption' },
    ],
    posts: [
      { cat: 'ai', title: "Why your AI spend isn't paying back yet.", excerpt: "Most AI budgets buy tools, not outcomes. Here's the gap between a licence and a habit, and how we close it inside the team.", readTime: '6 min read', image: '', alt: '' },
      { cat: 'adoption', title: 'The week your team never gets back.', excerpt: 'We tracked one ordinary week across an operations team. The hours lost to copy-paste, context-switching and waiting were not small.', readTime: '5 min read', image: '', alt: '' },
      { cat: 'maturity', title: 'Pebble, plateau, peak: a maturity map.', excerpt: 'A plain-language way to place where you really are across the eight pillars, and what the next honest step looks like from here.', readTime: '9 min read', image: '', alt: '' },
      { cat: 'industry', title: 'What “digital-first” means when the work is physical.', excerpt: "Field, trade and operations businesses don't need an app for everything. They need the right few. We sort the signal from the demos.", readTime: '7 min read', image: '', alt: '' },
      { cat: 'ai', title: 'Automate the boring before the brilliant.', excerpt: 'The highest-return automations are rarely the flashy ones. We start where the friction is quiet, daily and unloved, then build up.', readTime: '4 min read', image: '', alt: '' },
      { cat: 'adoption', title: "Tools don't transform teams. Habits do.", excerpt: "Rollout isn't go-live. We stay embedded past launch because the value lives in week six, not week one, when the new way becomes the only way.", readTime: '6 min read', image: '', alt: '' },
    ],
    emptyNote: 'No field notes in this category yet: check back soon.',
  },
  render: (props) => <InsightsGrid {...props} />,
};

export default InsightsGrid;
