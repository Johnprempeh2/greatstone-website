// Contact enquiry (GRE-654): the browser half of the BookDeepDive form. Pure apart from the injected fetch,
// so `node --test` covers it. The `enquiry` Netlify Function (netlify/functions/enquiry.mjs, GRE-1794) saves
// the enquiry on Netlify Database and alerts the owner; logic and limits are in supabase/functions/_shared/enquiry.mjs.
//   POST /api/enquiry { name, company, email, size_band, industry, message, attribution: { first, last }, page, website, turnstile? }
//   (the optional interest choice is the first line of `message`; `turnstile` is the Cloudflare token when the site has a key)
//   → { ok: true, ref } | non-2xx { ok: false, error }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (s) => String(s == null ? '' : s).trim();

export const isEmail = (s) => EMAIL_RE.test(clean(s));

// GRE-652 §4.6: name and work email are the only required answers. Size is qualification, not a price tier.
export const SIZE_BANDS = ['Under 10', '11 to 50', '51 to 250', 'More than 250'];
// The consent line above the button. The legal basis is legitimate interests (Privacy policy), so it is a
// notice, not a tick box that blocks sending.
export const CONSENT = 'I agree that Greatstone can use these details to reply to my enquiry. See our <a href="#go/privacy">Privacy Policy</a>.';
export const FIELD_ERRORS = { name: 'Please add your name.', email: 'Please add an email address we can reply to.' };
export function validateEnquiry(fields = {}) {
  const errors = {};
  if (!clean(fields.name)) errors.name = FIELD_ERRORS.name;
  if (!isEmail(fields.email)) errors.email = FIELD_ERRORS.email;
  return errors;
}

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
    size_band: clean(fields.size_band), industry: clean(fields.industry), message: withInterest(fields.message, fields.interest),
    attribution: { first: (attribution && attribution.first) || null, last: (attribution && attribution.last) || null },
    page: clean(page).slice(0, 200), website: clean(fields.website),
    ...(clean(fields.turnstile) ? { turnstile: clean(fields.turnstile) } : {}),
  };
}

// One client for the enquiry function, on the site's own origin. Resolves { ok: true, ref } or { ok: false } and
// never throws: the block shows the contact address on any failure, including no function there (the editor
// canvas, `vite` local dev).
export const ENQUIRY_ENDPOINT = '/api/enquiry';
export function makeEnquiryClient({ endpoint = ENQUIRY_ENDPOINT, fetchImpl = (...a) => fetch(...a) } = {}) {
  return {
    configured: !!endpoint,
    async send(payload) {
      if (!endpoint) return { ok: false };
      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
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
export function fireLead({ track, getConsent, attribution, form = 'enquiry' } = {}) {
  if (typeof track !== 'function' || typeof getConsent !== 'function' || getConsent() !== 'granted') return false;
  const a = attribution || {};
  const touch = (a.last && a.last.utm_source ? a.last : null) || (a.first && a.first.utm_source ? a.first : null) || {};
  track('generate_lead', {
    form,
    utm_source: touch.utm_source || '(direct)',
    utm_medium: touch.utm_medium || '(none)',
    utm_campaign: touch.utm_campaign || '(not set)',
  });
  return true;
}
