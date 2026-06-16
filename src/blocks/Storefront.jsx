import { useReveal } from './reveal.js';
import { Arrow } from './icons.jsx';
import { useCatalog } from '../cms/CatalogContext.js';
import { useCart } from '../cms/CartContext.js';

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

export function Storefront({ heading, body }) {
  const ref = useReveal();
  const { products = [], categories = [] } = useCatalog();
  const catName = (id) => { const c = categories.find((x) => x.id === id); return c ? c.name : ''; };
  // only LISTED products reach the public storefront. 'draft' is hidden (manage it in the Products
  // tab); 'active' and 'legacy' both show — legacy products are older but still sold + supported.
  const listed = products.filter((p) => p.status !== 'draft');
  const cats = categories.filter((c) => listed.some((p) => p.category === c.id));
  const uncategorised = listed.filter((p) => !categories.some((c) => c.id === p.category));

  // Product/Offer JSON-LD so search can surface the catalogue (price/availability rich results).
  // Emitted inline (crawlers read it from the DOM); the "from £X" floor is the Offer price, sold = InStock.
  const priceFloor = (s) => { const m = String(s || '').replace(/[, ]/g, '').match(/(\d+(?:\.\d+)?)/); return m ? m[1] : ''; };
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
        {listed.length === 0 ? (
          <p className="b-sf-empty">No products yet. Add them in the studio’s Products tab.</p>
        ) : (
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
        )}
      </div>
    </section>
  );
}

export const css = `
.b-storefront{position:relative;padding:clamp(48px,9vw,110px) 0;z-index:2}
.b-sf-head{font-size:clamp(1.9rem,4.6vw,3.1rem);font-weight:900;letter-spacing:-.03em;line-height:1.04;text-align:center}
.b-sf-intro{margin:18px auto 0;max-width:60ch;text-align:center;color:var(--gs-text-muted);font-size:clamp(1rem,1.5vw,1.16rem);line-height:1.7}
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
  },
  defaultProps: {
    heading: 'The catalogue',
    body: 'Every licence includes onboarding and support. Prices are a guide; talk to us for volume and multi-year terms.',
  },
  render: (props) => <Storefront {...props} />,
};

export default Storefront;
