import 'server-only';
import { cache } from 'react';
import { catalogueFromRelease } from '../next-proof/catalogue-data.mjs';
import { getPool } from '../netlify/functions/lib/db.mjs';
import { asCatalogueAnon, cataloguePricing } from '../netlify/functions/lib/catalogue-store.mjs';
import { priceCatalogue } from '../next-proof/catalogue-pricing.mjs';

export { catalogueFromRelease };

// The release carries the stored USD prices; the GBP price is computed here, server-side, with the same
// rules and display rate /api/catalogue reads from the site database, so /shop and /product match it.
const livePricing = cache(async () => {
  const pool = getPool();
  if (!pool) throw new Error('Catalogue pricing needs the site database (NETLIFY_DB_URL or DATABASE_URL).');
  return asCatalogueAnon(pool, cataloguePricing);
});

export async function pricedCatalogueFromRelease(release) {
  const { rules, rate } = await livePricing();
  return priceCatalogue(catalogueFromRelease(release), rules, rate);
}
