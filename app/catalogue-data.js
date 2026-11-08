import 'server-only';
import { unstable_cache } from 'next/cache';
import { catalogueFromRelease } from '../next-proof/catalogue-data.mjs';
import { getPool } from '../netlify/functions/lib/db.mjs';
import { asCatalogueAnon, cataloguePricing } from '../netlify/functions/lib/catalogue-store.mjs';
import { priceCatalogue } from '../next-proof/catalogue-pricing.mjs';

export { catalogueFromRelease };

// The release carries the stored USD prices; the GBP price is computed here, server-side, with the same
// rules and display rate /api/catalogue reads from the site database, so /shop and /product match it.
// Kept five minutes, like the pages (layout revalidate), so a rate or rule change shows within that.
const livePricing = unstable_cache(async () => asCatalogueAnon(getPool(), cataloguePricing), ['catalogue-pricing'], { revalidate: 300 });

export async function pricedCatalogueFromRelease(release) {
  const catalogue = catalogueFromRelease(release);
  // No database (CI's link check, a local build): the pages still render, unpriced. GSAM's pre-Deploy
  // check refuses a Deploy when staging's /shop shows no price, so this never reaches greatstoneint.com.
  if (!getPool()) {
    console.error('Catalogue pricing: no site database (NETLIFY_DB_URL or DATABASE_URL); prices not shown.');
    return catalogue;
  }
  const { rules, rate } = await livePricing();
  return priceCatalogue(catalogue, rules, rate);
}
