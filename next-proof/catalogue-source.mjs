import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { getOffering, listCategories, listOfferings, listVendors } from '../src/data/catalog.mjs';

// Only the public, RLS-gated projection is read. The release contains no service key.
export async function publishedCatalogue(url = process.env.VITE_SUPABASE_URL, anonKey = process.env.VITE_SUPABASE_ANON_KEY) {
  if (process.env.NEXT_CATALOGUE_FIXTURE) {
    if (process.env.NEXT_CATALOGUE_REQUIRED === '1') throw new Error('Catalogue fixture cannot be used for a required release build');
    const fixture = JSON.parse(await readFile(process.env.NEXT_CATALOGUE_FIXTURE, 'utf8'));
    return { vendors: fixture.vendors, categories: fixture.categories, offerings: fixture.offerings };
  }
  if (!url && !anonKey) {
    if (process.env.NEXT_CATALOGUE_REQUIRED === '1') throw new Error('Published catalogue connection is required for the release build');
    return null;
  }
  if (!url || !anonKey) throw new Error('Both public Supabase catalogue settings are required');
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const [vendors, categories] = await Promise.all([listVendors(client), listCategories(client)]);
  const cards = [];
  for (let page = 1, total = Infinity; cards.length < total; page++) {
    const result = await listOfferings(client, { page, pageSize: 100, sort: 'az' });
    total = result.total;
    cards.push(...result.items);
    if (!result.items.length && cards.length < total) throw new Error('Published catalogue pagination stopped early');
  }
  const offerings = [];
  for (let i = 0; i < cards.length; i += 8) {
    const batch = await Promise.all(cards.slice(i, i + 8).map((card) => getOffering(client, card.slug)));
    if (batch.some((item) => !item)) throw new Error('Published catalogue changed during export');
    offerings.push(...batch.map((detail, index) => ({ ...detail, pricing: cards[i + index].pricing })));
  }
  return { vendors, categories, offerings };
}
