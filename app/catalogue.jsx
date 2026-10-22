import { fmtMoney } from '../src/lib/pricing.mjs';
import { safeHref } from '../src/lib/safe-url.js';
import { SiteFrame } from './ProofPage.jsx';
import CatalogueFilters from './CatalogueFilters.jsx';

const image = (value) => !value ? '' : safeHref(value.startsWith('assets/') ? '/' + value.slice(7) : value);

export function CatalogueBrowse({ catalogue, filters = {} }) {
  const offerings = catalogue.rows;
  return <SiteFrame><div className="st-scrim" aria-hidden="true" /><div className="st-wrap">
    <header className="st-head"><span className="st-kicker">Software Catalogue</span>
      <h1 className="st-h1">Developer software,<br /><span className="accent">licensed and supported.</span></h1>
      <p className="st-lead">The components we trust to build document, PDF, OCR, reporting and UI systems. Sourced from the vendors who make them, licensed and supported by us in the UK.</p>
      <div className="st-stats"><span className="st-stat"><b>{catalogue.offerings.length}</b> products</span><span className="st-stat"><b>{catalogue.vendors.length}</b> vendors</span><span className="st-stat"><b>{catalogue.categories.length}</b> categories</span></div>
    </header>
    <form method="get" action="/shop" className="st-toolbar" role="search">
      <label className="st-search"><span className="gs-sr-only">Search products</span><input type="search" name="q" defaultValue={filters.q || ''} placeholder="Search products" /></label>
      {filters.vendor && <input type="hidden" name="vendor" value={filters.vendor} />}
      <select className="st-select" name="sort" defaultValue={filters.sort || 'featured'} aria-label="Sort products"><option value="featured">Featured</option><option value="az">Name A to Z</option><option value="price">Price: low to high</option><option value="price-desc">Price: high to low</option></select>
      <button className="st-more" type="submit">Search</button><span className="st-count"><b>{catalogue.matches}</b> result{catalogue.matches === 1 ? '' : 's'}</span>
    </form>
    <div className="st-layout"><CatalogueFilters vendors={catalogue.vendors} categories={catalogue.categories} filters={filters} />
      <div className="st-grid"><h2 className="gs-sr-only">Products</h2>{offerings.length ? offerings.map((item) => <OfferingCard key={item.id} item={item} />) : <div className="st-empty"><h3>{catalogue.offerings.length ? 'No products match those filters' : 'Catalogue unavailable'}</h3><p>{catalogue.offerings.length ? 'Try another search or clear the filters.' : 'Please contact us for product availability.'}</p><a className="st-clear" href={catalogue.offerings.length ? '/shop' : '/contact'}>{catalogue.offerings.length ? 'Clear all filters' : 'Contact us'}</a></div>}{catalogue.nextHref && <a className="st-more" href={catalogue.nextHref}>Next page →</a>}</div>
    </div>
  </div></SiteFrame>;
}

function OfferingCard({ item }) {
  const icon = image(item.attributes?.icon || item.vendor?.logo_url);
  return <a className="st-card" href={'/product/' + encodeURIComponent(item.slug)} aria-label={item.name + ' by ' + (item.vendor?.name || '')}>
    <span className="st-card-icon">{icon && <img src={icon} alt="" loading="lazy" />}</span><h3>{item.name}</h3>
    <div className="vendor"><span>{item.vendor?.name}</span></div>{item.short_description && <p className="desc">{item.short_description}</p>}
    {!!item.platforms?.length && <div className="st-badges">{item.platforms.slice(0, 4).map((platform) => <span className="st-badge" key={platform}>{platform}</span>)}</div>}
    <div className="st-foot"><span className="st-price">{item.pricing?.final == null ? <span className="poa">Price on application</span> : <><span className="lbl">from</span><b>{fmtMoney(item.pricing.final)}</b><small className="st-vat">+ VAT</small></>}</span><span className="st-go">View →</span></div>
  </a>;
}
