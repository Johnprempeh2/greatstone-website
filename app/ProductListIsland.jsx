// GRE-3777: the product list island. It reads the products collection from the release (GRE-2110) on
// the server and renders the catalogue's own cards, so a product list on an HTML page matches /shop.
import { browseOfferings, catalogueFromRelease } from '../next-proof/catalogue-data.mjs';
import { OfferingCard } from './catalogue.jsx';

export function productListRows(release, { vendor = '', category = '', sort = 'featured', limit = '6' } = {}) {
  return browseOfferings(catalogueFromRelease(release), { vendor, category, sort }).slice(0, Number(limit) || 6);
}

export default function ProductListIsland({ release, ...filters }) {
  const rows = productListRows(release, filters);
  if (!rows.length) return <div className="st-empty"><h3>Catalogue unavailable</h3><p>Please contact us for product availability.</p><a className="st-clear" href="/contact">Contact us</a></div>;
  return <div className="st-grid">{rows.map((item) => <OfferingCard key={item.id} item={item} />)}</div>;
}
