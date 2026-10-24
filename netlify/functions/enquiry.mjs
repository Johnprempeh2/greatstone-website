// Contact enquiry (GRE-1794): the BookDeepDive form posts here. Saves to Netlify Database as `anon` and sends
// the owner a Resend alert. The handling is lib/enquiry-handler.mjs; the Supabase edge function it replaces is
// supabase/functions/enquiry (left deployed and unchanged until the GRE-1703 cut-over).
// Server-only environment: RESEND_API_KEY, RESEND_FROM, ENQUIRY_ALERT_TO, TURNSTILE_SECRET_KEY, APP_SITE_ORIGIN.
// NETLIFY_DB_URL comes from the platform.
import { makeEnquiryHandler } from './lib/enquiry-handler.mjs';
import { getPool } from './lib/db.mjs';

// Built on the first request and kept for the life of the instance, so the "Turnstile is off" warning is
// logged once per cold start, not once per enquiry.
let handler = null;
export default (req, context) => (handler ||= makeEnquiryHandler({ env: process.env, getPool }))(req, context);

export const config = { path: '/api/enquiry' };
