import { Arrow } from './icons.jsx';
import { useCart } from '../cms/CartContext.js';

// Product detail: the full view for one licence, reached at #product/<slug> from the storefront. Public,
// route-rendered (not a Puck block) — the catalogue is managed in the studio's Products tab, so this
// reads the product straight from the store. Add-to-licence uses the same prototype basket; a real
// licence purchase + payment is a backend handoff (see HANDOVER), never a fake checkout here.
const priceFloor = (s) => { const m = String(s || '').replace(/[, ]/g, '').match(/(\d+(?:\.\d+)?)/); return m ? m[1] : ''; };

export function ProductDetail({ product, categoryName, related = [], onBack }) {
  const { add, cart } = useCart();
  if (!product) {
    return (
      <section className="b-pd b-pd-missing">
        <div className="wrap">
          <h1>Product not found</h1>
          <p>That licence isn’t in the catalogue. It may have been renamed or retired.</p>
          <button type="button" className="b-cta" onClick={onBack}>Back to the catalogue<Arrow /></button>
        </div>
      </section>
    );
  }
  const p = product;
  const inCart = cart[p.id] || 0;
  const offer = { '@type': 'Offer', priceCurrency: 'GBP', availability: 'https://schema.org/InStock' };
  const floor = priceFloor(p.price); if (floor) offer.price = floor;
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, brand: { '@type': 'Brand', name: 'Greatstone International' }, offers: offer };
  if (p.summary) ld.description = p.summary;
  if (p.image) ld.image = p.image;
  if (p.sku) ld.sku = p.sku;
  if (categoryName) ld.category = categoryName;

  return (
    <section className="b-pd">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div className="wrap">
        <nav className="b-pd-crumbs" aria-label="Breadcrumb">
          <button type="button" className="b-pd-crumb" onClick={onBack}>Catalogue</button>
          {categoryName ? <><span aria-hidden="true">/</span><span className="b-pd-crumb is-cur">{categoryName}</span></> : null}
        </nav>

        <div className="b-pd-top">
          <div className="b-pd-lede">
            {p.badge ? <span className={'b-pd-badge' + (p.status === 'legacy' ? ' is-legacy' : '')}>{p.badge}</span> : null}
            <div className="b-pd-eyebrow">{categoryName || 'Software'}</div>
            <h1 className="b-pd-name">{p.name}</h1>
            {p.summary ? <p className="b-pd-summary">{p.summary}</p> : null}
            <div className="b-pd-buy">
              <div className="b-pd-price">
                <span className="b-pd-amount">{p.price || 'Contact us'}</span>
                {p.period ? <span className="b-pd-period">{p.period}</span> : null}
              </div>
              <div className="b-pd-actions">
                <button type="button" className={'b-cta' + (inCart ? ' is-added' : '')} onClick={() => add(p.id)}>
                  {inCart ? 'Added · ' + inCart : 'Add to licence'}<Arrow />
                </button>
                <a className="b-cta ghost" href="#book">Talk to us</a>
              </div>
              {p.licence ? <div className="b-pd-lic">{p.licence}{p.sku ? ' · ' + p.sku : ''}</div> : (p.sku ? <div className="b-pd-lic">{p.sku}</div> : null)}
            </div>
          </div>
          {p.image ? <div className="b-pd-media"><img src={p.image} alt={p.imageAlt || (p.name + ' product image')} /></div> : null}
        </div>

        {Array.isArray(p.features) && p.features.length ? (
          <div className="b-pd-incl">
            <h2 className="b-pd-h2">What’s included</h2>
            <ul className="b-pd-features">{p.features.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </div>
        ) : null}

        {related.length ? (
          <div className="b-pd-related">
            <h2 className="b-pd-h2">More in {categoryName || 'the catalogue'}</h2>
            <div className="b-pd-relgrid">
              {related.map((r) => (
                <a key={r.id} className="b-pd-relcard" href={'#product/' + (r.slug || r.id)}>
                  <span className="b-pd-relname">{r.name}</span>
                  {r.summary ? <span className="b-pd-relsum">{r.summary}</span> : null}
                  <span className="b-pd-relprice">{r.price || 'Contact us'}<Arrow /></span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <button type="button" className="b-pd-back" onClick={onBack}>← Back to the catalogue</button>
      </div>
    </section>
  );
}

export const css = `
.b-pd{position:relative;z-index:2;padding:clamp(40px,7vw,90px) 0 clamp(56px,9vw,110px)}
.b-pd-crumbs{display:flex;align-items:center;gap:9px;font-size:.78rem;font-weight:700;color:var(--gs-text-faint);margin-bottom:clamp(20px,4vw,40px)}
.b-pd-crumb{background:none;border:0;padding:0;cursor:pointer;color:var(--gs-accent);font:inherit}
.b-pd-crumb:hover{text-decoration:underline}
.b-pd-crumb.is-cur{color:var(--gs-text-faint);cursor:default}
.b-pd-top{display:grid;grid-template-columns:1.1fr .9fr;gap:clamp(24px,5vw,56px);align-items:start}
.b-pd-lede{position:relative}
.b-pd-badge{display:inline-block;font-size:.64rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#0e1611;background:var(--gs-accent);border-radius:6px;padding:3px 9px;margin-bottom:14px}
.b-pd-badge.is-legacy{background:var(--gs-text-faint);color:#fff}
.b-pd-eyebrow{font-size:.7rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gs-accent)}
.b-pd-name{margin-top:10px;font-size:clamp(2.1rem,5vw,3.4rem);font-weight:900;letter-spacing:-.03em;line-height:1.03}
.b-pd-summary{margin-top:16px;color:var(--gs-text-muted);font-size:clamp(1.02rem,1.5vw,1.18rem);line-height:1.65;max-width:54ch}
.b-pd-buy{margin-top:26px;padding:22px;border:1px solid var(--gs-border-soft);border-radius:16px;background:rgba(20,23,20,.5);backdrop-filter:blur(8px)}
.b-pd-price{display:flex;align-items:baseline;gap:6px}
.b-pd-amount{font-size:1.7rem;font-weight:900;color:var(--gs-text);letter-spacing:-.02em}
.b-pd-period{font-size:.92rem;color:var(--gs-text-faint)}
.b-pd-actions{margin-top:16px;display:flex;gap:10px;flex-wrap:wrap}
.b-pd-lic{margin-top:14px;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--gs-text-faint)}
.b-pd-media{border-radius:18px;overflow:hidden;border:1px solid var(--gs-border-soft);aspect-ratio:4/3;background:rgba(255,255,255,.03)}
.b-pd-media img{width:100%;height:100%;object-fit:cover;display:block}
.b-pd-h2{font-size:1.3rem;font-weight:800;letter-spacing:-.02em}
.b-pd-incl{margin-top:clamp(40px,7vw,72px)}
.b-pd-features{margin-top:20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px 28px;list-style:none}
.b-pd-features li{position:relative;padding-left:24px;font-size:.98rem;color:var(--gs-text);line-height:1.5}
.b-pd-features li::before{content:"";position:absolute;left:0;top:.45em;width:11px;height:11px;border-radius:3px;background:var(--gs-accent);opacity:.55}
.b-pd-related{margin-top:clamp(40px,7vw,72px)}
.b-pd-relgrid{margin-top:20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.b-pd-relcard{display:flex;flex-direction:column;gap:8px;padding:18px;border:1px solid var(--gs-border-soft);border-radius:14px;background:rgba(20,23,20,.45);text-decoration:none;transition:border-color .3s var(--gs-ease),transform .3s var(--gs-ease)}
.b-pd-relcard:hover{border-color:var(--gs-border);transform:translateY(-2px)}
.b-pd-relname{font-size:1.08rem;font-weight:800;color:var(--gs-text);letter-spacing:-.01em}
.b-pd-relsum{font-size:.86rem;color:var(--gs-text-muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.b-pd-relprice{margin-top:auto;display:inline-flex;align-items:center;gap:6px;font-size:.84rem;font-weight:800;color:var(--gs-accent)}
.b-pd-back{margin-top:clamp(36px,6vw,60px);background:none;border:0;padding:0;cursor:pointer;color:var(--gs-text-muted);font:inherit;font-weight:700;font-size:.92rem}
.b-pd-back:hover{color:var(--gs-accent)}
.b-pd-missing{padding:clamp(60px,12vw,140px) 0;text-align:center}
.b-pd-missing h1{font-size:clamp(1.8rem,4vw,2.6rem);font-weight:900}
.b-pd-missing p{margin:14px auto 26px;max-width:46ch;color:var(--gs-text-muted)}
@media(max-width:760px){.b-pd-top{grid-template-columns:1fr}.b-pd-media{order:-1;aspect-ratio:16/9}}
`;

export default ProductDetail;
