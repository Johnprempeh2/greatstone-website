import { readFile } from 'node:fs/promises';
import { getPool } from '../netlify/functions/lib/db.mjs';
import { asCatalogueAnon, catalogueRead } from '../netlify/functions/lib/catalogue-store.mjs';

// The build reads the same public projection as /api/catalogue, under transaction-local anon RLS.
export async function publishedCatalogue() {
  if (process.env.NEXT_CATALOGUE_FIXTURE) {
    if (process.env.NEXT_CATALOGUE_REQUIRED === '1') throw new Error('Catalogue fixture cannot be used for a required release build');
    const fixture = JSON.parse(await readFile(process.env.NEXT_CATALOGUE_FIXTURE, 'utf8'));
    return { vendors: fixture.vendors, categories: fixture.categories, offerings: fixture.offerings };
  }
  const pool = getPool();
  if (!pool) {
    if (process.env.NEXT_CATALOGUE_REQUIRED === '1') throw new Error('Published catalogue connection is required for the release build');
    return null;
  }
  const read = (op, params) => asCatalogueAnon(pool, (client) => catalogueRead(client, op, params));
  const [vendors, categories] = await Promise.all([read('vendors'), read('categories')]);
  const cards = [];
  for (let page = 1, total = Infinity; cards.length < total; page++) {
    const result = await read('list', { page, pageSize: 100, sort: 'az' });
    total = result.total;
    cards.push(...result.items);
    if (!result.items.length && cards.length < total) throw new Error('Published catalogue pagination stopped early');
  }
  const offerings = [];
  for (let i = 0; i < cards.length; i += 8) {
    const batch = await Promise.all(cards.slice(i, i + 8).map((card) => read('detail', { slug: card.slug })));
    if (batch.some((item) => !item)) throw new Error('Published catalogue changed during export');
    offerings.push(...batch.map((detail, index) => ({ ...detail, pricing: cards[i + index].pricing })));
  }
  return { vendors, categories, offerings };
}
