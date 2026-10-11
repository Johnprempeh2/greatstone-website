// Contact enquiry (GRE-654): the browser half of the BookDeepDive form. Pure apart from the injected fetch,
// so `node --test` covers it. The `enquiry` edge function saves the enquiry and alerts the owner; logic and
// limits are in supabase/functions/_shared/enquiry.mjs.
//   POST /functions/v1/enquiry { name, company, email, industry, message, attribution: { first, last }, page, website }
//   (the optional interest choice is the first line of `message`)
//   → { ok: true, ref } | non-2xx { ok: false, error }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (s) => String(s == null ? '' : s).trim();

export const isEmail = (s) => EMAIL_RE.test(clean(s));

// The optional "What are you interested in?" choice (GRE-1373 §6). Its answer travels at the top of the
// message, so the saved enquiry and the team alert carry it without a new column or a function change.
export const INTEREST_OPTIONS = ['A free Executive Discovery', 'A Deep Dive and blueprint', 'GS Agentic Manager',
  'Specialist expertise for a defined piece of work', 'Not sure yet'];
export const interestKey = (label) => clean(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const withInterest = (message, interest) => (clean(interest) ? 'Interest: ' + clean(interest) + (clean(message) ? '\n\n' + clean(message) : '') : clean(message));

// "#enquire/<key>" is a CTA that opens the contact page's enquiry form with that choice made. App's click
// handler parks the key here and the form takes it once, as it mounts.
export const parseEnquireHref = (href) => { const m = String(href || '').match(/^#enquire\/([a-z0-9-]+)$/); return m ? m[1] : null; };
let pendingInterest = null;
export const setPendingInterest = (key) => { pendingInterest = key || null; };
export function takePendingInterest(options = []) {
  const key = pendingInterest; pendingInterest = null;
  return (key && options.find((o) => interestKey(o) === key)) || '';
}

// The form's fields plus where the visitor came from (getAttribution() in analytics.js; no new cookies).
export function enquiryPayload(fields = {}, attribution = {}, page = '') {
  return {
    name: clean(fields.name), company: clean(fields.company), email: clean(fields.email),
    industry: clean(fields.industry), message: withInterest(fields.message, fields.interest),
    attribution: { first: (attribution && attribution.first) || null, last: (attribution && attribution.last) || null },
    page: clean(page).slice(0, 200), website: clean(fields.website),
  };
}

// One client for the edge function. Resolves { ok: true, ref } or { ok: false } and never throws: the block
// shows the contact address on any failure, including no backend configured (the editor canvas, local dev).
export function makeEnquiryClient({ url, anonKey, fetchImpl = (...a) => fetch(...a) } = {}) {
  return {
    configured: !!(url && anonKey),
    async send(payload) {
      if (!url || !anonKey) return { ok: false };
      try {
        const res = await fetchImpl(url.replace(/\/$/, '') + '/functions/v1/enquiry', {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey: anonKey, authorization: 'Bearer ' + anonKey },
          body: JSON.stringify(payload),
        });
        let out = null;
        try { out = await res.json(); } catch (e) { out = null; }
        return res.ok && out && out.ok === true ? { ok: true, ref: String(out.ref || '') } : { ok: false };
      } catch (e) { return { ok: false }; }
    },
  };
}

// `generate_lead` after a saved enquiry, only once the visitor has accepted analytics (checked as it fires).
// Labels only, never what they typed: the campaign is the last touch's, else the first touch's.
export function fireLead({ track, getConsent, attribution } = {}) {
  if (typeof track !== 'function' || typeof getConsent !== 'function' || getConsent() !== 'granted') return false;
  const a = attribution || {};
  const touch = (a.last && a.last.utm_source ? a.last : null) || (a.first && a.first.utm_source ? a.first : null) || {};
  track('generate_lead', {
    form: 'enquiry',
    utm_source: touch.utm_source || '(direct)',
    utm_medium: touch.utm_medium || '(none)',
    utm_campaign: touch.utm_campaign || '(not set)',
  });
  return true;
}
