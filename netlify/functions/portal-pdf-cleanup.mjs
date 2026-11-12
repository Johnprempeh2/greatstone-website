import { getPool } from './lib/db.mjs';

// Netlify scheduled functions do not accept public requests. The database function
// deletes expired session rows and cascades to every partial chunk.
export default async () => {
  const pool = getPool();
  if (!pool) throw new Error('Portal PDF cleanup: database unavailable');
  await pool.query('SELECT mcp_portal_pdf_cleanup()');
};

// Daily: expired upload sessions are only tidied, so there is no reason to wake the database every hour.
export const config = { schedule: '@daily' };
