import 'server-only';
import { getPool } from '../netlify/functions/lib/db.mjs';
import { asCatalogueAnon, pricing } from '../netlify/functions/lib/catalogue-store.mjs';

// The live price inputs, read as anon like /api/catalogue. The GSAM editor has no database: its build
// replaces this file with one that returns null (next-proof/scripts/prepare-netlify.mjs).
export async function readLivePricing() {
  const pool = getPool();
  if (!pool) return null;
  return asCatalogueAnon(pool, pricing);
}
