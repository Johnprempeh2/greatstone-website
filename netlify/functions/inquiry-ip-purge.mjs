// Daily: clear the IP on enquiries older than 30 days (the Privacy page promise; 0036). The insert trigger already
// does this; the schedule covers a quiet spell with no new enquiry. Same body as purge_inquiry_ips(), run as the
// worker role, which 025 grants on service_inquiries (the function itself predates the worker's grants).
import { getPool } from './lib/db.mjs';
import { asWorker } from './lib/worker-db.mjs';

export const PURGE_SQL = `UPDATE service_inquiries SET ip = NULL
  WHERE ip IS NOT NULL AND created_at < now() - interval '30 days'`;

export function makeInquiryIpPurge({ pool = getPool, log = console.error } = {}) {
  return async () => {
    const db = pool();
    if (!db) throw new Error('Inquiry IP purge: database unavailable');
    const purged = await asWorker(db, async (client) => (await client.query(PURGE_SQL)).rowCount ?? 0);
    log('inquiry-ip-purge: ' + purged);
    return purged;
  };
}

export default makeInquiryIpPurge();
export const config = { schedule: '17 3 * * *' };
