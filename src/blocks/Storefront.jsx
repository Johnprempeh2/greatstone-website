import { useState } from 'react';
import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { useCatalog } from '../cms/CatalogContext.js';
import { useCart } from '../cms/CartContext.js';

const priceFloor = (s) => { const m = String(s || '').replace(/[, ]/g, '').match(/(\d+(?:\.\d+)?)/); return m ? m[1] : ''; };
function SearchGlyph() {
  return (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>);
}

// Storefront: renders the product catalogue from the store (via CatalogContext), grouped by category.
// Products are managed in the studio's Products tab, not in this block's fields — so the same
// catalogue powers the storefront everywhere it appears. The "Request a licence" CTA routes to the
// contact flow (#book); a real licence-purchase checkout is a backend handoff (see HANDOVER), never
// a fake payment here. Editable: the section heading + intro only (brand-locked cards).
function Card({ p, catName }) {
  const { add, cart } = useCart();
  const inCart = cart[p.id] || 0;
  return (
    <article className="b-sf-card" data-reveal>
      {p.image ? <div className="b-sf-media"><img src={p.image} alt={p.imageAlt || ''} loading="lazy" /></div> : null}
      {p.badge ? <span className={'b-sf-badge' + (p.status === 'legacy' ? ' is-legacy' : '')}>{p.badge}</span> : null}
      <div className="b-sf-cat">{catName || 'Software'}</div>
      <h4 className="b-sf-name"><a className="b-sf-namelink" href={'#product/' + (p.slug || p.id)}>{p.name}</a></h4>
      <p className="b-sf-summary">{p.summary}</p>
      {Array.isArray(p.features) && p.features.length ? (
        <ul className="b-sf-features">{p.features.map((f, i) => <li key={i}>{f}</li>)}</ul>
      ) : null}
      <div className="b-sf-foot">
        <div className="b-sf-price">
          <span className="b-sf-amount">{p.price || 'Contact us'}</span>
          {p.period ? <span className="b-sf-period">{p.period}</span> : null}
        </div>
        <button type="button" className={'b-cta sm' + (inCart ? ' is-added' : '')} onClick={() => add(p.id)}>
          {inCart ? 'Added · ' + inCart : 'Add to licence'}<Arrow />
        </button>
      </div>
      <div className="b-sf-meta">
        {p.licence ? <span className="b-sf-lic">{p.licence}</span> : <span />}
        <a className="b-sf-details" href={'#product/' + (p.slug || p.id)}>View details<Arrow /></a>
      </div>
    </article>
  );
}

