// The basket enquiry (GRE-1824, GRE-6446): one enquiry for every service in the basket. Saves through
// submit_service_inquiry as `anon`, then the team alert, the visitor's confirmation and the Pipedrive deal
// (lib/shared/service-enquiry.mjs). Server-only environment: RESEND_API_KEY, RESEND_FROM, ENQUIRY_ALERT_TO,
// APP_SITE_ORIGIN, PIPEDRIVE_API_TOKEN (Pipedrive stays off without it), PIPEDRIVE_DOMAIN, PIPEDRIVE_STAGE_ID.
import { getPool } from './lib/db.mjs';
import { asPublicAnon, publicIp } from './lib/public-actions.mjs';
import { sendEmail } from './lib/shared/front-door-leads.mjs';
import { crmConfig } from './lib/shared/front-door-crm.mjs';
import { handleServiceEnquiry, storedMessage, syncServiceEnquiryToCrm } from './lib/shared/service-enquiry.mjs';

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

export function makeServiceInquiryHandler({ pool = getPool, env = process.env, fetchImpl = (...a) => fetch(...a), log = console.error } = {}) {
  const alertTo = String(env.ENQUIRY_ALERT_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = String(env.APP_SITE_ORIGIN || 'https://greatstoneint.com').replace(/\/+$/, '');
  const crm = crmConfig(env);
  const email = (to, msg) => sendEmail({ apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM, to, ...msg, fetchImpl });
  return async (req, context) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Check your enquiry and try again.' }, 400); }
    try {
      const out = await handleServiceEnquiry(body, {
        studioUrl: origin + '/#catalogue/inquiries',
        save: async (enquiry) => {
          const db = pool();
          if (!db) { log('service-inquiry: no database configured'); return null; }
          try {
            return await asPublicAnon(db, publicIp(req, context), async (client) =>
              (await client.query('SELECT submit_service_inquiry($1::jsonb, $2, $3, $4, $5) AS id',
                [JSON.stringify(enquiry.services), enquiry.name || null, enquiry.email, enquiry.company || null, storedMessage(enquiry)])).rows[0]?.id || null);
          } catch (error) {
            if (/rate limited/.test(String(error?.message))) throw Object.assign(new Error('rate limited'), { rateLimited: true });
            log('service-inquiry: request failed (' + (error?.code || error?.name || 'error') + ')');
            return null;
          }
        },
        sendAlert: (msg) => email(alertTo.length ? alertTo : '', msg),
        sendConfirmation: (to, msg) => email(to, msg),
        syncCrm: ({ enquiry, ref, studioUrl }) => syncServiceEnquiryToCrm({ config: crm, enquiry, ref, studioUrl, fetchImpl }),
        log: (level, msg) => log(msg),
      });
      return json(out.body.ok ? out.body : { error: out.body.error }, out.status);
    } catch (error) {
      log('service-inquiry: failed (' + (error?.name || 'error') + ')');
      return json({ error: 'Enquiry unavailable.' }, 503);
    }
  };
}

export default makeServiceInquiryHandler();
export const config = { path: '/api/service-inquiry' };
