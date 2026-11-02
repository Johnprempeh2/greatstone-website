import { getPool } from './lib/db.mjs';
import { asWorker } from './lib/worker-db.mjs';
import { runWorker, resendSend } from '../../supabase/functions/_shared/portal-receipt.mjs';

export function makePortalReceiptWorker({ pool = getPool, env = process.env,
  send = resendSend, log = console.error } = {}) {
  return async () => {
    const db = pool();
    if (!db) throw new Error('Portal receipt worker: database unavailable');
    const query = (sql, values = []) => asWorker(db, (client) => client.query(sql, values));
    const jobs = {
      claim: async (limit) => (await query('SELECT * FROM portal_claim_receipt_jobs($1)', [limit])).rows,
      load: async (id) => {
        const { rows: [acceptance] } = await query('SELECT * FROM portal_acceptances WHERE id=$1', [id]);
        if (!acceptance) throw new Error('Acceptance missing');
        const { rows: [document] } = await query(`SELECT id,kind,title,summary,version,body,demos,content_sha256
          FROM portal_documents WHERE id=$1`, [acceptance.document_id]);
        if (!document) throw new Error('Document missing');
        return { acceptance, document };
      },
      sent: (job, id) => query(`UPDATE portal_receipt_jobs SET status='sent',sent_at=now(),
        provider_message_id=$2,last_error=NULL WHERE id=$1 AND status='sending'`, [job.id, id]),
      retry: (job, next, error) => query(`UPDATE portal_receipt_jobs SET status='queued',
        next_attempt_at=$2,last_error=$3 WHERE id=$1 AND status='sending'`, [job.id, next, error]),
      failed: (job, error) => query(`UPDATE portal_receipt_jobs SET status='failed',last_error=$2
        WHERE id=$1 AND status='sending'`, [job.id, error]),
    };
    const origin = (env.APP_SITE_ORIGIN || 'https://greatstoneint.com').replace(/\/+$/, '');
    const ownerTo = (env.PORTAL_RECEIPT_TO || '').split(',').map((address) => address.trim()).filter(Boolean);
    const summary = await runWorker({ db: jobs,
      send: (message) => send({ apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM, ...message }),
      ownerTo, siteOrigin: origin, studioUrl: origin + '/#catalogue/clients', limit: 25 });
    log('portal-receipt-worker: ' + JSON.stringify(summary));
    return summary;
  };
}

// Netlify accepts only a Response or undefined from a function; any other value fails the run and it retries.
const worker = makePortalReceiptWorker();
export default async () => { await worker(); };
export const config = { schedule: '* * * * *' };