export function Storefront({ heading, body, controls = 'show' }) {
  const ref = useReveal();
  const { products = [], categories = [] } = useCatalog();
  const catName = (id) => { const c = categories.find((x) => x.id === id); return c ? c.name : ''; };
  // only LISTED products reach the public storefront. 'draft' is hidden (manage it in the Products
  // tab); 'active' and 'legacy' both show — legacy products are older but still sold + supported.
  const listed = products.filter((p) => p.status !== 'draft');
  const cats = categories.filter((c) => listed.some((p) => p.category === c.id));
  const uncategorised = listed.filter((p) => !categories.some((c) => c.id === p.category));

  // discoverability controls: filter by category, search by name/summary, sort. Past a handful of
  // products a static grouped wall is hard to scan, so a brand-locked bar appears (editor can hide it).
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('featured');
  const showBar = controls !== 'hide' && listed.length > 3;
  const isDefault = cat === 'all' && !q.trim() && sort === 'featured';

  const chips = [{ id: 'all', name: 'All', n: listed.length }]
    .concat(cats.map((c) => ({ id: c.id, name: c.name, n: listed.filter((p) => p.category === c.id).length })))
    .concat(uncategorised.length ? [{ id: '__more__', name: 'More', n: uncategorised.length }] : []);
  const chipName = (id) => (chips.find((c) => c.id === id) || {}).name || '';

  // filtered + sorted view (only used when a control is non-default); priceless items sort last
  const ql = q.trim().toLowerCase();
  let view = listed;
  if (cat === '__more__') view = view.filter((p) => !categories.some((c) => c.id === p.category));
  else if (cat !== 'all') view = view.filter((p) => p.category === cat);
  if (ql) view = view.filter((p) => (p.name + ' ' + (p.summary || '')).toLowerCase().includes(ql));
  const pv = (p) => { const v = parseFloat(priceFloor(p.price)); return isNaN(v) ? null : v; };
  if (sort === 'name') view = [...view].sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'price-asc' || sort === 'price-desc') {
    const dir = sort === 'price-asc' ? 1 : -1;
    view = [...view].sort((a, b) => { const av = pv(a), bv = pv(b); if (av === null && bv === null) return 0; if (av === null) return 1; if (bv === null) return -1; return dir * (av - bv); });
  }
  const clearAll = () => { setCat('all'); setQ(''); setSort('featured'); };

  // Product/Offer JSON-LD describes the WHOLE catalogue (not the filtered view) so search engines index it all.
  const ld = listed.length ? {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: listed.map((p, i) => {
      const offer = { '@type': 'Offer', priceCurrency: 'GBP', availability: 'https://schema.org/InStock' };
      const price = priceFloor(p.price); if (price) offer.price = price;
      const item = { '@type': 'Product', name: p.name, brand: { '@type': 'Brand', name: 'Greatstone International' }, offers: offer };
      if (p.summary) item.description = p.summary;
      if (p.image) item.image = p.image;
      const cn = catName(p.category); if (cn) item.category = cn;
      return { '@type': 'ListItem', position: i + 1, item };
    }),
  } : null;

  return (
    <section ref={ref} className="b-storefront">
      {ld ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} /> : null}
      <div className="wrap">
        {heading ? <h2 className="b-sf-head" data-reveal>{heading}</h2> : null}
        {body ? <p className="b-sf-intro" data-reveal>{body}</p> : null}

        {showBar ? (
          <div className="b-sf-controls">
            <div className="b-sf-search">
              <SearchGlyph />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" aria-label="Search products" />
            </div>
            <div className="b-sf-chips" role="group" aria-label="Filter by category">
              {chips.map((ch) => (
                <button key={ch.id} type="button" className={'b-sf-chip' + (cat === ch.id ? ' is-on' : '')}
                  aria-pressed={cat === ch.id} onClick={() => setCat(ch.id)}>{ch.name}<span className="b-sf-chipn">{ch.n}</span></button>
              ))}
            </div>
            <label className="b-sf-sort">
              <span className="gs-sr-only">Sort products</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="featured">Featured</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
        ) : null}

        {listed.length === 0 ? (
          <p className="b-sf-empty">No products yet. Add them in the studio’s Products tab.</p>
        ) : isDefault ? (
          <div className="b-sf-groups">
            {cats.map((c) => (
              <div className="b-sf-group" key={c.id}>
                <div className="b-sf-grouphead">
                  <h3>{c.name}</h3>
                  {c.blurb ? <p>{c.blurb}</p> : null}
                </div>
                <div className="b-sf-grid">
                  {listed.filter((p) => p.category === c.id).map((p) => <Card key={p.id} p={p} catName={c.name} />)}
                </div>
              </div>
            ))}
            {uncategorised.length ? (
              <div className="b-sf-group">
                <div className="b-sf-grouphead"><h3>More</h3></div>
                <div className="b-sf-grid">{uncategorised.map((p) => <Card key={p.id} p={p} catName="" />)}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="b-sf-results">
            <p className="b-sf-resultcount" role="status" aria-live="polite">
              {view.length} {view.length === 1 ? 'product' : 'products'}{cat !== 'all' ? ' in ' + chipName(cat) : ''}{ql ? ' matching “' + q.trim() + '”' : ''}
            </p>
            {view.length ? (
              <div className="b-sf-grid">{view.map((p) => <Card key={p.id} p={p} catName={catName(p.category)} />)}</div>
            ) : (
              <p className="b-sf-noresults">No products match. <button type="button" className="b-sf-clear" onClick={clearAll}>Clear filters</button></p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export const css = `
.b-storefront{position:relative;padding:clamp(48px,9vw,110px) 0;z-index:2}
.b-sf-head{font-size:clamp(1.9rem,4.6vw,3.1rem);font-weight:900;letter-spacing:-.03em;line-height:1.04;text-align:center}
.b-sf-intro{margin:18px auto 0;max-width:60ch;text-align:center;color:var(--gs-text-muted);font-size:clamp(1rem,1.5vw,1.16rem);line-height:1.7}
.b-sf-controls{margin-top:clamp(28px,5vw,46px);display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;justify-content:center}
.b-sf-search{display:inline-flex;align-items:center;gap:8px;background:rgba(20,23,20,.6);border:1px solid var(--gs-border-soft);
  border-radius:100px;padding:9px 16px;color:var(--gs-text-faint);min-width:min(280px,80vw)}
.b-sf-search:focus-within{border-color:var(--gs-accent)}
.b-sf-search svg{flex-shrink:0}
.b-sf-search input{flex:1;min-width:0;background:none;border:0;outline:none;color:var(--gs-text);font-family:'Montserrat',sans-serif;font-size:.92rem}
.b-sf-search input::placeholder{color:var(--gs-text-faint)}
.b-sf-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.b-sf-chip{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.03);border:1px solid var(--gs-border-soft);
  border-radius:100px;padding:8px 14px;cursor:pointer;font-family:'Montserrat',sans-serif;font-size:.84rem;font-weight:700;
  color:var(--gs-text-muted);transition:border-color .2s var(--gs-ease),color .2s var(--gs-ease)}
.b-sf-chip:hover{color:var(--gs-text);border-color:var(--gs-border)}
.b-sf-chip.is-on{background:var(--gs-accent);border-color:var(--gs-accent);color:#0e1611}
.b-sf-chipn{font-size:.72rem;font-weight:800;opacity:.7;font-variant-numeric:tabular-nums}
.b-sf-sort select{background:rgba(20,23,20,.6);border:1px solid var(--gs-border-soft);border-radius:100px;padding:9px 16px;
  color:var(--gs-text);font-family:'Montserrat',sans-serif;font-size:.86rem;font-weight:700;cursor:pointer;outline:none}
.b-sf-sort select:focus{border-color:var(--gs-accent)}
.b-sf-results{margin-top:clamp(28px,5vw,44px)}
.b-sf-resultcount{text-align:center;color:var(--gs-text-muted);font-size:.9rem;font-weight:700;margin-bottom:22px}
.b-sf-noresults{margin-top:20px;text-align:center;color:var(--gs-text-muted)}
.b-sf-clear{background:none;border:0;padding:0;color:var(--gs-accent);font:inherit;font-weight:800;cursor:pointer;text-decoration:underline}
.b-sf-groups{margin-top:clamp(36px,6vw,68px);display:flex;flex-direction:column;gap:clamp(40px,6vw,72px)}
.b-sf-grouphead h3{font-size:1.4rem;font-weight:800;letter-spacing:-.02em}
.b-sf-grouphead p{margin-top:6px;color:var(--gs-text-muted);font-size:.98rem;line-height:1.6;max-width:54ch}
.b-sf-grid{margin-top:22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.b-sf-card{position:relative;display:flex;flex-direction:column;background:rgba(20,23,20,.6);border:1px solid var(--gs-border-soft);
  border-radius:18px;padding:24px;backdrop-filter:blur(8px);transition:border-color .3s var(--gs-ease),transform .3s var(--gs-ease)}
.b-sf-card:hover{border-color:var(--gs-border);transform:translateY(-3px)}
.b-sf-media{margin:-4px -4px 14px;border-radius:12px;overflow:hidden;aspect-ratio:16/9;background:rgba(255,255,255,.03)}
.b-sf-media img{width:100%;height:100%;object-fit:cover;display:block}
.b-sf-badge{position:absolute;top:18px;right:18px;font-size:.62rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  color:#0e1611;background:var(--gs-accent);border-radius:6px;padding:3px 8px}
.b-sf-badge.is-legacy{background:var(--gs-text-faint);color:#fff}
.b-sf-cat{font-size:.66rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-accent)}
.b-sf-name{margin-top:8px;font-size:1.4rem;font-weight:800;letter-spacing:-.02em}
.b-sf-namelink{color:inherit;text-decoration:none}
.b-sf-namelink:hover{color:var(--gs-accent)}
.b-sf-summary{margin-top:10px;color:var(--gs-text-muted);font-size:.95rem;line-height:1.6}
.b-sf-features{margin-top:16px;display:flex;flex-direction:column;gap:7px;list-style:none}
.b-sf-features li{position:relative;padding-left:20px;font-size:.88rem;color:var(--gs-text);line-height:1.5}
.b-sf-features li::before{content:"";position:absolute;left:0;top:.5em;width:9px;height:9px;border-radius:2px;
  background:var(--gs-accent);opacity:.5}
.b-sf-foot{margin-top:auto;padding-top:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.b-sf-price{display:flex;align-items:baseline;gap:4px}
.b-sf-amount{font-size:1.15rem;font-weight:800;color:var(--gs-text)}
.b-sf-period{font-size:.8rem;color:var(--gs-text-faint)}
.b-cta.sm{padding:.6em 1.2em;font-size:.84rem}
.b-sf-meta{margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.b-sf-lic{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--gs-text-faint)}
.b-sf-details{display:inline-flex;align-items:center;gap:5px;font-size:.78rem;font-weight:800;color:var(--gs-accent);text-decoration:none;white-space:nowrap}
.b-sf-details:hover{text-decoration:underline}
.b-sf-details svg{width:13px;height:13px}
.b-sf-empty{margin-top:30px;text-align:center;color:var(--gs-text-faint)}
`;

export const puck = {
  label: 'Storefront',
  fields: {
    heading: { type: 'text', label: 'Section heading', contentEditable: true },
    body: { type: 'textarea', label: 'Intro', contentEditable: true },
    controls: { type: 'radio', label: 'Filter & search bar', options: [{ label: 'Show (4+ products)', value: 'show' }, { label: 'Hide', value: 'hide' }] },
  },
  defaultProps: {
    heading: 'The catalogue',
    body: 'Every licence includes onboarding and support. Prices are a guide; talk to us for volume and multi-year terms.',
    controls: 'show',
  },
  render: (props) => <Storefront {...props} />,
};

export default Storefront;
