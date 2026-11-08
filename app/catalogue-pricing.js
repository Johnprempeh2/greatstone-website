import 'server-only';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { readLivePricing } from './catalogue-pricing-live.js';
import { catalogueFromRelease, priceCatalogue } from '../next-proof/catalogue-data.mjs';

// The live price inputs, kept as long as a page (layout revalidate).
const livePricing = unstable_cache(readLivePricing, ['catalogue-pricing'], { revalidate: 300, tags: ['catalogue-pricing'] });

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
