// The site's Netlify Database pool, opened on first use. NETLIFY_DB_URL (set by the platform) wins over a
// developer's local DATABASE_URL, as in the portal starter. Returns null when neither is set, so a caller can
// carry on without the database (the enquiry alert still goes).
import { getDatabase } from '@netlify/database';

let pool;
export function getPool() {
  if (pool) return pool;
  const netlify = process.env.NETLIFY_DB_URL;
  if (!netlify && !process.env.DATABASE_URL) return null;
  pool = getDatabase(!netlify ? { connectionString: process.env.DATABASE_URL } : undefined).pool;
  return pool;
}
