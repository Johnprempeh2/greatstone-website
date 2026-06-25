import { useState, useMemo, useEffect } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { safeMailto } from '../lib/safe-url.js';
import { shortFormat, serviceSlug, serviceReason, featuredServices, newServices, popularServices } from '../store/services.mjs';
import { usePopularity, loadGlobalPopularity } from '../store/popularity.mjs';
import { InquiryToggle } from '../store/InquiryUI.jsx';
import { categories as CATALOG_CATEGORIES, services as CATALOG_SERVICES, umbrella as UMBRELLA } from '../data/service-catalog.mjs';

// ServiceCatalog: the browsable, productized catalogue of everything Greatstone can build and run.
// A search box + category chips filter a responsive grid of service cards. Each card carries a format
// badge, the one-line promise, links to that service's OWN detail page (#service/<slug>), and an
// "Add to inquiry" toggle so a client can line up one or several services and inquire about them at once.
// The card itself never re-renders on inquiry change (the toggle is an isolated child) and carries no
// reveal class, so it can't be clobbered into invisibility the way the old inline expander was.

// derive the chip list from the services present, honouring an explicit category order when given
function useCategories(services, categoryOrder) {
  return useMemo(() => {
    const counts = new Map();
    for (const s of services) {
      const c = (s && s.category) || 'Other';
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    const ordered = [];
    (categoryOrder || []).forEach((c) => { if (counts.has(c)) { ordered.push(c); counts.delete(c); } });
    for (const c of counts.keys()) ordered.push(c); // any categories not in the order, appended
    return ordered;
  }, [services, categoryOrder]);
}

// One catalogue card — used in both the Featured strip and the main grid. The card itself never
// subscribes to any store (so it can't be re-rendered into invisibility); the inquiry toggle is the only
// live child. `reason` drives the New / Popular / Featured pill.
function ServiceCard({ s, reason }) {
  const slug = serviceSlug(s);
  const rLabel = reason === 'new' ? 'New' : reason === 'popular' ? 'Popular' : reason === 'featured' ? 'Featured' : '';
  return (
    <article className={'card b-cat-card' + (s.featured ? ' is-flag' : '')}>
      <div className="b-cat-card-top">
        {s.format ? <span className="b-cat-fmt">{shortFormat(s.format)}</span> : null}
        {rLabel ? <span className={'b-cat-reason r-' + reason}>{rLabel}</span> : null}
      </div>
      <h3 className="b-cat-name"><a className="b-cat-cardlink" href={'#service/' + slug}>{s.name}</a></h3>
      {s.oneLiner ? <p className="b-cat-one">{s.oneLiner}</p> : null}
      <div className="b-cat-card-foot">
        <span className="b-cat-view" aria-hidden="true">View details<Arrow /></span>
        <InquiryToggle service={s} />
      </div>
    </article>
  );
}

export function ServiceCatalog({
  kicker, heading, highlight, intro, inquiryEmail = 'dx@greatstonesoftware.co.uk',
  bookLabel, bookHref = '#book', categories = [], services = [], searchPlaceholder = 'Search services…',
}) {
  const ref = useReveal([services.length]);
  const [active, setActive] = useState('All');
  const [query, setQuery] = useState('');

  const catNames = useCategories(services, categories.map((c) => c.name));
  const blurbFor = useMemo(() => {
    const m = new Map(); categories.forEach((c) => m.set(c.name, c.blurb)); return m;
  }, [categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services
      .filter((s) => active === 'All' || s.category === active)
      .filter((s) => {
        if (!q) return true;
        const hay = [s.name, s.oneLiner, s.category, s.outcome, s.idealClient, ...(s.bullets || []).map((b) => b.text)]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
  }, [services, active, query]);

  // Featured = three inputs blended: admin selection (service.featured), New (service.isNew) and the
  // most-popular by this visitor's interaction (popularity counts, deduped + GA4-mirrored). The strip's
  // tabs let a visitor jump straight to New or Popular; empty tabs hide themselves.
  const counts = usePopularity();
  useEffect(() => { loadGlobalPopularity(); }, []); // pull the global, cross-visitor "Popular" ranking once
  const [featTab, setFeatTab] = useState('top');
  const popularList = useMemo(() => popularServices(services, counts, 12), [services, counts]);
  const popularSet = useMemo(() => new Set(popularList.map(serviceSlug)), [popularList]);
  const featTabs = useMemo(() => [
    { id: 'top', label: 'Top picks', items: featuredServices(services, counts, 9) },
    { id: 'new', label: 'New', items: newServices(services) },
    { id: 'popular', label: 'Popular', items: popularList },
  ].filter((t) => t.items.length), [services, counts, popularList]);
  const activeFeat = featTabs.find((t) => t.id === featTab) || featTabs[0];
  const showFeatured = active === 'All' && !query.trim() && featTabs.length > 0;

  return (
    <section ref={ref} className="b-cat">
      <div className="wrap">
        {(kicker || heading || highlight || intro) ? (
          <div className="b-cat-head" data-reveal>
            {kicker ? <span className="kicker">{kicker}</span> : null}
            {(heading || highlight) ? (
              <h2 className="b-cat-h2">{heading} {highlight ? <span className="accent">{highlight}</span> : null}</h2>
            ) : null}
            {intro ? <p className="b-cat-intro">{intro}</p> : null}
          </div>
        ) : null}

        {showFeatured ? (
          <div className="b-cat-featured">
            <div className="b-cat-feat-head">
              <span className="kicker b-cat-feat-kicker">Featured</span>
              {featTabs.length > 1 ? (
                <div className="b-cat-feat-tabs" role="tablist" aria-label="Featured services">
                  {featTabs.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={activeFeat.id === t.id}
                      className={'b-cat-feat-tab' + (activeFeat.id === t.id ? ' is-on' : '')}
                      onClick={() => setFeatTab(t.id)}>{t.label} <span className="b-cat-feat-n">{t.items.length}</span></button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="b-cat-feat-grid">
              {activeFeat.items.map((s) => <ServiceCard key={serviceSlug(s)} s={s} reason={serviceReason(s, popularSet)} />)}
            </div>
          </div>
        ) : null}

        <div className="b-cat-controls" data-reveal>
          <div className="b-cat-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input
              type="search" className="b-cat-input" placeholder={searchPlaceholder}
              aria-label="Search services" value={query} onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="b-cat-chips" role="group" aria-label="Filter by category">
            <button type="button" className={'b-cat-chip' + (active === 'All' ? ' is-on' : '')}
              aria-pressed={active === 'All'} onClick={() => setActive('All')}>
              All <span className="b-cat-chip-n">{services.length}</span>
            </button>
            {catNames.map((c) => {
              const n = services.filter((s) => s.category === c).length;
              return (
                <button key={c} type="button" className={'b-cat-chip' + (active === c ? ' is-on' : '')}
                  aria-pressed={active === c} onClick={() => setActive(c)}>
                  {c} <span className="b-cat-chip-n">{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        {active !== 'All' && blurbFor.get(active) ? (
          <p className="b-cat-catblurb" data-reveal>{blurbFor.get(active)}</p>
        ) : null}

        <p className="b-cat-count" aria-live="polite">
          {filtered.length === services.length
            ? `${services.length} services`
            : `Showing ${filtered.length} of ${services.length}`}
        </p>

        {filtered.length === 0 ? (
          <div className="b-cat-empty" data-reveal>
            <p>No services match “{query}”. Tell us what you’re trying to solve and we’ll scope it.</p>
            <a className="b-cta" href={safeMailto(inquiryEmail)}>Email us<Arrow /></a>
          </div>
        ) : (
          <div className="b-cat-grid">
            {filtered.map((s) => <ServiceCard key={serviceSlug(s) || s.name} s={s} reason={serviceReason(s, popularSet)} />)}
          </div>
        )}

        {bookLabel ? (
          <div className="b-cat-foot" data-reveal>
            <p>Not sure which you need? Start with the read that prices the rest.</p>
            <a className="b-cta b-cat-book" href={bookHref}>{bookLabel}<Arrow /></a>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export const css = `
.b-cat{padding:clamp(40px,6vw,88px) 0;position:relative}
.b-cat-head{text-align:center;max-width:60ch;margin:0 auto clamp(28px,4vw,44px)}
.b-cat-h2{margin-top:.4em;font-size:clamp(1.9rem,4.2vw,3.2rem);font-weight:900;letter-spacing:-.025em;line-height:1.05}
.b-cat-intro{margin-top:1rem;color:var(--gs-text-muted);font-size:1.02rem;line-height:1.6}
/* controls: search + chips */
.b-cat-controls{display:flex;flex-direction:column;gap:16px;margin-bottom:14px}
.b-cat-search{position:relative;max-width:420px;margin:0 auto;width:100%}
.b-cat-search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:17px;height:17px;
  stroke:var(--gs-faint);fill:none;stroke-width:1.9;stroke-linecap:round}
.b-cat-input{width:100%;font-family:inherit;font-size:.96rem;color:var(--gs-text);
  background:rgba(255,255,255,.03);border:1px solid var(--gs-border-soft);border-radius:999px;padding:.72em 1em .72em 2.6em;
  transition:border-color .25s var(--gs-ease),background .25s var(--gs-ease),box-shadow .25s var(--gs-ease)}
.b-cat-input::placeholder{color:var(--gs-faint)}
.b-cat-input:focus{outline:none;border-color:var(--gs-accent-mid,rgba(200,255,0,.4));background:rgba(200,255,0,.04);box-shadow:0 0 0 3px var(--gs-accent-soft)}
.b-cat-chips{display:flex;flex-wrap:wrap;gap:9px;justify-content:center}
.b-cat-chip{display:inline-flex;align-items:center;gap:.5em;font-family:inherit;font-size:.86rem;font-weight:600;
  color:var(--gs-text-muted);background:rgba(255,255,255,.02);border:1px solid var(--gs-border-soft);
  border-radius:999px;padding:.46em .9em;cursor:pointer;transition:all .2s var(--gs-ease)}
.b-cat-chip:hover{color:var(--gs-text);border-color:var(--gs-border)}
.b-cat-chip.is-on{color:var(--gs-bg,#0d100e);background:var(--gs-accent);border-color:var(--gs-accent);font-weight:700}
.b-cat-chip-n{font-size:.72rem;font-weight:700;opacity:.7}
.b-cat-chip.is-on .b-cat-chip-n{opacity:.6}
.b-cat-catblurb{text-align:center;max-width:62ch;margin:2px auto 0;color:var(--gs-text-muted);font-size:.96rem;line-height:1.55}
.b-cat-count{text-align:center;margin:18px 0 22px;font-size:.78rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gs-faint)}
/* featured strip */
.b-cat-featured{margin:0 0 clamp(30px,4.5vw,46px);padding-bottom:clamp(26px,4vw,40px);border-bottom:1px solid var(--gs-border-soft)}
.b-cat-feat-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
.b-cat-feat-kicker{margin:0}
.b-cat-feat-tabs{display:inline-flex;gap:5px;background:rgba(255,255,255,.03);border:1px solid var(--gs-border-soft);border-radius:999px;padding:4px}
.b-cat-feat-tab{display:inline-flex;align-items:center;gap:.4em;font-family:inherit;font-size:.82rem;font-weight:700;color:var(--gs-text-muted);background:none;border:0;border-radius:999px;padding:.42em .95em;cursor:pointer;transition:all .18s var(--gs-ease)}
.b-cat-feat-tab:hover{color:var(--gs-text)}
.b-cat-feat-tab.is-on{color:#0e1611;background:var(--gs-accent)}
.b-cat-feat-n{font-size:.7rem;font-weight:800;opacity:.6}
.b-cat-feat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:clamp(14px,1.6vw,20px);align-items:stretch}
@media(max-width:520px){.b-cat-feat-grid{grid-template-columns:1fr}}
/* grid */
.b-cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:clamp(14px,1.6vw,20px);align-items:stretch}
.b-cat-card{position:relative;display:flex;flex-direction:column;padding:clamp(20px,2.2vw,26px);height:100%;
  transition:transform .18s var(--gs-ease),border-color .18s var(--gs-ease)}
.b-cat-card:hover{transform:translateY(-3px);border-color:var(--gs-accent-mid,rgba(200,255,0,.4))}
.b-cat-card.is-flag{border-color:var(--gs-accent-mid,rgba(200,255,0,.4));background:linear-gradient(180deg,var(--gs-accent-soft),transparent 60%)}
.b-cat-card-top{display:flex;align-items:center;gap:8px;margin-bottom:14px;min-height:22px}
.b-cat-fmt{font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gs-accent);
  background:var(--gs-accent-soft);border:1px solid var(--gs-border);border-radius:6px;padding:.3em .6em}
.b-cat-reason{margin-left:auto;font-size:.62rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:.28em .6em;border-radius:6px;border:1px solid transparent;white-space:nowrap}
.b-cat-reason.r-new{color:#0e1611;background:var(--gs-accent);border-color:var(--gs-accent)}
.b-cat-reason.r-popular{color:var(--gs-accent);background:var(--gs-accent-soft);border-color:var(--gs-border)}
.b-cat-reason.r-featured{color:var(--gs-accent);background:transparent;border-color:var(--gs-border)}
.b-cat-name{font-size:1.12rem;font-weight:800;line-height:1.2;letter-spacing:-.01em;margin-bottom:.45em}
.b-cat-cardlink{color:inherit;text-decoration:none}
/* stretch the title link over the whole card so the body is clickable; the inquiry toggle sits above it */
.b-cat-cardlink::after{content:'';position:absolute;inset:0;border-radius:inherit}
.b-cat-cardlink:focus-visible{outline:2px solid var(--gs-accent);outline-offset:3px}
.b-cat-one{color:var(--gs-text-muted);font-size:.92rem;line-height:1.55;margin-bottom:1.2em}
.b-cat-card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto}
.b-cat-view{display:inline-flex;align-items:center;gap:.3em;font-size:.82rem;font-weight:700;color:var(--gs-accent)}
.b-cat-view svg{width:14px;height:14px}
.b-cat-card .inq-toggle{position:relative;z-index:1}
.b-cat-empty{text-align:center;padding:40px 0;color:var(--gs-text-muted)}
.b-cat-empty .b-cta{margin-top:14px}
.b-cat-foot{text-align:center;margin-top:clamp(32px,5vw,56px);display:flex;flex-direction:column;align-items:center;gap:14px}
.b-cat-foot p{color:var(--gs-text-muted);font-size:.98rem}
@media(max-width:520px){.b-cat-grid{grid-template-columns:1fr}}
`;

export const puck = {
  label: 'Service catalogue',
  fields: {
    kicker: { type: 'text', label: 'Kicker', contentEditable: true },
    heading: { type: 'text', label: 'Heading', contentEditable: true },
    highlight: { type: 'text', label: 'Highlighted word', contentEditable: true },
    intro: { type: 'textarea', label: 'Intro', contentEditable: true },
    searchPlaceholder: { type: 'text', label: 'Search placeholder' },
    inquiryEmail: { type: 'text', label: 'Inquiry email' },
    bookLabel: { type: 'text', label: 'Footer CTA label (blank = hide)' },
    bookHref: { type: 'text', label: 'Footer CTA link' },
    categories: {
      type: 'array', label: 'Categories (order + blurbs)',
      arrayFields: {
        name: { type: 'text', label: 'Name' },
        blurb: { type: 'text', label: 'Blurb' },
      },
      defaultItemProps: { name: 'Category', blurb: '' },
      getItemSummary: (i) => i.name || 'Category',
    },
    services: {
      type: 'array', label: 'Services (each gets its own page)',
      arrayFields: {
        name: { type: 'text', label: 'Name' },
        slug: { type: 'text', label: 'Slug (URL; blank = auto from name)' },
        category: { type: 'text', label: 'Category' },
        oneLiner: { type: 'textarea', label: 'One-liner' },
        format: { type: 'text', label: 'How we deliver it (Build / Build + Run / Subscription …)' },
        featured: { type: 'radio', label: 'Featured (admin pick)', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] },
        isNew: { type: 'radio', label: 'New', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] },
        outcome: { type: 'textarea', label: 'The payback' },
        idealClient: { type: 'text', label: 'Ideal for' },
        bullets: {
          type: 'array', label: 'What we build',
          arrayFields: { text: { type: 'text', label: 'Item' } },
          defaultItemProps: { text: 'A deliverable.' },
          getItemSummary: (i) => i.text || 'Item',
        },
      },
      defaultItemProps: { name: 'New service', slug: '', category: 'AI Agents & Assistants', oneLiner: 'What it does.', format: 'Build', featured: false, isNew: true, outcome: '', idealClient: '', bullets: [] },
      getItemSummary: (i) => i.name || 'Service',
    },
  },
  defaultProps: {
    kicker: UMBRELLA,
    heading: 'Everything we build,', highlight: 'and run for you.',
    intro: 'One catalogue of the systems we put to work for clients — the website, the storefront, the AI behind them, and the quiet automation that buys back the hours. Open any service for the detail, add the ones that fit, and inquire about them together.',
    searchPlaceholder: 'Search services…',
    inquiryEmail: 'dx@greatstonesoftware.co.uk',
    bookLabel: 'Book a Diagnostic',
    bookHref: '#book',
    categories: CATALOG_CATEGORIES,
    services: CATALOG_SERVICES,
  },
  render: (props) => <ServiceCatalog {...props} />,
};

export default ServiceCatalog;
