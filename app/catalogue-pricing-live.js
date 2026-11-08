import { getPool } from '../netlify/functions/lib/db.mjs';
import { asCatalogueAnon, pricing } from '../netlify/functions/lib/catalogue-store.mjs';

// The live price inputs, read as anon like /api/catalogue. The editor build has no database
// and swaps this module for one that returns null (next-proof/scripts/prepare-netlify.mjs, GRE-4720).
export async function readLivePricing() {
  const pool = getPool();
  if (!pool) return null;
  return asCatalogueAnon(pool, pricing);
}
