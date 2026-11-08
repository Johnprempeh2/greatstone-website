import 'server-only';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { getPool } from '../netlify/functions/lib/db.mjs';
import { asCatalogueAnon, pricing } from '../netlify/functions/lib/catalogue-store.mjs';
import { catalogueFromRelease, priceCatalogue } from '../next-proof/catalogue-data.mjs';

// The live price inputs, read as anon like /api/catalogue and kept as long as a page (layout revalidate).
const livePricing = unstable_cache(async () => {
  const pool = getPool();
  if (!pool) return null;
  return asCatalogueAnon(pool, pricing);
}, ['catalogue-pricing'], { revalidate: 300, tags: ['catalogue-pricing'] });

// Without the database the pages still render; every product then reads "Price on application".
const readPricing = cache(async () => {
  try {
    return await livePricing();
  } catch (error) {
    console.error('Catalogue pricing unavailable', error);
    return null;
  }
});

export async function pricedCatalogue(release) {
  return priceCatalogue(catalogueFromRelease(release), await readPricing());
}
